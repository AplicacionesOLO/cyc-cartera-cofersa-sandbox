"""Fixtures de integración contra el esquema Aurora generado (PG efímero de validate_migration --run).

``TEST_DATABASE_URL`` apunta a la base del ambiente por defecto conectada como ``usr_<app>_app``.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from uuid import uuid4

import pytest

DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


def pytest_collection_modifyitems(config, items):
    if DATABASE_URL:
        return
    skip = pytest.mark.skip(reason="TEST_DATABASE_URL no definida")
    for item in items:
        if "integration" in str(item.fspath):
            item.add_marker(skip)


@pytest.fixture(scope="session")
def factory():
    import psycopg

    from infrastructure.database.postgresql.connection import PostgresConnectionFactory, StaticCredentials
    from shared.settings import DatabaseSettings

    info = psycopg.conninfo.conninfo_to_dict(DATABASE_URL)
    settings = DatabaseSettings(
        secret_name="unused",
        name=info["dbname"],
        host=info.get("host", "localhost"),
        port=int(info.get("port", 5432)),
        sslmode="disable",
        connect_timeout=5,
        schemas=(),
    )
    return PostgresConnectionFactory(settings, StaticCredentials(info["user"], info.get("password", "")))


@pytest.fixture
def uow(factory) -> Callable:
    """``with uow(principal) as u: ...`` (principal None = service_role, como los jobs)."""
    from infrastructure.database.postgresql.app_unit_of_work import AppPostgresUnitOfWork

    def make(principal=None):
        return AppPostgresUnitOfWork(factory, principal, role=None if principal else "service_role")

    return make


@pytest.fixture
def make_usuario(uow):
    """Inserta un usuario del SIC y devuelve (email, id)."""

    def make(rol: str = "ANALISTA", **extra):
        email = extra.pop("email", f"it-{uuid4().hex[:8]}@cofersa.cr")
        with uow() as u:
            with u.connection.cursor() as cur:
                cur.execute(
                    "INSERT INTO tbl_usuarios (email, nombre, rol, iniciales, tiene_cartera_asignada) "
                    "VALUES (%s, %s, %s, 'IT', %s) RETURNING id",
                    (
                        email,
                        extra.get("nombre", "Usuario IT"),
                        rol,
                        extra.get("tiene_cartera_asignada", False),
                    ),
                )
                usuario_id = cur.fetchone()["id"]
            u.commit()
        return email, usuario_id

    return make
