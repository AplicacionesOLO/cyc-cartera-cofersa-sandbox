'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw,
  Zap,
  CheckCircle2,
  MinusCircle,
  XCircle,
  Bell,
  ServerCog,
  ChevronDown,
} from 'lucide-react';
import type { EventoActividad } from './TabAutomatizaciones';

interface Props {
  eventos: EventoActividad[];
  onRefresh: () => void;
  refreshing: boolean;
}

// Duplicado a propósito (no exportado en su archivo de origen, TabSincronizacion.tsx)
function hoyCR(): string {
  return new Date(Date.now() - 6 * 3600_000).toISOString().split('T')[0];
}
function fmtDayCR(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 3600_000).toISOString().split('T')[0];
  const hoy = hoyCR();
  const ayer = new Date(new Date(hoy).getTime() - 86_400_000).toISOString().split('T')[0];
  if (d === hoy) return 'HOY';
  if (d === ayer) return 'AYER';
  return new Date(iso).toLocaleDateString('es-CR', {
    timeZone: 'America/Costa_Rica',
    day: '2-digit',
    month: 'long',
  });
}
function fmtHoraCR(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CR', {
    timeZone: 'America/Costa_Rica',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function iconoConciliacion(titulo: string) {
  if (titulo.startsWith('Promesa cumplida')) return { Icon: CheckCircle2, color: '#16a34a' };
  if (titulo.startsWith('Abono parcial')) return { Icon: MinusCircle, color: '#d97706' };
  return { Icon: XCircle, color: '#dc2626' };
}

function iconoEvento(e: EventoActividad) {
  if (e.regla_id === 'conciliacion_promesas') return iconoConciliacion(e.titulo);
  if (e.regla_id === 'sync_salud') return { Icon: ServerCog, color: '#0369a1' };
  if (e.regla_id === 'sla_solicitudes') return { Icon: Bell, color: '#dc2626' };
  return { Icon: Zap, color: '#009ee3' };
}

// ─────────────────────────────────────────────────────────────────────────
// Agrupación de eventos repetidos dentro de un mismo día
// ─────────────────────────────────────────────────────────────────────────
const SEPARADOR = ' — ';
const UMBRAL_COLAPSO = 4;

interface SubGrupo {
  key: string; // clave estable (día + prefijo, o día + id si no hay separador)
  label: string | null; // prefijo genérico compartido; null = evento sin separador (nunca se colapsa)
  eventos: EventoActividad[];
}

// Agrupa los eventos de UN día por el texto antes del primer ' — ' en el título
// (ej. "Sin gestión ≥ 15 días — CUIYUN HE" → prefijo "Sin gestión ≥ 15 días").
// Si el título no trae el separador (ej. "Promesa de pago vence hoy" o
// "Sincronización detenida: cartera", que usan otro formato) el evento queda
// en su propio subgrupo de un solo elemento — nunca se agrupa "a ciegas" por
// coincidencia de texto completo, así que jamás se colapsa.
function agruparPorPrefijo(dia: string, evs: EventoActividad[]): SubGrupo[] {
  const orden: string[] = [];
  const mapa = new Map<string, SubGrupo>();
  for (const e of evs) {
    const idx = e.titulo.indexOf(SEPARADOR);
    if (idx === -1) {
      const key = `${dia}::solo::${e.id}`;
      mapa.set(key, { key, label: null, eventos: [e] });
      orden.push(key);
      continue;
    }
    const prefijo = e.titulo.slice(0, idx);
    const key = `${dia}::${prefijo}`;
    const existente = mapa.get(key);
    if (existente) {
      existente.eventos.push(e);
    } else {
      mapa.set(key, { key, label: prefijo, eventos: [e] });
      orden.push(key);
    }
  }
  return orden.map((k) => mapa.get(k)!);
}

function EventoRow({
  e,
  indent = false,
  onClick,
}: {
  e: EventoActividad;
  indent?: boolean;
  onClick: (e: EventoActividad) => void;
}) {
  const { Icon, color } = iconoEvento(e);
  return (
    <button
      onClick={() => onClick(e)}
      className={`w-full flex items-center gap-3 rounded-lg hover:bg-gray-50 transition text-left ${indent ? 'px-3 py-1.5' : 'px-3 py-2'}`}
    >
      <span className="flex-shrink-0 rounded-full p-1.5" style={{ backgroundColor: color + '1a' }}>
        <Icon size={14} style={{ color }} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-gray-800 truncate">{e.titulo}</span>
        {e.mensaje && <span className="block text-[11px] text-gray-400 truncate">{e.mensaje}</span>}
      </span>
      <span className="flex-shrink-0 text-[11px] text-gray-400">{fmtHoraCR(e.created_at)}</span>
    </button>
  );
}

export default function FeedActividadAutomatizaciones({ eventos, onRefresh, refreshing }: Props) {
  const router = useRouter();
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  function handleClick(e: EventoActividad) {
    if (e.link) router.push(e.link);
  }

  function toggleGrupo(key: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const grupos = new Map<string, EventoActividad[]>();
  for (const e of eventos) {
    const dia = fmtDayCR(e.created_at);
    if (!grupos.has(dia)) grupos.set(dia, []);
    grupos.get(dia)!.push(e);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-800">Actividad reciente</h3>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {eventos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="mb-2 rounded-full bg-gray-100 p-3">
            <Bell size={20} className="text-gray-300" />
          </div>
          <p className="text-sm font-semibold text-gray-500">Sin actividad todavía</p>
          <p className="text-xs text-gray-400 mt-1">
            Cuando una regla se dispare vas a ver el detalle acá.
          </p>
        </div>
      ) : (
        <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
          {Array.from(grupos.entries()).map(([dia, evs]) => {
            const subgrupos = agruparPorPrefijo(dia, evs);
            return (
              <div key={dia}>
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: dia === 'HOY' ? '#009ee3' : '#9ca3af' }}
                  >
                    {dia}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {evs.length} {evs.length === 1 ? 'evento' : 'eventos'}
                  </span>
                </div>
                <div className="space-y-1">
                  {subgrupos.map((sg) => {
                    // Grupo colapsable: mismo prefijo genérico y más de UMBRAL_COLAPSO eventos
                    if (sg.label !== null && sg.eventos.length > UMBRAL_COLAPSO) {
                      const isOpen = expandidos.has(sg.key);
                      const { Icon, color } = iconoEvento(sg.eventos[0]);
                      return (
                        <div key={sg.key}>
                          <button
                            onClick={() => toggleGrupo(sg.key)}
                            aria-expanded={isOpen}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition text-left"
                          >
                            <span
                              className="flex-shrink-0 rounded-full p-1.5"
                              style={{ backgroundColor: color + '1a' }}
                            >
                              <Icon size={14} style={{ color }} />
                            </span>
                            <span className="flex-1 min-w-0 flex items-center gap-2">
                              <span className="text-[13px] font-medium text-gray-800 truncate">
                                {sg.label}
                              </span>
                              <span
                                className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ backgroundColor: '#009ee31a', color: '#009ee3' }}
                              >
                                {sg.eventos.length} eventos
                              </span>
                            </span>
                            <ChevronDown
                              size={14}
                              aria-hidden="true"
                              className="text-gray-400 transition-transform duration-200 flex-shrink-0"
                              style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            />
                          </button>
                          {isOpen && (
                            <div className="mt-1 ml-6 space-y-0.5 border-l-2 border-gray-100 pl-3">
                              {sg.eventos.map((e) => (
                                <EventoRow key={e.id} e={e} indent onClick={handleClick} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }
                    // Grupo chico (≤4) o sin separador en el título: filas individuales, sin cambios
                    return sg.eventos.map((e) => (
                      <EventoRow key={e.id} e={e} onClick={handleClick} />
                    ));
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
