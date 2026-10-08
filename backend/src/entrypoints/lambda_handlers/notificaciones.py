"""Handlers de notificaciones, chat del equipo, tipo de cambio y Hacienda (Lambda NotificacionesApi)."""

from __future__ import annotations

from application.use_cases.notificaciones import (
    EnviarMensajeChatUseCase,
    ListMensajesChatUseCase,
    ListNotificacionesUseCase,
    MarcarNotificacionLeidaUseCase,
    MarcarTodasLeidasUseCase,
)
from application.use_cases.notificaciones_integraciones import (
    BuscarCabysUseCase,
    ConsultarHaciendaUseCase,
    GetTipoCambioUseCase,
)
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest
from entrypoints.lambda_handlers.router import api_router


def _uc_list():
    return ListNotificacionesUseCase(container.uow_factory)


def _uc_marcar_leida():
    return MarcarNotificacionLeidaUseCase(container.uow_factory)


def _uc_marcar_todas():
    return MarcarTodasLeidasUseCase(container.uow_factory)


def _uc_list_chat():
    return ListMensajesChatUseCase(container.uow_factory)


def _uc_enviar_chat():
    return EnviarMensajeChatUseCase(container.uow_factory)


def _uc_tipo_cambio():
    return GetTipoCambioUseCase(
        container.uow_factory, container.external_http(), container.integration_config()
    )


def _uc_hacienda():
    return ConsultarHaciendaUseCase(container.external_http())


def _uc_cabys():
    return BuscarCabysUseCase(container.external_http())


def _list(request: HttpRequest):
    return _uc_list().execute(request.require_principal(), request.query_int("limit", minimum=1))


def _marcar_leida(request: HttpRequest):
    return _uc_marcar_leida().execute(request.require_principal(), request.path_param("id"), request.json())


def _marcar_todas(request: HttpRequest):
    return _uc_marcar_todas().execute(request.require_principal())


def _list_chat(request: HttpRequest):
    return _uc_list_chat().execute(request.require_principal())


def _enviar_chat(request: HttpRequest):
    return _uc_enviar_chat().execute(request.require_principal(), request.json_body())


def _tipo_cambio(request: HttpRequest):
    return _uc_tipo_cambio().execute(request.require_principal())


def _hacienda(request: HttpRequest):
    return _uc_hacienda().execute(request.require_principal(), request.query_str("identificacion"))


def _cabys(request: HttpRequest):
    return _uc_cabys().execute(request.require_principal(), request.query_str("q"))


ROUTES = {
    ("GET", "/notificaciones"): _list,
    ("PATCH", "/notificaciones/{id}"): _marcar_leida,
    ("POST", "/notificaciones/leer-todas"): _marcar_todas,
    ("GET", "/chat"): _list_chat,
    ("POST", "/chat"): _enviar_chat,
    ("GET", "/tipo-cambio"): _tipo_cambio,
    ("GET", "/hacienda"): _hacienda,
    ("GET", "/hacienda/cabys"): _cabys,
}

notificaciones_handler = api_router(ROUTES)
