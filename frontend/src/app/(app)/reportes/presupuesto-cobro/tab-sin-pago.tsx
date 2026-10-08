'use client';

import { useState } from 'react';
import { useSinPagoController } from '@/views/presupuesto/hooks/use-recuperacion-reportes-controller';
import { fmtCRC } from '@/lib/utils/formato';
import { exportTablaPDF, exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis';

const COLS: ColumnaReporte[] = [
  { key: 'cliente_nombre', label: 'Cliente', align: 'left', format: 'text', width: 58 },
  { key: 'vendedor_nombre', label: 'Vendedor', align: 'left', format: 'text', width: 44 },
  { key: 'analista_nombre', label: 'Analista', align: 'left', format: 'text', width: 34 },
  { key: 'dimension', label: 'Dimensión', align: 'left', format: 'text', width: 28 },
  { key: 'ppto_mes', label: 'Ppto Mes', align: 'right', format: 'crc', width: 30 },
  { key: 'cobrado', label: 'Cobrado', align: 'right', format: 'crc', width: 28 },
  { key: 'pct_alcance', label: '% Alcance', align: 'right', format: 'pct', width: 20 },
];

interface Props {
  anio: number;
  mes: number;
  mesLabel: string;
  generadoPor: string;
  filtroDim: string;
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border h-20 animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-xl border h-72 animate-pulse" />
    </div>
  );
}

export default function TabSinPago({ anio, mes, mesLabel, generadoPor, filtroDim }: Props) {
  const { filas, pptoTotal, loading, error, reload: fetchData } = useSinPagoController(anio, mes);
  const [exportando, setExportando] = useState(false);

  if (loading) return <Skeleton />;
  if (error)
    return (
      <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
        <p className="text-red-600 text-sm font-semibold">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 text-[#009ee3] text-sm font-semibold hover:underline"
        >
          Reintentar
        </button>
      </div>
    );

  const filasFiltradas = filas.filter((f) => !filtroDim || f.dimension === filtroDim);

  const pptoEnRiesgo = filasFiltradas.reduce((s, f) => s + f.ppto_mes, 0);
  const pctRiesgo = pptoTotal > 0 ? Math.round((pptoEnRiesgo / pptoTotal) * 100) : 0;
  const nombreArchivo = `sin-pago-${mesLabel.replace(' ', '-').toLowerCase()}`;

  function exportParams() {
    const filasExp = filasFiltradas.map((f) => ({
      ...f,
      pct_alcance: f.ppto_mes > 0 ? Math.round((f.cobrado / f.ppto_mes) * 1000) / 10 : 0,
    }));
    return {
      filas: filasExp as unknown as Record<string, unknown>[],
      columnas: COLS,
      titulo: 'Sin pago este mes',
      subtitulo: `${mesLabel} · Clientes con presupuesto y cero cobro`,
      meta: [
        { label: 'Clientes sin pago', value: String(filasFiltradas.length) },
        { label: 'Presupuesto en riesgo', value: fmtCRC(pptoEnRiesgo) },
        { label: '% del ppto. mensual', value: `${pctRiesgo}%` },
      ],
      orientacion: 'landscape' as const,
      nombreArchivo,
      generadoPor,
    };
  }

  async function onPDF() {
    setExportando(true);
    try {
      await exportTablaPDF(exportParams());
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

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KPICardAnalisis
          label="Clientes sin pago"
          valor={String(filasFiltradas.length)}
          color="#dc2626"
        />
        <KPICardAnalisis
          label="Presupuesto en riesgo"
          valor={fmtCRC(pptoEnRiesgo)}
          color="#dc2626"
        />
        <KPICardAnalisis label="% del ppto. mensual" valor={`${pctRiesgo}%`} color="#f59e0b" />
      </div>

      {filas.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 p-8 text-center">
          <p className="text-gray-400 text-sm">
            No hay clientes con presupuesto sin cobro en {mesLabel}.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50 flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              {filasFiltradas.length} clientes · sin cobro en {mesLabel}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onPDF}
                disabled={exportando}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[12px] font-semibold text-gray-700 hover:bg-slate-50 disabled:opacity-50"
              >
                PDF
              </button>
              <button
                onClick={onExcel}
                disabled={exportando}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[12px] font-semibold text-gray-700 hover:bg-slate-50"
              >
                Excel
              </button>
            </div>
          </div>

          {filasFiltradas.length === 0 ? (
            <p className="px-4 py-6 text-[12px] text-gray-400 text-center">
              Sin resultados para el filtro aplicado.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {(
                    [
                      ['Cliente', 'left'],
                      ['Vendedor', 'left'],
                      ['Analista', 'left'],
                      ['Dimensión', 'left'],
                      ['Ppto Mes', 'right'],
                      ['Cobrado', 'right'],
                      ['% Alcance', 'right'],
                    ] as [string, React.CSSProperties['textAlign']][]
                  ).map(([l, a]) => (
                    <th
                      key={l}
                      style={{
                        padding: '8px 12px',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        textAlign: a,
                      }}
                    >
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.map((f) => (
                  <tr
                    key={f.cliente_cod}
                    style={{ borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
                        {f.cliente_nombre}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          color: '#64748b',
                          marginLeft: '7px',
                          background: '#f1f5f9',
                          borderRadius: '3px',
                          padding: '1px 5px',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {f.cliente_cod}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: '11px', color: '#475569' }}>
                      {f.vendedor_nombre}
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: '11px', color: '#475569' }}>
                      {f.analista_nombre}
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: '11px', color: '#475569' }}>
                      {f.dimension}
                    </td>
                    <td
                      style={{
                        padding: '9px 12px',
                        textAlign: 'right',
                        fontSize: '12px',
                        color: '#003B5C',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCRC(f.ppto_mes)}
                    </td>
                    <td
                      style={{
                        padding: '9px 12px',
                        textAlign: 'right',
                        fontSize: '12px',
                        color: '#94a3b8',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCRC(f.cobrado)}
                    </td>
                    <td
                      style={{
                        padding: '9px 12px',
                        textAlign: 'right',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#dc2626',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      0%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
