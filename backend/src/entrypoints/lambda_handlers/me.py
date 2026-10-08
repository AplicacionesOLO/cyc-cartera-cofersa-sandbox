"""Handlers del usuario actual: perfil, "Ver como", Gmail/Calendar."""

from __future__ import annotations

from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest
from entrypoints.lambda_handlers.router import api_router


def _get_me(request: HttpRequest):
    return container.get_me().execute(request.require_principal())


def _analistas_con_cartera(request: HttpRequest):
    return container.list_analistas_con_cartera().execute(request.require_principal())


def _preview_rol(request: HttpRequest):
    return container.preview_rol().execute(request.require_principal(), request.json_body())


def _google_authorize_url(request: HttpRequest):
    return container.google_authorize_url().execute(
        request.require_principal(), request.query_str("redirect_uri"), request.query_str("state")
    )


def _connect_google(request: HttpRequest):
    return container.connect_google().execute(request.require_principal(), request.json_body())


def _calendar_events(request: HttpRequest):
    return container.list_calendar_events().execute(
        request.require_principal(), request.query_str("timeMin"), request.query_str("timeMax")
    )


ROUTES = {
    ("GET", "/me"): _get_me,
    ("GET", "/me/analistas-con-cartera"): _analistas_con_cartera,
    ("POST", "/me/preview-rol"): _preview_rol,
    ("GET", "/me/google/authorize-url"): _google_authorize_url,
    ("POST", "/me/google/connect"): _connect_google,
    ("GET", "/me/calendar/events"): _calendar_events,
}

me_handler = api_router(ROUTES)
