from __future__ import annotations

from uuid import UUID, uuid4

from application.ports.app_user_repository import AppUserRepository


class FakeAppUserRepository(AppUserRepository):
    def __init__(self) -> None:
        self.rows: dict[UUID, dict] = {}

    def add_migrated(self, user_id: UUID, email: str) -> None:
        self.rows[user_id] = {"cognito_sub": None, "email": email}

    def find_id_by_subject(self, subject: str) -> UUID | None:
        return next((uid for uid, row in self.rows.items() if row["cognito_sub"] == subject), None)

    def link_or_create(self, subject: str, verified_email: str | None) -> tuple[UUID, bool]:
        if verified_email:
            for uid, row in self.rows.items():
                if row["cognito_sub"] is None and row["email"].lower() == verified_email.lower():
                    row["cognito_sub"] = subject
                    return uid, False
        uid = uuid4()
        self.rows[uid] = {"cognito_sub": subject, "email": verified_email}
        return uid, True
