"""Port de almacenamiento de archivos (S3 detrás de un port)."""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime

from domain.exceptions import ValidationError

_SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9._\-() ]+$")


def safe_key(*segments: str) -> str:
    """Construye una key S3 sin permitir traversal (``..``), rutas absolutas ni vacíos."""
    parts: list[str] = []
    for segment in segments:
        for part in str(segment).split("/"):
            if part in ("", ".", "..") or not _SAFE_SEGMENT.match(part):
                raise ValidationError("Nombre de archivo o ruta no válida.", details={"segment": part})
            parts.append(part)
    return "/".join(parts)


@dataclass(frozen=True)
class PresignedUpload:
    url: str
    key: str
    method: str = "PUT"
    headers: dict[str, str] = field(default_factory=dict)
    expires_in: int = 900


@dataclass(frozen=True)
class StoredObject:
    key: str
    size: int
    last_modified: datetime | None
    content_type: str | None = None


class FileStorage(ABC):
    @abstractmethod
    def presign_upload(self, key: str, content_type: str, *, expires_in: int = 900) -> PresignedUpload: ...

    @abstractmethod
    def presign_download(
        self, key: str, *, expires_in: int = 900, download_name: str | None = None
    ) -> str: ...

    @abstractmethod
    def delete(self, keys: list[str]) -> None: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def list(self, prefix: str, *, limit: int = 1000) -> list[StoredObject]: ...
