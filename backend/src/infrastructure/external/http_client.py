"""Cliente HTTP saliente (stdlib urllib: sin dependencias extra en la Lambda)."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from application.ports.integraciones import ExternalHttp


def _with_params(url: str, params: dict[str, str] | None) -> str:
    if not params:
        return url
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}{urllib.parse.urlencode(params)}"


def request(
    method: str,
    url: str,
    *,
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 15,
) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})  # noqa: S310
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:  # noqa: S310 - URLs de integraciones
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def _json(raw: bytes) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return None


class UrllibExternalHttp(ExternalHttp):
    def get_json(self, url, *, params=None, headers=None, timeout=15):
        status, raw = request(
            "GET",
            _with_params(url, params),
            headers={"Accept": "application/json", **(headers or {})},
            timeout=timeout,
        )
        return status, _json(raw)

    def get_text(self, url, *, params=None, headers=None, timeout=15):
        status, raw = request("GET", _with_params(url, params), headers=headers, timeout=timeout)
        return status, raw.decode("utf-8", errors="replace")

    def post_json(self, url, body, *, headers=None, timeout=15):
        payload = json.dumps(body, default=str).encode("utf-8")
        status, raw = request(
            "POST",
            url,
            data=payload,
            headers={"Content-Type": "application/json", **(headers or {})},
            timeout=timeout,
        )
        return status, _json(raw)
