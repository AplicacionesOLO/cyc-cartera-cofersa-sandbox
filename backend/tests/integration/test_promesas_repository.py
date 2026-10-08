"""Repository de promesas contra el esquema Aurora generado."""

from datetime import date
from uuid import uuid4

import pytest

from domain.entities.gestiones import NuevaGestion
from domain.entities.promesas import NuevaPromesa, evento

pytestmark = pytest.mark.integration


def test_promesas_repository_all_methods(uow, make_usuario):
    email, _ = make_usuario("ANALISTA")
    cod = f"IP{uuid4().hex[:6]}"
    with uow() as u:
        gid = u.gestiones.insert_gestion(
            NuevaGestion(
                cliente_cod=cod,
                contribuyente=None,
                analista_email=email,
                fecha=date(2026, 9, 1),
                hora="08:00",
                tipo="LLAMADA",
                resultado="Promesa OK",
                nota="n",
                promesa_fecha=date(2026, 9, 30),
                promesa_monto=500.5,
            )
        )
        repo = u.promesas
        base = dict(cliente_cod=cod, cliente_nombre=None, contribuyente=None, analista_email=email, notas="n")
        p1 = repo.insert(
            NuevaPromesa(
                **base,
                fecha_creacion=date(2026, 9, 1),
                fecha_promesa=date(2026, 9, 30),
                monto=500.5,
                gestion_id=gid,
            )
        )
        p2 = repo.insert(
            NuevaPromesa(
                **base,
                fecha_creacion=date(2026, 9, 1),
                fecha_promesa=date(2026, 9, 10),
                monto=100,
                reprogramada_de_id=p1,
            )
        )
        u.commit()

    with uow() as u:
        repo = u.promesas
        assert repo.existe_pendiente(cod, 500.5, date(2026, 9, 30))
        assert not repo.existe_pendiente(cod, 500.0, date(2026, 9, 30))
        assert [r["id"] for r in repo.list_activas(email, 800)] == [p2, p1]
        assert len(repo.list_activas(None, 1)) == 1
        origen = repo.gestiones_origen([gid, uuid4()])
        assert [g["id"] for g in origen] == [gid] and origen[0]["resultado"] == "Promesa OK"
        row = repo.get_for_update(p1)
        assert row["eventos"] == [] and row["gestion_id"] == gid
        assert repo.get_for_update(uuid4()) is None
        repo.update(
            p1,
            {
                "estado": "ABONO_PARCIAL",
                "fecha_validacion": date(2026, 9, 15),
                "validado_por": email,
                "comentario_validacion": "parcial",
                "monto_abono_parcial": 100.25,
                "eventos": [evento(date(2026, 9, 15), "abono", "a", email)],
            },
        )
        repo.update(p2, {"activo": False})
        repo.update(p2, {})
        u.commit()

    with uow() as u:
        repo = u.promesas
        (row,) = repo.list_activas(email, 800)
        assert row["estado"] == "ABONO_PARCIAL" and float(row["monto_abono_parcial"]) == 100.25
        assert row["eventos"][0]["tipo"] == "abono"
        assert not repo.existe_pendiente(cod, 500.5, date(2026, 9, 30))
