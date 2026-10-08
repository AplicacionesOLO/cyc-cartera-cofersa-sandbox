'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Helpers de marca compartidos para los PDF "premium" del SIC (jsPDF + autotable).
 * Encabezado con logo Cofersa, fecha/sistema, línea navy; pie con paginación.
 * Tipografía Nunito embebida (Regular + Bold). Colores corporativos Cofersa.
 */
import { loadStaticArrayBuffer, loadStaticBlob } from '@/shared/api/static-asset';

export const COL = {
  navy: [0, 59, 92] as [number, number, number], // #003B5C
  cyan: [0, 158, 227] as [number, number, number], // #009ee3
  bgLight: [238, 242, 247] as [number, number, number], // #EEF2F7
  teal: [159, 225, 203] as [number, number, number], // #9FE1CB (legacy)
  cardLabel: [223, 241, 252] as [number, number, number], // #DFF1FC (label sobre card cyan)
  gray666: [102, 102, 102] as [number, number, number], // #666
  gray999: [153, 153, 153] as [number, number, number], // #999
  grayBBB: [187, 187, 187] as [number, number, number], // #bbb
  rowAlt: [248, 250, 252] as [number, number, number], // #F8FAFC
  sep: [235, 235, 235] as [number, number, number], // #ebebeb
  ink: [26, 26, 26] as [number, number, number], // #1a1a1a
  rojo: [163, 45, 45] as [number, number, number], // #A32D2D
  amar: [133, 79, 11] as [number, number, number], // #854F0B
  verde: [59, 109, 17] as [number, number, number], // #3B6D11
  badgeBg: [230, 241, 251] as [number, number, number], // #E6F1FB
  badgeTx: [24, 95, 165] as [number, number, number], // #185FA5
  badgeBd: [181, 212, 244] as [number, number, number], // #B5D4F4
};

export interface PdfFonts {
  normal: string;
  bold: string;
}

export function fechaHoyCR(): string {
  const d = new Date(Date.now() - 6 * 3600_000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

async function fetchFontB64(path: string): Promise<string | null> {
  try {
    const buf = await loadStaticArrayBuffer(path);
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  } catch {
    return null;
  }
}

/** Registra Nunito (Regular + Bold). Si alguna falla, cae a Helvetica para ese estilo. */
export async function loadNunito(doc: any): Promise<PdfFonts> {
  const [reg, bold] = await Promise.all([
    fetchFontB64('/fonts/Nunito-Regular.ttf'),
    fetchFontB64('/fonts/Nunito-Bold.ttf'),
  ]);
  const f: PdfFonts = { normal: 'helvetica', bold: 'helvetica' };
  if (bold) {
    doc.addFileToVFS('Nunito-Bold.ttf', bold);
    doc.addFont('Nunito-Bold.ttf', 'Nunito', 'bold');
    f.bold = 'Nunito';
  }
  if (reg) {
    doc.addFileToVFS('Nunito-Regular.ttf', reg);
    doc.addFont('Nunito-Regular.ttf', 'Nunito', 'normal');
    f.normal = 'Nunito';
  }
  return f;
}

/**
 * Registra solo Nunito-Bold (sin Regular). Ahorra ~271 KB por descarga en PDFs
 * que solo necesitan la variante bold para títulos y montos.
 * Los textos secondary (labels, pie) caen a Helvetica — diferencia imperceptible a 6-8px.
 */
export async function loadNunitoBold(doc: any): Promise<PdfFonts> {
  const bold = await fetchFontB64('/fonts/Nunito-Bold.ttf');
  const f: PdfFonts = { normal: 'helvetica', bold: 'helvetica' };
  if (bold) {
    doc.addFileToVFS('Nunito-Bold.ttf', bold);
    doc.addFont('Nunito-Bold.ttf', 'Nunito', 'bold');
    f.bold = 'Nunito';
  }
  return f;
}

/** Carga el logo real de Cofersa (mismo PNG que usa la app) como data URL. null si falla. */
export async function loadLogo(): Promise<string | null> {
  try {
    const blob = await loadStaticBlob('/logo-cofersa.png');
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

/** Encabezado: logo real Cofersa (izq) · Generado/fecha · Sistema/SIC · línea navy. Devuelve la Y donde empieza el contenido. */
export function drawBrandHeader(
  doc: any,
  f: PdfFonts,
  PW: number,
  ML: number,
  MR: number,
  logoDataUrl?: string | null,
): number {
  // Logo real (addImage); si no carga, cae al punto cyan + texto "Cofersa"
  let drewLogo = false;
  if (logoDataUrl) {
    try {
      const props = doc.getImageProperties(logoDataUrl);
      const h = 13,
        w = h * (props.width / props.height);
      doc.addImage(logoDataUrl, props.fileType || 'PNG', ML, 3, w, h);
      drewLogo = true;
    } catch {
      drewLogo = false;
    }
  }
  if (!drewLogo) {
    doc.setFillColor(...COL.cyan);
    doc.circle(ML + 2.6, 9.5, 2.6, 'F');
    doc.setFont(f.bold, 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...COL.navy);
    doc.text('Cofersa', ML + 6.5, 11.5);
  }

  // Bloque derecho: Sistema (extremo) + Generado (a su izquierda)
  const yLabel = 8,
    yVal = 12;
  doc.setFont(f.normal, 'normal');
  doc.setFontSize(5.6);
  doc.setTextColor(...COL.gray999);
  doc.text('SISTEMA', PW - MR, yLabel, { align: 'right' });
  doc.setFont(f.bold, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COL.navy);
  doc.text('SIC · Cofersa', PW - MR, yVal, { align: 'right' });

  const xGen = PW - MR - 34;
  doc.setFont(f.normal, 'normal');
  doc.setFontSize(5.6);
  doc.setTextColor(...COL.gray999);
  doc.text('GENERADO', xGen, yLabel, { align: 'right' });
  doc.setFont(f.bold, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COL.navy);
  doc.text(fechaHoyCR(), xGen, yVal, { align: 'right' });

  // Separador cyan corporativo
  doc.setDrawColor(...COL.cyan);
  doc.setLineWidth(0.6);
  doc.line(ML, 19, PW - MR, 19);
  return 24;
}

/** Pie en todas las páginas: sistema (izq) · Página N de M (der). */
export function drawFooters(doc: any, f: PdfFonts, PW: number, ML: number, MR: number): void {
  const n = doc.internal.getNumberOfPages();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const y = H - 7;
    doc.setDrawColor(224, 224, 224);
    doc.setLineWidth(0.2);
    doc.line(ML, y - 3, PW - MR, y - 3);
    doc.setFont(f.normal, 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...COL.grayBBB);
    doc.text('SIC — Sistema Inteligente de Cobranza · Cofersa © 2026', ML, y);
    doc.text(`Página ${i} de ${n}`, PW - MR, y, { align: 'right' });
  }
}
