"""Configuración leída del entorno de la Lambda.

Solo referencias (nombres de secretos, endpoints, nombres de BD). Nunca secretos.
``AWS_REGION`` la inyecta el runtime de Lambda (es una variable reservada: no se define
en el template).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


class ConfigurationError(RuntimeError):
    """Falta una variable de entorno requerida."""


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ConfigurationError(f"Missing required environment variable: {name}")
    return value


def _csv(name: str) -> tuple[str, ...]:
    raw = os.environ.get(name, "")
    return tuple(item.strip() for item in raw.split(",") if item.strip())


@dataclass(frozen=True)
class DatabaseSettings:
    secret_name: str
    name: str
    host: str
    port: int
    sslmode: str
    connect_timeout: int
    schemas: tuple[str, ...]

    @classmethod
    def from_env(cls) -> DatabaseSettings:
        return cls(
            secret_name=_required("DB_SECRET_NAME"),
            name=_required("DB_NAME"),
            host=_required("DB_PROXY_ENDPOINT"),
            port=int(os.environ.get("DB_PORT", "5432")),
            sslmode=os.environ.get("DB_SSLMODE", "require"),
            connect_timeout=int(os.environ.get("DB_CONNECT_TIMEOUT", "5")),
            schemas=_csv("DB_SCHEMAS"),
        )


@dataclass(frozen=True)
class Settings:
    environment: str
    service_name: str
    aws_region: str
    log_level: str
    allowed_origins: tuple[str, ...]

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            environment=os.environ.get("ENVIRONMENT", "dev"),
            service_name=os.environ.get("SERVICE_NAME", "backend"),
            aws_region=os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "")),
            log_level=os.environ.get("LOG_LEVEL", "INFO").upper(),
            allowed_origins=_csv("ALLOWED_ORIGINS"),
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()


@lru_cache(maxsize=1)
def get_database_settings() -> DatabaseSettings:
    return DatabaseSettings.from_env()


def env(name: str, default: str | None = None, *, required: bool = False) -> str | None:
    """Lee una variable de entorno de referencia (nombre de bucket, URL de cola, etc.)."""
    if required:
        return _required(name)
    return os.environ.get(name, default)
