"""Constantes de Gestión de Cartera: pedidos retenidos, saldos a favor y reportes de pago."""

from __future__ import annotations

# pedidos_retenidos.estado_sic
PEDIDO_PENDIENTE = "Pendiente"
PEDIDO_APROBADO = "Aprobado"
PEDIDO_RETENIDO = "Retenido"
ESTADOS_PEDIDO = (PEDIDO_PENDIENTE, PEDIDO_APROBADO, PEDIDO_RETENIDO)

# saldos_favor.estado_manual
SALDO_PENDIENTE = "pendiente"
SALDO_APLICADO = "aplicado"

# reportes_pago.estado al crearse
REPORTE_PENDIENTE = "pendiente"
# Tolerancia de ₡1 entre la suma de facturas y el monto transferido (redondeos)
TOLERANCIA_REPORTE_PAGO = 1.0

# Comprobantes (bucket comprobantes-pago): el front los comprime a WebP/JPEG antes de subir
COMPROBANTE_CONTENT_TYPES = {"image/webp": "webp", "image/jpeg": "jpg", "image/png": "png"}
COMPROBANTES_BUCKET = "comprobantes-pago"
