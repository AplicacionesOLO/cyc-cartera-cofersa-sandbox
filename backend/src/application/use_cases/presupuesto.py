"""Presupuesto de Cobro (congelar / ajustar / reasignar), Recuperación, Proyección y Sin pago.

Reemplaza los ``llamadas RPC`` y consultas a ... de ``reportes/presupuesto-cobro/*`` y
``components/reportes/Recuperacion*.tsx``. Autorización:
- Presupuesto / Recuperación del mes / Proyección / destinatarios: COORDINADOR y GERENCIA (guard de
  la página ``/reportes/presupuesto-cobro``).
- Congelar / regenerar / editar meta / reasignar: solo COORDINADOR (GERENCIA es solo lectura).
- Recuperación por período, tramos, comparativo mensual, sin pago y meta del analista: cualquier
  usuario activo (antes: RLS ``solo_usuarios_activos`` + RPC SECURITY DEFINER); quien gestiona
  cartera propia queda acotado a su email aunque pida otro.
- Envío de correo: COORDINADOR y ANALISTA (mismo criterio que ``/api/reportes/enviar``).
"""

from __future__ import annotations

import re
from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.ports.integraciones import EmailMessage
from application.use_cases.common import (
    optional_text,
    parse_date,
    parse_int,
    parse_number,
    parse_optional_int,
    require_coordinador,
    require_roles,
    require_text,
    require_usuario,
)
from application.use_cases.mailer import UsuarioMailer
from domain.entities.usuario import ANALISTA, COORDINADOR, GERENCIA, Usuario
from domain.exceptions import ValidationError

MSG_SOLO_COORD_GERENCIA = "Acceso restringido a Coordinación y Gerencia"
MSG_SIN_PERMISO_ENVIO = "No tenés permiso para enviar estos reportes"
MSG_CAMPOS_CORREO = "to, subject y html son requeridos"
GRUPOS = ("analista", "vendedor")
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def scope_email(usuario: Usuario, requested: str | None) -> str | None:
    """Email al que se acota un reporte "por analista".

    Quien gestiona cartera propia (ANALISTA, o ANALISTA_RIESGO con cartera) siempre ve la suya; el
    resto (COORDINADOR, GERENCIA, ANALISTA_RIESGO de solo lectura) ve lo pedido (None = todos),
    igual que el front original que solo mandaba ``p_email`` cuando ``esAnalista``.
    """
    if usuario.puede_gestionar_cartera:
        return usuario.email
    return optional_text(requested)


def _periodo(anio: Any, mes: Any) -> tuple[int, int]:
    return parse_int(anio, "anio", minimum=2000, maximum=2100), parse_int(mes, "mes", minimum=1, maximum=12)


def _grupo(raw: str | None) -> str:
    group = (raw or "analista").strip()
    if group not in GRUPOS:
        raise ValidationError("'group' debe ser 'analista' o 'vendedor'.", details={"field": "group"})
    return group


def _correos(raw: Any) -> list[str]:
    items = raw if isinstance(raw, (list, tuple)) else [raw] if raw else []
    return [part.strip() for item in items for part in re.split(r"[;,]", str(item or "")) if part.strip()]


class _UseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory


class GetPresupuestoMesUseCase(_UseCase):
    """Presupuesto congelado del mes o, si no hay, el estimado en vivo (``congelado: false``)."""

    def execute(self, principal: Principal, anio: Any, mes: Any) -> dict[str, Any]:
        a, m = _periodo(anio, mes)
        with self._uow_factory(principal) as uow:
            require_roles(
                require_usuario(uow, principal), COORDINADOR, GERENCIA, message=MSG_SOLO_COORD_GERENCIA
            )
            congelado = uow.presupuesto.presupuesto_congelado(a, m) or {}
            if congelado.get("congelado"):
                return congelado
            estimado = uow.presupuesto.presupuesto_estimado(a, m) or {}
        return {**estimado, "congelado": False}


class CongelarPresupuestoUseCase(_UseCase):
    """Congelar (o regenerar) el mes: ``fn_presupuesto_guardar`` con el email del coordinador."""

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        a, m = _periodo(body.get("anio"), body.get("mes"))
        with self._uow_factory(principal) as uow:
            usuario = require_coordinador(require_usuario(uow, principal))
            result = uow.presupuesto.congelar(a, m, usuario.email)
            uow.commit()
        return result


class AjustarMetaVendedorUseCase(_UseCase):
    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        a, m = _periodo(body.get("anio"), body.get("mes"))
        vendedor_cod = require_text(body.get("vendedor_cod"), "vendedor_cod")
        meta = round(parse_number(body.get("meta"), "meta"))
        if meta < 0:
            raise ValidationError("'meta' no puede ser negativa.", details={"field": "meta"})
        with self._uow_factory(principal) as uow:
            usuario = require_coordinador(require_usuario(uow, principal))
            result = uow.presupuesto.ajustar_meta(a, m, vendedor_cod, meta, usuario.email)
            uow.commit()
        return result


class ReasignarClientePresupuestoUseCase(_UseCase):
    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        a, m = _periodo(body.get("anio"), body.get("mes"))
        cliente_cod = require_text(body.get("cliente_cod"), "cliente_cod")
        vendedor_cod = require_text(body.get("vendedor_cod"), "vendedor_cod")
        with self._uow_factory(principal) as uow:
            usuario = require_coordinador(require_usuario(uow, principal))
            result = uow.presupuesto.reasignar_cliente(a, m, cliente_cod, vendedor_cod, usuario.email)
            uow.commit()
        return result


class ListVendedoresPresupuestoUseCase(_UseCase):
    def execute(self, principal: Principal) -> list[dict[str, Any]]:
        with self._uow_factory(principal) as uow:
            require_roles(
                require_usuario(uow, principal), COORDINADOR, GERENCIA, message=MSG_SOLO_COORD_GERENCIA
            )
            return uow.presupuesto.vendedores_activos()


class GetDestinatariosPresupuestoUseCase(_UseCase):
    """Datos para armar los destinatarios del "Presupuesto General" (el cruce lo hace la UI)."""

    def execute(self, principal: Principal) -> dict[str, list[dict[str, Any]]]:
        with self._uow_factory(principal) as uow:
            require_roles(
                require_usuario(uow, principal), COORDINADOR, GERENCIA, message=MSG_SOLO_COORD_GERENCIA
            )
            return uow.presupuesto.directorio_envio()


class EnviarCorreoPresupuestoUseCase(_UseCase):
    """Correo HTML (presupuesto general / resumen a gerencia) desde el Gmail del usuario."""

    def __init__(self, uow_factory: UnitOfWorkFactory, mailer: UsuarioMailer) -> None:
        super().__init__(uow_factory)
        self._mailer = mailer

    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        to_raw = str(body.get("to") or "").strip()
        subject = str(body.get("subject") or "").strip()
        html = str(body.get("html") or "")
        if not to_raw or not subject or not html.strip():
            raise ValidationError(MSG_CAMPOS_CORREO)
        destinatarios, copia = _correos(to_raw), _correos(body.get("cc"))
        invalido = next((e for e in [*destinatarios, *copia] if not _EMAIL_RE.match(e)), None)
        if invalido:
            raise ValidationError(f"Dirección de correo inválida: {invalido}")
        with self._uow_factory(principal) as uow:
            usuario = require_roles(
                require_usuario(uow, principal), COORDINADOR, ANALISTA, message=MSG_SIN_PERMISO_ENVIO
            )
            message = EmailMessage(
                to=tuple(destinatarios),
                cc=tuple(copia),
                subject=subject,
                html=html,
                sender_name=usuario.nombre or usuario.email,
            )
            self._mailer.send(uow, usuario, message)
        return {"ok": True, "email_sent": True, "to": to_raw}


class GetRecuperacionMesUseCase(_UseCase):
    def execute(self, principal: Principal, anio: Any, mes: Any) -> Any:
        a, m = _periodo(anio, mes)
        with self._uow_factory(principal) as uow:
            require_roles(
                require_usuario(uow, principal), COORDINADOR, GERENCIA, message=MSG_SOLO_COORD_GERENCIA
            )
            return uow.presupuesto.recuperacion(a, m)


class GetProyeccionCobroUseCase(_UseCase):
    def execute(self, principal: Principal, semanas: int | None, semanas_pasadas: int | None) -> Any:
        n_semanas = parse_int(semanas if semanas is not None else 8, "semanas", minimum=1, maximum=26)
        pasadas = parse_int(
            semanas_pasadas if semanas_pasadas is not None else 1, "semanas_pasadas", minimum=0, maximum=52
        )
        with self._uow_factory(principal) as uow:
            require_roles(
                require_usuario(uow, principal), COORDINADOR, GERENCIA, message=MSG_SOLO_COORD_GERENCIA
            )
            result = uow.presupuesto.proyeccion(n_semanas, pasadas)
            uow.commit()  # fn_proyeccion_cobro guarda el snapshot de la semana en curso
        return result


class GetSinPagoUseCase(_UseCase):
    def execute(self, principal: Principal, anio: Any, mes: Any) -> dict[str, Any]:
        a, m = _periodo(anio, mes)
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
            filas = uow.presupuesto.clientes_sin_pago(a, m)
            total = uow.presupuesto.ppto_cartera_total(a, m)
        return {"filas": filas, "ppto_total": total}


class GetRecuperacionMomUseCase(_UseCase):
    def execute(self, principal: Principal, meses: int | None, email: str | None) -> Any:
        n = parse_int(meses if meses is not None else 13, "meses", minimum=1, maximum=36)
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            return uow.presupuesto.recuperacion_mom(n, scope_email(usuario, email))


class GetRecuperacionPeriodoUseCase(_UseCase):
    def execute(self, principal: Principal, ini: Any, fin: Any, email: str | None, group: str | None) -> Any:
        desde, hasta, grupo = parse_date(ini, "ini"), parse_date(fin, "fin"), _grupo(group)
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            return uow.presupuesto.recuperacion_periodo(desde, hasta, scope_email(usuario, email), grupo)


class GetRecuperacionTramosUseCase(_UseCase):
    def execute(self, principal: Principal, ini: Any, fin: Any, email: str | None, group: str | None) -> Any:
        desde, hasta, grupo = parse_date(ini, "ini"), parse_date(fin, "fin"), _grupo(group)
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            return uow.presupuesto.recuperacion_tramos(desde, hasta, scope_email(usuario, email), grupo)


class GetMetaAnalistaMesUseCase(_UseCase):
    def execute(self, principal: Principal, email: str | None, anio: Any, mes: Any) -> dict[str, Any]:
        a = parse_optional_int(anio, "anio", minimum=2000, maximum=2100)
        m = parse_optional_int(mes, "mes", minimum=1, maximum=12)
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            objetivo = scope_email(usuario, email) or usuario.email
            return {"meta": uow.presupuesto.meta_analista_mes(objetivo, a, m)}
