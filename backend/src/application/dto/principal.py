"""Identidad del usuario autenticado, independiente del proveedor (Cognito, IdP corporativo)."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any
from uuid import UUID


@dataclass(frozen=True)
class Principal:
    subject: str
    email: str | None = None
    groups: frozenset[str] = field(default_factory=frozenset)
    claims: dict[str, Any] = field(default_factory=dict)
    user_id: UUID | None = None

    def has_group(self, *names: str) -> bool:
        return any(name in self.groups for name in names)

    def with_user_id(self, user_id: UUID) -> Principal:
        return replace(self, user_id=user_id)
