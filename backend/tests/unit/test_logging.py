import json
import logging

from shared.logging import JsonFormatter, RedactingFilter, redact


def test_redact_nested_sensitive_keys():
    data = {"user": "a", "password": "p", "nested": {"Authorization": "Bearer x", "ok": 1}}
    assert redact(data) == {"user": "a", "password": "***", "nested": {"Authorization": "***", "ok": 1}}


def test_filter_redacts_extra_fields():
    record = logging.LogRecord("t", logging.INFO, __file__, 1, "msg", None, None)
    record.token = "abc"
    record.payload = {"secret": "s", "name": "n"}
    RedactingFilter().filter(record)
    output = json.loads(JsonFormatter().format(record))
    assert output["token"] == "***"
    assert output["payload"] == {"secret": "***", "name": "n"}
