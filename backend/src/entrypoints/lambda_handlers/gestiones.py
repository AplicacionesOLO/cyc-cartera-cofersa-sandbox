"""Handlers de gestiones: bandeja, registro/edición, notas rápidas y bitácora con IA (GestionesApi)."""

from __future__ import annotations

from application.use_cases.gestiones import (
    DeleteGestionUseCase,
    FormalizarBitacoraUseCase,
    GetNotaRapidaUseCase,
    GetReferenciasGestionesUseCase,
    ListCodigosContribuyenteUseCase,
    ListGestionesUseCase,
    RegistrarGestionRapidaUseCase,
    RegistrarGestionUseCase,
    SaveNotaRapidaUseCase,
    UpdateGestionUseCase,
)
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest
from entrypoints.lambda_handlers.router import api_router


def _uc(cls):
    return cls(container.uow_factory)


def _uc_formalizar():
    return FormalizarBitacoraUseCase(container.uow_factory, container.language_model())


def _id_param(request: HttpRequest):
    """DELETE: ``?id=`` (HttpClient) o ``{id}`` en el cuerpo (forma del origen)."""
    body = request.json()
    return request.query_str("id") or (body.get("id") if isinstance(body, dict) else None)


def _list(request: HttpRequest):
    return _uc(ListGestionesUseCase).execute(
        request.require_principal(),
        request.query_str("analista"),
        request.query_int("offset", 0, minimum=0),
        request.query_int("limit", 1000, minimum=1),
    )


def _referencias(request: HttpRequest):
    return _uc(GetReferenciasGestionesUseCase).execute(
        request.require_principal(), request.query_str("analista")
    )


def _codigos_contribuyente(request: HttpRequest):
    return _uc(ListCodigosContribuyenteUseCase).execute(
        request.require_principal(), request.query_str("contribuyente"), request.query_str("excluir")
    )


def _rapida(request: HttpRequest):
    return _uc(RegistrarGestionRapidaUseCase).execute(request.require_principal(), request.json_body())


def _update(request: HttpRequest):
    return _uc(UpdateGestionUseCase).execute(request.require_principal(), request.json_body())


def _delete(request: HttpRequest):
    return _uc(DeleteGestionUseCase).execute(request.require_principal(), _id_param(request))


def _nueva(request: HttpRequest):
    return _uc(RegistrarGestionUseCase).execute(request.require_principal(), request.json_body())


def _get_nota(request: HttpRequest):
    return _uc(GetNotaRapidaUseCase).execute(request.require_principal(), request.query_str("fecha"))


def _save_nota(request: HttpRequest):
    return _uc(SaveNotaRapidaUseCase).execute(request.require_principal(), request.json_body())


def _formalizar(request: HttpRequest):
    return _uc_formalizar().execute(request.require_principal(), request.json_body())


ROUTES = {
    ("GET", "/gestiones"): _list,
    ("GET", "/gestiones/referencias"): _referencias,
    ("GET", "/gestiones/codigos-contribuyente"): _codigos_contribuyente,
    ("POST", "/gestiones/rapida"): _rapida,
    ("PATCH", "/clientes/gestiones"): _update,
    ("DELETE", "/clientes/gestiones"): _delete,
    ("POST", "/clientes/gestiones/nueva"): _nueva,
    ("GET", "/notas-rapidas"): _get_nota,
    ("POST", "/notas-rapidas"): _save_nota,
    ("POST", "/ai/formalizar-bitacora"): _formalizar,
}

gestiones_handler = api_router(ROUTES)
