'use client';

/**
 * ModalNuevaSolicitud — Wizard de 3 pasos
 *
 * Paso 1: Seleccionar destinatario (4 tarjetas)
 * Paso 2: Seleccionar tipo de solicitud
 * Paso 3: Llenar formulario específico por tipo
 */

import { useState, useCallback } from 'react';
import {
  useCrearSolicitudController,
  mensajeError,
} from '@/views/solicitudes/hooks/use-crear-solicitud-controller';
import {
  ArrowLeft,
  X,
  UserCheck,
  Building2,
  Truck,
  MoreHorizontal,
  Upload,
  Mail,
  Plus,
  ChevronRight,
} from 'lucide-react';
import { fmtCRC } from '@/lib/utils/formato';
import type { Factura } from '@/types/database';

// ═══════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════

type Destinatario = 'coordinador' | 'comercial' | 'logistica' | 'otro';

interface TipoOpt {
  value: string;
  label: string;
}

interface Props {
  clienteCod: string;
  clienteNombre: string;
  limiteActual: number;
  moraTotal: number;
  diasAtraso: string; // tramo peor, ej: "61-90 días"
  creditoDisponible: number | null;
  condicionPago: string;
  facturas: Factura[];
  onClose: () => void;
  onSuccess: () => void;
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE TIPOS POR DESTINATARIO
// ═══════════════════════════════════════════════════════════════

const TIPOS_POR_DESTINATARIO: Record<Destinatario, TipoOpt[]> = {
  coordinador: [
    { value: 'aumento_limite', label: 'Aumento de límite de crédito' },
    { value: 'excepcion_credito', label: 'Excepción de crédito' },
    { value: 'cambio_condicion', label: 'Cambio de condición de pago' },
    { value: 'suspension_temporal', label: 'Suspensión temporal' },
    { value: 'reactivacion_cliente', label: 'Reactivación de cliente' },
    { value: 'caso_especial', label: 'Casos especiales' },
  ],
  comercial: [
    { value: 'descuento_no_aplicado', label: 'Descuento no aplicado' },
    { value: 'diferencia_precio', label: 'Diferencia de precio' },
    { value: 'regalia_bonificacion', label: 'Regalía / Bonificación' },
    { value: 'beneficio_mercadeo', label: 'Beneficio de mercadeo / Apoyo de marca' },
  ],
  logistica: [
    { value: 'mercaderia_faltante', label: 'Mercadería faltante' },
    { value: 'devolucion_mercaderia', label: 'Devolución de mercadería' },
    { value: 'garantias', label: 'Garantías' },
    { value: 'refacturacion', label: 'Refacturación' },
  ],
  otro: [{ value: 'otra_solicitud', label: 'Otra solicitud' }],
};

const DESTINATARIO_LABEL: Record<Destinatario, string> = {
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
  'w-full rounded-xl border border-gray-100 px-3 py-2 text-[13px] text-gray-400 bg-gray-50 ' +
  'cursor-default select-all';

const labelCls = 'block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1';

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTES MENORES
// ═══════════════════════════════════════════════════════════════

function StepIndicator({ paso }: { paso: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: 'Destinatario' },
    { n: 2, label: 'Tipo' },
    { n: 3, label: 'Detalle' },
  ];
  return (
    <div className="flex items-center justify-center gap-0 py-3">
      {steps.map((s, i) => {
        const done = paso > s.n;
        const active = paso === s.n;
        return (
          <div key={s.n} className="flex items-center">
            <div className="flex flex-col items-center gap-0.5">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
                style={{
                  backgroundColor: active ? '#009ee3' : done ? '#009ee3' : '#e5e7eb',
                  color: active || done ? '#fff' : '#9ca3af',
                }}
              >
                {done ? '✓' : s.n}
              </div>
              <span
                className="text-[10px] font-medium whitespace-nowrap"
                style={{ color: active ? '#009ee3' : done ? '#009ee3' : '#9ca3af' }}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="w-12 h-0.5 mb-3 mx-1 transition-all"
                style={{ backgroundColor: paso > s.n ? '#009ee3' : '#e5e7eb' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Campo de email CC con tags eliminables */
function CcTags({
  tags,
  onAdd,
  onRemove,
}: {
  tags: string[];
  onAdd: (email: string) => void;
  onRemove: (email: string) => void;
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

/** Sección superior de correos (Para + CC) — presente en todos los formularios */
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

/** Área de upload de archivos */
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

// ═══════════════════════════════════════════════════════════════
// PASO 1 — SELECTOR DE DESTINATARIO
// ═══════════════════════════════════════════════════════════════

function SelectorDestinatario({ onSelect }: { onSelect: (d: Destinatario) => void }) {
  const cards = [
    {
      id: 'coordinador' as Destinatario,
      label: 'Coordinador',
      sub: 'Límites, excepciones, suspensiones, casos especiales',
      icon: <UserCheck size={22} />,
      color: '#009ee3',
      bg: '#e0f2fe',
      border: '#bae6fd',
    },
    {
      id: 'comercial' as Destinatario,
      label: 'Área comercial',
      sub: 'Descuentos, precios, regalías, beneficios de marca',
      icon: <Building2 size={22} />,
      color: '#16a34a',
      bg: '#dcfce7',
      border: '#bbf7d0',
    },
    {
      id: 'logistica' as Destinatario,
      label: 'Área logística',
      sub: 'Devoluciones, faltantes, garantías, refacturaciones',
      icon: <Truck size={22} />,
      color: '#ca8a04',
      bg: '#fef9c3',
      border: '#fde68a',
    },
    {
      id: 'otro' as Destinatario,
      label: 'Otro',
      sub: 'Solicitud no contemplada en las opciones anteriores',
      icon: <MoreHorizontal size={22} />,
      color: '#9ca3af',
      bg: '#f9fafb',
      border: '#e5e7eb',
      dashed: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-1">
      {cards.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className="flex items-start gap-3 rounded-xl p-4 text-left transition hover:scale-[1.01] active:scale-[0.99]"
          style={{
            border: `${c.dashed ? '2px dashed' : '1.5px solid'} ${c.border}`,
            backgroundColor: c.bg,
          }}
        >
          <div
            className="flex-shrink-0 rounded-xl p-2 mt-0.5"
            style={{ backgroundColor: c.dashed ? '#f3f4f6' : `${c.color}20`, color: c.color }}
          >
            {c.icon}
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-gray-800 mb-0.5">{c.label}</p>
            <p className="text-[12px] text-gray-500 leading-snug">{c.sub}</p>
          </div>
          <ChevronRight
            size={14}
            className="flex-shrink-0 mt-1 text-gray-300 self-center ml-auto"
          />
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PASO 2 — SELECTOR DE TIPO
// ═══════════════════════════════════════════════════════════════

function SelectorTipo({
  destinatario,
  onSelect,
}: {
  destinatario: Destinatario;
  onSelect: (tipo: string) => void;
}) {
  const tipos = TIPOS_POR_DESTINATARIO[destinatario];

  const COLOR: Record<Destinatario, { bg: string; text: string; border: string }> = {
    coordinador: { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' },
    comercial: { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
    logistica: { bg: '#fef9c3', text: '#a16207', border: '#fde68a' },
    otro: { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' },
  };

  const sty = COLOR[destinatario];

  return (
    <div className="space-y-2 p-1">
      <p className="text-[12px] text-gray-400 mb-3">
        Seleccioná el tipo de solicitud para{' '}
        <span className="font-semibold" style={{ color: sty.text }}>
          {DESTINATARIO_LABEL[destinatario]}
        </span>
      </p>
      {tipos.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onSelect(t.value)}
          className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left transition hover:opacity-90 active:scale-[0.99]"
          style={{ backgroundColor: sty.bg, border: `1px solid ${sty.border}` }}
        >
          <span className="text-[13px] font-semibold" style={{ color: sty.text }}>
            {t.label}
          </span>
          <ChevronRight size={14} style={{ color: sty.text, opacity: 0.6 }} />
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PASO 3 — FORMULARIOS ESPECÍFICOS POR TIPO
// ═══════════════════════════════════════════════════════════════

interface FormProps {
  tipo: string;
  // Datos del cliente para campos readonly
  limiteActual: number;
  moraTotal: number;
  diasAtraso: string;
  creditoDisponible: number | null;
  condicionPago: string;
  // Facturas para selects
  facturas: Factura[];
  // Estado del formulario
  datos: Record<string, string>;
  onDato: (key: string, val: string) => void;
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

function FieldReadonly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input readOnly value={value} className={readonlyCls} />
    </div>
  );
}

function FieldFactura({
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
        <option value="">— Seleccionar factura —</option>
        {incluirNinguna && <option value="ninguna">Ninguna</option>}
        {facturas.slice(0, 80).map((f) => (
          <option key={f.id} value={String(f.documento)}>
            {f.documento} | {fmtCRC(f.saldo)} | vence {f.fecha_vencimiento ?? '—'}
          </option>
        ))}
      </select>
    </div>
  );
}

function FormularioSolicitud({
  tipo,
  limiteActual,
  moraTotal,
  diasAtraso,
  creditoDisponible,
  condicionPago,
  facturas,
  datos,
  onDato,
}: FormProps) {
  // Diferencia de precio — cálculo en tiempo real
  const precioFacturado = parseFloat(datos['precio_facturado'] ?? '0') || 0;
  const precioCorrect = parseFloat(datos['precio_correcto'] ?? '0') || 0;
  const diferencia =
    precioFacturado > 0 && precioCorrect > 0 ? precioFacturado - precioCorrect : null;

  const col2 = 'grid grid-cols-2 gap-3';

  switch (tipo) {
    // ── COORDINADOR ─────────────────────────────────────────────

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

    // ── ÁREA COMERCIAL ──────────────────────────────────────────

    case 'descuento_no_aplicado':
      return (
        <div className="space-y-3">
          <FieldFactura
            label="Factura relacionada"
            name="factura"
            facturas={facturas}
            datos={datos}
            onDato={onDato}
            required
          />
          <div className={col2}>
            <FieldNumber
              label="Monto del descuento no aplicado"
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
          <FieldFactura
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
          {diferencia !== null && (
            <div>
              <label className={labelCls}>Diferencia (calculada)</label>
              <input
                readOnly
                value={
                  diferencia > 0
                    ? fmtCRC(diferencia) + ' a favor del cliente'
                    : diferencia < 0
                      ? fmtCRC(Math.abs(diferencia)) + ' cobrado de más'
                      : '—'
                }
                className={readonlyCls + (diferencia > 0 ? ' !text-red-500' : '')}
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
          <FieldFactura
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
          <FieldFactura
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

    // ── ÁREA LOGÍSTICA ──────────────────────────────────────────

    case 'mercaderia_faltante':
      return (
        <div className="space-y-3">
          <FieldFactura
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
          <FieldFactura
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
          <FieldFactura
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
          <FieldFactura
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

    // ── OTRO ────────────────────────────────────────────────────

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
// COMPONENTE PRINCIPAL — MODAL WIZARD
// ═══════════════════════════════════════════════════════════════

export default function ModalNuevaSolicitud({
  clienteCod,
  clienteNombre,
  limiteActual,
  moraTotal,
  diasAtraso,
  creditoDisponible,
  condicionPago,
  facturas,
  onClose,
  onSuccess,
}: Props) {
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [destinatario, setDestinatario] = useState<Destinatario | null>(null);
  const [tipoSlug, setTipoSlug] = useState<string | null>(null);
  const [para, setPara] = useState('');
  const [cc, setCc] = useState<string[]>([]);
  const [datos, setDatos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { enviar: enviarSolicitud } = useCrearSolicitudController();

  const onDato = useCallback(
    (key: string, val: string) => setDatos((prev) => ({ ...prev, [key]: val })),
    [],
  );

  const addCc = useCallback((v: string) => setCc((prev) => [...prev, v]), []);
  const removeCc = useCallback((v: string) => setCc((prev) => prev.filter((x) => x !== v)), []);

  function elegirDestinatario(d: Destinatario) {
    setDestinatario(d);
    // Si solo hay 1 tipo (caso "otro"), saltar directo al paso 3
    if (TIPOS_POR_DESTINATARIO[d].length === 1) {
      setTipoSlug(TIPOS_POR_DESTINATARIO[d][0].value);
      setPaso(3);
    } else {
      setPaso(2);
    }
  }

  function elegirTipo(slug: string) {
    setTipoSlug(slug);
    setPaso(3);
  }

  function retroceder() {
    setError('');
    if (paso === 3) {
      // Si el destinatario tenía 1 solo tipo, volver al paso 1 directamente
      if (destinatario && TIPOS_POR_DESTINATARIO[destinatario].length === 1) {
        setDestinatario(null);
        setTipoSlug(null);
        setPaso(1);
      } else {
        setTipoSlug(null);
        setPaso(2);
      }
    } else if (paso === 2) {
      setDestinatario(null);
      setPaso(1);
    }
  }

  // Título del tipo actual para el header
  const tipoLabel =
    destinatario && tipoSlug
      ? (TIPOS_POR_DESTINATARIO[destinatario].find((t) => t.value === tipoSlug)?.label ?? tipoSlug)
      : '';

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!destinatario || !tipoSlug) return;

    // Validación mínima: justificacion o asunto obligatorio
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
        datos: datos,
        monto_actual: limiteActual > 0 ? limiteActual : undefined,
        monto_solicitado: datos['limite_solicitado']
          ? parseFloat(datos['limite_solicitado'])
          : undefined,
      });

      if (d.email_error)
        setError(`Solicitud guardada, pero el correo no se envió: ${d.email_error}`);
      else onSuccess();
    } catch (err) {
      setError(mensajeError(err, 'Error al enviar la solicitud'));
    } finally {
      setLoading(false);
    }
  }

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
    >
      <div
        className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: '92vh' }}
      >
        {/* ── HEADER ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          {paso > 1 && (
            <button
              type="button"
              onClick={retroceder}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 transition flex-shrink-0"
              title="Volver"
            >
              <ArrowLeft size={15} className="text-gray-500" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-bold text-gray-900 leading-tight">
              {paso === 1
                ? 'Nueva solicitud'
                : paso === 2
                  ? DESTINATARIO_LABEL[destinatario!]
                  : tipoLabel}
            </h2>
            <p className="text-[12px] text-gray-400 truncate mt-0.5">{clienteNombre}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 transition flex-shrink-0"
          >
            <X size={15} className="text-gray-500" />
          </button>
        </div>

        {/* ── STEP INDICATOR ─────────────────────────────────── */}
        <div className="px-5 border-b border-gray-50 flex-shrink-0">
          <StepIndicator paso={paso} />
        </div>

        {/* ── CONTENIDO (scrollable) ──────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {paso === 1 && (
            <div className="p-4">
              <SelectorDestinatario onSelect={elegirDestinatario} />
            </div>
          )}

          {paso === 2 && destinatario && (
            <div className="p-4">
              <SelectorTipo destinatario={destinatario} onSelect={elegirTipo} />
            </div>
          )}

          {paso === 3 && destinatario && tipoSlug && (
            <form id="form-solicitud" onSubmit={enviar} className="p-4 space-y-0">
              {error && (
                <div className="mb-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-[12px] text-red-700">
                  {error}
                </div>
              )}

              {/* Sección de correos — siempre arriba */}
              <SeccionEmails
                para={para}
                onParaChange={setPara}
                cc={cc}
                onCcAdd={addCc}
                onCcRemove={removeCc}
              />

              {/* Separador de sección */}
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
                  <FormularioSolicitud
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
        </div>

        {/* ── FOOTER con botones — solo en paso 3 ─────────────── */}
        {paso === 3 && (
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="form-solicitud"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#009ee3' }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
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
                  </svg>
                  Enviando...
                </span>
              ) : (
                <>
                  Enviar solicitud <ChevronRight size={15} />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
