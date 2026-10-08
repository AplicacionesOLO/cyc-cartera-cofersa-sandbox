'use client';

/**
 * BASE REUTILIZABLE — Tabla de gestiones (formato tabla compacta)
 *
 * Usado por:
 *   - Tab Gestiones de la ficha del cliente  (sin columna Cliente)
 *   - Módulo /gestiones del sidebar          (con columna Cliente)
 *
 * Exporta: KpiCard, helpers de color/fecha/username y TablaGestionesCompacta.
 * Sistema de colores idéntico en ambas vistas.
 */

import { useState, memo } from 'react';
import { Coins, FileText, Calendar, ChevronUp, ExternalLink } from 'lucide-react';
import { fmtCRC } from '@/lib/utils/formato';
import type { Gestion, Promesa } from '@/types/database';

// ── Colores de badge por tipo ──────────────────────────────────────────
export const TIPO_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  LLAMADA: { bg: '#e6f1fb', text: '#0c447c', label: 'Llamada' },
  WHATSAPP: { bg: '#eaf3de', text: '#27500a', label: 'WhatsApp' },
  CORREO: { bg: '#faeeda', text: '#633806', label: 'Correo' },
  INTERNA: { bg: '#f1efe8', text: '#444441', label: 'Interna' },
  VISITA: { bg: '#eeedfe', text: '#3c3489', label: 'Visita' },
};
export function tipoBadge(tipo: string) {
  return (
    TIPO_BADGE[(tipo ?? '').toUpperCase()] ?? { bg: '#f1f5f9', text: '#64748b', label: tipo || '—' }
  );
}

// ── Próxima acción ─────────────────────────────────────────────────────
export const PROXIMA_LABEL: Record<string, string> = {
  esperar_pago: 'Esperar pago',
  recontactar: 'Recontactar',
  escalar: 'Escalar revisión',
  crear_solicitud: 'Crear solicitud',
  sin_seguimiento: 'Sin seguimiento',
};
export function proximaColor(pa: string | null | undefined): string {
  if (pa === 'esperar_pago' || pa === 'recontactar' || pa === 'escalar') return '#0f6e56';
  if (pa === 'crear_solicitud') return '#534ab7';
  if (pa === 'sin_seguimiento') return '#94a3b8';
  return '#94a3b8';
}

// ── Helpers ────────────────────────────────────────────────────────────
export function usernameOf(email: string | null | undefined): string {
  return (email ?? '').split('@')[0] || '—';
}

/** dd/MM a partir de YYYY-MM-DD */
export function fmtCorta(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!d) return iso;
  return `${d}/${m}`;
}

/** Fecha relativa amistosa */
export function fechaRelativa(iso: string | null | undefined): string {
  if (!iso) return '—';
  const hoy = new Date();
  const f = new Date(iso + 'T00:00:00');
  const dias = Math.floor(
    (new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime() - f.getTime()) /
      86_400_000,
  );
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  if (dias < 14) return 'Hace 1 semana';
  if (dias < 30) return `Hace ${Math.floor(dias / 7)} semanas`;
  if (dias < 60) return 'Hace 1 mes';
  return `Hace ${Math.floor(dias / 30)} meses`;
}

// ── KPI card (sin íconos) ──────────────────────────────────────────────
export function KpiCard({
  label,
  valor,
  sub,
  valorColor,
  esTexto,
}: {
  label: string;
  valor: string | number;
  sub?: string;
  valorColor?: string;
  esTexto?: boolean; // true → fuente 15px (texto), false → 24px mono (número)
}) {
  return (
    <div
      className="text-center"
      style={{
        backgroundColor: '#fff',
        border: '0.5px solid #e2e8f0',
        borderRadius: '10px',
        padding: '12px',
      }}
    >
      <p
        style={{
          fontSize: '10px',
          textTransform: 'uppercase',
          color: '#94a3b8',
          fontWeight: 600,
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: esTexto ? '15px' : '24px',
          fontWeight: 500,
          fontFamily: esTexto ? undefined : 'ui-monospace, SFMono-Regular, monospace',
          color: valorColor ?? '#1e293b',
          lineHeight: 1.2,
          marginTop: '4px',
        }}
      >
        {valor}
      </p>
      {sub ? <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>{sub}</p> : null}
    </div>
  );
}

// ── Flag (chip 22x22) ──────────────────────────────────────────────────
function Flag({ tipo }: { tipo: 'promesa' | 'solicitud' | 'proxima' }) {
  const cfg = {
    promesa: { bg: '#faeeda', color: '#854f0b', icon: <Coins size={12} />, title: 'Tiene promesa' },
    solicitud: {
      bg: '#eeedfe',
      color: '#534ab7',
      icon: <FileText size={12} />,
      title: 'Generó solicitud',
    },
    proxima: {
      bg: '#e1f5ee',
      color: '#0f6e56',
      icon: <Calendar size={12} />,
      title: 'Próxima acción pendiente',
    },
  }[tipo];
  return (
    <span
      title={cfg.title}
      style={{
        width: 22,
        height: 22,
        borderRadius: 5,
        backgroundColor: cfg.bg,
        color: cfg.color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {cfg.icon}
    </span>
  );
}

// ── Fila ───────────────────────────────────────────────────────────────
interface RowProps {
  g: Gestion;
  promesa?: Promesa;
  tieneSol: boolean;
  mostrarCliente: boolean;
  nombreCliente?: string;
  cols: string;
  expandido: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onEdit?: (g: Gestion) => void;
  onVerCliente?: (g: Gestion) => void;
}

const Row = memo(function Row({
  g,
  promesa,
  tieneSol,
  mostrarCliente,
  nombreCliente,
  cols,
  expandido,
  onToggle,
  canEdit,
  onEdit,
  onVerCliente,
}: RowProps) {
  const tb = tipoBadge(g.tipo);
  const tienePA = !!g.proxima_accion && g.proxima_accion !== 'sin_seguimiento';
  const paColor = proximaColor(g.proxima_accion);
  const paLabel = g.proxima_accion ? (PROXIMA_LABEL[g.proxima_accion] ?? g.proxima_accion) : null;

  return (
    <div style={{ borderBottom: '0.5px solid #eef2f7' }}>
      {/* Fila principal */}
      <div
        onClick={onToggle}
        className="cursor-pointer transition-colors"
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          alignItems: 'center',
          gap: '8px',
          padding: '9px 12px',
          fontSize: '11.5px',
          backgroundColor: expandido ? '#fafbfd' : undefined,
        }}
        onMouseEnter={(e) => {
          if (!expandido) e.currentTarget.style.backgroundColor = '#fafbfd';
        }}
        onMouseLeave={(e) => {
          if (!expandido) e.currentTarget.style.backgroundColor = '';
        }}
      >
        {/* Fecha */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{fmtCorta(g.fecha)}</p>
          <p style={{ fontSize: 10, color: '#94a3b8' }}>{g.hora?.slice(0, 5) ?? ''}</p>
        </div>

        {/* Cliente (solo módulo) */}
        {mostrarCliente && (
          <div className="min-w-0">
            <p className="truncate" style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
              {nombreCliente || g.contribuyente || g.cliente_cod}
            </p>
            <p style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
              {g.cliente_cod}
            </p>
          </div>
        )}

        {/* Analista */}
        <p
          style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#475569' }}
          className="truncate"
        >
          {usernameOf(g.analista_email)}
        </p>

        {/* Tipo */}
        <div>
          <span
            style={{
              backgroundColor: tb.bg,
              color: tb.text,
              fontSize: 10.5,
              fontWeight: 700,
              borderRadius: 999,
              padding: '2px 8px',
              whiteSpace: 'nowrap',
            }}
          >
            {tb.label}
          </span>
        </div>

        {/* Resultado */}
        <p className="truncate" style={{ fontSize: 11.5, color: '#334155' }}>
          {g.resultado}
        </p>

        {/* Nota */}
        <p className="truncate" style={{ fontSize: 11.5, color: '#475569' }}>
          {g.nota || '—'}
        </p>

        {/* Próxima acción */}
        <p
          className="truncate"
          style={{ fontSize: 11.5, fontWeight: 600, color: paLabel ? paColor : '#94a3b8' }}
        >
          {paLabel
            ? `${paLabel}${g.proxima_accion_fecha ? ' · ' + fmtCorta(g.proxima_accion_fecha) : ''}`
            : '—'}
        </p>

        {/* Flags */}
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          {g.promesa_id && <Flag tipo="promesa" />}
          {tieneSol && <Flag tipo="solicitud" />}
          {tienePA && <Flag tipo="proxima" />}
        </div>
      </div>

      {/* Detalle expandido */}
      {expandido && (
        <div
          style={{
            backgroundColor: '#fafbfd',
            padding: '12px 16px',
            borderTop: '0.5px solid #eef2f7',
          }}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <p
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                color: '#94a3b8',
                fontWeight: 700,
                letterSpacing: '0.05em',
              }}
            >
              Nota completa
            </p>
            <button onClick={onToggle} className="text-gray-400 hover:text-gray-600">
              <ChevronUp size={14} />
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {g.nota || 'Sin nota registrada.'}
          </p>

          {/* Promesa vinculada */}
          {promesa && (
            <div
              className="mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ backgroundColor: '#faeeda', border: '0.5px solid #ef9f27' }}
            >
              <Coins size={13} style={{ color: '#854f0b' }} />
              <span style={{ fontSize: 12, color: '#854f0b' }}>
                <strong>{fmtCRC(promesa.monto)}</strong> · {promesa.fecha_promesa} ·{' '}
                <strong>{promesa.estado}</strong>
              </span>
            </div>
          )}

          {/* Próxima acción detalle */}
          {paLabel && (
            <p className="mt-2" style={{ fontSize: 12, color: paColor, fontWeight: 600 }}>
              Próxima acción: {paLabel}
              {g.proxima_accion_fecha ? ` — ${g.proxima_accion_fecha}` : ''}
            </p>
          )}

          {/* Acciones */}
          <div className="flex items-center gap-2 mt-3">
            {onVerCliente && (
              <button
                onClick={() => onVerCliente(g)}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition hover:opacity-80"
                style={{ backgroundColor: '#eef2f7', color: '#475569' }}
              >
                <ExternalLink size={11} /> Ver cliente
              </button>
            )}
            {canEdit && onEdit && (
              <button
                onClick={() => onEdit(g)}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition hover:opacity-80"
                style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}
              >
                Editar gestión
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

// ── Tabla compacta ─────────────────────────────────────────────────────
export interface TablaGestionesCompactaProps {
  gestiones: Gestion[];
  promesaMap?: Map<string, Promesa>;
  solicitudesPorGestion?: Set<string>;
  nombreClienteMap?: Record<string, string>; // cliente_cod → nombre comercial
  codsConCartera?: Set<string>; // códigos con entrada en cartera (link válido)
  mostrarCliente: boolean;
  canEdit?: (g: Gestion) => boolean;
  onEdit?: (g: Gestion) => void;
  onVerCliente?: (g: Gestion) => void;
}

export default function TablaGestionesCompacta({
  gestiones,
  promesaMap,
  solicitudesPorGestion,
  nombreClienteMap,
  codsConCartera,
  mostrarCliente,
  canEdit,
  onEdit,
  onVerCliente,
}: TablaGestionesCompactaProps) {
  const [expandido, setExpandido] = useState<string | null>(null);

  // Plantillas de columnas
  const cols = mostrarCliente
    ? '100px 180px 80px 90px 165px 1fr 120px 60px'
    : '90px 100px 90px 150px 1fr 130px 60px';

  const headers = mostrarCliente
    ? ['Fecha', 'Cliente', 'Analista', 'Tipo', 'Resultado', 'Nota', 'Próxima acción', 'Flags']
    : ['Fecha', 'Analista', 'Tipo', 'Resultado', 'Nota', 'Próxima acción', 'Flags'];

  if (gestiones.length === 0) {
    return (
      <div
        className="bg-white rounded-[10px] flex flex-col items-center justify-center py-16 text-center"
        style={{ border: '0.5px solid #e2e8f0' }}
      >
        <FileText size={32} className="text-gray-200 mb-3" />
        <p className="text-[13px] font-semibold text-gray-500">Sin gestiones para estos filtros</p>
      </div>
    );
  }

  return (
    <div
      className="bg-white overflow-hidden"
      style={{ border: '0.5px solid #e2e8f0', borderRadius: '10px' }}
    >
      {/* Header sticky */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: '#f8fafc',
          borderBottom: '0.5px solid #e2e8f0',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
      >
        {headers.map((h, i) => (
          <span
            key={h}
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              color: '#94a3b8',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textAlign: i === headers.length - 1 ? 'right' : 'left',
            }}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Filas */}
      <div>
        {gestiones.map((g) => (
          <Row
            key={g.id}
            g={g}
            promesa={g.promesa_id ? promesaMap?.get(g.promesa_id) : undefined}
            tieneSol={solicitudesPorGestion?.has(g.id) ?? false}
            mostrarCliente={mostrarCliente}
            nombreCliente={nombreClienteMap?.[g.cliente_cod]}
            cols={cols}
            expandido={expandido === g.id}
            onToggle={() => setExpandido((prev) => (prev === g.id ? null : g.id))}
            canEdit={canEdit?.(g) ?? false}
            onEdit={onEdit}
            onVerCliente={
              !codsConCartera || codsConCartera.has(g.cliente_cod) ? onVerCliente : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
