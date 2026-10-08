"""Gestión de cobro (bitácora del analista) y notas rápidas del día."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

# Columnas que el analista/coordinador puede corregir de una gestión ya registrada
# (PATCH /api/clientes/gestiones del origen).
COLUMNAS_EDITABLES = ("tipo", "resultado", "nota", "promesa_fecha", "promesa_monto")

RESULTADO_COMPROMISO = "Compromiso de pago confirmado"


@dataclass(frozen=True)
class NuevaGestion:
    cliente_cod: str
    contribuyente: str | None
    analista_email: str
    fecha: date
    hora: str
    tipo: str
    resultado: str
    nota: str
    proxima_accion: str | None = None
    proxima_accion_fecha: date | None = None
    metadata: dict[str, Any] | None = None
    promesa_fecha: date | None = None
    promesa_monto: float | None = None
