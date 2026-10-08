'use client';

import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingDown } from 'lucide-react';

// ── Tipos ─────────────────────────────────────────────────────────────
export interface HistoricoCarteraRow {
  fecha: string; // "2026-05-25"
  cartera_total: number;
  mora_total: number;
  mora_31_plus: number;
  pct_mora: number; // ej: 27.4
  pct_mora_31: number; // ej: 9.3
  n_en_mora: number;
}

// ── Helpers ───────────────────────────────────────────────────────────
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

function fmtEje(dateStr: string): string {
  const [, mm, dd] = dateStr.split('-');
  return `${parseInt(dd, 10)} ${MESES[parseInt(mm, 10) - 1]}`;
}

function fmtTooltipFecha(dateStr: string): string {
  const [yy, mm, dd] = dateStr.split('-');
  return `${parseInt(dd, 10)} ${MESES[parseInt(mm, 10) - 1]} ${yy}`;
}

function fmtMillones(n: number): string {
  const millones = n / 1_000_000;
  const parts = millones.toFixed(1).split('.');
  const entero = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `₡${entero},${parts[1]} M`;
}

// ── Tooltip personalizado ─────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as HistoricoCarteraRow;
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #E2E8F0',
        borderRadius: '10px',
        padding: '10px 14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
        minWidth: '190px',
      }}
    >
      <p style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>
        {fmtTooltipFecha(d.fecha)}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '12px',
              color: '#6b7280',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 2,
                background: '#009ee3',
                flexShrink: 0,
              }}
            />
            % Mora Total
          </span>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#009ee3' }}>
            {Number(d.pct_mora).toFixed(1)}%
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '12px',
              color: '#6b7280',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 3,
                background: '#003B5C',
                flexShrink: 0,
              }}
            />
            % Mora &gt;30d
          </span>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#003B5C' }}>
            {Number(d.pct_mora_31).toFixed(1)}%
          </span>
        </div>
        <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '3px', paddingTop: '5px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Cartera</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#374151' }}>
              {fmtMillones(d.cartera_total)}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '14px',
              marginTop: '2px',
            }}
          >
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>En mora</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#374151' }}>
              {d.n_en_mora} clientes
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────
export default function TendenciaCarteraChart({ data }: { data: HistoricoCarteraRow[] }) {
  const [periodo, setPeriodo] = useState<30 | 60 | 90>(30);

  // Últimos N registros (data ya llega ordenada por fecha ASC)
  const filtered = data.slice(-periodo);

  // Intervalo de ticks X: ~6 etiquetas máx
  const tickInterval = Math.max(1, Math.floor(filtered.length / 6));

  // Techo del eje Y redondeado al próximo múltiplo de 5, mínimo 30%
  const maxVal = filtered.length
    ? Math.max(...filtered.map((d) => Math.max(Number(d.pct_mora), Number(d.pct_mora_31)))) + 4
    : 32;
  const yMax = Math.max(30, Math.ceil(maxVal / 5) * 5);

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        borderTop: '3px solid #003B5C',
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid #F1F5F9' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(0,158,227,0.08)' }}
          >
            <TrendingDown size={15} style={{ color: '#009ee3' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Tendencia de Mora</h2>
            <p className="text-xs text-gray-400">
              % mora sobre cartera total
              {data.length > 0 &&
                ` · ${data.length} ${data.length === 1 ? 'día registrado' : 'días de historial'}`}
            </p>
          </div>
        </div>
        {/* Toggle de período */}
        <div
          className="flex gap-0.5 p-0.5 rounded-lg flex-shrink-0"
          style={{ background: '#F1F5F9' }}
        >
          {([30, 60, 90] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className="text-[11px] font-bold px-2.5 py-1 rounded-md transition-all"
              style={{
                background: periodo === p ? 'white' : 'transparent',
                color: periodo === p ? '#003B5C' : '#94a3b8',
                boxShadow: periodo === p ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
              }}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {/* ── Cuerpo: sin datos suficientes ──────────────────────────── */}
      {data.length < 2 ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(0,158,227,0.06)' }}
          >
            <TrendingDown size={22} style={{ color: '#009ee3', opacity: 0.35 }} />
          </div>
          <p className="text-sm font-semibold text-gray-400 mb-1">Acumulando datos históricos</p>
          <p className="text-xs text-gray-300 max-w-xs leading-relaxed">
            Con cada sincronización (7:15 am · 12:15 pm · 4:15 pm) se irá registrando el snapshot
            diario. La gráfica estará lista en pocos días.
          </p>
          {data.length === 1 && (
            <div
              className="mt-4 rounded-xl px-4 py-2.5"
              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}
            >
              <p className="text-xs font-semibold text-green-700">
                ✓ Primer snapshot registrado hoy · % Mora Total:{' '}
                <strong>{data[0].pct_mora}%</strong>
              </p>
            </div>
          )}
        </div>
      ) : (
        /* ── Cuerpo: gráfico ─────────────────────────────────────── */
        <div className="px-2 pt-4 pb-2">
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={filtered} margin={{ top: 8, right: 24, left: -4, bottom: 0 }}>
              <defs>
                <linearGradient id="gradMoraTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#009ee3" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#009ee3" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradMora31" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#003B5C" stopOpacity={0.14} />
                  <stop offset="95%" stopColor="#003B5C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis
                dataKey="fecha"
                tickFormatter={fmtEje}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={{ stroke: '#E2E8F0' }}
                tickLine={false}
                interval={tickInterval - 1}
              />
              <YAxis
                domain={[0, yMax]}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickFormatter={(v) => `${v}%`}
                axisLine={false}
                tickLine={false}
                width={38}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#E2E8F0', strokeWidth: 1 }} />
              {/* Línea benchmark 15% */}
              <ReferenceLine
                y={15}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{
                  value: 'Bench 15%',
                  position: 'insideTopRight',
                  fontSize: 10,
                  fill: '#94a3b8',
                  dy: -5,
                }}
              />
              {/* % Mora Total — área con gradiente corporativo */}
              <Area
                type="monotoneX"
                dataKey="pct_mora"
                stroke="#009ee3"
                strokeWidth={2.5}
                fill="url(#gradMoraTotal)"
                fillOpacity={1}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: 'white', fill: '#009ee3' }}
                name="% Mora Total"
              />
              {/* % Mora >30d — área con gradiente navy */}
              <Area
                type="monotoneX"
                dataKey="pct_mora_31"
                stroke="#003B5C"
                strokeWidth={2}
                strokeDasharray="5 3"
                fill="url(#gradMora31)"
                fillOpacity={1}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'white', fill: '#003B5C' }}
                name="% Mora >30d"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Leyenda ─────────────────────────────────────────────────── */}
      <div className="px-6 pb-4 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-5 rounded-full" style={{ background: '#009ee3' }} />
          <span className="text-[11px] text-gray-500">% Mora Total</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="20" height="4" style={{ flexShrink: 0 }}>
            <line
              x1="0"
              y1="2"
              x2="20"
              y2="2"
              stroke="#003B5C"
              strokeWidth="2"
              strokeDasharray="5 3"
            />
          </svg>
          <span className="text-[11px] text-gray-500">% Mora &gt;30d</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="20" height="4" style={{ flexShrink: 0 }}>
            <line
              x1="0"
              y1="2"
              x2="20"
              y2="2"
              stroke="#94a3b8"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          </svg>
          <span className="text-[11px] text-gray-500">Benchmark 15%</span>
        </div>
      </div>
    </div>
  );
}
