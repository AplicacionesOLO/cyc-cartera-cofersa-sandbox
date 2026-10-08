from __future__ import annotations

import json
from typing import Any

from application.ports.message_queue import MessageQueue
from shared.serialization import to_jsonable


class SqsMessageQueue(MessageQueue):
    def __init__(self, queue_url: str, client: Any | None = None) -> None:
        self._queue_url = queue_url
        self._client = client

    def _sqs(self) -> Any:
        if self._client is None:
            import boto3

            self._client = boto3.client("sqs")
        return self._client

    def send(self, body, *, group_id=None, deduplication_id=None) -> str:
        params: dict[str, Any] = {
            "QueueUrl": self._queue_url,
            "MessageBody": json.dumps(to_jsonable(body), ensure_ascii=False),
        }
        if group_id:
            params["MessageGroupId"] = group_id
        if deduplication_id:
            params["MessageDeduplicationId"] = deduplication_id
        return self._sqs().send_message(**params)["MessageId"]
