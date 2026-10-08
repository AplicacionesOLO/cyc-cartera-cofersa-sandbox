import pytest

from application.dto.principal import Principal
from application.ports.integraciones import EmailMessage
from application.use_cases.common import analista_scope, require_escritura, split_emails
from application.use_cases.mailer import UsuarioMailer
from application.use_cases.me import (
    ConnectGoogleUseCase,
    GetMeUseCase,
    GoogleAuthorizeUrlUseCase,
    ListAnalistasConCarteraUseCase,
    ListCalendarEventsUseCase,
    PreviewRolUseCase,
)
from domain.exceptions import BusinessRuleViolation, ForbiddenError, UnauthorizedError, ValidationError
from fakes.fake_app_unit_of_work import (
    FakeAppUnitOfWork,
    FakeCalendar,
    FakeGmail,
    FakeGoogleOAuth,
    principal_for,
)


@pytest.fixture
def world():
    uow = FakeAppUnitOfWork()
    coord = uow.usuarios.add("JDiaz@cofersa.cr", "COORDINADOR", "Jeffrey Díaz")
    analista = uow.usuarios.add("agomez@cofersa.cr", "ANALISTA", "Angélica Gómez")
    gerencia = uow.usuarios.add("jgarcia@cofersa.cr", "GERENCIA")
    return uow, coord, analista, gerencia


def test_get_me_matches_email_case_insensitive(world):
    uow, coord, _, _ = world
    me = GetMeUseCase(uow.factory).execute(Principal(subject="s", email="jdiaz@COFERSA.cr"))
    assert me["perfil"]["nombre"] == "Jeffrey Díaz"
    assert me["rol"] == "COORDINADOR"
    assert me["gmail_conectado"] is False


def test_get_me_denies_unknown_or_inactive(world):
    uow, _, _, _ = world
    uow.usuarios.add("baja@cofersa.cr", "ANALISTA", activo=False)
    with pytest.raises(ForbiddenError) as error:
        GetMeUseCase(uow.factory).execute(Principal(subject="s", email="baja@cofersa.cr"))
    assert error.value.code == "acceso_denegado"
    with pytest.raises(UnauthorizedError):
        GetMeUseCase(uow.factory).execute(Principal(subject="s"))


def test_analistas_con_cartera_cross_role_and_real_portfolio(world):
    uow, coord, analista, _ = world
    riesgo = uow.usuarios.add(
        "jordonez@mayoreo.biz", "ANALISTA_RIESGO", "Jossmin", tiene_cartera_asignada=True
    )
    uow.usuarios.add("pchavarria@cofersa.cr", "ANALISTA", "Paula")  # activa pero sin cartera
    uow.usuarios.con_cartera = {analista.email, riesgo.email}
    result = ListAnalistasConCarteraUseCase(uow.factory).execute(principal_for(coord))
    assert [r["email"] for r in result] == ["agomez@cofersa.cr", "jordonez@mayoreo.biz"]


def test_preview_rol_only_for_coordinador(world):
    uow, coord, analista, _ = world
    use_case = PreviewRolUseCase(uow.factory)
    assert use_case.execute(principal_for(coord), {"rol": "GERENCIA"}) == {
        "ok": True,
        "previsualizando": True,
        "rol": "GERENCIA",
    }
    assert use_case.execute(principal_for(coord), {"rol": None})["previsualizando"] is False
    with pytest.raises(ValidationError):
        use_case.execute(principal_for(coord), {"rol": "COORDINADOR"})
    with pytest.raises(ForbiddenError):
        use_case.execute(principal_for(analista), {"rol": "GERENCIA"})


def test_google_connect_persists_refresh_token(world):
    uow, _, analista, _ = world
    url = GoogleAuthorizeUrlUseCase(uow.factory, FakeGoogleOAuth()).execute(
        principal_for(analista), "https://app/auth/google", "st"
    )
    assert "login_hint=agomez@cofersa.cr" in url["url"]
    ConnectGoogleUseCase(uow.factory, FakeGoogleOAuth("rt-9")).execute(
        principal_for(analista), {"code": "c", "redirect_uri": "https://app/auth/google"}
    )
    assert uow.usuarios.get_google_refresh_token("agomez@cofersa.cr") == "rt-9"


def test_google_connect_without_refresh_token_fails_when_none_stored(world):
    uow, _, analista, _ = world
    with pytest.raises(BusinessRuleViolation):
        ConnectGoogleUseCase(uow.factory, FakeGoogleOAuth(None)).execute(
            principal_for(analista), {"code": "c", "redirect_uri": "r"}
        )


def test_mailer_uses_stored_refresh_token(world):
    uow, _, analista, _ = world
    gmail = FakeGmail()
    mailer = UsuarioMailer(FakeGoogleOAuth(), gmail)
    message = EmailMessage(to=("cliente@x.com",), subject="Cobro", html="<p>hola</p>")
    with pytest.raises(BusinessRuleViolation):
        mailer.send(uow, analista, message)
    uow.usuarios.set_google_refresh_token(analista.email, "rt")
    assert mailer.send(uow, analista, message) == "msg-1"
    assert gmail.sent[0][:2] == ("access-for-rt", "agomez@cofersa.cr")


def test_calendar_returns_empty_without_gmail(world):
    uow, _, analista, _ = world
    use_case = ListCalendarEventsUseCase(
        uow.factory, UsuarioMailer(FakeGoogleOAuth(), FakeGmail()), FakeCalendar([{"id": "e1"}])
    )
    assert use_case.execute(principal_for(analista), "2026-10-01", "2026-10-31") == []
    uow.usuarios.set_google_refresh_token(analista.email, "rt")
    assert use_case.execute(principal_for(analista), "2026-10-01", "2026-10-31") == [{"id": "e1"}]


def test_scope_and_read_only_rules(world):
    _, coord, analista, gerencia = world
    assert analista_scope(coord, "x@cofersa.cr") == "x@cofersa.cr"
    assert analista_scope(coord, None) is None
    assert analista_scope(analista, "otro@cofersa.cr") == "agomez@cofersa.cr"
    with pytest.raises(ForbiddenError):
        require_escritura(gerencia)
    assert split_emails("a@x.com; b@x.com,a@x.com") == ("a@x.com", "b@x.com")
