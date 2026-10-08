#!/usr/bin/env python3
"""Exporta los datos de Supabase (SOLO LECTURA) a database/[environments/<amb>/]aurora_postgresql_data.sql.

Envoltorio de export_data_sql.py (skill aws-project-migrator) que:
  - conecta por el pooler de Supabase en modo sesión (aws-1-<region>.pooler.supabase.com:5432), la vía que
    funciona desde esta red;
  - corrige el orden de argumentos de psql en Windows: ahí psql IGNORA las opciones que vienen después de la
    URL posicional ("extra command-line argument ... ignored"), así que la URL se mueve al final.
La contraseña se lee de ../.env.supabase y nunca se imprime.

    cd migration-output
    python deploy/tooling/export_supabase_data.py
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import urllib.parse
from pathlib import Path

MIGRATOR = Path.home() / ".claude" / "skills" / "aws-project-migrator" / "scripts"
CREDENTIALS = Path("../.env.supabase")
REGION = "us-east-2"
_real_run = subprocess.run


def _run_url_last(args, *a, **kw):
    """psql <url> <opciones...>  →  psql <opciones...> <url>  (y sin stdin, para que nunca espere un prompt)."""
    if isinstance(args, list) and len(args) > 2 and str(args[1]).startswith("postgresql://"):
        args = [args[0], *args[2:], args[1]]
        kw.setdefault("stdin", subprocess.DEVNULL)
        # datos con ₡, ñ, tildes: psql y Python en UTF-8 (en Windows el default es WIN1252/cp1252)
        kw["env"] = {**(kw.get("env") or os.environ), "PGCLIENTENCODING": "UTF8"}
        if kw.get("text"):
            kw["encoding"] = "utf-8"
    return _real_run(args, *a, **kw)


def main() -> int:
    sys.path.insert(0, str(MIGRATOR))
    from supabase_connect import load_credentials  # noqa: PLC0415

    creds = load_credentials(CREDENTIALS)
    secret = creds["SUPABASE_DB_PASSWORD"]
    ref = urllib.parse.urlparse(creds["SUPABASE_URL"]).hostname.split(".")[0]
    password = urllib.parse.quote(secret, safe="")
    os.environ["SOURCE_DATABASE_URL"] = (f"postgresql://postgres.{ref}:{password}@aws-1-{REGION}.pooler.supabase.com"
                                         ":5432/postgres?sslmode=require")
    import export_data_sql  # noqa: PLC0415

    export_data_sql.subprocess.run = _run_url_last
    try:
        code = export_data_sql.main(["--source", "db-url-env:SOURCE_DATABASE_URL",
                                     "--schema-json", ".discovery/supabase-schema.json", "--db", "database"])
    except Exception as error:  # noqa: BLE001 - se muestra sin la contraseña
        msg = str(error).replace(secret, "***").replace(password, "***")
        print("ERROR:", re.sub(r"postgresql://\S+", "postgresql://***", msg))
        return 1
    return int(code or 0)


if __name__ == "__main__":
    raise SystemExit(main())
