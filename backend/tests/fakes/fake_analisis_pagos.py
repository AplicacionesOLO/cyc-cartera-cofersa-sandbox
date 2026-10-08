"""Repository en memoria de Análisis de Pagos / Pagos Aplicados."""

from __future__ import annotations

from typing import Any

from application.ports.analisis_pagos import AnalisisPagosRepository


class FakeAnalisisPagosRepository(AnalisisPagosRepository):
    def __init__(self) -> None:
        self.anulados: dict[str, dict[str, Any]] = {}
        self.descartados: dict[str, dict[str, Any]] = {}
        self.auditoria: list[dict[str, Any]] = []
        self.calls: list[tuple[Any, ...]] = []

    def ranking_clientes(self, **filtros: Any) -> Any:
        self.calls.append(("ranking", filtros))
        return {"kpis": {}, "total": 0, "rows": []}

    def perfil_vendedor(self, email: str | None, meses: int, orden: str) -> Any:
        self.calls.append(("perfil", email, meses, orden))
        return {"kpis": {}, "rows": []}

    def alertas_deterioro(self, email: str | None) -> Any:
        self.calls.append(("alertas", email))
        return {"kpis": {"deterioro_critico": 0}, "deterioro_critico": [], "deterioro_moderado": []}

    def concentracion(self) -> Any:
        self.calls.append(("concentracion",))
        return {"kpis": {}, "top10": []}

    def pagos_mes_resumen(self, anio: int, mes: int) -> Any:
        self.calls.append(("pagos_mes", anio, mes))
        return {"kpis": {"n_recibos": 0, "n_lineas": 0, "monto_total": 0}, "recibos": []}

    def marcar_anulados(
        self, no_recibos: list[str], motivo: str, recibo_reemplazo: str | None, anulado_por: str
    ) -> None:
        for no_recibo in no_recibos:
            self.anulados[no_recibo] = {
                "motivo": motivo,
                "recibo_reemplazo": recibo_reemplazo,
                "anulado_por": anulado_por,
            }

    def desmarcar_anulado(self, no_recibo: str) -> None:
        self.anulados.pop(no_recibo, None)

    def descartar_duplicado(self, no_recibo: str, nota: str | None, descartado_por: str) -> None:
        self.descartados[no_recibo] = {"nota": nota, "descartado_por": descartado_por}

    def revertir_descarte_duplicado(self, no_recibo: str) -> None:
        self.descartados.pop(no_recibo, None)

    def registrar_auditoria(
        self,
        *,
        tabla: str,
        accion: str,
        descripcion: str,
        realizado_por: str,
        valor_nuevo: dict[str, Any] | None = None,
    ) -> None:
        self.auditoria.append(
            {
                "tabla": tabla,
                "accion": accion,
                "descripcion": descripcion,
                "realizado_por": realizado_por,
                "valor_nuevo": valor_nuevo,
            }
        )
