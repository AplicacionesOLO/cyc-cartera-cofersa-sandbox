"""Repository de Análisis de Pagos / Pagos Aplicados contra el esquema Aurora generado."""

from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration


def test_funciones_de_analisis(uow):
    with uow() as u:
        repo = u.analisis_pagos
        ranking = repo.ranking_clientes(
            email=None,
            meses=9,
            offset=0,
            limit=25,
            clasificacion=None,
            dimension=None,
            vendedor_cod=None,
            busqueda=None,
            orden="icp_asc",
        )
        assert ranking is not None
        assert repo.perfil_vendedor("nadie@cofersa.cr", 9, "icp_asc") is not None
        assert repo.alertas_deterioro(None) is not None
        assert repo.concentracion() is not None
        resumen = repo.pagos_mes_resumen(2031, 3)
        assert resumen["kpis"]["n_recibos"] == 0


def test_anulados_duplicados_y_auditoria(uow):
    r1, r2 = f"R-IT-{uuid4().hex[:8]}", f"R-IT-{uuid4().hex[:8]}"
    with uow() as u:
        repo = u.analisis_pagos
        repo.marcar_anulados([r1, r2], "motivo IT", None, "it@cofersa.cr")
        repo.marcar_anulados([r1], "motivo 2", "R-REEMPLAZO", "it2@cofersa.cr")
        repo.descartar_duplicado(r2, "nota", "it@cofersa.cr")
        repo.descartar_duplicado(r2, None, "it2@cofersa.cr")
        repo.registrar_auditoria(
            tabla="pagos_anulados",
            accion="INSERT",
            descripcion=f"IT {r1}",
            valor_nuevo={"no_recibos": [r1]},
            realizado_por="it@cofersa.cr",
        )
        u.commit()
    with uow() as u:
        with u.connection.cursor() as cur:
            cur.execute("SELECT motivo, recibo_reemplazo FROM tbl_pagos_anulados WHERE no_recibo = %s", (r1,))
            assert cur.fetchone() == {"motivo": "motivo 2", "recibo_reemplazo": "R-REEMPLAZO"}
            cur.execute("SELECT nota FROM tbl_pagos_duplicado_descartado WHERE no_recibo = %s", (r2,))
            assert cur.fetchone() == {"nota": None}
            cur.execute("SELECT valor_nuevo FROM tbl_config_audit_log WHERE descripcion = %s", (f"IT {r1}",))
            assert cur.fetchone()["valor_nuevo"] == {"no_recibos": [r1]}
        u.analisis_pagos.desmarcar_anulado(r1)
        u.analisis_pagos.desmarcar_anulado(r2)
        u.analisis_pagos.revertir_descarte_duplicado(r2)
        u.commit()
    with uow() as u:
        with u.connection.cursor() as cur:
            cur.execute("SELECT count(*) AS n FROM tbl_pagos_anulados WHERE no_recibo IN (%s, %s)", (r1, r2))
            assert cur.fetchone()["n"] == 0
            cur.execute(
                "SELECT count(*) AS n FROM tbl_pagos_duplicado_descartado WHERE no_recibo = %s", (r2,)
            )
            assert cur.fetchone()["n"] == 0
