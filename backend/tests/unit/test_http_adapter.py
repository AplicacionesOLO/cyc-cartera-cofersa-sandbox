import json

import pytest

from domain.exceptions import BusinessRuleViolation, ForbiddenError, NotFoundError, ValidationError
from entrypoints.lambda_handlers.http_adapter import (
    HttpRequest,
    api_handler,
    created,
    principal_from_event,
)


def _event(**overrides):
    event = {
        "httpMethod": "GET",
        "path": "/orders/1",
        "resource": "/orders/{id}",
        "pathParameters": {"id": "1"},
        "queryStringParameters": {"page": "2", "active": "true"},
        "multiValueQueryStringParameters": {"status": ["open,closed"]},
        "headers": {"Origin": "https://app.example.com"},
        "body": None,
        "requestContext": {
            "requestId": "req-1",
            "authorizer": {"claims": {"sub": "abc", "email": "a@b.com", "cognito:groups": "[admin editor]"}},
        },
    }
    event.update(overrides)
    return event


@pytest.fixture(autouse=True)
def _origins(monkeypatch):
    from shared import settings

    monkeypatch.setenv("ALLOWED_ORIGINS", "https://app.example.com")
    settings.get_settings.cache_clear()
    yield
    settings.get_settings.cache_clear()


def test_principal_groups_parsed_from_rest_claims():
    principal = principal_from_event(_event())
    assert principal.subject == "abc"
    assert principal.email == "a@b.com"
    assert principal.has_group("admin")
    assert principal.has_group("editor")


def test_principal_is_none_without_authorizer():
    assert principal_from_event(_event(requestContext={})) is None


def test_request_helpers():
    request = HttpRequest.from_event(_event())
    assert request.path_param("id") == "1"
    assert request.query_int("page", 1, minimum=1) == 2
    assert request.query_bool("active") is True
    assert request.query_list("status") == ["open", "closed"]


def test_invalid_query_int_raises_validation_error():
    request = HttpRequest.from_event(_event(queryStringParameters={"page": "x"}))
    with pytest.raises(ValidationError):
        request.query_int("page")


def test_success_returns_json_and_cors():
    @api_handler
    def handler(request):
        return {"id": request.path_param("id"), "user": request.require_principal().subject}

    response = handler(_event())
    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {"id": "1", "user": "abc"}
    assert response["headers"]["Access-Control-Allow-Origin"] == "https://app.example.com"


def test_unknown_origin_gets_no_allow_origin_header():
    @api_handler
    def handler(request):
        return []

    response = handler(_event(headers={"Origin": "https://evil.example.com"}))
    assert "Access-Control-Allow-Origin" not in response["headers"]


def test_none_returns_204_and_created_returns_201():
    @api_handler
    def empty(request):
        return None

    @api_handler
    def create(request):
        return created({"id": 5})

    assert empty(_event())["statusCode"] == 204
    assert create(_event())["statusCode"] == 201


@pytest.mark.parametrize(
    "error,status",
    [
        (ValidationError("x"), 400),
        (ForbiddenError("x"), 403),
        (NotFoundError("x"), 404),
        (BusinessRuleViolation("x"), 422),
    ],
)
def test_domain_errors_are_mapped(error, status):
    @api_handler
    def handler(request):
        raise error

    response = handler(_event())
    assert response["statusCode"] == status
    assert json.loads(response["body"])["error"]["message"] == "x"


def test_unexpected_error_is_generic_500():
    @api_handler
    def handler(request):
        raise RuntimeError("secret detail")

    response = handler(_event())
    assert response["statusCode"] == 500
    assert "secret detail" not in response["body"]


def test_invalid_json_body_is_400():
    @api_handler
    def handler(request):
        return request.json_body()

    response = handler(_event(httpMethod="POST", body="{not json"))
    assert response["statusCode"] == 400


def test_principal_resolver_enriches_principal():
    from uuid import UUID

    uid = UUID("00000000-0000-0000-0000-000000000001")

    @api_handler(principal_resolver=lambda p: p.with_user_id(uid))
    def handler(request):
        return {"user_id": request.require_principal().user_id}

    response = handler(_event())
    assert json.loads(response["body"]) == {"user_id": str(uid)}
