"""Idempotencia con DynamoDB + TTL (estándar: PK messageId, atributo expires_at ~24 h)."""

from __future__ import annotations

import time
from typing import Any

from application.ports.idempotency_store import IdempotencyStore


class DynamoDbIdempotencyStore(IdempotencyStore):
    def __init__(self, table_name: str, *, ttl_seconds: int = 86400, client: Any | None = None) -> None:
        self._table = table_name
        self._ttl = ttl_seconds
        self._client = client

    def _ddb(self) -> Any:
        if self._client is None:
            import boto3

            self._client = boto3.client("dynamodb")
        return self._client

    def claim(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self._ddb().put_item(
                TableName=self._table,
                Item={"messageId": {"S": key}, "expires_at": {"N": str(int(time.time()) + self._ttl)}},
                ConditionExpression="attribute_not_exists(messageId)",
            )
            return True
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                return False
            raise

    def release(self, key: str) -> None:
        self._ddb().delete_item(TableName=self._table, Key={"messageId": {"S": key}})
