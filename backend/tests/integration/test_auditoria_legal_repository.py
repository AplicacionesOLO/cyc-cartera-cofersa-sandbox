from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration


def _garantia(usuario_id, contribuyente, **extra):
    return {
        "contribuyente": contribuyente,
        "cliente_nombre": "CLIENTE IT S.A.",
        "tipo_titulo": "Pagaré",
        "monto_garantizado": 1000,
        "tiene_fiador": False,
        "fiador_nombre": None,
        "fiador_cedula": None,
        "fiador_telefono": None,
        "representante_legal": "REP",
        "fecha_emision": "2026-01-01",
        "fecha_vencimiento": "2027-01-01",
        "ubicacion_archivero": "Archivero 1 · Gaveta A · Carpeta 01",
        "ubicacion_archivero_mueble": "ARCHIVERO_1",
        "ubicacion_archivero_gaveta": "GAVETA_A",
        "ubicacion_archivero_carpeta": 1,
        "estado_custodia": "EN_BOVEDA",
        "origen_registro": "EMITIDO_SISTEMA",
        "activo": True,
        "registrado_por": usuario_id,
        "analista_email": "it@cofersa.cr",
        "vendedor_cod": "VIT1",
        **extra,
    }


def test_garantias_flujo_completo(uow, make_usuario):
    email, usuario_id = make_usuario("COORDINADOR")
    contribuyente = f"3{uuid4().int % 10**9:09d}"
    with uow() as u:
        repo = u.auditoria_legal
        with u.connection.cursor() as cur:
            cur.execute(
                "INSERT INTO tbl_supervisores (cod, nombre, email) VALUES ('SIT1', 'Sup', 's@it.cr') "
                "ON CONFLICT DO NOTHING"
            )
            cur.execute(
                "INSERT INTO tbl_vendedores (cod, nombre, email, supervisor_cod) VALUES ('VIT1', 'Vend IT', "
                "'v@it.cr', 'SIT1') ON CONFLICT DO NOTHING"
            )
            cur.execute(
                "INSERT INTO tbl_config_sistema (clave, valor) "
                "VALUES ('PAGARE_LUGAR_EMISION_DEFAULT', 'San José') "
                "ON CONFLICT DO NOTHING"
            )
        consecutivo = repo.siguiente_consecutivo()
        assert consecutivo.startswith("PAG-")
        gid = repo.insertar_garantia({**_garantia(usuario_id, contribuyente), "consecutivo": consecutivo})
        assert repo.garantia_activa(contribuyente)["id"] == gid
        assert any(f["id"] == gid for f in repo.lista_garantias(None))
        assert repo.lista_garantias("nadie@x.cr") == []
        assert isinstance(repo.clientes_sin_garantia(None), list)
        assert any(v["cod"] == "VIT1" for v in repo.vendedores_activos())
        assert repo.vendedor("VIT1")["supervisor_cod"] == "SIT1"
        assert repo.email_supervisor("SIT1") == "s@it.cr"
        assert isinstance(repo.buscar_contribuyentes("zz-it"), list)
        assert repo.saldo_contribuyente(contribuyente)["saldo_actual"] == 0
        assert repo.vendedores_por_contribuyente(contribuyente) == []
        assert repo.resolver_responsables(contribuyente)["hay_conflicto_analista"] is False
        assert repo.config_valores(("PAGARE_LUGAR_EMISION_DEFAULT",))["PAGARE_LUGAR_EMISION_DEFAULT"]
        assert repo.contar_en_carpeta("ARCHIVERO_1", "GAVETA_A", 1, None) >= 1
        assert repo.contar_en_carpeta("ARCHIVERO_1", "GAVETA_A", 1, gid) >= 0
        assert repo.siguiente_carpeta("ARCHIVERO_2", "GAVETA_D", 3) == 3

        repo.registrar_evento(gid, "APERTURA_EXPEDIENTE", usuario_id, "nota")
        eventos = repo.eventos(gid)
        assert eventos[0]["usuarios"] == {"nombre": "Usuario IT"}

        assert repo.actualizar_garantia(gid, {"monto_garantizado": 2000}, sin_pagare=True)
        assert repo.actualizar_custodia(gid, "EN_BOVEDA", {"estado_custodia": "ENVIADO_VENDEDOR"})
        assert not repo.actualizar_custodia(gid, "EN_BOVEDA", {"estado_custodia": "EN_FIRMA"})
        repo.set_documento(gid, f"{gid}_1.pdf")
        assert repo.generar_pagare(
            gid,
            {
                "tasa_interes_moratorio": 2,
                "lugar_emision": "SJ",
                "documento_pagare_generado_en": datetime.now(UTC),
            },
        )
        assert not repo.generar_pagare(gid, {"lugar_emision": "otra"})
        assert not repo.actualizar_garantia(gid, {"monto_garantizado": 3}, sin_pagare=True)
        assert repo.garantia(gid)["documento_pdf_url"] == f"{gid}_1.pdf"

        repo.desactivar_garantia(gid)
        nueva = repo.insertar_garantia(
            {**_garantia(usuario_id, contribuyente), "consecutivo": repo.siguiente_consecutivo()}
        )
        repo.vincular_reemplazo(gid, nueva)
        assert repo.garantia(gid)["reemplazada_por_id"] == nueva

        repo.upsert_persona_legal({"cedula": contribuyente, "nombre": "X", "telefono": "8888"})
        repo.upsert_persona_legal({"cedula": contribuyente, "nombre": "Y", "estado_civil": "Casado"})
        persona = repo.personas_legales([contribuyente])[0]
        assert persona["nombre"] == "Y" and persona["telefono"] == "8888"

        assert repo.id_coordinador() is not None
        repo.crear_notificacion(usuario_id, "GARANTIA", "t", "m", "/auditoria-legal/garantias")


def test_solicitudes_actualizacion(uow, make_usuario):
    _, usuario_id = make_usuario("ANALISTA")
    contribuyente = f"1{uuid4().int % 10**8:08d}"
    with uow() as u:
        repo = u.auditoria_legal
        datos = {
            "contribuyente": contribuyente,
            "cliente_nombre": "C",
            "tipo_persona": "FISICA",
            "token_hash": uuid4().hex,
            "token_expira_en": datetime.now(UTC) + timedelta(days=7),
            "enviada_por": usuario_id,
            "correo_destino": "a@x.com",
        }
        sid = repo.crear_solicitud(datos)
        assert sid is not None
        assert repo.crear_solicitud({**datos, "token_hash": uuid4().hex}) is None
        assert repo.contar_solicitudes_desde(usuario_id, datetime.now(UTC) - timedelta(hours=1)) == 1
        assert any(s["id"] == sid for s in repo.solicitudes_seguimiento())
        assert repo.solicitud_por_token_hash(datos["token_hash"])["id"] == sid
        cambios = {
            "datos_temporales": {"nombre": "N"},
            "estado": "DATOS_RECIBIDOS",
            "respondida_en": datetime.now(UTC),
        }
        assert repo.cambiar_estado_solicitud(sid, ("ENVIADA",), cambios)
        assert not repo.cambiar_estado_solicitud(sid, ("ENVIADA",), {"estado": "CANCELADA"})
        assert repo.solicitud(sid)["datos_temporales"] == {"nombre": "N"}
