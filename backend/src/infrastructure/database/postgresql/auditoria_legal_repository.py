"""Adapter PostgreSQL del módulo Auditoría y Control Legal (garantías y solicitudes de actualización)."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from application.ports.auditoria_legal import AuditoriaLegalRepository

Row = dict[str, Any]

_LISTA_SQL = "SELECT * FROM fn_garantias_lista(p_email => %s)"
_SIN_GARANTIA_SQL = "SELECT * FROM fn_garantias_clientes_sin_garantia(p_email => %s)"
_VENDEDORES_ACTIVOS_SQL = "SELECT cod, nombre FROM tbl_vendedores WHERE activo = true ORDER BY nombre"
_VENDEDOR_SQL = "SELECT email, nombre, supervisor_cod FROM tbl_vendedores WHERE cod = %s LIMIT 1"
_SUPERVISOR_SQL = "SELECT email FROM tbl_supervisores WHERE cod = %s LIMIT 1"
_EVENTOS_SQL = """
SELECT e.id, e.tipo_evento, e.nota, e.created_at,
       CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('nombre', u.nombre) END AS usuarios
FROM tbl_garantia_eventos e
LEFT JOIN tbl_usuarios u ON u.id = e.usuario_id
WHERE e.garantia_id = %s
ORDER BY e.created_at DESC, e.id DESC
"""
_BUSCAR_SQL = "SELECT * FROM fn_buscar_contribuyentes(p_query => %s)"
_SALDO_SQL = "SELECT * FROM fn_saldo_contribuyente(p_contribuyente => %s)"
_ACTIVA_SQL = """
SELECT id, tipo_titulo, monto_garantizado FROM tbl_garantias
WHERE contribuyente = %s AND activo = true
LIMIT 1
"""
_VENDEDORES_CONTRIBUYENTE_SQL = "SELECT * FROM fn_vendedores_por_contribuyente(p_contribuyente => %s)"
_PERSONAS_SQL = """
SELECT cedula, nombre, estado_civil, profesion, domicilio, telefono, created_at, updated_at
FROM tbl_personas_legales WHERE cedula = ANY(%s)
"""
_CONFIG_SQL = "SELECT clave, valor FROM tbl_config_sistema WHERE clave = ANY(%s)"
_CONTAR_CARPETA_SQL = """
SELECT fn_contar_garantias_en_carpeta(
  p_mueble => %s, p_gaveta => %s, p_carpeta => %s, p_excluir_id => %s
) AS r
"""
_SIGUIENTE_CARPETA_SQL = """
SELECT fn_siguiente_carpeta_disponible(p_mueble => %s, p_gaveta => %s, p_carpeta_desde => %s) AS r
"""
_GARANTIA_SQL = "SELECT * FROM tbl_garantias WHERE id = %s"
_RESOLVER_SQL = "SELECT * FROM fn_resolver_responsables_contribuyente(p_contribuyente => %s)"
_CONSECUTIVO_SQL = "SELECT fn_siguiente_consecutivo_garantia() AS r"
_DESACTIVAR_SQL = "UPDATE tbl_garantias SET activo = false, updated_at = now() WHERE id = %s"
_INSERT_COLUMNS = (
    "contribuyente",
    "cliente_nombre",
    "tipo_titulo",
    "monto_garantizado",
    "tiene_fiador",
    "fiador_nombre",
    "fiador_cedula",
    "fiador_telefono",
    "representante_legal",
    "fecha_emision",
    "fecha_vencimiento",
    "ubicacion_archivero",
    "ubicacion_archivero_mueble",
    "ubicacion_archivero_gaveta",
    "ubicacion_archivero_carpeta",
    "estado_custodia",
    "origen_registro",
    "activo",
    "registrado_por",
    "analista_email",
    "vendedor_cod",
    "consecutivo",
)
_INSERT_SQL = (
    f"INSERT INTO tbl_garantias ({', '.join(_INSERT_COLUMNS)}) "
    f"VALUES ({', '.join(f'%({c})s' for c in _INSERT_COLUMNS)}) RETURNING id"
)
_VINCULAR_SQL = "UPDATE tbl_garantias SET reemplazada_por_id = %s, updated_at = now() WHERE id = %s"
_EVENTO_SQL = """
INSERT INTO tbl_garantia_eventos (garantia_id, tipo_evento, usuario_id, nota) VALUES (%s, %s, %s, %s)
"""
_COORDINADOR_SQL = "SELECT id FROM tbl_usuarios WHERE rol = 'COORDINADOR' ORDER BY created_at LIMIT 1"
_NOTIFICACION_SQL = """
INSERT INTO tbl_notificaciones (usuario_id, tipo, titulo, mensaje, leida, link, created_at)
VALUES (%s, %s, %s, %s, false, %s, now())
"""
_DOCUMENTO_SQL = "UPDATE tbl_garantias SET documento_pdf_url = %s, updated_at = now() WHERE id = %s"
_UPSERT_PERSONA_SQL = """
INSERT INTO tbl_personas_legales (cedula, nombre, estado_civil, profesion, domicilio, telefono, updated_at)
VALUES (%(cedula)s, %(nombre)s, %(estado_civil)s, %(profesion)s, %(domicilio)s, %(telefono)s, now())
ON CONFLICT (cedula) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  estado_civil = EXCLUDED.estado_civil,
  profesion = EXCLUDED.profesion,
  domicilio = EXCLUDED.domicilio,
  telefono = CASE WHEN %(con_telefono)s THEN EXCLUDED.telefono ELSE tbl_personas_legales.telefono END,
  updated_at = now()
"""

_SOLICITUD_COLUMNS = (
    "id, contribuyente, cliente_nombre, tipo_persona, estado, token_expira_en, datos_temporales, url_cedula, "
    "url_personeria, enviada_en, respondida_en, aprobada_en, garantia_id, nota_revision, correo_destino"
)
_CONTAR_SOLICITUDES_SQL = """
SELECT count(*) AS n FROM tbl_solicitudes_actualizacion WHERE enviada_por = %s AND enviada_en >= %s
"""
_CREAR_SOLICITUD_SQL = """
INSERT INTO tbl_solicitudes_actualizacion
  (contribuyente, cliente_nombre, tipo_persona, token_hash, token_expira_en, enviada_por, correo_destino)
VALUES (%(contribuyente)s, %(cliente_nombre)s, %(tipo_persona)s, %(token_hash)s, %(token_expira_en)s,
        %(enviada_por)s, %(correo_destino)s)
ON CONFLICT DO NOTHING
RETURNING id
"""
_SEGUIMIENTO_SQL = f"""
SELECT {_SOLICITUD_COLUMNS} FROM tbl_solicitudes_actualizacion
WHERE estado = ANY(%s)
ORDER BY enviada_en DESC
"""
_SOLICITUD_SQL = "SELECT * FROM tbl_solicitudes_actualizacion WHERE id = %s"
_POR_TOKEN_SQL = """
SELECT id, contribuyente, cliente_nombre, tipo_persona, estado, token_expira_en, datos_temporales,
       nota_revision
FROM tbl_solicitudes_actualizacion WHERE token_hash = %s LIMIT 1
"""
_ESTADOS_SEGUIMIENTO = ["ENVIADA", "DATOS_RECIBIDOS", "APROBADA", "EXPIRADA"]

# columnas que cada UPDATE dinámico puede tocar (lista blanca: los nombres se componen como identificadores)
_GARANTIA_EDITABLES = frozenset(
    {
        "tipo_titulo",
        "monto_garantizado",
        "tiene_fiador",
        "fiador_nombre",
        "fiador_cedula",
        "fiador_telefono",
        "representante_legal",
        "fecha_emision",
        "fecha_vencimiento",
        "ubicacion_archivero",
        "ubicacion_archivero_mueble",
        "ubicacion_archivero_gaveta",
        "ubicacion_archivero_carpeta",
    }
)
_CUSTODIA_EDITABLES = frozenset(
    {
        "estado_custodia",
        "ubicacion_archivero",
        "ubicacion_archivero_mueble",
        "ubicacion_archivero_gaveta",
        "ubicacion_archivero_carpeta",
    }
)
_PAGARE_EDITABLES = frozenset(
    {
        "tasa_interes_moratorio",
        "lugar_emision",
        "documento_pagare_generado_en",
        "deudor_estado_civil",
        "deudor_profesion",
        "deudor_domicilio",
        "representante_cedula",
        "representante_estado_civil",
        "representante_profesion",
        "representante_domicilio",
        "fiador_estado_civil",
        "fiador_profesion",
        "fiador_domicilio",
    }
)
_SOLICITUD_EDITABLES = frozenset(
    {
        "estado",
        "token_hash",
        "token_expira_en",
        "enviada_en",
        "nota_revision",
        "correo_destino",
        "aprobada_por",
        "aprobada_en",
        "garantia_id",
        "datos_temporales",
        "url_cedula",
        "url_personeria",
        "respondida_en",
    }
)


def _update_sql(table: str, cambios: dict[str, Any], permitidas: frozenset[str], where: sql.Composable):
    desconocidas = set(cambios) - permitidas
    if desconocidas:
        raise ValueError(f"Columnas no editables: {sorted(desconocidas)}")
    sets = [sql.SQL("{} = {}").format(sql.Identifier(c), sql.Placeholder(c)) for c in cambios]
    sets.append(sql.SQL("updated_at = now()"))
    return sql.SQL("UPDATE {} SET {} WHERE {} RETURNING id").format(
        sql.Identifier(table), sql.SQL(", ").join(sets), where
    )


class PostgresAuditoriaLegalRepository(AuditoriaLegalRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def _all(self, query: Any, params: Any = None) -> list[Row]:
        with self._connection.cursor() as cursor:
            cursor.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

    def _one(self, query: Any, params: Any = None) -> Row | None:
        with self._connection.cursor() as cursor:
            cursor.execute(query, params)
            row = cursor.fetchone()
        return dict(row) if row else None

    def _exec(self, query: Any, params: Any = None) -> int:
        with self._connection.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.rowcount

    # ── Lecturas ───────────────────────────────────────────────────────
    def lista_garantias(self, analista_email: str | None) -> list[Row]:
        return self._all(_LISTA_SQL, (analista_email,))

    def clientes_sin_garantia(self, analista_email: str | None) -> list[Row]:
        return self._all(_SIN_GARANTIA_SQL, (analista_email,))

    def vendedores_activos(self) -> list[Row]:
        return self._all(_VENDEDORES_ACTIVOS_SQL)

    def vendedor(self, cod: str) -> Row | None:
        return self._one(_VENDEDOR_SQL, (cod,))

    def email_supervisor(self, cod: str) -> str | None:
        row = self._one(_SUPERVISOR_SQL, (cod,))
        return row["email"] if row else None

    def eventos(self, garantia_id: int) -> list[Row]:
        return self._all(_EVENTOS_SQL, (garantia_id,))

    def buscar_contribuyentes(self, texto: str) -> list[Row]:
        return self._all(_BUSCAR_SQL, (texto,))

    def saldo_contribuyente(self, contribuyente: str) -> Row | None:
        return self._one(_SALDO_SQL, (contribuyente,))

    def garantia_activa(self, contribuyente: str) -> Row | None:
        return self._one(_ACTIVA_SQL, (contribuyente,))

    def vendedores_por_contribuyente(self, contribuyente: str) -> list[Row]:
        return self._all(_VENDEDORES_CONTRIBUYENTE_SQL, (contribuyente,))

    def personas_legales(self, cedulas: list[str]) -> list[Row]:
        return self._all(_PERSONAS_SQL, (list(cedulas),))

    def config_valores(self, claves: tuple[str, ...]) -> dict[str, str]:
        return {row["clave"]: row["valor"] for row in self._all(_CONFIG_SQL, (list(claves),))}

    def contar_en_carpeta(self, mueble: str, gaveta: str, carpeta: int, excluir_id: int | None) -> int:
        row = self._one(_CONTAR_CARPETA_SQL, (mueble, gaveta, carpeta, excluir_id))
        return int(row["r"] or 0) if row else 0

    def siguiente_carpeta(self, mueble: str, gaveta: str, desde: int) -> int:
        row = self._one(_SIGUIENTE_CARPETA_SQL, (mueble, gaveta, desde))
        return int(row["r"]) if row and row["r"] is not None else desde

    def garantia(self, garantia_id: int) -> Row | None:
        return self._one(_GARANTIA_SQL, (garantia_id,))

    # ── Escrituras de garantías ────────────────────────────────────────
    def resolver_responsables(self, contribuyente: str) -> Row:
        return self._one(_RESOLVER_SQL, (contribuyente,)) or {
            "analista_email": None,
            "vendedor_cod": None,
            "hay_conflicto_analista": False,
        }

    def siguiente_consecutivo(self) -> str:
        row = self._one(_CONSECUTIVO_SQL)
        return str(row["r"]) if row else ""

    def desactivar_garantia(self, garantia_id: int) -> None:
        self._exec(_DESACTIVAR_SQL, (garantia_id,))

    def insertar_garantia(self, datos: dict[str, Any]) -> int:
        row = self._one(_INSERT_SQL, {c: datos.get(c) for c in _INSERT_COLUMNS})
        return int(row["id"])

    def vincular_reemplazo(self, anterior_id: int, nueva_id: int) -> None:
        self._exec(_VINCULAR_SQL, (nueva_id, anterior_id))

    def registrar_evento(
        self, garantia_id: int, tipo_evento: str, usuario_id: UUID, nota: str | None
    ) -> None:
        self._exec(_EVENTO_SQL, (garantia_id, tipo_evento, usuario_id, nota))

    def id_coordinador(self) -> UUID | None:
        row = self._one(_COORDINADOR_SQL)
        return row["id"] if row else None

    def crear_notificacion(self, usuario_id: UUID, tipo: str, titulo: str, mensaje: str, link: str) -> None:
        self._exec(_NOTIFICACION_SQL, (usuario_id, tipo, titulo, mensaje, link))

    def actualizar_garantia(self, garantia_id: int, cambios: dict[str, Any], *, sin_pagare: bool) -> bool:
        where = sql.SQL("id = %(id)s AND activo = true")
        if sin_pagare:
            where = sql.SQL("{} AND documento_pagare_generado_en IS NULL").format(where)
        query = _update_sql("tbl_garantias", cambios, _GARANTIA_EDITABLES, where)
        return self._exec(query, {**cambios, "id": garantia_id}) > 0

    def actualizar_custodia(self, garantia_id: int, estado_actual: str, cambios: dict[str, Any]) -> bool:
        where = sql.SQL("id = %(id)s AND estado_custodia = %(estado_actual)s")
        query = _update_sql("tbl_garantias", cambios, _CUSTODIA_EDITABLES, where)
        return self._exec(query, {**cambios, "id": garantia_id, "estado_actual": estado_actual}) > 0

    def set_documento(self, garantia_id: int, ruta: str) -> None:
        self._exec(_DOCUMENTO_SQL, (ruta, garantia_id))

    def generar_pagare(self, garantia_id: int, cambios: dict[str, Any]) -> bool:
        where = sql.SQL("id = %(id)s AND activo = true AND documento_pagare_generado_en IS NULL")
        query = _update_sql("tbl_garantias", cambios, _PAGARE_EDITABLES, where)
        return self._exec(query, {**cambios, "id": garantia_id}) > 0

    def upsert_persona_legal(self, persona: dict[str, Any]) -> None:
        params = {k: persona.get(k) for k in ("cedula", "nombre", "estado_civil", "profesion", "domicilio")}
        params.update(telefono=persona.get("telefono"), con_telefono="telefono" in persona)
        self._exec(_UPSERT_PERSONA_SQL, params)

    # ── Solicitudes de actualización ───────────────────────────────────
    def contar_solicitudes_desde(self, usuario_id: UUID, desde: datetime) -> int:
        row = self._one(_CONTAR_SOLICITUDES_SQL, (usuario_id, desde))
        return int(row["n"]) if row else 0

    def crear_solicitud(self, datos: dict[str, Any]) -> int | None:
        row = self._one(_CREAR_SOLICITUD_SQL, datos)
        return int(row["id"]) if row else None

    def solicitudes_seguimiento(self) -> list[Row]:
        return self._all(_SEGUIMIENTO_SQL, (_ESTADOS_SEGUIMIENTO,))

    def solicitud(self, solicitud_id: int) -> Row | None:
        return self._one(_SOLICITUD_SQL, (solicitud_id,))

    def solicitud_por_token_hash(self, token_hash: str) -> Row | None:
        return self._one(_POR_TOKEN_SQL, (token_hash,))

    def cambiar_estado_solicitud(
        self, solicitud_id: int, desde: tuple[str, ...], cambios: dict[str, Any]
    ) -> bool:
        where = sql.SQL("id = %(id)s AND estado = ANY(%(desde)s)")
        query = _update_sql("tbl_solicitudes_actualizacion", cambios, _SOLICITUD_EDITABLES, where)
        params = {**cambios, "id": solicitud_id, "desde": list(desde)}
        if "datos_temporales" in params and params["datos_temporales"] is not None:
            params["datos_temporales"] = Jsonb(params["datos_temporales"])
        return self._exec(query, params) > 0
