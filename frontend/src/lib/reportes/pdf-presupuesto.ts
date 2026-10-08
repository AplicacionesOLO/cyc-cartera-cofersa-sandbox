'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PDF dedicado del Presupuesto de Cobro (VERTICAL).
 * Columnas: Cód. Vendedor · Nombre · Meta. Tarjeta navy de meta total + badge de estado.
 * Solo presentación: NO toca la lógica de datos ni los cálculos.
 */

import { fmtCRC } from '@/lib/utils/formato';
import { safeFilename } from '@/lib/utils/estado-cuenta-export';
import { COL, loadNunito, loadLogo, drawBrandHeader, drawFooters } from './pdf-branding';

export interface PresupuestoPDFParams {
  vendedores: { vendedor_cod: string; vendedor_nombre: string; meta: number }[];
  mesLabel: string;
  congelado: boolean;
  metaTotal: number;
  generadoPor?: string;
  nombreArchivo: string;
}

export async function exportPresupuestoPDF(p: PresupuestoPDFParams): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new (jsPDF as any)({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });
  const f = await loadNunito(doc);
  const logo = await loadLogo();
  const PW = 210,
    ML = 16,
    MR = 16;

  let y = drawBrandHeader(doc, f, PW, ML, MR, logo);

  // ── Título centrado ──────────────────────────────────────────────────
  y += 6;
  doc.setFont(f.bold, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...COL.navy);
  doc.text('Presupuesto de Cobro', PW / 2, y, { align: 'center' });
  y += 5;
  doc.setFont(f.normal, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COL.gray666);
  doc.text(p.mesLabel, PW / 2, y, { align: 'center' });

  // Badge de estado
  y += 5.5;
  const badgeTxt = p.congelado ? 'Congelado' : 'Borrador';
  doc.setFont(f.bold, 'bold');
  doc.setFontSize(6.5);
  const bw = doc.getTextWidth(badgeTxt) + 10;
  const bx = PW / 2 - bw / 2;
  doc.setFillColor(...COL.badgeBg);
  doc.setDrawColor(...COL.badgeBd);
  doc.setLineWidth(0.2);
  doc.roundedRect(bx, y - 3.4, bw, 5, 2.4, 2.4, 'FD');
  doc.setTextColor(...COL.badgeTx);
  doc.text(badgeTxt, PW / 2, y, { align: 'center' });

  // ── Tarjeta META TOTAL ───────────────────────────────────────────────
  y += 7;
  const cardH = 16;
  doc.setFillColor(...COL.cyan);
  doc.roundedRect(ML, y, PW - ML - MR, cardH, 2.2, 2.2, 'F');
  doc.setFont(f.bold, 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...COL.cardLabel);
  doc.text('META TOTAL DEL PERÍODO', PW / 2, y + 5.8, { align: 'center' });
  doc.setFont(f.bold, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(fmtCRC(p.metaTotal), PW / 2, y + 12.3, { align: 'center' });
  y += cardH + 8;

  // ── Etiqueta de sección ──────────────────────────────────────────────
  doc.setFont(f.bold, 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...COL.gray999);
  doc.text('DISTRIBUCIÓN POR VENDEDOR', ML, y);
  y += 2.5;

  // ── Tabla ────────────────────────────────────────────────────────────
  const body = p.vendedores.map((v) => [
    v.vendedor_cod || '—',
    v.vendedor_nombre || '—',
    fmtCRC(v.meta),
  ]);
  const foot = [['—', 'Total', fmtCRC(p.metaTotal)]];

  autoTable(doc, {
    startY: y,
    margin: { top: 14, left: ML, right: MR, bottom: 14 },
    theme: 'plain',
    showFoot: 'lastPage', // la fila Total aparece solo una vez, al final
    head: [['Cód.', 'Nombre del vendedor', 'Meta']],
    body,
    foot,
    styles: {
      font: f.normal,
      fontStyle: 'normal',
      fontSize: 7.5,
      cellPadding: { top: 2.4, bottom: 2.4, left: 3, right: 3 },
      lineWidth: 0,
      textColor: COL.ink,
    },
    headStyles: {
      font: f.bold,
      fontStyle: 'bold',
      fillColor: COL.cyan,
      textColor: [255, 255, 255],
      fontSize: 6.8,
      cellPadding: { top: 2.6, bottom: 2.6, left: 3, right: 3 },
    },
    footStyles: {
      font: f.bold,
      fontStyle: 'bold',
      fillColor: COL.bgLight,
      textColor: COL.navy,
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: COL.rowAlt },
    columnStyles: {
      0: { cellWidth: 24, halign: 'left', textColor: COL.gray999, fontSize: 7 },
      1: { halign: 'left' },
      2: { cellWidth: 42, halign: 'right', font: f.bold, fontStyle: 'bold', textColor: COL.navy },
    },
    didParseCell: (d: any) => {
      if (d.section === 'head') d.cell.styles.halign = d.column.index === 2 ? 'right' : 'left';
      if (d.section === 'foot') d.cell.styles.halign = d.column.index === 2 ? 'right' : 'left';
    },
    didDrawCell: (d: any) => {
      // Separador horizontal tenue entre filas del cuerpo
      if (d.section === 'body' && d.column.index === 0) {
        doc.setDrawColor(...COL.sep);
        doc.setLineWidth(0.1);
        doc.line(ML, d.cell.y + d.cell.height, PW - MR, d.cell.y + d.cell.height);
      }
      // Separador cyan arriba de la fila de total
      if (d.section === 'foot' && d.column.index === 0) {
        doc.setDrawColor(...COL.cyan);
        doc.setLineWidth(0.6);
        doc.line(ML, d.cell.y, PW - MR, d.cell.y);
      }
    },
  });

  drawFooters(doc, f, PW, ML, MR);
  doc.save(`${safeFilename(p.nombreArchivo)}.pdf`);
}
