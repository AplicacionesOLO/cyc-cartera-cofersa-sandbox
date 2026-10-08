"""Usuario actual: perfil, "Ver como", conexión de Gmail/Calendar.

- ``GetMeUseCase`` reemplaza ``getUsuarioActual()`` (auth.getUser + SELECT usuarios).
- ``PreviewRolUseCase`` reemplaza la validación de ``POST /api/preview-rol`` (la cookie la fija el front).
- ``GoogleAuthorizeUrlUseCase`` / ``ConnectGoogleUseCase`` reemplazan la captura del
  ``provider_refresh_token`` en ``/auth/callback`` (Cognito no expone tokens de Google).
- ``ListCalendarEventsUseCase`` reemplaza ``googleCalendarService`` (fetch con provider_token).
"""

from __future__ import annotations

from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.ports.integraciones import GoogleCalendar, GoogleOAuth
from application.use_cases.common import require_text, require_usuario
from application.use_cases.mailer import UsuarioMailer
from domain.entities.usuario import ROLES_PREVIEW
from domain.exceptions import BusinessRuleViolation, ForbiddenError, ValidationError


class GetMeUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            gmail = bool(uow.usuarios.get_google_refresh_token(usuario.email))
            total_equipo = uow.usuarios.count_activos() or 5  # fallback del layout original
            ultima_sync = uow.usuarios.ultima_sync_cartera()
        return {
            "user": {"email": usuario.email},
            "perfil": usuario.to_dict(),
            "rol": usuario.rol,
            "gmail_conectado": gmail,
            "total_equipo": total_equipo,
            "ultima_sync": ultima_sync,
        }


class ListAnalistasConCarteraUseCase:
    """Filtro "por analista" (antes FILTRO_ROL_ELEGIBLE_CARTERA + emailsConCarteraReal en cada pantalla)."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal) -> list[dict[str, str]]:
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
            return uow.usuarios.list_analistas_con_cartera()


class PreviewRolUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
        if not usuario.es_coordinador:
            raise ForbiddenError('Solo Coordinador puede usar "Ver como"')
        rol = body.get("rol")
        if not rol:
            return {"ok": True, "previsualizando": False}
        if rol not in ROLES_PREVIEW:
            raise ValidationError("Rol de previsualización inválido")
        return {"ok": True, "previsualizando": True, "rol": rol}


class GoogleAuthorizeUrlUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory, oauth: GoogleOAuth) -> None:
        self._uow_factory = uow_factory
        self._oauth = oauth

    def execute(self, principal: Principal, redirect_uri: str | None, state: str | None) -> dict[str, str]:
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
        url = self._oauth.authorize_url(
            require_text(redirect_uri, "redirect_uri"), require_text(state, "state"), usuario.email
        )
        return {"url": url}


class ConnectGoogleUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory, oauth: GoogleOAuth) -> None:
        self._uow_factory = uow_factory
        self._oauth = oauth

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        code = require_text(body.get("code"), "code")
        redirect_uri = require_text(body.get("redirect_uri"), "redirect_uri")
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            tokens = self._oauth.exchange_code(code, redirect_uri)
            if not tokens.refresh_token:
                if uow.usuarios.get_google_refresh_token(usuario.email):
                    return {"ok": True, "gmail_conectado": True}
                raise BusinessRuleViolation(
                    "Google no devolvió autorización permanente. Intente de nuevo aceptando los permisos.",
                    code="google_sin_refresh_token",
                )
            uow.usuarios.set_google_refresh_token(usuario.email, tokens.refresh_token)
            uow.commit()
        return {"ok": True, "gmail_conectado": True}


class ListCalendarEventsUseCase:
    def __init__(
        self, uow_factory: UnitOfWorkFactory, mailer: UsuarioMailer, calendar: GoogleCalendar
    ) -> None:
        self._uow_factory = uow_factory
        self._mailer = mailer
        self._calendar = calendar

    def execute(
        self, principal: Principal, time_min: str | None, time_max: str | None
    ) -> list[dict[str, Any]]:
        start = require_text(time_min, "timeMin")
        end = require_text(time_max, "timeMax")
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            try:
                token = self._mailer.access_token_for(uow, usuario)
            except BusinessRuleViolation:
                return []  # igual que el origen: sin token de Google el calendario queda vacío
        return self._calendar.list_events(token, start, end)
