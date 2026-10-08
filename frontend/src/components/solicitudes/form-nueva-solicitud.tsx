'use client';

/**
 * FormNuevaSolicitud — Flujo completo desde el sidebar (4 pasos)
 *
 * Paso 0: Seleccionar cliente — búsqueda por nombre / código / vendedor
 * Paso 1: Destinatario  ─┐
 * Paso 2: Tipo           ├─ WizardNuevaSolicitud
 * Paso 3: Formulario    ─┘
 */

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Search, X, ArrowRight } from 'lucide-react';
import { useCrearSolicitudController } from '@/views/solicitudes/hooks/use-crear-solicitud-controller';
import { fmtCRC } from '@/lib/utils/formato';
import WizardNuevaSolicitud, { StepIndicator } from './wizard-nueva-solicitud';
import type { ClienteConDatos } from '@/views/solicitudes/types';
import type { Factura } from '@/types/database';

// ──────────────────────────────────────────────────────────────────────────
// TIPOS DE BÚSQUEDA
// ──────────────────────────────────────────────────────────────────────────

type TipoBusqueda = 'nombre' | 'codigo' | 'vendedor_nombre' | 'vendedor_cod';

const TIPO_OPCIONES: { value: TipoBusqueda; label: string; placeholder: string }[] = [
  { value: 'nombre', label: 'Nombre cliente', placeholder: 'Buscar por nombre comercial...' },
  { value: 'codigo', label: 'Código cliente', placeholder: 'Ej: 060202229' },
  {
    value: 'vendedor_nombre',
    label: 'Nombre vendedor',
    placeholder: 'Buscar por nombre del vendedor...',
  },
  { value: 'vendedor_cod', label: 'Código vendedor', placeholder: 'Ej: VEN-001' },
];

// ──────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────

const TRAMO_CFG: Record<string, { bg: string; text: string }> = {
  '1-30 días': { bg: '#fff7ed', text: '#c2410c' },
  '31-60 días': { bg: '#fff7ed', text: '#ea580c' },
  '61-90 días': { bg: '#fef2f2', text: '#dc2626' },
  '91-120 días': { bg: '#fef2f2', text: '#b91c1c' },
  '+120 días': { bg: '#fef2f2', text: '#991b1b' },
  'Al día': { bg: '#f0fdf4', text: '#16a34a' },
};

function moraColor(mora: number): string {
  if (mora <= 0) return '#94a3b8';
  if (mora > 5_000_000) return '#dc2626';
  if (mora > 1_000_000) return '#f59e0b';
  return '#64748b';
}

function initials(nombre: string): string {
  const parts = nombre.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return nombre.slice(0, 2).toUpperCase();
}

// ──────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────────────────────────────────

interface Props {
  userId: string;
  userEmail: string;
  clientes: ClienteConDatos[];
}

export default function FormNuevaSolicitud({ clientes }: Props) {
  const router = useRouter();
  const { cargarContextoCliente } = useCrearSolicitudController();

  // ── Paso 0: búsqueda ─────────────────────────────────────────────────
  const [tipoBusq, setTipoBusq] = useState<TipoBusqueda>('nombre');
  const [busqueda, setBusqueda] = useState('');
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // ── Confirmación de cliente ──────────────────────────────────────────
  const [clientePrev, setClientePrev] = useState<ClienteConDatos | null>(null); // preseleccionado (card)
  const [clienteSel, setClienteSel] = useState<ClienteConDatos | null>(null); // confirmado (avanza wizard)

  // ── Datos async al avanzar ────────────────────────────────────────────
  const [loadingData, setLoadingData] = useState(false);
  const [moraTotal, setMoraTotal] = useState(0);
  const [tramoPeor, setTramoPeor] = useState('Al día');
  const [creditoDisp, setCreditoDisp] = useState<number | null>(null);
  const [condicion, setCondicion] = useState('—');
  const [facturas, setFacturas] = useState<Factura[]>([]);

  // ── Paso wizard para indicador ────────────────────────────────────────
  const [pasoWizard, setPasoWizard] = useState(1);

  // ── Lista filtrada ────────────────────────────────────────────────────
  const q = busqueda.trim().toLowerCase();
  const clientesFiltrados = q
    ? clientes.filter((c) => {
        switch (tipoBusq) {
          case 'nombre':
            return c.cliente_nombre.toLowerCase().includes(q);
          case 'codigo':
            return c.cliente_cod.toLowerCase().includes(q);
          case 'vendedor_nombre':
            return c.vendedor_nombre.toLowerCase().includes(q);
          case 'vendedor_cod':
            return c.vendedor_nombre.toLowerCase().includes(q); // fallback
          default:
            return true;
        }
      })
    : clientes;

  // Max 60 resultados en la lista
  const listaVisible = clientesFiltrados.slice(0, 60);

  // ── Cargar datos al confirmar cliente ─────────────────────────────────
  const cargarDatosCliente = useCallback(async (c: ClienteConDatos) => {
    setLoadingData(true);
    try {
      // Facturas por contribuyente (igual que ficha) + maestro del cliente, en un solo endpoint
      const ctx = await cargarContextoCliente(c.cliente_cod).catch(() => null);
      setFacturas((ctx?.facturas ?? []) as Factura[]);

      // Mora y crédito ya vienen precalculados del servidor
      setMoraTotal(c.mora_total);
      setTramoPeor(c.tramo_peor);
      setCreditoDisp(c.limite_credito > 0 ? c.limite_credito - 0 : null);
      // (el total exacto de cartera no está en ClienteConDatos; la mora es suficiente para el form)

      // Condición de pago desde maestro_clientes
      const m = (ctx?.maestro ?? null) as {
        condicion_pago?: string | number | null;
        limite_credito?: number;
      } | null;
      setCondicion(m?.condicion_pago ? String(m.condicion_pago) : '—');
      if (m?.limite_credito) {
        // No tenemos total de cartera aquí, dejamos crédito disponible como null
        // (la ficha lo calcula correctamente; aquí es referencial)
        setCreditoDisp(null);
      }
    } finally {
      setLoadingData(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegirPrevio(c: ClienteConDatos) {
    setClientePrev(c);
    setBusqueda('');
  }

  function confirmarCliente() {
    if (!clientePrev) return;
    setClienteSel(clientePrev);
    setPasoWizard(1);
    cargarDatosCliente(clientePrev);
  }

  function volverAlCliente() {
    setClienteSel(null);
    setClientePrev(null);
    setPasoWizard(1);
    setFacturas([]);
  }

  const tipoCfg = TIPO_OPCIONES.find((t) => t.value === tipoBusq)!;
  const pasoIndicador = clienteSel ? pasoWizard + 1 : 1;

  return (
    <div style={{ backgroundColor: '#f0f4f8', minHeight: '100vh' }}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 sticky top-0 z-20">
        <p className="text-[12px] text-gray-400 mb-0.5">Solicitudes</p>
        <h1 className="text-[16px] font-semibold text-gray-800">Nueva solicitud</h1>
      </div>

      {/* ── Contenido ─────────────────────────────────────────────── */}
      <div className="px-5 py-6 flex flex-col items-center">
        {/* Step indicator */}
        <div className="w-full max-w-[700px] mb-6">
          <StepIndicator paso={pasoIndicador} totalPasos={4} offset={1} />
        </div>

        <div className="w-full max-w-[700px]">
          {/* ════════════════════════════════════════════════════════
              PASO 0 — selección de cliente
          ════════════════════════════════════════════════════════ */}
          {!clienteSel && (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
              {/* Título */}
              <div className="px-6 pt-5 pb-4 border-b border-gray-100">
                <p className="text-[15px] font-bold text-gray-800 mb-0.5">
                  ¿Para qué cliente es la solicitud?
                </p>
                <p className="text-[12px] text-gray-400">Buscá por nombre, código o vendedor</p>
              </div>

              <div className="px-6 py-4">
                {/* ── Buscador con tipo ──────────────────────────────── */}
                <div className="flex gap-2 mb-4">
                  {/* Dropdown tipo de búsqueda */}
                  <div className="relative flex-shrink-0" ref={dropRef}>
                    <button
                      type="button"
                      onClick={() => setDropOpen((o) => !o)}
                      className="flex items-center gap-1.5 h-[38px] rounded-xl border border-gray-200 px-3 text-[12px] font-semibold text-gray-700 bg-white hover:bg-gray-50 transition whitespace-nowrap"
                    >
                      {tipoCfg.label}
                      <ChevronDown
                        size={12}
                        className={`transition-transform ${dropOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {dropOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setDropOpen(false)} />
                        <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden min-w-[180px]">
                          {TIPO_OPCIONES.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                setTipoBusq(opt.value);
                                setBusqueda('');
                                setDropOpen(false);
                              }}
                              className="w-full text-left px-4 py-2.5 text-[12px] font-medium hover:bg-gray-50 transition"
                              style={{
                                color: tipoBusq === opt.value ? '#009ee3' : '#374151',
                                fontWeight: tipoBusq === opt.value ? 700 : 500,
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Input de búsqueda */}
                  <div className="relative flex-1">
                    <Search
                      size={13}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      value={busqueda}
                      onChange={(e) => {
                        setBusqueda(e.target.value);
                        setClientePrev(null);
                      }}
                      placeholder={tipoCfg.placeholder}
                      autoFocus
                      className="w-full h-[38px] rounded-xl border border-gray-200 pl-8 pr-8 text-[13px] text-gray-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                    />
                    {busqueda && (
                      <button
                        type="button"
                        onClick={() => {
                          setBusqueda('');
                          setClientePrev(null);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Card de confirmación (cuando hay preseleccionado) ── */}
                {clientePrev && (
                  <div
                    className="mb-4 rounded-xl border-2 overflow-hidden"
                    style={{ borderColor: '#009ee3', backgroundColor: '#f0f9ff' }}
                  >
                    <div className="px-4 py-3 flex items-center gap-3">
                      {/* Avatar */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-[13px] font-black"
                        style={{ backgroundColor: '#009ee3', color: '#fff' }}
                      >
                        {initials(clientePrev.cliente_nombre)}
                      </div>
                      {/* Datos */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-gray-900 truncate">
                          {clientePrev.cliente_nombre}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {clientePrev.cliente_cod}
                          {clientePrev.analista_nombre && clientePrev.analista_nombre !== '—' ? (
                            <>
                              {' '}
                              · <span className="text-gray-400">{clientePrev.analista_nombre}</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      {/* Mora */}
                      <div className="text-right flex-shrink-0">
                        <p
                          className="text-[13px] font-bold tabular-nums"
                          style={{ color: moraColor(clientePrev.mora_total) }}
                        >
                          {clientePrev.mora_total > 0 ? fmtCRC(clientePrev.mora_total) : '—'}
                        </p>
                        {clientePrev.tramo_peor !== 'Al día' && (
                          <span
                            className="text-[10px] font-bold rounded px-1.5 py-0.5"
                            style={{
                              backgroundColor: TRAMO_CFG[clientePrev.tramo_peor]?.bg ?? '#f1f5f9',
                              color: TRAMO_CFG[clientePrev.tramo_peor]?.text ?? '#64748b',
                            }}
                          >
                            {clientePrev.tramo_peor}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Botón continuar */}
                    <div
                      className="px-4 py-3 border-t flex items-center justify-between"
                      style={{ borderColor: '#bae6fd', backgroundColor: '#e0f2fe' }}
                    >
                      <p className="text-[12px] text-blue-600 font-medium">Cliente seleccionado</p>
                      <button
                        type="button"
                        onClick={confirmarCliente}
                        className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold text-white transition hover:opacity-90"
                        style={{ backgroundColor: '#009ee3' }}
                      >
                        Continuar <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Lista de clientes ──────────────────────────────── */}
                {!clientePrev && (
                  <div className="space-y-0.5 max-h-[380px] overflow-y-auto -mx-1">
                    {listaVisible.length === 0 && q ? (
                      <p className="text-[13px] text-gray-400 text-center py-10">
                        Sin resultados para &ldquo;{busqueda}&rdquo;
                      </p>
                    ) : (
                      listaVisible.map((c) => (
                        <button
                          key={c.cliente_cod}
                          type="button"
                          onClick={() => elegirPrevio(c)}
                          className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-gray-50 active:bg-gray-100 transition mx-1"
                          style={{ width: 'calc(100% - 8px)' }}
                        >
                          {/* Avatar */}
                          <div
                            className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                            style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}
                          >
                            {initials(c.cliente_nombre)}
                          </div>
                          {/* Info izquierda */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-gray-800 truncate">
                              {c.cliente_nombre}
                            </p>
                            <p className="text-[11px] text-gray-400 truncate">
                              {c.cliente_cod}
                              {c.analista_nombre && c.analista_nombre !== '—' ? (
                                <> · {c.analista_nombre}</>
                              ) : null}
                            </p>
                            {/* Vendedor — visible cuando se busca por vendedor */}
                            {(tipoBusq === 'vendedor_nombre' || tipoBusq === 'vendedor_cod') && (
                              <p className="text-[11px] text-gray-400 truncate">
                                Vendedor: {c.vendedor_nombre || '—'}
                              </p>
                            )}
                          </div>
                          {/* Mora + tramo */}
                          <div className="text-right flex-shrink-0">
                            {c.mora_total > 0 && (
                              <p
                                className="text-[12px] font-bold tabular-nums"
                                style={{ color: moraColor(c.mora_total) }}
                              >
                                {fmtCRC(c.mora_total)}
                              </p>
                            )}
                            {c.tramo_peor !== 'Al día' && (
                              <span
                                className="text-[10px] font-bold rounded px-1.5 py-0.5"
                                style={{
                                  backgroundColor: TRAMO_CFG[c.tramo_peor]?.bg ?? '#f1f5f9',
                                  color: TRAMO_CFG[c.tramo_peor]?.text ?? '#64748b',
                                }}
                              >
                                {c.tramo_peor}
                              </span>
                            )}
                            {c.estado_manual && c.estado_manual !== 'Normal' && (
                              <p
                                className="text-[10px] font-bold mt-0.5"
                                style={{
                                  color: c.estado_manual === 'Bloqueado' ? '#dc2626' : '#a16207',
                                }}
                              >
                                {c.estado_manual}
                              </p>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {/* Contador + cancelar */}
                <div className="flex justify-between items-center pt-3 mt-2 border-t border-gray-100">
                  <p className="text-[11px] text-gray-400">
                    {q
                      ? `${clientesFiltrados.length} cliente${clientesFiltrados.length !== 1 ? 's' : ''} encontrado${clientesFiltrados.length !== 1 ? 's' : ''}`
                      : `${clientes.length} clientes disponibles`}
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push('/solicitudes')}
                    className="text-[13px] font-semibold text-gray-500 hover:text-gray-700 transition"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════
              PASOS 1-3 — wizard
          ════════════════════════════════════════════════════════ */}
          {clienteSel && (
            <>
              {/* Chip del cliente confirmado */}
              <div className="rounded-xl bg-white border border-gray-100 shadow-sm px-4 py-3 mb-4 flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                  style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}
                >
                  {initials(clienteSel.cliente_nombre)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800 truncate">
                    {clienteSel.cliente_nombre}
                  </p>
                  <p className="text-[11px] text-gray-400">{clienteSel.cliente_cod}</p>
                </div>
                {clienteSel.tramo_peor !== 'Al día' && (
                  <span
                    className="text-[10px] font-bold rounded px-1.5 py-0.5 flex-shrink-0"
                    style={{
                      backgroundColor: TRAMO_CFG[clienteSel.tramo_peor]?.bg ?? '#f1f5f9',
                      color: TRAMO_CFG[clienteSel.tramo_peor]?.text ?? '#64748b',
                    }}
                  >
                    {clienteSel.tramo_peor}
                  </span>
                )}
                <button
                  type="button"
                  onClick={volverAlCliente}
                  className="text-[11px] font-semibold flex-shrink-0 transition hover:opacity-70"
                  style={{ color: '#009ee3' }}
                >
                  Cambiar
                </button>
              </div>

              {loadingData ? (
                <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-6 py-12 flex items-center justify-center">
                  <svg
                    className="animate-spin w-6 h-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{ color: '#009ee3' }}
                  >
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
                </div>
              ) : (
                <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-6 py-6">
                  <WizardNuevaSolicitud
                    clienteCod={clienteSel.cliente_cod}
                    clienteNombre={clienteSel.cliente_nombre}
                    limiteActual={clienteSel.limite_credito}
                    moraTotal={moraTotal}
                    diasAtraso={tramoPeor}
                    creditoDisponible={creditoDisp}
                    condicionPago={condicion}
                    facturas={facturas}
                    onCancel={volverAlCliente}
                    onSuccess={() => router.push('/solicitudes')}
                    onPasoChange={setPasoWizard}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
