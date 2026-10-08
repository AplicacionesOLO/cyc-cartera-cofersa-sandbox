from datetime import date
from decimal import Decimal

import pytest

from application.use_cases.mailer import UsuarioMailer
from application.use_cases.presupuesto import (
    AjustarMetaVendedorUseCase,
    CongelarPresupuestoUseCase,
    EnviarCorreoPresupuestoUseCase,
    GetDestinatariosPresupuestoUseCase,
    GetMetaAnalistaMesUseCase,
    GetPresupuestoMesUseCase,
    GetProyeccionCobroUseCase,
    GetRecuperacionMesUseCase,
    GetRecuperacionMomUseCase,
    GetRecuperacionPeriodoUseCase,
    GetRecuperacionTramosUseCase,
    GetSinPagoUseCase,
    ListVendedoresPresupuestoUseCase,
    ReasignarClientePresupuestoUseCase,
)
from domain.exceptions import BusinessRuleViolation, ForbiddenError, ValidationError
from entrypoints.lambda_handlers import presupuesto as handlers
from fakes.fake_app_unit_of_work import FakeAppUnitOfWork, FakeGmail, FakeGoogleOAuth, principal_for
from fakes.fake_presupuesto import FakePresupuestoRepository


@pytest.fixture
def world():
    repo = FakePresupuestoRepository()
    uow = FakeAppUnitOfWork(presupuesto=repo)
    coord = uow.usuarios.add("jdiaz@cofersa.cr", "COORDINADOR", "Jeffrey Díaz")
    analista = uow.usuarios.add("agomez@cofersa.cr", "ANALISTA", "Angélica Gómez")
    gerencia = uow.usuarios.add("jgarcia@cofersa.cr", "GERENCIA", "Jorge García")
    riesgo = uow.usuarios.add("jordonez@mayoreo.biz", "ANALISTA_RIESGO", "Jossmin")
    return uow, repo, coord, analista, gerencia, riesgo


def test_presupuesto_mes_devuelve_estimado_si_no_hay_congelado(world):
    uow, repo, coord, _, gerencia, _ = world
    repo.estimados[(2026, 10)] = {"kpis": {"ppto_total": 10}, "vendedores": []}
    result = GetPresupuestoMesUseCase(uow.factory).execute(principal_for(gerencia), "2026", "10")
    assert result == {"kpis": {"ppto_total": 10}, "vendedores": [], "congelado": False}
    CongelarPresupuestoUseCase(uow.factory).execute(principal_for(coord), {"anio": 2026, "mes": 10})
    frozen = GetPresupuestoMesUseCase(uow.factory).execute(principal_for(coord), 2026, 10)
    assert frozen["congelado"] is True
    assert repo.calls[0] == ("congelar", 2026, 10, "jdiaz@cofersa.cr")
    assert uow.commits == 1


def test_presupuesto_mes_solo_coordinacion_y_gerencia(world):
    uow, _, _, analista, _, riesgo = world
    for usuario in (analista, riesgo):
        with pytest.raises(ForbiddenError):
            GetPresupuestoMesUseCase(uow.factory).execute(principal_for(usuario), 2026, 10)
        with pytest.raises(ForbiddenError):
            GetRecuperacionMesUseCase(uow.factory).execute(principal_for(usuario), 2026, 10)
        with pytest.raises(ForbiddenError):
            GetProyeccionCobroUseCase(uow.factory).execute(principal_for(usuario), None, None)


def test_periodo_invalido(world):
    uow, _, coord, _, _, _ = world
    with pytest.raises(ValidationError):
        GetPresupuestoMesUseCase(uow.factory).execute(principal_for(coord), 2026, 13)
    with pytest.raises(ValidationError):
        CongelarPresupuestoUseCase(uow.factory).execute(principal_for(coord), {"anio": "x", "mes": 1})


def test_escrituras_solo_coordinador(world):
    uow, repo, coord, _, gerencia, _ = world
    body = {"anio": 2026, "mes": 10, "vendedor_cod": "V01", "meta": "1500000.4"}
    with pytest.raises(ForbiddenError):
        AjustarMetaVendedorUseCase(uow.factory).execute(principal_for(gerencia), body)
    with pytest.raises(ForbiddenError):
        CongelarPresupuestoUseCase(uow.factory).execute(principal_for(gerencia), {"anio": 2026, "mes": 10})
    AjustarMetaVendedorUseCase(uow.factory).execute(principal_for(coord), body)
    assert repo.metas[(2026, 10, "V01")] == 1500000
    ReasignarClientePresupuestoUseCase(uow.factory).execute(
        principal_for(coord), {"anio": 2026, "mes": 10, "cliente_cod": "C1", "vendedor_cod": "V02"}
    )
    assert repo.calls[-1] == ("reasignar", 2026, 10, "C1", "V02", "jdiaz@cofersa.cr")
    with pytest.raises(ValidationError):
        AjustarMetaVendedorUseCase(uow.factory).execute(principal_for(coord), {**body, "meta": -5})
    with pytest.raises(ValidationError):
        ReasignarClientePresupuestoUseCase(uow.factory).execute(
            principal_for(coord), {"anio": 2026, "mes": 10, "cliente_cod": "C1"}
        )


def test_vendedores_y_destinatarios(world):
    uow, repo, coord, analista, _, _ = world
    repo.vendedores = [{"cod": "V01", "nombre": "Ana"}]
    repo.directorio["supervisores"] = [{"email": "sup@cofersa.cr"}]
    assert ListVendedoresPresupuestoUseCase(uow.factory).execute(principal_for(coord)) == repo.vendedores
    assert GetDestinatariosPresupuestoUseCase(uow.factory).execute(principal_for(coord))["supervisores"]
    with pytest.raises(ForbiddenError):
        GetDestinatariosPresupuestoUseCase(uow.factory).execute(principal_for(analista))


def test_enviar_correo_valida_y_envia_desde_gmail_del_usuario(world):
    uow, _, coord, _, gerencia, _ = world
    gmail = FakeGmail()
    use_case = EnviarCorreoPresupuestoUseCase(uow.factory, UsuarioMailer(FakeGoogleOAuth(), gmail))
    body = {
        "to": "a@cofersa.cr; b@cofersa.cr",
        "cc": ["c@cofersa.cr;d@cofersa.cr"],
        "subject": "Ppto",
        "html": "<p>x</p>",
    }
    with pytest.raises(ValidationError, match="to, subject y html son requeridos"):
        use_case.execute(principal_for(coord), {**body, "html": " "})
    with pytest.raises(ValidationError, match="Dirección de correo inválida: malo"):
        use_case.execute(principal_for(coord), {**body, "to": "a@cofersa.cr;malo"})
    with pytest.raises(ForbiddenError, match="No tenés permiso"):
        use_case.execute(principal_for(gerencia), body)
    with pytest.raises(BusinessRuleViolation):  # sin Gmail conectado
        use_case.execute(principal_for(coord), body)
    uow.usuarios.set_google_refresh_token(coord.email, "rt")
    assert use_case.execute(principal_for(coord), body)["email_sent"] is True
    _, sender, message = gmail.sent[0]
    assert sender == "jdiaz@cofersa.cr"
    assert message.to == ("a@cofersa.cr", "b@cofersa.cr")
    assert message.cc == ("c@cofersa.cr", "d@cofersa.cr")
    assert message.sender_name == "Jeffrey Díaz"


def test_proyeccion_hace_commit_del_snapshot(world):
    uow, repo, coord, _, _, _ = world
    GetProyeccionCobroUseCase(uow.factory).execute(principal_for(coord), None, 3)
    assert repo.calls[-1] == ("proyeccion", 8, 3)
    assert uow.commits == 1
    with pytest.raises(ValidationError):
        GetProyeccionCobroUseCase(uow.factory).execute(principal_for(coord), None, 99)


def test_sin_pago_para_cualquier_usuario_activo(world):
    uow, repo, _, analista, _, _ = world
    repo.sin_pago = [{"cliente_cod": "C1", "ppto_mes": Decimal(10), "cobrado": Decimal(0)}]
    repo.ppto_cartera = Decimal(500)
    result = GetSinPagoUseCase(uow.factory).execute(principal_for(analista), 2026, 10)
    assert result["ppto_total"] == Decimal(500)
    assert result["filas"][0]["cliente_cod"] == "C1"


def test_scope_por_analista_en_reportes_de_recuperacion(world):
    uow, repo, coord, analista, _, riesgo = world
    GetRecuperacionMomUseCase(uow.factory).execute(principal_for(analista), None, "otro@cofersa.cr")
    assert repo.calls[-1] == ("mom", 13, "agomez@cofersa.cr")
    GetRecuperacionMomUseCase(uow.factory).execute(principal_for(coord), 6, None)
    assert repo.calls[-1] == ("mom", 6, None)
    GetRecuperacionPeriodoUseCase(uow.factory).execute(
        principal_for(coord), "2026-10-01", "2026-10-15", "x@cofersa.cr", "vendedor"
    )
    assert repo.calls[-1] == ("periodo", date(2026, 10, 1), date(2026, 10, 15), "x@cofersa.cr", "vendedor")
    GetRecuperacionTramosUseCase(uow.factory).execute(
        principal_for(riesgo), "2026-10-01", "2026-10-02", None, None
    )
    assert repo.calls[-1] == ("tramos", date(2026, 10, 1), date(2026, 10, 2), None, "analista")
    with pytest.raises(ValidationError):
        GetRecuperacionTramosUseCase(uow.factory).execute(
            principal_for(coord), "2026-10-01", "2026-10-02", None, "x"
        )
    with pytest.raises(ValidationError):
        GetRecuperacionPeriodoUseCase(uow.factory).execute(
            principal_for(coord), "nope", "2026-10-02", None, None
        )


def test_meta_analista_acotada_al_propio_email(world):
    uow, repo, coord, analista, _, _ = world
    repo.metas_analista["agomez@cofersa.cr"] = Decimal(900)
    result = GetMetaAnalistaMesUseCase(uow.factory).execute(
        principal_for(analista), "otro@cofersa.cr", 2026, 10
    )
    assert result == {"meta": Decimal(900)}
    GetMetaAnalistaMesUseCase(uow.factory).execute(principal_for(coord), "agomez@cofersa.cr", None, None)
    assert repo.calls[-1] == ("meta_analista", "agomez@cofersa.cr", None, None)


def test_rutas_del_handler():
    assert set(handlers.ROUTES) >= {
        ("GET", "/presupuesto/mes"),
        ("POST", "/presupuesto/enviar"),
        ("GET", "/presupuesto/recuperacion-tramos"),
    }
    assert callable(handlers.presupuesto_handler)
