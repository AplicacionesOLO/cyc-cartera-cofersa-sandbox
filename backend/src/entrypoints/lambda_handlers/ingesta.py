"""IngestaApi: N8N / Google Apps Script escriben por HTTP (antes directo en el origen con service_role).

Sin Cognito (máquina a máquina): el caso de uso valida el header ``x-ingesta-key`` en tiempo constante
contra ``ingesta_api_key`` del secreto de la app. WAF + throttling del stage protegen el endpoint.
"""

from __future__ import annotations

from application.use_cases.jobs_ingesta import IngestarLoteUseCase
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest
from entrypoints.lambda_handlers.router import api_router

INGESTA_HEADER = "x-ingesta-key"


def _ingestar(request: HttpRequest):
    use_case = IngestarLoteUseCase(container.uow_factory, container.integration_config())
    return use_case.execute(
        request.headers.get(INGESTA_HEADER), request.path_param("tabla"), request.json_body()
    )


ROUTES = {("POST", "/ingesta/{tabla}"): _ingestar}

ingesta_handler = api_router(ROUTES, authenticated=False)
