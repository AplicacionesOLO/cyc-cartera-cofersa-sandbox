"""Dashboard (coordinador/gerencia y analista) y Mi Cartera.

- ``GetDashboardCoordinadorUseCase`` reemplaza las 10 consultas de ``DashboardCoordinador``
  (``app/(app)/dashboard/page.tsx``): KPIs globales, ventas/DSO, pedidos retenidos, Mi Equipo, meta
  mensual (fn_recuperacion + fallback config_sistema.meta_mensual) e histórico de mora.
- ``GetDashboardAnalistaUseCase`` reemplaza las 9 consultas de ``DashboardAnalista`` + la cola.
- ``GetMiCarteraUseCase`` reemplaza ``computarColaDia`` + los KPIs de ``mi-cartera/page.tsx``.

Scope (antes RLS + filtros del front): COORDINADOR/GERENCIA ven todo; el resto solo su propio email.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

from application.dto.principal import Principal
from application.ports.app_unit_of_work import AppUnitOfWork, UnitOfWorkFactory
from application.ports.dashboard import DashboardRepository
from application.use_cases.common import ahora_cr, analista_scope, require_roles, require_usuario
from domain.entities.usuario import COORDINADOR, GERENCIA, Usuario
from domain.exceptions import ForbiddenError
from domain.services.cola_dia import VENTANA_PAGO_RECIENTE, DatosCola, construir_cola

HISTORICO_LIMITE = 90
AGENDA_LIMITE = 5
MSG_SOLO_GLOBAL = "Acceso restringido a Coordinación y Gerencia"
MSG_MI_CARTERA = "Su rol no tiene acceso a Mi Cartera"


def computar_cola_dia(repo: DashboardRepository, analista_email: str, hoy: date) -> dict[str, Any]:
    """Lee lo necesario y aplica el Algoritmo V4 (``domain.services.cola_dia``)."""
    codigos = [c for c in repo.clientes_de_analista(analista_email) if c]
    if not codigos:
        return {"rows": [], "recuperadoMes": 0, "totalPromesasActivas": 0}
    datos = DatosCola(
        cartera=repo.cartera_de_clientes(codigos, repo.ultimo_sync_cartera() or None),
        gestiones=repo.gestiones_de_clientes(codigos),
        promesas_pendientes=repo.promesas_pendientes_de_clientes(codigos),
        recuperado_mes=repo.monto_promesas_cumplidas(codigos, hoy.replace(day=1)),
        icp=repo.icp_de_clientes(codigos),
        pagos_recientes=repo.pagos_desde(codigos, hoy - timedelta(days=VENTANA_PAGO_RECIENTE)),
    )
    return construir_cola(datos, hoy)


def _email_objetivo(usuario: Usuario, requested: str | None) -> str:
    return analista_scope(usuario, requested) or usuario.email


def _kpis_de(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    return payload.get("kpis") if isinstance(payload, dict) else None


class GetDashboardCoordinadorUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal) -> dict[str, Any]:
        now_cr = ahora_cr()
        hoy = now_cr.date()
        inicio_semana = hoy - timedelta(days=hoy.weekday())  # lunes de la semana (CR)
        with self._uow_factory(principal) as uow:
            require_roles(require_usuario(uow, principal), COORDINADOR, GERENCIA, message=MSG_SOLO_GLOBAL)
            repo = uow.dashboard
            recuperacion = repo.recuperacion(hoy.year, hoy.month)
            rec_kpis = _kpis_de(recuperacion)
            meta = float((rec_kpis or {}).get("meta_total") or 0)
            return {
                "kpis_cartera": repo.kpis_cartera(),
                "ventas_mensuales": repo.ventas_mensuales(),
                "pedidos_retenidos_kpis": _kpis_de(repo.pedidos_retenidos(None)),
                "equipo": self._equipo(repo, hoy, inicio_semana),
                "recuperacion_kpis": rec_kpis,
                # Fallback cuando el mes aún no tiene presupuesto congelado
                "meta_mensual_config": repo.config_valor("meta_mensual") if meta == 0 else None,
                "historico": repo.historico_cartera(HISTORICO_LIMITE),
            }

    @staticmethod
    def _equipo(repo: DashboardRepository, hoy: date, inicio_semana: date) -> list[dict[str, Any]]:
        """Elegibles por rol + conteos; el front cruza con analistasConCarteraReal (cartera real hoy)."""
        conteos = {
            c["analista_email"]: c
            for c in repo.conteo_gestiones_por_analista(hoy, inicio_semana, hoy.replace(day=1))
        }
        equipo = []
        for a in repo.analistas_elegibles():
            c = conteos.get(a["email"], {})
            equipo.append(
                {
                    "id": a["id"],
                    "nombre": a["nombre"],
                    "email": a["email"],
                    "iniciales": a["iniciales"],
                    "color": a["color"],
                    "gHoy": int(c.get("g_hoy") or 0),
                    "gSemana": int(c.get("g_semana") or 0),
                    "gMes": int(c.get("g_mes") or 0),
                }
            )
        return equipo


class GetDashboardAnalistaUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, email: str | None = None) -> dict[str, Any]:
        hoy = ahora_cr().date()
        # Igual que el origen: "mañana" se calculaba sobre la fecha UTC (Date.now() + 1 día).
        manana = (datetime.now(UTC) + timedelta(days=1)).date()
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            objetivo = _email_objetivo(usuario, email)
            repo = uow.dashboard
            cola = computar_cola_dia(repo, objetivo, hoy)
            return {
                "kpis": repo.kpis_analista(objetivo),
                "vendedores": repo.vendedores_analista(objetivo),
                # Cola del Dashboard: solo pendientes hoy (excluye gestionados y próxima acción futura)
                "cola": [r for r in cola["rows"] if r["en_agenda"] and not r["gestionado_hoy"]],
                "agenda_gestiones": repo.agenda_gestiones(objetivo, [hoy, manana], AGENDA_LIMITE),
                "agenda_promesas": repo.agenda_promesas(objetivo, [hoy, manana], AGENDA_LIMITE),
                "promesas": repo.promesas_pendientes(objetivo, AGENDA_LIMITE),
                "tareas_sugeridas": self._tareas(uow, usuario, objetivo),
                "meta_gestiones_diarias": repo.config_valor("meta_gestiones_diarias"),
                "pedidos_retenidos_kpis": _kpis_de(repo.pedidos_retenidos(objetivo)),
            }

    @staticmethod
    def _tareas(uow: AppUnitOfWork, usuario: Usuario, objetivo: str) -> list[dict[str, Any]]:
        destino = usuario if objetivo.lower() == usuario.email.lower() else None
        destino = destino or uow.usuarios.find_activo_by_email(objetivo)
        return uow.dashboard.tareas_sugeridas(destino.id, AGENDA_LIMITE) if destino else []


class GetMiCarteraUseCase:
    def __init__(self, uow_factory: UnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    def execute(self, principal: Principal, email: str | None = None) -> dict[str, Any]:
        hoy = ahora_cr().date()
        with self._uow_factory(principal) as uow:
            usuario = require_usuario(uow, principal)
            # Gerencia nunca (no es una vista gerencial); ANALISTA_RIESGO solo con cartera asignada.
            if usuario.rol == GERENCIA or not (usuario.es_coordinador or usuario.puede_gestionar_cartera):
                raise ForbiddenError(MSG_MI_CARTERA)
            cola = computar_cola_dia(uow.dashboard, _email_objetivo(usuario, email), hoy)
        rows = cola["rows"]
        return {
            "rows": rows,
            "kpis": {
                "moraTotal": sum(r["mora_total"] for r in rows),
                "recuperadoMes": cola["recuperadoMes"],
                "promesasActivas": cola["totalPromesasActivas"],
                "sinGestion7d": sum(1 for r in rows if r["dias_sin_gestion"] > 7),
            },
        }
