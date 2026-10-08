"""UnitOfWork PostgreSQL: una transacción por caso de uso + contexto de sesión.

En cada transacción se fijan (con ``set_config(..., true)``, locales a la transacción):
- ``app.user_id``   → id de ``tbl_app_users`` del principal (o vacío)
- ``app.role``      → ``authenticated`` | ``anon`` | ``service_role``
- ``app.email``     → email del principal
- ``app.jwt_claims``→ claims del token (JSON)

Las funciones ``fn_auth_uid()``, ``fn_auth_role()``, ``fn_auth_email()`` y
``fn_auth_jwt()`` generadas en Aurora leen estos valores, preservando la semántica de
``auth.uid()`` & cía. del origen en defaults, funciones y políticas.

Cada proyecto hereda y construye sus repositories en ``_build_repositories``.
"""

from __future__ import annotations

import json
from typing import Any

import psycopg

from application.dto.principal import Principal
from application.ports.unit_of_work import UnitOfWork
from infrastructure.database.postgresql.connection import PostgresConnectionFactory
from infrastructure.database.postgresql.errors import translate_db_error

_SESSION_CONTEXT_SQL = (
    "SELECT set_config('app.user_id', %s, true), set_config('app.role', %s, true), "
    "set_config('app.email', %s, true), set_config('app.jwt_claims', %s, true)"
)


class PostgresUnitOfWork(UnitOfWork):
    def __init__(
        self,
        connection_factory: PostgresConnectionFactory,
        principal: Principal | None = None,
        *,
        role: str | None = None,
    ) -> None:
        super().__init__()
        self._factory = connection_factory
        self._principal = principal
        self._role = role or ("authenticated" if principal else "anon")
        self.connection: psycopg.Connection | None = None

    def _begin(self) -> None:
        try:
            self.connection = self._factory.get()
            self._set_session_context(self.connection)
        except psycopg.OperationalError:
            # conexión caducada entre invocaciones (idle timeout del proxy): reabrir una vez
            self._factory.reset()
            self.connection = self._factory.get()
            self._set_session_context(self.connection)
        self._build_repositories(self.connection)

    def _set_session_context(self, connection: psycopg.Connection) -> None:
        principal = self._principal
        claims: dict[str, Any] = dict(principal.claims) if principal else {}
        with connection.cursor() as cursor:
            cursor.execute(
                _SESSION_CONTEXT_SQL,
                (
                    str(principal.user_id) if principal and principal.user_id else "",
                    self._role,
                    (principal.email or "") if principal else "",
                    json.dumps(claims, default=str),
                ),
            )

    def _build_repositories(self, connection: psycopg.Connection) -> None:
        """Override: crear aquí los repositories del proyecto con ``connection``."""

    def _commit(self) -> None:
        assert self.connection is not None
        self.connection.commit()

    def _rollback(self) -> None:
        if self.connection is None or self.connection.closed:
            return
        try:
            self.connection.rollback()
        except psycopg.OperationalError:
            self._factory.reset()

    def _translate_error(self, exc: BaseException) -> BaseException | None:
        if isinstance(exc, psycopg.OperationalError):
            self._factory.reset()
        return translate_db_error(exc)
