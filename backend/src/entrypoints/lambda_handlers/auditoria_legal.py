"""Handlers de Auditoría y Control Legal (Lambda ``AuditoriaLegalApi``): garantías, pagarés y solicitudes."""

from __future__ import annotations

from application.use_cases import auditoria_legal as lectura
from application.use_cases import auditoria_legal_garantias as garantias
from application.use_cases import auditoria_legal_solicitudes as solicitudes
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest
from entrypoints.lambda_handlers.router import api_router


def _gid(request: HttpRequest) -> int:
    return garantias.parse_garantia_id(request.path_param("id"))


def _storage_garantias():
    return container.storage("garantias-legal")


def _storage_expedientes():
    return container.storage("expedientes-clientes")


# ── Fábricas de casos de uso ──────────────────────────────────────────────
def _uc(cls):
    return cls(container.uow_factory)


def _uc_lista():
    return lectura.ListGarantiasUseCase(container.uow_factory, _storage_garantias())


def _uc_custodia():
    return garantias.CambiarCustodiaGarantiaUseCase(container.uow_factory, container.mailer())


def _uc_upload_documento():
    return garantias.CrearUploadDocumentoGarantiaUseCase(container.uow_factory, _storage_garantias())


def _uc_adjuntar_documento():
    return garantias.AdjuntarDocumentoGarantiaUseCase(container.uow_factory, _storage_garantias())


def _uc_crear_solicitud():
    return solicitudes.CrearSolicitudActualizacionUseCase(
        container.uow_factory, container.mailer(), container.integration_config()
    )


def _uc_gestionar_solicitud():
    return solicitudes.GestionarSolicitudActualizacionUseCase(
        container.uow_factory, container.mailer(), container.integration_config()
    )


def _uc_get_solicitud():
    return solicitudes.GetSolicitudActualizacionUseCase(container.uow_factory, _storage_expedientes())


# ── Garantías: lecturas ───────────────────────────────────────────────────
def _lista(request: HttpRequest):
    return _uc_lista().execute(request.require_principal(), request.query_bool("mi_cartera"))


def _sin_garantia(request: HttpRequest):
    return _uc(lectura.ListClientesSinGarantiaUseCase).execute(
        request.require_principal(), request.query_bool("mi_cartera")
    )


def _vendedores(request: HttpRequest):
    return _uc(lectura.ListVendedoresActivosUseCase).execute(request.require_principal())


def _vendedor_garantia(request: HttpRequest):
    return _uc(lectura.GetVendedorGarantiaUseCase).execute(request.require_principal(), _gid(request))


def _eventos(request: HttpRequest):
    return _uc(lectura.ListEventosGarantiaUseCase).execute(request.require_principal(), _gid(request))


def _contribuyentes(request: HttpRequest):
    return _uc(lectura.BuscarContribuyentesUseCase).execute(
        request.require_principal(), request.query_str("q")
    )


def _saldo(request: HttpRequest):
    return _uc(lectura.GetSaldoContribuyenteUseCase).execute(
        request.require_principal(), request.query_str("contribuyente")
    )


def _garantia_activa(request: HttpRequest):
    return _uc(lectura.GetGarantiaActivaContribuyenteUseCase).execute(
        request.require_principal(), request.query_str("contribuyente")
    )


def _vendedores_contribuyente(request: HttpRequest):
    return _uc(lectura.ListVendedoresContribuyenteUseCase).execute(
        request.require_principal(), request.query_str("contribuyente")
    )


def _personas(request: HttpRequest):
    return _uc(lectura.ListPersonasLegalesUseCase).execute(
        request.require_principal(), request.query_list("cedulas")
    )


def _config_pagare(request: HttpRequest):
    return _uc(lectura.GetConfigPagareUseCase).execute(request.require_principal())


def _conteo_carpeta(request: HttpRequest):
    return _uc(lectura.ContarGarantiasCarpetaUseCase).execute(
        request.require_principal(),
        request.query_str("mueble"),
        request.query_str("gaveta"),
        request.query_int("carpeta"),
        request.query_int("excluir_id"),
    )


def _siguiente_carpeta(request: HttpRequest):
    return _uc(lectura.SiguienteCarpetaDisponibleUseCase).execute(
        request.require_principal(),
        request.query_str("mueble"),
        request.query_str("gaveta"),
        request.query_int("desde", 1),
    )


def _pagare_imprimible(request: HttpRequest):
    return _uc(lectura.GetPagareImprimibleUseCase).execute(request.require_principal(), _gid(request))


# ── Garantías: escrituras ─────────────────────────────────────────────────
def _registrar(request: HttpRequest):
    return _uc(garantias.RegistrarGarantiaUseCase).execute(request.require_principal(), request.json_body())


def _editar(request: HttpRequest):
    return _uc(garantias.EditarGarantiaUseCase).execute(
        request.require_principal(), _gid(request), request.json_body()
    )


def _custodia(request: HttpRequest):
    return _uc_custodia().execute(request.require_principal(), _gid(request), request.json_body())


def _upload_documento(request: HttpRequest):
    return _uc_upload_documento().execute(request.require_principal(), _gid(request), request.json_body())


def _adjuntar_documento(request: HttpRequest):
    return _uc_adjuntar_documento().execute(request.require_principal(), _gid(request), request.json_body())


def _generar_pagare(request: HttpRequest):
    return _uc(garantias.GenerarPagareUseCase).execute(
        request.require_principal(), _gid(request), request.json_body()
    )


# ── Solicitudes de actualización ──────────────────────────────────────────
def _solicitudes(request: HttpRequest):
    return _uc(solicitudes.ListSolicitudesActualizacionUseCase).execute(request.require_principal())


def _crear_solicitud(request: HttpRequest):
    return _uc_crear_solicitud().execute(request.require_principal(), request.json_body())


def _get_solicitud(request: HttpRequest):
    return _uc_get_solicitud().execute(request.require_principal(), request.path_param("id"))


def _gestionar_solicitud(request: HttpRequest):
    return _uc_gestionar_solicitud().execute(
        request.require_principal(), request.path_param("id"), request.json_body()
    )


ROUTES = {
    ("GET", "/garantias"): _lista,
    ("POST", "/garantias"): _registrar,
    ("GET", "/garantias/sin-garantia"): _sin_garantia,
    ("GET", "/garantias/vendedores"): _vendedores,
    ("GET", "/garantias/contribuyentes"): _contribuyentes,
    ("GET", "/garantias/contribuyentes/saldo"): _saldo,
    ("GET", "/garantias/contribuyentes/garantia-activa"): _garantia_activa,
    ("GET", "/garantias/contribuyentes/vendedores"): _vendedores_contribuyente,
    ("GET", "/garantias/personas-legales"): _personas,
    ("GET", "/garantias/config-pagare"): _config_pagare,
    ("GET", "/garantias/carpetas/conteo"): _conteo_carpeta,
    ("GET", "/garantias/carpetas/siguiente"): _siguiente_carpeta,
    ("PATCH", "/garantias/{id}"): _editar,
    ("GET", "/garantias/{id}/vendedor"): _vendedor_garantia,
    ("GET", "/garantias/{id}/eventos"): _eventos,
    ("PATCH", "/garantias/{id}/custodia"): _custodia,
    ("POST", "/garantias/{id}/documento/upload-url"): _upload_documento,
    ("POST", "/garantias/{id}/documento"): _adjuntar_documento,
    ("GET", "/garantias/{id}/pagare"): _pagare_imprimible,
    ("POST", "/garantias/{id}/pagare"): _generar_pagare,
    ("GET", "/solicitudes-actualizacion"): _solicitudes,
    ("POST", "/solicitudes-actualizacion"): _crear_solicitud,
    ("GET", "/solicitudes-actualizacion/{id}"): _get_solicitud,
    ("PATCH", "/solicitudes-actualizacion/{id}"): _gestionar_solicitud,
}

auditoria_legal_handler = api_router(ROUTES)
