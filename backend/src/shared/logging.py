"""Logging estructurado JSON con redacción de datos sensibles.

En Lambda (``LoggingConfig.LogFormat: JSON``) el runtime ya emite JSON: aquí solo se
agrega el filtro de redacción. Fuera de Lambda (tests, local) se instala un formateador
JSON equivalente.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import UTC, datetime
from typing import Any

REDACTED = "***"
SENSITIVE_KEYS = frozenset(
    {
        "password",
        "passwd",
        "pass",
        "secret",
        "client_secret",
        "token",
        "access_token",
        "id_token",
        "refresh_token",
        "authorization",
        "api_key",
        "apikey",
        "x-api-key",
        "cookie",
        "set-cookie",
        "connection_string",
        "dsn",
        "database_url",
        "service_role_key",
    }
)

_STANDARD_ATTRS = frozenset(logging.LogRecord("x", 0, "x", 0, "x", None, None).__dict__.keys()) | {
    "message",
    "asctime",
}


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: (REDACTED if str(key).lower() in SENSITIVE_KEYS else redact(item))
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return type(value)(redact(item) for item in value)
    return value


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        for key in list(record.__dict__):
            if key in _STANDARD_ATTRS:
                continue
            if key.lower() in SENSITIVE_KEYS:
                record.__dict__[key] = REDACTED
            else:
                record.__dict__[key] = redact(record.__dict__[key])
        if isinstance(record.args, dict):
            record.args = redact(record.args)
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _STANDARD_ATTRS and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


_configured = False


def _configure() -> None:
    global _configured
    if _configured:
        return
    _configured = True
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    root = logging.getLogger()
    if not os.environ.get("AWS_LAMBDA_FUNCTION_NAME") and not root.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        root.addHandler(handler)
    root.setLevel(level)


def get_logger(name: str) -> logging.Logger:
    _configure()
    logger = logging.getLogger(name)
    if not any(isinstance(f, RedactingFilter) for f in logger.filters):
        logger.addFilter(RedactingFilter())
    return logger
