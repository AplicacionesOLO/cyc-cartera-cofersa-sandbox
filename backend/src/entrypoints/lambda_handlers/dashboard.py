"""Handlers del Dashboard (coordinador/gerencia y analista) y de Mi Cartera."""

from __future__ import annotations

from application.use_cases.dashboard import (
    GetDashboardAnalistaUseCase,
    GetDashboardCoordinadorUseCase,
    GetMiCarteraUseCase,
)
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest
from entrypoints.lambda_handlers.router import api_router


def _uc_coordinador() -> GetDashboardCoordinadorUseCase:
    return GetDashboardCoordinadorUseCase(container.uow_factory)


def _uc_analista() -> GetDashboardAnalistaUseCase:
    return GetDashboardAnalistaUseCase(container.uow_factory)


def _uc_mi_cartera() -> GetMiCarteraUseCase:
    return GetMiCarteraUseCase(container.uow_factory)


def _coordinador(request: HttpRequest):
    return _uc_coordinador().execute(request.require_principal())


def _analista(request: HttpRequest):
    return _uc_analista().execute(request.require_principal(), request.query_str("email"))


def _mi_cartera(request: HttpRequest):
    return _uc_mi_cartera().execute(request.require_principal(), request.query_str("email"))


ROUTES = {
    ("GET", "/dashboard/coordinador"): _coordinador,
    ("GET", "/dashboard/analista"): _analista,
    ("GET", "/dashboard/mi-cartera"): _mi_cartera,
}

dashboard_handler = api_router(ROUTES)
