"""Ingesta máquina a máquina (N8N / Google Apps Script) → ``POST /ingesta/{tabla}``.

Reemplaza la escritura DIRECTA en el origen (PostgREST con service_role):
- N8N: ``pagos_stage`` y ``pedidos_retenidos_stage`` (los procesa ``fn_sync_*`` del :05) y
  ``cartera`` / ``facturas`` / ``saldos_favor`` (escritura directa; ``fn_sync_*`` solo cuenta).
- GAS: ``maestro_clientes`` (upsert diario por ``cliente_cod``).

Cuerpo: ``{modo, lote, total_lotes, sync_id?, purgar_anteriores?, filas: [...]}``. Cada lote es una
transacción. ``reemplazar`` vacía la tabla en el lote 1 (luego INSERT). ``actualizar`` es el upsert por la
clave natural (``ON CONFLICT``), y con ``purgar_anteriores`` en el último lote borra las filas de otros
``sync_id`` (snapshot completo sin perder columnas editadas en el SIC).
"""

from __future__ import annotations

import hmac
from typing import Any

from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.ports.integraciones import IntegrationConfig
from domain.entities.jobs import (
    MAX_FILAS_POR_LOTE,
    MODO_ACTUALIZAR,
    MODO_REEMPLAZAR,
    TABLAS_INGESTA,
    LoteIngesta,
    TablaIngesta,
)
from domain.exceptions import NotFoundError, UnauthorizedError, ValidationError

INGESTA_KEY_SECRET = "ingesta_api_key"
MSG_CLAVE_INVALIDA = "Clave de ingesta inválida."
_ESCALARES = (str, int, float, bool, type(None))


def verificar_clave_ingesta(config: IntegrationConfig, provista: str | None) -> None:
    """Compara en tiempo constante el header ``x-ingesta-key`` con el secreto. Sin secreto: rechaza."""
    esperada = config.get(INGESTA_KEY_SECRET)
    if not esperada or not provista:
        raise UnauthorizedError(MSG_CLAVE_INVALIDA, code="ingesta_no_autorizada")
    if not hmac.compare_digest(provista.encode("utf-8"), esperada.encode("utf-8")):
        raise UnauthorizedError(MSG_CLAVE_INVALIDA, code="ingesta_no_autorizada")


def _entero_positivo(raw: Any, campo: str) -> int:
    if isinstance(raw, bool) or not isinstance(raw, int) or raw < 1:
        raise ValidationError(f"'{campo}' debe ser un entero >= 1.", details={"field": campo})
    return raw


def _valor(raw: Any, tabla: TablaIngesta, columna: str) -> Any:
    if not isinstance(raw, _ESCALARES):
        raise ValidationError(
            f"La columna '{columna}' debe traer un valor simple (texto, número, booleano o null).",
            details={"columna": columna},
        )
    if tabla.solo_texto and raw is not None and not isinstance(raw, str):
        return ("true" if raw else "false") if isinstance(raw, bool) else str(raw)
    return raw


def _columnas(tabla: TablaIngesta, filas: list[Any]) -> tuple[str, ...]:
    if not filas:
        return ()
    if not all(isinstance(fila, dict) for fila in filas):
        raise ValidationError("Cada fila debe ser un objeto JSON.")
    claves = set(filas[0])
    if any(set(fila) != claves for fila in filas):
        raise ValidationError("Todas las filas del lote deben traer las mismas columnas.")
    no_permitidas = sorted(claves - set(tabla.columnas))
    if no_permitidas:
        raise ValidationError(
            f"Columnas no permitidas para {tabla.nombre}: {', '.join(no_permitidas)}",
            details={"columnas_no_permitidas": no_permitidas},
        )
    return tuple(c for c in tabla.columnas if c in claves)


def parse_lote(tabla_nombre: str, body: dict[str, Any]) -> LoteIngesta:
    tabla = TABLAS_INGESTA.get(tabla_nombre)
    if tabla is None:
        raise NotFoundError(f"Tabla de ingesta no permitida: {tabla_nombre}")
    modo = body.get("modo")
    if modo not in tabla.modos:
        raise ValidationError(
            f"Modo no permitido para {tabla.nombre}: {modo}. Permitidos: {', '.join(sorted(tabla.modos))}",
            details={"modo": modo},
        )
    lote = _entero_positivo(body.get("lote", 1), "lote")
    total_lotes = _entero_positivo(body.get("total_lotes", 1), "total_lotes")
    if lote > total_lotes:
        raise ValidationError("'lote' no puede ser mayor que 'total_lotes'.")
    filas = body.get("filas")
    if not isinstance(filas, list):
        raise ValidationError("'filas' debe ser una lista.")
    if len(filas) > MAX_FILAS_POR_LOTE:
        raise ValidationError(f"Máximo {MAX_FILAS_POR_LOTE} filas por lote.")
    sync_id = body.get("sync_id")
    if sync_id is not None and (not isinstance(sync_id, str) or not sync_id.strip()):
        raise ValidationError("'sync_id' debe ser texto.")
    columnas = _columnas(tabla, filas)
    agregar_sync = bool(sync_id) and tabla.tiene_sync_id and bool(columnas) and "sync_id" not in columnas
    if modo == MODO_ACTUALIZAR and columnas and not set(tabla.clave) <= set(columnas):
        raise ValidationError(
            f"El modo actualizar requiere las columnas clave: {', '.join(tabla.clave)}",
            details={"clave": list(tabla.clave)},
        )
    purgar = body.get("purgar_anteriores") is True
    if purgar and (modo != MODO_ACTUALIZAR or not sync_id or not tabla.tiene_sync_id):
        raise ValidationError(
            "'purgar_anteriores' requiere modo actualizar y sync_id en una tabla con sync_id."
        )
    valores = tuple(
        tuple(_valor(fila[c], tabla, c) for c in columnas) + ((sync_id,) if agregar_sync else ())
        for fila in filas
    )
    return LoteIngesta(
        tabla=tabla,
        modo=modo,
        lote=lote,
        total_lotes=total_lotes,
        columnas=columnas + (("sync_id",) if agregar_sync else ()),
        filas=valores,
        sync_id=sync_id,
        purgar_anteriores=purgar,
    )


class IngestarLoteUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory, config: IntegrationConfig) -> None:
        self._uow_factory = uow_factory
        self._config = config

    def execute(self, clave: str | None, tabla: str, body: dict[str, Any]) -> dict[str, Any]:
        verificar_clave_ingesta(self._config, clave)
        lote = parse_lote(tabla, body)
        nombre = lote.tabla.nombre
        eliminados = insertados = purgados = 0
        with self._uow_factory(None) as uow:  # service_role, como N8N/GAS contra PostgREST
            if lote.modo == MODO_REEMPLAZAR and lote.es_primero:
                eliminados = uow.jobs.vaciar_tabla(nombre)
            if lote.filas:
                if lote.modo == MODO_ACTUALIZAR:
                    insertados = uow.jobs.upsert_filas(
                        nombre,
                        lote.columnas,
                        lote.filas,
                        lote.tabla.clave,
                        tocar_updated_at=lote.tabla.tiene_updated_at,
                    )
                else:
                    insertados = uow.jobs.insertar_filas(nombre, lote.columnas, lote.filas)
            if lote.purgar_anteriores and lote.es_ultimo and lote.sync_id:
                purgados = uow.jobs.purgar_otros_sync(nombre, lote.sync_id)
            uow.commit()
        return {
            "ok": True,
            "tabla": nombre,
            "modo": lote.modo,
            "lote": lote.lote,
            "total_lotes": lote.total_lotes,
            "recibidas": len(lote.filas),
            "insertados": insertados,
            "eliminados": eliminados,
            "purgados": purgados,
        }
