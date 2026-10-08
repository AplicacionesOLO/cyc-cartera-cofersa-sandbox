"""Adapter PostgreSQL del módulo Clientes (``tbl_cartera``, ``tbl_maestro_clientes``, ``tbl_facturas``...)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

import psycopg

from application.ports.clientes import ClientesRepository, Row
from domain.entities.clientes import ESTADOS_PEDIDO_ACTIVOS, GestionNueva

_LISTA_SQL = """
SELECT fn_clientes_lista(
  p_q => %(q)s::text, p_analista => %(analista)s::text, p_vendedor => %(vendedor)s::text,
  p_plazo => %(plazo)s::text, p_nivel_precio => %(nivel_precio)s::text, p_dimension => %(dimension)s::text,
  p_sort => %(sort)s::text, p_dir => %(dir)s::text, p_page => %(page)s::int,
  p_page_size => %(page_size)s::int, p_hoy => %(hoy)s::date
) AS r
"""
_BUSCAR_CLIENTES_SQL = """
SELECT cliente_cod, cliente_nombre, vendedor_nombre, contribuyente FROM tbl_maestro_clientes
WHERE cliente_nombre ILIKE %(p)s OR cliente_cod ILIKE %(p)s OR contribuyente ILIKE %(p)s
LIMIT %(limit)s
"""
_BUSCAR_FACTURAS_SQL = """
SELECT documento, cliente_cod, cliente_nombre, saldo FROM tbl_facturas
WHERE documento ILIKE %s ORDER BY fecha_vencimiento DESC LIMIT %s
"""
_BUSCAR_MARCAS_SQL = """
SELECT m.id, m.nombre, m.proveedor, m.comprador_id, d.nombre AS comprador_nombre
FROM tbl_marcas m LEFT JOIN tbl_directorio_empresa d ON d.id = m.comprador_id
WHERE m.nombre ILIKE %s AND m.activo = true
LIMIT %s
"""
_CARTERAS_SQL = "SELECT * FROM tbl_cartera WHERE cliente_cod = %s"
_MAESTRO_SQL = "SELECT * FROM tbl_maestro_clientes WHERE cliente_cod = %s ORDER BY id LIMIT 1"
_GESTIONES_SQL = "SELECT * FROM tbl_gestiones WHERE cliente_cod = %s ORDER BY fecha DESC LIMIT %s"
_PROMESAS_SQL = "SELECT * FROM tbl_promesas WHERE cliente_cod = %s ORDER BY fecha_promesa DESC"
_ICP_SQL = """
SELECT icp_score, dias_prom_ponderado, clasificacion, n_pagos, n_facturas, pct_pagos_tarde,
       primer_pago, ultimo_pago, tendencia
FROM vw_icp_por_cliente WHERE cliente_cod = %s LIMIT 1
"""
_TENDENCIA_SQL = "SELECT fn_tendencia_pago_cliente(%s, %s) AS r"
_PEDIDOS_SQL = """
SELECT id_pedido, estado_sic, total_mercaderia, motivo_retencion FROM tbl_pedidos_retenidos
WHERE codigo_cliente = %s AND estado_sic = ANY(%s) ORDER BY created_at DESC
"""
_SOLICITUDES_SQL = """
SELECT * FROM tbl_solicitudes
WHERE cliente_cod = %(cod)s AND (%(sid)s::uuid IS NULL OR solicitante_id = %(sid)s::uuid)
ORDER BY created_at DESC LIMIT %(limit)s
"""
_NOMBRES_SQL = "SELECT id, nombre FROM tbl_usuarios WHERE id = ANY(%s::uuid[])"
_CONTACTO_USUARIO_SQL = """
SELECT nombre, telefono, whatsapp FROM tbl_usuarios WHERE lower(email) = lower(%s)
ORDER BY activo DESC NULLS LAST LIMIT 1
"""
_FACTURAS_SQL = """
SELECT id, contribuyente, cliente_nombre, documento, fecha_documento, fecha_vencimiento, monto, saldo, sync_id
FROM tbl_facturas
WHERE contribuyente = %(contribuyente)s AND (NOT %(solo)s OR saldo > 0)
ORDER BY fecha_vencimiento ASC
"""
_CUENTAS_SQL = """
SELECT banco, moneda, tipo, numero, iban, orden FROM tbl_cuentas_bancarias
WHERE activo = true ORDER BY orden ASC
"""
_CONTACTO_SQL = """
SELECT fn_actualizar_contacto_cliente(
  p_cliente_cod => %(cod)s::text, p_nombre_cxp => %(nombre_cxp)s::text, p_telefono => %(telefono)s::text,
  p_telefono2 => %(telefono2)s::text, p_correo => %(correo)s::text
)
"""
_LOGISTICA_SQL = """
SELECT fn_actualizar_logistica_cliente(
  p_cliente_cod => %(cod)s::text, p_dia_visita => %(dia_visita)s::text[], p_dia_pago => %(dia_pago)s::text[],
  p_metodo_pago => %(metodo_pago)s::text[], p_observaciones_logistica => %(observaciones_logistica)s::text,
  p_persona_recibe => %(persona_recibe)s::text, p_actualizar_horario => %(actualizar_horario)s::boolean,
  p_hora_recibo_inicio => %(hora_recibo_inicio)s::time, p_hora_recibo_fin => %(hora_recibo_fin)s::time
)
"""
_ESTADO_SQL = """
UPDATE tbl_maestro_clientes SET estado_manual = %s, updated_at = now() WHERE cliente_cod = %s
"""
_GESTION_SQL = """
INSERT INTO tbl_gestiones
  (cliente_cod, contribuyente, analista_email, fecha, hora, tipo, resultado, nota, activo)
VALUES (%(cliente_cod)s, %(contribuyente)s, %(analista_email)s, %(fecha)s, %(hora)s, %(tipo)s, %(resultado)s,
        %(nota)s, COALESCE(%(activo)s::boolean, true))
"""
_CONTAR_CORREOS_SQL = """
SELECT count(*) AS n FROM tbl_gestiones
WHERE analista_email = %s AND tipo = 'CORREO' AND created_at >= %s
"""
_NOTIFICACION_SQL = """
INSERT INTO tbl_notificaciones (usuario_id, tipo, titulo, mensaje, leida, link)
VALUES (%s, %s, %s, %s, false, %s)
"""


class PostgresClientesRepository(ClientesRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def _all(self, sql: str, params: Any = None) -> list[Row]:
        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            return [dict(row) for row in cursor.fetchall()]

    def _one(self, sql: str, params: Any = None) -> Row | None:
        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            row = cursor.fetchone()
        return dict(row) if row else None

    def _execute(self, sql: str, params: Any = None) -> int:
        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            return cursor.rowcount

    # ── Lista / buscador ────────────────────────────────────────────────
    def lista(self, filtros: dict[str, Any], page: int, page_size: int | None, hoy: date) -> Row:
        row = self._one(_LISTA_SQL, {**filtros, "page": page, "page_size": page_size, "hoy": hoy})
        return (row or {}).get("r") or {}

    def buscar_clientes(self, q: str, limit: int) -> list[Row]:
        return self._all(_BUSCAR_CLIENTES_SQL, {"p": f"%{q}%", "limit": limit})

    def buscar_facturas_por_sufijo(self, sufijo: str, limit: int) -> list[Row]:
        return self._all(_BUSCAR_FACTURAS_SQL, (f"%{sufijo}", limit))

    def buscar_marcas(self, q: str, limit: int) -> list[Row]:
        return self._all(_BUSCAR_MARCAS_SQL, (f"%{q}%", limit))

    # ── Ficha 360° ──────────────────────────────────────────────────────
    def carteras_del_cliente(self, cliente_cod: str) -> list[Row]:
        return self._all(_CARTERAS_SQL, (cliente_cod,))

    def maestro_del_cliente(self, cliente_cod: str) -> Row | None:
        return self._one(_MAESTRO_SQL, (cliente_cod,))

    def gestiones_del_cliente(self, cliente_cod: str, limit: int) -> list[Row]:
        return self._all(_GESTIONES_SQL, (cliente_cod, limit))

    def promesas_del_cliente(self, cliente_cod: str) -> list[Row]:
        return self._all(_PROMESAS_SQL, (cliente_cod,))

    def icp_del_cliente(self, cliente_cod: str) -> Row | None:
        return self._one(_ICP_SQL, (cliente_cod,))

    def tendencia_pago(self, cliente_cod: str, meses: int) -> list[Row]:
        row = self._one(_TENDENCIA_SQL, (cliente_cod, meses))
        return list((row or {}).get("r") or [])

    def pedidos_retenidos_activos(self, cliente_cod: str) -> list[Row]:
        return self._all(_PEDIDOS_SQL, (cliente_cod, list(ESTADOS_PEDIDO_ACTIVOS)))

    def solicitudes_del_cliente(self, cliente_cod: str, solicitante_id: UUID | None, limit: int) -> list[Row]:
        return self._all(_SOLICITUDES_SQL, {"cod": cliente_cod, "sid": solicitante_id, "limit": limit})

    def nombres_usuarios(self, ids: list[str]) -> dict[str, str]:
        return {str(r["id"]): r["nombre"] for r in self._all(_NOMBRES_SQL, (ids,))}

    def contacto_usuario(self, email: str) -> Row | None:
        return self._one(_CONTACTO_USUARIO_SQL, (email,))

    def facturas_por_contribuyente(self, contribuyente: str, *, solo_con_saldo: bool) -> list[Row]:
        return self._all(_FACTURAS_SQL, {"contribuyente": contribuyente, "solo": solo_con_saldo})

    def cuentas_bancarias_activas(self) -> list[Row]:
        return self._all(_CUENTAS_SQL)

    # ── Escrituras ──────────────────────────────────────────────────────
    def actualizar_contacto(self, cliente_cod: str, campos: dict[str, str | None]) -> None:
        self._execute(_CONTACTO_SQL, {"cod": cliente_cod, **campos})

    def actualizar_logistica(self, cliente_cod: str, campos: dict[str, Any]) -> None:
        self._execute(_LOGISTICA_SQL, {"cod": cliente_cod, **campos})

    def actualizar_estado_manual(self, cliente_cod: str, estado: str) -> bool:
        return self._execute(_ESTADO_SQL, (estado, cliente_cod)) > 0

    def registrar_gestion(self, gestion: GestionNueva) -> None:
        self._execute(
            _GESTION_SQL,
            {
                "cliente_cod": gestion.cliente_cod,
                "contribuyente": gestion.contribuyente,
                "analista_email": gestion.analista_email,
                "fecha": gestion.fecha,
                "hora": gestion.hora,
                "tipo": gestion.tipo,
                "resultado": gestion.resultado,
                "nota": gestion.nota,
                "activo": gestion.activo,
            },
        )

    def contar_correos_desde(self, analista_email: str, desde: datetime) -> int:
        row = self._one(_CONTAR_CORREOS_SQL, (analista_email, desde))
        return int((row or {}).get("n") or 0)

    def crear_notificacion(self, usuario_id: UUID, tipo: str, titulo: str, mensaje: str, link: str) -> None:
        self._execute(_NOTIFICACION_SQL, (usuario_id, tipo, titulo, mensaje, link))
