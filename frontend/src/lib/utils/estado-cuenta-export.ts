'use client';
/**
 * Utilidades de exportación para Estado de Cuenta
 * Genera PDF (jsPDF + autotable) y Excel (SheetJS) en formato simple y profesional.
 *
 * Estas funciones usan importaciones DINÁMICAS para evitar problemas SSR.
 * Sólo llamar desde Client Components.
 */

import type { Factura } from '@/types/database';
import { loadStaticArrayBuffer, loadStaticBlob } from '@/shared/api/static-asset';

// ── Tipos ──────────────────────────────────────────────────────────────
export interface CuentaBancaria {
  banco: string;
  moneda: string;
  tipo: string; // 'cuenta' | 'sinpe'
  numero: string;
  iban?: string | null;
}

/** Orden de facturas para PDF/Excel. Si no se especifica, usa el default: vencidas primero. */
export type SortFieldEstadoCuenta = 'documento' | 'fecha_documento' | 'fecha_vencimiento';

export interface EstadoCuentaExportParams {
  facturas: Factura[];
  clienteNombre: string;
  contribuyente: string;
  clienteCod: string;
  condicionPago?: string | null;
  observaciones?: string;
  cuentas: CuentaBancaria[];
  fechaCorte: string; // dd/MM/yyyy
  analistaNombre: string;
  analistaEmail: string;
  analistaTelefono?: string | null;
  analistaWhatsapp?: string | null;
  sortField?: SortFieldEstadoCuenta;
  sortDir?: 'asc' | 'desc';
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Formato CR sin prefijo: 38.543,27  (para columnas cuyo encabezado ya dice CRC) */
function fmtPDF(n: number): string {
  const [intPart, decPart] = (Math.round(n * 100) / 100).toFixed(2).split('.');
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + decPart;
}

/** Formato CR con signo colones para KPIs — igual que en el email HTML: ₡38.543,27 */
function fmtPDFLabel(n: number): string {
  return '₡' + fmtPDF(n); // U+20A1 = ₡ (signo colones)
}

function fmtFechaPDF(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** Días de vencimiento (positivo = vencida) */
function diasVenc(fv: string, hoy: string): number {
  return Math.floor((new Date(hoy).getTime() - new Date(fv).getTime()) / 86400000);
}

/**
 * Ordena las facturas pendientes de saldo para PDF/Excel.
 * Sin sortField: comportamiento default histórico (vencidas primero, mayor antigüedad primero).
 * Con sortField: respeta el orden que el usuario dejó en pantalla (Documento / F. Emisión / F. Vencimiento).
 */
function ordenarFacturasExport(
  facturas: Factura[],
  hoy: string,
  sortField?: SortFieldEstadoCuenta,
  sortDir?: 'asc' | 'desc',
): Factura[] {
  const pendientes = facturas.filter((f) => (f.saldo ?? 0) > 0);
  if (!sortField) {
    return pendientes.sort((a, b) => {
      const da = a.fecha_vencimiento ? diasVenc(a.fecha_vencimiento, hoy) : -9999;
      const db = b.fecha_vencimiento ? diasVenc(b.fecha_vencimiento, hoy) : -9999;
      return db - da;
    });
  }
  const dir = sortDir === 'desc' ? -1 : 1;
  return pendientes.sort((a, b) => {
    if (sortField === 'documento')
      return (a.documento ?? '').localeCompare(b.documento ?? '') * dir;
    const va = a[sortField] ? new Date(a[sortField] as string).getTime() : 0;
    const vb = b[sortField] ? new Date(b[sortField] as string).getTime() : 0;
    return (va - vb) * dir;
  });
}

/** Etiqueta de estado para una factura */
export function estadoLabelExport(fv: string | null | undefined, hoy: string): string {
  if (!fv) return 'Sin fecha';
  const d = diasVenc(fv, hoy);
  if (d < 0) return `Vence en ${Math.abs(d)}d`;
  if (d === 0) return 'Vence hoy';
  return `Vencida ${d}d`;
}

/** Calcula aging por tramo desde las facturas */
export function calcAging(facturas: Factura[], hoy: string) {
  const r = { aldia: 0, m1_30: 0, m31_60: 0, m61_90: 0, m91_120: 0, m120plus: 0 };
  for (const f of facturas) {
    if (!f.saldo || f.saldo <= 0 || !f.fecha_vencimiento) continue;
    const d = diasVenc(f.fecha_vencimiento, hoy);
    if (d < 0) r.aldia += f.saldo;
    else if (d <= 30) r.m1_30 += f.saldo;
    else if (d <= 60) r.m31_60 += f.saldo;
    else if (d <= 90) r.m61_90 += f.saldo;
    else if (d <= 120) r.m91_120 += f.saldo;
    else r.m120plus += f.saldo;
  }
  return r;
}

/** Carga una imagen como data URL para usar en jsPDF */
async function loadImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const blob = await loadStaticBlob(src);
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════
// PDF
// ══════════════════════════════════════════════════════════════════════

/** Sanitiza el nombre del cliente para usarlo en un nombre de archivo */
export function safeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quitar acentos
    .replace(/[^a-zA-Z0-9\s]/g, '') // solo alfanumérico + espacio
    .trim()
    .replace(/\s+/g, '-') // espacios → guión
    .slice(0, 60);
}

/** Descarga el PDF directamente en el navegador */
export async function exportarEstadoCuentaPDF(params: EstadoCuentaExportParams): Promise<void> {
  const doc = await buildEstadoCuentaDoc(params);
  const safe = safeFilename(params.clienteNombre);
  doc.save(`estado-cuenta-${safe}.pdf`);
}

/** Retorna el PDF como base64 (para adjuntar en email) */
export async function generarEstadoCuentaBase64(params: EstadoCuentaExportParams): Promise<string> {
  const doc = await buildEstadoCuentaDoc(params);
  const dataUri = doc.output('datauristring') as string;
  return dataUri.split(',')[1] ?? '';
}

// ── Construcción del documento PDF ────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildEstadoCuentaDoc(params: EstadoCuentaExportParams): Promise<any> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const {
    facturas,
    clienteNombre,
    contribuyente,
    clienteCod,
    condicionPago,
    observaciones,
    cuentas,
    fechaCorte,
    analistaNombre,
    analistaEmail,
    analistaTelefono,
    analistaWhatsapp,
    sortField,
    sortDir,
  } = params;

  const hoy = new Date(Date.now() - 6 * 3600_000).toISOString().split('T')[0];
  const totalSaldo = facturas.reduce((s, f) => s + (f.saldo || 0), 0);
  const totalMonto = facturas.reduce((s, f) => s + (f.monto || 0), 0);
  const aging = calcAging(facturas, hoy);
  // Total vencido = todos los tramos excepto "al día"
  const totalVenc = aging.m1_30 + aging.m31_60 + aging.m61_90 + aging.m91_120 + aging.m120plus;
  const nPend = facturas.filter((f) => (f.saldo ?? 0) > 0).length;

  // Precarga del logo antes de crear el doc
  const logoDataUrl = await loadImageAsDataUrl('/logo-cofersa.png');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = new (jsPDF as any)({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  // ── Cargar Nunito Bold (font corporativo; SÍ incluye ₡ U+20A1, verificado) ──
  // Helvetica built-in es Latin-1 y no tiene ₡. Nunito es el font de marca de
  // Cofersa y coincide con el render del correo HTML. Archivo en public/fonts/.
  // Si el fetch falla por cualquier razón, se usa Helvetica como fallback.
  let nunitoBoldLoaded = false;
  try {
    const buf = await loadStaticArrayBuffer('/fonts/Nunito-Bold.ttf');
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    doc.addFileToVFS('Nunito-Bold.ttf', btoa(bin));
    doc.addFont('Nunito-Bold.ttf', 'Nunito', 'bold');
    nunitoBoldLoaded = true;
  } catch {
    nunitoBoldLoaded = false;
  }

  const PW = 210;
  const ML = 12,
    MR = 12;
  const CW = PW - ML - MR; // 186 mm

  // ─── HEADER (fondo blanco — logo sin problemas de contraste) ────────
  // Sin barra de color para evitar conflicto con el fondo blanco del logo PNG.
  // Se usa una línea cyan al pie como acento de marca.
  const HEADER_H = 24;

  // Logo (izquierda) — más grande, sobre fondo blanco de la página
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', ML, 3, 50, 19); // ancho 50mm, alto 19mm
  } else {
    doc.setTextColor(0, 59, 92);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('COFERSA', ML, 15);
  }

  // Título (centro) — negro igual que el logo Cofersa
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Estado de Cuenta', PW / 2, 15, { align: 'center' });

  // Fecha de corte (derecha)
  doc.setTextColor(148, 163, 184); // #94a3b8 label secundario
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('FECHA DE CORTE', PW - MR, 10, { align: 'right' });
  doc.setTextColor(0, 0, 0); // negro para el valor
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(fechaCorte, PW - MR, 18, { align: 'right' });

  // Línea separadora cyan — acento de marca al pie del header
  doc.setDrawColor(0, 158, 227); // #009EE3 cyan corporativo
  doc.setLineWidth(0.8);
  doc.line(0, HEADER_H, PW, HEADER_H);

  let y = HEADER_H + 5;

  // ─── DATOS DEL CLIENTE (igual al email HTML: 2 col sin separador) ──────
  // Izquierda: CLIENTE label → nombre → Contribuyente: xxx
  // Derecha:   CONDICIÓN DE PAGO label → valor (alineado a la derecha)
  const CLIENT_H = 22;
  // ── Cajón cliente — mismo estilo que el HTML ────────────────────────
  // Fondo azul muy claro + borde azul claro + barra izquierda cyan
  doc.setFillColor(240, 249, 255); // #f0f9ff
  doc.setDrawColor(186, 230, 253); // #bae6fd borde azul claro
  doc.setLineWidth(0.2);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).roundedRect(ML, y, CW, CLIENT_H, 2, 2, 'FD');
  // Barra lateral izquierda cyan — acento corporativo
  doc.setFillColor(0, 158, 227); // #009ee3 cyan
  doc.rect(ML, y, 2.5, CLIENT_H, 'F');

  // Label "CLIENTE" en cyan
  doc.setTextColor(0, 158, 227); // #009ee3
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE', ML + 6, y + 5.5);

  // Nombre del cliente en navy
  doc.setTextColor(0, 59, 92); // #003B5C navy corporativo
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  const nom = clienteNombre.length > 50 ? clienteNombre.slice(0, 47) + '...' : clienteNombre;
  doc.text(nom, ML + 6, y + 11.5);

  // Contribuyente como subtítulo
  doc.setTextColor(100, 116, 139); // #64748b
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Contribuyente: ${contribuyente}`, ML + 6, y + 17.5);

  // CONDICIÓN DE PAGO (derecha)
  if (condicionPago) {
    doc.setTextColor(0, 158, 227); // #009ee3 cyan
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text('CONDICIÓN DE PAGO', ML + CW - 5, y + 5.5, { align: 'right' });
    doc.setTextColor(0, 59, 92); // #003B5C navy
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(condicionPago, ML + CW - 5, y + 11.5, { align: 'right' });
  }

  y += CLIENT_H + 4;

  // ─── KPI ROW (3 tarjetas compactas, dos zonas: gris arriba + blanco abajo) ──
  // Mismo estilo que el email HTML: zona gris #f1f5f9 para el label,
  // zona blanca para el valor — igual que los cards del estado de cuenta por correo.
  const KPI_H = 16; // mm — altura total del card
  const LABEL_ZONE_H = 6.5; // mm — altura de la zona gris (label)
  const kpiW = (CW - 4) / 3;
  const kpis = [
    { label: 'SALDO TOTAL PENDIENTE', value: fmtPDFLabel(totalSaldo) },
    { label: 'TOTAL VENCIDO', value: fmtPDFLabel(totalVenc) },
    { label: 'FACTURAS PENDIENTES', value: `${nPend}` },
  ];
  kpis.forEach((k, i) => {
    const x = ML + i * (kpiW + 2);
    const cx = x + kpiW / 2;
    const RX = 2; // radio de esquinas (mm)

    // ── Card de KPI: mismo estilo que el HTML ──────────────────────
    // Técnica limpia sin artefactos:
    // 1. Fondo blanco completo con bordes redondeados
    doc.setFillColor(255, 255, 255);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).roundedRect(x, y, kpiW, KPI_H, RX, RX, 'F');

    // 2. Zona label: cyan redondeado que se extiende RX mm más abajo del label zone
    //    (sus esquinas inferiores quedan dentro del card y se tapan con el paso 3)
    doc.setFillColor(0, 158, 227); // #009ee3 cyan corporativo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).roundedRect(x, y, kpiW, LABEL_ZONE_H + RX, RX, RX, 'F');

    // 3. Zona valor: rectángulo blanco desde el borde del label hasta el fondo
    //    Cubre las esquinas redondeadas inferiores del cyan del paso 2
    doc.setFillColor(255, 255, 255);
    doc.rect(x, y + LABEL_ZONE_H, kpiW, KPI_H - LABEL_ZONE_H, 'F');

    // 4. Borde exterior redondeado — cyan corporativo (dibujado al final sobre todo)
    doc.setDrawColor(0, 158, 227); // #009ee3
    doc.setLineWidth(0.2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).roundedRect(x, y, kpiW, KPI_H, RX, RX, 'D');

    // Label centrado en zona cyan — texto blanco, tamaño legible
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(k.label, cx, y + 4.8, { align: 'center', maxWidth: kpiW - 4 });

    // Valor centrado en zona blanca — navy corporativo
    doc.setTextColor(0, 59, 92); // #003B5C navy Cofersa
    doc.setFontSize(9);
    doc.setFont(nunitoBoldLoaded ? 'Nunito' : 'helvetica', 'bold');
    doc.text(k.value, cx, y + LABEL_ZONE_H + 6.5, { align: 'center', maxWidth: kpiW - 6 });
    doc.setFont('helvetica', 'bold'); // restablecer para el resto del documento
  });

  y += KPI_H + 4;

  // ─── OBSERVACIONES (opcional) ────────────────────────────────────────
  if (observaciones?.trim()) {
    const obsLines = doc.splitTextToSize(observaciones.trim(), CW - 10) as string[];
    const obsH = Math.max(12, obsLines.length * 4 + 9);
    doc.setFillColor(240, 249, 255);
    doc.rect(ML + 2, y, CW - 2, obsH, 'F');
    doc.setFillColor(0, 158, 227);
    doc.rect(ML, y, 2, obsH, 'F');
    doc.setTextColor(3, 105, 161);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Nota del analista:', ML + 6, y + 6);
    doc.setFont('helvetica', 'italic');
    doc.text(obsLines, ML + 6, y + 11);
    y += obsH + 4;
  }

  // ─── DETALLE DE FACTURAS ─────────────────────────────────────────────
  y += 4; // espacio extra antes del título de la sección
  doc.setTextColor(0, 59, 92); // #003B5C navy corporativo Cofersa
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALLE DE FACTURAS PENDIENTES', ML, y);
  y += 4;

  // Orden: el que dejó el usuario en pantalla, o vencidas primero por defecto
  const facturasSorted = ordenarFacturasExport(facturas, hoy, sortField, sortDir);

  // Anchos fijos: 42+22+26+32+32+32 = 186 = CW
  // Capturamos la posición exacta de la fila Total con didDrawCell
  let footY = 0;
  let footH = 0;

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    showFoot: 'lastPage',
    head: [['Documento', 'Emision', 'Vencimiento', 'Monto (CRC)', 'Saldo (CRC)', 'Estado']],
    body: facturasSorted.map((f) => [
      f.documento ?? '—',
      fmtFechaPDF(f.fecha_documento),
      fmtFechaPDF(f.fecha_vencimiento),
      fmtPDF(f.monto ?? 0),
      fmtPDF(f.saldo ?? 0),
      estadoLabelExport(f.fecha_vencimiento, hoy),
    ]),
    foot: [['Total', '', '', fmtPDF(totalMonto), fmtPDF(totalSaldo), '']],
    styles: {
      fontSize: 8,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      lineWidth: 0, // sin líneas — evita artefactos de color en PDF viewer
    },
    headStyles: {
      fillColor: [0, 158, 227], // #009ee3 cyan corporativo Cofersa
      textColor: [255, 255, 255], // blanco
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
      lineWidth: 0,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // filas alternadas gris muy claro
    },
    tableLineWidth: 0.3, // borde exterior gris claro igual al HTML
    tableLineColor: [226, 232, 240], // #e2e8f0 — funciona por página en multipágina
    footStyles: {
      fillColor: [248, 250, 252], // gris muy claro igual que el HTML
      textColor: [0, 59, 92], // navy corporativo
      fontStyle: 'bold',
      fontSize: 8,
      lineWidth: 0,
    },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 22 },
      2: { cellWidth: 26 },
      3: { cellWidth: 32, halign: 'right' },
      4: { cellWidth: 32, halign: 'right' },
      5: {
        cellWidth: 32,
        halign: 'center',
        cellPadding: { left: 8, right: 3, top: 2.5, bottom: 2.5 },
      },
    },
    // Guía Tipográfica Cofersa: Rojo #D80236, Naranja #FF6F00, Verde #006400
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (data: any) => {
      if (data.section === 'head' && (data.column.index === 3 || data.column.index === 4)) {
        data.cell.styles.halign = 'right';
      }
      if (data.section === 'head' && data.column.index === 5) {
        data.cell.styles.halign = 'center';
      }
      if (data.section !== 'body' || data.column.index !== 5) return;
      const v = String(data.cell.raw ?? '');
      if (v.startsWith('Vencida'))
        data.cell.styles.textColor = [216, 2, 54]; // rojo
      else if (v === 'Vence hoy')
        data.cell.styles.textColor = [255, 111, 0]; // naranja
      else if (v.startsWith('Vence en')) data.cell.styles.textColor = [0, 100, 0]; // verde
    },
    // Capturamos posición exacta del footer para el borde redondeado posterior
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didDrawCell: (data: any) => {
      if (data.section === 'foot' && data.column.index === 0) {
        footY = data.cell.y;
        footH = data.cell.height;
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableFinalY = (doc as any).lastAutoTable?.finalY ?? y + 60;

  // Borde redondeado cyan únicamente en la fila "Total" — funciona en multipágina
  // (rodear toda la tabla con roundedRect falla cuando hay saltos de página)
  if (footY > 0) {
    doc.setDrawColor(0, 158, 227); // #009ee3 cyan
    doc.setLineWidth(0.4);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).roundedRect(ML, footY, CW, footH, 2, 2, 'D');
  }

  y = tableFinalY + 6;

  // ─── PIE DE PÁGINA — ejecutivo de cuenta ─────────────────────────────
  if (y + 14 > 285) {
    doc.addPage();
    y = 15;
  }

  // Mismo estilo que el HTML: fondo gris muy claro con borde superior
  doc.setFillColor(248, 250, 252); // #f8fafc
  doc.setDrawColor(226, 232, 240); // #e2e8f0
  doc.setLineWidth(0.2);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).roundedRect(ML, y, CW, 14, 2, 2, 'FD');

  // Label "EJECUTIVO DE CUENTA" en cyan
  doc.setTextColor(0, 158, 227); // #009ee3 cyan
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text('EJECUTIVO DE CUENTA', ML + 4, y + 5);

  // Datos de contacto en navy
  doc.setTextColor(0, 59, 92); // #003B5C navy
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const contactParts = [analistaNombre, analistaEmail];
  if (analistaTelefono) contactParts.push(`Tel: ${analistaTelefono}`);
  if (analistaWhatsapp) contactParts.push(`WA: ${analistaWhatsapp}`);
  doc.text(contactParts.join('  |  '), ML + 4, y + 11, { maxWidth: CW * 0.72 });

  doc.setTextColor(0, 158, 227); // #009ee3 cyan
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Cofersa © 2026   Cod: ${clienteCod}`, PW - MR - 2, y + 11, { align: 'right' });

  return doc;
}

// ══════════════════════════════════════════════════════════════════════
// EXCEL — simple: encabezado + tabla de facturas + total
// ══════════════════════════════════════════════════════════════════════

/** Descarga el Excel directamente en el navegador */
export function exportarEstadoCuentaExcel(params: EstadoCuentaExportParams): void {
  const safe = safeFilename(params.clienteNombre);
  generarEstadoCuentaExcelBuffer(params).then((buffer) => {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estado-cuenta-${safe}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

/** Retorna el Excel como base64 (para adjuntar en email) */
export async function generarEstadoCuentaExcelBase64(
  params: EstadoCuentaExportParams,
): Promise<string> {
  const buffer = await generarEstadoCuentaExcelBuffer(params);
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function generarEstadoCuentaExcelBuffer(
  params: EstadoCuentaExportParams,
): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const {
    facturas,
    clienteNombre,
    contribuyente,
    clienteCod,
    fechaCorte,
    analistaNombre,
    analistaEmail,
    sortField,
    sortDir,
  } = params;

  const hoy = new Date(Date.now() - 6 * 3600_000).toISOString().split('T')[0];
  const totalSaldo = facturas.reduce((s, f) => s + (f.saldo || 0), 0);
  const totalMonto = facturas.reduce((s, f) => s + (f.monto || 0), 0);

  const rows: (string | number | null)[][] = [];

  // ── Encabezado ────────────────────────────────────────────────────────
  rows.push(['COFERSA — ESTADO DE CUENTA']);
  rows.push([`Cliente: ${clienteNombre}`]);
  rows.push([`Contribuyente / Cedula: ${contribuyente}`]);
  rows.push([`Codigo: ${clienteCod}`, null, null, null, `Fecha de corte: ${fechaCorte}`]);
  rows.push([]);

  // ── Cabeceras de columna ──────────────────────────────────────────────
  rows.push(['Documento', 'F. Emision', 'F. Vencimiento', 'Monto (CRC)', 'Saldo (CRC)', 'Estado']);

  // ── Facturas (orden de pantalla, o vencidas primero por defecto; montos como números reales) ──
  const sorted = ordenarFacturasExport(facturas, hoy, sortField, sortDir);

  for (const f of sorted) {
    rows.push([
      f.documento ?? '—',
      fmtFechaPDF(f.fecha_documento), // DD/MM/YYYY
      fmtFechaPDF(f.fecha_vencimiento), // DD/MM/YYYY
      Math.round((f.monto ?? 0) * 100) / 100, // número real (sumable en Excel)
      Math.round((f.saldo ?? 0) * 100) / 100, // número real (sumable en Excel)
      estadoLabelExport(f.fecha_vencimiento, hoy),
    ]);
  }

  // ── Fila de totales ───────────────────────────────────────────────────
  rows.push([
    'TOTAL',
    null,
    null,
    Math.round(totalMonto * 100) / 100,
    Math.round(totalSaldo * 100) / 100,
    null,
  ]);
  rows.push([]);

  // ── Ejecutivo de cuenta ───────────────────────────────────────────────
  rows.push([`Ejecutivo: ${analistaNombre}`, null, null, null, analistaEmail]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Ancho de columnas
  ws['!cols'] = [
    { wch: 20 }, // Documento
    { wch: 14 }, // F. Emision
    { wch: 16 }, // F. Vencimiento
    { wch: 18 }, // Monto
    { wch: 18 }, // Saldo
    { wch: 16 }, // Estado
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Estado de Cuenta');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
