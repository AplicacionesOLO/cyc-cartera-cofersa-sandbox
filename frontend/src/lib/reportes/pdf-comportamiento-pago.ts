'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PDF dedicado de Comportamiento de Pago por Vendedor (HORIZONTAL).
 * 4 tarjetas resumen + tabla con semáforo. Títulos de columna completos (landscape).
 * Solo presentación: NO toca la lógica de datos ni los cálculos.
 */

import { safeFilename } from '@/lib/utils/estado-cuenta-export';
import { COL, loadNunito, loadLogo, drawBrandHeader, drawFooters } from './pdf-branding';
import type { VendedorRow, VendedorKPIs } from '@/types/analisis-pagos';

export interface ComportamientoPDFParams {
  rows: VendedorRow[];
  kpis: VendedorKPIs;
  periodoLabel: string;
  generadoPor?: string;
  nombreArchivo: string;
}

type RGB = [number, number, number];

// Semáforos (alineados al spec; % Pago Puntual corregido: alto = verde)
function colIcp(v: number): RGB {
  return v < 50 ? COL.rojo : v <= 65 ? COL.amar : COL.ink;
}
function colPuntual(v: number): RGB {
  return v > 20 ? COL.verde : v >= 8 ? COL.amar : COL.rojo;
}
function colDias(v: number): RGB {
  return v < 30 ? COL.verde : v <= 45 ? COL.amar : COL.rojo;
}
function colCrit(v: number): RGB {
  return v <= 5 ? COL.ink : v <= 10 ? COL.amar : COL.rojo;
}

export async function exportComportamientoPagoPDF(p: ComportamientoPDFParams): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new (jsPDF as any)({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });
  const f = await loadNunito(doc);
  const logo = await loadLogo();
  const PW = 297,
    ML = 12,
    MR = 12;
  const CW = PW - ML - MR;

  let y = drawBrandHeader(doc, f, PW, ML, MR, logo);

  // ── Título centrado ──────────────────────────────────────────────────
  y += 6;
  doc.setFont(f.bold, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...COL.navy);
  doc.text('Comportamiento de Pago por Vendedor', PW / 2, y, { align: 'center' });
  y += 5;
  doc.setFont(f.normal, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COL.gray666);
  doc.text(p.periodoLabel, PW / 2, y, { align: 'center' });

  // ── 4 tarjetas resumen ───────────────────────────────────────────────
  y += 5;
  const k = p.kpis;
  const cards: { label: string; value: string }[] = [
    { label: 'MEJOR ICP', value: `${k.mejor_icp_vendedor || '—'} (${k.mejor_icp_valor})` },
    { label: 'MAYOR RIESGO', value: `${k.mayor_riesgo_vendedor || '—'} (${k.mayor_riesgo_pct}%)` },
    {
      label: 'MEJOR PUNTUAL',
      value: `${k.mejor_puntual_vendedor || '—'} (${k.mejor_puntual_pct}%)`,
    },
    { label: 'PEOR DÍAS ATRASO', value: `${k.peor_dias_vendedor || '—'} (${k.peor_dias_valor}d)` },
  ];
  const gap = 5,
    nC = 4;
  const cardW = (CW - gap * (nC - 1)) / nC;
  const cardH = 18;
  cards.forEach((c, i) => {
    const x = ML + i * (cardW + gap);
    doc.setFillColor(...COL.cyan);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
    doc.setFont(f.bold, 'bold');
    doc.setFontSize(5.3);
    doc.setTextColor(...COL.cardLabel);
    doc.text(c.label, x + cardW / 2, y + 4.6, { align: 'center' });
    // Valor: nombre completo sin truncar (11px → baja hasta 9px si es largo)
    doc.setTextColor(255, 255, 255);
    doc.setFont(f.bold, 'bold');
    let fs = 8.3;
    doc.setFontSize(fs);
    let lines: string[] = doc.splitTextToSize(c.value, cardW - 6);
    if (lines.length > 2) {
      fs = 7.4;
      doc.setFontSize(fs);
      lines = doc.splitTextToSize(c.value, cardW - 6);
    }
    if (lines.length > 2) {
      fs = 6.8;
      doc.setFontSize(fs);
      lines = doc.splitTextToSize(c.value, cardW - 6);
    }
    const lh = fs * 0.42;
    lines
      .slice(0, 3)
      .forEach((ln: string, j: number) =>
        doc.text(ln, x + cardW / 2, y + 9 + j * lh, { align: 'center' }),
      );
  });
  y += cardH + 7;

  // ── Etiqueta de sección ──────────────────────────────────────────────
  doc.setFont(f.bold, 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...COL.gray999);
  doc.text(
    `DETALLE POR VENDEDOR — ${p.rows.length} vendedor${p.rows.length !== 1 ? 'es' : ''}`,
    ML,
    y,
  );
  y += 2.5;

  // ── Promedios (fila de total) ────────────────────────────────────────
  const n = p.rows.length || 1;
  const mean = (sel: (r: VendedorRow) => number) =>
    p.rows.reduce((s, r) => s + (Number(sel(r)) || 0), 0) / n;
  const avgCli = Math.round(mean((r) => r.total_clientes));
  const avgIcp = Math.round(mean((r) => r.icp_promedio));
  const avgPct = Math.round(mean((r) => r.pct_a_tiempo) * 10) / 10;
  const avgDias = Math.round(mean((r) => r.dias_atraso_prom));
  const avgCrit = Math.round(mean((r) => r.clientes_criticos) * 10) / 10;

  // ── Tabla ── ordenada de MEJOR a PEOR (ICP descendente) ───────────────
  const ordenados = [...p.rows].sort((a, b) => b.icp_promedio - a.icp_promedio);
  const body = ordenados.map((r, i) => [
    String(i + 1),
    r.vendedor_nombre || '—',
    r.supervisor_cod && r.supervisor_cod !== '—' ? r.supervisor_cod : '—',
    String(r.total_clientes),
    String(r.icp_promedio),
    `${r.pct_a_tiempo}%`,
    `${r.dias_atraso_prom}d`,
    String(r.clientes_criticos),
  ]);
  const foot = [
    [
      '—',
      'Promedio general',
      '—',
      String(avgCli),
      String(avgIcp),
      `${avgPct}%`,
      `${avgDias}d`,
      String(avgCrit),
    ],
  ];

  autoTable(doc, {
    startY: y,
    margin: { top: 14, left: ML, right: MR, bottom: 14 },
    theme: 'plain',
    showFoot: 'lastPage', // "Promedio general" aparece solo una vez, al final del documento
    head: [
      [
        '#',
        'Vendedor',
        'Supervisor',
        'Clientes',
        'ICP Promedio',
        '% Pago Puntual',
        'Días Atraso',
        'Críticos <50',
      ],
    ],
    body,
    foot,
    styles: {
      font: f.normal,
      fontStyle: 'normal',
      fontSize: 7.5,
      cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
      lineWidth: 0,
      textColor: COL.ink,
    },
    headStyles: {
      font: f.bold,
      fontStyle: 'bold',
      fillColor: COL.cyan,
      textColor: [255, 255, 255],
      fontSize: 6.8,
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
      0: { cellWidth: 12, halign: 'center', textColor: COL.gray999 },
      1: { cellWidth: 68, halign: 'left' },
      2: { cellWidth: 45, halign: 'left', textColor: COL.gray666 },
      3: { cellWidth: 24, halign: 'center', font: f.bold, fontStyle: 'bold' },
      4: { cellWidth: 30, halign: 'center', font: f.bold, fontStyle: 'bold' },
      5: { cellWidth: 34, halign: 'center', font: f.bold, fontStyle: 'bold' },
      6: { cellWidth: 30, halign: 'center', font: f.bold, fontStyle: 'bold' },
      7: { cellWidth: 30, halign: 'center', font: f.bold, fontStyle: 'bold' },
    },
    didParseCell: (d: any) => {
      const ci = d.column.index;
      if (d.section === 'head') {
        d.cell.styles.halign = ci === 1 || ci === 2 ? 'left' : 'center';
      }
      if (d.section === 'body') {
        const r = ordenados[d.row.index]; // ← misma lista ordenada que el body (antes usaba p.rows sin ordenar → colores cruzados)
        if (!r) return;
        if (ci === 4) d.cell.styles.textColor = colIcp(r.icp_promedio);
        if (ci === 5) d.cell.styles.textColor = colPuntual(r.pct_a_tiempo);
        if (ci === 6) d.cell.styles.textColor = colDias(r.dias_atraso_prom);
        if (ci === 7) d.cell.styles.textColor = colCrit(r.clientes_criticos);
      }
      if (d.section === 'foot') {
        d.cell.styles.halign = ci === 1 || ci === 2 ? 'left' : 'center';
        d.cell.styles.textColor = COL.navy;
      }
    },
    didDrawCell: (d: any) => {
      if (d.section === 'body' && d.column.index === 0) {
        doc.setDrawColor(...COL.sep);
        doc.setLineWidth(0.1);
        doc.line(ML, d.cell.y + d.cell.height, PW - MR, d.cell.y + d.cell.height);
      }
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
