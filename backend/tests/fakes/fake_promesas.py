"""Repository en memoria de promesas de pago."""

from __future__ import annotations

from dataclasses import asdict
from datetime import date
from typing import Any
from uuid import UUID, uuid4

from application.ports.promesas import PromesasRepository
from domain.entities.promesas import COLUMNAS_ACTUALIZABLES, NuevaPromesa


class FakePromesasRepository(PromesasRepository):
    def __init__(self) -> None:
        self.rows: dict[UUID, dict[str, Any]] = {}
        self.gestiones: dict[UUID, dict[str, Any]] = {}  # gestiones origen {id, resultado, nota, tipo, fecha}

    def add(self, analista_email: str, **extra: Any) -> dict[str, Any]:
        row = {
            "id": uuid4(),
            "cliente_cod": "C001",
            "cliente_nombre": "Ferretería Uno",
            "contribuyente": "3101",
            "analista_email": analista_email,
            "fecha_creacion": date(2026, 9, 1),
            "fecha_promesa": date(2026, 9, 30),
            "monto": 150000,
            "estado": "PENDIENTE",
            "notas": "nota",
            "activo": True,
            "gestion_id": None,
            "reprogramada_de_id": None,
            "eventos": [],
            **extra,
        }
        self.rows[row["id"]] = row
        return row

    def list_activas(self, analista_email: str | None, limit: int) -> list[dict[str, Any]]:
        rows = [
            r
            for r in self.rows.values()
            if r.get("activo") is not False
            and (analista_email is None or r["analista_email"] == analista_email)
        ]
        return sorted(rows, key=lambda r: r["fecha_promesa"])[:limit]

    def gestiones_origen(self, gestion_ids: list[UUID]) -> list[dict[str, Any]]:
        return [self.gestiones[g] for g in gestion_ids if g in self.gestiones]

    def get_for_update(self, promesa_id: UUID) -> dict[str, Any] | None:
        row = self.rows.get(promesa_id)
        return dict(row) if row else None

    def existe_pendiente(self, cliente_cod: str, monto: float, fecha_promesa: date) -> bool:
        return any(
            r["cliente_cod"] == cliente_cod
            and float(r["monto"]) == float(monto)
            and r["fecha_promesa"] == fecha_promesa
            and r["estado"] == "PENDIENTE"
            for r in self.rows.values()
        )

    def insert(self, promesa: NuevaPromesa) -> UUID:
        row = {"id": uuid4(), **asdict(promesa), "activo": True}
        self.rows[row["id"]] = row
        return row["id"]

    def update(self, promesa_id: UUID, changes: dict[str, Any]) -> None:
        if promesa_id in self.rows:
            self.rows[promesa_id].update({k: v for k, v in changes.items() if k in COLUMNAS_ACTUALIZABLES})
