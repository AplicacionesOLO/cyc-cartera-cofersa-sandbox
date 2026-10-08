'use client';

/**
 * MÓDULO PROMESAS — CENTRO DE SEGUIMIENTO OPERATIVO
 *
 * NO es un formulario de creación. Las promesas nacen ÚNICAMENTE desde
 * Gestiones (resultado "Compromiso de pago confirmado").
 *
 * Este módulo: visualiza, da seguimiento, valida cumplimiento,
 * marca estados, controla incumplimientos y reprograma.
 */

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Coins,
  CalendarClock,
  CalendarDays,
  Search,
  User,
  ArrowRight,
  FileText,
  History,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  Handshake,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { fmtCRC } from '@/lib/utils/formato';
import { esSoloLectura } from '@/lib/utils/roles';
import { hoyISO_CR, fmtFechaCR } from '@/lib/utils/timezone';
import type { Promesa, EventoPromesa } from '@/types/database';
import type { GestionOrigen } from '@/views/promesas/types';
import { useAccionPromesaController } from '@/views/promesas/hooks/use-accion-promesa-controller';

// ── Props ──────────────────────────────────────────────────────────────
interface Props {
  promesas: Promesa[];
  gestionesMap: Record<string, GestionOrigen>;
  rol: 'COORDINADOR' | 'ANALISTA' | 'GERENCIA';
  userEmail: string;
  analistas: { email: string; nombre: string }[];
}

// ── Diferencia de días entre fecha_promesa y hoy (CR) ──────────────────
function diffDias(fechaPromesa: string, hoy: string): number {
  const a = new Date(fechaPromesa + 'T00:00:00');
  const b = new Date(hoy + 'T00:00:00');
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

// ── Estado visual derivado (urgencia) ──────────────────────────────────
type Visual = {
  key: string;
  label: string;
  bg: string;
  text: string;
  icon: React.ReactNode;
};

function visualEstado(p: Promesa, hoy: string): Visual {
  if (p.estado === 'CUMPLIDA')
    return {
      key: 'CUMPLIDA',
      label: 'Cumplida',
      bg: '#dcfce7',
      text: '#15803d',
      icon: <CheckCircle2 size={12} />,
    };
  if (p.estado === 'INCUMPLIDA')
    return {
      key: 'INCUMPLIDA',
      label: 'Incumplida',
      bg: '#fee2e2',
      text: '#dc2626',
      icon: <XCircle size={12} />,
    };
  if (p.estado === 'ABONO_PARCIAL')
    return {
      key: 'ABONO_PARCIAL',
      label: 'Abono parcial',
      bg: '#e0f2fe',
      text: '#0369a1',
      icon: <Coins size={12} />,
    };
  if (p.estado === 'REPROGRAMADA')
    return {
      key: 'REPROGRAMADA',
      label: 'Reprogramada',
      bg: '#ede9fe',
      text: '#6d28d9',
      icon: <RefreshCw size={12} />,
    };

  // PENDIENTE → urgencia por fecha
  const d = diffDias(p.fecha_promesa, hoy);
  if (d < 0) {
    const critica = d <= -8;
    return {
      key: 'VENCIDA',
      label: critica ? `Crítica · ${Math.abs(d)}d vencida` : `Vencida · ${Math.abs(d)}d`,
      bg: critica ? '#fecaca' : '#fee2e2',
      text: critica ? '#991b1b' : '#dc2626',
      icon: <XCircle size={12} />,
    };
  }
  if (d === 0)
    return {
      key: 'VENCE_HOY',
      label: 'Vence hoy',
      bg: '#ffedd5',
      text: '#c2410c',
      icon: <CalendarClock size={12} />,
    };
  if (d === 1)
    return {
      key: 'VENCE_MANANA',
      label: 'Vence mañana',
      bg: '#fef9c3',
      text: '#a16207',
      icon: <CalendarDays size={12} />,
    };
  return {
    key: 'PENDIENTE',
    label: `Pendiente · faltan ${d}d`,
    bg: '#fef9c3',
    text: '#a16207',
    icon: <Clock size={12} />,
  };
}

// ── KPI cards definición ───────────────────────────────────────────────
const KPIS = [
  { key: 'PENDIENTE', label: 'Pendientes', color: '#a16207' },
  { key: 'VENCE_HOY', label: 'Vencen hoy', color: '#c2410c' },
  { key: 'VENCE_MANANA', label: 'Vencen mañana', color: '#a16207' },
  { key: 'ABONO_PARCIAL', label: 'Abono parcial', color: '#0369a1' },
  { key: 'CUMPLIDA', label: 'Cumplidas', color: '#15803d' },
  { key: 'INCUMPLIDA', label: 'Incumplidas', color: '#dc2626' },
] as const;

const ESTADOS_FILTRO = [
  'Todos',
  'PENDIENTE',
  'VENCIDA',
  'VENCE_HOY',
  'VENCE_MANANA',
  'ABONO_PARCIAL',
  'CUMPLIDA',
  'INCUMPLIDA',
  'REPROGRAMADA',
];
const ESTADO_LABEL: Record<string, string> = {
  Todos: 'Todos los estados',
  PENDIENTE: 'Pendientes',
  VENCIDA: 'Vencidas',
  VENCE_HOY: 'Vencen hoy',
  VENCE_MANANA: 'Vencen mañana',
  ABONO_PARCIAL: 'Abono parcial',
  CUMPLIDA: 'Cumplidas',
  INCUMPLIDA: 'Incumplidas',
  REPROGRAMADA: 'Reprogramadas',
};

// ══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════
export default function TablaPromesas({ promesas: initial, gestionesMap, rol, analistas }: Props) {
  const router = useRouter();
  const hoy = hoyISO_CR();

  const [promesas, setPromesas] = useState<Promesa[]>(initial);
  const [estadoF, setEstadoF] = useState('Todos');
  const [anaF, setAnaF] = useState('Todos');
  const [quick, setQuick] = useState<'todas' | 'hoy' | 'semana' | 'vencidas'>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState<{
    tipo: 'cumplir' | 'incumplir' | 'abono' | 'reprogramar';
    promesa: Promesa;
  } | null>(null);
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  const PROMESAS_POR_PAGINA = 12;
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [estadoF, anaF, quick, busqueda]);

  const selectCls =
    'rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-700 bg-white focus:outline-none focus:border-[#009ee3] transition';

  // ── KPI counts + montos ───────────────────────────────────────────
  const kpis = useMemo(() => {
    const acc: Record<string, { n: number; monto: number }> = {};
    for (const k of KPIS) acc[k.key] = { n: 0, monto: 0 };
    for (const p of promesas) {
      const v = visualEstado(p, hoy);
      // Pendientes agrupa PENDIENTE + VENCIDA + VENCE_HOY + VENCE_MANANA
      if (['PENDIENTE', 'VENCIDA', 'VENCE_HOY', 'VENCE_MANANA'].includes(v.key)) {
        acc.PENDIENTE.n++;
        acc.PENDIENTE.monto += p.monto || 0;
      }
      if (acc[v.key]) {
        acc[v.key].n++;
        acc[v.key].monto += p.monto || 0;
      }
    }
    return acc;
  }, [promesas, hoy]);

  // ── Filtrado ──────────────────────────────────────────────────────
  const filtradas = useMemo(() => {
    let list = [...promesas];

    // Vista por defecto: excluir estados cerrados (CUMPLIDA, INCUMPLIDA,
    // REPROGRAMADA). Aparecen solo al hacer clic en su KPI o elegirlos
    // en el selector de estado.
    if (estadoF === 'Todos' && quick === 'todas') {
      list = list.filter((p) => !['CUMPLIDA', 'INCUMPLIDA', 'REPROGRAMADA'].includes(p.estado));
    }

    if (estadoF !== 'Todos') {
      list = list.filter((p) => {
        const v = visualEstado(p, hoy).key;
        if (estadoF === 'PENDIENTE')
          return ['PENDIENTE', 'VENCIDA', 'VENCE_HOY', 'VENCE_MANANA'].includes(v);
        return v === estadoF;
      });
    }
    if (anaF !== 'Todos') list = list.filter((p) => p.analista_email === anaF);

    if (quick === 'hoy')
      list = list.filter((p) => p.estado === 'PENDIENTE' && diffDias(p.fecha_promesa, hoy) === 0);
    if (quick === 'semana')
      list = list.filter(
        (p) =>
          p.estado === 'PENDIENTE' &&
          diffDias(p.fecha_promesa, hoy) >= 0 &&
          diffDias(p.fecha_promesa, hoy) <= 7,
      );
    if (quick === 'vencidas')
      list = list.filter((p) => p.estado === 'PENDIENTE' && diffDias(p.fecha_promesa, hoy) < 0);

    const q = busqueda.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.cliente_cod.toLowerCase().includes(q) ||
          (p.cliente_nombre ?? '').toLowerCase().includes(q) ||
          (p.contribuyente ?? '').toLowerCase().includes(q) ||
          (p.notas ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [promesas, estadoF, anaF, quick, busqueda, hoy]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PROMESAS_POR_PAGINA));
  const pagina = Math.min(page, totalPaginas);
  const visibles = filtradas.slice(
    (pagina - 1) * PROMESAS_POR_PAGINA,
    pagina * PROMESAS_POR_PAGINA,
  );

  // ── Optimistic patch tras mutación ────────────────────────────────
  function aplicarLocal(id: string, cambios: Partial<Promesa>) {
    setPromesas((prev) => prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)));
  }

  function toggleExp(id: string) {
    setExpandido((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  return (
    <div className="p-5 space-y-4">
      {/* Contador (el título lo muestra el topbar) */}
      <div className="flex items-center">
        <span className="ml-auto text-[12px] text-gray-400 font-semibold">
          {filtradas.length} de {promesas.length}
        </span>
      </div>

      {/* ── KPI cards (6) ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPIS.map((k) => {
          const activo = estadoF === k.key;
          const d = kpis[k.key];
          return (
            <button
              key={k.key}
              onClick={() => {
                setEstadoF(activo ? 'Todos' : k.key);
                setQuick('todas');
              }}
              className="bg-white rounded-xl border shadow-sm px-3 py-3 text-left transition hover:shadow-md"
              style={{ borderColor: activo ? k.color : '#e2e8f0' }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-wider mb-1 truncate"
                style={{ color: k.color }}
              >
                {k.label}
              </p>
              <p className="text-[20px] font-bold text-gray-800 leading-none">{d.n}</p>
              <p className="text-[11px] font-semibold text-gray-400 mt-1 tabular-nums truncate">
                {fmtCRC(d.monto)}
              </p>
            </button>
          );
        })}
      </div>

      {/* ── Filtros ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
        {/* Buscador */}
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente, código u observación…"
            className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:border-[#009ee3] transition"
          />
        </div>

        <select
          value={estadoF}
          onChange={(e) => {
            setEstadoF(e.target.value);
            setQuick('todas');
          }}
          className={selectCls}
        >
          {ESTADOS_FILTRO.map((e) => (
            <option key={e} value={e}>
              {ESTADO_LABEL[e] ?? e}
            </option>
          ))}
        </select>

        {rol === 'COORDINADOR' && (
          <select value={anaF} onChange={(e) => setAnaF(e.target.value)} className={selectCls}>
            <option value="Todos">Todos los analistas</option>
            {analistas.map((a) => (
              <option key={a.email} value={a.email}>
                {a.nombre}
              </option>
            ))}
          </select>
        )}

        {/* Quick chips */}
        <div className="flex items-center gap-1.5">
          {(
            [
              ['todas', 'Todas'],
              ['hoy', 'Solo hoy'],
              ['semana', 'Esta semana'],
              ['vencidas', 'Vencidas'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setQuick(key);
                setEstadoF('Todos');
              }}
              className="rounded-full px-3 py-1 text-[11px] font-bold transition"
              style={
                quick === key
                  ? { backgroundColor: '#003B5C', color: '#fff' }
                  : { backgroundColor: '#f1f5f9', color: '#64748b' }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Listado de cards ──────────────────────────────────────── */}
      {filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-16 text-center">
          <Handshake size={36} className="text-gray-200 mb-3" />
          <p className="text-[13px] font-semibold text-gray-500">Sin promesas para este filtro</p>
          <p className="text-[11px] text-gray-400 mt-1">
            Las promesas se crean desde Gestiones (Compromiso de pago confirmado)
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {visibles.map((p) => (
              <PromesaCard
                key={p.id}
                p={p}
                hoy={hoy}
                rol={rol}
                gestion={p.gestion_id ? gestionesMap[p.gestion_id] : undefined}
                expandido={expandido.has(p.id)}
                onToggleExp={() => toggleExp(p.id)}
                onVerCliente={() => router.push(`/clientes/${encodeURIComponent(p.cliente_cod)}`)}
                onAccion={(tipo) => setModal({ tipo, promesa: p })}
              />
            ))}
          </div>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagina === 1}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 bg-white transition disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft size={13} /> Anterior
              </button>
              <span className="text-[12px] text-gray-500 font-semibold tabular-nums">
                Página {pagina} de {totalPaginas}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 bg-white transition disabled:opacity-40 hover:bg-gray-50"
              >
                Siguiente <ChevronRight size={13} />
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Modal de acción ───────────────────────────────────────── */}
      {modal && (
        <ModalAccion
          tipo={modal.tipo}
          promesa={modal.promesa}
          hoy={hoy}
          onClose={() => setModal(null)}
          onDone={(cambios) => {
            if (modal.tipo === 'reprogramar') {
              router.refresh(); // nueva promesa + original REPROGRAMADA
            } else if (cambios) {
              aplicarLocal(modal.promesa.id, cambios);
              router.refresh(); // sync eventos / validación
            }
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CARD DE PROMESA
// ══════════════════════════════════════════════════════════════════════
function PromesaCard({
  p,
  hoy,
  rol,
  gestion,
  expandido,
  onToggleExp,
  onVerCliente,
  onAccion,
}: {
  p: Promesa;
  hoy: string;
  rol: 'COORDINADOR' | 'ANALISTA' | 'GERENCIA';
  gestion?: GestionOrigen;
  expandido: boolean;
  onToggleExp: () => void;
  onVerCliente: () => void;
  onAccion: (tipo: 'cumplir' | 'incumplir' | 'abono' | 'reprogramar') => void;
}) {
  const v = visualEstado(p, hoy);
  const d = diffDias(p.fecha_promesa, hoy);
  const cerrada =
    ['CUMPLIDA', 'INCUMPLIDA', 'REPROGRAMADA'].includes(p.estado) || esSoloLectura(rol);
  const eventos: EventoPromesa[] = Array.isArray(p.eventos) ? p.eventos : [];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div
        className="px-4 py-3 border-b border-gray-50 flex items-start justify-between gap-3"
        style={{ backgroundColor: '#fafbfc' }}
      >
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-gray-800 truncate">
            {p.cliente_nombre || p.contribuyente || p.cliente_cod}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            <span className="font-semibold text-gray-500">{p.cliente_cod}</span>
            {rol === 'COORDINADOR' && p.analista_email && (
              <>
                {' '}
                · <User size={9} className="inline -mt-0.5" /> {p.analista_email.split('@')[0]}
              </>
            )}
          </p>
        </div>
        <span
          className="flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-1 flex-shrink-0 whitespace-nowrap"
          style={{ backgroundColor: v.bg, color: v.text }}
        >
          {v.icon} {v.label}
        </span>
      </div>

      {/* ── CUERPO ──────────────────────────────────────────────── */}
      <div className="px-4 py-3 flex-1 space-y-2.5">
        {/* Monto + fechas */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Monto promesa
            </p>
            <p className="text-[20px] font-black text-gray-800 tabular-nums leading-tight">
              {fmtCRC(p.monto)}
            </p>
            {p.estado === 'ABONO_PARCIAL' && p.monto_abono_parcial != null && (
              <p className="text-[11px] font-semibold text-[#0369a1] mt-0.5">
                Abonado: {fmtCRC(p.monto_abono_parcial)} · Saldo:{' '}
                {fmtCRC(p.monto - p.monto_abono_parcial)}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400">Creada {fmtFechaCR(p.fecha_creacion)}</p>
            <p className="text-[12px] font-bold" style={{ color: v.text }}>
              Compromiso: {fmtFechaCR(p.fecha_promesa)}
            </p>
            {p.estado === 'PENDIENTE' && (
              <p className="text-[10px] font-semibold" style={{ color: v.text }}>
                {d < 0
                  ? `${Math.abs(d)} días de atraso`
                  : d === 0
                    ? 'Vence hoy'
                    : `Faltan ${d} días`}
              </p>
            )}
          </div>
        </div>

        {/* Gestión origen */}
        {gestion && (
          <div
            className="rounded-lg px-3 py-2"
            style={{ backgroundColor: '#f8fafc', border: '1px solid #eef2f7' }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
              <FileText size={10} /> Gestión origen · {gestion.tipo}
            </p>
            <p className="text-[12px] font-semibold text-gray-700 mt-0.5">{gestion.resultado}</p>
            {(gestion.nota || p.notas) && (
              <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
                {gestion.nota || p.notas}
              </p>
            )}
          </div>
        )}
        {!gestion && p.notas && (
          <p className="text-[11px] text-gray-500 italic line-clamp-2">{p.notas}</p>
        )}

        {/* Validación (si cerrada) */}
        {cerrada && (p.comentario_validacion || p.fecha_validacion) && (
          <div
            className="rounded-lg px-3 py-2 text-[11px]"
            style={{ backgroundColor: v.bg + '55' }}
          >
            {p.fecha_validacion && (
              <span className="font-bold" style={{ color: v.text }}>
                {fmtFechaCR(p.fecha_validacion)}
              </span>
            )}
            {p.validado_por && (
              <span className="text-gray-500"> · {p.validado_por.split('@')[0]}</span>
            )}
            {p.comentario_validacion && (
              <p className="text-gray-600 mt-0.5">{p.comentario_validacion}</p>
            )}
          </div>
        )}

        {/* Mini-timeline */}
        {eventos.length > 0 && (
          <div>
            <button
              onClick={onToggleExp}
              className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700 transition"
            >
              <History size={11} /> Historial ({eventos.length})
              {expandido ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            {expandido && (
              <ul className="mt-2 space-y-1.5 border-l-2 border-gray-100 pl-3">
                {eventos.map((ev, i) => (
                  <li key={i} className="text-[11px]">
                    <span className="font-bold text-gray-600">{fmtFechaCR(ev.fecha)}</span>
                    <span className="text-gray-500"> — {ev.descripcion}</span>
                    {ev.por && <span className="text-gray-300"> · {ev.por.split('@')[0]}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ── ACCIONES ────────────────────────────────────────────── */}
      <div
        className="px-4 py-2.5 border-t border-gray-50 flex flex-wrap items-center gap-1.5"
        style={{ backgroundColor: '#fafbfc' }}
      >
        <button
          onClick={onVerCliente}
          className="flex items-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1.5 transition hover:opacity-80"
          style={{ backgroundColor: '#eef2f7', color: '#475569' }}
        >
          <ExternalLink size={11} /> Ver ficha
        </button>

        {!cerrada && (
          <>
            <div className="w-px h-5 bg-gray-200 mx-0.5" />
            <button
              onClick={() => onAccion('cumplir')}
              className="flex items-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1.5 transition hover:opacity-80"
              style={{ backgroundColor: '#dcfce7', color: '#15803d' }}
            >
              <CheckCircle2 size={11} /> Cumplida
            </button>
            <button
              onClick={() => onAccion('abono')}
              className="flex items-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1.5 transition hover:opacity-80"
              style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}
            >
              <Coins size={11} /> Abono
            </button>
            <button
              onClick={() => onAccion('incumplir')}
              className="flex items-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1.5 transition hover:opacity-80"
              style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
            >
              <XCircle size={11} /> Incumplida
            </button>
            <button
              onClick={() => onAccion('reprogramar')}
              className="flex items-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1.5 transition hover:opacity-80"
              style={{ backgroundColor: '#ede9fe', color: '#6d28d9' }}
            >
              <RefreshCw size={11} /> Reprogramar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MODAL DE ACCIÓN (cumplir | incumplir | abono | reprogramar)
// ══════════════════════════════════════════════════════════════════════
function ModalAccion({
  tipo,
  promesa,
  hoy,
  onClose,
  onDone,
}: {
  tipo: 'cumplir' | 'incumplir' | 'abono' | 'reprogramar';
  promesa: Promesa;
  hoy: string;
  onClose: () => void;
  onDone: (cambios: Partial<Promesa> | null) => void;
}) {
  const [comentario, setComentario] = useState('');
  const [montoAbono, setMontoAbono] = useState('');
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [nuevoMonto, setNuevoMonto] = useState(String(Math.round(promesa.monto)));
  const { loading, setLoading, error, setError, validar, reprogramar } =
    useAccionPromesaController();

  const CFG = {
    cumplir: { titulo: 'Marcar como cumplida', color: '#15803d', btn: 'Confirmar cumplimiento' },
    incumplir: {
      titulo: 'Marcar como incumplida',
      color: '#dc2626',
      btn: 'Confirmar incumplimiento',
    },
    abono: { titulo: 'Registrar abono parcial', color: '#0369a1', btn: 'Registrar abono' },
    reprogramar: {
      titulo: 'Reprogramar promesa',
      color: '#6d28d9',
      btn: 'Crear promesa reprogramada',
    },
  }[tipo];

  const inputCls =
    'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-[#009ee3] focus:ring-2 focus:ring-blue-50 transition';
  const labelCls = 'block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider';

  function parseNum(s: string): number {
    return parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // ── Validaciones cliente ────────────────────────────────────────
    if (tipo === 'incumplir' && !comentario.trim())
      return setError('El motivo del incumplimiento es obligatorio');
    if (tipo === 'abono') {
      const m = parseNum(montoAbono);
      if (m <= 0) return setError('Ingrese el monto del abono');
      if (m >= promesa.monto)
        return setError('El abono debe ser menor al monto total (si cubre todo, use "Cumplida")');
      if (!comentario.trim()) return setError('El comentario es obligatorio en abonos parciales');
    }
    if (tipo === 'reprogramar') {
      if (!nuevaFecha) return setError('Ingrese la nueva fecha');
      if (nuevaFecha < hoy) return setError('La nueva fecha no puede ser en el pasado');
      if (parseNum(nuevoMonto) <= 0) return setError('Ingrese el nuevo monto');
      if (!comentario.trim()) return setError('El motivo de reprogramación es obligatorio');
    }

    setLoading(true);
    try {
      if (tipo === 'reprogramar') {
        const ok = await reprogramar({
          id: promesa.id,
          nueva_fecha: nuevaFecha,
          nuevo_monto: parseNum(nuevoMonto),
          motivo: comentario.trim(),
        });
        if (!ok) return;
        onDone(null);
        return;
      }

      const estado =
        tipo === 'cumplir' ? 'CUMPLIDA' : tipo === 'incumplir' ? 'INCUMPLIDA' : 'ABONO_PARCIAL';

      const ok = await validar({
        id: promesa.id,
        estado,
        comentario: comentario.trim() || undefined,
        ...(tipo === 'abono' ? { monto_abono_parcial: parseNum(montoAbono) } : {}),
      });
      if (!ok) return;

      const cambios: Partial<Promesa> = {
        estado: estado as Promesa['estado'],
        fecha_validacion: hoy,
        comentario_validacion: comentario.trim() || null,
      };
      if (tipo === 'abono') cambios.monto_abono_parcial = parseNum(montoAbono);
      onDone(cambios);
    } catch {
      setError('Error de conexión. Intente de nuevo.');
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full" style={{ maxWidth: '440px' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: CFG.color }}>
              {CFG.titulo}
            </h2>
            <p className="text-[12px] text-gray-400 mt-0.5 truncate">
              {promesa.cliente_nombre || promesa.cliente_cod} · {fmtCRC(promesa.monto)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 transition text-gray-400 flex items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={confirmar} className="p-5 space-y-3">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700 font-semibold">
              {error}
            </div>
          )}

          {tipo === 'abono' && (
            <div>
              <label className={labelCls}>Monto recibido (₡) *</label>
              <input
                type="text"
                value={montoAbono}
                autoFocus
                onChange={(e) => setMontoAbono(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="Ej: 150000"
                className={inputCls}
              />
              {parseNum(montoAbono) > 0 && parseNum(montoAbono) < promesa.monto && (
                <p className="text-[11px] text-[#0369a1] mt-1 font-semibold">
                  Saldo pendiente: {fmtCRC(promesa.monto - parseNum(montoAbono))}
                </p>
              )}
            </div>
          )}

          {tipo === 'reprogramar' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Nueva fecha *</label>
                  <input
                    type="date"
                    value={nuevaFecha}
                    min={hoy}
                    onChange={(e) => setNuevaFecha(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Nuevo monto (₡) *</label>
                  <input
                    type="text"
                    value={nuevoMonto}
                    onChange={(e) => setNuevoMonto(e.target.value.replace(/[^0-9.]/g, ''))}
                    className={inputCls}
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-400">
                La promesa original quedará marcada como <strong>REPROGRAMADA</strong> y se creará
                una nueva promesa vinculada (trazabilidad histórica).
              </p>
            </>
          )}

          <div>
            <label className={labelCls}>
              {tipo === 'cumplir'
                ? 'Comentario (opcional)'
                : tipo === 'incumplir'
                  ? 'Motivo del incumplimiento *'
                  : tipo === 'abono'
                    ? 'Comentario *'
                    : 'Motivo de reprogramación *'}
            </label>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={3}
              autoFocus={tipo !== 'abono'}
              placeholder={
                tipo === 'cumplir'
                  ? 'Validado contra transferencia / estado de cuenta…'
                  : 'Detalle el motivo…'
              }
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white transition disabled:opacity-60 hover:opacity-90 flex items-center justify-center gap-1.5"
              style={{ backgroundColor: CFG.color }}
            >
              {loading ? (
                'Guardando…'
              ) : (
                <>
                  {CFG.btn} <ArrowRight size={13} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
