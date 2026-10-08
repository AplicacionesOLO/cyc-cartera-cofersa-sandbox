"""Adaptador API Gateway (REST, proxy integration) → caso de uso → respuesta HTTP.

Mantiene los handlers delgados:

    @api_handler
    def handler(request: HttpRequest):
        principal = request.require_principal()
        return container.get_orders().execute(principal, request.query_int("page", 1))

- Devuelve 200 con el valor retornado (serializado como PostgREST), 204 si es ``None``, o
  el ``HttpResponse`` tal cual (``created``, ``accepted``, ``no_content``).
- Traduce ``DomainError`` a 4xx con cuerpo normalizado ``{"error": {code,title,message,details}}``.
- Errores inesperados → 500 genérico (el detalle solo va al log).
- CORS: devuelve ``Access-Control-Allow-Origin`` solo si el Origin está en ``ALLOWED_ORIGINS``.
"""

from __future__ import annotations

import base64
import json
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from functools import wraps
from typing import Any

from application.dto.principal import Principal
from domain.exceptions import (
    BusinessRuleViolation,
    ConflictError,
    DomainError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from shared.logging import get_logger
from shared.serialization import dumps
from shared.settings import get_settings

_logger = get_logger("http")

_STATUS_BY_ERROR: tuple[tuple[type[DomainError], int], ...] = (
    (ValidationError, 400),
    (UnauthorizedError, 401),
    (ForbiddenError, 403),
    (NotFoundError, 404),
    (ConflictError, 409),
    (BusinessRuleViolation, 422),
    (DomainError, 400),
)


@dataclass
class HttpResponse:
    status_code: int
    body: Any = None
    headers: dict[str, str] = field(default_factory=dict)


def created(body: Any) -> HttpResponse:
    return HttpResponse(201, body)


def accepted(body: Any = None) -> HttpResponse:
    return HttpResponse(202, body)


def no_content() -> HttpResponse:
    return HttpResponse(204)


def _parse_groups(raw: Any) -> frozenset[str]:
    if not raw:
        return frozenset()
    if isinstance(raw, (list, tuple, set)):
        return frozenset(str(item) for item in raw)
    text = str(raw).strip()
    if text.startswith("[") and text.endswith("]"):
        text = text[1:-1]
    separators = "," if "," in text else " "
    return frozenset(part.strip() for part in text.split(separators) if part.strip())


def principal_from_event(event: Mapping[str, Any]) -> Principal | None:
    authorizer = (event.get("requestContext") or {}).get("authorizer") or {}
    claims = authorizer.get("claims") or (authorizer.get("jwt") or {}).get("claims")
    if not claims or not claims.get("sub"):
        return None
    return Principal(
        subject=str(claims["sub"]),
        email=claims.get("email"),
        groups=_parse_groups(claims.get("cognito:groups")),
        claims={k: v for k, v in claims.items() if k not in {"at_hash", "origin_jti", "jti"}},
    )


@dataclass(frozen=True)
class HttpRequest:
    method: str
    path: str
    resource: str
    path_params: Mapping[str, str]
    query: Mapping[str, str]
    multi_query: Mapping[str, list[str]]
    headers: Mapping[str, str]
    raw_body: str | None
    principal: Principal | None
    request_id: str | None

    @classmethod
    def from_event(cls, event: Mapping[str, Any]) -> HttpRequest:
        raw_body = event.get("body")
        if raw_body is not None and event.get("isBase64Encoded"):
            raw_body = base64.b64decode(raw_body).decode("utf-8")
        headers = {str(k).lower(): v for k, v in (event.get("headers") or {}).items()}
        return cls(
            method=str(event.get("httpMethod") or "").upper(),
            path=str(event.get("path") or ""),
            resource=str(event.get("resource") or ""),
            path_params=event.get("pathParameters") or {},
            query=event.get("queryStringParameters") or {},
            multi_query=event.get("multiValueQueryStringParameters") or {},
            headers=headers,
            raw_body=raw_body,
            principal=principal_from_event(event),
            request_id=(event.get("requestContext") or {}).get("requestId"),
        )

    def require_principal(self) -> Principal:
        if self.principal is None:
            raise UnauthorizedError("Se requiere autenticación.")
        return self.principal

    def path_param(self, name: str) -> str:
        value = self.path_params.get(name)
        if value in (None, ""):
            raise ValidationError(f"Falta el parámetro de ruta '{name}'.")
        return str(value)

    def json_body(self) -> dict[str, Any]:
        body = self.json()
        if not isinstance(body, dict):
            raise ValidationError("El cuerpo debe ser un objeto JSON.")
        return body

    def json(self) -> Any:
        if self.raw_body in (None, ""):
            return None
        try:
            return json.loads(self.raw_body)
        except (TypeError, ValueError) as error:
            raise ValidationError("El cuerpo no es JSON válido.") from error

    def query_str(self, name: str, default: str | None = None) -> str | None:
        value = self.query.get(name)
        return default if value in (None, "") else str(value)

    def query_list(self, name: str) -> list[str]:
        values = self.multi_query.get(name)
        if values:
            return [item for value in values for item in str(value).split(",") if item]
        single = self.query.get(name)
        return [item for item in str(single).split(",") if item] if single else []

    def query_int(
        self,
        name: str,
        default: int | None = None,
        *,
        minimum: int | None = None,
        maximum: int | None = None,
    ) -> int | None:
        raw = self.query.get(name)
        if raw in (None, ""):
            return default
        try:
            value = int(str(raw))
        except ValueError as error:
            raise ValidationError(f"'{name}' debe ser un número entero.") from error
        if minimum is not None and value < minimum:
            raise ValidationError(f"'{name}' debe ser >= {minimum}.")
        if maximum is not None and value > maximum:
            raise ValidationError(f"'{name}' debe ser <= {maximum}.")
        return value

    def query_bool(self, name: str, default: bool = False) -> bool:
        raw = self.query.get(name)
        if raw in (None, ""):
            return default
        return str(raw).lower() in {"1", "true", "yes", "on"}


def _cors_headers(request_headers: Mapping[str, str]) -> dict[str, str]:
    allowed = get_settings().allowed_origins
    origin = request_headers.get("origin")
    if origin and (origin in allowed or "*" in allowed):
        return {"Access-Control-Allow-Origin": origin, "Vary": "Origin"}
    return {"Vary": "Origin"} if allowed else {}


def _error_body(error: DomainError) -> dict[str, Any]:
    return {
        "error": {
            "code": error.code,
            "title": error.title,
            "message": error.message,
            "details": error.details,
        }
    }


def _status_for(error: DomainError) -> int:
    for error_type, status in _STATUS_BY_ERROR:
        if isinstance(error, error_type):
            return status
    return 400


def to_api_gateway(response: HttpResponse, request_headers: Mapping[str, str]) -> dict[str, Any]:
    headers = {"Content-Type": "application/json", **_cors_headers(request_headers), **response.headers}
    body = "" if response.body is None and response.status_code == 204 else dumps(response.body)
    return {"statusCode": response.status_code, "headers": headers, "body": body}


PrincipalResolver = Callable[[Principal], Principal]


def api_handler(
    func: Callable[[HttpRequest], Any] | None = None,
    *,
    principal_resolver: PrincipalResolver | None = None,
) -> Any:
    """Decorador de handlers HTTP.

    ``principal_resolver``: función ``Principal -> Principal`` que lo completa (p. ej.
    ``container.resolve_principal`` resuelve ``user_id`` desde ``tbl_app_users``). Debe
    inicializar sus dependencias de forma perezosa (no al importar el módulo).
    """

    def decorator(inner: Callable[[HttpRequest], Any]) -> Callable[[dict, Any], dict]:
        @wraps(inner)
        def wrapper(event: dict, context: Any = None) -> dict:
            started = time.perf_counter()
            request = HttpRequest.from_event(event)
            status = 500
            try:
                if principal_resolver is not None and request.principal is not None:
                    request = replace(request, principal=principal_resolver(request.principal))
                result = inner(request)
                response = (
                    result
                    if isinstance(result, HttpResponse)
                    else (no_content() if result is None else HttpResponse(200, result))
                )
                status = response.status_code
                return to_api_gateway(response, request.headers)
            except DomainError as error:
                status = _status_for(error)
                if status >= 500:
                    _logger.error("domain error", extra={"code": error.code})
                return to_api_gateway(HttpResponse(status, _error_body(error)), request.headers)
            except Exception:
                _logger.exception("unhandled error", extra={"path": request.resource or request.path})
                status = 500
                body = {
                    "error": {
                        "code": "internal_error",
                        "title": "Error interno",
                        "message": "Ocurrió un error inesperado.",
                        "details": {},
                    }
                }
                return to_api_gateway(HttpResponse(500, body), request.headers)
            finally:
                _logger.info(
                    "request",
                    extra={
                        "method": request.method,
                        "resource": request.resource or request.path,
                        "status": status,
                        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                        "request_id": request.request_id,
                    },
                )

        return wrapper

    if func is not None:
        return decorator(func)
    return decorator
