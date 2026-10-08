"""Auditoría y Control Legal — solicitudes de actualización de perfil (portal público por token).

Reemplaza:
- ``POST  /api/auditoria-legal/solicitudes-actualizacion``       → ``CrearSolicitudActualizacionUseCase``
- ``GET   /api/auditoria-legal/solicitudes-actualizacion/[id]``  → ``GetSolicitudActualizacionUseCase``
- ``PATCH /api/auditoria-legal/solicitudes-actualizacion/[id]``  → ``GestionarSolicitudActualizacionUseCase``
- consulta directa ``solicitudes_actualizacion`` de ``garantias-cliente.tsx``
  → ``ListSolicitudesActualizacionUseCase``
- ``GET/POST /api/actualizar-perfil/[token]`` (público, sin sesión) → ``ValidarTokenActualizacionUseCase``,
  ``CrearUploadsActualizacionUseCase`` y ``EnviarActualizacionPerfilUseCase``.

El token crudo (256 bits) solo sale del servidor en el link del correo; en la base se guarda su SHA-256.
Los archivos del cliente van al bucket privado ``expedientes-clientes`` con URLs prefirmadas.
"""

from __future__ import annotations

import hashlib
import logging
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.ports.file_storage import FileStorage, safe_key
from application.ports.integraciones import EmailMessage, IntegrationConfig
from application.use_cases.auditoria_legal import require_escritura_modulo, require_modulo
from application.use_cases.common import parse_int
from application.use_cases.mailer import UsuarioMailer
from domain.entities.auditoria_legal import (
    DIAS_VIGENCIA_TOKEN,
    ESTADOS_CIVILES,
    MAX_LEN_CORTO,
    MAX_LEN_LARGO,
    MAX_LEN_NOTA_REVISION,
    MAX_MB_IMAGEN,
    MAX_MB_PDF,
    MAX_SOLICITUDES_POR_HORA,
    MIME_A_EXT_CEDULA,
    es_persona_juridica,
)
from domain.entities.usuario import Usuario
from domain.exceptions import BusinessRuleViolation, ConflictError, NotFoundError, ValidationError
from domain.services.auditoria_legal_correos import asunto_auditoria_anual, html_auditoria_anual

_logger = logging.getLogger(__name__)

APP_URL_DEFAULT = "https://cyc-cartera-cofersa.vercel.app"
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
URL_FIRMADA_TTL = 300
MSG_SOLICITUD_NO_ENCONTRADA = "Solicitud no encontrada"
MSG_PROCESADA = "Esta solicitud ya fue procesada por otra acción."
MSG_PROCESADA_REVISANDO = "Esta solicitud ya fue procesada por otra acción mientras revisabas."
MSG_ENLACE_INVALIDO = "Este enlace ya no es válido."
MSG_CAMPOS_REQUERIDOS = "Completá todos los campos requeridos."
MSG_LONGITUD = "Uno de los campos supera la longitud máxima permitida."
MSG_ADJUNTAR_CEDULA = "Adjuntá la imagen de tu cédula."
MSG_ADJUNTAR_PERSONERIA = "Adjuntá la certificación de personería jurídica."


def generar_token() -> str:
    return secrets.token_hex(32)


def hashear_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _expiracion() -> datetime:
    return datetime.now(UTC) + timedelta(days=DIAS_VIGENCIA_TOKEN)


def _destinatarios(correo: Any) -> list[str]:
    texto = str(correo or "").strip()
    lista = [e.strip() for e in texto.split(";") if e.strip()]
    invalido = next((e for e in lista if not EMAIL_RE.match(e)), None)
    if invalido or not lista:
        raise ValidationError(f"Dirección de correo inválida: {invalido or texto}")
    return lista


def _link(config: IntegrationConfig, token: str) -> str:
    base = (config.get("app_url") or APP_URL_DEFAULT).rstrip("/")
    return f"{base}/actualizar-perfil/{token}"


def _enviar(mailer: UsuarioMailer, uow, usuario: Usuario, destinatarios: list[str], cliente: str, link: str):
    """Envía el correo de Auditoría Anual. Nunca lanza: devuelve (enviado, error)."""
    try:
        mailer.send(
            uow,
            usuario,
            EmailMessage(
                to=tuple(destinatarios),
                subject=asunto_auditoria_anual(),
                html=html_auditoria_anual(cliente, link),
                sender_name=usuario.nombre,
            ),
        )
        return True, None
    except BusinessRuleViolation as error:
        return False, error.message
    except Exception as error:  # la fila + token ya existen: nunca convertir esto en un 500
        _logger.exception("[solicitudes-actualizacion] Gmail API error")
        return False, str(error) or "Error inesperado al enviar el correo."


class ListSolicitudesActualizacionUseCase:
    """Seguimiento del tab "Sin Garantía" (sin CANCELADA)."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal) -> list[dict[str, Any]]:
        with self._uow_factory(principal) as uow:
            require_modulo(uow, principal)
            return uow.auditoria_legal.solicitudes_seguimiento()


class CrearSolicitudActualizacionUseCase:
    def __init__(
        self, uow_factory: UnitOfWorkFactory, mailer: UsuarioMailer, config: IntegrationConfig
    ) -> None:
        self._uow_factory = uow_factory
        self._mailer = mailer
        self._config = config

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        contribuyente = str(body.get("contribuyente") or "").strip()
        cliente_nombre = str(body.get("cliente_nombre") or "").strip()
        correo = str(body.get("correo_destino") or "").strip()
        if not contribuyente or not cliente_nombre or not correo:
            raise ValidationError("Faltan campos requeridos")
        destinatarios = _destinatarios(correo)
        token = generar_token()
        with self._uow_factory(principal) as uow:
            usuario = require_escritura_modulo(uow, principal)
            repo = uow.auditoria_legal
            if repo.contar_solicitudes_desde(usuario.id, datetime.now(UTC) - timedelta(hours=1)) >= (
                MAX_SOLICITUDES_POR_HORA
            ):
                raise BusinessRuleViolation(
                    "Límite de 30 solicitudes por hora alcanzado. Esperá unos minutos.", code="rate_limited"
                )
            nueva_id = repo.crear_solicitud(
                {
                    "contribuyente": contribuyente,
                    "cliente_nombre": cliente_nombre,
                    "tipo_persona": "JURIDICA" if es_persona_juridica(contribuyente) else "FISICA",
                    "token_hash": hashear_token(token),
                    "token_expira_en": _expiracion(),
                    "enviada_por": usuario.id,
                    "correo_destino": correo,
                }
            )
            if nueva_id is None:
                raise ConflictError("Ya hay una solicitud activa para este contribuyente.")
            uow.commit()
        link = _link(self._config, token)
        with self._uow_factory(principal) as uow:
            enviado, error = _enviar(self._mailer, uow, usuario, destinatarios, cliente_nombre, link)
        return {
            "ok": True,
            "id": nueva_id,
            "link": link,
            "email_to": correo,
            "email_sent": enviado,
            "email_error": None if enviado else error,
        }


class GetSolicitudActualizacionUseCase:
    """Detalle para el modal de revisión + URLs firmadas (5 min) de cédula y personería."""

    def __init__(self, uow_factory: UnitOfWorkFactory, expedientes: FileStorage) -> None:
        self._uow_factory = uow_factory
        self._expedientes = expedientes

    def execute(self, principal: Principal, solicitud_id: Any) -> dict[str, Any]:
        sid = parse_int(solicitud_id, "id")
        with self._uow_factory(principal) as uow:
            require_modulo(uow, principal)
            fila = uow.auditoria_legal.solicitud(sid)
        if not fila:
            raise NotFoundError(MSG_SOLICITUD_NO_ENCONTRADA)

        def firmada(key: str | None) -> str | None:
            return self._expedientes.presign_download(key, expires_in=URL_FIRMADA_TTL) if key else None

        campos = (
            "id",
            "contribuyente",
            "cliente_nombre",
            "tipo_persona",
            "estado",
            "datos_temporales",
            "nota_revision",
            "respondida_en",
        )
        return {
            **{c: fila.get(c) for c in campos},
            "url_cedula_firmada": firmada(fila.get("url_cedula")),
            "url_personeria_firmada": firmada(fila.get("url_personeria")),
        }


class GestionarSolicitudActualizacionUseCase:
    """PATCH: APROBAR | RECHAZAR | REENVIAR (rota token + correo) | CANCELAR."""

    def __init__(
        self, uow_factory: UnitOfWorkFactory, mailer: UsuarioMailer, config: IntegrationConfig
    ) -> None:
        self._uow_factory = uow_factory
        self._mailer = mailer
        self._config = config

    def execute(self, principal: Principal, solicitud_id: Any, body: dict[str, Any]) -> dict[str, Any]:
        sid = parse_int(solicitud_id, "id")
        with self._uow_factory(principal) as uow:
            usuario = require_escritura_modulo(uow, principal)
            repo = uow.auditoria_legal
            fila = repo.solicitud(sid)
            if not fila:
                raise NotFoundError(MSG_SOLICITUD_NO_ENCONTRADA)
            accion = body.get("accion")
            if accion == "CANCELAR":
                return self._cancelar(uow, sid, fila)
            reenvio = self._rotar_token(uow, sid, fila, body) if accion == "REENVIAR" else None
            if reenvio is None:
                if fila["estado"] != "DATOS_RECIBIDOS":
                    raise ConflictError("Esta solicitud no tiene datos pendientes de revisión.")
                if accion == "RECHAZAR":
                    return self._rechazar(uow, sid, body)
                if accion == "APROBAR":
                    return self._aprobar(uow, usuario, sid, fila, body)
                raise ValidationError("accion inválida")
        # el correo se envía fuera de la transacción que rotó el token (ya confirmada)
        return self._reenviar(principal, usuario, fila, body, *reenvio)

    @staticmethod
    def _cancelar(uow, sid: int, fila: dict[str, Any]) -> dict[str, Any]:
        if fila["estado"] not in ("ENVIADA", "DATOS_RECIBIDOS"):
            raise ConflictError("Esta solicitud ya no se puede cancelar.")
        if not uow.auditoria_legal.cambiar_estado_solicitud(
            sid, ("ENVIADA", "DATOS_RECIBIDOS"), {"estado": "CANCELADA"}
        ):
            raise ConflictError(MSG_PROCESADA)
        uow.commit()
        return {"ok": True}

    def _rotar_token(
        self, uow, sid: int, fila: dict[str, Any], body: dict[str, Any]
    ) -> tuple[list[str], str]:
        if fila["estado"] != "ENVIADA":
            raise ConflictError("Sólo se puede reenviar mientras está en estado Enviada.")
        correo = str(body.get("correo_destino") or "").strip()
        destinatarios = _destinatarios(correo)
        token = generar_token()
        cambios = {
            "token_hash": hashear_token(token),
            "token_expira_en": _expiracion(),
            "enviada_en": datetime.now(UTC),
            "nota_revision": None,
            "correo_destino": "; ".join(destinatarios),
        }
        if not uow.auditoria_legal.cambiar_estado_solicitud(sid, ("ENVIADA",), cambios):
            raise ConflictError(MSG_PROCESADA)
        uow.commit()
        return destinatarios, _link(self._config, token)

    def _reenviar(
        self, principal, usuario, fila, body, destinatarios: list[str], link: str
    ) -> dict[str, Any]:
        correo = str(body.get("correo_destino") or "").strip()
        with self._uow_factory(principal) as uow:
            enviado, error = _enviar(self._mailer, uow, usuario, destinatarios, fila["cliente_nombre"], link)
        return {
            "ok": True,
            "link": link,
            "email_to": correo,
            "email_sent": enviado,
            "email_error": None if enviado else error,
        }

    @staticmethod
    def _rechazar(uow, sid: int, body: dict[str, Any]) -> dict[str, Any]:
        nota = str(body.get("nota") or "").strip()
        if not nota:
            raise ValidationError("Indicá el motivo del rechazo")
        if len(nota) > MAX_LEN_NOTA_REVISION:
            raise ValidationError(f"La nota supera el máximo de {MAX_LEN_NOTA_REVISION} caracteres.")
        cambios = {"estado": "ENVIADA", "nota_revision": nota}
        if not uow.auditoria_legal.cambiar_estado_solicitud(sid, ("DATOS_RECIBIDOS",), cambios):
            raise ConflictError(MSG_PROCESADA_REVISANDO)
        uow.commit()
        return {"ok": True}

    @staticmethod
    def _aprobar(uow, usuario: Usuario, sid: int, fila: dict[str, Any], body: dict[str, Any]) -> dict:
        datos = fila.get("datos_temporales")
        if not datos:
            raise ConflictError("La solicitud no tiene datos capturados.")
        repo = uow.auditoria_legal
        garantia_id = parse_int(body["garantia_id"], "garantia_id") if body.get("garantia_id") else None
        if garantia_id is not None:
            garantia = repo.garantia(garantia_id)
            if not garantia or garantia["contribuyente"] != fila["contribuyente"]:
                raise ValidationError("garantia_id no corresponde a este contribuyente")
        persona = {
            "cedula": datos.get("cedula"),
            "nombre": str(datos.get("nombre") or "").upper(),
            "estado_civil": datos.get("estado_civil"),
            "profesion": datos.get("profesion"),
            "domicilio": datos.get("domicilio"),
        }
        if datos.get("telefono"):
            persona["telefono"] = datos["telefono"]
        repo.upsert_persona_legal(persona)
        cambios: dict[str, Any] = {
            "estado": "APROBADA",
            "aprobada_por": usuario.id,
            "aprobada_en": datetime.now(UTC),
        }
        if garantia_id is not None:
            cambios["garantia_id"] = garantia_id
        if not repo.cambiar_estado_solicitud(sid, ("DATOS_RECIBIDOS",), cambios):
            raise ConflictError(MSG_PROCESADA_REVISANDO)
        uow.commit()
        return {"ok": True, "datos": datos}


# ── Portal público (/actualizar-perfil/{token}) ──────────────────────────────


def _solicitud_activa(uow, token: str) -> dict[str, Any] | None:
    """ENVIADA y no vencida. Mismo resultado para "no existe", "vencido" o "ya usado" (evita enumeración)."""
    if not token or len(token) > 200:
        return None
    fila = uow.auditoria_legal.solicitud_por_token_hash(hashear_token(token))
    if not fila or fila["estado"] != "ENVIADA":
        return None
    expira = fila["token_expira_en"]
    return fila if expira >= datetime.now(UTC) else None


def _validar_campos(body: dict[str, Any]) -> dict[str, str]:
    campos = {
        k: str(body.get(k) or "").strip() for k in ("nombre", "cedula", "profesion", "domicilio", "telefono")
    }
    campos["nombre"] = campos["nombre"].upper()
    campos["estado_civil"] = str(body.get("estado_civil") or "")
    if not (
        campos["nombre"]
        and campos["cedula"]
        and campos["estado_civil"] in ESTADOS_CIVILES
        and campos["profesion"]
        and campos["domicilio"]
    ):
        raise ValidationError(MSG_CAMPOS_REQUERIDOS)
    if any(len(campos[k]) > MAX_LEN_LARGO for k in ("nombre", "domicilio", "profesion")):
        raise ValidationError(MSG_LONGITUD)
    if len(campos["cedula"]) > MAX_LEN_CORTO or len(campos["telefono"]) > MAX_LEN_CORTO:
        raise ValidationError(MSG_LONGITUD)
    return campos


def _validar_archivo_cedula(meta: Any) -> str:
    if not isinstance(meta, dict):
        raise ValidationError(MSG_ADJUNTAR_CEDULA)
    if float(meta.get("size") or 0) > MAX_MB_IMAGEN * 1024 * 1024:
        raise ValidationError(f"La imagen de cédula supera {MAX_MB_IMAGEN}MB.")
    ext = MIME_A_EXT_CEDULA.get(str(meta.get("content_type") or ""))
    if not ext:
        raise ValidationError("Formato de imagen no soportado. Usá JPG, PNG o WebP.")
    return ext


def _validar_archivo_personeria(meta: Any, requerido: bool) -> bool:
    if not isinstance(meta, dict):
        if requerido:
            raise ValidationError(MSG_ADJUNTAR_PERSONERIA)
        return False
    if float(meta.get("size") or 0) > MAX_MB_PDF * 1024 * 1024:
        raise ValidationError(f"El PDF de personería supera {MAX_MB_PDF}MB.")
    if meta.get("content_type") != "application/pdf":
        raise ValidationError("El archivo de personería debe ser un PDF.")
    return True


def _ms() -> int:
    return int(datetime.now(UTC).timestamp() * 1000)


class ValidarTokenActualizacionUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, token: str) -> dict[str, Any]:
        with self._uow_factory(None) as uow:
            fila = _solicitud_activa(uow, token)
        if not fila:
            raise NotFoundError(MSG_ENLACE_INVALIDO)
        return {
            "valido": True,
            "tipo_persona": fila["tipo_persona"],
            "cliente_nombre": fila["cliente_nombre"],
            "nota_revision": fila.get("nota_revision"),
            "datos_previos": fila.get("datos_temporales"),
        }


class CrearUploadsActualizacionUseCase:
    """URLs prefirmadas para cédula (imagen) y personería (PDF), validadas con las mismas reglas del POST."""

    def __init__(self, uow_factory: UnitOfWorkFactory, expedientes: FileStorage) -> None:
        self._uow_factory = uow_factory
        self._expedientes = expedientes

    def execute(self, token: str, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(None) as uow:
            fila = _solicitud_activa(uow, token)
        if not fila:
            raise NotFoundError(MSG_ENLACE_INVALIDO)
        _validar_campos(body)
        ext = _validar_archivo_cedula(body.get("cedula_file"))
        con_personeria = _validar_archivo_personeria(
            body.get("personeria_file"), fila["tipo_persona"] == "JURIDICA"
        )
        cedula_ct = str(body["cedula_file"]["content_type"])
        cedula = self._expedientes.presign_upload(
            safe_key(fila["contribuyente"], f"cedula_{_ms()}.{ext}"), cedula_ct
        )
        personeria = (
            self._expedientes.presign_upload(
                safe_key(fila["contribuyente"], f"personeria_{_ms()}.pdf"), "application/pdf"
            )
            if con_personeria
            else None
        )
        return {"cedula": cedula, "personeria": personeria}


class EnviarActualizacionPerfilUseCase:
    """El cliente envía el formulario: datos_temporales + rutas de archivos ya subidos → DATOS_RECIBIDOS."""

    def __init__(self, uow_factory: UnitOfWorkFactory, expedientes: FileStorage) -> None:
        self._uow_factory = uow_factory
        self._expedientes = expedientes

    def execute(self, token: str, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(None) as uow:
            fila = _solicitud_activa(uow, token)
            if not fila:
                raise NotFoundError(MSG_ENLACE_INVALIDO)
            campos = _validar_campos(body)
            cedula_key, personeria_key = self._archivos(fila, body)
            subidos = [k for k in (cedula_key, personeria_key) if k]
            try:
                telefono = campos["telefono"] or (fila.get("datos_temporales") or {}).get("telefono")
                datos = {
                    "nombre": campos["nombre"],
                    "cedula": campos["cedula"],
                    "estado_civil": campos["estado_civil"],
                    "profesion": campos["profesion"],
                    "domicilio": campos["domicilio"],
                }
                if telefono:
                    datos["telefono"] = telefono
                cambios = {
                    "datos_temporales": datos,
                    "url_cedula": cedula_key,
                    "url_personeria": personeria_key,
                    "estado": "DATOS_RECIBIDOS",
                    "respondida_en": datetime.now(UTC),
                }
                if not uow.auditoria_legal.cambiar_estado_solicitud(fila["id"], ("ENVIADA",), cambios):
                    self._expedientes.delete(subidos)
                    raise NotFoundError(MSG_ENLACE_INVALIDO)
                uow.commit()
            except NotFoundError:
                raise
            except Exception:
                self._expedientes.delete(subidos)
                raise
        return {"ok": True}

    def _archivos(self, fila: dict[str, Any], body: dict[str, Any]) -> tuple[str, str | None]:
        prefijo = f"{fila['contribuyente']}/"
        cedula_key = str(body.get("cedula_key") or "")
        exts = "|".join(MIME_A_EXT_CEDULA.values())
        if not re.fullmatch(rf"{re.escape(prefijo)}cedula_\d+\.({exts})", cedula_key):
            raise ValidationError(MSG_ADJUNTAR_CEDULA)
        self._tamano(
            cedula_key, MAX_MB_IMAGEN, MSG_ADJUNTAR_CEDULA, f"La imagen de cédula supera {MAX_MB_IMAGEN}MB."
        )
        personeria_key = str(body.get("personeria_key") or "") or None
        if personeria_key is None and fila["tipo_persona"] == "JURIDICA":
            raise ValidationError(MSG_ADJUNTAR_PERSONERIA)
        if personeria_key is not None:
            if not re.fullmatch(rf"{re.escape(prefijo)}personeria_\d+\.pdf", personeria_key):
                raise ValidationError(MSG_ADJUNTAR_PERSONERIA)
            self._tamano(
                personeria_key,
                MAX_MB_PDF,
                MSG_ADJUNTAR_PERSONERIA,
                f"El PDF de personería supera {MAX_MB_PDF}MB.",
            )
        return cedula_key, personeria_key

    def _tamano(self, key: str, max_mb: int, msg_falta: str, msg_grande: str) -> None:
        objeto = next((o for o in self._expedientes.list(key, limit=5) if o.key == key), None)
        if objeto is None:
            raise ValidationError(msg_falta)
        if objeto.size > max_mb * 1024 * 1024:
            self._expedientes.delete([key])
            raise ValidationError(msg_grande)
