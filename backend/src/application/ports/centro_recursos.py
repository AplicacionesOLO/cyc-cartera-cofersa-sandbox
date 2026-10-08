"""Port del Centro de Recursos: directorio comercial, documentos oficiales, aplicaciones y marcas."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID

Row = dict[str, Any]


class CentroRecursosRepository(ABC):
    @abstractmethod
    def datos_pagina(self) -> dict[str, list[Row]]:
        """Filas crudas que necesita la pantalla /centro-recursos.

        Claves: vendedores (activos), supervisores, usuarios, documentos, aplicaciones (activas),
        grupos, miembros, directorio (activos), marcas (activas).
        """

    @abstractmethod
    def list_aplicaciones_activas(self) -> list[Row]: ...

    @abstractmethod
    def find_aplicacion(self, aplicacion_id: UUID) -> Row | None: ...

    @abstractmethod
    def crear_aplicacion(self, datos: Row) -> Row: ...

    @abstractmethod
    def actualizar_aplicacion(self, aplicacion_id: UUID, cambios: Row) -> Row | None: ...

    @abstractmethod
    def list_documentos(self) -> list[Row]: ...

    @abstractmethod
    def crear_documento(self, datos: Row) -> Row: ...

    @abstractmethod
    def find_marca(self, marca_id: UUID) -> Row | None: ...

    @abstractmethod
    def crear_marca(self, datos: Row) -> Row: ...

    @abstractmethod
    def actualizar_marca(self, marca_id: UUID, cambios: Row) -> Row | None: ...

    @abstractmethod
    def registrar_auditoria(
        self,
        *,
        tabla: str,
        accion: str,
        descripcion: str,
        realizado_por: str,
        valor_anterior: Row | None = None,
        valor_nuevo: Row | None = None,
    ) -> None:
        """Fila en config_audit_log. Un fallo aquí no interrumpe la operación principal."""
