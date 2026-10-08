"""Repository de Clientes contra el esquema Aurora generado (todas las consultas SQL)."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from domain.entities.clientes import GestionNueva

pytestmark = pytest.mark.integration


def _seed(u, cod, contribuyente, analista_email, comprador_id):
    with u.connection.cursor() as cur:
        cur.execute(
            "INSERT INTO tbl_maestro_clientes (contribuyente, cliente_cod, cliente_nombre, vendedor_nombre, "
            "analista_email, correo, condicion_pago) VALUES (%s, %s, %s, 'Vendedor IT', %s, 'cxp@it.cr', "
            "'30 días')",
            (contribuyente, cod, f"Ferretería IT {cod}", analista_email),
        )
        cur.execute(
            "INSERT INTO tbl_cartera (contribuyente, cliente_cod, cliente_nombre, vendedor_nombre, "
            "no_vencido, mora_1_30, mora_31_60, mora_61_90, mora_91_120, mora_120_plus, total, sync_id, "
            "fecha_corte) "
            "VALUES (%s, %s, %s, 'Vendedor IT', 100, 50, 0, 0, 0, 0, 150, 'it-sync', '2026-10-01')",
            (contribuyente, cod, f"Ferretería IT {cod}"),
        )
        cur.execute(
            "INSERT INTO tbl_facturas (contribuyente, cliente_nombre, documento, fecha_documento, "
            "fecha_vencimiento, monto, saldo, cliente_cod) VALUES "
            "(%s, 'IT', %s, '2026-08-01', '2026-09-01', 150, 150, %s), "
            "(%s, 'IT', %s, '2026-08-01', '2026-09-15', 10, 0, %s)",
            (contribuyente, f"00{cod}654321", cod, contribuyente, f"00{cod}000001", cod),
        )
        cur.execute(
            "INSERT INTO tbl_cuentas_bancarias (banco, moneda, tipo, numero, activo, orden) "
            "VALUES ('BCR IT', 'CRC', 'cuenta', '001-IT', true, 1)"
        )
        cur.execute(
            "INSERT INTO tbl_pedidos_retenidos (id_pedido, codigo_cliente, total_mercaderia, anio_mes, "
            "estado_sic) VALUES (%s, %s, 99, '2026-10', 'Retenido')",
            (f"P-{cod}", cod),
        )
        cur.execute(
            "INSERT INTO tbl_marcas (nombre, comprador_id, activo) VALUES (%s, %s, true)",
            (f"Marca IT {cod}", comprador_id),
        )


def test_clientes_repository_lecturas(uow, make_usuario):
    analista_email, analista_id = make_usuario("ANALISTA")
    cod = f"IT{uuid4().hex[:6].upper()}"
    contribuyente = f"31{uuid4().int % 10**8:08d}"
    with uow() as u:
        with u.connection.cursor() as cur:
            cur.execute(
                "INSERT INTO tbl_directorio_empresa (nombre, email) VALUES ('Comprador IT', %s) RETURNING id",
                (f"comp-{cod}@cofersa.cr",),
            )
            comprador_id = cur.fetchone()["id"]
        _seed(u, cod, contribuyente, analista_email, comprador_id)
        u.commit()

    with uow() as u:
        repo = u.clientes
        hoy = datetime.now(UTC).date()
        base = {k: None for k in ("q", "analista", "vendedor", "plazo", "nivel_precio", "dimension")}
        lista = repo.lista({**base, "q": cod, "sort": "mora_total", "dir": "desc"}, 1, 25, hoy)
        assert isinstance(lista, dict) and "rows" in lista and "kpi_cartera" in lista
        todos = repo.lista({**base, "sort": "total", "dir": "asc"}, 1, None, hoy)
        assert isinstance(todos.get("rows"), list)
        assert any(c["cliente_cod"] == cod for c in repo.buscar_clientes(cod.lower(), 6))
        assert repo.buscar_facturas_por_sufijo("654321", 6)
        marcas = repo.buscar_marcas(f"marca it {cod}", 6)
        assert marcas and marcas[0]["comprador_nombre"] == "Comprador IT"
        assert repo.carteras_del_cliente(cod)[0]["total"] == 150
        assert repo.maestro_del_cliente(cod)["analista_email"] == analista_email
        assert repo.maestro_del_cliente("NO-EXISTE") is None
        assert repo.gestiones_del_cliente(cod, 60) == []
        assert repo.promesas_del_cliente(cod) == []
        assert repo.icp_del_cliente(cod) is None
        assert repo.tendencia_pago(cod, 6) == []
        assert [p["id_pedido"] for p in repo.pedidos_retenidos_activos(cod)] == [f"P-{cod}"]
        assert repo.solicitudes_del_cliente(cod, None, 50) == []
        assert repo.solicitudes_del_cliente(cod, analista_id, 50) == []
        assert repo.nombres_usuarios([str(analista_id)]) == {str(analista_id): "Usuario IT"}
        assert repo.contacto_usuario(analista_email.upper())["nombre"] == "Usuario IT"
        assert len(repo.facturas_por_contribuyente(contribuyente, solo_con_saldo=False)) == 2
        con_saldo = repo.facturas_por_contribuyente(contribuyente, solo_con_saldo=True)
        assert [f["saldo"] for f in con_saldo] == [150]
        assert any(c["banco"] == "BCR IT" for c in repo.cuentas_bancarias_activas())


def test_clientes_repository_escrituras(uow, make_usuario):
    analista_email, analista_id = make_usuario("ANALISTA")
    cod = f"IW{uuid4().hex[:6].upper()}"
    with uow() as u:
        with u.connection.cursor() as cur:
            cur.execute(
                "INSERT INTO tbl_maestro_clientes (contribuyente, cliente_cod, cliente_nombre, "
                "analista_email, telefono) VALUES ('3109', %s, 'Cliente W', %s, '22223333')",
                (cod, analista_email),
            )
        u.commit()
    hoy = datetime.now(UTC).date()
    with uow() as u:
        repo = u.clientes
        repo.actualizar_contacto(
            cod, {"nombre_cxp": "Ana", "telefono": None, "telefono2": "88887777", "correo": ""}
        )
        repo.actualizar_logistica(
            cod,
            {
                "dia_visita": ["Lunes", "Jueves"],
                "dia_pago": None,
                "metodo_pago": [],
                "observaciones_logistica": "Portón azul",
                "persona_recibe": None,
                "actualizar_horario": True,
                "hora_recibo_inicio": "08:00",
                "hora_recibo_fin": None,
            },
        )
        assert repo.actualizar_estado_manual(cod, "Bloqueado") is True
        assert repo.actualizar_estado_manual("NO-EXISTE", "Bloqueado") is False
        repo.registrar_gestion(
            GestionNueva(
                cliente_cod=cod,
                analista_email=analista_email,
                fecha=hoy,
                hora="10:00:00",
                tipo="CORREO",
                resultado="Email enviado",
                nota="IT",
                contribuyente="3109",
            )
        )
        repo.registrar_gestion(
            GestionNueva(
                cliente_cod=cod,
                analista_email=analista_email,
                fecha=hoy,
                hora="10:01:00",
                tipo="SISTEMA",
                resultado="Cambio de estado",
                nota="IT",
                activo=True,
            )
        )
        repo.crear_notificacion(analista_id, "ALERTA", "Titulo IT", "Mensaje IT", f"/clientes/{cod}")
        u.commit()
    with uow() as u:
        repo = u.clientes
        m = repo.maestro_del_cliente(cod)
        assert (m["nombre_cxp"], m["telefono"], m["telefono2"], m["correo"]) == (
            "Ana",
            "22223333",
            "88887777",
            "",
        )
        assert m["dia_visita"] == ["Lunes", "Jueves"] and m["metodo_pago"] == []
        assert str(m["hora_recibo_inicio"]).startswith("08:00") and m["hora_recibo_fin"] is None
        assert m["estado_manual"] == "Bloqueado"
        assert len(repo.gestiones_del_cliente(cod, 60)) == 2
        assert repo.contar_correos_desde(analista_email, datetime.now(UTC) - timedelta(hours=1)) == 1
        with u.connection.cursor() as cur:
            cur.execute("SELECT count(*) AS n FROM tbl_notificaciones WHERE usuario_id = %s", (analista_id,))
            assert cur.fetchone()["n"] == 1
