"""Port del módulo Análisis de Pagos (ICP) y Pagos Aplicados del Mes.

En el origen la UI llamaba directo a ``fn_analisis_*`` / ``fn_pagos_mes_resumen`` y las API Routes
``/api/pagos-anulados`` y ``/api/pagos-duplicado-descartado`` escribían con service role.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class AnalisisPagosRepository(ABC):
    @abstractmethod
    def ranking_clientes(
        self,
        *,
        email: str | None,
        meses: int,
        offset: int,
        limit: int,
        clasificacion: str | None,
        dimension: str | None,
        vendedor_cod: str | None,
        busqueda: str | None,
        orden: str,
    ) -> Any:
        """``fn_analisis_ranking_clientes``: ``{kpis, total, rows}``."""

    @abstractmethod
    def perfil_vendedor(self, email: str | None, meses: int, orden: str) -> Any:
        """``fn_analisis_perfil_vendedor``: ``{kpis, rows}``."""

    @abstractmethod
    def alertas_deterioro(self, email: str | None) -> Any:
        """``fn_analisis_alertas_deterioro``."""

    @abstractmethod
    def concentracion(self) -> Any:
        """``fn_analisis_concentracion`` (top 10 + HHI)."""

    @abstractmethod
    def pagos_mes_resumen(self, anio: int, mes: int) -> Any:
        """``fn_pagos_mes_resumen``: ``{kpis, recibos}`` por recibo."""

    @abstractmethod
    def marcar_anulados(
        self, no_recibos: list[str], motivo: str, recibo_reemplazo: str | None, anulado_por: str
    ) -> None:
        """Upsert en ``pagos_anulados`` (no borra nada de ``pagos``)."""

    @abstractmethod
    def desmarcar_anulado(self, no_recibo: str) -> None: ...

    @abstractmethod
    def descartar_duplicado(self, no_recibo: str, nota: str | None, descartado_por: str) -> None:
        """Upsert en ``pagos_duplicado_descartado``."""

    @abstractmethod
    def revertir_descarte_duplicado(self, no_recibo: str) -> None: ...

    @abstractmethod
    def registrar_auditoria(
        self,
        *,
        tabla: str,
        accion: str,
        descripcion: str,
        realizado_por: str,
        valor_nuevo: dict[str, Any] | None = None,
    ) -> None:
        """``config_audit_log``. Un fallo de auditoría no interrumpe la operación principal."""
