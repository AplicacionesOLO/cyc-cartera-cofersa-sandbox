// src/lib/reportes/email-vendedor.ts
// Constructores de HTML para los correos por vendedor (Gmail-safe, inline CSS).
// Branding SIC — Sistema Inteligente de Cobranza · Cofersa.

import { fmtCRC } from '@/lib/utils/formato';
import type {
  BloqueadosVendedor,
  BloqueadosResult,
  PlazoEspecialVendedor,
  PlazoEspecialFactura,
} from '@/types/reportes';

const NAVY = '#003B5C';
const CYAN = '#009ee3';
const ROJO = '#C00000';
const NARANJA = '#E36C00';
const VERDE = '#1A7A40';
const LOGO = 'https://cyc-cartera-cofersa.vercel.app/logo-cofersa.png';

export interface RemitenteCorreo {
  nombre: string;
  puesto: string;
  telefono?: string | null;
  whatsapp?: string | null;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function th(label: string, align = 'center'): string {
  return `<th style="background:${NAVY};color:#fff;border:1px solid #1a2f55;padding:7px 8px;text-align:${align};font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;">${label}</th>`;
}

// ── Cabecera de marca SIC ─────────────────────────────────────────────────
function header(titulo: string, sub: string): string {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      <td style="background:${NAVY};padding:14px 18px;border-radius:6px 6px 0 0;">
        <div style="font-size:10px;color:#A8C4E0;letter-spacing:1px;text-transform:uppercase;">SIC · Sistema Inteligente de Cobranza — Cofersa</div>
        <div style="font-size:18px;color:#fff;font-weight:bold;margin-top:1px;">${titulo}</div>
        <div style="font-size:12px;color:#A8C4E0;margin-top:2px;">${sub}</div>
      </td>
      <td style="background:#F4A61C;width:8px;border-radius:0 6px 0 0;"></td>
    </tr>
  </table>`;
}

// ── Firma del remitente + nota SIC ────────────────────────────────────────
function firma(r: RemitenteCorreo): string {
  const contacto = [
    r.telefono ? `Tel: ${esc(r.telefono)}` : null,
    r.whatsapp ? `WhatsApp: ${esc(r.whatsapp)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return `
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:18px;">
    <tr>
      <td valign="middle" style="padding-right:14px;border-right:2px solid ${NAVY};">
        <img src="${LOGO}" alt="Cofersa" style="display:block;height:42px;width:auto;">
      </td>
      <td valign="middle" style="padding-left:14px;font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:15px;font-weight:700;color:#1a1a1a;line-height:1.2;">${esc(r.nombre)}</div>
        <div style="font-size:12px;color:#555;">${esc(r.puesto)}</div>
        <div style="font-size:12px;color:#555;">Cofersa${contacto ? ' · ' + contacto : ''}</div>
      </td>
    </tr>
  </table>
  <div style="margin-top:12px;font-size:10px;color:#94a3b8;border-top:1px solid #eee;padding-top:8px;">
    Reporte generado automáticamente desde <b style="color:${CYAN};">SIC</b> — Sistema Inteligente de Cobranza · Cofersa.
    Para consultas sobre este reporte, responda a este correo.
  </div>`;
}

// ── Tarjetas KPI (3 columnas) ─────────────────────────────────────────────
function kpiCards(cards: { label: string; valor: string; color?: string; bg?: string }[]): string {
  const celdas = cards
    .map(
      (c, i) => `
    <td width="33%" style="${i < cards.length - 1 ? 'padding-right:8px;' : ''}">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #DDD;border-radius:6px;">
        <tr><td style="background:${c.bg ?? '#F0F6FF'};padding:8px 14px;border-bottom:1px solid #DDD;border-radius:6px 6px 0 0;">
          <div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.5px;">${c.label}</div>
        </td></tr>
        <tr><td style="padding:9px 14px;">
          <span style="font-size:20px;font-weight:800;color:${c.color ?? NAVY};">${c.valor}</span>
        </td></tr>
      </table>
    </td>`,
    )
    .join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0 14px;"><tr>${celdas}</tr></table>`;
}

// ══════════════════════════════════════════════════════════════════════
// CLIENTES BLOQUEADOS
// ══════════════════════════════════════════════════════════════════════

export function asuntoBloqueados(v: BloqueadosVendedor, fechaStr: string): string {
  return `SIC · Clientes Bloqueados — ${v.vendedor_nombre.toUpperCase()} — ${fechaStr}`;
}

export function htmlBloqueadosVendedor(
  v: BloqueadosVendedor,
  fechaStr: string,
  rem: RemitenteCorreo,
): string {
  const tdN =
    'border:1px solid #DEE2E6;padding:6px 8px;text-align:right;font-size:11px;white-space:nowrap;';
  const tdT = 'border:1px solid #DEE2E6;padding:6px 8px;text-align:left;font-size:11px;';
  const tdC =
    'border:1px solid #DEE2E6;padding:6px 8px;text-align:center;font-size:11px;white-space:nowrap;';

  const filas = v.clientes
    .map((c, i) => {
      const crit = c.m120 > 0;
      const bg = crit ? '#FFF3E0' : i % 2 === 0 ? '#FBFBFB' : '#FFFFFF';
      const semBadge = c.es_nuevo
        ? '<span style="background:#28A745;color:#fff;font-weight:700;padding:1px 6px;border-radius:3px;font-size:10px;">NUEVO</span>'
        : `<span style="background:${c.semanas >= 3 ? ROJO : '#6C757D'};color:#fff;font-weight:700;padding:1px 6px;border-radius:3px;font-size:10px;">${c.semanas}</span>`;
      return `<tr style="background:${bg};">
      <td style="${tdN}">${esc(c.cliente_cod)}</td>
      <td style="${tdT}">${esc(c.cliente_nombre)}</td>
      <td style="${tdC}">${semBadge}</td>
      <td style="${tdN}">${c.no_vencido > 0 ? fmtCRC(c.no_vencido) : ''}</td>
      <td style="${tdN}">${c.m1_30 > 0 ? fmtCRC(c.m1_30) : ''}</td>
      <td style="${tdN}">${c.m31_60 > 0 ? fmtCRC(c.m31_60) : ''}</td>
      <td style="${tdN}">${c.m61_90 > 0 ? fmtCRC(c.m61_90) : ''}</td>
      <td style="${tdN}">${c.m91_120 > 0 ? fmtCRC(c.m91_120) : ''}</td>
      <td style="${tdN}${crit ? `color:${NARANJA};font-weight:800;` : ''}">${c.m120 > 0 ? fmtCRC(c.m120) : ''}</td>
      <td style="${tdN}">${c.total > 0 ? fmtCRC(c.total) : ''}</td>
      <td style="${tdN}font-weight:800;color:${ROJO};">${fmtCRC(c.saldo_vencido)}</td>
    </tr>`;
    })
    .join('');

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:980px;">
    ${header('Clientes Bloqueados', `Vendedor: <b style="color:#fff;">${esc(v.vendedor_nombre)}</b> &nbsp;|&nbsp; Corte: <b style="color:#fff;">${fechaStr}</b>`)}
    <p style="font-size:12.5px;margin:14px 0 10px;">Estimado(a) ${esc(v.vendedor_nombre)}, a continuación sus <b>clientes bloqueados</b> (saldo vencido ≥31 días):</p>
    ${kpiCards([
      { label: 'Clientes bloqueados', valor: `${v.n_clientes}`, color: NAVY },
      { label: 'Saldo vencido >30d', valor: fmtCRC(v.saldo_vencido), color: ROJO, bg: '#FFF4F0' },
      { label: 'Críticos >120 días', valor: `${v.criticos_120}`, color: NARANJA, bg: '#FFF8E7' },
    ])}
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr>
        ${th('Código', 'right')}${th('Cliente', 'left')}${th('Sem.')}
        ${th('No venc.', 'right')}${th('1-30d', 'right')}${th('31-60d', 'right')}
        ${th('61-90d', 'right')}${th('91-120d', 'right')}${th('+120d', 'right')}
        ${th('Total', 'right')}${th('Saldo venc. >30d', 'right')}
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <p style="color:#666;font-size:11px;margin-top:10px;">Las filas en naranja corresponden a clientes con saldo mayor a 120 días. La columna SEM. indica semanas consecutivas bloqueado (NUEVO = primera vez).</p>
    ${firma(rem)}
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════
// RESUMEN GERENCIAL — CLIENTES BLOQUEADOS (para gerencia/tesorería)
// ══════════════════════════════════════════════════════════════════════

export function asuntoResumenGerencialBloqueados(fechaStr: string): string {
  return `SIC · Resumen Gerencial — Clientes Bloqueados — ${fechaStr}`;
}

// Cuerpo compacto para gerencia: KPIs + ranking por vendedor + Top 10 de
// clientes crónicos (≥3 semanas) por saldo vencido. El detalle completo se
// consulta en el SIC (link al final) — no se satura el correo.
export function htmlResumenGerencialBloqueados(
  data: BloqueadosResult,
  fechaStr: string,
  rem: RemitenteCorreo,
): string {
  const tdN =
    'border:1px solid #DEE2E6;padding:6px 8px;text-align:right;font-size:11px;white-space:nowrap;';
  const tdT = 'border:1px solid #DEE2E6;padding:6px 8px;text-align:left;font-size:11px;';
  const tdC =
    'border:1px solid #DEE2E6;padding:6px 8px;text-align:center;font-size:11px;white-space:nowrap;';

  const filasRanking = data.gerencial
    .map((g, i) => {
      const pct =
        data.kpis.saldo_vencido_total > 0
          ? Math.round((g.saldo_vencido / data.kpis.saldo_vencido_total) * 1000) / 10
          : 0;
      return `<tr style="background:${i % 2 === 0 ? '#FBFBFB' : '#FFFFFF'};">
      <td style="${tdC}color:#94a3b8;font-weight:700;">${i + 1}</td>
      <td style="${tdT}font-weight:600;">${esc(g.vendedor_nombre)}</td>
      <td style="${tdN}">${g.n_clientes}</td>
      <td style="${tdN}font-weight:800;color:${ROJO};">${fmtCRC(g.saldo_vencido)}</td>
      <td style="${tdN}color:#64748b;">${pct}%</td>
      <td style="${tdN}${g.criticos_120 > 0 ? `color:${NARANJA};font-weight:800;` : 'color:#cbd5e1;'}">${g.criticos_120 || '—'}</td>
    </tr>`;
    })
    .join('');

  const cronicos = [...data.escalacion].sort((a, b) => b.saldo_vencido - a.saldo_vencido);
  const top10 = cronicos.slice(0, 10);
  const filasTop = top10
    .map(
      (e, i) => `<tr style="background:${i % 2 === 0 ? '#FBFBFB' : '#FFFFFF'};">
      <td style="${tdN}">${esc(e.cliente_cod)}</td>
      <td style="${tdT}font-weight:600;">${esc(e.cliente_nombre)}</td>
      <td style="${tdT}">${esc(e.vendedor_nombre)}</td>
      <td style="${tdC}"><span style="background:${e.semanas >= 6 ? '#7B0000' : ROJO};color:#fff;font-weight:700;padding:1px 7px;border-radius:3px;font-size:10px;">${e.semanas} sem</span></td>
      <td style="${tdN}font-weight:800;color:${ROJO};">${fmtCRC(e.saldo_vencido)}</td>
    </tr>`,
    )
    .join('');

  const notaResto =
    cronicos.length > 10
      ? `<p style="color:#666;font-size:11px;margin:8px 0 0;">Se muestran los 10 clientes crónicos con mayor saldo vencido de un total de <b>${cronicos.length}</b>. La lista completa está disponible en el SIC.</p>`
      : '';

  const bloqueEscalacion =
    cronicos.length === 0
      ? `<p style="font-size:12px;color:#444;margin:6px 0 0;">Sin clientes en escalación (≥3 semanas consecutivas bloqueados) en este corte.</p>`
      : `<table style="border-collapse:collapse;width:100%;">
        <thead><tr>
          ${th('Código', 'right')}${th('Cliente', 'left')}${th('Vendedor', 'left')}${th('Semanas')}${th('Saldo venc. >30d', 'right')}
        </tr></thead>
        <tbody>${filasTop}</tbody>
      </table>${notaResto}`;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:860px;">
    ${header('Resumen Gerencial — Clientes Bloqueados', `Corte: <b style="color:#fff;">${fechaStr}</b> &nbsp;|&nbsp; ${data.kpis.total_vendedores} vendedores`)}
    ${kpiCards([
      { label: 'Clientes bloqueados', valor: `${data.kpis.total_bloqueados}`, color: NAVY },
      {
        label: 'Saldo vencido total',
        valor: fmtCRC(data.kpis.saldo_vencido_total),
        color: ROJO,
        bg: '#FFF4F0',
      },
      {
        label: 'Críticos >120 días',
        valor: `${data.kpis.criticos_120}`,
        color: NARANJA,
        bg: '#FFF8E7',
      },
    ])}

    <p style="font-size:12px;font-weight:700;color:${NAVY};margin:14px 0 6px;text-transform:uppercase;letter-spacing:0.04em;">Ranking por vendedor — saldo vencido >30d</p>
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr>
        ${th('#')}${th('Vendedor', 'left')}${th('Clientes', 'right')}${th('Saldo vencido >30d', 'right')}${th('% del total', 'right')}${th('Críticos >120', 'right')}
      </tr></thead>
      <tbody>${filasRanking}</tbody>
    </table>

    <p style="font-size:12px;font-weight:700;color:${ROJO};margin:16px 0 6px;text-transform:uppercase;letter-spacing:0.04em;">Escalación — Top 10 crónicos (≥3 semanas consecutivas bloqueados)</p>
    ${bloqueEscalacion}

    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16px;"><tr><td style="background:${CYAN};border-radius:6px;">
      <a href="https://cyc-cartera-cofersa.vercel.app/reportes/mora-vendedor" target="_blank"
         style="display:inline-block;padding:9px 18px;color:#fff;font-size:12px;font-weight:700;text-decoration:none;">
        Ver reporte completo en el SIC
      </a>
    </td></tr></table>

    ${firma(rem)}
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════
// FACTURAS PLAZO ESPECIAL
// ══════════════════════════════════════════════════════════════════════

export function asuntoPlazoEspecial(v: PlazoEspecialVendedor, fechaStr: string): string {
  return v.vencidas > 0
    ? `⚠ ATENCIÓN: ${v.vencidas} ${v.vencidas === 1 ? 'factura VENCIDA' : 'facturas VENCIDAS'} (Plazo Especial) – ${v.vendedor_nombre} – ${fechaStr}`
    : `✓ Facturas Plazo Especial al día – ${v.vendedor_nombre} – ${fechaStr}`;
}

function fmtFechaCorta(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function htmlPlazoEspecialVendedor(
  v: PlazoEspecialVendedor,
  fechaStr: string,
  rem: RemitenteCorreo,
): string {
  const tdN =
    'border:1px solid #DEE2E6;padding:5px 8px;text-align:right;font-size:11px;white-space:nowrap;';
  const tdT = 'border:1px solid #DEE2E6;padding:5px 8px;text-align:left;font-size:11px;';
  const tdC =
    'border:1px solid #DEE2E6;padding:5px 8px;text-align:center;font-size:11px;white-space:nowrap;';

  // ── Agrupar facturas por cliente; clientes con vencidas primero ──────────
  // Se consolida por contribuyente, pero se MUESTRA el código de cliente (más fácil
  // de identificar para el equipo — así lo hacía el GAS original).
  const grupos = new Map<
    string,
    { nombre: string; cod: string; facturas: PlazoEspecialFactura[] }
  >();
  for (const f of v.facturas) {
    const key = f.contribuyente || f.cliente_nombre;
    if (!grupos.has(key))
      grupos.set(key, { nombre: f.cliente_nombre, cod: f.cliente_cod, facturas: [] });
    grupos.get(key)!.facturas.push(f);
  }
  const clientes = [...grupos.values()].sort((a, b) => {
    const va = a.facturas.some((f) => f.vencida) ? 0 : 1;
    const vb = b.facturas.some((f) => f.vencida) ? 0 : 1;
    return va - vb || a.nombre.localeCompare(b.nombre);
  });

  const cuerpo = clientes
    .map((cli) => {
      const vencidasCli = cli.facturas.filter((f) => f.vencida).length;
      const saldoCli = cli.facturas.reduce((s, f) => s + f.saldo, 0);
      const badge =
        vencidasCli > 0
          ? `<span style="background:${ROJO};color:#fff;font-size:10px;font-weight:bold;padding:1px 7px;border-radius:10px;">⚠ ${vencidasCli} vencida(s)</span>`
          : `<span style="background:${VERDE};color:#fff;font-size:10px;font-weight:bold;padding:1px 7px;border-radius:10px;">✓ Al día</span>`;
      const headerCli = `<tr style="background:${NAVY};">
      <td colspan="8" style="padding:6px 10px;font-size:11px;font-weight:bold;color:#fff;border-top:3px solid #F4A61C;">
        ${esc(cli.nombre)} <span style="color:#A8C4E0;font-weight:normal;">| Cód: ${esc(cli.cod)} · ${cli.facturas.length} ${cli.facturas.length === 1 ? 'factura' : 'facturas'}</span>
        &nbsp; ${badge}
        <span style="float:right;color:#fff;">Saldo: ${fmtCRC(saldoCli)}</span>
      </td></tr>`;
      const filasCli = cli.facturas
        .map((f, i) => {
          const est = f.vencida
            ? { bg: '#FFF0F0', badge: ROJO, label: 'VENCIDA' }
            : f.dias_a_vencer <= 7
              ? { bg: '#FFFBF0', badge: NARANJA, label: 'PRÓXIMA' }
              : { bg: i % 2 === 0 ? '#FBFBFB' : '#FFFFFF', badge: VERDE, label: 'AL DÍA' };
          const diasTxt = f.vencida
            ? `<span style="color:${ROJO};font-weight:bold;">${f.dias_a_vencer} d</span>`
            : `<span style="color:${f.dias_a_vencer <= 7 ? NARANJA : VERDE};">+${f.dias_a_vencer} d</span>`;
          return `<tr style="background:${est.bg};">
        <td style="${tdT}font-style:italic;color:#555;padding-left:18px;">${esc(f.documento)}</td>
        <td style="${tdC}">${fmtFechaCorta(f.fecha_emision)}</td>
        <td style="${tdC}font-weight:bold;">${fmtFechaCorta(f.fecha_vencimiento)}</td>
        <td style="${tdC}">${f.plazo_factura} d</td>
        <td style="${tdC}">${f.plazo_cliente} d</td>
        <td style="${tdN}">${fmtCRC(f.monto)}</td>
        <td style="${tdN}font-weight:bold;">${fmtCRC(f.saldo)}</td>
        <td style="${tdC}">${diasTxt} &nbsp;<span style="background:${est.badge};color:#fff;font-size:9px;font-weight:bold;padding:1px 6px;border-radius:10px;">${est.label}</span></td>
      </tr>`;
        })
        .join('');
      return headerCli + filasCli;
    })
    .join('');

  const cierre =
    v.vencidas > 0
      ? `<p style="font-size:12px;color:${ROJO};font-weight:bold;margin:12px 0 4px;">⚠ Hay ${v.vencidas} ${v.vencidas === 1 ? 'factura vencida' : 'facturas vencidas'} que requieren atención inmediata para evitar bloqueos al cliente.</p>`
      : `<p style="font-size:12px;color:#444;margin:12px 0 4px;">Todos los documentos se encuentran al día. Dar seguimiento oportuno para mantener esta condición.</p>`;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:1000px;">
    ${header('Facturas con Plazo Especial', `Vendedor: <b style="color:#fff;">${esc(v.vendedor_nombre)}</b> &nbsp;|&nbsp; Corte: <b style="color:#fff;">${fechaStr}</b>`)}
    ${kpiCards([
      { label: 'Total documentos', valor: `${v.n_facturas}`, color: NAVY },
      {
        label: 'Facturas vencidas',
        valor: `${v.vencidas}`,
        color: v.vencidas > 0 ? ROJO : VERDE,
        bg: v.vencidas > 0 ? '#FFF0F0' : '#F0FFF4',
      },
      { label: 'Saldo total CRC', valor: fmtCRC(v.saldo_total), color: NAVY, bg: '#FFF8EC' },
    ])}
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr>
        ${th('Factura', 'left')}${th('Emisión')}${th('Vence')}
        ${th('Plazo Fac.')}${th('Plazo Cli.')}${th('Monto', 'right')}${th('Saldo', 'right')}
        ${th('Días / Estado')}
      </tr></thead>
      <tbody>${cuerpo}</tbody>
    </table>
    ${cierre}
    ${firma(rem)}
  </div>`;
}
