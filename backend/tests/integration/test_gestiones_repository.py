"""Repository de gestiones (y notas rápidas) contra el esquema Aurora generado."""

from datetime import date
from uuid import uuid4

import pytest

from domain.entities.gestiones import NuevaGestion
from domain.entities.promesas import NuevaPromesa, evento

pytestmark = pytest.mark.integration


def test_gestiones_repository_all_methods(uow, make_usuario):
    email, usuario_id = make_usuario("ANALISTA")
    cod = f"IT{uuid4().hex[:6]}"
    contrib = f"CT{uuid4().hex[:6]}"
    with uow() as u:
        with u.connection.cursor() as cur:
            cur.execute(
                "INSERT INTO tbl_maestro_clientes (contribuyente, cliente_cod, cliente_nombre) "
                "VALUES (%s, %s, 'Cliente IT'), (%s, %s, 'Hermano IT')",
                (contrib, cod, contrib, cod + "B"),
            )
            cur.execute(
                "INSERT INTO tbl_cartera (contribuyente, cliente_cod, cliente_nombre) VALUES (%s, %s, 'C')",
                (contrib, cod),
            )
        repo = u.gestiones
        gid = repo.insert_gestion(
            NuevaGestion(
                cliente_cod=cod,
                contribuyente=contrib,
                analista_email=email,
                fecha=date(2026, 9, 15),
                hora="09:00:00",
                tipo="LLAMADA",
                resultado="Compromiso de pago confirmado",
                nota="nota",
                proxima_accion="esperar_pago",
                proxima_accion_fecha=date(2026, 9, 20),
                metadata={"compromiso_monto": 1000},
            )
        )
        pid = u.promesas.insert(
            NuevaPromesa(
                cliente_cod=cod,
                cliente_nombre=repo.nombre_cliente(cod),
                contribuyente=contrib,
                analista_email=email,
                fecha_creacion=date(2026, 9, 15),
                fecha_promesa=date(2026, 9, 30),
                monto=1000,
                notas="nota",
                gestion_id=gid,
                eventos=[evento(date(2026, 9, 15), "creada", "c", email)],
            )
        )
        repo.vincular_promesa(gid, pid)
        with u.connection.cursor() as cur:
            cur.execute(
                "INSERT INTO tbl_solicitudes (tipo, justificacion, gestion_id) "
                "VALUES ('NOTA_CREDITO', 'j', %s)",
                (gid,),
            )
        u.commit()

    with uow() as u:
        repo = u.gestiones
        rows = repo.list_gestiones(email, 0, 10)
        assert [r["id"] for r in rows] == [gid]
        assert rows[0]["promesa_id"] == pid and rows[0]["metadata"] == {"compromiso_monto": 1000}
        assert rows[0]["promesa_monto"] == 0
        assert len(repo.list_gestiones(None, 0, 1)) == 1
        ref = repo.referencias(email)
        assert ref["promesa_estados"] == {str(pid): "PENDIENTE"}
        assert ref["nombres_cliente"] == {cod: "Cliente IT"}
        assert ref["cods_con_cartera"] == [cod]
        assert ref["solicitudes"] == [{"gestion_id": gid, "estado": "PENDIENTE"}]
        assert repo.referencias(None)["nombres_cliente"][cod] == "Cliente IT"
        assert repo.find_analista_email(gid) == email
        assert repo.find_analista_email(uuid4()) is None
        repo.update_gestion(gid, {"nota": "editada", "promesa_fecha": date(2026, 10, 1), "tipo": "CORREO"})
        repo.update_gestion(gid, {})
        repo.desactivar_gestion(gid)
        assert repo.codigos_contribuyente(contrib, cod) == [
            {"cliente_cod": cod + "B", "cliente_nombre": "Hermano IT"}
        ]
        assert len(repo.codigos_contribuyente(contrib, None)) == 2
        assert repo.nombre_cliente("NO-EXISTE") is None
        assert repo.get_nota_rapida(usuario_id, date(2026, 9, 15)) is None
        repo.save_nota_rapida(usuario_id, date(2026, 9, 15), "[1]")
        repo.save_nota_rapida(usuario_id, date(2026, 9, 15), "[2]")
        u.commit()

    with uow() as u:
        row = u.gestiones.list_gestiones(email, 0, 10)[0]
        assert row["nota"] == "editada" and row["tipo"] == "CORREO" and row["activo"] is False
        nota = u.gestiones.get_nota_rapida(usuario_id, date(2026, 9, 15))
        assert nota["contenido"] == "[2]" and nota["updated_at"] is not None
