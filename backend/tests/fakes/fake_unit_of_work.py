"""UnitOfWork en memoria para tests unitarios de casos de uso (sin PostgreSQL ni AWS).

Los proyectos heredan y agregan sus repositories fake:

    class FakeAppUnitOfWork(FakeUnitOfWork):
        def __init__(self):
            super().__init__()
            self.orders = FakeOrderRepository()
"""

from __future__ import annotations

from application.ports.unit_of_work import UnitOfWork


class FakeUnitOfWork(UnitOfWork):
    def __init__(self) -> None:
        super().__init__()
        self.commits = 0
        self.rollbacks = 0

    def _begin(self) -> None:
        return None

    def _commit(self) -> None:
        self.commits += 1

    def _rollback(self) -> None:
        self.rollbacks += 1
