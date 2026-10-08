"""Repository en memoria de gestiones y notas rápidas (más las tablas que la bandeja cruza)."""

from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID, uuid4

from application.ports.gestiones import GestionesRepository
from domain.entities.gestiones import COLUMNAS_EDITABLES, NuevaGestion


class FakeGestionesRepository(GestionesRepository):
    def __init__(self) -> None:
        self.rows: dict[UUID, dict[str, Any]] = {}
        self.notas: dict[tuple[UUID, date], dict[str, Any]] = {}
        self.maestro: list[dict[str, str]] = []  # {cliente_cod, cliente_nombre, contribuyente}
        self.cartera: set[str] = set()
        self.solicitudes: list[dict[str, Any]] = []  # {gestion_id, estado}
        self.promesa_estados: dict[UUID, str] = {}

    def add(self, analista_email: str, **extra: Any) -> dict[str, Any]:
        row = {
            "id": uuid4(),
            "cliente_cod": "C001",
            "contribuyente": "3101",
            "analista_email": analista_email,
            "fecha": date(2026, 9, 1),
            "hora": "08:00:00",
            "tipo": "LLAMADA",
            "resultado": "No contestó",
            "nota": "",
            "activo": True,
            "promesa_id": None,
            **extra,
        }
        self.rows[row["id"]] = row
        return row

    def _scoped(self, email: str | None) -> list[dict[str, Any]]:
        return [r for r in self.rows.values() if email is None or r["analista_email"] == email]

    def list_gestiones(self, analista_email: str | None, offset: int, limit: int) -> list[dict[str, Any]]:
        rows = sorted(
            self._scoped(analista_email), key=lambda r: (r["fecha"], r["hora"], str(r["id"])), reverse=True
        )
        return rows[offset : offset + limit]

    def referencias(self, analista_email: str | None) -> dict[str, Any]:
        rows = self._scoped(analista_email)
        ids = {r["id"] for r in rows}
        cods = {r["cliente_cod"] for r in rows}
        promesas = {r["promesa_id"] for r in rows if r.get("promesa_id")}
        return {
            "solicitudes": [s for s in self.solicitudes if s["gestion_id"] in ids],
            "promesa_estados": {str(k): v for k, v in self.promesa_estados.items() if k in promesas},
            "nombres_cliente": {
                m["cliente_cod"]: m["cliente_nombre"] for m in self.maestro if m["cliente_cod"] in cods
            },
            "cods_con_cartera": sorted(c for c in self.cartera if c in cods),
        }

    def find_analista_email(self, gestion_id: UUID) -> str | None:
        row = self.rows.get(gestion_id)
        return row["analista_email"] if row else None

    def update_gestion(self, gestion_id: UUID, changes: dict[str, Any]) -> None:
        self.rows[gestion_id].update({k: v for k, v in changes.items() if k in COLUMNAS_EDITABLES})

    def desactivar_gestion(self, gestion_id: UUID) -> None:
        if gestion_id in self.rows:
            self.rows[gestion_id]["activo"] = False

    def insert_gestion(self, gestion: NuevaGestion) -> UUID:
        row = {"id": uuid4(), **asdict(gestion), "activo": True, "promesa_id": None, "legacy": False}
        self.rows[row["id"]] = row
        return row["id"]

    def vincular_promesa(self, gestion_id: UUID, promesa_id: UUID) -> None:
        self.rows[gestion_id]["promesa_id"] = promesa_id

    def nombre_cliente(self, cliente_cod: str) -> str | None:
        return next((m["cliente_nombre"] for m in self.maestro if m["cliente_cod"] == cliente_cod), None)

    def codigos_contribuyente(self, contribuyente: str, excluir_cod: str | None) -> list[dict[str, str]]:
        return [
            {"cliente_cod": m["cliente_cod"], "cliente_nombre": m["cliente_nombre"]}
            for m in self.maestro
            if m.get("contribuyente") == contribuyente and m["cliente_cod"] != excluir_cod
        ]

    def get_nota_rapida(self, usuario_id: UUID, fecha: date) -> dict[str, Any] | None:
        return self.notas.get((usuario_id, fecha))

    def save_nota_rapida(self, usuario_id: UUID, fecha: date, contenido: str) -> None:
        self.notas[(usuario_id, fecha)] = {"contenido": contenido, "updated_at": datetime.now(UTC)}
