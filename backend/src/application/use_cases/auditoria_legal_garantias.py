"""Auditoría y Control Legal — escrituras sobre garantías.

Reemplaza las API Routes:
- ``POST  /api/auditoria-legal/garantias``                 → ``RegistrarGarantiaUseCase``
- ``PATCH /api/auditoria-legal/garantias/[id]``            → ``EditarGarantiaUseCase``
- ``PATCH /api/auditoria-legal/garantias/[id]/custodia``   → ``CambiarCustodiaGarantiaUseCase`` (Gmail)
- ``POST  /api/auditoria-legal/garantias/[id]/documento``  → ``CrearUploadDocumentoGarantiaUseCase`` +
  ``AdjuntarDocumentoGarantiaUseCase`` (subida directa a S3 con URL prefirmada)
- ``POST  /api/auditoria-legal/garantias/[id]/pagare``     → ``GenerarPagareUseCase``

Mismos mensajes de error y mismas reglas (máquina de estados de custodia, tope por carpeta, campos
congelados por el pagaré, compare-and-swap). Las escrituras multi-paso del POST corren ahora en una
sola transacción (antes había compensaciones manuales si fallaba el insert).
"""

from __future__ import annotations

import logging
import math
import re
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.ports.file_storage import FileStorage
from application.ports.integraciones import EmailMessage
from application.use_cases.auditoria_legal import require_escritura_modulo, url_documento
from application.use_cases.common import ahora_cr
from application.use_cases.mailer import UsuarioMailer
from domain.entities.auditoria_legal import (
    ACCION_CUSTODIA_CFG,
    CAMPOS_CONGELADOS_POR_PAGARE,
    CAMPOS_NO_EDITABLES,
    ESTADO_CUSTODIA_LABEL,
    ESTADOS_CIVILES,
    ETIQUETAS_CAMPOS,
    MAX_MB_DOCUMENTO_GARANTIA,
    ORIGENES_REGISTRO,
    TIPOS_TITULO,
    TOPE_GARANTIAS_POR_CARPETA,
    es_gaveta_valida,
    es_mueble_valido,
    es_persona_juridica,
    fmt_crc,
    fmt_fecha,
    formatear_ubicacion_archivo,
)
from domain.exceptions import BusinessRuleViolation, ConflictError, NotFoundError, ValidationError
from domain.services.auditoria_legal_correos import asunto_garantia_a_firmar, html_garantia_a_firmar

_logger = logging.getLogger(__name__)

RE_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MSG_GARANTIA_NO_ENCONTRADA = "Garantía no encontrada"
MSG_MUEBLE = "Mueble/Archivero inválido"
MSG_GAVETA = "Gaveta/Caja inválida"
MSG_CARPETA = "Carpeta/Expediente N.° debe ser un entero mayor a 0"
MSG_FIADOR_REQUERIDO = "Nombre del fiador requerido cuando tiene_fiador es true"
CAMPOS_FIADOR = (
    ("fiador_nombre", "Nombre del fiador"),
    ("fiador_cedula", "Cédula del fiador"),
    ("fiador_telefono", "Teléfono del fiador"),
)


def parse_garantia_id(raw: Any) -> int:
    try:
        value = int(str(raw))
    except (TypeError, ValueError) as error:
        raise ValidationError("id inválido") from error
    if value <= 0:
        raise ValidationError("id inválido")
    return value


def _numero(raw: Any) -> float:
    """``Number(x)`` de JS para los valores que llegan en el JSON (NaN si no es numérico)."""
    if isinstance(raw, bool):
        return float(raw)
    if raw is None:
        return 0.0
    try:
        return float(str(raw).strip() or 0) if not isinstance(raw, (int, float)) else float(raw)
    except ValueError:
        return math.nan


def _entero_positivo(raw: Any) -> int | None:
    value = _numero(raw)
    return int(value) if math.isfinite(value) and value == int(value) and value > 0 else None


def _texto_o_none(raw: Any) -> str | None:
    return (raw.strip() if isinstance(raw, str) else "") or None


def _txt(value: str | None) -> str:
    return f'"{value}"' if value else "—"


def _iso(value: Any) -> str:
    return value.isoformat()[:10] if hasattr(value, "isoformat") else str(value or "")


def _decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return Decimal(0)


def _validar_ubicacion(mueble: Any, gaveta: Any, carpeta: Any) -> tuple[str, str, int]:
    if not es_mueble_valido(mueble):
        raise ValidationError(MSG_MUEBLE)
    if not es_gaveta_valida(gaveta):
        raise ValidationError(MSG_GAVETA)
    numero = _entero_positivo(carpeta)
    if numero is None:
        raise ValidationError(MSG_CARPETA)
    return mueble, gaveta, numero


class RegistrarGarantiaUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        contribuyente = str(body.get("contribuyente") or "").strip()
        cliente_nombre = str(body.get("cliente_nombre") or "").strip()
        tipo_titulo = body.get("tipo_titulo")
        if not (
            contribuyente
            and cliente_nombre
            and tipo_titulo
            and body.get("monto_garantizado")
            and body.get("fecha_emision")
            and body.get("fecha_vencimiento")
        ):
            raise ValidationError("Faltan campos requeridos")
        if tipo_titulo not in TIPOS_TITULO:
            raise ValidationError("tipo_titulo inválido")
        tiene_fiador = bool(body.get("tiene_fiador"))
        if tiene_fiador and not _texto_o_none(body.get("fiador_nombre")):
            raise ValidationError(MSG_FIADOR_REQUERIDO)
        ubicacion = self._ubicacion(body)
        estado_custodia = body.get("estado_custodia", "EN_BOVEDA")
        if estado_custodia not in ("EN_BOVEDA", "ENVIADO_VENDEDOR", "EN_FIRMA"):
            raise ValidationError("estado_custodia inválido")
        origen = body.get("origen_registro", "EMITIDO_SISTEMA")
        if origen not in ORIGENES_REGISTRO:
            raise ValidationError("origen_registro inválido")
        emision, vencimiento = self._fechas(body)
        monto = _numero(body.get("monto_garantizado"))
        if not math.isfinite(monto) or monto <= 0:
            raise ValidationError("monto_garantizado debe ser un número mayor a 0")

        with self._uow_factory(principal) as uow:
            usuario = require_escritura_modulo(uow, principal)
            repo = uow.auditoria_legal
            texto_ubicacion = "Pendiente de despacho"
            if ubicacion:
                texto_ubicacion = formatear_ubicacion_archivo(*ubicacion)
                if estado_custodia == "EN_BOVEDA" and repo.contar_en_carpeta(*ubicacion, None) >= (
                    TOPE_GARANTIAS_POR_CARPETA
                ):
                    raise ValidationError(
                        f"{texto_ubicacion} ya tiene {TOPE_GARANTIAS_POR_CARPETA} garantías -- "
                        "elegí otra carpeta."
                    )
            resuelto = repo.resolver_responsables(contribuyente)
            vendedor_cod, override = self._vendedor(repo, contribuyente, resuelto, body)
            consecutivo = repo.siguiente_consecutivo()
            anterior = repo.garantia_activa(contribuyente)
            if anterior:
                repo.desactivar_garantia(anterior["id"])
            nueva_id = repo.insertar_garantia(
                {
                    "contribuyente": contribuyente,
                    "cliente_nombre": cliente_nombre,
                    "tipo_titulo": tipo_titulo,
                    "monto_garantizado": monto,
                    "tiene_fiador": tiene_fiador,
                    "fiador_nombre": _texto_o_none(body.get("fiador_nombre")) if tiene_fiador else None,
                    "fiador_cedula": _texto_o_none(body.get("fiador_cedula")) if tiene_fiador else None,
                    "fiador_telefono": _texto_o_none(body.get("fiador_telefono")) if tiene_fiador else None,
                    "representante_legal": _texto_o_none(body.get("representante_legal")),
                    "fecha_emision": emision,
                    "fecha_vencimiento": vencimiento,
                    "ubicacion_archivero": texto_ubicacion,
                    "ubicacion_archivero_mueble": ubicacion[0] if ubicacion else None,
                    "ubicacion_archivero_gaveta": ubicacion[1] if ubicacion else None,
                    "ubicacion_archivero_carpeta": ubicacion[2] if ubicacion else None,
                    "estado_custodia": estado_custodia,
                    "origen_registro": origen,
                    "activo": True,
                    "registrado_por": usuario.id,
                    "analista_email": resuelto.get("analista_email") or "",
                    "vendedor_cod": vendedor_cod,
                    "consecutivo": consecutivo,
                }
            )
            notas = [
                f"Sustituye a {anterior['tipo_titulo']} #{anterior['id']}" if anterior else None,
                f"Registrado con el título ya en estado '{ESTADO_CUSTODIA_LABEL[estado_custodia]}' "
                "(digitalización de archivo existente)"
                if estado_custodia != "EN_BOVEDA"
                else None,
                "Registrado como garantía existente (Física) -- documento ya firmado, "
                "digitalización de archivo"
                if origen == "EXISTENTE_FISICA"
                else None,
                f"Vendedor de trámite ajustado manualmente a {vendedor_cod} (el de mayor saldo era "
                f"{resuelto.get('vendedor_cod') or 'ninguno'})"
                if override
                else None,
            ]
            notas_validas = [n for n in notas if n]
            repo.registrar_evento(
                nueva_id,
                "APERTURA_EXPEDIENTE",
                usuario.id,
                " · ".join(notas_validas) if notas_validas else None,
            )
            if anterior:
                repo.vincular_reemplazo(anterior["id"], nueva_id)
                repo.registrar_evento(
                    anterior["id"],
                    "SUSTITUCION_DE_TITULO",
                    usuario.id,
                    f"Sustituida por {tipo_titulo} #{nueva_id}",
                )
            if resuelto.get("hay_conflicto_analista"):
                self._notificar_conflicto(repo, contribuyente, cliente_nombre, resuelto.get("analista_email"))
            uow.commit()
        return {"ok": True, "id": nueva_id, "sustituyo": bool(anterior)}

    @staticmethod
    def _ubicacion(body: dict[str, Any]) -> tuple[str, str, int] | None:
        claves = ("ubicacion_mueble", "ubicacion_gaveta", "ubicacion_carpeta")
        if not any(clave in body for clave in claves):
            return None
        return _validar_ubicacion(*(body.get(clave) for clave in claves))

    @staticmethod
    def _fechas(body: dict[str, Any]) -> tuple[str, str]:
        emision, vencimiento = str(body["fecha_emision"]), str(body["fecha_vencimiento"])
        for clave, valor in (("fecha_emision", emision), ("fecha_vencimiento", vencimiento)):
            if not RE_FECHA.match(valor):
                raise ValidationError(f"{clave} debe tener formato YYYY-MM-DD")
        if not vencimiento > emision:
            raise ValidationError("La fecha de vencimiento debe ser posterior a la de emisión")
        return emision, vencimiento

    @staticmethod
    def _vendedor(
        repo, contribuyente: str, resuelto: dict[str, Any], body: dict[str, Any]
    ) -> tuple[str | None, bool]:
        vendedor_cod = resuelto.get("vendedor_cod")
        override = body.get("vendedor_cod_override")
        if override in (None, ""):
            return vendedor_cod, False
        vinculados = repo.vendedores_por_contribuyente(contribuyente)
        if not any(v.get("vendedor_cod") == override for v in vinculados):
            raise ValidationError("El vendedor elegido no está vinculado a este contribuyente")
        return override, override != vendedor_cod

    @staticmethod
    def _notificar_conflicto(repo, contribuyente: str, cliente_nombre: str, analista: str | None) -> None:
        coordinador = repo.id_coordinador()
        if coordinador is None:
            return
        repo.crear_notificacion(
            coordinador,
            "GARANTIA",
            "Garantía con analista ambiguo",
            f"El contribuyente {contribuyente} ({cliente_nombre}) tiene códigos de cliente asignados a "
            f"más de un analista. Se resolvió automáticamente a {analista or 'ninguno'} -- confirmá o "
            "reasigná si hace falta.",
            "/auditoria-legal/garantias",
        )


class EditarGarantiaUseCase:
    """Corrección de datos con constancia CORRECCION_DATOS (qué campo pasó de qué a qué)."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, garantia_id: int, body: dict[str, Any]) -> dict[str, Any]:
        prohibidos = [k for k in CAMPOS_NO_EDITABLES if k in body]
        if prohibidos:
            raise ValidationError(f"Estos campos no se pueden editar desde aquí: {', '.join(prohibidos)}")
        with self._uow_factory(principal) as uow:
            usuario = require_escritura_modulo(uow, principal)
            repo = uow.auditoria_legal
            actual = repo.garantia(garantia_id)
            if not actual:
                raise NotFoundError(MSG_GARANTIA_NO_ENCONTRADA)
            if not actual["activo"]:
                raise ConflictError(
                    "Esta garantía fue sustituida por otra: es un registro histórico del expediente y no se "
                    "puede editar. Editá la garantía vigente del contribuyente."
                )
            updates: dict[str, Any] = {}
            cambios: list[str] = []
            self._datos_basicos(body, actual, updates, cambios)
            self._fiador(body, actual, updates, cambios)
            self._representante(body, actual, updates, cambios)
            self._fechas(body, actual, updates, cambios)
            self._ubicacion(repo, garantia_id, body, actual, updates, cambios)
            congelados = [k for k in CAMPOS_CONGELADOS_POR_PAGARE if k in updates]
            if actual.get("documento_pagare_generado_en") and congelados:
                raise ConflictError(
                    "Esta garantía ya tiene un pagaré generado: no se pueden editar los datos que aparecen "
                    f"impresos en el documento ({', '.join(ETIQUETAS_CAMPOS[k] for k in congelados)}). "
                    "Si hay un error, contactá al coordinador."
                )
            if not cambios:
                return {"ok": True, "sin_cambios": True, "cambios": 0}
            if not repo.actualizar_garantia(garantia_id, updates, sin_pagare=bool(congelados)):
                raise ConflictError(
                    "La garantía fue sustituida, o ya se le generó un pagaré durante esta operación -- "
                    "volvé a "
                    "intentar."
                    if congelados
                    else "La garantía cambió mientras se guardaba (fue sustituida). "
                    "Recargá y volvé a intentar."
                )
            repo.registrar_evento(garantia_id, "CORRECCION_DATOS", usuario.id, " · ".join(cambios))
            uow.commit()
        return {"ok": True, "cambios": len(cambios)}

    @staticmethod
    def _datos_basicos(body, actual, updates, cambios) -> None:
        if "tipo_titulo" in body:
            valor = body["tipo_titulo"]
            if not isinstance(valor, str) or valor not in TIPOS_TITULO:
                raise ValidationError("tipo_titulo inválido")
            if valor != actual["tipo_titulo"]:
                updates["tipo_titulo"] = valor
                cambios.append(f"Tipo de título: {actual['tipo_titulo']} → {valor}")
        if "monto_garantizado" in body:
            valor = body["monto_garantizado"]
            if (
                isinstance(valor, bool)
                or not isinstance(valor, (int, float))
                or not math.isfinite(valor)
                or valor <= 0
            ):
                raise ValidationError("monto_garantizado debe ser un número mayor a 0")
            if _decimal(valor) != _decimal(actual["monto_garantizado"]):
                updates["monto_garantizado"] = valor
                cambios.append(f"Monto: {fmt_crc(actual['monto_garantizado'])} → {fmt_crc(valor)}")

    @staticmethod
    def _fiador(body, actual, updates, cambios) -> None:
        if "tiene_fiador" in body and not isinstance(body["tiene_fiador"], bool):
            raise ValidationError("tiene_fiador debe ser booleano")
        tiene = body["tiene_fiador"] if "tiene_fiador" in body else bool(actual["tiene_fiador"])
        final: dict[str, str | None] = {}
        for clave, _ in CAMPOS_FIADOR:
            if not tiene:
                final[clave] = None
            elif clave in body:
                valor = body[clave]
                if valor is not None and not isinstance(valor, str):
                    raise ValidationError(f"{clave} debe ser texto o null")
                final[clave] = _texto_o_none(valor)
            else:
                final[clave] = actual.get(clave)
        if tiene and not final["fiador_nombre"]:
            raise ValidationError(MSG_FIADOR_REQUERIDO)
        if tiene != bool(actual["tiene_fiador"]):
            updates["tiene_fiador"] = tiene
            cambios.append(f"Fiador: {'Sí' if actual['tiene_fiador'] else 'No'} → {'Sí' if tiene else 'No'}")
        for clave, label in CAMPOS_FIADOR:
            if final[clave] != actual.get(clave):
                updates[clave] = final[clave]
                cambios.append(f"{label}: {_txt(actual.get(clave))} → {_txt(final[clave])}")

    @staticmethod
    def _representante(body, actual, updates, cambios) -> None:
        if "representante_legal" not in body:
            return
        valor = body["representante_legal"]
        if valor is not None and not isinstance(valor, str):
            raise ValidationError("representante_legal debe ser texto o null")
        rep = _texto_o_none(valor)
        if rep != actual.get("representante_legal"):
            updates["representante_legal"] = rep
            cambios.append(f"Representante legal: {_txt(actual.get('representante_legal'))} → {_txt(rep)}")

    @staticmethod
    def _fechas(body, actual, updates, cambios) -> None:
        for clave in ("fecha_emision", "fecha_vencimiento"):
            if clave in body and (not isinstance(body[clave], str) or not RE_FECHA.match(body[clave])):
                raise ValidationError(f"{clave} debe tener formato YYYY-MM-DD")
        actual_emision, actual_vencimiento = _iso(actual["fecha_emision"]), _iso(actual["fecha_vencimiento"])
        emision = body.get("fecha_emision", actual_emision)
        vencimiento = body.get("fecha_vencimiento", actual_vencimiento)
        if ("fecha_emision" in body or "fecha_vencimiento" in body) and not vencimiento > emision:
            raise ValidationError("La fecha de vencimiento debe ser posterior a la de emisión")
        if emision != actual_emision:
            updates["fecha_emision"] = emision
            cambios.append(f"Emisión: {fmt_fecha(actual_emision)} → {fmt_fecha(emision)}")
        if vencimiento != actual_vencimiento:
            updates["fecha_vencimiento"] = vencimiento
            cambios.append(f"Vencimiento: {fmt_fecha(actual_vencimiento)} → {fmt_fecha(vencimiento)}")

    @staticmethod
    def _ubicacion(repo, garantia_id, body, actual, updates, cambios) -> None:
        claves = ("ubicacion_mueble", "ubicacion_gaveta", "ubicacion_carpeta")
        if not any(clave in body for clave in claves):
            return
        if actual["estado_custodia"] != "EN_BOVEDA":
            raise ConflictError(
                "La ubicación sólo se puede editar mientras el título está en bóveda -- ahora mismo la "
                "ubicación la define el estado de custodia."
            )
        mueble, gaveta, carpeta = _validar_ubicacion(
            body.get("ubicacion_mueble", actual.get("ubicacion_archivero_mueble")),
            body.get("ubicacion_gaveta", actual.get("ubicacion_archivero_gaveta")),
            body.get("ubicacion_carpeta", actual.get("ubicacion_archivero_carpeta")),
        )
        nuevos = {
            "ubicacion_archivero_mueble": mueble,
            "ubicacion_archivero_gaveta": gaveta,
            "ubicacion_archivero_carpeta": carpeta,
        }
        movido = {k: v for k, v in nuevos.items() if v != actual.get(k)}
        updates.update(movido)
        if (
            movido
            and repo.contar_en_carpeta(mueble, gaveta, carpeta, garantia_id) >= TOPE_GARANTIAS_POR_CARPETA
        ):
            raise ValidationError(
                f"{formatear_ubicacion_archivo(mueble, gaveta, carpeta)} ya tiene "
                f"{TOPE_GARANTIAS_POR_CARPETA} "
                "garantías -- elegí otra carpeta."
            )
        texto = formatear_ubicacion_archivo(mueble, gaveta, carpeta)
        if texto != actual.get("ubicacion_archivero"):
            updates["ubicacion_archivero"] = texto
            cambios.append(f"Ubicación: {_txt(actual.get('ubicacion_archivero'))} → {_txt(texto)}")


class CambiarCustodiaGarantiaUseCase:
    """Máquina de estados de custodia; ENTREGAR envía el correo al vendedor (CC supervisor)."""

    def __init__(self, uow_factory: UnitOfWorkFactory, mailer: UsuarioMailer) -> None:
        self._uow_factory = uow_factory
        self._mailer = mailer

    def execute(self, principal: Principal, garantia_id: int, body: dict[str, Any]) -> dict[str, Any]:
        accion = body.get("accion")
        if not isinstance(accion, str) or accion not in ACCION_CUSTODIA_CFG:
            raise ValidationError("accion inválida")
        cfg = ACCION_CUSTODIA_CFG[accion]
        reingreso = (
            _validar_ubicacion(body.get("mueble"), body.get("gaveta"), body.get("carpeta"))
            if accion == "REINGRESAR"
            else None
        )
        with self._uow_factory(principal) as uow:
            usuario = require_escritura_modulo(uow, principal)
            repo = uow.auditoria_legal
            garantia = repo.garantia(garantia_id)
            if not garantia:
                raise NotFoundError(MSG_GARANTIA_NO_ENCONTRADA)
            estado = garantia["estado_custodia"]
            if estado not in cfg.desde:
                requeridos = " o ".join(ESTADO_CUSTODIA_LABEL[e] for e in cfg.desde)
                raise ConflictError(
                    f"Esta garantía está en estado '{ESTADO_CUSTODIA_LABEL.get(estado, estado)}', "
                    "no se puede "
                    f"aplicar '{cfg.label}' (requiere {requeridos})"
                )
            vendedor = (
                repo.vendedor(garantia["vendedor_cod"])
                if cfg.hacia == "ENVIADO_VENDEDOR" and garantia.get("vendedor_cod")
                else None
            )
            supervisor = (
                repo.email_supervisor(vendedor["supervisor_cod"])
                if (
                    accion == "ENTREGAR"
                    and vendedor
                    and vendedor.get("email")
                    and vendedor.get("supervisor_cod")
                )
                else None
            )
            if not repo.actualizar_custodia(
                garantia_id, estado, self._cambios(cfg.hacia, vendedor, reingreso)
            ):
                raise ConflictError(
                    "La garantía cambió de estado mientras se procesaba esta acción. "
                    "Recargá y volvé a intentar."
                )
            uow.commit()

        resultado = {"email_sent": False, "email_to": None, "email_error": None}
        if accion == "ENTREGAR":
            resultado = self._enviar_correo(principal, garantia, vendedor, supervisor)
        nota = None
        if accion == "ENTREGAR":
            nota = (
                f"Correo enviado a {resultado['email_to']}"
                if resultado["email_sent"]
                else f"Correo NO enviado: {resultado['email_error']}"
            )
        try:
            with self._uow_factory(principal) as uow:
                uow.auditoria_legal.registrar_evento(garantia_id, cfg.evento, usuario.id, nota)
                uow.commit()
        except Exception:  # la transición ya se aplicó: el evento no es fatal (igual que el origen)
            _logger.exception("[garantias][custodia] Error al registrar evento")
        return {"ok": True, "nuevo_estado": cfg.hacia, **resultado}

    @staticmethod
    def _cambios(hacia: str, vendedor: dict | None, reingreso: tuple[str, str, int] | None) -> dict[str, Any]:
        if hacia == "ENVIADO_VENDEDOR":
            texto = (
                f"Con Vendedor: {vendedor['nombre']}"
                if vendedor and vendedor.get("nombre")
                else "En ruta con vendedor (sin vendedor asignado)"
            )
        elif hacia == "EN_FIRMA":
            texto = "En trámite de firma"
        else:
            texto = formatear_ubicacion_archivo(*reingreso) if reingreso else ""
        return {
            "estado_custodia": hacia,
            "ubicacion_archivero": texto,
            "ubicacion_archivero_mueble": reingreso[0] if reingreso else None,
            "ubicacion_archivero_gaveta": reingreso[1] if reingreso else None,
            "ubicacion_archivero_carpeta": reingreso[2] if reingreso else None,
        }

    def _enviar_correo(self, principal, garantia, vendedor, supervisor) -> dict[str, Any]:
        def fallo(mensaje: str) -> dict[str, Any]:
            return {"email_sent": False, "email_to": None, "email_error": mensaje}

        if not garantia.get("vendedor_cod"):
            return fallo("No se pudo resolver un vendedor para este contribuyente -- no se envió correo.")
        if not vendedor or not vendedor.get("email"):
            return fallo("El vendedor asignado no tiene correo registrado -- no se envió correo.")
        hoy = ahora_cr().date()
        html = html_garantia_a_firmar(
            cliente_nombre=garantia["cliente_nombre"],
            contribuyente=garantia["contribuyente"],
            tipo_titulo=garantia["tipo_titulo"],
            monto_texto=fmt_crc(garantia["monto_garantizado"]),
            vencimiento_texto=fmt_fecha(garantia["fecha_vencimiento"]),
            fecha_texto=f"{hoy.day}/{hoy.month}/{hoy.year}",
        )
        try:
            with self._uow_factory(principal) as uow:
                usuario = require_escritura_modulo(uow, principal)
                mensaje = EmailMessage(
                    to=(vendedor["email"],),
                    cc=(supervisor,) if supervisor else (),
                    subject=asunto_garantia_a_firmar(garantia["cliente_nombre"]),
                    html=html,
                    sender_name=usuario.nombre,
                )
                self._mailer.send(uow, usuario, mensaje)
        except BusinessRuleViolation as error:
            return fallo(error.message)
        except Exception:
            _logger.exception("[garantias][custodia] Gmail API error")
            return fallo("Error de red al contactar Gmail API.")
        return {"email_sent": True, "email_to": vendedor["email"], "email_error": None}


class CrearUploadDocumentoGarantiaUseCase:
    """URL prefirmada para subir el PDF firmado al bucket ``garantias-legal``.

    Antes era un multipart a la API Route.

    Política ``usuarios_activos_suben_garantias_legal`` (INSERT en storage.objects para usuarios activos)
    → ``require_escritura_modulo`` antes de firmar.
    """

    def __init__(self, uow_factory: UnitOfWorkFactory, storage: FileStorage) -> None:
        self._uow_factory = uow_factory
        self._storage = storage

    def execute(self, principal: Principal, garantia_id: int, body: dict[str, Any]) -> Any:
        with self._uow_factory(principal) as uow:
            require_escritura_modulo(uow, principal)
            size = _numero(body.get("size"))
            if not math.isfinite(size) or size <= 0:
                raise ValidationError("Archivo requerido")
            if body.get("content_type") != "application/pdf":
                raise ValidationError("Solo se acepta PDF")
            if size > MAX_MB_DOCUMENTO_GARANTIA * 1024 * 1024:
                raise ValidationError(
                    f"El archivo supera {MAX_MB_DOCUMENTO_GARANTIA}MB. Escaneá en menor resolución."
                )
            if not uow.auditoria_legal.garantia(garantia_id):
                raise NotFoundError(MSG_GARANTIA_NO_ENCONTRADA)
        # Nombre generado, nunca el del archivo: re-subir crea un objeto nuevo
        # (queda el rastro de cada escaneo).
        key = f"{garantia_id}_{int(datetime.now(UTC).timestamp() * 1000)}.pdf"
        return self._storage.presign_upload(key, "application/pdf")


class AdjuntarDocumentoGarantiaUseCase:
    """Confirma la subida: vincula el PDF a la garantía y registra ADJUNTO_DOCUMENTO."""

    def __init__(self, uow_factory: UnitOfWorkFactory, storage: FileStorage) -> None:
        self._uow_factory = uow_factory
        self._storage = storage

    def execute(self, principal: Principal, garantia_id: int, body: dict[str, Any]) -> dict[str, Any]:
        key = str(body.get("key") or "")
        with self._uow_factory(principal) as uow:
            usuario = require_escritura_modulo(uow, principal)
            if not re.fullmatch(rf"{garantia_id}_\d+\.pdf", key):
                raise ValidationError("Archivo requerido")
            if not uow.auditoria_legal.garantia(garantia_id):
                raise NotFoundError(MSG_GARANTIA_NO_ENCONTRADA)
            objeto = next((o for o in self._storage.list(key, limit=5) if o.key == key), None)
            if objeto is None or objeto.size <= 0:
                raise ValidationError("Archivo requerido")
            if objeto.size > MAX_MB_DOCUMENTO_GARANTIA * 1024 * 1024:
                self._storage.delete([key])
                raise ValidationError(
                    f"El archivo supera {MAX_MB_DOCUMENTO_GARANTIA}MB. Escaneá en menor resolución."
                )
            uow.auditoria_legal.set_documento(garantia_id, key)
            uow.auditoria_legal.registrar_evento(
                garantia_id,
                "ADJUNTO_DOCUMENTO",
                usuario.id,
                f"Documento firmado adjuntado ({objeto.size / 1024:.0f} KB)",
            )
            uow.commit()
        return {"ok": True, "documento_pdf_url": url_documento(self._storage, key)}


def _estado_civil(body: dict[str, Any], campo: str) -> str:
    if campo not in body:
        raise ValidationError(f"{campo} es requerido")
    valor = body[campo]
    if not isinstance(valor, str) or valor not in ESTADOS_CIVILES:
        raise ValidationError(f"{campo} inválido")
    return valor


def _texto(body: dict[str, Any], campo: str) -> str:
    valor = body.get(campo)
    return valor.strip() if isinstance(valor, str) else ""


class GenerarPagareUseCase:
    """Primera (y única) generación del pagaré: congela los datos legales y alimenta ``personas_legales``."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, garantia_id: int, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = require_escritura_modulo(uow, principal)
            actual = uow.auditoria_legal.garantia(garantia_id)
            if not actual:
                raise NotFoundError(MSG_GARANTIA_NO_ENCONTRADA)
            if not actual["activo"]:
                raise ConflictError(
                    "Esta garantía fue sustituida por otra: es un registro histórico y no se le puede "
                    "generar pagaré."
                )
            if actual.get("documento_pagare_generado_en"):
                raise ConflictError(
                    "Esta garantía ya tiene un pagaré generado -- el documento es un registro inmutable, "
                    "no se "
                    "puede regenerar."
                )
            if actual["tipo_titulo"] != "Pagaré":
                raise ValidationError(
                    "Sólo se puede generar pagaré para garantías tipo Pagaré "
                    f"(esta es {actual['tipo_titulo']})."
                )
            es_fisica = not es_persona_juridica(actual["contribuyente"])
            updates, personas = self._datos(actual, body, es_fisica)
            if not uow.auditoria_legal.generar_pagare(garantia_id, updates):
                raise ConflictError(
                    "La garantía fue modificada, sustituida, o ya se le generó un pagaré durante esta "
                    "operación "
                    "-- volvé a intentar."
                )
            uow.commit()
        try:
            with self._uow_factory(principal) as uow:
                for persona in personas:
                    uow.auditoria_legal.upsert_persona_legal(persona)
                plantilla = "plantilla física" if es_fisica else "plantilla jurídica"
                uow.auditoria_legal.registrar_evento(
                    garantia_id,
                    "GENERACION_PAGARE",
                    usuario.id,
                    f"Pagaré generado ({plantilla}{' + fiador' if actual['tiene_fiador'] else ''})",
                )
                uow.commit()
        except Exception:  # el pagaré ya quedó generado: solo se pierde el autocompletado/constancia
            _logger.exception("[garantias][pagare] Error al upsertear persona_legal / registrar evento")
        return {"ok": True}

    @staticmethod
    def _datos(actual: dict[str, Any], body: dict[str, Any], es_fisica: bool) -> tuple[dict, list[dict]]:
        tasa = _numero(body.get("tasa_interes_moratorio"))
        if not math.isfinite(tasa) or tasa <= 0 or tasa > 100:
            raise ValidationError("La tasa de interés moratorio debe ser un número entre 0 y 100")
        lugar = _texto(body, "lugar_emision")
        if not lugar:
            raise ValidationError("El lugar de emisión es requerido")
        updates: dict[str, Any] = {
            "tasa_interes_moratorio": tasa,
            "lugar_emision": lugar,
            "documento_pagare_generado_en": datetime.now(UTC),
        }
        personas: list[dict[str, Any]] = []
        if es_fisica:
            estado = _estado_civil(body, "deudor_estado_civil")
            profesion, domicilio = _texto(body, "deudor_profesion"), _texto(body, "deudor_domicilio")
            if not profesion or not domicilio:
                raise ValidationError("Profesión y domicilio del deudor son requeridos")
            updates.update(deudor_estado_civil=estado, deudor_profesion=profesion, deudor_domicilio=domicilio)
            personas.append(
                {
                    "cedula": actual["contribuyente"],
                    "nombre": actual["cliente_nombre"],
                    "estado_civil": estado,
                    "profesion": profesion,
                    "domicilio": domicilio,
                }
            )
        else:
            cedula = re.sub(r"\D", "", str(body.get("representante_cedula") or ""))
            if not actual.get("representante_legal") or not cedula:
                raise ValidationError(
                    "Falta el nombre o la cédula del representante legal (editá la garantía para completarlo)"
                )
            if len(cedula) not in (9, 10, 12):
                raise ValidationError(
                    "La cédula del representante legal no tiene un formato válido "
                    "(deben ser 9, 10 o 12 dígitos)"
                )
            estado = _estado_civil(body, "representante_estado_civil")
            profesion, domicilio = (
                _texto(body, "representante_profesion"),
                _texto(body, "representante_domicilio"),
            )
            if not profesion or not domicilio:
                raise ValidationError("Profesión y domicilio del representante son requeridos")
            updates.update(
                representante_cedula=cedula,
                representante_estado_civil=estado,
                representante_profesion=profesion,
                representante_domicilio=domicilio,
            )
            personas.append(
                {
                    "cedula": cedula,
                    "nombre": actual["representante_legal"],
                    "estado_civil": estado,
                    "profesion": profesion,
                    "domicilio": domicilio,
                }
            )
        if actual["tiene_fiador"]:
            if not actual.get("fiador_nombre") or not actual.get("fiador_cedula"):
                raise ValidationError(
                    "Falta el nombre o la cédula del fiador (editá la garantía para completarlo)"
                )
            estado = _estado_civil(body, "fiador_estado_civil")
            profesion, domicilio = _texto(body, "fiador_profesion"), _texto(body, "fiador_domicilio")
            if not profesion or not domicilio:
                raise ValidationError("Profesión y domicilio del fiador son requeridos")
            updates.update(fiador_estado_civil=estado, fiador_profesion=profesion, fiador_domicilio=domicilio)
            persona = {
                "cedula": actual["fiador_cedula"],
                "nombre": actual["fiador_nombre"],
                "estado_civil": estado,
                "profesion": profesion,
                "domicilio": domicilio,
            }
            if actual.get("fiador_telefono"):
                persona["telefono"] = actual["fiador_telefono"]
            personas.append(persona)
        return updates, personas
