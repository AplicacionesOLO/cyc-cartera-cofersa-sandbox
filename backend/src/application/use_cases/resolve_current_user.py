"""Resuelve el ``user_id`` de la aplicación a partir del ``sub`` de Cognito.

Replica el comportamiento del sistema de origen: todo usuario autenticado tiene una fila propia
(``tbl_app_users``) cuyo ``id`` es el que usan las FK. Los usuarios migrados conservan su
``id`` original; el primer login los vincula por email verificado. Si en el origen existía
un trigger sobre ``auth.users`` (p. ej. crear ``profiles``), su lógica va en
``on_user_created`` y corre en la misma transacción.
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from uuid import UUID

from application.dto.principal import Principal
from application.ports.app_user_repository import HasAppUsers

OnUserCreated = Callable[[HasAppUsers, UUID, Principal], None]


class ResolveCurrentUserUseCase:
    def __init__(
        self,
        uow_factory: Callable[[], HasAppUsers],
        on_user_created: OnUserCreated | None = None,
    ) -> None:
        self._uow_factory = uow_factory
        self._on_user_created = on_user_created
        self._cache: dict[str, UUID] = {}
        self._lock = threading.Lock()

    def execute(self, principal: Principal) -> Principal:
        with self._lock:
            cached = self._cache.get(principal.subject)
        if cached is not None:
            return principal.with_user_id(cached)

        with self._uow_factory() as uow:
            user_id = uow.app_users.find_id_by_subject(principal.subject)
            if user_id is None:
                verified = str(principal.claims.get("email_verified", "")).lower() == "true"
                user_id, created = uow.app_users.link_or_create(
                    principal.subject, principal.email if verified else None
                )
                if created and self._on_user_created is not None:
                    self._on_user_created(uow, user_id, principal.with_user_id(user_id))
                uow.commit()

        with self._lock:
            self._cache[principal.subject] = user_id
        return principal.with_user_id(user_id)
