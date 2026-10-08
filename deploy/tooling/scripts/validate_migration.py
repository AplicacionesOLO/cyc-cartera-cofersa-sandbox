#!/usr/bin/env python3
"""Fases 10-12 — Valida migration-output/ contra los 16 criterios de MIGRATION COMPLETE.

    python scripts/validate_migration.py --out migration-output            # verificaciones estáticas
    python scripts/validate_migration.py --out migration-output --run      # + build, tests, SQL en PG efímero
    python scripts/validate_migration.py --out migration-output --run --skip frontend_build

Cada verificación queda OK / WARN / FAIL / NOT VALIDATED (con la razón). Resultado en
migration-output/.discovery/validation-results.json, que consume build_report.py.
Exit 0 si no hay FAIL; 1 si hay al menos un FAIL. Nunca modifica el código generado (solo --run instala
dependencias del frontend, lo que regenera el lockfile).
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import (  # noqa: E402
    IGNORED_DIRS,
    detect_mode,
    manifest_path,
    read_config,
    read_json,
    read_text,
    rel,
    write_json,
)

SCRIPTS = Path(__file__).resolve().parent

CRITERIA: dict[int, str] = {
    1: "Discovery completo: preflight, proyecto, uso de Supabase y esquema real",
    2: "Manifest revisado (sin borrador, endpoints válidos, reglas de autorización asignadas)",
    3: "Scripts Aurora completos por ambiente (provisioning, schema, validation, rollback, migration, datos)",
    4: "SQL Aurora validado en PostgreSQL efímero (idempotente, TOTAL_FALTA=0, rollback limpio)",
    5: "Backend hexagonal: handlers y use cases existen; dependencias entre capas y SQL en su lugar",
    6: "Tests del backend en verde (unitarios con fakes e integración contra el esquema generado)",
    7: "Lint del backend limpio (ruff)",
    8: "Template SAM único y samconfig dev/qa/prod con tags y rutas por ambiente",
    9: "Template válido (cfn-lint y transformación SAM)",
    10: "IAM mínimo y resiliencia (sin wildcards salvo ENI; SQS con DLQ, reintentos, visibility e idempotencia)",
    11: "Frontend con arquitectura estándar (Page → Controller → Api → axiosApiGateway, naming y tamaños)",
    12: "Frontend compila, cumple Prettier y sus tests pasan",
    13: "Cero residuos de Supabase (código, dependencias, variables)",
    14: "Sin secretos ni identificadores de ambiente hardcodeados",
    15: "Sin TODO/FIXME/pseudocódigo en el código generado",
    16: "Reporte final con matriz ORIGEN → DESTINO y solo pendientes de configuración",
}

CRITERIA_GREENFIELD: dict[int, str] = {
    **CRITERIA,
    1: "Especificación completa: project-spec con requisitos, modelo de datos fuente y esquema introspeccionado",
    2: "Manifest del proyecto revisado (sin borrador, endpoints y pantallas trazados a requisitos)",
    3: "Scripts Aurora completos por ambiente (provisioning, schema, validation, rollback, migration)",
    13: "Sin SDKs de BaaS ni accesos directos a datos desde el frontend (Supabase, Firebase)",
    16: "Reporte final con matriz REQUISITO → DESTINO y solo pendientes de configuración",
}


def criteria_for(mode: str) -> dict[int, str]:
    return CRITERIA_GREENFIELD if mode == "greenfield" else CRITERIA


IO_LIBS = ("boto3", "botocore", "psycopg", "psycopg2", "psycopg_pool", "sqlalchemy", "requests", "httpx", "urllib3",
           "aiohttp", "pymysql", "redis")
LAYER_FORBIDDEN = {
    "domain": ("application", "infrastructure", "entrypoints", "shared", *IO_LIBS),
    "application": ("infrastructure", "entrypoints", *IO_LIBS),
    "infrastructure": ("entrypoints",),
}
HANDLER_INFRA_FILES = {"__init__.py", "bootstrap.py", "http_adapter.py", "sqs_adapter.py", "container.py",
                       "realtime_handlers.py"}
MAX_HANDLER_LINES = 30
ENI_ACTIONS = {"ec2:CreateNetworkInterface", "ec2:DescribeNetworkInterfaces", "ec2:DeleteNetworkInterface",
               "ec2:AssignPrivateIpAddresses", "ec2:UnassignPrivateIpAddresses"}
SQL_RE = re.compile(r"(?is)\bSELECT\b.+\bFROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+[\w.\"]+\s+SET\b|\bDELETE\s+FROM\b|"
                    r"\bCALL\s+\w+\s*\(")
QUALIFIED_ENV_SCHEMA = re.compile(r"\b[a-z][a-z0-9]{2,4}_(?:dev|qa|prd)_[a-z0-9_]+_sch_[a-z0-9_]+\b")
SUPABASE_SCHEMA_REF = re.compile(r"(?i)\b(?:public|auth|storage|extensions)\.[a-z_]\w*")
TODO_RE = re.compile(
    r"(?:#|//|/\*|^\s*\*|--|<!--)[^\n]*\b(?:TODO|FIXME|HACK|XXX)\b"  # en comentarios
    r"|\b(?:TODO|FIXME|HACK|XXX)\b\s*[:(\-]"                     # marcador 'TODO:' en strings/código
    r"|(?i:pseudo-?c[oó]digo|\bNotImplementedError\b|lorem ipsum|implementar\s+(?:aqu[ií]|despu[eé]s|luego))"
)
TEXT_EXTS = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".yaml", ".yml", ".toml", ".sql", ".sh",
             ".md", ".html", ".css", ".scss", ".env", ".example", ".txt", ".cfg", ".ini", ""}
SKIP_FILES = {"package-lock.json", "pnpm-lock.yaml", "yarn.lock", "poetry.lock"}
SECRET_PATTERNS = (
    ("JWT", re.compile(r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}")),
    ("AWS access key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("clave privada", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("clave Supabase", re.compile(r"\bsb_(?:secret|publishable)_[A-Za-z0-9_\-]{10,}")),
    ("URL con password", re.compile(r"\b[a-z][a-z0-9+.\-]*://[^\s:/@'\"]+:(?![$<{])[^\s@'\"/]{3,}@")),
    ("asignación de secreto", re.compile(
        r"(?i)\b(?:password|passwd|pwd|secret|api_?key|access_?key|client_?secret|token)\b[\"']?\s*[:=]\s*"
        r"[\"'](?![$<{])([^\"'\s]{8,})[\"']")),
)
AWS_ID_PATTERNS = (
    ("subnet", re.compile(r"\bsubnet-[0-9a-f]{8,17}\b")),
    ("security group", re.compile(r"\bsg-[0-9a-f]{8,17}\b")),
    ("vpc", re.compile(r"\bvpce?-[0-9a-f]{8,17}\b")),
    ("ARN con cuenta", re.compile(r"arn:aws:[a-z0-9\-]+:[a-z0-9\-]*:\d{12}:")),
    ("API Gateway id", re.compile(r"https://[a-z0-9]{10}\.execute-api\.")),
    ("User Pool id", re.compile(r"\b[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]{9}\b")),
)
SECRET_ENV_KEY = re.compile(r"(?i)(PASSWORD|PASSWD|SECRET(?!_NAME|_ARN|_ID)|TOKEN|PRIVATE_KEY|API_KEY|ACCESS_KEY)")


# --------------------------------------------------------------------------- YAML de CloudFormation

def load_cfn_yaml(path: Path) -> dict[str, Any]:
    import yaml

    class Loader(yaml.SafeLoader):
        pass

    def construct(loader: yaml.SafeLoader, suffix: str, node: yaml.Node) -> dict[str, Any]:
        if isinstance(node, yaml.ScalarNode):
            value: Any = loader.construct_scalar(node)
        elif isinstance(node, yaml.SequenceNode):
            value = loader.construct_sequence(node, deep=True)
        else:
            value = loader.construct_mapping(node, deep=True)
        name = "Ref" if suffix == "Ref" else f"Fn::{suffix}"
        return {name: value}

    Loader.add_multi_constructor("!", construct)
    return yaml.load(path.read_text(encoding="utf-8"), Loader=Loader) or {}  # noqa: S506 - Loader seguro


def load_toml(path: Path) -> dict[str, Any]:
    try:
        import tomllib
    except ImportError:  # Python 3.10
        try:
            import tomli as tomllib  # type: ignore[no-redef]
        except ImportError:
            return _mini_toml(read_text(path))
    return tomllib.loads(read_text(path))


def _mini_toml(text: str) -> dict[str, Any]:
    """Parser mínimo para el samconfig que genera la skill (tablas, strings, bools, arrays de strings)."""
    data: dict[str, Any] = {}
    current = data
    pending_key: str = ""
    pending: list[str] | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if pending is not None:
            if line.startswith("]"):
                current[pending_key] = pending
                pending = None
            else:
                pending.append(line.rstrip(",").strip().strip('"'))
            continue
        if line.startswith("["):
            current = data
            for part in line.strip("[]").split("."):
                current = current.setdefault(part, {})
            continue
        key, _, value = (x.strip() for x in line.partition("="))
        if value == "[":
            pending_key, pending = key, []
        elif value.startswith('"'):
            current[key] = value.strip('"')
        else:
            current[key] = {"true": True, "false": False}.get(value, value)
    return data


# --------------------------------------------------------------------------- validador

class Validator:
    def __init__(self, out: Path, run: bool, skip: set[str], timeout: int) -> None:
        self.out = out.resolve()
        self.mode = detect_mode(self.out)
        self.run_dynamic = run
        self.skip = skip
        self.timeout = timeout
        self.disc = self.out / ".discovery"
        self.checks: list[dict[str, Any]] = []
        self.manifest: dict[str, Any] = {}
        self.template: dict[str, Any] = {}
        self.project: dict[str, Any] = read_json(self.disc / "project.json") if (self.disc / "project.json").exists() \
            else {}
        self.preflight: dict[str, Any] = read_json(self.disc / "preflight.json") \
            if (self.disc / "preflight.json").exists() else {}
        self.usage: dict[str, Any] = read_json(self.disc / "supabase-usage.json") \
            if (self.disc / "supabase-usage.json").exists() else {}
        original = Path(str(self.preflight.get("project", ""))) / str(self.project.get("root") or ".")
        self.original_front = original if self.preflight.get("project") and original.is_dir() \
            and self.mode == "migration" else None
        self.front = self.out / "frontend"
        self.back = self.out / "backend"
        self.db = self.out / "database"
        self.src_dir = str(self.project.get("src_dir") or "src")

    # ------------------------------------------------------------- registro
    def add(self, check_id: str, criterion: int, title: str, status: str, detail: str = "",
            items: list[Any] | None = None) -> None:
        self.checks.append({"id": check_id, "criterion": criterion, "title": title, "status": status,
                            "detail": detail, "items": (items or [])[:200], "items_total": len(items or [])})
        mark = {"OK": "OK  ", "WARN": "WARN", "FAIL": "FAIL", "NOT VALIDATED": "N/V "}[status]
        print(f"[{mark}] C{criterion:<2} {check_id}: {title}" + (f" — {detail}" if detail else ""))
        for item in (items or [])[:8] if status in ("FAIL", "WARN") else []:
            print(f"         · {item}")

    def verdict(self, check_id: str, criterion: int, title: str, problems: list[Any], *, warn: bool = False,
                ok_detail: str = "") -> None:
        if problems:
            self.add(check_id, criterion, title, "WARN" if warn else "FAIL", f"{len(problems)} hallazgo(s)", problems)
        else:
            self.add(check_id, criterion, title, "OK", ok_detail)

    def _dynamic(self, check_id: str, criterion: int, title: str) -> bool:
        if check_id in self.skip:
            self.add(check_id, criterion, title, "NOT VALIDATED", "omitido con --skip")
            return False
        if not self.run_dynamic:
            self.add(check_id, criterion, title, "NOT VALIDATED", "requiere --run")
            return False
        return True

    def _run(self, cmd: list[str], cwd: Path, env: dict[str, str] | None = None,
             timeout: int | None = None) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout or self.timeout,
                                  env={**os.environ, **(env or {})})
        except subprocess.TimeoutExpired as exc:
            return subprocess.CompletedProcess(cmd, 124, exc.stdout or "", f"timeout tras {exc.timeout}s")
        except FileNotFoundError as exc:
            return subprocess.CompletedProcess(cmd, 127, "", str(exc))

    @staticmethod
    def _tail(proc: subprocess.CompletedProcess[str], n: int = 25) -> list[str]:
        text = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip().splitlines()
        return text[-n:]

    def _walk(self, root: Path, exts: set[str] | None = None, skip_tests: bool = False) -> list[Path]:
        files: list[Path] = []
        if not root.exists():
            return files
        for current, dirs, names in os.walk(root):
            dirs[:] = sorted(d for d in dirs if d not in IGNORED_DIRS and d not in (".discovery", ".pytest_cache",
                                                                                     ".ruff_cache", "artifacts"))
            if skip_tests and any(p in ("tests", "__tests__", "__mocks__", "test") for p in Path(current).parts):
                continue
            for name in sorted(names):
                path = Path(current) / name
                if name in SKIP_FILES or (exts is not None and path.suffix not in exts):
                    continue
                if skip_tests and re.search(r"\.(test|spec)\.", name):
                    continue
                if path.stat().st_size > 2_000_000:
                    continue
                files.append(path)
        return files

    def _original_lines(self, path: Path) -> set[str]:
        """Líneas del archivo original equivalente (para no culpar al migrado por lo heredado)."""
        if self.original_front is None or self.front not in path.parents:
            return set()
        original = self.original_front / path.relative_to(self.front)
        return {line.strip() for line in read_text(original).splitlines()} if original.exists() else set()

    # ------------------------------------------------------------- C1 discovery
    def check_discovery(self) -> None:
        if self.mode == "greenfield":
            self.check_spec()
            return
        html_mode = (self.disc / "html-model.json").exists() and not (self.disc / "supabase-schema.json").exists()
        schema_file = "source-schema.json" if html_mode else "supabase-schema.json"
        required = ("preflight.json", "project.json", "supabase-usage.json", schema_file)
        if html_mode:
            required += ("html-model.json",)
        missing = [name for name in required if not (self.disc / name).exists()]
        self.verdict("discovery_artifacts", 1, "Artefactos de discovery", [f".discovery/{m}" for m in missing])
        schema_path = self.disc / schema_file
        if schema_path.exists():
            meta = read_json(schema_path).get("meta") or {}
            source = meta.get("source", "desconocido")
            errors = meta.get("migration_errors") or []
            if errors:
                self.add("schema_source", 1, "Origen del esquema", "FAIL",
                         f"{len(errors)} migraciones fallaron al reproducirse", errors)
            else:
                self.add("schema_source", 1, "Origen del esquema", "OK" if source != "unknown" else "WARN",
                         f"fuente: {source}")

    def check_spec(self) -> None:
        problems: list[str] = []
        spec = read_config(self.out / "project-spec.yaml") or {}
        reqs = spec.get("requirements") or []
        if not reqs:
            problems.append("project-spec.yaml sin requirements")
        ids = [str(r.get("id") or "") for r in reqs]
        problems += [f"requisito sin id o título: {r}" for r in reqs if not r.get("id") or not r.get("title")]
        problems += [f"id de requisito duplicado: {i}" for i in sorted({i for i in ids if ids.count(i) > 1})]
        for key in ("name", "slug", "compania"):
            if not (spec.get("project") or {}).get(key):
                problems.append(f"project.{key} vacío en project-spec.yaml")
        self.verdict("project_spec", 1, "project-spec.yaml con requisitos identificados", problems,
                     ok_detail=f"{len(reqs)} requisitos")
        problems = []
        sources = sorted((self.db / "source").glob("*.sql"))
        if not sources:
            problems.append("database/source/*.sql vacío (modelo de datos fuente)")
        schema = self.disc / "source-schema.json"
        if not schema.exists():
            problems.append(".discovery/source-schema.json (pg_sandbox.py schema-from-migrations)")
        else:
            data = read_json(schema)
            problems += [f"error al aplicar el modelo: {e}" for e in (data.get("meta") or {}).get("migration_errors") or []]
            if not data.get("tables"):
                problems.append("el modelo de datos no tiene tablas")
            elif sources and max(s.stat().st_mtime for s in sources) > schema.stat().st_mtime + 1:
                problems.append("database/source cambió después de source-schema.json: volver a introspeccionar")
        for name in ("preflight.json", "project.json"):
            if not (self.disc / name).exists():
                problems.append(f".discovery/{name}")
        self.verdict("data_model", 1, "Modelo de datos fuente aplicado e introspeccionado", problems)

    # ------------------------------------------------------------- C2 manifest
    def check_manifest(self) -> None:
        path = manifest_path(self.out)
        if not path.exists():
            self.add("manifest", 2, path.name, "FAIL", "no existe")
            return
        data = read_config(path)
        self.manifest = data if isinstance(data, dict) else {}
        m = self.manifest
        problems: list[str] = []
        if m.get("draft", False):
            problems.append("draft: true — revisar el borrador y poner draft: false")
        project = m.get("project") or {}
        for key in ("name", "slug", "compania", "exposure"):
            if not project.get(key):
                problems.append(f"project.{key} vacío")
        if project.get("exposure") == "public" and not project.get("public_reason"):
            problems.append("project.exposure=public sin public_reason")
        seen: set[tuple[str, str]] = set()
        for ep in m.get("api_endpoints") or []:
            key = (str(ep.get("method", "")).upper(), str(ep.get("path", "")))
            if key in seen:
                problems.append(f"endpoint duplicado {key[0]} {key[1]}")
            seen.add(key)
            for field in ("method", "path", "function", "handler", "use_case", "module"):
                if not ep.get(field):
                    problems.append(f"{key[0]} {key[1]}: falta {field}")
            if str(ep.get("auth", "cognito")) == "none" and not ep.get("public_reason"):
                problems.append(f"{key[0]} {key[1]}: auth none sin public_reason")
        if not m.get("api_endpoints"):
            problems.append("api_endpoints vacío")
        required_sections = ("modules", "api_endpoints") if self.mode == "greenfield" else \
            ("modules", "api_endpoints", "authorization_rules")
        for name in required_sections:
            if name not in m:
                problems.append(f"falta la sección {name}")
        self.verdict("manifest", 2, "Manifest completo", problems)
        unassigned = [f"{r.get('table')} · {r.get('policy')} ({r.get('command')})"
                      for r in m.get("authorization_rules") or [] if not str(r.get("enforced_in") or "").strip()]
        self.verdict("authorization_rules", 2, "Cada regla de autorización tiene dónde se aplica (enforced_in)",
                     unassigned)
        if self.mode == "greenfield":
            spec = read_config(self.out / "project-spec.yaml") or {}
            ids = {str(r.get("id")) for r in spec.get("requirements") or []}
            traced: set[str] = set()
            problems = []
            for item in [*(m.get("api_endpoints") or []), *(m.get("screens") or [])]:
                refs = [str(s) for s in item.get("requirements") or item.get("source") or []]
                traced.update(refs)
                problems += [f"{item.get('path') or item.get('page')}: requisito desconocido {r}"
                             for r in refs if r not in ids]
            problems += [f"{i}: ningún endpoint ni pantalla lo implementa" for i in sorted(ids - traced)]
            self.verdict("requirements_traced", 2, "Cada requisito tiene endpoints o pantallas", problems)
        pending = m.get("pending_errors") or []
        self.verdict("pending_errors", 2, "Sin errores pendientes declarados en el manifest",
                     [str(p) for p in pending])

    # ------------------------------------------------------------- C3/C4 base de datos
    def _db_envs(self) -> tuple[str, list[str]]:
        cfg_path = self.db / "config.yaml"
        if not cfg_path.exists():
            return "dev", ["dev"]
        cfg = read_config(cfg_path) or {}
        envs = [str(e) for e in cfg.get("ambientes") or ["dev", "qa", "prd"]]
        envs = [{"prod": "prd", "production": "prd"}.get(e, e) for e in envs]
        return str(cfg.get("ambiente_default") or envs[0]), envs

    def _db_dir(self, env: str, default: str) -> Path:
        return self.db if env == default else self.db / "environments" / env

    def check_database_files(self) -> None:
        default, envs = self._db_envs()
        required = [f"aurora_postgresql_{k}.sql" for k in ("provisioning", "schema", "validation", "rollback",
                                                           "migration")] + ["naming-map.json",
                                                                            "generation-report.json"]
        missing, warn = [], []
        for env in envs:
            folder = self._db_dir(env, default)
            missing += [f"{rel(folder / f, self.out)}" for f in required if not (folder / f).exists()]
            if self.mode == "migration" and not (folder / "aurora_postgresql_data.sql").exists():
                missing.append(f"{rel(folder, self.out)}/aurora_postgresql_data.sql (export_data_sql.py: datos del "
                               "origen incluidos en el script)")
        if not (self.db / "config.yaml").exists():
            missing.append("database/config.yaml")
        if not (self.db / "README.md").exists():
            missing.append("database/README.md")
        self.verdict("database_files", 3, f"Scripts Aurora por ambiente ({', '.join(envs)})", missing)
        if warn:
            self.add("data_migration_script", 3, "Script de migración de datos", "WARN", "", warn)
        report = self.db / "generation-report.json"
        if report.exists():
            data = read_json(report)
            unsupported = [f"{u.get('object')}: {u.get('detail') or u.get('reason')}"
                           for u in data.get("unsupported") or []]
            self.verdict("database_unsupported", 3, "Objetos sin equivalente en Aurora documentados", unsupported,
                         warn=True)

    def check_database_sandbox(self) -> None:
        title = "SQL en PostgreSQL efímero (idempotencia, validación, rollback)"
        if not self._dynamic("aurora_sql_sandbox", 4, title):
            return
        default, envs = self._db_envs()
        results, failed, not_validated = [], [], []
        for env in envs:
            out_json = self.disc / f"sql-validation-{env}.json"
            cmd = [sys.executable, str(SCRIPTS / "pg_sandbox.py"), "validate-sql", "--dir", str(self.db),
                   "--out", str(out_json)]
            if env != default:
                cmd += ["--env", env]
            proc = self._run(cmd, self.out, timeout=900)
            status = {0: "PASSED", 1: "FAILED", 3: "NOT_VALIDATED"}.get(proc.returncode, "FAILED")
            results.append(f"{env}: {status}")
            if status == "FAILED":
                failed += [f"{env}: {line}" for line in self._tail(proc, 12)]
            elif status == "NOT_VALIDATED":
                not_validated.append(f"{env}: {' '.join(self._tail(proc, 2))}")
        if failed:
            self.add("aurora_sql_sandbox", 4, title, "FAIL", "; ".join(results), failed)
        elif not_validated:
            self.add("aurora_sql_sandbox", 4, title, "NOT VALIDATED", "; ".join(results), not_validated)
        else:
            self.add("aurora_sql_sandbox", 4, title, "OK", "; ".join(results))

    # ------------------------------------------------------------- C5 backend
    def _py_files(self, layer: str) -> list[Path]:
        return self._walk(self.back / "src" / layer, {".py"})

    @staticmethod
    def _imports(tree: ast.AST) -> list[tuple[int, str]]:
        found = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                found += [(node.lineno, alias.name) for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                found.append((node.lineno, node.module))
        return found

    @staticmethod
    def _strings(tree: ast.AST) -> list[tuple[int, str]]:
        docstrings = set()
        for node in ast.walk(tree):
            if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and node.body:
                first = node.body[0]
                if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
                    docstrings.add(id(first.value))
        out = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings:
                out.append((node.lineno, node.value))
            elif isinstance(node, ast.JoinedStr):
                parts = [v.value for v in node.values if isinstance(v, ast.Constant) and isinstance(v.value, str)]
                out.append((node.lineno, "{}".join(parts)))
        return out

    def _parse(self, path: Path) -> ast.AST | None:
        try:
            return ast.parse(read_text(path), filename=str(path))
        except SyntaxError:
            return None

    def check_backend_structure(self) -> None:
        required = ["template.yaml", "samconfig.toml", ".env.example", "pyproject.toml", "src/requirements.txt",
                    "src/domain", "src/application", "src/infrastructure", "src/entrypoints/lambda_handlers",
                    "src/shared", "tests/unit", "tests/fakes"]
        missing = [f"backend/{r}" for r in required if not (self.back / r).exists()]
        self.verdict("backend_structure", 5, "Estructura hexagonal del backend", missing)

    def check_backend_handlers(self) -> None:
        handlers: dict[str, str] = {}
        for ep in self.manifest.get("api_endpoints") or []:
            handlers[str(ep.get("handler"))] = f"{ep.get('method')} {ep.get('path')}"
        for w in self.manifest.get("async_workers") or []:
            handlers[str(w.get("handler"))] = f"worker {w.get('name')}"
        for j in self.manifest.get("scheduled_jobs") or []:
            handlers[str(j.get("handler"))] = f"job {j.get('name')}"
        rt = self.manifest.get("realtime") or {}
        if rt.get("enabled"):
            handlers[str(rt.get("ticket_handler") or "entrypoints.lambda_handlers.realtime.ticket_handler")] = \
                "realtime ticket"
        for res in (self.template.get("Resources") or {}).values():
            if res.get("Type") == "AWS::Serverless::Function":
                handler = (res.get("Properties") or {}).get("Handler")
                if isinstance(handler, str):
                    handlers.setdefault(handler, "template.yaml")
        missing = []
        for handler, origin in sorted(handlers.items()):
            module, _, func = handler.rpartition(".")
            path = self.back / "src" / (module.replace(".", "/") + ".py")
            if not path.exists():
                missing.append(f"{handler} ({origin}): no existe {rel(path, self.out)}")
                continue
            tree = self._parse(path)
            names = {n.name for n in ast.walk(tree)
                     if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))} if tree else set()
            assigned = {t.id for n in ast.walk(tree) if isinstance(n, ast.Assign)
                        for t in n.targets if isinstance(t, ast.Name)} if tree else set()
            if func not in names | assigned:
                missing.append(f"{handler} ({origin}): no define {func}")
        self.verdict("backend_handlers", 5, "Handlers del manifest y del template implementados", missing,
                     ok_detail=f"{len(handlers)} handlers")
        classes = set()
        for path in self._walk(self.back / "src", {".py"}):
            tree = self._parse(path)
            classes |= {n.name for n in ast.walk(tree) if isinstance(n, ast.ClassDef)} if tree else set()
        use_cases = {str(ep.get("use_case")) for ep in self.manifest.get("api_endpoints") or [] if ep.get("use_case")}
        missing_uc = sorted(uc for uc in use_cases if uc not in classes)
        self.verdict("backend_use_cases", 5, "Use cases del manifest implementados", missing_uc,
                     ok_detail=f"{len(use_cases)} use cases")

    def check_backend_layers(self) -> None:
        problems: list[str] = []
        for layer, forbidden in LAYER_FORBIDDEN.items():
            for path in self._py_files(layer):
                tree = self._parse(path)
                if tree is None:
                    problems.append(f"{rel(path, self.out)}: error de sintaxis")
                    continue
                for line, module in self._imports(tree):
                    root = module.split(".")[0]
                    if root in forbidden or module in forbidden:
                        problems.append(f"{rel(path, self.out)}:{line} ({layer}) importa {module}")
        handler_dir = self.back / "src" / "entrypoints" / "lambda_handlers"
        for path in self._walk(handler_dir, {".py"}):
            if path.name in HANDLER_INFRA_FILES:
                continue
            tree = self._parse(path)
            if tree is None:
                problems.append(f"{rel(path, self.out)}: error de sintaxis")
                continue
            for line, module in self._imports(tree):
                if module.split(".")[0] in IO_LIBS or module.startswith("infrastructure.database"):
                    problems.append(f"{rel(path, self.out)}:{line} handler importa {module} (usar container.py)")
            for node in tree.body:
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    length = (node.end_lineno or node.lineno) - node.lineno + 1
                    if length > MAX_HANDLER_LINES:
                        problems.append(f"{rel(path, self.out)}:{node.lineno} {node.name} tiene {length} líneas "
                                        f"(handler delgado ≤ {MAX_HANDLER_LINES}: mover lógica al use case)")
        self.verdict("backend_layers", 5, "Dependencias entre capas y handlers delgados", problems)

    def _naming_sources(self) -> tuple[set[str], set[str]]:
        tables, functions = set(), set()
        path = self.db / "naming-map.json"
        if not path.exists():
            return tables, functions
        data = read_json(path)
        for item in data.get("relations") or []:
            short = str(item.get("source", "")).split(".")[-1]
            if short and short != item.get("target_name"):
                tables.add(short)
        for item in data.get("functions") or []:
            short = str(item.get("source", "")).split(".")[-1]
            if short and short != item.get("target_name"):
                functions.add(short)
        return tables, functions

    def check_backend_sql(self) -> None:
        problems: list[str] = []
        tables, functions = self._naming_sources()
        table_re = re.compile(r"(?i)\b(?:from|join|into|update|table)\s+(?:public\.)?\"?(" +
                              "|".join(map(re.escape, sorted(tables))) + r")\"?\b") if tables else None
        func_re = re.compile(r"(?i)(?<![\w.])(" + "|".join(map(re.escape, sorted(functions))) + r")\s*\(") \
            if functions else None
        for path in self._walk(self.back / "src", {".py"}):
            tree = self._parse(path)
            if tree is None:
                continue
            layer = path.relative_to(self.back / "src").parts[0]
            label = rel(path, self.out)
            text = read_text(path)
            for match in QUALIFIED_ENV_SCHEMA.finditer(text):
                line = text.count("\n", 0, match.start()) + 1
                problems.append(f"{label}:{line} esquema calificado '{match.group(0)}' (depende del ambiente; "
                                "usar nombres sin calificar, el search_path lo resuelve)")
            for line, value in self._strings(tree):
                if not SQL_RE.search(value):
                    continue
                if layer != "infrastructure":
                    problems.append(f"{label}:{line} SQL fuera de infrastructure/ ({layer})")
                for match in SUPABASE_SCHEMA_REF.finditer(value):
                    problems.append(f"{label}:{line} referencia de esquema Supabase '{match.group(0)}'")
                if table_re:
                    for match in table_re.finditer(value):
                        problems.append(f"{label}:{line} usa la tabla original '{match.group(1)}' "
                                        "(ver database/naming-map.json)")
                if func_re:
                    for match in func_re.finditer(value):
                        problems.append(f"{label}:{line} usa la función original '{match.group(1)}' "
                                        "(ver database/naming-map.json)")
        self.verdict("backend_sql", 5, "SQL solo en adapters y con nombres de Aurora", problems)

    def check_backend_tests(self) -> None:
        title = "pytest (unitarios con fakes)"
        if not self._dynamic("backend_unit_tests", 6, title):
            return
        proc = self._run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests"], self.back,
                         env={"PYTHONDONTWRITEBYTECODE": "1"})
        summary = self._tail(proc, 1)
        if proc.returncode == 0:
            self.add("backend_unit_tests", 6, title, "OK", " ".join(summary))
        elif "No module named" in (proc.stdout + proc.stderr) and "pytest" in (proc.stdout + proc.stderr):
            self.add("backend_unit_tests", 6, title, "NOT VALIDATED", "pytest no instalado")
        else:
            self.add("backend_unit_tests", 6, title, "FAIL",
                     "instalar dependencias: pip install -r backend/requirements-dev.txt"
                     if "ModuleNotFoundError" in proc.stdout + proc.stderr else "", self._tail(proc, 30))
        unit_tests = [p for p in self._walk(self.back / "tests" / "unit", {".py"}) if p.name.startswith("test_")]
        modules = {str(ep.get("module")) for ep in self.manifest.get("api_endpoints") or []}
        untested = sorted(m for m in modules if m and not any(m in p.read_text(encoding="utf-8", errors="ignore")
                                                                or m in p.name for p in unit_tests))
        self.verdict("backend_module_tests", 6, "Cada módulo del manifest tiene tests unitarios", untested,
                     warn=True)

    def check_backend_integration(self) -> None:
        title = "pytest de integración contra el esquema generado (PG efímero)"
        if not self._dynamic("backend_integration_tests", 6, title):
            return
        if not (self.back / "tests" / "integration").is_dir():
            self.add("backend_integration_tests", 6, title, "WARN", "no hay tests/integration")
            return
        default, _ = self._db_envs()
        folder = self._db_dir(default, default)
        prov, schema = folder / "aurora_postgresql_provisioning.sql", folder / "aurora_postgresql_schema.sql"
        if not prov.exists() or not schema.exists():
            self.add("backend_integration_tests", 6, title, "FAIL", "faltan scripts SQL del ambiente por defecto")
            return
        try:
            from pg_sandbox import TEST_PASSWORD, Sandbox
        except ImportError as exc:
            self.add("backend_integration_tests", 6, title, "NOT VALIDATED", str(exc))
            return
        db = re.search(r"-- Ambiente: \w+ \| Base: (\S+)", read_text(schema))
        app_user = re.search(r"ALTER ROLE (usr_\w+_app) IN DATABASE", read_text(prov))
        if not db or not app_user:
            self.add("backend_integration_tests", 6, title, "FAIL", "no se pudo leer base/usuario de los scripts")
            return
        try:
            with Sandbox() as sb:
                pw = {k: TEST_PASSWORD for k in ("pass_ro", "pass_rw", "pass_ddl", "pass_admin")}
                sb.must("postgres", file=prov, variables=pw)
                sb.must(db.group(1), file=schema)
                from pg_sandbox import apply_changes_and_data

                steps: list[str] = []
                if not apply_changes_and_data(sb, self.db, folder, db.group(1),
                                              lambda name, ok, detail="": steps.append(f"{name}: {detail}")
                                              if not ok else None, "integración"):
                    self.add("backend_integration_tests", 6, title, "FAIL", "falló al aplicar cambios/datos", steps)
                    return
                url = f"postgresql://{app_user.group(1)}@127.0.0.1:{sb.port}/{db.group(1)}"
                proc = self._run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests/integration"],
                                 self.back, env={"TEST_DATABASE_URL": url, "PYTHONDONTWRITEBYTECODE": "1"})
        except RuntimeError as exc:
            self.add("backend_integration_tests", 6, title, "NOT VALIDATED", str(exc)[:300])
            return
        if proc.returncode == 0:
            self.add("backend_integration_tests", 6, title, "OK", " ".join(self._tail(proc, 1)))
        else:
            self.add("backend_integration_tests", 6, title, "FAIL", "", self._tail(proc, 30))

    def check_backend_lint(self) -> None:
        title = "ruff check"
        if "backend_lint" in self.skip:
            self.add("backend_lint", 7, title, "NOT VALIDATED", "omitido con --skip")
            return
        ruff = shutil.which("ruff")
        cmd = [ruff, "check", "."] if ruff else [sys.executable, "-m", "ruff", "check", "."]
        proc = self._run(cmd, self.back, env={"RUFF_CACHE_DIR": tempfile.gettempdir() + "/ruff-cache-validate"})
        if proc.returncode == 0:
            self.add("backend_lint", 7, title, "OK")
        elif proc.returncode in (127,) or "No module named ruff" in proc.stderr:
            self.add("backend_lint", 7, title, "NOT VALIDATED", "ruff no instalado (pip install ruff)")
        else:
            self.add("backend_lint", 7, title, "FAIL", "", self._tail(proc, 30))

    # ------------------------------------------------------------- C8/C9/C10 SAM
    def check_template_single(self) -> None:
        templates = [rel(p, self.out) for p in self._walk(self.out, {".yaml", ".yml", ".json"})
                     if re.fullmatch(r"template([-_.].+)?\.(ya?ml|json)", p.name)
                     and "node_modules" not in p.parts]
        problems = [t for t in templates if t != "backend/template.yaml"]
        if "backend/template.yaml" not in templates:
            problems.insert(0, "falta backend/template.yaml")
        self.verdict("template_single", 8, "Un único template SAM parametrizado", problems)
        path = self.back / "template.yaml"
        if not path.exists():
            return
        try:
            self.template = load_cfn_yaml(path)
        except Exception as exc:  # noqa: BLE001 - se reporta tal cual
            self.add("template_parse", 8, "template.yaml legible", "FAIL", str(exc)[:300])
            return
        t = self.template
        problems = []
        env_param = (t.get("Parameters") or {}).get("Environment") or {}
        if sorted(env_param.get("AllowedValues") or []) != ["dev", "prod", "qa"]:
            problems.append("Parameters.Environment debe permitir exactamente dev, qa, prod")
        if "IsProduction" not in (t.get("Conditions") or {}):
            problems.append("falta Conditions.IsProduction")
        glob = ((t.get("Globals") or {}).get("Function") or {})
        if glob.get("Runtime") != "python3.13":
            problems.append(f"Globals.Function.Runtime = {glob.get('Runtime')} (estándar python3.13)")
        dumped = json.dumps(t)
        if re.search(r'"(?:DB_PASSWORD|PASSWORD|DB_PASS)"', dumped):
            problems.append("variable de entorno con password: usar Secrets Manager (DB_SECRET_NAME)")
        for logical, res in (t.get("Resources") or {}).items():
            props = res.get("Properties") or {}
            if res.get("Type") == "AWS::Serverless::Function":
                if (props.get("LoggingConfig") or {}).get("LogFormat") != "JSON":
                    problems.append(f"{logical}: LoggingConfig.LogFormat debe ser JSON")
                if "Runtime" in props and props["Runtime"] != "python3.13":
                    problems.append(f"{logical}: Runtime {props['Runtime']}")
                timeout = props.get("Timeout", glob.get("Timeout", 3))
                if isinstance(timeout, int) and timeout >= 900:
                    problems.append(f"{logical}: Timeout {timeout}s (síncrono > 30 s → asíncrono)")
            if res.get("Type") == "AWS::Logs::LogGroup":
                retention = json.dumps(props.get("RetentionInDays"))
                if "IsProduction" not in retention:
                    problems.append(f"{logical}: RetentionInDays debe ser !If [IsProduction, 30, 7]")
        self.verdict("template_standard", 8, "Template conforme al estándar (parámetros, runtime, logs)", problems)

    def check_samconfig(self) -> None:
        path = self.back / "samconfig.toml"
        if not path.exists():
            self.add("samconfig", 8, "samconfig.toml dev/qa/prod", "FAIL", "no existe")
            return
        data = load_toml(path)
        problems = []
        envs = ("dev", "qa", "prod")
        for env in envs:
            params = ((data.get(env) or {}).get("deploy") or {}).get("parameters") or {}
            if not params:
                problems.append(f"falta [{env}.deploy.parameters]")
                continue
            stack = str(params.get("stack_name", ""))
            if not stack.startswith(f"{env}-"):
                problems.append(f"{env}: stack_name '{stack}' debe empezar con '{env}-'")
            overrides = params.get("parameter_overrides") or []
            overrides = overrides if isinstance(overrides, list) else str(overrides).split()
            if f"Environment={env}" not in overrides:
                problems.append(f"{env}: parameter_overrides sin Environment={env}")
            for item in overrides:
                for other in envs:
                    if other != env and f"/{other}/" in str(item):
                        problems.append(f"{env}: '{item}' apunta a rutas de {other}")
            tags = params.get("tags") or []
            tags = tags if isinstance(tags, list) else str(tags).split()
            keys = {str(tag).split("=", 1)[0]: str(tag).split("=", 1)[-1] for tag in tags}
            for key in ("Project", "Environment", "Name"):
                if key not in keys:
                    problems.append(f"{env}: falta el tag {key}")
            if keys.get("Environment", "").lower() != env:
                problems.append(f"{env}: tag Environment={keys.get('Environment')}")
            if params.get("confirm_changeset") is not True:
                problems.append(f"{env}: confirm_changeset debe ser true")
        self.verdict("samconfig", 8, "samconfig.toml dev/qa/prod con tags y rutas por ambiente", problems)

    def check_template_lint(self) -> None:
        path = self.back / "template.yaml"
        if not path.exists():
            return
        if "cfn_lint" in self.skip:
            self.add("cfn_lint", 9, "cfn-lint", "NOT VALIDATED", "omitido con --skip")
        else:
            exe = shutil.which("cfn-lint")
            cmd = [exe, str(path)] if exe else [sys.executable, "-m", "cfnlint", str(path)]
            proc = self._run(cmd, self.back, env={"AWS_DEFAULT_REGION": self._region()})
            if proc.returncode == 127 or "No module named cfnlint" in proc.stderr:
                self.add("cfn_lint", 9, "cfn-lint", "NOT VALIDATED", "cfn-lint no instalado (pip install cfn-lint)")
            elif proc.returncode & 2:
                self.add("cfn_lint", 9, "cfn-lint", "FAIL", f"rc={proc.returncode}", self._tail(proc, 30))
            elif proc.returncode & 4:
                self.add("cfn_lint", 9, "cfn-lint", "WARN", "advertencias", self._tail(proc, 30))
            else:
                self.add("cfn_lint", 9, "cfn-lint", "OK")
        if "sam_validate" in self.skip:
            self.add("sam_validate", 9, "Transformación SAM", "NOT VALIDATED", "omitido con --skip")
            return
        try:
            from cfnlint.decode import decode
            from samtranslator.public.exceptions import InvalidDocumentException
            from samtranslator.translator.transform import transform
        except ImportError:
            self.add("sam_validate", 9, "Transformación SAM", "NOT VALIDATED",
                     "faltan aws-sam-translator y cfn-lint (pip install aws-sam-translator cfn-lint)")
            return
        os.environ.setdefault("AWS_DEFAULT_REGION", self._region())
        import logging

        logging.getLogger("samtranslator").setLevel(logging.ERROR)
        tpl, errors = decode(str(path))
        if errors or tpl is None:
            self.add("sam_validate", 9, "Transformación SAM", "FAIL", "no se pudo decodificar",
                     [str(e) for e in errors or []])
            return
        tpl.setdefault("Globals", {}).setdefault("Function", {})["CodeUri"] = "s3://sam-validate/code.zip"
        for res in (tpl.get("Resources") or {}).values():
            if res.get("Type") == "AWS::Serverless::Function" and "CodeUri" in (res.get("Properties") or {}):
                res["Properties"]["CodeUri"] = "s3://sam-validate/code.zip"

        class NoManagedPolicies:
            def load(self) -> dict[str, str]:
                return {}

        try:
            result = transform(tpl, {}, NoManagedPolicies())
            self.add("sam_validate", 9, "Transformación SAM", "OK",
                     f"{len(result.get('Resources', {}))} recursos CloudFormation")
        except InvalidDocumentException as exc:
            self.add("sam_validate", 9, "Transformación SAM", "FAIL", "",
                     [getattr(c, "message", str(c)) for c in exc.causes])
        except Exception as exc:  # noqa: BLE001
            self.add("sam_validate", 9, "Transformación SAM", "FAIL", str(exc)[:300])

    def _region(self) -> str:
        return str((self.manifest.get("target") or {}).get("aws_region") or "us-east-1")

    def check_iam_and_queues(self) -> None:
        resources = self.template.get("Resources") or {}
        if not resources:
            return
        problems = []
        for logical, res in resources.items():
            props = res.get("Properties") or {}
            policies = []
            if res.get("Type") == "AWS::IAM::Role":
                policies = [p.get("PolicyDocument") or {} for p in props.get("Policies") or []]
                for arn in props.get("ManagedPolicyArns") or []:
                    if re.search(r"AdministratorAccess|PowerUserAccess|FullAccess", json.dumps(arn)):
                        problems.append(f"{logical}: política administrada amplia {arn}")
            elif res.get("Type") == "AWS::Serverless::Function":
                pols = props.get("Policies") or []
                pols = pols if isinstance(pols, list) else [pols]
                for pol in pols:
                    if isinstance(pol, str):
                        problems.append(f"{logical}: política administrada {pol} (usar rol compartido mínimo)")
                    elif isinstance(pol, dict) and "Statement" in pol:
                        policies.append(pol)
            for doc in policies:
                for st in doc.get("Statement") or []:
                    if st.get("Effect") != "Allow":
                        continue
                    actions = st.get("Action") or []
                    actions = [actions] if isinstance(actions, str) else actions
                    resource = st.get("Resource")
                    resources_list = [resource] if not isinstance(resource, list) else resource
                    if any(a == "*" or str(a).endswith(":*") for a in actions):
                        problems.append(f"{logical}/{st.get('Sid', '?')}: acción comodín {actions}")
                    if "*" in resources_list and not set(actions) <= ENI_ACTIONS:
                        problems.append(f"{logical}/{st.get('Sid', '?')}: Resource '*' fuera de la excepción ENI")
        self.verdict("iam_least_privilege", 10, "IAM sin comodines (salvo ENI documentado)", problems)

        problems = []
        queues = {k: v for k, v in resources.items() if v.get("Type") == "AWS::SQS::Queue"}
        main_queues = {k: v for k, v in queues.items() if not re.search(r"(?i)dlq$", k)}
        consumers: dict[str, list[tuple[str, dict[str, Any], int]]] = {}
        glob_timeout = int(((self.template.get("Globals") or {}).get("Function") or {}).get("Timeout", 3))
        for logical, res in resources.items():
            if res.get("Type") != "AWS::Serverless::Function":
                continue
            props = res.get("Properties") or {}
            for event in (props.get("Events") or {}).values():
                if event.get("Type") == "SQS":
                    q = json.dumps((event.get("Properties") or {}).get("Queue"))
                    for name in main_queues:
                        if f'"{name}.Arn"' in q or f'"{name}"' in q:
                            consumers.setdefault(name, []).append(
                                (logical, event.get("Properties") or {}, int(props.get("Timeout", glob_timeout))))
        for name, res in main_queues.items():
            props = res.get("Properties") or {}
            redrive = props.get("RedrivePolicy") or {}
            if not redrive.get("deadLetterTargetArn"):
                problems.append(f"{name}: sin DLQ (RedrivePolicy.deadLetterTargetArn)")
            if int(redrive.get("maxReceiveCount", 0) or 0) < 5:
                problems.append(f"{name}: maxReceiveCount < 5")
            dlq = re.search(r'"([A-Za-z0-9]+)\.Arn"', json.dumps(redrive.get("deadLetterTargetArn")))
            if dlq and not any(r.get("Type") == "AWS::CloudWatch::Alarm" and dlq.group(1) in json.dumps(r)
                               for r in resources.values()):
                problems.append(f"{name}: sin alarma sobre la DLQ {dlq.group(1)}")
            for func, event, timeout in consumers.get(name, []):
                if int(props.get("VisibilityTimeout", 30)) < 6 * timeout:
                    problems.append(f"{name}: VisibilityTimeout < 6 × Timeout de {func} ({timeout}s)")
                if "ReportBatchItemFailures" not in (event.get("FunctionResponseTypes") or []):
                    problems.append(f"{func}: evento SQS sin ReportBatchItemFailures")
            if not consumers.get(name):
                problems.append(f"{name}: ninguna función la consume")
        if main_queues and not any(r.get("Type") == "AWS::DynamoDB::Table" and
                                   (r.get("Properties") or {}).get("TimeToLiveSpecification")
                                   for r in resources.values()):
            problems.append("hay colas SQS pero no tabla de idempotencia DynamoDB con TTL")
        self.verdict("sqs_controls", 10, "Colas SQS con los 4 controles del estándar", problems,
                     ok_detail=f"{len(main_queues)} cola(s)" if main_queues else "sin colas (no aplica)")

    # ------------------------------------------------------------- C11/C12 frontend
    def _front_src(self) -> Path:
        return self.front / self.src_dir if self.src_dir != "." else self.front

    def _front_code(self) -> list[Path]:
        roots = [self._front_src()]
        for extra in ("app", "pages", "components", "lib"):
            if self.src_dir != "." and (self.front / extra).is_dir():
                roots.append(self.front / extra)
        files: list[Path] = []
        for root in roots:
            files += self._walk(root, {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"})
        return files

    def check_frontend_architecture(self) -> None:
        if not self.front.exists():
            self.add("frontend_structure", 11, "Frontend migrado", "FAIL", "no existe migration-output/frontend")
            return
        src = self._front_src()
        problems = []
        shared = src / "shared"
        for required in ("api/axios-api-gateway", "api/api-error", "config/env", "auth/cognito-auth"):
            if not any((shared / f"{required}.{ext}").exists() for ext in ("ts", "js", "tsx", "jsx")):
                problems.append(f"falta {rel(shared, self.out)}/{required}.*")
        if (self.manifest.get("realtime") or {}).get("enabled") and \
                not any((shared / "realtime" / f"realtime-client.{e}").exists() for e in ("ts", "js")):
            problems.append("realtime habilitado pero falta shared/realtime/realtime-client.*")
        self.verdict("frontend_shared", 11, "Capa compartida (gateway HTTP, auth, env)", problems)

        problems = []
        http_re = re.compile(r"""from\s+['"]axios['"]|require\(\s*['"]axios['"]\s*\)|(?<![\w.])fetch\s*\(|"""
                             r"""new\s+XMLHttpRequest""")
        api_dir = shared / "api"
        for path in self._front_code():
            if api_dir in path.parents or re.search(r"\.(test|spec)\.", path.name) or \
                    any(p in ("__tests__", "__mocks__") for p in path.parts):
                continue
            for n, line in enumerate(read_text(path).splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith(("//", "*", "/*")):
                    continue
                if http_re.search(line):
                    problems.append(f"{rel(path, self.out)}:{n} HTTP directo fuera de shared/api: {stripped[:100]}")
        self.verdict("frontend_http", 11, "HTTP solo vía axiosApiGateway", problems)

        views = src / "views"
        counts = (self.usage.get("summary") or {}).get("counts") or {}
        data_ops = sum(int(counts.get(k, 0)) for k in ("table", "rpc", "storage", "edge_function"))
        problems, naming, sizes = [], [], []
        api_eps = [e for e in self.manifest.get("api_endpoints") or []
                   if str(e.get("path")) not in ("/me", "/realtime/ticket")]
        if not views.is_dir():
            if data_ops or api_eps:
                problems.append(f"no existe {rel(views, self.out)} y hay {data_ops or len(api_eps)} operaciones de datos")
        else:
            kebab_file = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+)+$")
            for module in sorted(d for d in views.iterdir() if d.is_dir()):
                label = rel(module, self.out)
                if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", module.name):
                    naming.append(f"{label}: carpeta de módulo no está en kebab-case")
                files = [p for p in module.rglob("*") if p.is_file()]
                if not any(p.parent.name == "api" and re.search(r"-api\.[jt]sx?$", p.name) for p in files):
                    problems.append(f"{label}: falta api/<modulo>-api.*")
                if not any(p.parent.name == "hooks" and re.fullmatch(r"use-[a-z0-9-]+-controller\.[jt]sx?", p.name)
                           for p in files):
                    problems.append(f"{label}: falta hooks/use-<nombre>-controller.*")
                for path in files:
                    rp = rel(path, self.out)
                    if path.suffix in (".css", ".scss", ".svg", ".png", ".json", ".md"):
                        continue
                    if not kebab_file.match(path.name) and path.name not in ("index.ts", "index.js", "index.tsx",
                                                                               "index.jsx"):
                        naming.append(f"{rp}: nombre de archivo no está en kebab-case")
                    if path.parent.name == "pages" and not re.search(r"-page\.[jt]sx?$", path.name) \
                            and not path.name.startswith("index."):
                        naming.append(f"{rp}: las pages se llaman <nombre>-page.*")
                    lines = len(read_text(path).splitlines())
                    if path.parent.name == "pages":
                        if lines > 250:
                            sizes.append(f"{rp}: {lines} líneas (page ≤ 250)")
                        text = read_text(path)
                        if re.search(r"""from\s+['"][^'"]*/api/[^'"]*['"]""", text):
                            problems.append(f"{rp}: la page importa la capa api (usar el controller)")
                    elif "components" in path.parts and lines > 200:
                        sizes.append(f"{rp}: {lines} líneas (sección ≤ 200)")
                    if path.parent.name == "hooks" and "controller" in path.name:
                        text = read_text(path)
                        if "useEffect" in text and "Api" in text and "AbortController" not in text \
                                and "signal" not in text:
                            problems.append(f"{rp}: el controller no cancela peticiones (AbortController)")
        for screen in self.manifest.get("screens") or []:
            page = str(screen.get("page") or "")
            if page and not (self.front / page).exists():
                problems.append(f"pantalla del manifest sin archivo: frontend/{page}")
        self.verdict("frontend_layers", 11, "Módulos src/views con Page → Controller → Api", problems)
        self.verdict("frontend_naming", 11, "Naming kebab-case (-page, use-*-controller, -api)", naming)
        self.verdict("frontend_sizes", 11, "Límites de tamaño de pages y secciones", sizes)
        big = [f"{rel(p, self.out)}: {n} líneas" for p in self._front_code() if p.suffix in (".jsx", ".tsx")
               and views not in p.parents and (n := len(read_text(p).splitlines())) > 250]
        self.verdict("frontend_large_files", 11, "Componentes fuera de views/ ≤ 250 líneas", big, warn=True)

        prefix = {"vite": "VITE_", "next": "NEXT_PUBLIC_"}.get(str(self.project.get("framework")), "REACT_APP_")
        env_example = self.front / ".env.example"
        problems = []
        if not env_example.exists():
            problems.append("falta frontend/.env.example")
        elif f"{prefix}API_BASE_URL" not in read_text(env_example):
            problems.append(f"frontend/.env.example sin {prefix}API_BASE_URL")
        real_envs = [rel(p, self.out) for p in self.front.glob(".env*")
                     if p.is_file() and not re.search(r"example|sample|template", p.name)]
        problems += [f"{e}: archivo .env real dentro de la salida" for e in real_envs]
        if (self.front / "legacy-html").exists():
            problems.append("frontend/legacy-html/ sigue existiendo: portar las páginas a src/views y borrarla")
        hosting = [n for n in ("amplify.yml", "Dockerfile") if (self.front / n).exists()]
        if not hosting:
            problems.append("falta amplify.yml o Dockerfile de hosting")
        self.verdict("frontend_env_hosting", 11, "Variables por ambiente y hosting", problems)

    def _pm(self) -> str:
        pm = str(self.preflight.get("package_manager") or "npm")
        return pm if shutil.which(pm) else "npm"

    def check_frontend_build(self) -> None:
        title = "Instalación y build del frontend"
        if not self._dynamic("frontend_build", 12, title):
            return
        if not (self.front / "package.json").exists():
            self.add("frontend_build", 12, title, "FAIL", "no existe frontend/package.json")
            return
        pm = self._pm()
        if not shutil.which(pm) or not shutil.which("node"):
            self.add("frontend_build", 12, title, "NOT VALIDATED", f"faltan node o {pm}")
            return
        install = {"npm": [pm, "install", "--no-audit", "--no-fund"], "pnpm": [pm, "install"],
                   "yarn": [pm, "install"]}[pm]
        proc = self._run(install, self.front, timeout=max(self.timeout, 1200))
        if proc.returncode != 0:
            self.add("frontend_build", 12, title, "FAIL", f"{' '.join(install)} falló", self._tail(proc, 30))
            return
        env = {"CI": "true", **self._placeholder_env()}
        proc = self._run([pm, "run", "build"], self.front, env=env)
        if proc.returncode != 0:
            self.add("frontend_build", 12, title, "FAIL", f"{pm} run build falló", self._tail(proc, 40))
        else:
            self.add("frontend_build", 12, title, "OK", "install + build")
        pkg = json.loads(read_text(self.front / "package.json"))
        scripts = pkg.get("scripts") or {}
        if "format:check" in scripts:
            proc = self._run([pm, "run", "format:check"], self.front)
            if proc.returncode == 0:
                self.add("frontend_prettier", 12, "Prettier", "OK")
            else:
                self.add("frontend_prettier", 12, "Prettier", "FAIL", f"ejecutar {pm} run format",
                         self._tail(proc, 20))
        else:
            self.add("frontend_prettier", 12, "Prettier", "FAIL", "falta el script format:check")
        test_script = str(scripts.get("test") or "")
        if test_script and "no test specified" not in test_script:
            proc = self._run([pm, "test"], self.front, env=env)
            status = "OK" if proc.returncode == 0 else "FAIL"
            self.add("frontend_tests", 12, "Tests del frontend", status, "", [] if status == "OK" else
                     self._tail(proc, 30))
        else:
            self.add("frontend_tests", 12, "Tests del frontend", "OK", "el proyecto no tiene tests (no aplica)")

    def _placeholder_env(self) -> dict[str, str]:
        """Valores ficticios solo para compilar (el build exige VITE_API_BASE_URL)."""
        prefix = {"vite": "VITE_", "next": "NEXT_PUBLIC_"}.get(str(self.project.get("framework")), "REACT_APP_")
        return {f"{prefix}API_BASE_URL": "https://api.example.invalid", f"{prefix}COGNITO_USER_POOL_ID": "build-only",
                f"{prefix}COGNITO_CLIENT_ID": "build-only"}

    # ------------------------------------------------------------- C13 residuos
    def check_residue(self) -> None:
        problems = []
        for name, folder in (("frontend", self.front), ("backend", self.back)):
            if not folder.exists():
                continue
            out_json = self.disc / f"residue-{name}.json"
            proc = self._run([sys.executable, str(SCRIPTS / "scan_supabase_usage.py"), "--project", str(folder),
                              "--out", str(out_json), "--residue"], self.out, timeout=600)
            if proc.returncode not in (0, 1) or not out_json.exists():
                problems.append(f"{name}: el escaneo falló: {' '.join(self._tail(proc, 3))}")
                continue
            data = read_json(out_json)
            for op in data.get("operations") or []:
                problems.append(f"{name}/{op.get('file')}:{op.get('line')} uso {op.get('kind')}")
            for dep in data.get("package_dependencies") or []:
                problems.append(f"{name}/{dep.get('file')}: dependencia {dep.get('package')}")
            for hit in data.get("mentions") or []:
                problems.append(f"{name}/{hit.get('file')}:{hit.get('line')} {hit.get('text')}")
        self.verdict("supabase_residue", 13, "Cero referencias a Supabase en frontend y backend", problems)

    # ------------------------------------------------------------- C14 secretos / IDs
    def check_secrets(self) -> None:
        secrets, ids, env_values = [], [], []
        roots = [self.front, self.back, self.db]
        for root in roots:
            for path in self._walk(root, TEXT_EXTS, skip_tests=True):
                if path.name.startswith(".env") or path.suffix in (".env", ".example"):
                    for n, line in enumerate(read_text(path).splitlines(), 1):
                        key, sep, value = line.partition("=")
                        if sep and not line.lstrip().startswith("#") and SECRET_ENV_KEY.search(key) and value.strip():
                            env_values.append(f"{rel(path, self.out)}:{n} {key.strip()} tiene valor")
                text = read_text(path)
                previous = self._original_lines(path)
                for n, line in enumerate(text.splitlines(), 1):
                    if line.strip() in previous and root == self.front:
                        continue
                    for label, pattern in SECRET_PATTERNS:
                        if pattern.search(line):
                            secrets.append(f"{rel(path, self.out)}:{n} posible {label}")
                    for label, pattern in AWS_ID_PATTERNS:
                        if pattern.search(line):
                            ids.append(f"{rel(path, self.out)}:{n} {label} hardcodeado")
        leaked = [f"{rel(p, self.out)}: archivo de credenciales de Supabase dentro de la salida"
                  for p in self.out.rglob(".env.supabase*") if "node_modules" not in p.parts]
        self.verdict("hardcoded_secrets", 14, "Sin secretos en código ni configuración", leaked + secrets + env_values)
        self.verdict("hardcoded_ids", 14, "Sin IDs/ARNs/endpoints de AWS hardcodeados", ids)

    # ------------------------------------------------------------- C15 TODO
    def check_todos(self) -> None:
        problems = []
        exts = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".sql", ".sh", ".yaml", ".yml", ".toml"}
        for root in (self.front, self.back, self.db):
            for path in self._walk(root, exts):
                previous = self._original_lines(path)
                for n, line in enumerate(read_text(path).splitlines(), 1):
                    if TODO_RE.search(line) and line.strip() not in previous:
                        problems.append(f"{rel(path, self.out)}:{n} {line.strip()[:120]}")
        self.verdict("no_todos", 15, "Sin TODO/FIXME/pseudocódigo", problems)

    # ------------------------------------------------------------- orquestación
    def run(self) -> dict[str, Any]:
        self.check_discovery()
        self.check_manifest()
        self.check_database_files()
        self.check_database_sandbox()
        self.check_template_single()
        self.check_backend_structure()
        self.check_backend_handlers()
        self.check_backend_layers()
        self.check_backend_sql()
        self.check_backend_tests()
        self.check_backend_integration()
        self.check_backend_lint()
        self.check_samconfig()
        self.check_template_lint()
        self.check_iam_and_queues()
        self.check_frontend_architecture()
        self.check_frontend_build()
        self.check_residue()
        self.check_secrets()
        self.check_todos()
        criteria = {}
        for number, title in criteria_for(self.mode).items():
            statuses = [c["status"] for c in self.checks if c["criterion"] == number]
            if number == 16:
                status = "PENDING"  # lo resuelve build_report.py al generar el reporte
            elif not statuses:
                status = "NOT VALIDATED"
            elif "FAIL" in statuses:
                status = "FAIL"
            elif "NOT VALIDATED" in statuses:
                status = "NOT VALIDATED"
            else:
                status = "OK"
            criteria[str(number)] = {"title": title, "status": status}
        statuses = [c["status"] for n, c in criteria.items() if n != "16"]
        overall = "FAILED" if "FAIL" in statuses else ("NOT VALIDATED" if "NOT VALIDATED" in statuses else "PASSED")
        result = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                  "dynamic_checks_run": self.run_dynamic, "mode": self.mode, "overall": overall, "criteria": criteria,
                  "checks": self.checks}
        write_json(self.disc / "validation-results.json", result)
        return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=Path("migration-output"))
    parser.add_argument("--run", action="store_true", help="ejecuta build, tests y validación SQL en PG efímero")
    parser.add_argument("--skip", nargs="*", default=[], help="ids de verificaciones a omitir (quedan NOT VALIDATED)")
    parser.add_argument("--timeout", type=int, default=900, help="segundos por comando")
    args = parser.parse_args(argv)
    if not args.out.exists():
        print(f"ERROR: no existe {args.out}", file=sys.stderr)
        return 2
    result = Validator(args.out, args.run, set(args.skip), args.timeout).run()
    print("\nCriterios:")
    for number, data in result["criteria"].items():
        print(f"  {number:>2}. [{data['status']}] {data['title']}")
    print(f"\nResultado global: {result['overall']}  →  {rel(args.out.resolve() / '.discovery' / 'validation-results.json', Path.cwd())}")
    return 1 if result["overall"] == "FAILED" else 0


if __name__ == "__main__":
    raise SystemExit(main())
