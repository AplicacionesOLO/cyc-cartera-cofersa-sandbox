'use client';

/**
 * TIMELINE DE GESTIONES v2
 * ─────────────────────────────────────────────────────────────────
 * Cards expandibles ordenadas cronológicamente descendente.
 * - Ícono y color por tipo de gestión
 * - Nota truncada a 120 chars con "Ver más / Ver menos"
 * - Promesa vinculada (estado + monto + fecha)
 * - Próxima acción + fecha
 * - Metadata estructurada por resultado
 * - Badges especiales: REVISIÓN INTERNA, PROMESA INCUMPLIDA, etc.
 * - Gestiones INTERNA: fondo gris
 * - Memoizado (GestionCard) para rendimiento con 300+ registros
 */

import { useState, useMemo, memo } from 'react';
import {
  Phone,
  MessageCircle,
  Mail,
  Wrench,
  MapPin,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { fmtCRC } from '@/lib/utils/formato';
import { fmtFechaCR, fmtFechaHoraCR } from '@/lib/utils/timezone';
import type { Gestion, Promesa } from '@/types/database';

// ── Config por tipo ────────────────────────────────────────────────────────
interface TipoConf {
  icon: React.ReactNode;
  color: string;
  label: string;
}

const TIPO_CONFIG: Record<string, TipoConf> = {
  LLAMADA: { icon: <Phone size={13} />, color: '#3b82f6', label: 'Llamada' },
  WHATSAPP: { icon: <MessageCircle size={13} />, color: '#22c55e', label: 'WhatsApp' },
  CORREO: { icon: <Mail size={13} />, color: '#f59e0b', label: 'Correo' },
  INTERNA: { icon: <Wrench size={13} />, color: '#8b5cf6', label: 'Interna' },
  VISITA: { icon: <MapPin size={13} />, color: '#ef4444', label: 'Visita' },
};

/** Normaliza tipo legado (ej: 'Llamada') al mismo config que el sistema v2 */
function getTipoConf(tipo: string): TipoConf {
  return (
    TIPO_CONFIG[tipo.toUpperCase()] ?? { icon: <Phone size={13} />, color: '#94a3b8', label: tipo }
  );
}

// ── Labels de próxima acción ───────────────────────────────────────────────
const PROXIMA_LABEL: Record<string, string> = {
  esperar_pago: 'Esperar pago',
  recontactar: 'Recontactar',
  escalar: 'Escalar revisión',
  crear_solicitud: 'Crear solicitud',
  sin_seguimiento: 'Sin seguimiento',
};

// ── Badges especiales ──────────────────────────────────────────────────────
interface Badge {
  label: string;
  bg: string;
  textColor: string;
}

function getBadges(g: Gestion, promesaEstado?: string): Badge[] {
  const badges: Badge[] = [];

  if (g.promesa_id) {
    if (promesaEstado === 'INCUMPLIDA')
      badges.push({ label: 'PROMESA INCUMPLIDA', bg: '#fef2f2', textColor: '#dc2626' });
    else if (promesaEstado === 'ABONO_PARCIAL')
      badges.push({ label: 'ABONO PARCIAL', bg: '#fff7ed', textColor: '#ea580c' });
  }

  const res = g.resultado;
  if (res === 'Requiere revisión interna' || res === 'Escalado coordinación')
    badges.push({ label: 'REVISIÓN INTERNA', bg: '#eff6ff', textColor: '#2563eb' });

  if (res === 'Solicitud creada' || (g.metadata && 'solicitud_id' in g.metadata))
    badges.push({ label: 'SOLICITUD RELACIONADA', bg: '#f5f3ff', textColor: '#7c3aed' });

  if (res === 'Reclamo comercial')
    badges.push({ label: 'RECLAMO COMERCIAL', bg: '#fff7ed', textColor: '#ea580c' });
  else if (res === 'Reclamo logístico')
    badges.push({ label: 'RECLAMO LOGÍSTICO', bg: '#fff7ed', textColor: '#ea580c' });

  return badges;
}

// ── Renderizado de metadata por resultado ──────────────────────────────────
function MetadataDetail({
  resultado,
  metadata,
}: {
  resultado: string;
  metadata: Record<string, unknown>;
}) {
  const rows: { label: string; value: string }[] = [];

  if (resultado === 'Compromiso de pago confirmado') {
    if (metadata.monto_comprometido !== undefined)
      rows.push({
        label: 'Monto comprometido',
        value: fmtCRC(Number(metadata.monto_comprometido)),
      });
    if (metadata.fecha_prometida)
      rows.push({ label: 'Fecha prometida', value: fmtFechaCR(String(metadata.fecha_prometida)) });
    if (metadata.facturas_count)
      rows.push({ label: 'Facturas incluidas', value: String(metadata.facturas_count) });
  }

  if (resultado === 'Pago realizado') {
    if (metadata.monto_pagado !== undefined)
      rows.push({ label: 'Monto pagado', value: fmtCRC(Number(metadata.monto_pagado)) });
    if (metadata.referencia) rows.push({ label: 'Referencia', value: String(metadata.referencia) });
    if (metadata.fecha_pago)
      rows.push({ label: 'Fecha pago', value: fmtFechaCR(String(metadata.fecha_pago)) });
  }

  if (resultado === 'Solicitud de convenio') {
    if (metadata.monto_total !== undefined)
      rows.push({ label: 'Monto total', value: fmtCRC(Number(metadata.monto_total)) });
    if (metadata.cuotas) rows.push({ label: 'Cuotas', value: String(metadata.cuotas) });
    if (metadata.frecuencia) rows.push({ label: 'Frecuencia', value: String(metadata.frecuencia) });
    if (metadata.primera_cuota)
      rows.push({ label: 'Primera cuota', value: fmtFechaCR(String(metadata.primera_cuota)) });
  }

  if (resultado === 'Requiere revisión interna' || resultado === 'Escalado coordinación') {
    if (metadata.area) rows.push({ label: 'Área', value: String(metadata.area) });
    if (metadata.prioridad) rows.push({ label: 'Prioridad', value: String(metadata.prioridad) });
  }

  if (resultado === 'Contacto inválido' || resultado === 'Correo inválido') {
    if (metadata.tipo_problema)
      rows.push({ label: 'Problema', value: String(metadata.tipo_problema) });
  }

  if (resultado === 'Llamar después' && metadata.fecha_llamada) {
    rows.push({ label: 'Llamar el', value: fmtFechaCR(String(metadata.fecha_llamada)) });
  }

  if (rows.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
      {rows.map((r) => (
        <div key={r.label}>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {r.label}
          </p>
          <p className="text-[12px] text-gray-700 font-medium mt-0.5">{r.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Card individual (memoizada) ────────────────────────────────────────────
interface CardProps {
  gestion: Gestion;
  promesa: Promesa | undefined;
  isExpanded: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onEdit?: (g: Gestion) => void;
}

const GestionCard = memo(function GestionCard({
  gestion,
  promesa,
  isExpanded,
  onToggle,
  canEdit,
  onEdit,
}: CardProps) {
  const tipoConf = getTipoConf(gestion.tipo);
  const esInterna = gestion.tipo.toUpperCase() === 'INTERNA';
  const badges = getBadges(gestion, promesa?.estado);

  const notaTruncada =
    gestion.nota && gestion.nota.length > 120 ? gestion.nota.slice(0, 120) + '…' : gestion.nota;

  const tieneExtra = !!(
    gestion.promesa_id ||
    (!gestion.promesa_id && gestion.promesa_monto) || // legacy
    gestion.proxima_accion ||
    (gestion.metadata && Object.keys(gestion.metadata).length > 0) ||
    (gestion.nota && gestion.nota.length > 120)
  );

  return (
    <div
      className={`rounded-xl border transition-colors ${
        esInterna ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'
      }`}
    >
      {/* ── Encabezado ──────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Ícono de tipo */}
        <div
          className="shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: tipoConf.color + '18', color: tipoConf.color }}
        >
          {tipoConf.icon}
        </div>

        {/* Cuerpo */}
        <div className="flex-1 min-w-0">
          {/* Resultado + badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <span className="text-[13px] font-semibold text-gray-800 leading-tight">
              {gestion.resultado}
            </span>
            {badges.map((b, i) => (
              <span
                key={i}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-tight"
                style={{ backgroundColor: b.bg, color: b.textColor }}
              >
                {b.label}
              </span>
            ))}
            {gestion.legacy && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 leading-tight">
                LEGACY
              </span>
            )}
          </div>

          {/* Meta: tipo · analista · fecha·hora */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-gray-400">
            <span style={{ color: tipoConf.color }} className="font-medium">
              {tipoConf.label}
            </span>
            <span>·</span>
            <span>{gestion.analista_email.split('@')[0]}</span>
            <span>·</span>
            <span className="flex items-center gap-0.5">
              <Clock size={9} />
              {fmtFechaHoraCR(gestion.fecha, gestion.hora)}
            </span>
          </div>

          {/* Nota */}
          {gestion.nota && (
            <p className="mt-1.5 text-[12px] text-gray-600 leading-relaxed whitespace-pre-wrap break-words">
              {isExpanded ? gestion.nota : notaTruncada}
            </p>
          )}

          {/* "Ver más" inline cuando es solo la nota larga y no hay otros extras */}
          {!tieneExtra && gestion.nota && gestion.nota.length > 120 && (
            <button
              onClick={onToggle}
              className="mt-0.5 text-[11px] text-blue-500 hover:text-blue-700 font-medium"
            >
              {isExpanded ? 'Ver menos' : 'Ver más'}
            </button>
          )}
        </div>

        {/* Botón expandir */}
        {tieneExtra && (
          <button
            onClick={onToggle}
            className="shrink-0 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label={isExpanded ? 'Contraer' : 'Expandir'}
            title={isExpanded ? 'Ver menos' : 'Ver más'}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {/* ── Panel expandido ──────────────────────────── */}
      {isExpanded && tieneExtra && (
        <div className="px-4 pb-3 pt-2.5 border-t border-gray-100 space-y-3">
          {/* Promesa vinculada (v2) */}
          {promesa && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
              <FileText size={13} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-0.5">
                  Promesa vinculada
                </p>
                <p className="text-[12px] text-amber-800">
                  <span className="font-semibold">{fmtCRC(promesa.monto)}</span>
                  {' — '}
                  <span>para el {fmtFechaCR(promesa.fecha_promesa)}</span>
                  {' — '}
                  <span
                    className="font-semibold"
                    style={{
                      color:
                        promesa.estado === 'CUMPLIDA'
                          ? '#16a34a'
                          : promesa.estado === 'PENDIENTE'
                            ? '#d97706'
                            : '#dc2626',
                    }}
                  >
                    {promesa.estado === 'CUMPLIDA'
                      ? 'Cumplida'
                      : promesa.estado === 'PENDIENTE'
                        ? 'Pendiente'
                        : promesa.estado === 'INCUMPLIDA'
                          ? 'Incumplida'
                          : promesa.estado === 'ABONO_PARCIAL'
                            ? 'Abono parcial'
                            : promesa.estado}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Promesa legacy (sin promesa_id) */}
          {!promesa && gestion.promesa_monto ? (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-gray-100 border border-gray-200">
              <FileText size={13} className="text-gray-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
                  Promesa (registro anterior)
                </p>
                <p className="text-[12px] text-gray-600">
                  {fmtCRC(gestion.promesa_monto)}
                  {gestion.promesa_fecha && (
                    <span className="text-gray-400">
                      {' '}
                      — para el {fmtFechaCR(gestion.promesa_fecha)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          ) : null}

          {/* Próxima acción */}
          {gestion.proxima_accion && (
            <div className="flex items-center gap-2">
              <ArrowRight size={12} className="text-[#009ee3] shrink-0" />
              <span className="text-[12px]">
                <span className="font-semibold text-[#009ee3]">
                  {PROXIMA_LABEL[gestion.proxima_accion] ?? gestion.proxima_accion}
                </span>
                {gestion.proxima_accion_fecha && (
                  <span className="text-gray-400 ml-1">
                    — {fmtFechaCR(gestion.proxima_accion_fecha)}
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Metadata estructurada */}
          {gestion.metadata && Object.keys(gestion.metadata).length > 0 && (
            <MetadataDetail resultado={gestion.resultado} metadata={gestion.metadata} />
          )}

          {/* Acción editar */}
          {canEdit && onEdit && (
            <div className="flex justify-end pt-0.5">
              <button
                onClick={() => onEdit(gestion)}
                className="text-[11px] text-blue-500 hover:text-blue-700 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Editar gestión
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// Componente principal
// ══════════════════════════════════════════════════════════════════════════
export interface TimelineGestionesV2Props {
  gestiones: Gestion[];
  promesas: Promesa[];
  userEmail: string;
  esCoordinador: boolean;
  onEdit?: (g: Gestion) => void;
}

export default function TimelineGestionesV2({
  gestiones,
  promesas,
  userEmail,
  esCoordinador,
  onEdit,
}: TimelineGestionesV2Props) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  // Lookup map para promesas por id — O(1) por card
  const promesaMap = useMemo(() => new Map(promesas.map((p) => [p.id, p])), [promesas]);

  // Ordenar descendente por fecha + hora (más reciente arriba)
  const sorted = useMemo(
    () =>
      [...gestiones].sort((a, b) => {
        const da = `${a.fecha}T${a.hora ?? '00:00:00'}`;
        const db = `${b.fecha}T${b.hora ?? '00:00:00'}`;
        return db.localeCompare(da);
      }),
    [gestiones],
  );

  function toggle(id: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Estado vacío ──────────────────────────────────────────────────────
  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center select-none">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <Phone size={20} className="text-gray-300" />
        </div>
        <p className="text-[13px] font-medium text-gray-400">Sin gestiones registradas</p>
        <p className="text-[12px] text-gray-300 mt-1">
          Las gestiones que se registren aparecerán aquí
        </p>
      </div>
    );
  }

  // ── Timeline ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {sorted.map((g) => {
        const promesa = g.promesa_id ? promesaMap.get(g.promesa_id) : undefined;
        const canEdit = esCoordinador || g.analista_email === userEmail;
        return (
          <GestionCard
            key={g.id}
            gestion={g}
            promesa={promesa}
            isExpanded={expandidos.has(g.id)}
            onToggle={() => toggle(g.id)}
            canEdit={canEdit}
            onEdit={onEdit}
          />
        );
      })}
    </div>
  );
}
