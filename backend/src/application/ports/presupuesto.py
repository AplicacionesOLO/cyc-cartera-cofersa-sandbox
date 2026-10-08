"""Port del módulo Presupuesto de Cobro / Recuperación / Proyección de Tesorería.

En el origen la UI llamaba directo a los RPC ``fn_presupuesto_*``, ``fn_recuperacion*``,
``fn_proyeccion_cobro``, ``fn_sin_pago_cliente`` y ``fn_meta_analista_mes`` y leía
``presupuesto_cobro`` / ``vendedores`` / ``supervisores`` / ``portafolio_*`` con el SDK anterior.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date
from decimal import Decimal
from typing import Any


class PresupuestoRepository(ABC):
    # ── Presupuesto del mes ──────────────────────────────────────────────
    @abstractmethod
    def presupuesto_congelado(self, anio: int, mes: int) -> dict[str, Any]:
        """``fn_presupuesto_frozen``: ``{congelado: false}`` o el presupuesto guardado con metas."""

    @abstractmethod
    def presupuesto_estimado(self, anio: int, mes: int) -> dict[str, Any]:
        """``fn_presupuesto_preview``: cálculo en vivo sin guardar."""

    @abstractmethod
    def congelar(self, anio: int, mes: int, email: str) -> dict[str, Any]:
        """``fn_presupuesto_guardar``: (re)genera y congela el mes, descarta ajustes manuales."""

    @abstractmethod
    def ajustar_meta(self, anio: int, mes: int, vendedor_cod: str, meta: int, email: str) -> dict[str, Any]:
        """``fn_presupuesto_meta``: meta editada a mano para un vendedor."""

    @abstractmethod
    def reasignar_cliente(
        self, anio: int, mes: int, cliente_cod: str, vendedor_cod: str, email: str
    ) -> dict[str, Any]:
        """``fn_presupuesto_reasignar`` (recalcula metas con ``fn__recalc_metas``)."""

    @abstractmethod
    def vendedores_activos(self) -> list[dict[str, Any]]:
        """``[{cod, nombre}]`` de vendedores activos, por nombre (selector "mover a")."""

    @abstractmethod
    def directorio_envio(self) -> dict[str, list[dict[str, Any]]]:
        """Vendedores activos (cod, nombre, email), supervisores activos (email), grupos de
        portafolio activos (principal_cod) y miembros de portafolio acotado."""

    # ── Recuperación / Proyección ────────────────────────────────────────
    @abstractmethod
    def recuperacion(self, anio: int, mes: int) -> dict[str, Any]:
        """``fn_recuperacion``: cobrado vs meta del mes por vendedor/cliente."""

    @abstractmethod
    def proyeccion(self, semanas: int, semanas_pasadas: int) -> dict[str, Any]:
        """``fn_proyeccion_cobro`` (escribe el snapshot semanal: requiere commit)."""

    @abstractmethod
    def clientes_sin_pago(self, anio: int, mes: int) -> list[dict[str, Any]]:
        """``fn_sin_pago_cliente``."""

    @abstractmethod
    def ppto_cartera_total(self, anio: int, mes: int) -> Decimal:
        """Suma de ``presupuesto_cobro.ppto_cartera`` del mes."""

    @abstractmethod
    def recuperacion_mom(self, meses: int, email: str | None) -> Any:
        """``fn_recuperacion_mom``."""

    @abstractmethod
    def recuperacion_periodo(self, ini: date, fin: date, email: str | None, group: str) -> Any:
        """``fn_recuperacion_periodo``."""

    @abstractmethod
    def recuperacion_tramos(self, ini: date, fin: date, email: str | None, group: str) -> Any:
        """``fn_recuperacion_tramos``."""

    @abstractmethod
    def meta_analista_mes(self, email: str, anio: int | None, mes: int | None) -> Decimal:
        """``fn_meta_analista_mes``."""
