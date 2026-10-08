"""Port de Gestión de Cartera: pedidos retenidos, saldos a favor (y su matching) y reportes de pago."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID


class GestionCarteraRepository(ABC):
    # ── Pedidos retenidos ───────────────────────────────────────────────
    @abstractmethod
    def pedidos_retenidos(self, analista_email: str | None) -> dict[str, Any]:
        """``fn_pedidos_retenidos(p_email)`` → ``{kpis, rows}`` (score ICP + aging por cliente)."""

    @abstractmethod
    def actualizar_pedido_retenido(self, id_pedido: str, cambios: dict[str, Any]) -> dict[str, Any] | None:
        """Aplica ``cambios`` (columnas editables) + ``updated_at``; devuelve la fila o None si no existe."""

    # ── Saldos a favor ──────────────────────────────────────────────────
    @abstractmethod
    def saldos_favor(self, analista_email: str | None) -> list[dict[str, Any]]:
        """``fn_saldos_favor(p_email)``: saldos con analista/vendedor y días pendiente."""

    @abstractmethod
    def saldos_favor_de_cliente(self, cliente_cod: str, analista_email: str | None) -> list[dict[str, Any]]:
        """Saldos de un cliente; con ``analista_email`` solo si el cliente es de su cartera."""

    @abstractmethod
    def cliente_de_saldo_favor(self, saldo_id: UUID) -> str | None:
        """``cliente_cod`` del saldo, o None si no existe."""

    @abstractmethod
    def marcar_saldo_aplicado(self, saldo_id: UUID, aplicado_por: str) -> bool: ...

    @abstractmethod
    def matching_saldos_favor(self, cliente_cod: str | None) -> list[dict[str, Any]]:
        """``fn_matching_saldos_favor(p_cliente_cod)`` (None = todos los clientes)."""

    @abstractmethod
    def clientes_de_analista(self, analista_email: str) -> set[str]:
        """``cliente_cod`` de ``maestro_clientes`` asignados al analista."""

    # ── Reportes de pago ────────────────────────────────────────────────
    @abstractmethod
    def existe_referencia_pago(self, referencia: str) -> bool: ...

    @abstractmethod
    def crear_reporte_pago(self, reporte: dict[str, Any], detalles: list[dict[str, Any]]) -> UUID:
        """Inserta cabecera + detalles en la misma transacción; devuelve el id del reporte."""
