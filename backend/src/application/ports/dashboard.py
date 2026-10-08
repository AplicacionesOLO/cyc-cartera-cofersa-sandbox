"""Lecturas del Dashboard (coordinador/gerencia y analista) y de la Cola del día / Mi Cartera.

Solo lectura sobre cartera, maestro_clientes, gestiones, promesas, pagos, usuarios, notificaciones,
config_sistema, historico_cartera, ventas_mensuales y las RPC de KPIs.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date
from typing import Any
from uuid import UUID

Row = dict[str, Any]


class DashboardRepository(ABC):
    # ── Dashboard coordinador ───────────────────────────────────────────
    @abstractmethod
    def kpis_cartera(self) -> list[Row]:
        """``fn_get_kpis_cartera()`` (totales de cartera agregados en SQL)."""

    @abstractmethod
    def ventas_mensuales(self) -> list[Row]:
        """anio, mes, total_ventas_sin_iva, cartera_total_mes ordenado por anio, mes."""

    @abstractmethod
    def analistas_elegibles(self) -> list[Row]:
        """Usuarios activos ANALISTA o ANALISTA_RIESGO con cartera asignada (id, nombre, email...)."""

    @abstractmethod
    def conteo_gestiones_por_analista(self, hoy: date, inicio_semana: date, inicio_mes: date) -> list[Row]:
        """analista_email, g_hoy, g_semana, g_mes."""

    @abstractmethod
    def recuperacion(self, anio: int, mes: int) -> Row | None:
        """``fn_recuperacion(p_anio, p_mes)`` (meta y cobrado del Presupuesto de Cobro)."""

    @abstractmethod
    def historico_cartera(self, limite: int) -> list[Row]:
        """Últimos ``limite`` cortes de historico_cartera, fecha desc."""

    # ── Compartido ──────────────────────────────────────────────────────
    @abstractmethod
    def pedidos_retenidos(self, analista_email: str | None) -> Row | None:
        """``fn_pedidos_retenidos(p_email)`` (None = vista global)."""

    @abstractmethod
    def config_valor(self, clave: str) -> str | None:
        """Valor de config_sistema para ``clave`` (None si no existe)."""

    # ── Dashboard analista ──────────────────────────────────────────────
    @abstractmethod
    def kpis_analista(self, analista_email: str) -> Row | None:
        """``fn_dashboard_analista_kpis(p_email)``."""

    @abstractmethod
    def vendedores_analista(self, analista_email: str) -> list[Row]:
        """``fn_dashboard_vendedores_analista(p_email)``."""

    @abstractmethod
    def agenda_gestiones(self, analista_email: str, fechas: list[date], limite: int) -> list[Row]:
        """Gestiones activas con próxima acción en ``fechas`` + nombre del cliente."""

    @abstractmethod
    def agenda_promesas(self, analista_email: str, fechas: list[date], limite: int) -> list[Row]:
        """Promesas PENDIENTE con fecha_promesa en ``fechas``."""

    @abstractmethod
    def promesas_pendientes(self, analista_email: str, limite: int) -> list[Row]:
        """Promesas PENDIENTE activas del analista, fecha_promesa asc."""

    @abstractmethod
    def tareas_sugeridas(self, usuario_id: UUID, limite: int) -> list[Row]:
        """Notificaciones ALERTA "Sin gestión ≥ N días" no leídas del usuario."""

    # ── Cola del día (Mi Cartera + Dashboard analista) ──────────────────
    @abstractmethod
    def clientes_de_analista(self, analista_email: str) -> list[str]:
        """Códigos de cliente asignados al analista en maestro_clientes."""

    @abstractmethod
    def ultimo_sync_cartera(self) -> str | None:
        """sync_id de la fila de cartera actualizada más recientemente."""

    @abstractmethod
    def cartera_de_clientes(self, codigos: list[str], sync_id: str | None) -> list[Row]:
        """Filas de cartera de ``codigos`` (del ``sync_id`` dado, si lo hay)."""

    @abstractmethod
    def gestiones_de_clientes(self, codigos: list[str]) -> list[Row]:
        """cliente_cod, fecha, proxima_accion, proxima_accion_fecha; fecha desc, created_at desc."""

    @abstractmethod
    def promesas_pendientes_de_clientes(self, codigos: list[str]) -> list[Row]:
        """cliente_cod, fecha_promesa, monto de promesas PENDIENTE; fecha_promesa asc."""

    @abstractmethod
    def monto_promesas_cumplidas(self, codigos: list[str], desde: date) -> float:
        """Suma de promesas CUMPLIDA actualizadas desde ``desde``."""

    @abstractmethod
    def icp_de_clientes(self, codigos: list[str]) -> dict[str, float]:
        """cliente_cod → icp_score (vista vw_icp_por_cliente)."""

    @abstractmethod
    def pagos_desde(self, codigos: list[str], desde: date) -> list[Row]:
        """cliente_cod, fecha_pago, monto_pago con fecha_pago >= ``desde``."""
