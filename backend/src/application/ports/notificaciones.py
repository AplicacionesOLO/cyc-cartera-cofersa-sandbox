"""Port de notificaciones internas (campana del topbar) y del respaldo del tipo de cambio."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID


class NotificacionesRepository(ABC):
    @abstractmethod
    def list_por_usuario(self, usuario_id: UUID, limit: int) -> list[dict[str, Any]]:
        """Notificaciones del usuario, más recientes primero."""

    @abstractmethod
    def marcar_leida(self, usuario_id: UUID, notificacion_id: UUID) -> bool:
        """True si la notificación existe y es del usuario."""

    @abstractmethod
    def marcar_todas_leidas(self, usuario_id: UUID) -> int:
        """Cantidad de notificaciones que pasaron a leídas."""

    @abstractmethod
    def leer_config(self, claves: tuple[str, ...]) -> dict[str, str]:
        """Valores de config_sistema por clave (solo las que existen)."""

    @abstractmethod
    def guardar_config(self, valores: dict[str, str]) -> None:
        """Upsert por clave en config_sistema."""
