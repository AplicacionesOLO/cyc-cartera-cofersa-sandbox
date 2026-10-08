"""Adapter del modelo de lenguaje (Anthropic Messages API) vía HTTPS."""

from __future__ import annotations

import json

from application.ports.integraciones import IntegrationConfig, LanguageModel
from domain.exceptions import BusinessRuleViolation
from infrastructure.external.http_client import request

MESSAGES_URL = "https://api.anthropic.com/v1/messages"


class AnthropicLanguageModel(LanguageModel):
    def __init__(self, config: IntegrationConfig) -> None:
        self._config = config

    def complete(self, *, model: str, system: str | None, prompt: str, max_tokens: int) -> str:
        body: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            body["system"] = system
        status, raw = request(
            "POST",
            MESSAGES_URL,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "x-api-key": self._config.require("anthropic_api_key"),
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            timeout=28,
        )
        data = json.loads(raw.decode("utf-8") or "{}")
        if status != 200:
            raise BusinessRuleViolation("El servicio de IA no respondió correctamente.", code="ia_error")
        return "".join(
            part.get("text", "") for part in data.get("content") or [] if part.get("type") == "text"
        )
