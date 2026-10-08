from datetime import UTC, datetime
from uuid import uuid4

import pytest

from application.use_cases.mailer import UsuarioMailer
from application.use_cases.solicitudes import (
    AgregarComentarioSolicitudUseCase,
    CambiarEstadoSolicitudUseCase,
    CreateAdjuntoUploadUrlUseCase,
    GetNuevaSolicitudClientesUseCase,
    GetNuevaSolicitudContextoUseCase,
    GetSolicitudDetalleUseCase,
    ListFacturasPendientesUseCase,
    ListSolicitudesUseCase,
    ResolverSolicitudUseCase,
    key_adjunto,
)
from application.use_cases.solicitudes_crear import CreateSolicitudUseCase
from application.use_cases.solicitudes_email import fecha_corta_cr, fecha_larga_cr
from domain.exceptions import (
    BusinessRuleViolation,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from fakes.fake_app_unit_of_work import (
    FakeAppUnitOfWork,
    FakeGmail,
    FakeGoogleOAuth,
    FakeIntegrationConfig,
    FakeStorage,
    principal_for,
)
from fakes.fake_solicitudes import FakeSolicitudesRepository


@pytest.fixture
def world():
    repo = FakeSolicitudesRepository()
    uow = FakeAppUnitOfWork(solicitudes=repo)
    users = {
        "coord": uow.usuarios.add("jdiaz@cofersa.cr", "COORDINADOR", "Jeffrey Díaz"),
        "ana": uow.usuarios.add("agomez@cofersa.cr", "ANALISTA", "Angélica Gómez"),
        "ana2": uow.usuarios.add("mprodriguez@cofersa.cr", "ANALISTA", "María Paola"),
        "ger": uow.usuarios.add("jgarcia@cofersa.cr", "GERENCIA", "Jorge García"),
        "riesgo": uow.usuarios.add("jordonez@mayoreo.biz", "ANALISTA_RIESGO", "Jossmin"),
        "riesgo_cartera": uow.usuarios.add(
            "riesgo2@mayoreo.biz", "ANALISTA_RIESGO", "Riesgo Cartera", tiene_cartera_asignada=True
        ),
    }
    for u in users.values():
        repo.add_usuario(u)
    return uow, repo, users


def _p(users, key):
    return principal_for(users[key])


class FailingGmail(FakeGmail):
    def send(self, access_token, sender_email, message):
        raise BusinessRuleViolation("Gmail rechazó el envío: 403", code="gmail_error")


class NoTokenOAuth(FakeGoogleOAuth):
    def refresh_access_token(self, refresh_token):
        return None


def _create_uc(uow, gmail=None, oauth=None, config=None, storage=None):
    mailer = UsuarioMailer(oauth or FakeGoogleOAuth(), gmail or FakeGmail())
    return CreateSolicitudUseCase(
        uow.factory, mailer, config or FakeIntegrationConfig(), storage or FakeStorage()
    )


# ── Listado y detalle ───────────────────────────────────────────────────────
def test_list_scope_por_rol(world):
    uow, repo, users = world
    propia = repo.add_solicitud(solicitante_id=users["ana"].id)
    repo.add_solicitud(solicitante_id=users["ana2"].id)
    uc = ListSolicitudesUseCase(uow.factory)

    coord = uc.execute(_p(users, "coord"))
    assert len(coord["solicitudes"]) == 2
    assert coord["solicitante_map"][str(users["ana"].id)] == "Angélica Gómez"
    assert len(uc.execute(_p(users, "ger"))["solicitudes"]) == 2
    ana = uc.execute(_p(users, "ana"))
    assert [s["id"] for s in ana["solicitudes"]] == [propia["id"]]
    assert uc.execute(_p(users, "coord"), solo_propias=True)["solicitudes"] == []
    assert uc.execute(_p(users, "riesgo_cartera"))["solicitudes"] == []
    with pytest.raises(ForbiddenError):
        uc.execute(_p(users, "riesgo"))


def test_detalle_con_autores_gestion_y_adjuntos_firmados(world):
    uow, repo, users = world
    gestion_id = uuid4()
    repo.gestiones[gestion_id] = {
        "id": gestion_id,
        "resultado": "Promesa OK",
        "nota": "n",
        "tipo": "Llamada",
        "fecha": "2026-10-01",
        "cliente_cod": "C1",
    }
    sol = repo.add_solicitud(
        solicitante_id=users["ana"].id,
        gestion_id=gestion_id,
        datos={
            "adjuntos": [
                {"name": "a.pdf", "path": "C1/1_0_a.pdf", "url": None},
                {
                    "name": "b.jpeg",
                    "url": "https://x.storage-legado.test/storage/v1/object/public/comprobantes-pago/C1/b%201.jpeg",
                },
                {"name": "c", "url": None},
            ]
        },
    )
    repo.insert_comentario(sol["id"], users["coord"].id, "hola")
    repo.insert_historial(sol["id"], None, "PENDIENTE", users["ana"].id, "Solicitud creada")
    uc = GetSolicitudDetalleUseCase(uow.factory, FakeStorage())

    det = uc.execute(_p(users, "ana"), str(sol["id"]))
    assert det["solicitante_nombre"] == "Angélica Gómez"
    assert det["comentarios"][0]["autor_nombre"] == "Jeffrey Díaz"
    assert det["historial"][0]["autor_nombre"] == "Angélica Gómez"
    assert det["gestion_origen"]["resultado"] == "Promesa OK" and "nota" not in det["gestion_origen"]
    adj = det["solicitud"]["datos"]["adjuntos"]
    assert adj[0]["url"].startswith("https://storage.test/C1/1_0_a.pdf")
    assert adj[1]["url"].startswith("https://storage.test/C1/b 1.jpeg")
    assert adj[2]["url"] is None

    with pytest.raises(NotFoundError):
        uc.execute(_p(users, "ana2"), str(sol["id"]))  # RLS: solo las propias
    with pytest.raises(NotFoundError):
        uc.execute(_p(users, "coord"), "no-es-uuid")
    assert uc.execute(_p(users, "ger"), str(sol["id"]))["solicitud"]["id"] == sol["id"]


def test_key_adjunto():
    assert key_adjunto({"path": "C1/x.pdf"}) == "C1/x.pdf"
    assert key_adjunto({"url": "https://otra.com/x.pdf"}) is None


# ── Contextos para crear ────────────────────────────────────────────────────
def test_nueva_clientes_filtra_maestro_del_analista(world):
    uow, repo, users = world
    repo.cartera = [
        {"cliente_cod": "C1", "cliente_nombre": "B"},
        {"cliente_cod": "C2", "cliente_nombre": "A"},
    ]
    repo.maestro = [
        {
            "cliente_cod": "C1",
            "analista_email": "agomez@cofersa.cr",
            "limite_credito": 10,
            "estado_manual": None,
        },
        {
            "cliente_cod": "C2",
            "analista_email": "mprodriguez@cofersa.cr",
            "limite_credito": 0,
            "estado_manual": None,
        },
    ]
    gid = uuid4()
    repo.gestiones[gid] = {
        "id": gid,
        "resultado": "Pagó",
        "nota": "x",
        "tipo": "Email",
        "fecha": "2026-10-01",
        "cliente_cod": "C1",
    }
    uc = GetNuevaSolicitudClientesUseCase(uow.factory)
    ana = uc.execute(_p(users, "ana"), False, str(gid))
    assert [m["cliente_cod"] for m in ana["maestro"]] == ["C1"]
    assert ana["analista_nombres"] == {"agomez@cofersa.cr": "Angélica Gómez"}
    assert ana["gestion_origen"]["nota"] == "x"
    coord = uc.execute(_p(users, "coord"), False, None)
    assert len(coord["maestro"]) == 2 and coord["solo_mi_cartera"] is False
    assert uc.execute(_p(users, "coord"), True, None)["maestro"] == []
    with pytest.raises(ForbiddenError):
        uc.execute(_p(users, "ger"), False, None)


def test_nueva_contexto_y_facturas(world):
    uow, repo, users = world
    repo.cartera = [{"cliente_cod": "C1", "cliente_nombre": "Uno", "contribuyente": "3-101"}]
    repo.maestro = [{"cliente_cod": "C1", "analista_email": "agomez@cofersa.cr", "condicion_pago": 30}]
    repo.facturas = [
        {"contribuyente": "3-101", "documento": "F1", "saldo": 5},
        {"contribuyente": "3-101", "documento": "F2", "saldo": 0},
        {"contribuyente": "3-101", "documento": "F3", "saldo": 9},
    ]
    ctx = GetNuevaSolicitudContextoUseCase(uow.factory).execute(_p(users, "ana"), "C1")
    assert [f["documento"] for f in ctx["facturas"]] == ["F3", "F1"]
    assert ctx["maestro"]["condicion_pago"] == 30
    with pytest.raises(NotFoundError):
        GetNuevaSolicitudContextoUseCase(uow.factory).execute(_p(users, "ana"), "NOPE")
    with pytest.raises(ValidationError):
        GetNuevaSolicitudContextoUseCase(uow.factory).execute(_p(users, "ana"), None)
    facturas = ListFacturasPendientesUseCase(uow.factory).execute(_p(users, "coord"), "3-101")
    assert len(facturas) == 2


def test_upload_url_valida_tipo_y_rol(world):
    uow, _, users = world
    storage = FakeStorage()
    uc = CreateAdjuntoUploadUrlUseCase(uow.factory, storage)
    res = uc.execute(
        _p(users, "ana"), {"cliente_cod": "C1", "filename": "0_foto.webp", "content_type": "image/webp"}
    )
    assert res["key"].startswith("C1/") and res["key"].endswith("_0_foto.webp")
    assert res["headers"]["Content-Type"] == "image/webp"
    with pytest.raises(ValidationError):
        uc.execute(
            _p(users, "ana"), {"cliente_cod": "C1", "filename": "x.exe", "content_type": "application/x"}
        )
    with pytest.raises(ValidationError):
        uc.execute(
            _p(users, "ana"), {"cliente_cod": "../C1", "filename": "a.pdf", "content_type": "application/pdf"}
        )
    with pytest.raises(ForbiddenError):
        uc.execute(
            _p(users, "ger"), {"cliente_cod": "C1", "filename": "a.pdf", "content_type": "application/pdf"}
        )


# ── Crear ───────────────────────────────────────────────────────────────────
CATALOGO = {
    "area": "credito_cobro",
    "tipo": "Aumento de límite",
    "prioridad": "Alta",
    "sla_horas": 24,
    "cliente_cod": "C1",
    "cliente_nombre": "Cliente Uno",
    "descripcion": "  Necesita más crédito  ",
    "responsable_nombre": "Jeffrey Díaz",
    "responsable_email": "jdiaz@cofersa.cr",
    "providerToken": "ignorado",
    "datos": {
        "facturas": ["F1", "F2"],
        "cc": ["cc@cofersa.cr"],
        "adjuntos": [{"name": "a.pdf", "sizeKB": 3, "tipo": "pdf", "url": None, "path": "C1/1_0_a.pdf"}],
    },
}


def test_create_catalogo_inserta_historial_y_envia_correo(world):
    uow, repo, users = world
    uow.usuarios.set_google_refresh_token("agomez@cofersa.cr", "rt")
    gmail = FakeGmail()
    res = _create_uc(
        uow, gmail=gmail, config=FakeIntegrationConfig({"app_url": "https://sic.test/"})
    ).execute(_p(users, "ana"), CATALOGO)
    assert res["ok"] and res["email_sent"] and res["email_error"] is None
    assert res["numero"] == "SIC-00001" and res["email_to"] == "jdiaz@cofersa.cr"
    sol = repo.solicitudes[res["id"]]
    assert sol["estado"] == "Pendiente" and sol["justificacion"] == "Necesita más crédito"
    assert sol["solicitante_id"] == users["ana"].id and sol["sla_horas"] == 24
    assert (
        repo.historial[0]["estado_nuevo"] == "Pendiente" and repo.historial[0]["nota"] == "Solicitud creada"
    )
    _, sender, msg = gmail.sent[0]
    assert sender == "agomez@cofersa.cr" and msg.cc == ("cc@cofersa.cr",)
    assert msg.subject == "[SIC-00001] Aumento de límite — Cliente Uno"
    assert f"https://sic.test/solicitudes/{res['id']}" in msg.html  # responsable es usuario del SIC
    assert "https://storage.test/C1/1_0_a.pdf" in msg.html and "F1, F2" in msg.html


def test_create_catalogo_correo_best_effort(world):
    uow, repo, users = world
    body = {**CATALOGO, "responsable_email": "externo@proveedor.com"}
    res = _create_uc(uow).execute(_p(users, "ana"), body)  # sin refresh token guardado
    assert res["ok"] and not res["email_sent"] and res["email_to"] is None
    assert res["email_error"].startswith("Token de Google no disponible")
    assert len(repo.solicitudes) == 1

    uow.usuarios.set_google_refresh_token("agomez@cofersa.cr", "rt")
    res = _create_uc(uow, gmail=FailingGmail()).execute(_p(users, "ana"), body)
    assert res["email_error"] == "Gmail rechazó el envío: 403"


def test_create_catalogo_sin_responsable_va_al_coordinador_configurado(world):
    uow, _, users = world
    uow.usuarios.set_google_refresh_token("agomez@cofersa.cr", "rt")
    gmail = FakeGmail()
    body = {**CATALOGO, "responsable_email": None, "datos": None}
    res = _create_uc(
        uow, gmail=gmail, config=FakeIntegrationConfig({"email_coordinador": "coord@x.cr"})
    ).execute(_p(users, "ana"), body)
    assert res["email_to"] == "coord@x.cr"
    assert "Ver solicitud" not in gmail.sent[0][2].html  # no es usuario del SIC


def test_create_validaciones_y_permisos(world):
    uow, _, users = world
    uc = _create_uc(uow)
    with pytest.raises(ValidationError) as error:
        uc.execute(_p(users, "ana"), {"tipo": "X", "cliente_cod": "C1", "descripcion": "  "})
    assert error.value.message == "tipo, cliente_cod y descripcion son requeridos"
    with pytest.raises(ForbiddenError) as error:
        uc.execute(_p(users, "ger"), CATALOGO)
    assert error.value.message == "Sin permisos para crear solicitudes"
    with pytest.raises(ForbiddenError):
        uc.execute(_p(users, "riesgo"), CATALOGO)
    with pytest.raises(ValidationError):
        uc.execute(_p(users, "ana"), {**CATALOGO, "gestion_id": "x"})


LEGACY = {
    "tipo": "aumento_limite",
    "destinatario": "coordinador",
    "cliente_cod": "C1",
    "cliente_nombre": "Cliente Uno",
    "justificacion": "Cliente creció",
    "para_email": None,
    "cc_emails": ["a@cofersa.cr"],
    "datos": {"limite_solicitado": "5000"},
    "monto_actual": 1000,
    "monto_solicitado": 5000,
}


def test_create_legacy_notifica_y_envia(world):
    uow, repo, users = world
    uow.usuarios.set_google_refresh_token("agomez@cofersa.cr", "rt")
    gmail = FakeGmail()
    res = _create_uc(uow, gmail=gmail).execute(_p(users, "ana"), LEGACY)
    assert res == {
        "ok": True,
        "id": res["id"],
        "email_sent": True,
        "email_to": "jdiaz@cofersa.cr",
        "email_error": None,
    }
    sol = repo.solicitudes[res["id"]]
    assert (
        sol["estado"] == "PENDIENTE"
        and sol["cc_emails"] == ["a@cofersa.cr"]
        and sol["monto_solicitado"] == 5000
    )
    notif = repo.notificaciones[0]
    assert notif["usuario_id"] == users["coord"].id and notif["titulo"] == "Nueva solicitud: aumento limite"
    assert notif["link"] == f"/solicitudes/{res['id']}"
    assert gmail.sent[0][2].subject == "[SIC Cofersa] Aumento Limite — Cliente Uno"


def test_create_legacy_sin_gmail_no_inserta(world):
    uow, repo, users = world
    with pytest.raises(BusinessRuleViolation) as error:
        _create_uc(uow, oauth=NoTokenOAuth()).execute(_p(users, "ana"), LEGACY)
    assert error.value.message.startswith("Sesión de Google expirada")
    assert repo.solicitudes == {}


# ── Resolver (APROBAR / RECHAZAR / CANCELAR) ────────────────────────────────
def test_resolver_aprobar_solo_coordinador_y_notifica(world):
    uow, repo, users = world
    sol = repo.add_solicitud(solicitante_id=users["ana"].id)
    uc = ResolverSolicitudUseCase(uow.factory)
    with pytest.raises(ForbiddenError):
        uc.execute(_p(users, "ana"), str(sol["id"]), {"accion": "APROBAR"})
    assert uc.execute(_p(users, "coord"), str(sol["id"]), {"accion": "APROBAR", "comentario": " ok "}) == {
        "ok": True
    }
    row = repo.solicitudes[sol["id"]]
    assert (
        row["estado"] == "APROBADA"
        and row["comentario_revisor"] == "ok"
        and row["revisor_id"] == users["coord"].id
    )
    assert repo.notificaciones[0]["titulo"] == "Solicitud aprobada: AUMENTO LIMITE"
    assert repo.notificaciones[0]["mensaje"] == "Cliente: Cliente Uno. Nota:  ok "


def test_resolver_cancelar(world):
    uow, repo, users = world
    sol = repo.add_solicitud(solicitante_id=users["ana"].id)
    uc = ResolverSolicitudUseCase(uow.factory)
    with pytest.raises(NotFoundError):
        uc.execute(_p(users, "ana2"), str(sol["id"]), {"accion": "CANCELAR"})
    with pytest.raises(ForbiddenError):
        uc.execute(_p(users, "ger"), str(sol["id"]), {"accion": "CANCELAR"})
    uc.execute(_p(users, "ana"), str(sol["id"]), {"accion": "CANCELAR"})
    assert repo.solicitudes[sol["id"]]["estado"] == "RECHAZADA" and repo.notificaciones == []
    with pytest.raises(ValidationError):
        uc.execute(_p(users, "ana"), str(sol["id"]), {"accion": "CANCELAR"})
    with pytest.raises(ValidationError):
        uc.execute(_p(users, "ana"), str(sol["id"]), {})
    with pytest.raises(ValidationError):
        uc.execute(_p(users, "ana"), str(sol["id"]), {"accion": "BORRAR"})


# ── Estado ─────────────────────────────────────────────────────────────────
def test_cambiar_estado_coordinador_registra_historial(world):
    uow, repo, users = world
    sol = repo.add_solicitud(solicitante_id=users["ana"].id, estado="Pendiente")
    uc = CambiarEstadoSolicitudUseCase(uow.factory)
    res = uc.execute(
        _p(users, "coord"), str(sol["id"]), {"estado_nuevo": "En revisión", "nota": " revisando "}
    )
    assert res == {"ok": True, "estado_anterior": "Pendiente", "estado_nuevo": "En revisión"}
    assert repo.solicitudes[sol["id"]]["estado"] == "En revisión"
    assert repo.historial[-1]["nota"] == "revisando" and repo.historial[-1]["usuario_id"] == users["coord"].id
    with pytest.raises(ConflictError):
        uc.execute(_p(users, "coord"), str(sol["id"]), {"estado_nuevo": "En revisión"})


def test_cambiar_estado_validaciones_y_rls(world):
    uow, repo, users = world
    legacy = repo.add_solicitud(solicitante_id=users["ana"].id, estado="PENDIENTE")
    catalogo = repo.add_solicitud(solicitante_id=users["ana"].id, estado="Pendiente")
    uc = CambiarEstadoSolicitudUseCase(uow.factory)
    with pytest.raises(ValidationError):
        uc.execute(_p(users, "coord"), str(legacy["id"]), {})
    with pytest.raises(ValidationError) as error:
        uc.execute(_p(users, "coord"), str(legacy["id"]), {"estado_nuevo": "APROBADA"})
    assert error.value.message.startswith("Estado inválido. Permitidos: Pendiente, En revisión")
    with pytest.raises(ForbiddenError) as error:
        uc.execute(_p(users, "ger"), str(legacy["id"]), {"estado_nuevo": "Cerrada"})
    assert error.value.message == "Sin permisos para cambiar el estado de la solicitud"
    with pytest.raises(NotFoundError):
        uc.execute(_p(users, "ana2"), str(legacy["id"]), {"estado_nuevo": "Cerrada"})
    with pytest.raises(ForbiddenError):  # RLS: el analista solo actualiza las propias en PENDIENTE
        uc.execute(_p(users, "ana"), str(catalogo["id"]), {"estado_nuevo": "Cerrada"})
    assert uc.execute(_p(users, "ana"), str(legacy["id"]), {"estado_nuevo": "Cerrada"})["ok"]


# ── Comentarios ────────────────────────────────────────────────────────────
def test_comentarios(world):
    uow, repo, users = world
    sol = repo.add_solicitud(solicitante_id=users["ana"].id)
    uc = AgregarComentarioSolicitudUseCase(uow.factory)
    res = uc.execute(_p(users, "coord"), str(sol["id"]), {"contenido": "  revisar  "})
    assert res["comentario"]["contenido"] == "revisar"
    assert (
        res["comentario"]["usuario_nombre"] == "Jeffrey Díaz"
        and res["comentario"]["usuario_id"] == users["coord"].id
    )
    with pytest.raises(ValidationError) as error:
        uc.execute(_p(users, "coord"), str(sol["id"]), {"contenido": "  "})
    assert error.value.message == "El comentario no puede estar vacío"
    with pytest.raises(ForbiddenError) as error:
        uc.execute(_p(users, "ger"), str(sol["id"]), {"contenido": "x"})
    assert error.value.message == "Sin permisos para comentar en esta solicitud"
    with pytest.raises(NotFoundError):
        uc.execute(_p(users, "coord"), str(uuid4()), {"contenido": "x"})


def test_fechas_cr():
    instante = datetime(2026, 10, 2, 3, 5, tzinfo=UTC)  # 21:05 del 1/oct en CR
    assert fecha_larga_cr(instante) == "01 de octubre de 2026, 21:05"
    assert fecha_corta_cr(instante) == "1/10/2026"


def test_handler_routes_cover_all_endpoints():
    from entrypoints.lambda_handlers.solicitudes import ROUTES

    assert ("POST", "/solicitudes") in ROUTES and ("PATCH", "/solicitudes/{id}/estado") in ROUTES
    assert len(ROUTES) == 10
