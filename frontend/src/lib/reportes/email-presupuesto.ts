// src/lib/reportes/email-presupuesto.ts
// Correo de avance de presupuesto por vendedor (Gmail-safe). Branding SIC.

import { fmtCRC } from '@/lib/utils/formato';
import type { RemitenteCorreo } from '@/lib/reportes/email-vendedor';
import type { RecupVendedor } from '@/types/presupuesto';

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

export function asuntoPresupuesto(v: RecupVendedor, mesLabel: string, esCierre = false): string {
  const pct = v.pct ?? 0;
  if (esCierre)
    return `SIC · Resultado de Cierre — Meta de Cobranza — ${v.vendedor_nombre.toUpperCase()} — ${mesLabel} (${pct}%)`;
  return `SIC · Avance de Presupuesto — ${v.vendedor_nombre.toUpperCase()} — ${mesLabel} (${pct}%)`;
}

export function htmlPresupuestoVendedor(
  v: RecupVendedor,
  mesLabel: string,
  rem: RemitenteCorreo,
  esCierre = false,
): string {
  const pct = v.pct ?? 0;
  const pctProy = v.pct_proyectado ?? 0;
  const faltante = Math.round(v.meta - v.cobrado);
  const tdN =
    'border:1px solid #DEE2E6;padding:6px 8px;text-align:right;font-size:11px;white-space:nowrap;';
  const tdT = 'border:1px solid #DEE2E6;padding:6px 8px;text-align:left;font-size:11px;';

  const kpi = (label: string, valor: string, color: string, bg: string) => `
    <td width="25%" style="padding-right:8px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #DDD;border-radius:6px;">
        <tr><td style="background:${bg};padding:7px 12px;border-bottom:1px solid #DDD;border-radius:6px 6px 0 0;text-align:center;">
          <div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.4px;">${label}</div>
        </td></tr>
        <tr><td style="padding:8px 12px;text-align:center;"><span style="font-size:16px;font-weight:800;color:${color};">${valor}</span></td></tr>
      </table>
    </td>`;

  const tdCod =
    'border:1px solid #DEE2E6;padding:6px 8px;text-align:center;font-size:10px;white-space:nowrap;color:#64748b;font-family:monospace;';
  const filas = (v.clientes ?? [])
    .filter((c) => c.meta > 0)
    .map(
      (c, i) => `
    <tr style="background:${i % 2 === 0 ? '#FBFBFB' : '#fff'};">
      <td style="${tdCod}">${esc(c.cliente_cod)}</td>
      <td style="${tdT}">${esc(c.cliente_nombre)}</td>
      <td style="${tdN}">${fmtCRC(c.meta)}</td>
      <td style="${tdN}font-weight:bold;color:${VERDE};">${c.cobrado > 0 ? fmtCRC(c.cobrado) : '—'}</td>
      <td style="${tdN}font-weight:bold;color:${colPct(c.pct)};">${c.pct === null ? '—' : c.pct + '%'}</td>
    </tr>`,
    )
    .join('');

  const titulo = esCierre
    ? 'Resultado de Cierre — Meta de Cobranza'
    : 'Avance de Presupuesto de Cobro';
  const intro = esCierre
    ? `Estimado(a) ${esc(v.vendedor_nombre)}, este es el resultado final de cobranza del mes:`
    : `Estimado(a) ${esc(v.vendedor_nombre)}, este es su avance de cobro del mes vs la meta asignada:`;

  const kpi4 = esCierre
    ? kpi(
        'Faltante',
        faltante <= 0 ? 'Superada' : fmtCRC(faltante),
        faltante <= 0 ? VERDE : ROJO,
        faltante <= 0 ? '#F0FFF4' : '#FFF5F5',
      )
    : kpi('Proyección cierre', fmtCRC(v.proyeccion), CYAN, '#F0F9FF');

  const bloqueMensaje = esCierre
    ? `<div style="background:${pct >= 100 ? '#F0FFF4' : '#FFF5F5'};border:1px solid ${pct >= 100 ? '#A8DFC0' : '#FECACA'};border-radius:8px;padding:10px 14px;font-size:12.5px;margin-bottom:14px;">
      Tu resultado final del mes fue <b style="color:${colPct(v.pct)};">${fmtCRC(v.cobrado)}</b>
      (<b>${pct}%</b> de la meta). ${pct >= 100 ? '¡Felicidades, superaste la meta!' : 'La meta no fue alcanzada. A mejorar el próximo mes.'}
    </div>`
    : `<div style="background:${pctProy >= 100 ? '#F0FFF4' : '#FFF8EC'};border:1px solid ${pctProy >= 100 ? '#A8DFC0' : '#F0DFA0'};border-radius:8px;padding:10px 14px;font-size:12.5px;margin-bottom:14px;">
      Al ritmo actual, proyectás cerrar en <b style="color:${colPct(v.pct_proyectado)};">${fmtCRC(v.proyeccion)}</b>
      (<b>${pctProy}%</b> de la meta). ${pctProy >= 100 ? '¡Vas por buen camino, a mantener el ritmo!' : 'Hay que acelerar la gestión para alcanzar la meta.'}
    </div>`;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:900px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="background:${NAVY};padding:14px 18px;border-radius:6px 6px 0 0;">
          <div style="font-size:10px;color:#A8C4E0;letter-spacing:1px;text-transform:uppercase;">SIC · Sistema Inteligente de Cobranza — Cofersa</div>
          <div style="font-size:18px;color:#fff;font-weight:bold;">${titulo}</div>
          <div style="font-size:12px;color:#A8C4E0;margin-top:2px;">Vendedor: <b style="color:#fff;">${esc(v.vendedor_nombre)}</b> &nbsp;|&nbsp; ${esc(mesLabel)}</div>
        </td>
        <td style="background:#F4A61C;width:8px;border-radius:0 6px 0 0;"></td>
      </tr>
    </table>

    <p style="font-size:12.5px;margin:14px 0 10px;">${intro}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px;"><tr>
      ${kpi('Meta del mes', fmtCRC(v.meta), NAVY, '#F0F6FF')}
      ${kpi('Cobrado', fmtCRC(v.cobrado), VERDE, '#F0FFF4')}
      ${kpi(esCierre ? '% Cumplimiento' : '% Avance', `${pct}%`, colPct(v.pct), '#FFF8EC')}
      ${kpi4}
    </tr></table>

    ${bloqueMensaje}

    ${
      filas
        ? `
    <p style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 6px;">Detalle por cliente</p>
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr>
        <th style="background:${NAVY};color:#fff;padding:7px 8px;text-align:center;font-size:10px;text-transform:uppercase;">Código</th>
        <th style="background:${NAVY};color:#fff;padding:7px 8px;text-align:center;font-size:10px;text-transform:uppercase;">Cliente</th>
        <th style="background:${NAVY};color:#fff;padding:7px 8px;text-align:center;font-size:10px;text-transform:uppercase;">Meta</th>
        <th style="background:${NAVY};color:#fff;padding:7px 8px;text-align:center;font-size:10px;text-transform:uppercase;">Cobrado</th>
        <th style="background:${NAVY};color:#fff;padding:7px 8px;text-align:center;font-size:10px;text-transform:uppercase;">% Avance</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>`
        : ''
    }

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
