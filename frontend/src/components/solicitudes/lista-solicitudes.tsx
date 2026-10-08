'use client';

/**
 * ListaSolicitudes — Centro Operativo (cards + SLA)
 *
 * Rediseño: cards operativas con número SIC-XXXXX, badges de área /
 * prioridad / estado, contador visual de SLA y filtros. El detalle y
 * el cambio de estado viven en /solicitudes/[id].
 *
 * Solicitudes legacy (estado MAYÚSCULA, sin área/SLA) se muestran con
 * fallbacks y siguen siendo accesibles.
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, FileText, AlertTriangle } from 'lucide-react';
import type { Solicitud } from '@/types/database';
import { AREA_MAP, ESTADO_CFG, ESTADOS_OFICIALES, slaEstado } from '@/lib/solicitudes/catalogo';
import { esSoloLectura } from '@/lib/utils/roles';
import SolicitudCard from './SolicitudCard';

interface Props {
  solicitudes: Solicitud[];
  rol: 'COORDINADOR' | 'ANALISTA' | 'GERENCIA';
  userEmail: string;
  userName: string;
  coordId: string;
  solicitanteMap: Record<string, string>;
}

export default function ListaSolicitudes({ solicitudes: init, rol, solicitanteMap }: Props) {
  const soloLectura = esSoloLectura(rol);
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');
  const [fEstados, setFEstados] = useState<Set<string>>(new Set());
  const [fPrioridad, setFPrioridad] = useState('Todas');
  const [fArea, setFArea] = useState('Todas');
  const [soloVencido, setSoloVencido] = useState(false);

  const selectCls =
    'rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-700 bg-white focus:outline-none focus:border-[#009ee3] transition';

  function toggleEstado(e: string) {
    setFEstados((prev) => {
      const s = new Set(prev);
      s.has(e) ? s.delete(e) : s.add(e);
      return s;
    });
  }

  // ── Filtrado ──────────────────────────────────────────────────────
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return init.filter((s) => {
      if (fEstados.size > 0 && !fEstados.has(s.estado)) return false;
      if (fPrioridad !== 'Todas' && s.prioridad !== fPrioridad) return false;
      if (fArea !== 'Todas' && s.area !== fArea) return false;
      if (soloVencido) {
        const sla = slaEstado(s.created_at, s.sla_vencimiento);
        if (!sla.vencido) return false;
      }
      if (q) {
        const hay =
          (s.cliente_nombre ?? '').toLowerCase().includes(q) ||
          (s.cliente_cod ?? '').toLowerCase().includes(q) ||
          (s.tipo ?? '').toLowerCase().includes(q);
        if (!hay) return false;
      }
      return true;
    });
  }, [init, busqueda, fEstados, fPrioridad, fArea, soloVencido]);

  // Áreas presentes (para el filtro)
  const areasDisponibles = useMemo(
    () => Array.from(new Set(init.map((s) => s.area).filter(Boolean))) as string[],
    [init],
  );

  return (
    <div className="p-5 space-y-4">
      {/* Barra de acción (el título lo muestra el topbar) */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-gray-400 font-semibold">
          {filtradas.length} de {init.length}
        </span>
        {!soloLectura && (
          <button
            onClick={() => router.push('/solicitudes/nueva')}
            className="ml-auto flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold text-white transition hover:opacity-90"
            style={{ backgroundColor: '#009ee3' }}
          >
            <Plus size={14} /> Nueva solicitud
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente, código o tipo…"
              className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:border-[#009ee3] transition"
            />
          </div>
          <select
            value={fPrioridad}
            onChange={(e) => setFPrioridad(e.target.value)}
            className={selectCls}
          >
            <option value="Todas">Toda prioridad</option>
            {['Alta', 'Media', 'Baja'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select value={fArea} onChange={(e) => setFArea(e.target.value)} className={selectCls}>
            <option value="Todas">Toda área</option>
            {areasDisponibles.map((a) => (
              <option key={a} value={a}>
                {AREA_MAP[a as keyof typeof AREA_MAP]?.label ?? a}
              </option>
            ))}
          </select>
          <button
            onClick={() => setSoloVencido((v) => !v)}
            className="rounded-full px-3 py-1.5 text-[11px] font-bold transition flex items-center gap-1"
            style={
              soloVencido
                ? { backgroundColor: '#dc2626', color: '#fff' }
                : { backgroundColor: '#fee2e2', color: '#dc2626' }
            }
          >
            <AlertTriangle size={11} /> SLA vencido
          </button>
        </div>
        {/* Estados multi-select */}
        <div className="flex flex-wrap items-center gap-1.5">
          {ESTADOS_OFICIALES.map((e) => {
            const on = fEstados.has(e);
            const c = ESTADO_CFG[e];
            return (
              <button
                key={e}
                onClick={() => toggleEstado(e)}
                className="rounded-full px-2.5 py-1 text-[11px] font-bold transition border"
                style={
                  on
                    ? { backgroundColor: c.text, color: '#fff', borderColor: c.text }
                    : { backgroundColor: c.bg, color: c.text, borderColor: 'transparent' }
                }
              >
                {e}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-16 text-center">
          <FileText size={36} className="text-gray-200 mb-3" />
          <p className="text-[13px] font-semibold text-gray-500">
            Sin solicitudes para este filtro
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filtradas.map((s) => (
            <SolicitudCard
              key={s.id}
              solicitud={s}
              solicitanteNombre={s.solicitante_id ? (solicitanteMap[s.solicitante_id] ?? '—') : '—'}
              onClick={() => router.push(`/solicitudes/${s.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
