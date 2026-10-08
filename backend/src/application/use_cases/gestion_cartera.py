"""Gestión de Cartera: pedidos retenidos, saldos a favor (+ matching) y reporte de pagos.

Reemplaza:
- ``rpc('fn_pedidos_retenidos')`` del cliente y ``PUT /api/gestion-cartera/pedidos-retenidos/[id]``
  (RLS ``pedidos_retenidos_select_activos`` / ``_update_activos``: cualquier usuario activo; Gerencia
  queda afuera del update por ``esSoloLectura``).
- ``rpc('fn_saldos_favor')`` del Server Component, ``from('saldos_favor')`` de la ficha (RLS
  ``saldos_favor_select`` / ``saldos_favor_update``) y ``GET /api/saldos-favor/matching``.
- ``storage.from('comprobantes-pago').upload/getPublicUrl`` (política
  ``usuarios_activos_suben_comprobantes``) y ``POST /api/clientes/pagos/reportar``.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.ports.file_storage import FileStorage, safe_key
from application.use_cases.common import (
    optional_text,
    parse_date,
    parse_int,
    parse_number,
    parse_uuid,
    require_escritura,
    require_text,
    require_usuario,
)
from domain.entities.gestion_cartera import (
    COMPROBANTE_CONTENT_TYPES,
    COMPROBANTES_BUCKET,
    ESTADOS_PEDIDO,
    PEDIDO_PENDIENTE,
    PEDIDO_RETENIDO,
    REPORTE_PENDIENTE,
    TOLERANCIA_REPORTE_PAGO,
)
from domain.entities.usuario import Usuario
from domain.exceptions import (
    BusinessRuleViolation,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)

MSG_SIN_PERMISO_PEDIDOS = "Sin permisos para modificar pedidos retenidos"
MSG_SIN_PERMISO_SALDO = "No se pudo marcar como aplicado. Intentá de nuevo."
_NOMBRE_ARCHIVO = re.compile(r"[^a-zA-Z0-9_-]")


def _scope_cartera(usuario: Usuario) -> str | None:
    """Email al que se limita una vista de cartera propia (None = todas).

    ANALISTA (y ANALISTA_RIESGO con cartera asignada, sep 2026) → su cartera; el resto ve todo.
    """
    return usuario.email if usuario.puede_gestionar_cartera else None


# ── Pedidos retenidos ───────────────────────────────────────────────────────


class GetPedidosRetenidosUseCase:
    """Vista Global: cualquier usuario activo puede ver todos los pedidos (``p_email`` opcional)."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, email: str | None) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
            return uow.gestion_cartera.pedidos_retenidos(optional_text(email))


class ActualizarPedidoRetenidoUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, id_pedido: str, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            require_escritura(usuario, MSG_SIN_PERMISO_PEDIDOS)
            cambios = _cambios_pedido(body, usuario.email)
            row = uow.gestion_cartera.actualizar_pedido_retenido(id_pedido, cambios)
            if row is None:
                raise NotFoundError("Pedido retenido no encontrado")
            uow.commit()
        return {"data": row}


def _cambios_pedido(body: dict[str, Any], email: str) -> dict[str, Any]:
    estado = body.get("estado_sic")
    if "estado_sic" in body and estado not in ESTADOS_PEDIDO:
        raise ValidationError("estado_sic inválido")
    motivo = optional_text(body.get("motivo_retencion"))
    if estado == PEDIDO_RETENIDO and not motivo:
        raise ValidationError("Indicá un motivo de retención")
    cambios: dict[str, Any] = {}
    if "estado_sic" in body:
        cambios["estado_sic"] = estado
        pendiente = estado == PEDIDO_PENDIENTE
        cambios["resuelto_por"] = None if pendiente else email
        cambios["resuelto_en"] = None if pendiente else datetime.now(UTC)
        cambios["motivo_retencion"] = motivo if estado == PEDIDO_RETENIDO else None
    if "comentario_analista" in body:
        cambios["comentario_analista"] = optional_text(body.get("comentario_analista"))
    return cambios


# ── Saldos a favor ──────────────────────────────────────────────────────────


class ListSaldosFavorUseCase:
    """Módulo Saldos a Favor: analista (o riesgo con cartera) solo su cartera; el resto lo pedido."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, email: str | None) -> list[dict[str, Any]]:
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            scope = usuario.email if usuario.puede_gestionar_cartera else optional_text(email)
            return uow.gestion_cartera.saldos_favor(scope)


class ListSaldosFavorClienteUseCase:
    """Tab de la Ficha 360°: global (Coordinador/Gerencia) o cliente de la cartera propia."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, cliente_cod: str | None) -> list[dict[str, Any]]:
        cod = require_text(cliente_cod, "cliente_cod")
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            scope = None if usuario.es_global else usuario.email
            return uow.gestion_cartera.saldos_favor_de_cliente(cod, scope)


class AplicarSaldoFavorUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, saldo_id: str) -> dict[str, Any]:
        sid = parse_uuid(saldo_id, "id")
        with self._uow_factory(principal) as uow:
            usuario = require_escritura(require_usuario(uow, principal), MSG_SIN_PERMISO_SALDO)
            repo = uow.gestion_cartera
            cliente_cod = repo.cliente_de_saldo_favor(sid)
            if cliente_cod is None:
                raise NotFoundError("Saldo a favor no encontrado")
            if not usuario.es_coordinador and cliente_cod not in repo.clientes_de_analista(usuario.email):
                raise ForbiddenError(MSG_SIN_PERMISO_SALDO)
            repo.marcar_saldo_aplicado(sid, usuario.email)
            uow.commit()
        return {"ok": True, "id": str(sid), "aplicado_por": usuario.email}


class MatchingSaldosFavorUseCase:
    """``GET /saldos-favor/matching``: por cliente, lista (``scope=list``) o agregado."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, cliente_cod: str | None, scope: str | None) -> dict[str, Any]:
        cod = optional_text(cliente_cod)
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            repo = uow.gestion_cartera
            analista = _scope_cartera(usuario)
            cartera = repo.clientes_de_analista(analista) if analista else None
            if cod:
                if cartera is not None and cod not in cartera:
                    return {"matches": []}
                return {"matches": repo.matching_saldos_favor(cod)}
            matches = repo.matching_saldos_favor(None)
        if cartera is not None:
            matches = [m for m in matches if m.get("cliente_cod") in cartera]
        if scope == "list":
            return {"matches": matches}
        return {
            "total_clientes_con_match": len({m.get("cliente_cod") for m in matches}),
            "total_matches": len(matches),
            "monto_total_matcheable": sum(float(m.get("monto_match") or 0) for m in matches),
        }


# ── Comprobantes de pago (S3 privado) ───────────────────────────────────────


class CrearUrlSubidaComprobanteUseCase:
    """URL prefirmada PUT (antes ``storage.upload`` con la política de usuarios activos)."""

    def __init__(self, uow_factory: UnitOfWorkFactory, storage: FileStorage) -> None:
        self._uow_factory = uow_factory
        self._storage = storage

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
        cliente_cod = require_text(body.get("cliente_cod"), "cliente_cod")
        content_type = str(body.get("content_type") or "")
        ext = COMPROBANTE_CONTENT_TYPES.get(content_type)
        if ext is None:
            raise ValidationError("Formato no válido. Use JPG, PNG o PDF.")
        base = re.sub(r"\.[^.]+$", "", str(body.get("filename") or "comprobante"))
        base = _NOMBRE_ARCHIVO.sub("_", base)[:80] or "comprobante"
        millis = int(datetime.now(UTC).timestamp() * 1000)
        key = safe_key(cliente_cod, f"{millis}_{base}.{ext}")
        upload = self._storage.presign_upload(key, content_type)
        return {"url": upload.url, "key": upload.key, "method": upload.method, "headers": upload.headers}


class ObtenerUrlComprobanteUseCase:
    """URL prefirmada GET al leer (el bucket ya no es público). Acepta la key o la URL pública legada."""

    def __init__(self, uow_factory: UnitOfWorkFactory, storage: FileStorage) -> None:
        self._uow_factory = uow_factory
        self._storage = storage

    def execute(self, principal: Principal, key: str | None) -> dict[str, str]:
        clean = safe_key(comprobante_key(require_text(key, "key")) or "")
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
        return {"url": self._storage.presign_download(clean)}


# ── Reporte de pago ─────────────────────────────────────────────────────────


class ReportarPagoUseCase:
    """``POST /clientes/pagos/reportar``: cabecera + detalles en UNA transacción real."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        reporte, detalles = _validar_reporte(body)
        with self._uow_factory(principal) as uow:
            usuario = require_escritura(require_usuario(uow, principal))
            repo = uow.gestion_cartera
            if repo.existe_referencia_pago(reporte["referencia"]):
                raise ConflictError(
                    f'Ya existe un reporte con la referencia "{reporte["referencia"]}". '
                    "Verifique el número de transferencia."
                )
            reporte_id = repo.crear_reporte_pago({**reporte, "analista_email": usuario.email}, detalles)
            uow.commit()
        return {"ok": True, "reporte_id": str(reporte_id)}


def _validar_reporte(body: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    cliente_cod = optional_text(body.get("cliente_cod"))
    contribuyente = optional_text(body.get("contribuyente"))
    if not cliente_cod or not contribuyente:
        raise ValidationError("Cliente requerido")
    banco = optional_text(body.get("banco_origen"))
    referencia = optional_text(body.get("referencia"))
    fecha = optional_text(body.get("fecha_transferencia"))
    monto_raw = body.get("monto_transferido")
    if not banco or not referencia or not fecha or not monto_raw:
        raise ValidationError("Datos del pago incompletos")
    detalles_raw = body.get("detalles")
    if not isinstance(detalles_raw, list) or not detalles_raw:
        raise ValidationError("Debe seleccionar al menos una factura")
    monto = parse_number(monto_raw, "monto_transferido")
    detalles = [_detalle(d) for d in detalles_raw]
    suma = sum(d["monto_aplicado"] for d in detalles)
    if abs(suma - monto) > TOLERANCIA_REPORTE_PAGO:
        raise BusinessRuleViolation(
            f"La suma de facturas (₡{suma:.0f}) no coincide con el monto transferido (₡{monto:.0f})"
        )
    reporte = {
        "cliente_cod": cliente_cod,
        "contribuyente": contribuyente,
        "banco_origen": banco,
        "referencia": referencia,
        "monto_transferido": monto,
        "fecha_transferencia": parse_date(fecha, "fecha_transferencia"),
        "url_comprobante": optional_text(body.get("url_comprobante")),
        "notas": optional_text(body.get("notas")),
        "estado": REPORTE_PENDIENTE,
    }
    return reporte, detalles


def _detalle(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValidationError("Debe seleccionar al menos una factura")
    return {
        "factura_id": parse_int(raw.get("factura_id"), "factura_id"),
        "documento": require_text(raw.get("documento"), "documento"),
        "monto_aplicado": parse_number(raw.get("monto_aplicado"), "monto_aplicado"),
    }


def comprobante_key(reporte_url: str | None) -> str | None:
    """Key S3 de un ``url_comprobante`` (nuevo: la key; legado: URL pública del origen)."""
    if not reporte_url:
        return None
    marker = f"/{COMPROBANTES_BUCKET}/"
    return reporte_url.split(marker, 1)[1].split("?", 1)[0] if marker in reporte_url else reporte_url
