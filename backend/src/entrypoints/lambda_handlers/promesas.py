"""Handlers del centro de seguimiento de promesas (PromesasApi)."""

from __future__ import annotations

from application.use_cases.promesas import (
    DeletePromesaUseCase,
    ListPromesasUseCase,
    ReprogramarPromesaUseCase,
    ValidarPromesaUseCase,
)
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest
from entrypoints.lambda_handlers.router import api_router


def _uc(cls):
    return cls(container.uow_factory)


def _id_param(request: HttpRequest):
    """DELETE: ``?id=`` (HttpClient) o ``{id}`` en el cuerpo (forma del origen)."""
    body = request.json()
    return request.query_str("id") or (body.get("id") if isinstance(body, dict) else None)


def _list(request: HttpRequest):
    return _uc(ListPromesasUseCase).execute(request.require_principal(), request.query_str("analista"))


def _validar(request: HttpRequest):
    return _uc(ValidarPromesaUseCase).execute(request.require_principal(), request.json_body())


def _delete(request: HttpRequest):
    return _uc(DeletePromesaUseCase).execute(request.require_principal(), _id_param(request))


def _reprogramar(request: HttpRequest):
    return _uc(ReprogramarPromesaUseCase).execute(request.require_principal(), request.json_body())


ROUTES = {
    ("GET", "/promesas"): _list,
    ("PATCH", "/clientes/promesas"): _validar,
    ("DELETE", "/clientes/promesas"): _delete,
    ("POST", "/clientes/promesas/reprogramar"): _reprogramar,
}

promesas_handler = api_router(ROUTES)
