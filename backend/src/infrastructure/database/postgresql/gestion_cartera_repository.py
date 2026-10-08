"""Adapter PostgreSQL de Gestión de Cartera (pedidos retenidos, saldos a favor, reportes de pago)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg
from psycopg import sql

from application.ports.gestion_cartera import GestionCarteraRepository

_PEDIDOS_RETENIDOS_SQL = "SELECT fn_pedidos_retenidos(p_email => %s) AS r"
_PEDIDO_EDITABLES = ("estado_sic", "resuelto_por", "resuelto_en", "motivo_retencion", "comentario_analista")
_UPDATE_PEDIDO_SQL = (
    "UPDATE tbl_pedidos_retenidos SET {sets}, updated_at = now() WHERE id_pedido = %s RETURNING *"
)

_SALDOS_FAVOR_SQL = "SELECT * FROM fn_saldos_favor(p_email => %s)"
_SALDOS_CLIENTE_SQL = """
SELECT id, contribuyente, cliente_cod, cliente_nombre, documento, tipo_documento, fecha_documento,
       fecha_vencimiento, monto, estado_manual, aplicado_por, aplicado_en
FROM tbl_saldos_favor
WHERE cliente_cod = %(cod)s
  AND (%(email)s::text IS NULL
       OR cliente_cod IN (SELECT m.cliente_cod FROM tbl_maestro_clientes m
                          WHERE m.analista_email = %(email)s))
ORDER BY fecha_documento ASC NULLS LAST
"""
_CLIENTE_DE_SALDO_SQL = "SELECT cliente_cod FROM tbl_saldos_favor WHERE id = %s"
_APLICAR_SALDO_SQL = """
UPDATE tbl_saldos_favor
SET estado_manual = 'aplicado', aplicado_por = %s, aplicado_en = now(), updated_at = now()
WHERE id = %s
"""
_MATCHING_SQL = "SELECT * FROM fn_matching_saldos_favor(p_cliente_cod => %s)"
_CLIENTES_ANALISTA_SQL = "SELECT DISTINCT cliente_cod FROM tbl_maestro_clientes WHERE analista_email = %s"

_EXISTE_REFERENCIA_SQL = "SELECT 1 AS x FROM tbl_reportes_pago WHERE referencia = %s LIMIT 1"
_INSERT_REPORTE_SQL = """
INSERT INTO tbl_reportes_pago (cliente_cod, contribuyente, analista_email, banco_origen, referencia,
  monto_transferido, fecha_transferencia, url_comprobante, notas, estado)
VALUES (%(cliente_cod)s, %(contribuyente)s, %(analista_email)s, %(banco_origen)s, %(referencia)s,
  %(monto_transferido)s, %(fecha_transferencia)s, %(url_comprobante)s, %(notas)s, %(estado)s)
RETURNING id
"""
_INSERT_DETALLE_SQL = """
INSERT INTO tbl_reporte_pago_detalles (reporte_id, factura_id, documento, monto_aplicado)
VALUES (%(reporte_id)s, %(factura_id)s, %(documento)s, %(monto_aplicado)s)
"""


class PostgresGestionCarteraRepository(GestionCarteraRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def _all(self, query: str, params: Any) -> list[dict[str, Any]]:
        with self._connection.cursor() as cursor:
            cursor.execute(query, params)
            return list(cursor.fetchall())

    def _one(self, query: Any, params: Any) -> dict[str, Any] | None:
        with self._connection.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchone()

    # ── Pedidos retenidos ───────────────────────────────────────────────
    def pedidos_retenidos(self, analista_email: str | None) -> dict[str, Any]:
        row = self._one(_PEDIDOS_RETENIDOS_SQL, (analista_email,))
        return (row or {}).get("r") or {"kpis": None, "rows": []}

    def actualizar_pedido_retenido(self, id_pedido: str, cambios: dict[str, Any]) -> dict[str, Any] | None:
        columnas = [c for c in _PEDIDO_EDITABLES if c in cambios]
        if not columnas:
            query = sql.SQL(
                "UPDATE tbl_pedidos_retenidos SET updated_at = now() WHERE id_pedido = %s RETURNING *"
            )
            return self._one(query, (id_pedido,))
        sets = sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(c)) for c in columnas)
        query = sql.SQL(_UPDATE_PEDIDO_SQL).format(sets=sets)
        return self._one(query, (*(cambios[c] for c in columnas), id_pedido))

    # ── Saldos a favor ──────────────────────────────────────────────────
    def saldos_favor(self, analista_email: str | None) -> list[dict[str, Any]]:
        return self._all(_SALDOS_FAVOR_SQL, (analista_email,))

    def saldos_favor_de_cliente(self, cliente_cod: str, analista_email: str | None) -> list[dict[str, Any]]:
        return self._all(_SALDOS_CLIENTE_SQL, {"cod": cliente_cod, "email": analista_email})

    def cliente_de_saldo_favor(self, saldo_id: UUID) -> str | None:
        row = self._one(_CLIENTE_DE_SALDO_SQL, (saldo_id,))
        return row["cliente_cod"] if row else None

    def marcar_saldo_aplicado(self, saldo_id: UUID, aplicado_por: str) -> bool:
        with self._connection.cursor() as cursor:
            cursor.execute(_APLICAR_SALDO_SQL, (aplicado_por, saldo_id))
            return cursor.rowcount > 0

    def matching_saldos_favor(self, cliente_cod: str | None) -> list[dict[str, Any]]:
        return self._all(_MATCHING_SQL, (cliente_cod,))

    def clientes_de_analista(self, analista_email: str) -> set[str]:
        return {r["cliente_cod"] for r in self._all(_CLIENTES_ANALISTA_SQL, (analista_email,))}

    # ── Reportes de pago ────────────────────────────────────────────────
    def existe_referencia_pago(self, referencia: str) -> bool:
        return self._one(_EXISTE_REFERENCIA_SQL, (referencia,)) is not None

    def crear_reporte_pago(self, reporte: dict[str, Any], detalles: list[dict[str, Any]]) -> UUID:
        with self._connection.cursor() as cursor:
            cursor.execute(_INSERT_REPORTE_SQL, reporte)
            reporte_id = cursor.fetchone()["id"]
            cursor.executemany(_INSERT_DETALLE_SQL, [{**d, "reporte_id": reporte_id} for d in detalles])
        return reporte_id
