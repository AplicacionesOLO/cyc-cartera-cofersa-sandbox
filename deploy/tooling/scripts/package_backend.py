#!/usr/bin/env python3
"""Empaqueta el backend para Lambda sin SAM CLI ni Docker.

    python scripts/package_backend.py --backend backend --out deploy/build [--architecture x86_64|arm64]

Instala src/requirements.txt con ruedas manylinux de CPython 3.13 (las de Lambda), copia backend/src y arma un
zip determinista (mismo código → mismo hash → sin redespliegue innecesario). packaged_template() cambia
`CodeUri: src/` por la URI S3 del zip para desplegar el template SAM directamente con CloudFormation.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import fail  # noqa: E402

PLATFORMS = {"x86_64": "manylinux2014_x86_64", "arm64": "manylinux2014_aarch64"}
SKIP = {"__pycache__", ".pytest_cache", ".ruff_cache", "tests"}
FIXED_DATE = (1980, 1, 1, 0, 0, 0)


def package(backend: Path, out_dir: Path, architecture: str = "x86_64") -> tuple[Path, str]:
    src = backend / "src"
    if not (src / "requirements.txt").exists():
        fail(f"Falta {src}/requirements.txt")
    build = out_dir / "lambda-build"
    shutil.rmtree(build, ignore_errors=True)
    build.mkdir(parents=True)
    cmd = [sys.executable, "-m", "pip", "install", "-r", str(src / "requirements.txt"), "--target", str(build),
           "--platform", PLATFORMS[architecture], "--implementation", "cp", "--python-version", "3.13",
           "--only-binary=:all:", "--no-compile", "--quiet", "--disable-pip-version-check"]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        fail("No se pudieron descargar las dependencias Linux para Lambda:\n" + proc.stderr[-2000:], 1)
    for path in sorted(src.rglob("*")):
        rel = path.relative_to(src)
        if path.is_file() and not (set(rel.parts) & SKIP) and path.suffix != ".pyc":
            target = build / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
    files = sorted(p for p in build.rglob("*") if p.is_file() and "__pycache__" not in p.parts)
    digest = hashlib.sha256()
    for path in files:
        digest.update(str(path.relative_to(build)).encode())
        digest.update(path.read_bytes())
    code_hash = digest.hexdigest()[:16]
    zip_path = out_dir / f"backend-{code_hash}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in files:
            info = zipfile.ZipInfo(str(path.relative_to(build)), date_time=FIXED_DATE)
            info.external_attr = 0o644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, path.read_bytes())
    shutil.rmtree(build, ignore_errors=True)
    return zip_path, code_hash


def packaged_template(template_text: str, code_uri: str) -> str:
    text, count = re.subn(r"(?m)^(\s*CodeUri:\s*)src/?\s*$", lambda m: f"{m.group(1)}{code_uri}", template_text)
    if count == 0:
        fail("El template no tiene `CodeUri: src/` (¿no lo generó generate_sam.py?).")
    return text


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--backend", type=Path, default=Path("backend"))
    parser.add_argument("--out", type=Path, default=Path("deploy/build"))
    parser.add_argument("--architecture", choices=sorted(PLATFORMS), default="x86_64")
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    zip_path, code_hash = package(args.backend, args.out, args.architecture)
    print(f"{zip_path} ({zip_path.stat().st_size / 1024 / 1024:.1f} MB, hash {code_hash})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
