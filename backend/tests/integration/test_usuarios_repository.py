"""Directorio de usuarios y usuarios de la app contra el esquema generado."""

from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration


def test_usuario_directory_and_app_users(uow, make_usuario):
    email, usuario_id = make_usuario("COORDINADOR", email=f"Coord-{uuid4().hex[:6]}@cofersa.cr")
    with uow() as u:
        found = u.usuarios.find_activo_by_email(email.lower())
        assert found is not None and found.id == usuario_id and found.es_coordinador
        assert u.usuarios.find_by_id(usuario_id).email == email
        assert u.usuarios.count_activos() >= 1
        assert isinstance(u.usuarios.ultima_sync_cartera(), str)
        assert u.usuarios.get_google_refresh_token(email) is None
        u.usuarios.set_google_refresh_token(email, "rt-it")
        app_id, created = u.app_users.link_or_create(f"sub-{uuid4()}", email)
        u.commit()
    assert created
    with uow() as u:
        assert u.usuarios.get_google_refresh_token(email.upper()) == "rt-it"
        assert u.app_users.find_id_by_subject("no-existe") is None
        assert any(x.id == usuario_id for x in u.usuarios.list_activos())
        assert isinstance(u.usuarios.list_analistas_con_cartera(), list)
    assert app_id is not None
