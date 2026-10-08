'use client';

import { Timer, TrendingDown, TrendingUp, Minus } from 'lucide-react';
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

// ── Tipos ─────────────────────────────────────────────────────────────
export interface DSOPunto {
  anio: number;
  mes: number;
  dso: number;
  ventas90d: number; // ventas rolling 3m con IVA (₡)
  esEstimado: boolean; // true cuando no hay cartera real del mes
}

// ── Helpers ───────────────────────────────────────────────────────────
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

function labelMes(anio: number, mes: number) {
  return `${MESES[mes - 1]} ${String(anio).slice(2)}`;
}

function colorDso(d: number) {
  if (d > 45) return '#ef4444';
  if (d > 35) return '#f59e0b';
  return '#16a34a';
}

function fmtMillones(n: number): string {
  const m = n / 1_000_000;
  const parts = m.toFixed(1).split('.');
  return `₡${parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${parts[1]} M`;
}

// ── Tooltip ───────────────────────────────────────────────────────────
interface TooltipPayload {
  label: string;
  dso: number;
  ventas90d: number;
  esEstimado: boolean;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as TooltipPayload;
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #E2E8F0',
        borderRadius: '10px',
        padding: '10px 14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
        minWidth: '180px',
      }}
    >
      <p style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>
        {d.label}
        {d.esEstimado ? ' · estimado' : ' · real'}
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
              background: colorDso(d.dso),
              flexShrink: 0,
            }}
          />
          DSO
        </span>
        <span style={{ fontSize: '14px', fontWeight: 800, color: colorDso(d.dso) }}>
          {d.dso.toFixed(1)}d
        </span>
      </div>
      <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '6px', paddingTop: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Ventas 90d</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#374151' }}>
            {fmtMillones(d.ventas90d)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────
export default function DSOTendenciaCard({ puntos }: { puntos: DSOPunto[] }) {
  if (puntos.length === 0) return null;

  const sorted = [...puntos].sort((a, b) => (a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes));
  const ultimo = sorted[sorted.length - 1];
  const previo = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
  const delta = previo ? +(ultimo.dso - previo.dso).toFixed(1) : null;
  const lineColor = colorDso(ultimo.dso);

  // Dominio Y: arranca 10d debajo del mínimo (redondeado a múltiplo de 5)
  // para que las líneas de referencia 35d / 45d queden visibles
  const dsoValues = sorted.map((p) => p.dso);
  const minDso = Math.min(...dsoValues);
  const maxDso = Math.max(...dsoValues);
  const yMin = Math.max(0, Math.floor((minDso - 10) / 5) * 5);
  const yMax = Math.ceil((maxDso + 6) / 5) * 5;

  // Datos para recharts
  const chartData = sorted.map((p) => ({
    label: labelMes(p.anio, p.mes),
    dso: p.dso,
    ventas90d: p.ventas90d,
    esEstimado: p.esEstimado,
  }));

  const deltaBadge =
    delta === null ? null : delta === 0 ? (
      <span className="flex items-center gap-1 text-xs font-bold" style={{ color: '#64748b' }}>
        <Minus size={12} /> Sin cambio
      </span>
    ) : delta > 0 ? (
      <span className="flex items-center gap-1 text-xs font-bold" style={{ color: '#ef4444' }}>
        <TrendingUp size={12} /> +{delta}d vs mes anterior
      </span>
    ) : (
      <span className="flex items-center gap-1 text-xs font-bold" style={{ color: '#16a34a' }}>
        <TrendingDown size={12} /> {delta}d vs mes anterior
      </span>
    );

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
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid #F1F5F9' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(0,59,92,0.08)' }}
          >
            <Timer size={15} style={{ color: '#003B5C' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Evolución DSO</h2>
            <p className="text-xs text-gray-400">
              Días de cobro · {sorted.length} períodos · ventas reales rolling 3 meses
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
              {ultimo.dso.toFixed(1)}d
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
              <linearGradient id="gradDso" x1="0" y1="0" x2="0" y2="1">
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
              domain={[yMin, yMax]}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickFormatter={(v) => `${v}d`}
              axisLine={false}
              tickLine={false}
              width={38}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#E2E8F0', strokeWidth: 1 }} />

            {/* Línea de referencia — Crítico >45d */}
            <ReferenceLine
              y={45}
              stroke="#ef4444"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: 'Crítico 45d',
                position: 'insideTopRight',
                fontSize: 10,
                fill: '#ef4444',
                dy: -5,
              }}
            />
            {/* Línea de referencia — Meta ≤35d */}
            <ReferenceLine
              y={35}
              stroke="#16a34a"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: 'Meta 35d',
                position: 'insideTopRight',
                fontSize: 10,
                fill: '#16a34a',
                dy: -5,
              }}
            />

            {/* Área DSO */}
            <Area
              type="monotoneX"
              dataKey="dso"
              stroke={lineColor}
              strokeWidth={2.5}
              fill="url(#gradDso)"
              fillOpacity={1}
              dot={{ r: 4, strokeWidth: 2, stroke: 'white', fill: lineColor }}
              activeDot={{ r: 6, strokeWidth: 2, stroke: 'white', fill: lineColor }}
              name="DSO"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Leyenda ──────────────────────────────────────────────────── */}
      <div className="px-6 pb-4 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-5 rounded-full" style={{ background: lineColor }} />
          <span className="text-[11px] text-gray-500">DSO · días de cobro</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="20" height="4" style={{ flexShrink: 0 }}>
            <line
              x1="0"
              y1="2"
              x2="20"
              y2="2"
              stroke="#ef4444"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          </svg>
          <span className="text-[11px] text-gray-500">Crítico 45d</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="20" height="4" style={{ flexShrink: 0 }}>
            <line
              x1="0"
              y1="2"
              x2="20"
              y2="2"
              stroke="#16a34a"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          </svg>
          <span className="text-[11px] text-gray-500">Meta 35d</span>
        </div>
        <div className="ml-auto text-[10px] text-gray-300 italic">
          * meses sin cartera real marcados como estimado
        </div>
      </div>
    </div>
  );
}
