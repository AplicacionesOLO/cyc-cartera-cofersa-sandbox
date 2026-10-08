"""Adapter PostgreSQL del módulo Configuración.

Tablas: tbl_usuarios, tbl_vendedores, tbl_supervisores, tbl_directorio_empresa, tbl_portafolio_grupos,
tbl_portafolio_acotado, tbl_config_sistema, tbl_config_audit_log, tbl_ventas_mensuales y el feed
vw_v_automatizaciones_feed (+ fn_automatizaciones_resumen). Los UPDATE dinámicos solo admiten columnas
de una lista blanca por tabla (``_EDITABLES``).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from application.ports.configuracion import ConfiguracionRepository, Row
from shared.serialization import dumps

_USUARIO_COLS = (
    "id, nombre, email, rol, iniciales, color, activo, meta_individual, telefono, whatsapp, created_at, "
    "tiene_cartera_asignada"
)
_VENDEDOR_COLS = (
    "cod, nombre, email, zona, telefono, analista_email, activo, asignado_por, asignado_en, "
    "supervisor_cod, tipo_canal"
)
_SUPERVISOR_COLS = (
    "cod, nombre, email, activo, created_at, es_jefe_regional, jefe_regional_cod, cargo_jerarquia"
)
_CONTACTO_COLS = "id, nombre, email, cargo, area, telefono, activo, created_at, es_comprador"
_VENTA_COLS = "id, anio, mes, total_ventas_sin_iva, cartera_total_mes, created_at"
_FEED_COLS = "f.id, f.usuario_id, f.tipo, f.titulo, f.mensaje, f.link, f.leida, f.created_at, f.regla_id"
_LOG_COLS = "id, tabla, accion, descripcion, realizado_por, realizado_en"

# tabla → (columnas editables, columna clave, columnas que devuelve)
_EDITABLES: dict[str, tuple[frozenset[str], str, str]] = {
    "tbl_usuarios": (
        frozenset(
            {"nombre", "rol", "activo", "meta_individual", "telefono", "whatsapp", "iniciales", "color"}
        ),
        "id",
        _USUARIO_COLS,
    ),
    "tbl_vendedores": (
        frozenset(
            {
                "analista_email",
                "asignado_por",
                "asignado_en",
                "supervisor_cod",
                "zona",
                "nombre",
                "email",
                "telefono",
                "tipo_canal",
                "activo",
            }
        ),
        "cod",
        _VENDEDOR_COLS + ", created_at",
    ),
    "tbl_supervisores": (
        frozenset({"nombre", "email", "activo", "es_jefe_regional", "jefe_regional_cod", "cargo_jerarquia"}),
        "cod",
        _SUPERVISOR_COLS,
    ),
    "tbl_directorio_empresa": (
        frozenset({"nombre", "email", "cargo", "area", "telefono", "activo", "es_comprador"}),
        "id",
        _CONTACTO_COLS,
    ),
    "tbl_portafolio_grupos": (
        frozenset({"nombre_ruta", "rol_funcional", "activo"}),
        "principal_cod",
        "principal_cod, nombre_ruta, rol_funcional, activo",
    ),
}

_LIST_USUARIOS_SQL = f"SELECT {_USUARIO_COLS} FROM tbl_usuarios ORDER BY nombre"
_GET_USUARIO_SQL = f"SELECT {_USUARIO_COLS} FROM tbl_usuarios WHERE id = %s"
_INSERT_USUARIO_SQL = f"""
INSERT INTO tbl_usuarios (nombre, email, rol, iniciales, color, activo, meta_individual, telefono, whatsapp)
VALUES (%(nombre)s, %(email)s, %(rol)s, %(iniciales)s, %(color)s, %(activo)s, %(meta_individual)s,
        %(telefono)s, %(whatsapp)s)
RETURNING {_USUARIO_COLS}
"""

_LIST_VENDEDORES_SQL = f"SELECT {_VENDEDOR_COLS} FROM tbl_vendedores ORDER BY nombre"
_LIST_VENDEDORES_ACTIVOS_SQL = (
    f"SELECT {_VENDEDOR_COLS} FROM tbl_vendedores WHERE activo = true ORDER BY nombre"
)
_GET_VENDEDOR_SQL = f"SELECT {_VENDEDOR_COLS} FROM tbl_vendedores WHERE cod = %s"
_INSERT_VENDEDOR_SQL = f"""
INSERT INTO tbl_vendedores (cod, nombre, email, zona, telefono, supervisor_cod, analista_email, tipo_canal,
                            activo, asignado_por, asignado_en)
VALUES (%(cod)s, %(nombre)s, %(email)s, %(zona)s, %(telefono)s, %(supervisor_cod)s, %(analista_email)s,
        %(tipo_canal)s, %(activo)s, %(asignado_por)s, %(asignado_en)s)
RETURNING {_VENDEDOR_COLS}, created_at
"""
_CLIENTES_POR_VENDEDOR_SQL = """
SELECT vendedor_cod, count(*) AS n FROM tbl_maestro_clientes
WHERE vendedor_cod IS NOT NULL
GROUP BY vendedor_cod
"""
_RUTA_ACTIVA_SQL = """
SELECT nombre_ruta FROM tbl_portafolio_grupos WHERE principal_cod = %s AND activo = true LIMIT 1
"""

_LIST_SUPERVISORES_SQL = f"SELECT {_SUPERVISOR_COLS} FROM tbl_supervisores ORDER BY nombre"
_LIST_SUPERVISORES_ACTIVOS_SQL = (
    f"SELECT {_SUPERVISOR_COLS} FROM tbl_supervisores WHERE activo = true ORDER BY nombre"
)
_GET_SUPERVISOR_SQL = f"SELECT {_SUPERVISOR_COLS} FROM tbl_supervisores WHERE cod = %s"
_INSERT_SUPERVISOR_SQL = f"""
INSERT INTO tbl_supervisores (cod, nombre, email, activo, es_jefe_regional, jefe_regional_cod,
                              cargo_jerarquia)
VALUES (%(cod)s, %(nombre)s, %(email)s, %(activo)s, %(es_jefe_regional)s, %(jefe_regional_cod)s,
        %(cargo_jerarquia)s)
RETURNING {_SUPERVISOR_COLS}
"""
_VENDEDORES_DE_SUPERVISOR_SQL = """
SELECT cod, nombre FROM tbl_vendedores WHERE supervisor_cod = %s AND activo = true ORDER BY nombre
"""

_LIST_DIRECTORIO_SQL = f"""
SELECT {_CONTACTO_COLS} FROM tbl_directorio_empresa
WHERE (%(area)s::text IS NULL OR area = %(area)s)
  AND (%(q)s::text IS NULL OR nombre ILIKE %(q)s OR email ILIKE %(q)s)
ORDER BY nombre
"""
_LIST_CONTACTOS_ACTIVOS_SQL = """
SELECT id, nombre, email, cargo, area FROM tbl_directorio_empresa
WHERE activo = true
  AND (%(area)s::text IS NULL OR area = %(area)s)
  AND (%(q)s::text IS NULL OR nombre ILIKE %(q)s OR email ILIKE %(q)s)
ORDER BY nombre
LIMIT %(limit)s
"""
_GET_CONTACTO_SQL = f"SELECT {_CONTACTO_COLS} FROM tbl_directorio_empresa WHERE id = %s"
_INSERT_CONTACTO_SQL = f"""
INSERT INTO tbl_directorio_empresa (nombre, email, cargo, area, telefono, activo, es_comprador)
VALUES (%(nombre)s, %(email)s, %(cargo)s, %(area)s, %(telefono)s, %(activo)s, %(es_comprador)s)
RETURNING {_CONTACTO_COLS}
"""

_LIST_GRUPOS_SQL = (
    "SELECT principal_cod, nombre_ruta, rol_funcional, activo FROM tbl_portafolio_grupos ORDER BY nombre_ruta"
)
_GET_GRUPO_SQL = (
    "SELECT principal_cod, nombre_ruta, rol_funcional, activo FROM tbl_portafolio_grupos "
    "WHERE principal_cod = %s"
)
_LIST_MIEMBROS_SQL = """
SELECT principal_cod, vendedor_cod, activo FROM tbl_portafolio_acotado
WHERE (%(principal)s::text IS NULL OR principal_cod = %(principal)s)
ORDER BY id
"""
_UPSERT_GRUPO_SQL = """
INSERT INTO tbl_portafolio_grupos (principal_cod, nombre_ruta, rol_funcional, activo, updated_at)
VALUES (%s, %s, %s, true, now())
ON CONFLICT (principal_cod) DO UPDATE
SET nombre_ruta = EXCLUDED.nombre_ruta, rol_funcional = EXCLUDED.rol_funcional, activo = true,
    updated_at = now()
"""
_ACTIVAR_MIEMBRO_SQL = """
INSERT INTO tbl_portafolio_acotado (principal_cod, vendedor_cod, activo)
VALUES (%s, %s, true)
ON CONFLICT (principal_cod, vendedor_cod) DO UPDATE SET activo = true
"""
_DESACTIVAR_MIEMBROS_SQL = """
UPDATE tbl_portafolio_acotado SET activo = false WHERE principal_cod = %s AND vendedor_cod = ANY(%s)
"""

_LIST_CONFIG_SQL = """
SELECT clave, valor, descripcion FROM tbl_config_sistema
WHERE (%(claves)s::text[] IS NULL OR clave = ANY(%(claves)s))
  AND (%(prefijo)s::text IS NULL OR starts_with(clave, %(prefijo)s))
ORDER BY clave
"""
_GET_CONFIG_SQL = "SELECT valor FROM tbl_config_sistema WHERE clave = %s"
_UPSERT_CONFIG_SQL = """
INSERT INTO tbl_config_sistema (clave, valor) VALUES (%s, %s)
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor
RETURNING clave, valor, descripcion
"""

_LIST_VENTAS_SQL = f"SELECT {_VENTA_COLS} FROM tbl_ventas_mensuales ORDER BY anio DESC, mes DESC LIMIT %s"
_GET_VENTA_SQL = (
    "SELECT total_ventas_sin_iva, cartera_total_mes FROM tbl_ventas_mensuales WHERE anio = %s AND mes = %s"
)
_UPSERT_VENTA_SQL = f"""
INSERT INTO tbl_ventas_mensuales (anio, mes, total_ventas_sin_iva, cartera_total_mes)
VALUES (%s, %s, %s, %s)
ON CONFLICT (anio, mes) DO UPDATE
SET total_ventas_sin_iva = EXCLUDED.total_ventas_sin_iva, cartera_total_mes = EXCLUDED.cartera_total_mes
RETURNING {_VENTA_COLS}
"""

_LOG_WHERE = """
WHERE (%(tabla)s::text IS NULL OR tabla = %(tabla)s)
  AND (%(desde)s::timestamptz IS NULL OR realizado_en >= %(desde)s)
  AND (%(hasta)s::timestamptz IS NULL OR realizado_en <= %(hasta)s)
"""
_LIST_LOG_SQL = f"""
SELECT {_LOG_COLS} FROM tbl_config_audit_log {_LOG_WHERE}
ORDER BY realizado_en DESC
LIMIT %(limit)s OFFSET %(offset)s
"""
_COUNT_LOG_SQL = f"SELECT count(*) AS n FROM tbl_config_audit_log {_LOG_WHERE}"
_INSERT_LOG_SQL = """
INSERT INTO tbl_config_audit_log (tabla, accion, descripcion, valor_anterior, valor_nuevo, realizado_por,
                                  realizado_en)
VALUES (%s, %s, %s, %s, %s, %s, now())
"""

_RESUMEN_SQL = "SELECT fn_automatizaciones_resumen() AS r"
_FEED_SQL = f"""
SELECT {_FEED_COLS} FROM vw_v_automatizaciones_feed f
WHERE f.created_at >= %(desde)s AND (%(regla)s::text IS NULL OR f.regla_id = %(regla)s)
ORDER BY f.created_at DESC
LIMIT %(limit)s
"""
_FEED_CON_USUARIO_SQL = f"""
SELECT {_FEED_COLS}, u.id AS u_id, u.nombre AS u_nombre, u.email AS u_email
FROM vw_v_automatizaciones_feed f
LEFT JOIN tbl_usuarios u ON u.id = f.usuario_id
WHERE f.created_at >= %(desde)s AND (%(regla)s::text IS NULL OR f.regla_id = %(regla)s)
ORDER BY f.created_at DESC
LIMIT %(limit)s
"""
_MARCAR_LEIDA_SQL = "UPDATE tbl_notificaciones SET leida = true WHERE id = %s"


def _like(q: str | None) -> str | None:
    if not q:
        return None
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _jsonb(value: Row | None) -> Jsonb | None:
    return None if value is None else Jsonb(value, dumps=dumps)


def _feed_row(row: Row) -> Row:
    u_id, u_nombre, u_email = row.pop("u_id"), row.pop("u_nombre"), row.pop("u_email")
    row["usuario"] = {"id": u_id, "nombre": u_nombre, "email": u_email} if u_id else None
    return row


class PostgresConfiguracionRepository(ConfiguracionRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    # ── helpers ───────────────────────────────────────────────────────
    def _all(self, query: Any, params: Any = None) -> list[Row]:
        with self._connection.cursor() as cursor:
            cursor.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

    def _one(self, query: Any, params: Any = None) -> Row | None:
        with self._connection.cursor() as cursor:
            cursor.execute(query, params)
            row = cursor.fetchone()
        return dict(row) if row else None

    def _execute(self, query: Any, params: Any = None) -> None:
        with self._connection.cursor() as cursor:
            cursor.execute(query, params)

    def _update(self, table: str, key_value: Any, changes: Row) -> Row | None:
        editables, key, returning = _EDITABLES[table]
        columns = [c for c in changes if c in editables]
        if not columns:
            return self._one(
                sql.SQL("SELECT {} FROM {} WHERE {} = %s").format(
                    sql.SQL(returning), sql.Identifier(table), sql.Identifier(key)
                ),
                (key_value,),
            )
        assignments = [sql.SQL("{} = %s").format(sql.Identifier(c)) for c in columns]
        if table == "tbl_portafolio_grupos":
            assignments.append(sql.SQL("updated_at = now()"))
        query = sql.SQL("UPDATE {} SET {} WHERE {} = %s RETURNING {}").format(
            sql.Identifier(table), sql.SQL(", ").join(assignments), sql.Identifier(key), sql.SQL(returning)
        )
        return self._one(query, (*[changes[c] for c in columns], key_value))

    # ── usuarios ──────────────────────────────────────────────────────
    def list_usuarios(self) -> list[Row]:
        return self._all(_LIST_USUARIOS_SQL)

    def get_usuario(self, usuario_id: UUID) -> Row | None:
        return self._one(_GET_USUARIO_SQL, (usuario_id,))

    def insert_usuario(self, data: Row) -> Row:
        row = self._one(_INSERT_USUARIO_SQL, data)
        assert row is not None
        return row

    def update_usuario(self, usuario_id: UUID, changes: Row) -> Row | None:
        return self._update("tbl_usuarios", usuario_id, changes)

    # ── vendedores ────────────────────────────────────────────────────
    def list_vendedores(self, *, solo_activos: bool) -> list[Row]:
        return self._all(_LIST_VENDEDORES_ACTIVOS_SQL if solo_activos else _LIST_VENDEDORES_SQL)

    def get_vendedor(self, cod: str) -> Row | None:
        return self._one(_GET_VENDEDOR_SQL, (cod,))

    def insert_vendedor(self, data: Row) -> Row:
        row = self._one(_INSERT_VENDEDOR_SQL, data)
        assert row is not None
        return row

    def update_vendedor(self, cod: str, changes: Row) -> Row | None:
        return self._update("tbl_vendedores", cod, changes)

    def contar_clientes_por_vendedor(self) -> dict[str, int]:
        return {r["vendedor_cod"]: int(r["n"]) for r in self._all(_CLIENTES_POR_VENDEDOR_SQL)}

    def ruta_activa_de_principal(self, cod: str) -> str | None:
        row = self._one(_RUTA_ACTIVA_SQL, (cod,))
        return row["nombre_ruta"] if row else None

    # ── supervisores ──────────────────────────────────────────────────
    def list_supervisores(self, *, solo_activos: bool = False) -> list[Row]:
        return self._all(_LIST_SUPERVISORES_ACTIVOS_SQL if solo_activos else _LIST_SUPERVISORES_SQL)

    def get_supervisor(self, cod: str) -> Row | None:
        return self._one(_GET_SUPERVISOR_SQL, (cod,))

    def insert_supervisor(self, data: Row) -> Row:
        row = self._one(_INSERT_SUPERVISOR_SQL, data)
        assert row is not None
        return row

    def update_supervisor(self, cod: str, changes: Row) -> Row | None:
        return self._update("tbl_supervisores", cod, changes)

    def vendedores_activos_de_supervisor(self, cod: str) -> list[Row]:
        return self._all(_VENDEDORES_DE_SUPERVISOR_SQL, (cod,))

    # ── directorio ────────────────────────────────────────────────────
    def list_directorio(self, *, area: str | None, q: str | None) -> list[Row]:
        return self._all(_LIST_DIRECTORIO_SQL, {"area": area, "q": _like(q)})

    def list_contactos_activos(self, *, q: str | None, area: str | None, limit: int | None) -> list[Row]:
        return self._all(_LIST_CONTACTOS_ACTIVOS_SQL, {"area": area, "q": _like(q), "limit": limit})

    def get_contacto(self, contacto_id: UUID) -> Row | None:
        return self._one(_GET_CONTACTO_SQL, (contacto_id,))

    def insert_contacto(self, data: Row) -> Row:
        row = self._one(_INSERT_CONTACTO_SQL, data)
        assert row is not None
        return row

    def update_contacto(self, contacto_id: UUID, changes: Row) -> Row | None:
        return self._update("tbl_directorio_empresa", contacto_id, changes)

    # ── portafolio acotado ────────────────────────────────────────────
    def list_grupos(self) -> list[Row]:
        return self._all(_LIST_GRUPOS_SQL)

    def list_miembros(self, principal_cod: str | None = None) -> list[Row]:
        return self._all(_LIST_MIEMBROS_SQL, {"principal": principal_cod})

    def get_grupo(self, principal_cod: str) -> Row | None:
        return self._one(_GET_GRUPO_SQL, (principal_cod,))

    def upsert_grupo(self, principal_cod: str, nombre_ruta: str, rol_funcional: str | None) -> None:
        self._execute(_UPSERT_GRUPO_SQL, (principal_cod, nombre_ruta, rol_funcional))

    def update_grupo(self, principal_cod: str, changes: Row) -> None:
        self._update("tbl_portafolio_grupos", principal_cod, changes)

    def activar_miembros(self, principal_cod: str, vendedor_cods: list[str]) -> None:
        with self._connection.cursor() as cursor:
            cursor.executemany(_ACTIVAR_MIEMBRO_SQL, [(principal_cod, cod) for cod in vendedor_cods])

    def desactivar_miembros(self, principal_cod: str, vendedor_cods: list[str]) -> None:
        self._execute(_DESACTIVAR_MIEMBROS_SQL, (principal_cod, list(vendedor_cods)))

    # ── config_sistema ────────────────────────────────────────────────
    def list_config(self, *, claves: tuple[str, ...] | None = None, prefijo: str | None = None) -> list[Row]:
        return self._all(
            _LIST_CONFIG_SQL, {"claves": list(claves) if claves is not None else None, "prefijo": prefijo}
        )

    def get_config_valor(self, clave: str) -> str | None:
        row = self._one(_GET_CONFIG_SQL, (clave,))
        return row["valor"] if row else None

    def upsert_config(self, valores: dict[str, str]) -> list[Row]:
        return [
            row for clave, valor in valores.items() if (row := self._one(_UPSERT_CONFIG_SQL, (clave, valor)))
        ]

    # ── cierre de mes ─────────────────────────────────────────────────
    def list_ventas_mensuales(self, limit: int) -> list[Row]:
        return self._all(_LIST_VENTAS_SQL, (limit,))

    def get_venta_mensual(self, anio: int, mes: int) -> Row | None:
        return self._one(_GET_VENTA_SQL, (anio, mes))

    def upsert_venta_mensual(
        self, anio: int, mes: int, total_ventas_sin_iva: float, cartera_total_mes: float | None
    ) -> Row:
        row = self._one(_UPSERT_VENTA_SQL, (anio, mes, total_ventas_sin_iva, cartera_total_mes))
        assert row is not None
        return row

    # ── log de auditoría ──────────────────────────────────────────────
    def list_audit_log(
        self,
        *,
        tabla: str | None,
        desde: datetime | None,
        hasta: datetime | None,
        limit: int | None,
        offset: int,
    ) -> tuple[list[Row], int]:
        params = {"tabla": tabla, "desde": desde, "hasta": hasta, "limit": limit, "offset": offset}
        rows = self._all(_LIST_LOG_SQL, params)
        total = self._one(_COUNT_LOG_SQL, params)
        return rows, int(total["n"]) if total else 0

    def insert_audit_log(
        self,
        *,
        tabla: str,
        accion: str,
        descripcion: str,
        realizado_por: str,
        valor_anterior: Row | None = None,
        valor_nuevo: Row | None = None,
    ) -> None:
        with self._connection.transaction():  # savepoint: un fallo no aborta la operación principal
            self._execute(
                _INSERT_LOG_SQL,
                (tabla, accion, descripcion, _jsonb(valor_anterior), _jsonb(valor_nuevo), realizado_por),
            )

    # ── automatizaciones ──────────────────────────────────────────────
    def automatizaciones_resumen(self) -> dict[str, int]:
        row = self._one(_RESUMEN_SQL)
        return {k: int(v) for k, v in ((row or {}).get("r") or {}).items()}

    def list_automatizaciones_feed(
        self, *, desde: datetime, regla_id: str | None, limit: int, con_usuario: bool
    ) -> list[Row]:
        params = {"desde": desde, "regla": regla_id, "limit": limit}
        if not con_usuario:
            return self._all(_FEED_SQL, params)
        return [_feed_row(row) for row in self._all(_FEED_CON_USUARIO_SQL, params)]

    def marcar_notificacion_leida(self, notificacion_id: UUID) -> None:
        self._execute(_MARCAR_LEIDA_SQL, (notificacion_id,))
