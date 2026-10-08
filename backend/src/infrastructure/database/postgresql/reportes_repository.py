"""Adapter PostgreSQL del módulo Reportes (RPC fn_reporte_* y consultas de apoyo del Hub)."""

from __future__ import annotations

from datetime import date
from typing import Any

import psycopg

from application.ports.reportes import ReportesRepository, Row

_AGING_SQL = "SELECT fn_reporte_aging() AS r"
_CEI_SQL = "SELECT fn_reporte_cei(p_anio => %s, p_mes => %s) AS r"
_SNAPSHOT_CIERRE_SQL = (
    "SELECT fn_snapshot_cierre_cartera(p_anio => %s, p_mes => %s, p_provisional => %s, "
    "p_generado_por => %s) AS r"
)
_EFECTIVIDAD_SQL = "SELECT fn_reporte_efectividad(p_ini => %s, p_fin => %s, p_email => %s) AS r"
_PERFIL_VENDEDOR_SQL = (
    "SELECT fn_analisis_perfil_vendedor(p_email => NULL, p_meses => %s, p_orden => %s) AS r"
)
_MIGRACION_SQL = (
    "SELECT fn_reporte_migracion_mora(p_anio => %s, p_mes => %s, p_supervisor_cod => %s, "
    "p_vendedor_cod => %s) AS r"
)
_SUPERVISORES_SQL = "SELECT cod, nombre FROM tbl_supervisores"
_VENDEDORES_ACTIVOS_SQL = "SELECT cod, nombre, supervisor_cod FROM tbl_vendedores WHERE activo = true"

_MORA_VENDEDOR_SQL = "SELECT fn_reporte_mora_vendedor(p_email => %s) AS r"
_SNAPSHOT_BLOQUEADOS_SQL = "SELECT fn_snapshot_bloqueados_semana() AS r"
_BLOQUEADOS_SQL = "SELECT fn_reporte_bloqueados(p_email => %s) AS r"
_PLAZO_ESPECIAL_SQL = "SELECT fn_reporte_plazo_especial(p_email => %s) AS r"
_PORTAFOLIO_DEST_SQL = "SELECT fn_portafolio_destinatarios() AS r"
_DIMENSION_SQL = {
    "dimension": "SELECT DISTINCT dimension AS v FROM tbl_maestro_clientes "
    "WHERE dimension IS NOT NULL AND dimension <> '' ORDER BY 1",
    "agrupacion": "SELECT DISTINCT agrupacion AS v FROM tbl_maestro_clientes "
    "WHERE agrupacion IS NOT NULL AND agrupacion <> '' ORDER BY 1",
}

_KPIS_CARTERA_SQL = "SELECT * FROM fn_get_kpis_cartera()"
_VENTAS_SQL = (
    "SELECT anio, mes, total_ventas_sin_iva, cartera_total_mes FROM tbl_ventas_mensuales "
    "ORDER BY anio ASC, mes ASC"
)
_CONCENTRACION_SQL = "SELECT fn_analisis_concentracion() AS r"
_RECUP_MOM_SQL = "SELECT fn_recuperacion_mom(p_meses => %s, p_email => %s) AS r"
_HISTORICO_SQL = (
    "SELECT fecha, cartera_total, mora_total, mora_31_plus, pct_mora, pct_mora_31, n_en_mora "
    "FROM tbl_historico_cartera ORDER BY fecha ASC LIMIT %s"
)

_CIERRE_MESES_SQL = "SELECT * FROM fn_cierre_mensual_meses()"
_VENDEDORES_ZONA_SQL = "SELECT cod, nombre, zona FROM tbl_vendedores"
_GRUPOS_SQL = "SELECT principal_cod FROM tbl_portafolio_grupos WHERE activo = true"
_MIEMBROS_SQL = "SELECT principal_cod, vendedor_cod FROM tbl_portafolio_acotado WHERE activo = true"
_MAESTRO_RESUMEN_SQL = (
    "SELECT cliente_cod, cliente_nombre, vendedor_nombre, vendedor_cod, updated_at "
    "FROM tbl_maestro_clientes ORDER BY updated_at DESC"
)
_RECUPERACION_SQL = "SELECT fn_recuperacion(p_anio => %s, p_mes => %s) AS r"
_RIESGO_VENDEDOR_SQL = "SELECT * FROM fn_cierre_mensual_riesgo_vendedor(p_anio => %s, p_mes => %s)"
_CIERRE_MORA_SQL = (
    "SELECT * FROM fn_cierre_mensual_mora(p_anio => %s, p_mes => %s, p_anio_ant => %s, p_mes_ant => %s)"
)
_CIERRE_ICP_SQL = (
    "SELECT * FROM fn_cierre_mensual_icp(p_reciente_ini => %s, p_reciente_fin => %s, "
    "p_previo_ini => %s, p_previo_fin => %s)"
)

_ESTADOS_CUENTA_SQL = "SELECT fn_estados_cuenta(p_email => %s) AS r"
_VENDEDOR_DE_CLIENTES_SQL = (
    "SELECT DISTINCT ON (cliente_cod) cliente_cod, vendedor_cod, vendedor_nombre "
    "FROM tbl_maestro_clientes WHERE cliente_cod = ANY(%s) ORDER BY cliente_cod, id DESC"
)
_CARTERA_VENCIDA_SQL = """
SELECT c.cliente_cod, c.cliente_nombre, c.vendedor_nombre,
       c.mora_1_30, c.mora_31_60, c.mora_61_90, c.mora_91_120, c.mora_120_plus,
       (SELECT max(g.fecha) FROM tbl_gestiones g
         WHERE g.cliente_cod = c.cliente_cod AND g.analista_email = %(email)s) AS ultima_gestion
FROM tbl_cartera c
WHERE c.cliente_cod IN (SELECT m.cliente_cod FROM tbl_maestro_clientes m WHERE m.analista_email = %(email)s)
  AND (c.mora_1_30 > 0 OR c.mora_31_60 > 0 OR c.mora_61_90 > 0 OR c.mora_91_120 > 0 OR c.mora_120_plus > 0)
ORDER BY c.mora_120_plus DESC
"""
_GESTIONES_PERIODO_SQL = """
SELECT * FROM tbl_gestiones
WHERE analista_email = %s AND fecha >= %s AND fecha <= %s
ORDER BY fecha DESC, hora DESC
"""


class PostgresReportesRepository(ReportesRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def _scalar(self, sql: str, params: tuple | dict = ()) -> Any:
        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            row = cursor.fetchone()
        return row["r"] if row else None

    def _rows(self, sql: str, params: tuple | dict = ()) -> list[Row]:
        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            return list(cursor.fetchall())

    def aging(self) -> Any:
        return self._scalar(_AGING_SQL)

    def cei(self, anio: int, mes: int) -> Any:
        return self._scalar(_CEI_SQL, (anio, mes))

    def snapshot_cierre_cartera(self, anio: int, mes: int, provisional: bool, generado_por: str) -> Any:
        return self._scalar(_SNAPSHOT_CIERRE_SQL, (anio, mes, provisional, generado_por))

    def efectividad(self, ini: date, fin: date, email: str | None) -> Any:
        return self._scalar(_EFECTIVIDAD_SQL, (ini, fin, email))

    def perfil_vendedor(self, meses: int, orden: str) -> Any:
        return self._scalar(_PERFIL_VENDEDOR_SQL, (meses, orden))

    def migracion_mora(
        self, anio: int, mes: int, supervisor_cod: str | None, vendedor_cod: str | None
    ) -> Any:
        return self._scalar(_MIGRACION_SQL, (anio, mes, supervisor_cod, vendedor_cod))

    def supervisores(self) -> list[Row]:
        return self._rows(_SUPERVISORES_SQL)

    def vendedores_activos(self) -> list[Row]:
        return self._rows(_VENDEDORES_ACTIVOS_SQL)

    def mora_vendedor(self, email: str | None) -> Any:
        return self._scalar(_MORA_VENDEDOR_SQL, (email,))

    def snapshot_bloqueados_semana(self) -> int:
        return int(self._scalar(_SNAPSHOT_BLOQUEADOS_SQL) or 0)

    def bloqueados(self, email: str | None) -> Any:
        return self._scalar(_BLOQUEADOS_SQL, (email,))

    def plazo_especial(self, email: str | None) -> Any:
        return self._scalar(_PLAZO_ESPECIAL_SQL, (email,))

    def portafolio_destinatarios(self) -> dict[str, list[str]]:
        return self._scalar(_PORTAFOLIO_DEST_SQL) or {}

    def dimension_opciones(self, columna: str) -> list[str]:
        return [row["v"] for row in self._rows(_DIMENSION_SQL[columna])]

    def kpis_cartera(self) -> list[Row]:
        return self._rows(_KPIS_CARTERA_SQL)

    def ventas_mensuales(self) -> list[Row]:
        return self._rows(_VENTAS_SQL)

    def concentracion(self) -> Any:
        return self._scalar(_CONCENTRACION_SQL)

    def recuperacion_mom(self, meses: int, email: str | None) -> Any:
        return self._scalar(_RECUP_MOM_SQL, (meses, email))

    def historico_cartera(self, limit: int) -> list[Row]:
        return self._rows(_HISTORICO_SQL, (limit,))

    def cierre_meses(self) -> list[Row]:
        return self._rows(_CIERRE_MESES_SQL)

    def vendedores_zona(self) -> list[Row]:
        return self._rows(_VENDEDORES_ZONA_SQL)

    def portafolio_grupos_activos(self) -> list[Row]:
        return self._rows(_GRUPOS_SQL)

    def portafolio_miembros_activos(self) -> list[Row]:
        return self._rows(_MIEMBROS_SQL)

    def maestro_clientes_resumen(self) -> list[Row]:
        return self._rows(_MAESTRO_RESUMEN_SQL)

    def recuperacion(self, anio: int, mes: int) -> Any:
        return self._scalar(_RECUPERACION_SQL, (anio, mes))

    def cierre_riesgo_vendedor(self, anio: int, mes: int) -> list[Row]:
        return self._rows(_RIESGO_VENDEDOR_SQL, (anio, mes))

    def cierre_mora(self, anio: int, mes: int, anio_ant: int, mes_ant: int) -> list[Row]:
        return self._rows(_CIERRE_MORA_SQL, (anio, mes, anio_ant, mes_ant))

    def cierre_icp(
        self, reciente_ini: date, reciente_fin: date, previo_ini: date, previo_fin: date
    ) -> list[Row]:
        return self._rows(_CIERRE_ICP_SQL, (reciente_ini, reciente_fin, previo_ini, previo_fin))

    def estados_cuenta(self, email: str | None) -> list[Row]:
        return self._scalar(_ESTADOS_CUENTA_SQL, (email,)) or []

    def vendedores_de_clientes(self, cliente_cods: list[str]) -> list[Row]:
        return self._rows(_VENDEDOR_DE_CLIENTES_SQL, (list(cliente_cods),))

    def cartera_vencida(self, analista_email: str) -> list[Row]:
        return self._rows(_CARTERA_VENCIDA_SQL, {"email": analista_email})

    def gestiones_periodo(self, analista_email: str, ini: date, fin: date) -> list[Row]:
        return self._rows(_GESTIONES_PERIODO_SQL, (analista_email, ini, fin))
