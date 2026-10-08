"""Solicitudes: listado, detalle, contexto para crear, cambio de estado, comentarios y adjuntos.

Reemplaza las consultas directas al origen de ``app/(app)/solicitudes/**`` y las API Routes
``PATCH /api/solicitudes/[id]``, ``PATCH /api/solicitudes/[id]/estado`` y
``POST /api/solicitudes/[id]/comentarios``. Las políticas RLS de ``solicitudes`` /
``solicitud_comentarios`` / ``solicitud_historial_estados`` se aplican aquí:

- lectura: COORDINADOR y GERENCIA todas; el resto solo las propias (``solicitante_id``).
- actualización: COORDINADOR cualquiera; el solicitante solo las propias en ``PENDIENTE``.
- comentarios / historial: cualquier usuario activo, siempre a su nombre.
"""

from __future__ import annotations

import time
from typing import Any
from urllib.parse import unquote
from uuid import UUID

from application.dto.principal import Principal
from application.ports.app_unit_of_work import AppUnitOfWork, UnitOfWorkFactory
from application.ports.file_storage import FileStorage, safe_key
from application.use_cases.common import (
    optional_text,
    parse_uuid,
    require_escritura,
    require_text,
    require_usuario,
)
from domain.entities.solicitudes import (
    BUCKET_ADJUNTOS,
    CONTENT_TYPES_ADJUNTO,
    ESTADO_PENDIENTE_LEGACY,
    ESTADO_POR_ACCION,
    ESTADOS_OFICIALES,
    TIPO_NOTIFICACION,
)
from domain.entities.usuario import Usuario
from domain.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError

MSG_NO_ENCONTRADA = "Solicitud no encontrada"
MSG_ACCESO = "Acceso denegado"
_PUBLIC_URL_MARK = f"/storage/v1/object/public/{BUCKET_ADJUNTOS}/"
_URL_ADJUNTO_TTL = 3600


def require_acceso_modulo(usuario: Usuario, message: str = MSG_ACCESO) -> Usuario:
    """Guard del módulo: COORDINADOR / GERENCIA, o quien gestiona cartera (``puedeGestionarCartera``)."""
    if usuario.es_global or usuario.puede_gestionar_cartera:
        return usuario
    raise ForbiddenError(message)


def _puede_ver(usuario: Usuario, solicitud: dict[str, Any]) -> bool:
    return usuario.es_global or str(solicitud.get("solicitante_id") or "") == str(usuario.id)


def _solicitud_visible(uow: AppUnitOfWork, usuario: Usuario, solicitud_id: UUID) -> dict[str, Any]:
    solicitud = uow.solicitudes.find_solicitud(solicitud_id)
    if solicitud is None or not _puede_ver(usuario, solicitud):
        raise NotFoundError(MSG_NO_ENCONTRADA)
    return solicitud


def _id_solicitud(raw: str) -> UUID:
    try:
        return UUID(str(raw))
    except ValueError as error:
        raise NotFoundError(MSG_NO_ENCONTRADA) from error


def key_adjunto(adjunto: dict[str, Any]) -> str | None:
    """Key S3 del adjunto: ``path`` (AWS) o la ruta dentro de la URL pública del origen migrada."""
    path = adjunto.get("path")
    if isinstance(path, str) and path:
        return path
    url = adjunto.get("url")
    if isinstance(url, str) and _PUBLIC_URL_MARK in url:
        return unquote(url.split(_PUBLIC_URL_MARK, 1)[1].split("?", 1)[0]) or None
    return None


def firmar_adjuntos(datos: Any, storage: FileStorage, expires_in: int = _URL_ADJUNTO_TTL) -> Any:
    """Copia de ``datos`` con ``adjuntos[].url`` prefirmada (el bucket ya no es público)."""
    if not isinstance(datos, dict) or not isinstance(datos.get("adjuntos"), list):
        return datos
    adjuntos = []
    for adjunto in datos["adjuntos"]:
        if isinstance(adjunto, dict) and (key := key_adjunto(adjunto)):
            adjunto = {**adjunto, "url": storage.presign_download(key, expires_in=expires_in)}
        adjuntos.append(adjunto)
    return {**datos, "adjuntos": adjuntos}


class ListSolicitudesUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, solo_propias: bool = False) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = require_acceso_modulo(require_usuario(uow, principal))
            scope = usuario.id if (solo_propias or not usuario.es_global) else None
            solicitudes = uow.solicitudes.list_solicitudes(scope)
            ids = list({s["solicitante_id"] for s in solicitudes if s.get("solicitante_id")})
            return {"solicitudes": solicitudes, "solicitante_map": uow.solicitudes.nombres_usuarios(ids)}


class GetSolicitudDetalleUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory, storage: FileStorage) -> None:
        self._uow_factory = uow_factory
        self._storage = storage

    def execute(self, principal: Principal, solicitud_id: str) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = require_acceso_modulo(require_usuario(uow, principal))
            solicitud = _solicitud_visible(uow, usuario, _id_solicitud(solicitud_id))
            comentarios = uow.solicitudes.list_comentarios(solicitud["id"])
            historial = uow.solicitudes.list_historial(solicitud["id"])
            ids = {r["usuario_id"] for r in (*comentarios, *historial) if r.get("usuario_id")}
            if solicitud.get("solicitante_id"):
                ids.add(solicitud["solicitante_id"])
            nombres = uow.solicitudes.nombres_usuarios(list(ids))
            gestion = (
                uow.solicitudes.find_gestion(solicitud["gestion_id"]) if solicitud.get("gestion_id") else None
            )

        def autor(row: dict[str, Any]) -> str:
            return nombres.get(str(row.get("usuario_id")), "—")

        solicitante = solicitud.get("solicitante_id")
        return {
            "solicitud": {**solicitud, "datos": firmar_adjuntos(solicitud.get("datos"), self._storage)},
            "comentarios": [{**c, "autor_nombre": autor(c)} for c in comentarios],
            "historial": [{**h, "autor_nombre": autor(h)} for h in historial],
            "gestion_origen": (
                {k: gestion[k] for k in ("id", "resultado", "tipo", "fecha", "cliente_cod")}
                if gestion
                else None
            ),
            "solicitante_nombre": nombres.get(str(solicitante), "—") if solicitante else "—",
        }


class GetNuevaSolicitudClientesUseCase:
    """Datos de ``/solicitudes/nueva``: cartera + maestro (+ nombres de analistas) + gestión origen."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, solo_mi_cartera: bool, gestion_id: str | None) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = require_escritura(require_acceso_modulo(require_usuario(uow, principal)))
            filtro = usuario.email if (solo_mi_cartera or usuario.rol == "ANALISTA") else None
            cartera = uow.solicitudes.list_cartera_resumen()
            maestro = uow.solicitudes.list_maestro_resumen(filtro)
            emails = sorted({m["analista_email"] for m in maestro if m.get("analista_email")})
            nombres = uow.solicitudes.nombres_por_email(emails)
            gestion = None
            if gestion_id:
                gestion = uow.solicitudes.find_gestion(parse_uuid(gestion_id, "gestion_id"))
        return {
            "cartera": cartera,
            "maestro": maestro,
            "analista_nombres": nombres,
            "solo_mi_cartera": filtro is not None,
            "gestion_origen": (
                {k: gestion[k] for k in ("id", "resultado", "nota", "tipo", "fecha")} if gestion else None
            ),
        }


class GetNuevaSolicitudContextoUseCase:
    """Datos de ``/clientes/{cod}/solicitudes/nueva``: cartera + maestro + facturas pendientes."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, cliente_cod: str | None) -> dict[str, Any]:
        cod = require_text(cliente_cod, "cod")
        with self._uow_factory(principal) as uow:
            require_escritura(require_acceso_modulo(require_usuario(uow, principal)))
            cartera = uow.solicitudes.find_cartera(cod)
            if cartera is None:
                raise NotFoundError("Cliente no encontrado")
            maestro = uow.solicitudes.find_maestro(cod)
            facturas = uow.solicitudes.list_facturas_pendientes(cartera["contribuyente"])
        return {"cartera": cartera, "maestro": maestro, "facturas": facturas}


class ListFacturasPendientesUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, contribuyente: str | None) -> list[dict[str, Any]]:
        valor = require_text(contribuyente, "contribuyente")
        with self._uow_factory(principal) as uow:
            require_acceso_modulo(require_usuario(uow, principal))
            return uow.solicitudes.list_facturas_pendientes(valor)


class CreateAdjuntoUploadUrlUseCase:
    """URL prefirmada para subir un adjunto (antes ``storage.from('comprobantes-pago').upload``)."""

    def __init__(self, uow_factory: UnitOfWorkFactory, storage: FileStorage) -> None:
        self._uow_factory = uow_factory
        self._storage = storage

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        cliente_cod = require_text(body.get("cliente_cod"), "cliente_cod")
        filename = require_text(body.get("filename"), "filename", max_length=200)
        content_type = require_text(body.get("content_type"), "content_type")
        if content_type not in CONTENT_TYPES_ADJUNTO:
            raise ValidationError("Tipo de archivo no permitido.", details={"field": "content_type"})
        with self._uow_factory(principal) as uow:
            require_escritura(
                require_acceso_modulo(require_usuario(uow, principal)), "Sin permisos para crear solicitudes"
            )
        key = safe_key(cliente_cod, f"{int(time.time() * 1000)}_{filename}")
        upload = self._storage.presign_upload(key, content_type)
        return {"url": upload.url, "key": upload.key, "method": upload.method, "headers": upload.headers}


class ResolverSolicitudUseCase:
    """``PATCH /solicitudes/{id}`` { accion: APROBAR | RECHAZAR | CANCELAR, comentario? }."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, solicitud_id: str, body: dict[str, Any]) -> dict[str, Any]:
        accion = body.get("accion")
        if not accion:
            raise ValidationError("accion requerida")
        if accion not in ESTADO_POR_ACCION:
            raise ValidationError("accion inválida")
        comentario = optional_text(body.get("comentario"))
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            if accion in ("APROBAR", "RECHAZAR") and not usuario.es_coordinador:
                raise ForbiddenError("Solo el coordinador puede aprobar o rechazar")
            solicitud = _solicitud_visible(uow, usuario, _id_solicitud(solicitud_id))
            es_propia = str(solicitud.get("solicitante_id") or "") == str(usuario.id)
            if accion == "CANCELAR" and not usuario.es_coordinador and not es_propia:
                raise ForbiddenError("Sin permisos para cancelar esta solicitud")
            if accion == "CANCELAR" and solicitud["estado"] != ESTADO_PENDIENTE_LEGACY:
                raise ValidationError("Solo se pueden cancelar solicitudes PENDIENTES")
            uow.solicitudes.resolver_solicitud(
                solicitud["id"], ESTADO_POR_ACCION[accion], comentario, usuario.id
            )
            if solicitud.get("solicitante_id") and not es_propia:
                verbo = "aprobada" if accion == "APROBAR" else "rechazada"
                uow.solicitudes.insert_notificacion(
                    solicitud["solicitante_id"],
                    TIPO_NOTIFICACION,
                    f"Solicitud {verbo}: {str(solicitud['tipo']).replace('_', ' ')}",
                    f"Cliente: {solicitud.get('cliente_nombre') or solicitud.get('cliente_cod')}. "
                    + (f"Nota: {body.get('comentario')}" if body.get("comentario") else ""),
                    f"/solicitudes/{solicitud['id']}",
                )
            uow.commit()
        return {"ok": True}


class CambiarEstadoSolicitudUseCase:
    """``PATCH /solicitudes/{id}/estado`` { estado_nuevo, nota? } + historial."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, solicitud_id: str, body: dict[str, Any]) -> dict[str, Any]:
        estado_nuevo = body.get("estado_nuevo")
        if not estado_nuevo:
            raise ValidationError("estado_nuevo requerido")
        if estado_nuevo not in ESTADOS_OFICIALES:
            raise ValidationError(f"Estado inválido. Permitidos: {', '.join(ESTADOS_OFICIALES)}")
        with self._uow_factory(principal) as uow:
            usuario = require_acceso_modulo(require_usuario(uow, principal))
            require_escritura(usuario, "Sin permisos para cambiar el estado de la solicitud")
            solicitud = _solicitud_visible(uow, usuario, _id_solicitud(solicitud_id))
            anterior = solicitud["estado"]
            if anterior == estado_nuevo:
                raise ConflictError("La solicitud ya está en ese estado")
            if not usuario.es_coordinador and anterior != ESTADO_PENDIENTE_LEGACY:
                # RLS "Analista actualiza sus solicitudes pendientes": solo las propias en PENDIENTE
                raise ForbiddenError("Sin permisos para cambiar el estado de la solicitud")
            uow.solicitudes.update_estado(solicitud["id"], estado_nuevo)
            uow.solicitudes.insert_historial(
                solicitud["id"], anterior, estado_nuevo, usuario.id, optional_text(body.get("nota"))
            )
            uow.commit()
        return {"ok": True, "estado_anterior": anterior, "estado_nuevo": estado_nuevo}


class AgregarComentarioSolicitudUseCase:
    """``POST /solicitudes/{id}/comentarios`` { contenido }."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, solicitud_id: str, body: dict[str, Any]) -> dict[str, Any]:
        contenido = optional_text(body.get("contenido"))
        if not contenido:
            raise ValidationError("El comentario no puede estar vacío")
        with self._uow_factory(principal) as uow:
            usuario = require_acceso_modulo(require_usuario(uow, principal))
            require_escritura(usuario, "Sin permisos para comentar en esta solicitud")
            solicitud = _solicitud_visible(uow, usuario, _id_solicitud(solicitud_id))
            nuevo = uow.solicitudes.insert_comentario(solicitud["id"], usuario.id, contenido)
            uow.commit()
        return {
            "ok": True,
            "comentario": {**nuevo, "usuario_id": usuario.id, "usuario_nombre": usuario.nombre},
        }
