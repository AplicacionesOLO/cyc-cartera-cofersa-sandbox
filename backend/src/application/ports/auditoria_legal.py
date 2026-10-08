"""Port del módulo Auditoría y Control Legal (garantías, pagarés y solicitudes de actualización).

Reemplaza las consultas consultas a 'garantias' | 'garantia_eventos' | 'personas_legales' |
'solicitudes_actualizacion' ... y los RPC ``fn_garantias_*`` / ``fn_*_carpeta*`` /
``fn_siguiente_consecutivo_garantia`` que hacían el front y las API Routes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any
from uuid import UUID


class AuditoriaLegalRepository(ABC):
    # ── Lecturas de garantías ────────────────────────────────────────────
    @abstractmethod
    def lista_garantias(self, analista_email: str | None) -> list[dict[str, Any]]:
        """``fn_garantias_lista(p_email)``."""

    @abstractmethod
    def clientes_sin_garantia(self, analista_email: str | None) -> list[dict[str, Any]]:
        """``fn_garantias_clientes_sin_garantia(p_email)``."""

    @abstractmethod
    def vendedores_activos(self) -> list[dict[str, Any]]:
        """(cod, nombre) de vendedores activos, por nombre."""

    @abstractmethod
    def vendedor(self, cod: str) -> dict[str, Any] | None:
        """(email, nombre, supervisor_cod) del vendedor."""

    @abstractmethod
    def email_supervisor(self, cod: str) -> str | None: ...

    @abstractmethod
    def eventos(self, garantia_id: int) -> list[dict[str, Any]]:
        """Timeline de ``garantia_eventos`` (más reciente primero) con ``usuarios: {nombre}``."""

    @abstractmethod
    def buscar_contribuyentes(self, texto: str) -> list[dict[str, Any]]:
        """``fn_buscar_contribuyentes(p_query)``."""

    @abstractmethod
    def saldo_contribuyente(self, contribuyente: str) -> dict[str, Any] | None:
        """``fn_saldo_contribuyente`` → (saldo_actual, monto_objetivo)."""

    @abstractmethod
    def garantia_activa(self, contribuyente: str) -> dict[str, Any] | None:
        """(id, tipo_titulo, monto_garantizado) de la garantía activa del contribuyente."""

    @abstractmethod
    def vendedores_por_contribuyente(self, contribuyente: str) -> list[dict[str, Any]]:
        """``fn_vendedores_por_contribuyente`` (ordenado por saldo desc)."""

    @abstractmethod
    def personas_legales(self, cedulas: list[str]) -> list[dict[str, Any]]: ...

    @abstractmethod
    def config_valores(self, claves: tuple[str, ...]) -> dict[str, str]:
        """``config_sistema`` (clave → valor) de las claves pedidas."""

    @abstractmethod
    def contar_en_carpeta(self, mueble: str, gaveta: str, carpeta: int, excluir_id: int | None) -> int:
        """``fn_contar_garantias_en_carpeta``."""

    @abstractmethod
    def siguiente_carpeta(self, mueble: str, gaveta: str, desde: int) -> int:
        """``fn_siguiente_carpeta_disponible``."""

    @abstractmethod
    def garantia(self, garantia_id: int) -> dict[str, Any] | None:
        """Fila completa de ``garantias``."""

    # ── Escrituras de garantías ──────────────────────────────────────────
    @abstractmethod
    def resolver_responsables(self, contribuyente: str) -> dict[str, Any]:
        """``fn_resolver_responsables_contribuyente``.

        → (analista_email, vendedor_cod, hay_conflicto_analista).
        """

    @abstractmethod
    def siguiente_consecutivo(self) -> str:
        """``fn_siguiente_consecutivo_garantia`` ('PAG-2026-0001')."""

    @abstractmethod
    def desactivar_garantia(self, garantia_id: int) -> None: ...

    @abstractmethod
    def insertar_garantia(self, datos: dict[str, Any]) -> int: ...

    @abstractmethod
    def vincular_reemplazo(self, anterior_id: int, nueva_id: int) -> None: ...

    @abstractmethod
    def registrar_evento(
        self, garantia_id: int, tipo_evento: str, usuario_id: UUID, nota: str | None
    ) -> None: ...

    @abstractmethod
    def id_coordinador(self) -> UUID | None: ...

    @abstractmethod
    def crear_notificacion(
        self, usuario_id: UUID, tipo: str, titulo: str, mensaje: str, link: str
    ) -> None: ...

    @abstractmethod
    def actualizar_garantia(self, garantia_id: int, cambios: dict[str, Any], *, sin_pagare: bool) -> bool:
        """UPDATE con compare-and-swap ``activo = true`` (y ``documento_pagare_generado_en IS NULL``)."""

    @abstractmethod
    def actualizar_custodia(self, garantia_id: int, estado_actual: str, cambios: dict[str, Any]) -> bool:
        """UPDATE con compare-and-swap sobre ``estado_custodia``."""

    @abstractmethod
    def set_documento(self, garantia_id: int, ruta: str) -> None: ...

    @abstractmethod
    def generar_pagare(self, garantia_id: int, cambios: dict[str, Any]) -> bool:
        """UPDATE con compare-and-swap ``activo`` + ``documento_pagare_generado_en IS NULL``."""

    @abstractmethod
    def upsert_persona_legal(self, persona: dict[str, Any]) -> None:
        """UPSERT por cédula. ``telefono`` solo se escribe si viene en el dict."""

    # ── Solicitudes de actualización ─────────────────────────────────────
    @abstractmethod
    def contar_solicitudes_desde(self, usuario_id: UUID, desde: datetime) -> int: ...

    @abstractmethod
    def crear_solicitud(self, datos: dict[str, Any]) -> int | None:
        """Inserta; ``None`` si el índice único parcial ya tiene una activa para el contribuyente."""

    @abstractmethod
    def solicitudes_seguimiento(self) -> list[dict[str, Any]]:
        """Solicitudes ENVIADA/DATOS_RECIBIDOS/APROBADA/EXPIRADA (más reciente primero)."""

    @abstractmethod
    def solicitud(self, solicitud_id: int) -> dict[str, Any] | None: ...

    @abstractmethod
    def solicitud_por_token_hash(self, token_hash: str) -> dict[str, Any] | None: ...

    @abstractmethod
    def cambiar_estado_solicitud(
        self, solicitud_id: int, desde: tuple[str, ...], cambios: dict[str, Any]
    ) -> bool:
        """UPDATE con compare-and-swap ``estado IN desde``."""
