"""Port del directorio de usuarios del SIC (``tbl_usuarios``)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from domain.entities.usuario import Usuario


class UsuarioDirectory(ABC):
    @abstractmethod
    def find_activo_by_email(self, email: str) -> Usuario | None:
        """Perfil activo cuyo email coincide sin distinguir mayúsculas (``.ilike('email', x)``)."""

    @abstractmethod
    def find_by_id(self, usuario_id: UUID) -> Usuario | None: ...

    @abstractmethod
    def list_activos(self) -> list[Usuario]:
        """Usuarios activos ordenados por nombre."""

    @abstractmethod
    def list_analistas_con_cartera(self) -> list[dict[str, str]]:
        """``[{email, nombre}]`` activos elegibles por rol (ANALISTA, o ANALISTA_RIESGO con
        ``tiene_cartera_asignada``) que hoy tienen al menos un cliente en ``maestro_clientes``."""

    @abstractmethod
    def count_activos(self) -> int:
        """Usuarios activos (``totalEquipo`` del layout)."""

    @abstractmethod
    def ultima_sync_cartera(self) -> str:
        """``ejecutado_en`` más reciente de ``sync_log`` tipo cartera (ISO) o '' si no hay."""

    @abstractmethod
    def get_google_refresh_token(self, email: str) -> str | None: ...

    @abstractmethod
    def set_google_refresh_token(self, email: str, refresh_token: str) -> None: ...
