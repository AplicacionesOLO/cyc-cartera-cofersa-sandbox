"""UnitOfWork de la aplicación: repositories sobre la conexión de la transacción.

Los repositories de cada módulo se crean bajo demanda (primer acceso a ``uow.<modulo>``): un caso de
uso solo instancia lo que usa y cada módulo vive en su propio archivo
``infrastructure/database/postgresql/<modulo>_repository.py``.
"""

from __future__ import annotations

from importlib import import_module
from typing import Any

import psycopg

from infrastructure.database.postgresql.app_user_repository import PostgresAppUserRepository
from infrastructure.database.postgresql.unit_of_work import PostgresUnitOfWork
from infrastructure.database.postgresql.usuario_directory import PostgresUsuarioDirectory

_PACKAGE = "infrastructure.database.postgresql"
# atributo del UoW → (módulo, clase) del adapter
REPOSITORIES: dict[str, tuple[str, str]] = {
    "clientes": ("clientes_repository", "PostgresClientesRepository"),
    "gestiones": ("gestiones_repository", "PostgresGestionesRepository"),
    "promesas": ("promesas_repository", "PostgresPromesasRepository"),
    "solicitudes": ("solicitudes_repository", "PostgresSolicitudesRepository"),
    "dashboard": ("dashboard_repository", "PostgresDashboardRepository"),
    "reportes": ("reportes_repository", "PostgresReportesRepository"),
    "presupuesto": ("presupuesto_repository", "PostgresPresupuestoRepository"),
    "analisis_pagos": ("analisis_pagos_repository", "PostgresAnalisisPagosRepository"),
    "gestion_cartera": ("gestion_cartera_repository", "PostgresGestionCarteraRepository"),
    "auditoria_legal": ("auditoria_legal_repository", "PostgresAuditoriaLegalRepository"),
    "configuracion": ("configuracion_repository", "PostgresConfiguracionRepository"),
    "centro_recursos": ("centro_recursos_repository", "PostgresCentroRecursosRepository"),
    "notificaciones": ("notificaciones_repository", "PostgresNotificacionesRepository"),
    "jobs": ("jobs_repository", "PostgresJobsRepository"),
}


class AppPostgresUnitOfWork(PostgresUnitOfWork):
    def _build_repositories(self, connection: psycopg.Connection) -> None:
        self._repos: dict[str, Any] = {}
        self.app_users = PostgresAppUserRepository(connection)
        self.usuarios = PostgresUsuarioDirectory(connection)

    def __getattr__(self, name: str) -> Any:
        spec = REPOSITORIES.get(name)
        repos = self.__dict__.get("_repos")
        if spec is None or repos is None or self.__dict__.get("connection") is None:
            raise AttributeError(name)
        if name not in repos:
            module, cls = spec
            repos[name] = getattr(import_module(f"{_PACKAGE}.{module}"), cls)(self.connection)
        return repos[name]
