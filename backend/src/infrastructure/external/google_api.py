"""Adapters de Google: OAuth (refresh token), Gmail API (envío) y Calendar API v3."""

from __future__ import annotations

import base64
import json
import logging
import urllib.parse
from email.message import EmailMessage as MimeMessage
from email.utils import formataddr
from typing import Any

from application.ports.integraciones import (
    EmailMessage,
    GmailSender,
    GoogleCalendar,
    GoogleOAuth,
    GoogleTokens,
    IntegrationConfig,
)
from domain.exceptions import BusinessRuleViolation
from infrastructure.external.http_client import request

_logger = logging.getLogger(__name__)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
SCOPES = (
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events",
)


class GoogleOAuthClient(GoogleOAuth):
    def __init__(self, config: IntegrationConfig) -> None:
        self._config = config

    def authorize_url(self, redirect_uri: str, state: str, login_hint: str | None) -> str:
        params = {
            "client_id": self._config.require("google_client_id"),
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
        }
        if login_hint:
            params["login_hint"] = login_hint
        return f"{AUTH_URL}?{urllib.parse.urlencode(params)}"

    def _token(self, form: dict[str, str]) -> dict[str, Any]:
        form = {
            "client_id": self._config.require("google_client_id"),
            "client_secret": self._config.require("google_client_secret"),
            **form,
        }
        status, raw = request(
            "POST",
            TOKEN_URL,
            data=urllib.parse.urlencode(form).encode("utf-8"),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        data = json.loads(raw.decode("utf-8") or "{}")
        if status != 200:
            _logger.warning("google token error", extra={"status": status, "error": data.get("error")})
            return {}
        return data

    def exchange_code(self, code: str, redirect_uri: str) -> GoogleTokens:
        data = self._token({"code": code, "redirect_uri": redirect_uri, "grant_type": "authorization_code"})
        if not data.get("access_token"):
            raise BusinessRuleViolation("Google rechazó la autorización. Intente de nuevo.",
                                        code="google_oauth_error")
        return GoogleTokens(data["access_token"], data.get("refresh_token"), data.get("scope", ""))

    def refresh_access_token(self, refresh_token: str) -> str | None:
        data = self._token({"refresh_token": refresh_token, "grant_type": "refresh_token"})
        return data.get("access_token")


def build_mime(sender_email: str, message: EmailMessage) -> MimeMessage:
    mime = MimeMessage()
    mime["From"] = formataddr((message.sender_name, sender_email)) if message.sender_name else sender_email
    mime["To"] = ", ".join(message.to)
    if message.cc:
        mime["Cc"] = ", ".join(message.cc)
    if message.bcc:
        mime["Bcc"] = ", ".join(message.bcc)
    if message.reply_to:
        mime["Reply-To"] = message.reply_to
    mime["Subject"] = message.subject
    mime.set_content("Este mensaje requiere un cliente de correo con soporte HTML.")
    mime.add_alternative(message.html, subtype="html")
    for attachment in message.attachments:
        maintype, _, subtype = attachment.content_type.partition("/")
        mime.add_attachment(attachment.data, maintype=maintype or "application",
                            subtype=subtype or "octet-stream", filename=attachment.filename)
    return mime


class GmailApiSender(GmailSender):
    def send(self, access_token: str, sender_email: str, message: EmailMessage) -> str:
        raw = base64.urlsafe_b64encode(build_mime(sender_email, message).as_bytes()).decode("ascii")
        status, body = request(
            "POST",
            GMAIL_SEND_URL,
            data=json.dumps({"raw": raw}).encode("utf-8"),
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            timeout=25,
        )
        data = json.loads(body.decode("utf-8") or "{}")
        if status >= 300:
            detail = (data.get("error") or {}).get("message") if isinstance(data, dict) else None
            raise BusinessRuleViolation(f"Gmail rechazó el envío: {detail or status}", code="gmail_error")
        return str(data.get("id", ""))


class GoogleCalendarClient(GoogleCalendar):
    def list_events(self, access_token: str, time_min: str, time_max: str) -> list[dict[str, Any]]:
        params = urllib.parse.urlencode({"timeMin": time_min, "timeMax": time_max, "singleEvents": "true",
                                         "orderBy": "startTime", "maxResults": "100"})
        status, body = request("GET", f"{CALENDAR_EVENTS_URL}?{params}",
                               headers={"Authorization": f"Bearer {access_token}"})
        if status != 200:
            _logger.warning("calendar error", extra={"status": status})
            return []
        return list((json.loads(body.decode("utf-8") or "{}")).get("items") or [])
