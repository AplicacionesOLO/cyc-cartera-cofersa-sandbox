"""Repository en memoria del módulo Clientes."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from application.ports.clientes import ClientesRepository, Row
from domain.entities.clientes import ESTADOS_PEDIDO_ACTIVOS, GestionNueva


class FakeClientesRepository(ClientesRepository):
    def __init__(self) -> None:
        self.cartera: list[Row] = []
        self.maestro: list[Row] = []
        self.facturas: list[Row] = []
        self.gestiones: list[Row] = []
        self.promesas: list[Row] = []
        self.solicitudes: list[Row] = []
        self.pedidos: list[Row] = []
        self.marcas: list[Row] = []
        self.cuentas: list[Row] = []
        self.usuarios: list[Row] = []
        self.icp: dict[str, Row] = {}
        self.tendencia: dict[str, list[Row]] = {}
        self.nuevas_gestiones: list[GestionNueva] = []
        self.notificaciones: list[tuple] = []
        self.contactos: list[tuple[str, dict]] = []
        self.logisticas: list[tuple[str, dict]] = []
        self.correos_ultima_hora = 0
        self.lista_calls: list[tuple] = []

    def lista(self, filtros: dict[str, Any], page: int, page_size: int | None, hoy: date) -> Row:
        self.lista_calls.append((filtros, page, page_size, hoy))
        por_cod = {r["cliente_cod"]: r for r in self.cartera}  # fn_clientes_lista: DISTINCT ON cliente_cod
        rows = [r for r in por_cod.values() if not filtros.get("q") or filtros["q"] in r["cliente_nombre"]]
        if page_size is not None:
            rows = rows[(page - 1) * page_size : page * page_size]
        return {"rows": rows, "total_rows": len(rows), "kpi_cartera": 0, "kpi_mora": 0}

    def buscar_clientes(self, q: str, limit: int) -> list[Row]:
        q = q.lower()
        return [m for m in self.maestro if q in m["cliente_nombre"].lower() or q in m["cliente_cod"].lower()][
            :limit
        ]

    def buscar_facturas_por_sufijo(self, sufijo: str, limit: int) -> list[Row]:
        return [f for f in self.facturas if f["documento"].endswith(sufijo)][:limit]

    def buscar_marcas(self, q: str, limit: int) -> list[Row]:
        return [m for m in self.marcas if q.lower() in m["nombre"].lower()][:limit]

    def carteras_del_cliente(self, cliente_cod: str) -> list[Row]:
        return [r for r in self.cartera if r["cliente_cod"] == cliente_cod]

    def maestro_del_cliente(self, cliente_cod: str) -> Row | None:
        return next((m for m in self.maestro if m["cliente_cod"] == cliente_cod), None)

    def gestiones_del_cliente(self, cliente_cod: str, limit: int) -> list[Row]:
        return [g for g in self.gestiones if g["cliente_cod"] == cliente_cod][:limit]

    def promesas_del_cliente(self, cliente_cod: str) -> list[Row]:
        return [p for p in self.promesas if p["cliente_cod"] == cliente_cod]

    def icp_del_cliente(self, cliente_cod: str) -> Row | None:
        return self.icp.get(cliente_cod)

    def tendencia_pago(self, cliente_cod: str, meses: int) -> list[Row]:
        return self.tendencia.get(cliente_cod, [])

    def pedidos_retenidos_activos(self, cliente_cod: str) -> list[Row]:
        return [
            p
            for p in self.pedidos
            if p["codigo_cliente"] == cliente_cod and p["estado_sic"] in ESTADOS_PEDIDO_ACTIVOS
        ]

    def solicitudes_del_cliente(self, cliente_cod: str, solicitante_id: UUID | None, limit: int) -> list[Row]:
        return [
            s
            for s in self.solicitudes
            if s["cliente_cod"] == cliente_cod
            and (solicitante_id is None or s["solicitante_id"] == solicitante_id)
        ][:limit]

    def nombres_usuarios(self, ids: list[str]) -> dict[str, str]:
        return {str(u["id"]): u["nombre"] for u in self.usuarios if str(u["id"]) in ids}

    def contacto_usuario(self, email: str) -> Row | None:
        return next((u for u in self.usuarios if u["email"].lower() == email.lower()), None)

    def facturas_por_contribuyente(self, contribuyente: str, *, solo_con_saldo: bool) -> list[Row]:
        return [
            f
            for f in self.facturas
            if f["contribuyente"] == contribuyente and (not solo_con_saldo or (f.get("saldo") or 0) > 0)
        ]

    def cuentas_bancarias_activas(self) -> list[Row]:
        return list(self.cuentas)

    def actualizar_contacto(self, cliente_cod: str, campos: dict[str, str | None]) -> None:
        self.contactos.append((cliente_cod, campos))

    def actualizar_logistica(self, cliente_cod: str, campos: dict[str, Any]) -> None:
        self.logisticas.append((cliente_cod, campos))

    def actualizar_estado_manual(self, cliente_cod: str, estado: str) -> bool:
        maestro = self.maestro_del_cliente(cliente_cod)
        if maestro is None:
            return False
        maestro["estado_manual"] = estado
        return True

    def registrar_gestion(self, gestion: GestionNueva) -> None:
        self.nuevas_gestiones.append(gestion)

    def contar_correos_desde(self, analista_email: str, desde: datetime) -> int:
        return self.correos_ultima_hora

    def crear_notificacion(self, usuario_id: UUID, tipo: str, titulo: str, mensaje: str, link: str) -> None:
        self.notificaciones.append((usuario_id, tipo, titulo, mensaje, link))
