"""Configuración del sistema (solo COORDINADOR): pantalla, parámetros, semáforo, SLA, automatizaciones,
cierre de mes y log de auditoría.

Reemplaza ``src/app/(app)/configuracion/page.tsx`` (carga con service_role) y las API Routes
``/api/configuracion/{sla,semaforo,parametros,cierre-mes,log,automatizaciones,automatizaciones/feed}``.
``checkCoordinador`` + ``insertAuditLog`` de ``src/lib/configuracion/admin.ts`` quedan en
``coordinador()`` y ``registrar_auditoria()``.
"""

from __future__ import annotations

import logging
import math
from datetime import UTC, datetime, time, timedelta
from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import AppUnitOfWork, UnitOfWorkFactory
from application.use_cases.common import (
    hoy_cr,
    parse_optional_date,
    parse_uuid,
    require_coordinador,
    require_usuario,
)
from domain.entities.configuracion import (
    CLAVES_PARAMETROS,
    CLAVES_PARAMETROS_PANTALLA,
    CLAVES_SEMAFORO,
    DEFAULTS_AUTOMATIZACIONES,
    DEFAULTS_SEMAFORO,
    FEED_DIAS_DEFAULT,
    FEED_LIMIT,
    LOG_PAGE_SIZE,
    PREFIJO_SLA,
    REGLAS,
    calcular_ejecuciones,
    find_regla,
)
from domain.entities.usuario import Usuario
from domain.exceptions import ValidationError

_logger = logging.getLogger(__name__)


# ── helpers compartidos por los casos de uso de Configuración ─────────────
def coordinador(uow: AppUnitOfWork, principal: Principal) -> Usuario:
    """``checkCoordinador()``: perfil activo con rol COORDINADOR real (sin "Ver como")."""
    return require_coordinador(require_usuario(uow, principal))


def registrar_auditoria(uow: AppUnitOfWork, usuario: Usuario, **params: Any) -> None:
    """``insertAuditLog()``: un error de auditoría no interrumpe la operación principal."""
    try:
        uow.configuracion.insert_audit_log(realizado_por=usuario.email, **params)
    except Exception:  # la auditoría es best-effort, igual que en el origen
        _logger.warning("config_audit_log: no se pudo registrar", extra={"tabla": params.get("tabla")})


def es_numero(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def es_entero(value: Any) -> bool:
    return es_numero(value) and float(value).is_integer()


def valor_texto(value: Any) -> str:
    """``String(v)`` de JS para los valores de config_sistema."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return "null" if value is None else str(value)


def _redondeo_js(value: Any) -> int:
    return math.floor(float(value) + 0.5)


def armar_reglas(config: dict[str, str], resumen: dict[str, Any]) -> list[dict[str, Any]]:
    """``obtenerAutomatizacionesData``: registro + estado (config_sistema) + disparos 7d + corridas."""
    reglas = []
    for regla in REGLAS:
        activa = True  # conciliacion_promesas: siempre activa, no tiene toggle
        if regla.config_key:
            activa = config.get(regla.config_key, DEFAULTS_AUTOMATIZACIONES[regla.config_key]) == "true"
        reglas.append(
            {
                **regla.to_dict(),
                "activa": activa,
                "disparos_7d": int((resumen or {}).get(regla.id) or 0),
                **calcular_ejecuciones(regla.cron),
            }
        )
    return reglas


def _mes_cierre_sugerido() -> dict[str, int]:
    hoy = hoy_cr()
    return {"anio": hoy.year - 1, "mes": 12} if hoy.month == 1 else {"anio": hoy.year, "mes": hoy.month - 1}


class ConfiguracionBase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory


# ── pantalla completa ─────────────────────────────────────────────────────
class GetConfiguracionPantallaUseCase(ConfiguracionBase):
    """Todo lo que cargaba ``configuracion/page.tsx`` en su Promise.all, ya procesado."""

    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            coordinador(uow, principal)
            repo = uow.configuracion
            vendedores_rows = repo.list_vendedores(solo_activos=False)
            supervisores_rows = repo.list_supervisores()
            usuarios = repo.list_usuarios()
            config_rows = repo.list_config()
            directorio = repo.list_directorio(area=None, q=None)
            logs, logs_total = repo.list_audit_log(
                tabla=None, desde=None, hasta=None, limit=LOG_PAGE_SIZE, offset=0
            )
            grupos = repo.list_grupos()
            miembros = repo.list_miembros()
            clientes = repo.contar_clientes_por_vendedor()
            ventas = repo.list_ventas_mensuales(24)
            eventos = repo.list_automatizaciones_feed(
                desde=datetime.now(UTC) - timedelta(days=FEED_DIAS_DEFAULT),
                regla_id=None,
                limit=FEED_LIMIT,
                con_usuario=False,
            )
            reglas = self._reglas(uow, config_rows)

        sup_nombre = {s["cod"]: s["nombre"] for s in supervisores_rows}
        vendedores = [
            {
                **v,
                "supervisor_nombre": sup_nombre.get(v["supervisor_cod"]) if v.get("supervisor_cod") else None,
                "n_clientes": clientes.get(v["cod"], 0),
            }
            for v in vendedores_rows
        ]
        cuenta_vend: dict[str, int] = {}
        for v in vendedores:
            if v["activo"] and v.get("supervisor_cod"):
                cuenta_vend[v["supervisor_cod"]] = cuenta_vend.get(v["supervisor_cod"], 0) + 1
        supervisores = [{**s, "n_vendedores": cuenta_vend.get(s["cod"], 0)} for s in supervisores_rows]
        analistas = [
            {"nombre": u["nombre"], "email": u["email"], "iniciales": u["iniciales"], "color": u["color"]}
            for u in usuarios
            if u["activo"]
        ]
        semaforo = dict(DEFAULTS_SEMAFORO)
        semaforo.update({r["clave"]: r["valor"] for r in config_rows if r["clave"] in CLAVES_SEMAFORO})
        nombre_vendedor = {v["cod"]: v["nombre"] for v in vendedores}
        rutas = [
            {
                "principal_cod": g["principal_cod"],
                "principal_nombre": nombre_vendedor.get(g["principal_cod"], g["principal_cod"]),
                "nombre_ruta": g["nombre_ruta"],
                "rol_funcional": g["rol_funcional"],
                "activo": g["activo"],
                "miembros": [
                    {
                        "cod": m["vendedor_cod"],
                        "nombre": nombre_vendedor.get(m["vendedor_cod"], m["vendedor_cod"]),
                        "activo": m["activo"],
                    }
                    for m in miembros
                    if m["principal_cod"] == g["principal_cod"]
                ],
            }
            for g in grupos
        ]
        return {
            "vendedores": vendedores,
            "analistas": analistas,
            "supervisores": supervisores,
            "usuarios": usuarios,
            "parametros": [r for r in config_rows if r["clave"] in CLAVES_PARAMETROS_PANTALLA],
            "semaforo": semaforo,
            "slaOverrides": {
                r["clave"]: r["valor"] for r in config_rows if r["clave"].startswith(PREFIJO_SLA)
            },
            "directorio": directorio,
            "logs": logs,
            "logsTotal": logs_total,
            "rutas": rutas,
            "automatizaciones": {"reglas": reglas, "eventos": eventos},
            "ventasMensuales": ventas,
            "mesCierreSugerido": _mes_cierre_sugerido(),
        }

    @staticmethod
    def _reglas(uow: AppUnitOfWork, config_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        # Igual que el origen: si falla el resumen, el tab queda vacío sin tumbar los otros tabs.
        try:
            resumen = uow.configuracion.automatizaciones_resumen()
        except Exception:
            _logger.exception("[configuracion] fn_automatizaciones_resumen falló")
            return []
        return armar_reglas({r["clave"]: r["valor"] for r in config_rows}, resumen)


# ── parámetros / semáforo / SLA ───────────────────────────────────────────
class GetParametrosUseCase(ConfiguracionBase):
    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            coordinador(uow, principal)
            return {"data": uow.configuracion.list_config(claves=CLAVES_PARAMETROS)}


class UpdateParametroUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            clave = body.get("clave")
            if clave not in CLAVES_PARAMETROS:
                raise ValidationError(f"Clave no permitida: {valor_texto(clave)}")
            if body.get("valor") is None:
                raise ValidationError("valor es requerido")
            valor = valor_texto(body["valor"])
            anterior = uow.configuracion.get_config_valor(clave)
            filas = uow.configuracion.upsert_config({clave: valor})
            registrar_auditoria(
                uow,
                usuario,
                tabla="config_sistema",
                accion="UPDATE",
                descripcion=f"Parámetro {clave} actualizado: {valor_texto(anterior)} → {valor}",
                valor_anterior={"clave": clave, "valor": anterior},
                valor_nuevo={"clave": clave, "valor": body["valor"]},
            )
            uow.commit()
        return {"data": filas[0] if filas else None}


class GetSemaforoUseCase(ConfiguracionBase):
    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            coordinador(uow, principal)
            filas = uow.configuracion.list_config(claves=CLAVES_SEMAFORO)
        result = dict(DEFAULTS_SEMAFORO)
        result.update({r["clave"]: r["valor"] for r in filas})
        return {"data": result}


class UpdateSemaforoUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            invalidas = [k for k in body if k not in CLAVES_SEMAFORO]
            if invalidas:
                raise ValidationError(f"Claves no permitidas: {', '.join(invalidas)}")
            uow.configuracion.upsert_config({k: valor_texto(v) for k, v in body.items()})
            registrar_auditoria(
                uow,
                usuario,
                tabla="config_sistema",
                accion="UPDATE",
                descripcion="Reglas del semáforo de riesgo actualizadas",
                valor_nuevo=body,
            )
            uow.commit()
        return {"ok": True}


class GetSlaUseCase(ConfiguracionBase):
    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            coordinador(uow, principal)
            filas = uow.configuracion.list_config(prefijo=PREFIJO_SLA)
        return {"data": {r["clave"]: r["valor"] for r in filas}}


class UpdateSlaUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            claves = list(body)
            if not claves:
                raise ValidationError("Body vacío")
            invalidas = [k for k in claves if not k.startswith(PREFIJO_SLA)]
            if invalidas:
                raise ValidationError(
                    f"Claves no permitidas (deben comenzar con sla_): {', '.join(invalidas)}"
                )
            uow.configuracion.upsert_config({k: valor_texto(v) for k, v in body.items()})
            registrar_auditoria(
                uow,
                usuario,
                tabla="config_sistema",
                accion="UPDATE",
                descripcion=f"SLAs actualizados: {', '.join(claves)}",
                valor_nuevo=body,
            )
            uow.commit()
        return {"ok": True}


# ── automatizaciones ──────────────────────────────────────────────────────
class GetAutomatizacionesUseCase(ConfiguracionBase):
    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            coordinador(uow, principal)
            filas = uow.configuracion.list_config(claves=tuple(DEFAULTS_AUTOMATIZACIONES))
            resumen = uow.configuracion.automatizaciones_resumen()
        return {"data": armar_reglas({r["clave"]: r["valor"] for r in filas}, resumen)}


class ToggleAutomatizacionUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            regla_id, activa = body.get("id"), body.get("activa")
            if not regla_id or not isinstance(activa, bool):
                raise ValidationError("id y activa (boolean) son requeridos")
            regla = find_regla(str(regla_id))
            if regla is None:
                raise ValidationError(f"Regla no reconocida: {regla_id}")
            if not regla.toggleable or not regla.config_key:
                raise ValidationError(
                    "Esta regla no se puede desactivar: es housekeeping automático del sistema"
                )
            anterior = uow.configuracion.get_config_valor(regla.config_key)
            uow.configuracion.upsert_config({regla.config_key: valor_texto(activa)})
            registrar_auditoria(
                uow,
                usuario,
                tabla="config_sistema",
                accion="UPDATE",
                descripcion=f'Automatización "{regla.nombre}" {"activada" if activa else "desactivada"}',
                valor_anterior={"clave": regla.config_key, "valor": anterior},
                valor_nuevo={"clave": regla.config_key, "valor": valor_texto(activa)},
            )
            uow.commit()
        return {"data": {"id": regla.id, "activa": activa}}


class ListAutomatizacionesFeedUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, regla: str | None, dias_raw: str | None) -> dict[str, Any]:
        dias: float = FEED_DIAS_DEFAULT
        try:
            candidato = float(dias_raw if dias_raw is not None else FEED_DIAS_DEFAULT)
            if math.isfinite(candidato) and 0 < candidato <= 3650:
                dias = candidato
        except ValueError:
            dias = FEED_DIAS_DEFAULT
        with self._uow_factory(principal) as uow:
            coordinador(uow, principal)
            eventos = uow.configuracion.list_automatizaciones_feed(
                desde=datetime.now(UTC) - timedelta(days=dias),
                regla_id=regla or None,
                limit=FEED_LIMIT,
                con_usuario=True,
            )
        return {"data": eventos, "mostrados": len(eventos), "truncado": len(eventos) == FEED_LIMIT}


class MarcarEventoLeidoUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, evento_id: str) -> dict[str, Any]:
        notificacion_id = parse_uuid(evento_id, "id")
        with self._uow_factory(principal) as uow:
            coordinador(uow, principal)
            uow.configuracion.marcar_notificacion_leida(notificacion_id)
            uow.commit()
        return {"ok": True}


# ── cierre de mes ─────────────────────────────────────────────────────────
class ListVentasMensualesUseCase(ConfiguracionBase):
    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            coordinador(uow, principal)
            return {"data": uow.configuracion.list_ventas_mensuales(24)}


class GuardarCierreMesUseCase(ConfiguracionBase):
    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        anio, mes, ventas = body.get("anio"), body.get("mes"), body.get("total_ventas_sin_iva")
        cartera = body.get("cartera_total_mes")
        with self._uow_factory(principal) as uow:
            usuario = coordinador(uow, principal)
            if not es_entero(anio) or not 2020 <= anio <= 2100:
                raise ValidationError("Año inválido")
            if not es_entero(mes) or not 1 <= mes <= 12:
                raise ValidationError("Mes inválido")
            if not es_numero(ventas) or ventas <= 0:
                raise ValidationError("Ventas sin IVA debe ser un monto mayor a 0")
            if cartera is not None and (not es_numero(cartera) or cartera <= 0):
                raise ValidationError("Cartera Total del corte debe ser un monto mayor a 0 (o dejarse vacío)")
            anio, mes = int(anio), int(mes)
            hoy = hoy_cr()
            if anio > hoy.year or (anio == hoy.year and mes >= hoy.month):
                raise ValidationError("No se puede cargar un mes que aún no ha cerrado")
            anterior = uow.configuracion.get_venta_mensual(anio, mes)
            fila = uow.configuracion.upsert_venta_mensual(anio, mes, ventas, cartera)
            descripcion = (
                f"Ventas {mes}/{anio} actualizadas: ₡{_redondeo_js(anterior['total_ventas_sin_iva'])} → "
                f"₡{_redondeo_js(ventas)}"
                if anterior
                else f"Ventas {mes}/{anio} cargadas: ₡{_redondeo_js(ventas)}"
            )
            registrar_auditoria(
                uow,
                usuario,
                tabla="ventas_mensuales",
                accion="UPDATE" if anterior else "INSERT",
                descripcion=descripcion,
                valor_anterior=anterior,
                valor_nuevo={
                    "anio": anio,
                    "mes": mes,
                    "total_ventas_sin_iva": ventas,
                    "cartera_total_mes": cartera,
                },
            )
            uow.commit()
        return {"data": fila}


# ── log de auditoría ──────────────────────────────────────────────────────
class ListAuditLogUseCase(ConfiguracionBase):
    """``format=csv`` devuelve todas las filas (sin paginar); el navegador arma el CSV."""

    def execute(
        self,
        principal: Principal,
        *,
        tabla: str | None,
        desde: str | None,
        hasta: str | None,
        page: int | None,
        formato: str | None,
    ) -> dict[str, Any]:
        pagina = max(1, page or 1)
        completo = formato == "csv"
        desde_d = parse_optional_date(desde, "desde")
        hasta_d = parse_optional_date(hasta, "hasta")
        with self._uow_factory(principal) as uow:
            coordinador(uow, principal)
            filas, total = uow.configuracion.list_audit_log(
                tabla=tabla or None,
                desde=datetime.combine(desde_d, time.min, UTC) if desde_d else None,
                hasta=datetime.combine(hasta_d, time(23, 59, 59), UTC) if hasta_d else None,
                limit=None if completo else LOG_PAGE_SIZE,
                offset=0 if completo else (pagina - 1) * LOG_PAGE_SIZE,
            )
        return {"data": filas, "total": total, "page": pagina, "pageSize": LOG_PAGE_SIZE}
