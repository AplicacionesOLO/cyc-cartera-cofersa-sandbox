"""Handlers de Análisis de Pagos y Pagos Aplicados (Lambda ``AnalisisPagosApi``)."""

from __future__ import annotations

from application.use_cases import analisis_pagos as uc
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest
from entrypoints.lambda_handlers.router import api_router

_RANKING_FILTROS = (
    "email",
    "meses",
    "offset",
    "limit",
    "clasificacion",
    "dimension",
    "vendedor_cod",
    "busqueda",
    "orden",
)


def _uc(cls):
    return cls(container.uow_factory)


def _ranking(request: HttpRequest):
    filtros = {key: request.query_str(key) for key in _RANKING_FILTROS}
    return _uc(uc.GetRankingClientesUseCase).execute(request.require_principal(), filtros)


def _perfil_vendedor(request: HttpRequest):
    return _uc(uc.GetPerfilVendedorUseCase).execute(
        request.require_principal(),
        request.query_str("email"),
        request.query_str("meses"),
        request.query_str("orden"),
    )


def _alertas(request: HttpRequest):
    return _uc(uc.GetAlertasDeterioroUseCase).execute(request.require_principal(), request.query_str("email"))


def _concentracion(request: HttpRequest):
    return _uc(uc.GetConcentracionUseCase).execute(request.require_principal())


def _pagos_mes(request: HttpRequest):
    return _uc(uc.GetPagosMesResumenUseCase).execute(
        request.require_principal(), request.query_str("anio"), request.query_str("mes")
    )


def _marcar_anulados(request: HttpRequest):
    return _uc(uc.MarcarPagosAnuladosUseCase).execute(request.require_principal(), request.json_body())


def _desmarcar_anulado(request: HttpRequest):
    return _uc(uc.DesmarcarPagoAnuladoUseCase).execute(
        request.require_principal(), request.path_param("no_recibo")
    )


def _descartar_duplicado(request: HttpRequest):
    return _uc(uc.DescartarDuplicadoUseCase).execute(request.require_principal(), request.json_body())


def _revertir_descarte(request: HttpRequest):
    return _uc(uc.RevertirDescarteDuplicadoUseCase).execute(
        request.require_principal(), request.path_param("no_recibo")
    )


ROUTES = {
    ("GET", "/analisis-pagos/ranking-clientes"): _ranking,
    ("GET", "/analisis-pagos/perfil-vendedor"): _perfil_vendedor,
    ("GET", "/analisis-pagos/alertas-deterioro"): _alertas,
    ("GET", "/analisis-pagos/concentracion"): _concentracion,
    ("GET", "/analisis-pagos/pagos-mes"): _pagos_mes,
    ("POST", "/pagos-anulados"): _marcar_anulados,
    ("DELETE", "/pagos-anulados/{no_recibo}"): _desmarcar_anulado,
    ("POST", "/pagos-duplicado-descartado"): _descartar_duplicado,
    ("DELETE", "/pagos-duplicado-descartado/{no_recibo}"): _revertir_descarte,
}

analisis_pagos_handler = api_router(ROUTES)
