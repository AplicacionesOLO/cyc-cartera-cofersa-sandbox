"""Cambios de esquema versionados (database/changes/NNN_descripcion.sql), compartidos por todas las skills.

Un cambio es SQL plano con los nombres de Aurora SIN calificar (tbl_tasks, idx_tasks_priority); el
runner fija el esquema y el rol dueño por ambiente. Cada cambio se aplica una sola vez por base y queda
registrado en tbl_schema_changes (id + checksum): re-ejecutar es seguro y un cambio ya aplicado que
se edita después se detecta (checksum distinto → error, se crea un cambio nuevo).
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

CHANGE_FILE = re.compile(r"^(\d{3,})_([a-z0-9_]+)\.sql$")
TRACKING_TABLE = "tbl_schema_changes"
OBJECT_PREFIXES = {
    "TABLE": "tbl_", "VIEW": "vw_", "MATERIALIZED VIEW": "mvw_", "FUNCTION": "fn_", "PROCEDURE": "sp_",
    "TRIGGER": "trg_", "SEQUENCE": "seq_", "INDEX": "idx_", "UNIQUE INDEX": "uidx_", "TYPE": "",
}
CONSTRAINT_PREFIXES = {"PRIMARY KEY": "pk_", "FOREIGN KEY": "fk_", "UNIQUE": "uq_", "CHECK": "ck_"}
DESTRUCTIVE = re.compile(
    r"(?is)\bDROP\s+(TABLE|COLUMN|VIEW|MATERIALIZED\s+VIEW|FUNCTION|TYPE|SCHEMA|INDEX|SEQUENCE|TRIGGER)\b"
    r"|\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b|\bRENAME\s+(COLUMN|TO)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b")
APPROVED = re.compile(r"(?im)^\s*--\s*destructive:\s*approved\b")


def changes_dir(db_dir: Path) -> Path:
    return Path(db_dir) / "changes"


def list_changes(db_dir: Path) -> list[Path]:
    folder = changes_dir(db_dir)
    if not folder.is_dir():
        return []
    return sorted((p for p in folder.glob("*.sql") if CHANGE_FILE.match(p.name)),
                  key=lambda p: int(CHANGE_FILE.match(p.name).group(1)))


def checksum(text: str) -> str:
    return hashlib.sha256(text.replace("\r\n", "\n").encode("utf-8")).hexdigest()[:16]


def env_context(env_dir: Path) -> dict[str, Any]:
    """Esquema principal y roles de un ambiente, desde su naming-map.json."""
    naming = json.loads((Path(env_dir) / "naming-map.json").read_text(encoding="utf-8"))
    return {"database": naming["database"], "schema": (naming.get("search_path") or [""])[0],
            "search_path": naming.get("search_path") or [], "roles": naming["roles"], "users": naming["users"]}


def _lit(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def wrapper_sql(change: Path, ctx: dict[str, Any]) -> str:
    """Script psql que aplica un cambio una sola vez, en una transacción, como rol ddl del aplicativo."""
    body = change.read_text(encoding="utf-8")
    change_id = change.stem
    digest = checksum(body)
    ddl = ctx["roles"]["ddl"]
    path = ", ".join(ctx["search_path"]) or ctx["schema"]
    table = f"{ctx['schema']}.{TRACKING_TABLE}"
    return f"""\\set ON_ERROR_STOP on
-- Cambio {change_id} (checksum {digest}) sobre {ctx['database']}. Generado por la skill; no editar.
BEGIN;
SET LOCAL ROLE {ddl};
SET LOCAL search_path TO {path};
CREATE TABLE IF NOT EXISTS {table} (
  change_id text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SELECT NOT EXISTS (SELECT 1 FROM {table} WHERE change_id = {_lit(change_id)}) AS pending,
       EXISTS (SELECT 1 FROM {table} WHERE change_id = {_lit(change_id)} AND checksum <> {_lit(digest)}) AS edited
\\gset
\\if :edited
  \\echo 'ERROR: el cambio {change_id} ya se aplicó con otro contenido. No se editan cambios aplicados: cree uno nuevo.'
  SELECT 1/0 AS cambio_editado;
\\endif
\\if :pending
{body.rstrip()}
;
INSERT INTO {table} (change_id, checksum) VALUES ({_lit(change_id)}, {_lit(digest)});
\\echo 'Cambio {change_id} aplicado.'
\\else
\\echo 'Cambio {change_id} ya estaba aplicado.'
\\endif
COMMIT;
"""


def lint_change(change: Path, naming: dict[str, Any] | None = None) -> list[str]:
    """Reglas de un cambio: naming Intelix, sin calificar, sin transacciones propias, destructivo aprobado."""
    problems: list[str] = []
    name = change.name
    text = change.read_text(encoding="utf-8")
    sql = re.sub(r"--[^\n]*", "", text)
    if not CHANGE_FILE.match(name):
        problems.append(f"{name}: nombre debe ser NNN_descripcion_en_snake.sql")
    if not sql.strip():
        problems.append(f"{name}: vacío")
    if re.search(r"(?im)^\s*\\", sql):
        problems.append(f"{name}: no se permiten meta-comandos de psql (\\...)")
    if re.search(r"(?i)\b(BEGIN|COMMIT|ROLLBACK)\s*;", sql):
        problems.append(f"{name}: sin BEGIN/COMMIT (el runner ya usa una transacción)")
    if re.search(r"(?i)\b[a-z][a-z0-9]{2,4}_(dev|qa|prd)_\w+_sch_\w+\.", sql):
        problems.append(f"{name}: no calificar con el esquema del ambiente (el runner fija el search_path)")
    if re.search(r"(?i)\b(public|auth|storage)\.\w+", sql):
        problems.append(f"{name}: referencia a esquemas de origen (public/auth/storage)")
    if DESTRUCTIVE.search(sql) and not APPROVED.search(text):
        problems.append(f"{name}: operación destructiva sin la línea '-- destructive: approved' "
                        "(requiere aprobación explícita del usuario y snapshot previo)")
    for kind, prefix in OBJECT_PREFIXES.items():
        if not prefix:
            continue
        spaced = kind.replace(" ", r"\s+")
        pattern = r"(?i)\bCREATE\s+(?:OR\s+REPLACE\s+)?" + spaced + r"\s+(?:IF\s+NOT\s+EXISTS\s+)?\"?(\w+)"
        for match in re.finditer(pattern, sql):
            obj = match.group(1)
            if kind == "INDEX" and re.search(r"(?i)UNIQUE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?\"?" + obj, sql):
                continue
            if not obj.lower().startswith(prefix):
                problems.append(f"{name}: {kind} '{obj}' debe empezar con '{prefix}'")
    for kind, prefix in CONSTRAINT_PREFIXES.items():
        spaced = kind.replace(" ", r"\s+")
        for match in re.finditer(r"(?i)\bCONSTRAINT\s+\"?(\w+)\"?\s+" + spaced, sql):
            if not match.group(1).lower().startswith(prefix):
                problems.append(f"{name}: constraint {kind} '{match.group(1)}' debe empezar con '{prefix}'")
    if re.search(r"(?i)\bADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)", sql):
        problems.append(f"{name}: usar ADD COLUMN IF NOT EXISTS")
    for match in re.finditer(r"(?is)\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?\"?(\w+)\"?\s+([^,;]+)", sql):
        definition = match.group(2)
        if re.search(r"(?i)\bNOT\s+NULL\b", definition) and not re.search(r"(?i)\bDEFAULT\b|GENERATED", definition):
            problems.append(f"{name}: columna '{match.group(1)}' NOT NULL sin DEFAULT falla en tablas con datos "
                            "(agregar DEFAULT o hacerlo en dos cambios: agregar nullable → poblar → SET NOT NULL)")
    if naming:
        old = {str(r.get("source", "")).split(".")[-1] for r in naming.get("relations") or []
               if str(r.get("source", "")).split(".")[-1] != r.get("target_name")}
        for word in sorted(old):
            if re.search(rf"(?i)\b(?:FROM|JOIN|INTO|UPDATE|TABLE|ON)\s+\"?{re.escape(word)}\"?\b", sql):
                problems.append(f"{name}: usa el nombre de origen '{word}' (ver naming-map.json)")
    return problems


def next_change_number(db_dir: Path) -> int:
    existing = [int(CHANGE_FILE.match(p.name).group(1)) for p in list_changes(db_dir)]
    return (max(existing) + 1) if existing else 1
