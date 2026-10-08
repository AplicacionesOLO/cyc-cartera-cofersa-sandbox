"""Repository del Presupuesto de Cobro contra el esquema Aurora generado (funciones fn_* reales)."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration


def test_presupuesto_ciclo_completo(uow):
    cod = f"V{uuid4().hex[:6]}"
    with uow() as u:
        with u.connection.cursor() as cur:
            cur.execute(
                "INSERT INTO tbl_vendedores (cod, nombre, email, activo) VALUES (%s, 'Vend IT', %s, true)",
                (cod, f"{cod.lower()}@cofersa.cr"),
            )
            # fn_presupuesto_calc agrupa por COALESCE(maestro.vendedor_cod, '—') y presupuesto_cobro tiene
            # FK a vendedores: con datos de otros tests en la misma base, registrar esos códigos.
            cur.execute(
                "INSERT INTO tbl_vendedores (cod, nombre, activo) "
                "SELECT DISTINCT COALESCE(NULLIF(vendedor_cod, ''), '—'), 'Vend IT', true "
                "FROM tbl_maestro_clientes ON CONFLICT (cod) DO NOTHING"
            )
            cur.execute(
                "INSERT INTO tbl_vendedores (cod, nombre, activo) VALUES ('—', 'Sin vendedor', true) "
                "ON CONFLICT (cod) DO NOTHING"
            )
        u.commit()
    with uow() as u:
        repo = u.presupuesto
        assert repo.presupuesto_congelado(2031, 1) == {"congelado": False}
        assert isinstance(repo.presupuesto_estimado(2031, 1), dict)
        assert repo.congelar(2031, 1, "it@cofersa.cr")["ok"] is True
        assert repo.ajustar_meta(2031, 1, cod, 1000, "it@cofersa.cr") == {"ok": True}
        assert repo.reasignar_cliente(2031, 1, "C-IT", cod, "it@cofersa.cr") == {"ok": True}
        assert any(v["cod"] == cod for v in repo.vendedores_activos())
        directorio = repo.directorio_envio()
        assert set(directorio) == {"vendedores", "supervisores", "grupos", "miembros"}
        assert any(v["cod"] == cod for v in directorio["vendedores"])
        assert repo.ppto_cartera_total(2031, 1) == Decimal(0)
        assert repo.clientes_sin_pago(2031, 1) == []
        assert repo.meta_analista_mes("nadie@cofersa.cr", 2031, 1) == Decimal(0)


def test_recuperacion_y_proyeccion(uow):
    with uow() as u:
        repo = u.presupuesto
        assert "kpis" in repo.recuperacion(2031, 2)
        assert "semanas" in repo.proyeccion(8, 1)
        mom = repo.recuperacion_mom(3, None)
        assert isinstance(mom, list) and len(mom) == 3
        assert isinstance(repo.recuperacion_mom(2, "nadie@cofersa.cr"), list)
        assert repo.recuperacion_periodo(date(2031, 2, 1), date(2031, 2, 28), None, "analista") is not None
        assert (
            repo.recuperacion_periodo(date(2031, 2, 1), date(2031, 2, 28), "x@cofersa.cr", "vendedor")
            is not None
        )
        assert repo.recuperacion_tramos(date(2031, 2, 1), date(2031, 2, 28), None, "vendedor") is not None
