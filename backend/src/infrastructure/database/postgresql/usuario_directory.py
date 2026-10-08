"""Adapter PostgreSQL del directorio de usuarios (``tbl_usuarios``)."""

from __future__ import annotations

from uuid import UUID

import psycopg

from application.ports.usuarios import UsuarioDirectory
from domain.entities.usuario import Usuario

_COLUMNS = (
    "id, email, nombre, rol, iniciales, color, activo, telefono, whatsapp, tiene_cartera_asignada"
)
_BY_EMAIL_SQL = f"""
SELECT {_COLUMNS} FROM tbl_usuarios
WHERE lower(email) = lower(%s) AND activo = true
ORDER BY created_at
LIMIT 1
"""
_BY_ID_SQL = f"SELECT {_COLUMNS} FROM tbl_usuarios WHERE id = %s"
_ACTIVOS_SQL = f"SELECT {_COLUMNS} FROM tbl_usuarios WHERE activo = true ORDER BY nombre"
_ANALISTAS_CON_CARTERA_SQL = """
SELECT u.email, u.nombre FROM tbl_usuarios u
WHERE u.activo = true
  AND (u.rol = 'ANALISTA' OR (u.rol = 'ANALISTA_RIESGO' AND u.tiene_cartera_asignada = true))
  AND EXISTS (SELECT 1 FROM tbl_maestro_clientes m WHERE m.analista_email = u.email)
ORDER BY u.nombre
"""
_COUNT_SQL = "SELECT count(*) AS n FROM tbl_usuarios WHERE activo = true"
_ULTIMA_SYNC_SQL = """
SELECT ejecutado_en FROM tbl_sync_log WHERE tipo = 'cartera' ORDER BY ejecutado_en DESC LIMIT 1
"""
_GET_TOKEN_SQL = """
SELECT google_refresh_token FROM tbl_usuarios
WHERE lower(email) = lower(%s) AND google_refresh_token IS NOT NULL
LIMIT 1
"""
_SET_TOKEN_SQL = "UPDATE tbl_usuarios SET google_refresh_token = %s WHERE lower(email) = lower(%s)"


def _to_usuario(row: dict) -> Usuario:
    return Usuario(**row)


class PostgresUsuarioDirectory(UsuarioDirectory):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def find_activo_by_email(self, email: str) -> Usuario | None:
        with self._connection.cursor() as cursor:
            cursor.execute(_BY_EMAIL_SQL, (email,))
            row = cursor.fetchone()
        return _to_usuario(row) if row else None

    def find_by_id(self, usuario_id: UUID) -> Usuario | None:
        with self._connection.cursor() as cursor:
            cursor.execute(_BY_ID_SQL, (usuario_id,))
            row = cursor.fetchone()
        return _to_usuario(row) if row else None

    def list_activos(self) -> list[Usuario]:
        with self._connection.cursor() as cursor:
            cursor.execute(_ACTIVOS_SQL)
            return [_to_usuario(row) for row in cursor.fetchall()]

    def list_analistas_con_cartera(self) -> list[dict[str, str]]:
        with self._connection.cursor() as cursor:
            cursor.execute(_ANALISTAS_CON_CARTERA_SQL)
            return [dict(row) for row in cursor.fetchall()]

    def count_activos(self) -> int:
        with self._connection.cursor() as cursor:
            cursor.execute(_COUNT_SQL)
            return int(cursor.fetchone()["n"])

    def ultima_sync_cartera(self) -> str:
        with self._connection.cursor() as cursor:
            cursor.execute(_ULTIMA_SYNC_SQL)
            row = cursor.fetchone()
        return row["ejecutado_en"].isoformat() if row and row["ejecutado_en"] else ""

    def get_google_refresh_token(self, email: str) -> str | None:
        with self._connection.cursor() as cursor:
            cursor.execute(_GET_TOKEN_SQL, (email,))
            row = cursor.fetchone()
        return row["google_refresh_token"] if row else None

    def set_google_refresh_token(self, email: str, refresh_token: str) -> None:
        with self._connection.cursor() as cursor:
            cursor.execute(_SET_TOKEN_SQL, (refresh_token, email))
