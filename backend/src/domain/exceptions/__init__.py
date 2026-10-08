"""Excepciones de dominio. Puras: sin dependencias de infraestructura."""

from __future__ import annotations

from typing import Any


class DomainError(Exception):
    """Error de negocio base. El adaptador HTTP lo traduce a una respuesta 4xx."""

    code = "domain_error"
    title = "Operación no válida"

    def __init__(
        self,
        message: str,
        *,
        details: dict[str, Any] | None = None,
        code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}
        if code:
            self.code = code


class ValidationError(DomainError):
    code = "validation_error"
    title = "Datos inválidos"


class NotFoundError(DomainError):
    code = "not_found"
    title = "No encontrado"


class ConflictError(DomainError):
    code = "conflict"
    title = "Conflicto"


class UnauthorizedError(DomainError):
    code = "unauthorized"
    title = "No autenticado"


class ForbiddenError(DomainError):
    code = "forbidden"
    title = "Acceso denegado"


class BusinessRuleViolation(DomainError):
    code = "business_rule_violation"
    title = "Regla de negocio"


__all__ = [
    "BusinessRuleViolation",
    "ConflictError",
    "DomainError",
    "ForbiddenError",
    "NotFoundError",
    "UnauthorizedError",
    "ValidationError",
]
