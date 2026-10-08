"""Lectura de Secrets Manager con cache en memoria (warm start) y TTL.

La Lambda recibe solo el NOMBRE del secreto (``DB_SECRET_NAME``); el valor se obtiene en
runtime y se cachea. Tras una rotación, ``invalidate`` fuerza la relectura.
"""

from __future__ import annotations

import json
import os
import threading
import time
from collections.abc import Callable
from typing import Any


class SecretsManagerSecrets:
    def __init__(
        self,
        client: Any | None = None,
        *,
        ttl_seconds: float | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._client = client
        self._ttl = (
            ttl_seconds
            if ttl_seconds is not None
            else float(os.environ.get("SECRET_CACHE_TTL_SECONDS", "300"))
        )
        self._clock = clock
        self._cache: dict[str, tuple[float, str]] = {}
        self._lock = threading.Lock()

    def _secrets_client(self) -> Any:
        if self._client is None:
            import boto3  # import diferido: el dominio y los tests unitarios no lo necesitan

            self._client = boto3.client("secretsmanager")
        return self._client

    def get_string(self, name: str) -> str:
        now = self._clock()
        with self._lock:
            cached = self._cache.get(name)
            if cached and cached[0] > now:
                return cached[1]
        response = self._secrets_client().get_secret_value(SecretId=name)
        value = response.get("SecretString")
        if value is None:
            raise ValueError(f"Secret {name!r} has no SecretString")
        with self._lock:
            self._cache[name] = (now + self._ttl, value)
        return value

    def get_json(self, name: str) -> dict[str, Any]:
        data = json.loads(self.get_string(name))
        if not isinstance(data, dict):
            raise ValueError(f"Secret {name!r} is not a JSON object")
        return data

    def invalidate(self, name: str | None = None) -> None:
        with self._lock:
            if name is None:
                self._cache.clear()
            else:
                self._cache.pop(name, None)


_default: SecretsManagerSecrets | None = None


def get_secrets() -> SecretsManagerSecrets:
    global _default
    if _default is None:
        _default = SecretsManagerSecrets()
    return _default
