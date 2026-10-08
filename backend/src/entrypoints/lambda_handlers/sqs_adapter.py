"""Adaptador de eventos SQS con el patrón del estándar:
idempotencia (claim) + ReportBatchItemFailures (solo los fallidos vuelven a la cola).

    @sqs_batch_handler(idempotency=lambda: container.idempotency_store())
    def handler(message: dict, record: dict) -> None:
        container.process_order().execute(OrderCommand.from_message(message))

No implementar reintentos manuales: SQS reintenta (maxReceiveCount >= 5) y luego DLQ.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from functools import wraps
from typing import Any

from application.ports.idempotency_store import IdempotencyStore
from shared.logging import get_logger

_logger = get_logger("sqs")


def sqs_batch_handler(
    func: Callable[[Any, dict], None] | None = None,
    *,
    idempotency: Callable[[], IdempotencyStore] | None = None,
) -> Any:
    def decorator(process: Callable[[Any, dict], None]) -> Callable[[dict, Any], dict]:
        @wraps(process)
        def wrapper(event: dict, context: Any = None) -> dict:
            store = idempotency() if idempotency else None
            failures: list[dict[str, str]] = []
            for record in event.get("Records", []):
                message_id = record["messageId"]
                claimed = False
                try:
                    if store is not None:
                        claimed = store.claim(message_id)
                        if not claimed:
                            _logger.info("duplicate message skipped", extra={"message_id": message_id})
                            continue
                    body = record.get("body")
                    try:
                        message = json.loads(body) if body else None
                    except ValueError:
                        message = body
                    process(message, record)
                except Exception:
                    _logger.exception("message processing failed", extra={"message_id": message_id})
                    if store is not None and claimed:
                        try:
                            store.release(message_id)
                        except Exception:
                            _logger.exception("could not release claim", extra={"message_id": message_id})
                    failures.append({"itemIdentifier": message_id})
            return {"batchItemFailures": failures}

        return wrapper

    if func is not None:
        return decorator(func)
    return decorator
