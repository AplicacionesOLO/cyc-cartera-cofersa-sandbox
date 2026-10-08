"""Repository en memoria del Centro de Recursos."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from application.ports.centro_recursos import CentroRecursosRepository, Row


class FakeCentroRecursosRepository(CentroRecursosRepository):
    def __init__(self) -> None:
        self.aplicaciones: dict[UUID, Row] = {}
        self.documentos: dict[UUID, Row] = {}
        self.marcas: dict[UUID, Row] = {}
        self.auditoria: list[Row] = []
        self.extra: dict[str, list[Row]] = {
            "vendedores": [],
            "supervisores": [],
            "usuarios": [],
            "grupos": [],
            "miembros": [],
            "directorio": [],
        }

    def datos_pagina(self) -> dict[str, list[Row]]:
        return {
            **{k: list(v) for k, v in self.extra.items()},
            "documentos": self.list_documentos(),
            "aplicaciones": self.list_aplicaciones_activas(),
            "marcas": [dict(m) for m in self.marcas.values() if m.get("activo", True)],
        }

    def list_aplicaciones_activas(self) -> list[Row]:
        filas = [dict(a) for a in self.aplicaciones.values() if a["activo"]]
        return sorted(filas, key=lambda a: a["orden"])

    def find_aplicacion(self, aplicacion_id: UUID) -> Row | None:
        fila = self.aplicaciones.get(aplicacion_id)
        return dict(fila) if fila else None

    def crear_aplicacion(self, datos: Row) -> Row:
        fila = {"id": uuid4(), "orden": 0, "activo": True, "created_at": datetime.now(UTC), **datos}
        self.aplicaciones[fila["id"]] = fila
        return dict(fila)

    def actualizar_aplicacion(self, aplicacion_id: UUID, cambios: Row) -> Row | None:
        fila = self.aplicaciones.get(aplicacion_id)
        if fila is None:
            return None
        fila.update(cambios)
        return dict(fila)

    def list_documentos(self) -> list[Row]:
        return sorted(
            (dict(d) for d in self.documentos.values()), key=lambda d: d["created_at"], reverse=True
        )

    def crear_documento(self, datos: Row) -> Row:
        fila = {"id": uuid4(), "created_at": datetime.now(UTC), **datos}
        self.documentos[fila["id"]] = fila
        return dict(fila)

    def find_marca(self, marca_id: UUID) -> Row | None:
        fila = self.marcas.get(marca_id)
        return dict(fila) if fila else None

    def crear_marca(self, datos: Row) -> Row:
        fila = {"id": uuid4(), "activo": True, "created_at": datetime.now(UTC), **datos}
        self.marcas[fila["id"]] = fila
        return dict(fila)

    def actualizar_marca(self, marca_id: UUID, cambios: Row) -> Row | None:
        fila = self.marcas.get(marca_id)
        if fila is None:
            return None
        fila.update(cambios)
        return dict(fila)

    def registrar_auditoria(self, **kwargs: Any) -> None:
        self.auditoria.append(kwargs)
