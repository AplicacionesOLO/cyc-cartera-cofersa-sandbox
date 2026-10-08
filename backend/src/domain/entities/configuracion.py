"""Catálogos y reglas fijas del módulo Configuración (antes constantes de las API Routes).

- Claves de ``config_sistema`` editables por pantalla (semáforo, parámetros, SLA, automatizaciones).
- Áreas válidas del directorio y dominios permitidos para altas de usuarios.
- Registro de automatizaciones (``src/lib/automatizaciones/registry.ts``) y el cálculo de la
  última/próxima corrida programada a partir de la expresión pg_cron (``cron.ts``).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from domain.entities.usuario import ROLES

ROLES_VALIDOS = ROLES
DOMINIOS_PERMITIDOS = ("cofersa.cr", "mayoreo.biz")
COLOR_DEFAULT = "#009ee3"
TIPO_CANAL_DEFAULT = "Venta Regular"
CARGO_JEFE_REGIONAL_DEFAULT = "Jefe Regional"

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

AREAS_VALIDAS = (
    "Ventas",
    "Logística",
    "Crédito y Cobro",
    "Gerencia",
    "TI",
    "Compras",
    "Recursos Humanos",
    "Contabilidad",
    "Otro",
)

CLAVES_SEMAFORO = (
    "semaforo_rojo_mora_dias",
    "semaforo_rojo_sin_gestion_dias",
    "semaforo_ambar_mora_min",
    "semaforo_ambar_mora_max",
    "semaforo_ambar_promesa_dias",
    "semaforo_ambar_sin_gestion_dias",
)
DEFAULTS_SEMAFORO = {
    "semaforo_rojo_mora_dias": "60",
    "semaforo_rojo_sin_gestion_dias": "10",
    "semaforo_ambar_mora_min": "31",
    "semaforo_ambar_mora_max": "60",
    "semaforo_ambar_promesa_dias": "7",
    "semaforo_ambar_sin_gestion_dias": "5",
}

# Parámetros operativos editables vía PUT /configuracion/parametros
CLAVES_PARAMETROS = (
    "meta_mensual",
    "meta_gestiones_diarias",
    "dias_sin_gestion_alerta",
    "pct_mora_referencia",
    "HOLGURA_GARANTIA_PCT",
    "TASA_INTERES_MORATORIO_DEFAULT",
)
# Los que muestra el tab Parámetros en la carga inicial de la pantalla
CLAVES_PARAMETROS_PANTALLA = CLAVES_PARAMETROS[:4]

PREFIJO_SLA = "sla_"

LOG_PAGE_SIZE = 50
FEED_LIMIT = 100
FEED_DIAS_DEFAULT = 14


@dataclass(frozen=True)
class ReglaAutomatizacion:
    id: str
    categoria: str
    nombre: str
    descripcion: str
    rpc: str
    cron_job_name: str
    toggleable: bool
    config_key: str | None
    cron: str  # expresión pg_cron real, UTC, 5 campos
    cron_legible: str

    def to_dict(self) -> dict[str, object]:
        """Misma forma que ``ReglaAutomatizacion`` del front (camelCase)."""
        return {
            "id": self.id,
            "categoria": self.categoria,
            "nombre": self.nombre,
            "descripcion": self.descripcion,
            "rpc": self.rpc,
            "cronJobName": self.cron_job_name,
            "toggleable": self.toggleable,
            "configKey": self.config_key,
            "cron": self.cron,
            "cronLegible": self.cron_legible,
        }


REGLAS: tuple[ReglaAutomatizacion, ...] = (
    ReglaAutomatizacion(
        "promesas_hoy",
        "cobranza",
        "Promesa vence hoy sin cumplir",
        "Le avisa al analista cuando alguna de sus promesas de pago vence hoy y sigue pendiente.",
        "fn_notificar_promesas_hoy",
        "notificar-promesas-hoy",
        True,
        "automatizacion_promesas_hoy_activa",
        "0 13 * * 1-5",
        "L-V 7:00am (CR)",
    ),
    ReglaAutomatizacion(
        "conciliacion_promesas",
        "mantenimiento",
        "Conciliación automática de promesas",
        "Todas las noches revisa si llegaron pagos que cumplen promesas vencidas y actualiza su estado "
        "solo. No se puede apagar: si se apaga, quedan promesas con estado incorrecto que se arrastra a "
        "otros reportes.",
        "fn_conciliar_promesas",
        "evening-conciliar-promesas",
        False,
        None,
        "30 23 * * *",
        "Todos los días 5:30pm (CR)",
    ),
    ReglaAutomatizacion(
        "sync_salud",
        "sistema",
        "Salud de sincronización N8N ↔ Softland",
        "Si una tabla (cartera, facturas, saldos o pagos) deja de recibir datos nuevos por 3 ciclos "
        "seguidos, avisa al coordinador.",
        "fn_check_sync_salud",
        "check_sync_salud",
        True,
        "automatizacion_sync_salud_activa",
        "15 13-23 * * 1-5",
        "L-V cada hora, 7:15am–5:15pm (CR)",
    ),
    ReglaAutomatizacion(
        "sin_gestion",
        "cobranza",
        "Cliente sin gestión ≥ N días",
        "Avisa cuando un cliente lleva más días sin ninguna gestión registrada que el umbral configurado "
        "en Parámetros.",
        "fn_notificar_sin_gestion",
        "notificar-sin-gestion",
        True,
        "automatizacion_sin_gestion_activa",
        "10 13 * * 1-5",
        "L-V 7:10am (CR)",
    ),
    ReglaAutomatizacion(
        "sla_solicitudes",
        "cobranza",
        "Solicitud con SLA vencido",
        "Avisa al responsable (o a coordinación) cuando una solicitud pendiente superó el tiempo de "
        "respuesta acordado en SLA Solicitudes.",
        "fn_notificar_sla_vencido",
        "notificar-sla-vencido",
        True,
        "automatizacion_sla_solicitudes_activa",
        "20 13-23 * * 1-5",
        "L-V cada hora, 7:20am–5:20pm (CR)",
    ),
    ReglaAutomatizacion(
        "pedido_retenido_en_regla",
        "cobranza",
        "Pedido retenido/pendiente ya en regla",
        "Avisa al analista cuando un pedido pendiente o retenido corresponde a un cliente cuya cartera ya "
        "no tiene facturas vencidas a más de 30 días -- señal de que ya se puede aprobar en Softland.",
        "fn_notificar_pedido_en_regla",
        "notificar-pedido-en-regla",
        True,
        "automatizacion_pedido_en_regla_activa",
        "25 13-23 * * 1-5",
        "L-V cada hora, 7:25am–5:25pm (CR)",
    ),
)

DEFAULTS_AUTOMATIZACIONES = {
    "automatizacion_promesas_hoy_activa": "true",
    "automatizacion_sync_salud_activa": "true",
    "automatizacion_sin_gestion_activa": "true",
    "automatizacion_sla_solicitudes_activa": "true",
    "automatizacion_pedido_en_regla_activa": "true",
}


def find_regla(regla_id: str) -> ReglaAutomatizacion | None:
    return next((r for r in REGLAS if r.id == regla_id), None)


def _rango(texto: str) -> list[int]:
    if "-" not in texto:
        return [int(texto)]
    inicio, fin = (int(x) for x in texto.split("-"))
    return list(range(inicio, fin + 1))


def _parse_cron(expr: str) -> tuple[int, list[int], list[int] | None]:
    minuto, horas, _, _, dow = expr.strip().split()[:5]
    dias = None if dow == "*" else [d for parte in dow.split(",") for d in _rango(parte)]
    return int(minuto), _rango(horas), dias


def _iso_js(value: datetime) -> str:
    """``Date.toISOString()`` de JS: milisegundos y sufijo Z."""
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def calcular_ejecuciones(expr: str, ahora: datetime | None = None) -> dict[str, str | None]:
    """Última y próxima corrida programada (ventana ±8 días, cubre el peor caso semanal)."""
    ahora = ahora or datetime.now(UTC)
    desde = ahora - timedelta(days=8)
    hasta = ahora + timedelta(days=8)
    minuto, horas, dias = _parse_cron(expr)
    corridas: list[datetime] = []
    cursor = datetime(desde.year, desde.month, desde.day, tzinfo=UTC)
    while cursor <= hasta:
        dow = (cursor.weekday() + 1) % 7  # getUTCDay(): domingo = 0
        if dias is None or dow in dias:
            for hora in horas:
                t = cursor.replace(hour=hora, minute=minuto)
                if desde <= t <= hasta:
                    corridas.append(t)
        cursor += timedelta(days=1)
    corridas.sort()
    pasadas = [t for t in corridas if t <= ahora]
    futuras = [t for t in corridas if t > ahora]
    return {
        "ultima_ejecucion_programada": _iso_js(pasadas[-1]) if pasadas else None,
        "proxima_ejecucion_programada": _iso_js(futuras[0]) if futuras else None,
    }
