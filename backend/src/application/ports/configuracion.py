"""Port del módulo Configuración: catálogos (usuarios, vendedores, supervisores, directorio, rutas de
portafolio acotado), ``config_sistema``, cierre de mes, log de auditoría y feed de automatizaciones.

Las filas se devuelven como ``dict`` con las mismas columnas que seleccionaba el origen.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any
from uuid import UUID

Row = dict[str, Any]


class ConfiguracionRepository(ABC):
    # ── usuarios ──────────────────────────────────────────────────────
    @abstractmethod
    def list_usuarios(self) -> list[Row]:
        """Todos los usuarios (activos e inactivos) por nombre, sin el refresh token de Google."""

    @abstractmethod
    def get_usuario(self, usuario_id: UUID) -> Row | None: ...

    @abstractmethod
    def insert_usuario(self, data: Row) -> Row: ...

    @abstractmethod
    def update_usuario(self, usuario_id: UUID, changes: Row) -> Row | None: ...

    # ── vendedores ────────────────────────────────────────────────────
    @abstractmethod
    def list_vendedores(self, *, solo_activos: bool) -> list[Row]: ...

    @abstractmethod
    def get_vendedor(self, cod: str) -> Row | None: ...

    @abstractmethod
    def insert_vendedor(self, data: Row) -> Row: ...

    @abstractmethod
    def update_vendedor(self, cod: str, changes: Row) -> Row | None:
        """Al cambiar ``analista_email`` el trigger de Aurora propaga la asignación a maestro_clientes."""

    @abstractmethod
    def contar_clientes_por_vendedor(self) -> dict[str, int]: ...

    @abstractmethod
    def ruta_activa_de_principal(self, cod: str) -> str | None:
        """``nombre_ruta`` de la ruta activa cuyo principal es ``cod`` (o None)."""

    # ── supervisores ──────────────────────────────────────────────────
    @abstractmethod
    def list_supervisores(self, *, solo_activos: bool = False) -> list[Row]: ...

    @abstractmethod
    def get_supervisor(self, cod: str) -> Row | None: ...

    @abstractmethod
    def insert_supervisor(self, data: Row) -> Row: ...

    @abstractmethod
    def update_supervisor(self, cod: str, changes: Row) -> Row | None: ...

    @abstractmethod
    def vendedores_activos_de_supervisor(self, cod: str) -> list[Row]: ...

    # ── directorio ────────────────────────────────────────────────────
    @abstractmethod
    def list_directorio(self, *, area: str | None, q: str | None) -> list[Row]:
        """Activos e inactivos (el tab filtra en el cliente), por nombre."""

    @abstractmethod
    def list_contactos_activos(self, *, q: str | None, area: str | None, limit: int | None) -> list[Row]:
        """Contactos activos del directorio (autocomplete de correos para todos los usuarios)."""

    @abstractmethod
    def get_contacto(self, contacto_id: UUID) -> Row | None: ...

    @abstractmethod
    def insert_contacto(self, data: Row) -> Row: ...

    @abstractmethod
    def update_contacto(self, contacto_id: UUID, changes: Row) -> Row | None: ...

    # ── portafolio acotado ────────────────────────────────────────────
    @abstractmethod
    def list_grupos(self) -> list[Row]: ...

    @abstractmethod
    def list_miembros(self, principal_cod: str | None = None) -> list[Row]: ...

    @abstractmethod
    def get_grupo(self, principal_cod: str) -> Row | None: ...

    @abstractmethod
    def upsert_grupo(self, principal_cod: str, nombre_ruta: str, rol_funcional: str | None) -> None:
        """Crea o reactiva la ruta (``activo = true``)."""

    @abstractmethod
    def update_grupo(self, principal_cod: str, changes: Row) -> None: ...

    @abstractmethod
    def activar_miembros(self, principal_cod: str, vendedor_cods: list[str]) -> None: ...

    @abstractmethod
    def desactivar_miembros(self, principal_cod: str, vendedor_cods: list[str]) -> None: ...

    # ── config_sistema ────────────────────────────────────────────────
    @abstractmethod
    def list_config(self, *, claves: tuple[str, ...] | None = None, prefijo: str | None = None) -> list[Row]:
        """Filas ``{clave, valor, descripcion}``; sin filtros = todas."""

    @abstractmethod
    def get_config_valor(self, clave: str) -> str | None: ...

    @abstractmethod
    def upsert_config(self, valores: dict[str, str]) -> list[Row]: ...

    # ── cierre de mes ─────────────────────────────────────────────────
    @abstractmethod
    def list_ventas_mensuales(self, limit: int) -> list[Row]: ...

    @abstractmethod
    def get_venta_mensual(self, anio: int, mes: int) -> Row | None: ...

    @abstractmethod
    def upsert_venta_mensual(
        self, anio: int, mes: int, total_ventas_sin_iva: float, cartera_total_mes: float | None
    ) -> Row: ...

    # ── log de auditoría ──────────────────────────────────────────────
    @abstractmethod
    def list_audit_log(
        self,
        *,
        tabla: str | None,
        desde: datetime | None,
        hasta: datetime | None,
        limit: int | None,
        offset: int,
    ) -> tuple[list[Row], int]:
        """(filas de la página, total que cumple el filtro). ``limit=None`` = todas."""

    @abstractmethod
    def insert_audit_log(
        self,
        *,
        tabla: str,
        accion: str,
        descripcion: str,
        realizado_por: str,
        valor_anterior: Row | None = None,
        valor_nuevo: Row | None = None,
    ) -> None:
        """Aislado (savepoint): si falla no deja la transacción principal en error."""

    # ── automatizaciones ──────────────────────────────────────────────
    @abstractmethod
    def automatizaciones_resumen(self) -> dict[str, int]:
        """``fn_automatizaciones_resumen()``: disparos de los últimos 7 días por regla."""

    @abstractmethod
    def list_automatizaciones_feed(
        self, *, desde: datetime, regla_id: str | None, limit: int, con_usuario: bool
    ) -> list[Row]: ...

    @abstractmethod
    def marcar_notificacion_leida(self, notificacion_id: UUID) -> None: ...
