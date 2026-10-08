"""Envío de correo en nombre del usuario (Gmail API con su refresh token).

Reemplaza ``resolveGmailToken`` + ``fetch('https://gmail.googleapis.com/...')`` de las API Routes.
En el origen el access token venía en la sesión del origen (``provider_token``); con Cognito no hay
token de Google en la sesión, así que siempre se usa el refresh token persistido en
``usuarios.google_refresh_token`` (el mismo que ya guardaba ``/auth/callback``).
"""

from __future__ import annotations

from application.ports.app_unit_of_work import AppUnitOfWork
from application.ports.integraciones import EmailMessage, GmailSender, GoogleOAuth
from domain.entities.usuario import Usuario
from domain.exceptions import BusinessRuleViolation

MSG_GMAIL_NO_CONECTADO = (
    "No se pudo obtener acceso a Gmail. Conecte su cuenta de Gmail desde el SIC (cerrar sesión y "
    "volver a entrar) e intente de nuevo."
)


class UsuarioMailer:
    def __init__(self, oauth: GoogleOAuth, gmail: GmailSender) -> None:
        self._oauth = oauth
        self._gmail = gmail

    def access_token_for(self, uow: AppUnitOfWork, usuario: Usuario) -> str:
        refresh = uow.usuarios.get_google_refresh_token(usuario.email)
        token = self._oauth.refresh_access_token(refresh) if refresh else None
        if not token:
            raise BusinessRuleViolation(MSG_GMAIL_NO_CONECTADO, code="gmail_no_conectado")
        return token

    def send(self, uow: AppUnitOfWork, usuario: Usuario, message: EmailMessage) -> str:
        return self._gmail.send(self.access_token_for(uow, usuario), usuario.email, message)
