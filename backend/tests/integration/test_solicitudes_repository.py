"""Repository de Solicitudes contra el esquema Aurora generado."""

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration


def _seed_cliente(u, cod: str, contribuyente: str, analista_email: str) -> None:
    with u.connection.cursor() as cur:
        cur.execute(
            "INSERT INTO tbl_cartera (contribuyente, cliente_cod, cliente_nombre, vendedor_nombre, "
            "mora_1_30, total) VALUES (%s, %s, %s, 'Vendedor IT', 100, 500)",
            (contribuyente, cod, f"Cliente {cod}"),
        )
        cur.execute(
            "INSERT INTO tbl_maestro_clientes (contribuyente, cliente_cod, cliente_nombre, analista_email, "
            "limite_credito, condicion_pago) VALUES (%s, %s, %s, %s, 1000, '30')",
            (contribuyente, cod, f"Cliente {cod}", analista_email),
        )
        cur.execute(
            "INSERT INTO tbl_facturas (contribuyente, documento, monto, saldo) VALUES "
            "(%s, 'F-1', 100, 50), (%s, 'F-2', 100, 0), (%s, 'F-3', 100, 90)",
            (contribuyente, contribuyente, contribuyente),
        )


def test_solicitudes_repository_flujo_completo(uow, make_usuario):
    coord_email, coord_id = make_usuario("COORDINADOR")
    ana_email, ana_id = make_usuario("ANALISTA", nombre="Analista IT")
    cod = f"IT{uuid4().hex[:6]}"
    contribuyente = f"3-{uuid4().hex[:8]}"

    with uow() as u:
        _seed_cliente(u, cod, contribuyente, ana_email)
        with u.connection.cursor() as cur:
            cur.execute(
                "INSERT INTO tbl_gestiones (cliente_cod, analista_email, tipo, resultado, nota) "
                "VALUES (%s, %s, 'Llamada', 'Promesa OK', 'nota IT') RETURNING id",
                (cod, ana_email),
            )
            gestion_id = cur.fetchone()["id"]
        repo = u.solicitudes
        catalogo = repo.insert_solicitud(
            {
                "tipo": "Aumento de límite",
                "area": "credito_cobro",
                "cliente_cod": cod,
                "cliente_nombre": "Cliente IT",
                "solicitante_id": ana_id,
                "gestion_id": gestion_id,
                "justificacion": "desc",
                "descripcion": "desc",
                "prioridad": "Alta",
                "sla_horas": 24,
                "sla_vencimiento": datetime.now(UTC) + timedelta(hours=24),
                "datos": {"facturas": ["F-1"], "adjuntos": [{"name": "a.pdf", "path": f"{cod}/a.pdf"}]},
                "estado": "Pendiente",
            }
        )
        legacy = repo.insert_solicitud(
            {
                "tipo": "aumento_limite",
                "destinatario": "coordinador",
                "cliente_cod": cod,
                "cliente_nombre": "Cliente IT",
                "solicitante_id": coord_id,
                "justificacion": "just",
                "cc_emails": ["a@cofersa.cr", "b@cofersa.cr"],
                "monto_actual": 1000,
                "monto_solicitado": 5000.5,
                "fecha_limite": date(2026, 12, 31),
                "estado": "PENDIENTE",
            }
        )
        assert legacy["numero_consecutivo"] > catalogo["numero_consecutivo"]
        repo.insert_historial(catalogo["id"], None, "Pendiente", ana_id, "Solicitud creada")
        repo.insert_historial(catalogo["id"], "Pendiente", "En revisión", coord_id, None)
        com = repo.insert_comentario(catalogo["id"], coord_id, "comentario IT")
        assert com["contenido"] == "comentario IT" and com["created_at"] is not None
        repo.update_estado(catalogo["id"], "En revisión")
        repo.resolver_solicitud(legacy["id"], "APROBADA", "ok", coord_id)
        repo.insert_notificacion(ana_id, "SOLICITUD", "Solicitud aprobada", "Cliente: X. ", "/solicitudes/x")
        u.commit()

    with uow() as u:
        repo = u.solicitudes
        sol = repo.find_solicitud(catalogo["id"])
        assert sol["estado"] == "En revisión" and sol["datos"]["facturas"] == ["F-1"]
        leg = repo.find_solicitud(legacy["id"])
        assert leg["cc_emails"] == ["a@cofersa.cr", "b@cofersa.cr"]
        assert (
            leg["estado"] == "APROBADA"
            and leg["revisor_id"] == coord_id
            and leg["comentario_revisor"] == "ok"
        )
        assert repo.find_solicitud(uuid4()) is None
        propias = repo.list_solicitudes(ana_id)
        assert [s["id"] for s in propias] == [catalogo["id"]]
        assert {catalogo["id"], legacy["id"]} <= {s["id"] for s in repo.list_solicitudes(None)}
        historial = repo.list_historial(catalogo["id"])
        assert [h["estado_nuevo"] for h in historial][0] in ("En revisión", "Pendiente") and len(
            historial
        ) == 2
        assert repo.list_comentarios(catalogo["id"])[0]["usuario_id"] == coord_id
        assert repo.nombres_usuarios([ana_id])[str(ana_id)] == "Analista IT"
        assert repo.nombres_usuarios([]) == {}
        assert repo.nombres_por_email([ana_email]) == {ana_email: "Analista IT"}
        assert repo.nombres_por_email([]) == {}
        assert repo.find_coordinador_id() is not None
        assert repo.existe_usuario_email(coord_email.upper())
        assert not repo.existe_usuario_email("nadie@externo.com")
        gestion = repo.find_gestion(gestion_id)
        assert gestion["resultado"] == "Promesa OK" and gestion["cliente_cod"] == cod
        assert any(c["cliente_cod"] == cod for c in repo.list_cartera_resumen())
        assert [m["cliente_cod"] for m in repo.list_maestro_resumen(ana_email)] == [cod]
        assert any(m["cliente_cod"] == cod for m in repo.list_maestro_resumen(None))
        assert repo.find_cartera(cod)["contribuyente"] == contribuyente
        assert repo.find_maestro(cod)["condicion_pago"] == "30"
        assert repo.find_cartera("NO-EXISTE") is None
        facturas = repo.list_facturas_pendientes(contribuyente)
        assert [f["documento"] for f in facturas] == ["F-3", "F-1"]
        assert len(repo.list_facturas_pendientes(contribuyente, limit=1)) == 1
        with u.connection.cursor() as cur:
            cur.execute("SELECT titulo, leida FROM tbl_notificaciones WHERE usuario_id = %s", (ana_id,))
            notif = cur.fetchone()
        assert notif["titulo"] == "Solicitud aprobada" and notif["leida"] is False
