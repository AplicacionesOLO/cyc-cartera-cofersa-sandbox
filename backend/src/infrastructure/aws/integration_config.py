"""Configuración de integraciones leída de Secrets Manager.

Las claves viven como campos adicionales del secreto de la app (``DB_SECRET_NAME``), que es el único
secreto al que el rol de las Lambdas tiene ``GetSecretValue``:
``google_client_id``, ``google_client_secret``, ``anthropic_api_key``, ``bccr_token``, ``bccr_email``,
``ingesta_api_key``, ``n8n_webhook_pagos_url``, ``n8n_webhook_pedidos_retenidos_url``,
``email_coordinador``, ``app_url``. Ninguna se escribe en código ni en el template.
"""

from __future__ import annotations

from application.ports.integraciones import IntegrationConfig
from infrastructure.aws.secrets import get_secrets
from shared.settings import get_database_settings


class SecretsIntegrationConfig(IntegrationConfig):
    def __init__(self, secret_name: str | None = None) -> None:
        self._secret_name = secret_name

    def get(self, key: str) -> str | None:
        name = self._secret_name or get_database_settings().secret_name
        value = get_secrets().get_json(name).get(key)
        return str(value) if value not in (None, "") else None


class StaticIntegrationConfig(IntegrationConfig):
    """Para tests de integración y ejecución local."""

    def __init__(self, values: dict[str, str]) -> None:
        self._values = values

    def get(self, key: str) -> str | None:
        return self._values.get(key) or None
