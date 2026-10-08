"""Reportes de Gerencia que antes se armaban en Server Components con varias consultas.

- ``GetResumenEjecutivoUseCase``: ``resumen-ejecutivo/page.tsx`` (get_kpis_cartera, ventas_mensuales,
  fn_analisis_concentracion, fn_recuperacion_mom, historico_cartera).
- ``GetCierreMensualUseCase``: ``cierre-mensual/page.tsx`` (9 consultas en paralelo). El cálculo de
  los tops/KPIs sigue en la página; aquí solo se devuelven los datos crudos con la misma forma.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import UnitOfWorkFactory
from application.use_cases.reportes import parse_anio_mes, require_reporte

MESES_RECAUDO = 13
LIMITE_HISTORICO = 90


def shift_mes(anio: int, mes: int, delta: int) -> tuple[int, int]:
    """anio/mes desplazado ``delta`` meses (negativo = hacia atrás)."""
    idx = anio * 12 + (mes - 1) + delta
    return idx // 12, idx % 12 + 1


def primer_dia(anio: int, mes: int) -> date:
    return date(anio, mes, 1)


def ultimo_dia(anio: int, mes: int) -> date:
    sig_anio, sig_mes = shift_mes(anio, mes, 1)
    return date(sig_anio, sig_mes, 1) - timedelta(days=1)


class GetResumenEjecutivoUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal) -> dict[str, Any]:
        with self._uow_factory(principal) as uow:
            require_reporte(uow, principal, "resumen-ejecutivo")
            repo = uow.reportes
            return {
                "kpis": repo.kpis_cartera(),
                "ventas": repo.ventas_mensuales(),
                "concentracion": repo.concentracion(),
                "recaudo_meses": repo.recuperacion_mom(MESES_RECAUDO, None) or [],
                "historico": repo.historico_cartera(LIMITE_HISTORICO),
            }


class GetCierreMensualUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, anio: Any, mes: Any) -> dict[str, Any]:
        a, m = parse_anio_mes(anio, mes)
        anio_ant, mes_ant = shift_mes(a, m, -1)
        # Ventanas de la ICP: 3 meses recientes (m-2..m) vs 3 previos (m-5..m-3)
        rec_ini = primer_dia(*shift_mes(a, m, -2))
        rec_fin = ultimo_dia(a, m)
        prev_ini = primer_dia(*shift_mes(a, m, -5))
        prev_fin = ultimo_dia(*shift_mes(a, m, -3))
        with self._uow_factory(principal) as uow:
            require_reporte(uow, principal, "cierre-mensual")
            repo = uow.reportes
            return {
                "meses": repo.cierre_meses(),
                "vendedores": repo.vendedores_zona(),
                "grupos": repo.portafolio_grupos_activos(),
                "miembros": repo.portafolio_miembros_activos(),
                "maestro": repo.maestro_clientes_resumen(),
                "recuperacion": repo.recuperacion(a, m),
                "riesgo": repo.cierre_riesgo_vendedor(a, m),
                "mora": repo.cierre_mora(a, m, anio_ant, mes_ant),
                "icp": repo.cierre_icp(rec_ini, rec_fin, prev_ini, prev_fin),
            }
