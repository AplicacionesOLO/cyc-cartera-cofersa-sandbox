"""Centro de seguimiento de promesas: bandeja, validación manual, reprogramación y soft-delete.

Reemplaza ``/promesas/page.tsx`` (consultas directas al origen), ``/api/clientes/promesas`` y
``/api/clientes/promesas/reprogramar``. Las promesas nacen solo desde Gestiones (ver
``RegistrarGestionUseCase``); el paso automático a INCUMPLIDA lo hace ``fn_conciliar_promesas`` (jobs).
"""

from __future__ import annotations

from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.use_cases.common import (
    analista_scope,
    hoy_cr,
    parse_date,
    parse_number,
    parse_uuid,
    require_escritura,
    require_usuario,
)
from application.use_cases.gestiones import require_gestor_cartera
from domain.entities.promesas import (
    ABONO_PARCIAL,
    CUMPLIDA,
    ESTADOS_CERRADOS,
    ESTADOS_VALIDACION,
    INCUMPLIDA,
    LIMITE_BANDEJA,
    REPROGRAMADA,
    NuevaPromesa,
    evento,
    fmt_crc,
)
from domain.entities.usuario import Usuario
from domain.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError


def _require_id(raw: Any):
    if not raw:
        raise ValidationError("id requerido", details={"field": "id"})
    return parse_uuid(raw, "id")


def _texto(raw: Any) -> str:
    return str(raw).strip() if raw is not None else ""


def _monto_positivo(raw: Any) -> float:
    try:
        value = float(raw) if raw not in (None, "") else 0.0
    except (TypeError, ValueError):
        value = 0.0
    return value


def _require_propia(usuario: Usuario, promesa: dict[str, Any], message: str) -> None:
    if usuario.es_coordinador:
        return
    if str(promesa.get("analista_email") or "").lower() != usuario.email.lower():
        raise ForbiddenError(message)


class ListPromesasUseCase:
    """Bandeja: promesas activas (las más próximas primero) + la gestión que originó cada una."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, analista: str | None) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = require_gestor_cartera(require_usuario(uow, principal))
            email = analista_scope(usuario, analista)
            promesas = uow.promesas.list_activas(email, LIMITE_BANDEJA)
            ids = list(dict.fromkeys(p["gestion_id"] for p in promesas if p.get("gestion_id")))
            gestiones = uow.promesas.gestiones_origen(ids) if ids else []
        return {"promesas": promesas, "gestionesMap": {str(g["id"]): g for g in gestiones}}


class ValidarPromesaUseCase:
    """PATCH /clientes/promesas: CUMPLIDA | INCUMPLIDA | ABONO_PARCIAL con evento en el timeline."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        promesa_id = _require_id(body.get("id"))
        estado = body.get("estado")
        if not estado:
            raise ValidationError("estado requerido")
        if estado not in ESTADOS_VALIDACION:
            raise ValidationError(
                "Estado inválido. Use CUMPLIDA, INCUMPLIDA o ABONO_PARCIAL. "
                "Para reprogramar use /api/promesas/reprogramar"
            )
        comentario = _texto(body.get("comentario"))
        abono = _monto_positivo(body.get("monto_abono_parcial"))
        if estado == INCUMPLIDA and not comentario:
            raise ValidationError("El motivo/comentario es obligatorio al marcar incumplida")
        if estado == ABONO_PARCIAL:
            if abono <= 0:
                raise ValidationError("El monto del abono es obligatorio y debe ser mayor a 0")
            if not comentario:
                raise ValidationError("El comentario es obligatorio al registrar un abono parcial")

        with self._uow_factory(principal) as uow:
            usuario = require_gestor_cartera(require_escritura(require_usuario(uow, principal)))
            promesa = uow.promesas.get_for_update(promesa_id)
            if promesa is None:
                raise NotFoundError("Promesa no encontrada")
            _require_propia(usuario, promesa, "Sin permisos para validar esta promesa")
            if promesa["estado"] in ESTADOS_CERRADOS:
                raise ConflictError(
                    f"Esta promesa ya está {promesa['estado'].lower()} y no puede modificarse"
                )
            hoy = hoy_cr()
            if estado == CUMPLIDA:
                tipo = "cumplida"
                descripcion = "Promesa validada como CUMPLIDA" + (f" — {comentario}" if comentario else "")
            elif estado == INCUMPLIDA:
                tipo, descripcion = "incumplida", f"Promesa marcada INCUMPLIDA — {comentario}"
            else:
                tipo, descripcion = "abono", f"Abono parcial de {fmt_crc(abono)} — {comentario}"
            nuevo = evento(hoy, tipo, descripcion, usuario.email)
            previos = promesa.get("eventos") if isinstance(promesa.get("eventos"), list) else []
            changes: dict[str, Any] = {
                "estado": estado,
                "fecha_validacion": hoy,
                "validado_por": usuario.email,
                "comentario_validacion": comentario or None,
                "eventos": [*previos, nuevo],
            }
            if estado == ABONO_PARCIAL:
                changes["monto_abono_parcial"] = abono
            uow.promesas.update(promesa_id, changes)
            uow.commit()
        return {"ok": True, "estado": estado, "evento": nuevo}


class ReprogramarPromesaUseCase:
    """Crea una NUEVA promesa (reprogramada_de_id) y cierra la original como REPROGRAMADA (atómico)."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        promesa_id = _require_id(body.get("id"))
        if not body.get("nueva_fecha"):
            raise ValidationError("La nueva fecha es obligatoria")
        nuevo_monto = _monto_positivo(body.get("nuevo_monto"))
        if nuevo_monto <= 0:
            raise ValidationError("El nuevo monto es obligatorio y debe ser mayor a 0")
        motivo = _texto(body.get("motivo"))
        if not motivo:
            raise ValidationError("El motivo de reprogramación es obligatorio")
        hoy = hoy_cr()
        nueva_fecha = parse_date(body["nueva_fecha"], "nueva_fecha")
        if nueva_fecha < hoy:
            raise ValidationError("La nueva fecha no puede ser en el pasado")

        with self._uow_factory(principal) as uow:
            usuario = require_gestor_cartera(require_escritura(require_usuario(uow, principal)))
            orig = uow.promesas.get_for_update(promesa_id)
            if orig is None:
                raise NotFoundError("Promesa no encontrada")
            _require_propia(usuario, orig, "Sin permisos para reprogramar esta promesa")
            if orig["estado"] in ESTADOS_CERRADOS:
                raise ConflictError(f"Esta promesa ya está {orig['estado'].lower()} y no puede reprogramarse")
            monto_orig = parse_number(orig.get("monto") or 0, "monto")
            creada = evento(
                hoy,
                "reprogramada",
                f"Reprogramada desde promesa anterior ({fmt_crc(monto_orig)} → {fmt_crc(nuevo_monto)})"
                f" — {motivo}",
                usuario.email,
            )
            nueva_id = uow.promesas.insert(
                NuevaPromesa(
                    cliente_cod=orig["cliente_cod"],
                    cliente_nombre=orig.get("cliente_nombre"),
                    contribuyente=orig.get("contribuyente"),
                    analista_email=orig["analista_email"],
                    fecha_creacion=hoy,
                    fecha_promesa=nueva_fecha,
                    monto=nuevo_monto,
                    notas=orig.get("notas"),
                    gestion_id=orig.get("gestion_id"),  # trazabilidad a la gestión origen
                    reprogramada_de_id=orig["id"],
                    eventos=[creada],
                )
            )
            cierre = evento(
                hoy,
                "reprogramada",
                f"Reprogramada a nueva fecha {nueva_fecha.isoformat()} por {fmt_crc(nuevo_monto)} — {motivo}",
                usuario.email,
            )
            previos = orig.get("eventos") if isinstance(orig.get("eventos"), list) else []
            uow.promesas.update(
                promesa_id,
                {
                    "estado": REPROGRAMADA,
                    "fecha_validacion": hoy,
                    "validado_por": usuario.email,
                    "comentario_validacion": motivo,
                    "eventos": [*previos, cierre],
                },
            )
            uow.commit()
        return {"ok": True, "nueva_promesa_id": nueva_id}


class DeletePromesaUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, raw_id: Any) -> dict[str, bool]:
        promesa_id = _require_id(raw_id)
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            if not usuario.es_coordinador:
                raise ForbiddenError("Solo el coordinador puede eliminar promesas")
            uow.promesas.update(promesa_id, {"activo": False})
            uow.commit()
        return {"ok": True}
