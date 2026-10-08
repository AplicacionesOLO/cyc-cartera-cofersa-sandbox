"""Port del directorio de usuarios de la aplicación (espejo del directorio de usuarios de origen)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Protocol, Self
from uuid import UUID


class AppUserRepository(ABC):
    @abstractmethod
    def find_id_by_subject(self, subject: str) -> UUID | None:
        """Id de ``tbl_app_users`` para el ``sub`` de Cognito, o None."""

    @abstractmethod
    def link_or_create(self, subject: str, verified_email: str | None) -> tuple[UUID, bool]:
        """Vincula un usuario migrado (mismo email verificado, sin ``cognito_sub``) o crea
        uno nuevo. Devuelve ``(id, creado)``. Debe ser idempotente ante concurrencia."""


class HasAppUsers(Protocol):
    app_users: AppUserRepository

    def commit(self) -> None: ...

    def __enter__(self) -> Self: ...

    def __exit__(self, exc_type, exc, tb) -> None: ...
