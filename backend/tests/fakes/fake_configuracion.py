"""Repository en memoria del módulo Configuración."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from application.ports.configuracion import ConfiguracionRepository, Row


class FakeConfiguracionRepository(ConfiguracionRepository):
    def __init__(self) -> None:
        self.usuarios: dict[UUID, Row] = {}
        self.vendedores: dict[str, Row] = {}
        self.supervisores: dict[str, Row] = {}
        self.contactos: dict[UUID, Row] = {}
        self.grupos: dict[str, Row] = {}
        self.miembros: list[Row] = []
        self.config: dict[str, Row] = {}
        self.ventas: dict[tuple[int, int], Row] = {}
        self.audit: list[Row] = []
        self.feed: list[Row] = []
        self.leidas: list[UUID] = []
        self.clientes_por_vendedor: dict[str, int] = {}
        self.resumen: dict[str, int] = {}
        self.fallar_auditoria = False
        self.fallar_resumen = False

    # ── usuarios ──────────────────────────────────────────────────────
    def list_usuarios(self) -> list[Row]:
        return sorted((dict(u) for u in self.usuarios.values()), key=lambda u: u["nombre"])

    def get_usuario(self, usuario_id: UUID) -> Row | None:
        row = self.usuarios.get(usuario_id)
        return dict(row) if row else None

    def insert_usuario(self, data: Row) -> Row:
        if any(u["email"] == data["email"] for u in self.usuarios.values()):
            raise ValueError("duplicate email")
        row = {"id": uuid4(), "created_at": datetime.now(UTC), "tiene_cartera_asignada": False, **data}
        self.usuarios[row["id"]] = row
        return dict(row)

    def update_usuario(self, usuario_id: UUID, changes: Row) -> Row | None:
        row = self.usuarios.get(usuario_id)
        if row is None:
            return None
        row.update(changes)
        return dict(row)

    # ── vendedores ────────────────────────────────────────────────────
    def list_vendedores(self, *, solo_activos: bool) -> list[Row]:
        rows = [dict(v) for v in self.vendedores.values() if v["activo"] or not solo_activos]
        return sorted(rows, key=lambda v: v["nombre"])

    def get_vendedor(self, cod: str) -> Row | None:
        row = self.vendedores.get(cod)
        return dict(row) if row else None

    def insert_vendedor(self, data: Row) -> Row:
        self.vendedores[data["cod"]] = dict(data)
        return dict(data)

    def update_vendedor(self, cod: str, changes: Row) -> Row | None:
        row = self.vendedores.get(cod)
        if row is None:
            return None
        row.update(changes)
        return dict(row)

    def contar_clientes_por_vendedor(self) -> dict[str, int]:
        return dict(self.clientes_por_vendedor)

    def ruta_activa_de_principal(self, cod: str) -> str | None:
        grupo = self.grupos.get(cod)
        return grupo["nombre_ruta"] if grupo and grupo["activo"] else None

    # ── supervisores ──────────────────────────────────────────────────
    def list_supervisores(self, *, solo_activos: bool = False) -> list[Row]:
        rows = [dict(s) for s in self.supervisores.values() if s["activo"] or not solo_activos]
        return sorted(rows, key=lambda s: s["nombre"])

    def get_supervisor(self, cod: str) -> Row | None:
        row = self.supervisores.get(cod)
        return dict(row) if row else None

    def insert_supervisor(self, data: Row) -> Row:
        self.supervisores[data["cod"]] = dict(data)
        return dict(data)

    def update_supervisor(self, cod: str, changes: Row) -> Row | None:
        row = self.supervisores.get(cod)
        if row is None:
            return None
        row.update(changes)
        return dict(row)

    def vendedores_activos_de_supervisor(self, cod: str) -> list[Row]:
        return [
            {"cod": v["cod"], "nombre": v["nombre"]}
            for v in self.vendedores.values()
            if v.get("supervisor_cod") == cod and v["activo"]
        ]

    # ── directorio ────────────────────────────────────────────────────
    @staticmethod
    def _match(row: Row, q: str | None, area: str | None) -> bool:
        if area and row.get("area") != area:
            return False
        if q:
            return q.lower() in row["nombre"].lower() or q.lower() in row["email"].lower()
        return True

    def list_directorio(self, *, area: str | None, q: str | None) -> list[Row]:
        rows = [dict(c) for c in self.contactos.values() if self._match(c, q, area)]
        return sorted(rows, key=lambda c: c["nombre"])

    def list_contactos_activos(self, *, q: str | None, area: str | None, limit: int | None) -> list[Row]:
        rows = [c for c in self.list_directorio(area=area, q=q) if c["activo"]]
        return rows[:limit] if limit else rows

    def get_contacto(self, contacto_id: UUID) -> Row | None:
        row = self.contactos.get(contacto_id)
        return dict(row) if row else None

    def insert_contacto(self, data: Row) -> Row:
        row = {"id": uuid4(), "created_at": datetime.now(UTC), **data}
        self.contactos[row["id"]] = row
        return dict(row)

    def update_contacto(self, contacto_id: UUID, changes: Row) -> Row | None:
        row = self.contactos.get(contacto_id)
        if row is None:
            return None
        row.update(changes)
        return dict(row)

    # ── portafolio acotado ────────────────────────────────────────────
    def list_grupos(self) -> list[Row]:
        return sorted((dict(g) for g in self.grupos.values()), key=lambda g: g["nombre_ruta"])

    def list_miembros(self, principal_cod: str | None = None) -> list[Row]:
        return [
            dict(m) for m in self.miembros if principal_cod is None or m["principal_cod"] == principal_cod
        ]

    def get_grupo(self, principal_cod: str) -> Row | None:
        row = self.grupos.get(principal_cod)
        return dict(row) if row else None

    def upsert_grupo(self, principal_cod: str, nombre_ruta: str, rol_funcional: str | None) -> None:
        self.grupos[principal_cod] = {
            "principal_cod": principal_cod,
            "nombre_ruta": nombre_ruta,
            "rol_funcional": rol_funcional,
            "activo": True,
        }

    def update_grupo(self, principal_cod: str, changes: Row) -> None:
        if principal_cod in self.grupos:
            self.grupos[principal_cod].update(changes)

    def activar_miembros(self, principal_cod: str, vendedor_cods: list[str]) -> None:
        for cod in vendedor_cods:
            fila = next(
                (
                    m
                    for m in self.miembros
                    if m["principal_cod"] == principal_cod and m["vendedor_cod"] == cod
                ),
                None,
            )
            if fila:
                fila["activo"] = True
            else:
                self.miembros.append({"principal_cod": principal_cod, "vendedor_cod": cod, "activo": True})

    def desactivar_miembros(self, principal_cod: str, vendedor_cods: list[str]) -> None:
        for m in self.miembros:
            if m["principal_cod"] == principal_cod and m["vendedor_cod"] in vendedor_cods:
                m["activo"] = False

    # ── config_sistema ────────────────────────────────────────────────
    def list_config(self, *, claves: tuple[str, ...] | None = None, prefijo: str | None = None) -> list[Row]:
        return [
            dict(r)
            for clave, r in sorted(self.config.items())
            if (claves is None or clave in claves) and (prefijo is None or clave.startswith(prefijo))
        ]

    def get_config_valor(self, clave: str) -> str | None:
        row = self.config.get(clave)
        return row["valor"] if row else None

    def upsert_config(self, valores: dict[str, str]) -> list[Row]:
        out = []
        for clave, valor in valores.items():
            row = self.config.setdefault(clave, {"clave": clave, "valor": valor, "descripcion": None})
            row["valor"] = valor
            out.append(dict(row))
        return out

    # ── cierre de mes ─────────────────────────────────────────────────
    def list_ventas_mensuales(self, limit: int) -> list[Row]:
        return [dict(self.ventas[k]) for k in sorted(self.ventas, reverse=True)][:limit]

    def get_venta_mensual(self, anio: int, mes: int) -> Row | None:
        row = self.ventas.get((anio, mes))
        return dict(row) if row else None

    def upsert_venta_mensual(
        self, anio: int, mes: int, total_ventas_sin_iva: float, cartera_total_mes: float | None
    ) -> Row:
        row = {
            "anio": anio,
            "mes": mes,
            "total_ventas_sin_iva": total_ventas_sin_iva,
            "cartera_total_mes": cartera_total_mes,
        }
        self.ventas[(anio, mes)] = row
        return dict(row)

    # ── log ───────────────────────────────────────────────────────────
    def list_audit_log(
        self,
        *,
        tabla: str | None,
        desde: datetime | None,
        hasta: datetime | None,
        limit: int | None,
        offset: int,
    ) -> tuple[list[Row], int]:
        rows = [
            r
            for r in sorted(self.audit, key=lambda r: r["realizado_en"], reverse=True)
            if (tabla is None or r["tabla"] == tabla)
            and (desde is None or r["realizado_en"] >= desde)
            and (hasta is None or r["realizado_en"] <= hasta)
        ]
        page = rows[offset:] if limit is None else rows[offset : offset + limit]
        return [dict(r) for r in page], len(rows)

    def insert_audit_log(self, **params: Any) -> None:
        if self.fallar_auditoria:
            raise RuntimeError("audit down")
        self.audit.append({"realizado_en": datetime.now(UTC), **params})

    # ── automatizaciones ──────────────────────────────────────────────
    def automatizaciones_resumen(self) -> dict[str, int]:
        if self.fallar_resumen:
            raise RuntimeError("rpc down")
        return dict(self.resumen)

    def list_automatizaciones_feed(
        self, *, desde: datetime, regla_id: str | None, limit: int, con_usuario: bool
    ) -> list[Row]:
        rows = [
            dict(e)
            for e in sorted(self.feed, key=lambda e: e["created_at"], reverse=True)
            if e["created_at"] >= desde and (regla_id is None or e["regla_id"] == regla_id)
        ][:limit]
        if con_usuario:
            for row in rows:
                u = self.usuarios.get(row["usuario_id"])
                row["usuario"] = {"id": u["id"], "nombre": u["nombre"], "email": u["email"]} if u else None
        return rows

    def marcar_notificacion_leida(self, notificacion_id: UUID) -> None:
        self.leidas.append(notificacion_id)
