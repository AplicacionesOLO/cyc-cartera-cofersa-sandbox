from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from application.use_cases import configuracion as cfg
from application.use_cases import configuracion_catalogos as cat
from domain.entities.configuracion import calcular_ejecuciones
from domain.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from fakes.fake_app_unit_of_work import FakeAppUnitOfWork, principal_for
from fakes.fake_configuracion import FakeConfiguracionRepository


@pytest.fixture
def world():
    repo = FakeConfiguracionRepository()
    uow = FakeAppUnitOfWork(configuracion=repo)
    coord = uow.usuarios.add("jdiaz@cofersa.cr", "COORDINADOR", "Jeffrey Díaz")
    analista = uow.usuarios.add("agomez@cofersa.cr", "ANALISTA", "Angélica Gómez")
    gerencia = uow.usuarios.add("jgarcia@cofersa.cr", "GERENCIA", "Jorge García")
    return uow, repo, principal_for(coord), principal_for(analista), principal_for(gerencia)


def _vendedor(repo, cod, nombre, **extra):
    repo.vendedores[cod] = {
        "cod": cod,
        "nombre": nombre,
        "email": None,
        "zona": None,
        "telefono": None,
        "analista_email": None,
        "activo": True,
        "asignado_por": None,
        "asignado_en": None,
        "supervisor_cod": None,
        "tipo_canal": "Venta Regular",
        **extra,
    }


def _supervisor(repo, cod, nombre, **extra):
    repo.supervisores[cod] = {
        "cod": cod,
        "nombre": nombre,
        "email": f"{cod}@cofersa.cr",
        "activo": True,
        "created_at": datetime.now(UTC),
        "es_jefe_regional": False,
        "jefe_regional_cod": None,
        "cargo_jerarquia": None,
        **extra,
    }


# ── autorización ──────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "call",
    [
        lambda uow, p: cfg.GetConfiguracionPantallaUseCase(uow.factory).execute(p),
        lambda uow, p: cfg.UpdateSemaforoUseCase(uow.factory).execute(p, {}),
        lambda uow, p: cat.CreateUsuarioUseCase(uow.factory).execute(p, {"nombre": "x"}),
        lambda uow, p: cat.DeactivateVendedorUseCase(uow.factory).execute(p, "V1"),
        lambda uow, p: cat.ListDirectorioUseCase(uow.factory).execute(p, None, None),
    ],
)
def test_solo_coordinador(world, call):
    uow, repo, _, analista, gerencia = world
    for principal in (analista, gerencia):
        with pytest.raises(ForbiddenError) as error:
            call(uow, principal)
        assert error.value.message == "Acceso restringido al coordinador"
    assert repo.audit == []


def test_directorio_activo_para_cualquier_usuario_activo(world):
    uow, repo, coord, analista, _ = world
    cat.CreateContactoUseCase(uow.factory).execute(
        coord, {"nombre": "Ana Ventas", "email": "Ana@Cofersa.cr", "area": "Ventas"}
    )
    baja = repo.insert_contacto({"nombre": "Baja", "email": "baja@x.cr", "area": "TI", "activo": False})
    result = cat.ListContactosDirectorioUseCase(uow.factory).execute(analista, "ana", None, 8)
    assert [c["email"] for c in result["data"]] == ["ana@cofersa.cr"]
    assert baja["id"] not in [c["id"] for c in result["data"]]


# ── pantalla ──────────────────────────────────────────────────────────────
def test_pantalla_arma_datos_y_tolera_fallo_de_automatizaciones(world):
    uow, repo, coord, _, _ = world
    _supervisor(repo, "S1", "Sup Uno")
    _vendedor(repo, "V1", "Vend Uno", supervisor_cod="S1")
    _vendedor(repo, "V2", "Vend Dos", supervisor_cod="S1", activo=False)
    repo.clientes_por_vendedor = {"V1": 3}
    repo.upsert_config({"semaforo_rojo_mora_dias": "90", "sla_aumento": "48", "meta_mensual": "100"})
    repo.upsert_grupo("V1", "Ruta Norte", None)
    repo.activar_miembros("V1", ["V2"])
    repo.usuarios[uuid4()] = {
        "nombre": "Ana",
        "email": "a@cofersa.cr",
        "iniciales": "A",
        "color": "#1",
        "activo": True,
    }
    repo.fallar_resumen = True

    data = cfg.GetConfiguracionPantallaUseCase(uow.factory).execute(coord)

    v1 = next(v for v in data["vendedores"] if v["cod"] == "V1")
    assert v1["supervisor_nombre"] == "Sup Uno" and v1["n_clientes"] == 3
    assert data["supervisores"][0]["n_vendedores"] == 1  # solo activos
    assert data["semaforo"]["semaforo_rojo_mora_dias"] == "90"
    assert data["semaforo"]["semaforo_ambar_promesa_dias"] == "7"
    assert data["slaOverrides"] == {"sla_aumento": "48"}
    assert [p["clave"] for p in data["parametros"]] == ["meta_mensual"]
    assert data["rutas"][0]["miembros"] == [{"cod": "V2", "nombre": "Vend Dos", "activo": True}]
    assert data["analistas"] == [{"nombre": "Ana", "email": "a@cofersa.cr", "iniciales": "A", "color": "#1"}]
    assert data["automatizaciones"]["reglas"] == []
    assert set(data["mesCierreSugerido"]) == {"anio", "mes"}


# ── config_sistema ────────────────────────────────────────────────────────
def test_semaforo_y_sla_validan_claves_y_auditan(world):
    uow, repo, coord, _, _ = world
    with pytest.raises(ValidationError, match="Claves no permitidas: otra"):
        cfg.UpdateSemaforoUseCase(uow.factory).execute(coord, {"otra": 1})
    assert cfg.UpdateSemaforoUseCase(uow.factory).execute(coord, {"semaforo_rojo_mora_dias": 45}) == {
        "ok": True
    }
    assert cfg.GetSemaforoUseCase(uow.factory).execute(coord)["data"]["semaforo_rojo_mora_dias"] == "45"
    with pytest.raises(ValidationError, match="Body vacío"):
        cfg.UpdateSlaUseCase(uow.factory).execute(coord, {})
    with pytest.raises(ValidationError, match="deben comenzar con sla_"):
        cfg.UpdateSlaUseCase(uow.factory).execute(coord, {"x": "1"})
    cfg.UpdateSlaUseCase(uow.factory).execute(coord, {"sla_nc": 24})
    assert cfg.GetSlaUseCase(uow.factory).execute(coord) == {"data": {"sla_nc": "24"}}
    assert [a["tabla"] for a in repo.audit] == ["config_sistema", "config_sistema"]
    assert repo.audit[0]["realizado_por"] == "jdiaz@cofersa.cr"


def test_parametro_auditoria_fallida_no_interrumpe(world):
    uow, repo, coord, _, _ = world
    with pytest.raises(ValidationError, match="Clave no permitida: hack"):
        cfg.UpdateParametroUseCase(uow.factory).execute(coord, {"clave": "hack", "valor": "1"})
    with pytest.raises(ValidationError, match="valor es requerido"):
        cfg.UpdateParametroUseCase(uow.factory).execute(coord, {"clave": "meta_mensual"})
    repo.fallar_auditoria = True
    result = cfg.UpdateParametroUseCase(uow.factory).execute(coord, {"clave": "meta_mensual", "valor": 500})
    assert result["data"]["valor"] == "500"
    assert repo.audit == []


def test_automatizaciones_toggle_y_listado(world):
    uow, repo, coord, _, _ = world
    with pytest.raises(ValidationError, match="id y activa"):
        cfg.ToggleAutomatizacionUseCase(uow.factory).execute(coord, {"id": "sin_gestion", "activa": "no"})
    with pytest.raises(ValidationError, match="Regla no reconocida: xx"):
        cfg.ToggleAutomatizacionUseCase(uow.factory).execute(coord, {"id": "xx", "activa": True})
    with pytest.raises(ValidationError, match="housekeeping"):
        cfg.ToggleAutomatizacionUseCase(uow.factory).execute(
            coord, {"id": "conciliacion_promesas", "activa": False}
        )
    result = cfg.ToggleAutomatizacionUseCase(uow.factory).execute(
        coord, {"id": "sin_gestion", "activa": False}
    )
    assert result == {"data": {"id": "sin_gestion", "activa": False}}
    assert repo.config["automatizacion_sin_gestion_activa"]["valor"] == "false"
    repo.resumen = {"sin_gestion": 4}
    reglas = cfg.GetAutomatizacionesUseCase(uow.factory).execute(coord)["data"]
    sin_gestion = next(r for r in reglas if r["id"] == "sin_gestion")
    assert sin_gestion["activa"] is False and sin_gestion["disparos_7d"] == 4
    assert next(r for r in reglas if r["id"] == "promesas_hoy")["activa"] is True
    assert sin_gestion["proxima_ejecucion_programada"].endswith("Z")


def test_feed_filtra_y_marca_leido(world):
    uow, repo, coord, _, _ = world
    coord_id = next(iter(uow.usuarios.rows))
    repo.usuarios[coord_id] = {"id": coord_id, "nombre": "Jeffrey", "email": "jdiaz@cofersa.cr"}
    ahora = datetime.now(UTC)
    repo.feed = [
        {"id": uuid4(), "usuario_id": coord_id, "regla_id": "sync_salud", "created_at": ahora},
        {"id": uuid4(), "usuario_id": uuid4(), "regla_id": "sin_gestion", "created_at": ahora},
        {
            "id": uuid4(),
            "usuario_id": coord_id,
            "regla_id": "sync_salud",
            "created_at": ahora - timedelta(30),
        },
    ]
    result = cfg.ListAutomatizacionesFeedUseCase(uow.factory).execute(coord, "sync_salud", "abc")
    assert result["mostrados"] == 1 and result["truncado"] is False
    assert result["data"][0]["usuario"]["nombre"] == "Jeffrey"
    todos = cfg.ListAutomatizacionesFeedUseCase(uow.factory).execute(coord, None, "60")
    assert todos["mostrados"] == 3
    assert todos["data"][1]["usuario"] is None
    evento = repo.feed[0]["id"]
    assert cfg.MarcarEventoLeidoUseCase(uow.factory).execute(coord, str(evento)) == {"ok": True}
    assert repo.leidas == [evento]
    with pytest.raises(ValidationError):
        cfg.MarcarEventoLeidoUseCase(uow.factory).execute(coord, "no-uuid")


# ── cierre de mes ─────────────────────────────────────────────────────────
def test_cierre_mes_valida_y_reemplaza(world):
    uow, repo, coord, _, _ = world
    uc = cfg.GuardarCierreMesUseCase(uow.factory)
    base = {"anio": 2025, "mes": 3, "total_ventas_sin_iva": 1000.4}
    with pytest.raises(ValidationError, match="Año inválido"):
        uc.execute(coord, {**base, "anio": 2019})
    with pytest.raises(ValidationError, match="Mes inválido"):
        uc.execute(coord, {**base, "mes": 13})
    with pytest.raises(ValidationError, match="mayor a 0"):
        uc.execute(coord, {**base, "total_ventas_sin_iva": 0})
    with pytest.raises(ValidationError, match="Cartera Total"):
        uc.execute(coord, {**base, "cartera_total_mes": -1})
    hoy = datetime.now(UTC) - timedelta(hours=6)
    with pytest.raises(ValidationError, match="aún no ha cerrado"):
        uc.execute(coord, {**base, "anio": hoy.year, "mes": hoy.month})
    uc.execute(coord, base)
    result = uc.execute(coord, {**base, "total_ventas_sin_iva": 2000})
    assert result["data"]["total_ventas_sin_iva"] == 2000
    assert repo.audit[0]["accion"] == "INSERT" and repo.audit[0]["descripcion"].endswith("₡1000")
    assert repo.audit[1]["descripcion"] == "Ventas 3/2025 actualizadas: ₡1000 → ₡2000"
    assert cfg.ListVentasMensualesUseCase(uow.factory).execute(coord)["data"][0]["mes"] == 3


# ── log ───────────────────────────────────────────────────────────────────
def test_log_pagina_y_csv(world):
    uow, repo, coord, _, _ = world
    for i in range(60):
        repo.audit.append(
            {
                "tabla": "vendedores" if i % 2 else "usuarios",
                "realizado_en": datetime(2026, 5, 1, tzinfo=UTC) + timedelta(hours=i),
            }
        )
    uc = cfg.ListAuditLogUseCase(uow.factory)
    page2 = uc.execute(coord, tabla=None, desde=None, hasta=None, page=2, formato=None)
    assert len(page2["data"]) == 10 and page2["total"] == 60 and page2["pageSize"] == 50
    csv = uc.execute(coord, tabla="usuarios", desde="2026-05-01", hasta="2026-05-01", page=3, formato="csv")
    assert csv["total"] == 12 and len(csv["data"]) == 12
    with pytest.raises(ValidationError):
        uc.execute(coord, tabla=None, desde="mayo", hasta=None, page=1, formato=None)


# ── usuarios ──────────────────────────────────────────────────────────────
def test_usuarios_alta_dominios_y_edicion(world):
    uow, repo, coord, _, _ = world
    uc = cat.CreateUsuarioUseCase(uow.factory)
    with pytest.raises(ValidationError, match="nombre y email son requeridos"):
        uc.execute(coord, {"nombre": " ", "email": "x@cofersa.cr", "rol": "ANALISTA"})
    with pytest.raises(ValidationError, match="rol debe ser uno de"):
        uc.execute(coord, {"nombre": "X", "email": "x@cofersa.cr", "rol": "ADMIN"})
    with pytest.raises(ValidationError, match="@cofersa.cr o @mayoreo.biz"):
        uc.execute(coord, {"nombre": "X", "email": "x@gmail.com", "rol": "ANALISTA"})
    creado = uc.execute(coord, {"nombre": "Joshua Mora", "email": "JMora@cofersa.cr", "rol": "ANALISTA"})[
        "data"
    ]
    assert creado["email"] == "jmora@cofersa.cr" and creado["iniciales"] == "JM"
    assert creado["color"] == "#009ee3" and creado["meta_individual"] == 0
    assert (
        cat.CreateUsuarioUseCase(uow.factory).execute(
            coord, {"nombre": "R", "email": "r@mayoreo.biz", "rol": "ANALISTA_RIESGO", "iniciales": "rx9"}
        )["data"]["iniciales"]
        == "RX"
    )

    upd = cat.UpdateUsuarioUseCase(uow.factory)
    with pytest.raises(NotFoundError, match="Usuario no encontrado"):
        upd.execute(coord, "nope", {"nombre": "x"})
    with pytest.raises(ValidationError, match="rol debe ser uno de"):
        upd.execute(coord, str(creado["id"]), {"rol": "ROOT"})
    fila = upd.execute(coord, str(creado["id"]), {"rol": "GERENCIA", "email": "otro@x.cr"})["data"]
    assert fila["rol"] == "GERENCIA" and fila["email"] == "jmora@cofersa.cr"  # email no editable
    upd.execute(coord, str(creado["id"]), {"activo": False})
    descs = [a["descripcion"] for a in repo.audit if a["tabla"] == "usuarios"]
    assert descs[-2:] == [
        "Usuario jmora@cofersa.cr cambió rol: ANALISTA → GERENCIA",
        "Usuario jmora@cofersa.cr desactivado",
    ]
    assert len(cat.ListUsuariosConfigUseCase(uow.factory).execute(coord)["data"]) == 2


# ── vendedores ────────────────────────────────────────────────────────────
def test_vendedores_reasignacion_y_bloqueo_por_ruta(world):
    uow, repo, coord, _, _ = world
    with pytest.raises(ValidationError, match="cod y nombre son requeridos"):
        cat.CreateVendedorUseCase(uow.factory).execute(coord, {"cod": "V9"})
    creado = cat.CreateVendedorUseCase(uow.factory).execute(coord, {"cod": " V1 ", "nombre": "Uno"})["data"]
    assert creado["tipo_canal"] == "Venta Regular" and creado["asignado_por"] == "jdiaz@cofersa.cr"
    upd = cat.UpdateVendedorUseCase(uow.factory)
    with pytest.raises(NotFoundError, match="Vendedor no encontrado"):
        upd.execute(coord, "XX", {"zona": "N"})
    fila = upd.execute(coord, "V1", {"analista_email": "agomez@cofersa.cr"})["data"]
    assert fila["analista_email"] == "agomez@cofersa.cr" and fila["asignado_en"] is not None
    assert repo.audit[-1]["descripcion"] == "Vendedor V1 reasignado: sin asignación → agomez@cofersa.cr"
    repo.upsert_grupo("V1", "Ruta Sur", None)
    with pytest.raises(ConflictError, match='principal de la ruta "Ruta Sur"'):
        upd.execute(coord, "V1", {"activo": False})
    with pytest.raises(ConflictError):
        cat.DeactivateVendedorUseCase(uow.factory).execute(coord, "V1")
    repo.update_grupo("V1", {"activo": False})
    assert cat.DeactivateVendedorUseCase(uow.factory).execute(coord, "V1") == {"ok": True}
    assert cat.ListVendedoresConfigUseCase(uow.factory).execute(coord)["data"] == []
    upd.execute(coord, "V1", {"activo": True})
    assert repo.audit[-1]["descripcion"] == "Vendedor V1 reactivado"


# ── supervisores ──────────────────────────────────────────────────────────
def test_supervisores_jerarquia_y_desactivacion(world):
    uow, repo, coord, _, _ = world
    alta = cat.CreateSupervisorUseCase(uow.factory)
    with pytest.raises(ValidationError, match="Formato de correo inválido"):
        alta.execute(coord, {"cod": "S1", "nombre": "Sup", "email": "malo"})
    jefe = alta.execute(
        coord,
        {
            "cod": "S1",
            "nombre": "Jefe",
            "email": "j@cofersa.cr",
            "es_jefe_regional": True,
            "jefe_regional_cod": "S0",
        },
    )["data"]
    assert jefe["jefe_regional_cod"] is None and jefe["cargo_jerarquia"] == "Jefe Regional"
    upd = cat.UpdateSupervisorUseCase(uow.factory)
    with pytest.raises(NotFoundError, match="Supervisor no encontrado"):
        upd.execute(coord, "ZZ", {})
    fila = upd.execute(coord, "S1", {"es_jefe_regional": False, "jefe_regional_cod": "S2"})["data"]
    assert fila["cargo_jerarquia"] is None and fila["jefe_regional_cod"] == "S2"
    _vendedor(repo, "V1", "Uno", supervisor_cod="S1")
    assert cat.ListSupervisoresConfigUseCase(uow.factory).execute(coord)["data"][0]["n_vendedores"] == 1
    with pytest.raises(ConflictError) as error:
        cat.DeactivateSupervisorUseCase(uow.factory).execute(coord, "S1")
    assert error.value.message == "No se puede desactivar: tiene vendedores activos asignados"
    assert error.value.details["vendedores"] == [{"cod": "V1", "nombre": "Uno"}]
    repo.vendedores["V1"]["activo"] = False
    cat.DeactivateSupervisorUseCase(uow.factory).execute(coord, "S1")
    assert repo.supervisores["S1"]["activo"] is False


# ── directorio ────────────────────────────────────────────────────────────
def test_directorio_crud(world):
    uow, repo, coord, _, _ = world
    alta = cat.CreateContactoUseCase(uow.factory)
    with pytest.raises(ValidationError, match="Área inválida. Permitidas"):
        alta.execute(coord, {"nombre": "A", "email": "a@x.cr", "area": "Marte"})
    with pytest.raises(ValidationError, match="Formato de correo"):
        alta.execute(coord, {"nombre": "A", "email": "a@x", "area": "TI"})
    contacto = alta.execute(coord, {"nombre": " Ana ", "email": "ANA@x.cr", "area": "TI", "telefono": "  "})[
        "data"
    ]
    assert contacto["nombre"] == "Ana" and contacto["telefono"] is None and contacto["es_comprador"] is False
    upd = cat.UpdateContactoUseCase(uow.factory)
    with pytest.raises(ValidationError, match="^Área inválida$"):
        upd.execute(coord, str(contacto["id"]), {"area": "Marte"})
    with pytest.raises(NotFoundError, match="Contacto no encontrado"):
        upd.execute(coord, str(uuid4()), {"nombre": "x"})
    fila = upd.execute(coord, str(contacto["id"]), {"email": "Nueva@X.cr", "telefono": " 8888 "})["data"]
    assert fila["email"] == "nueva@x.cr" and fila["telefono"] == "8888"
    cat.DeactivateContactoUseCase(uow.factory).execute(coord, str(contacto["id"]))
    assert repo.contactos[contacto["id"]]["activo"] is False
    assert repo.audit[-1]["descripcion"] == "Contacto nueva@x.cr desactivado del directorio"
    assert len(cat.ListDirectorioUseCase(uow.factory).execute(coord, "TI", "nue")["data"]) == 1


# ── portafolio acotado ────────────────────────────────────────────────────
def test_rutas_crear_reconciliar_y_desactivar(world):
    uow, repo, coord, _, _ = world
    for cod in ("P1", "M1", "M2", "M3"):
        _vendedor(repo, cod, f"Vend {cod}")
    alta = cat.CreateRutaUseCase(uow.factory)
    with pytest.raises(ValidationError, match="Vendedor principal requerido"):
        alta.execute(coord, {"nombre_ruta": "R"})
    with pytest.raises(ValidationError, match="al menos un miembro"):
        alta.execute(coord, {"principal_cod": "P1", "nombre_ruta": "R", "miembros": [" "]})
    with pytest.raises(ValidationError, match="El principal no puede"):
        alta.execute(coord, {"principal_cod": "P1", "nombre_ruta": "R", "miembros": ["P1"]})
    assert alta.execute(
        coord, {"principal_cod": "P1", "nombre_ruta": "Ruta", "miembros": ["M1", "M1 ", "M2"]}
    ) == {"ok": True}
    with pytest.raises(ConflictError, match="Ya existe una ruta activa"):
        alta.execute(coord, {"principal_cod": "P1", "nombre_ruta": "Otra", "miembros": ["M3"]})

    upd = cat.UpdateRutaUseCase(uow.factory)
    upd.execute(coord, "P1", {"nombre_ruta": " Ruta Norte ", "miembros": ["M2", "M3"]})
    activos = {m["vendedor_cod"]: m["activo"] for m in repo.miembros}
    assert activos == {"M1": False, "M2": True, "M3": True}
    assert repo.grupos["P1"]["nombre_ruta"] == "Ruta Norte"
    repo.vendedores["M3"]["activo"] = False
    ruta = cat.ListRutasUseCase(uow.factory).execute(coord)["data"][0]
    assert [m["cod"] for m in ruta["miembros"]] == ["M1", "M2"]  # oculta vendedores inactivos
    assert ruta["principal_nombre"] == "Vend P1"
    cat.DeactivateRutaUseCase(uow.factory).execute(coord, "P1")
    assert repo.grupos["P1"]["activo"] is False
    assert [a["descripcion"] for a in repo.audit][-1] == "Ruta (principal P1) desactivada"


def test_calcular_ejecuciones_lunes_a_viernes():
    viernes_tarde = datetime(2026, 10, 2, 20, 0, tzinfo=UTC)  # viernes
    result = calcular_ejecuciones("0 13 * * 1-5", viernes_tarde)
    assert result["ultima_ejecucion_programada"] == "2026-10-02T13:00:00.000Z"
    assert result["proxima_ejecucion_programada"] == "2026-10-05T13:00:00.000Z"  # lunes
    diario = calcular_ejecuciones("30 23 * * *", viernes_tarde)
    assert diario["proxima_ejecucion_programada"] == "2026-10-02T23:30:00.000Z"
