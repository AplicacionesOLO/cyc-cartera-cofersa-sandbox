"""Handlers de Gestión de Cartera: pedidos retenidos, saldos a favor, comprobantes y reporte de pagos."""

from __future__ import annotations

from application.use_cases.gestion_cartera import (
    ActualizarPedidoRetenidoUseCase,
    AplicarSaldoFavorUseCase,
    CrearUrlSubidaComprobanteUseCase,
    GetPedidosRetenidosUseCase,
    ListSaldosFavorClienteUseCase,
    ListSaldosFavorUseCase,
    MatchingSaldosFavorUseCase,
    ObtenerUrlComprobanteUseCase,
    ReportarPagoUseCase,
)
from domain.entities.gestion_cartera import COMPROBANTES_BUCKET
from entrypoints.lambda_handlers import container
from entrypoints.lambda_handlers.http_adapter import HttpRequest
from entrypoints.lambda_handlers.router import api_router


def _uc_pedidos():
    return GetPedidosRetenidosUseCase(container.uow_factory)


def _uc_actualizar_pedido():
    return ActualizarPedidoRetenidoUseCase(container.uow_factory)


def _uc_saldos():
    return ListSaldosFavorUseCase(container.uow_factory)


def _uc_saldos_cliente():
    return ListSaldosFavorClienteUseCase(container.uow_factory)


def _uc_aplicar_saldo():
    return AplicarSaldoFavorUseCase(container.uow_factory)


def _uc_matching():
    return MatchingSaldosFavorUseCase(container.uow_factory)


def _uc_subida_comprobante():
    return CrearUrlSubidaComprobanteUseCase(container.uow_factory, container.storage(COMPROBANTES_BUCKET))


def _uc_url_comprobante():
    return ObtenerUrlComprobanteUseCase(container.uow_factory, container.storage(COMPROBANTES_BUCKET))


def _uc_reportar_pago():
    return ReportarPagoUseCase(container.uow_factory)


def _pedidos_retenidos(request: HttpRequest):
    return _uc_pedidos().execute(request.require_principal(), request.query_str("email"))


def _actualizar_pedido(request: HttpRequest):
    return _uc_actualizar_pedido().execute(
        request.require_principal(), request.path_param("id"), request.json_body()
    )


def _saldos_favor(request: HttpRequest):
    return _uc_saldos().execute(request.require_principal(), request.query_str("email"))


def _saldos_favor_cliente(request: HttpRequest):
    return _uc_saldos_cliente().execute(request.require_principal(), request.query_str("cliente_cod"))


def _aplicar_saldo(request: HttpRequest):
    return _uc_aplicar_saldo().execute(request.require_principal(), request.path_param("id"))


def _matching(request: HttpRequest):
    return _uc_matching().execute(
        request.require_principal(), request.query_str("cliente_cod"), request.query_str("scope")
    )


def _subida_comprobante(request: HttpRequest):
    return _uc_subida_comprobante().execute(request.require_principal(), request.json_body())


def _url_comprobante(request: HttpRequest):
    return _uc_url_comprobante().execute(request.require_principal(), request.query_str("key"))


def _reportar_pago(request: HttpRequest):
    return _uc_reportar_pago().execute(request.require_principal(), request.json_body())


ROUTES = {
    ("GET", "/pedidos-retenidos"): _pedidos_retenidos,
    ("PUT", "/pedidos-retenidos/{id}"): _actualizar_pedido,
    ("GET", "/saldos-favor"): _saldos_favor,
    ("GET", "/saldos-favor/por-cliente"): _saldos_favor_cliente,
    ("POST", "/saldos-favor/{id}/aplicar"): _aplicar_saldo,
    ("GET", "/saldos-favor/matching"): _matching,
    ("POST", "/gestion-cartera/comprobantes/upload-url"): _subida_comprobante,
    ("GET", "/gestion-cartera/comprobantes/download-url"): _url_comprobante,
    ("POST", "/clientes/pagos/reportar"): _reportar_pago,
}

gestion_cartera_handler = api_router(ROUTES)
