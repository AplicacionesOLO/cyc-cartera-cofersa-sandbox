'use client';

import { useState } from 'react';
import { useAgingController } from '@/views/reportes/hooks/use-aging-controller';
import { fmtCRC } from '@/lib/utils/formato';
import ReporteShell from '@/components/reportes/ReporteShell';
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis';
import { exportTablaPDF, exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';
import type { AgingResult, AgingFila } from '@/types/reportes';

type Vista = 'consolidado' | 'analista' | 'vendedor';

const COLS: ColumnaReporte[] = [
  { key: 'nombre', label: '', align: 'left', format: 'text', width: 46 },
  { key: 'n_clientes', label: 'Clientes', align: 'right', format: 'int', width: 16 },
  { key: 'no_vencido', label: 'No vencido', align: 'right', format: 'crc', width: 26 },
  { key: 'm1_30', label: '1-30d', align: 'right', format: 'crc', width: 22 },
  { key: 'm31_60', label: '31-60d', align: 'right', format: 'crc', width: 22 },
  { key: 'm61_90', label: '61-90d', align: 'right', format: 'crc', width: 22 },
  { key: 'm91_120', label: '91-120d', align: 'right', format: 'crc', width: 22 },
  { key: 'm120', label: '+120d', align: 'right', format: 'crc', width: 22 },
  { key: 'mora_total', label: 'Mora total', align: 'right', format: 'crc', width: 26 },
  { key: 'total', label: 'Cartera', align: 'right', format: 'crc', width: 26 },
  { key: 'pct_mora', label: '% Mora', align: 'right', format: 'pct', width: 14 },
];

const TRAMOS = [
  { key: 'no_vencido', label: 'Al día', color: '#16a34a' },
  { key: 'm1_30', label: '1-30d', color: '#d97706' },
  { key: 'm31_60', label: '31-60d', color: '#ea580c' },
  { key: 'm61_90', label: '61-90d', color: '#ef4444' },
  { key: 'm91_120', label: '91-120d', color: '#dc2626' },
  { key: 'm120', label: '+120d', color: '#991b1b' },
] as const;

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border h-20 animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-xl border h-72 animate-pulse" />
    </div>
  );
}

export default function AgingCliente({ generadoPor }: { generadoPor: string }) {
  const { data, loading, error } = useAgingController();
  const [vista, setVista] = useState<Vista>('consolidado');
  const [exportando, setExportando] = useState(false);

  if (loading)
    return (
      <div className="px-5 py-5">
        <Skeleton />
      </div>
    );
  if (error)
    return (
      <div className="px-5 py-5">
        <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
          <p className="text-red-600 text-sm font-semibold">{error}</p>
        </div>
      </div>
    );
  if (!data) return null;

  const c = data.consolidado;
  const filas: AgingFila[] =
    vista === 'analista' ? data.por_analista : vista === 'vendedor' ? data.por_vendedor : [];
  const dimLabel = vista === 'analista' ? 'Analista' : 'Vendedor';

  const toggle = (
    <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: '#E2E8F0' }}>
      {(
        [
          ['consolidado', 'Consolidado'],
          ['analista', 'Por analista'],
          ['vendedor', 'Por vendedor'],
        ] as [Vista, string][]
      ).map(([v, l]) => (
        <button
          key={v}
          onClick={() => setVista(v)}
          className="px-3 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap"
          style={{
            background: vista === v ? 'white' : 'transparent',
            color: vista === v ? '#003B5C' : '#94a3b8',
            boxShadow: vista === v ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );

  function exportParams() {
    const cols =
      vista === 'consolidado' ? COLS : [{ ...COLS[0], label: dimLabel }, ...COLS.slice(1)];
    const f = vista === 'consolidado' ? [{ nombre: 'CONSOLIDADO', ...c }] : filas;
    return {
      filas: f as unknown as Record<string, unknown>[],
      columnas: cols,
      titulo: 'Aging Consolidado',
      subtitulo:
        vista === 'consolidado'
          ? 'Antigüedad total de la cartera'
          : `Por ${dimLabel.toLowerCase()}`,
      meta: [
        { label: 'Cartera total', value: fmtCRC(c.total) },
        { label: 'Mora total', value: fmtCRC(c.mora_total) },
        { label: '% Mora', value: `${c.pct_mora}%` },
      ],
      orientacion: 'landscape' as const,
      nombreArchivo: `aging-${vista}`,
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

  const kpis = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KPICardAnalisis
        label="Cartera total"
        valor={fmtCRC(c.total)}
        sub={`${c.n_clientes} clientes`}
        color="#003B5C"
      />
      <KPICardAnalisis
        label="No vencido"
        valor={fmtCRC(c.no_vencido)}
        sub="al día"
        color="#16a34a"
      />
      <KPICardAnalisis
        label="Mora total"
        valor={fmtCRC(c.mora_total)}
        sub="vencido"
        color="#dc2626"
      />
      <KPICardAnalisis
        label="% Mora"
        valor={`${c.pct_mora}%`}
        sub="sobre cartera"
        color="#f59e0b"
      />
    </div>
  );

  return (
    <ReporteShell
      filtros={toggle}
      kpis={kpis}
      onExportPDF={onPDF}
      onExportExcel={onExcel}
      exportando={exportando}
    >
      {/* Barra de aging — solo en vistas tradicionales */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
          Distribución por tramo
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
            const val = c[t.key] as number;
            const pct = c.total > 0 ? (val / c.total) * 100 : 0;
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
                {fmtCRC(c[t.key] as number)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {(vista === 'analista' || vista === 'vendedor') && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              {filas.length} {dimLabel.toLowerCase()}s · ordenado por cartera
            </span>
          </div>
          <table
            style={{
              tableLayout: 'fixed',
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: '960px',
            }}
          >
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {(
                  [
                    [dimLabel, 'left'],
                    ['Clientes', 'right'],
                    ['No vencido', 'right'],
                    ['1-30d', 'right'],
                    ['31-60d', 'right'],
                    ['61-90d', 'right'],
                    ['91-120d', 'right'],
                    ['+120d', 'right'],
                    ['Mora total', 'right'],
                    ['Cartera', 'right'],
                    ['% Mora', 'right'],
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
                      textAlign: a,
                    }}
                  >
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const pc = f.pct_mora > 30 ? '#dc2626' : f.pct_mora >= 15 ? '#f59e0b' : '#16a34a';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td
                      style={{
                        padding: '9px 10px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#0f172a',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {f.nombre}
                    </td>
                    <td
                      style={{
                        padding: '9px 10px',
                        textAlign: 'right',
                        fontSize: '12px',
                        color: '#374151',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {f.n_clientes}
                    </td>
                    <td
                      style={{
                        padding: '9px 10px',
                        textAlign: 'right',
                        fontSize: '11px',
                        color: '#16a34a',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCRC(f.no_vencido)}
                    </td>
                    <td
                      style={{
                        padding: '9px 10px',
                        textAlign: 'right',
                        fontSize: '11px',
                        color: '#d97706',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCRC(f.m1_30)}
                    </td>
                    <td
                      style={{
                        padding: '9px 10px',
                        textAlign: 'right',
                        fontSize: '11px',
                        color: '#ea580c',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCRC(f.m31_60)}
                    </td>
                    <td
                      style={{
                        padding: '9px 10px',
                        textAlign: 'right',
                        fontSize: '11px',
                        color: '#ef4444',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCRC(f.m61_90)}
                    </td>
                    <td
                      style={{
                        padding: '9px 10px',
                        textAlign: 'right',
                        fontSize: '11px',
                        color: '#dc2626',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCRC(f.m91_120)}
                    </td>
                    <td
                      style={{
                        padding: '9px 10px',
                        textAlign: 'right',
                        fontSize: '11px',
                        color: '#991b1b',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCRC(f.m120)}
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
                      {fmtCRC(f.mora_total)}
                    </td>
                    <td
                      style={{
                        padding: '9px 10px',
                        textAlign: 'right',
                        fontSize: '11px',
                        color: '#475569',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCRC(f.total)}
                    </td>
                    <td
                      style={{
                        padding: '9px 10px',
                        textAlign: 'right',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: pc,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {f.pct_mora}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ReporteShell>
  );
}
