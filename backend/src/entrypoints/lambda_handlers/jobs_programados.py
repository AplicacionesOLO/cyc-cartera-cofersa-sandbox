"""Handlers de EventBridge Scheduler: un job lógico de pg_cron = una Lambda programada.

Cada handler ejecuta la misma función SQL que el cron del origen con ``uow_factory(None)``
(service_role). Un error se propaga para que la invocación quede como fallida (métrica Errors).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from application.use_cases.jobs import EjecutarTareaProgramadaUseCase
from entrypoints.lambda_handlers import container
from shared.logging import get_logger

_logger = get_logger("jobs")


def _job(tarea: str) -> Callable[[dict, Any], dict]:
    def handler(event: dict, context: Any = None) -> dict:
        result = EjecutarTareaProgramadaUseCase(container.uow_factory).execute(tarea)
        _logger.info("scheduled job done", extra={"tarea": tarea})
        return result

    handler.__name__ = f"{tarea}_job"
    return handler


check_recibos_reversion_job = _job("check_recibos_reversion")
check_sync_salud_job = _job("check_sync_salud")
cierre_cartera_mensual_job = _job("cierre_cartera_mensual")
cierre_mensual_pedidos_retenidos_job = _job("cierre_mensual_pedidos_retenidos")
conciliar_promesas_job = _job("conciliar_promesas")
expirar_solicitudes_actualizacion_job = _job("expirar_solicitudes_actualizacion")
historico_cartera_job = _job("historico_cartera")
notificar_pedido_en_regla_job = _job("notificar_pedido_en_regla")
notificar_promesas_hoy_job = _job("notificar_promesas_hoy")
notificar_sin_gestion_job = _job("notificar_sin_gestion")
notificar_sla_vencido_job = _job("notificar_sla_vencido")
snapshot_proyeccion_semana_job = _job("snapshot_proyeccion_semana")
sync_pagos_job = _job("sync_pagos")
sync_cartera_job = _job("sync_cartera")
sync_facturas_job = _job("sync_facturas")
sync_saldos_favor_job = _job("sync_saldos_favor")
sync_pedidos_retenidos_job = _job("sync_pedidos_retenidos")
