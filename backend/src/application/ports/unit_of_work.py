"""Port de unidad de trabajo: una transacción por caso de uso.

Uso en un caso de uso:

    with self._uow_factory(principal) as uow:
        order = uow.orders.get(order_id)
        ...
        uow.commit()

Salir del bloque sin ``commit()`` hace rollback (lecturas incluidas, es inocuo).
Los callbacks registrados con ``after_commit`` corren solo si el commit fue exitoso
(p. ej. publicar un evento de tiempo real o encolar un mensaje).
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import Callable

_logger = logging.getLogger(__name__)


class UnitOfWork(ABC):
    def __init__(self) -> None:
        self._committed = False
        self._after_commit: list[Callable[[], None]] = []

    def __enter__(self) -> UnitOfWork:
        self._committed = False
        self._after_commit = []
        self._begin()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        try:
            if exc_type is not None or not self._committed:
                self._rollback()
        finally:
            self._close()
        if exc is not None:
            translated = self._translate_error(exc)
            if translated is not None and translated is not exc:
                raise translated from exc

    def commit(self) -> None:
        self._commit()
        self._committed = True
        callbacks, self._after_commit = self._after_commit, []
        for callback in callbacks:
            try:
                callback()
            except Exception:  # un fallo de notificación no deshace un commit ya hecho
                _logger.exception("after_commit callback failed")

    def after_commit(self, callback: Callable[[], None]) -> None:
        self._after_commit.append(callback)

    @abstractmethod
    def _begin(self) -> None: ...

    @abstractmethod
    def _commit(self) -> None: ...

    @abstractmethod
    def _rollback(self) -> None: ...

    def _close(self) -> None:  # noqa: B027 - hook opcional
        """Libera recursos del bloque. La conexión física se reutiliza entre invocaciones."""

    def _translate_error(self, exc: BaseException) -> BaseException | None:
        """Permite al adaptador convertir errores técnicos en errores de dominio."""
        return None
