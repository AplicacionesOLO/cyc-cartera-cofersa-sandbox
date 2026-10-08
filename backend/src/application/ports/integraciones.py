"""Ports de integraciones externas: Gmail/Google OAuth, Calendar, modelo de lenguaje y HTTP externo.

En el origen estas llamadas vivían en las API Routes de Next.js (fetch a googleapis, Anthropic,
BCCR, Hacienda, N8N). Los casos de uso dependen de estos ports; los adapters están en
``infrastructure/external``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class EmailAttachment:
    filename: str
    content_type: str
    data: bytes


@dataclass(frozen=True)
class EmailMessage:
    to: tuple[str, ...]
    subject: str
    html: str
    cc: tuple[str, ...] = ()
    bcc: tuple[str, ...] = ()
    reply_to: str | None = None
    sender_name: str | None = None
    attachments: tuple[EmailAttachment, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class GoogleTokens:
    access_token: str
    refresh_token: str | None
    scope: str = ""


class GoogleOAuth(ABC):
    @abstractmethod
    def authorize_url(self, redirect_uri: str, state: str, login_hint: str | None) -> str:
        """URL de consentimiento (access_type=offline, prompt=consent, scopes Gmail + Calendar)."""

    @abstractmethod
    def exchange_code(self, code: str, redirect_uri: str) -> GoogleTokens: ...

    @abstractmethod
    def refresh_access_token(self, refresh_token: str) -> str | None:
        """Access token vigente a partir del refresh token, o None si Google lo rechaza."""


class GmailSender(ABC):
    @abstractmethod
    def send(self, access_token: str, sender_email: str, message: EmailMessage) -> str:
        """Envía con la Gmail API en nombre de ``sender_email``. Devuelve el id del mensaje."""


class GoogleCalendar(ABC):
    @abstractmethod
    def list_events(self, access_token: str, time_min: str, time_max: str) -> list[dict[str, Any]]:
        """Eventos del calendario primario (items crudos de Calendar API v3)."""


class LanguageModel(ABC):
    @abstractmethod
    def complete(self, *, model: str, system: str | None, prompt: str, max_tokens: int) -> str:
        """Texto de la respuesta del modelo."""


class ExternalHttp(ABC):
    @abstractmethod
    def get_json(
        self,
        url: str,
        *,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        timeout: float = 15,
    ) -> tuple[int, Any]:
        """(status, cuerpo JSON o None)."""

    @abstractmethod
    def get_text(
        self,
        url: str,
        *,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        timeout: float = 15,
    ) -> tuple[int, str]: ...

    @abstractmethod
    def post_json(
        self,
        url: str,
        body: Any,
        *,
        headers: dict[str, str] | None = None,
        timeout: float = 15,
    ) -> tuple[int, Any]: ...


class IntegrationConfig(ABC):
    """Valores de integración (secretos y URLs) leídos de Secrets Manager en runtime."""

    @abstractmethod
    def get(self, key: str) -> str | None: ...

    def require(self, key: str) -> str:
        value = self.get(key)
        if not value:
            from domain.exceptions import BusinessRuleViolation

            raise BusinessRuleViolation(
                f"Integración no configurada ({key}).", code="integracion_no_configurada"
            )
        return value
