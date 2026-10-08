"""Adapter PostgreSQL de Análisis de Pagos (``fn_analisis_*``) y Pagos Aplicados (anulados/duplicados)."""

from __future__ import annotations

from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from application.ports.analisis_pagos import AnalisisPagosRepository
from shared.logging import get_logger

_logger = get_logger("analisis_pagos")

_RANKING_SQL = """
SELECT fn_analisis_ranking_clientes(
  p_email => %(email)s, p_meses => %(meses)s, p_offset => %(offset)s, p_limit => %(limit)s,
  p_clasificacion => %(clasificacion)s, p_dimension => %(dimension)s, p_vendedor_cod => %(vendedor_cod)s,
  p_busqueda => %(busqueda)s, p_orden => %(orden)s
) AS r
"""
_PERFIL_SQL = "SELECT fn_analisis_perfil_vendedor(p_email => %s, p_meses => %s, p_orden => %s) AS r"
_ALERTAS_SQL = "SELECT fn_analisis_alertas_deterioro(p_email => %s) AS r"
_CONCENTRACION_SQL = "SELECT fn_analisis_concentracion() AS r"
_PAGOS_MES_SQL = "SELECT fn_pagos_mes_resumen(p_anio => %s, p_mes => %s) AS r"
_UPSERT_ANULADO_SQL = """
INSERT INTO tbl_pagos_anulados (no_recibo, motivo, recibo_reemplazo, anulado_por, anulado_en)
VALUES (%s, %s, %s, %s, now())
ON CONFLICT (no_recibo) DO UPDATE SET
  motivo = EXCLUDED.motivo,
  recibo_reemplazo = EXCLUDED.recibo_reemplazo,
  anulado_por = EXCLUDED.anulado_por,
  anulado_en = EXCLUDED.anulado_en
"""
_DELETE_ANULADO_SQL = "DELETE FROM tbl_pagos_anulados WHERE no_recibo = %s"
_UPSERT_DESCARTE_SQL = """
INSERT INTO tbl_pagos_duplicado_descartado (no_recibo, nota, descartado_por, descartado_en)
VALUES (%s, %s, %s, now())
ON CONFLICT (no_recibo) DO UPDATE SET
  nota = EXCLUDED.nota,
  descartado_por = EXCLUDED.descartado_por,
  descartado_en = EXCLUDED.descartado_en
"""
_DELETE_DESCARTE_SQL = "DELETE FROM tbl_pagos_duplicado_descartado WHERE no_recibo = %s"
_AUDIT_SQL = """
INSERT INTO tbl_config_audit_log (tabla, accion, descripcion, valor_nuevo, realizado_por, realizado_en)
VALUES (%s, %s, %s, %s, %s, now())
"""


class PostgresAnalisisPagosRepository(AnalisisPagosRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def _json(self, sql: str, params: Any = ()) -> Any:
        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            row = cursor.fetchone()
        return row["r"] if row else None

    def _execute(self, sql: str, params: tuple[Any, ...]) -> None:
        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)

    def ranking_clientes(
        self,
        *,
        email: str | None,
        meses: int,
        offset: int,
        limit: int,
        clasificacion: str | None,
        dimension: str | None,
        vendedor_cod: str | None,
        busqueda: str | None,
        orden: str,
    ) -> Any:
        params = {
            "email": email,
            "meses": meses,
            "offset": offset,
            "limit": limit,
            "clasificacion": clasificacion,
            "dimension": dimension,
            "vendedor_cod": vendedor_cod,
            "busqueda": busqueda,
            "orden": orden,
        }
        return self._json(_RANKING_SQL, params)

    def perfil_vendedor(self, email: str | None, meses: int, orden: str) -> Any:
        return self._json(_PERFIL_SQL, (email, meses, orden))

    def alertas_deterioro(self, email: str | None) -> Any:
        return self._json(_ALERTAS_SQL, (email,))

    def concentracion(self) -> Any:
        return self._json(_CONCENTRACION_SQL)

    def pagos_mes_resumen(self, anio: int, mes: int) -> Any:
        return self._json(_PAGOS_MES_SQL, (anio, mes))

    def marcar_anulados(
        self, no_recibos: list[str], motivo: str, recibo_reemplazo: str | None, anulado_por: str
    ) -> None:
        with self._connection.cursor() as cursor:
            cursor.executemany(
                _UPSERT_ANULADO_SQL, [(nr, motivo, recibo_reemplazo, anulado_por) for nr in no_recibos]
            )

    def desmarcar_anulado(self, no_recibo: str) -> None:
        self._execute(_DELETE_ANULADO_SQL, (no_recibo,))

    def descartar_duplicado(self, no_recibo: str, nota: str | None, descartado_por: str) -> None:
        self._execute(_UPSERT_DESCARTE_SQL, (no_recibo, nota, descartado_por))

    def revertir_descarte_duplicado(self, no_recibo: str) -> None:
        self._execute(_DELETE_DESCARTE_SQL, (no_recibo,))

    def registrar_auditoria(
        self,
        *,
        tabla: str,
        accion: str,
        descripcion: str,
        realizado_por: str,
        valor_nuevo: dict[str, Any] | None = None,
    ) -> None:
        params = (
            tabla,
            accion,
            descripcion,
            Jsonb(valor_nuevo) if valor_nuevo is not None else None,
            realizado_por,
        )
        try:
            with self._connection.transaction():  # SAVEPOINT: un fallo aquí no aborta la operación
                self._execute(_AUDIT_SQL, params)
        except psycopg.Error:
            _logger.warning("config_audit_log no registrado", extra={"tabla": tabla, "accion": accion})
