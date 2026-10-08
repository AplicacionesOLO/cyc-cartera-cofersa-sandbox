"""Notificaciones internas y chat del equipo.

- Notificaciones: antes el topbar leía/actualizaba ``notificaciones`` directo con el SDK anterior bajo las
  políticas RLS "Usuario ve/actualiza sus notificaciones" (usuario_id = id del perfil por email). Aquí el
  usuario_id sale SIEMPRE del perfil del principal; el que mande el front se ignora.
- Chat (``POST /api/chat`` + lectura directa de ``mensajes_chat``): la tabla ``mensajes_chat`` NO existe
  en el esquema real de producción, así que en el origen la carga fallaba ("No se pudieron cargar los
  mensajes.") y el envío respondía "Error al enviar el mensaje". Se conserva exactamente ese
  comportamiento (con las mismas validaciones previas) sin crear la tabla.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.use_cases.common import MSG_NO_AUTORIZADO, require_usuario
from domain.exceptions import (
    BusinessRuleViolation,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)

LIMITE_NOTIFICACIONES = 50
MAX_MENSAJE_CHAT = 1000
CHAT_NO_DISPONIBLE = "chat_no_disponible"


class ListNotificacionesUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, limit: int | None = None) -> list[dict[str, Any]]:
        tope = min(max(limit or LIMITE_NOTIFICACIONES, 1), LIMITE_NOTIFICACIONES)
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            return uow.notificaciones.list_por_usuario(usuario.id, tope)


class MarcarNotificacionLeidaUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, notificacion_id: str, body: dict[str, Any] | None) -> None:
        if body and body.get("leida") is False:
            raise ValidationError("Solo se puede marcar una notificación como leída.")
        try:
            nid = UUID(str(notificacion_id))
        except ValueError as error:
            raise NotFoundError("Notificación no encontrada") from error
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            if not uow.notificaciones.marcar_leida(usuario.id, nid):
                raise NotFoundError("Notificación no encontrada")
            uow.commit()


class MarcarTodasLeidasUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            actualizadas = uow.notificaciones.marcar_todas_leidas(usuario.id)
            uow.commit()
        return {"ok": True, "actualizadas": actualizadas}


class ListMensajesChatUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal) -> list[dict[str, Any]]:
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
        raise BusinessRuleViolation("No se pudieron cargar los mensajes.", code=CHAT_NO_DISPONIBLE)


class EnviarMensajeChatUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        mensaje = body.get("mensaje")
        texto = mensaje.strip() if isinstance(mensaje, str) else ""
        if not texto:
            raise ValidationError("El mensaje no puede estar vacío")
        if len(texto) > MAX_MENSAJE_CHAT:
            raise ValidationError("El mensaje excede los 1000 caracteres")
        email = (principal.email or "").strip()
        if not email:
            raise UnauthorizedError(MSG_NO_AUTORIZADO)
        with self._uow_factory(principal) as uow:
            if uow.usuarios.find_activo_by_email(email) is None:
                raise ForbiddenError("Usuario no encontrado")
        raise BusinessRuleViolation("Error al enviar el mensaje", code=CHAT_NO_DISPONIBLE)
