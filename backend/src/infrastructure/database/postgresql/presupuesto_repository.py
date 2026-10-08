"""Adapter PostgreSQL del Presupuesto de Cobro / Recuperación / Proyección (funciones ``fn_*`` de Aurora)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

import psycopg

from application.ports.presupuesto import PresupuestoRepository

_FROZEN_SQL = "SELECT fn_presupuesto_frozen(p_anio => %s, p_mes => %s) AS r"
_PREVIEW_SQL = "SELECT fn_presupuesto_preview(p_anio => %s, p_mes => %s) AS r"
_GUARDAR_SQL = "SELECT fn_presupuesto_guardar(p_anio => %s, p_mes => %s, p_email => %s) AS r"
_META_SQL = """
SELECT fn_presupuesto_meta(p_anio => %s, p_mes => %s, p_vendedor_cod => %s, p_meta => %s, p_email => %s) AS r
"""
_REASIGNAR_SQL = """
SELECT fn_presupuesto_reasignar(
  p_anio => %s, p_mes => %s, p_cliente_cod => %s, p_vendedor_cod => %s, p_email => %s
) AS r
"""
_VENDEDORES_SQL = "SELECT cod, nombre FROM tbl_vendedores WHERE activo = true ORDER BY nombre"
_VENDEDORES_ENVIO_SQL = "SELECT cod, nombre, email, activo FROM tbl_vendedores WHERE activo = true"
_SUPERVISORES_SQL = "SELECT email FROM tbl_supervisores WHERE activo = true"
_GRUPOS_SQL = "SELECT principal_cod FROM tbl_portafolio_grupos WHERE activo = true"
_MIEMBROS_SQL = "SELECT principal_cod, vendedor_cod, activo FROM tbl_portafolio_acotado"
_RECUPERACION_SQL = "SELECT fn_recuperacion(p_anio => %s, p_mes => %s) AS r"
_PROYECCION_SQL = "SELECT fn_proyeccion_cobro(p_semanas => %s, p_semanas_pasadas => %s) AS r"
_SIN_PAGO_SQL = "SELECT * FROM fn_sin_pago_cliente(p_anio => %s, p_mes => %s)"
_PPTO_CARTERA_SQL = """
SELECT COALESCE(SUM(ppto_cartera), 0) AS total FROM tbl_presupuesto_cobro WHERE anio = %s AND mes = %s
"""
_MOM_SQL = "SELECT fn_recuperacion_mom(p_meses => %s, p_email => %s) AS r"
_PERIODO_SQL = "SELECT fn_recuperacion_periodo(p_ini => %s, p_fin => %s, p_email => %s, p_group => %s) AS r"
_TRAMOS_SQL = "SELECT fn_recuperacion_tramos(p_ini => %s, p_fin => %s, p_email => %s, p_group => %s) AS r"
_META_ANALISTA_SQL = "SELECT fn_meta_analista_mes(p_email => %s, p_anio => %s, p_mes => %s) AS r"


class PostgresPresupuestoRepository(PresupuestoRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def _scalar(self, sql: str, params: tuple[Any, ...]) -> Any:
        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            row = cursor.fetchone()
        return row["r"] if row else None

    def _rows(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            return list(cursor.fetchall())

    def presupuesto_congelado(self, anio: int, mes: int) -> dict[str, Any]:
        return self._scalar(_FROZEN_SQL, (anio, mes)) or {"congelado": False}

    def presupuesto_estimado(self, anio: int, mes: int) -> dict[str, Any]:
        return self._scalar(_PREVIEW_SQL, (anio, mes)) or {}

    def congelar(self, anio: int, mes: int, email: str) -> dict[str, Any]:
        return self._scalar(_GUARDAR_SQL, (anio, mes, email)) or {"ok": True}

    def ajustar_meta(self, anio: int, mes: int, vendedor_cod: str, meta: int, email: str) -> dict[str, Any]:
        return self._scalar(_META_SQL, (anio, mes, vendedor_cod, meta, email)) or {"ok": True}

    def reasignar_cliente(
        self, anio: int, mes: int, cliente_cod: str, vendedor_cod: str, email: str
    ) -> dict[str, Any]:
        return self._scalar(_REASIGNAR_SQL, (anio, mes, cliente_cod, vendedor_cod, email)) or {"ok": True}

    def vendedores_activos(self) -> list[dict[str, Any]]:
        return self._rows(_VENDEDORES_SQL)

    def directorio_envio(self) -> dict[str, list[dict[str, Any]]]:
        return {
            "vendedores": self._rows(_VENDEDORES_ENVIO_SQL),
            "supervisores": self._rows(_SUPERVISORES_SQL),
            "grupos": self._rows(_GRUPOS_SQL),
            "miembros": self._rows(_MIEMBROS_SQL),
        }

    def recuperacion(self, anio: int, mes: int) -> dict[str, Any]:
        return self._scalar(_RECUPERACION_SQL, (anio, mes))

    def proyeccion(self, semanas: int, semanas_pasadas: int) -> dict[str, Any]:
        return self._scalar(_PROYECCION_SQL, (semanas, semanas_pasadas))

    def clientes_sin_pago(self, anio: int, mes: int) -> list[dict[str, Any]]:
        return self._rows(_SIN_PAGO_SQL, (anio, mes))

    def ppto_cartera_total(self, anio: int, mes: int) -> Decimal:
        rows = self._rows(_PPTO_CARTERA_SQL, (anio, mes))
        return rows[0]["total"] if rows else Decimal(0)

    def recuperacion_mom(self, meses: int, email: str | None) -> Any:
        return self._scalar(_MOM_SQL, (meses, email))

    def recuperacion_periodo(self, ini: date, fin: date, email: str | None, group: str) -> Any:
        return self._scalar(_PERIODO_SQL, (ini, fin, email, group))

    def recuperacion_tramos(self, ini: date, fin: date, email: str | None, group: str) -> Any:
        return self._scalar(_TRAMOS_SQL, (ini, fin, email, group))

    def meta_analista_mes(self, email: str, anio: int | None, mes: int | None) -> Decimal:
        value = self._scalar(_META_ANALISTA_SQL, (email, anio, mes))
        return value if value is not None else Decimal(0)
