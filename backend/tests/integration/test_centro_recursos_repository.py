"""Centro de Recursos contra el esquema Aurora generado."""

from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration


def test_centro_recursos_repository(uow):
    with uow() as u:
        with u.connection.cursor() as cur:
            cur.execute(
                "INSERT INTO tbl_directorio_empresa (nombre, email, es_comprador) "
                "VALUES ('Compras IT', 'compras-it@cofersa.cr', true) RETURNING id"
            )
            comprador_id = cur.fetchone()["id"]
        repo = u.centro_recursos
        app = repo.crear_aplicacion(
            {
                "nombre": "App IT",
                "descripcion": None,
                "url": "https://it",
                "icono": "Layers",
                "estado": "Operativa",
                "creado_por": "it@cofersa.cr",
            }
        )
        assert repo.find_aplicacion(app["id"])["nombre"] == "App IT"
        updated = repo.actualizar_aplicacion(app["id"], {"orden": 7, "descripcion": "d"})
        assert updated["orden"] == 7 and updated["descripcion"] == "d"
        assert any(a["id"] == app["id"] for a in repo.list_aplicaciones_activas())
        doc = repo.crear_documento(
            {
                "titulo": "Doc IT",
                "descripcion": None,
                "categoria": "Formas de Pago",
                "tipo_archivo": "pdf",
                "url": "1700_doc.pdf",
                "subido_por": "it@cofersa.cr",
            }
        )
        assert any(d["id"] == doc["id"] for d in repo.list_documentos())
        marca = repo.crear_marca(
            {"nombre": "Marca IT", "proveedor": None, "comprador_id": comprador_id, "notas": None}
        )
        assert repo.find_marca(marca["id"])["comprador_id"] == comprador_id
        assert repo.actualizar_marca(marca["id"], {"nombre": "Marca IT 2"})["nombre"] == "Marca IT 2"
        assert repo.find_marca(uuid4()) is None
        repo.registrar_auditoria(
            tabla="marcas",
            accion="UPDATE",
            descripcion="it",
            realizado_por="it@cofersa.cr",
            valor_anterior={"id": marca["id"], "created_at": marca["created_at"]},
            valor_nuevo={"comprador_id": comprador_id},
        )
        # un fallo de auditoría (NOT NULL) no aborta la transacción
        repo.registrar_auditoria(tabla="marcas", accion="X", descripcion="x", realizado_por=None)
        pagina = repo.datos_pagina()
        assert set(pagina) == {
            "vendedores",
            "supervisores",
            "usuarios",
            "documentos",
            "aplicaciones",
            "grupos",
            "miembros",
            "directorio",
            "marcas",
        }
        assert any(m["id"] == marca["id"] for m in pagina["marcas"])
        assert any(d["id"] == comprador_id for d in pagina["directorio"])
        u.commit()
    with uow() as u:
        with u.connection.cursor() as cur:
            cur.execute("SELECT count(*) AS n FROM tbl_config_audit_log WHERE descripcion = 'it'")
            assert cur.fetchone()["n"] >= 1
