"""Handlers del Presupuesto de Cobro, Recuperación y Proyección (Lambda ``PresupuestoApi``)."""

from __future__ import annotations

from application.use_cases import presupuesto as uc
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest
from entrypoints.lambda_handlers.router import api_router


def _uc(cls):
    return cls(container.uow_factory)


def _uc_enviar() -> uc.EnviarCorreoPresupuestoUseCase:
    return uc.EnviarCorreoPresupuestoUseCase(container.uow_factory, container.mailer())


def _presupuesto_mes(request: HttpRequest):
    return _uc(uc.GetPresupuestoMesUseCase).execute(
        request.require_principal(), request.query_str("anio"), request.query_str("mes")
    )


def _congelar(request: HttpRequest):
    return _uc(uc.CongelarPresupuestoUseCase).execute(request.require_principal(), request.json_body())


def _ajustar_meta(request: HttpRequest):
    return _uc(uc.AjustarMetaVendedorUseCase).execute(request.require_principal(), request.json_body())


def _reasignar(request: HttpRequest):
    return _uc(uc.ReasignarClientePresupuestoUseCase).execute(
        request.require_principal(), request.json_body()
    )


def _vendedores(request: HttpRequest):
    return _uc(uc.ListVendedoresPresupuestoUseCase).execute(request.require_principal())


def _destinatarios(request: HttpRequest):
    return _uc(uc.GetDestinatariosPresupuestoUseCase).execute(request.require_principal())


def _enviar(request: HttpRequest):
    return _uc_enviar().execute(request.require_principal(), request.json_body())


def _recuperacion(request: HttpRequest):
    return _uc(uc.GetRecuperacionMesUseCase).execute(
        request.require_principal(), request.query_str("anio"), request.query_str("mes")
    )


def _proyeccion(request: HttpRequest):
    return _uc(uc.GetProyeccionCobroUseCase).execute(
        request.require_principal(), request.query_int("semanas"), request.query_int("semanas_pasadas")
    )


def _sin_pago(request: HttpRequest):
    return _uc(uc.GetSinPagoUseCase).execute(
        request.require_principal(), request.query_str("anio"), request.query_str("mes")
    )


def _recuperacion_mom(request: HttpRequest):
    return _uc(uc.GetRecuperacionMomUseCase).execute(
        request.require_principal(), request.query_int("meses"), request.query_str("email")
    )


def _recuperacion_periodo(request: HttpRequest):
    return _uc(uc.GetRecuperacionPeriodoUseCase).execute(
        request.require_principal(),
        request.query_str("ini"),
        request.query_str("fin"),
        request.query_str("email"),
        request.query_str("group"),
    )


def _recuperacion_tramos(request: HttpRequest):
    return _uc(uc.GetRecuperacionTramosUseCase).execute(
        request.require_principal(),
        request.query_str("ini"),
        request.query_str("fin"),
        request.query_str("email"),
        request.query_str("group"),
    )


def _meta_analista(request: HttpRequest):
    return _uc(uc.GetMetaAnalistaMesUseCase).execute(
        request.require_principal(),
        request.query_str("email"),
        request.query_str("anio"),
        request.query_str("mes"),
    )


ROUTES = {
    ("GET", "/presupuesto/mes"): _presupuesto_mes,
    ("POST", "/presupuesto/mes/congelar"): _congelar,
    ("POST", "/presupuesto/mes/meta"): _ajustar_meta,
    ("POST", "/presupuesto/mes/reasignar"): _reasignar,
    ("GET", "/presupuesto/vendedores"): _vendedores,
    ("GET", "/presupuesto/destinatarios"): _destinatarios,
    ("POST", "/presupuesto/enviar"): _enviar,
    ("GET", "/presupuesto/recuperacion"): _recuperacion,
    ("GET", "/presupuesto/proyeccion"): _proyeccion,
    ("GET", "/presupuesto/sin-pago"): _sin_pago,
    ("GET", "/presupuesto/recuperacion-mom"): _recuperacion_mom,
    ("GET", "/presupuesto/recuperacion-periodo"): _recuperacion_periodo,
    ("GET", "/presupuesto/recuperacion-tramos"): _recuperacion_tramos,
    ("GET", "/presupuesto/meta-analista"): _meta_analista,
}

presupuesto_handler = api_router(ROUTES)
