"""UoW en memoria de la aplicación + fakes compartidos (usuarios, integraciones, storage).

Cada módulo agrega su repository fake en ``fakes/fake_<modulo>.py`` y lo pasa al construir:

    uow = FakeAppUnitOfWork(clientes=FakeClientesRepository())
    use_case = GetClienteUseCase(uow.factory)
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from application.dto.principal import Principal
from application.ports.file_storage import PresignedUpload, StoredObject
from application.ports.integraciones import (
    EmailMessage,
    ExternalHttp,
    GmailSender,
    GoogleCalendar,
    GoogleOAuth,
    GoogleTokens,
    IntegrationConfig,
    LanguageModel,
)
from application.ports.object_storage import ObjectStorage
from application.ports.usuarios import UsuarioDirectory
from domain.entities.usuario import Usuario
from fakes.fake_app_user_repository import FakeAppUserRepository
from fakes.fake_unit_of_work import FakeUnitOfWork


class FakeUsuarioDirectory(UsuarioDirectory):
    def __init__(self) -> None:
        self.rows: dict[UUID, Usuario] = {}
        self.tokens: dict[str, str] = {}
        self.ultima_sync = ""
        self.con_cartera: set[str] = set()

    def add(self, email: str, rol: str, nombre: str | None = None, **extra: Any) -> Usuario:
        usuario = Usuario(
            id=extra.pop("id", uuid4()),
            email=email,
            nombre=nombre or email.split("@")[0],
            rol=rol,
            iniciales=extra.pop("iniciales", "XX"),
            color=extra.pop("color", "#009ee3"),
            **extra,
        )
        self.rows[usuario.id] = usuario
        return usuario

    def find_activo_by_email(self, email: str) -> Usuario | None:
        return next((u for u in self.rows.values() if u.email.lower() == email.lower() and u.activo), None)

    def find_by_id(self, usuario_id: UUID) -> Usuario | None:
        return self.rows.get(usuario_id)

    def list_activos(self) -> list[Usuario]:
        return sorted((u for u in self.rows.values() if u.activo), key=lambda u: u.nombre)

    def list_analistas_con_cartera(self) -> list[dict[str, str]]:
        return [
            {"email": u.email, "nombre": u.nombre}
            for u in self.list_activos()
            if (u.rol == "ANALISTA" or (u.rol == "ANALISTA_RIESGO" and u.tiene_cartera_asignada))
            and u.email in self.con_cartera
        ]

    def count_activos(self) -> int:
        return sum(1 for u in self.rows.values() if u.activo)

    def ultima_sync_cartera(self) -> str:
        return self.ultima_sync

    def get_google_refresh_token(self, email: str) -> str | None:
        return self.tokens.get(email.lower())

    def set_google_refresh_token(self, email: str, refresh_token: str) -> None:
        self.tokens[email.lower()] = refresh_token


class FakeAppUnitOfWork(FakeUnitOfWork):
    """Comparte el estado entre transacciones, como una base real."""

    def __init__(self, **repositories: Any) -> None:
        super().__init__()
        self.app_users = FakeAppUserRepository()
        self.usuarios = FakeUsuarioDirectory()
        for name, repository in repositories.items():
            setattr(self, name, repository)

    def factory(self, principal=None) -> FakeAppUnitOfWork:
        return self


def principal_for(usuario: Usuario) -> Principal:
    return Principal(
        subject=f"sub-{usuario.id}",
        email=usuario.email,
        user_id=uuid4(),
        claims={"email": usuario.email, "email_verified": "true"},
    )


class FakeGoogleOAuth(GoogleOAuth):
    def __init__(self, refresh_token: str | None = "refresh-1") -> None:
        self.refresh_token = refresh_token

    def authorize_url(self, redirect_uri: str, state: str, login_hint: str | None) -> str:
        return f"https://accounts.test/auth?redirect_uri={redirect_uri}&state={state}&login_hint={login_hint}"

    def exchange_code(self, code: str, redirect_uri: str) -> GoogleTokens:
        return GoogleTokens("access-1", self.refresh_token)

    def refresh_access_token(self, refresh_token: str) -> str | None:
        return f"access-for-{refresh_token}"


class FakeGmail(GmailSender):
    def __init__(self) -> None:
        self.sent: list[tuple[str, str, EmailMessage]] = []

    def send(self, access_token: str, sender_email: str, message: EmailMessage) -> str:
        self.sent.append((access_token, sender_email, message))
        return f"msg-{len(self.sent)}"


class FakeCalendar(GoogleCalendar):
    def __init__(self, items: list[dict] | None = None) -> None:
        self.items = items or []

    def list_events(self, access_token: str, time_min: str, time_max: str) -> list[dict]:
        return list(self.items)


class FakeLanguageModel(LanguageModel):
    def __init__(self, answer: str = "texto generado") -> None:
        self.answer = answer
        self.prompts: list[str] = []

    def complete(self, *, model: str, system: str | None, prompt: str, max_tokens: int) -> str:
        self.prompts.append(prompt)
        return self.answer


class FakeExternalHttp(ExternalHttp):
    """Respuestas por URL (prefijo): ``FakeExternalHttp({"https://x": (200, {...})})``."""

    def __init__(self, responses: dict[str, tuple[int, Any]] | None = None) -> None:
        self.responses = responses or {}
        self.calls: list[tuple[str, str, Any]] = []

    def _match(self, url: str) -> tuple[int, Any]:
        for prefix, response in self.responses.items():
            if url.startswith(prefix):
                return response
        return 404, None

    def get_json(self, url, *, params=None, headers=None, timeout=15):
        self.calls.append(("GET", url, params))
        return self._match(url)

    def get_text(self, url, *, params=None, headers=None, timeout=15):
        self.calls.append(("GET", url, params))
        status, body = self._match(url)
        return status, body if isinstance(body, str) else ""

    def post_json(self, url, body, *, headers=None, timeout=15):
        self.calls.append(("POST", url, body))
        return self._match(url)


class FakeIntegrationConfig(IntegrationConfig):
    def __init__(self, values: dict[str, str] | None = None) -> None:
        self.values = values or {}

    def get(self, key: str) -> str | None:
        return self.values.get(key) or None


class FakeStorage(ObjectStorage):
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}
        self.uploads: list[tuple[str, str]] = []

    def presign_upload(self, key: str, content_type: str, *, expires_in: int = 900) -> PresignedUpload:
        self.uploads.append((key, content_type))
        return PresignedUpload(
            url=f"https://storage.test/{key}?signed",
            key=key,
            headers={"Content-Type": content_type},
            expires_in=expires_in,
        )

    def presign_download(self, key: str, *, expires_in: int = 900, download_name: str | None = None) -> str:
        return f"https://storage.test/{key}?download&ttl={expires_in}"

    def delete(self, keys: list[str]) -> None:
        for key in keys:
            self.objects.pop(key, None)

    def exists(self, key: str) -> bool:
        return key in self.objects

    def list(self, prefix: str, *, limit: int = 1000) -> list[StoredObject]:
        return [
            StoredObject(k, len(v[0]), None, v[1]) for k, v in self.objects.items() if k.startswith(prefix)
        ][:limit]

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = (data, content_type)

    def get_bytes(self, key: str) -> bytes | None:
        item = self.objects.get(key)
        return item[0] if item else None
