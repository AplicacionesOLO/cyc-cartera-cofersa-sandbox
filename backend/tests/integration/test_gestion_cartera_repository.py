"""Repository de Gestión de Cartera contra el esquema Aurora generado."""

from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration


def _seed(u, analista_email: str) -> tuple[str, str, object]:
    cod = f"IT{uuid4().hex[:6]}"
    pedido = f"PED-{uuid4().hex[:6]}"
    with u.connection.cursor() as cur:
        cur.execute(
            "INSERT INTO tbl_maestro_clientes (contribuyente, cliente_cod, cliente_nombre, analista_email) "
            "VALUES (%s, %s, 'Cliente IT', %s)",
            (cod, cod, analista_email),
        )
        cur.execute(
            "INSERT INTO tbl_saldos_favor (cliente_cod, cliente_nombre, documento, tipo_documento, "
            "fecha_documento, monto) VALUES (%s, 'Cliente IT', 'NC-1', 'N/C', now(), 1000) RETURNING id",
            (cod,),
        )
        saldo_id = cur.fetchone()["id"]
        cur.execute(
            "INSERT INTO tbl_facturas (contribuyente, cliente_cod, documento, saldo, fecha_vencimiento) "
            "VALUES (%s, %s, 'FA-1', 1000, '2026-09-01')",
            (cod, cod),
        )
        cur.execute(
            "INSERT INTO tbl_pedidos_retenidos (id_pedido, codigo_cliente, anio_mes, total_mercaderia) "
            "VALUES (%s, %s, '2026-10', 500)",
            (pedido, cod),
        )
    return cod, pedido, saldo_id


def test_gestion_cartera_repository(uow, make_usuario):
    email, _ = make_usuario("ANALISTA")
    with uow() as u:
        cod, pedido, saldo_id = _seed(u, email)
        u.commit()

    with uow() as u:
        repo = u.gestion_cartera
        result = repo.pedidos_retenidos(None)
        assert "rows" in result
        assert isinstance(repo.pedidos_retenidos(email), dict)
        row = repo.actualizar_pedido_retenido(
            pedido, {"estado_sic": "Retenido", "motivo_retencion": "Mora", "resuelto_por": email}
        )
        assert row["estado_sic"] == "Retenido" and row["motivo_retencion"] == "Mora"
        assert repo.actualizar_pedido_retenido(pedido, {})["id_pedido"] == pedido
        assert repo.actualizar_pedido_retenido("NO-EXISTE", {"estado_sic": "Aprobado"}) is None

        assert any(s["id"] == saldo_id for s in repo.saldos_favor(email))
        assert isinstance(repo.saldos_favor(None), list)
        assert len(repo.saldos_favor_de_cliente(cod, email)) == 1
        assert repo.saldos_favor_de_cliente(cod, "otro@cofersa.cr") == []
        assert len(repo.saldos_favor_de_cliente(cod, None)) == 1
        assert repo.cliente_de_saldo_favor(saldo_id) == cod
        assert repo.cliente_de_saldo_favor(uuid4()) is None
        assert cod in repo.clientes_de_analista(email)
        matches = repo.matching_saldos_favor(cod)
        assert isinstance(matches, list)
        assert isinstance(repo.matching_saldos_favor(None), list)
        assert repo.marcar_saldo_aplicado(saldo_id, email) is True

        referencia = f"REF-{uuid4().hex[:8]}"
        assert repo.existe_referencia_pago(referencia) is False
        reporte_id = repo.crear_reporte_pago(
            {
                "cliente_cod": cod,
                "contribuyente": "3101",
                "analista_email": email,
                "banco_origen": "BAC",
                "referencia": referencia,
                "monto_transferido": 1000,
                "fecha_transferencia": "2026-10-01",
                "url_comprobante": f"{cod}/1_a.webp",
                "notas": None,
                "estado": "pendiente",
            },
            [{"factura_id": 1, "documento": "FA-1", "monto_aplicado": 1000}],
        )
        assert reporte_id is not None
        assert repo.existe_referencia_pago(referencia) is True
        u.commit()

    with uow() as u:
        with u.connection.cursor() as cur:
            cur.execute("SELECT estado_manual, aplicado_por FROM tbl_saldos_favor WHERE id = %s", (saldo_id,))
            assert cur.fetchone() == {"estado_manual": "aplicado", "aplicado_por": email}
            cur.execute(
                "SELECT count(*) AS n FROM tbl_reporte_pago_detalles WHERE reporte_id = %s", (reporte_id,)
            )
            assert cur.fetchone()["n"] == 1
