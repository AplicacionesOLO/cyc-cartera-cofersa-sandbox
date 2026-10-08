"""DashboardRepository en memoria: tablas como listas de dicts, mismas reglas de filtro que el SQL."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from application.ports.dashboard import DashboardRepository, Row


class FakeDashboardRepository(DashboardRepository):
    def __init__(self) -> None:
        self.kpis_cartera_rows: list[Row] = []
        self.ventas: list[Row] = []
        self.usuarios: list[Row] = []
        self.gestiones: list[Row] = []
        self.promesas: list[Row] = []
        self.recuperacion_json: Row | None = None
        self.historico: list[Row] = []
        self.pedidos: dict[str | None, Row] = {}
        self.config: dict[str, str] = {}
        self.kpis_por_email: dict[str, Row] = {}
        self.vendedores_por_email: dict[str, list[Row]] = {}
        self.notificaciones: list[Row] = []
        self.maestro: list[Row] = []  # cliente_cod, cliente_nombre, analista_email
        self.cartera: list[Row] = []
        self.icp: dict[str, float] = {}
        self.pagos: list[Row] = []
        self.calls: list[tuple[str, Any]] = []

    def kpis_cartera(self) -> list[Row]:
        return list(self.kpis_cartera_rows)

    def ventas_mensuales(self) -> list[Row]:
        return sorted(self.ventas, key=lambda v: (v["anio"], v["mes"]))

    def analistas_elegibles(self) -> list[Row]:
        return [
            u
            for u in self.usuarios
            if u.get("activo", True)
            and (
                u["rol"] == "ANALISTA" or (u["rol"] == "ANALISTA_RIESGO" and u.get("tiene_cartera_asignada"))
            )
        ]

    def conteo_gestiones_por_analista(self, hoy: date, inicio_semana: date, inicio_mes: date) -> list[Row]:
        out: dict[str, Row] = {}
        for g in self.gestiones:
            c = out.setdefault(
                g["analista_email"],
                {"analista_email": g["analista_email"], "g_hoy": 0, "g_semana": 0, "g_mes": 0},
            )
            c["g_hoy"] += g["fecha"] == hoy
            c["g_semana"] += g["fecha"] >= inicio_semana
            c["g_mes"] += g["fecha"] >= inicio_mes
        return list(out.values())

    def recuperacion(self, anio: int, mes: int) -> Row | None:
        self.calls.append(("recuperacion", (anio, mes)))
        return self.recuperacion_json

    def historico_cartera(self, limite: int) -> list[Row]:
        return sorted(self.historico, key=lambda h: h["fecha"], reverse=True)[:limite]

    def pedidos_retenidos(self, analista_email: str | None) -> Row | None:
        self.calls.append(("pedidos_retenidos", analista_email))
        return self.pedidos.get(analista_email)

    def config_valor(self, clave: str) -> str | None:
        self.calls.append(("config_valor", clave))
        return self.config.get(clave)

    def kpis_analista(self, analista_email: str) -> Row | None:
        return self.kpis_por_email.get(analista_email)

    def vendedores_analista(self, analista_email: str) -> list[Row]:
        return self.vendedores_por_email.get(analista_email, [])

    def agenda_gestiones(self, analista_email: str, fechas: list[date], limite: int) -> list[Row]:
        rows = [
            {**g, "cliente_nombre": self._nombre(g["cliente_cod"])}
            for g in self.gestiones
            if g["analista_email"] == analista_email
            and g.get("proxima_accion_fecha") in fechas
            and g.get("activo", True)
        ]
        return sorted(rows, key=lambda g: g["proxima_accion_fecha"])[:limite]

    def agenda_promesas(self, analista_email: str, fechas: list[date], limite: int) -> list[Row]:
        rows = [
            p
            for p in self.promesas
            if p["analista_email"] == analista_email
            and p["estado"] == "PENDIENTE"
            and p["fecha_promesa"] in fechas
        ]
        return sorted(rows, key=lambda p: p["fecha_promesa"])[:limite]

    def promesas_pendientes(self, analista_email: str, limite: int) -> list[Row]:
        rows = [
            p
            for p in self.promesas
            if p["analista_email"] == analista_email and p["estado"] == "PENDIENTE" and p.get("activo", True)
        ]
        return sorted(rows, key=lambda p: p["fecha_promesa"])[:limite]

    def tareas_sugeridas(self, usuario_id: UUID, limite: int) -> list[Row]:
        rows = [
            n
            for n in self.notificaciones
            if n["usuario_id"] == usuario_id
            and n["tipo"] == "ALERTA"
            and n["titulo"].lower().startswith("sin gestión ≥")
            and not n.get("leida")
        ]
        return sorted(rows, key=lambda n: n["created_at"], reverse=True)[:limite]

    def clientes_de_analista(self, analista_email: str) -> list[str]:
        return [m["cliente_cod"] for m in self.maestro if m.get("analista_email") == analista_email]

    def ultimo_sync_cartera(self) -> str | None:
        rows = sorted(self.cartera, key=lambda c: c.get("updated_at") or "", reverse=True)
        return rows[0].get("sync_id") if rows else None

    def cartera_de_clientes(self, codigos: list[str], sync_id: str | None) -> list[Row]:
        return [
            c
            for c in self.cartera
            if c["cliente_cod"] in codigos and (not sync_id or c.get("sync_id") == sync_id)
        ]

    def gestiones_de_clientes(self, codigos: list[str]) -> list[Row]:
        rows = [g for g in self.gestiones if g["cliente_cod"] in codigos]
        return sorted(rows, key=lambda g: (g["fecha"], g.get("created_at") or ""), reverse=True)

    def promesas_pendientes_de_clientes(self, codigos: list[str]) -> list[Row]:
        rows = [p for p in self.promesas if p["cliente_cod"] in codigos and p["estado"] == "PENDIENTE"]
        return sorted(rows, key=lambda p: p["fecha_promesa"])

    def monto_promesas_cumplidas(self, codigos: list[str], desde: date) -> float:
        return float(
            sum(
                p.get("monto") or 0
                for p in self.promesas
                if p["cliente_cod"] in codigos and p["estado"] == "CUMPLIDA" and p["updated_at"] >= desde
            )
        )

    def icp_de_clientes(self, codigos: list[str]) -> dict[str, float]:
        return {k: v for k, v in self.icp.items() if k in codigos}

    def pagos_desde(self, codigos: list[str], desde: date) -> list[Row]:
        return [p for p in self.pagos if p["cliente_cod"] in codigos and p["fecha_pago"] >= desde]

    def _nombre(self, cod: str) -> str | None:
        return next((m["cliente_nombre"] for m in reversed(self.maestro) if m["cliente_cod"] == cod), None)
