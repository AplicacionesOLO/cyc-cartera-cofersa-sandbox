"""Despachador de una Lambda por módulo: (método, recurso de API Gateway) → función.

Más de 40 endpoints ⇒ una Lambda por módulo (límite de recursos del stack). Cada módulo declara
``ROUTES = {("GET", "/clientes/{cod}"): _get_cliente, ...}`` y expone
``<modulo>_handler = api_router(ROUTES)``, que es el ``handler`` del manifest.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

from domain.exceptions import NotFoundError
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest, api_handler

Route = Callable[[HttpRequest], Any]


def api_router(routes: Mapping[tuple[str, str], Route], *, authenticated: bool = True) -> Callable:
    table = {(method.upper(), resource): func for (method, resource), func in routes.items()}

    def dispatch(request: HttpRequest) -> Any:
        func = table.get((request.method, request.resource))
        if func is None:
            raise NotFoundError("Ruta no encontrada.")
        return func(request)

    return api_handler(dispatch, principal_resolver=container.resolve_principal if authenticated else None)
