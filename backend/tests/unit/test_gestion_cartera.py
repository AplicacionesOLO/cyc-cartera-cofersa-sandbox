from uuid import uuid4

import pytest

from application.use_cases.gestion_cartera import (
    ActualizarPedidoRetenidoUseCase,
    AplicarSaldoFavorUseCase,
    CrearUrlSubidaComprobanteUseCase,
    GetPedidosRetenidosUseCase,
    ListSaldosFavorClienteUseCase,
    ListSaldosFavorUseCase,
    MatchingSaldosFavorUseCase,
    ObtenerUrlComprobanteUseCase,
    ReportarPagoUseCase,
)
from domain.exceptions import (
    BusinessRuleViolation,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from entrypoints.lambda_handlers.gestion_cartera import ROUTES
from fakes.fake_app_unit_of_work import FakeAppUnitOfWork, FakeStorage, principal_for
from fakes.fake_gestion_cartera import FakeGestionCarteraRepository


@pytest.fixture
def world():
    repo = FakeGestionCarteraRepository()
    uow = FakeAppUnitOfWork(gestion_cartera=repo)
    users = {
        "coord": uow.usuarios.add("jdiaz@cofersa.cr", "COORDINADOR"),
        "analista": uow.usuarios.add("agomez@cofersa.cr", "ANALISTA"),
        "otra": uow.usuarios.add("japonte@cofersa.cr", "ANALISTA"),
        "gerencia": uow.usuarios.add("jgarcia@cofersa.cr", "GERENCIA"),
        "riesgo": uow.usuarios.add("jordonez@mayoreo.biz", "ANALISTA_RIESGO"),
        "riesgo_cartera": uow.usuarios.add("r2@mayoreo.biz", "ANALISTA_RIESGO", tiene_cartera_asignada=True),
    }
    repo.cartera = {"C1": "agomez@cofersa.cr", "C2": "japonte@cofersa.cr", "C3": "r2@mayoreo.biz"}
    return uow, repo, {k: principal_for(v) for k, v in users.items()}


def test_routes_cover_original_endpoints():
    assert ("PUT", "/pedidos-retenidos/{id}") in ROUTES
    assert ("GET", "/saldos-favor/matching") in ROUTES
    assert ("POST", "/clientes/pagos/reportar") in ROUTES


# ── Pedidos retenidos ──────────────────────────────────────────────────


def test_pedidos_retenidos_any_active_user_and_optional_email(world):
    uow, repo, p = world
    repo.pedidos["P1"] = {"id_pedido": "P1", "analista_email": "agomez@cofersa.cr"}
    use_case = GetPedidosRetenidosUseCase(uow.factory)
    assert use_case.execute(p["analista"], "agomez@cofersa.cr")["kpis"]["total"] == 1
    assert use_case.execute(p["otra"], None)["kpis"]["total"] == 1  # Vista Global
    assert repo.pedidos_email == ["agomez@cofersa.cr", None]


def test_actualizar_pedido_estado_retenido_y_pendiente(world):
    uow, repo, p = world
    repo.pedidos["P1"] = {"id_pedido": "P1", "estado_sic": "Pendiente"}
    use_case = ActualizarPedidoRetenidoUseCase(uow.factory)
    data = use_case.execute(p["otra"], "P1", {"estado_sic": "Retenido", "motivo_retencion": " Mora "})["data"]
    assert data["estado_sic"] == "Retenido"
    assert data["motivo_retencion"] == "Mora"
    assert data["resuelto_por"] == "japonte@cofersa.cr" and data["resuelto_en"] is not None
    data = use_case.execute(p["coord"], "P1", {"estado_sic": "Pendiente"})["data"]
    assert data["resuelto_por"] is None and data["motivo_retencion"] is None
    data = use_case.execute(p["analista"], "P1", {"comentario_analista": "   "})["data"]
    assert data["comentario_analista"] is None
    assert uow.commits


def test_actualizar_pedido_validaciones_y_permisos(world):
    uow, repo, p = world
    repo.pedidos["P1"] = {"id_pedido": "P1"}
    use_case = ActualizarPedidoRetenidoUseCase(uow.factory)
    with pytest.raises(ForbiddenError, match="Sin permisos para modificar pedidos retenidos"):
        use_case.execute(p["gerencia"], "P1", {"estado_sic": "Aprobado"})
    with pytest.raises(ValidationError, match="estado_sic inválido"):
        use_case.execute(p["analista"], "P1", {"estado_sic": "Otro"})
    with pytest.raises(ValidationError, match="Indicá un motivo de retención"):
        use_case.execute(p["analista"], "P1", {"estado_sic": "Retenido", "motivo_retencion": " "})
    with pytest.raises(NotFoundError):
        use_case.execute(p["analista"], "NOPE", {"estado_sic": "Aprobado"})


# ── Saldos a favor ─────────────────────────────────────────────────────


def test_saldos_favor_scope(world):
    uow, repo, p = world
    repo.add_saldo("C1")
    repo.add_saldo("C2")
    repo.add_saldo("C3")
    use_case = ListSaldosFavorUseCase(uow.factory)
    assert {s["cliente_cod"] for s in use_case.execute(p["analista"], "japonte@cofersa.cr")} == {"C1"}
    assert len(use_case.execute(p["coord"], None)) == 3
    assert {s["cliente_cod"] for s in use_case.execute(p["coord"], "japonte@cofersa.cr")} == {"C2"}
    assert {s["cliente_cod"] for s in use_case.execute(p["riesgo_cartera"], None)} == {"C3"}
    assert len(use_case.execute(p["riesgo"], None)) == 3  # riesgo sin cartera: vista general


def test_saldos_favor_cliente_respects_cartera(world):
    uow, repo, p = world
    repo.add_saldo("C2")
    use_case = ListSaldosFavorClienteUseCase(uow.factory)
    assert use_case.execute(p["analista"], "C2") == []
    assert len(use_case.execute(p["otra"], "C2")) == 1
    assert len(use_case.execute(p["gerencia"], "C2")) == 1
    with pytest.raises(ValidationError):
        use_case.execute(p["coord"], "")


def test_aplicar_saldo_permisos_y_efecto(world):
    uow, repo, p = world
    sid = repo.add_saldo("C2")
    use_case = AplicarSaldoFavorUseCase(uow.factory)
    with pytest.raises(ForbiddenError):
        use_case.execute(p["analista"], str(sid))
    with pytest.raises(ForbiddenError):
        use_case.execute(p["gerencia"], str(sid))
    with pytest.raises(NotFoundError):
        use_case.execute(p["coord"], str(uuid4()))
    with pytest.raises(ValidationError):
        use_case.execute(p["coord"], "no-uuid")
    assert use_case.execute(p["otra"], str(sid))["ok"] is True
    assert repo.saldos[sid]["estado_manual"] == "aplicado"
    assert repo.saldos[sid]["aplicado_por"] == "japonte@cofersa.cr"


def test_matching_scope_list_and_aggregate(world):
    uow, repo, p = world
    repo.matches = [
        {"cliente_cod": "C1", "monto_match": 100},
        {"cliente_cod": "C1", "monto_match": 50},
        {"cliente_cod": "C2", "monto_match": 25},
    ]
    use_case = MatchingSaldosFavorUseCase(uow.factory)
    assert use_case.execute(p["analista"], "C2", None) == {"matches": []}
    assert len(use_case.execute(p["analista"], "C1", None)["matches"]) == 2
    assert len(use_case.execute(p["analista"], None, "list")["matches"]) == 2
    assert len(use_case.execute(p["gerencia"], None, "list")["matches"]) == 3
    assert use_case.execute(p["coord"], None, None) == {
        "total_clientes_con_match": 2,
        "total_matches": 3,
        "monto_total_matcheable": 175.0,
    }


# ── Comprobantes ───────────────────────────────────────────────────────


def test_comprobante_upload_url(world):
    uow, _, p = world
    storage = FakeStorage()
    use_case = CrearUrlSubidaComprobanteUseCase(uow.factory, storage)
    result = use_case.execute(
        p["analista"], {"cliente_cod": "C1", "filename": "foto pago #1.png", "content_type": "image/webp"}
    )
    assert result["key"].startswith("C1/") and result["key"].endswith("_foto_pago__1.webp")
    assert result["headers"] == {"Content-Type": "image/webp"}
    with pytest.raises(ValidationError):
        use_case.execute(p["analista"], {"cliente_cod": "C1", "content_type": "text/html"})
    with pytest.raises(ValidationError):
        use_case.execute(p["analista"], {"cliente_cod": "../x", "content_type": "image/jpeg"})


def test_comprobante_download_url_key_or_legacy(world):
    uow, _, p = world
    use_case = ObtenerUrlComprobanteUseCase(uow.factory, FakeStorage())
    assert "C1/1_a.webp" in use_case.execute(p["coord"], "C1/1_a.webp")["url"]
    legacy = "https://x.storage-legado.test/storage/v1/object/public/comprobantes-pago/C1/1_a.webp"
    assert use_case.execute(p["coord"], legacy)["url"].startswith("https://storage.test/C1/1_a.webp")
    with pytest.raises(ValidationError):
        use_case.execute(p["coord"], "../secreto")


# ── Reportar pago ──────────────────────────────────────────────────────


def _body(**extra):
    return {
        "cliente_cod": "C1",
        "contribuyente": "3101",
        "banco_origen": "BAC",
        "referencia": " REF-1 ",
        "monto_transferido": 1500,
        "fecha_transferencia": "2026-10-01",
        "detalles": [
            {"factura_id": 1, "documento": "F1", "monto_aplicado": 1000},
            {"factura_id": 2, "documento": "F2", "monto_aplicado": 500.4},
        ],
        **extra,
    }


def test_reportar_pago_crea_cabecera_y_detalles(world):
    uow, repo, p = world
    result = ReportarPagoUseCase(uow.factory).execute(p["analista"], _body(notas="  "))
    assert result["ok"] is True
    reporte = next(iter(repo.reportes.values()))
    assert reporte["referencia"] == "REF-1" and reporte["analista_email"] == "agomez@cofersa.cr"
    assert reporte["notas"] is None and reporte["estado"] == "pendiente"
    assert len(repo.detalles) == 2 and uow.commits


def test_reportar_pago_validaciones(world):
    uow, _, p = world
    use_case = ReportarPagoUseCase(uow.factory)
    with pytest.raises(ValidationError, match="Cliente requerido"):
        use_case.execute(p["analista"], _body(contribuyente=""))
    with pytest.raises(ValidationError, match="Datos del pago incompletos"):
        use_case.execute(p["analista"], _body(monto_transferido=0))
    with pytest.raises(ValidationError, match="Debe seleccionar al menos una factura"):
        use_case.execute(p["analista"], _body(detalles=[]))
    with pytest.raises(BusinessRuleViolation, match=r"La suma de facturas \(₡1500\) no coincide"):
        use_case.execute(p["analista"], _body(monto_transferido=1600))
    with pytest.raises(ForbiddenError):
        use_case.execute(p["gerencia"], _body())
    use_case.execute(p["analista"], _body())
    with pytest.raises(ConflictError, match='Ya existe un reporte con la referencia "REF-1"'):
        use_case.execute(p["coord"], _body())
