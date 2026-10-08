#!/usr/bin/env python3
"""Diagnóstico de la exportación (SOLO LECTURA): repite las mismas llamadas a psql que export_data_sql.py,
pero solo con count(*), y muestra código de salida, tamaño de la salida y error (contraseña oculta)."""

from __future__ import annotations

import os
import subprocess
import sys
import urllib.parse
from pathlib import Path

MIGRATOR = Path.home() / ".claude" / "skills" / "aws-project-migrator" / "scripts"
sys.path.insert(0, str(MIGRATOR))
from pg_sandbox import find_pg_bin  # noqa: E402
from supabase_connect import load_credentials  # noqa: E402

creds = load_credentials(Path("../.env.supabase"))
raw = creds["SUPABASE_DB_PASSWORD"]
pw = urllib.parse.quote(raw, safe="")
ref = urllib.parse.urlparse(creds["SUPABASE_URL"]).hostname.split(".")[0]
host = "aws-1-us-east-2.pooler.supabase.com"
url = f"postgresql://postgres.{ref}:{pw}@{host}:5432/postgres?sslmode=require"
psql = find_pg_bin("psql")
print("psql:", psql)


def run(label: str, args: list[str], env: dict[str, str]) -> None:
    try:
        p = subprocess.run(args, capture_output=True, text=True, env=env, stdin=subprocess.DEVNULL, timeout=60)
        err = (p.stderr or "").replace(raw, "***").replace(pw, "***").strip()
        print(f"[{label}] rc={p.returncode} stdout={p.stdout.strip()[:40]!r} stderr={err[:400]!r}")
    except subprocess.TimeoutExpired:
        print(f"[{label}] TIMEOUT (60 s)")


ro = {**os.environ, "PGOPTIONS": "-c default_transaction_read_only=on"}
sql = "select count(*) from public.cartera"
run("A: URL + PGOPTIONS (como el exportador)", [psql, url, "-X", "-At", "-c", sql], ro)
run("B: URL sin PGOPTIONS", [psql, url, "-X", "-At", "-c", sql], dict(os.environ))
run("C: -h/-U + PGPASSWORD + PGOPTIONS",
    [psql, "-w", "-h", host, "-p", "5432", "-U", f"postgres.{ref}", "-d", "postgres", "-X", "-At", "-c", sql],
    {**ro, "PGPASSWORD": raw, "PGSSLMODE": "require"})
run("D: COPY count (como copy_out)", [psql, url, "-X", "-v", "ON_ERROR_STOP=1", "-c",
                                      f"COPY ({sql}) TO STDOUT"], ro)
