// src/lib/reportes/email-recuperacion-gerencia.ts
// Correo CONSOLIDADO de avance de cobranza para gerencia (una sola tabla, todos los
// vendedores). Gmail-safe, branding SIC. Reutiliza el endpoint de envío de reportes (POST /reportes/enviar).

import { fmtCRC } from '@/lib/utils/formato';
import type { RemitenteCorreo } from '@/lib/reportes/email-vendedor';
import type { RecuperacionResult } from '@/types/presupuesto';

const NAVY = '#003B5C';
const CYAN = '#009ee3';
const VERDE = '#16a34a';
const ROJO = '#dc2626';
const LOGO = 'https://cyc-cartera-cofersa.vercel.app/logo-cofersa.png';

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function colPct(p: number | null): string {
  if (p === null) return '#94a3b8';
  return p >= 90 ? VERDE : p >= 60 ? '#f59e0b' : ROJO;
}
/** Faltante: si es negativo (sobrecumplió) lo mostramos entre paréntesis, como en el Excel de gerencia. */
function fmtFaltante(n: number): string {
  return n < 0 ? `(${fmtCRC(-n)})` : fmtCRC(n);
}

export function asuntoRecupGerencia(mesLabel: string, pctGlobal: number, esCierre = false): string {
  if (esCierre)
    return `SIC · Resultado de Cierre — Cobranza Consolidada — ${mesLabel} (${pctGlobal}%)`;
  return `SIC · Resumen de Cobranza Consolidado — ${mesLabel} (${pctGlobal}%)`;
}

function barraAvance(pct: number, pctProy: number): string {
  const colorActual = pct >= 90 ? VERDE : pct >= 60 ? '#f59e0b' : ROJO;
  const actual = Math.min(Math.round(pct), 100);
  const proy = Math.min(Math.round(pctProy), 100);
  const extra = Math.max(0, proy - actual);
  const rest = Math.max(0, 100 - actual - extra);

  const cells = [
    actual > 0 ? `<td width="${actual}%" style="background:${colorActual};height:18px;"></td>` : '',
    extra > 0 ? `<td width="${extra}%"  style="background:#BAE6FD;height:18px;"></td>` : '',
    rest > 0 ? `<td style="background:#E2E8F0;height:18px;"></td>` : '',
  ].join('');

  return `
  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px 14px;margin-bottom:14px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="font-size:11px;font-weight:600;color:#475569;padding-bottom:6px;">Avance de Recaudo</td>
        <td style="text-align:right;font-size:11px;color:#475569;padding-bottom:6px;white-space:nowrap;">
          <span style="font-weight:700;color:${colorActual};">${pct}%</span> cobrado
          &nbsp;·&nbsp;
          proyectado <span style="font-weight:700;color:${CYAN};">${pctProy}%</span>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>${cells}</tr>
    </table>
    <div style="font-size:9px;color:#94a3b8;margin-top:5px;">
      <span style="color:${colorActual};">&#9612;</span> Barra sólida = cobrado &nbsp;&nbsp;
      <span style="color:#BAE6FD;">&#9612;</span> Barra clara = proyección de cierre
    </div>
  </div>`;
}

export function htmlRecupGerencia(
  data: RecuperacionResult,
  mesLabel: string,
  rem: RemitenteCorreo,
  esCierre = false,
): string {
  const k = data.kpis;
  const tdN =
    'border:1px solid #DEE2E6;padding:6px 8px;text-align:right;font-size:11px;white-space:nowrap;';
  const tdT = 'border:1px solid #DEE2E6;padding:6px 8px;text-align:left;font-size:11px;';

  const filas = (data.vendedores ?? [])
    .filter((v) => v.meta > 0)
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
    .map((v, i) => {
      const faltante = Math.round(v.meta - v.cobrado);
      return `
      <tr style="background:${i % 2 === 0 ? '#FBFBFB' : '#fff'};">
        <td style="${tdT}">${esc(v.vendedor_nombre)}</td>
        <td style="${tdN}">${fmtCRC(v.meta)}</td>
        <td style="${tdN}font-weight:bold;color:${VERDE};">${fmtCRC(v.cobrado)}</td>
        <td style="${tdN}color:${faltante < 0 ? VERDE : '#475569'};">${fmtFaltante(faltante)}</td>
        <td style="${tdN}font-weight:bold;color:${colPct(v.pct)};">${v.pct === null ? '—' : v.pct + '%'}</td>
      </tr>`;
    })
    .join('');

  const faltanteTotal = Math.round(k.meta_total - k.cobrado_total);

  const kpi = (label: string, valor: string, color: string, bg: string) => `
    <td width="25%" style="padding-right:8px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #DDD;border-radius:6px;">
        <tr><td style="background:${bg};padding:7px 12px;border-bottom:1px solid #DDD;border-radius:6px 6px 0 0;text-align:center;">
          <div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.4px;">${label}</div>
        </td></tr>
        <tr><td style="padding:8px 12px;text-align:center;"><span style="font-size:16px;font-weight:800;color:${color};">${valor}</span></td></tr>
      </table>
    </td>`;

  const titulo = esCierre
    ? 'Resultado de Cierre — Cobranza Consolidada'
    : 'Resumen de Cobranza Consolidado';
  const subtitulo = esCierre
    ? `${esc(mesLabel)} &nbsp;|&nbsp; Cierre del mes`
    : `${esc(mesLabel)} &nbsp;|&nbsp; avance al ${k.dias_transcurridos}/${k.dias_mes} días hábiles del mes`;
  const intro = esCierre
    ? 'Resultado final de recaudo del mes vs el presupuesto de cobro, por vendedor:'
    : 'Resumen del avance de recaudo del mes vs el presupuesto de cobro, por vendedor:';

  const kpi4 = esCierre
    ? kpi(
        'Faltante',
        faltanteTotal <= 0 ? 'Superada' : fmtCRC(faltanteTotal),
        faltanteTotal <= 0 ? VERDE : ROJO,
        faltanteTotal <= 0 ? '#F0FFF4' : '#FFF5F5',
      )
    : kpi('Proyección cierre', fmtCRC(k.proyeccion_fin_mes), CYAN, '#F0F9FF');

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:900px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="background:${NAVY};padding:14px 18px;border-radius:6px 6px 0 0;">
          <div style="font-size:10px;color:#A8C4E0;letter-spacing:1px;text-transform:uppercase;">SIC · Sistema Inteligente de Cobranza — Cofersa</div>
          <div style="font-size:18px;color:#fff;font-weight:bold;">${titulo}</div>
          <div style="font-size:12px;color:#A8C4E0;margin-top:2px;">${subtitulo}</div>
        </td>
        <td style="background:#F4A61C;width:8px;border-radius:0 6px 0 0;"></td>
      </tr>
    </table>

    <p style="font-size:12.5px;margin:14px 0 10px;">${intro}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:12px;"><tr>
      ${kpi('Meta del mes', fmtCRC(k.meta_total), NAVY, '#F0F6FF')}
      ${kpi('Cobrado', fmtCRC(k.cobrado_total), VERDE, '#F0FFF4')}
      ${kpi(esCierre ? '% Cumplimiento' : '% Avance global', `${k.pct}%`, colPct(k.pct), '#FFF8EC')}
      ${kpi4}
    </tr></table>

    ${esCierre ? '' : barraAvance(k.pct, k.pct_proyectado)}

    <table style="border-collapse:collapse;width:100%;">
      <thead><tr>
        <th style="background:${NAVY};color:#fff;padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase;">Cobrador</th>
        <th style="background:${NAVY};color:#fff;padding:7px 8px;text-align:right;font-size:10px;text-transform:uppercase;">Ppto Cobro</th>
        <th style="background:${NAVY};color:#fff;padding:7px 8px;text-align:right;font-size:10px;text-transform:uppercase;">Monto Cobrado</th>
        <th style="background:${NAVY};color:#fff;padding:7px 8px;text-align:right;font-size:10px;text-transform:uppercase;">Monto Faltante</th>
        <th style="background:${NAVY};color:#fff;padding:7px 8px;text-align:right;font-size:10px;text-transform:uppercase;">% Alcance</th>
      </tr></thead>
      <tbody>${filas}</tbody>
      <tfoot>
        <tr style="background:#EEF2F7;font-weight:bold;color:${NAVY};">
          <td style="${tdT}font-weight:bold;color:${NAVY};">TOTAL</td>
          <td style="${tdN}font-weight:bold;color:${NAVY};">${fmtCRC(k.meta_total)}</td>
          <td style="${tdN}font-weight:bold;color:${VERDE};">${fmtCRC(k.cobrado_total)}</td>
          <td style="${tdN}font-weight:bold;color:${faltanteTotal < 0 ? VERDE : NAVY};">${fmtFaltante(faltanteTotal)}</td>
          <td style="${tdN}font-weight:bold;color:${colPct(k.pct)};">${k.pct}%</td>
        </tr>
      </tfoot>
    </table>

    <p style="font-size:10px;color:#94a3b8;margin-top:8px;">Monto Faltante = Ppto Cobro − Monto Cobrado. Los valores entre paréntesis indican vendedores que ya superaron su meta.</p>

    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:18px;">
      <tr>
        <td valign="middle" style="padding-right:14px;border-right:2px solid ${NAVY};">
          <img src="${LOGO}" alt="Cofersa" style="display:block;height:42px;">
        </td>
        <td valign="middle" style="padding-left:14px;">
          <div style="font-size:15px;font-weight:700;color:#1a1a1a;">${esc(rem.nombre)}</div>
          <div style="font-size:12px;color:#555;">${esc(rem.puesto)}</div>
          <div style="font-size:12px;color:#555;">Cofersa${rem.telefono ? ' · Tel: ' + esc(rem.telefono) : ''}</div>
        </td>
      </tr>
    </table>
    <div style="margin-top:12px;font-size:10px;color:#94a3b8;border-top:1px solid #eee;padding-top:8px;">
      Reporte generado automáticamente desde <b style="color:${CYAN};">SIC</b> — Sistema Inteligente de Cobranza · Cofersa.
    </div>
  </div>`;
}
