"""Casos de uso del módulo Clientes: lista, buscador global, ficha 360°, contacto/logística, estado.

Reemplazan:
- ``/clientes`` (page.tsx + Server Action ``fetchTodosLosClientes``) → ``ListClientesUseCase``.
- ``/api/clientes/buscar`` → ``BuscarGlobalUseCase``.
- ``/clientes/[cod]`` (11 consultas al origen) → ``GetFichaClienteUseCase``.
- ``/api/clientes/{contacto,logistica,estado,recordatorio,estado-cuenta/data}``.

Acceso (políticas RLS de origen): cartera, maestro_clientes, facturas, cuentas_bancarias, gestiones,
promesas y pedidos_retenidos se leen con cualquier usuario activo (``fn_es_usuario_activo``); las
solicitudes de la ficha solo las propias salvo Coordinador/Gerencia; el maestro solo lo edita el
analista asignado o el Coordinador.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

from application.dto.principal import Principal
from application.ports.app_unit_of_work import AppUnitOfWork, UnitOfWorkFactory
from application.use_cases.common import (
    ahora_cr,
    hoy_cr,
    require_coordinador,
    require_escritura,
    require_usuario,
)
from domain.entities.clientes import ESTADOS_VALIDOS, GestionNueva, solo_digitos_telefono
from domain.entities.usuario import Usuario
from domain.exceptions import ForbiddenError, NotFoundError, ValidationError

FILTROS_LISTA = ("q", "analista", "vendedor", "plazo", "nivel_precio", "dimension")
MSG_SIN_PERMISOS_EDITAR = "Sin permisos para editar este cliente"


def _filtros_lista(raw: dict[str, Any]) -> dict[str, Any]:
    filtros = {key: (str(raw.get(key) or "").strip() or None) for key in FILTROS_LISTA}
    filtros["sort"] = str(raw.get("sort") or "mora_total")
    filtros["dir"] = "asc" if raw.get("dir") == "asc" else "desc"
    return filtros


def hora_cr() -> str:
    return ahora_cr().strftime("%H:%M:%S")


class ListClientesUseCase:
    """Lista paginada (o completa para el Excel cuando ``page_size`` es None)."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(
        self, principal: Principal, raw_filtros: dict[str, Any], page: int, page_size: int | None
    ) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
            return uow.clientes.lista(_filtros_lista(raw_filtros), max(1, page), page_size, hoy_cr())


class BuscarGlobalUseCase:
    """Índices Clientes (maestro), Facturas (6 dígitos finales) y Marcas del buscador del Topbar."""

    LIMIT = 6

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, q: str | None) -> dict[str, list[dict[str, Any]]]:
        texto = (q or "").strip()
        vacio: dict[str, list[dict[str, Any]]] = {"clientes": [], "facturas": [], "marcas": []}
        if len(texto) < 2:
            return vacio
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
            repo = uow.clientes
            clientes = repo.buscar_clientes(texto, self.LIMIT)
            facturas = (
                repo.buscar_facturas_por_sufijo(texto, self.LIMIT) if re.fullmatch(r"\d{6}", texto) else []
            )
            marcas = repo.buscar_marcas(texto, self.LIMIT)
        vistos: set[str] = set()
        unicas = []
        for f in facturas:
            if f["documento"] not in vistos:
                vistos.add(f["documento"])
                unicas.append(f)
        return {
            "clientes": [
                {
                    "tipo": "cliente",
                    "cliente_cod": c["cliente_cod"],
                    "cliente_nombre": c["cliente_nombre"],
                    "vendedor_nombre": c.get("vendedor_nombre"),
                }
                for c in clientes
            ],
            "facturas": [
                {
                    "tipo": "factura",
                    "documento": f["documento"],
                    "cliente_cod": f["cliente_cod"],
                    "cliente_nombre": f["cliente_nombre"],
                    "saldo": f["saldo"],
                }
                for f in unicas
            ],
            "marcas": [
                {
                    "tipo": "marca",
                    "id": m["id"],
                    "nombre": m["nombre"],
                    "proveedor": m.get("proveedor"),
                    "comprador_id": m.get("comprador_id"),
                    "comprador_nombre": m.get("comprador_nombre") or "—",
                }
                for m in marcas
            ],
        }


def filtros_desde_volver(volver: str | None) -> dict[str, Any] | None:
    """Filtros del listado de Clientes cuando la ficha se abrió desde ``/clientes?...``."""
    if not volver or not (volver == "/clientes" or volver.startswith("/clientes?")):
        return None
    qs = {k: v[0] for k, v in parse_qs(urlsplit(volver).query).items() if v}
    return _filtros_lista({**qs, "nivel_precio": qs.get("nivelPrecio")})


def _cartera_sintetica(maestro: dict[str, Any]) -> dict[str, Any]:
    """Cliente activo sin saldo (no tiene fila en cartera): KPIs en cero en vez de 404."""
    return {
        "id": 0,
        "contribuyente": maestro.get("contribuyente"),
        "cliente_cod": maestro.get("cliente_cod"),
        "cliente_nombre": maestro.get("cliente_nombre"),
        "vendedor_nombre": maestro.get("vendedor_nombre") or "",
        "no_vencido": 0,
        "mora_1_30": 0,
        "mora_31_60": 0,
        "mora_61_90": 0,
        "mora_91_120": 0,
        "mora_120_plus": 0,
        "total": 0,
        "dias_mora": 0,
        "estado": "AL DIA",
        "sync_id": "",
        "fecha_corte": maestro.get("updated_at"),
        "updated_at": maestro.get("updated_at"),
    }


class GetFichaClienteUseCase:
    """Todo lo que necesita la Ficha 360° en una sola respuesta (antes ~11 consultas)."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, raw_cod: str, volver: str | None) -> dict[str, Any]:
        cod = unquote(raw_cod or "").strip()
        if not cod:
            raise NotFoundError("Cliente no encontrado")
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            repo = uow.clientes
            maestro = repo.maestro_del_cliente(cod)
            carteras = repo.carteras_del_cliente(cod)
            if carteras:
                cartera = sorted(carteras, key=lambda r: str(r.get("fecha_corte") or ""), reverse=True)[0]
            elif maestro:
                cartera = _cartera_sintetica(maestro)
            else:
                raise NotFoundError("Cliente no encontrado")
            solicitudes = repo.solicitudes_del_cliente(cod, None if usuario.es_global else usuario.id, 50)
            ids = sorted({str(s["solicitante_id"]) for s in solicitudes if s.get("solicitante_id")})
            analista_email = (maestro or {}).get("analista_email") or ""
            analista = repo.contacto_usuario(analista_email) if analista_email else None
            ficha = {
                "cartera": cartera,
                "maestro": maestro,
                "facturas": repo.facturas_por_contribuyente(
                    cartera.get("contribuyente") or "", solo_con_saldo=False
                ),
                "gestiones": repo.gestiones_del_cliente(cod, 60),
                "promesas": repo.promesas_del_cliente(cod),
                "solicitudes": solicitudes,
                "solicitante_map": repo.nombres_usuarios(ids) if ids else {},
                "icp": repo.icp_del_cliente(cod),
                "tendencia_pago": repo.tendencia_pago(cod, 6) or [],
                "pedidos_retenidos": repo.pedidos_retenidos_activos(cod),
                "analista_email": analista_email,
                "analista_nombre": (analista or {}).get("nombre") or "",
                "analista_telefono": (analista or {}).get("telefono"),
                "analista_whatsapp": (analista or {}).get("whatsapp"),
            }
            ficha.update(self._navegacion(uow, cod, volver))
        return ficha

    @staticmethod
    def _navegacion(uow: AppUnitOfWork, cod: str, volver: str | None) -> dict[str, Any]:
        nav: dict[str, Any] = {
            "prev_cod": None,
            "next_cod": None,
            "posicion_en_lista": None,
            "total_en_lista": None,
        }
        filtros = filtros_desde_volver(volver)
        if filtros is None:
            return nav
        lista = uow.clientes.lista(filtros, 1, None, hoy_cr()) or {}
        codigos = [r.get("cliente_cod") for r in lista.get("rows") or []]
        if cod in codigos:
            idx = codigos.index(cod)
            nav.update(
                posicion_en_lista=idx + 1,
                total_en_lista=len(codigos),
                prev_cod=codigos[idx - 1] if idx > 0 else None,
                next_cod=codigos[idx + 1] if idx < len(codigos) - 1 else None,
            )
        return nav


def _require_editor_cliente(uow: AppUnitOfWork, usuario: Usuario, cliente_cod: str) -> None:
    """Coordinador o el analista asignado al cliente (política maestro_clientes_update_autenticados)."""
    if usuario.es_coordinador:
        return
    maestro = uow.clientes.maestro_del_cliente(cliente_cod) or {}
    if str(maestro.get("analista_email") or "").lower() != usuario.email.lower():
        raise ForbiddenError(MSG_SIN_PERMISOS_EDITAR)


def _texto_opcional(body: dict[str, Any], key: str) -> str | None:
    value = body.get(key)
    return value.strip() if isinstance(value, str) else None


class ActualizarContactoClienteUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, bool]:
        cliente_cod = str(body.get("cliente_cod") or "").strip()
        if not cliente_cod:
            raise ValidationError("cliente_cod requerido")
        campos: dict[str, str | None] = {
            "nombre_cxp": _texto_opcional(body, "nombre_cxp"),
            "telefono": None,
            "telefono2": None,
            "correo": _texto_opcional(body, "correo"),
        }
        for key in ("telefono", "telefono2"):
            if isinstance(body.get(key), str):
                campos[key] = solo_digitos_telefono(body[key])
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            _require_editor_cliente(uow, usuario, cliente_cod)
            uow.clientes.actualizar_contacto(cliente_cod, campos)
            uow.commit()
        return {"ok": True}


class ActualizarLogisticaClienteUseCase:
    ARRAYS = ("dia_visita", "dia_pago", "metodo_pago")

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, bool]:
        cliente_cod = str(body.get("cliente_cod") or "").strip()
        if not cliente_cod:
            raise ValidationError("cliente_cod requerido")
        campos: dict[str, Any] = {}
        for key in self.ARRAYS:
            value = body.get(key)
            if value is not None and not isinstance(value, list):
                raise ValidationError(f"'{key}' debe ser una lista.", details={"field": key})
            campos[key] = [str(v) for v in value] if value is not None else None
        campos["observaciones_logistica"] = _texto_opcional(body, "observaciones_logistica")
        campos["persona_recibe"] = _texto_opcional(body, "persona_recibe")
        actualizar = "hora_recibo_inicio" in body or "hora_recibo_fin" in body
        campos["actualizar_horario"] = actualizar
        for key in ("hora_recibo_inicio", "hora_recibo_fin"):
            raw = body.get(key) if actualizar else None
            if raw and not re.fullmatch(r"\d{2}:\d{2}(:\d{2})?", str(raw)):
                raise ValidationError(f"'{key}' debe tener formato HH:MM.", details={"field": key})
            campos[key] = str(raw) if raw else None
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            _require_editor_cliente(uow, usuario, cliente_cod)
            uow.clientes.actualizar_logistica(cliente_cod, campos)
            uow.commit()
        return {"ok": True}


class CambiarEstadoClienteUseCase:
    """Estado manual del cliente (solo Coordinador) + gestión SISTEMA + aviso al analista asignado."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        cliente_cod = str(body.get("cliente_cod") or "").strip()
        estado = body.get("estado")
        anterior = body.get("estado_anterior")
        if not cliente_cod or estado not in ESTADOS_VALIDOS:
            raise ValidationError("Parámetros inválidos")
        with self._uow_factory(principal) as uow:
            coord = require_coordinador(require_usuario(uow, principal), message="Sin permisos")
            maestro = uow.clientes.maestro_del_cliente(cliente_cod)
            if maestro is None or not uow.clientes.actualizar_estado_manual(cliente_cod, estado):
                raise NotFoundError("Cliente no encontrado")
            uow.clientes.registrar_gestion(
                GestionNueva(
                    cliente_cod=cliente_cod,
                    contribuyente=cliente_cod,
                    analista_email=coord.email,
                    fecha=hoy_cr(),
                    hora=hora_cr(),
                    tipo="SISTEMA",
                    resultado="Cambio de estado",
                    nota=f'Estado cambiado de "{anterior or "desconocido"}" a "{estado}" por '
                    f"{coord.nombre or coord.email}.",
                    activo=True,
                )
            )
            analista = uow.usuarios.find_activo_by_email(maestro.get("analista_email") or "")
            if analista is not None and analista.id != coord.id:
                uow.clientes.crear_notificacion(
                    analista.id,
                    "ALERTA",
                    f"Estado de cliente cambiado a {estado}",
                    f'El coordinador cambió el estado de {cliente_cod} de "{anterior or "—"}" a "{estado}".',
                    f"/clientes/{cliente_cod}",
                )
            uow.commit()
        return {"ok": True, "estado": estado}


class RegistrarRecordatorioUseCase:
    """Gestión tipo Email / "Recordatorio enviado" para una factura."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, bool]:
        cliente_cod = str(body.get("cliente_cod") or "").strip()
        documento = str(body.get("documento") or "").strip()
        if not cliente_cod or not documento:
            raise ValidationError("cliente_cod y documento son requeridos")
        nota = body.get("nota")
        with self._uow_factory(principal) as uow:
            usuario = require_escritura(require_usuario(uow, principal))
            uow.clientes.registrar_gestion(
                GestionNueva(
                    cliente_cod=cliente_cod,
                    analista_email=usuario.email,
                    fecha=hoy_cr(),
                    hora=hora_cr(),
                    tipo="Email",
                    resultado="Recordatorio enviado",
                    nota=str(nota) if nota is not None else f"Recordatorio de factura {documento}",
                )
            )
            uow.commit()
        return {"ok": True}


class GetEstadoCuentaDataUseCase:
    """Datos para armar el Estado de Cuenta (PDF/Excel) en el navegador. No envía nada."""

    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, cod: str | None) -> dict[str, Any]:
        cliente_cod = (cod or "").strip()
        if not cliente_cod:
            raise ValidationError("cod requerido")
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            repo = uow.clientes
            mc = repo.maestro_del_cliente(cliente_cod)
            if mc is None:
                raise NotFoundError("Cliente no encontrado")
            contribuyente = mc.get("contribuyente") or ""
            analista_email = mc.get("analista_email") or usuario.email
            analista = repo.contacto_usuario(analista_email) or {}
            facturas = repo.facturas_por_contribuyente(contribuyente, solo_con_saldo=True)
            cuentas = repo.cuentas_bancarias_activas()
        return {
            "clienteNombre": mc.get("cliente_nombre") or cliente_cod,
            "contribuyente": contribuyente,
            "clienteCod": cliente_cod,
            "correo": mc.get("correo") or "",
            "condicionPago": mc.get("condicion_pago"),
            "analistaNombre": analista.get("nombre") or analista_email,
            "analistaEmail": analista_email,
            "analistaTelefono": analista.get("telefono"),
            "analistaWhatsapp": analista.get("whatsapp"),
            "cuentas": [
                {k: c.get(k) for k in ("banco", "moneda", "tipo", "numero", "iban", "orden")} for c in cuentas
            ],
            "facturas": [
                {k: f.get(k) for k in ("documento", "fecha_documento", "fecha_vencimiento", "monto", "saldo")}
                for f in facturas
            ],
            "fechaCorte": hoy_cr().strftime("%d/%m/%Y"),
        }
