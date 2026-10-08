"""Unidad de trabajo de la aplicación: repositories disponibles dentro de una transacción.

Cada módulo de negocio expone un repository con el mismo nombre del módulo (``uow.clientes``,
``uow.gestiones``...). El adapter PostgreSQL los crea bajo demanda (ver
``infrastructure/database/postgresql/app_unit_of_work.py``).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING, Protocol, Self

from application.dto.principal import Principal
from application.ports.app_user_repository import AppUserRepository
from application.ports.usuarios import UsuarioDirectory

if TYPE_CHECKING:
    from application.ports.analisis_pagos import AnalisisPagosRepository
    from application.ports.auditoria_legal import AuditoriaLegalRepository
    from application.ports.centro_recursos import CentroRecursosRepository
    from application.ports.clientes import ClientesRepository
    from application.ports.configuracion import ConfiguracionRepository
    from application.ports.dashboard import DashboardRepository
    from application.ports.gestion_cartera import GestionCarteraRepository
    from application.ports.gestiones import GestionesRepository
    from application.ports.jobs import JobsRepository
    from application.ports.notificaciones import NotificacionesRepository
    from application.ports.presupuesto import PresupuestoRepository
    from application.ports.promesas import PromesasRepository
    from application.ports.reportes import ReportesRepository
    from application.ports.solicitudes import SolicitudesRepository


class AppUnitOfWork(Protocol):
    app_users: AppUserRepository
    usuarios: UsuarioDirectory
    clientes: ClientesRepository
    gestiones: GestionesRepository
    promesas: PromesasRepository
    solicitudes: SolicitudesRepository
    dashboard: DashboardRepository
    reportes: ReportesRepository
    presupuesto: PresupuestoRepository
    analisis_pagos: AnalisisPagosRepository
    gestion_cartera: GestionCarteraRepository
    auditoria_legal: AuditoriaLegalRepository
    configuracion: ConfiguracionRepository
    centro_recursos: CentroRecursosRepository
    notificaciones: NotificacionesRepository
    jobs: JobsRepository

    def commit(self) -> None: ...

    def after_commit(self, callback: Callable[[], None]) -> None: ...

    def __enter__(self) -> Self: ...

    def __exit__(self, exc_type, exc, tb) -> None: ...


UnitOfWorkFactory = Callable[[Principal | None], AppUnitOfWork]
