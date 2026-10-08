"""Repository en memoria de Gestión de Cartera."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from application.ports.gestion_cartera import GestionCarteraRepository


class FakeGestionCarteraRepository(GestionCarteraRepository):
    def __init__(self) -> None:
        self.pedidos: dict[str, dict[str, Any]] = {}
        self.saldos: dict[UUID, dict[str, Any]] = {}
        self.cartera: dict[str, str] = {}  # cliente_cod → analista_email
        self.matches: list[dict[str, Any]] = []
        self.reportes: dict[UUID, dict[str, Any]] = {}
        self.detalles: list[dict[str, Any]] = []
        self.pedidos_email: list[str | None] = []

    def add_saldo(self, cliente_cod: str, **extra: Any) -> UUID:
        saldo_id = extra.pop("id", uuid4())
        self.saldos[saldo_id] = {
            "id": saldo_id,
            "cliente_cod": cliente_cod,
            "monto": 100,
            "estado_manual": "pendiente",
            "aplicado_por": None,
            **extra,
        }
        return saldo_id

    def _analista(self, cliente_cod: str) -> str | None:
        return self.cartera.get(cliente_cod)

    def pedidos_retenidos(self, analista_email: str | None) -> dict[str, Any]:
        self.pedidos_email.append(analista_email)
        rows = [p for p in self.pedidos.values() if analista_email in (None, p.get("analista_email"))]
        return {"kpis": {"total": len(rows)}, "rows": rows}

    def actualizar_pedido_retenido(self, id_pedido: str, cambios: dict[str, Any]) -> dict[str, Any] | None:
        row = self.pedidos.get(id_pedido)
        if row is None:
            return None
        row.update(cambios)
        return dict(row)

    def saldos_favor(self, analista_email: str | None) -> list[dict[str, Any]]:
        return [s for s in self.saldos.values() if analista_email in (None, self._analista(s["cliente_cod"]))]

    def saldos_favor_de_cliente(self, cliente_cod: str, analista_email: str | None) -> list[dict[str, Any]]:
        if analista_email is not None and self._analista(cliente_cod) != analista_email:
            return []
        return [s for s in self.saldos.values() if s["cliente_cod"] == cliente_cod]

    def cliente_de_saldo_favor(self, saldo_id: UUID) -> str | None:
        row = self.saldos.get(saldo_id)
        return row["cliente_cod"] if row else None

    def marcar_saldo_aplicado(self, saldo_id: UUID, aplicado_por: str) -> bool:
        row = self.saldos.get(saldo_id)
        if row is None:
            return False
        row.update(estado_manual="aplicado", aplicado_por=aplicado_por)
        return True

    def matching_saldos_favor(self, cliente_cod: str | None) -> list[dict[str, Any]]:
        return [m for m in self.matches if cliente_cod in (None, m["cliente_cod"])]

    def clientes_de_analista(self, analista_email: str) -> set[str]:
        return {cod for cod, email in self.cartera.items() if email == analista_email}

    def existe_referencia_pago(self, referencia: str) -> bool:
        return any(r["referencia"] == referencia for r in self.reportes.values())

    def crear_reporte_pago(self, reporte: dict[str, Any], detalles: list[dict[str, Any]]) -> UUID:
        reporte_id = uuid4()
        self.reportes[reporte_id] = dict(reporte)
        self.detalles.extend({**d, "reporte_id": reporte_id} for d in detalles)
        return reporte_id
