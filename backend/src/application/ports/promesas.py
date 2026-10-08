"""Port de promesas de pago (``promesas``)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date
from typing import Any
from uuid import UUID

from domain.entities.promesas import NuevaPromesa


class PromesasRepository(ABC):
    @abstractmethod
    def list_activas(self, analista_email: str | None, limit: int) -> list[dict[str, Any]]:
        """Promesas no eliminadas por ``fecha_promesa`` ascendente; ``analista_email`` None = todas."""

    @abstractmethod
    def gestiones_origen(self, gestion_ids: list[UUID]) -> list[dict[str, Any]]:
        """``[{id, resultado, nota, tipo, fecha}]`` de las gestiones que originaron las promesas."""

    @abstractmethod
    def get_for_update(self, promesa_id: UUID) -> dict[str, Any] | None:
        """Promesa completa, bloqueada hasta el fin de la transacción (eventos se re-escriben)."""

    @abstractmethod
    def existe_pendiente(self, cliente_cod: str, monto: float, fecha_promesa: date) -> bool:
        """Anti-duplicado: ya hay una PENDIENTE con el mismo cliente, monto y fecha."""

    @abstractmethod
    def insert(self, promesa: NuevaPromesa) -> UUID: ...

    @abstractmethod
    def update(self, promesa_id: UUID, changes: dict[str, Any]) -> None:
        """Actualiza las columnas de ``COLUMNAS_ACTUALIZABLES`` presentes (+ ``updated_at = now()``)."""
