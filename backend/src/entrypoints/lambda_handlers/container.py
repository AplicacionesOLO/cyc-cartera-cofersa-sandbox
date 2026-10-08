"""Composition root compartido: UoW, principal y adapters de infraestructura (todo perezoso).

Cada módulo arma sus casos de uso en su propio archivo de handlers usando estas fábricas
(``container.uow_factory``, ``container.storage("garantias-legal")``, ``container.mailer()``...).
"""

from __future__ import annotations

from functools import cache, lru_cache

from application.dto.principal import Principal
from application.ports.integraciones import (
    ExternalHttp,
    GoogleCalendar,
    GoogleOAuth,
    IntegrationConfig,
    LanguageModel,
)
from application.ports.object_storage import ObjectStorage
from application.use_cases.mailer import UsuarioMailer
from application.use_cases.me import (
    ConnectGoogleUseCase,
    GetMeUseCase,
    GoogleAuthorizeUrlUseCase,
    ListAnalistasConCarteraUseCase,
    ListCalendarEventsUseCase,
    PreviewRolUseCase,
)
from application.use_cases.resolve_current_user import ResolveCurrentUserUseCase
from entrypoints.lambda_handlers.bootstrap import connection_factory
from infrastructure.aws.integration_config import SecretsIntegrationConfig
from infrastructure.aws.s3_object_storage import S3ObjectStorage
from infrastructure.database.postgresql.app_unit_of_work import AppPostgresUnitOfWork
from infrastructure.external.anthropic_model import AnthropicLanguageModel
from infrastructure.external.google_api import GmailApiSender, GoogleCalendarClient, GoogleOAuthClient
from infrastructure.external.http_client import UrllibExternalHttp
from shared.settings import env

# bucket del origen → variable de entorno que define generate_sam.py
_BUCKET_ENV = {
    "comprobantes-pago": "COMPROBANTES_PAGO_BUCKET_NAME",
    "documentos-recursos": "DOCUMENTOS_RECURSOS_BUCKET_NAME",
    "expedientes-clientes": "EXPEDIENTES_CLIENTES_BUCKET_NAME",
    "garantias-legal": "GARANTIAS_LEGAL_BUCKET_NAME",
}


def uow_factory(principal: Principal | None = None) -> AppPostgresUnitOfWork:
    return AppPostgresUnitOfWork(connection_factory(), principal, role=None if principal else "service_role")


@lru_cache(maxsize=1)
def _current_user() -> ResolveCurrentUserUseCase:
    return ResolveCurrentUserUseCase(lambda: uow_factory(None))


def resolve_principal(principal: Principal) -> Principal:
    return _current_user().execute(principal)


@lru_cache(maxsize=1)
def integration_config() -> IntegrationConfig:
    return SecretsIntegrationConfig()


@lru_cache(maxsize=1)
def google_oauth() -> GoogleOAuth:
    return GoogleOAuthClient(integration_config())


@lru_cache(maxsize=1)
def mailer() -> UsuarioMailer:
    return UsuarioMailer(google_oauth(), GmailApiSender())


@lru_cache(maxsize=1)
def calendar() -> GoogleCalendar:
    return GoogleCalendarClient()


@lru_cache(maxsize=1)
def language_model() -> LanguageModel:
    return AnthropicLanguageModel(integration_config())


@lru_cache(maxsize=1)
def external_http() -> ExternalHttp:
    return UrllibExternalHttp()


@cache
def storage(bucket: str) -> ObjectStorage:
    return S3ObjectStorage(env(_BUCKET_ENV[bucket], required=True))


def get_me() -> GetMeUseCase:
    return GetMeUseCase(uow_factory)


def list_analistas_con_cartera() -> ListAnalistasConCarteraUseCase:
    return ListAnalistasConCarteraUseCase(uow_factory)


def preview_rol() -> PreviewRolUseCase:
    return PreviewRolUseCase(uow_factory)


def google_authorize_url() -> GoogleAuthorizeUrlUseCase:
    return GoogleAuthorizeUrlUseCase(uow_factory, google_oauth())


def connect_google() -> ConnectGoogleUseCase:
    return ConnectGoogleUseCase(uow_factory, google_oauth())


def list_calendar_events() -> ListCalendarEventsUseCase:
    return ListCalendarEventsUseCase(uow_factory, mailer(), calendar())
