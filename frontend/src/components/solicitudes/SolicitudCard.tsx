'use client';

/**
 * SolicitudCard — Componente único compartido.
 *
 * Usado por:
 *   - Módulo /solicitudes (lista-solicitudes.tsx)
 *   - Tab Solicitudes de la ficha del cliente
 *
 * Muestra: número SIC-XXXXX, cliente, estado, tipo, badges de área /
 * prioridad / ALTA PRIORIDAD / ESCALADA / SLA VENCIDO, barra de SLA,
 * responsable y fecha. Click → navega al detalle.
 *
 * Solicitudes legacy (estado MAYÚSCULA, sin área/SLA) se muestran con
 * fallbacks y siguen siendo accesibles.
 */

import { Zap, Clock } from 'lucide-react';
import type { Solicitud } from '@/types/database';
import {
  AREA_MAP,
  ESTADO_CFG,
  PRIORIDAD_CFG,
  numeroSolicitud,
  slaEstado,
} from '@/lib/solicitudes/catalogo';
import type { AreaKey } from '@/lib/solicitudes/catalogo';

// ── Badge de área — paleta unificada del sprint ────────────────────────
const AREA_BADGE: Record<AreaKey, { bg: string; text: string }> = {
  credito_cobro: { bg: '#e6f1fb', text: '#0c447c' },
  comercial: { bg: '#eaf3de', text: '#27500a' },
  logistica: { bg: '#faeeda', text: '#633806' },
  actualizacion_datos: { bg: '#f1efe8', text: '#444441' },
};

// ── Fallback de estados legacy (MAYÚSCULA) ─────────────────────────────
const ESTADO_LEGACY: Record<string, { bg: string; text: string; label: string }> = {
  PENDIENTE: { bg: '#fef9c3', text: '#a16207', label: 'Pendiente (legacy)' },
  EN_REVISION: { bg: '#e0f2fe', text: '#0369a1', label: 'En revisión (legacy)' },
  APROBADA: { bg: '#dcfce7', text: '#15803d', label: 'Aprobada (legacy)' },
  RECHAZADA: { bg: '#fee2e2', text: '#dc2626', label: 'Rechazada (legacy)' },
};

export function estadoStyle(estado: string) {
  if (estado in ESTADO_CFG) {
    const c = ESTADO_CFG[estado as keyof typeof ESTADO_CFG];
    return { bg: c.bg, text: c.text, label: estado };
  }
  return ESTADO_LEGACY[estado] ?? { bg: '#f1f5f9', text: '#475569', label: estado };
}

const SLA_COLOR = { verde: '#16a34a', amarillo: '#d97706', rojo: '#dc2626' } as const;

interface Props {
  solicitud: Solicitud;
  solicitanteNombre?: string;
  onClick: () => void;
}

export default function SolicitudCard({ solicitud: s, solicitanteNombre, onClick }: Props) {
  const est = estadoStyle(s.estado);
  const areaKey = s.area as AreaKey | null;
  const areaBadge = areaKey ? AREA_BADGE[areaKey] : null;
  const areaLabel = areaKey ? (AREA_MAP[areaKey]?.label ?? areaKey) : null;
  const pr = s.prioridad ? PRIORIDAD_CFG[s.prioridad] : null;
  const sla = slaEstado(s.created_at, s.sla_vencimiento);
  const esEscalada = (s.tipo ?? '').toLowerCase().includes('escalamiento');

  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition flex flex-col w-full"
    >
      {/* Header */}
      <div
        className="px-4 py-3 border-b border-gray-50 flex items-start justify-between gap-3"
        style={{ backgroundColor: '#fafbfc' }}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-black tracking-wider text-gray-400">
            {numeroSolicitud(s.id, s.numero_consecutivo)}
          </p>
          <p className="text-[13px] font-bold text-gray-800 truncate">
            {s.cliente_nombre || s.cliente_cod || '—'}
          </p>
          {s.cliente_cod && <p className="text-[11px] text-gray-400 font-mono">{s.cliente_cod}</p>}
        </div>
        <span
          className="flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-1 flex-shrink-0 whitespace-nowrap"
          style={{ backgroundColor: est.bg, color: est.text }}
        >
          <span style={{ fontSize: 7 }}>●</span> {est.label}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex-1 space-y-2.5">
        <p className="text-[13px] font-semibold text-gray-800">{s.tipo}</p>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {areaBadge && areaLabel && (
            <span
              className="text-[10px] font-bold rounded-full px-2 py-0.5"
              style={{ backgroundColor: areaBadge.bg, color: areaBadge.text }}
            >
              {areaLabel}
            </span>
          )}
          {pr && (
            <span
              className="text-[10px] font-bold rounded-full px-2 py-0.5"
              style={{ backgroundColor: pr.bg, color: pr.text }}
            >
              {s.prioridad}
            </span>
          )}
          {s.prioridad === 'Alta' && (
            <span
              className="text-[10px] font-bold rounded-full px-2 py-0.5 flex items-center gap-0.5"
              style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
            >
              <Zap size={9} /> ALTA PRIORIDAD
            </span>
          )}
          {esEscalada && (
            <span
              className="text-[10px] font-bold rounded-full px-2 py-0.5"
              style={{ backgroundColor: '#ede9fe', color: '#6d28d9' }}
            >
              ESCALADA
            </span>
          )}
          {sla.vencido && s.sla_vencimiento && (
            <span
              className="text-[10px] font-bold rounded-full px-2 py-0.5"
              style={{ backgroundColor: '#dc2626', color: '#fff' }}
            >
              SLA VENCIDO
            </span>
          )}
        </div>

        {/* SLA bar */}
        {s.sla_vencimiento ? (
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                <Clock size={10} /> SLA
              </span>
              <span className="font-bold" style={{ color: SLA_COLOR[sla.nivel] }}>
                {sla.vencido ? 'Vencido' : `${Math.round(sla.pct)}% restante`}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(3, sla.pct)}%`, backgroundColor: SLA_COLOR[sla.nivel] }}
              />
            </div>
          </div>
        ) : (
          <p className="text-[10px] text-gray-300">Solicitud legacy — sin SLA</p>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-4 py-2.5 border-t border-gray-50 flex items-center justify-between text-[11px] text-gray-400"
        style={{ backgroundColor: '#fafbfc' }}
      >
        <span>
          Resp: <span className="font-semibold text-gray-600">{s.responsable_nombre || '—'}</span>
        </span>
        <span>
          Por {solicitanteNombre ?? '—'} ·{' '}
          {new Date(s.created_at).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
        </span>
      </div>
    </button>
  );
}
