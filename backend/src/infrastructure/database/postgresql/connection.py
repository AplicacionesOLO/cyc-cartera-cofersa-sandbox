"""Conexión a Aurora PostgreSQL (vía RDS Proxy) reutilizada entre invocaciones.

- Una conexión por contenedor Lambda, abierta en el primer uso (warm start la reutiliza).
- ``prepare_threshold=None``: sin prepared statements de servidor (evita session pinning
  en RDS Proxy).
- ``search_path`` NO se fija aquí: lo fija el provisioning por rol
  (``ALTER ROLE ... SET search_path``), así no se emiten ``SET`` de sesión.
- Credenciales leídas de Secrets Manager por nombre; si la autenticación falla (rotación)
  se invalida el cache y se reintenta una vez.
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

import psycopg
from psycopg.rows import dict_row

from shared.settings import DatabaseSettings


@dataclass(frozen=True)
class DatabaseCredentials:
    username: str
    password: str


class CredentialsProvider(Protocol):
    def __call__(self) -> DatabaseCredentials: ...

    def invalidate(self) -> None: ...


class SecretsManagerCredentials:
    """Credenciales desde un secreto JSON con ``username`` y ``password`` (formato RDS)."""

    def __init__(self, secrets: Any, secret_name: str) -> None:
        self._secrets = secrets
        self._secret_name = secret_name

    def __call__(self) -> DatabaseCredentials:
        data = self._secrets.get_json(self._secret_name)
        return DatabaseCredentials(username=data["username"], password=data["password"])

    def invalidate(self) -> None:
        self._secrets.invalidate(self._secret_name)


class StaticCredentials:
    """Solo para tests de integración locales."""

    def __init__(self, username: str, password: str) -> None:
        self._credentials = DatabaseCredentials(username, password)

    def __call__(self) -> DatabaseCredentials:
        return self._credentials

    def invalidate(self) -> None:
        return None


def _is_auth_failure(error: psycopg.OperationalError) -> bool:
    text = str(error).lower()
    return "password authentication failed" in text or "authentication failed" in text


class PostgresConnectionFactory:
    def __init__(
        self,
        settings: DatabaseSettings,
        credentials: CredentialsProvider,
        *,
        application_name: str = "lambda",
        connect: Callable[..., psycopg.Connection] = psycopg.connect,
    ) -> None:
        self._settings = settings
        self._credentials = credentials
        self._application_name = application_name
        self._connect_fn = connect
        self._connection: psycopg.Connection | None = None
        self._lock = threading.Lock()

    def get(self) -> psycopg.Connection:
        with self._lock:
            if self._connection is None or self._connection.closed or self._connection.broken:
                self._connection = self._open()
            return self._connection

    def reset(self) -> None:
        with self._lock:
            if self._connection is not None and not self._connection.closed:
                try:
                    self._connection.close()
                except psycopg.Error:
                    pass
            self._connection = None

    def _open(self) -> psycopg.Connection:
        try:
            return self._connect_with(self._credentials())
        except psycopg.OperationalError as error:
            if not _is_auth_failure(error):
                raise
            self._credentials.invalidate()
            return self._connect_with(self._credentials())

    def _connect_with(self, credentials: DatabaseCredentials) -> psycopg.Connection:
        return self._connect_fn(
            host=self._settings.host,
            port=self._settings.port,
            dbname=self._settings.name,
            user=credentials.username,
            password=credentials.password,
            sslmode=self._settings.sslmode,
            connect_timeout=self._settings.connect_timeout,
            application_name=self._application_name,
            autocommit=False,
            prepare_threshold=None,
            row_factory=dict_row,
        )
