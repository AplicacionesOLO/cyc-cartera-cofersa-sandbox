"""Adapter PostgreSQL de gestiones (``tbl_gestiones``) y notas rápidas (``tbl_notas_rapidas``)."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from application.ports.gestiones import GestionesRepository
from domain.entities.gestiones import COLUMNAS_EDITABLES, NuevaGestion

_COLUMNS = (
    "id, cliente_cod, contribuyente, analista_email, fecha, hora, tipo, resultado, nota, promesa_fecha, "
    "promesa_monto, created_at, activo, proxima_accion, proxima_accion_fecha, promesa_id, metadata, "
    "archived, legacy"
)
# Mismo filtro que el `.eq('analista_email', userEmail)` del origen; NULL = todas (coordinador).
_SCOPE = "(%(email)s::text IS NULL OR g.analista_email = %(email)s::text)"

_LIST_SQL = f"""
SELECT {_COLUMNS} FROM tbl_gestiones g
WHERE {_SCOPE}
ORDER BY g.fecha DESC, g.hora DESC, g.id DESC
OFFSET %(offset)s LIMIT %(limit)s
"""
_SOLICITUDES_SQL = f"""
SELECT s.gestion_id, s.estado FROM tbl_solicitudes s
WHERE s.gestion_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM tbl_gestiones g WHERE g.id = s.gestion_id AND {_SCOPE})
"""
_PROMESA_ESTADOS_SQL = f"""
SELECT p.id, p.estado FROM tbl_promesas p
WHERE p.id IN (SELECT g.promesa_id FROM tbl_gestiones g WHERE g.promesa_id IS NOT NULL AND {_SCOPE})
"""
_NOMBRES_SQL = f"""
SELECT m.cliente_cod, m.cliente_nombre FROM tbl_maestro_clientes m
WHERE m.cliente_cod IN (SELECT g.cliente_cod FROM tbl_gestiones g WHERE {_SCOPE})
ORDER BY m.id
"""
_CODS_CARTERA_SQL = f"""
SELECT DISTINCT c.cliente_cod FROM tbl_cartera c
WHERE c.cliente_cod IN (SELECT g.cliente_cod FROM tbl_gestiones g WHERE {_SCOPE})
"""
_DUENO_SQL = "SELECT analista_email FROM tbl_gestiones WHERE id = %s"
_DESACTIVAR_SQL = "UPDATE tbl_gestiones SET activo = false WHERE id = %s"
_INSERT_SQL = """
INSERT INTO tbl_gestiones (
  cliente_cod, contribuyente, analista_email, fecha, hora, tipo, resultado, nota,
  proxima_accion, proxima_accion_fecha, metadata, promesa_fecha, promesa_monto, legacy, archived
) VALUES (
  %(cliente_cod)s, %(contribuyente)s, %(analista_email)s, %(fecha)s, %(hora)s, %(tipo)s, %(resultado)s,
  %(nota)s, %(proxima_accion)s, %(proxima_accion_fecha)s, %(metadata)s, %(promesa_fecha)s,
  COALESCE(%(promesa_monto)s, 0), false, false
)
RETURNING id
"""
_VINCULAR_SQL = "UPDATE tbl_gestiones SET promesa_id = %s WHERE id = %s"
_NOMBRE_CLIENTE_SQL = """
SELECT cliente_nombre FROM tbl_maestro_clientes WHERE cliente_cod = %s ORDER BY id LIMIT 1
"""
_CODIGOS_CONTRIBUYENTE_SQL = """
SELECT cliente_cod, cliente_nombre FROM tbl_maestro_clientes
WHERE contribuyente = %s AND (%s::text IS NULL OR cliente_cod <> %s::text)
ORDER BY cliente_cod
"""
_GET_NOTA_SQL = "SELECT contenido, updated_at FROM tbl_notas_rapidas WHERE usuario_id = %s AND fecha = %s"
_UPSERT_NOTA_SQL = """
INSERT INTO tbl_notas_rapidas (usuario_id, fecha, contenido) VALUES (%s, %s, %s)
ON CONFLICT (usuario_id, fecha) DO UPDATE SET contenido = EXCLUDED.contenido
"""


class PostgresGestionesRepository(GestionesRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def _all(self, query: str, params: Any = None) -> list[dict[str, Any]]:
        with self._connection.cursor() as cursor:
            cursor.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

    def _one(self, query: str, params: Any = None) -> dict[str, Any] | None:
        with self._connection.cursor() as cursor:
            cursor.execute(query, params)
            row = cursor.fetchone()
        return dict(row) if row else None

    def list_gestiones(self, analista_email: str | None, offset: int, limit: int) -> list[dict[str, Any]]:
        return self._all(_LIST_SQL, {"email": analista_email, "offset": offset, "limit": limit})

    def referencias(self, analista_email: str | None) -> dict[str, Any]:
        scope = {"email": analista_email}
        nombres: dict[str, str] = {}
        for row in self._all(_NOMBRES_SQL, scope):
            nombres[row["cliente_cod"]] = row["cliente_nombre"]
        return {
            "solicitudes": self._all(_SOLICITUDES_SQL, scope),
            "promesa_estados": {str(r["id"]): r["estado"] for r in self._all(_PROMESA_ESTADOS_SQL, scope)},
            "nombres_cliente": nombres,
            "cods_con_cartera": [r["cliente_cod"] for r in self._all(_CODS_CARTERA_SQL, scope)],
        }

    def find_analista_email(self, gestion_id: UUID) -> str | None:
        row = self._one(_DUENO_SQL, (gestion_id,))
        return row["analista_email"] if row else None

    def update_gestion(self, gestion_id: UUID, changes: dict[str, Any]) -> None:
        columns = [name for name in COLUMNAS_EDITABLES if name in changes]
        if not columns:
            return
        query = sql.SQL("UPDATE tbl_gestiones SET {} WHERE id = %s").format(
            sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(name)) for name in columns)
        )
        with self._connection.cursor() as cursor:
            cursor.execute(query, [*(changes[name] for name in columns), gestion_id])

    def desactivar_gestion(self, gestion_id: UUID) -> None:
        with self._connection.cursor() as cursor:
            cursor.execute(_DESACTIVAR_SQL, (gestion_id,))

    def insert_gestion(self, gestion: NuevaGestion) -> UUID:
        params = {
            "cliente_cod": gestion.cliente_cod,
            "contribuyente": gestion.contribuyente,
            "analista_email": gestion.analista_email,
            "fecha": gestion.fecha,
            "hora": gestion.hora,
            "tipo": gestion.tipo,
            "resultado": gestion.resultado,
            "nota": gestion.nota,
            "proxima_accion": gestion.proxima_accion,
            "proxima_accion_fecha": gestion.proxima_accion_fecha,
            "metadata": Jsonb(gestion.metadata) if gestion.metadata is not None else None,
            "promesa_fecha": gestion.promesa_fecha,
            "promesa_monto": gestion.promesa_monto,
        }
        return self._one(_INSERT_SQL, params)["id"]

    def vincular_promesa(self, gestion_id: UUID, promesa_id: UUID) -> None:
        with self._connection.cursor() as cursor:
            cursor.execute(_VINCULAR_SQL, (promesa_id, gestion_id))

    def nombre_cliente(self, cliente_cod: str) -> str | None:
        row = self._one(_NOMBRE_CLIENTE_SQL, (cliente_cod,))
        return row["cliente_nombre"] if row else None

    def codigos_contribuyente(self, contribuyente: str, excluir_cod: str | None) -> list[dict[str, str]]:
        return self._all(_CODIGOS_CONTRIBUYENTE_SQL, (contribuyente, excluir_cod, excluir_cod))

    def get_nota_rapida(self, usuario_id: UUID, fecha: date) -> dict[str, Any] | None:
        return self._one(_GET_NOTA_SQL, (usuario_id, fecha))

    def save_nota_rapida(self, usuario_id: UUID, fecha: date, contenido: str) -> None:
        with self._connection.cursor() as cursor:
            cursor.execute(_UPSERT_NOTA_SQL, (usuario_id, fecha, contenido))
