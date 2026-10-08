from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from shared.serialization import dumps, to_jsonable


def test_postgrest_compatible_types():
    value = {
        "price": Decimal("10.50"),
        "qty": Decimal("3"),
        "at": datetime(2024, 1, 2, 3, 4, 5, tzinfo=UTC),
        "day": date(2024, 1, 2),
        "id": UUID("00000000-0000-0000-0000-000000000001"),
        "raw": b"\x01\x02",
    }
    assert to_jsonable(value) == {
        "price": 10.5,
        "qty": 3,
        "at": "2024-01-02T03:04:05+00:00",
        "day": "2024-01-02",
        "id": "00000000-0000-0000-0000-000000000001",
        "raw": "\\x0102",
    }


def test_dataclasses_are_serialized():
    @dataclass
    class Item:
        name: str
        tags: tuple

    assert dumps(Item("a", ("x",))) == '{"name":"a","tags":["x"]}'
