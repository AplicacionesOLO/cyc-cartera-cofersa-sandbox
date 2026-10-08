'use client';

/**
 * WizardNuevaSolicitud — Pasos 1-2-3 compartidos (FLUJO LEGACY)
 *
 * Usado SOLO desde la ficha del cliente (/clientes/[cod]/solicitudes/nueva).
 * El módulo /solicitudes/nueva ya migró al catálogo nuevo (Centro Operativo).
 *
 * Pendiente (sprint futuro): alinear este wizard al catálogo oficial nuevo
 *   (src/lib/solicitudes/catalogo.ts — áreas/tipos/SLA/prioridad) para
 *   eliminar la inconsistencia entre el flujo de la ficha y /solicitudes/nueva.
 *   Mantener mientras tanto como legacy: usa destinatario + envío de correo.
 *
 * Paso 1: Seleccionar destinatario
 * Paso 2: Seleccionar tipo
 * Paso 3: Formulario específico + correos
 */

import { useState, useCallback, useMemo } from 'react';
import {
  useCrearSolicitudController,
  mensajeError,
} from '@/views/solicitudes/hooks/use-crear-solicitud-controller';
import {
  UserCheck,
  Building2,
  Truck,
  MoreHorizontal,
  Upload,
  Mail,
  Plus,
  ChevronRight,
  X,
  TrendingUp,
  ShieldOff,
  RefreshCw,
  PauseCircle,
  PlayCircle,
  AlertTriangle,
  Percent,
  ArrowLeftRight,
  Gift,
  Tag,
  Package,
  RotateCcw,
  Shield,
  FileEdit,
  CheckCircle2,
} from 'lucide-react';
import { fmtCRC } from '@/lib/utils/formato';
import type { Factura } from '@/types/database';

// ═══════════════════════════════════════════════════════════════
// TIPOS EXPORTADOS
// ═══════════════════════════════════════════════════════════════

export type Destinatario = 'coordinador' | 'comercial' | 'logistica' | 'otro';

export interface WizardClienteData {
  clienteCod: string;
  clienteNombre: string;
  limiteActual: number;
  moraTotal: number;
  diasAtraso: string; // ej: "61-90 días"
  creditoDisponible: number | null;
  condicionPago: string;
  facturas: Factura[];
}

export interface WizardProps extends WizardClienteData {
  /** Llamado al cancelar — navegación hacia atrás */
  onCancel: () => void;
  /** Llamado al enviar correctamente */
  onSuccess: () => void;
  /** Opcional: notifica al padre cada vez que cambia el paso (para StepIndicator externo) */
  onPasoChange?: (paso: number) => void;
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN: TIPOS POR DESTINATARIO
// ═══════════════════════════════════════════════════════════════

interface TipoOpt {
  value: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

export const TIPOS_POR_DEST: Record<Destinatario, TipoOpt[]> = {
  coordinador: [
    {
      value: 'aumento_limite',
      label: 'Aumento de límite',
      desc: 'Incrementar el límite de crédito asignado',
      icon: <TrendingUp size={16} />,
    },
    {
      value: 'excepcion_credito',
      label: 'Excepción de crédito',
      desc: 'Autorizar despacho fuera de los parámetros de crédito',
      icon: <ShieldOff size={16} />,
    },
    {
      value: 'cambio_condicion',
      label: 'Cambio de condición',
      desc: 'Modificar días o forma de pago acordada',
      icon: <RefreshCw size={16} />,
    },
    {
      value: 'suspension_temporal',
      label: 'Suspensión temporal',
      desc: 'Bloquear crédito del cliente temporalmente',
      icon: <PauseCircle size={16} />,
    },
    {
      value: 'reactivacion_cliente',
      label: 'Reactivación de cliente',
      desc: 'Habilitar crédito de un cliente suspendido',
      icon: <PlayCircle size={16} />,
    },
    {
      value: 'caso_especial',
      label: 'Caso especial',
      desc: 'Mora crítica o situación fuera de lo ordinario',
      icon: <AlertTriangle size={16} />,
    },
  ],
  comercial: [
    {
      value: 'descuento_no_aplicado',
      label: 'Descuento no aplicado',
      desc: 'Descuento acordado no reflejado en factura',
      icon: <Percent size={16} />,
    },
    {
      value: 'diferencia_precio',
      label: 'Diferencia de precio',
      desc: 'Precio incorrecto en factura emitida',
      icon: <ArrowLeftRight size={16} />,
    },
    {
      value: 'regalia_bonificacion',
      label: 'Regalía / Bonificación',
      desc: 'Producto o beneficio entregado al cliente',
      icon: <Gift size={16} />,
    },
    {
      value: 'beneficio_mercadeo',
      label: 'Beneficio de mercadeo',
      desc: 'Apoyo de marca o campaña comercial',
      icon: <Tag size={16} />,
    },
  ],
  logistica: [
    {
      value: 'mercaderia_faltante',
      label: 'Mercadería faltante',
      desc: 'Producto no entregado incluido en factura',
      icon: <Package size={16} />,
    },
    {
      value: 'devolucion_mercaderia',
      label: 'Devolución de mercadería',
      desc: 'Retorno de mercadería al almacén',
      icon: <RotateCcw size={16} />,
    },
    {
      value: 'garantias',
      label: 'Garantías',
      desc: 'Producto con defecto de fábrica o daño',
      icon: <Shield size={16} />,
    },
    {
      value: 'refacturacion',
      label: 'Refacturación',
      desc: 'Corrección de datos o condición en factura',
      icon: <FileEdit size={16} />,
    },
  ],
  otro: [
    {
      value: 'otra_solicitud',
      label: 'Otra solicitud',
      desc: 'Solicitud no contemplada en las opciones',
      icon: <MoreHorizontal size={16} />,
    },
  ],
};

export const DEST_LABEL: Record<Destinatario, string> = {
  coordinador: 'Coordinador',
  comercial: 'Área comercial',
  logistica: 'Área logística',
  otro: 'Otro',
};

// ═══════════════════════════════════════════════════════════════
// HELPERS CSS
// ═══════════════════════════════════════════════════════════════

const inputCls =
  'w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] text-gray-800 bg-white ' +
  'focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition';

const readonlyCls =
  'w-full rounded-xl border border-gray-100 px-3 py-2 text-[13px] text-gray-400 bg-gray-50 cursor-default';

const labelCls = 'block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1';

// ═══════════════════════════════════════════════════════════════
// INDICADOR DE PASOS
// ═══════════════════════════════════════════════════════════════

export function StepIndicator({
  paso,
  totalPasos = 3,
  offset = 0,
}: {
  paso: number;
  totalPasos?: number;
  offset?: number; // si hay paso 0, los labels se desplazan
}) {
  const labels =
    offset === 1
      ? ['Cliente', 'Destinatario', 'Tipo', 'Detalle']
      : ['Destinatario', 'Tipo', 'Detalle'];

  const steps = labels.slice(0, totalPasos);

  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = paso > n;
        const active = paso === n;
        return (
          <div key={n} className="flex items-center">
            <div className="flex flex-col items-center gap-0.5">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
                style={{
                  backgroundColor: active ? '#009ee3' : done ? '#009ee3' : '#e5e7eb',
                  color: active || done ? '#fff' : '#9ca3af',
                }}
              >
                {done ? '✓' : n}
              </div>
              <span
                className="text-[10px] font-medium whitespace-nowrap"
                style={{ color: active ? '#009ee3' : done ? '#009ee3' : '#9ca3af' }}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="w-10 h-0.5 mb-3 mx-1 transition-all"
                style={{ backgroundColor: paso > n ? '#009ee3' : '#e5e7eb' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTES INTERNOS
// ═══════════════════════════════════════════════════════════════

function CcTags({
  tags,
  onAdd,
  onRemove,
}: {
  tags: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [input, setInput] = useState('');
  function add() {
    const v = input.trim().toLowerCase();
    if (v && !tags.includes(v)) onAdd(v);
    setInput('');
  }
  return (
    <div className="space-y-1.5">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}
            >
              <Mail size={10} />
              {t}
              <button
                type="button"
                onClick={() => onRemove(t)}
                className="hover:opacity-70 transition ml-0.5"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="email"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="email@cofersa.cr"
          className={inputCls + ' flex-1'}
        />
        <button
          type="button"
          onClick={add}
          disabled={!input.trim()}
          className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition whitespace-nowrap"
        >
          <Plus size={12} /> Agregar
        </button>
      </div>
    </div>
  );
}

function SeccionEmails({
  para,
  onParaChange,
  cc,
  onCcAdd,
  onCcRemove,
}: {
  para: string;
  onParaChange: (v: string) => void;
  cc: string[];
  onCcAdd: (v: string) => void;
  onCcRemove: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden mb-3">
      <div className="px-4 py-2.5 border-b border-gray-100" style={{ backgroundColor: '#f8fafc' }}>
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
          Destinatarios del correo
        </p>
      </div>
      <div className="px-4 py-3 space-y-3 bg-gray-50/50">
        <div>
          <label className={labelCls}>Para</label>
          <input
            type="email"
            value={para}
            onChange={(e) => onParaChange(e.target.value)}
            placeholder="email del destinatario principal"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>CC (copia)</label>
          <CcTags tags={cc} onAdd={onCcAdd} onRemove={onCcRemove} />
        </div>
      </div>
    </div>
  );
}

function UploadArea({ obligatorio }: { obligatorio?: boolean }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-gray-200 px-4 py-4 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition">
      <Upload size={20} className="mx-auto text-gray-300 mb-1.5" />
      <p className="text-[12px] text-gray-400">
        {obligatorio ? (
          <>
            <span className="font-semibold text-red-500">Obligatorio</span> — arrastrá o hacé clic
            para adjuntar
          </>
        ) : (
          'Adjuntar documentos (opcional)'
        )}
      </p>
      <p className="text-[10px] text-gray-300 mt-0.5">PDF, JPG, PNG — máx 10MB</p>
    </div>
  );
}

// ── Campos de formulario ─────────────────────────────────────

function FieldReadonly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input readOnly value={value} className={readonlyCls} />
    </div>
  );
}

function FieldText({
  label,
  name,
  placeholder,
  datos,
  onDato,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
  datos: Record<string, string>;
  onDato: (k: string, v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type="text"
        value={datos[name] ?? ''}
        onChange={(e) => onDato(name, e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  );
}

function FieldNumber({
  label,
  name,
  placeholder,
  datos,
  onDato,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
  datos: Record<string, string>;
  onDato: (k: string, v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type="number"
        value={datos[name] ?? ''}
        onChange={(e) => onDato(name, e.target.value)}
        placeholder={placeholder ?? '₡0'}
        className={inputCls}
      />
    </div>
  );
}

function FieldTextarea({
  label,
  name,
  placeholder,
  datos,
  onDato,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
  datos: Record<string, string>;
  onDato: (k: string, v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <textarea
        value={datos[name] ?? ''}
        onChange={(e) => onDato(name, e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={inputCls + ' resize-none'}
        style={{ minHeight: '65px' }}
      />
    </div>
  );
}

function FieldSelect({
  label,
  name,
  options,
  datos,
  onDato,
  required,
}: {
  label: string;
  name: string;
  options: string[];
  datos: Record<string, string>;
  onDato: (k: string, v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <select
        value={datos[name] ?? ''}
        onChange={(e) => onDato(name, e.target.value)}
        className={inputCls}
      >
        <option value="">— Seleccionar —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function getMoraColor(fechaVenc: string | null): string {
  if (!fechaVenc) return '#94a3b8';
  const dias = Math.floor((Date.now() - new Date(fechaVenc).getTime()) / 86400000);
  if (dias > 120) return '#991b1b';
  if (dias > 90) return '#dc2626';
  if (dias > 60) return '#ef4444';
  if (dias > 30) return '#f97316';
  if (dias > 0) return '#f59e0b';
  return '#16a34a';
}

function getDiasLabel(fechaVenc: string | null): string {
  if (!fechaVenc) return '—';
  const dias = Math.floor((Date.now() - new Date(fechaVenc).getTime()) / 86400000);
  if (dias <= 0) return 'Al día';
  return `+${dias}d`;
}

function FieldFacturaSearch({
  label,
  name,
  facturas,
  incluirNinguna,
  datos,
  onDato,
  required,
}: {
  label: string;
  name: string;
  facturas: Factura[];
  incluirNinguna?: boolean;
  datos: Record<string, string>;
  onDato: (k: string, v: string) => void;
  required?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = datos[name] ?? '';
  const selectedFact = useMemo(
    () => facturas.find((f) => String(f.documento) === selected),
    [facturas, selected],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return facturas.slice(0, 60);
    return facturas
      .filter((f) => String(f.documento).toLowerCase().includes(q) || String(f.saldo).includes(q))
      .slice(0, 60);
  }, [facturas, query]);

  return (
    <div>
      <label className={labelCls}>
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>

      {/* Factura seleccionada */}
      {selected === 'ninguna' ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 flex items-center justify-between">
          <span className="text-[12px] font-medium text-gray-500 italic">
            Sin factura relacionada
          </span>
          <button
            type="button"
            onClick={() => onDato(name, '')}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X size={14} />
          </button>
        </div>
      ) : selected && selectedFact ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[12px] font-bold text-blue-800">{selectedFact.documento}</p>
            <p className="text-[11px] text-blue-500">
              {selectedFact.fecha_vencimiento ? `Vence ${selectedFact.fecha_vencimiento}` : '—'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[13px] font-bold tabular-nums text-blue-900">
              {fmtCRC(selectedFact.saldo)}
            </p>
            <button
              type="button"
              onClick={() => onDato(name, '')}
              className="text-blue-400 hover:text-blue-700 transition"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        /* Buscador */
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 160)}
            placeholder={
              facturas.length === 0 ? 'Sin facturas pendientes' : 'Buscar por nº de factura…'
            }
            disabled={facturas.length === 0}
            className={inputCls + (facturas.length === 0 ? ' opacity-50 cursor-default' : '')}
          />
          {open && facturas.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-30 max-h-52 overflow-y-auto">
              {incluirNinguna && (
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 text-[12px] text-gray-500 italic transition"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onDato(name, 'ninguna');
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  Sin factura relacionada
                </button>
              )}
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-[12px] text-gray-400 text-center">Sin resultados</p>
              ) : (
                filtered.map((f) => {
                  const moraColor = getMoraColor(f.fecha_vencimiento);
                  const diasLabel = getDiasLabel(f.fecha_vencimiento);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-center justify-between gap-3 transition"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onDato(name, String(f.documento));
                        setOpen(false);
                        setQuery('');
                      }}
                    >
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-gray-800 truncate">
                          {f.documento}
                        </p>
                        <p className="text-[11px] text-gray-400">{f.fecha_vencimiento ?? '—'}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[12px] font-bold tabular-nums text-gray-800">
                          {fmtCRC(f.saldo)}
                        </p>
                        <p className="text-[10px] font-bold" style={{ color: moraColor }}>
                          {diasLabel}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PASO 1: SELECTOR DE DESTINATARIO
// ═══════════════════════════════════════════════════════════════

export function SelectorDestinatario({ onSelect }: { onSelect: (d: Destinatario) => void }) {
  const cards = [
    {
      id: 'coordinador' as Destinatario,
      label: 'Coordinador',
      sub: 'Límites, excepciones, suspensiones, casos especiales',
      icon: <UserCheck size={24} />,
      color: '#009ee3',
      bg: '#e0f2fe',
      border: '#bae6fd',
    },
    {
      id: 'comercial' as Destinatario,
      label: 'Área comercial',
      sub: 'Descuentos, precios, regalías, beneficios de marca',
      icon: <Building2 size={24} />,
      color: '#16a34a',
      bg: '#dcfce7',
      border: '#bbf7d0',
    },
    {
      id: 'logistica' as Destinatario,
      label: 'Área logística',
      sub: 'Devoluciones, faltantes, garantías, refacturaciones',
      icon: <Truck size={24} />,
      color: '#ca8a04',
      bg: '#fef9c3',
      border: '#fde68a',
    },
    {
      id: 'otro' as Destinatario,
      label: 'Otro',
      sub: 'Solicitud no contemplada en las opciones anteriores',
      icon: <MoreHorizontal size={24} />,
      color: '#9ca3af',
      bg: '#f9fafb',
      border: '#e5e7eb',
      dashed: true,
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {cards.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className="flex items-start gap-4 rounded-2xl p-5 text-left transition hover:scale-[1.01] active:scale-[0.99]"
          style={{
            border: `${c.dashed ? '2px dashed' : '1.5px solid'} ${c.border}`,
            backgroundColor: c.bg,
          }}
        >
          <div
            className="flex-shrink-0 rounded-xl p-2.5"
            style={{ backgroundColor: c.dashed ? '#f3f4f6' : `${c.color}20`, color: c.color }}
          >
            {c.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-gray-800 mb-1">{c.label}</p>
            <p className="text-[12px] text-gray-500 leading-snug">{c.sub}</p>
          </div>
          <ChevronRight size={16} className="flex-shrink-0 self-center text-gray-300" />
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PASO 2: SELECTOR DE TIPO
// ═══════════════════════════════════════════════════════════════

export function SelectorTipo({
  destinatario,
  onSelect,
}: {
  destinatario: Destinatario;
  onSelect: (tipo: string) => void;
}) {
  const tipos = TIPOS_POR_DEST[destinatario];
  const COLOR: Record<
    Destinatario,
    { bg: string; bgHover: string; text: string; border: string; iconBg: string }
  > = {
    coordinador: {
      bg: '#f0f9ff',
      bgHover: '#e0f2fe',
      text: '#0369a1',
      border: '#bae6fd',
      iconBg: '#dbeafe',
    },
    comercial: {
      bg: '#f0fdf4',
      bgHover: '#dcfce7',
      text: '#15803d',
      border: '#bbf7d0',
      iconBg: '#dcfce7',
    },
    logistica: {
      bg: '#fefce8',
      bgHover: '#fef9c3',
      text: '#a16207',
      border: '#fde68a',
      iconBg: '#fef9c3',
    },
    otro: {
      bg: '#f8fafc',
      bgHover: '#f1f5f9',
      text: '#475569',
      border: '#e2e8f0',
      iconBg: '#f1f5f9',
    },
  };
  const sty = COLOR[destinatario];
  return (
    <div>
      <p className="text-[12px] text-gray-400 mb-3">
        Tipo de solicitud para{' '}
        <span className="font-semibold" style={{ color: sty.text }}>
          {DEST_LABEL[destinatario]}
        </span>
      </p>
      <div className={`grid gap-2.5 ${tipos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {tipos.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onSelect(t.value)}
            className="flex flex-col items-start gap-2 rounded-xl p-4 text-left transition hover:scale-[1.01] active:scale-[0.99]"
            style={{ backgroundColor: sty.bg, border: `1.5px solid ${sty.border}` }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = sty.bgHover)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = sty.bg)}
          >
            <div className="flex items-center gap-2.5 w-full">
              <div
                className="rounded-lg p-1.5 flex-shrink-0"
                style={{ backgroundColor: sty.iconBg, color: sty.text }}
              >
                {t.icon}
              </div>
              <span
                className="text-[13px] font-bold leading-tight flex-1"
                style={{ color: sty.text }}
              >
                {t.label}
              </span>
              <ChevronRight
                size={13}
                style={{ color: sty.text, opacity: 0.4 }}
                className="flex-shrink-0"
              />
            </div>
            <p
              className="text-[11px] leading-snug pl-0.5"
              style={{ color: sty.text, opacity: 0.7 }}
            >
              {t.desc}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PASO 3: FORMULARIO ESPECÍFICO
// ═══════════════════════════════════════════════════════════════

function FormularioDetalle({
  tipo,
  limiteActual,
  moraTotal,
  diasAtraso,
  creditoDisponible,
  condicionPago,
  facturas,
  datos,
  onDato,
}: {
  tipo: string;
  limiteActual: number;
  moraTotal: number;
  diasAtraso: string;
  creditoDisponible: number | null;
  condicionPago: string;
  facturas: Factura[];
  datos: Record<string, string>;
  onDato: (k: string, v: string) => void;
}) {
  const col2 = 'grid grid-cols-2 gap-3';

  // Diferencia de precio — tiempo real
  const pF = parseFloat(datos['precio_facturado'] ?? '0') || 0;
  const pC = parseFloat(datos['precio_correcto'] ?? '0') || 0;
  const dif = pF > 0 && pC > 0 ? pF - pC : null;

  switch (tipo) {
    // ── COORDINADOR ──────────────────────────────────────────

    case 'aumento_limite':
      return (
        <div className="space-y-3">
          <div className={col2}>
            <FieldReadonly
              label="Límite actual"
              value={limiteActual > 0 ? fmtCRC(limiteActual) : 'Sin límite'}
            />
            <FieldNumber
              label="Límite solicitado"
              name="limite_solicitado"
              placeholder="₡0"
              datos={datos}
              onDato={onDato}
              required
            />
          </div>
          <FieldTextarea
            label="Justificación"
            name="justificacion"
            placeholder="Explicá el motivo del aumento..."
            datos={datos}
            onDato={onDato}
            required
          />
          <UploadArea />
        </div>
      );

    case 'excepcion_credito':
      return (
        <div className="space-y-3">
          <div className={col2}>
            <FieldReadonly label="Mora total" value={moraTotal > 0 ? fmtCRC(moraTotal) : '—'} />
            <FieldReadonly label="Tramo de atraso" value={diasAtraso || '—'} />
          </div>
          <FieldReadonly
            label="Crédito disponible"
            value={
              creditoDisponible !== null
                ? creditoDisponible >= 0
                  ? fmtCRC(creditoDisponible) + ' disponible'
                  : 'Límite excedido en ' + fmtCRC(Math.abs(creditoDisponible))
                : '—'
            }
          />
          <FieldNumber
            label="Monto del pedido a despachar"
            name="monto_pedido"
            placeholder="₡0"
            datos={datos}
            onDato={onDato}
            required
          />
          <FieldSelect
            label="Motivo de la excepción"
            name="motivo"
            options={[
              'Negociación en proceso',
              'Cliente comprometió pago previo',
              'Cliente estratégico',
              'Otro',
            ]}
            datos={datos}
            onDato={onDato}
            required
          />
          <FieldTextarea
            label="Justificación"
            name="justificacion"
            datos={datos}
            onDato={onDato}
            required
          />
        </div>
      );

    case 'cambio_condicion':
      return (
        <div className="space-y-3">
          <div className={col2}>
            <FieldReadonly label="Condición actual" value={condicionPago || '—'} />
            <FieldText
              label="Condición solicitada"
              name="condicion_solicitada"
              placeholder="Ej: 60-C"
              datos={datos}
              onDato={onDato}
              required
            />
          </div>
          <FieldTextarea
            label="Justificación"
            name="justificacion"
            datos={datos}
            onDato={onDato}
            required
          />
        </div>
      );

    case 'suspension_temporal':
      return (
        <div className="space-y-3">
          <FieldTextarea
            label="Motivo de suspensión"
            name="motivo"
            datos={datos}
            onDato={onDato}
            required
          />
          <FieldTextarea
            label="Justificación"
            name="justificacion"
            datos={datos}
            onDato={onDato}
            required
          />
        </div>
      );

    case 'reactivacion_cliente':
      return (
        <div className="space-y-3">
          <FieldTextarea
            label="Justificación"
            name="justificacion"
            placeholder="Explicá por qué se debe reactivar al cliente..."
            datos={datos}
            onDato={onDato}
            required
          />
        </div>
      );

    case 'caso_especial':
      return (
        <div className="space-y-3">
          <div className={col2}>
            <FieldReadonly label="Mora total" value={moraTotal > 0 ? fmtCRC(moraTotal) : '—'} />
            <FieldReadonly label="Tramo de atraso" value={diasAtraso || '—'} />
          </div>
          <FieldSelect
            label="Razón del caso especial"
            name="razon"
            options={[
              'Cliente ilocalizable',
              'Cerró negocio',
              'Insolvencia confirmada',
              'Promesas reiteradas incumplidas',
              'Otro',
            ]}
            datos={datos}
            onDato={onDato}
            required
          />
          <FieldTextarea
            label="Gestiones realizadas"
            name="gestiones_realizadas"
            placeholder="Detalle llamadas, visitas y emails realizados..."
            datos={datos}
            onDato={onDato}
            required
          />
          <FieldTextarea
            label="Observaciones adicionales"
            name="observaciones"
            datos={datos}
            onDato={onDato}
          />
          <UploadArea />
        </div>
      );

    // ── COMERCIAL ────────────────────────────────────────────

    case 'descuento_no_aplicado':
      return (
        <div className="space-y-3">
          <FieldFacturaSearch
            label="Factura relacionada"
            name="factura"
            facturas={facturas}
            datos={datos}
            onDato={onDato}
            required
          />
          <div className={col2}>
            <FieldNumber
              label="Monto descuento no aplicado"
              name="monto"
              placeholder="₡0"
              datos={datos}
              onDato={onDato}
              required
            />
            <FieldSelect
              label="Tipo de descuento"
              name="tipo_descuento"
              options={['Comercial estándar', 'Por volumen', 'Promocional', 'Otro']}
              datos={datos}
              onDato={onDato}
              required
            />
          </div>
          <FieldText label="Marca / Producto afectado" name="marca" datos={datos} onDato={onDato} />
          <FieldTextarea
            label="Justificación"
            name="justificacion"
            datos={datos}
            onDato={onDato}
            required
          />
          <UploadArea />
        </div>
      );

    case 'diferencia_precio':
      return (
        <div className="space-y-3">
          <FieldFacturaSearch
            label="Factura relacionada"
            name="factura"
            facturas={facturas}
            datos={datos}
            onDato={onDato}
            required
          />
          <div className={col2}>
            <FieldNumber
              label="Precio facturado"
              name="precio_facturado"
              placeholder="₡0"
              datos={datos}
              onDato={onDato}
              required
            />
            <FieldNumber
              label="Precio correcto"
              name="precio_correcto"
              placeholder="₡0"
              datos={datos}
              onDato={onDato}
              required
            />
          </div>
          {dif !== null && (
            <div>
              <label className={labelCls}>Diferencia (calculada)</label>
              <input
                readOnly
                value={
                  dif > 0
                    ? fmtCRC(dif) + ' a favor del cliente'
                    : dif < 0
                      ? fmtCRC(Math.abs(dif)) + ' cobrado de más'
                      : '—'
                }
                className={readonlyCls + (dif > 0 ? ' !text-red-500' : '')}
              />
            </div>
          )}
          <FieldTextarea
            label="Justificación"
            name="justificacion"
            datos={datos}
            onDato={onDato}
            required
          />
          <UploadArea />
        </div>
      );

    case 'regalia_bonificacion':
      return (
        <div className="space-y-3">
          <FieldFacturaSearch
            label="Factura relacionada"
            name="factura"
            facturas={facturas}
            incluirNinguna
            datos={datos}
            onDato={onDato}
          />
          <div className={col2}>
            <FieldSelect
              label="Tipo"
              name="tipo_regalia"
              options={['Regalía', 'Bonificación', 'Cortesía']}
              datos={datos}
              onDato={onDato}
              required
            />
            <FieldNumber
              label="Monto"
              name="monto"
              placeholder="₡0"
              datos={datos}
              onDato={onDato}
              required
            />
          </div>
          <FieldTextarea
            label="Justificación"
            name="justificacion"
            datos={datos}
            onDato={onDato}
            required
          />
          <UploadArea />
        </div>
      );

    case 'beneficio_mercadeo':
      return (
        <div className="space-y-3">
          <FieldFacturaSearch
            label="Factura relacionada"
            name="factura"
            facturas={facturas}
            incluirNinguna
            datos={datos}
            onDato={onDato}
          />
          <div className={col2}>
            <FieldText label="Marca" name="marca" datos={datos} onDato={onDato} required />
            <FieldText
              label="Vigencia"
              name="vigencia"
              placeholder="Ej: Mayo 2026"
              datos={datos}
              onDato={onDato}
            />
          </div>
          <FieldText
            label="Tipo de beneficio"
            name="tipo_beneficio"
            placeholder="Ej: Regalía por volumen de compra"
            datos={datos}
            onDato={onDato}
            required
          />
          <FieldNumber label="Monto" name="monto" placeholder="₡0" datos={datos} onDato={onDato} />
          <FieldTextarea
            label="Justificación"
            name="justificacion"
            datos={datos}
            onDato={onDato}
            required
          />
          <UploadArea />
        </div>
      );

    // ── LOGÍSTICA ────────────────────────────────────────────

    case 'mercaderia_faltante':
      return (
        <div className="space-y-3">
          <FieldFacturaSearch
            label="Factura relacionada"
            name="factura"
            facturas={facturas}
            datos={datos}
            onDato={onDato}
            required
          />
          <FieldTextarea
            label="Descripción de mercadería faltante"
            name="descripcion"
            datos={datos}
            onDato={onDato}
            required
          />
          <div className={col2}>
            <FieldNumber
              label="Cantidad"
              name="cantidad"
              placeholder="0"
              datos={datos}
              onDato={onDato}
              required
            />
            <FieldNumber
              label="Monto"
              name="monto"
              placeholder="₡0"
              datos={datos}
              onDato={onDato}
              required
            />
          </div>
          <FieldTextarea
            label="Justificación"
            name="justificacion"
            datos={datos}
            onDato={onDato}
            required
          />
          <UploadArea obligatorio />
        </div>
      );

    case 'devolucion_mercaderia':
      return (
        <div className="space-y-3">
          <FieldFacturaSearch
            label="Factura relacionada"
            name="factura"
            facturas={facturas}
            datos={datos}
            onDato={onDato}
            required
          />
          <FieldSelect
            label="Motivo de devolución"
            name="motivo"
            options={[
              'Mercadería defectuosa',
              'Mercadería equivocada',
              'Mercadería en mal estado',
              'Otra',
            ]}
            datos={datos}
            onDato={onDato}
            required
          />
          <div className={col2}>
            <FieldNumber
              label="Cantidad"
              name="cantidad"
              placeholder="0"
              datos={datos}
              onDato={onDato}
              required
            />
            <FieldNumber
              label="Monto"
              name="monto"
              placeholder="₡0"
              datos={datos}
              onDato={onDato}
              required
            />
          </div>
          <FieldTextarea
            label="Justificación"
            name="justificacion"
            datos={datos}
            onDato={onDato}
            required
          />
          <UploadArea obligatorio />
        </div>
      );

    case 'garantias':
      return (
        <div className="space-y-3">
          <FieldFacturaSearch
            label="Factura relacionada"
            name="factura"
            facturas={facturas}
            datos={datos}
            onDato={onDato}
            required
          />
          <FieldTextarea
            label="Descripción del producto"
            name="descripcion"
            datos={datos}
            onDato={onDato}
            required
          />
          <div className={col2}>
            <FieldSelect
              label="Motivo de garantía"
              name="motivo"
              options={['Defecto de fábrica', 'Daño en transporte', 'Producto incompleto', 'Otra']}
              datos={datos}
              onDato={onDato}
              required
            />
            <FieldNumber
              label="Monto"
              name="monto"
              placeholder="₡0"
              datos={datos}
              onDato={onDato}
              required
            />
          </div>
          <FieldTextarea
            label="Justificación"
            name="justificacion"
            datos={datos}
            onDato={onDato}
            required
          />
          <UploadArea obligatorio />
        </div>
      );

    case 'refacturacion':
      return (
        <div className="space-y-3">
          <FieldFacturaSearch
            label="Factura relacionada"
            name="factura"
            facturas={facturas}
            datos={datos}
            onDato={onDato}
            required
          />
          <FieldSelect
            label="Motivo de refacturación"
            name="motivo"
            options={[
              'Cliente no acepta nota de crédito',
              'Plazo incorrecto',
              'Fecha incorrecta (entrega mes siguiente)',
              'Error en datos del cliente',
              'Otro',
            ]}
            datos={datos}
            onDato={onDato}
            required
          />
          <div className={col2}>
            <FieldText
              label="Nueva condición solicitada"
              name="nueva_condicion"
              datos={datos}
              onDato={onDato}
            />
            <FieldSelect
              label="Dirigida a"
              name="dirigida_a"
              options={['Coordinador', 'Área comercial']}
              datos={datos}
              onDato={onDato}
              required
            />
          </div>
          <FieldTextarea
            label="Justificación"
            name="justificacion"
            datos={datos}
            onDato={onDato}
            required
          />
          <UploadArea />
        </div>
      );

    // ── OTRO ─────────────────────────────────────────────────

    case 'otra_solicitud':
      return (
        <div className="space-y-3">
          <FieldText
            label="Asunto"
            name="asunto"
            placeholder="Describa brevemente el tema"
            datos={datos}
            onDato={onDato}
            required
          />
          <FieldTextarea
            label="Descripción detallada"
            name="justificacion"
            placeholder="Explique la solicitud con el mayor detalle posible..."
            datos={datos}
            onDato={onDato}
            required
          />
          <UploadArea />
        </div>
      );

    default:
      return <p className="text-[13px] text-gray-400 py-4 text-center">Tipo desconocido: {tipo}</p>;
  }
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL EXPORTADO
// ═══════════════════════════════════════════════════════════════

export default function WizardNuevaSolicitud({
  clienteCod,
  clienteNombre,
  limiteActual,
  moraTotal,
  diasAtraso,
  creditoDisponible,
  condicionPago,
  facturas,
  onCancel,
  onSuccess,
  onPasoChange,
}: WizardProps) {
  const [paso, setPaso] = useState<1 | 2 | 3>(1);

  function irAPaso(p: 1 | 2 | 3) {
    setPaso(p);
    onPasoChange?.(p);
  }
  const [destinatario, setDestinatario] = useState<Destinatario | null>(null);
  const [tipoSlug, setTipoSlug] = useState<string | null>(null);
  const [para, setPara] = useState('');
  const [cc, setCc] = useState<string[]>([]);
  const [datos, setDatos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState<{
    emailSent: boolean;
    emailTo: string | null;
  } | null>(null);

  const { enviar: enviarSolicitud } = useCrearSolicitudController();

  const onDato = useCallback((k: string, v: string) => setDatos((p) => ({ ...p, [k]: v })), []);
  const addCc = useCallback((v: string) => setCc((p) => [...p, v]), []);
  const removeCc = useCallback((v: string) => setCc((p) => p.filter((x) => x !== v)), []);

  function elegirDestinatario(d: Destinatario) {
    setDestinatario(d);
    if (TIPOS_POR_DEST[d].length === 1) {
      setTipoSlug(TIPOS_POR_DEST[d][0].value);
      irAPaso(3);
    } else irAPaso(2);
  }

  function elegirTipo(slug: string) {
    setTipoSlug(slug);
    irAPaso(3);
  }

  function retroceder() {
    setError('');
    if (paso === 3) {
      if (destinatario && TIPOS_POR_DEST[destinatario].length === 1) {
        setDestinatario(null);
        setTipoSlug(null);
        irAPaso(1);
      } else {
        setTipoSlug(null);
        irAPaso(2);
      }
    } else if (paso === 2) {
      setDestinatario(null);
      irAPaso(1);
    } else if (paso === 1) onCancel();
  }

  const tipoLabel =
    destinatario && tipoSlug
      ? (TIPOS_POR_DEST[destinatario].find((t) => t.value === tipoSlug)?.label ?? tipoSlug)
      : '';

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!destinatario || !tipoSlug) return;
    const justif = datos['justificacion'] || datos['asunto'] || '';
    if (!justif.trim()) {
      setError('La justificación o descripción es obligatoria');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // El correo sale con la cuenta de Gmail del analista (el backend usa su refresh token guardado)
      const d = await enviarSolicitud({
        tipo: tipoSlug,
        destinatario,
        cliente_cod: clienteCod,
        cliente_nombre: clienteNombre,
        justificacion: justif,
        para_email: para.trim() || null,
        cc_emails: cc.length > 0 ? cc : null,
        datos,
        monto_actual: limiteActual > 0 ? limiteActual : undefined,
        monto_solicitado: datos['limite_solicitado']
          ? parseFloat(datos['limite_solicitado'])
          : undefined,
      });
      if (d.email_error)
        setError(`Solicitud guardada, pero el correo no se envió: ${d.email_error}`);
      setSuccessInfo({ emailSent: d.email_sent ?? false, emailTo: d.email_to ?? null });
    } catch (err) {
      setError(mensajeError(err, 'Error al enviar la solicitud'));
    } finally {
      setLoading(false);
    }
  }

  // ── Pantalla de éxito ────────────────────────────────────────────────
  if (successInfo) {
    const tipoLabel =
      destinatario && tipoSlug
        ? (TIPOS_POR_DEST[destinatario].find((t) => t.value === tipoSlug)?.label ?? tipoSlug)
        : '';
    return (
      <div className="flex flex-col items-center text-center py-6 gap-4">
        <div className="rounded-full p-4" style={{ backgroundColor: '#dcfce7' }}>
          <CheckCircle2 size={36} style={{ color: '#16a34a' }} />
        </div>
        <div>
          <p className="text-[16px] font-bold text-gray-800 mb-1">¡Solicitud enviada!</p>
          <p className="text-[13px] text-gray-500">
            <span className="font-semibold">{tipoLabel}</span> para{' '}
            <span className="font-semibold">{clienteNombre}</span>
          </p>
        </div>
        {successInfo.emailSent && successInfo.emailTo && (
          <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 flex items-center gap-2">
            <Mail size={14} className="text-green-600 flex-shrink-0" />
            <p className="text-[12px] text-green-700">
              Correo enviado a <span className="font-bold">{successInfo.emailTo}</span>
            </p>
          </div>
        )}
        {!successInfo.emailSent && (
          <p className="text-[11px] text-gray-400">
            El coordinador recibirá la notificación en la app.
          </p>
        )}
        <button
          type="button"
          onClick={onSuccess}
          className="mt-2 rounded-xl px-6 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"
          style={{ backgroundColor: '#009ee3' }}
        >
          Ir a solicitudes
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* ── CONTENIDO POR PASO ──────────────────────────────── */}

      {paso === 1 && <SelectorDestinatario onSelect={elegirDestinatario} />}

      {paso === 2 && destinatario && (
        <SelectorTipo destinatario={destinatario} onSelect={elegirTipo} />
      )}

      {paso === 3 && destinatario && tipoSlug && (
        <form id="wizard-form" onSubmit={enviar} className="space-y-0">
          {error && (
            <div className="mb-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-[12px] text-red-700">
              {error}
            </div>
          )}
          <SeccionEmails
            para={para}
            onParaChange={setPara}
            cc={cc}
            onCcAdd={addCc}
            onCcRemove={removeCc}
          />
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div
              className="px-4 py-2.5 border-b border-gray-100"
              style={{ backgroundColor: '#f8fafc' }}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Detalle de la solicitud
              </p>
            </div>
            <div className="px-4 py-3">
              <FormularioDetalle
                tipo={tipoSlug}
                limiteActual={limiteActual}
                moraTotal={moraTotal}
                diasAtraso={diasAtraso}
                creditoDisponible={creditoDisponible}
                condicionPago={condicionPago}
                facturas={facturas}
                datos={datos}
                onDato={onDato}
              />
            </div>
          </div>
        </form>
      )}

      {/* ── BOTONES DE NAVEGACIÓN ──────────────────────────── */}
      <div className="flex items-center justify-between gap-3 pt-5">
        <button
          type="button"
          onClick={retroceder}
          className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition"
        >
          {paso === 1 ? 'Cancelar' : '← Volver'}
        </button>
        {paso === 3 && (
          <button
            type="submit"
            form="wizard-form"
            disabled={loading}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#009ee3' }}
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>{' '}
                Enviando...
              </>
            ) : (
              <>
                Enviar solicitud <ChevronRight size={15} />
              </>
            )}
          </button>
        )}
      </div>

      {/* Info visual del tipo seleccionado */}
      {paso === 3 && tipoLabel && (
        <p className="text-[11px] text-gray-400 text-center pt-1">
          {DEST_LABEL[destinatario!]} · {tipoLabel}
        </p>
      )}
    </div>
  );
}
