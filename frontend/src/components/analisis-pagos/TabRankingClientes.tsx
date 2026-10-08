'use client';

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useRankingClientesController } from '@/views/analisis-pagos/hooks/use-analisis-icp-controller';
import { fmtCRC } from '@/lib/utils/formato';
import KPICardAnalisis from './KPICardAnalisis';
import { icpColorPrimary } from './ICPBadge';
import type { RankingRow, IcpClasificacion } from '@/types/analisis-pagos';

const PER_PAGE = 25;

const CLASIFICACIONES: IcpClasificacion[] = ['EXCELENTE', 'BUENO', 'REGULAR', 'MALO', 'MUY MALO'];

// ── Helpers de color ──────────────────────────────────────────────────────────

function diasColor(dias: number): string {
  if (dias > 30) return '#dc2626';
  if (dias >= 6) return '#f59e0b';
  return '#16a34a';
}

// ── Badge ICP inline con nuevos colores ───────────────────────────────────────

const BADGE_CFG: Record<IcpClasificacion, { bg: string; color: string }> = {
  EXCELENTE: { bg: '#E1F5EE', color: '#0F6E56' },
  BUENO: { bg: '#EAF3DE', color: '#3B6D11' },
  REGULAR: { bg: '#FAEEDA', color: '#633806' },
  MALO: { bg: '#FAECE7', color: '#712B13' },
  'MUY MALO': { bg: '#FCEBEB', color: '#A32D2D' },
};

function ClasifBadge({ cls }: { cls: IcpClasificacion }) {
  const cfg = BADGE_CFG[cls] ?? BADGE_CFG['REGULAR'];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: 700,
        background: cfg.bg,
        color: cfg.color,
        whiteSpace: 'nowrap',
      }}
    >
      {cls}
    </span>
  );
}

// ── Paginación con números ─────────────────────────────────────────────────────

function buildPageList(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const delta = 2;
  const pages: (number | '...')[] = [];
  let prev = -1;
  for (let i = 1; i <= total; i++) {
    const show = i === 1 || i === total || Math.abs(i - current) <= delta;
    if (show) {
      if (prev !== -1 && i - prev > 1) pages.push('...');
      pages.push(i);
      prev = i;
    }
  }
  return pages;
}

function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const from = (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, total);
  const list = buildPageList(page, totalPages);

  return (
    <div
      style={{
        background: '#fafafa',
        borderTop: '1px solid #e2e8f0',
        borderRadius: '0 0 12px 12px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
      }}
    >
      <span style={{ fontSize: '12px', color: '#64748b' }}>
        Mostrando {from}–{to} de {total.toLocaleString()} clientes
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {/* Anterior */}
        <button
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
          style={{
            padding: '4px 10px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '12px',
            background: 'white',
            color: page === 1 ? '#cbd5e1' : '#374151',
            cursor: page === 1 ? 'default' : 'pointer',
          }}
        >
          ← Anterior
        </button>

        {/* Números */}
        {list.map((p, i) =>
          typeof p === 'number' ? (
            <button
              key={i}
              onClick={() => onPage(p)}
              style={{
                padding: '4px 8px',
                minWidth: '32px',
                border: '1px solid',
                borderColor: p === page ? '#009ee3' : '#e2e8f0',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: p === page ? 700 : 400,
                background: p === page ? '#009ee3' : 'white',
                color: p === page ? 'white' : '#374151',
                cursor: 'pointer',
              }}
            >
              {p}
            </button>
          ) : (
            <span key={i} style={{ fontSize: '12px', color: '#94a3b8', padding: '0 2px' }}>
              …
            </span>
          ),
        )}

        {/* Siguiente */}
        <button
          disabled={page === totalPages}
          onClick={() => onPage(page + 1)}
          style={{
            padding: '4px 10px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '12px',
            background: 'white',
            color: page === totalPages ? '#cbd5e1' : '#374151',
            cursor: page === totalPages ? 'default' : 'pointer',
          }}
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-100 h-20 animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-100 h-10 animate-pulse" />
      <div className="bg-white rounded-xl border border-slate-100 h-72 animate-pulse" />
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  periodo: number;
  userEmail: string | null;
}

export default function TabRankingClientes({ periodo, userEmail }: Props) {
  const [page, setPage] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [clasificacion, setClasificacion] = useState<string>('');
  const [dimension, setDimension] = useState<string>('');
  const [orden, setOrden] = useState<string>('icp_asc');
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(inputValue), 400);
    return () => clearTimeout(t);
  }, [inputValue]);

  const {
    data,
    loading,
    error,
    reload: fetchData,
  } = useRankingClientesController({
    email: userEmail ?? null,
    meses: periodo,
    offset: (page - 1) * PER_PAGE,
    limit: PER_PAGE,
    clasificacion: clasificacion || null,
    dimension: dimension || null,
    busqueda: busqueda || null,
    orden,
  });
  useEffect(() => {
    setPage(1);
  }, [busqueda, clasificacion, dimension, orden, periodo]);

  if (loading) return <Skeleton />;
  if (error)
    return (
      <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
        <p className="text-red-600 font-semibold text-sm">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 text-[#009ee3] text-sm font-semibold hover:underline"
        >
          Reintentar
        </button>
      </div>
    );
  if (!data) return null;

  const { kpis, total, rows } = data;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-4">
      {/* KPI Cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <KPICardAnalisis
          compact
          label="ICP promedio cartera"
          valor={`${kpis.icp_promedio}`}
          sub="sobre 100 puntos"
          color="#009ee3"
        />
        <KPICardAnalisis
          compact
          label="Pagadores puntuales"
          valor={`${kpis.pct_puntual}%`}
          sub={`${kpis.cnt_puntual} clientes — ≤5d`}
          color="#16a34a"
        />
        <KPICardAnalisis
          compact
          label="Atraso moderado"
          valor={`${kpis.pct_moderado}%`}
          sub={`${kpis.cnt_moderado} clientes — 6-30d`}
          color="#f59e0b"
        />
        <KPICardAnalisis
          compact
          label="Atraso grave"
          valor={`${kpis.pct_grave}%`}
          sub={`${kpis.cnt_grave} clientes — >30d`}
          color="#dc2626"
        />
        <KPICardAnalisis
          compact
          label="Días atraso prom."
          valor={`${kpis.dias_atraso_promedio}d`}
          sub="ponderado por período"
          color="#009ee3"
        />
      </div>

      {/* Filtros ────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Buscar cliente…"
            className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-200"
          />
        </div>
        <select
          value={clasificacion}
          onChange={(e) => setClasificacion(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-gray-700 bg-white focus:outline-none"
          style={{ minWidth: '160px' }}
        >
          <option value="">Todas las clasificaciones</option>
          {CLASIFICACIONES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={dimension}
          onChange={(e) => setDimension(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-gray-700 bg-white focus:outline-none"
          style={{ minWidth: '140px' }}
        >
          <option value="">Todas las dimensiones</option>
          <option value="Grandes">Grandes</option>
          <option value="Medianos">Medianos</option>
          <option value="Pequeños">Pequeños</option>
          <option value="Canal Moderno">Canal Moderno</option>
          <option value="Especializados sin dimensión">Especializados sin dimensión</option>
        </select>
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-gray-700 bg-white focus:outline-none"
          style={{ minWidth: '210px' }}
        >
          <option value="icp_asc">ICP ascendente (peores primero)</option>
          <option value="icp_desc">ICP descendente (mejores primero)</option>
          <option value="dias_asc">Más días de atraso</option>
          <option value="cartera_desc">Mayor cartera</option>
        </select>
      </div>

      {/* Tabla + Footer ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        {/* Sub-header */}
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between bg-slate-50">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            {total.toLocaleString()} cliente{total !== 1 ? 's' : ''} con historial de pagos
          </span>
          <span className="text-[11px] text-gray-400">Período: últimos {periodo} meses</span>
        </div>

        <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse' }}>
          <colgroup>
            <col style={{ width: '40px' }} /> {/* # */}
            <col style={{ width: '25%' }} /> {/* Cliente */}
            <col style={{ width: '20%' }} /> {/* Vendedor */}
            <col style={{ width: '18%' }} /> {/* Score ICP */}
            <col style={{ width: '110px' }} /> {/* Clasificación */}
            <col style={{ width: '100px' }} /> {/* Días Atraso */}
            <col style={{ width: '100px' }} /> {/* Tendencia */}
            <col style={{ width: '130px' }} /> {/* Mora Activa */}
          </colgroup>

          {/* Encabezado sticky */}
          <thead>
            <tr
              style={{
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                position: 'sticky',
                top: 0,
                zIndex: 1,
              }}
            >
              {(
                [
                  ['#', 'center'],
                  ['Cliente', 'left'],
                  ['Vendedor', 'left'],
                  ['Score ICP', 'left'],
                  ['Clasificación', 'center'],
                  ['Días Atraso', 'center'],
                  ['Tendencia', 'center'],
                  ['Mora Activa', 'right'],
                ] as [string, React.CSSProperties['textAlign']][]
              ).map(([label, align]) => (
                <th
                  key={label}
                  style={{
                    padding: '8px 12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    textAlign: align,
                    background: '#f8fafc',
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          {/* Cuerpo */}
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: '48px 12px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: '13px',
                  }}
                >
                  Sin clientes para los filtros seleccionados
                </td>
              </tr>
            ) : (
              rows.map((row: RankingRow, idx: number) => {
                const num = (page - 1) * PER_PAGE + idx + 1;
                const icpColor = icpColorPrimary(row.icp_score);
                const icpFill = `${Math.min(100, Math.max(0, row.icp_score))}%`;
                const dColor = diasColor(row.dias_atraso_prom);
                const tendN = Math.abs(Math.round(row.tendencia_3m));
                const tendColor =
                  row.tendencia_3m < -3 ? '#dc2626' : row.tendencia_3m > 3 ? '#16a34a' : '#94a3b8';
                const tendLabel =
                  row.tendencia_3m < -3
                    ? `▼ ${tendN} pts`
                    : row.tendencia_3m > 3
                      ? `▲ ${tendN} pts`
                      : 'sin cambio';
                const tendSize = Math.abs(row.tendencia_3m) <= 3 ? '11px' : '12px';
                const isSinCambio = Math.abs(row.tendencia_3m) <= 3;

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
                        fontWeight: 500,
                        color: '#94a3b8',
                      }}
                    >
                      {num}
                    </td>

                    {/* Cliente */}
                    <td style={{ padding: '10px 12px' }}>
                      <p
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#0f172a',
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
                          fontWeight: 600,
                          color: '#64748b',
                          marginTop: '1px',
                          fontFamily: 'monospace',
                          letterSpacing: '0.5px',
                        }}
                      >
                        {row.cliente_cod}
                      </p>
                    </td>

                    {/* Vendedor */}
                    <td
                      style={{
                        padding: '10px 12px',
                        fontSize: '12px',
                        color: '#475569',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.vendedor_nombre}
                    </td>

                    {/* Score ICP — número + barra */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            minWidth: '28px',
                            fontSize: '14px',
                            fontWeight: 700,
                            color: icpColor,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {row.icp_score}
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: '10px',
                            borderRadius: '5px',
                            background: '#e2e8f0',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: icpFill,
                              height: '100%',
                              borderRadius: '5px',
                              background: icpColor,
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Clasificación */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <ClasifBadge cls={row.clasificacion} />
                    </td>

                    {/* Días Atraso */}
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'center',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: dColor,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {row.dias_atraso_prom}d
                    </td>

                    {/* Tendencia */}
                    <td
                      title="ICP actual vs hace 3 meses"
                      style={{
                        padding: '10px 12px',
                        textAlign: 'center',
                        fontSize: tendSize,
                        fontWeight: isSinCambio ? 400 : 700,
                        fontStyle: isSinCambio ? 'italic' : 'normal',
                        color: tendColor,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {tendLabel}
                    </td>

                    {/* Mora Activa */}
                    <td
                      style={{
                        padding: '10px 20px 10px 12px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {row.cartera_actual > 0 ? (
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                          {fmtCRC(row.cartera_actual)}
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', fontWeight: 500, color: '#16a34a' }}>
                          Al día
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Footer con paginación */}
        <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
      </div>
    </div>
  );
}
