"""Traducción de errores de PostgreSQL a errores de dominio."""

from __future__ import annotations

import psycopg
from psycopg import errors as pg

from domain.exceptions import (
    BusinessRuleViolation,
    ConflictError,
    DomainError,
    ForbiddenError,
    ValidationError,
)


def translate_db_error(error: BaseException) -> DomainError | None:
    if not isinstance(error, psycopg.Error):
        return None
    diag = getattr(error, "diag", None)
    constraint = getattr(diag, "constraint_name", None)
    details = {"constraint": constraint} if constraint else {}
    if isinstance(error, pg.UniqueViolation):
        return ConflictError("El registro ya existe.", details=details)
    if isinstance(error, pg.ForeignKeyViolation):
        return ConflictError("La operación viola una referencia entre registros.", details=details)
    if isinstance(error, (pg.CheckViolation, pg.NotNullViolation, pg.InvalidTextRepresentation)):
        return ValidationError("Los datos no cumplen las reglas de la base de datos.", details=details)
    if isinstance(error, pg.InsufficientPrivilege):
        return ForbiddenError("Operación no permitida.")
    if isinstance(error, pg.RaiseException):
        # RAISE EXCEPTION desde funciones/triggers migrados: se conserva el mensaje que veía la UI
        message = getattr(diag, "message_primary", None) or str(error)
        return BusinessRuleViolation(message)
    return None
