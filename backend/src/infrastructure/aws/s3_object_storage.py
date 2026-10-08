"""Adapter S3 de ``ObjectStorage`` (URLs prefirmadas + put/get directo)."""

from __future__ import annotations

from application.ports.object_storage import ObjectStorage
from infrastructure.aws.s3_file_storage import S3FileStorage


class S3ObjectStorage(S3FileStorage, ObjectStorage):
    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        self._s3().put_object(Bucket=self._bucket, Key=key, Body=data, ContentType=content_type)

    def get_bytes(self, key: str) -> bytes | None:
        from botocore.exceptions import ClientError

        try:
            return self._s3().get_object(Bucket=self._bucket, Key=key)["Body"].read()
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise
