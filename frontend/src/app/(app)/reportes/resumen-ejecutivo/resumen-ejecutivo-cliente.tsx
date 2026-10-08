'use client';

import { useState } from 'react';
import {
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import type { ApiError } from '@/shared/api/api-error';
import { loadStaticBlob } from '@/shared/api/static-asset';
import { useEnvioReporte } from '@/views/reportes/hooks/use-envio-reporte-controller';
import { fmtCRC, fmtFecha } from '@/lib/utils/formato';
import ReporteShell from '@/components/reportes/ReporteShell';
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis';
import ICPBadge from '@/components/analisis-pagos/ICPBadge';
import DSOTendenciaCard from '@/components/coordinador/DSOTendenciaCard';
import TendenciaCarteraChart from '@/components/coordinador/TendenciaCarteraChart';
import { exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';
import type { ResumenEjecutivoData } from './page';
import type { ConcentracionRow } from '@/types/analisis-pagos';
import DirectorioInput from '@/components/ui/DirectorioInput';
import type { PdfFonts } from '@/lib/reportes/pdf-branding';

const TRAMOS = [
  { key: 'noVencido', label: 'Al día', color: '#16a34a' },
  { key: 'm130', label: '1-30d', color: '#d97706' },
  { key: 'm3160', label: '31-60d', color: '#ea580c' },
  { key: 'm6190', label: '61-90d', color: '#ef4444' },
  { key: 'm91120', label: '91-120d', color: '#dc2626' },
  { key: 'm120', label: '+120d', color: '#991b1b' },
] as const;

const COLUMNAS_TOP: ColumnaReporte[] = [
  { key: 'rank', label: '#', align: 'center', format: 'int', width: 12 },
  { key: 'cliente_nombre', label: 'Cliente', align: 'left', format: 'text', width: 70 },
  { key: 'vendedor_nombre', label: 'Vendedor', align: 'left', format: 'text', width: 50 },
  { key: 'mora_total', label: 'Mora total', align: 'right', format: 'crc', width: 38 },
  { key: 'pct_mora', label: '% Mora', align: 'right', format: 'pct', width: 20 },
  { key: 'pct_acumulado', label: '% Acumulado', align: 'right', format: 'pct', width: 24 },
];

// ── PDF helpers (module-level) ──────────────────────────────────────────────

function hexToRGB(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

async function loadImg(src: string): Promise<string | null> {
  try {
    const blob = await loadStaticBlob(src);
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function hoyCR(): string {
  const d = new Date(Date.now() - 6 * 3600_000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

interface Props {
  data: ResumenEjecutivoData;
  generadoPor: string;
}

export default function ResumenEjecutivoCliente({ data, generadoPor }: Props) {
  const enviarReporte = useEnvioReporte();
  const [exportando, setExportando] = useState(false);
  const [showEnviar, setShowEnviar] = useState(false);
  const [para, setPara] = useState('');
  const [cc, setCc] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [errEnvio, setErrEnvio] = useState<string | null>(null);
  const c = data.concentracion;

  const dsoColor = data.dso > 45 ? '#ef4444' : data.dso > 35 ? '#f59e0b' : '#16a34a';

  // ── Recaudo MoM ───────────────────────────────────────────────────────────
  const n = data.recaudoMeses.length;
  const recaudoActual = n > 0 ? data.recaudoMeses[n - 1] : null;
  const recaudoPrev = n > 1 ? data.recaudoMeses[n - 2] : null;
  const momDelta =
    recaudoActual && recaudoPrev && recaudoPrev.total > 0
      ? ((recaudoActual.total - recaudoPrev.total) / recaudoPrev.total) * 100
      : null;

  function htmlResumenEjecutivo(): string {
    const NAVY = '#003B5C',
      CYAN = '#009ee3';
    const dColor = data.dso > 45 ? '#ef4444' : data.dso > 35 ? '#f59e0b' : '#16a34a';

    // ── 5 KPI cards ──────────────────────────────────────────────────────
    const kpis = [
      {
        label: 'Cartera total',
        valor: fmtCRC(data.cartera),
        sub: `${data.nClientes} clientes`,
        color: NAVY,
      },
      { label: '% Mora', valor: `${data.pctMora}%`, sub: fmtCRC(data.mora), color: '#dc2626' },
      { label: 'DSO', valor: `${data.dso}d`, sub: 'días de cobro', color: dColor },
      {
        label: 'Vencido >30d',
        valor: `${data.pctVenc30}%`,
        sub: fmtCRC(data.venc30),
        color: '#ea580c',
      },
      {
        label: 'Clientes en mora',
        valor: `${data.nMora}`,
        sub: `de ${data.nClientes}`,
        color: '#f59e0b',
      },
    ];
    const kpiCells = kpis
      .map(
        (k) => `
      <td width="20%" style="padding:3px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-top:3px solid ${k.color};border-radius:6px;">
          <tr><td style="padding:8px 10px;text-align:center;">
            <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.4px;">${k.label}</div>
            <div style="font-size:17px;font-weight:800;color:${NAVY};margin-top:3px;">${k.valor}</div>
            <div style="font-size:9px;color:#94a3b8;margin-top:2px;">${k.sub}</div>
          </td></tr>
        </table>
      </td>`,
      )
      .join('');

    // ── Barra de aging ───────────────────────────────────────────────────
    const tramos = TRAMOS.map((t) => ({ ...t, val: data[t.key] as number }));
    const segs = tramos
      .filter((t) => t.val > 0)
      .map((t) => {
        const pct = data.cartera > 0 ? (t.val / data.cartera) * 100 : 0;
        return `<td style="background:${t.color};color:#fff;font-size:10px;font-weight:700;text-align:center;padding:7px 0;white-space:nowrap;" width="${pct.toFixed(2)}%">${pct >= 6 ? Math.round(pct) + '%' : ''}</td>`;
      })
      .join('');
    const leyenda = tramos
      .map(
        (t) => `
      <td style="padding:3px 10px 3px 0;font-size:10px;color:#555;white-space:nowrap;">
        <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${t.color};margin-right:4px;"></span>${t.label}: <b>${fmtCRC(t.val)}</b>
      </td>`,
      )
      .join('');

    // ── Top 10 deudores ──────────────────────────────────────────────────
    const thS = `background:${NAVY};color:#fff;padding:6px 8px;font-size:10px;font-weight:700;text-transform:uppercase;`;
    const top = c?.top10 ?? [];
    const filasTop = top
      .map((r, i) => {
        const acum = r.pct_acumulado > 40 ? '#dc2626' : '#E36C00';
        return `<tr style="background:${i % 2 === 0 ? '#FBFBFB' : '#fff'};">
        <td style="border:1px solid #eee;padding:5px 8px;font-size:11px;text-align:center;color:#94a3b8;font-weight:700;">${r.rank}</td>
        <td style="border:1px solid #eee;padding:5px 8px;font-size:11px;font-weight:600;color:#0f172a;">${(r.cliente_nombre || '').replace(/</g, '&lt;')}</td>
        <td style="border:1px solid #eee;padding:5px 8px;font-size:11px;color:#475569;">${(r.vendedor_nombre || '').replace(/</g, '&lt;')}</td>
        <td style="border:1px solid #eee;padding:5px 8px;font-size:11px;text-align:right;font-weight:700;color:#dc2626;white-space:nowrap;">${fmtCRC(r.mora_total)}</td>
        <td style="border:1px solid #eee;padding:5px 8px;font-size:11px;text-align:right;color:#64748b;">${r.pct_mora}%</td>
        <td style="border:1px solid #eee;padding:5px 8px;font-size:11px;text-align:right;font-weight:700;color:${acum};">${r.pct_acumulado}%</td>
      </tr>`;
      })
      .join('');

    const hhiColor =
      c?.kpis.hhi_nivel === 'ALTO'
        ? '#dc2626'
        : c?.kpis.hhi_nivel === 'MEDIO'
          ? '#f59e0b'
          : '#16a34a';
    const concBlock = c
      ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:14px;">
        <tr>
          <td width="25%" style="padding:3px;"><table width="100%" style="border:1px solid #e5e7eb;border-top:3px solid ${hhiColor};border-radius:6px;"><tr><td style="padding:8px;text-align:center;"><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;">Concentración HHI</div><div style="font-size:16px;font-weight:800;color:${hhiColor};">${c.kpis.hhi_nivel}</div><div style="font-size:9px;color:#94a3b8;">${(c.kpis.hhi_valor ?? 0).toLocaleString()} pts</div></td></tr></table></td>
          <td width="25%" style="padding:3px;"><table width="100%" style="border:1px solid #e5e7eb;border-radius:6px;"><tr><td style="padding:8px;text-align:center;"><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;">Top 10 / mora</div><div style="font-size:16px;font-weight:800;color:${NAVY};">${c.kpis.pct_top10}%</div></td></tr></table></td>
          <td width="25%" style="padding:3px;"><table width="100%" style="border:1px solid #e5e7eb;border-radius:6px;"><tr><td style="padding:8px;text-align:center;"><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;">Top 3 vendedores</div><div style="font-size:16px;font-weight:800;color:${CYAN};">${c.kpis.pct_top3_vendedores}%</div></td></tr></table></td>
          <td width="25%" style="padding:3px;"><table width="100%" style="border:1px solid #e5e7eb;border-radius:6px;"><tr><td style="padding:8px;text-align:center;"><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;">Clientes "Grandes"</div><div style="font-size:16px;font-weight:800;color:#f59e0b;">${c.kpis.pct_grandes}%</div></td></tr></table></td>
        </tr>
      </table>`
      : '';

    return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:760px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr><td style="background:${NAVY};padding:14px 18px;border-radius:6px 6px 0 0;">
          <div style="font-size:10px;color:#A8C4E0;letter-spacing:1px;text-transform:uppercase;">SIC · Sistema Inteligente de Cobranza — Cofersa</div>
          <div style="font-size:18px;color:#fff;font-weight:bold;margin-top:1px;">Resumen Ejecutivo de Cartera</div>
          <div style="font-size:12px;color:#A8C4E0;margin-top:2px;">Corte: <b style="color:#fff;">${fmtFecha(data.fechaCorte)}</b></div>
        </td><td style="background:#F4A61C;width:8px;border-radius:0 6px 0 0;"></td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0 8px;"><tr>${kpiCells}</tr></table>

      <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 6px;">Antigüedad de la cartera</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:6px;overflow:hidden;"><tr>${segs}</tr></table>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:6px;"><tr>${leyenda}</tr></table>

      <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 6px;">Top 10 deudores — Total: ${fmtCRC(c?.total_mora ?? 0)}</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead><tr>
          <th style="${thS}text-align:center;">#</th><th style="${thS}text-align:left;">Cliente</th>
          <th style="${thS}text-align:left;">Vendedor</th><th style="${thS}text-align:right;">Mora total</th>
          <th style="${thS}text-align:right;">% Mora</th><th style="${thS}text-align:right;">% Acum.</th>
        </tr></thead>
        <tbody>${filasTop}</tbody>
      </table>

      ${concBlock}

      <div style="margin-top:16px;font-size:10px;color:#94a3b8;border-top:1px solid #eee;padding-top:8px;">
        Reporte generado desde <b style="color:${CYAN};">SIC</b> — Sistema Inteligente de Cobranza · Cofersa · por ${generadoPor}.
      </div>
    </div>`;
  }

  async function enviarCorreo() {
    const toList = para
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (toList.length === 0) {
      setErrEnvio('Ingresá al menos un correo.');
      return;
    }
    setEnviando(true);
    setErrEnvio(null);
    try {
      const d = await enviarReporte({
        to: toList.join(';'),
        cc: cc
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean),
        subject: `SIC · Resumen Ejecutivo de Cartera — ${fmtFecha(data.fechaCorte)}`,
        html: htmlResumenEjecutivo(),
      });
      if (d.email_sent) {
        setEnviado(true);
        setTimeout(() => {
          setShowEnviar(false);
          setEnviado(false);
          setPara('');
          setCc('');
        }, 1600);
      } else {
        setErrEnvio('No se pudo enviar el correo.');
      }
    } catch (e) {
      const err = e as ApiError;
      setErrEnvio(
        err.isNetworkError
          ? 'Error de red al enviar.'
          : err.message || 'No se pudo enviar el correo.',
      );
    } finally {
      setEnviando(false);
    }
  }

  function exportParams() {
    const top = (c?.top10 ?? []) as ConcentracionRow[];
    return {
      filas: top as unknown as Record<string, unknown>[],
      columnas: COLUMNAS_TOP,
      titulo: 'Resumen Ejecutivo de Cartera',
      subtitulo: `Fecha de corte: ${fmtFecha(data.fechaCorte)} · Top 10 deudores`,
      meta: [
        { label: 'Cartera total', value: fmtCRC(data.cartera) },
        { label: '% Mora', value: `${data.pctMora}%` },
        { label: 'DSO', value: `${data.dso}d` },
        { label: 'Venc. >30d', value: fmtCRC(data.venc30) },
      ],
      orientacion: 'landscape' as const,
      nombreArchivo: 'resumen-ejecutivo-cartera',
      generadoPor,
    };
  }

  async function onPDF() {
    setExportando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const { loadNunito, loadLogo, drawBrandHeader, drawFooters, COL } =
        await import('@/lib/reportes/pdf-branding');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc: any = new (jsPDF as any)({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });
      const PW = 297,
        ML = 12,
        MR = 12,
        CW = PW - ML - MR;

      const [f, logo] = await Promise.all([loadNunito(doc), loadLogo()]);
      let y = drawBrandHeader(doc, f as PdfFonts, PW, ML, MR, logo);

      // ── TÍTULO DEL REPORTE ────────────────────────────────────────────
      doc.setFont((f as PdfFonts).bold, 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...COL.navy);
      doc.text('Resumen Ejecutivo de Cartera', PW / 2, y + 5, { align: 'center' });
      doc.setFont((f as PdfFonts).normal, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...COL.gray999);
      doc.text(
        `Corte: ${fmtFecha(data.fechaCorte)}   ·   Generado por: ${generadoPor}`,
        PW / 2,
        y + 11,
        { align: 'center' },
      );
      y += 16;

      // ── 6 KPI CARDS ───────────────────────────────────────────────────
      const dsoC: [number, number, number] =
        data.dso > 45 ? [220, 38, 38] : data.dso > 35 ? [245, 158, 11] : [34, 197, 94];
      const momTxt =
        momDelta !== null ? `MoM: ${momDelta > 0 ? '+' : ''}${momDelta.toFixed(1)}%` : 'en curso';
      const KW = (CW - 3 * 5) / 6,
        KH = 15;
      const KPIS: { label: string; val: string; sub: string; color: [number, number, number] }[] = [
        {
          label: 'CARTERA TOTAL',
          val: fmtCRC(data.cartera),
          sub: `${data.nClientes} clientes`,
          color: COL.navy,
        },
        { label: '% MORA', val: `${data.pctMora}%`, sub: fmtCRC(data.mora), color: [220, 38, 38] },
        { label: 'DSO', val: `${data.dso}d`, sub: 'dias de cobro', color: dsoC },
        {
          label: 'VENCIDO >30D',
          val: `${data.pctVenc30}%`,
          sub: fmtCRC(data.venc30),
          color: [234, 88, 12],
        },
        {
          label: 'CLIENTES EN MORA',
          val: `${data.nMora}`,
          sub: `de ${data.nClientes}`,
          color: [245, 158, 11],
        },
        {
          label: 'RECAUDO DEL MES',
          val: fmtCRC(recaudoActual?.total ?? 0),
          sub: momTxt,
          color: COL.cyan,
        },
      ];
      KPIS.forEach((k, i) => {
        const kx = ML + i * (KW + 3),
          cx = kx + KW / 2;
        const [r, g, b] = k.color;
        // Fondo blanco con borde gris suave
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(kx, y, KW, KH, 1.5, 1.5, 'F');
        doc.setDrawColor(228, 228, 228);
        doc.setLineWidth(0.2);
        doc.roundedRect(kx, y, KW, KH, 1.5, 1.5, 'D');
        // Franja de color en el tope (rect plano, sin redondeado — evita conflictos visuales)
        doc.setFillColor(r, g, b);
        doc.rect(kx, y, KW, 1.8, 'F');
        // Label en gris, debajo de la franja
        doc.setFont((f as PdfFonts).normal, 'normal');
        doc.setFontSize(5);
        doc.setTextColor(...COL.gray999);
        doc.text(k.label, cx, y + 5.5, { align: 'center', maxWidth: KW - 2 });
        // Valor en color del KPI, grande
        doc.setFont((f as PdfFonts).bold, 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(r, g, b);
        doc.text(k.val, cx, y + 10.5, { align: 'center', maxWidth: KW - 2 });
        // Subtexto pequeño gris
        doc.setFont((f as PdfFonts).normal, 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(...COL.grayBBB);
        doc.text(k.sub, cx, y + 14, { align: 'center', maxWidth: KW - 2 });
      });
      y += KH + 5;

      // ── AGING BAR ─────────────────────────────────────────────────────
      doc.setFont((f as PdfFonts).bold, 'bold');
      doc.setFontSize(6);
      doc.setTextColor(...COL.gray999);
      doc.text(`ANTIGUEDAD DE LA CARTERA  —  CORTE ${fmtFecha(data.fechaCorte)}`, ML, y);
      y += 3;
      const agingItems = TRAMOS.map((t) => ({ ...t, val: Math.max(0, data[t.key] as number) }));
      const agingTotal = agingItems.reduce((s, t) => s + t.val, 0) || 1;
      let bx = ML;
      agingItems.forEach((t) => {
        if (t.val <= 0) return;
        const pct = t.val / agingTotal,
          bw = CW * pct;
        const [r, g, b] = hexToRGB(t.color);
        doc.setFillColor(r, g, b);
        doc.rect(bx, y, bw, 7, 'F');
        if (pct >= 0.05) {
          doc.setFont((f as PdfFonts).bold, 'bold');
          doc.setFontSize(6);
          doc.setTextColor(255, 255, 255);
          doc.text(`${Math.round(pct * 100)}%`, bx + bw / 2, y + 5, { align: 'center' });
        }
        bx += bw;
      });
      y += 9;
      // Leyenda: 3 items col izquierda, 3 col derecha
      const LW = CW / 3;
      agingItems.forEach((t, i) => {
        const col = i < 3 ? 0 : 1,
          row = i < 3 ? i : i - 3;
        const lx = ML + col * (LW * 1.5);
        const ly2 = y + row * 4.5;
        const [r2, g2, b2] = hexToRGB(t.color);
        doc.setFillColor(r2, g2, b2);
        doc.roundedRect(lx, ly2, 2.8, 2.8, 0.4, 0.4, 'F');
        doc.setFont((f as PdfFonts).normal, 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(80, 80, 80);
        doc.text(`${t.label}: `, lx + 4, ly2 + 2.2);
        const labelW = doc.getTextWidth(`${t.label}: `);
        doc.setFont((f as PdfFonts).bold, 'bold');
        doc.text(fmtCRC(t.val), lx + 4 + labelW, ly2 + 2.2);
      });
      y += 16;

      // ── DOS COLUMNAS: sidebar izq + tabla top10 der ───────────────────
      const LCOL = 82,
        GAP = 5;
      const leftX = ML,
        rightColX = ML + LCOL + GAP;
      const colY = y;

      // ── COLUMNA IZQUIERDA: solo HHI + concentración (sin duplicar KPIs superiores) ──
      let ly = colY;

      if (c) {
        doc.setFont((f as PdfFonts).bold, 'bold');
        doc.setFontSize(6);
        doc.setTextColor(...COL.gray999);
        doc.text('CONCENTRACION DE RIESGO (HHI)', leftX, ly);
        ly += 3;
        const hhiNivel = c.kpis.hhi_nivel;
        const hColor: [number, number, number] =
          hhiNivel === 'ALTO'
            ? [220, 38, 38]
            : hhiNivel === 'MEDIO'
              ? [245, 158, 11]
              : [34, 197, 94];
        // HHI card
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(leftX, ly, LCOL, 15, 1.5, 1.5, 'F');
        doc.setFillColor(...hColor);
        doc.roundedRect(leftX, ly, LCOL, 5, 1.5, 1.5, 'F');
        doc.setFillColor(255, 255, 255);
        doc.rect(leftX, ly + 3, LCOL, 2, 'F');
        doc.setDrawColor(...COL.sep);
        doc.setLineWidth(0.2);
        doc.roundedRect(leftX, ly, LCOL, 15, 1.5, 1.5, 'D');
        doc.setFont((f as PdfFonts).bold, 'bold');
        doc.setFontSize(5.5);
        doc.setTextColor(255, 255, 255);
        doc.text('CONCENTRACION (HHI)', leftX + LCOL / 2, ly + 3.8, { align: 'center' });
        doc.setFont((f as PdfFonts).bold, 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...hColor);
        doc.text(hhiNivel, leftX + LCOL / 2, ly + 11.5, { align: 'center' });
        doc.setFont((f as PdfFonts).normal, 'normal');
        doc.setFontSize(5);
        doc.setTextColor(...COL.grayBBB);
        doc.text(
          `${String(Math.round(c.kpis.hhi_valor ?? 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} pts HHI`,
          leftX + LCOL / 2,
          ly + 14,
          { align: 'center' },
        );
        ly += 18;
        // Stats
        const cStats = [
          { label: 'Top 10 / mora total', val: `${c.kpis.pct_top10}%`, color: COL.navy },
          { label: 'Top 3 vendedores', val: `${c.kpis.pct_top3_vendedores}%`, color: COL.cyan },
          {
            label: 'Clientes Grandes',
            val: `${c.kpis.pct_grandes}%`,
            color: [245, 158, 11] as [number, number, number],
          },
        ];
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(leftX, ly, LCOL, 28, 1.5, 1.5, 'F');
        doc.setDrawColor(...COL.sep);
        doc.setLineWidth(0.2);
        doc.roundedRect(leftX, ly, LCOL, 28, 1.5, 1.5, 'D');
        cStats.forEach((s, i) => {
          const sy = ly + 7 + i * 7.5;
          const [cr, cg, cb] = s.color;
          doc.setFont((f as PdfFonts).normal, 'normal');
          doc.setFontSize(6);
          doc.setTextColor(...COL.gray666);
          doc.text(s.label, leftX + 4, sy);
          doc.setFont((f as PdfFonts).bold, 'bold');
          doc.setFontSize(8);
          doc.setTextColor(cr, cg, cb);
          doc.text(s.val, leftX + LCOL - 4, sy, { align: 'right' });
          if (i < 2) {
            doc.setDrawColor(...COL.sep);
            doc.setLineWidth(0.15);
            doc.line(leftX + 3, sy + 2.5, leftX + LCOL - 3, sy + 2.5);
          }
        });
      }

      // ── COLUMNA DERECHA: Top 10 ───────────────────────────────────────
      doc.setFont((f as PdfFonts).bold, 'bold');
      doc.setFontSize(6);
      doc.setTextColor(...COL.gray999);
      doc.text(`TOP 10 DEUDORES  —  TOTAL MORA: ${fmtCRC(c?.total_mora ?? 0)}`, rightColX, colY);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      autoTable(doc, {
        startY: colY + 4,
        margin: { left: rightColX, right: MR },
        head: [['#', 'Cliente', 'Vendedor', 'Mora total', '% Mora', '% Acum.']],
        body: (c?.top10 ?? []).map((r: ConcentracionRow) => [
          String(r.rank),
          r.cliente_nombre ?? '',
          (r.vendedor_nombre ?? '').length > 24
            ? (r.vendedor_nombre ?? '').slice(0, 24) + '...'
            : (r.vendedor_nombre ?? ''),
          fmtCRC(r.mora_total),
          `${r.pct_mora}%`,
          `${r.pct_acumulado}%`,
        ]),
        styles: {
          fontSize: 7.5,
          cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
          lineWidth: 0,
          overflow: 'ellipsize',
          font: (f as PdfFonts).normal,
          fontStyle: 'normal',
        },
        headStyles: {
          fillColor: COL.navy,
          textColor: [255, 255, 255] as [number, number, number],
          fontStyle: 'bold',
          fontSize: 7.5,
          font: (f as PdfFonts).bold,
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10 },
          3: {
            halign: 'right',
            cellWidth: 44,
            fontStyle: 'bold',
            font: (f as PdfFonts).bold,
            textColor: [220, 38, 38] as [number, number, number],
          },
          4: { halign: 'right', cellWidth: 16 },
          5: { halign: 'right', cellWidth: 18, fontStyle: 'bold' },
        },
        alternateRowStyles: { fillColor: COL.rowAlt },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didParseCell: (d: any) => {
          if (d.section === 'body' && d.column.index === 5) {
            const val = parseFloat(String(d.cell.raw).replace('%', ''));
            d.cell.styles.textColor =
              val > 40 ? [220, 38, 38] : val > 20 ? [234, 88, 12] : [245, 158, 11];
          }
        },
      });

      drawFooters(doc, f as PdfFonts, PW, ML, MR);
      doc.save(`resumen-ejecutivo-${data.fechaCorte || 'cartera'}.pdf`);
    } finally {
      setExportando(false);
    }
  }

  async function onExcel() {
    setExportando(true);
    try {
      await exportTablaExcel(exportParams());
    } finally {
      setExportando(false);
    }
  }

  const kpisStrip = (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      <KPICardAnalisis
        compact
        label="Cartera total"
        valor={fmtCRC(data.cartera)}
        sub={`${data.nClientes} clientes`}
        color="#003B5C"
      />
      <KPICardAnalisis
        compact
        label="% Mora"
        valor={`${data.pctMora}%`}
        sub={fmtCRC(data.mora)}
        color="#dc2626"
      />
      <KPICardAnalisis
        compact
        label="DSO"
        valor={`${data.dso}d`}
        sub="días de cobro"
        color={dsoColor}
      />
      <KPICardAnalisis
        compact
        label="Vencido >30d"
        valor={`${data.pctVenc30}%`}
        sub={fmtCRC(data.venc30)}
        color="#ea580c"
      />
      <KPICardAnalisis
        compact
        label="Clientes en mora"
        valor={`${data.nMora}`}
        sub={`de ${data.nClientes}`}
        color="#f59e0b"
      />

      {/* Recaudo del mes con badge MoM */}
      <div
        className="bg-white rounded-xl border border-slate-100 flex flex-col items-center text-center p-3"
        style={{ borderTop: '3px solid #009ee3' }}
      >
        <div className="flex items-center gap-1 mb-1 flex-wrap justify-center">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-tight">
            Recaudo del mes
          </p>
          {momDelta !== null && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-black flex-shrink-0"
              style={{
                background: momDelta > 2 ? '#dcfce7' : momDelta < -2 ? '#fee2e2' : '#f1f5f9',
                color: momDelta > 2 ? '#16a34a' : momDelta < -2 ? '#dc2626' : '#94a3b8',
              }}
            >
              {momDelta > 2 ? (
                <TrendingUp size={9} />
              ) : momDelta < -2 ? (
                <TrendingDown size={9} />
              ) : (
                <Minus size={9} />
              )}
              {momDelta > 0 ? '+' : ''}
              {momDelta.toFixed(1)}%
            </span>
          )}
        </div>
        <p
          className="font-black tabular-nums leading-tight"
          style={{ fontSize: '1.35rem', color: '#1e293b' }}
        >
          {fmtCRC(recaudoActual?.total ?? 0)}
        </p>
        <p className="text-gray-400 mt-1 leading-snug text-[10px]">
          {recaudoActual?.n_pagos ?? 0} pagos · en curso
        </p>
      </div>
    </div>
  );

  return (
    <ReporteShell
      kpis={kpisStrip}
      onExportPDF={onPDF}
      onExportExcel={onExcel}
      onEnviar={() => setShowEnviar(true)}
      exportando={exportando}
    >
      {/* Modal de envío */}
      {showEnviar && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => !enviando && setShowEnviar(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full"
            style={{ maxWidth: '460px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-[15px] font-bold text-gray-900">Enviar Resumen Ejecutivo</h3>
                <p className="text-[12px] text-gray-400">
                  Se envía el resumen en el cuerpo del correo
                </p>
              </div>
              <button
                onClick={() => !enviando && setShowEnviar(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            {enviado ? (
              <div className="p-10 flex flex-col items-center text-center">
                <CheckCircle2 size={42} style={{ color: '#22c55e' }} className="mb-3" />
                <p className="text-[14px] font-bold text-gray-800">Resumen enviado</p>
              </div>
            ) : (
              <div className="p-5 space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Para
                  </label>
                  <DirectorioInput
                    value={para}
                    onChange={setPara}
                    placeholder="correo@cofersa.cr; otro@cofersa.cr"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    CC (opcional)
                  </label>
                  <DirectorioInput
                    value={cc}
                    onChange={setCc}
                    placeholder="copia@cofersa.cr"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-200"
                  />
                </div>
                <p className="text-[11px] text-gray-400">
                  Podés poner varios correos separados por <b>;</b> o <b>,</b>
                </p>
                {errEnvio && (
                  <div
                    className="rounded-lg border px-3 py-2 flex items-start gap-2"
                    style={{ background: '#fef2f2', borderColor: '#fecaca' }}
                  >
                    <AlertCircle
                      size={14}
                      style={{ color: '#dc2626', marginTop: '1px', flexShrink: 0 }}
                    />
                    <div>
                      <p className="text-[12px] font-semibold text-red-700">{errEnvio}</p>
                      {/Google|expirada|401/i.test(errEnvio) && (
                        <p className="text-[11px] text-red-500 mt-0.5">
                          Cerrá sesión y volvé a entrar con Google, luego reintentá.
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setShowEnviar(false)}
                    disabled={enviando}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-slate-200 text-gray-600"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={enviarCorreo}
                    disabled={enviando}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50"
                    style={{ background: '#009ee3' }}
                  >
                    {enviando ? <Loader2 size={13} className="animate-spin" /> : null} Enviar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Aging consolidado */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
          Antigüedad de la cartera — corte {fmtFecha(data.fechaCorte)}
        </p>
        <div
          style={{
            display: 'flex',
            height: '34px',
            borderRadius: '8px',
            overflow: 'hidden',
            gap: '1px',
          }}
        >
          {TRAMOS.map((t) => {
            const val = data[t.key] as number;
            const pct = data.cartera > 0 ? (val / data.cartera) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={t.key}
                title={`${t.label}: ${fmtCRC(val)}`}
                style={{
                  width: `${pct}%`,
                  minWidth: pct >= 4 ? undefined : '2px',
                  background: t.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {pct >= 6 && (
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'white' }}>
                    {Math.round(pct)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
          {TRAMOS.map((t) => (
            <div key={t.key} className="flex items-center gap-1.5">
              <div
                style={{ width: '10px', height: '10px', borderRadius: '2px', background: t.color }}
              />
              <span className="text-[10px] text-gray-500">{t.label}</span>
              <span className="text-[10px] font-bold tabular-nums text-gray-700">
                {fmtCRC(data[t.key] as number)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tendencia de mora — misma fuente que el dashboard */}
      <TendenciaCarteraChart data={data.historicoCartera} />

      {/* DSO trend */}
      {data.dsoTendencia.length > 0 && <DSOTendenciaCard puntos={data.dsoTendencia} />}

      {/* Concentración: top 10 + HHI */}
      {c && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Top 10 deudores */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 overflow-x-auto">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                Top 10 deudores — Total: {fmtCRC(c.total_mora)}
              </p>
            </div>
            <table
              style={{
                tableLayout: 'fixed',
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: '520px',
              }}
            >
              <colgroup>
                <col style={{ width: '32px' }} />
                <col style={{ width: '40%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '90px' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {(
                    [
                      ['#', 'center'],
                      ['Cliente', 'left'],
                      ['Vendedor', 'left'],
                      ['Mora total', 'right'],
                      ['% Acum.', 'right'],
                    ] as [string, React.CSSProperties['textAlign']][]
                  ).map(([l, a]) => (
                    <th
                      key={l}
                      style={{
                        padding: '8px 10px',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        textAlign: a,
                      }}
                    >
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.top10.map((row: ConcentracionRow) => {
                  const acumColor = row.pct_acumulado > 40 ? '#dc2626' : '#f59e0b';
                  return (
                    <tr key={row.cliente_cod} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td
                        style={{
                          padding: '9px 10px',
                          textAlign: 'center',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#003B5C',
                        }}
                      >
                        {row.rank}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <p
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#0f172a',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.cliente_nombre}
                        </p>
                        <p style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>
                          {row.cliente_cod}
                        </p>
                      </td>
                      <td
                        style={{
                          padding: '9px 10px',
                          fontSize: '11px',
                          color: '#475569',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.vendedor_nombre}
                      </td>
                      <td
                        style={{
                          padding: '9px 10px',
                          textAlign: 'right',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#dc2626',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {fmtCRC(row.mora_total)}
                      </td>
                      <td
                        style={{
                          padding: '9px 10px',
                          textAlign: 'right',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: acumColor,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {row.pct_acumulado}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* HHI + concentración */}
          <div className="space-y-4">
            <div
              className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col items-center text-center"
              style={{
                borderTop: `3px solid ${c.kpis.hhi_nivel === 'ALTO' ? '#dc2626' : c.kpis.hhi_nivel === 'MEDIO' ? '#f59e0b' : '#16a34a'}`,
              }}
            >
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Concentración (HHI)
              </p>
              <p
                className="text-2xl font-black leading-tight"
                style={{
                  color:
                    c.kpis.hhi_nivel === 'ALTO'
                      ? '#dc2626'
                      : c.kpis.hhi_nivel === 'MEDIO'
                        ? '#f59e0b'
                        : '#16a34a',
                }}
              >
                {c.kpis.hhi_nivel}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                {(c.kpis.hhi_valor ?? 0).toLocaleString()} pts HHI
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">Top 10 / mora total</span>
                <span className="text-[13px] font-black tabular-nums" style={{ color: '#003B5C' }}>
                  {c.kpis.pct_top10}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">Top 3 vendedores</span>
                <span className="text-[13px] font-black tabular-nums" style={{ color: '#009ee3' }}>
                  {c.kpis.pct_top3_vendedores}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">Clientes &quot;Grandes&quot;</span>
                <span className="text-[13px] font-black tabular-nums" style={{ color: '#f59e0b' }}>
                  {c.kpis.pct_grandes}%
                </span>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                <span className="text-[11px] text-gray-500">Peor deudor:</span>
                {c.top10[0] && (
                  <ICPBadge clasificacion={c.top10[0].clasificacion ?? 'REGULAR'} size="sm" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </ReporteShell>
  );
}
