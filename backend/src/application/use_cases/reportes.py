"""Reportes del Hub (cobranza, control y gestión comercial).

Reemplaza las llamadas ``RPC fn_reporte_*`` / consultas a ... que hacían los
Client Components de ``src/app/(app)/reportes/**``. Cada caso de uso exige perfil activo, aplica los
roles del registry (``domain.entities.reportes``) y acota por analista donde el origen pasaba
``p_email`` (un ANALISTA siempre queda limitado a su propia cartera, pida lo que pida).
"""

from __future__ import annotations

from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import AppUnitOfWork, UnitOfWorkFactory
from application.use_cases.common import (
    analista_scope,
    optional_text,
    parse_date,
    parse_int,
    require_escritura,
    require_usuario,
)
from domain.entities.reportes import DIMENSIONES_CLIENTE, MSG_SIN_ACCESO_REPORTE, puede_ver_reporte
from domain.entities.usuario import Usuario
from domain.exceptions import DomainError, ForbiddenError, ValidationError

ORDEN_PERFIL_VENDEDOR = "icp_asc"


def require_reporte(uow: AppUnitOfWork, principal: Principal, reporte_id: str) -> Usuario:
    usuario = require_usuario(uow, principal)
    if not puede_ver_reporte(usuario, reporte_id):
        raise ForbiddenError(MSG_SIN_ACCESO_REPORTE)
    return usuario


def parse_anio_mes(anio: Any, mes: Any) -> tuple[int, int]:
    return parse_int(anio, "anio", minimum=2000, maximum=2100), parse_int(mes, "mes", minimum=1, maximum=12)


class _ReporteUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory


class GetAgingUseCase(_ReporteUseCase):
    def execute(self, principal: Principal) -> Any:
        with self._uow_factory(principal) as uow:
            require_reporte(uow, principal, "aging-consolidado")
            return uow.reportes.aging()


class GetCeiUseCase(_ReporteUseCase):
    def execute(self, principal: Principal, anio: Any, mes: Any) -> Any:
        a, m = parse_anio_mes(anio, mes)
        with self._uow_factory(principal) as uow:
            require_reporte(uow, principal, "cei")
            return uow.reportes.cei(a, m) or []


class TomarCierreCarteraUseCase(_ReporteUseCase):
    """Cierre manual del CEI (respaldo del cron de fin de mes). Gerencia es solo lectura."""

    def execute(self, principal: Principal, body: dict[str, Any]) -> Any:
        a, m = parse_anio_mes(body.get("anio"), body.get("mes"))
        provisional = bool(body.get("provisional", False))
        with self._uow_factory(principal) as uow:
            usuario = require_escritura(require_reporte(uow, principal, "cei"))
            result = uow.reportes.snapshot_cierre_cartera(a, m, provisional, usuario.nombre)
            uow.commit()
        return result


class GetEfectividadUseCase(_ReporteUseCase):
    def execute(self, principal: Principal, ini: Any, fin: Any) -> Any:
        desde, hasta = parse_date(ini, "ini"), parse_date(fin, "fin")
        with self._uow_factory(principal) as uow:
            require_reporte(uow, principal, "efectividad-gestiones")
            return uow.reportes.efectividad(desde, hasta, None)


class GetIcpVendedorUseCase(_ReporteUseCase):
    def execute(self, principal: Principal, meses: Any) -> Any:
        periodo = parse_int(meses if meses not in (None, "") else 6, "meses", minimum=1, maximum=36)
        with self._uow_factory(principal) as uow:
            require_reporte(uow, principal, "icp-vendedor")
            return uow.reportes.perfil_vendedor(periodo, ORDEN_PERFIL_VENDEDOR)


class GetMigracionMoraUseCase(_ReporteUseCase):
    def execute(
        self, principal: Principal, anio: Any, mes: Any, supervisor_cod: Any, vendedor_cod: Any
    ) -> Any:
        a, m = parse_anio_mes(anio, mes)
        with self._uow_factory(principal) as uow:
            require_reporte(uow, principal, "migracion-mora")
            return uow.reportes.migracion_mora(
                a, m, optional_text(supervisor_cod), optional_text(vendedor_cod)
            )


class GetMigracionFiltrosUseCase(_ReporteUseCase):
    """Catálogos de filtro de la matriz de migración (supervisores + vendedores activos)."""

    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            require_reporte(uow, principal, "migracion-mora")
            return {
                "supervisores": uow.reportes.supervisores(),
                "vendedores": uow.reportes.vendedores_activos(),
            }


class GetMoraVendedorUseCase(_ReporteUseCase):
    def execute(self, principal: Principal, email: str | None) -> Any:
        with self._uow_factory(principal) as uow:
            usuario = require_reporte(uow, principal, "mora-vendedor")
            return uow.reportes.mora_vendedor(analista_scope(usuario, email))


class GetBloqueadosUseCase(_ReporteUseCase):
    """Clientes bloqueados. El snapshot semanal solo lo dispara el coordinador (evita duplicados)."""

    def execute(self, principal: Principal, email: str | None, snapshot: bool) -> Any:
        with self._uow_factory(principal) as uow:
            usuario = require_reporte(uow, principal, "mora-vendedor")
        if snapshot and usuario.es_coordinador:
            try:
                with self._uow_factory(principal) as uow:
                    uow.reportes.snapshot_bloqueados_semana()
                    uow.commit()
            except DomainError:
                pass  # igual que el origen: si el snapshot falla, el reporte se muestra igual
        with self._uow_factory(principal) as uow:
            return uow.reportes.bloqueados(analista_scope(usuario, email))


class GetPlazoEspecialUseCase(_ReporteUseCase):
    def execute(self, principal: Principal, email: str | None) -> Any:
        with self._uow_factory(principal) as uow:
            usuario = require_reporte(uow, principal, "facturas-plazo-especial")
            return uow.reportes.plazo_especial(analista_scope(usuario, email))


class GetPortafolioDestinatariosUseCase(_ReporteUseCase):
    """Miembros de cada Portafolio Acotado (destinatarios extra del envío por vendedor)."""

    def execute(self, principal: Principal) -> dict[str, list[str]]:
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
            return uow.reportes.portafolio_destinatarios() or {}


class ListDimensionOpcionesUseCase(_ReporteUseCase):
    def execute(self, principal: Principal, tipo: str | None) -> list[str]:
        if tipo not in DIMENSIONES_CLIENTE:
            raise ValidationError("'tipo' debe ser 'dimension' o 'agrupacion'.", details={"field": "tipo"})
        with self._uow_factory(principal) as uow:
            require_usuario(uow, principal)
            return uow.reportes.dimension_opciones(tipo)


class GetEstadosCuentaUseCase(_ReporteUseCase):
    """Contribuyentes para el envío masivo, enriquecidos con el vendedor del código representativo."""

    def execute(self, principal: Principal, email: str | None) -> list[dict[str, Any]]:
        with self._uow_factory(principal) as uow:
            usuario = require_reporte(uow, principal, "estados-cuenta")
            contribs = uow.reportes.estados_cuenta(analista_scope(usuario, email)) or []
            cods = [c["rep_cod"] for c in contribs if c.get("rep_cod")]
            vendedores = uow.reportes.vendedores_de_clientes(cods) if cods else []
        por_cod = {v["cliente_cod"]: v for v in vendedores}
        return [
            {
                **c,
                "vendedor_cod": (por_cod.get(c.get("rep_cod")) or {}).get("vendedor_cod"),
                "vendedor_nombre": (por_cod.get(c.get("rep_cod")) or {}).get("vendedor_nombre"),
            }
            for c in contribs
        ]


class GetCarteraVencidaUseCase(_ReporteUseCase):
    def execute(self, principal: Principal) -> list[dict[str, Any]]:
        with self._uow_factory(principal) as uow:
            usuario = require_reporte(uow, principal, "cartera-vencida")
            return uow.reportes.cartera_vencida(usuario.email)


class GetGestionesPeriodoUseCase(_ReporteUseCase):
    def execute(self, principal: Principal, ini: Any, fin: Any) -> list[dict[str, Any]]:
        desde, hasta = parse_date(ini, "ini"), parse_date(fin, "fin")
        with self._uow_factory(principal) as uow:
            usuario = require_reporte(uow, principal, "gestiones-periodo")
            return uow.reportes.gestiones_periodo(usuario.email, desde, hasta)
