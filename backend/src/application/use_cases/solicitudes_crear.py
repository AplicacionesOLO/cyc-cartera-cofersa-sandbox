"""``POST /solicitudes`` (antes ``POST /api/solicitudes``): crea la solicitud y avisa por correo.

Dos ramas, igual que el origen:
- **catálogo** (Centro Operativo, se detecta por ``area`` + ``sla_horas``): inserta con estado
  ``Pendiente`` + fila inicial de historial; el correo al responsable es best-effort.
- **legacy** (wizard de la ficha): exige acceso a Gmail ANTES de insertar, inserta en ``PENDIENTE``,
  notifica al coordinador en ``notificaciones`` y envía el correo.

El correo sale con la cuenta de Gmail del solicitante (``UsuarioMailer``); como el envío puede fallar
sin deshacer la solicitud, se hace después del commit en una transacción de solo lectura aparte.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.ports.file_storage import FileStorage
from application.ports.integraciones import EmailMessage, IntegrationConfig
from application.use_cases.common import (
    optional_text,
    parse_number,
    parse_optional_date,
    parse_uuid,
    require_usuario,
)
from application.use_cases.mailer import UsuarioMailer
from application.use_cases.solicitudes import firmar_adjuntos, require_acceso_modulo
from application.use_cases.solicitudes_email import html_solicitud_catalogo, html_solicitud_legacy
from domain.entities.solicitudes import ESTADO_INICIAL_CATALOGO, ESTADO_PENDIENTE_LEGACY, TIPO_NOTIFICACION
from domain.entities.usuario import Usuario
from domain.exceptions import BusinessRuleViolation, ForbiddenError, ValidationError

EMAIL_COORDINADOR_DEFAULT = "jdiaz@cofersa.cr"
APP_URL_DEFAULT = "https://cyc-cartera-cofersa.vercel.app"
MSG_REQUERIDOS = "tipo, cliente_cod y descripcion son requeridos"
MSG_GOOGLE_EXPIRADA = "Sesión de Google expirada. Cerrá sesión y volvé a ingresar para renovar el acceso."
MSG_TOKEN_NO_DISPONIBLE = (
    "Token de Google no disponible y no se pudo renovar. Cerrá sesión y volvé a ingresar."
)
MSG_RED_GMAIL = "Error de red al contactar Gmail API."
_TTL_ADJUNTO_EMAIL = 7 * 24 * 3600  # máximo de una URL prefirmada SigV4


def _optional_number(raw: Any, field: str) -> float | None:
    return None if raw in (None, "") else parse_number(raw, field)


def _optional_dict(raw: Any, field: str) -> dict[str, Any] | None:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValidationError(f"'{field}' debe ser un objeto.", details={"field": field})
    return raw


def _emails(raw: Any) -> list[str]:
    return [str(e).strip() for e in raw if str(e).strip()] if isinstance(raw, list) else []


class CreateSolicitudUseCase:
    def __init__(
        self,
        uow_factory: UnitOfWorkFactory,
        mailer: UsuarioMailer,
        config: IntegrationConfig,
        storage: FileStorage,
    ) -> None:
        self._uow_factory = uow_factory
        self._mailer = mailer
        self._config = config
        self._storage = storage

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        descripcion = str(body.get("descripcion") or body.get("justificacion") or "").strip()
        if not body.get("tipo") or not body.get("cliente_cod") or not descripcion:
            raise ValidationError(MSG_REQUERIDOS)
        if body.get("area") and body.get("sla_horas") is not None:
            return self._catalogo(principal, body, descripcion)
        return self._legacy(principal, body, descripcion)

    # ── helpers ────────────────────────────────────────────────────────────
    def _solicitante(self, uow, principal: Principal) -> Usuario:
        usuario = require_acceso_modulo(
            require_usuario(uow, principal), "Sin permisos para crear solicitudes"
        )
        if usuario.es_solo_lectura:
            raise ForbiddenError("Sin permisos para crear solicitudes")
        return usuario

    def _app_url(self) -> str:
        return (self._config.get("app_url") or APP_URL_DEFAULT).rstrip("/")

    def _coordinador_email(self) -> str:
        return self._config.get("email_coordinador") or EMAIL_COORDINADOR_DEFAULT

    def _enviar(self, principal: Principal, usuario: Usuario, message: EmailMessage) -> str | None:
        """Envía y devuelve el texto de error (o None si salió)."""
        try:
            with self._uow_factory(principal) as uow:
                self._mailer.send(uow, usuario, message)
        except BusinessRuleViolation as error:
            return MSG_TOKEN_NO_DISPONIBLE if error.code == "gmail_no_conectado" else error.message
        except (OSError, TimeoutError):
            return MSG_RED_GMAIL
        return None

    # ── rama catálogo ──────────────────────────────────────────────────────
    def _catalogo(self, principal: Principal, body: dict[str, Any], descripcion: str) -> dict[str, Any]:
        sla_horas = int(parse_number(body.get("sla_horas"), "sla_horas"))
        ahora = datetime.now(UTC)
        vence = ahora + timedelta(hours=sla_horas)
        datos = _optional_dict(body.get("datos"), "datos")
        responsable_nombre = optional_text(body.get("responsable_nombre"))
        responsable_email = optional_text(body.get("responsable_email"))
        cliente_cod = str(body["cliente_cod"])
        cliente_nombre = body.get("cliente_nombre")
        tipo = str(body["tipo"])
        with self._uow_factory(principal) as uow:
            usuario = self._solicitante(uow, principal)
            nueva = uow.solicitudes.insert_solicitud(
                {
                    "tipo": tipo,
                    "area": body.get("area"),
                    "cliente_cod": cliente_cod,
                    "cliente_nombre": cliente_nombre or "",
                    "solicitante_id": usuario.id,
                    "gestion_id": parse_uuid(body["gestion_id"], "gestion_id")
                    if body.get("gestion_id")
                    else None,
                    "justificacion": descripcion,
                    "descripcion": descripcion,
                    "observaciones_internas": optional_text(body.get("observaciones_internas")),
                    "prioridad": body.get("prioridad"),
                    "sla_horas": sla_horas,
                    "sla_vencimiento": vence,
                    "responsable_nombre": responsable_nombre,
                    "responsable_email": responsable_email,
                    "datos": datos,
                    "estado": ESTADO_INICIAL_CATALOGO,
                }
            )
            uow.solicitudes.insert_historial(
                nueva["id"], None, ESTADO_INICIAL_CATALOGO, usuario.id, "Solicitud creada"
            )
            to_email = responsable_email or self._coordinador_email()
            responsable_es_usuario = uow.solicitudes.existe_usuario_email(to_email)
            uow.commit()

        numero_sic = f"SIC-{int(nueva['numero_consecutivo']):05d}"
        datos_email = firmar_adjuntos(datos, self._storage, _TTL_ADJUNTO_EMAIL) or {}
        html = html_solicitud_catalogo(
            numero_sic=numero_sic,
            tipo=tipo,
            prioridad=body.get("prioridad"),
            sla_horas=sla_horas,
            cliente_nombre=cliente_nombre or cliente_cod,
            cliente_cod=cliente_cod,
            descripcion=descripcion,
            datos=datos,
            adjuntos=[a for a in (datos_email.get("adjuntos") or []) if isinstance(a, dict)],
            vence=vence,
            responsable_nombre=body.get("responsable_nombre"),
            to_email=to_email,
            solicitante_nombre=usuario.nombre or usuario.email,
            solicitante_email=usuario.email,
            link_solicitud=f"{self._app_url()}/solicitudes/{nueva['id']}" if responsable_es_usuario else None,
            ahora=ahora,
        )
        message = EmailMessage(
            to=(to_email,),
            cc=tuple(_emails((datos or {}).get("cc"))),
            subject=f"[{numero_sic}] {tipo} — {cliente_nombre or cliente_cod}",
            html=html,
            sender_name=usuario.nombre or usuario.email,
        )
        email_error = self._enviar(principal, usuario, message)
        return {
            "ok": True,
            "id": nueva["id"],
            "numero": numero_sic,
            "numero_consecutivo": nueva["numero_consecutivo"],
            "email_sent": email_error is None,
            "email_to": to_email if email_error is None else None,
            "email_error": email_error,
        }

    # ── rama legacy ────────────────────────────────────────────────────────
    def _legacy(self, principal: Principal, body: dict[str, Any], justificacion: str) -> dict[str, Any]:
        tipo = str(body["tipo"])
        cliente_cod = str(body["cliente_cod"])
        cliente_nombre = body.get("cliente_nombre")
        destinatario = body.get("destinatario")
        cc_emails = _emails(body.get("cc_emails"))
        values = {
            "tipo": tipo,
            "destinatario": destinatario,
            "cliente_cod": cliente_cod,
            "cliente_nombre": cliente_nombre or "",
            "justificacion": justificacion,
            "para_email": body.get("para_email"),
            "cc_emails": cc_emails or None,
            "datos": _optional_dict(body.get("datos"), "datos"),
            "monto_actual": _optional_number(body.get("monto_actual"), "monto_actual"),
            "monto_solicitado": _optional_number(body.get("monto_solicitado"), "monto_solicitado"),
            "monto": _optional_number(body.get("monto"), "monto"),
            "motivo_nota": body.get("motivo_nota"),
            "documento_ref": body.get("documento_ref"),
            "fecha_limite": parse_optional_date(body.get("fecha_limite"), "fecha_limite"),
            "estado": ESTADO_PENDIENTE_LEGACY,
        }
        with self._uow_factory(principal) as uow:
            usuario = self._solicitante(uow, principal)
            try:
                self._mailer.access_token_for(uow, usuario)
            except BusinessRuleViolation as error:
                raise BusinessRuleViolation(MSG_GOOGLE_EXPIRADA, code="gmail_no_conectado") from error
            nueva = uow.solicitudes.insert_solicitud({**values, "solicitante_id": usuario.id})
            coordinador_id = uow.solicitudes.find_coordinador_id()
            if coordinador_id is not None:
                uow.solicitudes.insert_notificacion(
                    coordinador_id,
                    TIPO_NOTIFICACION,
                    f"Nueva solicitud: {tipo.replace('_', ' ')}",
                    f"Cliente: {cliente_nombre or cliente_cod}. "
                    f"Destinatario: {destinatario or 'coordinador'}. Solicitante: {usuario.email}",
                    f"/solicitudes/{nueva['id']}",
                )
            uow.commit()

        to_email = optional_text(body.get("para_email")) or self._coordinador_email()
        tipo_label = " ".join(w[:1].upper() + w[1:] for w in tipo.replace("_", " ").split(" "))
        html = html_solicitud_legacy(
            tipo_label=tipo_label,
            cliente_nombre=cliente_nombre or cliente_cod,
            cliente_cod=cliente_cod,
            justificacion=justificacion,
            solicitante_nombre=usuario.nombre or usuario.email,
            solicitante_email=usuario.email,
            link_solicitudes=f"{self._app_url()}/solicitudes",
            ahora=datetime.now(UTC),
        )
        message = EmailMessage(
            to=(to_email,),
            cc=tuple(cc_emails),
            subject=f"[SIC Cofersa] {tipo_label} — {cliente_nombre or cliente_cod}",
            html=html,
            sender_name=usuario.nombre or usuario.email,
        )
        email_error = self._enviar(principal, usuario, message)
        return {
            "ok": True,
            "id": nueva["id"],
            "email_sent": email_error is None,
            "email_to": to_email if email_error is None else None,
            "email_error": email_error,
        }
