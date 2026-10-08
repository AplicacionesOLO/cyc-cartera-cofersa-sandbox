import pytest

from fakes.fake_unit_of_work import FakeUnitOfWork


def test_commit_runs_after_commit_callbacks():
    uow = FakeUnitOfWork()
    events = []
    with uow:
        uow.after_commit(lambda: events.append("published"))
        uow.commit()
    assert uow.commits == 1
    assert uow.rollbacks == 0
    assert events == ["published"]


def test_exit_without_commit_rolls_back_and_skips_callbacks():
    uow = FakeUnitOfWork()
    events = []
    with uow:
        uow.after_commit(lambda: events.append("published"))
    assert uow.commits == 0
    assert uow.rollbacks == 1
    assert events == []


def test_exception_rolls_back_and_propagates():
    uow = FakeUnitOfWork()
    with pytest.raises(RuntimeError):
        with uow:
            raise RuntimeError("boom")
    assert uow.rollbacks == 1


def test_failing_callback_does_not_undo_commit():
    uow = FakeUnitOfWork()
    with uow:
        uow.after_commit(lambda: (_ for _ in ()).throw(ValueError("x")))
        uow.commit()
    assert uow.commits == 1
