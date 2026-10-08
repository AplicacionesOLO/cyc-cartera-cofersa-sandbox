"""Handlers del módulo Reportes (Lambda ``ReportesApi``)."""

from __future__ import annotations

from application.use_cases import reportes as uc
from application.use_cases.reportes_envio import EnviarReporteUseCase
from application.use_cases.reportes_gerencia import GetCierreMensualUseCase, GetResumenEjecutivoUseCase
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest
from entrypoints.lambda_handlers.router import api_router


def _aging(request: HttpRequest):
    return uc.GetAgingUseCase(container.uow_factory).execute(request.require_principal())


def _cei(request: HttpRequest):
    return uc.GetCeiUseCase(container.uow_factory).execute(
        request.require_principal(), request.query_str("anio"), request.query_str("mes")
    )


def _cei_cierre(request: HttpRequest):
    return uc.TomarCierreCarteraUseCase(container.uow_factory).execute(
        request.require_principal(), request.json_body()
    )


def _efectividad(request: HttpRequest):
    return uc.GetEfectividadUseCase(container.uow_factory).execute(
        request.require_principal(), request.query_str("ini"), request.query_str("fin")
    )


def _icp_vendedor(request: HttpRequest):
    return uc.GetIcpVendedorUseCase(container.uow_factory).execute(
        request.require_principal(), request.query_str("meses")
    )


def _migracion(request: HttpRequest):
    return uc.GetMigracionMoraUseCase(container.uow_factory).execute(
        request.require_principal(),
        request.query_str("anio"),
        request.query_str("mes"),
        request.query_str("supervisor_cod"),
        request.query_str("vendedor_cod"),
    )


def _migracion_filtros(request: HttpRequest):
    return uc.GetMigracionFiltrosUseCase(container.uow_factory).execute(request.require_principal())


def _mora_vendedor(request: HttpRequest):
    return uc.GetMoraVendedorUseCase(container.uow_factory).execute(
        request.require_principal(), request.query_str("email")
    )


def _bloqueados(request: HttpRequest):
    return uc.GetBloqueadosUseCase(container.uow_factory).execute(
        request.require_principal(), request.query_str("email"), request.query_bool("snapshot")
    )


def _plazo_especial(request: HttpRequest):
    return uc.GetPlazoEspecialUseCase(container.uow_factory).execute(
        request.require_principal(), request.query_str("email")
    )


def _portafolio_destinatarios(request: HttpRequest):
    return uc.GetPortafolioDestinatariosUseCase(container.uow_factory).execute(request.require_principal())


def _dimensiones(request: HttpRequest):
    return uc.ListDimensionOpcionesUseCase(container.uow_factory).execute(
        request.require_principal(), request.query_str("tipo")
    )


def _estados_cuenta(request: HttpRequest):
    return uc.GetEstadosCuentaUseCase(container.uow_factory).execute(
        request.require_principal(), request.query_str("email")
    )


def _cartera_vencida(request: HttpRequest):
    return uc.GetCarteraVencidaUseCase(container.uow_factory).execute(request.require_principal())


def _gestiones_periodo(request: HttpRequest):
    return uc.GetGestionesPeriodoUseCase(container.uow_factory).execute(
        request.require_principal(), request.query_str("ini"), request.query_str("fin")
    )


def _resumen_ejecutivo(request: HttpRequest):
    return GetResumenEjecutivoUseCase(container.uow_factory).execute(request.require_principal())


def _cierre_mensual(request: HttpRequest):
    return GetCierreMensualUseCase(container.uow_factory).execute(
        request.require_principal(), request.query_str("anio"), request.query_str("mes")
    )


def _enviar(request: HttpRequest):
    return EnviarReporteUseCase(container.uow_factory, container.mailer()).execute(
        request.require_principal(), request.json_body()
    )


ROUTES = {
    ("GET", "/reportes/aging"): _aging,
    ("GET", "/reportes/cei"): _cei,
    ("POST", "/reportes/cei/cierre"): _cei_cierre,
    ("GET", "/reportes/efectividad"): _efectividad,
    ("GET", "/reportes/icp-vendedor"): _icp_vendedor,
    ("GET", "/reportes/migracion-mora"): _migracion,
    ("GET", "/reportes/migracion-mora/filtros"): _migracion_filtros,
    ("GET", "/reportes/mora-vendedor"): _mora_vendedor,
    ("GET", "/reportes/bloqueados"): _bloqueados,
    ("GET", "/reportes/plazo-especial"): _plazo_especial,
    ("GET", "/reportes/portafolio-destinatarios"): _portafolio_destinatarios,
    ("GET", "/reportes/dimensiones"): _dimensiones,
    ("GET", "/reportes/estados-cuenta"): _estados_cuenta,
    ("GET", "/reportes/cartera-vencida"): _cartera_vencida,
    ("GET", "/reportes/gestiones-periodo"): _gestiones_periodo,
    ("GET", "/reportes/resumen-ejecutivo"): _resumen_ejecutivo,
    ("GET", "/reportes/cierre-mensual"): _cierre_mensual,
    ("POST", "/reportes/enviar"): _enviar,
}

reportes_handler = api_router(ROUTES)
