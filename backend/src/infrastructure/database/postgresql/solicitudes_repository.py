"""Adapter PostgreSQL del módulo Solicitudes."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from application.ports.solicitudes import SolicitudesRepository

_LIST_SQL = "SELECT * FROM tbl_solicitudes ORDER BY created_at DESC"
_LIST_PROPIAS_SQL = "SELECT * FROM tbl_solicitudes WHERE solicitante_id = %s ORDER BY created_at DESC"
_FIND_SQL = "SELECT * FROM tbl_solicitudes WHERE id = %s LIMIT 1"
_INSERT_COLUMNS = (
    "tipo",
    "area",
    "destinatario",
    "cliente_cod",
    "cliente_nombre",
    "solicitante_id",
    "gestion_id",
    "justificacion",
    "descripcion",
    "observaciones_internas",
    "prioridad",
    "sla_horas",
    "sla_vencimiento",
    "responsable_nombre",
    "responsable_email",
    "para_email",
    "cc_emails",
    "datos",
    "monto_actual",
    "monto_solicitado",
    "monto",
    "motivo_nota",
    "documento_ref",
    "fecha_limite",
    "estado",
)
_INSERT_SQL = (
    f"INSERT INTO tbl_solicitudes ({', '.join(_INSERT_COLUMNS)}, updated_at) "
    f"VALUES ({', '.join(f'%({c})s' for c in _INSERT_COLUMNS)}, now()) "
    "RETURNING id, numero_consecutivo"
)
_UPDATE_ESTADO_SQL = "UPDATE tbl_solicitudes SET estado = %s, updated_at = now() WHERE id = %s"
_RESOLVER_SQL = """
UPDATE tbl_solicitudes
SET estado = %s, comentario_revisor = %s, revisor_id = %s, updated_at = now()
WHERE id = %s
"""
_LIST_COMENTARIOS_SQL = """
SELECT * FROM tbl_solicitud_comentarios WHERE solicitud_id = %s ORDER BY created_at ASC
"""
_INSERT_COMENTARIO_SQL = """
INSERT INTO tbl_solicitud_comentarios (solicitud_id, usuario_id, contenido)
VALUES (%s, %s, %s)
RETURNING id, contenido, created_at
"""
_LIST_HISTORIAL_SQL = """
SELECT * FROM tbl_solicitud_historial_estados WHERE solicitud_id = %s ORDER BY created_at DESC
"""
_INSERT_HISTORIAL_SQL = """
INSERT INTO tbl_solicitud_historial_estados (solicitud_id, estado_anterior, estado_nuevo, usuario_id, nota)
VALUES (%s, %s, %s, %s, %s)
"""
_INSERT_NOTIFICACION_SQL = """
INSERT INTO tbl_notificaciones (usuario_id, tipo, titulo, mensaje, leida, link, created_at)
VALUES (%s, %s, %s, %s, false, %s, now())
"""
_COORDINADOR_SQL = "SELECT id FROM tbl_usuarios WHERE rol = 'COORDINADOR' ORDER BY created_at LIMIT 1"
_EXISTE_EMAIL_SQL = "SELECT 1 AS x FROM tbl_usuarios WHERE lower(email) = lower(%s) LIMIT 1"
_NOMBRES_SQL = "SELECT id, nombre FROM tbl_usuarios WHERE id = ANY(%s)"
_NOMBRES_EMAIL_SQL = "SELECT email, nombre FROM tbl_usuarios WHERE email = ANY(%s)"
_GESTION_SQL = """
SELECT id, resultado, nota, tipo, fecha, cliente_cod FROM tbl_gestiones WHERE id = %s LIMIT 1
"""
_CARTERA_RESUMEN_SQL = """
SELECT cliente_cod, cliente_nombre, contribuyente, vendedor_nombre,
       mora_1_30, mora_31_60, mora_61_90, mora_91_120, mora_120_plus
FROM tbl_cartera
ORDER BY cliente_nombre ASC
"""
_MAESTRO_RESUMEN_SQL = """
SELECT cliente_cod, analista_email, limite_credito, estado_manual FROM tbl_maestro_clientes
"""
_MAESTRO_RESUMEN_ANALISTA_SQL = _MAESTRO_RESUMEN_SQL + " WHERE analista_email = %s"
_CARTERA_SQL = "SELECT * FROM tbl_cartera WHERE cliente_cod = %s LIMIT 1"
_MAESTRO_SQL = "SELECT * FROM tbl_maestro_clientes WHERE cliente_cod = %s LIMIT 1"
_FACTURAS_SQL = """
SELECT * FROM tbl_facturas
WHERE contribuyente = %s AND saldo > 0
ORDER BY saldo DESC
LIMIT %s
"""


class PostgresSolicitudesRepository(SolicitudesRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def _all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            return [dict(row) for row in cursor.fetchall()]

    def _one(self, sql: str, params: tuple[Any, ...]) -> dict[str, Any] | None:
        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            row = cursor.fetchone()
        return dict(row) if row else None

    def _execute(self, sql: str, params: tuple[Any, ...]) -> None:
        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)

    # ── Solicitudes ────────────────────────────────────────────────────────
    def list_solicitudes(self, solicitante_id: UUID | None) -> list[dict[str, Any]]:
        if solicitante_id is None:
            return self._all(_LIST_SQL)
        return self._all(_LIST_PROPIAS_SQL, (solicitante_id,))

    def find_solicitud(self, solicitud_id: UUID) -> dict[str, Any] | None:
        return self._one(_FIND_SQL, (solicitud_id,))

    def insert_solicitud(self, values: dict[str, Any]) -> dict[str, Any]:
        params = {column: values.get(column) for column in _INSERT_COLUMNS}
        if params["datos"] is not None:
            params["datos"] = Jsonb(params["datos"])
        if params["cc_emails"] is not None:
            params["cc_emails"] = list(params["cc_emails"])
        with self._connection.cursor() as cursor:
            cursor.execute(_INSERT_SQL, params)
            return dict(cursor.fetchone())

    def update_estado(self, solicitud_id: UUID, estado: str) -> None:
        self._execute(_UPDATE_ESTADO_SQL, (estado, solicitud_id))

    def resolver_solicitud(
        self, solicitud_id: UUID, estado: str, comentario: str | None, revisor_id: UUID | None
    ) -> None:
        self._execute(_RESOLVER_SQL, (estado, comentario, revisor_id, solicitud_id))

    # ── Comentarios e historial ─────────────────────────────────────────────
    def list_comentarios(self, solicitud_id: UUID) -> list[dict[str, Any]]:
        return self._all(_LIST_COMENTARIOS_SQL, (solicitud_id,))

    def insert_comentario(self, solicitud_id: UUID, usuario_id: UUID, contenido: str) -> dict[str, Any]:
        row = self._one(_INSERT_COMENTARIO_SQL, (solicitud_id, usuario_id, contenido))
        assert row is not None
        return row

    def list_historial(self, solicitud_id: UUID) -> list[dict[str, Any]]:
        return self._all(_LIST_HISTORIAL_SQL, (solicitud_id,))

    def insert_historial(
        self,
        solicitud_id: UUID,
        estado_anterior: str | None,
        estado_nuevo: str,
        usuario_id: UUID,
        nota: str | None,
    ) -> None:
        self._execute(_INSERT_HISTORIAL_SQL, (solicitud_id, estado_anterior, estado_nuevo, usuario_id, nota))

    # ── Notificaciones internas y usuarios ──────────────────────────────────
    def insert_notificacion(
        self, usuario_id: UUID, tipo: str, titulo: str, mensaje: str | None, link: str | None
    ) -> None:
        self._execute(_INSERT_NOTIFICACION_SQL, (usuario_id, tipo, titulo, mensaje, link))

    def find_coordinador_id(self) -> UUID | None:
        row = self._one(_COORDINADOR_SQL, ())
        return row["id"] if row else None

    def existe_usuario_email(self, email: str) -> bool:
        return self._one(_EXISTE_EMAIL_SQL, (email,)) is not None

    def nombres_usuarios(self, ids: list[UUID]) -> dict[str, str]:
        if not ids:
            return {}
        return {str(row["id"]): row["nombre"] for row in self._all(_NOMBRES_SQL, (list(ids),))}

    def nombres_por_email(self, emails: list[str]) -> dict[str, str]:
        if not emails:
            return {}
        return {row["email"]: row["nombre"] for row in self._all(_NOMBRES_EMAIL_SQL, (list(emails),))}

    # ── Lecturas de apoyo ───────────────────────────────────────────────────
    def find_gestion(self, gestion_id: UUID) -> dict[str, Any] | None:
        return self._one(_GESTION_SQL, (gestion_id,))

    def list_cartera_resumen(self) -> list[dict[str, Any]]:
        return self._all(_CARTERA_RESUMEN_SQL)

    def list_maestro_resumen(self, analista_email: str | None) -> list[dict[str, Any]]:
        if analista_email is None:
            return self._all(_MAESTRO_RESUMEN_SQL)
        return self._all(_MAESTRO_RESUMEN_ANALISTA_SQL, (analista_email,))

    def find_cartera(self, cliente_cod: str) -> dict[str, Any] | None:
        return self._one(_CARTERA_SQL, (cliente_cod,))

    def find_maestro(self, cliente_cod: str) -> dict[str, Any] | None:
        return self._one(_MAESTRO_SQL, (cliente_cod,))

    def list_facturas_pendientes(self, contribuyente: str, limit: int = 100) -> list[dict[str, Any]]:
        return self._all(_FACTURAS_SQL, (contribuyente, limit))
