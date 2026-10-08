"""Utilidades compartidas por los scripts de aws-project-migrator (solo stdlib + PyYAML)."""

from __future__ import annotations

import json
import os
import re
import sys
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Any

SKILL_DIR = Path(__file__).resolve().parent.parent
ASSETS_DIR = SKILL_DIR / "assets"
SQL_DIR = Path(__file__).resolve().parent / "sql"

IGNORED_DIRS = frozenset(
    {
        "node_modules",
        ".git",
        "dist",
        "build",
        ".next",
        "out",
        "coverage",
        ".vercel",
        ".turbo",
        ".cache",
        ".parcel-cache",
        ".svelte-kit",
        ".expo",
        "migration-output",
        "venv",
        ".venv",
        "__pycache__",
        ".aws-sam",
        "vendor",
        ".idea",
        ".vscode",
        "storybook-static",
    }
)

SOURCE_EXTENSIONS = (".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte")

_JWT_LIKE = re.compile(r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}")
_LONG_SECRET = re.compile(r"(?<![A-Za-z0-9])(sb_(?:secret|publishable)_[A-Za-z0-9_\-]{10,}|[A-Za-z0-9+/]{40,}={0,2})")


def fail(message: str, code: int = 2) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(code)


def iter_files(root: Path, extensions: Iterable[str] | None = None) -> Iterator[Path]:
    exts = tuple(extensions) if extensions else None
    for current, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".git"))
        for name in sorted(files):
            if exts is None or name.endswith(exts):
                yield Path(current) / name


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="latin-1")


def rel(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def redact_secrets(text: str) -> str:
    """Oculta JWT y claves largas en fragmentos de código que se escriben a reportes."""
    text = _JWT_LIKE.sub("<REDACTED_JWT>", text)
    return _LONG_SECRET.sub("<REDACTED_KEY>", text)


def looks_like_secret(text: str) -> bool:
    return bool(_JWT_LIKE.search(text) or _LONG_SECRET.search(text))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _yaml():
    try:
        import yaml  # type: ignore
    except ImportError:
        fail("PyYAML no está instalado. Ejecute: python -m pip install pyyaml", 3)
    return yaml


def read_config(path: Path) -> Any:
    """Lee YAML o JSON según la extensión."""
    if path.suffix.lower() == ".json":
        return read_json(path)
    return _yaml().safe_load(path.read_text(encoding="utf-8")) or {}


def write_yaml(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        _yaml().safe_dump(data, sort_keys=False, allow_unicode=True, width=110), encoding="utf-8"
    )


def snake(value: str) -> str:
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value)
    value = re.sub(r"[^A-Za-z0-9]+", "_", value)
    return re.sub(r"_+", "_", value).strip("_").lower()


def kebab(value: str) -> str:
    return snake(value).replace("_", "-")


def pascal(value: str) -> str:
    return "".join(part.capitalize() for part in snake(value).split("_") if part)


# --------------------------------------------------------------------------- modo de la salida

def detect_mode(out: Path) -> str:
    """'greenfield' (proyecto nuevo, aws-project-creator) o 'migration' (aws-project-migrator)."""
    return "greenfield" if (Path(out) / "project-spec.yaml").exists() else "migration"


def manifest_path(out: Path) -> Path:
    out = Path(out)
    for name in ("project-manifest.yaml", "migration-manifest.yaml"):
        if (out / name).exists():
            return out / name
    return out / ("project-manifest.yaml" if detect_mode(out) == "greenfield" else "migration-manifest.yaml")
