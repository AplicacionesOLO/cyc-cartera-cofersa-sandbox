'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarCheck,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Ban,
  Award,
  Loader2,
  Link2,
} from 'lucide-react';
import ReporteShell from '@/components/reportes/ReporteShell';
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis';
import { fmtCRC } from '@/lib/utils/formato';
import { colorAvaluo, bgAvaluo } from '@/lib/utils/riesgo';
import type { CierreMensualData } from '@/types/reportes';

interface Props {
  data: CierreMensualData;
  generadoPor: string;
}

const HEADER_TEXT_STYLE: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

// ── Tabla de ranking genérica (Sin Pago / Déficit / Deterioro / Mejoras) ──────

interface ColumnaRanking<T> {
  label: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T, i: number) => React.ReactNode;
  width?: string;
}

function TablaRanking<T>({
  titulo,
  descripcion,
  colorAcento,
  rows,
  columnas,
  vacioMensaje,
}: {
  titulo: string;
  descripcion: string;
  colorAcento: string;
  rows: T[];
  columnas: ColumnaRanking<T>[];
  vacioMensaje: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50">
        <p className="text-[12px] font-bold text-gray-700">{titulo}</p>
        <p className="text-[10.5px] text-gray-400 mt-0.5">{descripcion}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-gray-400">{vacioMensaje}</p>
      ) : (
        <table
          style={{
            tableLayout: 'fixed',
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: '560px',
          }}
        >
          <colgroup>
            <col style={{ width: '32px' }} />
            {columnas.map((c, i) => (
              <col key={i} style={{ width: c.width ?? 'auto' }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '8px 10px', ...HEADER_TEXT_STYLE, textAlign: 'center' }}>#</th>
              {columnas.map((c, i) => (
                <th
                  key={i}
                  style={{
                    padding: '8px 10px',
                    ...HEADER_TEXT_STYLE,
                    textAlign: c.align ?? 'left',
                  }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td
                  style={{
                    padding: '9px 10px',
                    textAlign: 'center',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: colorAcento,
                  }}
                >
                  {i + 1}
                </td>
                {columnas.map((c, j) => (
                  <td
                    key={j}
                    style={{ padding: '9px 10px', textAlign: c.align ?? 'left', fontSize: '12px' }}
                  >
                    {c.render(row, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NombreVendedor({
  nombre,
  codigo,
  vendedor,
}: {
  nombre: string;
  codigo: string;
  vendedor: string;
}) {
  return (
    <div style={{ overflow: 'hidden' }}>
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
        {nombre}
      </p>
      <p
        style={{
          fontSize: '10px',
          color: '#94a3b8',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontFamily: 'monospace' }}>{codigo}</span> · {vendedor}
      </p>
    </div>
  );
}

// ── Exportación PDF (multi-sección, branding Cofersa) ──────────────────────

async function exportarPDF(data: CierreMensualData, generadoPor: string) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const { COL, loadNunito, loadLogo, drawBrandHeader, drawFooters } =
    await import('@/lib/reportes/pdf-branding');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = new (jsPDF as any)({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });
  const f = await loadNunito(doc);
  const logo = await loadLogo();
  const PW = 297,
    PH = 210,
    ML = 12,
    MR = 12,
    CW = PW - ML - MR;
  const ROW_H = 4.6,
    HEAD_H = 6,
    TITLE_H = 7;

  let y = drawBrandHeader(doc, f, PW, ML, MR, logo);
  doc.setFont(f.bold, 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...COL.navy);
  doc.text(`Resumen de Cierre Mensual — ${data.mesLabel}`, ML, y + 4);
  y += 10;

  const metaKpis = [
    { label: 'Meta Total', value: fmtCRC(data.kpis.meta_total) },
    { label: 'Cobrado Total', value: fmtCRC(data.kpis.cobrado_total) },
    { label: '% Alcance', value: `${data.kpis.pct}%` },
    { label: 'Vendedores', value: String(data.kpis.n_vendedores) },
  ];
  const kw = (CW - 3 * 3) / 4;
  metaKpis.forEach((k, i) => {
    const x = ML + i * (kw + 3);
    doc.setFillColor(...COL.bgLight);
    doc.roundedRect(x, y, kw, 14, 2, 2, 'F');
    doc.setFont(f.normal, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COL.gray999);
    doc.text(k.label.toUpperCase(), x + kw / 2, y + 5, { align: 'center' });
    doc.setFont(f.bold, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COL.navy);
    doc.text(k.value, x + kw / 2, y + 11, { align: 'center' });
  });
  y += 18;

  /**
   * Antes de cada sección se estima su alto real (filas × alto de fila + header
   * + título) y solo se salta de página si de verdad no cabe -- así 2 tablas
   * cortas comparten hoja, y una tabla larga no queda con el título huérfano al
   * fondo de una página y el cuerpo empezando en la siguiente.
   */
  function seccion(
    titulo: string,
    head: string[],
    body: (string | number)[][],
    colWidths: number[],
    moneyCols: number[] = [],
  ) {
    const alturaEstimada = TITLE_H + HEAD_H + Math.max(1, body.length) * ROW_H + 4;
    if (y + alturaEstimada > PH - 14) {
      doc.addPage();
      y = 14;
    }
    doc.setFont(f.bold, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COL.navy);
    doc.text(titulo, ML, y);
    y += 3;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const columnStyles: Record<number, any> = {};
    colWidths.forEach((w, i) => {
      columnStyles[i] = {
        cellWidth: w,
        halign: moneyCols.includes(i) ? 'right' : i === 0 ? 'center' : 'left',
      };
    });
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [head],
      body,
      styles: {
        fontSize: 7,
        cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 },
        lineWidth: 0,
      },
      headStyles: {
        fillColor: COL.cyan,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
        lineWidth: 0,
      },
      alternateRowStyles: { fillColor: COL.rowAlt },
      tableLineWidth: 0.2,
      tableLineColor: COL.sep,
      columnStyles,
      // El glifo ₡ solo existe en Nunito -- Helvetica lo muestra como "¡".
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (d: any) => {
        if (moneyCols.includes(d.column.index) && (d.section === 'body' || d.section === 'head')) {
          d.cell.styles.font = 'Nunito';
          if (d.section === 'body') d.cell.styles.fontStyle = 'bold';
        }
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y + alturaEstimada) + 6;
  }

  seccion(
    'Alcance del Presupuesto de Cobro por Vendedor',
    ['Código', 'Vendedor', 'Zona', 'Meta', 'Cobrado', '% Alcance', 'Avalúo de Riesgo'],
    data.vendedores.map((v) => [
      v.vendedor_cod,
      v.vendedor_nombre + (v.portafolioAcotado ? ' (ruta ampliada)' : ''),
      v.zona,
      fmtCRC(v.meta),
      fmtCRC(v.cobrado),
      v.pct !== null ? `${v.pct}%` : '—',
      `${v.avaluoPct}% ${v.avaluoBadge}`,
    ]),
    [16, 60, 18, 34, 34, 24, 40],
    [3, 4],
  );

  seccion(
    `Top ${data.topMora.length} Clientes con Mayor Atraso — Aging al Cierre`,
    [
      'Código',
      'Cliente',
      'Vendedor',
      'No Vencido',
      '1-30',
      '31-60',
      '61-90',
      '91-120',
      '+120',
      'Mora Total',
      'Total General',
      '% Vencida',
    ],
    data.topMora.map((r) => [
      r.cliente_cod,
      r.cliente_nombre,
      r.vendedor_nombre,
      fmtCRC(r.no_vencido),
      fmtCRC(r.mora_1_30),
      fmtCRC(r.mora_31_60),
      fmtCRC(r.mora_61_90),
      fmtCRC(r.mora_91_120),
      fmtCRC(r.mora_120_plus),
      fmtCRC(r.mora_total),
      fmtCRC(r.total_general),
      `${r.pct_cta_vencida}%`,
    ]),
    [16, 38, 30, 20, 18, 18, 18, 18, 18, 22, 22, 15],
    [3, 4, 5, 6, 7, 8, 9, 10, 11],
  );

  seccion(
    `Top ${data.sinPago.length} Clientes con Presupuesto y Sin Pago`,
    ['Código', 'Cliente', 'Vendedor', 'Presupuesto del Mes'],
    data.sinPago.map((r) => [r.cliente_cod, r.cliente_nombre, r.vendedor_nombre, fmtCRC(r.meta)]),
    [18, 90, 60, 40],
    [3],
  );

  seccion(
    `Top ${data.deficit.length} Clientes con Mayor Déficit vs. Presupuesto`,
    ['Código', 'Cliente', 'Vendedor', 'Meta', 'Cobrado', 'Déficit', '% Alcance'],
    data.deficit.map((r) => [
      r.cliente_cod,
      r.cliente_nombre,
      r.vendedor_nombre,
      fmtCRC(r.meta),
      fmtCRC(r.cobrado),
      fmtCRC(r.deficit),
      `${r.pct}%`,
    ]),
    [18, 65, 45, 30, 30, 30, 20],
    [3, 4, 5, 6],
  );

  seccion(
    `Deterioro de Comportamiento de Pago (${data.deterioro.length})`,
    ['Código', 'Cliente', 'Vendedor', 'Atraso Antes (3m)', 'Atraso Ahora (3m)', 'Cambio'],
    data.deterioro.map((r) => [
      r.cliente_cod,
      r.cliente_nombre,
      r.vendedor_nombre,
      `${r.atraso_previo}d`,
      `${r.atraso_reciente}d`,
      `+${r.delta}d`,
    ]),
    [18, 75, 55, 35, 35, 30],
  );

  seccion(
    `Top ${data.mejoras.length} Mejoras vs. Mes Anterior`,
    ['Código', 'Cliente', 'Vendedor', 'Mora Antes', 'Mora Ahora', 'Reducción'],
    data.mejoras.map((r) => [
      r.cliente_cod,
      r.cliente_nombre,
      r.vendedor_nombre,
      fmtCRC(r.mora_anterior),
      fmtCRC(r.mora_actual),
      fmtCRC(r.reduccion),
    ]),
    [18, 65, 50, 40, 40, 40],
    [3, 4, 5],
  );

  drawFooters(doc, f, PW, ML, MR);
  doc.save(`Resumen-Cierre-Mensual-${data.mesLabel.replace(' ', '-')}.pdf`);
}

// ── Exportación Excel (1 hoja por sección) ──────────────────────────────────

async function exportarExcel(data: CierreMensualData) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const hoja = (nombre: string, encabezados: string[], filas: (string | number)[][]) => {
    const ws = XLSX.utils.aoa_to_sheet([encabezados, ...filas]);
    XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31));
  };

  hoja(
    'Resumen',
    ['Mes', 'Meta Total', 'Cobrado Total', '% Alcance', 'Vendedores'],
    [
      [
        data.mesLabel,
        data.kpis.meta_total,
        data.kpis.cobrado_total,
        data.kpis.pct,
        data.kpis.n_vendedores,
      ],
    ],
  );

  hoja(
    'Alcance por Vendedor',
    [
      'Código',
      'Vendedor',
      'Zona',
      'Meta',
      'Cobrado',
      '% Alcance',
      'Avalúo Riesgo %',
      'Avalúo Categoría',
      'Ruta Ampliada',
    ],
    data.vendedores.map((v) => [
      v.vendedor_cod,
      v.vendedor_nombre,
      v.zona,
      v.meta,
      v.cobrado,
      v.pct ?? '',
      v.avaluoPct,
      v.avaluoBadge,
      v.portafolioAcotado ? v.miembrosAcotado.join(', ') : '',
    ]),
  );

  hoja(
    'Top Mayor Atraso',
    [
      'Código',
      'Cliente',
      'Vendedor',
      'No Vencido',
      '1-30',
      '31-60',
      '61-90',
      '91-120',
      '+120',
      'Mora Total',
      'Total General',
      '% Cta Vencida',
    ],
    data.topMora.map((r) => [
      r.cliente_cod,
      r.cliente_nombre,
      r.vendedor_nombre,
      r.no_vencido,
      r.mora_1_30,
      r.mora_31_60,
      r.mora_61_90,
      r.mora_91_120,
      r.mora_120_plus,
      r.mora_total,
      r.total_general,
      r.pct_cta_vencida,
    ]),
  );

  hoja(
    'Sin Pago',
    ['Código', 'Cliente', 'Vendedor', 'Presupuesto del Mes'],
    data.sinPago.map((r) => [r.cliente_cod, r.cliente_nombre, r.vendedor_nombre, r.meta]),
  );

  hoja(
    'Mayor Deficit',
    ['Código', 'Cliente', 'Vendedor', 'Meta', 'Cobrado', 'Deficit', '% Alcance'],
    data.deficit.map((r) => [
      r.cliente_cod,
      r.cliente_nombre,
      r.vendedor_nombre,
      r.meta,
      r.cobrado,
      r.deficit,
      r.pct,
    ]),
  );

  hoja(
    'Deterioro ICP',
    ['Código', 'Cliente', 'Vendedor', 'Atraso Antes (d)', 'Atraso Ahora (d)', 'Cambio (d)'],
    data.deterioro.map((r) => [
      r.cliente_cod,
      r.cliente_nombre,
      r.vendedor_nombre,
      r.atraso_previo,
      r.atraso_reciente,
      r.delta,
    ]),
  );

  hoja(
    'Top Mejoras',
    ['Código', 'Cliente', 'Vendedor', 'Mora Antes', 'Mora Ahora', 'Reduccion'],
    data.mejoras.map((r) => [
      r.cliente_cod,
      r.cliente_nombre,
      r.vendedor_nombre,
      r.mora_anterior,
      r.mora_actual,
      r.reduccion,
    ]),
  );

  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Resumen-Cierre-Mensual-${data.mesLabel.replace(' ', '-')}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Componente principal ────────────────────────────────────────────────────

export default function CierreMensualCliente({ data, generadoPor }: Props) {
  const router = useRouter();
  const [exportando, setExportando] = useState(false);

  async function onPDF() {
    setExportando(true);
    try {
      await exportarPDF(data, generadoPor);
    } finally {
      setExportando(false);
    }
  }
  async function onExcel() {
    setExportando(true);
    try {
      await exportarExcel(data);
    } finally {
      setExportando(false);
    }
  }

  function cambiarMes(v: string) {
    const [a, m] = v.split('-').map(Number);
    router.push(`/reportes/cierre-mensual?anio=${a}&mes=${m}`);
  }

  const opciones =
    data.mesesDisponibles.length > 0
      ? data.mesesDisponibles
      : [{ anio: data.anio, mes: data.mes, label: data.mesLabel }];

  const filtros = (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
        Mes de cierre
      </span>
      <select
        value={`${data.anio}-${data.mes}`}
        onChange={(e) => cambiarMes(e.target.value)}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] bg-white text-gray-700 focus:outline-none"
      >
        {!opciones.some((o) => o.anio === data.anio && o.mes === data.mes) && (
          <option value={`${data.anio}-${data.mes}`}>{data.mesLabel} (sin cierre congelado)</option>
        )}
        {opciones.map((o) => (
          <option key={`${o.anio}-${o.mes}`} value={`${o.anio}-${o.mes}`}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  const kpisStrip = (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <KPICardAnalisis
        compact
        label="Meta del mes"
        valor={fmtCRC(data.kpis.meta_total)}
        color="#003B5C"
        icon={<CalendarCheck size={14} />}
      />
      <KPICardAnalisis
        compact
        label="Cobrado"
        valor={fmtCRC(data.kpis.cobrado_total)}
        sub={`${data.kpis.pct}% de la meta`}
        color="#009ee3"
        icon={<TrendingUp size={14} />}
      />
      <KPICardAnalisis
        compact
        label="Clientes sin pago"
        valor={data.kpis.n_sin_pago}
        sub="con presupuesto y ₡0 cobrado"
        color="#dc2626"
        icon={<Ban size={14} />}
      />
      <KPICardAnalisis
        compact
        label="Vendedores"
        valor={data.kpis.n_vendedores}
        sub="con cartera este mes"
        color="#f59e0b"
        icon={<TrendingDown size={14} />}
      />
    </div>
  );

  return (
    <ReporteShell
      filtros={filtros}
      kpis={kpisStrip}
      onExportPDF={onPDF}
      onExportExcel={onExcel}
      exportando={exportando}
    >
      {!data.disponible && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 flex items-center gap-2">
          <AlertTriangle size={14} className="flex-shrink-0" />
          Todavía no hay un cierre de cartera congelado para {data.mesLabel} — las secciones de
          mayor atraso y mejoras quedan vacías hasta que corra el cierre de ese mes. El alcance de
          presupuesto sí se calcula igual.
        </div>
      )}

      {/* Alcance de presupuesto por vendedor — mejor a peor, sin rutas administrativas ni vendedores sin cartera este mes */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50">
          <p className="text-[12px] font-bold text-gray-700">
            Alcance del Presupuesto de Cobro por Vendedor
          </p>
          <p className="text-[10.5px] text-gray-400 mt-0.5">
            Ordenado de mejor a peor % de alcance — {data.mesLabel}
          </p>
        </div>
        {data.vendedores.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-gray-400">
            Sin presupuesto congelado para este mes.
          </p>
        ) : (
          <table
            style={{
              tableLayout: 'fixed',
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: '820px',
            }}
          >
            <colgroup>
              <col style={{ width: 'auto' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '150px' }} />
            </colgroup>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '8px 10px', ...HEADER_TEXT_STYLE, textAlign: 'left' }}>
                  Vendedor
                </th>
                <th style={{ padding: '8px 10px', ...HEADER_TEXT_STYLE, textAlign: 'left' }}>
                  Código
                </th>
                <th style={{ padding: '8px 10px', ...HEADER_TEXT_STYLE, textAlign: 'left' }}>
                  Zona
                </th>
                <th style={{ padding: '8px 10px', ...HEADER_TEXT_STYLE, textAlign: 'right' }}>
                  Meta
                </th>
                <th style={{ padding: '8px 10px', ...HEADER_TEXT_STYLE, textAlign: 'right' }}>
                  Cobrado
                </th>
                <th style={{ padding: '8px 10px', ...HEADER_TEXT_STYLE, textAlign: 'left' }}>
                  % Alcance
                </th>
                <th style={{ padding: '8px 10px', ...HEADER_TEXT_STYLE, textAlign: 'left' }}>
                  Avalúo de Riesgo
                </th>
              </tr>
            </thead>
            <tbody>
              {data.vendedores.map((v) => {
                const pct = v.pct ?? 0;
                const color = pct >= 90 ? '#16a34a' : pct >= 70 ? '#f59e0b' : '#dc2626';
                return (
                  <tr key={v.vendedor_cod} style={{ borderBottom: '1px solid #f1f5f9' }}>
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
                        {v.vendedor_nombre}
                      </p>
                      {v.portafolioAcotado && (
                        <span
                          className="inline-flex items-center gap-1 mt-0.5 rounded px-1.5 py-0.5"
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            background: '#eff6ff',
                            color: '#1d4ed8',
                          }}
                          title={`Ruta ampliada -- incluye la cartera de: ${v.miembrosAcotado.join(', ')}`}
                        >
                          <Link2 size={9} /> Ruta ampliada ({v.miembrosAcotado.length})
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '9px 10px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: '#64748b',
                      }}
                    >
                      {v.vendedor_cod}
                    </td>
                    <td style={{ padding: '9px 10px', fontSize: '11px', color: '#64748b' }}>
                      {v.zona}
                    </td>
                    <td
                      style={{
                        padding: '9px 10px',
                        textAlign: 'right',
                        fontSize: '12px',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCRC(v.meta)}
                    </td>
                    <td
                      style={{
                        padding: '9px 10px',
                        textAlign: 'right',
                        fontSize: '12px',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCRC(v.cobrado)}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div
                          style={{
                            flex: 1,
                            height: '6px',
                            borderRadius: '4px',
                            background: '#f1f5f9',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, pct)}%`,
                              height: '100%',
                              background: color,
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 700,
                            color,
                            minWidth: '34px',
                            textAlign: 'right',
                          }}
                        >
                          {v.pct !== null ? `${v.pct}%` : '—'}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <span
                        className="inline-flex items-center rounded-md px-1.5 py-0.5"
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          color: colorAvaluo(v.avaluoPct),
                          background: bgAvaluo(v.avaluoPct),
                        }}
                      >
                        {v.avaluoPct}% · {v.avaluoBadge}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Top Mayor Atraso -- aging completo por tramo, igual al reporte manual */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50">
          <p className="text-[12px] font-bold text-gray-700">
            Top {data.topMora.length || 10} Clientes con Mayor Atraso — Aging al Cierre
          </p>
          <p className="text-[10.5px] text-gray-400 mt-0.5">
            Desglose por tramo de mora al cierre de {data.mesLabel}
          </p>
        </div>
        {data.topMora.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-gray-400">
            {data.disponible
              ? 'Ningún cliente en mora al cierre de este mes.'
              : 'Sin cierre congelado para este mes.'}
          </p>
        ) : (
          <table
            style={{
              tableLayout: 'fixed',
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: '1360px',
            }}
          >
            <colgroup>
              <col style={{ width: '32px' }} />
              <col style={{ width: '84px' }} />
              <col style={{ width: 'auto' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '90px' }} />
            </colgroup>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '8px 8px', ...HEADER_TEXT_STYLE, textAlign: 'center' }}>#</th>
                <th style={{ padding: '8px 8px', ...HEADER_TEXT_STYLE, textAlign: 'left' }}>
                  Código
                </th>
                <th style={{ padding: '8px 8px', ...HEADER_TEXT_STYLE, textAlign: 'left' }}>
                  Cliente
                </th>
                <th style={{ padding: '8px 8px', ...HEADER_TEXT_STYLE, textAlign: 'left' }}>
                  Vendedor
                </th>
                <th style={{ padding: '8px 8px', ...HEADER_TEXT_STYLE, textAlign: 'right' }}>
                  No Vencido
                </th>
                <th style={{ padding: '8px 8px', ...HEADER_TEXT_STYLE, textAlign: 'right' }}>
                  1-30
                </th>
                <th style={{ padding: '8px 8px', ...HEADER_TEXT_STYLE, textAlign: 'right' }}>
                  31-60
                </th>
                <th style={{ padding: '8px 8px', ...HEADER_TEXT_STYLE, textAlign: 'right' }}>
                  61-90
                </th>
                <th style={{ padding: '8px 8px', ...HEADER_TEXT_STYLE, textAlign: 'right' }}>
                  91-120
                </th>
                <th style={{ padding: '8px 8px', ...HEADER_TEXT_STYLE, textAlign: 'right' }}>
                  Mora Total
                </th>
                <th style={{ padding: '8px 8px', ...HEADER_TEXT_STYLE, textAlign: 'right' }}>
                  Total General
                </th>
                <th style={{ padding: '8px 8px', ...HEADER_TEXT_STYLE, textAlign: 'right' }}>
                  % Vencida
                </th>
              </tr>
            </thead>
            <tbody>
              {data.topMora.map((r, i) => (
                <tr key={r.cliente_cod} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td
                    style={{
                      padding: '9px 8px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#dc2626',
                    }}
                  >
                    {i + 1}
                  </td>
                  <td
                    style={{
                      padding: '9px 8px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      color: '#64748b',
                    }}
                  >
                    {r.cliente_cod}
                  </td>
                  <td
                    style={{
                      padding: '9px 8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#0f172a',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.cliente_nombre}
                  </td>
                  <td
                    style={{
                      padding: '9px 8px',
                      fontSize: '11px',
                      color: '#475569',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.vendedor_nombre}
                  </td>
                  <td
                    style={{
                      padding: '9px 8px',
                      textAlign: 'right',
                      fontSize: '11px',
                      color: '#64748b',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtCRC(r.no_vencido)}
                  </td>
                  <td
                    style={{
                      padding: '9px 8px',
                      textAlign: 'right',
                      fontSize: '11px',
                      color: '#d97706',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtCRC(r.mora_1_30)}
                  </td>
                  <td
                    style={{
                      padding: '9px 8px',
                      textAlign: 'right',
                      fontSize: '11px',
                      color: '#ea580c',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtCRC(r.mora_31_60)}
                  </td>
                  <td
                    style={{
                      padding: '9px 8px',
                      textAlign: 'right',
                      fontSize: '11px',
                      color: '#ef4444',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtCRC(r.mora_61_90)}
                  </td>
                  <td
                    style={{
                      padding: '9px 8px',
                      textAlign: 'right',
                      fontSize: '11px',
                      color: '#dc2626',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtCRC(r.mora_91_120 + r.mora_120_plus)}
                  </td>
                  <td
                    style={{
                      padding: '9px 8px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#dc2626',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtCRC(r.mora_total)}
                  </td>
                  <td
                    style={{
                      padding: '9px 8px',
                      textAlign: 'right',
                      fontSize: '11.5px',
                      color: '#334155',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtCRC(r.total_general)}
                  </td>
                  <td
                    style={{
                      padding: '9px 8px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: r.pct_cta_vencida > 50 ? '#dc2626' : '#d97706',
                    }}
                  >
                    {r.pct_cta_vencida}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <TablaRanking
        titulo={`Top ${data.sinPago.length || 10} Clientes con Presupuesto y Sin Pago`}
        descripcion={`${data.kpis.n_sin_pago} clientes en total tenían meta de cobro en ${data.mesLabel} y pagaron ₡0 — mostrando los ${data.sinPago.length} con mayor presupuesto`}
        colorAcento="#991b1b"
        rows={data.sinPago}
        vacioMensaje="Ningún cliente con presupuesto quedó en ₡0 este mes."
        columnas={[
          {
            label: 'Cliente',
            render: (r) => (
              <NombreVendedor
                nombre={r.cliente_nombre}
                codigo={r.cliente_cod}
                vendedor={r.vendedor_nombre}
              />
            ),
          },
          {
            label: 'Presupuesto del Mes',
            align: 'right',
            width: '170px',
            render: (r) => (
              <span
                style={{ fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}
              >
                {fmtCRC(r.meta)}
              </span>
            ),
          },
        ]}
      />

      <TablaRanking
        titulo={`Top ${data.deficit.length || 10} Clientes con Mayor Déficit vs. Presupuesto`}
        descripcion={`${data.kpis.n_deficit} clientes en total pagaron algo pero no alcanzaron su meta — mostrando los ${data.deficit.length} con mayor déficit`}
        colorAcento="#d97706"
        rows={data.deficit}
        vacioMensaje="Ningún cliente quedó con déficit relevante este mes."
        columnas={[
          {
            label: 'Cliente',
            render: (r) => (
              <NombreVendedor
                nombre={r.cliente_nombre}
                codigo={r.cliente_cod}
                vendedor={r.vendedor_nombre}
              />
            ),
          },
          {
            label: 'Meta',
            align: 'right',
            width: '110px',
            render: (r) => (
              <span style={{ fontSize: '11.5px', color: '#64748b' }}>{fmtCRC(r.meta)}</span>
            ),
          },
          {
            label: 'Cobrado',
            align: 'right',
            width: '110px',
            render: (r) => (
              <span style={{ fontSize: '11.5px', color: '#64748b' }}>{fmtCRC(r.cobrado)}</span>
            ),
          },
          {
            label: 'Déficit',
            align: 'right',
            width: '130px',
            render: (r) => (
              <span
                style={{ fontWeight: 700, color: '#d97706', fontVariantNumeric: 'tabular-nums' }}
              >
                {fmtCRC(r.deficit)}
              </span>
            ),
          },
        ]}
      />

      <TablaRanking
        titulo={`Deterioro de Comportamiento de Pago (${data.deterioro.length})`}
        descripcion="Clientes cuyo atraso promedio empeoró vs. los 3 meses anteriores — alerta temprana"
        colorAcento="#b91c1c"
        rows={data.deterioro}
        vacioMensaje="Sin datos suficientes de pagos (mínimo 3 recibos en cada ventana de 3 meses) para calcular tendencia."
        columnas={[
          {
            label: 'Cliente',
            render: (r) => (
              <NombreVendedor
                nombre={r.cliente_nombre}
                codigo={r.cliente_cod}
                vendedor={r.vendedor_nombre}
              />
            ),
          },
          {
            label: 'Antes (3m)',
            align: 'right',
            width: '95px',
            render: (r) => (
              <span style={{ fontSize: '11.5px', color: '#64748b' }}>{r.atraso_previo}d</span>
            ),
          },
          {
            label: 'Ahora (3m)',
            align: 'right',
            width: '95px',
            render: (r) => (
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#b91c1c' }}>
                {r.atraso_reciente}d
              </span>
            ),
          },
          {
            label: 'Cambio',
            align: 'right',
            width: '100px',
            render: (r) => <span style={{ fontWeight: 700, color: '#b91c1c' }}>+{r.delta}d</span>,
          },
        ]}
      />

      <TablaRanking
        titulo={`Top ${data.mejoras.length || 10} Mejoras vs. Mes Anterior`}
        descripcion="Clientes que más redujeron su mora — para reconocer, no solo señalar problemas"
        colorAcento="#16a34a"
        rows={data.mejoras}
        vacioMensaje={
          data.disponible
            ? 'Nadie redujo su mora de forma relevante este mes.'
            : 'Sin cierre congelado para comparar.'
        }
        columnas={[
          {
            label: 'Cliente',
            render: (r) => (
              <NombreVendedor
                nombre={r.cliente_nombre}
                codigo={r.cliente_cod}
                vendedor={r.vendedor_nombre}
              />
            ),
          },
          {
            label: 'Mora Antes',
            align: 'right',
            width: '120px',
            render: (r) => (
              <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                {fmtCRC(r.mora_anterior)}
              </span>
            ),
          },
          {
            label: 'Mora Ahora',
            align: 'right',
            width: '120px',
            render: (r) => (
              <span style={{ fontSize: '11.5px', color: '#64748b' }}>{fmtCRC(r.mora_actual)}</span>
            ),
          },
          {
            label: 'Reducción',
            align: 'right',
            width: '140px',
            render: (r) => (
              <span
                style={{ fontWeight: 700, color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}
              >
                <Award
                  size={11}
                  style={{ display: 'inline', marginRight: '3px', marginBottom: '1px' }}
                />
                {fmtCRC(r.reduccion)}
              </span>
            ),
          },
        ]}
      />

      <p className="text-center text-[10.5px] text-gray-400 pb-2 flex items-center justify-center gap-1.5">
        {exportando && <Loader2 size={11} className="animate-spin" />}
        Generado por {generadoPor} · SIC — Sistema Inteligente de Cobranza · Cofersa
      </p>
    </ReporteShell>
  );
}
