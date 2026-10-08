"""Port para encolar trabajo asíncrono (la API responde 202 y un worker SQS procesa)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class MessageQueue(ABC):
    @abstractmethod
    def send(
        self,
        body: dict[str, Any],
        *,
        group_id: str | None = None,
        deduplication_id: str | None = None,
    ) -> str:
        """Encola ``body`` (JSON) y devuelve el MessageId."""
