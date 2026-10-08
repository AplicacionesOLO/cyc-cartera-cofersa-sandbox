'use client';

import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
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
import { fmtCRC } from '@/lib/utils/formato';
import { icpColorPrimary } from '@/components/analisis-pagos/ICPBadge';
import type { TendenciaPagoPunto } from '@/types/analisis-pagos';

// ── Helpers ───────────────────────────────────────────────────────────
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

function labelMes(anio: number, mes: number) {
  return `${MESES[mes - 1]} ${String(anio).slice(2)}`;
}

// ── Tooltip ───────────────────────────────────────────────────────────
interface TooltipPayload {
  label: string;
  icp_mes: number;
  dias_atraso_prom: number;
  monto_pagado: number;
  n_pagos: number;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as TooltipPayload;
  const color = icpColorPrimary(d.icp_mes);
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
        {d.label}
      </p>
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
            gap: 5,
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
              background: color,
              flexShrink: 0,
            }}
          />
          Score ICP
        </span>
        <span style={{ fontSize: '14px', fontWeight: 800, color }}>{d.icp_mes}</span>
      </div>
      <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '6px', paddingTop: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Días de atraso prom.</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#374151' }}>
            {d.dias_atraso_prom}d
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
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Monto pagado</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#374151' }}>
            {fmtCRC(d.monto_pagado)}
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
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Recibos</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#374151' }}>{d.n_pagos}</span>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────
export default function TendenciaPagoCard({ puntos }: { puntos: TendenciaPagoPunto[] }) {
  const sorted = [...puntos].sort((a, b) => (a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes));

  if (sorted.length < 2) {
    return (
      <div
        className="bg-white rounded-xl border shadow-sm overflow-hidden"
        style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
      >
        <div
          className="px-6 py-4 flex items-center gap-3"
          style={{ borderBottom: '1px solid #F1F5F9' }}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(0,59,92,0.08)' }}
          >
            <Activity size={15} style={{ color: '#003B5C' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Tendencia de Pago</h2>
            <p className="text-xs text-gray-400">ICP mes a mes (sin ponderar) · últimos 6 meses</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
          <p className="text-sm font-semibold text-gray-400 mb-1">Acumulando historial de pagos</p>
          <p className="text-xs text-gray-300 max-w-xs leading-relaxed">
            Se necesitan al menos 2 meses con pagos registrados para mostrar la tendencia.
          </p>
        </div>
      </div>
    );
  }

  const ultimo = sorted[sorted.length - 1];
  const previo = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
  const delta = previo ? +(ultimo.icp_mes - previo.icp_mes).toFixed(0) : null;
  const lineColor = icpColorPrimary(ultimo.icp_mes);

  const chartData = sorted.map((p) => ({
    label: labelMes(p.anio, p.mes),
    icp_mes: p.icp_mes,
    dias_atraso_prom: p.dias_atraso_prom,
    monto_pagado: p.monto_pagado,
    n_pagos: p.n_pagos,
  }));

  const deltaBadge =
    delta === null ? null : delta === 0 ? (
      <span className="flex items-center gap-1 text-xs font-bold" style={{ color: '#64748b' }}>
        <Minus size={12} /> Sin cambio
      </span>
    ) : delta > 0 ? (
      <span className="flex items-center gap-1 text-xs font-bold" style={{ color: '#16a34a' }}>
        <TrendingUp size={12} /> +{delta} pts vs mes anterior
      </span>
    ) : (
      <span className="flex items-center gap-1 text-xs font-bold" style={{ color: '#dc2626' }}>
        <TrendingDown size={12} /> {delta} pts vs mes anterior
      </span>
    );

  return (
    <div
      className="bg-white rounded-xl border shadow-sm overflow-hidden"
      style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
    >
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div
        className="px-6 py-4 flex items-center justify-between flex-wrap gap-2"
        style={{ borderBottom: '1px solid #F1F5F9' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(0,59,92,0.08)' }}
          >
            <Activity size={15} style={{ color: '#003B5C' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Tendencia de Pago</h2>
            <p className="text-xs text-gray-400">
              ICP mes a mes (sin ponderar) · {sorted.length} meses de historial
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {deltaBadge}
          <div className="text-right">
            <div
              className="text-xl font-black tabular-nums"
              style={{ color: lineColor, lineHeight: 1.1 }}
            >
              {ultimo.icp_mes}
            </div>
            <div className="text-[10px] text-gray-400 font-medium">
              {labelMes(ultimo.anio, ultimo.mes)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Gráfico ──────────────────────────────────────────────────── */}
      <div className="px-2 pt-4 pb-2">
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart data={chartData} margin={{ top: 8, right: 24, left: -4, bottom: 0 }}>
            <defs>
              <linearGradient id="gradIcpMensual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={lineColor} stopOpacity={0.2} />
                <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={{ stroke: '#E2E8F0' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#E2E8F0', strokeWidth: 1 }} />

            {/* Línea de referencia — Bueno ≥70 */}
            <ReferenceLine
              y={70}
              stroke="#22c55e"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: 'Bueno 70',
                position: 'insideTopRight',
                fontSize: 10,
                fill: '#22c55e',
                dy: -5,
              }}
            />
            {/* Línea de referencia — Regular ≥50 */}
            <ReferenceLine
              y={50}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: 'Regular 50',
                position: 'insideTopRight',
                fontSize: 10,
                fill: '#f59e0b',
                dy: -5,
              }}
            />

            <Area
              type="monotoneX"
              dataKey="icp_mes"
              stroke={lineColor}
              strokeWidth={2.5}
              fill="url(#gradIcpMensual)"
              fillOpacity={1}
              dot={{ r: 4, strokeWidth: 2, stroke: 'white', fill: lineColor }}
              activeDot={{ r: 6, strokeWidth: 2, stroke: 'white', fill: lineColor }}
              name="Score ICP"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Leyenda ──────────────────────────────────────────────────── */}
      <div className="px-6 pb-4 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-5 rounded-full" style={{ background: lineColor }} />
          <span className="text-[11px] text-gray-500">Score ICP</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="20" height="4" style={{ flexShrink: 0 }}>
            <line
              x1="0"
              y1="2"
              x2="20"
              y2="2"
              stroke="#22c55e"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          </svg>
          <span className="text-[11px] text-gray-500">Bueno ≥70</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="20" height="4" style={{ flexShrink: 0 }}>
            <line
              x1="0"
              y1="2"
              x2="20"
              y2="2"
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          </svg>
          <span className="text-[11px] text-gray-500">Regular ≥50</span>
        </div>
        <span className="text-[10px] text-gray-300 italic ml-auto">
          * ICP de cada mes calendario por separado — puede diferir del Score ICP del encabezado,
          que pondera los últimos 9 meses
        </span>
      </div>
    </div>
  );
}
