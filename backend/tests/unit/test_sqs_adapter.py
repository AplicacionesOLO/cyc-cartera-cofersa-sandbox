from application.ports.idempotency_store import IdempotencyStore
from entrypoints.lambda_handlers.sqs_adapter import sqs_batch_handler


class MemoryStore(IdempotencyStore):
    def __init__(self):
        self.keys = set()
        self.released = []

    def claim(self, key):
        if key in self.keys:
            return False
        self.keys.add(key)
        return True

    def release(self, key):
        self.keys.discard(key)
        self.released.append(key)


def _event(*bodies):
    return {"Records": [{"messageId": f"m{i}", "body": b} for i, b in enumerate(bodies)]}


def test_only_failed_messages_are_reported_and_released():
    store = MemoryStore()
    processed = []

    @sqs_batch_handler(idempotency=lambda: store)
    def handler(message, record):
        if message["n"] == 2:
            raise ValueError("bad")
        processed.append(message["n"])

    result = handler(_event('{"n": 1}', '{"n": 2}', '{"n": 3}'))
    assert result == {"batchItemFailures": [{"itemIdentifier": "m1"}]}
    assert processed == [1, 3]
    assert store.released == ["m1"]


def test_duplicates_are_skipped():
    store = MemoryStore()
    store.keys.add("m0")
    calls = []

    @sqs_batch_handler(idempotency=lambda: store)
    def handler(message, record):
        calls.append(message)

    assert handler(_event('{"n": 1}')) == {"batchItemFailures": []}
    assert calls == []
