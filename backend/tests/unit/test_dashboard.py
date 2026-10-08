from datetime import date, datetime, timedelta

import pytest

from application.use_cases import dashboard as dashboard_uc
from application.use_cases.dashboard import (
    GetDashboardAnalistaUseCase,
    GetDashboardCoordinadorUseCase,
    GetMiCarteraUseCase,
)
from domain.exceptions import ForbiddenError, UnauthorizedError
from domain.services.cola_dia import (
    TOPE_DIARIO,
    DatosCola,
    EntradaAgenda,
    calcular_agenda,
    construir_cola,
    fmt_crc,
    js_num,
    js_round,
)
from fakes.fake_app_unit_of_work import FakeAppUnitOfWork, principal_for
from fakes.fake_dashboard import FakeDashboardRepository

HOY = date(2026, 10, 7)  # miércoles


def entrada(**kw) -> EntradaAgenda:
    base = dict(
        dias_mora=0,
        mora_total=1_000_000.0,
        mora_120_plus=0.0,
        dias_sin_gestion=10,
        promesa_activa=False,
        promesa_fecha=None,
        promesa_monto=None,
        proxima_accion_fecha=None,
        gestionado_hoy=False,
        icp=None,
    )
    base.update(kw)
    return EntradaAgenda(**base)


# ── Algoritmo V4 (dominio) ───────────────────────────────────────────


def test_helpers_match_javascript():
    assert js_round(2.5) == 3 and js_round(-2.5) == -2 and js_round(0.49) == 0
    assert fmt_crc(1234567.5) == "₡1.234.568"
    assert fmt_crc(-1234) == "₡-1.234"
    assert js_num(45.0) == "45" and js_num(45.5) == "45.5"


def test_promesa_vencida_y_vence_hoy_son_hard_include():
    r = calcular_agenda(
        entrada(promesa_activa=True, promesa_fecha=HOY - timedelta(days=3), promesa_monto=250000), HOY
    )
    assert (r.en_agenda, r.is_hard_include, r.prioridad, r.score) == (True, True, "critico", 97)
    assert r.motivo == "Promesa de ₡250.000 venció hace 3d — sin pago"
    r = calcular_agenda(entrada(promesa_activa=True, promesa_fecha=HOY), HOY)
    assert r.score == 95 and r.motivo == "Promesa vence hoy — confirmar si pagó"


def test_proxima_accion_futura_excluye_aun_con_mora_120():
    r = calcular_agenda(entrada(mora_120_plus=5, proxima_accion_fecha=HOY + timedelta(days=1)), HOY)
    assert not r.en_agenda and r.score == 0
    r = calcular_agenda(entrada(mora_120_plus=5), HOY)
    assert r.score == 92 and r.motivo == "Mora supera 120 días (₡1.000.000) — crítico"


def test_icp_hard_include_y_smart_exclude():
    r = calcular_agenda(entrada(icp=20.5, dias_mora=45, mora_total=600_000), HOY)
    assert r.score == 88 and r.motivo.startswith("ICP 20.5 (Malo) — historial crítico")
    r = calcular_agenda(entrada(icp=90, dias_mora=10, dias_sin_gestion=2), HOY)
    assert not r.en_agenda and r.motivo == "Buen pagador, atraso puntual, contactado recientemente"


def test_exclusiones_promesa_futura_y_mora_minima():
    futura = entrada(promesa_activa=True, promesa_fecha=HOY + timedelta(days=5), dias_sin_gestion=2)
    assert not calcular_agenda(futura, HOY).en_agenda
    assert not calcular_agenda(entrada(mora_total=99_999), HOY).en_agenda


def test_scoring_y_sufijo_sin_historial():
    r = calcular_agenda(entrada(dias_sin_gestion=999, mora_total=200_000), HOY)
    assert r.en_agenda and not r.is_hard_include
    assert r.prioridad == "seguimiento"
    assert r.motivo == "₡200.000 — sin gestiones previas · sin historial ICP"
    bajo = calcular_agenda(
        entrada(dias_sin_gestion=999, mora_total=200_000, icp=30), HOY
    )  # ICP < 40 sube un nivel
    assert bajo.prioridad == "urgente" and bajo.motivo.endswith(" · ICP 30 (Malo)")


def test_gestionado_hoy_puntua_pero_no_aplica_hard_include():
    r = calcular_agenda(entrada(gestionado_hoy=True, mora_120_plus=10, dias_sin_gestion=0), HOY)
    assert r.en_agenda and not r.is_hard_include
    assert not calcular_agenda(entrada(gestionado_hoy=True, mora_total=10), HOY).en_agenda


def _cartera(cod, mora, **kw):
    return {
        "cliente_cod": cod,
        "cliente_nombre": f"Cliente {cod}",
        "vendedor_nombre": None,
        "mora_1_30": mora,
        **kw,
    }


def test_construir_cola_dedup_orden_pagos_y_tope():
    cartera = [_cartera(f"C{i:02d}", 200_000 + i * 1000) for i in range(40)]
    cartera.append(_cartera("C00", 900_000, fecha_corte="2026-10-06"))  # duplicado más reciente
    datos = DatosCola(
        cartera=cartera,
        gestiones=[
            {"cliente_cod": "C01", "fecha": HOY, "proxima_accion": None, "proxima_accion_fecha": None}
        ],
        promesas_pendientes=[
            {"cliente_cod": "C02", "fecha_promesa": HOY - timedelta(days=1), "monto": None},
            {"cliente_cod": "C02", "fecha_promesa": HOY + timedelta(days=9), "monto": 5},
        ],
        recuperado_mes=1500.0,
        pagos_recientes=[
            {"cliente_cod": "C03", "fecha_pago": HOY - timedelta(days=2), "monto_pago": 100},
            {"cliente_cod": "C03", "fecha_pago": HOY - timedelta(days=4), "monto_pago": 50},
        ],
    )
    cola = construir_cola(datos, HOY)
    rows = {r["cliente_cod"]: r for r in cola["rows"]}
    assert len(rows) == 40 and rows["C00"]["mora_total"] == 900_000
    assert rows["C00"]["vendedor_nombre"] == "—" and rows["C00"]["tramo_peor"] == "1-30 días"
    assert rows["C01"]["gestionado_hoy"] and rows["C01"]["dias_sin_gestion"] == 0
    assert rows["C02"]["is_hard_include"] and rows["C02"]["promesa_fecha"] == "2026-10-06"
    assert rows["C03"]["pago_reciente"] == {"monto": 150.0, "dias": 2}
    assert cola["rows"][0]["cliente_cod"] == "C02"  # score 97 primero
    pendientes = [r for r in cola["rows"] if r["en_agenda"] and not r["gestionado_hoy"]]
    assert len(pendientes) == TOPE_DIARIO
    assert cola["recuperadoMes"] == 1500.0 and cola["totalPromesasActivas"] == 1


# ── Casos de uso ─────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def hoy_fijo(monkeypatch):
    monkeypatch.setattr(dashboard_uc, "ahora_cr", lambda: datetime(2026, 10, 7, 9, 30))


@pytest.fixture
def world():
    repo = FakeDashboardRepository()
    uow = FakeAppUnitOfWork(dashboard=repo)
    users = {
        "coord": uow.usuarios.add("jdiaz@cofersa.cr", "COORDINADOR", "Jeffrey"),
        "ger": uow.usuarios.add("jgarcia@cofersa.cr", "GERENCIA"),
        "ana": uow.usuarios.add("agomez@cofersa.cr", "ANALISTA", "Angélica"),
        "otra": uow.usuarios.add("mprodriguez@cofersa.cr", "ANALISTA", "María Paola"),
        "riesgo": uow.usuarios.add("jordonez@mayoreo.biz", "ANALISTA_RIESGO"),
        "riesgo_cartera": uow.usuarios.add("r2@mayoreo.biz", "ANALISTA_RIESGO", tiene_cartera_asignada=True),
    }
    return uow, repo, users


def test_coordinador_kpis_equipo_y_meta_fallback(world):
    uow, repo, u = world
    repo.usuarios = [
        {
            "id": "1",
            "nombre": "Angélica",
            "email": "agomez@cofersa.cr",
            "iniciales": "AG",
            "color": "#1",
            "rol": "ANALISTA",
        },
        {
            "id": "2",
            "nombre": "J",
            "email": "jdiaz@cofersa.cr",
            "iniciales": "JD",
            "color": "#2",
            "rol": "COORDINADOR",
        },
    ]
    repo.gestiones = [
        {"analista_email": "agomez@cofersa.cr", "cliente_cod": "A", "fecha": date(2026, 10, 7)},
        {"analista_email": "agomez@cofersa.cr", "cliente_cod": "A", "fecha": date(2026, 10, 5)},
        {"analista_email": "agomez@cofersa.cr", "cliente_cod": "A", "fecha": date(2026, 10, 2)},
    ]
    repo.recuperacion_json = {"kpis": {"meta_total": 0, "cobrado_total": 10}}
    repo.config = {"meta_mensual": "5000"}
    repo.pedidos = {None: {"kpis": {"monto_total_retenido": 7, "pedidos_en_espera": 1}, "rows": []}}
    out = GetDashboardCoordinadorUseCase(uow.factory).execute(principal_for(u["coord"]))
    assert out["equipo"] == [
        {
            "id": "1",
            "nombre": "Angélica",
            "email": "agomez@cofersa.cr",
            "iniciales": "AG",
            "color": "#1",
            "gHoy": 1,
            "gSemana": 2,
            "gMes": 3,
        }
    ]
    assert out["meta_mensual_config"] == "5000"
    assert out["pedidos_retenidos_kpis"] == {"monto_total_retenido": 7, "pedidos_en_espera": 1}
    assert ("recuperacion", (2026, 10)) in repo.calls


def test_coordinador_meta_congelada_no_consulta_fallback_y_gerencia_entra(world):
    uow, repo, u = world
    repo.recuperacion_json = {"kpis": {"meta_total": 900}}
    out = GetDashboardCoordinadorUseCase(uow.factory).execute(principal_for(u["ger"]))
    assert out["meta_mensual_config"] is None
    assert ("config_valor", "meta_mensual") not in repo.calls


@pytest.mark.parametrize("quien", ["ana", "riesgo"])
def test_coordinador_prohibido_para_no_globales(world, quien):
    uow, _, u = world
    with pytest.raises(ForbiddenError):
        GetDashboardCoordinadorUseCase(uow.factory).execute(principal_for(u[quien]))


def _sembrar_analista(repo, email):
    repo.maestro.append({"cliente_cod": "X1", "cliente_nombre": "Ferretería X", "analista_email": email})
    repo.cartera.append(_cartera("X1", 300_000, mora_120_plus=10, sync_id="s1", updated_at="2"))
    repo.kpis_por_email[email] = {"total_clientes": 1}
    repo.gestiones.append(
        {
            "analista_email": email,
            "cliente_cod": "X1",
            "fecha": date(2026, 10, 1),
            "id": "g1",
            "proxima_accion": "recontactar",
            "proxima_accion_fecha": date(2026, 10, 7),
            "activo": True,
        }
    )


def test_analista_scope_propio_aunque_pida_otro_email(world):
    uow, repo, u = world
    _sembrar_analista(repo, "agomez@cofersa.cr")
    _sembrar_analista(repo, "mprodriguez@cofersa.cr")
    repo.notificaciones = [
        {
            "id": "n1",
            "usuario_id": u["ana"].id,
            "tipo": "ALERTA",
            "titulo": "Sin gestión ≥ 10 días",
            "leida": False,
            "created_at": "1",
        },
        {
            "id": "n2",
            "usuario_id": u["otra"].id,
            "tipo": "ALERTA",
            "titulo": "Sin gestión ≥ 10 días",
            "leida": False,
            "created_at": "1",
        },
    ]
    repo.config = {"meta_gestiones_diarias": "20"}
    out = GetDashboardAnalistaUseCase(uow.factory).execute(principal_for(u["ana"]), "mprodriguez@cofersa.cr")
    assert [t["id"] for t in out["tareas_sugeridas"]] == ["n1"]
    assert out["kpis"] == {"total_clientes": 1}
    assert [c["cliente_cod"] for c in out["cola"]] == ["X1"]
    assert out["agenda_gestiones"][0]["cliente_nombre"] == "Ferretería X"
    assert out["meta_gestiones_diarias"] == "20"
    assert ("pedidos_retenidos", "agomez@cofersa.cr") in repo.calls


def test_analista_coordinador_puede_ver_otro_y_por_defecto_el_propio(world):
    uow, repo, u = world
    repo.notificaciones = [
        {
            "id": "n2",
            "usuario_id": u["otra"].id,
            "tipo": "ALERTA",
            "titulo": "sin gestión ≥ 5 días",
            "leida": False,
            "created_at": "1",
        },
    ]
    out = GetDashboardAnalistaUseCase(uow.factory).execute(
        principal_for(u["coord"]), "mprodriguez@cofersa.cr"
    )
    assert [t["id"] for t in out["tareas_sugeridas"]] == ["n2"]
    GetDashboardAnalistaUseCase(uow.factory).execute(principal_for(u["coord"]))
    assert repo.calls[-1] == ("pedidos_retenidos", "jdiaz@cofersa.cr")


def test_dashboard_requiere_usuario_activo(world):
    uow, _, _ = world
    from application.dto.principal import Principal

    with pytest.raises(UnauthorizedError):
        GetDashboardAnalistaUseCase(uow.factory).execute(Principal(subject="s"))
    with pytest.raises(ForbiddenError):
        GetDashboardAnalistaUseCase(uow.factory).execute(Principal(subject="s", email="nadie@cofersa.cr"))


def test_mi_cartera_kpis(world):
    uow, repo, u = world
    _sembrar_analista(repo, "agomez@cofersa.cr")
    repo.promesas.append(
        {
            "cliente_cod": "X1",
            "analista_email": "agomez@cofersa.cr",
            "estado": "CUMPLIDA",
            "monto": 40,
            "updated_at": date(2026, 10, 2),
            "fecha_promesa": date(2026, 10, 2),
        }
    )
    out = GetMiCarteraUseCase(uow.factory).execute(principal_for(u["ana"]))
    assert out["kpis"] == {
        "moraTotal": 300_010.0,
        "recuperadoMes": 40.0,
        "promesasActivas": 0,
        "sinGestion7d": 0,
    }
    assert out["rows"][0]["dias_sin_gestion"] == 6


def test_mi_cartera_sin_clientes_devuelve_vacio(world):
    uow, _, u = world
    out = GetMiCarteraUseCase(uow.factory).execute(principal_for(u["coord"]))
    assert out == {
        "rows": [],
        "kpis": {"moraTotal": 0, "recuperadoMes": 0, "promesasActivas": 0, "sinGestion7d": 0},
    }
    assert GetMiCarteraUseCase(uow.factory).execute(principal_for(u["riesgo_cartera"]))["rows"] == []


@pytest.mark.parametrize("quien", ["ger", "riesgo"])
def test_mi_cartera_prohibida(world, quien):
    uow, _, u = world
    with pytest.raises(ForbiddenError):
        GetMiCarteraUseCase(uow.factory).execute(principal_for(u[quien]))
