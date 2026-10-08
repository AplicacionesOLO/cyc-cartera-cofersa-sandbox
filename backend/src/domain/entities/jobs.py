"""Sincronizaciones, tareas programadas (ex pg_cron) e ingesta externa (N8N / Google Apps Script).

En el origen N8N y GAS escribían DIRECTO en las tablas vía PostgREST (service_role). En AWS Aurora
queda en VPC privada: escriben con ``POST /ingesta/{tabla}`` y aquí vive la lista blanca de columnas
por tabla (la misma que aceptaba PostgREST: una columna desconocida era un error).
"""

from __future__ import annotations

from dataclasses import dataclass

# ── Sincronizaciones (tbl_sync_log.tipo) ────────────────────────────────────────────────────────
SYNC_PAGOS = "pagos"
SYNC_CARTERA = "cartera"
SYNC_FACTURAS = "facturas"
SYNC_SALDOS_FAVOR = "saldos_favor"
SYNC_PEDIDOS_RETENIDOS = "pedidos_retenidos"

SYNC_TIPOS = (SYNC_PAGOS, SYNC_CARTERA, SYNC_FACTURAS, SYNC_SALDOS_FAVOR, SYNC_PEDIDOS_RETENIDOS)
# Solo cuentan filas y registran en sync_log: responden en el acto.
SYNC_SINCRONOS = frozenset({SYNC_CARTERA, SYNC_FACTURAS, SYNC_SALDOS_FAVOR})
# Llaman al webhook N8N, esperan a que cargue el stage y procesan: van por SQS (> 29 s).
SYNC_ASINCRONOS = frozenset({SYNC_PAGOS, SYNC_PEDIDOS_RETENIDOS})

# Webhook N8N por tipo asíncrono: clave en el secreto de la app y fallback del original.
N8N_WEBHOOK_KEYS = {
    SYNC_PAGOS: "n8n_webhook_pagos_url",
    SYNC_PEDIDOS_RETENIDOS: "n8n_webhook_pedidos_retenidos_url",
}
N8N_WEBHOOK_FALLBACK = {
    SYNC_PAGOS: "https://n8n.mayoreo.biz/webhook/Flujos_SIC",
    SYNC_PEDIDOS_RETENIDOS: "",  # el original lo dejaba vacío hasta que exista el flujo N8N
}
N8N_TIMEOUT_S = 30
N8N_ESPERA_S = 12

HISTORIAL_LIMITE = 600

# ── Tareas programadas (un job lógico de pg_cron = una Lambda programada) ──────────────────────
TAREAS_PROGRAMADAS = (
    "check_recibos_reversion",
    "check_sync_salud",
    "cierre_cartera_mensual",
    "cierre_mensual_pedidos_retenidos",
    "conciliar_promesas",
    "expirar_solicitudes_actualizacion",
    "historico_cartera",
    "notificar_pedido_en_regla",
    "notificar_promesas_hoy",
    "notificar_sin_gestion",
    "notificar_sla_vencido",
    "snapshot_proyeccion_semana",
    "sync_pagos",
    "sync_cartera",
    "sync_facturas",
    "sync_saldos_favor",
    "sync_pedidos_retenidos",
)

# ── Ingesta ─────────────────────────────────────────────────────────────────────────────────────
MODO_REEMPLAZAR = "reemplazar"  # lote 1: DELETE de la tabla y luego INSERT
MODO_AGREGAR = "agregar"  # INSERT
MODO_ACTUALIZAR = "actualizar"  # INSERT ... ON CONFLICT (clave natural) DO UPDATE (upsert de PostgREST)
MODOS_INGESTA = (MODO_REEMPLAZAR, MODO_AGREGAR, MODO_ACTUALIZAR)

MAX_FILAS_POR_LOTE = 5000


@dataclass(frozen=True)
class TablaIngesta:
    nombre: str
    columnas: tuple[str, ...]
    modos: frozenset[str]
    clave: tuple[str, ...] = ()
    solo_texto: bool = False  # tablas stage: todo es text (se castea en fn_cargar_pagos_stage / fn_sync_*)
    tiene_sync_id: bool = False
    tiene_updated_at: bool = False


_TODOS = frozenset(MODOS_INGESTA)
_SIN_REEMPLAZO = frozenset({MODO_AGREGAR, MODO_ACTUALIZAR})
_STAGE = frozenset({MODO_REEMPLAZAR, MODO_AGREGAR})

TABLAS_INGESTA: dict[str, TablaIngesta] = {
    t.nombre: t
    for t in (
        TablaIngesta(
            "pagos_stage",
            (
                "contribuyente",
                "cliente_cod",
                "nombre_cliente",
                "no_factura",
                "monto_factura",
                "fecha_vencimiento",
                "no_recibo",
                "tipo_pago",
                "fecha_pago",
                "monto_pago",
                "dias_atraso",
                "sync_id",
            ),
            _STAGE,
            solo_texto=True,
            tiene_sync_id=True,
        ),
        TablaIngesta(
            "pedidos_retenidos_stage",
            ("id_pedido", "codigo_cliente", "fecha_pedido", "total_mercaderia", "vendedor"),
            _STAGE,
            solo_texto=True,
        ),
        TablaIngesta(
            "cartera",
            (
                "contribuyente",
                "cliente_cod",
                "cliente_nombre",
                "vendedor_nombre",
                "no_vencido",
                "mora_1_30",
                "mora_31_60",
                "mora_61_90",
                "mora_91_120",
                "mora_120_plus",
                "total",
                "sync_id",
                "fecha_corte",
            ),
            _TODOS,
            clave=("contribuyente", "cliente_cod"),
            tiene_sync_id=True,
            tiene_updated_at=True,
        ),
        TablaIngesta(
            "facturas",
            (
                "contribuyente",
                "cliente_cod",
                "cliente_nombre",
                "documento",
                "fecha_documento",
                "fecha_vencimiento",
                "monto",
                "saldo",
                "sync_id",
            ),
            _TODOS,
            clave=("contribuyente", "documento"),
            tiene_sync_id=True,
        ),
        # estado_manual / aplicado_por / aplicado_en los edita el SIC: sin "reemplazar" para no perderlos.
        TablaIngesta(
            "saldos_favor",
            (
                "sync_id",
                "contribuyente",
                "cliente_cod",
                "cliente_nombre",
                "documento",
                "tipo_documento",
                "fecha_documento",
                "fecha_vencimiento",
                "monto",
            ),
            _SIN_REEMPLAZO,
            clave=("documento",),
            tiene_sync_id=True,
            tiene_updated_at=True,
        ),
        # GAS hace upsert por cliente_cod. estado_manual, asignacion_manual y la logística SIC-exclusiva
        # (dia_visita, dia_pago, ...) no se aceptan; los triggers fn_proteger_* siguen protegiendo contacto.
        TablaIngesta(
            "maestro_clientes",
            (
                "contribuyente",
                "cliente_cod",
                "cliente_nombre",
                "vendedor_nombre",
                "vendedor_cod",
                "analista_email",
                "analista_nombre",
                "telefono",
                "telefono2",
                "correo",
                "limite_credito",
                "condicion_pago",
                "agrupacion",
                "dimension",
                "nombre_cxp",
                "nivel_precio",
                "latitud",
                "longitud",
                "cantidad_impresiones",
                "cliente_tramita",
            ),
            _SIN_REEMPLAZO,
            clave=("cliente_cod",),
            tiene_updated_at=True,
        ),
    )
}


@dataclass(frozen=True)
class LoteIngesta:
    tabla: TablaIngesta
    modo: str
    lote: int
    total_lotes: int
    columnas: tuple[str, ...]
    filas: tuple[tuple[object, ...], ...]
    sync_id: str | None = None
    purgar_anteriores: bool = False

    @property
    def es_primero(self) -> bool:
        return self.lote == 1

    @property
    def es_ultimo(self) -> bool:
        return self.lote == self.total_lotes
