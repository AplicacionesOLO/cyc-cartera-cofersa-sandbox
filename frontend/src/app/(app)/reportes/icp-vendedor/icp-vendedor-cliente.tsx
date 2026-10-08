'use client';

import { useState } from 'react';
import { useIcpVendedorController } from '@/views/reportes/hooks/use-icp-vendedor-controller';
import ReporteShell from '@/components/reportes/ReporteShell';
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis';
import ICPBar from '@/components/analisis-pagos/ICPBar';
import { exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';
import { exportComportamientoPagoPDF } from '@/lib/reportes/pdf-comportamiento-pago';
import type { VendedorResult, VendedorRow } from '@/types/analisis-pagos';

const PERIODOS = [
  { valor: 3, label: 'Últimos 3 meses' },
  { valor: 6, label: 'Últimos 6 meses' },
  { valor: 9, label: 'Últimos 9 meses' },
];

const COLUMNAS: ColumnaReporte[] = [
  { key: 'vendedor_nombre', label: 'Vendedor', align: 'left', format: 'text', width: 44 },
  { key: 'supervisor_cod', label: 'Supervisor', align: 'left', format: 'text', width: 24 },
  { key: 'total_clientes', label: 'Clientes', align: 'right', format: 'int', width: 18 },
  { key: 'icp_promedio', label: 'ICP promedio', align: 'right', format: 'int', width: 22 },
  { key: 'pct_a_tiempo', label: '% Pago puntual', align: 'right', format: 'pct', width: 22 },
  { key: 'dias_atraso_prom', label: 'Días atraso', align: 'right', format: 'int', width: 20 },
  { key: 'clientes_criticos', label: 'Críticos (<50)', align: 'right', format: 'int', width: 20 },
];

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border h-20 animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-xl border h-80 animate-pulse" />
    </div>
  );
}

interface Props {
  generadoPor: string;
}

export default function IcpVendedorCliente({ generadoPor }: Props) {
  const [periodo, setPeriodo] = useState(6);
  const [supervisor, setSupervisor] = useState('');
  const [exportando, setExportando] = useState(false);
  const { data, loading, error, reload: fetchData } = useIcpVendedorController(periodo);

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
          <button
            onClick={fetchData}
            className="mt-3 text-[#009ee3] text-sm font-semibold hover:underline"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  if (!data) return null;

  const { kpis, rows } = data;
  const supervisores = [
    ...new Set(rows.map((r) => r.supervisor_cod).filter((s) => s && s !== '—')),
  ].sort();
  const rowsFiltradas = supervisor ? rows.filter((r) => r.supervisor_cod === supervisor) : rows;

  function exportParams() {
    const sufijo = supervisor ? `-${supervisor}` : '';
    return {
      filas: rowsFiltradas as unknown as Record<string, unknown>[],
      columnas: COLUMNAS,
      titulo: 'Comportamiento de Pago por Vendedor',
      subtitulo: `Últimos ${periodo} meses${supervisor ? ` · Supervisor ${supervisor}` : ''}`,
      meta: [
        {
          label: 'Mejor ICP',
          value: `${kpis.mejor_icp_vendedor || '—'} (${kpis.mejor_icp_valor})`,
        },
        {
          label: 'Mayor riesgo',
          value: `${kpis.mayor_riesgo_vendedor || '—'} (${kpis.mayor_riesgo_pct}%)`,
        },
        {
          label: 'Mejor puntual',
          value: `${kpis.mejor_puntual_vendedor || '—'} (${kpis.mejor_puntual_pct}%)`,
        },
        {
          label: 'Peor días atraso',
          value: `${kpis.peor_dias_vendedor || '—'} (${kpis.peor_dias_valor}d)`,
        },
      ],
      orientacion: 'landscape' as const,
      nombreArchivo: `comportamiento-pago-vendedor-${periodo}m${sufijo}`,
      generadoPor,
    };
  }

  async function onPDF() {
    setExportando(true);
    try {
      await exportComportamientoPagoPDF({
        rows: rowsFiltradas,
        kpis,
        periodoLabel: `Últimos ${periodo} meses${supervisor ? ` · Supervisor ${supervisor}` : ''}`,
        generadoPor,
        nombreArchivo: `comportamiento-pago-vendedor-${periodo}m${supervisor ? `-${supervisor}` : ''}`,
      });
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

  const filtros = (
    <>
      <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: '#E2E8F0' }}>
        {PERIODOS.map((p) => (
          <button
            key={p.valor}
            onClick={() => setPeriodo(p.valor)}
            className="px-3 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap"
            style={{
              background: periodo === p.valor ? 'white' : 'transparent',
              color: periodo === p.valor ? '#003B5C' : '#94a3b8',
              boxShadow: periodo === p.valor ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {supervisores.length > 0 && (
        <select
          value={supervisor}
          onChange={(e) => setSupervisor(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] bg-white text-gray-700 focus:outline-none"
          style={{ minWidth: '180px' }}
        >
          <option value="">Todos los supervisores</option>
          {supervisores.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
    </>
  );

  const kpisStrip = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KPICardAnalisis
        label="Mejor ICP promedio"
        valor={kpis.mejor_icp_vendedor || '—'}
        sub={`${kpis.mejor_icp_valor} pts`}
        color="#16a34a"
      />
      <KPICardAnalisis
        label="Mayor riesgo"
        valor={kpis.mayor_riesgo_vendedor || '—'}
        sub={`${kpis.mayor_riesgo_pct}% ICP < 50`}
        color="#dc2626"
      />
      <KPICardAnalisis
        label="Mayor % puntual"
        valor={kpis.mejor_puntual_vendedor || '—'}
        sub={`${kpis.mejor_puntual_pct}% a tiempo`}
        color="#009ee3"
      />
      <KPICardAnalisis
        label="Peor días atraso"
        valor={kpis.peor_dias_vendedor || '—'}
        sub={`${kpis.peor_dias_valor}d promedio`}
        color="#f59e0b"
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
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            {rowsFiltradas.length} vendedor{rowsFiltradas.length !== 1 ? 'es' : ''}
          </span>
          <span className="text-[11px] text-gray-400">Período: últimos {periodo} meses</span>
        </div>

        <table
          style={{
            tableLayout: 'fixed',
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: '720px',
          }}
        >
          <colgroup>
            <col style={{ width: '36px' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '190px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '110px' }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {(
                [
                  ['#', 'center'],
                  ['Vendedor', 'left'],
                  ['Supervisor', 'left'],
                  ['Clientes', 'right'],
                  ['ICP promedio', 'left'],
                  ['% Pago puntual', 'right'],
                  ['Días atraso', 'right'],
                  ['Críticos <50', 'right'],
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
                    letterSpacing: '0.05em',
                    textAlign: a,
                  }}
                >
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsFiltradas.map((row: VendedorRow, idx) => {
              const pctColor =
                row.pct_a_tiempo > 40 ? '#16a34a' : row.pct_a_tiempo >= 20 ? '#f59e0b' : '#dc2626';
              const diasColor =
                row.dias_atraso_prom > 30
                  ? '#dc2626'
                  : row.dias_atraso_prom >= 15
                    ? '#f59e0b'
                    : '#16a34a';
              return (
                <tr
                  key={row.vendedor_cod || idx}
                  style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td
                    style={{
                      padding: '10px 12px',
                      textAlign: 'center',
                      fontSize: '11px',
                      fontWeight: 500,
                      color: '#94a3b8',
                    }}
                  >
                    {idx + 1}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
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
                      {row.vendedor_nombre}
                    </p>
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      fontSize: '11px',
                      color: '#64748b',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.supervisor_cod !== '—' ? row.supervisor_cod : '—'}
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#374151',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row.total_clientes}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <ICPBar score={row.icp_promedio} />
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: pctColor,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row.pct_a_tiempo}%
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: diasColor,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row.dias_atraso_prom}d
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: row.clientes_criticos > 0 ? '#dc2626' : '#cbd5e1',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row.clientes_criticos > 0 ? row.clientes_criticos : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ReporteShell>
  );
}
