"""Centro de Recursos (antes ``/api/centro-recursos/*`` + consultas del Server Component).

- Lectura: cualquier usuario activo del SIC (políticas ``authenticated_read_*`` = fn_es_usuario_activo).
- Escritura: solo Coordinador (``checkCoordinador`` del origen, con el rol REAL) + config_audit_log.
- Documentos: el bucket ``documentos-recursos`` era público (``getPublicUrl``); ahora es privado. En BD
  se guarda la key del objeto y al leer se devuelve una URL prefirmada GET en el mismo campo ``url``.
"""

from __future__ import annotations

import re
import time
from typing import Any
from urllib.parse import unquote
from uuid import UUID

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.ports.file_storage import safe_key
from application.ports.object_storage import ObjectStorage
from application.use_cases.common import require_coordinador, require_usuario
from domain.exceptions import NotFoundError, ValidationError

CATEGORIAS = ("Formas de Pago", "Políticas de Crédito", "Plantillas de Convenios")
TIPOS_CONOCIDOS = ("pdf", "docx", "xlsx")
BUCKET = "documentos-recursos"
URL_TTL_SEGUNDOS = 3600
_PUBLIC_MARKER = f"/{BUCKET}/"
_KEY_DOCUMENTO = re.compile(r"^\d+_[A-Za-z0-9._-]+$")
_NOMBRE_INSEGURO = re.compile(r"[^a-zA-Z0-9._-]")


def _uuid_o_404(raw: str, message: str) -> UUID:
    try:
        return UUID(str(raw))
    except (TypeError, ValueError) as error:
        raise NotFoundError(message) from error


def _texto(raw: Any) -> str:
    return raw.strip() if isinstance(raw, str) else ""


def _key_de_documento(url: str) -> str | None:
    """Key S3 de un documento. Filas migradas guardan la URL pública del origen; las nuevas, la key."""
    if _PUBLIC_MARKER in url:
        return unquote(url.split(_PUBLIC_MARKER, 1)[1].split("?", 1)[0])
    if url.startswith(("http://", "https://")):
        return None  # enlace externo: se devuelve tal cual
    return url or None


def _con_url_firmada(storage: ObjectStorage, documento: dict[str, Any]) -> dict[str, Any]:
    key = _key_de_documento(str(documento.get("url") or ""))
    if key is None:
        return documento
    return {**documento, "url": storage.presign_download(key, expires_in=URL_TTL_SEGUNDOS)}


class GetCentroRecursosUseCase:
    """Datos de la pantalla /centro-recursos (los tres roles tienen acceso)."""

    def __init__(self, uow_factory: UnitOfWorkFactory, storage: ObjectStorage) -> None:
        self._uow_factory = uow_factory
        self._storage = storage

    def execute(self, principal: Principal) -> dict[str, list[dict[str, Any]]]:
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
            datos = uow.centro_recursos.datos_pagina()
        datos["documentos"] = [_con_url_firmada(self._storage, d) for d in datos.get("documentos", [])]
        return datos


class ListAplicacionesUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
            return {"data": uow.centro_recursos.list_aplicaciones_activas()}


class CrearAplicacionUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = require_coordinador(require_usuario(uow, principal))
            nombre, url = _texto(body.get("nombre")), _texto(body.get("url"))
            if not nombre or not url:
                raise ValidationError("Nombre y URL son requeridos")
            fila = uow.centro_recursos.crear_aplicacion(
                {
                    "nombre": nombre,
                    "descripcion": _texto(body.get("descripcion")) or None,
                    "url": url,
                    "icono": _texto(body.get("icono")) or "Layers",
                    "estado": _texto(body.get("estado")) or "Operativa",
                    "creado_por": usuario.email,
                }
            )
            uow.centro_recursos.registrar_auditoria(
                tabla="centro_recursos_aplicaciones",
                accion="INSERT",
                descripcion=f'Aplicación "{body.get("nombre")}" registrada',
                valor_nuevo=body,
                realizado_por=usuario.email,
            )
            uow.commit()
        return {"data": fila}


class ActualizarAplicacionUseCase:
    """Edición (nombre/url/descripción) y reordenamiento (orden) de una aplicación."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, aplicacion_id: str, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = require_coordinador(require_usuario(uow, principal))
            app_id = _uuid_o_404(aplicacion_id, "Aplicación no encontrada")
            anterior = uow.centro_recursos.find_aplicacion(app_id)
            if anterior is None:
                raise NotFoundError("Aplicación no encontrada")
            cambios = _cambios_aplicacion(body)
            fila = uow.centro_recursos.actualizar_aplicacion(app_id, cambios) if cambios else anterior
            uow.centro_recursos.registrar_auditoria(
                tabla="centro_recursos_aplicaciones",
                accion="UPDATE",
                descripcion=f'Aplicación "{anterior.get("nombre")}" actualizada',
                valor_anterior=anterior,
                valor_nuevo=cambios,
                realizado_por=usuario.email,
            )
            uow.commit()
        return {"data": fila}


def _cambios_aplicacion(body: dict[str, Any]) -> dict[str, Any]:
    cambios: dict[str, Any] = {}
    if body.get("nombre") is not None:
        if not _texto(body["nombre"]):
            raise ValidationError("El nombre no puede quedar vacío")
        cambios["nombre"] = _texto(body["nombre"])
    if body.get("url") is not None:
        if not _texto(body["url"]):
            raise ValidationError("La URL no puede quedar vacía")
        cambios["url"] = _texto(body["url"])
    if body.get("descripcion") is not None:
        cambios["descripcion"] = _texto(body["descripcion"]) or None
    if body.get("orden") is not None:
        try:
            cambios["orden"] = int(body["orden"])
        except (TypeError, ValueError) as error:
            raise ValidationError("'orden' debe ser numérico.", details={"field": "orden"}) from error
    return cambios


class ListDocumentosUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory, storage: ObjectStorage) -> None:
        self._uow_factory = uow_factory
        self._storage = storage

    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
            documentos = uow.centro_recursos.list_documentos()
        return {"data": [_con_url_firmada(self._storage, d) for d in documentos]}


class CrearUrlCargaDocumentoUseCase:
    """Paso 1 de la carga: URL prefirmada PUT (antes el archivo viajaba en multipart a la API Route)."""

    def __init__(self, uow_factory: UnitOfWorkFactory, storage: ObjectStorage) -> None:
        self._uow_factory = uow_factory
        self._storage = storage

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            require_coordinador(require_usuario(uow, principal))
        nombre = _texto(body.get("filename"))
        if not nombre:
            raise ValidationError("Archivo requerido")
        key = safe_key(f"{int(time.time() * 1000)}_{_NOMBRE_INSEGURO.sub('_', nombre)}")
        content_type = _texto(body.get("content_type")) or "application/octet-stream"
        upload = self._storage.presign_upload(key, content_type)
        return {"url": upload.url, "key": upload.key, "method": upload.method, "headers": upload.headers}


class CrearDocumentoUseCase:
    """Paso 2: registra el documento ya subido a S3 (misma validación y auditoría del origen)."""

    def __init__(self, uow_factory: UnitOfWorkFactory, storage: ObjectStorage) -> None:
        self._uow_factory = uow_factory
        self._storage = storage

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        key = _texto(body.get("key"))
        titulo = _texto(body.get("titulo"))
        descripcion = _texto(body.get("descripcion"))
        categoria = _texto(body.get("categoria"))
        with self._uow_factory(principal) as uow:
            usuario = require_coordinador(require_usuario(uow, principal))
            if not _KEY_DOCUMENTO.match(key) or not self._storage.exists(key):
                raise ValidationError("Archivo requerido")
            if not titulo:
                raise ValidationError("Título requerido")
            if categoria not in CATEGORIAS:
                raise ValidationError("Categoría inválida")
            ext = key.rsplit(".", 1)[-1].lower() if "." in key else ""
            tipo_archivo = ext if ext in TIPOS_CONOCIDOS else (ext or "archivo")
            fila = uow.centro_recursos.crear_documento(
                {
                    "titulo": titulo,
                    "descripcion": descripcion or None,
                    "categoria": categoria,
                    "tipo_archivo": tipo_archivo,
                    "url": key,
                    "subido_por": usuario.email,
                }
            )
            uow.centro_recursos.registrar_auditoria(
                tabla="centro_recursos_documentos",
                accion="INSERT",
                descripcion=f'Documento "{titulo}" cargado',
                valor_nuevo={"titulo": titulo, "categoria": categoria, "tipo_archivo": tipo_archivo},
                realizado_por=usuario.email,
            )
            uow.commit()
        return {"data": _con_url_firmada(self._storage, fila)}


class CrearMarcaUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = require_coordinador(require_usuario(uow, principal))
            nombre, comprador = _texto(body.get("nombre")), _texto(body.get("comprador_id"))
            if not nombre or not comprador:
                raise ValidationError("Nombre y comprador son requeridos")
            fila = uow.centro_recursos.crear_marca(
                {
                    "nombre": nombre,
                    "proveedor": _texto(body.get("proveedor")) or None,
                    "comprador_id": _comprador_uuid(comprador),
                    "notas": _texto(body.get("notas")) or None,
                }
            )
            uow.centro_recursos.registrar_auditoria(
                tabla="marcas",
                accion="INSERT",
                descripcion=f'Marca "{body.get("nombre")}" registrada',
                valor_nuevo=body,
                realizado_por=usuario.email,
            )
            uow.commit()
        return {"data": fila}


def _comprador_uuid(raw: str) -> UUID:
    try:
        return UUID(raw)
    except ValueError as error:
        raise ValidationError("El comprador es requerido", details={"field": "comprador_id"}) from error


class ActualizarMarcaUseCase:
    """Edición inline del nombre y reasignación de comprador (drag & drop del kanban)."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, marca_id: str, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = require_coordinador(require_usuario(uow, principal))
            mid = _uuid_o_404(marca_id, "Marca no encontrada")
            anterior = uow.centro_recursos.find_marca(mid)
            if anterior is None:
                raise NotFoundError("Marca no encontrada")
            cambios: dict[str, Any] = {}
            if body.get("nombre") is not None:
                if not _texto(body["nombre"]):
                    raise ValidationError("El nombre no puede quedar vacío")
                cambios["nombre"] = _texto(body["nombre"])
            if body.get("comprador_id") is not None:
                if not _texto(body["comprador_id"]):
                    raise ValidationError("El comprador es requerido")
                cambios["comprador_id"] = _comprador_uuid(_texto(body["comprador_id"]))
            if not cambios:
                raise ValidationError("Nada para actualizar")
            fila = uow.centro_recursos.actualizar_marca(mid, cambios)
            uow.centro_recursos.registrar_auditoria(
                tabla="marcas",
                accion="UPDATE",
                descripcion=f'Marca "{anterior.get("nombre")}" actualizada',
                valor_anterior=anterior,
                valor_nuevo=cambios,
                realizado_por=usuario.email,
            )
            uow.commit()
        return {"data": fila}
