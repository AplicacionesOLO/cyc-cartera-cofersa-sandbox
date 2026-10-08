"""Envío de reportes por correo (reemplaza ``POST /api/reportes/enviar``).

Lo usan el panel de envío por vendedor (mora / bloqueados / plazo especial), el resumen gerencial de
bloqueados, el resumen ejecutivo y el presupuesto de cobro. El HTML lo arma el front; el adjunto
opcional llega en base64. El envío sale por Gmail en nombre del usuario (``UsuarioMailer``).
"""

from __future__ import annotations

import base64
import binascii
import re
from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.ports.integraciones import EmailAttachment, EmailMessage
from application.use_cases.common import require_roles, require_usuario
from application.use_cases.mailer import UsuarioMailer
from domain.entities.reportes import MSG_SIN_PERMISO_ENVIO, ROLES_ENVIO
from domain.exceptions import ValidationError

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MSG_REQUERIDOS = "to, subject y html son requeridos"


def _split(raw: Any) -> list[str]:
    """Tolera ';' y ',' como separadores (el front a veces normaliza a coma)."""
    items = raw if isinstance(raw, (list, tuple)) else [raw]
    return [part.strip() for item in items if item for part in re.split(r"[;,]", str(item)) if part.strip()]


def _adjunto(raw: Any) -> tuple[EmailAttachment, ...]:
    if not isinstance(raw, dict):
        return ()
    data, mime, filename = raw.get("base64"), raw.get("mimeType"), raw.get("filename")
    if not (data and mime and filename):
        return ()
    try:
        content = base64.b64decode(str(data), validate=False)
    except (binascii.Error, ValueError) as error:
        raise ValidationError("El adjunto no es base64 válido.", details={"field": "adjunto"}) from error
    return (EmailAttachment(filename=str(filename), content_type=str(mime), data=content),)


class EnviarReporteUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory, mailer: UsuarioMailer) -> None:
        self._uow_factory = uow_factory
        self._mailer = mailer

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        to = str(body.get("to") or "").strip()
        subject = str(body.get("subject") or "").strip()
        html = str(body.get("html") or "")
        if not to or not subject or not html.strip():
            raise ValidationError(MSG_REQUERIDOS)
        destinatarios = _split(to)
        copias = _split(body.get("cc") or [])
        invalido = next((e for e in [*destinatarios, *copias] if not EMAIL_RE.match(e)), None)
        if invalido:
            raise ValidationError(f"Dirección de correo inválida: {invalido}")
        adjuntos = _adjunto(body.get("adjunto"))
        with self._uow_factory(principal) as uow:
            usuario = require_roles(
                require_usuario(uow, principal), *ROLES_ENVIO, message=MSG_SIN_PERMISO_ENVIO
            )
            message = EmailMessage(
                to=tuple(destinatarios),
                subject=subject,
                html=html,
                cc=tuple(copias),
                sender_name=usuario.nombre,
                attachments=adjuntos,
            )
            self._mailer.send(uow, usuario, message)
        return {"ok": True, "email_sent": True, "to": to}
