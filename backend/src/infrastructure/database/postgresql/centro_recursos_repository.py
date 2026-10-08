"""Adapter PostgreSQL del Centro de Recursos (aplicaciones, documentos, marcas y directorio comercial)."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from application.ports.centro_recursos import CentroRecursosRepository, Row

_APLICACION_COLS = "id, nombre, descripcion, url, icono, estado, orden, activo, created_at"
_DOCUMENTO_COLS = "id, titulo, descripcion, categoria, tipo_archivo, url, subido_por, created_at"

_PAGINA_SQL: dict[str, str] = {
    "vendedores": (
        "SELECT cod, nombre, zona, telefono, supervisor_cod, analista_email, tipo_canal "
        "FROM tbl_vendedores WHERE activo = true ORDER BY nombre"
    ),
    "supervisores": "SELECT cod, nombre, es_jefe_regional, jefe_regional_cod FROM tbl_supervisores",
    "usuarios": "SELECT email, nombre FROM tbl_usuarios",
    "documentos": f"SELECT {_DOCUMENTO_COLS} FROM tbl_centro_recursos_documentos ORDER BY created_at DESC",
    "aplicaciones": (
        f"SELECT {_APLICACION_COLS} FROM tbl_centro_recursos_aplicaciones WHERE activo = true ORDER BY orden"
    ),
    "grupos": "SELECT principal_cod, activo FROM tbl_portafolio_grupos",
    "miembros": "SELECT principal_cod, vendedor_cod, activo FROM tbl_portafolio_acotado",
    "directorio": (
        "SELECT id, nombre, email, telefono, es_comprador FROM tbl_directorio_empresa WHERE activo = true"
    ),
    "marcas": "SELECT id, nombre, proveedor, comprador_id, notas FROM tbl_marcas WHERE activo = true",
}

_FIND_APLICACION_SQL = "SELECT * FROM tbl_centro_recursos_aplicaciones WHERE id = %s"
_INSERT_APLICACION_SQL = """
INSERT INTO tbl_centro_recursos_aplicaciones (nombre, descripcion, url, icono, estado, creado_por)
VALUES (%(nombre)s, %(descripcion)s, %(url)s, %(icono)s, %(estado)s, %(creado_por)s)
RETURNING *
"""
_INSERT_DOCUMENTO_SQL = """
INSERT INTO tbl_centro_recursos_documentos (titulo, descripcion, categoria, tipo_archivo, url, subido_por)
VALUES (%(titulo)s, %(descripcion)s, %(categoria)s, %(tipo_archivo)s, %(url)s, %(subido_por)s)
RETURNING *
"""
_FIND_MARCA_SQL = "SELECT * FROM tbl_marcas WHERE id = %s"
_INSERT_MARCA_SQL = """
INSERT INTO tbl_marcas (nombre, proveedor, comprador_id, notas)
VALUES (%(nombre)s, %(proveedor)s, %(comprador_id)s, %(notas)s)
RETURNING *
"""
_INSERT_AUDITORIA_SQL = """
INSERT INTO tbl_config_audit_log (tabla, accion, descripcion, valor_anterior, valor_nuevo, realizado_por)
VALUES (%s, %s, %s, %s, %s, %s)
"""
# Columnas que los casos de uso pueden modificar (lista blanca para el UPDATE dinámico)
_APLICACION_EDITABLES = ("nombre", "url", "descripcion", "orden")
_MARCA_EDITABLES = ("nombre", "comprador_id")


def _jsonb(value: Row | None) -> Jsonb | None:
    return None if value is None else Jsonb(value, dumps=lambda obj: json.dumps(obj, default=str))


def _update_sql(table: str, columns: list[str]) -> sql.Composed:
    sets = sql.SQL(", ").join(
        sql.SQL("{} = {}").format(sql.Identifier(col), sql.Placeholder(col)) for col in columns
    )
    return sql.SQL("UPDATE {} SET {} WHERE id = %(id)s RETURNING *").format(sql.Identifier(table), sets)


class PostgresCentroRecursosRepository(CentroRecursosRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def _all(self, query: Any, params: Any = None) -> list[Row]:
        with self._connection.cursor() as cursor:
            cursor.execute(query, params)
            return list(cursor.fetchall())

    def _one(self, query: Any, params: Any = None) -> Row | None:
        with self._connection.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchone()

    def datos_pagina(self) -> dict[str, list[Row]]:
        return {name: self._all(query) for name, query in _PAGINA_SQL.items()}

    def list_aplicaciones_activas(self) -> list[Row]:
        return self._all(_PAGINA_SQL["aplicaciones"])

    def find_aplicacion(self, aplicacion_id: UUID) -> Row | None:
        return self._one(_FIND_APLICACION_SQL, (aplicacion_id,))

    def crear_aplicacion(self, datos: Row) -> Row:
        return self._one(_INSERT_APLICACION_SQL, datos)

    def actualizar_aplicacion(self, aplicacion_id: UUID, cambios: Row) -> Row | None:
        columns = [col for col in _APLICACION_EDITABLES if col in cambios]
        query = _update_sql("tbl_centro_recursos_aplicaciones", columns)
        return self._one(query, {**{col: cambios[col] for col in columns}, "id": aplicacion_id})

    def list_documentos(self) -> list[Row]:
        return self._all(_PAGINA_SQL["documentos"])

    def crear_documento(self, datos: Row) -> Row:
        return self._one(_INSERT_DOCUMENTO_SQL, datos)

    def find_marca(self, marca_id: UUID) -> Row | None:
        return self._one(_FIND_MARCA_SQL, (marca_id,))

    def crear_marca(self, datos: Row) -> Row:
        return self._one(_INSERT_MARCA_SQL, datos)

    def actualizar_marca(self, marca_id: UUID, cambios: Row) -> Row | None:
        columns = [col for col in _MARCA_EDITABLES if col in cambios]
        query = _update_sql("tbl_marcas", columns)
        return self._one(query, {**{col: cambios[col] for col in columns}, "id": marca_id})

    def registrar_auditoria(
        self,
        *,
        tabla: str,
        accion: str,
        descripcion: str,
        realizado_por: str,
        valor_anterior: Row | None = None,
        valor_nuevo: Row | None = None,
    ) -> None:
        params = (tabla, accion, descripcion, _jsonb(valor_anterior), _jsonb(valor_nuevo), realizado_por)
        try:
            with self._connection.transaction():  # savepoint: un fallo no aborta la operación
                with self._connection.cursor() as cursor:
                    cursor.execute(_INSERT_AUDITORIA_SQL, params)
        except psycopg.Error:
            return
