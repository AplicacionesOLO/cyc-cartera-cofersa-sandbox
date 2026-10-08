"""Handlers del Centro de Recursos (Lambda CentroRecursosApi)."""

from __future__ import annotations

from application.use_cases.centro_recursos import (
    BUCKET,
    ActualizarAplicacionUseCase,
    ActualizarMarcaUseCase,
    CrearAplicacionUseCase,
    CrearDocumentoUseCase,
    CrearMarcaUseCase,
    CrearUrlCargaDocumentoUseCase,
    GetCentroRecursosUseCase,
    ListAplicacionesUseCase,
    ListDocumentosUseCase,
)
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest, created
from entrypoints.lambda_handlers.router import api_router


def _uc_pagina():
    return GetCentroRecursosUseCase(container.uow_factory, container.storage(BUCKET))


def _uc_list_aplicaciones():
    return ListAplicacionesUseCase(container.uow_factory)


def _uc_crear_aplicacion():
    return CrearAplicacionUseCase(container.uow_factory)


def _uc_actualizar_aplicacion():
    return ActualizarAplicacionUseCase(container.uow_factory)


def _uc_list_documentos():
    return ListDocumentosUseCase(container.uow_factory, container.storage(BUCKET))


def _uc_url_carga():
    return CrearUrlCargaDocumentoUseCase(container.uow_factory, container.storage(BUCKET))


def _uc_crear_documento():
    return CrearDocumentoUseCase(container.uow_factory, container.storage(BUCKET))


def _uc_crear_marca():
    return CrearMarcaUseCase(container.uow_factory)


def _uc_actualizar_marca():
    return ActualizarMarcaUseCase(container.uow_factory)


def _pagina(request: HttpRequest):
    return _uc_pagina().execute(request.require_principal())


def _list_aplicaciones(request: HttpRequest):
    return _uc_list_aplicaciones().execute(request.require_principal())


def _crear_aplicacion(request: HttpRequest):
    return created(_uc_crear_aplicacion().execute(request.require_principal(), request.json_body()))


def _actualizar_aplicacion(request: HttpRequest):
    return _uc_actualizar_aplicacion().execute(
        request.require_principal(), request.path_param("id"), request.json_body()
    )


def _list_documentos(request: HttpRequest):
    return _uc_list_documentos().execute(request.require_principal())


def _url_carga_documento(request: HttpRequest):
    return _uc_url_carga().execute(request.require_principal(), request.json_body())


def _crear_documento(request: HttpRequest):
    return created(_uc_crear_documento().execute(request.require_principal(), request.json_body()))


def _crear_marca(request: HttpRequest):
    return created(_uc_crear_marca().execute(request.require_principal(), request.json_body()))


def _actualizar_marca(request: HttpRequest):
    return _uc_actualizar_marca().execute(
        request.require_principal(), request.path_param("id"), request.json_body()
    )


ROUTES = {
    ("GET", "/centro-recursos"): _pagina,
    ("GET", "/centro-recursos/aplicaciones"): _list_aplicaciones,
    ("POST", "/centro-recursos/aplicaciones"): _crear_aplicacion,
    ("PUT", "/centro-recursos/aplicaciones/{id}"): _actualizar_aplicacion,
    ("GET", "/centro-recursos/documentos"): _list_documentos,
    ("POST", "/centro-recursos/documentos/upload-url"): _url_carga_documento,
    ("POST", "/centro-recursos/documentos"): _crear_documento,
    ("POST", "/centro-recursos/marcas"): _crear_marca,
    ("PUT", "/centro-recursos/marcas/{id}"): _actualizar_marca,
}

centro_recursos_handler = api_router(ROUTES)
