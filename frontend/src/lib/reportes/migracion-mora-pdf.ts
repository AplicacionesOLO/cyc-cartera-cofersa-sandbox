'use client';
/**
 * PDF "premium" de la Matriz de Migración de Mora (Roll Rates).
 * Dibujado a mano con jsPDF (no autotable) para poder reproducir en el PDF
 * lo mismo que se ve en pantalla: % + monto por celda y el semáforo de color
 * que marca los cuellos de botella. El exportador genérico de tablas simples
 * (export-tabla.ts) no soporta ni lo uno ni lo otro.
 *
 * La flecha entre periodos se dibuja como vector (línea + triángulo) en vez
 * de usar el carácter Unicode "→": ni Helvetica ni la fuente Nunito embebida
 * garantizan ese glifo, y por eso salía como basura en el PDF anterior.
 */

import { fmtCRC } from '@/lib/utils/formato';
import { safeFilename } from '@/lib/utils/estado-cuenta-export';
import {
  loadNunito,
  loadLogo,
  drawBrandHeader,
  drawFooters,
  COL,
  type PdfFonts,
} from '@/lib/reportes/pdf-branding';
import type { MigracionMatrizRow } from '@/types/reportes';

const TRAMOS = ['NO_VENCIDO', '1_30', '31_60', '61_90', '91_120', '120_PLUS'] as const;
const DESTINOS = [...TRAMOS, 'PAGADO'] as const;
const LABEL: Record<string, string> = {
  NO_VENCIDO: 'No vencido',
  '1_30': '1-30',
  '31_60': '31-60',
  '61_90': '61-90',
  '91_120': '91-120',
  '120_PLUS': '+120',
  PAGADO: 'Pagado',
};

export interface MigracionMoraPdfParams {
  matriz: MigracionMatrizRow[];
  kpis: { roll_critico_pct: number; perdida_esperada: number; vencido_actual: number };
  anteriorLabel: string;
  periodoLabel: string;
  provisional: boolean;
  filtroLabel?: string | null;
  generadoPor: string;
  nombreArchivo: string;
}

// Mismo criterio de color que la vista en pantalla (migracion-cliente.tsx `cellStyle`)
function celdaColor(
  fromIdx: number,
  destino: string,
  pct: number,
): { bg: [number, number, number]; tx: [number, number, number] } {
  if (destino === 'PAGADO') return { bg: [240, 253, 244], tx: [21, 128, 61] };
  const toIdx = (TRAMOS as readonly string[]).indexOf(destino);
  const peor = toIdx > fromIdx;
  if (peor && pct > 0.5) return { bg: [254, 242, 242], tx: [185, 28, 28] };
  if (peor && pct > 0.25) return { bg: [255, 251, 235], tx: [180, 83, 9] };
  return { bg: [255, 255, 255], tx: [71, 85, 105] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawArrow(doc: any, cx: number, y: number, color: [number, number, number]): void {
  const w = 9,
    h = 1.6;
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(0.6);
  doc.line(cx - w / 2, y, cx + w / 2 - 1.6, y);
  doc.triangle(cx + w / 2 - 2.4, y - h, cx + w / 2 - 2.4, y + h, cx + w / 2 + 1, y, 'F');
}

export async function exportMigracionMoraPDF(params: MigracionMoraPdfParams): Promise<void> {
  const doc = await buildMigracionMoraDoc(params);
  doc.save(`${safeFilename(params.nombreArchivo)}.pdf`);
}

/** Retorna el PDF como base64 (para adjuntar en email / envío programado). */
export async function generarMigracionMoraPDFBase64(
  params: MigracionMoraPdfParams,
): Promise<string> {
  const doc = await buildMigracionMoraDoc(params);
  const dataUri = doc.output('datauristring') as string;
  return dataUri.split(',')[1] ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildMigracionMoraDoc(params: MigracionMoraPdfParams): Promise<any> {
  const { default: jsPDF } = await import('jspdf');
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
  const fonts = f as PdfFonts;
  let y = drawBrandHeader(doc, fonts, PW, ML, MR, logo);

  // ── TÍTULO ────────────────────────────────────────────────────────────
  doc.setFont(fonts.bold, 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...COL.navy);
  doc.text('Matriz de Migración de Mora (Roll Rates)', PW / 2, y + 5, { align: 'center' });

  // Subtítulo: "<anterior>  ->  <periodo>" con flecha dibujada a mano
  const subY = y + 11;
  doc.setFont(fonts.normal, 'normal');
  doc.setFontSize(8.5);
  const leftW = doc.getTextWidth(params.anteriorLabel);
  doc.setFont(fonts.bold, 'bold');
  const rightW = doc.getTextWidth(params.periodoLabel);
  const arrowGap = 12;
  const totalW = leftW + arrowGap + rightW;
  let sx = PW / 2 - totalW / 2;
  doc.setFont(fonts.normal, 'normal');
  doc.setTextColor(...COL.gray666);
  doc.text(params.anteriorLabel, sx, subY);
  sx += leftW + arrowGap / 2;
  drawArrow(doc, sx, subY - 1.4, COL.cyan);
  sx += arrowGap / 2;
  doc.setFont(fonts.bold, 'bold');
  doc.setTextColor(...COL.navy);
  doc.text(params.periodoLabel, sx, subY);

  y = subY + 6;

  if (params.filtroLabel) {
    doc.setFont(fonts.normal, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(params.filtroLabel, PW / 2, y, { align: 'center' });
    y += 5;
  }

  if (params.provisional) {
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(ML, y, CW, 10, 1.5, 1.5, 'F');
    doc.setDrawColor(191, 219, 254);
    doc.setLineWidth(0.2);
    doc.roundedRect(ML, y, CW, 10, 1.5, 1.5, 'D');
    doc.setFont(fonts.bold, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(2, 119, 168);
    doc.text('BASE PROVISIONAL', ML + 4, y + 4.2);
    doc.setFont(fonts.normal, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(3, 105, 161);
    doc.text(
      `El mes base (${params.anteriorLabel}) usa un cierre aproximado. La matriz será 100% real cuando ambos meses tengan cierre definitivo.`,
      ML + 4,
      y + 7.6,
    );
    y += 14;
  }

  y += 2;

  // ── KPI CARDS ─────────────────────────────────────────────────────────
  const rollColor: [number, number, number] =
    params.kpis.roll_critico_pct > 50
      ? [220, 38, 38]
      : params.kpis.roll_critico_pct > 25
        ? [245, 158, 11]
        : [34, 197, 94];
  const kpiDefs: { label: string; val: string; sub: string; color: [number, number, number] }[] = [
    {
      label: 'RODAMIENTO CRÍTICO',
      val: `${params.kpis.roll_critico_pct}%`,
      sub: '91-120 -> +120 (entra a pérdida)',
      color: rollColor,
    },
    {
      label: 'PÉRDIDA ESPERADA',
      val: fmtCRC(params.kpis.perdida_esperada),
      sub: 'proyección encadenada a +120',
      color: [220, 38, 38],
    },
    {
      label: 'VENCIDO ACTUAL',
      val: fmtCRC(params.kpis.vencido_actual),
      sub: `saldo vencido · ${params.periodoLabel}`,
      color: [71, 85, 105],
    },
  ];
  const kGap = 4,
    kw = (CW - kGap * 2) / 3,
    kh = 18;
  kpiDefs.forEach((k, i) => {
    const x = ML + i * (kw + kGap),
      cx = x + kw / 2;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, kw, kh, 1.8, 1.8, 'F');
    doc.setDrawColor(228, 228, 228);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, kw, kh, 1.8, 1.8, 'D');
    doc.setFillColor(...k.color);
    doc.rect(x, y, kw, 1.8, 'F');
    doc.setFont(fonts.normal, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(k.label, cx, y + 6.5, { align: 'center', maxWidth: kw - 6 });
    doc.setFont(fonts.bold, 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...k.color);
    doc.text(k.val, cx, y + 12.5, { align: 'center', maxWidth: kw - 6 });
    doc.setFont(fonts.normal, 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    doc.text(k.sub, cx, y + 16, { align: 'center', maxWidth: kw - 6 });
  });
  y += kh + 7;

  // ── MATRIZ (dibujada a mano: % arriba, monto abajo, semáforo de color) ──
  const labelW = 36;
  const dataW = (CW - labelW) / (DESTINOS.length + 1); // 7 destinos + Saldo origen
  const headerH = 9;
  const rowH = 13;

  doc.setFont(fonts.normal, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${params.anteriorLabel.toUpperCase()} (FILAS)  ·  ${params.periodoLabel.toUpperCase()} (COLUMNAS)`,
    ML,
    y,
  );
  doc.text('% DEL SALDO DEL TRAMO · ₡ DEBAJO', ML + CW, y, { align: 'right' });
  y += 3.5;

  // Encabezado
  doc.setFillColor(248, 250, 252);
  doc.rect(ML, y, CW, headerH, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.line(ML, y + headerH, ML + CW, y + headerH);
  doc.setFont(fonts.bold, 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text('TRAMO ORIGEN', ML + 3, y + headerH / 2 + 1.5);
  DESTINOS.forEach((d, i) => {
    const cx = ML + labelW + i * dataW + dataW / 2;
    doc.text(LABEL[d].toUpperCase(), cx, y + headerH / 2 + 1.5, { align: 'center' });
  });
  doc.text(
    'SALDO ORIGEN',
    ML + labelW + DESTINOS.length * dataW + dataW - 3,
    y + headerH / 2 + 1.5,
    { align: 'right' },
  );
  y += headerH;

  params.matriz.forEach((row, ri) => {
    const fromIdx = (TRAMOS as readonly string[]).indexOf(row.tramo);
    if (ri % 2 === 1) {
      doc.setFillColor(...COL.rowAlt);
      doc.rect(ML, y, CW, rowH, 'F');
    }

    doc.setFont(fonts.bold, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...COL.navy);
    doc.text(LABEL[row.tramo], ML + 3, y + rowH / 2 + 1.5);

    DESTINOS.forEach((d, i) => {
      const x = ML + labelW + i * dataW;
      const monto = row.destinos?.[d] ?? 0;
      const pct = row.saldo_origen > 0 ? monto / row.saldo_origen : 0;
      const cx = x + dataW / 2;
      if (monto > 0) {
        const { bg, tx } = celdaColor(fromIdx, d, pct);
        if (bg[0] !== 255 || bg[1] !== 255 || bg[2] !== 255) {
          doc.setFillColor(...bg);
          doc.rect(x, y, dataW, rowH, 'F');
        }
        doc.setFont(fonts.bold, 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...tx);
        doc.text(`${(pct * 100).toFixed(1)}%`, cx, y + 6, { align: 'center' });
        doc.setFont(fonts.normal, 'normal');
        doc.setFontSize(6.3);
        doc.setTextColor(tx[0], tx[1], tx[2]);
        doc.text(fmtCRC(monto), cx, y + 10.3, { align: 'center' });
      } else {
        doc.setFont(fonts.normal, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(203, 213, 225);
        doc.text('—', cx, y + rowH / 2 + 1.2, { align: 'center' });
      }
    });

    const xSaldo = ML + labelW + DESTINOS.length * dataW;
    doc.setFont(fonts.bold, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(fmtCRC(row.saldo_origen), xSaldo + dataW - 3, y + rowH / 2 + 1.5, { align: 'right' });

    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.2);
    doc.line(ML, y + rowH, ML + CW, y + rowH);
    y += rowH;
  });
  y += 5;

  // ── LEYENDA ───────────────────────────────────────────────────────────
  const leyenda: { color: [number, number, number]; texto: string }[] = [
    { color: [254, 242, 242], texto: 'Rodamiento >50% (cuello de botella)' },
    { color: [255, 251, 235], texto: 'Rodamiento 25-50%' },
    { color: [240, 253, 244], texto: 'Pagado / recuperado' },
  ];
  let lx = ML;
  doc.setFont(fonts.normal, 'normal');
  doc.setFontSize(6.5);
  leyenda.forEach((l) => {
    doc.setFillColor(...l.color);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.15);
    doc.rect(lx, y - 2.6, 3, 3, 'FD');
    doc.setTextColor(100, 116, 139);
    doc.text(l.texto, lx + 4.5, y);
    lx += 4.5 + doc.getTextWidth(l.texto) + 8;
  });
  y += 7;

  // ── LECTURA RÁPIDA (insight automático a partir del tramo 91-120) ──────
  const row9 = params.matriz.find((r) => r.tramo === '91_120');
  if (row9 && row9.saldo_origen > 0) {
    const pagado9 = row9.destinos?.PAGADO ?? 0;
    const pagoPct = Math.round((pagado9 / row9.saldo_origen) * 1000) / 10;
    const boxH = 13;
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(ML, y, CW, boxH, 1.5, 1.5, 'F');
    doc.setDrawColor(253, 230, 138);
    doc.setLineWidth(0.2);
    doc.roundedRect(ML, y, CW, boxH, 1.5, 1.5, 'D');
    doc.setFont(fonts.bold, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(180, 83, 9);
    doc.text('LECTURA RÁPIDA', ML + 4, y + 4.5);
    doc.setFont(fonts.normal, 'normal');
    doc.setFontSize(7);
    doc.text(
      `De la cartera en 91-120 dias de ${params.anteriorLabel}, solo ${pagoPct}% se recupero a tiempo; ${params.kpis.roll_critico_pct}% ya paso a +120 dias (zona de perdida esperada).`,
      ML + 4,
      y + 9.2,
      { maxWidth: CW - 8 },
    );
    y += boxH + 3;
  }

  drawFooters(doc, fonts, PW, ML, MR);
  return doc;
}
