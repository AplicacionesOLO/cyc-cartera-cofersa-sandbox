"""Promesas de pago: estados, eventos del mini-timeline y formato de montos en mensajes."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

PENDIENTE = "PENDIENTE"
CUMPLIDA = "CUMPLIDA"
INCUMPLIDA = "INCUMPLIDA"
ABONO_PARCIAL = "ABONO_PARCIAL"
REPROGRAMADA = "REPROGRAMADA"

# Estados que se validan a mano (PATCH); reprogramar va por su propio endpoint.
ESTADOS_VALIDACION = (CUMPLIDA, INCUMPLIDA, ABONO_PARCIAL)
# Una promesa en estos estados ya no se re-valida ni se reprograma.
ESTADOS_CERRADOS = (CUMPLIDA, REPROGRAMADA)

# Columnas que actualizan validar / reprogramar / eliminar.
COLUMNAS_ACTUALIZABLES = (
    "estado",
    "fecha_validacion",
    "validado_por",
    "comentario_validacion",
    "eventos",
    "monto_abono_parcial",
    "activo",
)

# Tope de la bandeja (igual que el `.limit(800)` del origen).
LIMITE_BANDEJA = 800


def fmt_crc(monto: float) -> str:
    """``fmtCRC`` del front: ₡ + entero redondeado con punto de miles."""
    return "₡" + f"{round(float(monto)):,}".replace(",", ".")


def evento(fecha: date, tipo: str, descripcion: str, por: str) -> dict[str, str]:
    """Evento del mini-timeline (``EventoPromesa`` del front)."""
    return {"fecha": fecha.isoformat(), "tipo": tipo, "descripcion": descripcion, "por": por}


@dataclass(frozen=True)
class NuevaPromesa:
    cliente_cod: str
    cliente_nombre: str | None
    contribuyente: str | None
    analista_email: str
    fecha_creacion: date
    fecha_promesa: date
    monto: float
    notas: str | None
    gestion_id: Any = None
    reprogramada_de_id: Any = None
    estado: str = PENDIENTE
    eventos: list[dict[str, Any]] = field(default_factory=list)
