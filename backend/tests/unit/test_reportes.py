import base64
from datetime import date

import pytest

from application.use_cases import reportes as uc
from application.use_cases.mailer import UsuarioMailer
from application.use_cases.reportes_envio import EnviarReporteUseCase
from application.use_cases.reportes_gerencia import (
    GetCierreMensualUseCase,
    GetResumenEjecutivoUseCase,
    shift_mes,
    ultimo_dia,
)
from domain.exceptions import BusinessRuleViolation, ConflictError, ForbiddenError, ValidationError
from fakes.fake_app_unit_of_work import FakeAppUnitOfWork, FakeGmail, FakeGoogleOAuth, principal_for
from fakes.fake_reportes import FakeReportesRepository


@pytest.fixture
def world():
    repo = FakeReportesRepository()
    uow = FakeAppUnitOfWork(reportes=repo)
    users = {
        "coord": uow.usuarios.add("jdiaz@cofersa.cr", "COORDINADOR", "Jeffrey Díaz"),
        "analista": uow.usuarios.add("agomez@cofersa.cr", "ANALISTA", "Angélica Gómez"),
        "gerencia": uow.usuarios.add("jgarcia@cofersa.cr", "GERENCIA", "Jorge García"),
        "riesgo": uow.usuarios.add("jordonez@mayoreo.biz", "ANALISTA_RIESGO", "Jossmin"),
        "riesgo_cartera": uow.usuarios.add(
            "riesgo2@mayoreo.biz", "ANALISTA_RIESGO", "Riesgo Cartera", tiene_cartera_asignada=True
        ),
    }
    return uow, repo, {k: principal_for(v) for k, v in users.items()}


# ── Roles por reporte (registry.ts) ──────────────────────────────────────────


@pytest.mark.parametrize(
    "build",
    [
        lambda f, p: uc.GetAgingUseCase(f).execute(p),
        lambda f, p: uc.GetCeiUseCase(f).execute(p, "2026", "9"),
        lambda f, p: uc.GetEfectividadUseCase(f).execute(p, "2026-09-01", "2026-09-30"),
        lambda f, p: uc.GetIcpVendedorUseCase(f).execute(p, "6"),
        lambda f, p: uc.GetMigracionMoraUseCase(f).execute(p, "2026", "9", None, None),
        lambda f, p: uc.GetMigracionFiltrosUseCase(f).execute(p),
        lambda f, p: GetResumenEjecutivoUseCase(f).execute(p),
        lambda f, p: GetCierreMensualUseCase(f).execute(p, "2026", "8"),
    ],
)
def test_reportes_globales_solo_coordinador_y_gerencia(world, build):
    uow, _, p = world
    assert build(uow.factory, p["coord"]) is not None
    assert build(uow.factory, p["gerencia"]) is not None
    for rol in ("analista", "riesgo"):
        with pytest.raises(ForbiddenError):
            build(uow.factory, p[rol])


def test_mora_vendedor_scope_por_analista(world):
    uow, repo, p = world
    use_case = uc.GetMoraVendedorUseCase(uow.factory)
    assert use_case.execute(p["coord"], None)["args"] == [None]
    assert use_case.execute(p["coord"], "agomez@cofersa.cr")["args"] == ["agomez@cofersa.cr"]
    # el analista nunca ve otra cartera aunque la pida
    assert use_case.execute(p["analista"], "otro@cofersa.cr")["args"] == ["agomez@cofersa.cr"]
    with pytest.raises(ForbiddenError):
        use_case.execute(p["riesgo"], None)


def test_plazo_especial_scope(world):
    uow, _, p = world
    use_case = uc.GetPlazoEspecialUseCase(uow.factory)
    assert use_case.execute(p["gerencia"], None)["args"] == [None]
    assert use_case.execute(p["analista"], None)["args"] == ["agomez@cofersa.cr"]


def test_bloqueados_snapshot_solo_coordinador(world):
    uow, repo, p = world
    use_case = uc.GetBloqueadosUseCase(uow.factory)
    use_case.execute(p["analista"], None, True)
    assert repo.snapshots_bloqueados == 0
    assert repo.called("bloqueados")[-1] == ("agomez@cofersa.cr",)
    use_case.execute(p["coord"], None, True)
    assert repo.snapshots_bloqueados == 1
    assert repo.called("bloqueados")[-1] == (None,)


def test_bloqueados_snapshot_fallido_no_bloquea_reporte(world):
    uow, repo, p = world
    repo.fail_snapshot = ConflictError("dup")
    result = uc.GetBloqueadosUseCase(uow.factory).execute(p["coord"], None, True)
    assert result["fn"] == "bloqueados"


def test_cierre_cartera_requiere_escritura(world):
    uow, repo, p = world
    use_case = uc.TomarCierreCarteraUseCase(uow.factory)
    assert use_case.execute(p["coord"], {"anio": 2026, "mes": 9})["ok"] is True
    assert repo.cierres == [(2026, 9, False, "Jeffrey Díaz")]
    with pytest.raises(ForbiddenError):
        use_case.execute(p["gerencia"], {"anio": 2026, "mes": 9})
    with pytest.raises(ValidationError):
        use_case.execute(p["coord"], {"anio": 2026, "mes": 13})


def test_validaciones_de_parametros(world):
    uow, _, p = world
    with pytest.raises(ValidationError):
        uc.GetCeiUseCase(uow.factory).execute(p["coord"], "x", "1")
    with pytest.raises(ValidationError):
        uc.GetEfectividadUseCase(uow.factory).execute(p["coord"], "no-fecha", "2026-01-01")
    with pytest.raises(ValidationError):
        uc.ListDimensionOpcionesUseCase(uow.factory).execute(p["coord"], "vendedor")
    assert uc.ListDimensionOpcionesUseCase(uow.factory).execute(p["analista"], "agrupacion") == ["A", "B"]


def test_icp_vendedor_periodo_por_defecto(world):
    uow, _, p = world
    assert uc.GetIcpVendedorUseCase(uow.factory).execute(p["coord"], None)["args"] == [6, "icp_asc"]


def test_estados_cuenta_enriquece_y_acota(world):
    uow, repo, p = world
    repo.contribuyentes = [
        {"contribuyente": "C1", "rep_cod": "001", "analista_email": "agomez@cofersa.cr", "saldo": 10},
        {"contribuyente": "C2", "rep_cod": "002", "analista_email": "otro@cofersa.cr", "saldo": 5},
    ]
    repo.maestro = [{"cliente_cod": "001", "vendedor_cod": "V1", "vendedor_nombre": "Vend"}]
    use_case = uc.GetEstadosCuentaUseCase(uow.factory)
    todos = use_case.execute(p["coord"], None)
    assert [c["vendedor_cod"] for c in todos] == ["V1", None]
    propios = use_case.execute(p["analista"], None)
    assert [c["contribuyente"] for c in propios] == ["C1"]
    assert use_case.execute(p["riesgo_cartera"], None) == []
    assert repo.called("estados_cuenta")[-1] == ("riesgo2@mayoreo.biz",)
    with pytest.raises(ForbiddenError):
        use_case.execute(p["riesgo"], None)


def test_reportes_de_analista_usan_su_email(world):
    uow, repo, p = world
    repo.gestiones = [
        {"analista_email": "agomez@cofersa.cr", "fecha": date(2026, 9, 3)},
        {"analista_email": "agomez@cofersa.cr", "fecha": date(2026, 8, 3)},
        {"analista_email": "otro@cofersa.cr", "fecha": date(2026, 9, 3)},
    ]
    rows = uc.GetGestionesPeriodoUseCase(uow.factory).execute(p["analista"], "2026-09-01", "2026-09-30")
    assert len(rows) == 1
    uc.GetCarteraVencidaUseCase(uow.factory).execute(p["analista"])
    assert repo.called("cartera_vencida")[-1] == ("agomez@cofersa.cr",)
    with pytest.raises(ForbiddenError):
        uc.GetGestionesPeriodoUseCase(uow.factory).execute(p["gerencia"], "2026-09-01", "2026-09-30")


def test_cierre_mensual_ventanas(world):
    uow, repo, p = world
    data = GetCierreMensualUseCase(uow.factory).execute(p["coord"], "2026", "2")
    assert set(data) == {
        "meses",
        "vendedores",
        "grupos",
        "miembros",
        "maestro",
        "recuperacion",
        "riesgo",
        "mora",
        "icp",
    }
    assert repo.called("cierre_mora")[-1] == (2026, 2, 2026, 1)
    assert repo.called("cierre_icp")[-1] == (
        date(2025, 12, 1),
        date(2026, 2, 28),
        date(2025, 9, 1),
        date(2025, 11, 30),
    )
    assert shift_mes(2026, 1, -1) == (2025, 12)
    assert ultimo_dia(2024, 2) == date(2024, 2, 29)


def test_resumen_ejecutivo_forma(world):
    uow, repo, p = world
    data = GetResumenEjecutivoUseCase(uow.factory).execute(p["gerencia"])
    assert data["recaudo_meses"] == []
    assert repo.called("recuperacion_mom")[-1] == (13, None)
    assert repo.called("historico_cartera")[-1] == (90,)


# ── Envío por correo (/api/reportes/enviar) ──────────────────────────────────


def _envio(uow):
    gmail = FakeGmail()
    return EnviarReporteUseCase(uow.factory, UsuarioMailer(FakeGoogleOAuth(), gmail)), gmail


def test_enviar_reporte_con_cc_y_adjunto(world):
    uow, _, p = world
    uow.usuarios.set_google_refresh_token("agomez@cofersa.cr", "rt")
    use_case, gmail = _envio(uow)
    body = {
        "to": "v1@cofersa.cr; v2@cofersa.cr",
        "cc": ["sup@cofersa.cr,an@cofersa.cr"],
        "subject": "Mora",
        "html": "<p>x</p>",
        "providerToken": "ignorado",
        "adjunto": {
            "base64": base64.b64encode(b"PDF").decode(),
            "mimeType": "application/pdf",
            "filename": "r.pdf",
        },
    }
    assert use_case.execute(p["analista"], body) == {
        "ok": True,
        "email_sent": True,
        "to": "v1@cofersa.cr; v2@cofersa.cr",
    }
    _, sender, message = gmail.sent[0]
    assert sender == "agomez@cofersa.cr"
    assert message.to == ("v1@cofersa.cr", "v2@cofersa.cr")
    assert message.cc == ("sup@cofersa.cr", "an@cofersa.cr")
    assert message.sender_name == "Angélica Gómez"
    assert message.attachments[0].data == b"PDF"


def test_enviar_reporte_validaciones_y_permisos(world):
    uow, _, p = world
    use_case, gmail = _envio(uow)
    with pytest.raises(ValidationError) as error:
        use_case.execute(p["coord"], {"to": "a@x.com", "subject": "", "html": "h"})
    assert error.value.message == "to, subject y html son requeridos"
    with pytest.raises(ValidationError) as error:
        use_case.execute(p["coord"], {"to": "a@x.com;malo", "subject": "s", "html": "h"})
    assert error.value.message == "Dirección de correo inválida: malo"
    for rol in ("gerencia", "riesgo"):
        with pytest.raises(ForbiddenError) as error:
            use_case.execute(p[rol], {"to": "a@x.com", "subject": "s", "html": "h"})
        assert error.value.message == "No tenés permiso para enviar estos reportes"
    with pytest.raises(BusinessRuleViolation):  # sin Gmail conectado
        use_case.execute(p["coord"], {"to": "a@x.com", "subject": "s", "html": "h"})
    assert gmail.sent == []
