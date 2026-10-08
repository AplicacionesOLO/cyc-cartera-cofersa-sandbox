"""Adapter PostgreSQL de notificaciones (``tbl_notificaciones``) y respaldo del tipo de cambio."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg

from application.ports.notificaciones import NotificacionesRepository

_LIST_SQL = """
SELECT id, usuario_id, tipo, titulo, mensaje, leida, link, created_at
FROM tbl_notificaciones
WHERE usuario_id = %s
ORDER BY created_at DESC
LIMIT %s
"""
_MARCAR_LEIDA_SQL = "UPDATE tbl_notificaciones SET leida = true WHERE id = %s AND usuario_id = %s"
_MARCAR_TODAS_SQL = "UPDATE tbl_notificaciones SET leida = true WHERE usuario_id = %s AND leida = false"
_LEER_CONFIG_SQL = "SELECT clave, valor FROM tbl_config_sistema WHERE clave = ANY(%s)"
_UPSERT_CONFIG_SQL = """
INSERT INTO tbl_config_sistema (clave, valor) VALUES (%s, %s)
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor
"""


class PostgresNotificacionesRepository(NotificacionesRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def list_por_usuario(self, usuario_id: UUID, limit: int) -> list[dict[str, Any]]:
        with self._connection.cursor() as cursor:
            cursor.execute(_LIST_SQL, (usuario_id, limit))
            return list(cursor.fetchall())

    def marcar_leida(self, usuario_id: UUID, notificacion_id: UUID) -> bool:
        with self._connection.cursor() as cursor:
            cursor.execute(_MARCAR_LEIDA_SQL, (notificacion_id, usuario_id))
            return cursor.rowcount > 0

    def marcar_todas_leidas(self, usuario_id: UUID) -> int:
        with self._connection.cursor() as cursor:
            cursor.execute(_MARCAR_TODAS_SQL, (usuario_id,))
            return cursor.rowcount

    def leer_config(self, claves: tuple[str, ...]) -> dict[str, str]:
        with self._connection.cursor() as cursor:
            cursor.execute(_LEER_CONFIG_SQL, (list(claves),))
            return {row["clave"]: row["valor"] for row in cursor.fetchall()}

    def guardar_config(self, valores: dict[str, str]) -> None:
        with self._connection.cursor() as cursor:
            cursor.executemany(_UPSERT_CONFIG_SQL, list(valores.items()))
