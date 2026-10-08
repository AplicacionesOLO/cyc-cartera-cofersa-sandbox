"""Solicitudes internas (Centro Operativo + flujo legacy analista → coordinador).

Los estados conviven en la misma columna ``estado`` sin CHECK en la BD:
- legacy (wizard de la ficha): ``PENDIENTE`` / ``APROBADA`` / ``RECHAZADA``
- catálogo nuevo: ``ESTADOS_OFICIALES`` (``lib/solicitudes/catalogo.ts``)
"""

from __future__ import annotations

ESTADO_PENDIENTE_LEGACY = "PENDIENTE"
ESTADO_INICIAL_CATALOGO = "Pendiente"

ESTADOS_OFICIALES: tuple[str, ...] = (
    "Pendiente",
    "En revisión",
    "Pendiente cliente",
    "Pendiente tercero",
    "Resuelta",
    "Cerrada",
    "Rechazada",
)

# PATCH /solicitudes/{id}  { accion } → estado legacy
ESTADO_POR_ACCION: dict[str, str] = {
    "APROBAR": "APROBADA",
    "RECHAZAR": "RECHAZADA",
    "CANCELAR": "RECHAZADA",  # cancelar = rechazar desde el analista
}

TIPO_NOTIFICACION = "SOLICITUD"

# Adjuntos del formulario nuevo (mismo bucket que Reportar Pago)
BUCKET_ADJUNTOS = "comprobantes-pago"
CONTENT_TYPES_ADJUNTO: tuple[str, ...] = ("application/pdf", "image/webp", "image/jpeg", "image/png")
