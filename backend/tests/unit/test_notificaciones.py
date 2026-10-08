import pytest

from application.dto.principal import Principal
from application.ports.integraciones import ExternalHttp
from application.use_cases.notificaciones import (
    EnviarMensajeChatUseCase,
    ListMensajesChatUseCase,
    ListNotificacionesUseCase,
    MarcarNotificacionLeidaUseCase,
    MarcarTodasLeidasUseCase,
)
from application.use_cases.notificaciones_integraciones import (
    BCCR_BASE,
    BuscarCabysUseCase,
    ConsultarHaciendaUseCase,
    GetTipoCambioUseCase,
    fecha_legible,
)
from domain.exceptions import BusinessRuleViolation, ForbiddenError, NotFoundError, ValidationError
from entrypoints.lambda_handlers import notificaciones as handlers
from fakes.fake_app_unit_of_work import (
    FakeAppUnitOfWork,
    FakeExternalHttp,
    FakeIntegrationConfig,
    principal_for,
)
from fakes.fake_notificaciones import FakeNotificacionesRepository


@pytest.fixture
def world():
    repo = FakeNotificacionesRepository()
    uow = FakeAppUnitOfWork(notificaciones=repo)
    analista = uow.usuarios.add("agomez@cofersa.cr", "ANALISTA")
    otro = uow.usuarios.add("japonte@cofersa.cr", "ANALISTA")
    return uow, repo, analista, otro


def test_routes(world):
    assert ("PATCH", "/notificaciones/{id}") in handlers.ROUTES
    assert ("POST", "/notificaciones/leer-todas") in handlers.ROUTES


def test_lista_solo_las_propias_y_limite(world):
    uow, repo, analista, otro = world
    for i in range(55):
        repo.add(analista.id, titulo=f"n{i}")
    repo.add(otro.id, titulo="ajena")
    data = ListNotificacionesUseCase(uow.factory).execute(principal_for(analista))
    assert len(data) == 50 and data[0]["titulo"] == "n54"
    assert all(n["usuario_id"] == analista.id for n in data)
    assert len(ListNotificacionesUseCase(uow.factory).execute(principal_for(analista), 5)) == 5


def test_marcar_leida_no_toca_ajenas(world):
    uow, repo, analista, otro = world
    ajena = repo.add(otro.id)
    propia = repo.add(analista.id)
    use_case = MarcarNotificacionLeidaUseCase(uow.factory)
    with pytest.raises(NotFoundError):
        use_case.execute(principal_for(analista), str(ajena["id"]), {"leida": True})
    with pytest.raises(NotFoundError):
        use_case.execute(principal_for(analista), "x", None)
    with pytest.raises(ValidationError):
        use_case.execute(principal_for(analista), str(propia["id"]), {"leida": False})
    assert use_case.execute(principal_for(analista), str(propia["id"]), {"leida": True}) is None
    assert propia["leida"] is True and ajena["leida"] is False


def test_marcar_todas(world):
    uow, repo, analista, otro = world
    repo.add(analista.id)
    repo.add(analista.id, leida=True)
    ajena = repo.add(otro.id)
    assert MarcarTodasLeidasUseCase(uow.factory).execute(principal_for(analista)) == {
        "ok": True,
        "actualizadas": 1,
    }
    assert ajena["leida"] is False
    with pytest.raises(ForbiddenError):
        MarcarTodasLeidasUseCase(uow.factory).execute(Principal(subject="s", email="nadie@x.com"))


def test_chat_conserva_errores_del_origen(world):
    uow, _, analista, _ = world
    enviar = EnviarMensajeChatUseCase(uow.factory)
    with pytest.raises(ValidationError) as error:
        enviar.execute(principal_for(analista), {"mensaje": "  "})
    assert error.value.message == "El mensaje no puede estar vacío"
    with pytest.raises(ValidationError) as error:
        enviar.execute(principal_for(analista), {"mensaje": "x" * 1001})
    assert error.value.message == "El mensaje excede los 1000 caracteres"
    with pytest.raises(ForbiddenError) as error:
        enviar.execute(Principal(subject="s", email="nadie@x.com"), {"mensaje": "hola"})
    assert error.value.message == "Usuario no encontrado"
    with pytest.raises(BusinessRuleViolation) as error:
        enviar.execute(principal_for(analista), {"mensaje": "hola"})
    assert error.value.message == "Error al enviar el mensaje"
    with pytest.raises(BusinessRuleViolation) as error:
        ListMensajesChatUseCase(uow.factory).execute(principal_for(analista))
    assert error.value.message == "No se pudieron cargar los mensajes."


def _serie(valor: float) -> tuple[int, dict]:
    return 200, {"datos": [{"series": [{"fecha": "2026-06-03T00:00:00", "valorDatoPorPeriodo": valor}]}]}


def _bccr(compra: float, venta: float) -> FakeExternalHttp:
    return FakeExternalHttp({f"{BCCR_BASE}/317": _serie(compra), f"{BCCR_BASE}/318": _serie(venta)})


def test_tipo_cambio_consulta_bccr_y_guarda_respaldo(world):
    uow, repo, analista, _ = world
    http = _bccr(505.1, 511.2)
    result = GetTipoCambioUseCase(uow.factory, http, FakeIntegrationConfig({"bccr_token": "t"})).execute(
        principal_for(analista)
    )
    assert result == {"compra": 505.1, "venta": 511.2, "fecha": "3 de junio de 2026", "error": False}
    assert repo.config == {
        "tipo_cambio_compra": "505.1",
        "tipo_cambio_venta": "511.2",
        "tipo_cambio_fecha": "3 de junio de 2026",
    }
    assert http.calls[0][2]["idioma"] == "ES"


def test_tipo_cambio_usa_respaldo_o_sin_datos(world):
    uow, repo, analista, _ = world
    sin_token = GetTipoCambioUseCase(uow.factory, _bccr(1, 2), FakeIntegrationConfig())
    assert sin_token.execute(principal_for(analista)) == {
        "compra": None,
        "venta": None,
        "fecha": None,
        "error": True,
    }
    repo.config = {"tipo_cambio_compra": "500", "tipo_cambio_venta": "510", "tipo_cambio_fecha": ""}
    caido = GetTipoCambioUseCase(uow.factory, FakeExternalHttp(), FakeIntegrationConfig({"bccr_token": "t"}))
    assert caido.execute(principal_for(analista)) == {
        "compra": 500.0,
        "venta": 510.0,
        "fecha": None,
        "error": False,
    }


def test_fecha_legible():
    assert fecha_legible("2026-12-25") == "25 de diciembre de 2026"
    assert fecha_legible("2026-13-01") is None and fecha_legible(None) is None


class _Boom(ExternalHttp):
    def get_json(self, url, **kwargs):
        raise TimeoutError("timeout")

    def get_text(self, url, **kwargs):
        raise TimeoutError("timeout")

    def post_json(self, url, body, **kwargs):
        raise TimeoutError("timeout")


def test_hacienda_estado_tributario(world):
    _, _, analista, _ = world
    p = principal_for(analista)
    with pytest.raises(ValidationError) as error:
        ConsultarHaciendaUseCase(FakeExternalHttp()).execute(p, "12ab")
    assert error.value.message == "Cédula inválida — debe tener entre 9 y 12 dígitos"
    ok = FakeExternalHttp({"https://api.hacienda.go.cr/fe/ae": (200, {"nombre": "FERRETERIA X"})})
    assert ConsultarHaciendaUseCase(ok).execute(p, "3101123456")["data"]["nombre"] == "FERRETERIA X"
    assert ok.calls[0][2] == {"identificacion": "3101123456"}
    assert ConsultarHaciendaUseCase(FakeExternalHttp()).execute(p, "3101123456") == {
        "data": None,
        "notFound": True,
        "error": False,
    }
    assert ConsultarHaciendaUseCase(_Boom()).execute(p, "3101123456")["error"] is True
    sin_nombre = FakeExternalHttp({"https://api.hacienda.go.cr": (200, {})})
    assert ConsultarHaciendaUseCase(sin_nombre).execute(p, "3101123456")["error"] is True


def test_cabys(world):
    _, _, analista, _ = world
    p = principal_for(analista)
    with pytest.raises(ValidationError):
        BuscarCabysUseCase(FakeExternalHttp()).execute(p, " ")
    items = [{"codigo": str(i), "descripcion": "arroz", "impuesto": 1, "otro": 1} for i in range(20)]
    http = FakeExternalHttp({"https://api.hacienda.go.cr/fe/cabys": (200, {"cabys": items})})
    result = BuscarCabysUseCase(http).execute(p, "arroz")
    assert len(result["data"]) == 15 and "otro" not in result["data"][0]
    assert http.calls[0][2] == {"q": "arroz"}
    plano = FakeExternalHttp({"https://api.hacienda.go.cr/fe/cabys": (200, items[:1])})
    assert BuscarCabysUseCase(plano).execute(p, "1234567890123")["data"][0]["codigo"] == "0"
    assert plano.calls[0][2] == {"codigo": "1234567890123"}
    assert BuscarCabysUseCase(_Boom()).execute(p, "arroz") == {"data": [], "error": True}
