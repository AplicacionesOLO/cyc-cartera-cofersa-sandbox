'use client';

import { useState } from 'react';
import { usePerfilVendedorController } from '@/views/analisis-pagos/hooks/use-analisis-icp-controller';
import { icpColorPrimary } from './ICPBadge';
import type { VendedorRow } from '@/types/analisis-pagos';

// ── Helpers de color ──────────────────────────────────────────────────────────

function pctPuntualColor(pct: number): string {
  if (pct > 40) return '#16a34a';
  if (pct >= 20) return '#f59e0b';
  return '#dc2626';
}

function diasColor(dias: number): string {
  if (dias > 30) return '#dc2626';
  if (dias >= 15) return '#f59e0b';
  return '#16a34a';
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
      <div className="bg-white rounded-xl border h-64 animate-pulse" />
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  periodo: number;
  userEmail: string | null;
}

export default function TabPerfilVendedor({ periodo, userEmail }: Props) {
  const [orden, setOrden] = useState('icp_asc');
  const [supervisor, setSupervisor] = useState('');
  const { data, loading, error } = usePerfilVendedorController(userEmail ?? null, periodo, orden);

  if (loading) return <Skeleton />;
  if (error)
    return (
      <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
        <p className="text-red-600 text-sm font-semibold">{error}</p>
      </div>
    );
  if (!data) return null;

  const { kpis, rows } = data;
  const supervisores = [
    ...new Set(rows.map((r) => r.supervisor_cod).filter((s) => s && s !== '—')),
  ].sort();
  const rowsFiltradas = supervisor ? rows.filter((r) => r.supervisor_cod === supervisor) : rows;

  return (
    <div className="space-y-4">
      {/* KPI Cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col items-center text-center"
          style={{ borderTop: '3px solid #16a34a' }}
        >
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 leading-tight">
            Mejor ICP promedio
          </p>
          <p className="text-base font-black text-gray-800 w-full text-center truncate leading-snug">
            {kpis.mejor_icp_vendedor || '—'}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">{kpis.mejor_icp_valor} pts promedio</p>
        </div>

        <div
          className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col items-center text-center"
          style={{ borderTop: '3px solid #dc2626' }}
        >
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 leading-tight">
            Mayor concentración riesgo
          </p>
          <p className="text-base font-black text-gray-800 w-full text-center truncate leading-snug">
            {kpis.mayor_riesgo_vendedor || '—'}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            {kpis.mayor_riesgo_pct}% clientes con ICP &lt; 50
          </p>
        </div>

        <div
          className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col items-center text-center"
          style={{ borderTop: '3px solid #009ee3' }}
        >
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 leading-tight">
            Mayor % pago puntual
          </p>
          <p className="text-base font-black text-gray-800 w-full text-center truncate leading-snug">
            {kpis.mejor_puntual_vendedor || '—'}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">{kpis.mejor_puntual_pct}% pagan a tiempo</p>
        </div>

        <div
          className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col items-center text-center"
          style={{ borderTop: '3px solid #f59e0b' }}
        >
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 leading-tight">
            Peor días atraso prom.
          </p>
          <p className="text-base font-black text-gray-800 w-full text-center truncate leading-snug">
            {kpis.peor_dias_vendedor || '—'}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            {kpis.peor_dias_valor}d promedio de atraso
          </p>
        </div>
      </div>

      {/* Controles ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex flex-wrap gap-3 items-center">
        {supervisores.length > 0 && (
          <select
            value={supervisor}
            onChange={(e) => setSupervisor(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] bg-white text-gray-700 focus:outline-none"
            style={{ minWidth: '160px' }}
          >
            <option value="">Todos los supervisores</option>
            {supervisores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] bg-white text-gray-700 focus:outline-none"
          style={{ minWidth: '200px' }}
        >
          <option value="icp_asc">ICP ascendente (peores primero)</option>
          <option value="icp_desc">ICP descendente (mejores primero)</option>
          <option value="puntual">Mayor % pago puntual</option>
          <option value="dias">Más días de atraso</option>
          <option value="criticos">Más clientes críticos</option>
        </select>
        <span className="text-[11px] text-gray-400 ml-auto">{rowsFiltradas.length} vendedores</span>
      </div>

      {/* Tabla ───────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse' }}>
          <colgroup>
            <col style={{ width: '40px' }} /> {/* # */}
            <col style={{ width: '220px' }} /> {/* Vendedor */}
            <col style={{ width: '80px' }} /> {/* Clientes */}
            <col style={{ width: '200px' }} /> {/* ICP Promedio */}
            <col style={{ width: '120px' }} /> {/* % Pago Puntual */}
            <col style={{ width: '120px' }} /> {/* Días Atraso */}
            <col style={{ width: '100px' }} /> {/* Críticos */}
          </colgroup>

          {/* Encabezado */}
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
              {(
                [
                  ['#', 'center'],
                  ['Vendedor', 'left'],
                  ['Clientes', 'center'],
                  ['ICP Promedio', 'left'],
                  ['% Pago Puntual', 'center'],
                  ['Días Atraso Prom.', 'center'],
                  ['Críticos <50', 'center'],
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
            {rowsFiltradas.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: '48px 12px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: '13px',
                  }}
                >
                  Sin datos para el filtro seleccionado
                </td>
              </tr>
            ) : (
              rowsFiltradas.map((row: VendedorRow, idx: number) => {
                const icpColor = icpColorPrimary(row.icp_promedio);
                return (
                  <tr
                    key={row.vendedor_cod || idx}
                    style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* # */}
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'center',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#cbd5e1',
                      }}
                    >
                      {idx + 1}
                    </td>

                    {/* Vendedor */}
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
                        {row.vendedor_nombre}
                      </p>
                      {row.supervisor_cod && row.supervisor_cod !== '—' && (
                        <p style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          Sup: {row.supervisor_cod}
                        </p>
                      )}
                    </td>

                    {/* Clientes */}
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'center',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#374151',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {row.total_clientes}
                    </td>

                    {/* ICP Promedio — número a la izquierda + barra */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            minWidth: '32px',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: icpColor,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {row.icp_promedio}
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: '8px',
                            borderRadius: '4px',
                            background: '#f1f5f9',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, row.icp_promedio))}%`,
                              height: '100%',
                              borderRadius: '4px',
                              background: icpColor,
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* % Pago Puntual */}
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'center',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: pctPuntualColor(row.pct_a_tiempo),
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {row.pct_a_tiempo}%
                    </td>

                    {/* Días Atraso */}
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'center',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: diasColor(row.dias_atraso_prom),
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {row.dias_atraso_prom}d
                    </td>

                    {/* Críticos */}
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'center',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {row.clientes_criticos > 0 ? (
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626' }}>
                          {row.clientes_criticos}
                        </span>
                      ) : (
                        <span style={{ fontSize: '13px', color: '#cbd5e1' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
