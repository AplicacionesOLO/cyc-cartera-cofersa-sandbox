"""Reglas puras del módulo Clientes: estados manuales, formato de montos/fechas y estado de facturas.

Los formatos replican los helpers de las API Routes originales (``fmtColones``, ``fmtMonto``,
``fmtFecha``, ``diasVenc``) para que los correos y las notas de gestión salgan idénticos.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

ESTADOS_VALIDOS = ("Normal", "Bloqueado", "Convenio", "Suspendido")
ESTADOS_PEDIDO_ACTIVOS = ("Pendiente", "Retenido")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
LIMITE_CORREOS_HORA = 30

MESES_ES = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)


@dataclass(frozen=True)
class GestionNueva:
    """Fila de ``gestiones`` que el módulo registra automáticamente (correo, recordatorio, sistema)."""

    cliente_cod: str
    analista_email: str
    fecha: date
    hora: str
    tipo: str
    resultado: str
    nota: str
    contribuyente: str | None = None
    activo: bool | None = None


def _miles(entero: int) -> str:
    return f"{entero:,}".replace(",", ".")


def fmt_colones(n: Any) -> str:
    """``₡1.250.000`` (fmtCRC: redondeo a entero, punto de miles)."""
    valor = Decimal(str(n or 0)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    signo = "-" if valor < 0 else ""
    return f"₡{signo}{_miles(abs(int(valor)))}"


def fmt_monto(n: Any) -> str:
    """``₡38.543,00`` (miles con punto, decimales con coma — estándar CR financiero)."""
    valor = Decimal(str(n or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    signo = "-" if valor < 0 else ""
    entero, _, dec = f"{abs(valor):.2f}".partition(".")
    return f"₡{signo}{_miles(int(entero))},{dec}"


def fmt_fecha(iso: Any) -> str:
    """``AAAA-MM-DD`` → ``DD/MM/AAAA`` (``—`` si viene vacío)."""
    texto = str(iso or "")[:10]
    if not texto:
        return "—"
    partes = texto.split("-")
    if len(partes) != 3:
        return texto
    return f"{partes[2]}/{partes[1]}/{partes[0]}"


def fecha_larga_es(dia: date) -> str:
    """``02 de octubre de 2026`` (toLocaleDateString es-CR, month: 'long')."""
    return f"{dia.day:02d} de {MESES_ES[dia.month - 1]} de {dia.year}"


def parse_fecha_iso(raw: Any) -> date | None:
    try:
        return date.fromisoformat(str(raw or "")[:10])
    except ValueError:
        return None


def dias_vencida(fecha_vencimiento: Any, hoy: date) -> int | None:
    """Días transcurridos desde el vencimiento (negativo = aún no vence)."""
    venc = parse_fecha_iso(fecha_vencimiento)
    return None if venc is None else (hoy - venc).days


def badge_estado(fecha_vencimiento: Any, hoy: date) -> tuple[str, str, str]:
    """(etiqueta, fondo, color) del estado de la factura en el correo de estado de cuenta."""
    d = dias_vencida(fecha_vencimiento, hoy)
    if d is None:
        return ("—", "#f1f5f9", "#94a3b8")
    if d < 0:
        return (f"Vence en {abs(d)}d", "#f0fdf4", "#006400")
    if d == 0:
        return ("Vence hoy", "#fff7ed", "#FF6F00")
    return (f"Vencida {d}d", "#fff1f2", "#D80236")


def email_invalido(direcciones: tuple[str, ...]) -> str | None:
    return next((e for e in direcciones if not EMAIL_RE.match(e)), None)


def solo_digitos_telefono(valor: str) -> str:
    """Teléfono CR: solo dígitos, máximo 8 (igual que la API Route ``/api/clientes/contacto``)."""
    return re.sub(r"\D", "", valor.strip())[:8]
