"""Adapter PostgreSQL del módulo jobs (tareas ex pg_cron, sync_log e ingesta N8N/GAS)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any

import psycopg
from psycopg import sql

from application.ports.jobs import JobsRepository

# tarea programada → función (mismo comando que el cron del origen; fn_sync_* con su default 'pg_cron')
_SQL_TAREAS: dict[str, str] = {
    "check_recibos_reversion": "SELECT fn_check_recibos_reversion() AS r",
    "check_sync_salud": "SELECT fn_check_sync_salud() AS r",
    "cierre_cartera_mensual": "SELECT fn_cron_cierre_mensual() AS r",
    "cierre_mensual_pedidos_retenidos": "SELECT fn_cierre_mensual_pedidos_retenidos() AS r",
    "conciliar_promesas": "SELECT fn_conciliar_promesas() AS r",
    "expirar_solicitudes_actualizacion": "SELECT fn_expirar_solicitudes_actualizacion() AS r",
    "historico_cartera": "SELECT fn_registrar_historico_cartera() AS r",
    "notificar_pedido_en_regla": "SELECT fn_notificar_pedido_en_regla() AS r",
    "notificar_promesas_hoy": "SELECT fn_notificar_promesas_hoy() AS r",
    "notificar_sin_gestion": "SELECT fn_notificar_sin_gestion() AS r",
    "notificar_sla_vencido": "SELECT fn_notificar_sla_vencido() AS r",
    "snapshot_proyeccion_semana": "SELECT fn_snapshot_proyeccion_semana() AS r",
    "sync_pagos": "SELECT fn_sync_pagos() AS r",
    "sync_cartera": "SELECT fn_sync_cartera() AS r",
    "sync_facturas": "SELECT fn_sync_facturas() AS r",
    "sync_saldos_favor": "SELECT fn_sync_saldos_favor() AS r",
    "sync_pedidos_retenidos": "SELECT fn_sync_pedidos_retenidos() AS r",
}

_SQL_SYNC: dict[str, str] = {
    "pagos": "SELECT fn_sync_pagos(p_ejecutado_por => %s) AS r",
    "cartera": "SELECT fn_sync_cartera(p_ejecutado_por => %s) AS r",
    "facturas": "SELECT fn_sync_facturas(p_ejecutado_por => %s) AS r",
    "saldos_favor": "SELECT fn_sync_saldos_favor(p_ejecutado_por => %s) AS r",
    "pedidos_retenidos": "SELECT fn_sync_pedidos_retenidos(p_ejecutado_por => %s) AS r",
}

_SYNC_LOG_COLS = (
    "id, tipo, ejecutado_en, ejecutado_por, insertados, en_stage, omitidos, total_tabla, "
    "ultimo_registro, error"
)
_SQL_HISTORIAL = f"SELECT {_SYNC_LOG_COLS} FROM tbl_sync_log ORDER BY ejecutado_en DESC, id DESC LIMIT %s"
_SQL_ULTIMO = (
    f"SELECT {_SYNC_LOG_COLS} FROM tbl_sync_log "
    "WHERE tipo = %(tipo)s AND (%(desde)s::timestamptz IS NULL OR ejecutado_en >= %(desde)s::timestamptz) "
    "ORDER BY ejecutado_en DESC, id DESC LIMIT 1"
)

# tabla lógica de ingesta → tabla Aurora (lista cerrada: nunca se interpola un nombre recibido)
_TABLAS: dict[str, str] = {
    "pagos_stage": "tbl_pagos_stage",
    "pedidos_retenidos_stage": "tbl_pedidos_retenidos_stage",
    "cartera": "tbl_cartera",
    "facturas": "tbl_facturas",
    "saldos_favor": "tbl_saldos_favor",
    "maestro_clientes": "tbl_maestro_clientes",
}

_SQL_DELETE = sql.SQL("DELETE FROM {tabla}")
_SQL_INSERT = sql.SQL("INSERT INTO {tabla} ({columnas}) VALUES ({valores})")
_SQL_UPSERT = sql.SQL(
    "INSERT INTO {tabla} ({columnas}) VALUES ({valores}) ON CONFLICT ({clave}) DO UPDATE SET {sets}"
)
_SQL_UPSERT_NOTHING = sql.SQL(
    "INSERT INTO {tabla} ({columnas}) VALUES ({valores}) ON CONFLICT ({clave}) DO NOTHING"
)
_SQL_PURGAR = sql.SQL("DELETE FROM {tabla} WHERE sync_id IS DISTINCT FROM %s")


def _tabla(nombre: str) -> sql.Identifier:
    return sql.Identifier(_TABLAS[nombre])


def _ids(columnas: Sequence[str]) -> sql.Composed:
    return sql.SQL(", ").join(sql.Identifier(c) for c in columnas)


def _placeholders(columnas: Sequence[str]) -> sql.Composed:
    return sql.SQL(", ").join(sql.Placeholder() for _ in columnas)


class PostgresJobsRepository(JobsRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._conn = connection

    def _scalar(self, query: str, params: Sequence[Any] = ()) -> Any:
        with self._conn.cursor() as cur:
            cur.execute(query, params)
            row = cur.fetchone()
        return row["r"] if row else None

    # ── tareas / sync ──
    def ejecutar_tarea(self, tarea: str) -> Any:
        return self._scalar(_SQL_TAREAS[tarea])

    def ejecutar_sync(self, tipo: str, ejecutado_por: str) -> Any:
        return self._scalar(_SQL_SYNC[tipo], (ejecutado_por,))

    def historial_sync(self, limite: int) -> list[dict[str, Any]]:
        with self._conn.cursor() as cur:
            cur.execute(_SQL_HISTORIAL, (limite,))
            return list(cur.fetchall())

    def ultimo_sync(self, tipo: str, desde: datetime | None) -> dict[str, Any] | None:
        with self._conn.cursor() as cur:
            cur.execute(_SQL_ULTIMO, {"tipo": tipo, "desde": desde})
            return cur.fetchone()

    # ── ingesta ──
    def vaciar_tabla(self, tabla: str) -> int:
        with self._conn.cursor() as cur:
            cur.execute(_SQL_DELETE.format(tabla=_tabla(tabla)))
            return max(cur.rowcount, 0)

    def insertar_filas(self, tabla: str, columnas: Sequence[str], filas: Sequence[Sequence[Any]]) -> int:
        query = _SQL_INSERT.format(
            tabla=_tabla(tabla), columnas=_ids(columnas), valores=_placeholders(columnas)
        )
        return self._executemany(query, filas)

    def upsert_filas(
        self,
        tabla: str,
        columnas: Sequence[str],
        filas: Sequence[Sequence[Any]],
        clave: Sequence[str],
        *,
        tocar_updated_at: bool,
    ) -> int:
        actualizables = [c for c in columnas if c not in clave]
        sets = [sql.SQL("{c} = EXCLUDED.{c}").format(c=sql.Identifier(c)) for c in actualizables]
        if tocar_updated_at:
            sets.append(sql.SQL("updated_at = now()"))
        parts = {
            "tabla": _tabla(tabla),
            "columnas": _ids(columnas),
            "valores": _placeholders(columnas),
            "clave": _ids(clave),
        }
        query = (
            _SQL_UPSERT.format(sets=sql.SQL(", ").join(sets), **parts)
            if sets
            else _SQL_UPSERT_NOTHING.format(**parts)
        )
        return self._executemany(query, filas)

    def purgar_otros_sync(self, tabla: str, sync_id: str) -> int:
        with self._conn.cursor() as cur:
            cur.execute(_SQL_PURGAR.format(tabla=_tabla(tabla)), (sync_id,))
            return max(cur.rowcount, 0)

    def _executemany(self, query: sql.Composed, filas: Sequence[Sequence[Any]]) -> int:
        if not filas:
            return 0
        with self._conn.cursor() as cur:
            cur.executemany(query, filas)
            return len(filas) if cur.rowcount < 0 else cur.rowcount
