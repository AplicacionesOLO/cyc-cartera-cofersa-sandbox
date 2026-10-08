"""PostgresDashboardRepository contra el esquema Aurora generado."""

from datetime import date, timedelta
from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration


def test_dashboard_repository_all_methods(uow, make_usuario):
    email, usuario_id = make_usuario("ANALISTA")
    cod = f"IT{uuid4().hex[:6]}"
    hoy = date.today()
    sync = f"sync-{uuid4().hex[:6]}"
    with uow() as u:
        with u.connection.cursor() as cur:
            cur.execute(
                "INSERT INTO tbl_maestro_clientes (contribuyente, cliente_cod, cliente_nombre, "
                "analista_email) VALUES (%s, %s, 'Ferretería IT', %s)",
                (f"C-{cod}", cod, email),
            )
            cur.execute(
                "INSERT INTO tbl_cartera (contribuyente, cliente_cod, cliente_nombre, mora_1_30, total, "
                "sync_id, updated_at) VALUES (%s, %s, 'Ferretería IT', 150000, 150000, %s, "
                "now() + interval '1 day')",
                (f"C-{cod}", cod, sync),
            )
            cur.execute(
                "INSERT INTO tbl_gestiones (cliente_cod, analista_email, fecha, tipo, resultado, "
                "proxima_accion, proxima_accion_fecha) "
                "VALUES (%s, %s, %s, 'Llamada', 'No contestó', 'recontactar', %s)",
                (cod, email, hoy, hoy),
            )
            cur.execute(
                "INSERT INTO tbl_promesas (cliente_cod, analista_email, monto, fecha_promesa, estado, "
                "cliente_nombre) VALUES (%s, %s, 5000, %s, 'PENDIENTE', 'Ferretería IT'), "
                "(%s, %s, 700, %s, 'CUMPLIDA', 'Ferretería IT')",
                (cod, email, hoy, cod, email, hoy),
            )
            cur.execute(
                "INSERT INTO tbl_pagos (contribuyente, cliente_cod, no_factura, monto_factura, "
                "fecha_vencimiento, fecha_pago, monto_pago) VALUES (%s, %s, 'F1', 100, %s, %s, 100)",
                (f"C-{cod}", cod, hoy, hoy),
            )
            cur.execute(
                "INSERT INTO tbl_notificaciones (usuario_id, tipo, titulo) VALUES (%s, 'ALERTA', %s)",
                (usuario_id, "Sin gestión ≥ 10 días: Ferretería IT"),
            )
            cur.execute("INSERT INTO tbl_config_sistema (clave, valor) VALUES (%s, '18')", (f"it_{cod}",))
            cur.execute("INSERT INTO tbl_historico_cartera (fecha, cartera_total) VALUES (%s, 1)", (hoy,))
            cur.execute(
                "INSERT INTO tbl_ventas_mensuales (anio, mes, total_ventas_sin_iva) VALUES (2099, 1, 10)"
            )
        u.commit()

    with uow() as u:
        repo = u.dashboard
        assert len(repo.kpis_cartera()) == 1
        assert any(v["anio"] == 2099 for v in repo.ventas_mensuales())
        assert any(a["email"] == email for a in repo.analistas_elegibles())
        conteo = {
            c["analista_email"]: c for c in repo.conteo_gestiones_por_analista(hoy, hoy, hoy.replace(day=1))
        }
        assert conteo[email]["g_hoy"] == 1
        assert repo.recuperacion(hoy.year, hoy.month) is not None
        assert repo.historico_cartera(90)[0]["fecha"] >= hoy
        assert isinstance(repo.pedidos_retenidos(None), dict)
        assert isinstance(repo.pedidos_retenidos(email), dict)
        assert repo.config_valor(f"it_{cod}") == "18" and repo.config_valor("no-existe-it") is None
        assert repo.kpis_analista(email)["total_clientes"] == 1
        assert repo.vendedores_analista(email) is not None
        agenda = repo.agenda_gestiones(email, [hoy, hoy + timedelta(days=1)], 5)
        assert agenda[0]["cliente_nombre"] == "Ferretería IT"
        assert repo.agenda_promesas(email, [hoy], 5)[0]["monto"] == 5000
        assert repo.promesas_pendientes(email, 5)[0]["cliente_cod"] == cod
        assert len(repo.tareas_sugeridas(usuario_id, 5)) == 1
        codigos = repo.clientes_de_analista(email)
        assert codigos == [cod]
        assert repo.ultimo_sync_cartera() == sync
        assert len(repo.cartera_de_clientes(codigos, sync)) == 1
        assert len(repo.cartera_de_clientes(codigos, None)) == 1
        assert repo.gestiones_de_clientes(codigos)[0]["proxima_accion"] == "recontactar"
        assert repo.promesas_pendientes_de_clientes(codigos)[0]["fecha_promesa"] == hoy
        assert repo.monto_promesas_cumplidas(codigos, hoy.replace(day=1)) == 700
        assert isinstance(repo.icp_de_clientes(codigos), dict)
        assert repo.pagos_desde(codigos, hoy - timedelta(days=5))[0]["monto_pago"] == 100
