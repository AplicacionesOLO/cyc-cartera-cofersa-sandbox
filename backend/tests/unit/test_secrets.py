import json

from infrastructure.aws.secrets import SecretsManagerSecrets


class FakeClient:
    def __init__(self):
        self.calls = 0

    def get_secret_value(self, SecretId):
        self.calls += 1
        return {"SecretString": json.dumps({"username": "u", "password": f"p{self.calls}"})}


def test_secret_is_cached_until_ttl():
    now = [0.0]
    client = FakeClient()
    secrets = SecretsManagerSecrets(client, ttl_seconds=60, clock=lambda: now[0])
    assert secrets.get_json("/dev/app/db")["password"] == "p1"
    assert secrets.get_json("/dev/app/db")["password"] == "p1"
    assert client.calls == 1
    now[0] = 61
    assert secrets.get_json("/dev/app/db")["password"] == "p2"


def test_invalidate_forces_reload():
    client = FakeClient()
    secrets = SecretsManagerSecrets(client, ttl_seconds=60)
    secrets.get_json("s")
    secrets.invalidate("s")
    secrets.get_json("s")
    assert client.calls == 2
