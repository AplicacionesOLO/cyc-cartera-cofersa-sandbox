"""Port del módulo Clientes: lista, buscador global, ficha 360°, contacto/logística y estado de cuenta.

Reemplaza las consultas que el front y las API Routes hacían directo al origen sobre
``cartera``, ``maestro_clientes``, ``facturas``, ``cuentas_bancarias`` (y las lecturas de apoyo de
la ficha: gestiones, promesas, ICP, pedidos retenidos y solicitudes del cliente).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date, datetime
from typing import Any
from uuid import UUID

from domain.entities.clientes import GestionNueva

Row = dict[str, Any]


class ClientesRepository(ABC):
    # ── Lista / buscador ────────────────────────────────────────────────
    @abstractmethod
    def lista(self, filtros: dict[str, Any], page: int, page_size: int | None, hoy: date) -> Row:
        """JSON de ``fn_clientes_lista`` (rows, total_rows, kpis y opciones de filtros)."""

    @abstractmethod
    def buscar_clientes(self, q: str, limit: int) -> list[Row]:
        """Maestro por nombre, código o cédula (ILIKE)."""

    @abstractmethod
    def buscar_facturas_por_sufijo(self, sufijo: str, limit: int) -> list[Row]: ...

    @abstractmethod
    def buscar_marcas(self, q: str, limit: int) -> list[Row]:
        """Marcas activas por nombre con el nombre del comprador (directorio_empresa)."""

    # ── Ficha 360° ──────────────────────────────────────────────────────
    @abstractmethod
    def carteras_del_cliente(self, cliente_cod: str) -> list[Row]: ...

    @abstractmethod
    def maestro_del_cliente(self, cliente_cod: str) -> Row | None: ...

    @abstractmethod
    def gestiones_del_cliente(self, cliente_cod: str, limit: int) -> list[Row]: ...

    @abstractmethod
    def promesas_del_cliente(self, cliente_cod: str) -> list[Row]: ...

    @abstractmethod
    def icp_del_cliente(self, cliente_cod: str) -> Row | None: ...

    @abstractmethod
    def tendencia_pago(self, cliente_cod: str, meses: int) -> list[Row]: ...

    @abstractmethod
    def pedidos_retenidos_activos(self, cliente_cod: str) -> list[Row]: ...

    @abstractmethod
    def solicitudes_del_cliente(self, cliente_cod: str, solicitante_id: UUID | None, limit: int) -> list[Row]:
        """Solicitudes del cliente; ``solicitante_id`` limita a las propias (None = todas)."""

    @abstractmethod
    def nombres_usuarios(self, ids: list[str]) -> dict[str, str]: ...

    @abstractmethod
    def contacto_usuario(self, email: str) -> Row | None:
        """nombre, telefono, whatsapp del usuario (analista asignado o remitente)."""

    @abstractmethod
    def facturas_por_contribuyente(self, contribuyente: str, *, solo_con_saldo: bool) -> list[Row]: ...

    @abstractmethod
    def cuentas_bancarias_activas(self) -> list[Row]: ...

    # ── Escrituras ──────────────────────────────────────────────────────
    @abstractmethod
    def actualizar_contacto(self, cliente_cod: str, campos: dict[str, str | None]) -> None:
        """``fn_actualizar_contacto_cliente`` (única vía que puede vaciar estos campos)."""

    @abstractmethod
    def actualizar_logistica(self, cliente_cod: str, campos: dict[str, Any]) -> None:
        """``fn_actualizar_logistica_cliente``."""

    @abstractmethod
    def actualizar_estado_manual(self, cliente_cod: str, estado: str) -> bool:
        """True si existía el cliente en el maestro."""

    @abstractmethod
    def registrar_gestion(self, gestion: GestionNueva) -> None: ...

    @abstractmethod
    def contar_correos_desde(self, analista_email: str, desde: datetime) -> int:
        """Gestiones tipo CORREO del usuario desde ``desde`` (límite de envíos por hora)."""

    @abstractmethod
    def crear_notificacion(
        self, usuario_id: UUID, tipo: str, titulo: str, mensaje: str, link: str
    ) -> None: ...
