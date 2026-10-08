from datetime import date, timedelta

import pytest

from application.use_cases.common import hoy_cr
from application.use_cases.promesas import (
    DeletePromesaUseCase,
    ListPromesasUseCase,
    ReprogramarPromesaUseCase,
    ValidarPromesaUseCase,
)
from domain.entities.promesas import fmt_crc
from domain.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from fakes.fake_app_unit_of_work import FakeAppUnitOfWork, principal_for
from fakes.fake_promesas import FakePromesasRepository


@pytest.fixture
def w():
    uow = FakeAppUnitOfWork(promesas=FakePromesasRepository())
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


def test_fmt_crc():
    assert fmt_crc(1500000.4) == "₡1.500.000"
    assert fmt_crc(999) == "₡999"


def test_list_scope_gestion_origen_y_activas(w):
    uow, p = w
    origen = {
        "id": "g1",
        "resultado": "Compromiso",
        "nota": "n",
        "tipo": "LLAMADA",
        "fecha": date(2026, 9, 1),
    }
    uow.promesas.gestiones["g1"] = origen
    uow.promesas.add("agomez@cofersa.cr", gestion_id="g1", fecha_promesa=date(2026, 9, 20))
    uow.promesas.add("agomez@cofersa.cr", fecha_promesa=date(2026, 9, 10))
    uow.promesas.add("agomez@cofersa.cr", activo=False)
    uow.promesas.add("japonte@cofersa.cr")
    result = ListPromesasUseCase(uow.factory).execute(p["ana"], "japonte@cofersa.cr")
    assert [x["fecha_promesa"].day for x in result["promesas"]] == [10, 20]
    assert result["gestionesMap"] == {"g1": origen}
    assert len(ListPromesasUseCase(uow.factory).execute(p["coord"], None)["promesas"]) == 3
    assert len(ListPromesasUseCase(uow.factory).execute(p["coord"], "japonte@cofersa.cr")["promesas"]) == 1
    assert ListPromesasUseCase(uow.factory).execute(p["riesgo_cartera"], None)["promesas"] == []
    for key in ("riesgo", "gerencia"):
        with pytest.raises(ForbiddenError):
            ListPromesasUseCase(uow.factory).execute(p[key], None)


def test_validar_cumplida_agrega_evento(w):
    uow, p = w
    pr = uow.promesas.add("agomez@cofersa.cr", eventos=[{"tipo": "creada"}])
    result = ValidarPromesaUseCase(uow.factory).execute(
        p["ana"], {"id": str(pr["id"]), "estado": "CUMPLIDA", "comentario": " pagó "}
    )
    row = uow.promesas.rows[pr["id"]]
    assert result["ok"] and result["estado"] == "CUMPLIDA"
    assert result["evento"]["descripcion"] == "Promesa validada como CUMPLIDA — pagó"
    assert row["estado"] == "CUMPLIDA" and row["validado_por"] == "agomez@cofersa.cr"
    assert row["fecha_validacion"] == hoy_cr() and len(row["eventos"]) == 2
    with pytest.raises(ConflictError, match="Esta promesa ya está cumplida y no puede modificarse"):
        ValidarPromesaUseCase(uow.factory).execute(
            p["ana"], {"id": str(pr["id"]), "estado": "INCUMPLIDA", "comentario": "x"}
        )


def test_validar_abono_e_incumplida_validaciones(w):
    uow, p = w
    pr = uow.promesas.add("agomez@cofersa.cr")
    uc = ValidarPromesaUseCase(uow.factory)
    pid = str(pr["id"])
    with pytest.raises(ValidationError, match="id requerido"):
        uc.execute(p["ana"], {"estado": "CUMPLIDA"})
    with pytest.raises(ValidationError, match="estado requerido"):
        uc.execute(p["ana"], {"id": pid})
    with pytest.raises(ValidationError, match="Estado inválido"):
        uc.execute(p["ana"], {"id": pid, "estado": "REPROGRAMADA"})
    with pytest.raises(ValidationError, match="obligatorio al marcar incumplida"):
        uc.execute(p["ana"], {"id": pid, "estado": "INCUMPLIDA"})
    with pytest.raises(ValidationError, match="monto del abono"):
        uc.execute(p["ana"], {"id": pid, "estado": "ABONO_PARCIAL", "comentario": "x"})
    with pytest.raises(ValidationError, match="comentario es obligatorio"):
        uc.execute(p["ana"], {"id": pid, "estado": "ABONO_PARCIAL", "monto_abono_parcial": 10})
    result = uc.execute(
        p["ana"], {"id": pid, "estado": "ABONO_PARCIAL", "monto_abono_parcial": 50000, "comentario": "parte"}
    )
    assert result["evento"]["descripcion"] == "Abono parcial de ₡50.000 — parte"
    assert uow.promesas.rows[pr["id"]]["monto_abono_parcial"] == 50000


def test_validar_permisos(w):
    uow, p = w
    pr = uow.promesas.add("agomez@cofersa.cr")
    body = {"id": str(pr["id"]), "estado": "CUMPLIDA"}
    with pytest.raises(ForbiddenError, match="Sin permisos para validar esta promesa"):
        ValidarPromesaUseCase(uow.factory).execute(p["otra"], body)
    with pytest.raises(ForbiddenError, match="solo lectura"):
        ValidarPromesaUseCase(uow.factory).execute(p["gerencia"], body)
    with pytest.raises(NotFoundError, match="Promesa no encontrada"):
        ValidarPromesaUseCase(uow.factory).execute(
            p["coord"], {**body, "id": "00000000-0000-0000-0000-000000000000"}
        )
    assert ValidarPromesaUseCase(uow.factory).execute(p["coord"], body)["ok"]


def test_reprogramar_crea_nueva_y_cierra_original(w):
    uow, p = w
    pr = uow.promesas.add("agomez@cofersa.cr", gestion_id="g1", eventos=[{"tipo": "creada"}])
    futura = hoy_cr() + timedelta(days=10)
    body = {
        "id": str(pr["id"]),
        "nueva_fecha": futura.isoformat(),
        "nuevo_monto": 200000,
        "motivo": " pidió plazo ",
    }
    result = ReprogramarPromesaUseCase(uow.factory).execute(p["ana"], body)
    nueva = uow.promesas.rows[result["nueva_promesa_id"]]
    orig = uow.promesas.rows[pr["id"]]
    assert nueva["reprogramada_de_id"] == pr["id"] and nueva["gestion_id"] == "g1"
    assert nueva["estado"] == "PENDIENTE" and nueva["fecha_promesa"] == futura and nueva["monto"] == 200000
    assert nueva["eventos"][0]["descripcion"] == (
        "Reprogramada desde promesa anterior (₡150.000 → ₡200.000) — pidió plazo"
    )
    assert orig["estado"] == "REPROGRAMADA" and orig["comentario_validacion"] == "pidió plazo"
    assert orig["eventos"][-1]["descripcion"].startswith(f"Reprogramada a nueva fecha {futura.isoformat()}")
    with pytest.raises(ConflictError, match="no puede reprogramarse"):
        ReprogramarPromesaUseCase(uow.factory).execute(p["ana"], body)


def test_reprogramar_validaciones_y_permisos(w):
    uow, p = w
    pr = uow.promesas.add("agomez@cofersa.cr")
    uc = ReprogramarPromesaUseCase(uow.factory)
    futura = (hoy_cr() + timedelta(days=3)).isoformat()
    base = {"id": str(pr["id"]), "nueva_fecha": futura, "nuevo_monto": 10, "motivo": "m"}
    with pytest.raises(ValidationError, match="La nueva fecha es obligatoria"):
        uc.execute(p["ana"], {**base, "nueva_fecha": ""})
    with pytest.raises(ValidationError, match="nuevo monto"):
        uc.execute(p["ana"], {**base, "nuevo_monto": 0})
    with pytest.raises(ValidationError, match="motivo de reprogramación"):
        uc.execute(p["ana"], {**base, "motivo": " "})
    with pytest.raises(ValidationError, match="pasado"):
        uc.execute(p["ana"], {**base, "nueva_fecha": (hoy_cr() - timedelta(days=1)).isoformat()})
    with pytest.raises(ForbiddenError, match="Sin permisos para reprogramar esta promesa"):
        uc.execute(p["otra"], base)
    with pytest.raises(ForbiddenError):
        uc.execute(p["riesgo"], base)


def test_delete_solo_coordinador(w):
    uow, p = w
    pr = uow.promesas.add("agomez@cofersa.cr")
    with pytest.raises(ForbiddenError, match="Solo el coordinador puede eliminar promesas"):
        DeletePromesaUseCase(uow.factory).execute(p["ana"], str(pr["id"]))
    with pytest.raises(ValidationError, match="id requerido"):
        DeletePromesaUseCase(uow.factory).execute(p["coord"], None)
    DeletePromesaUseCase(uow.factory).execute(p["coord"], str(pr["id"]))
    assert uow.promesas.rows[pr["id"]]["activo"] is False
