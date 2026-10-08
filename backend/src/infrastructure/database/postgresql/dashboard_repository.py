"""Adapter PostgreSQL del Dashboard y de la Cola del día (solo lecturas)."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

import psycopg

from application.ports.dashboard import DashboardRepository, Row

_KPIS_CARTERA_SQL = "SELECT * FROM fn_get_kpis_cartera()"
_VENTAS_SQL = """
SELECT anio, mes, total_ventas_sin_iva, cartera_total_mes FROM tbl_ventas_mensuales
ORDER BY anio ASC, mes ASC
"""
_ANALISTAS_SQL = """
SELECT id, nombre, email, iniciales, color FROM tbl_usuarios
WHERE activo = true
  AND (rol = 'ANALISTA' OR (rol = 'ANALISTA_RIESGO' AND tiene_cartera_asignada = true))
"""
_CONTEO_GESTIONES_SQL = """
SELECT analista_email,
       count(*) FILTER (WHERE fecha = %(hoy)s)              AS g_hoy,
       count(*) FILTER (WHERE fecha >= %(semana)s)          AS g_semana,
       count(*) FILTER (WHERE fecha >= %(mes)s)             AS g_mes
FROM tbl_gestiones
WHERE fecha >= LEAST(%(semana)s::date, %(mes)s::date)
GROUP BY analista_email
"""
_RECUPERACION_SQL = "SELECT fn_recuperacion(p_anio => %s, p_mes => %s) AS r"
_HISTORICO_SQL = """
SELECT fecha, cartera_total, mora_total, mora_31_plus, pct_mora, pct_mora_31, n_en_mora
FROM tbl_historico_cartera ORDER BY fecha DESC LIMIT %s
"""
_PEDIDOS_RETENIDOS_SQL = "SELECT fn_pedidos_retenidos(p_email => %s) AS r"
_CONFIG_SQL = "SELECT valor FROM tbl_config_sistema WHERE clave = %s LIMIT 1"
_KPIS_ANALISTA_SQL = "SELECT fn_dashboard_analista_kpis(p_email => %s) AS r"
_VENDEDORES_SQL = "SELECT * FROM fn_dashboard_vendedores_analista(p_email => %s)"
_AGENDA_GESTIONES_SQL = """
SELECT g.id, g.cliente_cod, g.proxima_accion, g.proxima_accion_fecha,
       (SELECT m.cliente_nombre FROM tbl_maestro_clientes m
         WHERE m.cliente_cod = g.cliente_cod ORDER BY m.id DESC LIMIT 1) AS cliente_nombre
FROM tbl_gestiones g
WHERE g.analista_email = %s AND g.proxima_accion_fecha = ANY(%s) AND g.activo = true
ORDER BY g.proxima_accion_fecha ASC
LIMIT %s
"""
_AGENDA_PROMESAS_SQL = """
SELECT id, cliente_nombre, cliente_cod, fecha_promesa, monto FROM tbl_promesas
WHERE analista_email = %s AND estado = 'PENDIENTE' AND fecha_promesa = ANY(%s)
ORDER BY fecha_promesa ASC
LIMIT %s
"""
_PROMESAS_PENDIENTES_SQL = """
SELECT id, cliente_nombre, cliente_cod, monto, fecha_promesa, estado, monto_abono_parcial
FROM tbl_promesas
WHERE analista_email = %s AND estado = 'PENDIENTE' AND activo = true
ORDER BY fecha_promesa ASC
LIMIT %s
"""
_TAREAS_SQL = """
SELECT id, titulo, mensaje, link, created_at FROM tbl_notificaciones
WHERE usuario_id = %s AND tipo = 'ALERTA' AND titulo ILIKE %s AND leida = false
ORDER BY created_at DESC
LIMIT %s
"""
_TAREAS_PATRON = "Sin gestión ≥%"
_CLIENTES_ANALISTA_SQL = "SELECT cliente_cod FROM tbl_maestro_clientes WHERE analista_email = %s"
_ULTIMO_SYNC_SQL = "SELECT sync_id FROM tbl_cartera ORDER BY updated_at DESC LIMIT 1"
_CARTERA_SQL = "SELECT * FROM tbl_cartera WHERE cliente_cod = ANY(%s)"
_CARTERA_SYNC_SQL = "SELECT * FROM tbl_cartera WHERE cliente_cod = ANY(%s) AND sync_id = %s"
_GESTIONES_CLIENTES_SQL = """
SELECT cliente_cod, fecha, proxima_accion, proxima_accion_fecha FROM tbl_gestiones
WHERE cliente_cod = ANY(%s)
ORDER BY fecha DESC, created_at DESC
"""
_PROMESAS_CLIENTES_SQL = """
SELECT cliente_cod, fecha_promesa, monto FROM tbl_promesas
WHERE cliente_cod = ANY(%s) AND estado = 'PENDIENTE'
ORDER BY fecha_promesa ASC
"""
_CUMPLIDAS_SQL = """
SELECT COALESCE(SUM(monto), 0) AS total FROM tbl_promesas
WHERE cliente_cod = ANY(%s) AND estado = 'CUMPLIDA' AND updated_at >= %s
"""
_ICP_SQL = "SELECT cliente_cod, icp_score FROM vw_icp_por_cliente WHERE cliente_cod = ANY(%s)"
_PAGOS_SQL = """
SELECT cliente_cod, fecha_pago, monto_pago FROM tbl_pagos
WHERE cliente_cod = ANY(%s) AND fecha_pago >= %s
"""


class PostgresDashboardRepository(DashboardRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def _all(self, sql: str, params: Any = None) -> list[Row]:
        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            return [dict(row) for row in cursor.fetchall()]

    def _one(self, sql: str, params: Any = None) -> Row | None:
        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            row = cursor.fetchone()
        return dict(row) if row else None

    def _json(self, sql: str, params: Any) -> Row | None:
        row = self._one(sql, params)
        return row["r"] if row else None

    # ── Dashboard coordinador ───────────────────────────────────────────
    def kpis_cartera(self) -> list[Row]:
        return self._all(_KPIS_CARTERA_SQL)

    def ventas_mensuales(self) -> list[Row]:
        return self._all(_VENTAS_SQL)

    def analistas_elegibles(self) -> list[Row]:
        return self._all(_ANALISTAS_SQL)

    def conteo_gestiones_por_analista(self, hoy: date, inicio_semana: date, inicio_mes: date) -> list[Row]:
        return self._all(_CONTEO_GESTIONES_SQL, {"hoy": hoy, "semana": inicio_semana, "mes": inicio_mes})

    def recuperacion(self, anio: int, mes: int) -> Row | None:
        return self._json(_RECUPERACION_SQL, (anio, mes))

    def historico_cartera(self, limite: int) -> list[Row]:
        return self._all(_HISTORICO_SQL, (limite,))

    # ── Compartido ──────────────────────────────────────────────────────
    def pedidos_retenidos(self, analista_email: str | None) -> Row | None:
        return self._json(_PEDIDOS_RETENIDOS_SQL, (analista_email,))

    def config_valor(self, clave: str) -> str | None:
        row = self._one(_CONFIG_SQL, (clave,))
        return row["valor"] if row else None

    # ── Dashboard analista ──────────────────────────────────────────────
    def kpis_analista(self, analista_email: str) -> Row | None:
        return self._json(_KPIS_ANALISTA_SQL, (analista_email,))

    def vendedores_analista(self, analista_email: str) -> list[Row]:
        return self._all(_VENDEDORES_SQL, (analista_email,))

    def agenda_gestiones(self, analista_email: str, fechas: list[date], limite: int) -> list[Row]:
        return self._all(_AGENDA_GESTIONES_SQL, (analista_email, fechas, limite))

    def agenda_promesas(self, analista_email: str, fechas: list[date], limite: int) -> list[Row]:
        return self._all(_AGENDA_PROMESAS_SQL, (analista_email, fechas, limite))

    def promesas_pendientes(self, analista_email: str, limite: int) -> list[Row]:
        return self._all(_PROMESAS_PENDIENTES_SQL, (analista_email, limite))

    def tareas_sugeridas(self, usuario_id: UUID, limite: int) -> list[Row]:
        return self._all(_TAREAS_SQL, (usuario_id, _TAREAS_PATRON, limite))

    # ── Cola del día ────────────────────────────────────────────────────
    def clientes_de_analista(self, analista_email: str) -> list[str]:
        return [r["cliente_cod"] for r in self._all(_CLIENTES_ANALISTA_SQL, (analista_email,))]

    def ultimo_sync_cartera(self) -> str | None:
        row = self._one(_ULTIMO_SYNC_SQL)
        return row["sync_id"] if row else None

    def cartera_de_clientes(self, codigos: list[str], sync_id: str | None) -> list[Row]:
        if sync_id:
            return self._all(_CARTERA_SYNC_SQL, (codigos, sync_id))
        return self._all(_CARTERA_SQL, (codigos,))

    def gestiones_de_clientes(self, codigos: list[str]) -> list[Row]:
        return self._all(_GESTIONES_CLIENTES_SQL, (codigos,))

    def promesas_pendientes_de_clientes(self, codigos: list[str]) -> list[Row]:
        return self._all(_PROMESAS_CLIENTES_SQL, (codigos,))

    def monto_promesas_cumplidas(self, codigos: list[str], desde: date) -> float:
        row = self._one(_CUMPLIDAS_SQL, (codigos, desde))
        return float(row["total"]) if row else 0.0

    def icp_de_clientes(self, codigos: list[str]) -> dict[str, float]:
        return {r["cliente_cod"]: float(r["icp_score"] or 0) for r in self._all(_ICP_SQL, (codigos,))}

    def pagos_desde(self, codigos: list[str], desde: date) -> list[Row]:
        return self._all(_PAGOS_SQL, (codigos, desde))
