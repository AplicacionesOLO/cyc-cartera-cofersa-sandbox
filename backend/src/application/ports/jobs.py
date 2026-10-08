"""Port del módulo jobs: tareas programadas, sincronizaciones (tbl_sync_log) e ingesta externa."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from datetime import datetime
from typing import Any


class JobsRepository(ABC):
    # ── tareas programadas (ex pg_cron) ──
    @abstractmethod
    def ejecutar_tarea(self, tarea: str) -> Any:
        """Ejecuta la función SQL de la tarea (``TAREAS_PROGRAMADAS``) y devuelve su resultado."""

    # ── sincronizaciones ──
    @abstractmethod
    def ejecutar_sync(self, tipo: str, ejecutado_por: str) -> Any:
        """``fn_sync_<tipo>(p_ejecutado_por)``: procesa/cuenta y registra en sync_log (jsonb)."""

    @abstractmethod
    def historial_sync(self, limite: int) -> list[dict[str, Any]]:
        """Filas de sync_log, más recientes primero."""

    @abstractmethod
    def ultimo_sync(self, tipo: str, desde: datetime | None) -> dict[str, Any] | None:
        """Última fila de sync_log del tipo (opcionalmente ejecutada desde ``desde``)."""

    # ── ingesta (N8N / GAS) ──
    @abstractmethod
    def vaciar_tabla(self, tabla: str) -> int:
        """DELETE de toda la tabla destino. Devuelve filas eliminadas."""

    @abstractmethod
    def insertar_filas(self, tabla: str, columnas: Sequence[str], filas: Sequence[Sequence[Any]]) -> int: ...

    @abstractmethod
    def upsert_filas(
        self,
        tabla: str,
        columnas: Sequence[str],
        filas: Sequence[Sequence[Any]],
        clave: Sequence[str],
        *,
        tocar_updated_at: bool,
    ) -> int:
        """INSERT ... ON CONFLICT (clave) DO UPDATE de las columnas recibidas."""

    @abstractmethod
    def purgar_otros_sync(self, tabla: str, sync_id: str) -> int:
        """DELETE de las filas cuyo sync_id no es el del ciclo actual (snapshot completo)."""
