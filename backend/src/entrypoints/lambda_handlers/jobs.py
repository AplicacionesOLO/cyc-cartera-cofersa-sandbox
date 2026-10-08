"""JobsApi (Configuración → Sincronización) y worker SQS de la sincronización manual con N8N."""

from __future__ import annotations

from functools import lru_cache

from application.ports.idempotency_store import IdempotencyStore
from application.ports.message_queue import MessageQueue
from application.use_cases.jobs import (
    ConciliarPromesasManualUseCase,
    EncolarSyncManualUseCase,
    ListarHistorialSyncUseCase,
    ObtenerEstadoSyncUseCase,
    ProcesarSyncManualUseCase,
    SincronizarTablaUseCase,
)
from domain.entities.jobs import (
    SYNC_CARTERA,
    SYNC_FACTURAS,
    SYNC_PAGOS,
    SYNC_PEDIDOS_RETENIDOS,
    SYNC_SALDOS_FAVOR,
)
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest, accepted
from entrypoints.lambda_handlers.router import api_router
from entrypoints.lambda_handlers.sqs_adapter import sqs_batch_handler
from infrastructure.aws.dynamodb_idempotency_store import DynamoDbIdempotencyStore
from infrastructure.aws.sqs_message_queue import SqsMessageQueue
from shared.settings import env


@lru_cache(maxsize=1)
def _queue() -> MessageQueue:
    return SqsMessageQueue(env("SYNC_MANUAL_QUEUE_URL", required=True))


@lru_cache(maxsize=1)
def _idempotency() -> IdempotencyStore:
    return DynamoDbIdempotencyStore(env("IDEMPOTENCY_TABLE_NAME", required=True))


def _uc_sincronizar() -> SincronizarTablaUseCase:
    return SincronizarTablaUseCase(container.uow_factory)


def _uc_encolar() -> EncolarSyncManualUseCase:
    return EncolarSyncManualUseCase(container.uow_factory, _queue(), container.integration_config())


def _uc_procesar() -> ProcesarSyncManualUseCase:
    return ProcesarSyncManualUseCase(
        container.uow_factory, container.external_http(), container.integration_config()
    )


def _sincronizar(tipo: str):
    def route(request: HttpRequest):
        return _uc_sincronizar().execute(request.require_principal(), tipo)

    return route


def _encolar(tipo: str):
    def route(request: HttpRequest):
        return accepted(_uc_encolar().execute(request.require_principal(), tipo))

    return route


def _historial(request: HttpRequest):
    return ListarHistorialSyncUseCase(container.uow_factory).execute(
        request.require_principal(), request.query_int("limit", minimum=1)
    )


def _estado(request: HttpRequest):
    return ObtenerEstadoSyncUseCase(container.uow_factory).execute(
        request.require_principal(), request.query_str("tipo"), request.query_str("desde")
    )


def _conciliar_promesas(request: HttpRequest):
    return ConciliarPromesasManualUseCase(container.uow_factory).execute(request.require_principal())


ROUTES = {
    ("POST", "/jobs/conciliar-promesas"): _conciliar_promesas,
    ("POST", "/sync/pagos"): _encolar(SYNC_PAGOS),
    ("POST", "/sync/pedidos-retenidos"): _encolar(SYNC_PEDIDOS_RETENIDOS),
    ("POST", "/sync/cartera"): _sincronizar(SYNC_CARTERA),
    ("POST", "/sync/facturas"): _sincronizar(SYNC_FACTURAS),
    ("POST", "/sync/saldos_favor"): _sincronizar(SYNC_SALDOS_FAVOR),
    ("GET", "/sync/historial"): _historial,
    ("GET", "/sync/estado"): _estado,
}

jobs_handler = api_router(ROUTES)


@sqs_batch_handler(idempotency=lambda: _idempotency())
def sync_manual_worker_handler(message, record):
    _uc_procesar().execute(message)
