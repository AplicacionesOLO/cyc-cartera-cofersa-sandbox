"""Port del módulo Reportes: RPC de reportes y consultas de apoyo de cada pantalla del Hub."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date
from typing import Any

Row = dict[str, Any]


class ReportesRepository(ABC):
    # ── Cobranza / control ────────────────────────────────────────────────
    @abstractmethod
    def aging(self) -> Any:
        """``fn_reporte_aging()`` → {consolidado, por_analista, por_vendedor}."""

    @abstractmethod
    def cei(self, anio: int, mes: int) -> Any:
        """``fn_reporte_cei(p_anio, p_mes)`` → filas CEI por vendedor."""

    @abstractmethod
    def snapshot_cierre_cartera(self, anio: int, mes: int, provisional: bool, generado_por: str) -> Any:
        """``fn_snapshot_cierre_cartera`` (escribe ``historico_cierres_cartera``)."""

    @abstractmethod
    def efectividad(self, ini: date, fin: date, email: str | None) -> Any:
        """``fn_reporte_efectividad(p_ini, p_fin, p_email)``."""

    @abstractmethod
    def perfil_vendedor(self, meses: int, orden: str) -> Any:
        """``fn_analisis_perfil_vendedor(p_email => NULL, p_meses, p_orden)``."""

    @abstractmethod
    def migracion_mora(
        self, anio: int, mes: int, supervisor_cod: str | None, vendedor_cod: str | None
    ) -> Any:
        """``fn_reporte_migracion_mora``."""

    @abstractmethod
    def supervisores(self) -> list[Row]:
        """``[{cod, nombre}]`` de ``supervisores``."""

    @abstractmethod
    def vendedores_activos(self) -> list[Row]:
        """``[{cod, nombre, supervisor_cod}]`` de ``vendedores`` activos."""

    # ── Gestión comercial ─────────────────────────────────────────────────
    @abstractmethod
    def mora_vendedor(self, email: str | None) -> Any:
        """``fn_reporte_mora_vendedor(p_email)``."""

    @abstractmethod
    def snapshot_bloqueados_semana(self) -> int:
        """``fn_snapshot_bloqueados_semana()`` (escribe ``historico_bloqueados``)."""

    @abstractmethod
    def bloqueados(self, email: str | None) -> Any:
        """``fn_reporte_bloqueados(p_email)``."""

    @abstractmethod
    def plazo_especial(self, email: str | None) -> Any:
        """``fn_reporte_plazo_especial(p_email)``."""

    @abstractmethod
    def portafolio_destinatarios(self) -> dict[str, list[str]]:
        """``fn_portafolio_destinatarios()`` → {principal_cod: [emails]}."""

    @abstractmethod
    def dimension_opciones(self, columna: str) -> list[str]:
        """Valores distintos no nulos de ``maestro_clientes.<dimension|agrupacion>`` ordenados."""

    # ── Gerencia ─────────────────────────────────────────────────────────
    @abstractmethod
    def kpis_cartera(self) -> list[Row]:
        """``fn_get_kpis_cartera()``."""

    @abstractmethod
    def ventas_mensuales(self) -> list[Row]:
        """``ventas_mensuales`` (anio, mes, total_ventas_sin_iva, cartera_total_mes) por anio, mes."""

    @abstractmethod
    def concentracion(self) -> Any:
        """``fn_analisis_concentracion()``."""

    @abstractmethod
    def recuperacion_mom(self, meses: int, email: str | None) -> Any:
        """``fn_recuperacion_mom(p_meses, p_email)``."""

    @abstractmethod
    def historico_cartera(self, limit: int) -> list[Row]:
        """``historico_cartera`` ordenado por fecha ascendente, primeras ``limit`` filas."""

    @abstractmethod
    def cierre_meses(self) -> list[Row]:
        """``fn_cierre_mensual_meses()``."""

    @abstractmethod
    def vendedores_zona(self) -> list[Row]:
        """``[{cod, nombre, zona}]`` de todos los vendedores."""

    @abstractmethod
    def portafolio_grupos_activos(self) -> list[Row]:
        """``[{principal_cod}]`` de ``portafolio_grupos`` activos."""

    @abstractmethod
    def portafolio_miembros_activos(self) -> list[Row]:
        """``[{principal_cod, vendedor_cod}]`` de ``portafolio_acotado`` activos."""

    @abstractmethod
    def maestro_clientes_resumen(self) -> list[Row]:
        """Cliente, nombre, vendedor (cod/nombre) y updated_at de ``maestro_clientes`` (updated_at desc)."""

    @abstractmethod
    def recuperacion(self, anio: int, mes: int) -> Any:
        """``fn_recuperacion(p_anio, p_mes)``."""

    @abstractmethod
    def cierre_riesgo_vendedor(self, anio: int, mes: int) -> list[Row]:
        """``fn_cierre_mensual_riesgo_vendedor``."""

    @abstractmethod
    def cierre_mora(self, anio: int, mes: int, anio_ant: int, mes_ant: int) -> list[Row]:
        """``fn_cierre_mensual_mora``."""

    @abstractmethod
    def cierre_icp(
        self, reciente_ini: date, reciente_fin: date, previo_ini: date, previo_fin: date
    ) -> list[Row]:
        """``fn_cierre_mensual_icp``."""

    # ── Estados de cuenta / analista ──────────────────────────────────────
    @abstractmethod
    def estados_cuenta(self, email: str | None) -> list[Row]:
        """``fn_estados_cuenta(p_email)`` → contribuyentes con saldo, correo y último envío."""

    @abstractmethod
    def vendedores_de_clientes(self, cliente_cods: list[str]) -> list[Row]:
        """``[{cliente_cod, vendedor_cod, vendedor_nombre}]`` de ``maestro_clientes`` para esos códigos."""

    @abstractmethod
    def cartera_vencida(self, analista_email: str) -> list[Row]:
        """Cartera con mora > 0 de los clientes del analista + fecha de su última gestión."""

    @abstractmethod
    def gestiones_periodo(self, analista_email: str, ini: date, fin: date) -> list[Row]:
        """Gestiones del analista entre ``ini`` y ``fin`` (fecha desc, hora desc)."""
