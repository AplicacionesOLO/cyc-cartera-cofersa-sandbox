import pytest

from application.use_cases.analisis_pagos import (
    DescartarDuplicadoUseCase,
    DesmarcarPagoAnuladoUseCase,
    GetAlertasDeterioroUseCase,
    GetConcentracionUseCase,
    GetPagosMesResumenUseCase,
    GetPerfilVendedorUseCase,
    GetRankingClientesUseCase,
    MarcarPagosAnuladosUseCase,
    RevertirDescarteDuplicadoUseCase,
)
from domain.exceptions import ForbiddenError, ValidationError
from entrypoints.lambda_handlers import analisis_pagos as handlers
from fakes.fake_analisis_pagos import FakeAnalisisPagosRepository
from fakes.fake_app_unit_of_work import FakeAppUnitOfWork, principal_for


@pytest.fixture
def world():
    repo = FakeAnalisisPagosRepository()
    uow = FakeAppUnitOfWork(analisis_pagos=repo)
    coord = uow.usuarios.add("jdiaz@cofersa.cr", "COORDINADOR")
    analista = uow.usuarios.add("agomez@cofersa.cr", "ANALISTA")
    gerencia = uow.usuarios.add("jgarcia@cofersa.cr", "GERENCIA")
    riesgo_cartera = uow.usuarios.add("jordonez@mayoreo.biz", "ANALISTA_RIESGO", tiene_cartera_asignada=True)
    return uow, repo, coord, analista, gerencia, riesgo_cartera


def test_ranking_acota_al_analista_y_pasa_filtros(world):
    uow, repo, coord, analista, _, _ = world
    filtros = {"email": "otro@cofersa.cr", "meses": "9", "offset": "25", "limit": "25", "dimension": "GAM"}
    GetRankingClientesUseCase(uow.factory).execute(principal_for(analista), filtros)
    call = repo.calls[-1][1]
    assert call["email"] == "agomez@cofersa.cr" and call["offset"] == 25 and call["dimension"] == "GAM"
    assert call["orden"] == "icp_asc" and call["busqueda"] is None
    GetRankingClientesUseCase(uow.factory).execute(principal_for(coord), {"email": None})
    assert repo.calls[-1][1]["email"] is None and repo.calls[-1][1]["meses"] == 9
    with pytest.raises(ValidationError):
        GetRankingClientesUseCase(uow.factory).execute(principal_for(coord), {"limit": "9999"})


def test_perfil_y_alertas_con_scope(world):
    uow, repo, coord, _, _, riesgo_cartera = world
    GetPerfilVendedorUseCase(uow.factory).execute(principal_for(riesgo_cartera), None, 9, "icp_desc")
    assert repo.calls[-1] == ("perfil", "jordonez@mayoreo.biz", 9, "icp_desc")
    GetAlertasDeterioroUseCase(uow.factory).execute(principal_for(coord), "agomez@cofersa.cr")
    assert repo.calls[-1] == ("alertas", "agomez@cofersa.cr")


def test_concentracion_bloqueada_para_quien_gestiona_cartera(world):
    uow, _, coord, analista, gerencia, riesgo_cartera = world
    for usuario in (analista, riesgo_cartera):
        with pytest.raises(ForbiddenError, match="Vista disponible para el coordinador"):
            GetConcentracionUseCase(uow.factory).execute(principal_for(usuario))
    assert GetConcentracionUseCase(uow.factory).execute(principal_for(gerencia))["top10"] == []
    assert GetConcentracionUseCase(uow.factory).execute(principal_for(coord)) is not None


def test_pagos_mes_resumen_coordinacion_y_gerencia(world):
    uow, repo, _, analista, gerencia, _ = world
    GetPagosMesResumenUseCase(uow.factory).execute(principal_for(gerencia), "2026", "9")
    assert repo.calls[-1] == ("pagos_mes", 2026, 9)
    with pytest.raises(ForbiddenError):
        GetPagosMesResumenUseCase(uow.factory).execute(principal_for(analista), 2026, 9)


def test_marcar_y_desmarcar_anulados(world):
    uow, repo, coord, _, gerencia, _ = world
    use_case = MarcarPagosAnuladosUseCase(uow.factory)
    result = use_case.execute(
        principal_for(coord), {"no_recibos": [" R1 ", "R2", "R1"], "motivo": " Cambio de cuentas "}
    )
    assert result == {"ok": True, "marcados": 2}
    assert repo.anulados["R1"]["anulado_por"] == "jdiaz@cofersa.cr"
    assert (
        repo.auditoria[-1]["descripcion"] == "2 recibo(s) marcado(s) como anulado: R1, R2 — Cambio de cuentas"
    )
    assert uow.commits == 1
    DesmarcarPagoAnuladoUseCase(uow.factory).execute(principal_for(coord), "R1")
    assert "R1" not in repo.anulados
    assert repo.auditoria[-1]["descripcion"] == "Recibo R1 desmarcado como anulado"
    with pytest.raises(ForbiddenError, match="Acceso restringido al coordinador"):
        use_case.execute(principal_for(gerencia), {"no_recibos": ["R3"], "motivo": "x"})
    with pytest.raises(ForbiddenError):
        DesmarcarPagoAnuladoUseCase(uow.factory).execute(principal_for(gerencia), "R2")


def test_marcar_anulados_validaciones(world):
    uow, _, coord, _, _, _ = world
    use_case = MarcarPagosAnuladosUseCase(uow.factory)
    with pytest.raises(ValidationError, match="Indicá al menos un recibo"):
        use_case.execute(principal_for(coord), {"no_recibos": ["  "], "motivo": "x"})
    with pytest.raises(ValidationError, match="El motivo es requerido"):
        use_case.execute(principal_for(coord), {"no_recibos": ["R1"], "motivo": " "})
    with pytest.raises(ValidationError, match="recibo_reemplazo solo aplica"):
        use_case.execute(
            principal_for(coord), {"no_recibos": ["R1", "R2"], "motivo": "x", "recibo_reemplazo": "R9"}
        )


def test_descartar_y_revertir_duplicado(world):
    uow, repo, coord, analista, _, _ = world
    DescartarDuplicadoUseCase(uow.factory).execute(
        principal_for(coord), {"no_recibo": "R5", "nota": " cheques "}
    )
    assert repo.descartados["R5"] == {"nota": "cheques", "descartado_por": "jdiaz@cofersa.cr"}
    assert repo.auditoria[-1]["descripcion"] == "Posible duplicado descartado: R5 — cheques"
    RevertirDescarteDuplicadoUseCase(uow.factory).execute(principal_for(coord), "R5")
    assert "R5" not in repo.descartados
    with pytest.raises(ValidationError, match="no_recibo es requerido"):
        DescartarDuplicadoUseCase(uow.factory).execute(principal_for(coord), {"no_recibo": ""})
    with pytest.raises(ForbiddenError):
        DescartarDuplicadoUseCase(uow.factory).execute(principal_for(analista), {"no_recibo": "R5"})


def test_rutas_del_handler():
    assert ("DELETE", "/pagos-anulados/{no_recibo}") in handlers.ROUTES
    assert ("POST", "/pagos-duplicado-descartado") in handlers.ROUTES
    assert callable(handlers.analisis_pagos_handler)
