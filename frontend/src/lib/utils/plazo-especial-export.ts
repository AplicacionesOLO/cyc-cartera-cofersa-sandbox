'use client';
/**
 * Exportación Excel y PDF para el reporte de Facturas con Plazo Especial.
 * Importaciones dinámicas para evitar problemas SSR.
 * Solo llamar desde Client Components.
 */

import type { PlazoEspecialResult, PlazoEspecialVendedor } from '@/types/reportes';

// ── Helpers internos ───────────────────────────────────────────────────────

function fmtN(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function fmtFechaExp(iso: string): string {
  const p = iso.split('-');
  return p.length >= 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}

function safe(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function fechaHoy(): string {
  const d = new Date(Date.now() - 6 * 3600_000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

// ── Excel ──────────────────────────────────────────────────────────────────

/**
 * Genera un Excel con una hoja por vendedor.
 * Si se pasa `vendedor`, exporta solo ese vendedor.
 */
export async function exportPlazoExcel(
  data: PlazoEspecialResult,
  vendedor?: PlazoEspecialVendedor,
): Promise<void> {
  const { utils, writeFile } = await import('xlsx');
  const wb = utils.book_new();

  const vendors = vendedor ? [vendedor] : data.vendedores;

  for (const v of vendors) {
    const encabezado = [
      [`FACTURAS CON PLAZO ESPECIAL — ${v.vendedor_nombre}`],
      [
        `Generado: ${fechaHoy()}  |  ${v.n_facturas} facturas  |  Saldo: ₡${fmtN(v.saldo_total)}  |  Vencidas: ${v.vencidas}`,
      ],
      [],
      [
        'Factura',
        'Cliente',
        'Cód. Cliente',
        'Emisión',
        'Vencimiento',
        'Plazo Fac. (d)',
        'Plazo Cli. (d)',
        'Monto (₡)',
        'Saldo (₡)',
        'Días',
      ],
    ];

    const filas = v.facturas.map((f) => [
      f.documento,
      f.cliente_nombre,
      f.cliente_cod,
      fmtFechaExp(f.fecha_emision),
      fmtFechaExp(f.fecha_vencimiento),
      f.plazo_factura,
      f.plazo_cliente,
      f.monto,
      f.saldo,
      f.vencida ? -Math.abs(f.dias_a_vencer) : f.dias_a_vencer,
    ]);

    const ws = utils.aoa_to_sheet([...encabezado, ...filas]);
    ws['!cols'] = [
      { wch: 20 },
      { wch: 40 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 8 },
    ];

    const sheetName = (safe(v.vendedor_nombre) || `Vendedor-${v.vendedor_cod}`).slice(0, 31);
    utils.book_append_sheet(wb, ws, sheetName);
  }

  const fileName = vendedor
    ? `plazo-especial-${safe(vendedor.vendedor_nombre)}.xlsx`
    : `plazo-especial-todos-${fechaHoy().replace(/\//g, '-')}.xlsx`;

  writeFile(wb, fileName);
}

// ── PDF ────────────────────────────────────────────────────────────────────

const NAVY = [0, 59, 92] as [number, number, number];
const ROJO = [220, 38, 38] as [number, number, number];
const VERDE = [22, 163, 74] as [number, number, number];
const NARAN = [234, 88, 12] as [number, number, number];

/**
 * Genera un PDF landscape A4 con una sección por vendedor.
 * Si se pasa `vendedor`, exporta solo ese vendedor.
 */
export async function exportPlazoPDF(
  data: PlazoEspecialResult,
  vendedor?: PlazoEspecialVendedor,
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const vendors = vendedor ? [vendedor] : data.vendedores;
  let firstPage = true;

  for (const v of vendors) {
    if (!firstPage) doc.addPage();
    firstPage = false;

    // Header azul
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, 297, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Facturas con Plazo Especial — Cofersa', 10, 8);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(v.vendedor_nombre, 10, 13.5);
    doc.setFontSize(8);
    // Nota: ₡ no es compatible con Helvetica (ISO-8859-1); se usa "CRC" en el PDF
    doc.text(
      `${v.n_facturas} facturas  |  Saldo CRC: ${fmtN(v.saldo_total)}  |  ${v.vencidas} vencidas  |  ${fechaHoy()}`,
      10,
      17,
    );

    autoTable(doc, {
      startY: 22,
      // Montos sin símbolo ₡ (no compatible con fuente estándar de jsPDF)
      head: [
        [
          'Factura',
          'Cliente',
          'Emision',
          'Vencimiento',
          'Pz.Fac',
          'Pz.Cli',
          'Monto CRC',
          'Saldo CRC',
          'Dias',
        ],
      ],
      body: v.facturas.map((f) => [
        f.documento,
        f.cliente_nombre,
        fmtFechaExp(f.fecha_emision),
        fmtFechaExp(f.fecha_vencimiento),
        `${f.plazo_factura}d`,
        `${f.plazo_cliente}d`,
        fmtN(f.monto), // solo número, sin ₡
        fmtN(f.saldo), // solo número, sin ₡
        f.vencida ? `-${Math.abs(f.dias_a_vencer)}d` : `+${f.dias_a_vencer}d`,
      ]),
      headStyles: {
        fillColor: NAVY,
        fontSize: 7,
        fontStyle: 'bold',
        halign: 'center',
        textColor: [255, 255, 255],
      },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        // A4 landscape usable: 277mm — distribuido para que nada se corte
        0: { cellWidth: 44, textColor: [100, 116, 139] }, // Factura (20 dígitos)
        1: { cellWidth: 54 }, // Cliente
        2: { cellWidth: 20, halign: 'center' }, // Emisión
        3: { cellWidth: 20, halign: 'center' }, // Vencimiento
        4: { cellWidth: 12, halign: 'center' }, // Pz.Fac
        5: { cellWidth: 12, halign: 'center' }, // Pz.Cli
        6: { cellWidth: 42, halign: 'right' }, // Monto CRC
        7: { cellWidth: 42, halign: 'right', fontStyle: 'bold' }, // Saldo CRC
        8: { cellWidth: 14, halign: 'center', fontStyle: 'bold' }, // Días
        // Total: 44+54+20+20+12+12+42+42+14 = 260mm (dentro de 277mm)
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 8) {
          const f = v.facturas[hookData.row.index];
          if (!f) return;
          if (f.vencida) hookData.cell.styles.textColor = ROJO;
          else if (f.dias_a_vencer <= 7) hookData.cell.styles.textColor = NARAN;
          else hookData.cell.styles.textColor = VERDE;
        }
        if (hookData.section === 'body' && hookData.row.index % 2 === 1) {
          hookData.cell.styles.fillColor = [248, 250, 252];
        }
      },
      margin: { left: 10, right: 10 },
    });
  }

  const fileName = vendedor
    ? `plazo-especial-${safe(vendedor.vendedor_nombre)}.pdf`
    : `plazo-especial-todos-${fechaHoy().replace(/\//g, '-')}.pdf`;

  doc.save(fileName);
}
