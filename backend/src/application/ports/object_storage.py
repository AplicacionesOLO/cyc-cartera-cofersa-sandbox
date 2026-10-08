"""Almacenamiento con lectura/escritura directa desde el backend (además de URLs prefirmadas).

Lo usan los casos de uso que en el origen hacían ``storage.from(bucket).upload/download`` desde una
API Route (p. ej. adjuntar un documento ya cargado a un correo, o subir un PDF generado).
"""

from __future__ import annotations

from abc import abstractmethod

from application.ports.file_storage import FileStorage


class ObjectStorage(FileStorage):
    @abstractmethod
    def put_bytes(self, key: str, data: bytes, content_type: str) -> None: ...

    @abstractmethod
    def get_bytes(self, key: str) -> bytes | None:
        """Contenido del objeto, o None si no existe."""
