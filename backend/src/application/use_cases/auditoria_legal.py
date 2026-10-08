"""Auditoría y Control Legal — lecturas de la pantalla de Garantías y de la vista de impresión del pagaré.

Antes eran consultas directas de el SDK anterior desde ``garantias-cliente.tsx`` y sus modales
(``fn_garantias_lista``, ``fn_garantias_clientes_sin_garantia``, ``fn_buscar_contribuyentes``,
``fn_saldo_contribuyente``, ``fn_vendedores_por_contribuyente``, ``fn_contar_garantias_en_carpeta``,
``fn_siguiente_carpeta_disponible``, ``garantia_eventos``, ``personas_legales``, ``config_sistema``,
``vendedores``) y desde ``(print)/pagare/[id]/page.tsx``.

Autorización (políticas ``*_select_activos`` = ``fn_es_usuario_activo()``): usuario activo del SIC; además
el módulo no está disponible para ANALISTA_RIESGO (mismo gate server-side que las API Routes).
"""

from __future__ import annotations

from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import AppUnitOfWork, UnitOfWorkFactory
from application.ports.file_storage import FileStorage
from application.use_cases.common import require_text, require_usuario
from domain.entities.auditoria_legal import (
    MSG_NO_AUTORIZADO_MODULO,
    TOPE_GARANTIAS_POR_CARPETA,
    es_gaveta_valida,
    es_mueble_valido,
)
from domain.entities.usuario import ANALISTA_RIESGO, Usuario
from domain.exceptions import ForbiddenError, ValidationError

BUCKET_GARANTIAS_PREFIX = "/garantias-legal/"
DOCUMENTO_URL_TTL = 3600
CLAVES_CONFIG_PAGARE = (
    "TASA_INTERES_MORATORIO_DEFAULT",
    "PAGARE_LUGAR_EMISION_DEFAULT",
)
CLAVES_ACREEDOR = ("PAGARE_ACREEDOR_RAZON_SOCIAL", "PAGARE_ACREEDOR_CEDULA_JURIDICA")
COLUMNAS_PAGARE = (
    "id",
    "consecutivo",
    "contribuyente",
    "cliente_nombre",
    "tipo_titulo",
    "monto_garantizado",
    "fecha_emision",
    "fecha_vencimiento",
    "tiene_fiador",
    "fiador_nombre",
    "fiador_cedula",
    "fiador_telefono",
    "fiador_estado_civil",
    "fiador_profesion",
    "fiador_domicilio",
    "representante_legal",
    "representante_cedula",
    "representante_estado_civil",
    "representante_profesion",
    "representante_domicilio",
    "deudor_estado_civil",
    "deudor_profesion",
    "deudor_domicilio",
    "tasa_interes_moratorio",
    "lugar_emision",
    "documento_pagare_generado_en",
)


def require_modulo(uow: AppUnitOfWork, principal: Principal) -> Usuario:
    """Usuario activo con acceso al módulo (todos menos ANALISTA_RIESGO)."""
    usuario = require_usuario(uow, principal)
    if usuario.rol == ANALISTA_RIESGO:
        raise ForbiddenError(MSG_NO_AUTORIZADO_MODULO)
    return usuario


def require_escritura_modulo(uow: AppUnitOfWork, principal: Principal) -> Usuario:
    """Además del acceso al módulo, GERENCIA es solo lectura (no registra/edita/aprueba)."""
    usuario = require_modulo(uow, principal)
    if usuario.es_solo_lectura:
        raise ForbiddenError(MSG_NO_AUTORIZADO_MODULO)
    return usuario


def ruta_documento(valor: str | None) -> str | None:
    """Key S3 del PDF firmado. Las filas migradas guardan la URL pública del origen completa."""
    if not valor:
        return None
    if BUCKET_GARANTIAS_PREFIX in valor:
        return valor.split(BUCKET_GARANTIAS_PREFIX, 1)[1].split("?", 1)[0]
    return valor


def url_documento(storage: FileStorage, valor: str | None) -> str | None:
    key = ruta_documento(valor)
    return storage.presign_download(key, expires_in=DOCUMENTO_URL_TTL) if key else None


class _ModuloUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory


class ListGarantiasUseCase:
    """Tabla de garantías activas. ``mi_cartera`` = toggle "Mi cartera" del analista."""

    def __init__(self, uow_factory: UnitOfWorkFactory, storage: FileStorage) -> None:
        self._uow_factory = uow_factory
        self._storage = storage

    def execute(self, principal: Principal, mi_cartera: bool) -> list[dict[str, Any]]:
        with self._uow_factory(principal) as uow:
            usuario = require_modulo(uow, principal)
            filas = uow.auditoria_legal.lista_garantias(usuario.email if mi_cartera else None)
        return [
            {**fila, "documento_pdf_url": url_documento(self._storage, fila.get("documento_pdf_url"))}
            for fila in filas
        ]


class ListClientesSinGarantiaUseCase(_ModuloUseCase):
    def execute(self, principal: Principal, mi_cartera: bool) -> list[dict[str, Any]]:
        with self._uow_factory(principal) as uow:
            usuario = require_modulo(uow, principal)
            return uow.auditoria_legal.clientes_sin_garantia(usuario.email if mi_cartera else None)


class ListVendedoresActivosUseCase(_ModuloUseCase):
    def execute(self, principal: Principal) -> list[dict[str, Any]]:
        with self._uow_factory(principal) as uow:
            require_modulo(uow, principal)
            return uow.auditoria_legal.vendedores_activos()


class GetVendedorGarantiaUseCase(_ModuloUseCase):
    """Nombre del vendedor resuelto de una garantía (ModalConfirmarEnvioVendedor)."""

    def execute(self, principal: Principal, garantia_id: int) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            require_modulo(uow, principal)
            garantia = uow.auditoria_legal.garantia(garantia_id)
            cod = garantia.get("vendedor_cod") if garantia else None
            vendedor = uow.auditoria_legal.vendedor(cod) if cod else None
        return {"nombre": vendedor["nombre"] if vendedor else None}


class ListEventosGarantiaUseCase(_ModuloUseCase):
    def execute(self, principal: Principal, garantia_id: int) -> list[dict[str, Any]]:
        with self._uow_factory(principal) as uow:
            require_modulo(uow, principal)
            return uow.auditoria_legal.eventos(garantia_id)


class BuscarContribuyentesUseCase(_ModuloUseCase):
    def execute(self, principal: Principal, texto: str | None) -> list[dict[str, Any]]:
        query = (texto or "").strip()
        with self._uow_factory(principal) as uow:
            require_modulo(uow, principal)
            if len(query) < 2:
                return []
            return uow.auditoria_legal.buscar_contribuyentes(query)


class GetSaldoContribuyenteUseCase(_ModuloUseCase):
    def execute(self, principal: Principal, contribuyente: str | None) -> dict[str, Any] | None:
        cedula = require_text(contribuyente, "contribuyente")
        with self._uow_factory(principal) as uow:
            require_modulo(uow, principal)
            return uow.auditoria_legal.saldo_contribuyente(cedula)


class GetGarantiaActivaContribuyenteUseCase(_ModuloUseCase):
    """Aviso de sustitución: ¿el contribuyente ya tiene una garantía activa?"""

    def execute(self, principal: Principal, contribuyente: str | None) -> dict[str, Any] | None:
        cedula = require_text(contribuyente, "contribuyente")
        with self._uow_factory(principal) as uow:
            require_modulo(uow, principal)
            fila = uow.auditoria_legal.garantia_activa(cedula)
        if not fila:
            return None
        return {"tipo_titulo": fila["tipo_titulo"], "monto_garantizado": fila["monto_garantizado"]}


class ListVendedoresContribuyenteUseCase(_ModuloUseCase):
    def execute(self, principal: Principal, contribuyente: str | None) -> list[dict[str, Any]]:
        cedula = require_text(contribuyente, "contribuyente")
        with self._uow_factory(principal) as uow:
            require_modulo(uow, principal)
            return uow.auditoria_legal.vendedores_por_contribuyente(cedula)


class ListPersonasLegalesUseCase(_ModuloUseCase):
    """Autocompletado de deudor/representante/fiador por cédula (memoria entre garantías)."""

    def execute(self, principal: Principal, cedulas: list[str]) -> list[dict[str, Any]]:
        limpias = list(dict.fromkeys(c.strip() for c in cedulas if c and c.strip()))[:20]
        with self._uow_factory(principal) as uow:
            require_modulo(uow, principal)
            return uow.auditoria_legal.personas_legales(limpias) if limpias else []


class GetConfigPagareUseCase(_ModuloUseCase):
    """Tasa de interés moratorio y lugar de emisión sugeridos (``config_sistema``)."""

    def execute(self, principal: Principal) -> dict[str, str]:
        with self._uow_factory(principal) as uow:
            require_modulo(uow, principal)
            return uow.auditoria_legal.config_valores(CLAVES_CONFIG_PAGARE)


def _ubicacion(mueble: str | None, gaveta: str | None) -> tuple[str, str]:
    if not es_mueble_valido(mueble):
        raise ValidationError("Mueble/Archivero inválido")
    if not es_gaveta_valida(gaveta):
        raise ValidationError("Gaveta/Caja inválida")
    return str(mueble), str(gaveta)


class ContarGarantiasCarpetaUseCase(_ModuloUseCase):
    def execute(
        self,
        principal: Principal,
        mueble: str | None,
        gaveta: str | None,
        carpeta: int | None,
        excluir_id: int | None,
    ) -> dict[str, int]:
        m, g = _ubicacion(mueble, gaveta)
        if not carpeta or carpeta <= 0:
            raise ValidationError("Carpeta/Expediente N.° debe ser un entero mayor a 0")
        with self._uow_factory(principal) as uow:
            require_modulo(uow, principal)
            conteo = uow.auditoria_legal.contar_en_carpeta(m, g, carpeta, excluir_id)
        return {"conteo": conteo, "tope": TOPE_GARANTIAS_POR_CARPETA}


class SiguienteCarpetaDisponibleUseCase(_ModuloUseCase):
    def execute(
        self, principal: Principal, mueble: str | None, gaveta: str | None, desde: int | None
    ) -> dict:
        m, g = _ubicacion(mueble, gaveta)
        with self._uow_factory(principal) as uow:
            require_modulo(uow, principal)
            return {"carpeta": uow.auditoria_legal.siguiente_carpeta(m, g, max(1, desde or 1))}


class GetPagareImprimibleUseCase(_ModuloUseCase):
    """Datos de la vista de impresión: snapshot de la garantía + identidad del acreedor."""

    def execute(self, principal: Principal, garantia_id: int) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            require_modulo(uow, principal)
            fila = uow.auditoria_legal.garantia(garantia_id)
            config = uow.auditoria_legal.config_valores(CLAVES_ACREEDOR)
        return {
            "garantia": {col: fila.get(col) for col in COLUMNAS_PAGARE} if fila else None,
            "acreedor": {
                "razonSocial": (config.get("PAGARE_ACREEDOR_RAZON_SOCIAL") or "").strip(),
                "cedulaJuridica": (config.get("PAGARE_ACREEDOR_CEDULA_JURIDICA") or "").strip(),
            },
        }
