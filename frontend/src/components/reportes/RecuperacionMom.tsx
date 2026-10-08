'use client';

import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useRecuperacionMomController } from '@/views/presupuesto/hooks/use-recuperacion-reportes-controller';
import { fmtCRC, fmtM } from '@/lib/utils/formato';
import { exportTablaPDF, exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';
import type { RecupMomMes } from '@/types/reportes';

const MESES_ES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

function pctChange(current: number, prev: number): number | null {
  if (!prev || prev <= 0) return null;
  return Math.round(((current - prev) / prev) * 1000) / 10;
}

function DeltaBadge({ pct, size = 'md' }: { pct: number | null; size?: 'sm' | 'md' | 'lg' }) {
  if (pct === null) return <span style={{ fontSize: '11px', color: '#94a3b8' }}>—</span>;
  const isPos = pct > 0.5;
  const isNeg = pct < -0.5;
  const color = isPos ? '#16a34a' : isNeg ? '#dc2626' : '#94a3b8';
  const fs = size === 'lg' ? '15px' : size === 'sm' ? '10px' : '12px';
  return (
    <span
      style={{
        fontSize: fs,
        fontWeight: 700,
        color,
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
      }}
    >
      {isPos ? (
        <TrendingUp size={size === 'lg' ? 14 : 11} />
      ) : isNeg ? (
        <TrendingDown size={size === 'lg' ? 14 : 11} />
      ) : (
        <Minus size={11} />
      )}
      {isPos ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  );
}

function mesLabel(m: RecupMomMes): string {
  return `${MESES_ES[m.mes - 1]} ${String(m.anio).slice(2)}`;
}

interface Props {
  esAnalista: boolean;
  userEmail: string | null;
  generadoPor: string;
  registerExport?: (h: { onPDF: () => void; onExcel: () => void }) => void;
}

export default function RecuperacionMom({
  esAnalista,
  userEmail,
  generadoPor,
  registerExport,
}: Props) {
  const { data, loading, error } = useRecuperacionMomController(esAnalista, userEmail);
  const [exportando, setExportando] = useState(false);

  // ── Exportar ──────────────────────────────────────────────────────────
  function buildExportParams() {
    if (!data || data.length === 0) return null;
    const cur = data[data.length - 1];
    const prev = data.length >= 2 ? data[data.length - 2] : null;
    const lyr = data.length >= 13 ? data[0] : null;
    const cols: ColumnaReporte[] = [
      { key: 'label', label: 'Mes', align: 'left', format: 'text', width: 16 },
      { key: 'total', label: 'Total Recaudado', align: 'right', format: 'crc', width: 28 },
      { key: 'n_clientes', label: 'Clientes', align: 'right', format: 'int', width: 14 },
      { key: 'n_pagos', label: 'Pagos', align: 'right', format: 'int', width: 12 },
      { key: 'promedio_diario', label: 'Prom/Día', align: 'right', format: 'crc', width: 24 },
      { key: 'vs_mes_ant', label: 'vs Mes Ant.', align: 'right', format: 'text', width: 14 },
      { key: 'vs_ano_ant', label: 'vs Año Ant.', align: 'right', format: 'text', width: 14 },
    ];
    const filas = [...data].reverse().map((m, idx) => {
      const origIdx = data.length - 1 - idx;
      const prevM = origIdx > 0 ? data[origIdx - 1] : null;
      const lyrM = origIdx >= 12 ? data[origIdx - 12] : null;
      const dma = prevM ? pctChange(m.total, prevM.total) : null;
      const daa = lyrM ? pctChange(m.total, lyrM.total) : null;
      return {
        label: `${MESES_ES[m.mes - 1]} ${m.anio}`,
        total: m.total,
        n_clientes: m.n_clientes,
        n_pagos: m.n_pagos,
        promedio_diario: m.promedio_diario,
        vs_mes_ant: dma !== null ? `${dma > 0 ? '+' : ''}${dma.toFixed(1)}%` : '—',
        vs_ano_ant: daa !== null ? `${daa > 0 ? '+' : ''}${daa.toFixed(1)}%` : '—',
      };
    });
    const vsMesAnt = prev ? pctChange(cur.total, prev.total) : null;
    const vsAnoAnt = lyr ? pctChange(cur.total, lyr.total) : null;
    return {
      filas: filas as unknown as Record<string, unknown>[],
      columnas: cols,
      titulo: 'Comparativo Mensual de Recuperación',
      subtitulo: 'Últimos 13 meses',
      orientacion: 'landscape' as const,
      meta: [
        { label: 'Mes actual', value: fmtCRC(cur.total) },
        {
          label: 'vs Mes anterior',
          value: vsMesAnt !== null ? `${vsMesAnt > 0 ? '+' : ''}${vsMesAnt.toFixed(1)}%` : '—',
        },
        {
          label: 'vs Año anterior',
          value: vsAnoAnt !== null ? `${vsAnoAnt > 0 ? '+' : ''}${vsAnoAnt.toFixed(1)}%` : '—',
        },
      ],
      nombreArchivo: 'comparativo-mensual-recuperacion',
      generadoPor,
    };
  }

  async function onPDF() {
    const p = buildExportParams();
    if (!p) return;
    setExportando(true);
    try {
      await exportTablaPDF(p);
    } finally {
      setExportando(false);
    }
  }
  async function onExcel() {
    const p = buildExportParams();
    if (!p) return;
    setExportando(true);
    try {
      await exportTablaExcel(p);
    } finally {
      setExportando(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (registerExport && data) registerExport({ onPDF, onExcel });
  }, [data]);

  // ── Loading / error ──────────────────────────────────────────────────
  if (loading)
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border h-28 animate-pulse" />
          ))}
        </div>
        <div className="bg-white rounded-xl border h-64 animate-pulse" />
        <div className="bg-white rounded-xl border h-48 animate-pulse" />
      </div>
    );
  if (error)
    return (
      <div className="py-8 text-center">
        <p className="text-red-600 text-sm font-semibold">{error}</p>
      </div>
    );
  if (!data || data.length === 0) return null;

  const cur = data[data.length - 1];
  const prev = data.length >= 2 ? data[data.length - 2] : null;
  const lyr = data.length >= 13 ? data[0] : null;

  const vsMesAnt = prev ? pctChange(cur.total, prev.total) : null;
  const vsAnoAnt = lyr ? pctChange(cur.total, lyr.total) : null;

  // Promedio de los 12 meses anteriores al actual
  const hist12 = data.slice(0, 12);
  const avgHist =
    hist12.length > 0 ? Math.round(hist12.reduce((s, m) => s + m.total, 0) / hist12.length) : 0;

  // Datos para el gráfico
  const chartData = data.map((m) => ({
    label: mesLabel(m),
    total: m.total,
    isCurrent: m.mes_ini === cur.mes_ini,
  }));

  return (
    <div className="space-y-4">
      {/* ── 3 KPI cards: Mes actual | vs Mes anterior | vs Año anterior ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Mes actual */}
        <div
          className="bg-white rounded-xl border border-slate-100 p-5"
          style={{ borderTop: '3px solid #003B5C' }}
        >
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
            {MESES_ES[cur.mes - 1]} {cur.anio} — mes en curso
          </p>
          <p className="text-[22px] font-bold text-gray-900 tabular-nums leading-tight">
            {fmtCRC(cur.total)}
          </p>
          <div className="mt-2 space-y-0.5">
            <p className="text-[11px] text-gray-400">
              {cur.n_clientes} clientes · {cur.n_pagos} pagos
            </p>
            <p className="text-[11px] text-gray-400">
              Prom diario:{' '}
              <span className="font-semibold text-gray-600">{fmtCRC(cur.promedio_diario)}</span>
            </p>
          </div>
        </div>

        {/* vs Mes anterior */}
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
            vs {prev ? `${MESES_ES[prev.mes - 1]} ${prev.anio}` : 'Mes anterior'}
          </p>
          {prev ? (
            <>
              <p className="text-[17px] font-bold text-gray-700 tabular-nums leading-tight">
                {fmtCRC(prev.total)}
              </p>
              <div className="mt-2">
                <DeltaBadge pct={vsMesAnt} size="lg" />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                {prev.n_clientes} clientes · {prev.n_pagos} pagos
              </p>
            </>
          ) : (
            <p className="text-[12px] text-gray-400 mt-3">Sin datos</p>
          )}
        </div>

        {/* vs Mismo mes año anterior */}
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
            vs {lyr ? `${MESES_ES[lyr.mes - 1]} ${lyr.anio}` : 'Mismo mes año anterior'}
          </p>
          {lyr ? (
            <>
              <p className="text-[17px] font-bold text-gray-700 tabular-nums leading-tight">
                {fmtCRC(lyr.total)}
              </p>
              <div className="mt-2">
                <DeltaBadge pct={vsAnoAnt} size="lg" />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                {lyr.n_clientes} clientes · {lyr.n_pagos} pagos
              </p>
            </>
          ) : (
            <p className="text-[12px] text-gray-400 mt-3">Sin datos de año anterior</p>
          )}
        </div>
      </div>

      {/* ── Gráfica de barras ── */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            Evolución mensual
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '2px',
                  background: '#003B5C',
                  display: 'inline-block',
                }}
              />
              <span className="text-[10px] text-gray-400">Mes actual</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '2px',
                  background: '#009ee3',
                  display: 'inline-block',
                }}
              />
              <span className="text-[10px] text-gray-400">Meses anteriores</span>
            </div>
            {avgHist > 0 && (
              <div className="flex items-center gap-1.5">
                <span
                  style={{
                    width: '10px',
                    height: '2px',
                    background: '#f59e0b',
                    display: 'inline-block',
                  }}
                />
                <span className="text-[10px] text-gray-400">Promedio 12m</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ width: '100%', height: '230px' }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis
                tickFormatter={(v) => fmtM(v)}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                width={55}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => [fmtCRC(Number(v)), 'Recaudado']}
                contentStyle={{
                  fontSize: '11px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                }}
              />
              {avgHist > 0 && (
                <ReferenceLine
                  y={avgHist}
                  stroke="#f59e0b"
                  strokeDasharray="5 3"
                  strokeWidth={1.5}
                  label={{
                    value: `Prom ${fmtM(avgHist)}`,
                    position: 'right',
                    fontSize: 9,
                    fill: '#f59e0b',
                  }}
                />
              )}
              <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.isCurrent ? '#003B5C' : '#009ee3'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {avgHist > 0 && (
          <p className="text-[11px] text-gray-400 text-right mt-1">
            Promedio 12 meses anteriores:{' '}
            <span className="font-semibold text-gray-600">{fmtCRC(avgHist)}</span>
          </p>
        )}
      </div>

      {/* ── Tabla de detalle mensual ── */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            Detalle por mes
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {(
                [
                  ['Mes', 'left'],
                  ['Total recaudado', 'right'],
                  ['Clientes', 'right'],
                  ['Pagos', 'right'],
                  ['Prom diario', 'right'],
                  ['vs Mes ant.', 'right'],
                  ['vs Año ant.', 'right'],
                ] as [string, React.CSSProperties['textAlign']][]
              ).map(([l, a]) => (
                <th
                  key={l}
                  style={{
                    padding: '8px 12px',
                    textAlign: a,
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((m, idx) => {
              const origIdx = data.length - 1 - idx;
              const prevM = origIdx > 0 ? data[origIdx - 1] : null;
              const lyrM = origIdx >= 12 ? data[origIdx - 12] : null;
              const dma = prevM ? pctChange(m.total, prevM.total) : null;
              const daa = lyrM ? pctChange(m.total, lyrM.total) : null;
              const isCur = m.mes_ini === cur.mes_ini;

              return (
                <tr
                  key={m.mes_ini}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    background: isCur ? '#f0f9ff' : idx % 2 === 0 ? 'transparent' : '#fafafa',
                  }}
                >
                  <td
                    style={{
                      padding: '9px 12px',
                      fontSize: '12px',
                      fontWeight: isCur ? 700 : 500,
                      color: isCur ? '#003B5C' : '#0f172a',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {MESES_ES[m.mes - 1]} {m.anio}
                    {isCur && (
                      <span
                        style={{
                          marginLeft: '6px',
                          fontSize: '9px',
                          background: '#003B5C',
                          color: 'white',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          fontWeight: 700,
                        }}
                      >
                        EN CURSO
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#16a34a',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtCRC(m.total)}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'right',
                      fontSize: '12px',
                      color: '#374151',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {m.n_clientes}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'right',
                      fontSize: '12px',
                      color: '#64748b',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {m.n_pagos}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'right',
                      fontSize: '11px',
                      color: '#475569',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtCRC(m.promedio_diario)}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                    <DeltaBadge pct={dma} size="sm" />
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                    <DeltaBadge pct={daa} size="sm" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
