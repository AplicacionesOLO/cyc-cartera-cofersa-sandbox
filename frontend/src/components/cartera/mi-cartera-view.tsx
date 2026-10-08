'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  AlertTriangle,
  TrendingUp,
  Clock,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Target,
  Zap,
} from 'lucide-react';
import { fmtCRC } from '@/lib/utils/formato';
import type { CarteraRow, KPIs } from '@/lib/utils/cola-analista';
import { icpColor, icpLabel } from '@/lib/utils/cola-analista';

// ── Constantes ─────────────────────────────────────────────────────────────
const ITEMS_PER_PAGE = 20;

// ── Etiquetas de próxima acción ────────────────────────────────────────────
const PROXIMA_LABELS: Record<string, string> = {
  esperar_pago: 'Esperar pago',
  recontactar: 'Recontactar',
  escalar: 'Escalar revisión',
  crear_solicitud: 'Crear solicitud',
  sin_seguimiento: 'Sin seguimiento',
};

// ── Config visual ──────────────────────────────────────────────────────────
type Prioridad = CarteraRow['prioridad'];

const PRIORIDAD_CFG: Record<
  Prioridad,
  {
    label: string;
    bar: string;
    dot: string;
    bg: string;
    text: string;
    border: string;
  }
> = {
  critico: {
    label: 'Crítico',
    bar: '#dc2626',
    dot: '#dc2626',
    bg: 'rgba(220,38,38,0.10)',
    text: '#dc2626',
    border: 'rgba(220,38,38,0.25)',
  },
  urgente: {
    label: 'Urgente',
    bar: '#f97316',
    dot: '#f97316',
    bg: 'rgba(249,115,22,0.10)',
    text: '#f97316',
    border: 'rgba(249,115,22,0.25)',
  },
  seguimiento: {
    label: 'Seguimiento',
    bar: '#f59e0b',
    dot: '#f59e0b',
    bg: 'rgba(245,158,11,0.10)',
    text: '#ca8a04',
    border: 'rgba(245,158,11,0.25)',
  },
  rutina: {
    label: 'Rutina',
    bar: '#22c55e',
    dot: '#22c55e',
    bg: 'rgba(34,197,94,0.10)',
    text: '#15803d',
    border: 'rgba(34,197,94,0.25)',
  },
};

const TRAMO_CFG: Record<string, { bg: string; text: string }> = {
  'Al día': { bg: 'rgba(0,158,227,0.12)', text: '#0369a1' },
  '1-30 días': { bg: 'rgba(245,158,11,0.12)', text: '#92400e' },
  '31-60 días': { bg: 'rgba(249,115,22,0.12)', text: '#c2410c' },
  '61-90 días': { bg: 'rgba(239,68,68,0.12)', text: '#b91c1c' },
  '91-120 días': { bg: 'rgba(220,38,38,0.12)', text: '#991b1b' },
  '+120 días': { bg: 'rgba(153,27,27,0.15)', text: '#7f1d1d' },
};

// ── Tipos internos ──────────────────────────────────────────────────────────
type TabId = 'agenda' | 'cartera';
type FiltroPrioridad = 'todos' | Prioridad;
type FiltroGestion = 'todos' | 'pendientes' | 'hoy';

// ── Helpers ──────────────────────────────────────────────────────────────────
function labelContacto(dias: number): { label: string; color: string } {
  if (dias === 0) return { label: 'Hoy', color: '#15803d' };
  if (dias === 1) return { label: 'Ayer', color: '#64748b' };
  if (dias <= 6) return { label: `${dias}d`, color: '#64748b' };
  if (dias <= 13) return { label: `${dias}d`, color: '#ca8a04' };
  if (dias === 999) return { label: 'Sin gestión', color: '#dc2626' };
  return { label: `${dias}d`, color: '#dc2626' };
}

function fmtFechaCorta(iso: string): string {
  const p = iso.slice(0, 10).split('-');
  return `${p[2]}/${p[1]}`;
}

function fmtFechaHoy(): string {
  const d = new Date();
  const meses = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic',
  ];
  return `${d.getDate()} ${meses[d.getMonth()]}`;
}

// Genera el array de páginas a mostrar (con '…' como ellipsis)
function getPageNums(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (cur <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (cur >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', cur - 1, cur, cur + 1, '…', total];
}

// ── Columnas tabla (header + fila comparten el mismo grid) ──────────────────
const GRID = '18px 1fr 150px 110px 46px 118px 88px';

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  rows: CarteraRow[];
  kpis: KPIs;
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function MiCarteraView({ rows, kpis }: Props) {
  const [tab, setTab] = useState<TabId>('agenda');

  // ── Agenda state ──────────────────────────────────────────────────────────
  const [busquedaAgenda, setBusquedaAgenda] = useState('');
  const [vendedorAgenda, setVendedorAgenda] = useState('');
  const [prioridadAgenda, setPrioridadAgenda] = useState<FiltroPrioridad>('todos');
  const [paginaAgenda, setPaginaAgenda] = useState(1);

  // ── Cartera state ──────────────────────────────────────────────────────────
  const [busqueda, setBusqueda] = useState('');
  const [vendedorCartera, setVendedorCartera] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState<FiltroPrioridad>('todos');
  const [filtroGestion, setFiltroGestion] = useState<FiltroGestion>('todos');
  const [paginaCartera, setPaginaCartera] = useState(1);

  // ── Vendedores únicos ──────────────────────────────────────────────────────
  const vendedores = useMemo(() => {
    const set = new Set(rows.map((r) => r.vendedor_nombre).filter((v) => v && v !== '—'));
    return Array.from(set).sort();
  }, [rows]);

  // ── Handlers que resetean página al cambiar filtro ─────────────────────────
  const onBusquedaAgenda = (v: string) => {
    setBusquedaAgenda(v);
    setPaginaAgenda(1);
  };
  const onVendedorAgenda = (v: string) => {
    setVendedorAgenda(v);
    setPaginaAgenda(1);
  };
  const onPrioridadAgenda = (v: FiltroPrioridad) => {
    setPrioridadAgenda(v);
    setPaginaAgenda(1);
  };
  const onBusqueda = (v: string) => {
    setBusqueda(v);
    setPaginaCartera(1);
  };
  const onVendedorCartera = (v: string) => {
    setVendedorCartera(v);
    setPaginaCartera(1);
  };
  const onPrioridad = (v: FiltroPrioridad) => {
    setFiltroPrioridad(v);
    setPaginaCartera(1);
  };
  const onGestion = (v: FiltroGestion) => {
    setFiltroGestion(v);
    setPaginaCartera(1);
  };

  const onPageAgenda = (p: number) => {
    setPaginaAgenda(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const onPageCartera = (p: number) => {
    setPaginaCartera(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Agenda: cómputos ───────────────────────────────────────────────────────
  const agendaBase = useMemo(
    () =>
      rows.filter((r) => {
        if (!r.en_agenda) return false;
        if (busquedaAgenda) {
          const q = busquedaAgenda.toLowerCase();
          if (
            !r.cliente_nombre.toLowerCase().includes(q) &&
            !r.cliente_cod.toLowerCase().includes(q)
          )
            return false;
        }
        if (vendedorAgenda && r.vendedor_nombre !== vendedorAgenda) return false;
        return true;
      }),
    [rows, busquedaAgenda, vendedorAgenda],
  );

  const cuentaPriAgenda = useMemo(() => {
    const c: Record<Prioridad, number> = { critico: 0, urgente: 0, seguimiento: 0, rutina: 0 };
    agendaBase.filter((r) => !r.gestionado_hoy).forEach((r) => c[r.prioridad]++);
    return c;
  }, [agendaBase]);

  const agendaFiltrada = useMemo(() => {
    if (prioridadAgenda === 'todos') return agendaBase;
    return agendaBase.filter((r) => r.prioridad === prioridadAgenda);
  }, [agendaBase, prioridadAgenda]);

  const agendaActivosTodos = useMemo(
    () => agendaFiltrada.filter((r) => !r.gestionado_hoy),
    [agendaFiltrada],
  );
  const agendaHoy = useMemo(() => agendaFiltrada.filter((r) => r.gestionado_hoy), [agendaFiltrada]);

  const totalPaginasAgenda = Math.max(1, Math.ceil(agendaActivosTodos.length / ITEMS_PER_PAGE));
  const agendaActivosPag = useMemo(() => {
    const start = (paginaAgenda - 1) * ITEMS_PER_PAGE;
    return agendaActivosTodos.slice(start, start + ITEMS_PER_PAGE);
  }, [agendaActivosTodos, paginaAgenda]);

  // Solo cuenta pendientes (no gestionados hoy) — así el número baja durante el día
  const totalAgenda = useMemo(
    () => rows.filter((r) => r.en_agenda && !r.gestionado_hoy).length,
    [rows],
  );

  // ── Cartera completa: cómputos ─────────────────────────────────────────────
  const carteraBase = useMemo(() => {
    if (!vendedorCartera) return rows;
    return rows.filter((r) => r.vendedor_nombre === vendedorCartera);
  }, [rows, vendedorCartera]);

  const cuentaPriCartera = useMemo(() => {
    const c: Record<Prioridad, number> = { critico: 0, urgente: 0, seguimiento: 0, rutina: 0 };
    carteraBase.forEach((r) => c[r.prioridad]++);
    return c;
  }, [carteraBase]);

  const cuentaGes = useMemo(
    () => ({
      pendientes: carteraBase.filter((r) => !r.gestionado_hoy).length,
      hoy: carteraBase.filter((r) => r.gestionado_hoy).length,
    }),
    [carteraBase],
  );

  const rowsFiltradas = useMemo(
    () =>
      carteraBase.filter((r) => {
        if (busqueda) {
          const q = busqueda.toLowerCase();
          if (
            !r.cliente_nombre.toLowerCase().includes(q) &&
            !r.cliente_cod.toLowerCase().includes(q)
          )
            return false;
        }
        if (filtroPrioridad !== 'todos' && r.prioridad !== filtroPrioridad) return false;
        if (filtroGestion === 'pendientes' && r.gestionado_hoy) return false;
        if (filtroGestion === 'hoy' && !r.gestionado_hoy) return false;
        return true;
      }),
    [carteraBase, busqueda, filtroPrioridad, filtroGestion],
  );

  const totalPaginasCartera = Math.max(1, Math.ceil(rowsFiltradas.length / ITEMS_PER_PAGE));
  const rowsPaginadas = useMemo(() => {
    const start = (paginaCartera - 1) * ITEMS_PER_PAGE;
    return rowsFiltradas.slice(start, start + ITEMS_PER_PAGE);
  }, [rowsFiltradas, paginaCartera]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: '#f0f4f8', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">
        {/* ════════════════════════════════
            KPI CARDS
        ════════════════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Mi mora total"
            valor={fmtCRC(kpis.moraTotal)}
            sub={kpis.moraTotal > 0 ? 'en tu cartera' : 'Sin mora activa'}
            color={kpis.moraTotal > 0 ? '#dc2626' : '#15803d'}
            icon={<AlertTriangle size={14} />}
          />
          <KpiCard
            label="Recuperado este mes"
            valor={fmtCRC(kpis.recuperadoMes)}
            sub="promesas cumplidas"
            color="#15803d"
            icon={<TrendingUp size={14} />}
            muted={kpis.recuperadoMes === 0}
          />
          <KpiCard
            label="Promesas activas"
            valor={String(kpis.promesasActivas)}
            sub="clientes con promesa"
            color={kpis.promesasActivas > 0 ? '#ca8a04' : '#15803d'}
            icon={<Calendar size={14} />}
          />
          <KpiCard
            label="Sin gestión +7d"
            valor={String(kpis.sinGestion7d)}
            sub="clientes a contactar"
            color={kpis.sinGestion7d > 0 ? '#dc2626' : '#15803d'}
            icon={<Clock size={14} />}
          />
        </div>

        {/* ════════════════════════════════
            TABS
        ════════════════════════════════ */}
        <div className="flex gap-0.5 rounded-xl p-1 w-fit" style={{ backgroundColor: '#e2e8f0' }}>
          {[
            { id: 'agenda' as TabId, label: 'Agenda del Día', count: totalAgenda },
            { id: 'cartera' as TabId, label: 'Mi Cartera Completa', count: rows.length },
          ].map(({ id, label, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-all whitespace-nowrap"
              style={{
                backgroundColor: tab === id ? 'white' : 'transparent',
                color: tab === id ? '#1e293b' : '#94a3b8',
                boxShadow: tab === id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {label}
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                style={{
                  backgroundColor: tab === id ? '#009ee3' : '#cbd5e1',
                  color: 'white',
                  minWidth: '18px',
                  textAlign: 'center',
                }}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* ════════════════════════════════
            TAB: AGENDA DEL DÍA
        ════════════════════════════════ */}
        {tab === 'agenda' && (
          <AgendaTab
            activosPag={agendaActivosPag}
            totalActivos={agendaActivosTodos.length}
            hoyRows={agendaHoy}
            pagina={paginaAgenda}
            totalPaginas={totalPaginasAgenda}
            onPage={onPageAgenda}
            busqueda={busquedaAgenda}
            onBusqueda={onBusquedaAgenda}
            vendedor={vendedorAgenda}
            onVendedor={onVendedorAgenda}
            vendedores={vendedores}
            prioridad={prioridadAgenda}
            onPrioridad={onPrioridadAgenda}
            cuentaPri={cuentaPriAgenda}
            totalBase={agendaBase.filter((r) => !r.gestionado_hoy).length}
            totalRows={rows.length}
          />
        )}

        {/* ════════════════════════════════
            TAB: MI CARTERA COMPLETA
        ════════════════════════════════ */}
        {tab === 'cartera' && (
          <CarteraTab
            totalBase={carteraBase.length}
            rowsFiltradas={rowsFiltradas}
            rowsPaginadas={rowsPaginadas}
            pagina={paginaCartera}
            totalPaginas={totalPaginasCartera}
            onPage={onPageCartera}
            busqueda={busqueda}
            onBusqueda={onBusqueda}
            vendedor={vendedorCartera}
            onVendedor={onVendedorCartera}
            vendedores={vendedores}
            filtroPrioridad={filtroPrioridad}
            onFiltroPrioridad={onPrioridad}
            filtroGestion={filtroGestion}
            onFiltroGestion={onGestion}
            cuentaPri={cuentaPriCartera}
            cuentaGes={cuentaGes}
            totalRows={rows.length}
          />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BRIEFING BANNER — resumen del día + barra de progreso
// ══════════════════════════════════════════════════════════════════════════════
function BriefingBanner({
  gestionadosHoy,
  pendientes,
}: {
  gestionadosHoy: number;
  pendientes: number;
}) {
  const totalAgenda = gestionadosHoy + pendientes;
  const pct = totalAgenda > 0 ? Math.round((gestionadosHoy / totalAgenda) * 100) : 0;
  const fecha = fmtFechaHoy();
  const barColor = pct === 100 ? '#22c55e' : pct >= 50 ? '#009ee3' : '#f97316';

  return (
    <div
      className="rounded-xl border px-4 py-3 space-y-2"
      style={{ backgroundColor: 'white', borderColor: '#e2e8f0', borderWidth: '0.5px' }}
    >
      {/* Fila: fecha · progreso del día */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-bold text-gray-700">Agenda · {fecha}</span>
        <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: barColor }}>
          {pct === 100
            ? '¡Agenda completada! ✓'
            : gestionadosHoy > 0
              ? `${gestionadosHoy} de ${totalAgenda} gestionados`
              : `${pendientes} pendiente${pendientes !== 1 ? 's' : ''} hoy`}
        </span>
      </div>

      {/* Barra de progreso */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#f1f5f9' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: AGENDA DEL DÍA
// ══════════════════════════════════════════════════════════════════════════════
function AgendaTab({
  activosPag,
  totalActivos,
  hoyRows,
  pagina,
  totalPaginas,
  onPage,
  busqueda,
  onBusqueda,
  vendedor,
  onVendedor,
  vendedores,
  prioridad,
  onPrioridad,
  cuentaPri,
  totalBase,
  totalRows,
}: {
  activosPag: CarteraRow[];
  totalActivos: number;
  hoyRows: CarteraRow[];
  pagina: number;
  totalPaginas: number;
  onPage: (p: number) => void;
  busqueda: string;
  onBusqueda: (v: string) => void;
  vendedor: string;
  onVendedor: (v: string) => void;
  vendedores: string[];
  prioridad: FiltroPrioridad;
  onPrioridad: (v: FiltroPrioridad) => void;
  cuentaPri: Record<Prioridad, number>;
  totalBase: number;
  totalRows: number;
}) {
  const totalAgenda = totalActivos + hoyRows.length;

  if (totalRows === 0) {
    return (
      <EmptyState
        icon={<Target size={40} />}
        title="No hay clientes asignados a tu cartera"
        sub="Contactá al coordinador para revisar la asignación"
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Briefing del día ─────────────────────────────────────── */}
      <BriefingBanner gestionadosHoy={hoyRows.length} pendientes={totalActivos} />

      {/* ── Barra de filtros ──────────────────────────────────────── */}
      <div
        className="bg-white rounded-xl border shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center"
        style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
      >
        {/* Búsqueda */}
        <div className="relative" style={{ flex: '1 1 160px', minWidth: '140px' }}>
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            placeholder="Buscar cliente o código…"
            className="w-full rounded-lg border pl-8 pr-3 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-200 focus:border-blue-300 transition"
            style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
          />
        </div>

        {/* Vendedor */}
        <VendedorSelect value={vendedor} onChange={onVendedor} vendedores={vendedores} />

        {/* Separador visual */}
        <div
          className="hidden sm:block flex-shrink-0 self-stretch"
          style={{ width: '1px', backgroundColor: '#f1f5f9' }}
        />

        {/* Chips de prioridad */}
        <div className="flex gap-1.5 flex-wrap">
          {(['todos', 'critico', 'urgente', 'seguimiento', 'rutina'] as const).map((p) => {
            const cfg = p !== 'todos' ? PRIORIDAD_CFG[p] : null;
            const count = p === 'todos' ? totalBase : cuentaPri[p];
            const active = prioridad === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPrioridad(p)}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all whitespace-nowrap"
                style={{
                  backgroundColor: active ? (cfg?.bg ?? 'rgba(0,158,227,0.12)') : '#f1f5f9',
                  color: active ? (cfg?.text ?? '#009ee3') : '#94a3b8',
                  border: active
                    ? `1px solid ${cfg?.border ?? 'rgba(0,158,227,0.3)'}`
                    : '1px solid transparent',
                }}
              >
                {cfg && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cfg.dot }}
                  />
                )}
                {p === 'todos' ? 'Todos' : cfg!.label}
                <span className="ml-0.5 opacity-50">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Contenido ─────────────────────────────────────────────── */}
      {totalAgenda === 0 ? (
        totalBase === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={40} />}
            title="¡Agenda del día completada!"
            sub="No hay clientes que requieran gestión prioritaria hoy"
            success
          />
        ) : (
          <EmptyState
            icon={<Target size={40} />}
            title="Sin resultados para estos filtros"
            sub="Probá con otro vendedor o categoría de prioridad"
          />
        )
      ) : (
        <>
          {/* Cards pendientes — 2 columnas */}
          {activosPag.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {activosPag.map((row) => (
                <AgendaCard key={row.cliente_cod} row={row} />
              ))}
            </div>
          )}

          {/* Paginación */}
          <PaginationBar
            pagina={pagina}
            totalPaginas={totalPaginas}
            totalItems={totalActivos}
            onPage={onPage}
          />

          {/* Separador + gestionados hoy — 2 columnas */}
          {hoyRows.length > 0 && (
            <>
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 border-t border-dashed border-gray-200" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  ✓ Gestionados hoy ({hoyRows.length})
                </span>
                <div className="flex-1 border-t border-dashed border-gray-200" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {hoyRows.map((row) => (
                  <AgendaCard key={row.cliente_cod} row={row} gestionadoHoy />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Tarjeta de agenda — compacta para 2 columnas ───────────────────────────
function AgendaCard({ row, gestionadoHoy }: { row: CarteraRow; gestionadoHoy?: boolean }) {
  const priCfg = PRIORIDAD_CFG[row.prioridad];
  const tramoCfg = TRAMO_CFG[row.tramo_peor] ?? TRAMO_CFG['Al día'];
  const uc = labelContacto(row.dias_sin_gestion);

  return (
    <div
      className="bg-white rounded-xl border overflow-hidden flex transition-shadow hover:shadow-sm"
      style={{
        borderColor: gestionadoHoy ? '#e2e8f0' : priCfg.border,
        borderWidth: '0.5px',
        opacity: gestionadoHoy ? 0.5 : 1,
      }}
    >
      {/* Barra de color izquierda */}
      <div
        className="flex-shrink-0"
        style={{ width: '4px', backgroundColor: gestionadoHoy ? '#d1d5db' : priCfg.bar }}
      />

      {/* Contenido */}
      <div className="flex-1 px-3 py-3 min-w-0">
        {/* Fila 1: nombre + badge prioridad */}
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <span className="text-[13px] font-bold text-gray-800 leading-tight truncate">
            {row.cliente_nombre}
          </span>
          {gestionadoHoy ? (
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold flex-shrink-0"
              style={{
                backgroundColor: 'rgba(34,197,94,0.12)',
                color: '#15803d',
                border: '1px solid rgba(34,197,94,0.25)',
              }}
            >
              <CheckCircle2 size={9} /> Hoy
            </span>
          ) : (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold flex-shrink-0"
              style={{
                backgroundColor: priCfg.bg,
                color: priCfg.text,
                border: `1px solid ${priCfg.border}`,
              }}
            >
              {priCfg.label}
            </span>
          )}
        </div>

        {/* Fila 2: código + ICP badge */}
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[10px] text-gray-400 font-mono leading-none">{row.cliente_cod}</p>
          {row.icp_score !== null ? (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none"
              style={{
                color: icpColor(row.icp_score),
                background: `${icpColor(row.icp_score)}18`,
              }}
              title={`ICP ${row.icp_score}/100 — ${icpLabel(row.icp_score)}`}
            >
              ICP {row.icp_score}
            </span>
          ) : (
            <span className="text-[9px] text-gray-300 leading-none" title="Sin historial de pagos">
              Sin ICP
            </span>
          )}
        </div>

        {/* Fila 3: motivo (solo si pendiente) */}
        {!gestionadoHoy && row.motivo && (
          <div
            className="flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 mb-2.5"
            style={{ backgroundColor: priCfg.bg, borderLeft: `3px solid ${priCfg.bar}` }}
          >
            <Zap size={10} className="flex-shrink-0 mt-px" style={{ color: priCfg.bar }} />
            <span className="text-[11px] font-medium leading-tight" style={{ color: priCfg.text }}>
              {row.motivo}
            </span>
          </div>
        )}

        {/* Próxima acción programada (cuando ya fue gestionado hoy) */}
        {gestionadoHoy && row.proxima_accion_fecha && (
          <div
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 mb-2.5"
            style={{ backgroundColor: 'rgba(0,158,227,0.07)', borderLeft: '3px solid #009ee3' }}
          >
            <Calendar size={10} className="flex-shrink-0" style={{ color: '#009ee3' }} />
            <span className="text-[10px] font-semibold leading-tight" style={{ color: '#0369a1' }}>
              {fmtFechaCorta(row.proxima_accion_fecha)}
              {row.proxima_accion && row.proxima_accion !== 'sin_seguimiento' && (
                <span className="font-normal text-gray-400 ml-1">
                  · {PROXIMA_LABELS[row.proxima_accion] ?? row.proxima_accion}
                </span>
              )}
            </span>
          </div>
        )}

        {/* Fila 4: mora · tramo · contacto · [botón] */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {/* Mora */}
            <span
              className="text-[11px] font-semibold tabular-nums"
              style={{ color: row.mora_total > 0 ? '#1e293b' : '#d1d5db' }}
            >
              {row.mora_total > 0 ? fmtCRC(row.mora_total) : '—'}
            </span>
            <Divider />
            {/* Tramo */}
            <span
              className="inline-block text-[10px] font-semibold rounded px-1.5 py-0.5 whitespace-nowrap"
              style={{ backgroundColor: tramoCfg.bg, color: tramoCfg.text }}
            >
              {row.tramo_peor}
            </span>
            <Divider />
            {/* Último contacto */}
            <span
              className="text-[11px] font-semibold whitespace-nowrap"
              style={{ color: uc.color }}
            >
              {uc.label}
            </span>
            {/* Promesa */}
            {row.promesa_activa && row.promesa_fecha && (
              <>
                <Divider />
                <span
                  className="text-[10px] font-semibold whitespace-nowrap"
                  style={{ color: '#d97706' }}
                >
                  {fmtFechaCorta(row.promesa_fecha)}
                </span>
              </>
            )}
            {/* Pago reciente */}
            {row.pago_reciente && (
              <>
                <Divider />
                <span
                  className="text-[10px] font-bold whitespace-nowrap"
                  style={{ color: '#16a34a' }}
                >
                  Pagó {fmtCRC(row.pago_reciente.monto)} · hace {row.pago_reciente.dias}d
                </span>
              </>
            )}
          </div>

          {/* Botón gestionar (solo si pendiente) */}
          {!gestionadoHoy && (
            <Link
              href={`/clientes/${encodeURIComponent(row.cliente_cod)}?from=mi-cartera`}
              prefetch={false}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition hover:opacity-85 whitespace-nowrap flex-shrink-0"
              style={{ backgroundColor: '#009ee3', color: 'white' }}
            >
              Gestionar
              <ChevronRight size={10} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: MI CARTERA COMPLETA
// ══════════════════════════════════════════════════════════════════════════════
function CarteraTab({
  totalBase,
  rowsFiltradas,
  rowsPaginadas,
  pagina,
  totalPaginas,
  onPage,
  busqueda,
  onBusqueda,
  vendedor,
  onVendedor,
  vendedores,
  filtroPrioridad,
  onFiltroPrioridad,
  filtroGestion,
  onFiltroGestion,
  cuentaPri,
  cuentaGes,
  totalRows,
}: {
  totalBase: number;
  rowsFiltradas: CarteraRow[];
  rowsPaginadas: CarteraRow[];
  pagina: number;
  totalPaginas: number;
  onPage: (p: number) => void;
  busqueda: string;
  onBusqueda: (v: string) => void;
  vendedor: string;
  onVendedor: (v: string) => void;
  vendedores: string[];
  filtroPrioridad: FiltroPrioridad;
  onFiltroPrioridad: (v: FiltroPrioridad) => void;
  filtroGestion: FiltroGestion;
  onFiltroGestion: (v: FiltroGestion) => void;
  cuentaPri: Record<Prioridad, number>;
  cuentaGes: { pendientes: number; hoy: number };
  totalRows: number;
}) {
  return (
    <div className="space-y-3">
      {/* ── Barra de filtros ──────────────────────────────────────── */}
      <div
        className="bg-white rounded-xl border shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center"
        style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
      >
        {/* Búsqueda */}
        <div className="relative" style={{ flex: '1 1 160px', minWidth: '140px' }}>
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            placeholder="Buscar cliente o código…"
            className="w-full rounded-lg border pl-8 pr-3 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-200 focus:border-blue-300 transition"
            style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
          />
        </div>

        {/* Vendedor */}
        <VendedorSelect value={vendedor} onChange={onVendedor} vendedores={vendedores} />

        <div
          className="hidden sm:block flex-shrink-0 self-stretch"
          style={{ width: '1px', backgroundColor: '#f1f5f9' }}
        />

        {/* Pills de prioridad */}
        <div className="flex gap-1.5 flex-wrap">
          {(['todos', 'critico', 'urgente', 'seguimiento', 'rutina'] as const).map((p) => {
            const cfg = p !== 'todos' ? PRIORIDAD_CFG[p] : null;
            const count = p === 'todos' ? totalBase : cuentaPri[p];
            const active = filtroPrioridad === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onFiltroPrioridad(p)}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all whitespace-nowrap"
                style={{
                  backgroundColor: active ? (cfg?.bg ?? 'rgba(0,158,227,0.12)') : '#f1f5f9',
                  color: active ? (cfg?.text ?? '#009ee3') : '#94a3b8',
                  border: active
                    ? `1px solid ${cfg?.border ?? 'rgba(0,158,227,0.3)'}`
                    : '1px solid transparent',
                }}
              >
                {cfg && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cfg.dot }}
                  />
                )}
                {p === 'todos' ? 'Todos' : cfg!.label}
                <span className="ml-0.5 opacity-50">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Toggle gestión */}
        <div className="flex gap-0.5 rounded-lg p-0.5" style={{ backgroundColor: '#f1f5f9' }}>
          {[
            { val: 'todos' as FiltroGestion, label: 'Todos' },
            { val: 'pendientes' as FiltroGestion, label: `Pendientes (${cuentaGes.pendientes})` },
            { val: 'hoy' as FiltroGestion, label: `Gestionados hoy (${cuentaGes.hoy})` },
          ].map(({ val, label }) => (
            <button
              key={val}
              type="button"
              onClick={() => onFiltroGestion(val)}
              className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all whitespace-nowrap"
              style={{
                backgroundColor: filtroGestion === val ? 'white' : 'transparent',
                color: filtroGestion === val ? '#374151' : '#94a3b8',
                boxShadow: filtroGestion === val ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tabla ─────────────────────────────────────────────────── */}
      {rowsFiltradas.length === 0 ? (
        <EmptyState
          icon={<Target size={40} />}
          title={
            totalRows === 0
              ? 'No hay clientes asignados a tu cartera'
              : 'Sin resultados para estos filtros'
          }
          sub={
            totalRows === 0
              ? 'Contactá al coordinador para revisar la asignación'
              : 'Probá ampliando los criterios de búsqueda'
          }
        />
      ) : (
        <>
          <div
            className="bg-white rounded-xl border shadow-sm overflow-hidden"
            style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
          >
            {/* Sub-header */}
            <div
              className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between"
              style={{ backgroundColor: '#f8fafc' }}
            >
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                {rowsFiltradas.length} cliente{rowsFiltradas.length !== 1 ? 's' : ''}
              </span>
              <span className="text-[11px] text-gray-400 italic">Orden: urgencia → mora</span>
            </div>

            {/* Encabezados */}
            <div
              className="grid items-center px-4 py-2 border-b border-gray-100"
              style={{ gridTemplateColumns: GRID, gap: '10px', backgroundColor: '#f8fafc' }}
            >
              <div />
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Cliente
              </span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                Mora total
              </span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Tramo aging
              </span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-center">
                ICP
              </span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Último contacto
              </span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                Acción
              </span>
            </div>

            {/* Filas paginadas */}
            <div className="divide-y divide-gray-50">
              {rowsPaginadas.map((row) => {
                const priCfg = PRIORIDAD_CFG[row.prioridad];
                const tramoCfg = TRAMO_CFG[row.tramo_peor] ?? TRAMO_CFG['Al día'];
                const uc = labelContacto(row.dias_sin_gestion);

                return (
                  <div
                    key={row.cliente_cod}
                    className="grid items-center px-4 py-3 transition-colors hover:bg-slate-50/60"
                    style={{
                      gridTemplateColumns: GRID,
                      gap: '10px',
                      backgroundColor: row.gestionado_hoy ? '#f0fdf4' : undefined,
                      opacity: row.gestionado_hoy ? 0.7 : 1,
                    }}
                  >
                    <div className="flex items-center justify-center">
                      <div
                        className="rounded-full flex-shrink-0"
                        title={priCfg.label}
                        style={{ width: '8px', height: '8px', backgroundColor: priCfg.dot }}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[13px] font-semibold text-gray-800 truncate leading-tight">
                          {row.cliente_nombre}
                        </span>
                        {row.gestionado_hoy && (
                          <CheckCircle2
                            size={12}
                            className="flex-shrink-0"
                            style={{ color: '#22c55e' }}
                          />
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 font-mono">{row.cliente_cod}</span>
                    </div>
                    <div className="text-right">
                      <span
                        className="text-[12px] font-semibold tabular-nums"
                        style={{ color: row.mora_total > 0 ? '#1e293b' : '#d1d5db' }}
                      >
                        {row.mora_total > 0 ? fmtCRC(row.mora_total) : '—'}
                      </span>
                    </div>
                    <div>
                      <span
                        className="inline-block text-[11px] font-semibold rounded px-2 py-0.5 whitespace-nowrap"
                        style={{ backgroundColor: tramoCfg.bg, color: tramoCfg.text }}
                      >
                        {row.tramo_peor}
                      </span>
                    </div>
                    <div className="text-center">
                      {row.icp_score !== null ? (
                        <span
                          className="text-[12px] font-bold tabular-nums"
                          style={{ color: icpColor(row.icp_score) }}
                          title={`ICP ${row.icp_score}/100 — ${icpLabel(row.icp_score)}`}
                        >
                          {row.icp_score}
                        </span>
                      ) : (
                        <span
                          className="text-[12px] font-semibold"
                          style={{ color: '#d1d5db' }}
                          title="Sin historial de pagos"
                        >
                          —
                        </span>
                      )}
                    </div>
                    <div>
                      <span
                        className="text-[12px] font-semibold leading-tight"
                        style={{ color: uc.color }}
                      >
                        {uc.label}
                      </span>
                      {row.proxima_accion_fecha && !row.gestionado_hoy && (
                        <p className="text-[10px] mt-0.5 font-medium" style={{ color: '#009ee3' }}>
                          Próx: {fmtFechaCorta(row.proxima_accion_fecha)}
                        </p>
                      )}
                      {row.promesa_activa && row.promesa_fecha && (
                        <p className="text-[10px] mt-0.5 font-medium" style={{ color: '#d97706' }}>
                          Promesa: {fmtFechaCorta(row.promesa_fecha)}
                        </p>
                      )}
                      {row.pago_reciente && (
                        <p className="text-[10px] mt-0.5 font-bold" style={{ color: '#16a34a' }}>
                          Pagó {fmtCRC(row.pago_reciente.monto)} · hace {row.pago_reciente.dias}d
                        </p>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <Link
                        href={`/clientes/${encodeURIComponent(row.cliente_cod)}?from=mi-cartera`}
                        prefetch={false}
                        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold transition hover:opacity-85 whitespace-nowrap"
                        style={{ backgroundColor: '#009ee3', color: 'white' }}
                      >
                        Ver ficha
                        <ChevronRight size={10} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Paginación */}
          <PaginationBar
            pagina={pagina}
            totalPaginas={totalPaginas}
            totalItems={rowsFiltradas.length}
            onPage={onPage}
          />
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTES UTILITARIOS
// ══════════════════════════════════════════════════════════════════════════════

function VendedorSelect({
  value,
  onChange,
  vendedores,
}: {
  value: string;
  onChange: (v: string) => void;
  vendedores: string[];
}) {
  if (vendedores.length === 0) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border px-3 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-200 focus:border-blue-300 transition bg-white appearance-none cursor-pointer"
      style={{
        borderColor: '#e2e8f0',
        borderWidth: '0.5px',
        color: value ? '#374151' : '#94a3b8',
        minWidth: '160px',
        maxWidth: '220px',
      }}
    >
      <option value="">Todos los vendedores</option>
      {vendedores.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}

function PaginationBar({
  pagina,
  totalPaginas,
  totalItems,
  onPage,
}: {
  pagina: number;
  totalPaginas: number;
  totalItems: number;
  onPage: (p: number) => void;
}) {
  if (totalPaginas <= 1) return null;

  const inicio = (pagina - 1) * ITEMS_PER_PAGE + 1;
  const fin = Math.min(pagina * ITEMS_PER_PAGE, totalItems);
  const pageNums = getPageNums(pagina, totalPaginas);

  return (
    <div
      className="bg-white rounded-xl border flex items-center justify-between px-4 py-2.5"
      style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
    >
      <span className="text-[11px] text-gray-400 whitespace-nowrap">
        Mostrando {inicio}–{fin} de {totalItems} clientes
      </span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={pagina === 1}
          onClick={() => onPage(pagina - 1)}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition"
          style={{
            color: pagina === 1 ? '#d1d5db' : '#374151',
            cursor: pagina === 1 ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronLeft size={12} /> Anterior
        </button>

        {pageNums.map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1 text-[11px] text-gray-300 select-none">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p as number)}
              className="rounded-lg text-[11px] font-semibold transition"
              style={{
                width: '28px',
                height: '28px',
                backgroundColor: pagina === p ? '#009ee3' : 'transparent',
                color: pagina === p ? 'white' : '#374151',
              }}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          disabled={pagina === totalPaginas}
          onClick={() => onPage(pagina + 1)}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition"
          style={{
            color: pagina === totalPaginas ? '#d1d5db' : '#374151',
            cursor: pagina === totalPaginas ? 'not-allowed' : 'pointer',
          }}
        >
          Siguiente <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <span
      className="flex-shrink-0"
      style={{ width: '1px', height: '12px', backgroundColor: '#e2e8f0' }}
    />
  );
}

function EmptyState({
  icon,
  title,
  sub,
  success,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  success?: boolean;
}) {
  return (
    <div
      className="bg-white rounded-xl border shadow-sm px-6 py-14 flex flex-col items-center text-center"
      style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
    >
      <div className="mb-3" style={{ color: success ? '#22c55e' : '#e2e8f0' }}>
        {icon}
      </div>
      <p className="text-[14px] font-semibold text-gray-500 mb-1">{title}</p>
      <p className="text-[12px] text-gray-400">{sub}</p>
    </div>
  );
}

function KpiCard({
  label,
  valor,
  sub,
  color,
  icon,
  muted,
}: {
  label: string;
  valor: string;
  sub: string;
  color: string;
  icon: React.ReactNode;
  muted?: boolean;
}) {
  const displayColor = muted ? '#d1d5db' : color;
  return (
    <div
      className="bg-white rounded-xl border shadow-sm px-4 py-4 flex flex-col items-center text-center"
      style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
    >
      {/* Ícono + label centrados en la misma línea */}
      <div className="flex items-center gap-1.5 mb-2">
        <span style={{ color: displayColor }}>{icon}</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider leading-tight">
          {label}
        </span>
      </div>
      {/* Valor principal centrado */}
      <p
        className="text-[22px] font-bold tabular-nums leading-tight"
        style={{ color: displayColor }}
      >
        {valor}
      </p>
      {/* Sub-texto centrado */}
      <p className="text-[11px] text-gray-400 mt-1">{sub}</p>
    </div>
  );
}
