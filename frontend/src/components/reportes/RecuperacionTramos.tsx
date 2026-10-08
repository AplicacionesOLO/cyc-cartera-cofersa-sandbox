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
  Legend,
} from 'recharts';
import { useRecuperacionTramosController } from '@/views/presupuesto/hooks/use-recuperacion-reportes-controller';
import { fmtCRC, fmtM, fmtFecha } from '@/lib/utils/formato';
import { exportTablaPDF, exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';
import type { RecupTramosGrupo, RecupTramosKPIs } from '@/types/reportes';

// ── Definición de tramos (orden visual y colores del design system) ──────
const TRAMOS = [
  { key: 'no_vencido', label: 'Al Día', short: 'Al Día', color: '#16a34a' },
  { key: 'mora_1_30', label: '1-30 días', short: '1-30d', color: '#d97706' },
  { key: 'mora_31_60', label: '31-60 días', short: '31-60d', color: '#ea580c' },
  { key: 'mora_61_90', label: '61-90 días', short: '61-90d', color: '#ef4444' },
  { key: 'mora_91_120', label: '91-120d', short: '91-120d', color: '#dc2626' },
  { key: 'mora_120_plus', label: '+120 días', short: '+120d', color: '#991b1b' },
] as const;

type TramoKey = (typeof TRAMOS)[number]['key'];

function valOf(obj: RecupTramosGrupo | RecupTramosKPIs, k: TramoKey): number {
  return ((obj as unknown as Record<string, unknown>)[k] as number) ?? 0;
}

interface Props {
  esAnalista: boolean;
  userEmail: string | null;
  ini: string;
  fin: string;
  group: 'analista' | 'vendedor';
  generadoPor: string;
  registerExport?: (h: { onPDF: () => void; onExcel: () => void }) => void;
}

export default function RecuperacionTramos({
  esAnalista,
  userEmail,
  ini,
  fin,
  group,
  generadoPor,
  registerExport,
}: Props) {
  const { data, loading, error } = useRecuperacionTramosController({
    ini,
    fin,
    group,
    email: esAnalista ? userEmail : null,
  });
  const [exportando, setExportando] = useState(false);

  // ── Exportar ──────────────────────────────────────────────────────────
  function buildExportParams() {
    if (!data) return null;
    const { kpis, grupos } = data;
    // Anchos para A4 landscape (CW = 273mm): 50+6×30+33 = 263mm ✓
    const colNombre: ColumnaReporte = {
      key: 'nombre',
      label: group === 'vendedor' ? 'Vendedor' : 'Analista',
      align: 'left',
      format: 'text',
      width: 50,
    };
    const colsTramos: ColumnaReporte[] = TRAMOS.map((t) => ({
      key: t.key,
      label: t.short,
      align: 'right' as const,
      format: 'crc' as const,
      width: 30,
    }));
    const colTotal: ColumnaReporte = {
      key: 'total',
      label: 'Total',
      align: 'right',
      format: 'crc',
      width: 33,
    };

    const filas = grupos.map((g) => ({
      nombre: g.nombre,
      ...TRAMOS.reduce((a, t) => ({ ...a, [t.key]: valOf(g, t.key) }), {}),
      total: g.total,
    }));
    const totales = TRAMOS.reduce((a, t) => ({ ...a, [t.key]: valOf(kpis, t.key) }), {
      nombre: 'TOTAL',
      total: kpis.total,
    } as Record<string, unknown>);

    return {
      filas: filas as unknown as Record<string, unknown>[],
      columnas: [colNombre, ...colsTramos, colTotal],
      totales,
      titulo: 'Recuperación por Tramo de Vencimiento',
      subtitulo: `${fmtFecha(ini)} — ${fmtFecha(fin)}`,
      meta: [
        { label: 'Total recaudado', value: fmtCRC(kpis.total) },
        { label: 'Clientes', value: `${kpis.n_clientes}` },
        {
          label: 'Al Día',
          value: `${kpis.total > 0 ? Math.round((valOf(kpis, 'no_vencido') / kpis.total) * 100) : 0}%`,
        },
        {
          label: 'Con mora',
          value: `${kpis.total > 0 ? Math.round(((kpis.total - valOf(kpis, 'no_vencido')) / kpis.total) * 100) : 0}%`,
        },
      ],
      nombreArchivo: 'recuperacion-por-tramos',
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
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border h-[72px] animate-pulse" />
          ))}
        </div>
        <div className="bg-white rounded-xl border h-10 animate-pulse" />
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

  if (!data) return null;

  const { kpis, grupos } = data;
  const totalSafe = kpis.total > 0 ? kpis.total : 1;

  // Stacked bar chart: max 20 grupos, horizontal layout
  const chartData = grupos.slice(0, 20).map((g) => ({
    nombre: g.nombre.length > 18 ? g.nombre.slice(0, 16) + '…' : g.nombre,
    no_vencido: g.no_vencido,
    mora_1_30: g.mora_1_30,
    mora_31_60: g.mora_31_60,
    mora_61_90: g.mora_61_90,
    mora_91_120: g.mora_91_120,
    mora_120_plus: g.mora_120_plus,
  }));

  const chartH = Math.max(180, chartData.length * 44);

  // Mora vencida = total - al día
  const totalMora = kpis.total - kpis.no_vencido;
  const pctNoVencido = Math.round((kpis.no_vencido / totalSafe) * 100);
  const pctMora = 100 - pctNoVencido;

  return (
    <div className="space-y-4">
      {/* ── KPI strip — 6 tramos ── */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {TRAMOS.map((t) => {
          const val = valOf(kpis, t.key);
          const pct = Math.round((val / totalSafe) * 100);
          return (
            <div
              key={t.key}
              className="bg-white rounded-xl border border-slate-100 p-3"
              style={{ borderTop: `3px solid ${t.color}` }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-wider mb-1 leading-tight"
                style={{ color: t.color }}
              >
                {t.label}
              </p>
              <p className="text-[13px] font-bold text-gray-800 tabular-nums leading-tight">
                {fmtCRC(val)}
              </p>
              <p className="text-[10px] text-gray-400 tabular-nums mt-0.5">{pct}%</p>
            </div>
          );
        })}
      </div>

      {/* ── Barra de composición visual ── */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            Composición del recaudo — {fmtFecha(ini)} al {fmtFecha(fin)}
          </p>
          <div className="text-[11px] text-gray-500">
            <span className="font-semibold text-green-700">{pctNoVencido}% al día</span>
            <span className="mx-2 text-gray-300">|</span>
            <span className="font-semibold text-red-600">{pctMora}% con mora</span>
          </div>
        </div>
        <div className="flex rounded-lg overflow-hidden h-8 gap-px">
          {TRAMOS.map((t) => {
            const val = valOf(kpis, t.key);
            const pct = kpis.total > 0 ? (val / kpis.total) * 100 : 0;
            if (pct < 0.3) return null;
            return (
              <div
                key={t.key}
                title={`${t.label}: ${fmtCRC(val)} (${Math.round(pct)}%)`}
                style={{
                  flex: pct,
                  background: t.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '4px',
                }}
              >
                {pct > 5 && (
                  <span
                    style={{ fontSize: '9px', color: 'white', fontWeight: 700, userSelect: 'none' }}
                  >
                    {Math.round(pct)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
          {TRAMOS.map((t) => {
            const val = valOf(kpis, t.key);
            return (
              <div key={t.key} className="flex items-center gap-1.5">
                <span
                  style={{
                    width: '9px',
                    height: '9px',
                    borderRadius: '2px',
                    background: t.color,
                    flexShrink: 0,
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  {t.label} — {fmtCRC(val)}
                </span>
              </div>
            );
          })}
        </div>
        {totalMora > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex gap-6 flex-wrap">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Mora vencida recuperada
              </p>
              <p className="text-[14px] font-bold text-red-600 tabular-nums">{fmtCRC(totalMora)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Total recaudado
              </p>
              <p className="text-[14px] font-bold text-gray-800 tabular-nums">
                {fmtCRC(kpis.total)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Gráfica de barras apiladas ── */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
            Recaudo por tramo — por {group === 'vendedor' ? 'vendedor' : 'analista'}
          </p>
          <div style={{ width: '100%', height: `${chartH}px` }}>
            <ResponsiveContainer>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => fmtM(v)}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                />
                <YAxis
                  type="category"
                  dataKey="nombre"
                  width={110}
                  tick={{ fontSize: 11, fill: '#374151', fontWeight: 500 }}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any, name: any) => [
                    fmtCRC(Number(v)),
                    TRAMOS.find((t) => t.key === name)?.label ?? name,
                  ]}
                  contentStyle={{
                    fontSize: '11px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                  }}
                />
                <Legend
                  iconType="square"
                  iconSize={9}
                  formatter={(v) => TRAMOS.find((t) => t.key === v)?.label ?? v}
                  wrapperStyle={{ fontSize: '10px' }}
                />
                {TRAMOS.map((t) => (
                  <Bar key={t.key} dataKey={t.key} stackId="a" fill={t.color} name={t.key} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Tabla de detalle ── */}
      {grupos.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Detalle por {group === 'vendedor' ? 'vendedor' : 'analista'}
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th
                  style={{
                    padding: '8px 14px',
                    textAlign: 'left',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  {group === 'vendedor' ? 'Vendedor' : 'Analista'}
                </th>
                {TRAMOS.map((t) => (
                  <th
                    key={t.key}
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: t.color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.short}
                  </th>
                ))}
                <th
                  style={{
                    padding: '8px 14px',
                    textAlign: 'right',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#374151',
                    textTransform: 'uppercase',
                  }}
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g, i) => (
                <tr
                  key={g.nombre}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    background: i % 2 === 1 ? '#fafafa' : 'transparent',
                  }}
                >
                  <td
                    style={{
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#0f172a',
                    }}
                  >
                    {g.nombre}
                  </td>
                  {TRAMOS.map((t) => {
                    const val = valOf(g, t.key);
                    const pct = g.total > 0 ? Math.round((val / g.total) * 100) : 0;
                    return (
                      <td
                        key={t.key}
                        style={{ padding: '8px 10px', textAlign: 'right', verticalAlign: 'middle' }}
                      >
                        {val > 0 ? (
                          <>
                            <span
                              style={{
                                fontSize: '11px',
                                fontVariantNumeric: 'tabular-nums',
                                color: t.color,
                                fontWeight: 600,
                                display: 'block',
                              }}
                            >
                              {fmtCRC(val)}
                            </span>
                            <span style={{ fontSize: '9px', color: '#94a3b8', display: 'block' }}>
                              {pct}%
                            </span>
                          </>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#e2e8f0' }}>—</span>
                        )}
                      </td>
                    );
                  })}
                  <td
                    style={{
                      padding: '8px 14px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#003B5C',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtCRC(g.total)}
                  </td>
                </tr>
              ))}
              {/* ── Fila de totales ── */}
              <tr style={{ borderTop: '2px solid #003B5C', background: '#f0f4f8' }}>
                <td
                  style={{
                    padding: '9px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#003B5C',
                  }}
                >
                  TOTAL
                </td>
                {TRAMOS.map((t) => {
                  const val = valOf(kpis, t.key);
                  const pct = kpis.total > 0 ? Math.round((val / kpis.total) * 100) : 0;
                  return (
                    <td
                      key={t.key}
                      style={{ padding: '9px 10px', textAlign: 'right', verticalAlign: 'middle' }}
                    >
                      {val > 0 ? (
                        <>
                          <span
                            style={{
                              fontSize: '11px',
                              fontVariantNumeric: 'tabular-nums',
                              color: t.color,
                              fontWeight: 700,
                              display: 'block',
                            }}
                          >
                            {fmtCRC(val)}
                          </span>
                          <span style={{ fontSize: '9px', color: '#94a3b8', display: 'block' }}>
                            {pct}%
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#e2e8f0' }}>—</span>
                      )}
                    </td>
                  );
                })}
                <td
                  style={{
                    padding: '9px 14px',
                    textAlign: 'right',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#003B5C',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtCRC(kpis.total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
