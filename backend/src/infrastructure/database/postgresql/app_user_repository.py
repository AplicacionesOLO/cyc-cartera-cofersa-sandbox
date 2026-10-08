"""Adapter PostgreSQL de ``AppUserRepository`` sobre ``tbl_app_users``."""

from __future__ import annotations

from uuid import UUID

import psycopg

from application.ports.app_user_repository import AppUserRepository

_LINK_OR_CREATE_SQL = """
WITH candidate AS (
    SELECT id FROM tbl_app_users
    WHERE cognito_sub IS NULL AND %(email)s::text IS NOT NULL AND lower(email) = lower(%(email)s)
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE
), linked AS (
    UPDATE tbl_app_users u SET cognito_sub = %(sub)s, updated_at = now()
    FROM candidate c WHERE u.id = c.id
    RETURNING u.id, false AS created
), inserted AS (
    INSERT INTO tbl_app_users (cognito_sub, email)
    SELECT %(sub)s, %(email)s WHERE NOT EXISTS (SELECT 1 FROM linked)
    ON CONFLICT (cognito_sub) DO UPDATE SET updated_at = now()
    RETURNING id, (xmax = 0) AS created
)
SELECT id, created FROM linked
UNION ALL
SELECT id, created FROM inserted
"""


class PostgresAppUserRepository(AppUserRepository):
    def __init__(self, connection: psycopg.Connection) -> None:
        self._connection = connection

    def find_id_by_subject(self, subject: str) -> UUID | None:
        with self._connection.cursor() as cursor:
            cursor.execute("SELECT id FROM tbl_app_users WHERE cognito_sub = %s", (subject,))
            row = cursor.fetchone()
        return row["id"] if row else None

    def link_or_create(self, subject: str, verified_email: str | None) -> tuple[UUID, bool]:
        with self._connection.cursor() as cursor:
            cursor.execute(_LINK_OR_CREATE_SQL, {"sub": subject, "email": verified_email})
            row = cursor.fetchone()
        return row["id"], bool(row["created"])
