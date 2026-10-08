"""Adapter PostgreSQL de promesas de pago (``tbl_promesas``)."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from application.ports.promesas import PromesasRepository
from domain.entities.promesas import COLUMNAS_ACTUALIZABLES, NuevaPromesa

_COLUMNS = (
    "id, cliente_cod, contribuyente, analista_email, fecha_creacion, monto, fecha_promesa, estado, notas, "
    "updated_at, activo, gestion_id, reprogramada_de_id, fecha_validacion, validado_por, "
    "comentario_validacion, monto_abono_parcial, cliente_nombre, eventos"
)
# `.neq('activo', false)` de PostgREST = `activo <> false` (excluye también NULL).
_LIST_SQL = f"""
SELECT {_COLUMNS} FROM tbl_promesas
WHERE activo <> false AND (%(email)s::text IS NULL OR analista_email = %(email)s::text)
ORDER BY fecha_promesa ASC, id
LIMIT %(limit)s
"""
_GESTIONES_ORIGEN_SQL = (
    "SELECT id, resultado, nota, tipo, fecha FROM tbl_gestiones WHERE id = ANY(%s::uuid[])"
)
_GET_FOR_UPDATE_SQL = f"SELECT {_COLUMNS} FROM tbl_promesas WHERE id = %s FOR UPDATE"
_EXISTE_PENDIENTE_SQL = """
SELECT 1 FROM tbl_promesas
WHERE cliente_cod = %s AND monto = %s AND fecha_promesa = %s AND estado = 'PENDIENTE'
LIMIT 1
"""
_INSERT_SQL = """
INSERT INTO tbl_promesas (
  cliente_cod, cliente_nombre, contribuyente, analista_email, fecha_creacion, fecha_promesa, monto,
  estado, notas, gestion_id, reprogramada_de_id, eventos
) VALUES (
  %(cliente_cod)s, %(cliente_nombre)s, %(contribuyente)s, %(analista_email)s, %(fecha_creacion)s,
  %(fecha_promesa)s, %(monto)s, %(estado)s, %(notas)s, %(gestion_id)s, %(reprogramada_de_id)s, %(eventos)s
)
RETURNING id
"""


class PostgresPromesasRepository(PromesasRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def list_activas(self, analista_email: str | None, limit: int) -> list[dict[str, Any]]:
        with self._connection.cursor() as cursor:
            cursor.execute(_LIST_SQL, {"email": analista_email, "limit": limit})
            return [dict(row) for row in cursor.fetchall()]

    def gestiones_origen(self, gestion_ids: list[UUID]) -> list[dict[str, Any]]:
        with self._connection.cursor() as cursor:
            cursor.execute(_GESTIONES_ORIGEN_SQL, ([str(g) for g in gestion_ids],))
            return [dict(row) for row in cursor.fetchall()]

    def get_for_update(self, promesa_id: UUID) -> dict[str, Any] | None:
        with self._connection.cursor() as cursor:
            cursor.execute(_GET_FOR_UPDATE_SQL, (promesa_id,))
            row = cursor.fetchone()
        return dict(row) if row else None

    def existe_pendiente(self, cliente_cod: str, monto: float, fecha_promesa: date) -> bool:
        with self._connection.cursor() as cursor:
            cursor.execute(_EXISTE_PENDIENTE_SQL, (cliente_cod, monto, fecha_promesa))
            return cursor.fetchone() is not None

    def insert(self, promesa: NuevaPromesa) -> UUID:
        params = {
            "cliente_cod": promesa.cliente_cod,
            "cliente_nombre": promesa.cliente_nombre,
            "contribuyente": promesa.contribuyente,
            "analista_email": promesa.analista_email,
            "fecha_creacion": promesa.fecha_creacion,
            "fecha_promesa": promesa.fecha_promesa,
            "monto": promesa.monto,
            "estado": promesa.estado,
            "notas": promesa.notas,
            "gestion_id": promesa.gestion_id,
            "reprogramada_de_id": promesa.reprogramada_de_id,
            "eventos": Jsonb(list(promesa.eventos)),
        }
        with self._connection.cursor() as cursor:
            cursor.execute(_INSERT_SQL, params)
            return cursor.fetchone()["id"]

    def update(self, promesa_id: UUID, changes: dict[str, Any]) -> None:
        columns = [name for name in COLUMNAS_ACTUALIZABLES if name in changes]
        if not columns:
            return
        values = [Jsonb(changes[n]) if n == "eventos" else changes[n] for n in columns]
        query = sql.SQL("UPDATE tbl_promesas SET {}, updated_at = now() WHERE id = %s").format(
            sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(name)) for name in columns)
        )
        with self._connection.cursor() as cursor:
            cursor.execute(query, [*values, promesa_id])
