"""Repository en memoria de notificaciones y config_sistema."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from application.ports.notificaciones import NotificacionesRepository


class FakeNotificacionesRepository(NotificacionesRepository):
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self.config: dict[str, str] = {}

    def add(self, usuario_id: UUID, titulo: str = "N", tipo: str = "ALERTA", **extra: Any) -> dict[str, Any]:
        row = {
            "id": uuid4(),
            "usuario_id": usuario_id,
            "tipo": tipo,
            "titulo": titulo,
            "mensaje": None,
            "leida": False,
            "link": None,
            "created_at": datetime.now(UTC) + timedelta(seconds=len(self.rows)),
            **extra,
        }
        self.rows.append(row)
        return row

    def list_por_usuario(self, usuario_id: UUID, limit: int) -> list[dict[str, Any]]:
        mine = [dict(r) for r in self.rows if r["usuario_id"] == usuario_id]
        return sorted(mine, key=lambda r: r["created_at"], reverse=True)[:limit]

    def marcar_leida(self, usuario_id: UUID, notificacion_id: UUID) -> bool:
        for row in self.rows:
            if row["id"] == notificacion_id and row["usuario_id"] == usuario_id:
                row["leida"] = True
                return True
        return False

    def marcar_todas_leidas(self, usuario_id: UUID) -> int:
        count = 0
        for row in self.rows:
            if row["usuario_id"] == usuario_id and not row["leida"]:
                row["leida"] = True
                count += 1
        return count

    def leer_config(self, claves: tuple[str, ...]) -> dict[str, str]:
        return {k: v for k, v in self.config.items() if k in claves}

    def guardar_config(self, valores: dict[str, str]) -> None:
        self.config.update(valores)
