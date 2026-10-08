'use client';

import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, FileText, FileSpreadsheet } from 'lucide-react';
import { useProyeccionController } from '@/views/presupuesto/hooks/use-recuperacion-reportes-controller';
import { fmtCRC, fmtM, fmtFecha } from '@/lib/utils/formato';
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis';
import { exportTablaPDF, exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';
import type { ProyeccionSemana } from '@/types/presupuesto';

const COLS: ColumnaReporte[] = [
  { key: 'rango', label: 'Semana', align: 'left', format: 'text', width: 44 },
  { key: 'esperado_facturas', label: 'Cobro esperado', align: 'right', format: 'crc', width: 32 },
  { key: 'cobrado', label: 'Cobrado', align: 'right', format: 'crc', width: 32 },
  { key: 'cumplimiento', label: '% Cumplimiento', align: 'right', format: 'pct', width: 18 },
];

interface Props {
  generadoPor: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WeekTick({ x, y, payload }: any) {
  const isCur = payload?.value === 'S1';
  const isPast = payload?.value === 'SP' || String(payload?.value ?? '').startsWith('P');
  return (
    <text
      x={x}
      y={y + 12}
      textAnchor="middle"
      fontFamily="Nunito, sans-serif"
      fontSize={11}
      fontWeight={isCur ? 700 : 500}
      fill={isCur ? '#003B5C' : isPast ? '#94a3b8' : '#64748b'}
      fontStyle={isPast ? 'italic' : 'normal'}
    >
      {payload?.value}
    </text>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as {
    sem: string;
    periodo: string;
    esperado: number;
    cobrado: number;
  };
  const fila = (color: string, label: string, val: number) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        fontSize: 12,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#475569' }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: color,
            display: 'inline-block',
          }}
        />
        {label}
      </span>
      <span style={{ fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
        {val > 0 ? fmtCRC(val) : '—'}
      </span>
    </div>
  );
  const semLabel =
    row.sem === 'SP'
      ? 'SP · semana pasada'
      : row.sem.startsWith('P')
        ? `Hace ${row.sem.slice(1)} semanas`
        : row.sem === 'S1'
          ? 'S1 · actual'
          : row.sem;
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,59,92,0.15)',
        overflow: 'hidden',
        fontFamily: 'Nunito, sans-serif',
        minWidth: 210,
      }}
    >
      <div
        style={{
          background: '#003B5C',
          color: '#fff',
          padding: '7px 12px',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {semLabel} <span style={{ color: '#9FE1CB', fontWeight: 600 }}>· {row.periodo}</span>
      </div>
      <div style={{ padding: '9px 12px', display: 'grid', gap: 6 }}>
        {fila('#003B5C', 'Esperado', row.esperado)}
        {fila('#009ee3', 'Cobrado', row.cobrado)}
      </div>
    </div>
  );
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

export default function TabProyeccion({ generadoPor }: Props) {
  const [exportando, setExportando] = useState(false);
  // Semanas pasadas a mostrar (1 = solo la semana pasada, comportamiento clásico)
  const [semanasPasadas, setSemanasPasadas] = useState(1);
  const { data, loading, error } = useProyeccionController(semanasPasadas);

  if (loading) return <Skeleton />;
  if (error)
    return (
      <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
        <p className="text-red-600 text-sm font-semibold">{error}</p>
      </div>
    );
  if (!data) return null;

  const rango = (s: ProyeccionSemana) =>
    `${fmtFecha(s.inicio).slice(0, 5)}–${fmtFecha(s.fin).slice(0, 5)}`;
  const chart = data.semanas.map((s) => ({
    sem: s.idx === -1 ? 'SP' : s.idx < -1 ? `P${-s.idx}` : `S${s.idx + 1}`,
    periodo: rango(s),
    esperado: s.esperado_facturas,
    cobrado: s.cobrado,
  }));
  const cumplGlobal =
    data.kpis.total_esperado > 0
      ? Math.round((data.kpis.total_cobrado / data.kpis.total_esperado) * 100)
      : 0;

  const semLabel = (s: ProyeccionSemana) =>
    s.idx === -1
      ? 'Semana Pasada'
      : s.tipo === 'pasada'
        ? `Hace ${-s.idx} semanas`
        : s.tipo === 'actual'
          ? 'S1 · actual'
          : `S${s.idx + 1}`;

  function exportParams() {
    return {
      filas: data!.semanas.map((s) => ({
        rango:
          s.idx === -1
            ? `Semana Pasada (${rango(s)})`
            : s.tipo === 'pasada'
              ? `Hace ${-s.idx} semanas (${rango(s)})`
              : `Semana ${s.idx + 1} (${rango(s)})`,
        esperado_facturas: s.esperado_facturas ?? 0,
        cobrado: s.cobrado,
        cumplimiento: s.cumplimiento ?? 0,
      })) as unknown as Record<string, unknown>[],
      columnas: COLS,
      titulo: 'Proyección de Recuperación',
      subtitulo:
        semanasPasadas > 1
          ? `Últimas ${semanasPasadas} semanas + actual + 7 futuras · para Tesorería`
          : `Sem. pasada + actual + 7 futuras · para Tesorería`,
      meta: [
        { label: 'Total esperado', value: fmtCRC(data!.kpis.total_esperado) },
        { label: 'Total cobrado', value: fmtCRC(data!.kpis.total_cobrado) },
        { label: 'Mora vencida fuera de ventana', value: fmtCRC(data!.kpis.mora_vencida) },
      ],
      totales: {
        rango: 'TOTAL',
        esperado_facturas: data!.kpis.total_esperado,
        cobrado: data!.kpis.total_cobrado,
        cumplimiento: cumplGlobal,
      },
      nombreArchivo: 'proyeccion-recuperacion-8sem',
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

  const BTN: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid #e2e8f0',
    background: 'white',
    color: '#374151',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            Histórico
          </span>
          <select
            value={semanasPasadas}
            onChange={(e) => setSemanasPasadas(Number(e.target.value))}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-white focus:outline-none focus:border-blue-400 transition"
          >
            <option value={1}>Solo semana pasada</option>
            <option value={4}>Últimas 4 semanas</option>
            <option value={8}>Últimas 8 semanas</option>
            <option value={12}>Últimas 12 semanas</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onPDF}
            disabled={exportando}
            style={{ ...BTN, opacity: exportando ? 0.5 : 1 }}
          >
            {exportando ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}{' '}
            PDF
          </button>
          <button onClick={onExcel} disabled={exportando} style={BTN}>
            <FileSpreadsheet size={13} /> Excel
          </button>
        </div>
      </div>

      {/* ── KPIs: 3 cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPICardAnalisis
          label="Cobro esperado · 8 sem"
          valor={fmtCRC(data.kpis.total_esperado)}
          sub="flujo de caja proyectado"
          color="#003B5C"
        />
        <KPICardAnalisis
          label="Cobrado en el horizonte"
          valor={fmtCRC(data.kpis.total_cobrado)}
          sub={`${cumplGlobal}% de cumplimiento`}
          color="#16a34a"
        />
        <KPICardAnalisis
          label="Mora vencida por recuperar"
          valor={fmtCRC(data.kpis.mora_vencida)}
          sub="saldo vencido total · control"
          color="#dc2626"
        />
      </div>

      {/* ── Gráfico ── */}
      <div
        className="bg-white rounded-xl border border-slate-100 p-4"
        style={{ boxShadow: '0 1px 3px rgba(0,59,92,0.06)' }}
      >
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            Esperado vs cobrado por semana
          </p>
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold"
              style={{ color: '#475569' }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 3,
                  background: '#003B5C',
                  display: 'inline-block',
                }}
              />
              Esperado
            </span>
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold"
              style={{ color: '#475569' }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 3,
                  background: '#009ee3',
                  display: 'inline-block',
                }}
              />
              Cobrado
            </span>
          </div>
        </div>
        <div style={{ width: '100%', height: '260px' }}>
          <ResponsiveContainer>
            <BarChart
              data={chart}
              margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
              barCategoryGap="24%"
            >
              <defs>
                <linearGradient id="gradEsperado" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0A5E8C" />
                  <stop offset="100%" stopColor="#003B5C" />
                </linearGradient>
                <linearGradient id="gradCobrado" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#33B5EE" />
                  <stop offset="100%" stopColor="#009ee3" />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="sem" tick={<WeekTick />} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(v) => fmtM(v)}
                tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'Nunito, sans-serif' }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip cursor={{ fill: 'rgba(0,59,92,0.05)' }} content={<ChartTooltip />} />
              <Bar
                dataKey="esperado"
                name="Esperado"
                fill="url(#gradEsperado)"
                radius={[6, 6, 0, 0]}
                maxBarSize={46}
                animationDuration={650}
              />
              <Bar
                dataKey="cobrado"
                name="Cobrado"
                fill="url(#gradCobrado)"
                radius={[6, 6, 0, 0]}
                maxBarSize={46}
                animationDuration={650}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          SP = semana pasada · P2, P3... = semanas anteriores. El plan de 8 semanas se congela cada
          lunes; durante la semana solo cambia el Cobrado. Las semanas pasadas comparan el esperado
          que quedó congelado su propio lunes contra el cobrado real (— si aún no existía
          congelado). Cada semana = facturas por vencer + recuperación esperada de mora, repartida
          por antigüedad (a más atraso, menor tasa de recuperación). La mora vencida total (valor
          nominal) se muestra en el KPI de arriba como indicador de control. Totales siempre sobre
          SP + S1–S8, sin importar el histórico seleccionado.
        </p>
      </div>

      {/* ── Tabla ── */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {(
                [
                  ['Semana', 'left', ''],
                  ['Período', 'left', ''],
                  ['Cobro esperado', 'right', ''],
                  ['Cobrado', 'right', ''],
                  ['% Cumplimiento', 'right', '16px'],
                ] as [string, React.CSSProperties['textAlign'], string][]
              ).map(([l, a, pr]) => (
                <th
                  key={l}
                  style={{
                    padding: `8px ${pr || '12px'} 8px 12px`,
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
            {data.semanas.map((s) => {
              const col =
                s.cumplimiento === null
                  ? '#94a3b8'
                  : s.cumplimiento >= 90
                    ? '#16a34a'
                    : s.cumplimiento >= 60
                      ? '#f59e0b'
                      : '#dc2626';
              const isPast = s.tipo === 'pasada';
              return (
                <tr
                  key={s.idx}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    background: isPast ? '#fafbfc' : 'transparent',
                  }}
                >
                  <td
                    style={{
                      padding: '9px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: isPast ? '#64748b' : '#003B5C',
                      fontStyle: isPast ? 'italic' : 'normal',
                    }}
                  >
                    {semLabel(s)}
                  </td>
                  <td style={{ padding: '9px 12px', fontSize: '11px', color: '#64748b' }}>
                    {fmtFecha(s.inicio)} – {fmtFecha(s.fin)}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: s.esperado_facturas != null ? '#003B5C' : '#cbd5e1',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {s.esperado_facturas != null ? fmtCRC(s.esperado_facturas) : '—'}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'right',
                      fontSize: '12px',
                      color: '#16a34a',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {s.cobrado > 0 ? fmtCRC(s.cobrado) : '—'}
                  </td>
                  <td
                    style={{
                      padding: '9px 16px 9px 12px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: col,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {s.cumplimiento === null ? '—' : `${s.cumplimiento}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
              <td
                colSpan={2}
                style={{
                  padding: '10px 12px',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#003B5C',
                  textTransform: 'uppercase',
                }}
              >
                Total · SP + S1–S8
              </td>
              <td
                style={{
                  padding: '10px 12px',
                  textAlign: 'right',
                  fontSize: '13px',
                  fontWeight: 800,
                  color: '#003B5C',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtCRC(data.kpis.total_esperado)}
              </td>
              <td
                style={{
                  padding: '10px 12px',
                  textAlign: 'right',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#16a34a',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtCRC(data.kpis.total_cobrado)}
              </td>
              <td
                style={{
                  padding: '10px 16px 10px 12px',
                  textAlign: 'right',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#003B5C',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {cumplGlobal}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
