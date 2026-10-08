from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from application.use_cases import auditoria_legal as lectura
from application.use_cases import auditoria_legal_garantias as garantias
from application.use_cases import auditoria_legal_solicitudes as solicitudes
from application.use_cases.mailer import UsuarioMailer
from domain.entities.auditoria_legal import fmt_crc, fmt_fecha, formatear_ubicacion_archivo
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
from fakes.fake_auditoria_legal import FakeAuditoriaLegalRepository


@pytest.fixture
def repo():
    return FakeAuditoriaLegalRepository()


@pytest.fixture
def uow(repo):
    return FakeAppUnitOfWork(auditoria_legal=repo)


def _user(uow, rol="ANALISTA", email="ana@cofersa.cr", token=True):
    usuario = uow.usuarios.add(email, rol, "Ana Analista")
    if token:
        uow.usuarios.set_google_refresh_token(email, "refresh-ana")
    return principal_for(usuario), usuario


def _alta(**extra):
    return {
        "contribuyente": "3101000002",
        "cliente_nombre": "CLIENTE NUEVO S.A.",
        "tipo_titulo": "Pagaré",
        "monto_garantizado": 500000,
        "fecha_emision": "2026-02-01",
        "fecha_vencimiento": "2027-02-01",
        "ubicacion_mueble": "ARCHIVERO_1",
        "ubicacion_gaveta": "GAVETA_B",
        "ubicacion_carpeta": 3,
        **extra,
    }


# ── dominio ──────────────────────────────────────────────────────────────
def test_formatos():
    assert fmt_crc(1234567.5) == "₡1.234.568"
    assert fmt_fecha("2026-07-30") == "30/07/2026"
    assert formatear_ubicacion_archivo("ARCHIVERO_1", "GAVETA_A", 4) == "Archivero 1 · Gaveta A · Carpeta 04"


# ── lecturas ─────────────────────────────────────────────────────────────
def test_lista_firma_documento_y_acota_mi_cartera(uow, repo):
    principal, _ = _user(uow)
    repo.add_garantia(
        documento_pdf_url="https://x.storage-legado.test/storage/v1/object/public/garantias-legal/1_99.pdf"
    )
    repo.add_garantia(contribuyente="3101000009", analista_email="otro@cofersa.cr")
    storage = FakeStorage()
    uc = lectura.ListGarantiasUseCase(uow.factory, storage)
    todas = uc.execute(principal, False)
    assert len(todas) == 2
    assert todas[0]["documento_pdf_url"].startswith("https://storage.test/1_99.pdf?download")
    assert len(uc.execute(principal, True)) == 1


def test_lecturas_bloquean_analista_riesgo(uow):
    principal, _ = _user(uow, rol="ANALISTA_RIESGO")
    with pytest.raises(ForbiddenError, match="No autorizado para este módulo"):
        lectura.ListVendedoresActivosUseCase(uow.factory).execute(principal)


def test_lecturas_varias(uow, repo):
    principal, _ = _user(uow, rol="GERENCIA")
    gid = repo.add_garantia()
    repo.config = {"TASA_INTERES_MORATORIO_DEFAULT": "2", "PAGARE_ACREEDOR_RAZON_SOCIAL": " COFERSA S.A. "}
    assert lectura.BuscarContribuyentesUseCase(uow.factory).execute(principal, "a") == []
    assert (
        lectura.BuscarContribuyentesUseCase(uow.factory).execute(principal, "fer")[0]["cliente_nombre"]
        == "FER"
    )
    assert lectura.GetVendedorGarantiaUseCase(uow.factory).execute(principal, gid) == {
        "nombre": "Vendedor Uno"
    }
    activa = lectura.GetGarantiaActivaContribuyenteUseCase(uow.factory).execute(principal, "3101000001")
    assert activa == {"tipo_titulo": "Pagaré", "monto_garantizado": repo.garantias[gid]["monto_garantizado"]}
    assert lectura.GetConfigPagareUseCase(uow.factory).execute(principal) == {
        "TASA_INTERES_MORATORIO_DEFAULT": "2"
    }
    conteo = lectura.ContarGarantiasCarpetaUseCase(uow.factory).execute(
        principal, "ARCHIVERO_1", "GAVETA_A", 1, None
    )
    assert conteo == {"conteo": 1, "tope": 25}
    with pytest.raises(ValidationError, match="Mueble/Archivero inválido"):
        lectura.SiguienteCarpetaDisponibleUseCase(uow.factory).execute(principal, "X", "GAVETA_A", 1)
    pagare = lectura.GetPagareImprimibleUseCase(uow.factory).execute(principal, gid)
    assert pagare["garantia"]["consecutivo"] == "PAG-2026-0001"
    assert pagare["acreedor"] == {"razonSocial": "COFERSA S.A.", "cedulaJuridica": ""}


# ── registrar ────────────────────────────────────────────────────────────
def test_registrar_sustituye_y_notifica_conflicto(uow, repo):
    principal, usuario = _user(uow)
    anterior = repo.add_garantia(contribuyente="3101000002")
    repo.responsables["hay_conflicto_analista"] = True
    repo.coordinador_id = uuid4()
    res = garantias.RegistrarGarantiaUseCase(uow.factory).execute(principal, _alta())
    assert res["ok"] and res["sustituyo"]
    nueva = repo.garantias[res["id"]]
    assert nueva["ubicacion_archivero"] == "Archivero 1 · Gaveta B · Carpeta 03"
    assert nueva["registrado_por"] == usuario.id and nueva["consecutivo"] == "PAG-2026-0001"
    assert repo.garantias[anterior]["activo"] is False
    assert repo.garantias[anterior]["reemplazada_por_id"] == res["id"]
    tipos = [e["tipo_evento"] for e in repo.eventos_rows]
    assert tipos == ["APERTURA_EXPEDIENTE", "SUSTITUCION_DE_TITULO"]
    assert repo.eventos_rows[0]["nota"] == f"Sustituye a Pagaré #{anterior}"
    assert repo.notificaciones[0]["titulo"] == "Garantía con analista ambiguo"
    assert uow.commits == 1


@pytest.mark.parametrize("rol", ["ANALISTA_RIESGO", "GERENCIA"])
def test_registrar_rechaza_roles_sin_escritura(uow, rol):
    principal, _ = _user(uow, rol=rol)
    with pytest.raises(ForbiddenError, match="No autorizado para este módulo"):
        garantias.RegistrarGarantiaUseCase(uow.factory).execute(principal, _alta())


def test_registrar_validaciones(uow, repo):
    principal, _ = _user(uow)
    uc = garantias.RegistrarGarantiaUseCase(uow.factory)
    with pytest.raises(ValidationError, match="Faltan campos requeridos"):
        uc.execute(principal, _alta(cliente_nombre=" "))
    with pytest.raises(ValidationError, match="tipo_titulo inválido"):
        uc.execute(principal, _alta(tipo_titulo="Prenda"))
    with pytest.raises(ValidationError, match="Gaveta/Caja inválida"):
        uc.execute(principal, _alta(ubicacion_gaveta="Z"))
    with pytest.raises(ValidationError, match="El vendedor elegido no está vinculado"):
        uc.execute(principal, _alta(vendedor_cod_override="V99"))
    for i in range(25):
        repo.add_garantia(
            contribuyente=f"c{i}", ubicacion_archivero_gaveta="GAVETA_B", ubicacion_archivero_carpeta=3
        )
    with pytest.raises(ValidationError, match="ya tiene 25 garantías"):
        uc.execute(principal, _alta())


def test_registrar_sin_ubicacion_queda_pendiente_de_despacho(uow, repo):
    principal, _ = _user(uow)
    body = {k: v for k, v in _alta().items() if not k.startswith("ubicacion_")}
    res = garantias.RegistrarGarantiaUseCase(uow.factory).execute(principal, body)
    assert repo.garantias[res["id"]]["ubicacion_archivero"] == "Pendiente de despacho"


# ── editar ───────────────────────────────────────────────────────────────
def test_editar_registra_correccion(uow, repo):
    principal, _ = _user(uow)
    gid = repo.add_garantia()
    uc = garantias.EditarGarantiaUseCase(uow.factory)
    res = uc.execute(
        principal, gid, {"monto_garantizado": 2000000, "tiene_fiador": True, "fiador_nombre": "Pedro"}
    )
    assert res == {"ok": True, "cambios": 3}
    nota = repo.eventos_rows[-1]["nota"]
    assert "Monto: ₡1.000.000 → ₡2.000.000" in nota and 'Nombre del fiador: — → "Pedro"' in nota
    assert uc.execute(principal, gid, {"monto_garantizado": 2000000}) == {
        "ok": True,
        "sin_cambios": True,
        "cambios": 0,
    }
    with pytest.raises(ValidationError, match="no se pueden editar desde aquí: contribuyente"):
        uc.execute(principal, gid, {"contribuyente": "x"})
    with pytest.raises(ValidationError, match="posterior a la de emisión"):
        uc.execute(principal, gid, {"fecha_vencimiento": "2025-01-01"})


def test_editar_campos_congelados_y_ubicacion(uow, repo):
    principal, _ = _user(uow)
    gid = repo.add_garantia(documento_pagare_generado_en=datetime.now(UTC))
    uc = garantias.EditarGarantiaUseCase(uow.factory)
    with pytest.raises(ConflictError, match=r"pagaré generado.*\(Monto\)"):
        uc.execute(principal, gid, {"monto_garantizado": 5})
    res = uc.execute(principal, gid, {"ubicacion_carpeta": 7})
    assert res["cambios"] == 1 and repo.garantias[gid]["ubicacion_archivero"].endswith("Carpeta 07")
    fuera = repo.add_garantia(contribuyente="x", estado_custodia="EN_FIRMA")
    with pytest.raises(ConflictError, match="sólo se puede editar mientras el título está en bóveda"):
        uc.execute(principal, fuera, {"ubicacion_carpeta": 2})
    with pytest.raises(NotFoundError):
        uc.execute(principal, 999, {})


# ── custodia ─────────────────────────────────────────────────────────────
def _custodia_uc(uow, gmail=None):
    return garantias.CambiarCustodiaGarantiaUseCase(
        uow.factory, UsuarioMailer(FakeGoogleOAuth(), gmail or FakeGmail())
    )


def test_entregar_envia_correo_con_cc_supervisor(uow, repo):
    principal, _ = _user(uow)
    gid = repo.add_garantia()
    gmail = FakeGmail()
    res = _custodia_uc(uow, gmail).execute(
        principal, gid, {"accion": "ENTREGAR", "providerToken": "ignorado"}
    )
    assert res == {
        "ok": True,
        "nuevo_estado": "ENVIADO_VENDEDOR",
        "email_sent": True,
        "email_to": "vend@cofersa.cr",
        "email_error": None,
    }
    _, sender, mensaje = gmail.sent[0]
    assert (
        sender == "ana@cofersa.cr"
        and mensaje.cc == ("sup@cofersa.cr",)
        and mensaje.sender_name == "Ana Analista"
    )
    assert "Garantía a firmar — FERRETERIA PRUEBA S.A." in mensaje.subject and "₡1.000.000" in mensaje.html
    g = repo.garantias[gid]
    assert (
        g["ubicacion_archivero"] == "Con Vendedor: Vendedor Uno" and g["ubicacion_archivero_mueble"] is None
    )
    assert repo.eventos_rows[-1]["nota"] == "Correo enviado a vend@cofersa.cr"


def test_entregar_sin_gmail_aplica_estado_y_avisa(uow, repo):
    principal, _ = _user(uow, token=False)
    gid = repo.add_garantia()
    res = _custodia_uc(uow).execute(principal, gid, {"accion": "ENTREGAR"})
    assert res["email_sent"] is False and "Gmail" in res["email_error"]
    assert repo.garantias[gid]["estado_custodia"] == "ENVIADO_VENDEDOR"
    assert repo.eventos_rows[-1]["nota"].startswith("Correo NO enviado:")


def test_custodia_estado_invalido_y_reingreso(uow, repo):
    principal, _ = _user(uow)
    gid = repo.add_garantia()
    uc = _custodia_uc(uow)
    with pytest.raises(ConflictError, match="está en estado 'En Bóveda', no se puede aplicar 'Reingresar"):
        uc.execute(
            principal,
            gid,
            {"accion": "REINGRESAR", "mueble": "ARCHIVERO_2", "gaveta": "GAVETA_C", "carpeta": 9},
        )
    with pytest.raises(ValidationError, match="Carpeta/Expediente"):
        uc.execute(principal, gid, {"accion": "REINGRESAR", "mueble": "ARCHIVERO_2", "gaveta": "GAVETA_C"})
    with pytest.raises(ValidationError, match="accion inválida"):
        uc.execute(principal, gid, {"accion": "X"})
    repo.garantias[gid]["estado_custodia"] = "EN_FIRMA"
    res = uc.execute(
        principal, gid, {"accion": "REINGRESAR", "mueble": "ARCHIVERO_2", "gaveta": "GAVETA_C", "carpeta": 9}
    )
    assert res["nuevo_estado"] == "EN_BOVEDA" and res["email_sent"] is False
    assert repo.garantias[gid]["ubicacion_archivero"] == "Archivero 2 · Gaveta C · Carpeta 09"


# ── documento ────────────────────────────────────────────────────────────
def test_documento_presign_y_adjuntar(uow, repo):
    principal, _ = _user(uow)
    gid = repo.add_garantia()
    storage = FakeStorage()
    up = garantias.CrearUploadDocumentoGarantiaUseCase(uow.factory, storage)
    with pytest.raises(ValidationError, match="Solo se acepta PDF"):
        up.execute(principal, gid, {"content_type": "image/png", "size": 10})
    with pytest.raises(ValidationError, match="supera 4MB"):
        up.execute(principal, gid, {"content_type": "application/pdf", "size": 5 * 1024 * 1024})
    firmado = up.execute(principal, gid, {"content_type": "application/pdf", "size": 2048})
    assert firmado.key.startswith(f"{gid}_") and firmado.headers == {"Content-Type": "application/pdf"}
    adj = garantias.AdjuntarDocumentoGarantiaUseCase(uow.factory, storage)
    with pytest.raises(ValidationError, match="Archivo requerido"):
        adj.execute(principal, gid, {"key": firmado.key})
    storage.put_bytes(firmado.key, b"x" * 2048, "application/pdf")
    res = adj.execute(principal, gid, {"key": firmado.key})
    assert res["ok"] and res["documento_pdf_url"].startswith(f"https://storage.test/{firmado.key}")
    assert repo.garantias[gid]["documento_pdf_url"] == firmado.key
    assert repo.eventos_rows[-1]["nota"] == "Documento firmado adjuntado (2 KB)"
    with pytest.raises(ValidationError, match="Archivo requerido"):
        adj.execute(principal, gid, {"key": "../otro.pdf"})


# ── pagaré ───────────────────────────────────────────────────────────────
def test_generar_pagare_juridica(uow, repo):
    principal, _ = _user(uow)
    gid = repo.add_garantia(
        tiene_fiador=True, fiador_nombre="Pedro", fiador_cedula="101110111", fiador_telefono="8888-0000"
    )
    uc = garantias.GenerarPagareUseCase(uow.factory)
    body = {
        "tasa_interes_moratorio": 2,
        "lugar_emision": "San José",
        "representante_cedula": "1-0111-0111",
        "representante_estado_civil": "Casado",
        "representante_profesion": "Gerente",
        "representante_domicilio": "Heredia",
        "fiador_estado_civil": "Soltero",
        "fiador_profesion": "Comerciante",
        "fiador_domicilio": "Cartago",
    }
    with pytest.raises(ValidationError, match="fiador_estado_civil inválido"):
        uc.execute(principal, gid, {**body, "fiador_estado_civil": "Viudo"})
    with pytest.raises(ValidationError, match="9, 10 o 12 dígitos"):
        uc.execute(principal, gid, {**body, "representante_cedula": "123"})
    assert uc.execute(principal, gid, body) == {"ok": True}
    g = repo.garantias[gid]
    assert g["representante_cedula"] == "101110111" and g["documento_pagare_generado_en"] is not None
    assert repo.personas["101110111"]["telefono"] == "8888-0000"
    assert repo.eventos_rows[-1]["nota"] == "Pagaré generado (plantilla jurídica + fiador)"
    with pytest.raises(ConflictError, match="ya tiene un pagaré generado"):
        uc.execute(principal, gid, body)


def test_generar_pagare_solo_tipo_pagare(uow, repo):
    principal, _ = _user(uow)
    gid = repo.add_garantia(tipo_titulo="Letra de Cambio")
    with pytest.raises(ValidationError, match="esta es Letra de Cambio"):
        garantias.GenerarPagareUseCase(uow.factory).execute(principal, gid, {})


# ── solicitudes ──────────────────────────────────────────────────────────
def _crear_uc(uow, gmail=None, app_url="https://sic.test"):
    return solicitudes.CrearSolicitudActualizacionUseCase(
        uow.factory,
        UsuarioMailer(FakeGoogleOAuth(), gmail or FakeGmail()),
        FakeIntegrationConfig({"app_url": app_url}),
    )


def test_crear_solicitud_envia_link(uow, repo):
    principal, usuario = _user(uow)
    gmail = FakeGmail()
    body = {"contribuyente": "3101000002", "cliente_nombre": "CLIENTE", "correo_destino": "a@x.com; b@y.com"}
    res = _crear_uc(uow, gmail).execute(principal, body)
    assert res["ok"] and res["email_sent"] and res["link"].startswith("https://sic.test/actualizar-perfil/")
    token = res["link"].rsplit("/", 1)[1]
    fila = repo.solicitudes[res["id"]]
    assert fila["token_hash"] == solicitudes.hashear_token(token) and fila["tipo_persona"] == "JURIDICA"
    assert fila["enviada_por"] == usuario.id
    assert gmail.sent[0][2].to == ("a@x.com", "b@y.com")
    with pytest.raises(ConflictError, match="Ya hay una solicitud activa"):
        _crear_uc(uow).execute(principal, body)
    with pytest.raises(ValidationError, match="Dirección de correo inválida: malo"):
        _crear_uc(uow).execute(principal, {**body, "correo_destino": "malo"})


def test_crear_solicitud_rate_limit(uow, repo):
    principal, usuario = _user(uow)
    for i in range(30):
        repo.add_solicitud(contribuyente=f"c{i}", estado="CANCELADA", enviada_por=usuario.id)
    with pytest.raises(BusinessRuleViolation, match="Límite de 30 solicitudes por hora"):
        _crear_uc(uow).execute(
            principal, {"contribuyente": "z", "cliente_nombre": "Z", "correo_destino": "a@x.com"}
        )


def test_gestionar_solicitud(uow, repo):
    principal, usuario = _user(uow)
    mailer = UsuarioMailer(FakeGoogleOAuth(), FakeGmail())
    uc = solicitudes.GestionarSolicitudActualizacionUseCase(uow.factory, mailer, FakeIntegrationConfig())
    sid = repo.add_solicitud()
    res = uc.execute(principal, sid, {"accion": "REENVIAR", "correo_destino": "n@x.com"})
    assert res["email_sent"] and res["link"].startswith(
        "https://cyc-cartera-cofersa.vercel.app/actualizar-perfil/"
    )
    with pytest.raises(ConflictError, match="no tiene datos pendientes"):
        uc.execute(principal, sid, {"accion": "APROBAR"})
    datos = {
        "nombre": "Juan",
        "cedula": "101110111",
        "estado_civil": "Casado",
        "profesion": "P",
        "domicilio": "D",
    }
    repo.solicitudes[sid].update(estado="DATOS_RECIBIDOS", datos_temporales=datos)
    with pytest.raises(ValidationError, match="Indicá el motivo del rechazo"):
        uc.execute(principal, sid, {"accion": "RECHAZAR", "nota": " "})
    gid = repo.add_garantia(contribuyente="otro")
    with pytest.raises(ValidationError, match="garantia_id no corresponde"):
        uc.execute(principal, sid, {"accion": "APROBAR", "garantia_id": gid})
    assert uc.execute(principal, sid, {"accion": "APROBAR"}) == {"ok": True, "datos": datos}
    assert (
        repo.personas["101110111"]["nombre"] == "JUAN" and repo.solicitudes[sid]["aprobada_por"] == usuario.id
    )
    with pytest.raises(ConflictError, match="ya no se puede cancelar"):
        uc.execute(principal, sid, {"accion": "CANCELAR"})
    gerencia, _ = _user(uow, rol="GERENCIA", email="g@cofersa.cr")
    with pytest.raises(ForbiddenError):
        uc.execute(gerencia, sid, {"accion": "CANCELAR"})


def test_get_solicitud_firma_archivos(uow, repo):
    principal, _ = _user(uow, rol="GERENCIA")
    sid = repo.add_solicitud(url_cedula="3101000001/cedula_1.jpg")
    res = solicitudes.GetSolicitudActualizacionUseCase(uow.factory, FakeStorage()).execute(
        principal, str(sid)
    )
    assert res["url_cedula_firmada"] == "https://storage.test/3101000001/cedula_1.jpg?download&ttl=300"
    assert res["url_personeria_firmada"] is None
    with pytest.raises(NotFoundError, match="Solicitud no encontrada"):
        solicitudes.GetSolicitudActualizacionUseCase(uow.factory, FakeStorage()).execute(principal, "77")


# ── portal público ───────────────────────────────────────────────────────
def _formulario(**extra):
    return {
        "nombre": "maria",
        "cedula": "101110111",
        "estado_civil": "Soltero",
        "profesion": "Gerente",
        "domicilio": "San José",
        "telefono": "",
        **extra,
    }


def test_portal_publico_flujo_completo(uow, repo):
    token = solicitudes.generar_token()
    sid = repo.add_solicitud(
        token_hash=solicitudes.hashear_token(token), datos_temporales={"telefono": "2222"}
    )
    assert (
        solicitudes.ValidarTokenActualizacionUseCase(uow.factory).execute(token)["tipo_persona"] == "JURIDICA"
    )
    storage = FakeStorage()
    uploads = solicitudes.CrearUploadsActualizacionUseCase(uow.factory, storage)
    with pytest.raises(ValidationError, match="Adjuntá la certificación de personería jurídica."):
        uploads.execute(token, _formulario(cedula_file={"content_type": "image/png", "size": 100}))
    with pytest.raises(ValidationError, match="Formato de imagen no soportado"):
        uploads.execute(token, _formulario(cedula_file={"content_type": "image/gif", "size": 100}))
    firmadas = uploads.execute(
        token,
        _formulario(
            cedula_file={"content_type": "image/png", "size": 100},
            personeria_file={"content_type": "application/pdf", "size": 9},
        ),
    )
    ced, per = firmadas["cedula"].key, firmadas["personeria"].key
    assert ced.startswith("3101000001/cedula_") and ced.endswith(".png") and per.endswith(".pdf")
    enviar = solicitudes.EnviarActualizacionPerfilUseCase(uow.factory, storage)
    with pytest.raises(ValidationError, match="Adjuntá la imagen de tu cédula."):
        enviar.execute(token, _formulario(cedula_key=ced, personeria_key=per))
    storage.put_bytes(ced, b"1", "image/png")
    storage.put_bytes(per, b"1", "application/pdf")
    assert enviar.execute(token, _formulario(cedula_key=ced, personeria_key=per)) == {"ok": True}
    fila = repo.solicitudes[sid]
    assert fila["estado"] == "DATOS_RECIBIDOS" and fila["url_cedula"] == ced
    assert fila["datos_temporales"]["nombre"] == "MARIA" and fila["datos_temporales"]["telefono"] == "2222"
    with pytest.raises(NotFoundError, match="Este enlace ya no es válido."):
        solicitudes.ValidarTokenActualizacionUseCase(uow.factory).execute(token)


def test_portal_publico_token_vencido_o_campos(uow, repo):
    token = solicitudes.generar_token()
    repo.add_solicitud(
        token_hash=solicitudes.hashear_token(token),
        tipo_persona="FISICA",
        token_expira_en=datetime.now(UTC) - timedelta(minutes=1),
    )
    with pytest.raises(NotFoundError):
        solicitudes.ValidarTokenActualizacionUseCase(uow.factory).execute(token)
    repo.solicitudes[1]["token_expira_en"] = datetime.now(UTC) + timedelta(days=1)
    with pytest.raises(ValidationError, match="Completá todos los campos requeridos."):
        solicitudes.CrearUploadsActualizacionUseCase(uow.factory, FakeStorage()).execute(
            token, {"nombre": "x"}
        )
    with pytest.raises(ValidationError, match="longitud máxima"):
        solicitudes.CrearUploadsActualizacionUseCase(uow.factory, FakeStorage()).execute(
            token, _formulario(cedula="1" * 31)
        )
