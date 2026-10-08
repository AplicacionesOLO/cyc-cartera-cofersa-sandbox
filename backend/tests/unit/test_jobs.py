"""Módulo jobs: tareas programadas, sync manual (síncrona y por SQS) e ingesta N8N/GAS."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest

from application.use_cases.jobs import (
    ConciliarPromesasManualUseCase,
    EjecutarTareaProgramadaUseCase,
    EncolarSyncManualUseCase,
    ListarHistorialSyncUseCase,
    ObtenerEstadoSyncUseCase,
    ProcesarSyncManualUseCase,
    SincronizarTablaUseCase,
)
from application.use_cases.jobs_ingesta import IngestarLoteUseCase, verificar_clave_ingesta
from domain.entities.jobs import MAX_FILAS_POR_LOTE, TAREAS_PROGRAMADAS
from domain.exceptions import ForbiddenError, NotFoundError, UnauthorizedError, ValidationError
from fakes.fake_app_unit_of_work import (
    FakeAppUnitOfWork,
    FakeExternalHttp,
    FakeIntegrationConfig,
    principal_for,
)
from fakes.fake_jobs import FakeJobsRepository, FakeMessageQueue

CLAVE = "clave-super-secreta"


@pytest.fixture
def uow() -> FakeAppUnitOfWork:
    return FakeAppUnitOfWork(jobs=FakeJobsRepository())


@pytest.fixture
def coordinador(uow):
    return principal_for(uow.usuarios.add("jdiaz@cofersa.cr", "COORDINADOR", "Jeffrey Díaz"))


@pytest.fixture
def analista(uow):
    return principal_for(uow.usuarios.add("agomez@cofersa.cr", "ANALISTA", "Angélica Gómez"))


# ── tareas programadas ──────────────────────────────────────────────────────────────────────────
def test_tarea_programada_ejecuta_y_confirma(uow):
    result = EjecutarTareaProgramadaUseCase(uow.factory).execute("conciliar_promesas")
    assert result == {"tarea": "conciliar_promesas", "resultado": {"ok": True}}
    assert uow.jobs.tareas == ["conciliar_promesas"]
    assert uow.commits == 1


def test_todas_las_tareas_son_ejecutables(uow):
    for tarea in TAREAS_PROGRAMADAS:
        EjecutarTareaProgramadaUseCase(uow.factory).execute(tarea)
    assert uow.jobs.tareas == list(TAREAS_PROGRAMADAS)


def test_tarea_desconocida(uow):
    with pytest.raises(ValidationError):
        EjecutarTareaProgramadaUseCase(uow.factory).execute("drop_everything")
    assert uow.jobs.tareas == []


def test_conciliar_promesas_manual_solo_coordinador(uow, coordinador, analista):
    result = ConciliarPromesasManualUseCase(uow.factory).execute(coordinador)
    assert result["ok"] is True and result["tarea"] == "conciliar_promesas"
    assert uow.jobs.tareas == ["conciliar_promesas"]
    with pytest.raises(ForbiddenError):
        ConciliarPromesasManualUseCase(uow.factory).execute(analista)
    assert uow.jobs.tareas == ["conciliar_promesas"]


# ── sync síncrona ───────────────────────────────────────────────────────────────────────────────
def test_sync_cartera_coordinador(uow, coordinador):
    result = SincronizarTablaUseCase(uow.factory).execute(coordinador, "cartera")
    assert result["ok"] is True and result["resultado"]["total_tabla"] == 10
    assert uow.jobs.syncs == [("cartera", "jdiaz@cofersa.cr")]


def test_sync_solo_coordinador(uow, analista):
    with pytest.raises(ForbiddenError) as exc:
        SincronizarTablaUseCase(uow.factory).execute(analista, "facturas")
    assert exc.value.message == "Acceso denegado"
    assert uow.jobs.syncs == []


def test_sync_sincrona_no_acepta_tipo_asincrono(uow, coordinador):
    with pytest.raises(ValidationError):
        SincronizarTablaUseCase(uow.factory).execute(coordinador, "pagos")


# ── sync asíncrona (SQS) ────────────────────────────────────────────────────────────────────────
def test_encolar_pagos_responde_encolado(uow, coordinador):
    queue = FakeMessageQueue()
    result = EncolarSyncManualUseCase(uow.factory, queue, FakeIntegrationConfig()).execute(
        coordinador, "pagos"
    )
    assert result["ok"] is True and result["encolado"] is True and result["n8n_configurado"] is True
    assert queue.sent[0]["tipo"] == "pagos" and queue.sent[0]["ejecutado_por"] == "jdiaz@cofersa.cr"
    assert uow.jobs.syncs == []  # no procesa en la API


def test_encolar_pedidos_sin_webhook_configurado(uow, coordinador):
    queue = FakeMessageQueue()
    result = EncolarSyncManualUseCase(uow.factory, queue, FakeIntegrationConfig()).execute(
        coordinador, "pedidos_retenidos"
    )
    assert result["n8n_configurado"] is False


def test_encolar_solo_coordinador(uow, analista):
    queue = FakeMessageQueue()
    with pytest.raises(ForbiddenError):
        EncolarSyncManualUseCase(uow.factory, queue, FakeIntegrationConfig()).execute(analista, "pagos")
    assert queue.sent == []


def test_worker_llama_n8n_espera_y_procesa(uow):
    http = FakeExternalHttp({"https://n8n.test/pagos": (200, "ok")})
    config = FakeIntegrationConfig({"n8n_webhook_pagos_url": "https://n8n.test/pagos"})
    esperas: list[float] = []
    use_case = ProcesarSyncManualUseCase(uow.factory, http, config, sleep=esperas.append)
    result = use_case.execute({"tipo": "pagos", "ejecutado_por": "jdiaz@cofersa.cr"})
    assert http.calls[0][1] == "https://n8n.test/pagos"
    assert esperas == [12]
    assert result["n8n_status"] == 200
    assert uow.jobs.syncs == [("pagos", "jdiaz@cofersa.cr")]


def test_worker_usa_url_original_como_fallback_y_tolera_fallo(uow):
    class Caida(FakeExternalHttp):
        def get_text(self, url, *, params=None, headers=None, timeout=15):
            self.calls.append(("GET", url, params))
            raise TimeoutError("sin respuesta")

    http = Caida()
    result = ProcesarSyncManualUseCase(
        uow.factory, http, FakeIntegrationConfig(), sleep=lambda s: None
    ).execute({"tipo": "pagos", "ejecutado_por": "jdiaz@cofersa.cr"})
    assert http.calls[0][1] == "https://n8n.mayoreo.biz/webhook/Flujos_SIC"
    assert result["n8n_status"] is None
    assert uow.jobs.syncs == [("pagos", "jdiaz@cofersa.cr")]


def test_worker_pedidos_sin_webhook_no_espera(uow):
    http = FakeExternalHttp()
    esperas: list[float] = []
    ProcesarSyncManualUseCase(uow.factory, http, FakeIntegrationConfig(), sleep=esperas.append).execute(
        {"tipo": "pedidos_retenidos", "ejecutado_por": "jdiaz@cofersa.cr"}
    )
    assert http.calls == [] and esperas == []
    assert uow.jobs.syncs == [("pedidos_retenidos", "jdiaz@cofersa.cr")]


def test_worker_mensaje_invalido(uow):
    use_case = ProcesarSyncManualUseCase(uow.factory, FakeExternalHttp(), FakeIntegrationConfig())
    with pytest.raises(ValidationError):
        use_case.execute({"tipo": "cartera"})
    with pytest.raises(ValidationError):
        use_case.execute("texto")


# ── lectura de sync_log ─────────────────────────────────────────────────────────────────────────
def test_historial_y_estado(uow, coordinador, analista):
    SincronizarTablaUseCase(uow.factory).execute(coordinador, "saldos_favor")
    historial = ListarHistorialSyncUseCase(uow.factory).execute(analista, None)
    assert [r["tipo"] for r in historial] == ["saldos_favor"]
    antes = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
    estado = ObtenerEstadoSyncUseCase(uow.factory).execute(coordinador, "saldos_favor", antes)
    assert estado["completado"] is True and estado["ultimo"]["tipo"] == "saldos_favor"
    despues = (datetime.now(UTC) + timedelta(minutes=1)).isoformat()
    pendiente = ObtenerEstadoSyncUseCase(uow.factory).execute(coordinador, "saldos_favor", despues)
    assert pendiente == {"tipo": "saldos_favor", "ultimo": None, "completado": False}


def test_estado_valida_parametros(uow, coordinador):
    with pytest.raises(ValidationError):
        ObtenerEstadoSyncUseCase(uow.factory).execute(coordinador, None, None)
    with pytest.raises(ValidationError):
        ObtenerEstadoSyncUseCase(uow.factory).execute(coordinador, "pagos", "ayer")


def test_historial_requiere_usuario_activo(uow):
    from application.dto.principal import Principal

    with pytest.raises(ForbiddenError):
        ListarHistorialSyncUseCase(uow.factory).execute(Principal(subject="x", email="otro@x.com"), None)


# ── ingesta: clave ──────────────────────────────────────────────────────────────────────────────
def test_clave_ingesta_valida():
    verificar_clave_ingesta(FakeIntegrationConfig({"ingesta_api_key": CLAVE}), CLAVE)


@pytest.mark.parametrize("provista", [None, "", "otra", CLAVE + "x"])
def test_clave_ingesta_invalida(provista):
    with pytest.raises(UnauthorizedError):
        verificar_clave_ingesta(FakeIntegrationConfig({"ingesta_api_key": CLAVE}), provista)


def test_clave_ingesta_sin_secreto_rechaza():
    with pytest.raises(UnauthorizedError):
        verificar_clave_ingesta(FakeIntegrationConfig(), CLAVE)


def _ingesta(uow) -> IngestarLoteUseCase:
    return IngestarLoteUseCase(uow.factory, FakeIntegrationConfig({"ingesta_api_key": CLAVE}))


def test_ingesta_sin_clave_no_toca_tablas(uow):
    with pytest.raises(UnauthorizedError):
        _ingesta(uow).execute(None, "cartera", {"modo": "agregar", "filas": [{"cliente_cod": "1"}]})
    assert uow.jobs.tablas == {}


# ── ingesta: lista blanca y validaciones ────────────────────────────────────────────────────────
def test_ingesta_rechaza_columnas_fuera_de_lista_blanca(uow):
    with pytest.raises(ValidationError) as exc:
        _ingesta(uow).execute(
            CLAVE,
            "maestro_clientes",
            {"modo": "actualizar", "filas": [{"cliente_cod": "1", "estado_manual": "X"}]},
        )
    assert exc.value.details["columnas_no_permitidas"] == ["estado_manual"]
    assert uow.jobs.tablas == {}


def test_ingesta_rechaza_tabla_no_permitida(uow):
    with pytest.raises(NotFoundError):
        _ingesta(uow).execute(CLAVE, "usuarios", {"modo": "agregar", "filas": []})


@pytest.mark.parametrize(
    ("tabla", "body"),
    [
        ("maestro_clientes", {"modo": "reemplazar", "filas": []}),  # no se permite vaciar el maestro
        ("saldos_favor", {"modo": "reemplazar", "filas": []}),
        ("pagos_stage", {"modo": "actualizar", "filas": []}),
        ("cartera", {"modo": "agregar", "lote": 2, "total_lotes": 1, "filas": []}),
        ("cartera", {"modo": "agregar", "lote": 0, "filas": []}),
        ("cartera", {"modo": "agregar", "lote": True, "filas": []}),
        ("cartera", {"modo": "agregar", "filas": "x"}),
        ("cartera", {"modo": "agregar", "filas": [1]}),
        ("cartera", {"modo": "agregar", "filas": [{"cliente_cod": "1"}, {"contribuyente": "2"}]}),
        ("cartera", {"modo": "agregar", "filas": [{"cliente_cod": {"x": 1}}]}),
        ("cartera", {"modo": "actualizar", "filas": [{"cliente_cod": "1"}]}),  # falta clave contribuyente
        ("cartera", {"modo": "agregar", "purgar_anteriores": True, "sync_id": "s", "filas": []}),
        ("cartera", {"modo": "actualizar", "purgar_anteriores": True, "filas": []}),
        ("cartera", {"modo": "agregar", "sync_id": 5, "filas": []}),
    ],
)
def test_ingesta_validaciones(uow, tabla, body):
    with pytest.raises(ValidationError):
        _ingesta(uow).execute(CLAVE, tabla, body)


def test_ingesta_maximo_filas(uow):
    filas = [{"id_pedido": str(i)} for i in range(MAX_FILAS_POR_LOTE + 1)]
    with pytest.raises(ValidationError):
        _ingesta(uow).execute(CLAVE, "pedidos_retenidos_stage", {"modo": "agregar", "filas": filas})


# ── ingesta: efectos ────────────────────────────────────────────────────────────────────────────
def test_ingesta_reemplazar_vacia_solo_en_lote_1(uow):
    uow.jobs.tablas["pagos_stage"] = [{"no_recibo": "viejo"}]
    fila = {"no_recibo": "R1", "no_factura": "F1", "monto_pago": 1500.5, "dias_atraso": 3}
    r1 = _ingesta(uow).execute(
        CLAVE,
        "pagos_stage",
        {"modo": "reemplazar", "lote": 1, "total_lotes": 2, "sync_id": "S9", "filas": [fila]},
    )
    r2 = _ingesta(uow).execute(
        CLAVE,
        "pagos_stage",
        {
            "modo": "reemplazar",
            "lote": 2,
            "total_lotes": 2,
            "sync_id": "S9",
            "filas": [{**fila, "no_recibo": "R2"}],
        },
    )
    assert r1["eliminados"] == 1 and r2["eliminados"] == 0
    assert [r["no_recibo"] for r in uow.jobs.tablas["pagos_stage"]] == ["R1", "R2"]
    # stage = todo texto, y el sync_id del lote se agrega a cada fila
    assert uow.jobs.tablas["pagos_stage"][0]["monto_pago"] == "1500.5"
    assert uow.jobs.tablas["pagos_stage"][0]["dias_atraso"] == "3"
    assert uow.jobs.tablas["pagos_stage"][0]["sync_id"] == "S9"
    assert uow.commits == 2


def test_ingesta_actualizar_upsert_y_purga_en_ultimo_lote(uow):
    uow.jobs.tablas["saldos_favor"] = [{"documento": "D0", "sync_id": "viejo"}]
    fila = {"documento": "D1", "cliente_cod": "C1", "tipo_documento": "NC", "monto": 100}
    body = {"modo": "actualizar", "lote": 1, "total_lotes": 1, "sync_id": "S2", "purgar_anteriores": True}
    result = _ingesta(uow).execute(CLAVE, "saldos_favor", {**body, "filas": [fila]})
    assert result["insertados"] == 1 and result["purgados"] == 1
    assert uow.jobs.upserts == [("saldos_favor", ("documento",))]
    assert uow.jobs.tablas["saldos_favor"] == [{**fila, "sync_id": "S2"}]
    assert uow.jobs.tablas["saldos_favor"][0]["monto"] == 100  # tablas tipadas conservan el tipo


def test_ingesta_maestro_upsert_por_cliente_cod(uow):
    fila = {
        "cliente_cod": "C1",
        "contribuyente": "3-101",
        "cliente_nombre": "Ferretería",
        "vendedor_cod": "V1",
    }
    _ingesta(uow).execute(CLAVE, "maestro_clientes", {"modo": "actualizar", "filas": [fila]})
    _ingesta(uow).execute(
        CLAVE,
        "maestro_clientes",
        {"modo": "actualizar", "filas": [{**fila, "cliente_nombre": "Ferretería 2"}]},
    )
    assert uow.jobs.tablas["maestro_clientes"] == [{**fila, "cliente_nombre": "Ferretería 2"}]


def test_ingesta_lote_vacio(uow):
    result = _ingesta(uow).execute(CLAVE, "cartera", {"modo": "reemplazar", "filas": []})
    assert result["insertados"] == 0 and result["recibidas"] == 0


# ── handlers ────────────────────────────────────────────────────────────────────────────────────
def _event(method, resource, path, body=None, headers=None, path_params=None, query=None):
    return {
        "httpMethod": method,
        "resource": resource,
        "path": path,
        "headers": headers or {},
        "pathParameters": path_params,
        "queryStringParameters": query,
        "body": json.dumps(body) if body is not None else None,
    }


def test_ingesta_handler_publico_valida_clave(uow, monkeypatch):
    from entrypoints.lambda_handlers import container, ingesta

    monkeypatch.setattr(container, "uow_factory", uow.factory)
    monkeypatch.setattr(
        container, "integration_config", lambda: FakeIntegrationConfig({"ingesta_api_key": CLAVE})
    )
    body = {"modo": "agregar", "filas": [{"id_pedido": "P1", "codigo_cliente": "C1"}]}
    event = _event(
        "POST",
        "/ingesta/{tabla}",
        "/ingesta/pedidos_retenidos_stage",
        body,
        {"X-Ingesta-Key": CLAVE},
        {"tabla": "pedidos_retenidos_stage"},
    )
    ok = ingesta.ingesta_handler(event)
    assert ok["statusCode"] == 200 and json.loads(ok["body"])["insertados"] == 1
    bad = ingesta.ingesta_handler({**event, "headers": {"x-ingesta-key": "mala"}})
    assert bad["statusCode"] == 401


def test_jobs_handler_encola_con_202(uow, coordinador, monkeypatch):
    from entrypoints.lambda_handlers import container, jobs

    queue = FakeMessageQueue()
    monkeypatch.setattr(container, "uow_factory", uow.factory)
    monkeypatch.setattr(container, "resolve_principal", lambda p: p)
    monkeypatch.setattr(container, "integration_config", lambda: FakeIntegrationConfig())
    monkeypatch.setattr(jobs, "_queue", lambda: queue)
    event = _event("POST", "/sync/pagos", "/sync/pagos")
    event["requestContext"] = {"authorizer": {"claims": {"sub": "s1", "email": coordinador.email}}}
    response = jobs.jobs_handler(event)
    assert response["statusCode"] == 202
    assert json.loads(response["body"])["encolado"] is True
    assert queue.sent[0]["tipo"] == "pagos"


def test_worker_handler_procesa_mensaje(uow, monkeypatch):
    from entrypoints.lambda_handlers import jobs

    procesados = []

    class Fake:
        def execute(self, message):
            procesados.append(message)

    monkeypatch.setattr(jobs, "_uc_procesar", lambda: Fake())
    monkeypatch.setattr(jobs, "_idempotency", lambda: None)
    record = {"messageId": "m1", "body": json.dumps({"tipo": "pagos"})}
    result = jobs.sync_manual_worker_handler({"Records": [record]})
    assert result == {"batchItemFailures": []} and procesados == [{"tipo": "pagos"}]


def test_job_programado_handler(uow, monkeypatch):
    from entrypoints.lambda_handlers import container, jobs_programados

    monkeypatch.setattr(container, "uow_factory", uow.factory)
    result = jobs_programados.sync_pagos_job({}, None)
    assert result["tarea"] == "sync_pagos" and uow.jobs.tareas == ["sync_pagos"]
