// src/lib/reportes/email-presupuesto-general.ts
// Correo GENERAL de Presupuesto de Cobro (un solo envío a todo el equipo al
// congelar el mes) -- tabla simple sin lenguaje de avance/proyección, ya que
// se manda el día 1 antes de que haya cualquier recaudo. Gmail-safe.

import { fmtCRC } from '@/lib/utils/formato';
import type { RemitenteCorreo } from '@/lib/reportes/email-vendedor';

const NAVY = '#003B5C';
const CYAN = '#009ee3';
const LOGO = 'https://cyc-cartera-cofersa.vercel.app/logo-cofersa.png';

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface FilaPresupuestoGeneral {
  vendedor_cod: string;
  agente_nombre: string; // ya incluye a los demás miembros si es una ruta de portafolio acotado
  meta: number;
}

export function asuntoPresupuestoGeneral(mesLabel: string): string {
  return `SIC · Presupuesto de Cobro — ${mesLabel}`;
}

export function htmlPresupuestoGeneral(
  filas: FilaPresupuestoGeneral[],
  metaTotal: number,
  mesLabel: string,
  rem: RemitenteCorreo,
): string {
  const tdN =
    'border:1px solid #DEE2E6;padding:6px 8px;text-align:right;font-size:11px;white-space:nowrap;';
  const tdT = 'border:1px solid #DEE2E6;padding:6px 8px;text-align:left;font-size:11px;';
  const tdC =
    'border:1px solid #DEE2E6;padding:6px 8px;text-align:center;font-size:10px;white-space:nowrap;color:#64748b;font-family:monospace;';

  const ordenadas = [...filas].sort((a, b) => b.meta - a.meta);

  const cuerpo = ordenadas
    .map((f, i) => {
      const peso = metaTotal > 0 ? (f.meta / metaTotal) * 100 : 0;
      return `
    <tr style="background:${i % 2 === 0 ? '#FBFBFB' : '#fff'};">
      <td style="${tdC}">${esc(f.vendedor_cod)}</td>
      <td style="${tdT}">${esc(f.agente_nombre)}</td>
      <td style="${tdN}font-weight:bold;color:${NAVY};">${fmtCRC(f.meta)}</td>
      <td style="${tdN}">${peso.toFixed(1)}%</td>
    </tr>`;
    })
    .join('');

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:820px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="background:${NAVY};padding:14px 18px;border-radius:6px 6px 0 0;">
          <div style="font-size:10px;color:#A8C4E0;letter-spacing:1px;text-transform:uppercase;">SIC · Sistema Inteligente de Cobranza — Cofersa</div>
          <div style="font-size:18px;color:#fff;font-weight:bold;">Presupuesto de Cobro</div>
          <div style="font-size:12px;color:#A8C4E0;margin-top:2px;">${esc(mesLabel)}</div>
        </td>
        <td style="background:${CYAN};width:8px;border-radius:0 6px 0 0;"></td>
      </tr>
    </table>

    <p style="font-size:12.5px;margin:14px 0 10px;">Buenas tardes a todos,</p>
    <p style="font-size:12.5px;margin:0 0 14px;">Adjunto el presupuesto de cobro correspondiente al mes de <b>${esc(mesLabel)}</b>.</p>

    <table style="border-collapse:collapse;width:100%;">
      <thead><tr>
        <th style="background:${NAVY};color:#fff;padding:7px 8px;text-align:center;font-size:10px;text-transform:uppercase;">Ruta</th>
        <th style="background:${NAVY};color:#fff;padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase;">Agente de Ventas</th>
        <th style="background:${NAVY};color:#fff;padding:7px 8px;text-align:right;font-size:10px;text-transform:uppercase;">Ppto ${esc(mesLabel.split(' ')[0])}</th>
        <th style="background:${NAVY};color:#fff;padding:7px 8px;text-align:right;font-size:10px;text-transform:uppercase;">Peso</th>
      </tr></thead>
      <tbody>${cuerpo}</tbody>
      <tfoot>
        <tr style="background:#EEF2F7;font-weight:bold;color:${NAVY};">
          <td colspan="2" style="${tdT}font-weight:bold;color:${NAVY};">TOTAL</td>
          <td style="${tdN}font-weight:bold;color:${NAVY};">${fmtCRC(metaTotal)}</td>
          <td style="${tdN}font-weight:bold;color:${NAVY};">100%</td>
        </tr>
      </tfoot>
    </table>

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
