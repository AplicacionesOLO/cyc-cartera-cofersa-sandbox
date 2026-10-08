'use client';
/**
 * Exportador genérico de tablas a PDF (jsPDF + autotable) y Excel (SheetJS).
 * Reutiliza el branding Cofersa y la fuente Nunito del estado de cuenta.
 *
 * Importaciones DINÁMICAS para evitar problemas SSR — solo Client Components.
 */

import { fmtCRC, fmtFecha } from '@/lib/utils/formato';
import { safeFilename } from '@/lib/utils/estado-cuenta-export';
import { loadStaticArrayBuffer, loadStaticBlob } from '@/shared/api/static-asset';

// ── Tipos ──────────────────────────────────────────────────────────────

export type AlignCol = 'left' | 'center' | 'right';
export type FormatoCol = 'crc' | 'pct' | 'fecha' | 'int' | 'text';

export interface ColumnaReporte {
  key: string;
  label: string;
  align?: AlignCol;
  format?: FormatoCol;
  width?: number; // ancho relativo para PDF (mm) / wch para Excel
}

export interface MetaItem {
  label: string;
  value: string;
}

export interface ExportTablaParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filas: Record<string, any>[];
  columnas: ColumnaReporte[];
  titulo: string;
  subtitulo?: string;
  meta?: MetaItem[]; // KPIs/metadata en el encabezado
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  totales?: Record<string, any>; // fila de totales (por key de columna)
  orientacion?: 'portrait' | 'landscape';
  nombreArchivo: string; // sin extensión
  generadoPor?: string; // nombre del usuario que exporta
  barra?: {
    // barra de avance opcional (cobrado vs proyección)
    pct: number;
    pctProyectado?: number;
    colorPct?: [number, number, number]; // RGB de la parte "cobrado"
    nota?: string;
  };
}

// ── Formateo de celdas ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtCelda(value: any, format?: FormatoCol): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (format) {
    case 'crc':
      return fmtCRC(Number(value));
    case 'pct':
      return `${value}%`;
    case 'fecha':
      return fmtFecha(String(value));
    case 'int':
      return Math.round(Number(value))
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    default:
      return String(value);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function valorExcel(value: any, format?: FormatoCol): string | number | null {
  if (value === null || value === undefined || value === '') return null;
  // crc/int/pct → número real (sumable en Excel); fecha/text → string formateado
  if (format === 'crc' || format === 'int') return Math.round(Number(value) * 100) / 100;
  if (format === 'pct') return Number(value);
  if (format === 'fecha') return fmtFecha(String(value));
  return String(value);
}

function fechaHoyCR(): string {
  const d = new Date(Date.now() - 6 * 3600_000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

async function loadImageAsDataUrl(src: string): Promise<string | null> {
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

// ══════════════════════════════════════════════════════════════════════
// PDF
// ══════════════════════════════════════════════════════════════════════

export async function exportTablaPDF(params: ExportTablaParams): Promise<void> {
  const doc = await buildTablaDoc(params);
  doc.save(`${safeFilename(params.nombreArchivo)}.pdf`);
}

/** Retorna el PDF como base64 (para adjuntar en email / envío programado) */
export async function generarTablaPDFBase64(params: ExportTablaParams): Promise<string> {
  const doc = await buildTablaDoc(params);
  const dataUri = doc.output('datauristring') as string;
  return dataUri.split(',')[1] ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildTablaDoc(params: ExportTablaParams): Promise<any> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const {
    filas,
    columnas,
    titulo,
    subtitulo,
    meta,
    totales,
    orientacion = 'landscape',
    generadoPor,
    barra,
  } = params;

  const logoDataUrl = await loadImageAsDataUrl('/logo-cofersa.png');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = new (jsPDF as any)({
    orientation: orientacion,
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  // Nunito Bold (incluye ₡) — fallback Helvetica
  let nunito = false;
  try {
    const buf = await loadStaticArrayBuffer('/fonts/Nunito-Bold.ttf');
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    doc.addFileToVFS('Nunito-Bold.ttf', btoa(bin));
    doc.addFont('Nunito-Bold.ttf', 'Nunito', 'bold');
    nunito = true;
  } catch {
    nunito = false;
  }

  const PW = orientacion === 'landscape' ? 297 : 210;
  const ML = 12,
    MR = 12;
  const CW = PW - ML - MR;

  // ── HEADER ──────────────────────────────────────────────────────────
  if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', ML, 3, 44, 17);
  else {
    doc.setTextColor(0, 59, 92);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('COFERSA', ML, 14);
  }

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(titulo, PW / 2, 12, { align: 'center' });
  if (subtitulo) {
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitulo, PW / 2, 18, { align: 'center' });
  }

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('GENERADO', PW - MR, 9, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(fechaHoyCR(), PW - MR, 15, { align: 'right' });

  doc.setDrawColor(0, 158, 227);
  doc.setLineWidth(0.8);
  doc.line(0, 24, PW, 24);

  let y = 30;

  // ── META / KPIs ─────────────────────────────────────────────────────
  if (meta && meta.length > 0) {
    const n = meta.length;
    const gap = 3;
    const kw = (CW - gap * (n - 1)) / n;
    const KH = 15;
    const LH = 6;
    meta.forEach((m, i) => {
      const x = ML + i * (kw + gap);
      const cx = x + kw / 2;
      doc.setFillColor(255, 255, 255);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).roundedRect(x, y, kw, KH, 2, 2, 'F');
      doc.setFillColor(0, 158, 227);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).roundedRect(x, y, kw, LH + 2, 2, 2, 'F');
      doc.setFillColor(255, 255, 255);
      doc.rect(x, y + LH, kw, KH - LH, 'F');
      doc.setDrawColor(0, 158, 227);
      doc.setLineWidth(0.2);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).roundedRect(x, y, kw, KH, 2, 2, 'D');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text(m.label.toUpperCase(), cx, y + 4.3, { align: 'center', maxWidth: kw - 4 });
      doc.setTextColor(0, 59, 92);
      doc.setFontSize(9.5);
      doc.setFont(nunito ? 'Nunito' : 'helvetica', 'bold');
      doc.text(m.value, cx, y + LH + 5.5, { align: 'center', maxWidth: kw - 4 });
      doc.setFont('helvetica', 'bold');
    });
    y += KH + 5;
  }

  // ── BARRA DE AVANCE (opcional) ──────────────────────────────────────
  if (barra) {
    const pct = Math.max(0, barra.pct);
    const pctProy = Math.max(0, barra.pctProyectado ?? 0);
    const cc = barra.colorPct ?? [22, 163, 74];
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('AVANCE DE RECAUDO', ML, y);
    doc.setTextColor(cc[0], cc[1], cc[2]);
    doc.setFontSize(8.5);
    doc.text(`${pct}% · proyectado ${pctProy}%`, PW - MR, y, { align: 'right' });
    y += 2.5;
    const barH = 4.5;
    doc.setFillColor(241, 245, 249);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).roundedRect(ML, y, CW, barH, 1.2, 1.2, 'F');
    const proyW = (Math.min(100, pctProy) / 100) * CW;
    if (proyW > 0.5) {
      doc.setFillColor(191, 219, 254);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).roundedRect(ML, y, proyW, barH, 1.2, 1.2, 'F');
    }
    const cobW = (Math.min(100, pct) / 100) * CW;
    if (cobW > 0.5) {
      doc.setFillColor(cc[0], cc[1], cc[2]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).roundedRect(ML, y, cobW, barH, 1.2, 1.2, 'F');
    }
    y += barH + 2.5;
    if (barra.nota) {
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.text(barra.nota, ML, y);
      y += 3;
    }
    y += 2;
  }

  // ── TABLA ───────────────────────────────────────────────────────────
  const head = [columnas.map((c) => c.label)];
  const body = filas.map((row) => columnas.map((c) => fmtCelda(row[c.key], c.format)));
  const foot = totales
    ? [
        columnas.map((c, i) =>
          i === 0
            ? 'TOTAL'
            : totales[c.key] !== undefined
              ? fmtCelda(totales[c.key], c.format)
              : '',
        ),
      ]
    : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columnStyles: Record<number, any> = {};
  columnas.forEach((c, i) => {
    columnStyles[i] = {
      halign:
        c.align ??
        (c.format === 'crc' || c.format === 'int' || c.format === 'pct' ? 'right' : 'left'),
      ...(c.width ? { cellWidth: c.width } : {}),
    };
  });

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    showFoot: foot ? 'lastPage' : 'never',
    head,
    body,
    foot,
    styles: {
      fontSize: 8,
      cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
      lineWidth: 0,
      overflow: 'ellipsize',
    },
    headStyles: {
      fillColor: [0, 158, 227],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      lineWidth: 0,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    footStyles: {
      fillColor: [248, 250, 252],
      textColor: [0, 59, 92],
      fontStyle: 'bold',
      fontSize: 8,
      lineWidth: 0,
    },
    tableLineWidth: 0.3,
    tableLineColor: [226, 232, 240],
    columnStyles,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (data: any) => {
      const col = columnas[data.column.index];
      if (!col) return;
      if (data.section === 'head' || data.section === 'foot') {
        data.cell.styles.halign =
          col.align ??
          (col.format === 'crc' || col.format === 'int' || col.format === 'pct' ? 'right' : 'left');
      }
      // El glifo ₡ solo existe en la fuente Nunito embebida; Helvetica lo muestra como "¡".
      // Aplicamos Nunito a las celdas de monto (cuerpo y totales) para que el ₡ se vea bien.
      if (
        nunito &&
        (col.format === 'crc' || col.format === 'int' || col.format === 'pct') &&
        (data.section === 'body' || data.section === 'foot')
      ) {
        data.cell.styles.font = 'Nunito';
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // ── PIE ─────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 40;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageH = (doc as any).internal.pageSize.getHeight();
  let fy = finalY + 6;
  if (fy + 8 > pageH) {
    doc.addPage();
    fy = 15;
  }
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  const pie =
    `SIC — Sistema Inteligente de Cobranza · Cofersa © ${new Date().getFullYear()}` +
    (generadoPor ? `   ·   Generado por ${generadoPor}` : '');
  doc.text(pie, ML, fy);
  doc.text(`${filas.length} registro${filas.length !== 1 ? 's' : ''}`, PW - MR, fy, {
    align: 'right',
  });

  return doc;
}

// ══════════════════════════════════════════════════════════════════════
// EXCEL
// ══════════════════════════════════════════════════════════════════════

export async function exportTablaExcel(params: ExportTablaParams): Promise<void> {
  const buffer = await buildTablaExcelBuffer(params);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilename(params.nombreArchivo)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function generarTablaExcelBase64(params: ExportTablaParams): Promise<string> {
  const buffer = await buildTablaExcelBuffer(params);
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function buildTablaExcelBuffer(params: ExportTablaParams): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const { filas, columnas, titulo, subtitulo, meta, totales } = params;

  const rows: (string | number | null)[][] = [];
  rows.push([titulo]);
  if (subtitulo) rows.push([subtitulo]);
  rows.push([`Generado: ${fechaHoyCR()}`]);
  if (meta && meta.length) rows.push(meta.map((m) => `${m.label}: ${m.value}`));
  rows.push([]);

  rows.push(columnas.map((c) => c.label));
  for (const f of filas) {
    rows.push(columnas.map((c) => valorExcel(f[c.key], c.format)));
  }
  if (totales) {
    rows.push(
      columnas.map((c, i) =>
        i === 0
          ? 'TOTAL'
          : totales[c.key] !== undefined
            ? valorExcel(totales[c.key], c.format)
            : null,
      ),
    );
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = columnas.map((c) => ({ wch: c.width ?? (c.format === 'crc' ? 16 : 18) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
