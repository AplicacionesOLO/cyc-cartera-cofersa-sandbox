"""Handlers del módulo Solicitudes (Lambda ``SolicitudesApi``)."""

from __future__ import annotations

from application.use_cases.solicitudes import (
    AgregarComentarioSolicitudUseCase,
    CambiarEstadoSolicitudUseCase,
    CreateAdjuntoUploadUrlUseCase,
    GetNuevaSolicitudClientesUseCase,
    GetNuevaSolicitudContextoUseCase,
    GetSolicitudDetalleUseCase,
    ListFacturasPendientesUseCase,
    ListSolicitudesUseCase,
    ResolverSolicitudUseCase,
)
from application.use_cases.solicitudes_crear import CreateSolicitudUseCase
from domain.entities.solicitudes import BUCKET_ADJUNTOS
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest
from entrypoints.lambda_handlers.router import api_router


def _uc_list():
    return ListSolicitudesUseCase(container.uow_factory)


def _uc_detalle():
    return GetSolicitudDetalleUseCase(container.uow_factory, container.storage(BUCKET_ADJUNTOS))


def _uc_nueva_clientes():
    return GetNuevaSolicitudClientesUseCase(container.uow_factory)


def _uc_nueva_contexto():
    return GetNuevaSolicitudContextoUseCase(container.uow_factory)


def _uc_facturas():
    return ListFacturasPendientesUseCase(container.uow_factory)


def _uc_upload():
    return CreateAdjuntoUploadUrlUseCase(container.uow_factory, container.storage(BUCKET_ADJUNTOS))


def _uc_create():
    return CreateSolicitudUseCase(
        container.uow_factory,
        container.mailer(),
        container.integration_config(),
        container.storage(BUCKET_ADJUNTOS),
    )


def _uc_resolver():
    return ResolverSolicitudUseCase(container.uow_factory)


def _uc_estado():
    return CambiarEstadoSolicitudUseCase(container.uow_factory)


def _uc_comentario():
    return AgregarComentarioSolicitudUseCase(container.uow_factory)


def _list(request: HttpRequest):
    return _uc_list().execute(request.require_principal(), request.query_bool("solo_propias"))


def _detalle(request: HttpRequest):
    return _uc_detalle().execute(request.require_principal(), request.path_param("id"))


def _nueva_clientes(request: HttpRequest):
    return _uc_nueva_clientes().execute(
        request.require_principal(), request.query_bool("solo_mi_cartera"), request.query_str("gestion_id")
    )


def _nueva_contexto(request: HttpRequest):
    return _uc_nueva_contexto().execute(request.require_principal(), request.query_str("cod"))


def _facturas(request: HttpRequest):
    return _uc_facturas().execute(request.require_principal(), request.query_str("contribuyente"))


def _upload_url(request: HttpRequest):
    return _uc_upload().execute(request.require_principal(), request.json_body())


def _create(request: HttpRequest):
    return _uc_create().execute(request.require_principal(), request.json_body())


def _resolver(request: HttpRequest):
    return _uc_resolver().execute(request.require_principal(), request.path_param("id"), request.json_body())


def _estado(request: HttpRequest):
    return _uc_estado().execute(request.require_principal(), request.path_param("id"), request.json_body())


def _comentario(request: HttpRequest):
    return _uc_comentario().execute(
        request.require_principal(), request.path_param("id"), request.json_body()
    )


ROUTES = {
    ("GET", "/solicitudes"): _list,
    ("POST", "/solicitudes"): _create,
    ("GET", "/solicitudes/nueva-clientes"): _nueva_clientes,
    ("GET", "/solicitudes/nueva-contexto"): _nueva_contexto,
    ("GET", "/solicitudes/facturas"): _facturas,
    ("POST", "/solicitudes/adjuntos/upload-url"): _upload_url,
    ("GET", "/solicitudes/{id}"): _detalle,
    ("PATCH", "/solicitudes/{id}"): _resolver,
    ("PATCH", "/solicitudes/{id}/estado"): _estado,
    ("POST", "/solicitudes/{id}/comentarios"): _comentario,
}

solicitudes_handler = api_router(ROUTES)
