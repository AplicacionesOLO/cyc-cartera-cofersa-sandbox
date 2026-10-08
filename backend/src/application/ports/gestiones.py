"""Port de gestiones de cobro (``gestiones``) y notas rápidas del día (``notas_rapidas``)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date
from typing import Any
from uuid import UUID

from domain.entities.gestiones import NuevaGestion


class GestionesRepository(ABC):
    @abstractmethod
    def list_gestiones(self, analista_email: str | None, offset: int, limit: int) -> list[dict[str, Any]]:
        """Gestiones (más recientes primero, orden estable); ``analista_email`` None = todas."""

    @abstractmethod
    def referencias(self, analista_email: str | None) -> dict[str, Any]:
        """Datos que enriquecen la bandeja: solicitudes ligadas, estado de promesas, nombres y cartera."""

    @abstractmethod
    def find_analista_email(self, gestion_id: UUID) -> str | None:
        """Quién registró la gestión (None si no existe)."""

    @abstractmethod
    def update_gestion(self, gestion_id: UUID, changes: dict[str, Any]) -> None:
        """Actualiza solo las columnas de ``COLUMNAS_EDITABLES`` presentes en ``changes``."""

    @abstractmethod
    def desactivar_gestion(self, gestion_id: UUID) -> None:
        """Soft-delete (``activo = false``)."""

    @abstractmethod
    def insert_gestion(self, gestion: NuevaGestion) -> UUID: ...

    @abstractmethod
    def vincular_promesa(self, gestion_id: UUID, promesa_id: UUID) -> None: ...

    @abstractmethod
    def nombre_cliente(self, cliente_cod: str) -> str | None:
        """Nombre del maestro de clientes (para desnormalizar en la promesa)."""

    @abstractmethod
    def codigos_contribuyente(self, contribuyente: str, excluir_cod: str | None) -> list[dict[str, str]]:
        """Otros códigos de cliente del mismo contribuyente: ``[{cliente_cod, cliente_nombre}]``."""

    @abstractmethod
    def get_nota_rapida(self, usuario_id: UUID, fecha: date) -> dict[str, Any] | None:
        """``{contenido, updated_at}`` de la nota del día del usuario."""

    @abstractmethod
    def save_nota_rapida(self, usuario_id: UUID, fecha: date, contenido: str) -> None:
        """Upsert por (usuario_id, fecha)."""
