"""Gestiones de cobro: bandeja, registro (con promesa), edición, notas rápidas y bitácora con IA.

Reemplaza ``/gestiones/page.tsx`` (consultas directas al origen), ``/api/clientes/gestiones``,
``/api/clientes/gestiones/nueva``, ``/api/notas-rapidas``, ``/api/ai/formalizar-bitacora`` y los
inserts directos de ``modal-gestion.tsx`` / la consulta de ``form-nueva-gestion.tsx``.
"""

from __future__ import annotations

import re
from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import AppUnitOfWork, UnitOfWorkFactory
from application.ports.integraciones import LanguageModel
from application.use_cases.common import (
    analista_scope,
    optional_text,
    parse_date,
    parse_number,
    parse_optional_date,
    parse_uuid,
    require_escritura,
    require_usuario,
)
from domain.entities.gestiones import COLUMNAS_EDITABLES, NuevaGestion
from domain.entities.promesas import NuevaPromesa, evento, fmt_crc
from domain.entities.usuario import Usuario
from domain.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError

MSG_SIN_MODULO = "Su rol no tiene acceso a la gestión de cartera"
PAGE_MAX = 1000
MODELO_BITACORA = "claude-haiku-4-5-20251001"
_FECHA_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def require_gestor_cartera(usuario: Usuario) -> Usuario:
    """Guard de Mi Cartera / Gestiones / Promesas / Solicitudes.

    COORDINADOR siempre entra; ANALISTA, o ANALISTA_RIESGO con cartera asignada
    (``puedeGestionarCartera``). GERENCIA y ANALISTA_RIESGO sin cartera quedan fuera.
    """
    if usuario.es_coordinador or usuario.puede_gestionar_cartera:
        return usuario
    raise ForbiddenError(MSG_SIN_MODULO)


def _scope(uow: AppUnitOfWork, principal: Principal, analista: str | None) -> str | None:
    usuario = require_gestor_cartera(require_usuario(uow, principal))
    return analista_scope(usuario, analista)


def _require_id(raw: Any):
    if not raw:
        raise ValidationError("id requerido", details={"field": "id"})
    return parse_uuid(raw, "id")


def _es_propia(usuario: Usuario, analista_email: str | None) -> bool:
    return usuario.es_coordinador or (analista_email or "").lower() == usuario.email.lower()


class ListGestionesUseCase:
    """Bandeja de gestiones, por lotes (el front pide de a 1000 como antes con ``.range``)."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(
        self, principal: Principal, analista: str | None, offset: int | None, limit: int | None
    ) -> list[dict[str, Any]]:
        offset = max(offset or 0, 0)
        limit = min(max(limit or PAGE_MAX, 1), PAGE_MAX)
        with self._uow_factory(principal) as uow:
            email = _scope(uow, principal, analista)
            return uow.gestiones.list_gestiones(email, offset, limit)


class GetReferenciasGestionesUseCase:
    """Solicitudes ligadas, estado de la promesa, nombre del cliente y si tiene cartera (link a la ficha)."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, analista: str | None) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            email = _scope(uow, principal, analista)
            return uow.gestiones.referencias(email)


class UpdateGestionUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, bool]:
        gestion_id = _require_id(body.get("id"))
        changes = {key: body[key] for key in COLUMNAS_EDITABLES if key in body}
        if isinstance(changes.get("nota"), str):
            changes["nota"] = changes["nota"].strip()
        if changes.get("promesa_fecha") is not None:
            changes["promesa_fecha"] = parse_date(changes["promesa_fecha"], "promesa_fecha")
        if changes.get("promesa_monto") is not None:
            changes["promesa_monto"] = parse_number(changes["promesa_monto"], "promesa_monto")
        with self._uow_factory(principal) as uow:
            usuario = require_gestor_cartera(require_escritura(require_usuario(uow, principal)))
            dueno = uow.gestiones.find_analista_email(gestion_id)
            if dueno is None:
                raise NotFoundError("Gestión no encontrada")
            if not _es_propia(usuario, dueno):
                raise ForbiddenError("Sin permisos para editar esta gestión")
            if changes:
                uow.gestiones.update_gestion(gestion_id, changes)
            uow.commit()
        return {"ok": True}


class DeleteGestionUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, raw_id: Any) -> dict[str, bool]:
        gestion_id = _require_id(raw_id)
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            if not usuario.es_coordinador:
                raise ForbiddenError("Solo el coordinador puede eliminar gestiones")
            uow.gestiones.desactivar_gestion(gestion_id)
            uow.commit()
        return {"ok": True}


class RegistrarGestionUseCase:
    """POST /clientes/gestiones/nueva: gestión + (opcional) promesa en UNA transacción.

    El origen hacía INSERT gestión → INSERT promesa → UPDATE gestión con "rollback" manual (DELETE).
    Aquí todo va en la misma transacción: si algo falla no queda nada a medias.
    """

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        if not all(body.get(k) for k in ("cliente_cod", "tipo", "resultado", "fecha", "hora")):
            raise ValidationError("Campos obligatorios faltantes")
        promesa = body.get("promesa") or None
        monto = fecha_promesa = None
        if promesa is not None:
            if not isinstance(promesa, dict):
                raise ValidationError("Campos obligatorios faltantes")
            monto = parse_number(promesa.get("monto"), "promesa.monto")
            fecha_promesa = parse_date(promesa.get("fecha_promesa"), "promesa.fecha_promesa")
        metadata = body.get("metadata")
        nota = str(body.get("nota") or "").strip()
        fecha = parse_date(body["fecha"], "fecha")
        with self._uow_factory(principal) as uow:
            usuario = require_gestor_cartera(require_escritura(require_usuario(uow, principal)))
            cliente_cod = str(body["cliente_cod"])
            contribuyente = optional_text(body.get("contribuyente"))
            if promesa is not None and uow.promesas.existe_pendiente(cliente_cod, monto, fecha_promesa):
                raise ConflictError(
                    f"Ya existe una promesa pendiente por {fmt_crc(monto)} para el "
                    f"{fecha_promesa.isoformat()}. No se permiten promesas duplicadas."
                )
            gestion_id = uow.gestiones.insert_gestion(
                NuevaGestion(
                    cliente_cod=cliente_cod,
                    contribuyente=contribuyente,
                    analista_email=usuario.email,  # quien REGISTRA, no el asignado
                    fecha=fecha,
                    hora=str(body["hora"]),
                    tipo=str(body["tipo"]),
                    resultado=str(body["resultado"]),
                    nota=nota,
                    proxima_accion=optional_text(body.get("proxima_accion")),
                    proxima_accion_fecha=parse_optional_date(
                        body.get("proxima_accion_fecha"), "proxima_accion_fecha"
                    ),
                    metadata=metadata if isinstance(metadata, dict) else None,
                )
            )
            if promesa is not None:
                nombre = uow.gestiones.nombre_cliente(cliente_cod) or contribuyente
                creada = evento(
                    fecha, "creada", f"Promesa creada desde gestión ({body['resultado']})", usuario.email
                )
                promesa_id = uow.promesas.insert(
                    NuevaPromesa(
                        cliente_cod=cliente_cod,
                        cliente_nombre=nombre,
                        contribuyente=contribuyente,
                        analista_email=usuario.email,
                        fecha_creacion=fecha,
                        fecha_promesa=fecha_promesa,
                        monto=monto,
                        notas=nota,
                        gestion_id=gestion_id,  # trazabilidad obligatoria
                        eventos=[creada],
                    )
                )
                uow.gestiones.vincular_promesa(gestion_id, promesa_id)
            uow.commit()
        return {"ok": True, "gestion_id": gestion_id}


class RegistrarGestionRapidaUseCase:
    """Registro simple de ``modal-gestion.tsx`` (antes 2 inserts directos al origen desde el navegador).

    Resultado "Promesa OK" con fecha: la gestión guarda ``promesa_fecha/monto`` y se crea la promesa.
    """

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        cliente_cod = str(body.get("cliente_cod") or "").strip()
        tipo = str(body.get("tipo") or "").strip()
        resultado = str(body.get("resultado") or "").strip()
        if not cliente_cod or not tipo or not resultado:
            raise ValidationError("Campos obligatorios faltantes")
        nota = str(body.get("nota") or "")
        fecha = parse_date(body.get("fecha"), "fecha")
        promesa_fecha = parse_optional_date(body.get("promesa_fecha"), "promesa_fecha")
        es_promesa = resultado == "Promesa OK" and promesa_fecha is not None
        raw_monto = body.get("promesa_monto")
        monto = None if raw_monto in (None, "") else parse_number(raw_monto, "promesa_monto")
        with self._uow_factory(principal) as uow:
            usuario = require_gestor_cartera(require_escritura(require_usuario(uow, principal)))
            analista_email = str(body.get("analista_email") or usuario.email)
            if not _es_propia(usuario, analista_email):
                raise ForbiddenError("Sin permisos para registrar gestiones de otro analista")
            contribuyente = optional_text(body.get("contribuyente"))
            uow.gestiones.insert_gestion(
                NuevaGestion(
                    cliente_cod=cliente_cod,
                    contribuyente=contribuyente,
                    analista_email=analista_email,
                    fecha=fecha,
                    hora=str(body.get("hora") or "00:00"),
                    tipo=tipo,
                    resultado=resultado,
                    nota=nota,
                    promesa_fecha=promesa_fecha if es_promesa else None,
                    promesa_monto=monto if es_promesa else None,
                )
            )
            if es_promesa:
                uow.promesas.insert(
                    NuevaPromesa(
                        cliente_cod=cliente_cod,
                        cliente_nombre=None,
                        contribuyente=contribuyente,
                        analista_email=analista_email,
                        fecha_creacion=fecha,
                        fecha_promesa=promesa_fecha,
                        monto=monto or 0.0,
                        notas=nota,
                    )
                )
            uow.commit()
        return {"ok": True}


class ListCodigosContribuyenteUseCase:
    """Otros códigos del mismo contribuyente ("aplicar a todos" del formulario de gestión)."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(
        self, principal: Principal, contribuyente: str | None, excluir: str | None
    ) -> list[dict[str, str]]:
        if not (contribuyente or "").strip():
            return []
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
            return uow.gestiones.codigos_contribuyente(contribuyente.strip(), excluir)


def _fecha_nota(raw: Any):
    if not raw or not _FECHA_RE.match(str(raw)):
        raise ValidationError("Parámetro fecha inválido (YYYY-MM-DD)", details={"field": "fecha"})
    return parse_date(raw, "fecha")


class GetNotaRapidaUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, fecha: str | None) -> dict[str, Any]:
        dia = _fecha_nota(fecha)
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            row = uow.gestiones.get_nota_rapida(usuario.id, dia)
        return {
            "contenido": (row or {}).get("contenido") or "",
            "updated_at": (row or {}).get("updated_at"),
        }


class SaveNotaRapidaUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, bool]:
        dia = _fecha_nota(body.get("fecha"))
        contenido = body.get("contenido")
        contenido = "" if contenido is None else str(contenido)
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            uow.gestiones.save_nota_rapida(usuario.id, dia, contenido)
            uow.commit()
        return {"ok": True}


def _system_prompt_bitacora(tipo: str, resultado: str, cliente: str) -> str:
    # Contexto va en el system prompt — así el modelo no lo "documenta" en la respuesta
    return (
        "Actuás como transcriptor profesional de Crédito y Cobro para COFERSA en Costa Rica. "
        f'Contexto de la gestión (NO repetir en la respuesta): canal={tipo}, resultado="{resultado}", '
        f'cliente="{cliente}". '
        "Tu tarea: recibir la anotación informal del analista y devolver ÚNICAMENTE su versión formal. "
        "REGLAS ESTRICTAS: "
        "(1) Redactá en tercera persona formal (usted). "
        "(2) No incluyas encabezados, etiquetas ni referencias al canal o resultado. "
        "(3) Mantén intactos montos, fechas y acuerdos específicos. "
        "(4) Corregí ortografía, gramática y abreviaturas informales. "
        "(5) Devolvé texto limpio, listo para insertar en una bitácora, sin introducciones ni firma."
    )


class FormalizarBitacoraUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory, model: LanguageModel) -> None:
        self._uow_factory = uow_factory
        self._model = model

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
        nota = str(body.get("nota") or "").strip()
        if not nota:
            raise ValidationError("Nota vacía")
        system = _system_prompt_bitacora(
            str(body.get("tipo") or ""),
            str(body.get("resultado") or ""),
            str(body.get("clienteNombre") or ""),
        )
        texto = self._model.complete(model=MODELO_BITACORA, system=system, prompt=nota, max_tokens=512)
        return {"ok": True, "texto": texto.strip()}
