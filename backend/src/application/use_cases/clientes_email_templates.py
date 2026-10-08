"""HTML de los correos del módulo Clientes (email de cobro y estado de cuenta).

Portado tal cual de ``/api/clientes/email-cobro`` y ``/api/clientes/estado-cuenta``: mismos
colores, textos y estructura de tablas. El texto libre que escribe el usuario (mensaje,
observaciones) se escapa como HTML; para texto normal el render es idéntico.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from html import escape
from typing import Any

from domain.entities.clientes import badge_estado, dias_vencida, fmt_fecha, fmt_monto

_HEAD = (
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    "<style>@media(max-width:600px){.sic-main{width:100%!important;border-radius:0!important}}</style>"
    "</head>"
)
_LABEL = (
    "margin:0 0 {mb}px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;"
    "letter-spacing:0.06em;"
)
LOGO_URL = "https://cyc-cartera-cofersa.vercel.app/logo-cofersa.png"


def _txt(value: Any) -> str:
    return escape(str(value if value is not None else ""), quote=False)


def formatear_mensaje(text: str) -> str:
    """``\\n\\n`` → párrafos ``<p>``; ``\\n`` simple → ``<br>``."""
    bloques = [b.strip() for b in re.split(r"\n{2,}", text.strip()) if b.strip()]
    return "".join(
        '<p style="margin:0 0 14px 0;font-size:13px;color:#334155;line-height:1.75;">'
        f"{_txt(b).replace(chr(10), '<br>')}</p>"
        for b in bloques
    )


def html_email_cobro(
    *,
    asunto: str,
    mensaje: str,
    cliente_nombre: str | None,
    cliente_cod: str | None,
    remitente_nombre: str,
    remitente_email: str,
    fecha_larga: str,
) -> str:
    cliente_html = ""
    if cliente_nombre or cliente_cod:
        nombre = cliente_nombre if cliente_nombre is not None else cliente_cod
        cod_html = (
            '<p style="margin:2px 0 0;font-size:12px;color:#94a3b8;font-family:monospace;">'
            f"{_txt(cliente_cod)}</p>"
            if cliente_cod
            else ""
        )
        cliente_html = (
            '<tr><td style="padding:20px 32px 0;">'
            f'<p style="{_LABEL.format(mb=4)}">Cliente</p>'
            f'<p style="margin:0;font-size:18px;font-weight:800;color:#1e293b;">{_txt(nombre)}</p>'
            f"{cod_html}</td></tr>"
        )
    return (
        f'<!DOCTYPE html>\n<html lang="es">\n{_HEAD}\n'
        "<body style=\"margin:0;padding:0;background:#f0f4f8;font-family:'Nunito',Arial,sans-serif;\">"
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">'
        '<tr><td align="center">'
        '<table class="sic-main" cellpadding="0" cellspacing="0" '
        'style="background:#ffffff;border-radius:16px;overflow:hidden;'
        'box-shadow:0 1px 3px rgba(0,0,0,0.08);width:100%;max-width:780px;">'
        '<tr><td style="background:#009EE3;padding:20px 32px;">'
        '<p style="margin:0;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.08em;'
        'text-transform:uppercase;opacity:0.85;">COFERSA · CRÉDITO Y COBRO</p>'
        f'<h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:800;">{_txt(asunto)}</h1>'
        "</td></tr>"
        f"{cliente_html}"
        '<tr><td style="padding:20px 32px 0;">'
        f'<p style="{_LABEL.format(mb=6)}">Mensaje</p>'
        '<div style="background:#f8fafc;border-left:4px solid #009ee3;border-radius:0 8px 8px 0;'
        f'padding:16px 20px;">{formatear_mensaje(mensaje)}</div>'
        "</td></tr>"
        '<tr><td style="padding:20px 32px 28px;">'
        '<p style="margin:0 0 4px;font-size:11px;color:#64748b;">Para consultas, comuníquese con su '
        "ejecutivo de cuenta:</p>"
        f'<p style="margin:0;font-size:13px;font-weight:700;color:#1e293b;">{_txt(remitente_nombre)} '
        f"&lt;{_txt(remitente_email)}&gt;</p>"
        "</td></tr>"
        '<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;">'
        '<p style="margin:0;font-size:11px;color:#94a3b8;">SIC Cofersa · Sistema de Gestión de Cartera · '
        f"{fecha_larga}</p>"
        "</td></tr>"
        "</table></td></tr></table>\n</body></html>"
    )


@dataclass(frozen=True)
class EstadoCuentaHtml:
    cliente_nombre: str
    contribuyente: str
    condicion_pago: str
    facturas: list[dict[str, Any]]  # ya ordenadas: vencidas primero
    cuentas: list[dict[str, Any]]
    observaciones: str | None
    analista_nombre: str
    analista_email: str
    analista_telefono: str | None
    analista_whatsapp: str | None
    hoy: date


def ordenar_facturas(facturas: list[dict[str, Any]], hoy: date) -> list[dict[str, Any]]:
    """Vencidas primero (más antiguas); sin fecha al final."""

    def clave(f: dict[str, Any]) -> int:
        d = dias_vencida(f.get("fecha_vencimiento"), hoy)
        return -9999 if d is None else d

    return sorted(facturas, key=clave, reverse=True)


def _fila_factura(i: int, f: dict[str, Any], hoy: date) -> str:
    label, bg, color = badge_estado(f.get("fecha_vencimiento"), hoy)
    fondo = "#ffffff" if i % 2 == 0 else "#f8fafc"
    td = "padding:7px 14px;font-size:11.5px;color:#374151;border-bottom:1px solid #f1f5f9;"
    return (
        f'<tr style="background:{fondo};">'
        f'<td style="padding:7px 14px;font-size:11.5px;font-family:monospace;color:#374151;'
        f'border-bottom:1px solid #f1f5f9;">{_txt(f.get("documento") or "—")}</td>'
        f'<td style="{td}">{fmt_fecha(f.get("fecha_documento"))}</td>'
        f'<td style="{td}">{fmt_fecha(f.get("fecha_vencimiento"))}</td>'
        f'<td style="{td}text-align:right;">{fmt_monto(f.get("monto") or 0)}</td>'
        f'<td style="{td}font-weight:700;text-align:right;">{fmt_monto(f.get("saldo") or 0)}</td>'
        '<td style="padding:7px 14px;text-align:center;border-bottom:1px solid #f1f5f9;">'
        f'<span style="font-size:10px;font-weight:700;color:{color};background:{bg};padding:2px 6px;'
        f'border-radius:9999px;white-space:nowrap;">{label}</span></td></tr>'
    )


def _cuenta(c: dict[str, Any], margin_top: bool) -> str:
    etiqueta = "Colones · Cta corriente" if c.get("moneda") == "CRC" else "Dólares · Cta corriente"
    return (
        '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;'
        + ("margin-top:8px;" if margin_top else "")
        + '">'
        '<p style="margin:0 0 3px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;'
        f'letter-spacing:0.05em;">{_txt(c.get("banco"))}</p>'
        '<p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#111827;font-family:monospace;">'
        f"{_txt(c.get('iban') or c.get('numero'))}</p>"
        f'<p style="margin:0;font-size:10px;color:#9ca3af;">{etiqueta}</p></div>'
    )


def _cuentas_html(cuentas: list[dict[str, Any]]) -> str:
    todas = [c for c in cuentas if c.get("tipo") == "cuenta"]
    sinpe = next((c for c in cuentas if c.get("tipo") == "sinpe" and c.get("moneda") == "CRC"), None)
    if not todas and not sinpe:
        return ""
    cols = ["".join(_cuenta(c, i > 0) for i, c in enumerate(todas[start : start + 2])) for start in (0, 2, 4)]
    sinpe_html = (
        '<div style="margin-top:10px;padding:9px 14px;background:#f0fdf4;border:1px solid #bbf7d0;'
        'border-radius:8px;display:inline-block;"><span style="font-size:13px;">📱</span>'
        '<span style="font-size:12px;font-weight:700;color:#15803d;margin-left:6px;">Sinpe Móvil: '
        f"{_txt(sinpe.get('numero'))}</span></div>"
        if sinpe
        else ""
    )
    return (
        '<tr><td style="padding:20px 32px 0;">'
        f'<p style="{_LABEL.format(mb=10)}">Información para pagos</p>'
        '<table width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr>'
        f'<td style="width:33.33%;vertical-align:top;padding-right:8px;">{cols[0]}</td>'
        f'<td style="width:33.33%;vertical-align:top;padding-right:8px;">{cols[1]}</td>'
        f'<td style="width:33.33%;vertical-align:top;">{cols[2]}</td>'
        f"</tr></table>{sinpe_html}</td></tr>"
    )


def _kpi(titulo: str, valor: str, padding_right: bool) -> str:
    pad = ' style="padding-right:12px;"' if padding_right else ""
    return (
        f"<td{pad}>"
        '<div style="border:1px solid #009ee3;border-radius:10px;overflow:hidden;text-align:center;">'
        '<div style="background:#009ee3;padding:7px 14px 6px;">'
        '<p style="margin:0;font-size:9px;font-weight:700;color:#ffffff;text-transform:uppercase;'
        f'letter-spacing:0.06em;">{titulo}</p></div>'
        '<div style="background:#ffffff;padding:10px 14px 12px;">'
        f'<p style="margin:0;font-size:20px;font-weight:800;color:#003B5C;">{valor}</p></div></div></td>'
    )


def _th(texto: str, align: str) -> str:
    return (
        f'<th style="padding:9px 14px;font-size:9px;font-weight:700;color:#ffffff;text-align:{align};'
        f'text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #0080c0;">{texto}</th>'
    )


def html_estado_cuenta(data: EstadoCuentaHtml) -> str:
    rows = data.facturas
    total_saldo = sum(float(f.get("saldo") or 0) for f in rows)
    total_monto = sum(float(f.get("monto") or 0) for f in rows)
    total_vencido = sum(
        float(f.get("saldo") or 0)
        for f in rows
        if (dias_vencida(f.get("fecha_vencimiento"), data.hoy) or 0) > 0
    )
    filas = "".join(_fila_factura(i, f, data.hoy) for i, f in enumerate(rows)) or (
        '<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8;font-size:13px;">'
        "Sin facturas pendientes</td></tr>"
    )
    obs_html = ""
    if data.observaciones and data.observaciones.strip():
        obs = _txt(data.observaciones.strip()).replace("\n", "<br>")
        obs_html = (
            '<tr><td style="padding:16px 32px 0;">'
            f'<p style="{_LABEL.format(mb=6)}">Observaciones</p>'
            '<div style="background:#f0f9ff;border-left:4px solid #009ee3;border-radius:0 8px 8px 0;'
            'padding:12px 16px;"><p style="margin:0;font-size:12.5px;color:#0c4a6e;line-height:1.65;'
            f'font-style:italic;">{obs}</p></div></td></tr>'
        )
    contacto = " &nbsp;·&nbsp; ".join(
        x
        for x in (
            f"<strong>{_txt(data.analista_nombre)}</strong>",
            _txt(data.analista_email),
            f"Tel: {_txt(data.analista_telefono)}" if data.analista_telefono else None,
            f"WA: {_txt(data.analista_whatsapp)}" if data.analista_whatsapp else None,
        )
        if x
    )
    fecha_corte = data.hoy.strftime("%d/%m/%Y")
    pie_tfoot = "padding:9px 14px;font-size:12px;font-weight:800;color:#1e293b;text-align:right;"
    return (
        f'<!DOCTYPE html>\n<html lang="es">\n{_HEAD}\n'
        "<body style=\"margin:0;padding:0;background:#f0f4f8;font-family:'Nunito',Arial,sans-serif;\">"
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">'
        '<tr><td align="center"><table class="sic-main" cellpadding="0" cellspacing="0" '
        'style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);'
        'width:100%;max-width:780px;">'
        '<tr><td style="background:#ffffff;padding:20px 32px;border-bottom:3px solid #009EE3;">'
        '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
        f'<td style="width:130px;vertical-align:middle;"><img src="{LOGO_URL}" alt="Cofersa" '
        'style="height:48px;width:auto;display:block;"></td>'
        '<td style="text-align:center;vertical-align:middle;"><h1 style="margin:0;color:#000000;'
        'font-size:22px;font-weight:800;letter-spacing:0.01em;">Estado de Cuenta</h1></td>'
        '<td style="width:130px;text-align:right;vertical-align:middle;white-space:nowrap;">'
        '<p style="margin:0;color:#94a3b8;font-size:10px;font-weight:700;text-transform:uppercase;'
        'letter-spacing:0.08em;">Fecha de corte</p>'
        f'<p style="margin:4px 0 0;color:#000000;font-size:16px;font-weight:800;">{fecha_corte}</p></td>'
        "</tr></table></td></tr>"
        '<tr><td style="padding:20px 32px 0;"><div style="background:#f0f9ff;border:1px solid #bae6fd;'
        'border-left:4px solid #009ee3;border-radius:10px;padding:16px 20px;">'
        '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="width:60%;vertical-align:top;">'
        '<p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#009ee3;text-transform:uppercase;'
        'letter-spacing:0.06em;">Cliente</p>'
        '<p style="margin:0;font-size:16px;font-weight:800;color:#003B5C;line-height:1.2;">'
        f"{_txt(data.cliente_nombre)}</p>"
        '<p style="margin:5px 0 0;font-size:13px;color:#64748b;">Contribuyente: <span '
        f'style="font-family:monospace;font-weight:600;">{_txt(data.contribuyente)}</span></p></td>'
        '<td style="text-align:right;vertical-align:top;"><p style="margin:0 0 3px;font-size:10px;'
        'font-weight:700;color:#009ee3;text-transform:uppercase;letter-spacing:0.06em;">Condición de pago</p>'
        f'<p style="margin:0;font-size:15px;font-weight:800;color:#003B5C;">{_txt(data.condicion_pago)}</p>'
        "</td></tr></table></div></td></tr>"
        '<tr><td style="padding:16px 32px 0;"><table width="100%" cellpadding="0" cellspacing="0"><tr>'
        f"{_kpi('Saldo total pendiente', fmt_monto(total_saldo), True)}"
        f"{_kpi('Total vencido', fmt_monto(total_vencido), True)}"
        f"{_kpi('Facturas pendientes', str(len(rows)), False)}"
        "</tr></table></td></tr>"
        f"{obs_html}"
        '<tr><td style="padding:16px 32px 0;">'
        f'<p style="{_LABEL.format(mb=8)}">Detalle de facturas</p></td></tr>'
        '<tr><td style="padding:0 32px 0;"><table width="100%" cellpadding="0" cellspacing="0" '
        'style="border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">'
        '<thead><tr style="background:#009ee3;">'
        f"{_th('Documento', 'left')}{_th('Emisión', 'left')}{_th('Vencimiento', 'left')}"
        f"{_th('Monto', 'right')}{_th('Saldo', 'right')}{_th('Estado', 'center')}"
        f"</tr></thead><tbody>{filas}</tbody>"
        '<tfoot><tr style="background:#f8fafc;"><td colspan="3" style="padding:9px 14px;font-size:10px;'
        'font-weight:700;color:#64748b;border-top:2px solid #e2e8f0;text-transform:uppercase;">'
        f"Total ({len(rows)} facturas)</td>"
        f'<td style="{pie_tfoot}border-top:2px solid #e2e8f0;">{fmt_monto(total_monto)}</td>'
        f'<td style="{pie_tfoot}border-top:2px solid #e2e8f0;">{fmt_monto(total_saldo)}</td>'
        '<td style="border-top:2px solid #e2e8f0;"></td></tr></tfoot></table></td></tr>'
        f"{_cuentas_html(data.cuentas)}"
        '<tr><td style="padding:20px 32px 24px;"><p style="margin:0 0 4px;font-size:11px;color:#64748b;">'
        "Para consultas, comuníquese con su ejecutivo de cuenta:</p>"
        f'<p style="margin:0;font-size:12.5px;font-weight:700;color:#1e293b;">{contacto}</p></td></tr>'
        '<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 32px;">'
        '<table width="100%" cellpadding="0" cellspacing="0"><tr><td>'
        '<p style="margin:0;font-size:10px;color:#94a3b8;">SIC Cofersa · Sistema de Gestión de Cartera</p>'
        '</td><td style="text-align:right;"><p style="margin:0;font-size:10px;color:#cbd5e1;">'
        f"© Cofersa 2026 · {fecha_corte}</p></td></tr></table></td></tr>"
        "</table></td></tr></table>\n</body>\n</html>"
    )
