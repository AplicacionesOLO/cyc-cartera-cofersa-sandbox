"""Integraciones del topbar y del Centro de Recursos: tipo de cambio (BCCR) y APIs públicas de Hacienda.

Reemplazan ``/api/tipo-cambio``, ``/api/hacienda`` y ``/api/hacienda/cabys``. Igual que en el origen,
nunca fallan por un problema del proveedor externo: devuelven 200 con ``error: true`` (o el último tipo
de cambio válido guardado en config_sistema) y el front decide qué mostrar.
"""

from __future__ import annotations

import logging
import re
from datetime import timedelta
from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.ports.integraciones import ExternalHttp, IntegrationConfig
from application.use_cases.common import ahora_cr, require_email
from domain.exceptions import ValidationError

_logger = logging.getLogger("integraciones")

MESES = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)
CLAVE_COMPRA = "tipo_cambio_compra"
CLAVE_VENTA = "tipo_cambio_venta"
CLAVE_FECHA = "tipo_cambio_fecha"
BCCR_BASE = "https://apim.bccr.fi.cr/SDDE/api/Bccr.Ge.SDDE.Publico.Indicadores.API/indicadoresEconomicos"
INDICADOR_COMPRA = 317
INDICADOR_VENTA = 318
HACIENDA_BASE = "https://api.hacienda.go.cr/fe"
# Algunos endpoints de api.hacienda.go.cr filtran tráfico sin un User-Agent de navegador.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)
TIMEOUT_SEGUNDOS = 8
SIN_DATOS = {"compra": None, "venta": None, "fecha": None, "error": True}
_FECHA_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
_CEDULA = re.compile(r"^\d{9,12}$")
_CODIGO_CABYS = re.compile(r"^\d{8,13}$")


class ProveedorExternoError(Exception):
    """Respuesta inválida o sin datos de un proveedor externo (se resuelve con el respaldo)."""


def fecha_legible(iso: str | None) -> str | None:
    """'YYYY-MM-DD...' → '3 de junio de 2026' sin corrimiento de zona horaria."""
    match = _FECHA_ISO.match(iso or "")
    if not match:
        return None
    year, month, day = match.groups()
    idx = int(month) - 1
    if idx < 0 or idx > 11:
        return None
    return f"{int(day)} de {MESES[idx]} de {year}"


class GetTipoCambioUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory, http: ExternalHttp, config: IntegrationConfig) -> None:
        self._uow_factory = uow_factory
        self._http = http
        self._config = config

    def execute(self, principal: Principal | None) -> dict[str, Any]:
        try:
            resultado = self._consultar_bccr()
        except Exception as error:  # noqa: BLE001 - cualquier fallo del BCCR usa el respaldo
            _logger.warning("tipo_cambio_bccr_fallo", extra={"error": str(error)})
            return self._respaldo(principal)
        self._guardar(principal, resultado)
        return {**resultado, "error": False}

    def _consultar_bccr(self) -> dict[str, Any]:
        token = self._config.get("bccr_token")
        if not token:
            raise ProveedorExternoError("bccr_token no configurado")
        hoy = ahora_cr()
        desde = (hoy - timedelta(days=6)).strftime("%Y/%m/%d")  # cubre feriados/fines de semana
        hasta = hoy.strftime("%Y/%m/%d")
        compra = self._indicador(INDICADOR_COMPRA, desde, hasta, token)
        venta = self._indicador(INDICADOR_VENTA, desde, hasta, token)
        return {
            "compra": compra["valorDatoPorPeriodo"],
            "venta": venta["valorDatoPorPeriodo"],
            "fecha": fecha_legible(venta.get("fecha")),
        }

    def _indicador(self, codigo: int, desde: str, hasta: str, token: str) -> dict[str, Any]:
        status, body = self._http.get_json(
            f"{BCCR_BASE}/{codigo}/series",
            params={"fechaInicio": desde, "fechaFin": hasta, "idioma": "ES"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT_SEGUNDOS,
        )
        if status != 200:
            raise ProveedorExternoError(f"BCCR indicador {codigo}: status {status}")
        datos = (body or {}).get("datos") if isinstance(body, dict) else None
        serie = (datos[0] or {}).get("series") if isinstance(datos, list) and datos else None
        if not serie:
            raise ProveedorExternoError(f"BCCR indicador {codigo}: sin datos en el rango")
        return serie[-1]

    def _guardar(self, principal: Principal | None, resultado: dict[str, Any]) -> None:
        valores = {
            CLAVE_COMPRA: str(resultado["compra"]),
            CLAVE_VENTA: str(resultado["venta"]),
            CLAVE_FECHA: resultado["fecha"] or "",
        }
        try:
            with self._uow_factory(principal) as uow:
                uow.notificaciones.guardar_config(valores)
                uow.commit()
        except Exception as error:  # noqa: BLE001 - igual que el origen, el respaldo es best effort
            _logger.warning("tipo_cambio_cache_no_guardado", extra={"error": str(error)})

    def _respaldo(self, principal: Principal | None) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            cache = uow.notificaciones.leer_config((CLAVE_COMPRA, CLAVE_VENTA, CLAVE_FECHA))
        try:
            compra = float(cache.get(CLAVE_COMPRA, ""))
            venta = float(cache.get(CLAVE_VENTA, ""))
        except ValueError:
            return dict(SIN_DATOS)
        return {"compra": compra, "venta": venta, "fecha": cache.get(CLAVE_FECHA) or None, "error": False}


class ConsultarHaciendaUseCase:
    """Estado tributario de un contribuyente (GET /fe/ae)."""

    def __init__(self, http: ExternalHttp) -> None:
        self._http = http

    def execute(self, principal: Principal, identificacion: str | None) -> dict[str, Any]:
        require_email(principal)
        cedula = (identificacion or "").strip()
        if not _CEDULA.match(cedula):
            raise ValidationError("Cédula inválida — debe tener entre 9 y 12 dígitos")
        try:
            status, data = self._http.get_json(
                f"{HACIENDA_BASE}/ae",
                params={"identificacion": cedula},
                headers={"User-Agent": USER_AGENT},
                timeout=TIMEOUT_SEGUNDOS,
            )
            if status == 404:
                return {"data": None, "notFound": True, "error": False}
            if status != 200:
                raise ProveedorExternoError(f"status {status}")
            if not isinstance(data, dict) or not data.get("nombre"):
                raise ProveedorExternoError("respuesta sin nombre/razón social")
            return {"data": data, "notFound": False, "error": False}
        except Exception as error:  # noqa: BLE001 - se informa como error de conexión normal
            _logger.error("hacienda_ae_fallo", extra={"error": str(error)})
            return {"data": None, "notFound": False, "error": True}


class BuscarCabysUseCase:
    """Catálogo CABYS: ``codigo`` para 8-13 dígitos, ``q`` para texto libre. Máximo 15 resultados."""

    def __init__(self, http: ExternalHttp) -> None:
        self._http = http

    def execute(self, principal: Principal, q: str | None) -> dict[str, Any]:
        require_email(principal)
        termino = (q or "").strip()
        if not termino:
            raise ValidationError("Término de búsqueda requerido")
        param = "codigo" if _CODIGO_CABYS.match(termino) else "q"
        try:
            status, body = self._http.get_json(
                f"{HACIENDA_BASE}/cabys",
                params={param: termino},
                headers={"User-Agent": USER_AGENT},
                timeout=TIMEOUT_SEGUNDOS,
            )
            if status != 200:
                raise ProveedorExternoError(f"status {status}")
            items = body if isinstance(body, list) else ((body or {}).get("cabys") or [])
            data = [
                {
                    "codigo": it.get("codigo"),
                    "descripcion": it.get("descripcion"),
                    "impuesto": it.get("impuesto"),
                }
                for it in items[:15]
            ]
            return {"data": data, "error": False}
        except Exception as error:  # noqa: BLE001 - se informa como error de conexión normal
            _logger.error("hacienda_cabys_fallo", extra={"error": str(error)})
            return {"data": [], "error": True}
