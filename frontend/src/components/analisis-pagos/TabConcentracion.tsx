'use client';

import { Lock, Shield, TrendingDown, BarChart3 } from 'lucide-react';
import { useConcentracionController } from '@/views/analisis-pagos/hooks/use-analisis-icp-controller';
import { fmtCRC } from '@/lib/utils/formato';
import KPICardAnalisis from './KPICardAnalisis';
import ICPBadge, { icpColorPrimary } from './ICPBadge';
import type { ConcentracionRow } from '@/types/analisis-pagos';

// ── Helpers ───────────────────────────────────────────────────────────────────

function acumColor(pct: number): { color: string; fontWeight: number } {
  if (pct > 40) return { color: '#dc2626', fontWeight: 700 };
  return { color: '#f59e0b', fontWeight: 600 };
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border h-24 animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-xl border h-16 animate-pulse" />
      <div className="bg-white rounded-xl border h-64 animate-pulse" />
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  esAnalista: boolean;
}

export default function TabConcentracion({ esAnalista }: Props) {
  const { data, loading, error } = useConcentracionController(esAnalista);

  // Analista — acceso restringido
  if (esAnalista)
    return (
      <div className="bg-white rounded-xl border border-slate-100 p-12 flex flex-col items-center text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'rgba(0,59,92,0.06)' }}
        >
          <Lock size={24} style={{ color: '#003B5C', opacity: 0.4 }} />
        </div>
        <p className="text-sm font-semibold text-gray-600 mb-1">
          Vista disponible para el coordinador
        </p>
        <p className="text-[12px] text-gray-400 max-w-sm leading-relaxed">
          El análisis de concentración de riesgo es una herramienta gerencial. Contactá al
          coordinador para revisar esta información.
        </p>
      </div>
    );

  if (loading) return <Skeleton />;
  if (error)
    return (
      <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
        <p className="text-red-600 text-sm font-semibold">{error}</p>
      </div>
    );
  if (!data) return null;

  const { kpis, top10, total_mora } = data;

  const hhhColor =
    kpis.hhi_nivel === 'ALTO' ? '#dc2626' : kpis.hhi_nivel === 'MEDIO' ? '#f59e0b' : '#16a34a';

  return (
    <div className="space-y-4">
      {/* KPI Cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICardAnalisis
          label="Top 10 / mora total"
          valor={`${kpis.pct_top10 ?? 0}%`}
          sub="concentrado en 10 clientes"
          color="#003B5C"
          icon={<BarChart3 size={14} />}
        />
        <KPICardAnalisis
          label="Top 3 vendedores"
          valor={`${kpis.pct_top3_vendedores ?? 0}%`}
          sub="de la mora total"
          color="#009ee3"
          icon={<TrendingDown size={14} />}
        />
        <KPICardAnalisis
          label='Clientes "Grandes"'
          valor={`${kpis.pct_grandes ?? 0}%`}
          sub="de la mora total"
          color="#f59e0b"
          icon={<Shield size={14} />}
        />
        {/* Card HHI — centrada con descripción contextual */}
        <div
          className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col items-center text-center"
          style={{ borderTop: `3px solid ${hhhColor}` }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center mb-2 flex-shrink-0"
            style={{ background: `${hhhColor}18` }}
          >
            <span style={{ color: hhhColor }}>
              <BarChart3 size={14} />
            </span>
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 leading-tight">
            Dispersión de mora
          </p>
          <p className="text-2xl font-black leading-tight" style={{ color: hhhColor }}>
            {kpis.hhi_nivel}
          </p>
          <p className="text-[10px] text-gray-400 mt-1 leading-snug">
            {kpis.hhi_nivel === 'BAJO'
              ? 'Deuda bien distribuida'
              : kpis.hhi_nivel === 'MEDIO'
                ? 'Concentración moderada'
                : 'Riesgo muy concentrado'}
          </p>
          <p className="text-[9px] text-gray-300 mt-0.5 tabular-nums">
            {(kpis.hhi_valor ?? 0).toLocaleString()} pts HHI
          </p>
        </div>
      </div>

      {/* Nota HHI ───────────────────────────────────────────────────────────── */}
      <p className="text-[10px] text-gray-400 leading-relaxed px-0.5">
        <span className="font-semibold text-gray-500">Índice HHI (Herfindahl-Hirschman):</span> mide
        cuán concentrada está la mora entre clientes.{' '}
        <span className="text-green-600 font-semibold">BAJO</span> (&lt;1,000 pts) = deuda repartida
        en muchos clientes — menor riesgo sistémico.{' '}
        <span className="text-amber-500 font-semibold">MEDIO</span> (1,000–2,500 pts) =
        concentración moderada. <span className="text-red-600 font-semibold">ALTO</span> (&gt;2,500
        pts) = pocos clientes concentran la mayor parte de la mora — riesgo crítico si uno de ellos
        no paga.
      </p>

      {/* Barra de distribución ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
          Distribución de mora — Top 10 vs resto
        </p>

        {/* Barra */}
        <div
          style={{
            display: 'flex',
            height: '40px',
            borderRadius: '8px',
            overflow: 'hidden',
            gap: '1px',
          }}
        >
          {top10.map((row: ConcentracionRow) => {
            const color = row.icp_score !== null ? icpColorPrimary(row.icp_score) : '#94a3b8';
            const showText = row.pct_mora >= 3;
            return (
              <div
                key={row.cliente_cod}
                title={`${row.cliente_nombre}: ${row.pct_mora}%`}
                style={{
                  width: `${row.pct_mora}%`,
                  minWidth: '2px',
                  height: '100%',
                  background: color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                {showText && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'white',
                      userSelect: 'none',
                      pointerEvents: 'none',
                    }}
                  >
                    {row.pct_mora}%
                  </span>
                )}
              </div>
            );
          })}
          {/* Resto */}
          <div
            style={{
              flex: 1,
              height: '100%',
              background: '#e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Resto de la cartera"
          >
            <span
              style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', userSelect: 'none' }}
            >
              Resto
            </span>
          </div>
        </div>

        {/* Leyenda */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '10px' }}>
          {top10.map((row: ConcentracionRow) => {
            const color = row.icp_score !== null ? icpColorPrimary(row.icp_score) : '#94a3b8';
            const label =
              row.cliente_nombre.length > 20
                ? row.cliente_nombre.slice(0, 20) + '…'
                : row.cliente_nombre;
            return (
              <div
                key={row.cliente_cod}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: '9px', color: '#64748b' }}>{label}</span>
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '2px',
                background: '#e2e8f0',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '9px', color: '#64748b' }}>Resto</span>
          </div>
        </div>
      </div>

      {/* Tabla Top 10 ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        {/* Sub-header con total */}
        <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            Top 10 clientes por mora{' '}
            <span className="text-gray-600 normal-case font-semibold">
              — Total: {fmtCRC(total_mora)}
            </span>
          </p>
        </div>

        <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse' }}>
          <colgroup>
            <col style={{ width: '4%' }} /> {/* # */}
            <col style={{ width: '28%' }} /> {/* Cliente */}
            <col style={{ width: '22%' }} /> {/* Vendedor */}
            <col style={{ width: '16%' }} /> {/* Mora total */}
            <col style={{ width: '8%' }} /> {/* % Mora */}
            <col style={{ width: '10%' }} /> {/* ICP */}
            <col style={{ width: '12%' }} /> {/* % Acumulado */}
          </colgroup>

          {/* Encabezado */}
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
              {(
                [
                  ['#', 'center'],
                  ['Cliente', 'left'],
                  ['Vendedor', 'left'],
                  ['Mora total', 'right'],
                  ['% Mora', 'center'],
                  ['ICP', 'center'],
                  ['% Acumulado', 'center'],
                ] as [string, React.CSSProperties['textAlign']][]
              ).map(([label, align]) => (
                <th
                  key={label}
                  style={{
                    padding: '8px 12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#475569',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    textAlign: align,
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          {/* Filas */}
          <tbody>
            {top10.map((row: ConcentracionRow) => {
              const { color: colorAcum, fontWeight: fwAcum } = acumColor(row.pct_acumulado);
              return (
                <tr
                  key={row.cliente_cod}
                  style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* # */}
                  <td
                    style={{
                      padding: '10px 12px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#003B5C',
                    }}
                  >
                    {row.rank}
                  </td>

                  {/* Cliente */}
                  <td style={{ padding: '10px 12px' }}>
                    <p
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#1e293b',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.cliente_nombre}
                    </p>
                    <p
                      style={{
                        fontSize: '11px',
                        color: '#94a3b8',
                        marginTop: '1px',
                        fontFamily: 'monospace',
                      }}
                    >
                      {row.cliente_cod}
                    </p>
                  </td>

                  {/* Vendedor — nombre completo, permite wrap */}
                  <td
                    style={{
                      padding: '10px 12px',
                      fontSize: '12px',
                      color: '#475569',
                      wordBreak: 'break-word',
                    }}
                  >
                    {row.vendedor_nombre}
                  </td>

                  {/* Mora total */}
                  <td
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#dc2626',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtCRC(row.mora_total)}
                  </td>

                  {/* % Mora */}
                  <td
                    style={{
                      padding: '10px 12px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#64748b',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row.pct_mora}%
                  </td>

                  {/* ICP badge */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {row.clasificacion ? (
                      <ICPBadge clasificacion={row.clasificacion} size="sm" />
                    ) : (
                      <span style={{ fontSize: '11px', color: '#cbd5e1' }}>—</span>
                    )}
                  </td>

                  {/* % Acumulado */}
                  <td
                    style={{
                      padding: '10px 12px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: fwAcum,
                      color: colorAcum,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row.pct_acumulado}%
                    {row.pct_acumulado > 40 && (
                      <span style={{ fontSize: '9px', marginLeft: '3px' }}>⚠</span>
                    )}
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
