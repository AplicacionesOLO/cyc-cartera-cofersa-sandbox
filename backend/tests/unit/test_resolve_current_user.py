from uuid import UUID

from application.dto.principal import Principal
from application.use_cases.resolve_current_user import ResolveCurrentUserUseCase
from fakes.fake_app_user_repository import FakeAppUserRepository
from fakes.fake_unit_of_work import FakeUnitOfWork


class FakeAuthUow(FakeUnitOfWork):
    def __init__(self, repo):
        super().__init__()
        self.app_users = repo


def _principal(verified="true"):
    return Principal(subject="sub-1", email="Ana@x.com", claims={"email_verified": verified})


def test_migrated_user_is_linked_by_verified_email_and_keeps_id():
    repo = FakeAppUserRepository()
    legacy_id = UUID(int=42)
    repo.add_migrated(legacy_id, "ana@x.com")
    use_case = ResolveCurrentUserUseCase(lambda: FakeAuthUow(repo))
    assert use_case.execute(_principal()).user_id == legacy_id


def test_unverified_email_never_links_and_creates_new_user():
    repo = FakeAppUserRepository()
    repo.add_migrated(UUID(int=42), "ana@x.com")
    created = []
    use_case = ResolveCurrentUserUseCase(
        lambda: FakeAuthUow(repo), on_user_created=lambda uow, uid, p: created.append(uid)
    )
    result = use_case.execute(_principal(verified="false"))
    assert result.user_id != UUID(int=42)
    assert created == [result.user_id]


def test_result_is_cached_per_subject():
    repo = FakeAppUserRepository()
    calls = []

    def factory():
        calls.append(1)
        return FakeAuthUow(repo)

    use_case = ResolveCurrentUserUseCase(factory)
    first = use_case.execute(_principal())
    second = use_case.execute(_principal())
    assert first.user_id == second.user_id
    assert len(calls) == 1
