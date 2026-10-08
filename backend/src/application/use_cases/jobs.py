"""Tareas programadas (ex pg_cron) y sincronización manual de Configuración → Sincronización.

- ``EjecutarTareaProgramadaUseCase``: lo invoca cada Lambda programada de EventBridge Scheduler
  (service_role, ``uow_factory(None)``), igual que ``SELECT public.fn_x()`` del cron original.
- ``SincronizarTablaUseCase``: ``POST /api/sync/{cartera,facturas,saldos_favor}`` (síncrono).
- ``EncolarSyncManualUseCase`` + ``ProcesarSyncManualUseCase``: ``POST /api/sync/{pagos,pedidos-retenidos}``
  llamaba a N8N y esperaba 12 s + hasta 30 s (> 29 s de API Gateway) → ahora se encola en SQS (202) y el
  worker hace la misma secuencia; la UI consulta ``GET /sync/estado``.
- ``ListarHistorialSyncUseCase`` / ``ObtenerEstadoSyncUseCase``: lectura de sync_log (antes
  ``consultas a sync_log`` con RLS ``sync_log_select_usuarios_activos``).
"""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.ports.integraciones import ExternalHttp, IntegrationConfig
from application.ports.message_queue import MessageQueue
from application.use_cases.common import require_coordinador, require_usuario
from domain.entities.jobs import (
    HISTORIAL_LIMITE,
    N8N_ESPERA_S,
    N8N_TIMEOUT_S,
    N8N_WEBHOOK_FALLBACK,
    N8N_WEBHOOK_KEYS,
    SYNC_ASINCRONOS,
    SYNC_SINCRONOS,
    SYNC_TIPOS,
    TAREAS_PROGRAMADAS,
)
from domain.exceptions import ValidationError

MSG_ACCESO_DENEGADO = "Acceso denegado"
EJECUTOR_CRON = "pg_cron"  # el front lo muestra como "Automático"


def _tipo_valido(tipo: str | None, permitidos: frozenset[str] | tuple[str, ...]) -> str:
    if tipo not in permitidos:
        raise ValidationError("Tipo de sincronización inválido.", details={"tipo": tipo})
    return str(tipo)


def _parse_desde(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValidationError("'desde' no es una fecha válida.") from error
    return value if value.tzinfo else value.replace(tzinfo=UTC)


class EjecutarTareaProgramadaUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, tarea: str) -> dict[str, Any]:
        if tarea not in TAREAS_PROGRAMADAS:
            raise ValidationError(f"Tarea programada desconocida: {tarea}")
        with self._uow_factory(None) as uow:
            resultado = uow.jobs.ejecutar_tarea(tarea)
            uow.commit()
        return {"tarea": tarea, "resultado": resultado}


class ConciliarPromesasManualUseCase:
    """Reemplaza la Edge Function ``mark-promesas-incumplidas`` (invocable por HTTP): ejecuta a pedido la
    misma conciliación nocturna (``fn_conciliar_promesas``). Solo COORDINADOR."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            require_coordinador(require_usuario(uow, principal), MSG_ACCESO_DENEGADO)
        return {"ok": True, **EjecutarTareaProgramadaUseCase(self._uow_factory).execute("conciliar_promesas")}


class SincronizarTablaUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, tipo: str) -> dict[str, Any]:
        tipo = _tipo_valido(tipo, SYNC_SINCRONOS)
        with self._uow_factory(principal) as uow:
            usuario = require_coordinador(require_usuario(uow, principal), MSG_ACCESO_DENEGADO)
        with self._uow_factory(None) as uow:  # el original usaba el cliente service_role
            resultado = uow.jobs.ejecutar_sync(tipo, usuario.email)
            uow.commit()
        return {"ok": True, "resultado": resultado}


class EncolarSyncManualUseCase:
    def __init__(
        self, uow_factory: UnitOfWorkFactory, queue: MessageQueue, config: IntegrationConfig
    ) -> None:
        self._uow_factory = uow_factory
        self._queue = queue
        self._config = config

    def execute(self, principal: Principal, tipo: str) -> dict[str, Any]:
        tipo = _tipo_valido(tipo, SYNC_ASINCRONOS)
        with self._uow_factory(principal) as uow:
            usuario = require_coordinador(require_usuario(uow, principal), MSG_ACCESO_DENEGADO)
        solicitado_en = datetime.now(UTC).isoformat()
        self._queue.send({"tipo": tipo, "ejecutado_por": usuario.email, "solicitado_en": solicitado_en})
        return {
            "ok": True,
            "encolado": True,
            "tipo": tipo,
            "solicitado_en": solicitado_en,
            "n8n_configurado": bool(n8n_webhook_url(self._config, tipo)),
        }


def n8n_webhook_url(config: IntegrationConfig, tipo: str) -> str:
    return config.get(N8N_WEBHOOK_KEYS[tipo]) or N8N_WEBHOOK_FALLBACK[tipo]


class ProcesarSyncManualUseCase:
    """Worker SQS: misma secuencia que la API Route original (N8N → espera 12 s → fn_sync_*)."""

    def __init__(
        self,
        uow_factory: UnitOfWorkFactory,
        http: ExternalHttp,
        config: IntegrationConfig,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._uow_factory = uow_factory
        self._http = http
        self._config = config
        self._sleep = sleep

    def execute(self, message: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(message, dict):
            raise ValidationError("Mensaje de sincronización inválido.")
        tipo = _tipo_valido(message.get("tipo"), SYNC_ASINCRONOS)
        ejecutado_por = str(message.get("ejecutado_por") or EJECUTOR_CRON)
        url = n8n_webhook_url(self._config, tipo)
        n8n_status: int | None = None
        if url:
            try:
                n8n_status, _ = self._http.get_text(url, timeout=N8N_TIMEOUT_S)
            except Exception:  # igual que el original: si N8N no responde se procesa lo que haya en stage
                n8n_status = None
            self._sleep(N8N_ESPERA_S)
        with self._uow_factory(None) as uow:
            resultado = uow.jobs.ejecutar_sync(tipo, ejecutado_por)
            uow.commit()
        return {"ok": True, "tipo": tipo, "n8n_status": n8n_status, "resultado": resultado}


class ListarHistorialSyncUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, limite: int | None = None) -> list[dict[str, Any]]:
        limite = min(max(limite or HISTORIAL_LIMITE, 1), HISTORIAL_LIMITE)
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
            return uow.jobs.historial_sync(limite)


class ObtenerEstadoSyncUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, tipo: str | None, desde: str | None) -> dict[str, Any]:
        tipo = _tipo_valido(tipo, SYNC_TIPOS)
        desde_dt = _parse_desde(desde)
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
            ultimo = uow.jobs.ultimo_sync(tipo, desde_dt)
        return {"tipo": tipo, "ultimo": ultimo, "completado": ultimo is not None}
