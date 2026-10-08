"""Adapter S3 de ``FileStorage``. Bucket privado; acceso solo por URLs prefirmadas."""

from __future__ import annotations

from typing import Any

from application.ports.file_storage import FileStorage, PresignedUpload, StoredObject


class S3FileStorage(FileStorage):
    def __init__(self, bucket: str, client: Any | None = None) -> None:
        self._bucket = bucket
        self._client = client

    def _s3(self) -> Any:
        if self._client is None:
            import boto3

            self._client = boto3.client("s3")
        return self._client

    def presign_upload(self, key: str, content_type: str, *, expires_in: int = 900) -> PresignedUpload:
        url = self._s3().generate_presigned_url(
            "put_object",
            Params={"Bucket": self._bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=expires_in,
        )
        return PresignedUpload(
            url=url, key=key, headers={"Content-Type": content_type}, expires_in=expires_in
        )

    def presign_download(self, key: str, *, expires_in: int = 900, download_name: str | None = None) -> str:
        params: dict[str, Any] = {"Bucket": self._bucket, "Key": key}
        if download_name:
            params["ResponseContentDisposition"] = f'attachment; filename="{download_name}"'
        return self._s3().generate_presigned_url("get_object", Params=params, ExpiresIn=expires_in)

    def delete(self, keys: list[str]) -> None:
        for start in range(0, len(keys), 1000):
            chunk = keys[start : start + 1000]
            if chunk:
                self._s3().delete_objects(
                    Bucket=self._bucket,
                    Delete={"Objects": [{"Key": key} for key in chunk], "Quiet": True},
                )

    def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self._s3().head_object(Bucket=self._bucket, Key=key)
            return True
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise

    def list(self, prefix: str, *, limit: int = 1000) -> list[StoredObject]:
        paginator = self._s3().get_paginator("list_objects_v2")
        items: list[StoredObject] = []
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                items.append(StoredObject(obj["Key"], obj.get("Size", 0), obj.get("LastModified")))
                if len(items) >= limit:
                    return items
        return items
