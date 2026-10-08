"""Reglas compartidas por los casos de uso: usuario actual, roles y parseo de parámetros.

En el origen cada API Route / Server Component hacía ``auth.getUser()`` + ``SELECT rol FROM usuarios
WHERE email ILIKE <email>`` y comparaba el rol. Aquí ese patrón queda en un solo lugar.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from application.dto.principal import Principal
from application.ports.app_unit_of_work import AppUnitOfWork
from domain.entities.usuario import COORDINADOR, Usuario
from domain.exceptions import ForbiddenError, UnauthorizedError, ValidationError

CR_OFFSET = timedelta(hours=-6)  # Costa Rica: UTC-6 todo el año (sin DST)

MSG_NO_AUTORIZADO = "No autorizado"
MSG_SOLO_COORDINADOR = "Acceso restringido al coordinador"
MSG_SOLO_LECTURA = "Su rol es de solo lectura"


def require_email(principal: Principal) -> str:
    email = (principal.email or str(principal.claims.get("email") or "")).strip()
    if not email:
        raise UnauthorizedError(MSG_NO_AUTORIZADO)
    return email


def require_usuario(uow: AppUnitOfWork, principal: Principal) -> Usuario:
    """Perfil activo del principal. Sin fila activa en ``usuarios`` no hay acceso (= /auth/denegado)."""
    usuario = uow.usuarios.find_activo_by_email(require_email(principal))
    if usuario is None:
        raise ForbiddenError(
            "Su cuenta no tiene acceso al SIC. Si considera que es un error, contacte al Coordinador de "
            "Crédito y Cobro.",
            code="acceso_denegado",
        )
    return usuario


def require_roles(usuario: Usuario, *roles: str, message: str = "Acceso denegado") -> Usuario:
    if usuario.rol not in roles:
        raise ForbiddenError(message)
    return usuario


def require_coordinador(usuario: Usuario, message: str = MSG_SOLO_COORDINADOR) -> Usuario:
    return require_roles(usuario, COORDINADOR, message=message)


def require_escritura(usuario: Usuario, message: str = MSG_SOLO_LECTURA) -> Usuario:
    """GERENCIA no crea/edita/aprueba (``esSoloLectura`` del front)."""
    if usuario.es_solo_lectura:
        raise ForbiddenError(message)
    return usuario


def analista_scope(usuario: Usuario, requested_email: str | None) -> str | None:
    """Email de analista al que se limita una consulta.

    Coordinador/Gerencia: el pedido (o None = todos). Resto: siempre su propio email
    (equivale a las políticas RLS ``analista_email = auth.email()``).
    """
    if usuario.es_global:
        email = (requested_email or "").strip()
        return email or None
    return usuario.email


def parse_uuid(raw: Any, field: str) -> UUID:
    try:
        return UUID(str(raw))
    except (TypeError, ValueError) as error:
        raise ValidationError(
            f"'{field}' no es un identificador válido.", details={"field": field}
        ) from error


def parse_int(raw: Any, field: str, *, minimum: int | None = None, maximum: int | None = None) -> int:
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError) as error:
        raise ValidationError(f"'{field}' debe ser numérico.", details={"field": field}) from error
    if minimum is not None and value < minimum:
        raise ValidationError(f"'{field}' debe ser >= {minimum}.", details={"field": field})
    if maximum is not None and value > maximum:
        raise ValidationError(f"'{field}' debe ser <= {maximum}.", details={"field": field})
    return value


def parse_optional_int(raw: Any, field: str, **limits: int) -> int | None:
    if raw in (None, ""):
        return None
    return parse_int(raw, field, **limits)


def parse_number(raw: Any, field: str, *, positive: bool = False) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError) as error:
        raise ValidationError(f"'{field}' debe ser un monto válido.", details={"field": field}) from error
    if positive and value <= 0:
        raise ValidationError(f"'{field}' debe ser mayor a cero.", details={"field": field})
    return value


def parse_date(raw: Any, field: str) -> date:
    try:
        return date.fromisoformat(str(raw)[:10])
    except (TypeError, ValueError) as error:
        raise ValidationError(
            f"'{field}' debe ser una fecha (AAAA-MM-DD).", details={"field": field}
        ) from error


def parse_optional_date(raw: Any, field: str) -> date | None:
    return None if raw in (None, "") else parse_date(raw, field)


def require_text(raw: Any, field: str, *, max_length: int | None = None, message: str | None = None) -> str:
    value = str(raw or "").strip()
    if not value:
        raise ValidationError(message or f"'{field}' es obligatorio.", details={"field": field})
    if max_length is not None and len(value) > max_length:
        raise ValidationError(f"'{field}' supera {max_length} caracteres.", details={"field": field})
    return value


def optional_text(raw: Any) -> str | None:
    value = str(raw).strip() if raw is not None else ""
    return value or None


def split_emails(raw: Any) -> tuple[str, ...]:
    """Para/CC separados por ``;`` o ``,`` (los inputs son type="text")."""
    if raw is None:
        return ()
    items = raw if isinstance(raw, (list, tuple)) else str(raw).replace(",", ";").split(";")
    return tuple(dict.fromkeys(str(item).strip() for item in items if str(item).strip()))


def ahora_cr() -> datetime:
    return datetime.now(UTC) + CR_OFFSET


def hoy_cr() -> date:
    """Fecha de hoy en Costa Rica (``hoyISO()`` del front)."""
    return ahora_cr().date()


def only_keys(body: dict[str, Any], allowed: tuple[str, ...]) -> dict[str, Any]:
    """Lista blanca de columnas editables (antes la imponían RLS / permisos de columna)."""
    return {key: body[key] for key in allowed if key in body}
