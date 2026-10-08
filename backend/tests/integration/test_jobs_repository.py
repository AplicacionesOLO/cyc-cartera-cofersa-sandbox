"""PostgresJobsRepository contra el esquema Aurora generado (tareas, sync_log, ingesta)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from domain.entities.jobs import TAREAS_PROGRAMADAS

pytestmark = pytest.mark.integration


def _sufijo() -> str:
    return uuid4().hex[:8]


def test_todas_las_tareas_programadas_corren(uow):
    for tarea in TAREAS_PROGRAMADAS:
        with uow() as u:
            u.jobs.ejecutar_tarea(tarea)
            u.commit()


def test_sync_registra_en_sync_log_y_se_consulta(uow):
    antes = datetime.now(UTC) - timedelta(seconds=5)
    with uow() as u:
        for tipo in ("cartera", "facturas", "saldos_favor", "pedidos_retenidos", "pagos"):
            resultado = u.jobs.ejecutar_sync(tipo, "it@cofersa.cr")
            assert isinstance(resultado, dict) and "error" not in resultado
        u.commit()
    with uow() as u:
        historial = u.jobs.historial_sync(600)
        assert {r["tipo"] for r in historial[:5]} == {
            "cartera",
            "facturas",
            "saldos_favor",
            "pedidos_retenidos",
            "pagos",
        }
        ultimo = u.jobs.ultimo_sync("cartera", antes)
        assert ultimo is not None and ultimo["ejecutado_por"] == "it@cofersa.cr"
        assert u.jobs.ultimo_sync("cartera", datetime.now(UTC) + timedelta(hours=1)) is None
        assert u.jobs.ultimo_sync("cartera", None) is not None


def test_ingesta_pagos_stage_y_fn_sync_pagos(uow):
    recibo = f"R-IT-{_sufijo()}"
    cols = (
        "contribuyente",
        "cliente_cod",
        "nombre_cliente",
        "no_factura",
        "monto_factura",
        "fecha_vencimiento",
        "no_recibo",
        "fecha_pago",
        "monto_pago",
        "dias_atraso",
        "sync_id",
    )
    fila = (
        "3-101-1",
        "C-IT",
        "Cliente IT",
        "F-1",
        "1,500.00",
        "2026-09-01",
        recibo,
        "2026-09-05",
        "1500",
        "4",
        "S1",
    )
    with uow() as u:
        u.jobs.vaciar_tabla("pagos_stage")
        assert u.jobs.insertar_filas("pagos_stage", cols, [fila]) == 1
        resultado = u.jobs.ejecutar_sync("pagos", "it@cofersa.cr")
        assert resultado["insertados"] == 1
        with u.connection.cursor() as cur:
            cur.execute("SELECT monto_pago, dias_atraso FROM tbl_pagos WHERE no_recibo = %s", (recibo,))
            row = cur.fetchone()
            cur.execute("SELECT count(*) AS n FROM tbl_pagos_stage")
            assert cur.fetchone()["n"] == 0
        assert float(row["monto_pago"]) == 1500 and row["dias_atraso"] == 4
        u.commit()


def test_ingesta_pedidos_stage(uow):
    pedido = f"P-IT-{_sufijo()}"
    with uow() as u:
        u.jobs.vaciar_tabla("pedidos_retenidos_stage")
        n = u.jobs.insertar_filas(
            "pedidos_retenidos_stage",
            ("id_pedido", "codigo_cliente", "fecha_pedido", "total_mercaderia", "vendedor"),
            [(pedido, "C-IT", "2026-10-01T10:00:00-06:00", "25000", "V1")],
        )
        assert n == 1
        resultado = u.jobs.ejecutar_sync("pedidos_retenidos", "it@cofersa.cr")
        assert resultado["insertados"] == 1
        u.commit()


def test_ingesta_cartera_reemplazo_upsert_y_purga(uow):
    s = _sufijo()
    cols = ("contribuyente", "cliente_cod", "cliente_nombre", "no_vencido", "mora_1_30", "total", "sync_id")
    with uow() as u:
        u.jobs.vaciar_tabla("cartera")
        assert u.jobs.insertar_filas("cartera", cols, [(f"3-{s}", "C1", "A", 100, 50, 150, "S1")]) == 1
        n = u.jobs.upsert_filas(
            "cartera",
            cols,
            [(f"3-{s}", "C1", "A2", 10, 5, 15, "S2"), (f"3-{s}", "C2", "B", 1, 1, 2, "S2")],
            ("contribuyente", "cliente_cod"),
            tocar_updated_at=True,
        )
        assert n == 2
        assert u.jobs.insertar_filas("cartera", cols, [(f"3-{s}", "C3", "C", 1, 0, 1, "S1")]) == 1
        assert u.jobs.purgar_otros_sync("cartera", "S2") == 1
        with u.connection.cursor() as cur:
            cur.execute(
                "SELECT cliente_cod, cliente_nombre, total FROM tbl_cartera WHERE contribuyente = %s "
                "ORDER BY cliente_cod",
                (f"3-{s}",),
            )
            rows = cur.fetchall()
        assert [(r["cliente_cod"], r["cliente_nombre"], float(r["total"])) for r in rows] == [
            ("C1", "A2", 15.0),
            ("C2", "B", 2.0),
        ]
        u.commit()


def test_ingesta_facturas_upsert_sin_updated_at(uow):
    s = _sufijo()
    cols = ("contribuyente", "documento", "monto", "saldo", "sync_id")
    with uow() as u:
        u.jobs.upsert_filas(
            "facturas",
            cols,
            [(f"3-{s}", "D1", 100, 100, "S1")],
            ("contribuyente", "documento"),
            tocar_updated_at=False,
        )
        u.jobs.upsert_filas(
            "facturas",
            cols,
            [(f"3-{s}", "D1", 100, 40, "S1")],
            ("contribuyente", "documento"),
            tocar_updated_at=False,
        )
        with u.connection.cursor() as cur:
            cur.execute("SELECT saldo FROM tbl_facturas WHERE contribuyente = %s", (f"3-{s}",))
            assert [float(r["saldo"]) for r in cur.fetchall()] == [40.0]
        u.commit()


def test_ingesta_saldos_favor_conserva_estado_manual(uow):
    doc = f"NC-{_sufijo()}"
    cols = ("documento", "cliente_cod", "tipo_documento", "monto", "fecha_documento", "sync_id")
    with uow() as u:
        u.jobs.upsert_filas(
            "saldos_favor",
            cols,
            [(doc, "C1", "NC", 500, "2026-09-01", "S1")],
            ("documento",),
            tocar_updated_at=True,
        )
        with u.connection.cursor() as cur:
            cur.execute("UPDATE tbl_saldos_favor SET estado_manual = 'aplicado' WHERE documento = %s", (doc,))
        u.jobs.upsert_filas(
            "saldos_favor",
            cols,
            [(doc, "C1", "NC", 450, "2026-09-01", "S2")],
            ("documento",),
            tocar_updated_at=True,
        )
        with u.connection.cursor() as cur:
            cur.execute(
                "SELECT monto, estado_manual, sync_id FROM tbl_saldos_favor WHERE documento = %s", (doc,)
            )
            row = cur.fetchone()
        assert float(row["monto"]) == 450 and row["estado_manual"] == "aplicado" and row["sync_id"] == "S2"
        u.commit()


def test_ingesta_maestro_clientes_upsert(uow):
    cod = f"C-{_sufijo()}"
    cols = ("contribuyente", "cliente_cod", "cliente_nombre", "telefono", "limite_credito", "cliente_tramita")
    with uow() as u:
        u.jobs.upsert_filas(
            "maestro_clientes",
            cols,
            [("3-1", cod, "Ferretería", "8888", 1000, "N")],
            ("cliente_cod",),
            tocar_updated_at=True,
        )
        # contacto vacío desde GAS no borra el teléfono (trigger fn_proteger_contacto_manual)
        u.jobs.upsert_filas(
            "maestro_clientes",
            cols,
            [("3-1", cod, "Ferretería 2", "", 2000, "S")],
            ("cliente_cod",),
            tocar_updated_at=True,
        )
        with u.connection.cursor() as cur:
            cur.execute(
                "SELECT cliente_nombre, telefono, limite_credito FROM tbl_maestro_clientes "
                "WHERE cliente_cod = %s",
                (cod,),
            )
            row = cur.fetchone()
        assert row["cliente_nombre"] == "Ferretería 2" and row["telefono"] == "8888"
        assert float(row["limite_credito"]) == 2000
        u.commit()


def test_upsert_solo_clave_hace_nothing_y_lotes_vacios(uow):
    s = _sufijo()
    with uow() as u:
        assert u.jobs.insertar_filas("cartera", ("contribuyente",), []) == 0
        u.jobs.upsert_filas(
            "maestro_clientes", ("cliente_cod",), [], ("cliente_cod",), tocar_updated_at=False
        )
        clave = ("contribuyente", "documento")
        u.jobs.upsert_filas(
            "facturas", clave + ("monto",), [(f"3-{s}", "D1", 5)], clave, tocar_updated_at=False
        )
        n = u.jobs.upsert_filas("facturas", clave, [(f"3-{s}", "D1")], clave, tocar_updated_at=False)
        assert n == 0
        u.commit()
