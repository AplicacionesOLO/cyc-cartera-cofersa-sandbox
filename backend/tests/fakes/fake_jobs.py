"""JobsRepository en memoria + cola fake para los tests unitarios del módulo jobs."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from application.ports.jobs import JobsRepository
from application.ports.message_queue import MessageQueue


class FakeJobsRepository(JobsRepository):
    def __init__(self) -> None:
        self.tareas: list[str] = []
        self.syncs: list[tuple[str, str]] = []
        self.sync_log: list[dict[str, Any]] = []
        self.tablas: dict[str, list[dict[str, Any]]] = {}
        self.upserts: list[tuple[str, tuple[str, ...]]] = []
        self.resultado_sync: dict[str, Any] = {"total_tabla": 10, "ultimo_registro": "2026-10-01"}

    def ejecutar_tarea(self, tarea: str) -> Any:
        self.tareas.append(tarea)
        return {"ok": True} if tarea == "conciliar_promesas" else None

    def ejecutar_sync(self, tipo: str, ejecutado_por: str) -> Any:
        self.syncs.append((tipo, ejecutado_por))
        self.sync_log.append(
            {
                "id": len(self.sync_log) + 1,
                "tipo": tipo,
                "ejecutado_en": datetime.now(UTC),
                "ejecutado_por": ejecutado_por,
                "total_tabla": 10,
                "error": None,
            }
        )
        return dict(self.resultado_sync)

    def historial_sync(self, limite: int) -> list[dict[str, Any]]:
        return sorted(self.sync_log, key=lambda r: r["ejecutado_en"], reverse=True)[:limite]

    def ultimo_sync(self, tipo: str, desde: datetime | None) -> dict[str, Any] | None:
        rows = [r for r in self.historial_sync(10_000) if r["tipo"] == tipo]
        rows = [r for r in rows if desde is None or r["ejecutado_en"] >= desde]
        return rows[0] if rows else None

    def vaciar_tabla(self, tabla: str) -> int:
        eliminadas = len(self.tablas.get(tabla, []))
        self.tablas[tabla] = []
        return eliminadas

    def insertar_filas(self, tabla: str, columnas: Sequence[str], filas: Sequence[Sequence[Any]]) -> int:
        self.tablas.setdefault(tabla, []).extend(dict(zip(columnas, fila, strict=True)) for fila in filas)
        return len(filas)

    def upsert_filas(self, tabla, columnas, filas, clave, *, tocar_updated_at):
        self.upserts.append((tabla, tuple(clave)))
        rows = self.tablas.setdefault(tabla, [])
        for fila in filas:
            nueva = dict(zip(columnas, fila, strict=True))
            existente = next((r for r in rows if all(r.get(k) == nueva[k] for k in clave)), None)
            if existente is None:
                rows.append(nueva)
            else:
                existente.update(nueva)
        return len(filas)

    def purgar_otros_sync(self, tabla: str, sync_id: str) -> int:
        rows = self.tablas.get(tabla, [])
        quedan = [r for r in rows if r.get("sync_id") == sync_id]
        self.tablas[tabla] = quedan
        return len(rows) - len(quedan)


class FakeMessageQueue(MessageQueue):
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    def send(self, body, *, group_id=None, deduplication_id=None) -> str:
        self.sent.append(body)
        return f"msg-{len(self.sent)}"
