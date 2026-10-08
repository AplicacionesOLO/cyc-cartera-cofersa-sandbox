"""Repository de Reportes contra el esquema Aurora generado (todas las consultas y RPC)."""

from datetime import date
from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration


def _seed(u, email: str, cod: str) -> None:
    with u.connection.cursor() as cur:
        cur.execute(
            "INSERT INTO tbl_vendedores (cod, nombre, zona) VALUES ('VIT', 'Vendedor IT', 'GAM') "
            "ON CONFLICT DO NOTHING"
        )
        cur.execute(
            "INSERT INTO tbl_maestro_clientes (contribuyente, cliente_cod, cliente_nombre, vendedor_cod, "
            "vendedor_nombre, analista_email, dimension, agrupacion, asignacion_manual) "
            "VALUES (%s, %s, 'Cliente IT', 'VIT', 'Vendedor IT', %s, 'DIM-IT', 'AGR-IT', true)",
            (f"CT-{cod}", cod, email),
        )
        cur.execute(
            "INSERT INTO tbl_cartera (contribuyente, cliente_cod, cliente_nombre, vendedor_nombre, "
            "no_vencido, mora_1_30, mora_120_plus, total, sync_id, fecha_corte) "
            "VALUES (%s, %s, 'Cliente IT', 'Vendedor IT', 100, 50, 25, 175, 'sync-it', '2026-09-30')",
            (f"CT-{cod}", cod),
        )
        cur.execute(
            "INSERT INTO tbl_gestiones (cliente_cod, analista_email, fecha, hora, tipo, resultado) "
            "VALUES (%s, %s, '2026-09-15', '09:00', 'Llamada', 'Promesa OK')",
            (cod, email),
        )


def test_reportes_repository(uow, make_usuario):
    email, _ = make_usuario("ANALISTA")
    cod = f"IT{uuid4().hex[:6]}"
    with uow() as u:
        _seed(u, email, cod)
        u.commit()

    with uow() as u:
        r = u.reportes
        assert r.aging() is not None
        r.cei(2026, 9)
        assert r.snapshot_cierre_cartera(2026, 9, True, "IT")["ok"] is True
        assert r.efectividad(date(2026, 9, 1), date(2026, 9, 30), None) is not None
        r.perfil_vendedor(6, "icp_asc")
        r.migracion_mora(2026, 9, None, None)
        assert isinstance(r.supervisores(), list)
        assert isinstance(r.vendedores_activos(), list)
        r.mora_vendedor(email)
        assert r.snapshot_bloqueados_semana() >= 0
        r.bloqueados(None)
        r.plazo_especial(email)
        assert isinstance(r.portafolio_destinatarios(), dict)
        assert "DIM-IT" in r.dimension_opciones("dimension")
        assert "AGR-IT" in r.dimension_opciones("agrupacion")

        assert isinstance(r.kpis_cartera(), list)
        assert isinstance(r.ventas_mensuales(), list)
        r.concentracion()
        r.recuperacion_mom(13, None)
        assert isinstance(r.historico_cartera(90), list)

        assert isinstance(r.cierre_meses(), list)
        assert isinstance(r.vendedores_zona(), list)
        assert isinstance(r.portafolio_grupos_activos(), list)
        assert isinstance(r.portafolio_miembros_activos(), list)
        assert any(m["cliente_cod"] == cod for m in r.maestro_clientes_resumen())
        r.recuperacion(2026, 9)
        assert isinstance(r.cierre_riesgo_vendedor(2026, 9), list)
        assert isinstance(r.cierre_mora(2026, 9, 2026, 8), list)
        assert isinstance(
            r.cierre_icp(date(2026, 7, 1), date(2026, 9, 30), date(2026, 4, 1), date(2026, 6, 30)), list
        )

        assert isinstance(r.estados_cuenta(email), list)
        vend = r.vendedores_de_clientes([cod])
        assert vend == [{"cliente_cod": cod, "vendedor_cod": "VIT", "vendedor_nombre": "Vendedor IT"}]
        vencida = r.cartera_vencida(email)
        assert len(vencida) == 1 and vencida[0]["ultima_gestion"] == date(2026, 9, 15)
        gestiones = r.gestiones_periodo(email, date(2026, 9, 1), date(2026, 9, 30))
        assert len(gestiones) == 1 and gestiones[0]["resultado"] == "Promesa OK"
        assert r.gestiones_periodo(email, date(2026, 8, 1), date(2026, 8, 31)) == []
