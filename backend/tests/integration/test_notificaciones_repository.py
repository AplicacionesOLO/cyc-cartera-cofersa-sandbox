"""Notificaciones y config_sistema contra el esquema Aurora generado."""

from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration


def test_notificaciones_repository(uow, make_usuario):
    _, usuario_id = make_usuario("ANALISTA")
    _, otro_id = make_usuario("ANALISTA")
    with uow() as u:
        with u.connection.cursor() as cur:
            for uid, titulo in ((usuario_id, "a"), (usuario_id, "b"), (otro_id, "ajena")):
                cur.execute(
                    "INSERT INTO tbl_notificaciones (usuario_id, tipo, titulo) VALUES (%s, 'ALERTA', %s)",
                    (uid, titulo),
                )
        u.commit()
    with uow() as u:
        repo = u.notificaciones
        mias = repo.list_por_usuario(usuario_id, 50)
        assert {n["titulo"] for n in mias} == {"a", "b"}
        assert len(repo.list_por_usuario(usuario_id, 1)) == 1
        ajena = repo.list_por_usuario(otro_id, 50)[0]
        assert repo.marcar_leida(usuario_id, ajena["id"]) is False
        assert repo.marcar_leida(usuario_id, mias[0]["id"]) is True
        assert repo.marcar_leida(usuario_id, uuid4()) is False
        assert repo.marcar_todas_leidas(usuario_id) == 1
        assert repo.marcar_todas_leidas(usuario_id) == 0
        repo.guardar_config({"tipo_cambio_compra": "500.5", "tipo_cambio_fecha": ""})
        repo.guardar_config({"tipo_cambio_compra": "501"})
        assert repo.leer_config(("tipo_cambio_compra", "tipo_cambio_fecha", "no_existe")) == {
            "tipo_cambio_compra": "501",
            "tipo_cambio_fecha": "",
        }
        u.commit()
    with uow() as u:
        assert not any(n["leida"] for n in u.notificaciones.list_por_usuario(otro_id, 50))
