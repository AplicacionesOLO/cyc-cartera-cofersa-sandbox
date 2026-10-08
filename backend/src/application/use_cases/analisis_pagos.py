"""Análisis de Pagos (ICP: ranking, perfil por vendedor, alertas, concentración) y Pagos Aplicados.

Reemplaza los RPC 'fn_analisis_*' | 'fn_pagos_mes_resumen' de
``components/analisis-pagos/*`` y las API Routes ``/api/pagos-anulados[/no_recibo]`` y
``/api/pagos-duplicado-descartado[/no_recibo]`` (antes ``checkCoordinador`` + service role).
"""

from __future__ import annotations

from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.use_cases.common import (
    optional_text,
    parse_int,
    require_coordinador,
    require_roles,
    require_text,
    require_usuario,
)
from domain.entities.usuario import COORDINADOR, GERENCIA, Usuario
from domain.exceptions import ForbiddenError, ValidationError

MSG_CONCENTRACION = "Vista disponible para el coordinador"
MSG_SOLO_COORD_GERENCIA = "Acceso restringido a Coordinación y Gerencia"
MSG_SIN_RECIBOS = "Indicá al menos un recibo"
MSG_SIN_MOTIVO = "El motivo es requerido"
MSG_REEMPLAZO_UNICO = "recibo_reemplazo solo aplica al marcar un único recibo"
MSG_SIN_NO_RECIBO = "no_recibo es requerido"


def scope_email(usuario: Usuario, requested: str | None) -> str | None:
    """ANALISTA (o ANALISTA_RIESGO con cartera) solo ve su cartera; el resto, lo pedido o todo."""
    if usuario.puede_gestionar_cartera:
        return usuario.email
    return optional_text(requested)


def _meses(raw: Any) -> int:
    return parse_int(raw if raw is not None else 9, "meses", minimum=1, maximum=36)


def _orden(raw: str | None) -> str:
    return optional_text(raw) or "icp_asc"


class _UseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory


class GetRankingClientesUseCase(_UseCase):
    def execute(self, principal: Principal, filtros: dict[str, Any]) -> Any:
        offset = parse_int(filtros.get("offset") or 0, "offset", minimum=0)
        limit = parse_int(filtros.get("limit") or 25, "limit", minimum=1, maximum=500)
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            return uow.analisis_pagos.ranking_clientes(
                email=scope_email(usuario, filtros.get("email")),
                meses=_meses(filtros.get("meses")),
                offset=offset,
                limit=limit,
                clasificacion=optional_text(filtros.get("clasificacion")),
                dimension=optional_text(filtros.get("dimension")),
                vendedor_cod=optional_text(filtros.get("vendedor_cod")),
                busqueda=optional_text(filtros.get("busqueda")),
                orden=_orden(filtros.get("orden")),
            )


class GetPerfilVendedorUseCase(_UseCase):
    def execute(self, principal: Principal, email: str | None, meses: Any, orden: str | None) -> Any:
        n = _meses(meses)
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            return uow.analisis_pagos.perfil_vendedor(scope_email(usuario, email), n, _orden(orden))


class GetAlertasDeterioroUseCase(_UseCase):
    def execute(self, principal: Principal, email: str | None) -> Any:
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            return uow.analisis_pagos.alertas_deterioro(scope_email(usuario, email))


class GetConcentracionUseCase(_UseCase):
    """Concentración de riesgo de toda la cartera: no disponible para quien gestiona cartera propia."""

    def execute(self, principal: Principal) -> Any:
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            if usuario.puede_gestionar_cartera:
                raise ForbiddenError(MSG_CONCENTRACION)
            return uow.analisis_pagos.concentracion()


class GetPagosMesResumenUseCase(_UseCase):
    """Pagos Aplicados del Mes: reporte de control de Coordinación (gestiona) y Gerencia (lee)."""

    def execute(self, principal: Principal, anio: Any, mes: Any) -> Any:
        a = parse_int(anio, "anio", minimum=2000, maximum=2100)
        m = parse_int(mes, "mes", minimum=1, maximum=12)
        with self._uow_factory(principal) as uow:
            require_roles(
                require_usuario(uow, principal), COORDINADOR, GERENCIA, message=MSG_SOLO_COORD_GERENCIA
            )
            return uow.analisis_pagos.pagos_mes_resumen(a, m)


class MarcarPagosAnuladosUseCase(_UseCase):
    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        raw = body.get("no_recibos") or []
        if not isinstance(raw, list):
            raise ValidationError(MSG_SIN_RECIBOS)
        no_recibos = list(dict.fromkeys(str(r).strip() for r in raw if str(r or "").strip()))
        motivo = optional_text(body.get("motivo"))
        reemplazo = optional_text(body.get("recibo_reemplazo"))
        if not no_recibos:
            raise ValidationError(MSG_SIN_RECIBOS)
        if not motivo:
            raise ValidationError(MSG_SIN_MOTIVO)
        if reemplazo and len(no_recibos) > 1:
            raise ValidationError(MSG_REEMPLAZO_UNICO)
        with self._uow_factory(principal) as uow:
            usuario = require_coordinador(require_usuario(uow, principal))
            uow.analisis_pagos.marcar_anulados(no_recibos, motivo, reemplazo, usuario.email)
            uow.analisis_pagos.registrar_auditoria(
                tabla="pagos_anulados",
                accion="INSERT",
                descripcion=(
                    f"{len(no_recibos)} recibo(s) marcado(s) como anulado: {', '.join(no_recibos)} — {motivo}"
                ),
                valor_nuevo={"no_recibos": no_recibos, "motivo": motivo, "recibo_reemplazo": reemplazo},
                realizado_por=usuario.email,
            )
            uow.commit()
        return {"ok": True, "marcados": len(no_recibos)}


class DesmarcarPagoAnuladoUseCase(_UseCase):
    def execute(self, principal: Principal, no_recibo: str) -> dict[str, Any]:
        recibo = require_text(no_recibo, "no_recibo", message=MSG_SIN_NO_RECIBO)
        with self._uow_factory(principal) as uow:
            usuario = require_coordinador(require_usuario(uow, principal))
            uow.analisis_pagos.desmarcar_anulado(recibo)
            uow.analisis_pagos.registrar_auditoria(
                tabla="pagos_anulados",
                accion="DELETE",
                descripcion=f"Recibo {recibo} desmarcado como anulado",
                realizado_por=usuario.email,
            )
            uow.commit()
        return {"ok": True}


class DescartarDuplicadoUseCase(_UseCase):
    def execute(self, principal: Principal, body: dict[str, Any]) -> dict[str, Any]:
        recibo = require_text(body.get("no_recibo"), "no_recibo", message=MSG_SIN_NO_RECIBO)
        nota_raw = body.get("nota")
        nota = optional_text(nota_raw)
        with self._uow_factory(principal) as uow:
            usuario = require_coordinador(require_usuario(uow, principal))
            uow.analisis_pagos.descartar_duplicado(recibo, nota, usuario.email)
            uow.analisis_pagos.registrar_auditoria(
                tabla="pagos_duplicado_descartado",
                accion="INSERT",
                descripcion=f"Posible duplicado descartado: {recibo}{' — ' + nota if nota else ''}",
                valor_nuevo={"no_recibo": recibo, "nota": nota_raw},
                realizado_por=usuario.email,
            )
            uow.commit()
        return {"ok": True}


class RevertirDescarteDuplicadoUseCase(_UseCase):
    def execute(self, principal: Principal, no_recibo: str) -> dict[str, Any]:
        recibo = require_text(no_recibo, "no_recibo", message=MSG_SIN_NO_RECIBO)
        with self._uow_factory(principal) as uow:
            usuario = require_coordinador(require_usuario(uow, principal))
            uow.analisis_pagos.revertir_descarte_duplicado(recibo)
            uow.analisis_pagos.registrar_auditoria(
                tabla="pagos_duplicado_descartado",
                accion="DELETE",
                descripcion=f"Descarte de posible duplicado revertido: {recibo}",
                realizado_por=usuario.email,
            )
            uow.commit()
        return {"ok": True}
