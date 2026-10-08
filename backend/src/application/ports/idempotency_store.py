"""Port de idempotencia para consumidores de colas standard (al-menos-una entrega)."""

from __future__ import annotations

from abc import ABC, abstractmethod


class IdempotencyStore(ABC):
    @abstractmethod
    def claim(self, key: str) -> bool:
        """Registra ``key`` de forma atómica. False si ya estaba (ya procesado / en curso)."""

    @abstractmethod
    def release(self, key: str) -> None:
        """Borra el claim para permitir un reintento limpio tras un fallo de negocio."""
