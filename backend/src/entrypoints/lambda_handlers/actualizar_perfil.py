"""Handlers públicos del portal de actualización de perfil (Lambda ``ActualizarPerfilApi``, sin Cognito).

El cliente externo abre el link que recibió por correo; la autorización es el token de un solo uso
(SHA-256 en la base, vence en 7 días, deja de servir al pasar a DATOS_RECIBIDOS).
"""

from __future__ import annotations

from application.use_cases import auditoria_legal_solicitudes as solicitudes
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest
from entrypoints.lambda_handlers.router import api_router


def _expedientes():
    return container.storage("expedientes-clientes")


def _uc_validar():
    return solicitudes.ValidarTokenActualizacionUseCase(container.uow_factory)


def _uc_uploads():
    return solicitudes.CrearUploadsActualizacionUseCase(container.uow_factory, _expedientes())


def _uc_enviar():
    return solicitudes.EnviarActualizacionPerfilUseCase(container.uow_factory, _expedientes())


def _validar(request: HttpRequest):
    return _uc_validar().execute(request.path_param("token"))


def _uploads(request: HttpRequest):
    return _uc_uploads().execute(request.path_param("token"), request.json_body())


def _enviar(request: HttpRequest):
    return _uc_enviar().execute(request.path_param("token"), request.json_body())


ROUTES = {
    ("GET", "/actualizar-perfil/{token}"): _validar,
    ("POST", "/actualizar-perfil/{token}"): _enviar,
    ("POST", "/actualizar-perfil/{token}/archivos"): _uploads,
}

actualizar_perfil_handler = api_router(ROUTES, authenticated=False)
