import base64
from datetime import date, timedelta

import pytest

from application.dto.principal import Principal
from application.use_cases.clientes import (
    ActualizarContactoClienteUseCase,
    ActualizarLogisticaClienteUseCase,
    BuscarGlobalUseCase,
    CambiarEstadoClienteUseCase,
    GetEstadoCuentaDataUseCase,
    GetFichaClienteUseCase,
    ListClientesUseCase,
    RegistrarRecordatorioUseCase,
    filtros_desde_volver,
)
from application.use_cases.clientes_email import (
    EnviarEmailCobroUseCase,
    EnviarEstadoCuentaUseCase,
    GenerarEmailCobroIAUseCase,
)
from application.use_cases.clientes_email_templates import html_email_cobro, ordenar_facturas
from application.use_cases.common import hoy_cr
from application.use_cases.mailer import UsuarioMailer
from domain.entities.clientes import badge_estado, fecha_larga_es, fmt_colones, fmt_fecha, fmt_monto
from domain.exceptions import (
    BusinessRuleViolation,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from fakes.fake_app_unit_of_work import (
    FakeAppUnitOfWork,
    FakeGmail,
    FakeGoogleOAuth,
    FakeLanguageModel,
    principal_for,
)
from fakes.fake_clientes import FakeClientesRepository


def _cartera(cod, nombre, contribuyente, fecha_corte="2026-10-01", total=1000):
    return {
        "id": 1,
        "cliente_cod": cod,
        "cliente_nombre": nombre,
        "contribuyente": contribuyente,
        "fecha_corte": fecha_corte,
        "total": total,
    }


@pytest.fixture
def world():
    repo = FakeClientesRepository()
    uow = FakeAppUnitOfWork(clientes=repo)
    coord = uow.usuarios.add("jdiaz@cofersa.cr", "COORDINADOR", "Jeffrey Díaz")
    analista = uow.usuarios.add("agomez@cofersa.cr", "ANALISTA", "Angélica Gómez")
    otro = uow.usuarios.add("japonte@cofersa.cr", "ANALISTA", "Jeaneth Aponte")
    gerencia = uow.usuarios.add("jgarcia@cofersa.cr", "GERENCIA", "Jorge García")
    riesgo = uow.usuarios.add("jordonez@mayoreo.biz", "ANALISTA_RIESGO", "Jossmin")
    repo.maestro.append(
        {
            "cliente_cod": "C001",
            "cliente_nombre": "Ferretería El Tornillo",
            "contribuyente": "3101",
            "analista_email": analista.email,
            "correo": "cxp@tornillo.cr",
            "condicion_pago": "30 días",
            "vendedor_nombre": "V1",
            "updated_at": "2026-10-01",
        }
    )
    repo.maestro.append(
        {
            "cliente_cod": "C002",
            "cliente_nombre": "Sin Saldo SA",
            "contribuyente": "3102",
            "analista_email": otro.email,
            "vendedor_nombre": None,
            "updated_at": "2026-09-30",
        }
    )
    repo.usuarios += [
        {
            "id": analista.id,
            "email": analista.email,
            "nombre": analista.nombre,
            "telefono": "8888-1111",
            "whatsapp": None,
        },
        {"id": otro.id, "email": otro.email, "nombre": otro.nombre, "telefono": None, "whatsapp": None},
    ]
    return (
        uow,
        repo,
        {"coord": coord, "analista": analista, "otro": otro, "gerencia": gerencia, "riesgo": riesgo},
    )


def _mailer(uow, *emails):
    for email in emails:
        uow.usuarios.set_google_refresh_token(email, "rt")
    gmail = FakeGmail()
    return UsuarioMailer(FakeGoogleOAuth(), gmail), gmail


# ── Lista ──────────────────────────────────────────────────────────────
def test_lista_visible_para_todo_rol_activo_y_sin_paginar_para_excel(world):
    uow, repo, u = world
    repo.cartera = [_cartera("C001", "Ferretería El Tornillo", "3101")]
    use_case = ListClientesUseCase(uow.factory)
    for rol in ("coord", "analista", "riesgo", "gerencia"):
        result = use_case.execute(principal_for(u[rol]), {"q": "Ferre", "dir": "asc"}, 1, 25)
        assert result["total_rows"] == 1
    use_case.execute(principal_for(u["analista"]), {}, 0, None)
    filtros, page, page_size, _ = repo.lista_calls[-1]
    assert (page, page_size, filtros["sort"], filtros["dir"], filtros["q"]) == (
        1,
        None,
        "mora_total",
        "desc",
        None,
    )


def test_lista_requiere_usuario_activo(world):
    uow, _, _ = world
    with pytest.raises(ForbiddenError):
        ListClientesUseCase(uow.factory).execute(Principal(subject="s", email="x@cofersa.cr"), {}, 1, 25)
    with pytest.raises(UnauthorizedError):
        ListClientesUseCase(uow.factory).execute(Principal(subject="s"), {}, 1, 25)


# ── Buscador ───────────────────────────────────────────────────────────
def test_buscar_clientes_facturas_y_marcas(world):
    uow, repo, u = world
    repo.facturas = [
        {
            "documento": "00100001010000123456",
            "cliente_cod": "C001",
            "cliente_nombre": "X",
            "saldo": 10,
            "contribuyente": "3101",
        },
        {
            "documento": "00100001010000123456",
            "cliente_cod": "C001",
            "cliente_nombre": "X",
            "saldo": 10,
            "contribuyente": "3101",
        },
    ]
    repo.marcas = [
        {"id": "m1", "nombre": "Truper", "proveedor": None, "comprador_id": "d1", "comprador_nombre": None}
    ]
    use_case = BuscarGlobalUseCase(uow.factory)
    assert use_case.execute(principal_for(u["analista"]), "a") == {
        "clientes": [],
        "facturas": [],
        "marcas": [],
    }
    r = use_case.execute(principal_for(u["analista"]), "tornillo")
    assert r["clientes"][0] == {
        "tipo": "cliente",
        "cliente_cod": "C001",
        "cliente_nombre": "Ferretería El Tornillo",
        "vendedor_nombre": "V1",
    }
    assert r["facturas"] == []
    r = use_case.execute(principal_for(u["analista"]), "123456")
    assert len(r["facturas"]) == 1 and r["facturas"][0]["tipo"] == "factura"
    r = use_case.execute(principal_for(u["analista"]), "trup")
    assert r["marcas"][0]["comprador_nombre"] == "—"


# ── Ficha ──────────────────────────────────────────────────────────────
def test_ficha_agrega_todo_y_elige_corte_mas_reciente(world):
    uow, repo, u = world
    repo.cartera = [
        _cartera("C001", "Ferretería El Tornillo", "3101", "2026-09-01", 5),
        _cartera("C001", "Ferretería El Tornillo", "3101", "2026-10-01", 9),
        _cartera("C003", "Otro", "3103"),
    ]
    repo.facturas = [{"documento": "F1", "contribuyente": "3101", "saldo": 9}]
    repo.gestiones = [{"cliente_cod": "C001", "id": "g1"}]
    repo.icp["C001"] = {"icp_score": 80}
    repo.tendencia["C001"] = [{"anio": 2026, "mes": 9}]
    repo.pedidos = [
        {"codigo_cliente": "C001", "estado_sic": "Retenido", "id_pedido": "P1"},
        {"codigo_cliente": "C001", "estado_sic": "Aprobado", "id_pedido": "P2"},
    ]
    repo.solicitudes = [
        {"cliente_cod": "C001", "solicitante_id": u["analista"].id, "id": "s1"},
        {"cliente_cod": "C001", "solicitante_id": u["otro"].id, "id": "s2"},
    ]
    use_case = GetFichaClienteUseCase(uow.factory)
    ficha = use_case.execute(principal_for(u["analista"]), "C001", "/clientes?q=Ferre&dir=asc")
    assert ficha["cartera"]["total"] == 9
    assert [s["id"] for s in ficha["solicitudes"]] == ["s1"]  # analista: solo las propias
    assert ficha["solicitante_map"] == {str(u["analista"].id): u["analista"].nombre}
    assert ficha["analista_nombre"] == "Angélica Gómez" and ficha["analista_telefono"] == "8888-1111"
    assert [p["id_pedido"] for p in ficha["pedidos_retenidos"]] == ["P1"]
    assert ficha["icp"] == {"icp_score": 80} and len(ficha["facturas"]) == 1
    assert ficha["posicion_en_lista"] == 1 and ficha["total_en_lista"] == 1
    assert ficha["prev_cod"] is None and ficha["next_cod"] is None
    coord = use_case.execute(principal_for(u["coord"]), "C001", None)
    assert len(coord["solicitudes"]) == 2 and coord["posicion_en_lista"] is None
    assert len(use_case.execute(principal_for(u["gerencia"]), "C001", None)["solicitudes"]) == 2


def test_ficha_cliente_sin_saldo_y_no_encontrado(world):
    uow, _, u = world
    use_case = GetFichaClienteUseCase(uow.factory)
    ficha = use_case.execute(principal_for(u["riesgo"]), "C002", None)
    assert ficha["cartera"]["total"] == 0 and ficha["cartera"]["estado"] == "AL DIA"
    assert ficha["cartera"]["vendedor_nombre"] == ""
    with pytest.raises(NotFoundError):
        use_case.execute(principal_for(u["riesgo"]), "NOEXISTE", None)


def test_filtros_desde_volver():
    assert filtros_desde_volver("/mi-cartera") is None
    assert filtros_desde_volver(None) is None
    f = filtros_desde_volver("/clientes?nivelPrecio=A&sort=total&dir=asc&page=3")
    assert (f["nivel_precio"], f["sort"], f["dir"], f["q"]) == ("A", "total", "asc", None)


# ── Contacto / logística ───────────────────────────────────────────────
def test_contacto_solo_analista_asignado_o_coordinador(world):
    uow, repo, u = world
    use_case = ActualizarContactoClienteUseCase(uow.factory)
    body = {"cliente_cod": "C001", "telefono": " 8888-12345 ", "nombre_cxp": " Ana "}
    assert use_case.execute(principal_for(u["analista"]), body) == {"ok": True}
    assert repo.contactos[-1] == (
        "C001",
        {"nombre_cxp": "Ana", "telefono": "88881234", "telefono2": None, "correo": None},
    )
    use_case.execute(principal_for(u["coord"]), {"cliente_cod": "C001", "correo": ""})
    assert repo.contactos[-1][1]["correo"] == ""
    for rol in ("otro", "gerencia", "riesgo"):
        with pytest.raises(ForbiddenError) as error:
            use_case.execute(principal_for(u[rol]), body)
        assert error.value.message == "Sin permisos para editar este cliente"
    with pytest.raises(ValidationError) as error:
        use_case.execute(principal_for(u["coord"]), {})
    assert error.value.message == "cliente_cod requerido"


def test_logistica_horario_y_arrays(world):
    uow, repo, u = world
    use_case = ActualizarLogisticaClienteUseCase(uow.factory)
    use_case.execute(principal_for(u["analista"]), {"cliente_cod": "C001", "dia_visita": ["Lunes"]})
    campos = repo.logisticas[-1][1]
    assert campos["dia_visita"] == ["Lunes"] and campos["dia_pago"] is None
    assert campos["actualizar_horario"] is False
    use_case.execute(
        principal_for(u["coord"]),
        {"cliente_cod": "C001", "hora_recibo_inicio": "08:00", "hora_recibo_fin": ""},
    )
    campos = repo.logisticas[-1][1]
    assert (campos["actualizar_horario"], campos["hora_recibo_inicio"], campos["hora_recibo_fin"]) == (
        True,
        "08:00",
        None,
    )
    with pytest.raises(ValidationError):
        use_case.execute(principal_for(u["coord"]), {"cliente_cod": "C001", "dia_pago": "Lunes"})
    with pytest.raises(ValidationError):
        use_case.execute(principal_for(u["coord"]), {"cliente_cod": "C001", "hora_recibo_inicio": "8am"})
    with pytest.raises(ForbiddenError):
        use_case.execute(principal_for(u["otro"]), {"cliente_cod": "C001", "dia_visita": []})


# ── Estado ─────────────────────────────────────────────────────────────
def test_cambiar_estado_solo_coordinador_registra_gestion_y_notifica(world):
    uow, repo, u = world
    use_case = CambiarEstadoClienteUseCase(uow.factory)
    with pytest.raises(ValidationError) as error:
        use_case.execute(principal_for(u["coord"]), {"cliente_cod": "C001", "estado": "Raro"})
    assert error.value.message == "Parámetros inválidos"
    for rol in ("analista", "gerencia"):
        with pytest.raises(ForbiddenError) as error:
            use_case.execute(principal_for(u[rol]), {"cliente_cod": "C001", "estado": "Bloqueado"})
        assert error.value.message == "Sin permisos"
    result = use_case.execute(
        principal_for(u["coord"]), {"cliente_cod": "C001", "estado": "Bloqueado", "estado_anterior": "Normal"}
    )
    assert result == {"ok": True, "estado": "Bloqueado"}
    assert repo.maestro[0]["estado_manual"] == "Bloqueado"
    g = repo.nuevas_gestiones[-1]
    assert (g.tipo, g.resultado, g.contribuyente, g.activo) == ("SISTEMA", "Cambio de estado", "C001", True)
    assert 'de "Normal" a "Bloqueado" por Jeffrey Díaz.' in g.nota
    assert repo.notificaciones[-1][0] == u["analista"].id and repo.notificaciones[-1][4] == "/clientes/C001"
    with pytest.raises(NotFoundError):
        use_case.execute(principal_for(u["coord"]), {"cliente_cod": "ZZZ", "estado": "Normal"})


# ── Recordatorio / datos de estado de cuenta ───────────────────────────
def test_recordatorio(world):
    uow, repo, u = world
    use_case = RegistrarRecordatorioUseCase(uow.factory)
    use_case.execute(principal_for(u["analista"]), {"cliente_cod": "C001", "documento": "F1"})
    g = repo.nuevas_gestiones[-1]
    assert (g.tipo, g.resultado, g.nota, g.analista_email) == (
        "Email",
        "Recordatorio enviado",
        "Recordatorio de factura F1",
        "agomez@cofersa.cr",
    )
    with pytest.raises(ValidationError):
        use_case.execute(principal_for(u["analista"]), {"cliente_cod": "C001"})
    with pytest.raises(ForbiddenError):
        use_case.execute(principal_for(u["gerencia"]), {"cliente_cod": "C001", "documento": "F1"})


def test_estado_cuenta_data(world):
    uow, repo, u = world
    repo.facturas = [
        {"documento": "F1", "contribuyente": "3101", "saldo": 5, "monto": 5},
        {"documento": "F2", "contribuyente": "3101", "saldo": 0, "monto": 5},
    ]
    repo.cuentas = [
        {"banco": "BCR", "moneda": "CRC", "tipo": "cuenta", "numero": "1", "iban": None, "orden": 1}
    ]
    use_case = GetEstadoCuentaDataUseCase(uow.factory)
    data = use_case.execute(principal_for(u["riesgo"]), "C001")
    assert data["clienteNombre"] == "Ferretería El Tornillo" and data["analistaNombre"] == "Angélica Gómez"
    assert [f["documento"] for f in data["facturas"]] == ["F1"] and len(data["cuentas"]) == 1
    sin_analista = use_case.execute(principal_for(u["coord"]), "C002")
    assert sin_analista["analistaEmail"] == "japonte@cofersa.cr"
    with pytest.raises(ValidationError):
        use_case.execute(principal_for(u["coord"]), "")
    with pytest.raises(NotFoundError) as error:
        use_case.execute(principal_for(u["coord"]), "ZZZ")
    assert error.value.message == "Cliente no encontrado"


# ── Email de cobro ─────────────────────────────────────────────────────
def test_email_cobro_envia_con_adjunto_y_registra_gestion(world):
    uow, repo, u = world
    mailer, gmail = _mailer(uow, u["analista"].email)
    body = {
        "to": "a@x.com; b@x.com",
        "cc": ["c@x.com;d@x.com"],
        "asunto": "Recordatorio de Pago",
        "mensaje": "Hola\n\nSaldo <pendiente>",
        "clienteNombre": "Ferretería El Tornillo",
        "clienteCod": "C001",
        "contribuyente": "3101",
        "adjunto": {
            "base64": base64.b64encode(b"%PDF").decode(),
            "mimeType": "application/pdf",
            "filename": "estado.pdf",
        },
        "providerToken": "ignorado",
    }
    assert EnviarEmailCobroUseCase(uow.factory, mailer).execute(principal_for(u["analista"]), body) == {
        "email_sent": True
    }
    _, sender, message = gmail.sent[0]
    assert sender == "agomez@cofersa.cr" and message.to == ("a@x.com", "b@x.com")
    assert message.cc == ("c@x.com", "d@x.com") and message.attachments[0].data == b"%PDF"
    assert message.subject == "Recordatorio de Pago - Ferretería El Tornillo"
    assert "&lt;pendiente&gt;" in message.html
    g = repo.nuevas_gestiones[-1]
    assert (g.tipo, g.resultado, g.contribuyente) == ("CORREO", "Email enviado", "3101")
    assert g.nota.startswith("[Recordatorio de Pago] Email enviado a a@x.com, b@x.com, c@x.com, d@x.com.")


def test_email_cobro_validaciones_limite_y_roles(world):
    uow, repo, u = world
    mailer, gmail = _mailer(uow, u["analista"].email)
    use_case = EnviarEmailCobroUseCase(uow.factory, mailer)
    with pytest.raises(ValidationError) as error:
        use_case.execute(principal_for(u["analista"]), {"to": "a@x.com", "asunto": "x"})
    assert error.value.message == "to, asunto y mensaje son requeridos"
    with pytest.raises(ValidationError) as error:
        use_case.execute(principal_for(u["analista"]), {"to": "a@x", "asunto": "x", "mensaje": "y"})
    assert error.value.message == "Dirección de correo inválida: a@x"
    with pytest.raises(ForbiddenError):
        use_case.execute(principal_for(u["gerencia"]), {"to": "a@x.com", "asunto": "x", "mensaje": "y"})
    with pytest.raises(BusinessRuleViolation) as error:  # sin Gmail conectado
        use_case.execute(principal_for(u["otro"]), {"to": "a@x.com", "asunto": "x", "mensaje": "y"})
    assert error.value.code == "gmail_no_conectado"
    repo.correos_ultima_hora = 30
    with pytest.raises(BusinessRuleViolation) as error:
        use_case.execute(principal_for(u["analista"]), {"to": "a@x.com", "asunto": "x", "mensaje": "y"})
    assert error.value.message.startswith("Límite de 30 correos por hora")
    assert gmail.sent == [] and repo.nuevas_gestiones == []


# ── Estado de cuenta por correo ────────────────────────────────────────
def test_estado_cuenta_envia_html_y_registra_gestion(world):
    uow, repo, u = world
    hoy = hoy_cr()
    repo.facturas = [
        {
            "documento": "F-AL-DIA",
            "contribuyente": "3101",
            "saldo": 100,
            "monto": 100,
            "fecha_documento": "2026-01-01",
            "fecha_vencimiento": (hoy + timedelta(days=5)).isoformat(),
        },
        {
            "documento": "F-VENCIDA",
            "contribuyente": "3101",
            "saldo": 1234.5,
            "monto": 2000,
            "fecha_documento": "2026-01-01",
            "fecha_vencimiento": (hoy - timedelta(days=40)).isoformat(),
        },
    ]
    repo.cuentas = [
        {"banco": "BCR", "moneda": "CRC", "tipo": "cuenta", "numero": "001", "iban": "CR01"},
        {"banco": "SINPE", "moneda": "CRC", "tipo": "sinpe", "numero": "8888-0000"},
    ]
    mailer, gmail = _mailer(uow, u["coord"].email)
    result = EnviarEstadoCuentaUseCase(uow.factory, mailer).execute(
        principal_for(u["coord"]),
        {
            "cliente_cod": "C001",
            "cliente_nombre": "Ferretería El Tornillo",
            "contribuyente": "3101",
            "to_email": "cxp@tornillo.cr",
            "observaciones": "Favor revisar",
        },
    )
    assert result["email_sent"] is True and result["facturas_count"] == 2
    assert result["saldo_total"] == pytest.approx(1334.5) and result["email_error"] is None
    html = gmail.sent[0][2].html
    assert html.index("F-VENCIDA") < html.index("F-AL-DIA")
    assert "Vencida 40d" in html and "Sinpe Móvil: 8888-0000" in html and "Angélica Gómez" in html
    assert "Favor revisar" in html and "₡1.234,50" in html
    assert gmail.sent[0][2].subject == "Estado de cuenta — Ferretería El Tornillo"
    g = repo.nuevas_gestiones[-1]
    assert g.nota == "Estado de cuenta enviado a cxp@tornillo.cr (2 facturas, saldo ₡1.334,50)"
    with pytest.raises(ValidationError) as error:
        EnviarEstadoCuentaUseCase(uow.factory, mailer).execute(
            principal_for(u["coord"]), {"cliente_cod": "C001"}
        )
    assert error.value.message == "cliente_cod y to_email son requeridos"


def test_estado_cuenta_error_gmail_se_devuelve_en_email_error(world):
    uow, repo, u = world

    class Rechaza(FakeGmail):
        def send(self, access_token, sender_email, message):
            raise BusinessRuleViolation("Gmail rechazó el envío: 403", code="gmail_error")

    uow.usuarios.set_google_refresh_token(u["analista"].email, "rt")
    use_case = EnviarEstadoCuentaUseCase(uow.factory, UsuarioMailer(FakeGoogleOAuth(), Rechaza()))
    result = use_case.execute(principal_for(u["analista"]), {"cliente_cod": "C001", "to_email": "a@x.com"})
    assert result["ok"] is False and result["email_error"] == "Gmail rechazó el envío: 403"
    assert repo.nuevas_gestiones == []


# ── IA ─────────────────────────────────────────────────────────────────
def test_generar_email_ia(world):
    uow, _, u = world
    model = FakeLanguageModel("Estimado cliente...")
    use_case = GenerarEmailCobroIAUseCase(uow.factory, model)
    body = {
        "clienteNombre": "Ferretería",
        "condicionPago": None,
        "saldoVencido": 1250000,
        "saldoTotal": 2e6,
        "maxDiasMora": 12,
        "nFacturasVenc": 3,
        "analistaNombre": "Ana",
        "asunto": "Recordatorio de Pago",
    }
    assert use_case.execute(principal_for(u["analista"]), body) == {
        "ok": True,
        "texto": "Estimado cliente...",
    }
    assert "Saldo vencido: ₡1.250.000" in model.prompts[0] and "No especificada" in model.prompts[0]
    assert "Días de atraso máximo: 12 días" in model.prompts[0]
    with pytest.raises(ValidationError) as error:
        use_case.execute(principal_for(u["analista"]), {**body, "asunto": "Otro"})
    assert error.value.message == "Asunto no reconocido"


# ── Formatos ───────────────────────────────────────────────────────────
def test_formatos():
    assert fmt_colones(1250000.4) == "₡1.250.000"
    assert fmt_monto(38543) == "₡38.543,00"
    assert fmt_fecha("2026-10-02") == "02/10/2026" and fmt_fecha(None) == "—"
    assert fecha_larga_es(date(2026, 10, 2)) == "02 de octubre de 2026"
    hoy = date(2026, 10, 2)
    assert badge_estado("2026-10-02", hoy)[0] == "Vence hoy"
    assert badge_estado("2026-10-05", hoy)[0] == "Vence en 3d"
    assert [
        f["d"]
        for f in ordenar_facturas(
            [{"d": 1, "fecha_vencimiento": None}, {"d": 2, "fecha_vencimiento": "2026-01-01"}], hoy
        )
    ] == [2, 1]
    html = html_email_cobro(
        asunto="A",
        mensaje="x\ny",
        cliente_nombre=None,
        cliente_cod=None,
        remitente_nombre="R",
        remitente_email="r@x.com",
        fecha_larga="hoy",
    )
    assert "x<br>y" in html and "Cliente</p>" not in html


def test_handler_expone_todas_las_rutas():
    from entrypoints.lambda_handlers import clientes

    assert ("GET", "/clientes/{cod}/ficha") in clientes.ROUTES
    assert ("POST", "/ai/generate-email") in clientes.ROUTES
    assert len(clientes.ROUTES) == 11 and callable(clientes.clientes_handler)
