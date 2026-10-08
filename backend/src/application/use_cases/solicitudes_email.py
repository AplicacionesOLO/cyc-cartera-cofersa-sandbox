"""Cuerpos HTML de los correos de solicitudes (mismo HTML que ``app/api/solicitudes/route.ts``)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from application.use_cases.common import CR_OFFSET

_MESES = (
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

_HEAD = (
    '<!DOCTYPE html>\n<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" '
    'content="width=device-width,initial-scale=1"><style>@media(max-width:600px){.sic-main{width:100%!important;'
    "border-radius:0!important}}</style></head>\n"
    "<body style=\"margin:0;padding:0;background:#f0f4f8;font-family:'Nunito',Arial,sans-serif;\">\n"
    '  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">\n'
    '    <tr><td align="center">\n'
    '      <table class="sic-main" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;'
    'overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);width:100%;max-width:780px;">\n'
)
_LABEL = (
    "margin:0 0 {mb}px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;"
    "letter-spacing:0.06em;"
)
_BADGE_TIPO = (
    "display:inline-block;background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:700;"
    "border-radius:999px;padding:5px 14px;text-transform:uppercase;letter-spacing:0.05em;"
)
_CAJA_TEXTO = "background:#f8fafc;border-left:4px solid #009ee3;border-radius:0 8px 8px 0;padding:12px 16px;"
_BOTON = (
    "display:inline-block;background:#009ee3;color:#fff;font-size:13px;font-weight:700;"
    "text-decoration:none;border-radius:10px;padding:12px 24px;"
)
_ADJUNTO = (
    "display:inline-block;background:#f0f9ff;color:#0369a1;font-size:11px;font-weight:600;"
    "text-decoration:none;border:1px solid #bae6fd;border-radius:8px;padding:5px 10px;"
)


def fecha_larga_cr(instante: datetime) -> str:
    """``toLocaleString('es-CR', {day:'2-digit', month:'long', year, hour, minute, hour12:false})``."""
    local = instante + CR_OFFSET
    return (
        f"{local.day:02d} de {_MESES[local.month - 1]} de {local.year}, {local.hour:02d}:{local.minute:02d}"
    )


def fecha_corta_cr(instante: datetime) -> str:
    """``toLocaleDateString('es-CR')`` → d/m/aaaa."""
    local = instante + CR_OFFSET
    return f"{local.day}/{local.month}/{local.year}"


def _cliente(cliente_nombre: str, cliente_cod: str) -> str:
    return (
        '        <tr><td style="padding:16px 32px 0;">\n'
        f'          <p style="{_LABEL.format(mb=4)}">Cliente</p>\n'
        f'          <p style="margin:0;font-size:18px;font-weight:800;color:#1e293b;">{cliente_nombre}</p>\n'
        '          <p style="margin:2px 0 0;font-size:12px;color:#94a3b8;font-family:monospace;">'
        f"{cliente_cod}</p>\n"
        "        </td></tr>\n"
    )


def _texto(label: str, texto: str) -> str:
    return (
        '        <tr><td style="padding:16px 32px 0;">\n'
        f'          <p style="{_LABEL.format(mb=6)}">{label}</p>\n'
        f'          <div style="{_CAJA_TEXTO}">\n'
        f'            <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">{texto}</p>\n'
        "          </div>\n"
        "        </td></tr>\n"
    )


def _footer(ahora: datetime) -> str:
    return (
        '        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;">\n'
        '          <p style="margin:0;font-size:11px;color:#94a3b8;">SIC Cofersa · Sistema de Gestión de '
        f"Cartera · {fecha_corta_cr(ahora)}</p>\n"
        "        </td></tr>\n"
        "      </table>\n    </td></tr>\n  </table>\n</body></html>"
    )


def _fila_dato(label: str, valor: str, color: str = "#1e293b", width: str = "") -> str:
    return (
        "<tr>"
        f'<td style="padding:6px 0;font-size:11px;font-weight:700;color:#64748b;{width}vertical-align:top;">'
        f"{label}</td>"
        f'<td style="padding:6px 0;font-size:12px;color:{color};font-weight:600;">{valor}</td>'
        "</tr>"
    )


def _datos_caso(datos: dict[str, Any] | None) -> str:
    datos = datos or {}
    filas: list[str] = []
    facturas = datos.get("facturas")
    if isinstance(facturas, list) and facturas:
        filas.append(_fila_dato("Factura(s)", ", ".join(str(f) for f in facturas), width="width:140px;"))
    if datos.get("facturas_canceladas"):
        filas.append(_fila_dato("Factura cancelada", str(datos["facturas_canceladas"]), color="#c2410c"))
    if datos.get("monto"):
        filas.append(_fila_dato("Monto", str(datos["monto"])))
    if not filas:
        return ""
    return (
        '        <tr><td style="padding:16px 32px 0;">\n'
        f'          <p style="{_LABEL.format(mb=8)}">Datos del caso</p>\n'
        f'          <table style="width:100%;border-collapse:collapse;">{"".join(filas)}</table>\n'
        "        </td></tr>\n"
    )


def _adjuntos(adjuntos: Sequence[dict[str, Any]]) -> str:
    con_url = [a for a in adjuntos if a.get("url")]
    if not con_url:
        return ""
    links = []
    for i, a in enumerate(con_url):
        kb = f" ({a['sizeKB']} KB)" if a.get("sizeKB") else ""
        links.append(
            f'<a href="{a["url"]}" style="{_ADJUNTO}">📎 {a.get("name") or f"Adjunto {i + 1}"}{kb}</a>'
        )
    return (
        '        <tr><td style="padding:12px 32px 0;">\n'
        f'          <p style="{_LABEL.format(mb=6)}">Adjuntos</p>\n'
        '          <div style="display:flex;flex-wrap:wrap;gap:8px;">\n'
        f"            {chr(10).join(links)}\n"
        "          </div>\n"
        "        </td></tr>\n"
    )


def html_solicitud_catalogo(
    *,
    numero_sic: str,
    tipo: str,
    prioridad: str | None,
    sla_horas: int,
    cliente_nombre: str,
    cliente_cod: str,
    descripcion: str,
    datos: dict[str, Any] | None,
    adjuntos: Sequence[dict[str, Any]],
    vence: datetime,
    responsable_nombre: str | None,
    to_email: str,
    solicitante_nombre: str,
    solicitante_email: str,
    link_solicitud: str | None,
    ahora: datetime,
) -> str:
    prioridad_html = (
        '<span style="display:inline-block;margin-left:6px;background:#fef2f2;color:#b91c1c;font-size:11px;'
        f'font-weight:700;border-radius:999px;padding:5px 14px;">{prioridad} · SLA {sla_horas}h</span>'
        if prioridad
        else ""
    )
    boton = (
        '<tr><td style="padding:24px 32px 32px;">\n'
        f'              <a href="{link_solicitud}" style="{_BOTON}">Ver solicitud →</a>\n'
        "             </td></tr>"
        if link_solicitud
        else '<tr><td style="padding:24px 32px 32px;"></td></tr>'
    )
    return (
        _HEAD + '        <tr><td style="background:#009EE3;padding:20px 32px;">\n'
        f'          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;">{numero_sic}</h1>\n'
        '          <p style="margin:4px 0 0;color:#ffffff;font-size:13px;opacity:0.9;">'
        "Nueva solicitud interna</p>\n"
        "        </td></tr>\n"
        '        <tr><td style="padding:24px 32px 0;">\n'
        f'          <span style="{_BADGE_TIPO}">{tipo}</span>\n'
        f"          {prioridad_html}\n"
        "        </td></tr>\n"
        + _cliente(cliente_nombre, cliente_cod)
        + _texto("Descripción", descripcion)
        + _datos_caso(datos)
        + _adjuntos(adjuntos)
        + '        <tr><td style="padding:16px 32px 0;">\n'
        '          <p style="margin:0;font-size:12px;color:#475569;"><strong>Vencimiento estimado:</strong> '
        f"{fecha_larga_cr(vence)}</p>\n"
        '          <p style="margin:6px 0 0;font-size:12px;color:#475569;"><strong>Responsable:</strong> '
        f"{responsable_nombre or '—'} &lt;{to_email}&gt;</p>\n"
        '          <p style="margin:6px 0 0;font-size:12px;color:#475569;"><strong>Solicitante:</strong> '
        f"{solicitante_nombre} &lt;{solicitante_email}&gt;</p>\n"
        "        </td></tr>\n"
        f"        {boton}\n" + _footer(ahora)
    )


def html_solicitud_legacy(
    *,
    tipo_label: str,
    cliente_nombre: str,
    cliente_cod: str,
    justificacion: str,
    solicitante_nombre: str,
    solicitante_email: str,
    link_solicitudes: str,
    ahora: datetime,
) -> str:
    return (
        _HEAD + '        <tr><td style="background:#009EE3;padding:20px 32px;text-align:left;">\n'
        '          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:800;">'
        "Nueva solicitud interna</h1>\n"
        "        </td></tr>\n"
        '        <tr><td style="padding:24px 32px 0;">\n'
        f'          <span style="{_BADGE_TIPO}">{tipo_label}</span>\n'
        "        </td></tr>\n"
        + _cliente(cliente_nombre, cliente_cod)
        + _texto("Justificación", justificacion)
        + '        <tr><td style="padding:16px 32px 0;">\n'
        f'          <p style="{_LABEL.format(mb=4)}">Solicitante</p>\n'
        '          <p style="margin:0;font-size:13px;color:#334155;">'
        f"{solicitante_nombre} &lt;{solicitante_email}&gt;</p>\n"
        "        </td></tr>\n"
        '        <tr><td style="padding:24px 32px 32px;">\n'
        f'          <a href="{link_solicitudes}" style="{_BOTON}">Ver solicitudes →</a>\n'
        "        </td></tr>\n" + _footer(ahora)
    )
