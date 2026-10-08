from datetime import date

import pytest

from application.use_cases.gestiones import (
    DeleteGestionUseCase,
    FormalizarBitacoraUseCase,
    GetNotaRapidaUseCase,
    GetReferenciasGestionesUseCase,
    ListCodigosContribuyenteUseCase,
    ListGestionesUseCase,
    RegistrarGestionRapidaUseCase,
    RegistrarGestionUseCase,
    SaveNotaRapidaUseCase,
    UpdateGestionUseCase,
)
from domain.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from fakes.fake_app_unit_of_work import FakeAppUnitOfWork, FakeLanguageModel, principal_for
from fakes.fake_gestiones import FakeGestionesRepository
from fakes.fake_promesas import FakePromesasRepository


@pytest.fixture
def w():
    uow = FakeAppUnitOfWork(gestiones=FakeGestionesRepository(), promesas=FakePromesasRepository())
    users = {
        "coord": uow.usuarios.add("jdiaz@cofersa.cr", "COORDINADOR"),
        "ana": uow.usuarios.add("agomez@cofersa.cr", "ANALISTA"),
        "otra": uow.usuarios.add("japonte@cofersa.cr", "ANALISTA"),
        "riesgo": uow.usuarios.add("riesgo@mayoreo.biz", "ANALISTA_RIESGO"),
        "riesgo_cartera": uow.usuarios.add(
            "jordonez@mayoreo.biz", "ANALISTA_RIESGO", tiene_cartera_asignada=True
        ),
        "gerencia": uow.usuarios.add("jgarcia@cofersa.cr", "GERENCIA"),
    }
    return uow, {k: principal_for(v) for k, v in users.items()}


def _body(**extra):
    return {
        "cliente_cod": "C001",
        "contribuyente": "3101",
        "tipo": "LLAMADA",
        "resultado": "Compromiso de pago confirmado",
        "nota": "  promete pagar  ",
        "fecha": "2026-09-15",
        "hora": "09:30:00",
        "proxima_accion": "esperar_pago",
        "proxima_accion_fecha": "2026-09-20",
        "metadata": {"compromiso_monto": 1500000},
        "promesa": {"monto": 1500000, "fecha_promesa": "2026-09-30", "facturas_ids": [1]},
        **extra,
    }


def test_list_scopes_analista_and_coordinator_sees_all(w):
    uow, p = w
    uow.gestiones.add("agomez@cofersa.cr")
    uow.gestiones.add("japonte@cofersa.cr")
    uc = ListGestionesUseCase(uow.factory)
    assert {g["analista_email"] for g in uc.execute(p["ana"], "japonte@cofersa.cr", 0, 1000)} == {
        "agomez@cofersa.cr"
    }
    assert len(uc.execute(p["coord"], None, 0, 1000)) == 2
    assert len(uc.execute(p["coord"], "japonte@cofersa.cr", 0, 1000)) == 1
    assert len(uc.execute(p["coord"], None, 1, 5000)) == 1  # offset + tope de lote
    assert len(uc.execute(p["riesgo_cartera"], None, 0, 10)) == 0


def test_guard_blocks_riesgo_sin_cartera_and_gerencia(w):
    uow, p = w
    for key in ("riesgo", "gerencia"):
        with pytest.raises(ForbiddenError):
            ListGestionesUseCase(uow.factory).execute(p[key], None, 0, 10)
        with pytest.raises(ForbiddenError):
            GetReferenciasGestionesUseCase(uow.factory).execute(p[key], None)
        with pytest.raises(ForbiddenError):
            RegistrarGestionUseCase(uow.factory).execute(p[key], _body(promesa=None))


def test_referencias(w):
    uow, p = w
    g = uow.gestiones.add("agomez@cofersa.cr", cliente_cod="C9")
    uow.gestiones.add("japonte@cofersa.cr", cliente_cod="C8")
    uow.gestiones.maestro = [
        {"cliente_cod": "C9", "cliente_nombre": "Nueve"},
        {"cliente_cod": "C8", "cliente_nombre": "Ocho"},
    ]
    uow.gestiones.cartera = {"C9", "C8"}
    uow.gestiones.solicitudes = [{"gestion_id": g["id"], "estado": "PENDIENTE"}]
    ref = GetReferenciasGestionesUseCase(uow.factory).execute(p["ana"], None)
    assert ref["nombres_cliente"] == {"C9": "Nueve"}
    assert ref["cods_con_cartera"] == ["C9"]
    assert ref["solicitudes"] == [{"gestion_id": g["id"], "estado": "PENDIENTE"}]


def test_registrar_gestion_con_promesa_atomica(w):
    uow, p = w
    uow.gestiones.maestro = [{"cliente_cod": "C001", "cliente_nombre": "Ferretería Uno"}]
    result = RegistrarGestionUseCase(uow.factory).execute(p["ana"], _body())
    gestion = uow.gestiones.rows[result["gestion_id"]]
    assert result["ok"] is True
    assert gestion["analista_email"] == "agomez@cofersa.cr" and gestion["nota"] == "promete pagar"
    promesa = uow.promesas.rows[gestion["promesa_id"]]
    assert promesa["gestion_id"] == result["gestion_id"]
    assert promesa["cliente_nombre"] == "Ferretería Uno"
    assert promesa["eventos"][0]["tipo"] == "creada"
    assert (
        promesa["eventos"][0]["descripcion"] == "Promesa creada desde gestión (Compromiso de pago confirmado)"
    )
    assert uow.commits == 1


def test_registrar_gestion_rechaza_duplicado_y_faltantes(w):
    uow, p = w
    uc = RegistrarGestionUseCase(uow.factory)
    uc.execute(p["ana"], _body())
    with pytest.raises(ConflictError) as err:
        uc.execute(p["ana"], _body())
    assert err.value.message == (
        "Ya existe una promesa pendiente por ₡1.500.000 para el 2026-09-30. "
        "No se permiten promesas duplicadas."
    )
    assert len(uow.gestiones.rows) == 1
    with pytest.raises(ValidationError, match="Campos obligatorios faltantes"):
        uc.execute(p["ana"], _body(hora=""))
    sin_promesa = uc.execute(p["ana"], _body(promesa=None, cliente_cod="C002"))
    assert uow.gestiones.rows[sin_promesa["gestion_id"]]["promesa_id"] is None


def test_registrar_gestion_rapida(w):
    uow, p = w
    body = {
        "cliente_cod": "C001",
        "contribuyente": "3101",
        "analista_email": "agomez@cofersa.cr",
        "fecha": "2026-09-15",
        "hora": "10:00:00",
        "tipo": "LLAMADA",
        "resultado": "Promesa OK",
        "nota": "ok",
        "promesa_fecha": "2026-09-30",
        "promesa_monto": 2500.5,
    }
    RegistrarGestionRapidaUseCase(uow.factory).execute(p["ana"], body)
    (gestion,) = uow.gestiones.rows.values()
    assert gestion["promesa_fecha"] == date(2026, 9, 30) and gestion["promesa_monto"] == 2500.5
    (promesa,) = uow.promesas.rows.values()
    assert promesa["monto"] == 2500.5 and promesa["gestion_id"] is None
    with pytest.raises(ForbiddenError):
        RegistrarGestionRapidaUseCase(uow.factory).execute(p["otra"], body)
    RegistrarGestionRapidaUseCase(uow.factory).execute(p["coord"], {**body, "resultado": "Pendiente"})
    assert len(uow.promesas.rows) == 1


def test_update_gestion_permisos_y_campos(w):
    uow, p = w
    g = uow.gestiones.add("agomez@cofersa.cr")
    uc = UpdateGestionUseCase(uow.factory)
    assert uc.execute(p["ana"], {"id": str(g["id"]), "nota": "  corregida ", "tipo": "CORREO", "x": 1}) == {
        "ok": True
    }
    assert g["nota"] == "corregida" and g["tipo"] == "CORREO" and "x" not in g
    with pytest.raises(ForbiddenError, match="Sin permisos para editar esta gestión"):
        uc.execute(p["otra"], {"id": str(g["id"]), "nota": "x"})
    uc.execute(p["coord"], {"id": str(g["id"]), "promesa_fecha": "2026-10-01"})
    assert g["promesa_fecha"] == date(2026, 10, 1)
    with pytest.raises(ValidationError, match="id requerido"):
        uc.execute(p["ana"], {})
    with pytest.raises(NotFoundError, match="Gestión no encontrada"):
        uc.execute(p["ana"], {"id": "00000000-0000-0000-0000-000000000000"})
    with pytest.raises(ForbiddenError, match="solo lectura"):
        uc.execute(p["gerencia"], {"id": str(g["id"])})


def test_delete_gestion_solo_coordinador(w):
    uow, p = w
    g = uow.gestiones.add("agomez@cofersa.cr")
    with pytest.raises(ForbiddenError, match="Solo el coordinador puede eliminar gestiones"):
        DeleteGestionUseCase(uow.factory).execute(p["ana"], str(g["id"]))
    DeleteGestionUseCase(uow.factory).execute(p["coord"], str(g["id"]))
    assert g["activo"] is False


def test_codigos_contribuyente(w):
    uow, p = w
    uow.gestiones.maestro = [
        {"cliente_cod": "C1", "cliente_nombre": "Uno", "contribuyente": "3101"},
        {"cliente_cod": "C2", "cliente_nombre": "Dos", "contribuyente": "3101"},
        {"cliente_cod": "C3", "cliente_nombre": "Tres", "contribuyente": "9999"},
    ]
    uc = ListCodigosContribuyenteUseCase(uow.factory)
    assert uc.execute(p["ana"], "3101", "C1") == [{"cliente_cod": "C2", "cliente_nombre": "Dos"}]
    assert uc.execute(p["ana"], "", "C1") == []


def test_notas_rapidas_por_usuario(w):
    uow, p = w
    assert GetNotaRapidaUseCase(uow.factory).execute(p["ana"], "2026-09-15") == {
        "contenido": "",
        "updated_at": None,
    }
    SaveNotaRapidaUseCase(uow.factory).execute(p["ana"], {"fecha": "2026-09-15", "contenido": "[1]"})
    SaveNotaRapidaUseCase(uow.factory).execute(p["ana"], {"fecha": "2026-09-15", "contenido": "[2]"})
    assert GetNotaRapidaUseCase(uow.factory).execute(p["ana"], "2026-09-15")["contenido"] == "[2]"
    assert GetNotaRapidaUseCase(uow.factory).execute(p["otra"], "2026-09-15")["contenido"] == ""
    with pytest.raises(ValidationError, match=r"Parámetro fecha inválido \(YYYY-MM-DD\)"):
        GetNotaRapidaUseCase(uow.factory).execute(p["ana"], "15/09/2026")
    with pytest.raises(ValidationError):
        SaveNotaRapidaUseCase(uow.factory).execute(p["ana"], {"contenido": "x"})


def test_formalizar_bitacora(w):
    uow, p = w
    model = FakeLanguageModel("  Texto formal.  ")
    uc = FormalizarBitacoraUseCase(uow.factory, model)
    body = {"nota": " dijo q paga el lunes ", "tipo": "LLAMADA", "resultado": "Pagó", "clienteNombre": "X"}
    assert uc.execute(p["ana"], body) == {"ok": True, "texto": "Texto formal."}
    assert model.prompts == ["dijo q paga el lunes"]
    with pytest.raises(ValidationError, match="Nota vacía"):
        uc.execute(p["ana"], {"nota": "  "})
