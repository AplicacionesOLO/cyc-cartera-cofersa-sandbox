"""Integración real contra PostgreSQL. Se ejecuta solo si TEST_DATABASE_URL está definida."""

import os
from uuid import UUID

import pytest

pytestmark = pytest.mark.integration

DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
if not DATABASE_URL:
    pytest.skip("TEST_DATABASE_URL no definida", allow_module_level=True)

import psycopg  # noqa: E402

from application.dto.principal import Principal  # noqa: E402
from domain.exceptions import ConflictError  # noqa: E402
from infrastructure.database.postgresql.connection import (  # noqa: E402
    PostgresConnectionFactory,
    StaticCredentials,
)
from infrastructure.database.postgresql.unit_of_work import PostgresUnitOfWork  # noqa: E402
from shared.settings import DatabaseSettings  # noqa: E402


def _factory():
    info = psycopg.conninfo.conninfo_to_dict(DATABASE_URL)
    settings = DatabaseSettings(
        secret_name="unused",
        name=info.get("dbname", "postgres"),
        host=info.get("host", "localhost"),
        port=int(info.get("port", 5432)),
        sslmode=info.get("sslmode", "prefer"),
        connect_timeout=5,
        schemas=(),
    )
    return PostgresConnectionFactory(
        settings, StaticCredentials(info.get("user", "postgres"), info.get("password", ""))
    )


def test_session_context_and_commit_and_translation():
    factory = _factory()
    conn = factory.get()
    with conn.cursor() as cur:
        # tabla temporal: el usuario de la app no tiene DDL (rol rw) pero sí TEMPORARY
        cur.execute("CREATE TEMP TABLE IF NOT EXISTS uow_probe (id int primary key)")
        cur.execute("TRUNCATE uow_probe")
    conn.commit()

    principal = Principal(subject="s", email="e@x.com", user_id=UUID(int=7))
    with PostgresUnitOfWork(factory, principal) as uow:
        with uow.connection.cursor() as cur:
            cur.execute("SELECT current_setting('app.user_id') AS uid, current_setting('app.role') AS r")
            row = cur.fetchone()
            cur.execute("INSERT INTO uow_probe VALUES (1)")
        uow.commit()
    assert row == {"uid": str(UUID(int=7)), "r": "authenticated"}

    with pytest.raises(ConflictError):
        with PostgresUnitOfWork(factory) as uow:
            with uow.connection.cursor() as cur:
                cur.execute("INSERT INTO uow_probe VALUES (1)")
            uow.commit()

    # la conexión sigue usable y el contexto no se filtra entre transacciones
    with PostgresUnitOfWork(factory) as uow:
        with uow.connection.cursor() as cur:
            cur.execute("SELECT current_setting('app.user_id', true) AS uid")
            assert cur.fetchone()["uid"] == ""
