"""Correos de Auditoría y Control Legal (mismo HTML que las API Routes del origen).

- ``asunto_auditoria_anual`` / ``html_auditoria_anual``: antes
  ``lib/auditoria-legal/email-actualizacion-perfil.ts``.
- ``asunto_garantia_a_firmar`` / ``html_garantia_a_firmar``: antes inline en
  ``garantias/[id]/custodia/route.ts``.
"""

from __future__ import annotations

from html import escape


def asunto_auditoria_anual() -> str:
    return "Auditoría Anual de Control Interno y Normativa Comercial 2026 — Cofersa S.A."


def html_auditoria_anual(cliente_nombre: str, link: str) -> str:
    nombre = escape(cliente_nombre)
    href = escape(link, quote=True)
    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:600px){{.sic-main{{width:100%!important;border-radius:0!important}}}}</style></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Nunito',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
    <tr><td align="center">
      <table class="sic-main" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);width:100%;max-width:640px;">
        <tr>
          <td style="background:#003B5C;padding:24px 32px;">
            <p style="margin:0;color:#ffffff;font-size:15px;font-weight:800;letter-spacing:0.02em;">COFERSA S.A.</p>
            <p style="margin:8px 0 0;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">Departamento de Crédito y Cobro — Auditoría Anual 2026</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 14px 0;font-size:13px;color:#334155;line-height:1.75;">Estimado(a) <b>{nombre}</b>,</p>
            <p style="margin:0 0 14px 0;font-size:13px;color:#334155;line-height:1.75;">
              En cumplimiento de las políticas de control interno de la compañía y de la normativa comercial
              vigente en Costa Rica (Código de Comercio), el Departamento de Crédito y Cobro de Cofersa S.A.
              lleva a cabo su Auditoría Anual de Expedientes Comerciales 2026. Como parte de este proceso,
              es necesario actualizar la documentación de identificación asociada a su expediente comercial
              (cédula de identidad o, si corresponde, personería jurídica vigente).
            </p>
            <p style="margin:0 0 20px 0;font-size:13px;color:#334155;line-height:1.75;">
              El trámite es breve, no requiere crear una cuenta ni iniciar sesión, y puede completarse desde
              su celular o computadora ingresando al siguiente enlace:
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;">
              <tr><td style="background:#009EE3;border-radius:8px;">
                <a href="{href}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.02em;text-decoration:none;border-radius:8px;">Actualizar Expediente Comercial</a>
              </td></tr>
            </table>
            <p style="margin:0 0 4px 0;font-size:11.5px;color:#94a3b8;line-height:1.6;">
              Este enlace es personal e intransferible, y vence en 7 días naturales a partir de este envío.
              Si usted no reconoce este trámite, puede ignorar este correo con confianza.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:18px 32px;border-top:1px solid #eef2f7;">
            <p style="margin:0 0 6px 0;font-size:11px;color:#64748b;font-weight:600;">Departamento de Crédito y Cobro — Cofersa S.A.</p>
            <p style="margin:0 0 10px 0;font-size:11px;color:#94a3b8;">creditoycobro@cofersa.cr · Tel. 2242-2900</p>
            <p style="margin:0;font-size:10px;color:#b0bac5;line-height:1.6;">
              La información suministrada a través de este trámite es tratada bajo los términos de la Ley N.° 8968,
              de Protección de la Persona frente al Tratamiento de sus Datos Personales, y se utiliza únicamente
              para la actualización de su expediente comercial en Cofersa S.A.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""  # noqa: E501


def asunto_garantia_a_firmar(cliente_nombre: str) -> str:
    return f"[Auditoría y Control Legal] Garantía a firmar — {cliente_nombre}"


def html_garantia_a_firmar(
    *,
    cliente_nombre: str,
    contribuyente: str,
    tipo_titulo: str,
    monto_texto: str,
    vencimiento_texto: str,
    fecha_texto: str,
) -> str:
    return f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Nunito',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);width:100%;max-width:780px;">
        <tr><td style="background:#003B5C;padding:20px 32px;">
          <p style="margin:0;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">AUDITORÍA Y CONTROL LEGAL</p>
          <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:800;">Garantía para entregar a firma</h1>
        </td></tr>
        <tr><td style="padding:20px 32px 0;">
          <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Cliente</p>
          <p style="margin:0;font-size:18px;font-weight:800;color:#1e293b;">{escape(cliente_nombre)}</p>
          <p style="margin:2px 0 0;font-size:12px;color:#94a3b8;font-family:monospace;">{escape(contribuyente)}</p>
        </td></tr>
        <tr><td style="padding:16px 32px 0;">
          <p style="margin:0;font-size:12px;color:#475569;"><strong>Tipo de título:</strong> {escape(tipo_titulo)}</p>
          <p style="margin:6px 0 0;font-size:12px;color:#475569;"><strong>Monto:</strong> {monto_texto}</p>
          <p style="margin:6px 0 0;font-size:12px;color:#475569;"><strong>Vencimiento:</strong> {vencimiento_texto}</p>
        </td></tr>
        <tr><td style="padding:20px 32px 28px;">
          <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">Por favor gestionar la firma con el cliente y devolver el documento firmado al analista correspondiente.</p>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">SIC Cofersa · Auditoría y Control Legal · {fecha_texto}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""  # noqa: E501
