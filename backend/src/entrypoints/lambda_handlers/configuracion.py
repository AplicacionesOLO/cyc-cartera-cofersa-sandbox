"""Handlers de Configuración (antes ``/api/configuracion/**`` + carga de ``configuracion/page.tsx``)."""

from __future__ import annotations

from application.use_cases import configuracion as cfg
from application.use_cases import configuracion_catalogos as cat
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest, created
from entrypoints.lambda_handlers.router import api_router


def _uc(cls):
    return cls(container.uow_factory)


# ── pantalla y config_sistema ─────────────────────────────────────────────
def _pantalla(request: HttpRequest):
    return _uc(cfg.GetConfiguracionPantallaUseCase).execute(request.require_principal())


def _get_parametros(request: HttpRequest):
    return _uc(cfg.GetParametrosUseCase).execute(request.require_principal())


def _put_parametros(request: HttpRequest):
    return _uc(cfg.UpdateParametroUseCase).execute(request.require_principal(), request.json_body())


def _get_semaforo(request: HttpRequest):
    return _uc(cfg.GetSemaforoUseCase).execute(request.require_principal())


def _put_semaforo(request: HttpRequest):
    return _uc(cfg.UpdateSemaforoUseCase).execute(request.require_principal(), request.json_body())


def _get_sla(request: HttpRequest):
    return _uc(cfg.GetSlaUseCase).execute(request.require_principal())


def _put_sla(request: HttpRequest):
    return _uc(cfg.UpdateSlaUseCase).execute(request.require_principal(), request.json_body())


def _get_automatizaciones(request: HttpRequest):
    return _uc(cfg.GetAutomatizacionesUseCase).execute(request.require_principal())


def _put_automatizaciones(request: HttpRequest):
    return _uc(cfg.ToggleAutomatizacionUseCase).execute(request.require_principal(), request.json_body())


def _get_feed(request: HttpRequest):
    return _uc(cfg.ListAutomatizacionesFeedUseCase).execute(
        request.require_principal(), request.query_str("regla"), request.query_str("dias")
    )


def _patch_feed(request: HttpRequest):
    return _uc(cfg.MarcarEventoLeidoUseCase).execute(request.require_principal(), request.path_param("id"))


def _get_cierre_mes(request: HttpRequest):
    return _uc(cfg.ListVentasMensualesUseCase).execute(request.require_principal())


def _put_cierre_mes(request: HttpRequest):
    return _uc(cfg.GuardarCierreMesUseCase).execute(request.require_principal(), request.json_body())


def _get_log(request: HttpRequest):
    return _uc(cfg.ListAuditLogUseCase).execute(
        request.require_principal(),
        tabla=request.query_str("tabla"),
        desde=request.query_str("desde"),
        hasta=request.query_str("hasta"),
        page=request.query_int("page", 1),
        formato=request.query_str("format"),
    )


# ── usuarios ──────────────────────────────────────────────────────────────
def _get_usuarios(request: HttpRequest):
    return _uc(cat.ListUsuariosConfigUseCase).execute(request.require_principal())


def _post_usuarios(request: HttpRequest):
    return created(_uc(cat.CreateUsuarioUseCase).execute(request.require_principal(), request.json_body()))


def _put_usuario(request: HttpRequest):
    return _uc(cat.UpdateUsuarioUseCase).execute(
        request.require_principal(), request.path_param("id"), request.json_body()
    )


# ── vendedores ────────────────────────────────────────────────────────────
def _get_vendedores(request: HttpRequest):
    return _uc(cat.ListVendedoresConfigUseCase).execute(request.require_principal())


def _post_vendedores(request: HttpRequest):
    return created(_uc(cat.CreateVendedorUseCase).execute(request.require_principal(), request.json_body()))


def _put_vendedor(request: HttpRequest):
    return _uc(cat.UpdateVendedorUseCase).execute(
        request.require_principal(), request.path_param("cod"), request.json_body()
    )


def _delete_vendedor(request: HttpRequest):
    return _uc(cat.DeactivateVendedorUseCase).execute(request.require_principal(), request.path_param("cod"))


# ── supervisores ──────────────────────────────────────────────────────────
def _get_supervisores(request: HttpRequest):
    return _uc(cat.ListSupervisoresConfigUseCase).execute(request.require_principal())


def _post_supervisores(request: HttpRequest):
    return created(_uc(cat.CreateSupervisorUseCase).execute(request.require_principal(), request.json_body()))


def _put_supervisor(request: HttpRequest):
    return _uc(cat.UpdateSupervisorUseCase).execute(
        request.require_principal(), request.path_param("cod"), request.json_body()
    )


def _delete_supervisor(request: HttpRequest):
    return _uc(cat.DeactivateSupervisorUseCase).execute(
        request.require_principal(), request.path_param("cod")
    )


# ── directorio ────────────────────────────────────────────────────────────
def _get_directorio(request: HttpRequest):
    return _uc(cat.ListDirectorioUseCase).execute(
        request.require_principal(), request.query_str("area"), request.query_str("q")
    )


def _get_directorio_activo(request: HttpRequest):
    return _uc(cat.ListContactosDirectorioUseCase).execute(
        request.require_principal(),
        request.query_str("q"),
        request.query_str("area"),
        request.query_int("limit", minimum=1, maximum=1000),
    )


def _post_directorio(request: HttpRequest):
    return created(_uc(cat.CreateContactoUseCase).execute(request.require_principal(), request.json_body()))


def _put_contacto(request: HttpRequest):
    return _uc(cat.UpdateContactoUseCase).execute(
        request.require_principal(), request.path_param("id"), request.json_body()
    )


def _delete_contacto(request: HttpRequest):
    return _uc(cat.DeactivateContactoUseCase).execute(request.require_principal(), request.path_param("id"))


# ── portafolio acotado ────────────────────────────────────────────────────
def _get_rutas(request: HttpRequest):
    return _uc(cat.ListRutasUseCase).execute(request.require_principal())


def _post_rutas(request: HttpRequest):
    return created(_uc(cat.CreateRutaUseCase).execute(request.require_principal(), request.json_body()))


def _put_ruta(request: HttpRequest):
    return _uc(cat.UpdateRutaUseCase).execute(
        request.require_principal(), request.path_param("principal_cod"), request.json_body()
    )


def _delete_ruta(request: HttpRequest):
    return _uc(cat.DeactivateRutaUseCase).execute(
        request.require_principal(), request.path_param("principal_cod")
    )


ROUTES = {
    ("GET", "/configuracion"): _pantalla,
    ("GET", "/configuracion/parametros"): _get_parametros,
    ("PUT", "/configuracion/parametros"): _put_parametros,
    ("GET", "/configuracion/semaforo"): _get_semaforo,
    ("PUT", "/configuracion/semaforo"): _put_semaforo,
    ("GET", "/configuracion/sla"): _get_sla,
    ("PUT", "/configuracion/sla"): _put_sla,
    ("GET", "/configuracion/automatizaciones"): _get_automatizaciones,
    ("PUT", "/configuracion/automatizaciones"): _put_automatizaciones,
    ("GET", "/configuracion/automatizaciones/feed"): _get_feed,
    ("PATCH", "/configuracion/automatizaciones/feed/{id}"): _patch_feed,
    ("GET", "/configuracion/cierre-mes"): _get_cierre_mes,
    ("PUT", "/configuracion/cierre-mes"): _put_cierre_mes,
    ("GET", "/configuracion/log"): _get_log,
    ("GET", "/configuracion/usuarios"): _get_usuarios,
    ("POST", "/configuracion/usuarios"): _post_usuarios,
    ("PUT", "/configuracion/usuarios/{id}"): _put_usuario,
    ("GET", "/configuracion/vendedores"): _get_vendedores,
    ("POST", "/configuracion/vendedores"): _post_vendedores,
    ("PUT", "/configuracion/vendedores/{cod}"): _put_vendedor,
    ("DELETE", "/configuracion/vendedores/{cod}"): _delete_vendedor,
    ("GET", "/configuracion/supervisores"): _get_supervisores,
    ("POST", "/configuracion/supervisores"): _post_supervisores,
    ("PUT", "/configuracion/supervisores/{cod}"): _put_supervisor,
    ("DELETE", "/configuracion/supervisores/{cod}"): _delete_supervisor,
    ("GET", "/configuracion/directorio"): _get_directorio,
    ("POST", "/configuracion/directorio"): _post_directorio,
    ("PUT", "/configuracion/directorio/{id}"): _put_contacto,
    ("DELETE", "/configuracion/directorio/{id}"): _delete_contacto,
    ("GET", "/configuracion/directorio-activo"): _get_directorio_activo,
    ("GET", "/configuracion/portafolio-acotado"): _get_rutas,
    ("POST", "/configuracion/portafolio-acotado"): _post_rutas,
    ("PUT", "/configuracion/portafolio-acotado/{principal_cod}"): _put_ruta,
    ("DELETE", "/configuracion/portafolio-acotado/{principal_cod}"): _delete_ruta,
}

configuracion_handler = api_router(ROUTES)
