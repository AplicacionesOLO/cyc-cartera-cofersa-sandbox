"""Singletons de infraestructura compartidos por todos los handlers (warm start).

El ``container.py`` de cada proyecto importa de aquí la fábrica de conexiones y arma sus
casos de uso. Nada se inicializa al importar: todo es perezoso.
"""

from __future__ import annotations

from functools import lru_cache

from infrastructure.aws.secrets import get_secrets
from infrastructure.database.postgresql.connection import (
    PostgresConnectionFactory,
    SecretsManagerCredentials,
)
from shared.settings import get_database_settings, get_settings


@lru_cache(maxsize=1)
def connection_factory() -> PostgresConnectionFactory:
    db = get_database_settings()
    settings = get_settings()
    return PostgresConnectionFactory(
        db,
        SecretsManagerCredentials(get_secrets(), db.secret_name),
        application_name=f"{settings.service_name}-{settings.environment}",
    )
