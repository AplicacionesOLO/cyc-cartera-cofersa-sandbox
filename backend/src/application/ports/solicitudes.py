"""Port del módulo Solicitudes (tbl_solicitudes, comentarios, historial y lecturas de apoyo)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID


class SolicitudesRepository(ABC):
    # ── Solicitudes ────────────────────────────────────────────────────────
    @abstractmethod
    def list_solicitudes(self, solicitante_id: UUID | None) -> list[dict[str, Any]]:
        """Todas las columnas, más recientes primero; ``solicitante_id`` limita a las propias."""

    @abstractmethod
    def find_solicitud(self, solicitud_id: UUID) -> dict[str, Any] | None: ...

    @abstractmethod
    def insert_solicitud(self, values: dict[str, Any]) -> dict[str, Any]:
        """Inserta y devuelve ``{id, numero_consecutivo}``."""

    @abstractmethod
    def update_estado(self, solicitud_id: UUID, estado: str) -> None: ...

    @abstractmethod
    def resolver_solicitud(
        self, solicitud_id: UUID, estado: str, comentario: str | None, revisor_id: UUID | None
    ) -> None:
        """Aprobar / rechazar / cancelar (flujo legacy): estado + comentario + revisor."""

    # ── Comentarios e historial ─────────────────────────────────────────────
    @abstractmethod
    def list_comentarios(self, solicitud_id: UUID) -> list[dict[str, Any]]:
        """Orden cronológico ascendente."""

    @abstractmethod
    def insert_comentario(self, solicitud_id: UUID, usuario_id: UUID, contenido: str) -> dict[str, Any]:
        """Devuelve ``{id, contenido, created_at}``."""

    @abstractmethod
    def list_historial(self, solicitud_id: UUID) -> list[dict[str, Any]]:
        """Más reciente primero."""

    @abstractmethod
    def insert_historial(
        self,
        solicitud_id: UUID,
        estado_anterior: str | None,
        estado_nuevo: str,
        usuario_id: UUID,
        nota: str | None,
    ) -> None: ...

    # ── Notificaciones internas y usuarios ──────────────────────────────────
    @abstractmethod
    def insert_notificacion(
        self, usuario_id: UUID, tipo: str, titulo: str, mensaje: str | None, link: str | None
    ) -> None: ...

    @abstractmethod
    def find_coordinador_id(self) -> UUID | None: ...

    @abstractmethod
    def existe_usuario_email(self, email: str) -> bool:
        """Hay una fila en ``usuarios`` con ese email (sin distinguir mayúsculas)."""

    @abstractmethod
    def nombres_usuarios(self, ids: list[UUID]) -> dict[str, str]:
        """``{id: nombre}``."""

    @abstractmethod
    def nombres_por_email(self, emails: list[str]) -> dict[str, str]:
        """``{email: nombre}``."""

    # ── Lecturas de apoyo para crear solicitudes ────────────────────────────
    @abstractmethod
    def find_gestion(self, gestion_id: UUID) -> dict[str, Any] | None:
        """``{id, resultado, nota, tipo, fecha, cliente_cod}``."""

    @abstractmethod
    def list_cartera_resumen(self) -> list[dict[str, Any]]:
        """Cartera por cliente (cod, nombre, contribuyente, vendedor, tramos de mora) por nombre."""

    @abstractmethod
    def list_maestro_resumen(self, analista_email: str | None) -> list[dict[str, Any]]:
        """``{cliente_cod, analista_email, limite_credito, estado_manual}``; filtra por analista."""

    @abstractmethod
    def find_cartera(self, cliente_cod: str) -> dict[str, Any] | None: ...

    @abstractmethod
    def find_maestro(self, cliente_cod: str) -> dict[str, Any] | None: ...

    @abstractmethod
    def list_facturas_pendientes(self, contribuyente: str, limit: int = 100) -> list[dict[str, Any]]:
        """Facturas con saldo > 0 del contribuyente, mayor saldo primero."""
