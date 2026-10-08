"""Repository de Configuración contra el esquema Aurora generado."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration


def _sfx() -> str:
    return uuid4().hex[:6]


def test_usuarios_vendedores_supervisores(uow, make_usuario):
    analista_email, _ = make_usuario("ANALISTA")
    sup, vend, sfx = f"S{_sfx()}", f"V{_sfx()}", _sfx()
    with uow() as u:
        repo = u.configuracion
        nuevo = repo.insert_usuario(
            {
                "nombre": "IT Config",
                "email": f"cfg-{sfx}@cofersa.cr",
                "rol": "ANALISTA",
                "iniciales": "IC",
                "color": "#009ee3",
                "activo": True,
                "meta_individual": 0,
                "telefono": None,
                "whatsapp": None,
            }
        )
        assert "google_refresh_token" not in nuevo
        assert repo.get_usuario(nuevo["id"])["email"] == f"cfg-{sfx}@cofersa.cr"
        assert repo.update_usuario(nuevo["id"], {"rol": "GERENCIA", "email": "x@y"})["rol"] == "GERENCIA"
        assert repo.update_usuario(nuevo["id"], {})["rol"] == "GERENCIA"
        assert any(r["id"] == nuevo["id"] for r in repo.list_usuarios())

        s = repo.insert_supervisor(
            {
                "cod": sup,
                "nombre": "Sup IT",
                "email": f"sup-{sfx}@cofersa.cr",
                "activo": True,
                "es_jefe_regional": False,
                "jefe_regional_cod": None,
                "cargo_jerarquia": None,
            }
        )
        assert s["cod"] == sup and repo.get_supervisor(sup)["nombre"] == "Sup IT"
        v = repo.insert_vendedor(
            {
                "cod": vend,
                "nombre": "Vend IT",
                "email": None,
                "zona": None,
                "telefono": None,
                "supervisor_cod": sup,
                "analista_email": None,
                "tipo_canal": "Venta Regular",
                "activo": True,
                "asignado_por": "it@cofersa.cr",
                "asignado_en": datetime.now(UTC),
            }
        )
        assert v["cod"] == vend
        upd = repo.update_vendedor(
            vend, {"analista_email": analista_email, "asignado_en": datetime.now(UTC), "zona": "Norte"}
        )
        assert upd["analista_email"] == analista_email and upd["zona"] == "Norte"
        assert repo.get_vendedor(vend)["zona"] == "Norte"
        assert any(r["cod"] == vend for r in repo.list_vendedores(solo_activos=True))
        assert repo.vendedores_activos_de_supervisor(sup) == [{"cod": vend, "nombre": "Vend IT"}]
        assert isinstance(repo.contar_clientes_por_vendedor(), dict)
        assert repo.update_supervisor(sup, {"cargo_jerarquia": "Jefe"})["cargo_jerarquia"] == "Jefe"
        assert any(r["cod"] == sup for r in repo.list_supervisores(solo_activos=True))
        assert repo.ruta_activa_de_principal(vend) is None
        u.commit()
    with uow() as u:
        repo = u.configuracion
        repo.update_vendedor(vend, {"activo": False})
        assert all(r["cod"] != vend for r in repo.list_vendedores(solo_activos=True))
        assert any(r["cod"] == vend for r in repo.list_vendedores(solo_activos=False))


def test_directorio_y_rutas(uow):
    sfx = _sfx()
    principal, m1, m2 = f"P{sfx}", f"A{sfx}", f"B{sfx}"
    with uow() as u:
        repo = u.configuracion
        c = repo.insert_contacto(
            {
                "nombre": f"Zeta {sfx}",
                "email": f"zeta_{sfx}@cofersa.cr",
                "cargo": None,
                "area": "TI",
                "telefono": None,
                "activo": True,
                "es_comprador": False,
            }
        )
        assert repo.get_contacto(c["id"])["area"] == "TI"
        assert [r["id"] for r in repo.list_directorio(area="TI", q=f"zeta {sfx}")] == [c["id"]]
        assert repo.list_directorio(area=None, q="100%_nada") == []
        assert [r["email"] for r in repo.list_contactos_activos(q=sfx, area=None, limit=8)] == [c["email"]]
        repo.update_contacto(c["id"], {"activo": False, "telefono": "8888"})
        assert repo.list_contactos_activos(q=sfx, area="TI", limit=None) == []

        for cod in (principal, m1, m2):
            u.connection.cursor().execute(
                "INSERT INTO tbl_vendedores (cod, nombre) VALUES (%s, %s)", (cod, f"Vend {cod}")
            )
        assert repo.get_grupo(principal) is None
        repo.upsert_grupo(principal, f"Ruta {sfx}", None)
        repo.activar_miembros(principal, [m1, m2])
        repo.desactivar_miembros(principal, [m1])
        repo.activar_miembros(principal, [m2])
        miembros = {m["vendedor_cod"]: m["activo"] for m in repo.list_miembros(principal)}
        assert miembros == {m1: False, m2: True}
        assert any(m["principal_cod"] == principal for m in repo.list_miembros())
        assert repo.ruta_activa_de_principal(principal) == f"Ruta {sfx}"
        repo.update_grupo(principal, {"activo": False, "rol_funcional": "Ruta"})
        assert repo.get_grupo(principal)["activo"] is False
        repo.upsert_grupo(principal, f"Ruta {sfx} B", "Mixta")
        grupo = next(g for g in repo.list_grupos() if g["principal_cod"] == principal)
        assert grupo["activo"] is True and grupo["rol_funcional"] == "Mixta"
        u.commit()


def test_config_ventas_log_y_feed(uow, make_usuario):
    _, usuario_id = make_usuario("COORDINADOR")
    clave = f"sla_it_{_sfx()}"
    with uow() as u:
        repo = u.configuracion
        assert repo.upsert_config({clave: "24"})[0]["valor"] == "24"
        repo.upsert_config({clave: "48"})
        assert repo.get_config_valor(clave) == "48"
        assert repo.get_config_valor("no_existe_x") is None
        assert [r["clave"] for r in repo.list_config(claves=(clave,))] == [clave]
        assert any(r["clave"] == clave for r in repo.list_config(prefijo="sla_"))
        assert any(r["clave"] == clave for r in repo.list_config())

        repo.upsert_venta_mensual(2021, 1, 1000.5, None)
        fila = repo.upsert_venta_mensual(2021, 1, 2000, 5000)
        assert float(fila["total_ventas_sin_iva"]) == 2000 and float(fila["cartera_total_mes"]) == 5000
        assert float(repo.get_venta_mensual(2021, 1)["total_ventas_sin_iva"]) == 2000
        assert repo.get_venta_mensual(2020, 1) is None
        assert any(r["anio"] == 2021 for r in repo.list_ventas_mensuales(500))

        tabla = f"it_{_sfx()}"
        repo.insert_audit_log(
            tabla=tabla,
            accion="UPDATE",
            descripcion="IT",
            realizado_por="it@cofersa.cr",
            valor_anterior={"fecha": datetime.now(UTC), "monto": 1},
            valor_nuevo={"id": uuid4()},
        )
        with pytest.raises(Exception):  # noqa: B017 - realizado_por NOT NULL viola la restricción
            repo.insert_audit_log(tabla=tabla, accion="X", descripcion="", realizado_por=None)
        assert repo.get_config_valor(clave) == "48"  # el savepoint dejó viva la transacción
        rows, total = repo.list_audit_log(
            tabla=tabla,
            desde=datetime.now(UTC) - timedelta(days=1),
            hasta=datetime.now(UTC) + timedelta(days=1),
            limit=50,
            offset=0,
        )
        assert total == 1 and rows[0]["descripcion"] == "IT"
        assert repo.list_audit_log(tabla=tabla, desde=None, hasta=None, limit=None, offset=1) == ([], 1)

        notif = (
            u.connection.cursor()
            .execute(
                "INSERT INTO tbl_notificaciones (usuario_id, tipo, titulo) VALUES (%s, 'SYNC', 'Sync IT') "
                "RETURNING id",
                (usuario_id,),
            )
            .fetchone()["id"]
        )
        desde = datetime.now(UTC) - timedelta(days=1)
        feed = repo.list_automatizaciones_feed(
            desde=desde, regla_id="sync_salud", limit=100, con_usuario=True
        )
        evento = next(e for e in feed if e["id"] == notif)
        assert evento["usuario"]["id"] == usuario_id and evento["regla_id"] == "sync_salud"
        sin_usuario = repo.list_automatizaciones_feed(desde=desde, regla_id=None, limit=5, con_usuario=False)
        assert "usuario" not in sin_usuario[0]
        assert repo.automatizaciones_resumen().get("sync_salud", 0) >= 1
        repo.marcar_notificacion_leida(notif)
        leida = (
            u.connection.cursor()
            .execute("SELECT leida FROM tbl_notificaciones WHERE id = %s", (notif,))
            .fetchone()["leida"]
        )
        assert leida is True
        u.commit()
