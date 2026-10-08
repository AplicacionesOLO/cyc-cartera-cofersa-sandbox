"""Correos del módulo Clientes: email de cobro, estado de cuenta y redacción con IA.

Reemplazan ``/api/clientes/email-cobro``, ``/api/clientes/estado-cuenta`` y ``/api/ai/generate-email``.
El envío usa ``UsuarioMailer`` (Gmail en nombre del usuario con su refresh token guardado); los
adjuntos PDF/Excel siguen generándose en el navegador y llegan en base64.
"""

from __future__ import annotations

import base64
import binascii
from datetime import UTC, datetime, timedelta
from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import AppUnitOfWork, UnitOfWorkFactory
from application.ports.integraciones import EmailAttachment, EmailMessage, LanguageModel
from application.use_cases.clientes import hora_cr
from application.use_cases.clientes_email_templates import (
    EstadoCuentaHtml,
    html_email_cobro,
    html_estado_cuenta,
    ordenar_facturas,
)
from application.use_cases.common import hoy_cr, require_escritura, require_usuario
from application.use_cases.mailer import UsuarioMailer
from domain.entities.clientes import (
    LIMITE_CORREOS_HORA,
    GestionNueva,
    email_invalido,
    fecha_larga_es,
    fmt_colones,
    fmt_monto,
)
from domain.entities.usuario import Usuario
from domain.exceptions import BusinessRuleViolation, ValidationError

MSG_LIMITE = "Límite de 30 correos por hora alcanzado. Esperá unos minutos."


def _split(raw: Any) -> list[str]:
    """``a@x.com; b@x.com`` (o lista de esos textos) → direcciones limpias, en orden."""
    items = raw if isinstance(raw, list) else [raw or ""]
    return [e.strip() for item in items for e in str(item or "").split(";") if e.strip()]


def _validar_direcciones(direcciones: list[str]) -> None:
    invalido = email_invalido(tuple(direcciones))
    if invalido:
        raise ValidationError(f"Dirección de correo inválida: {invalido}")


def _adjunto(raw: Any) -> tuple[EmailAttachment, ...]:
    if not isinstance(raw, dict) or not raw.get("base64"):
        return ()
    if not raw.get("mimeType") or not raw.get("filename"):
        return ()
    try:
        data = base64.b64decode(str(raw["base64"]), validate=False)
    except (binascii.Error, ValueError) as error:
        raise ValidationError("El adjunto no es un base64 válido.") from error
    return (EmailAttachment(str(raw["filename"]), str(raw["mimeType"]), data),)


def _controlar_limite(uow: AppUnitOfWork, usuario: Usuario) -> None:
    desde = datetime.now(UTC) - timedelta(hours=1)
    if uow.clientes.contar_correos_desde(usuario.email, desde) >= LIMITE_CORREOS_HORA:
        raise BusinessRuleViolation(MSG_LIMITE, code="limite_correos")


class EnviarEmailCobroUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory, mailer: UsuarioMailer) -> None:
        self._uow_factory = uow_factory
        self._mailer = mailer

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, bool]:
        to = str(body.get("to") or "").strip()
        asunto = str(body.get("asunto") or "").strip()
        mensaje = str(body.get("mensaje") or "").strip()
        if not to or not asunto or not mensaje:
            raise ValidationError("to, asunto y mensaje son requeridos")
        destinatarios, cc = _split(to), _split(body.get("cc") or [])
        _validar_direcciones(destinatarios + cc)
        cliente_nombre = body.get("clienteNombre")
        cliente_cod = body.get("clienteCod")
        adjuntos = _adjunto(body.get("adjunto"))
        with self._uow_factory(principal) as uow:
            usuario = require_escritura(require_usuario(uow, principal))
            _controlar_limite(uow, usuario)
            remitente = usuario.nombre or usuario.email
            html = html_email_cobro(
                asunto=asunto,
                mensaje=mensaje,
                cliente_nombre=cliente_nombre,
                cliente_cod=cliente_cod,
                remitente_nombre=remitente,
                remitente_email=usuario.email,
                fecha_larga=fecha_larga_es(hoy_cr()),
            )
            subject = f"{asunto} - {cliente_nombre}" if cliente_nombre else asunto
            self._mailer.send(
                uow,
                usuario,
                EmailMessage(
                    to=tuple(destinatarios),
                    cc=tuple(cc),
                    subject=subject,
                    html=html,
                    sender_name=remitente,
                    attachments=adjuntos,
                ),
            )
            if cliente_cod:
                uow.clientes.registrar_gestion(
                    GestionNueva(
                        cliente_cod=str(cliente_cod),
                        contribuyente=body.get("contribuyente"),
                        analista_email=usuario.email,
                        fecha=hoy_cr(),
                        hora=hora_cr(),
                        tipo="CORREO",
                        resultado="Email enviado",
                        nota=f"[{asunto}] Email enviado a {', '.join(destinatarios + cc)}. {mensaje}",
                    )
                )
            uow.commit()
        return {"email_sent": True}


class EnviarEstadoCuentaUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory, mailer: UsuarioMailer) -> None:
        self._uow_factory = uow_factory
        self._mailer = mailer

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        cliente_cod = str(body.get("cliente_cod") or "").strip()
        to_email = str(body.get("to_email") or "").strip()
        if not cliente_cod or not to_email:
            raise ValidationError("cliente_cod y to_email son requeridos")
        destinatarios, cc = _split(to_email), _split(body.get("cc_emails") or [])
        _validar_direcciones(destinatarios + cc)
        nombre_cliente = body.get("cliente_nombre") or cliente_cod
        contribuyente = body.get("contribuyente")
        adjuntos = _adjunto(body.get("adjunto"))
        hoy = hoy_cr()
        with self._uow_factory(principal) as uow:
            usuario = require_escritura(require_usuario(uow, principal))
            _controlar_limite(uow, usuario)
            repo = uow.clientes
            maestro = repo.maestro_del_cliente(cliente_cod) or {}
            analista_email = maestro.get("analista_email") or usuario.email
            analista = repo.contacto_usuario(analista_email) or {}
            facturas = ordenar_facturas(
                repo.facturas_por_contribuyente(contribuyente or "", solo_con_saldo=True), hoy
            )
            html = html_estado_cuenta(
                EstadoCuentaHtml(
                    cliente_nombre=nombre_cliente,
                    contribuyente=contribuyente or "—",
                    condicion_pago=maestro.get("condicion_pago") or "—",
                    facturas=facturas,
                    cuentas=repo.cuentas_bancarias_activas(),
                    observaciones=body.get("observaciones"),
                    analista_nombre=analista.get("nombre") or analista_email,
                    analista_email=analista_email,
                    analista_telefono=analista.get("telefono"),
                    analista_whatsapp=analista.get("whatsapp"),
                    hoy=hoy,
                )
            )
            total_saldo = sum(float(f.get("saldo") or 0) for f in facturas)
            remitente = usuario.nombre or usuario.email
            email_error: str | None = None
            try:
                self._mailer.send(
                    uow,
                    usuario,
                    EmailMessage(
                        to=tuple(destinatarios),
                        cc=tuple(cc),
                        subject=f"Estado de cuenta — {nombre_cliente}",
                        html=html,
                        sender_name=remitente,
                        attachments=adjuntos,
                    ),
                )
            except BusinessRuleViolation as error:
                if error.code != "gmail_error":
                    raise
                email_error = error.message
            if email_error is None:
                adj = f" (adjunto: {adjuntos[0].filename})" if adjuntos else ""
                repo.registrar_gestion(
                    GestionNueva(
                        cliente_cod=cliente_cod,
                        contribuyente=contribuyente or "",
                        analista_email=usuario.email,
                        fecha=hoy,
                        hora=hora_cr(),
                        tipo="CORREO",
                        resultado="Email enviado",
                        nota=f"Estado de cuenta enviado a {to_email}{adj} ({len(facturas)} facturas, "
                        f"saldo {fmt_monto(total_saldo)})",
                    )
                )
                uow.commit()
        return {
            "ok": email_error is None,
            "email_sent": email_error is None,
            "email_to": to_email,
            "email_error": email_error,
            "facturas_count": len(facturas),
            "saldo_total": total_saldo,
        }


TONE_RULES: dict[str, str] = {
    "Recordatorio de Pago": (
        "El cliente tiene mora TEMPRANA (1-15 días). Tono EMPÁTICO, educado y de rutina. Asumí que es un "
        "retraso administrativo o un descuido involuntario. El mensaje debe sentirse como un recordatorio "
        "cordial entre empresas con buena relación comercial. No generés presión innecesaria."
    ),
    "Notificación de Estado de Cuenta Pendiente": (
        "El cliente tiene mora INTERMEDIA (16-30 días). Tono EJECUTIVO y directo. REGLA ESTRICTA: sé un "
        '35% más corto que un email estándar. PROHIBIDO usar introducciones ceremoniales como "Nos '
        'permitimos comunicarle", "Por medio de la presente" o similares. Ir al grano desde la primera '
        "oración. Si el contexto lo permite, usá una lista breve de puntos clave (saldo, vencimiento, acción "
        "requerida) para que sea escaneable. El objetivo es que el receptor lea el saldo y sepa qué hacer en "
        "menos de 20 segundos."
    ),
    "Aviso Urgente: Regularización de Cuenta": (
        "El cliente tiene mora CRÍTICA (31+ días). Tono FORMAL, severo y de alta presión, aunque siempre "
        "educado y sin agresividad. Notificá de manera contundente que, al superar la barrera de los 30 días "
        "de atraso, las políticas de crédito de COFERSA estipulan la retención y bloqueo automático de la "
        "cuenta y de todos los nuevos pedidos hasta que se normalicen los saldos pendientes. Dejá claro que "
        "esto no es una amenaza sino la aplicación directa de las políticas vigentes de la empresa."
    ),
    "Conciliación y Seguimiento de Cuenta": (
        "Tono ANALÍTICO y contable, puramente técnico. El objetivo es aclarar diferencias en el estado de "
        "cuenta, solicitar la revisión de los documentos y proponer una conciliación formal. No hay urgencia "
        "de cobro sino de alinear la información financiera entre ambas partes."
    ),
    "Formalización de Acuerdo de Pago": (
        "Redactá un texto tipo MINUTA que deje constancia escrita de una promesa de pago o abono ya acordada "
        "previamente por teléfono. El lenguaje debe ser formal y de acuerdo comercial. Especificá que el "
        "cliente se compromete a efectuar el pago acordado. Usá los datos del contexto (saldo vencido, "
        "nombre del cliente) de forma natural. Si falta información puntual como fecha exacta o monto "
        "específico del abono, redactá fluidamente sin mencionar que falta el dato."
    ),
}

MODELO_EMAIL = "claude-haiku-4-5-20251001"


def _num(value: Any) -> str:
    """Número como lo imprime JS en un template string (12 y no 12.0)."""
    try:
        n = float(value)
    except (TypeError, ValueError):
        return str(value)
    return str(int(n)) if n.is_integer() else str(n)


def _system_prompt(analista_nombre: str, asunto: str, regla: str) -> str:
    return f"""Eres un profesional del Departamento de Control de Cartera de COFERSA, empresa mayorista ferretera de Costa Rica. Redactás correos electrónicos de cobro dirigidos a clientes empresariales.

REGLAS DE ESCRITURA OBLIGATORIAS:
- Español formal de Costa Rica. Trato de "usted" siempre.
- Moneda: colones costarricenses con símbolo ₡ (ej: ₡1.250.000).
- Estructura OBLIGATORIA en exactamente 3 o 4 párrafos cortos e independientes, separados por una línea en blanco:
    Párrafo 1: Saludo y apertura (1-2 oraciones).
    Párrafo 2: Detalle del estado de cuenta — saldo, facturas, días de atraso.
    Párrafo 3: Llamado a la acción o consecuencia según el tono.
    Párrafo 4 (cierre + firma): Despedida breve. Luego, en línea separada: "{analista_nombre} | Control de Cartera — COFERSA".
- La firma SIEMPRE va en su propio párrafo al final, separada del cuerpo por una línea en blanco.
- NO incluyas línea de asunto ni "Para:". Solo el cuerpo del mensaje.
- NO uses marcadores de markdown (sin asteriscos, sin #, sin guiones de lista salvo que el tono lo pida expresamente).
- NUNCA uses introducciones como "Nos permitimos comunicarle" o "Por medio de la presente".
- ABSOLUTAMENTE PROHIBIDO usar marcadores de posición con corchetes como [MONTO], [FECHA], [NOMBRE DEL CLIENTE], [INFORMACIÓN], [PENDIENTE] o similares. Usá los datos reales del contexto directamente. Si algún dato falta, redactá fluidamente sin señalar la ausencia.

INSTRUCCIÓN DE TONO (asunto: "{asunto}"):
{regla}"""  # noqa: E501


class GenerarEmailCobroIAUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory, model: LanguageModel) -> None:
        self._uow_factory = uow_factory
        self._model = model

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
        asunto = str(body.get("asunto") or "")
        regla = TONE_RULES.get(asunto)
        if regla is None:
            raise ValidationError("Asunto no reconocido")
        prompt = (
            "Redactá el correo para este cliente:\n\n"
            f"Cliente: {body.get('clienteNombre')}\n"
            f"Condición de pago pactada: {body.get('condicionPago') or 'No especificada'}\n"
            f"Saldo vencido: {fmt_colones(body.get('saldoVencido') or 0)}\n"
            f"Saldo total pendiente: {fmt_colones(body.get('saldoTotal') or 0)}\n"
            f"Facturas vencidas: {_num(body.get('nFacturasVenc'))}\n"
            f"Días de atraso máximo: {_num(body.get('maxDiasMora'))} días"
        )
        texto = self._model.complete(
            model=MODELO_EMAIL,
            system=_system_prompt(str(body.get("analistaNombre") or ""), asunto, regla),
            prompt=prompt,
            max_tokens=1024,
        )
        return {"ok": True, "texto": texto}
