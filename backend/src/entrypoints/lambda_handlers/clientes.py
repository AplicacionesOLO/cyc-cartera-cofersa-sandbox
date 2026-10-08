"""Handlers del módulo Clientes (Lambda ``ClientesApi``): lista, buscador, ficha, contacto y correos."""

from __future__ import annotations

from application.use_cases.clientes import (
    ActualizarContactoClienteUseCase,
    ActualizarLogisticaClienteUseCase,
    BuscarGlobalUseCase,
    CambiarEstadoClienteUseCase,
    GetEstadoCuentaDataUseCase,
    GetFichaClienteUseCase,
    ListClientesUseCase,
    RegistrarRecordatorioUseCase,
)
from application.use_cases.clientes_email import (
    EnviarEmailCobroUseCase,
    EnviarEstadoCuentaUseCase,
    GenerarEmailCobroIAUseCase,
)
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest
from entrypoints.lambda_handlers.router import api_router

_FILTROS = ("q", "analista", "vendedor", "plazo", "dimension", "sort", "dir")


def _uc_lista() -> ListClientesUseCase:
    return ListClientesUseCase(container.uow_factory)


def _uc_buscar() -> BuscarGlobalUseCase:
    return BuscarGlobalUseCase(container.uow_factory)


def _uc_ficha() -> GetFichaClienteUseCase:
    return GetFichaClienteUseCase(container.uow_factory)


def _uc_contacto() -> ActualizarContactoClienteUseCase:
    return ActualizarContactoClienteUseCase(container.uow_factory)


def _uc_logistica() -> ActualizarLogisticaClienteUseCase:
    return ActualizarLogisticaClienteUseCase(container.uow_factory)


def _uc_estado() -> CambiarEstadoClienteUseCase:
    return CambiarEstadoClienteUseCase(container.uow_factory)


def _uc_recordatorio() -> RegistrarRecordatorioUseCase:
    return RegistrarRecordatorioUseCase(container.uow_factory)


def _uc_estado_cuenta_data() -> GetEstadoCuentaDataUseCase:
    return GetEstadoCuentaDataUseCase(container.uow_factory)


def _uc_email_cobro() -> EnviarEmailCobroUseCase:
    return EnviarEmailCobroUseCase(container.uow_factory, container.mailer())


def _uc_estado_cuenta() -> EnviarEstadoCuentaUseCase:
    return EnviarEstadoCuentaUseCase(container.uow_factory, container.mailer())


def _uc_generar_email() -> GenerarEmailCobroIAUseCase:
    return GenerarEmailCobroIAUseCase(container.uow_factory, container.language_model())


def _lista(request: HttpRequest):
    filtros = {key: request.query_str(key) for key in _FILTROS}
    filtros["nivel_precio"] = request.query_str("nivelPrecio")
    page_size = None if request.query_bool("todos") else request.query_int("page_size", 25, minimum=1)
    return _uc_lista().execute(
        request.require_principal(), filtros, request.query_int("page", 1, minimum=1) or 1, page_size
    )


def _buscar(request: HttpRequest):
    return _uc_buscar().execute(request.require_principal(), request.query_str("q"))


def _ficha(request: HttpRequest):
    return _uc_ficha().execute(
        request.require_principal(), request.path_param("cod"), request.query_str("volver")
    )


def _contacto(request: HttpRequest):
    return _uc_contacto().execute(request.require_principal(), request.json_body())


def _logistica(request: HttpRequest):
    return _uc_logistica().execute(request.require_principal(), request.json_body())


def _estado(request: HttpRequest):
    return _uc_estado().execute(request.require_principal(), request.json_body())


def _recordatorio(request: HttpRequest):
    return _uc_recordatorio().execute(request.require_principal(), request.json_body())


def _estado_cuenta_data(request: HttpRequest):
    return _uc_estado_cuenta_data().execute(request.require_principal(), request.query_str("cod"))


def _email_cobro(request: HttpRequest):
    return _uc_email_cobro().execute(request.require_principal(), request.json_body())


def _estado_cuenta(request: HttpRequest):
    return _uc_estado_cuenta().execute(request.require_principal(), request.json_body())


def _generar_email(request: HttpRequest):
    return _uc_generar_email().execute(request.require_principal(), request.json_body())


ROUTES = {
    ("GET", "/clientes"): _lista,
    ("GET", "/clientes/buscar"): _buscar,
    ("GET", "/clientes/{cod}/ficha"): _ficha,
    ("PATCH", "/clientes/contacto"): _contacto,
    ("PATCH", "/clientes/logistica"): _logistica,
    ("POST", "/clientes/estado"): _estado,
    ("POST", "/clientes/recordatorio"): _recordatorio,
    ("GET", "/clientes/estado-cuenta/data"): _estado_cuenta_data,
    ("POST", "/clientes/email-cobro"): _email_cobro,
    ("POST", "/clientes/estado-cuenta"): _estado_cuenta,
    ("POST", "/ai/generate-email"): _generar_email,
}

clientes_handler = api_router(ROUTES)
