"""Repository en memoria del Presupuesto de Cobro (registra las llamadas a las fn_* simuladas)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from application.ports.presupuesto import PresupuestoRepository


class FakePresupuestoRepository(PresupuestoRepository):
    def __init__(self) -> None:
        self.congelados: dict[tuple[int, int], dict[str, Any]] = {}
        self.estimados: dict[tuple[int, int], dict[str, Any]] = {}
        self.metas: dict[tuple[int, int, str], int] = {}
        self.calls: list[tuple[Any, ...]] = []
        self.vendedores: list[dict[str, Any]] = []
        self.directorio: dict[str, list[dict[str, Any]]] = {
            "vendedores": [],
            "supervisores": [],
            "grupos": [],
            "miembros": [],
        }
        self.sin_pago: list[dict[str, Any]] = []
        self.ppto_cartera: Decimal = Decimal(0)
        self.metas_analista: dict[str, Decimal] = {}

    def presupuesto_congelado(self, anio: int, mes: int) -> dict[str, Any]:
        return self.congelados.get((anio, mes), {"congelado": False})

    def presupuesto_estimado(self, anio: int, mes: int) -> dict[str, Any]:
        return self.estimados.get((anio, mes), {"kpis": {"anio": anio, "mes": mes}, "vendedores": []})

    def congelar(self, anio: int, mes: int, email: str) -> dict[str, Any]:
        self.calls.append(("congelar", anio, mes, email))
        self.congelados[(anio, mes)] = {
            "congelado": True,
            "kpis": {"anio": anio, "mes": mes},
            "vendedores": [],
        }
        return {"ok": True, "n_clientes": 0, "ppto_total": 0}

    def ajustar_meta(self, anio: int, mes: int, vendedor_cod: str, meta: int, email: str) -> dict[str, Any]:
        self.calls.append(("meta", anio, mes, vendedor_cod, meta, email))
        self.metas[(anio, mes, vendedor_cod)] = meta
        return {"ok": True}

    def reasignar_cliente(
        self, anio: int, mes: int, cliente_cod: str, vendedor_cod: str, email: str
    ) -> dict[str, Any]:
        self.calls.append(("reasignar", anio, mes, cliente_cod, vendedor_cod, email))
        return {"ok": True}

    def vendedores_activos(self) -> list[dict[str, Any]]:
        return list(self.vendedores)

    def directorio_envio(self) -> dict[str, list[dict[str, Any]]]:
        return self.directorio

    def recuperacion(self, anio: int, mes: int) -> dict[str, Any]:
        self.calls.append(("recuperacion", anio, mes))
        return {"kpis": {"anio": anio, "mes": mes}, "vendedores": [], "serie": []}

    def proyeccion(self, semanas: int, semanas_pasadas: int) -> dict[str, Any]:
        self.calls.append(("proyeccion", semanas, semanas_pasadas))
        return {"kpis": {}, "semanas": []}

    def clientes_sin_pago(self, anio: int, mes: int) -> list[dict[str, Any]]:
        return list(self.sin_pago)

    def ppto_cartera_total(self, anio: int, mes: int) -> Decimal:
        return self.ppto_cartera

    def recuperacion_mom(self, meses: int, email: str | None) -> Any:
        self.calls.append(("mom", meses, email))
        return []

    def recuperacion_periodo(self, ini: date, fin: date, email: str | None, group: str) -> Any:
        self.calls.append(("periodo", ini, fin, email, group))
        return {"kpis": {}, "grupos": [], "serie": []}

    def recuperacion_tramos(self, ini: date, fin: date, email: str | None, group: str) -> Any:
        self.calls.append(("tramos", ini, fin, email, group))
        return {"kpis": {}, "grupos": []}

    def meta_analista_mes(self, email: str, anio: int | None, mes: int | None) -> Decimal:
        self.calls.append(("meta_analista", email, anio, mes))
        return self.metas_analista.get(email, Decimal(0))
