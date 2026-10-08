'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Handshake,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Circle,
  Plus,
  Building2,
  Phone,
  Mail,
  CreditCard,
  User,
  Calendar,
  Tag,
  MessageCircle,
  ChevronDown,
  FileDown,
  Send,
  Search,
  Paperclip,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  MapPin,
  ExternalLink,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  exportarEstadoCuentaPDF,
  exportarEstadoCuentaExcel,
  generarEstadoCuentaBase64,
  generarEstadoCuentaExcelBase64,
  calcAging,
  estadoLabelExport,
  safeFilename,
  type CuentaBancaria,
  type SortFieldEstadoCuenta,
} from '@/lib/utils/estado-cuenta-export';
import { fmtM, fmtCRC, fmtCRC2, fmtFecha, hoyISO } from '@/lib/utils/formato';
import { useClienteAccionesController } from '@/views/clientes/hooks/use-cliente-acciones-controller';
import type { ApiError } from '@/shared/api/api-error';
import type { Cartera, MaestroCliente, Factura, Gestion, Promesa } from '@/types/database';
import FormNuevaGestion from './form-nueva-gestion';
import TablaGestionesCompacta, {
  KpiCard,
  fechaRelativa,
} from '@/components/gestiones/tabla-gestiones-base';
import SolicitudCard from '@/components/solicitudes/SolicitudCard';
import TabReportarPago from './tab-reportar-pago';
import TabSaldosFavor from '@/components/saldos-favor/tab-saldos-favor';
import DirectorioInput from '@/components/ui/DirectorioInput';
import TendenciaPagoCard from './TendenciaPagoCard';
import type { TendenciaPagoPunto } from '@/types/analisis-pagos';
import type { EstadoCuentaEnvioResponse, LogisticaBody } from '@/views/clientes/types';

// ── Tabs ───────────────────────────────────────────────────────────────
const TABS = [
  'Información',
  'Estado de Cuenta',
  'Gestiones',
  'Saldos a Favor',
  'Solicitudes',
  'Reportar Pago',
  'Logística y Cobro',
] as const;
type Tab = (typeof TABS)[number];

// ── Opciones del formulario de Logística y Cobro ───────────────────────
const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;
const METODOS_PAGO = [
  'Tarjeta / Compra Click',
  'SINPE Móvil',
  'Transferencia',
  'Efectivo',
  'Cheque',
  'Otros',
] as const;

// ── Aging tramos ───────────────────────────────────────────────────────
const AGING_TRAMOS = [
  { key: 'no_vencido', label: 'Al día', color: '#009ee3' },
  { key: 'mora_1_30', label: '1-30 días', color: '#f59e0b' },
  { key: 'mora_31_60', label: '31-60 días', color: '#f97316' },
  { key: 'mora_61_90', label: '61-90 días', color: '#ef4444' },
  { key: 'mora_91_120', label: '91-120 días', color: '#dc2626' },
  { key: 'mora_120_plus', label: '+120 días', color: '#991b1b' },
] as const;

// ── Colores de resultado de gestión ────────────────────────────────────
const RESULTADO_COLORS: Record<string, { bg: string; text: string }> = {
  'Promesa OK': { bg: '#dcfce7', text: '#15803d' },
  Pagó: { bg: '#dcfce7', text: '#15803d' },
  'No contestó': { bg: '#f1f5f9', text: '#64748b' },
  'No ubicado': { bg: '#fee2e2', text: '#dc2626' },
  'Email enviado': { bg: '#e0f2fe', text: '#0369a1' },
  Pendiente: { bg: '#fef9c3', text: '#a16207' },
  'Aceptó convenio': { bg: '#dcfce7', text: '#15803d' },
  'Llamar más tarde': { bg: '#f1f5f9', text: '#64748b' },
};

// ── Colores de estado de promesa ───────────────────────────────────────
const PROMESA_COLORS: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  PENDIENTE: { bg: '#fef9c3', text: '#a16207', icon: <Clock size={12} /> },
  CUMPLIDA: { bg: '#dcfce7', text: '#15803d', icon: <CheckCircle2 size={12} /> },
  INCUMPLIDA: { bg: '#fee2e2', text: '#dc2626', icon: <XCircle size={12} /> },
  ABONO_PARCIAL: { bg: '#e0f2fe', text: '#0369a1', icon: <Circle size={12} /> },
};

// ── Tipo ICP ───────────────────────────────────────────────────────────
export interface ICPData {
  icp_score: number;
  dias_prom_ponderado: number;
  clasificacion: string;
  n_pagos: number;
  n_facturas: number;
  pct_pagos_tarde: number;
  primer_pago: string | null;
  ultimo_pago: string | null;
  tendencia: number | null;
}

// ── Props ──────────────────────────────────────────────────────────────
interface Props {
  cartera: Cartera;
  maestro: MaestroCliente | null;
  facturas: Factura[];
  gestiones: Gestion[];
  promesas: Promesa[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  solicitudes: any[];
  solicitanteMap: Record<string, string>; // solicitante_id → nombre
  analistaNombre: string;
  analistaEmail: string; // correo del analista ASIGNADO al cliente
  analistaTelefono: string | null;
  analistaWhatsapp: string | null;
  userEmail: string;
  esCoordinador: boolean;
  soloLectura?: boolean; // Gerencia: ve todo, no puede registrar/editar nada
  backHref?: string; // destino del botón Volver (default: /clientes)
  volver?: string | null; // URL completa de origen -- se reusa en los links Anterior/Siguiente
  prevCod?: string | null;
  nextCod?: string | null;
  posicionEnLista?: number | null;
  totalEnLista?: number | null;
  icp?: ICPData | null;
  tendenciaPago?: TendenciaPagoPunto[];
  pedidosRetenidos?: {
    id_pedido: string;
    estado_sic: string;
    total_mercaderia: number;
    motivo_retencion: string | null;
  }[];
}

// ── Colores de urgencia por tramo ──────────────────────────────────────
const URGENCIA_CFG: Record<string, { bg: string; text: string }> = {
  '1-30 días': { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
  '31-60 días': { bg: 'rgba(249,115,22,0.15)', text: '#f97316' },
  '61-90 días': { bg: 'rgba(234,88,12,0.15)', text: '#ea580c' },
  '91-120 días': { bg: 'rgba(220,38,38,0.15)', text: '#dc2626' },
  '+120 días': { bg: 'rgba(185,28,28,0.15)', text: '#b91c1c' },
};

// ── Helpers Tab Estado de Cuenta ──────────────────────────────────────
function estadoFactura(f: Factura, hoy: string): { label: string; bg: string; color: string } {
  if (!f.saldo || f.saldo <= 0) return { label: 'Pagada', bg: '#f1f5f9', color: '#94a3b8' };
  if (!f.fecha_vencimiento) return { label: 'Sin fecha', bg: '#f1f5f9', color: '#94a3b8' };
  const diff = Math.floor(
    (new Date(hoy).getTime() - new Date(f.fecha_vencimiento).getTime()) / 86400000,
  );
  if (diff < 0) return { label: `Vence en ${Math.abs(diff)}d`, bg: '#dcfce7', color: '#15803d' };
  if (diff === 0) return { label: 'Vence hoy', bg: '#ffedd5', color: '#c2410c' };
  return { label: `Vencida ${diff}d`, bg: '#fee2e2', color: '#dc2626' };
}

function facturaEnTramo(f: Factura, tramo: string, hoy: string): boolean {
  if (tramo === 'Todos') return true;
  if (!f.fecha_vencimiento) return false;
  const diff = Math.floor(
    (new Date(hoy).getTime() - new Date(f.fecha_vencimiento).getTime()) / 86400000,
  );
  switch (tramo) {
    case 'Al día':
      return diff < 0;
    case '1-30 días':
      return diff >= 1 && diff <= 30;
    case '31-60 días':
      return diff >= 31 && diff <= 60;
    case '61-90 días':
      return diff >= 61 && diff <= 90;
    case '91-120 días':
      return diff >= 91 && diff <= 120;
    case '+120 días':
      return diff > 120;
    default:
      return true;
  }
}

// ══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════
export default function FichaCliente({
  cartera,
  maestro,
  facturas,
  gestiones,
  promesas,
  solicitudes,
  solicitanteMap,
  analistaNombre,
  analistaEmail,
  analistaTelefono,
  analistaWhatsapp,
  userEmail,
  esCoordinador,
  soloLectura = false,
  backHref,
  volver,
  prevCod,
  nextCod,
  posicionEnLista,
  totalEnLista,
  icp,
  tendenciaPago = [],
  pedidosRetenidos = [],
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // FIX 2: abrir el tab indicado por ?tab= (ej: ?tab=solicitudes)
  const tabInicial: Tab = (() => {
    const q = (searchParams.get('tab') ?? '').toLowerCase();
    if (!q) return 'Información';
    const match = TABS.find(
      (t) => t.toLowerCase() === q || t.toLowerCase().replace(/\s+/g, '-') === q,
    );
    return (match as Tab) ?? 'Información';
  })();

  const [tab, setTab] = useState<Tab>(tabInicial);
  const [modalGestion, setModalGestion] = useState(false);
  const [gestionFacturasPre, setGestionFacturasPre] = useState<Factura[]>([]);
  const [gestionMontoPre, setGestionMontoPre] = useState(0);
  const [modalEmail, setModalEmail] = useState(false);
  const [modalEdoCta, setModalEdoCta] = useState(false);
  const [toast, setToast] = useState('');
  // maestroLocal: copia mutable de maestro para reflejar ediciones inline
  // sin recargar la página. Se actualiza vía onMaestroUpdate para que
  // TabInformacion (que se desmonta al cambiar de tab) reciba los valores
  // correctos al volver a montarse.
  const [maestroLocal, setMaestroLocal] = useState<MaestroCliente | null>(maestro);
  const [filtroTramoEdoCta, setFiltroTramoEdoCta] = useState<string>('Todos');
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 2500);
  }

  async function copiarTelefono() {
    const tel = maestro?.telefono ?? '';
    if (!tel) return;
    try {
      await navigator.clipboard.writeText(tel);
      showToast('Teléfono copiado: ' + tel);
    } catch {
      showToast('No se pudo copiar');
    }
  }

  function abrirWhatsApp() {
    const tel = (maestro?.telefono ?? '').replace(/\D/g, '');
    if (!tel) return;
    const numero = tel.startsWith('506') ? tel : '506' + tel;
    window.open(`https://wa.me/${numero}`, '_blank');
  }

  // ── Cálculos de mora ──────────────────────────────────────────────
  const mora_total =
    (cartera.mora_1_30 || 0) +
    (cartera.mora_31_60 || 0) +
    (cartera.mora_61_90 || 0) +
    (cartera.mora_91_120 || 0) +
    (cartera.mora_120_plus || 0);
  const pct_mora = cartera.total > 0 ? Math.round((mora_total / cartera.total) * 100) : 0;
  const tramo_peor =
    (cartera.mora_120_plus || 0) > 0
      ? '+120 días'
      : (cartera.mora_91_120 || 0) > 0
        ? '91-120 días'
        : (cartera.mora_61_90 || 0) > 0
          ? '61-90 días'
          : (cartera.mora_31_60 || 0) > 0
            ? '31-60 días'
            : (cartera.mora_1_30 || 0) > 0
              ? '1-30 días'
              : 'Al día';

  const urgColor =
    mora_total > 0 &&
    (cartera.mora_61_90 || 0) + (cartera.mora_91_120 || 0) + (cartera.mora_120_plus || 0) > 0
      ? '#dc2626'
      : mora_total > 0 && (cartera.mora_31_60 || 0) > 0
        ? '#f59e0b'
        : '#22c55e';

  // ── Conteos para badges de tabs ───────────────────────────────────
  const tabCounts: Partial<Record<Tab, number>> = {
    'Estado de Cuenta': facturas.length,
    Gestiones: gestiones.length,
    Solicitudes: solicitudes.length,
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: '#f0f4f8', minHeight: '100%' }}>
      {/* ═══════════════════════════════════════════════════════════
          HEADER
      ═══════════════════════════════════════════════════════════ */}
      <div className="bg-white border-b border-gray-200 px-5 pt-4 pb-0 sticky top-0 z-10">
        {/* ── SECCIÓN A: Identidad ─────────────────────────────── */}
        <div className="flex items-start gap-3 mb-3">
          <button
            type="button"
            onClick={() => router.push(backHref ?? '/clientes')}
            className="mt-1 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition flex-shrink-0"
            style={{ width: '30px', height: '30px', color: '#64748b' }}
          >
            <ArrowLeft size={14} />
          </button>

          {/* Anterior/Siguiente -- solo cuando venimos de una lista filtrada de Clientes */}
          {totalEnLista != null && (
            <div className="flex items-center gap-1 mt-1 flex-shrink-0">
              <button
                type="button"
                disabled={!prevCod}
                onClick={() =>
                  prevCod &&
                  router.push(
                    `/clientes/${encodeURIComponent(prevCod)}${volver ? `?volver=${encodeURIComponent(volver)}` : ''}`,
                  )
                }
                className="flex items-center justify-center rounded-lg border border-gray-200 text-slate-500
                           hover:border-[#009ee3] hover:bg-[#e6f4fc] hover:text-[#009ee3] hover:scale-110
                           disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 transition"
                style={{ width: '26px', height: '26px' }}
                aria-label="Cliente anterior"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="text-[11px] text-gray-400 font-medium tabular-nums px-0.5 whitespace-nowrap">
                {posicionEnLista} de {totalEnLista}
              </span>
              <button
                type="button"
                disabled={!nextCod}
                onClick={() =>
                  nextCod &&
                  router.push(
                    `/clientes/${encodeURIComponent(nextCod)}${volver ? `?volver=${encodeURIComponent(volver)}` : ''}`,
                  )
                }
                className="flex items-center justify-center rounded-lg border border-gray-200 text-slate-500
                           hover:border-[#009ee3] hover:bg-[#e6f4fc] hover:text-[#009ee3] hover:scale-110
                           disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 transition"
                style={{ width: '26px', height: '26px' }}
                aria-label="Cliente siguiente"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 style={{ fontSize: '18px', fontWeight: 500, color: '#111827' }}>
                {cartera.cliente_nombre}
              </h1>
              {/* Badge urgencia eliminado — la info de tramo está en el aging */}

              {/* Badge: pedido(s) retenido(s) activo(s) -- visibilidad cruzada con Pedidos Retenidos */}
              {pedidosRetenidos.length > 0 && (
                <Link
                  href={`/gestion-cartera/pedidos-retenidos?pedido=${encodeURIComponent(pedidosRetenidos[0].id_pedido)}`}
                  className="flex-shrink-0 whitespace-nowrap inline-flex items-center gap-1 transition hover:opacity-80"
                  style={{
                    backgroundColor: '#ffedd5',
                    color: '#ea580c',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '4px 8px',
                    borderRadius: '4px',
                    textDecoration: 'none',
                  }}
                  title={pedidosRetenidos
                    .map(
                      (p) =>
                        `${p.id_pedido} · ${fmtCRC(p.total_mercaderia)}${p.motivo_retencion ? ` · ${p.motivo_retencion}` : ''}`,
                    )
                    .join('\n')}
                >
                  📦 {pedidosRetenidos.length} pedido{pedidosRetenidos.length !== 1 ? 's' : ''}{' '}
                  retenido{pedidosRetenidos.length !== 1 ? 's' : ''}
                </Link>
              )}
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: '#94a3b8' }}>
              <span className="font-mono font-semibold" style={{ color: '#64748b' }}>
                {cartera.cliente_cod}
              </span>
            </p>
          </div>
        </div>

        {/* ── SECCIÓN B: KPI cards (6 col, centradas) ────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-3">
          {/* Card 1: Total cartera */}
          <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50 flex flex-col items-center text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Total cartera
            </p>
            <p className="text-[15px] font-bold tabular-nums text-gray-800 leading-tight">
              {fmtCRC(cartera.total)}
            </p>
          </div>

          {/* Card 2: En mora */}
          <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50 flex flex-col items-center text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              En mora
            </p>
            <div className="flex items-baseline gap-1.5 flex-wrap justify-center">
              <p
                className="text-[15px] font-bold tabular-nums leading-tight"
                style={{ color: mora_total > 0 ? '#dc2626' : '#22c55e' }}
              >
                {mora_total > 0 ? fmtCRC(mora_total) : '—'}
              </p>
              {mora_total > 0 && (
                <span
                  className="text-[11px] font-bold rounded-full px-1.5 py-0.5 flex-shrink-0"
                  style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
                >
                  {pct_mora}%
                </span>
              )}
            </div>
          </div>

          {/* Card 3: Límite de crédito */}
          <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50 flex flex-col items-center text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Límite crédito
            </p>
            {maestro?.limite_credito && maestro.limite_credito > 0 ? (
              <>
                <p className="text-[15px] font-bold tabular-nums text-gray-800 leading-tight">
                  {fmtCRC(maestro.limite_credito)}
                </p>
                {(() => {
                  const disp = maestro.limite_credito - cartera.total;
                  return disp >= 0 ? (
                    <p className="text-[11px] font-medium mt-0.5" style={{ color: '#16a34a' }}>
                      {fmtCRC(disp)} disponible
                    </p>
                  ) : (
                    <p className="text-[11px] font-medium mt-0.5" style={{ color: '#dc2626' }}>
                      Límite excedido
                    </p>
                  );
                })()}
              </>
            ) : (
              <p className="text-[15px] font-semibold text-gray-300 italic">Sin límite</p>
            )}
          </div>

          {/* Card 4: Condición / Comportamiento de pago */}
          {(() => {
            const condicion = maestro?.condicion_pago ?? null;
            const dias = icp ? Number(icp.dias_prom_ponderado) : null;
            const diasColor =
              dias === null
                ? '#94a3b8'
                : dias <= 0
                  ? '#16a34a'
                  : dias <= 15
                    ? '#f59e0b'
                    : '#dc2626';
            const diasTxt =
              dias === null
                ? null
                : dias < -1
                  ? `${Math.abs(Math.round(dias))}d antes vencimiento`
                  : dias <= 1
                    ? 'Paga al vencimiento'
                    : `+${Math.round(dias)}d del vencimiento`;
            return (
              <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50 flex flex-col items-center text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Condición / Plazo
                </p>
                <p className="text-[20px] font-black tabular-nums text-gray-800 leading-tight">
                  {condicion ?? '—'}
                </p>
                {diasTxt ? (
                  <p
                    className="text-[10px] font-semibold mt-1 leading-tight"
                    style={{ color: diasColor }}
                  >
                    {diasTxt}
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-300 mt-1">Sin historial</p>
                )}
                {icp && <p className="text-[9px] text-gray-300 mt-0.5">{icp.n_pagos} pagos</p>}
              </div>
            );
          })()}

          {/* Card 5: Score ICP (lean) */}
          {(() => {
            if (!icp)
              return (
                <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50 flex flex-col items-center text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                    Score ICP
                  </p>
                  <p className="text-[22px] font-black text-gray-300 leading-tight">—</p>
                  <p className="text-[10px] text-gray-300 mt-1">Sin historial</p>
                </div>
              );
            const score = Number(icp.icp_score);
            // Misma escala/colores que Análisis (ICPBadge), alineado al spec: 85/70/50/25
            const color =
              score >= 85
                ? '#16a34a'
                : score >= 70
                  ? '#22c55e'
                  : score >= 50
                    ? '#f59e0b'
                    : score >= 25
                      ? '#ea580c'
                      : '#dc2626';
            const clasifColor = color;
            return (
              <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50 flex flex-col items-center text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Score ICP
                </p>
                <div className="flex items-baseline gap-1 justify-center">
                  <p
                    className="text-[22px] font-black tabular-nums leading-tight"
                    style={{ color }}
                  >
                    {score}
                  </p>
                  <span className="text-[10px] font-semibold text-gray-300">/100</span>
                </div>
                <span
                  className="inline-block text-[9px] font-black uppercase px-1.5 py-0.5 rounded mt-1.5"
                  style={{ background: `${clasifColor}18`, color: clasifColor }}
                >
                  {icp.clasificacion}
                </span>
                {icp.tendencia != null && (
                  <p
                    className="text-[9px] font-bold mt-1"
                    style={{
                      color:
                        icp.tendencia > 0 ? '#16a34a' : icp.tendencia < 0 ? '#dc2626' : '#94a3b8',
                    }}
                  >
                    {icp.tendencia > 0 ? '▲' : icp.tendencia < 0 ? '▼' : '—'}{' '}
                    {Math.abs(icp.tendencia)} pts (3m)
                  </p>
                )}
              </div>
            );
          })()}

          {/* Card 6: Vendedor / Analista */}
          <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50 flex flex-col items-center text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Vendedor / Analista
            </p>
            <p className="text-[12px] font-semibold text-gray-700 leading-tight w-full truncate">
              {cartera.vendedor_nombre || '—'}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5 w-full truncate">
              {analistaNombre || '—'}
            </p>
          </div>
        </div>

        {/* ── SECCIÓN C: Botones de acción ─────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-3">
          {/* Llamar */}
          <ActionBtn
            icon={<Phone size={12} />}
            label="Llamar"
            disabled={!maestro?.telefono}
            title={maestro?.telefono ? undefined : 'Sin teléfono registrado'}
            onClick={copiarTelefono}
          />

          {/* WhatsApp */}
          <ActionBtn
            icon={<MessageCircle size={12} />}
            label="WhatsApp"
            disabled={!maestro?.telefono}
            onClick={abrirWhatsApp}
            style={{
              borderColor: maestro?.telefono ? '#86efac' : undefined,
              color: maestro?.telefono ? '#16a34a' : undefined,
            }}
          />

          {/* Email de cobro -- Gerencia ve la ficha en solo lectura, no envía correos */}
          {!soloLectura && (
            <ActionBtn
              icon={<Send size={12} />}
              label="Email de cobro"
              onClick={() => setModalEmail(true)}
              style={{ borderColor: '#7dd3fc', color: '#0369a1' }}
            />
          )}

          {/* Estado de cuenta */}
          <ActionBtn
            icon={<Mail size={12} />}
            label="Estado de cuenta"
            onClick={() => setModalEdoCta(true)}
          />
        </div>

        {/* Sección 3: Tabs */}
        <div className="flex gap-0 -mb-px overflow-x-auto">
          {TABS.map((t) => {
            const count = tabCounts[t];
            const active = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors whitespace-nowrap"
                style={
                  active
                    ? { borderColor: '#009ee3', color: '#009ee3' }
                    : { borderColor: 'transparent', color: '#94a3b8' }
                }
              >
                {t}
                {count !== undefined && count > 0 && (
                  <span
                    className="text-[10px] rounded-full px-1.5 py-0.5 font-bold"
                    style={
                      active
                        ? { backgroundColor: '#e0f2fe', color: '#009ee3' }
                        : { backgroundColor: '#f1f5f9', color: '#94a3b8' }
                    }
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          CONTENIDO DEL TAB
      ═══════════════════════════════════════════════════════════ */}
      <div className="p-5">
        {/* ── TAB: INFORMACIÓN ─────────────────────────────────── */}
        {tab === 'Información' && (
          <TabInformacion
            cartera={cartera}
            maestro={maestroLocal}
            analistaNombre={analistaNombre}
            esCoordinador={esCoordinador}
            soloLectura={soloLectura}
            mora_total={mora_total}
            pct_mora={pct_mora}
            tendenciaPago={tendenciaPago}
            onToast={showToast}
            onVerTramo={(label) => {
              setFiltroTramoEdoCta(label);
              setTab('Estado de Cuenta');
            }}
            onVerEdoCta={() => {
              setFiltroTramoEdoCta('Todos');
              setTab('Estado de Cuenta');
            }}
            onMaestroUpdate={(updates) =>
              setMaestroLocal((prev) => (prev ? { ...prev, ...updates } : prev))
            }
          />
        )}

        {/* ── TAB: LOGÍSTICA Y COBRO ────────────────────────────── */}
        {tab === 'Logística y Cobro' && (
          <TabLogistica
            clienteCod={cartera.cliente_cod}
            maestro={maestroLocal}
            onToast={showToast}
            onMaestroUpdate={(updates) =>
              setMaestroLocal((prev) => (prev ? { ...prev, ...updates } : prev))
            }
          />
        )}

        {/* ── TAB: ESTADO DE CUENTA ─────────────────────────────── */}
        {tab === 'Estado de Cuenta' && (
          <TabEstadoCuenta
            facturas={facturas}
            clienteCod={cartera.cliente_cod}
            clienteNombre={cartera.cliente_nombre}
            contribuyente={cartera.contribuyente}
            condicionPago={maestro?.condicion_pago ?? null}
            filtroTramoEdoCta={filtroTramoEdoCta}
            setFiltroTramoEdoCta={setFiltroTramoEdoCta}
            onRegistrarGestion={(facts, monto) => {
              setGestionFacturasPre(facts);
              setGestionMontoPre(monto);
              setModalGestion(true);
            }}
            analistaNombre={analistaNombre}
            analistaEmail={analistaEmail}
            analistaTelefono={analistaTelefono}
            analistaWhatsapp={analistaWhatsapp}
          />
        )}

        {/* ── TAB: GESTIONES ───────────────────────────────────── */}
        {tab === 'Gestiones' && (
          <TabGestiones
            gestiones={gestiones}
            promesas={promesas}
            solicitudes={solicitudes}
            userEmail={userEmail}
            esCoordinador={esCoordinador}
            soloLectura={soloLectura}
            onNuevaGestion={() => setModalGestion(true)}
            onToast={showToast}
            onRefresh={() => router.refresh()}
          />
        )}

        {/* ── TAB: SALDOS A FAVOR ──────────────────────────────── */}
        {tab === 'Saldos a Favor' && (
          <TabSaldosFavor
            clienteCod={cartera.cliente_cod}
            esCoordinador={esCoordinador}
            soloLectura={soloLectura}
            userEmail={userEmail}
          />
        )}

        {/* ── TAB: SOLICITUDES ─────────────────────────────────── */}
        {tab === 'Solicitudes' && (
          <TabSolicitudes
            solicitudes={solicitudes}
            solicitanteMap={solicitanteMap}
            clienteCod={cartera.cliente_cod}
            soloLectura={soloLectura}
          />
        )}

        {/* ── TAB: REPORTAR PAGO ───────────────────────────────── */}
        {tab === 'Reportar Pago' && (
          <TabReportarPago
            clienteCod={cartera.cliente_cod}
            contribuyente={cartera.contribuyente}
            facturas={facturas}
            onSuccess={() => {
              router.refresh();
            }}
            onToast={showToast}
          />
        )}
      </div>

      {/* ── Toast ───────────────────────────────────────────────── */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl shadow-lg px-4 py-2.5 text-[13px] font-semibold text-white"
          style={{ backgroundColor: '#1e293b', maxWidth: '320px', textAlign: 'center' }}
        >
          {toast}
        </div>
      )}

      {/* ── Modal Registrar Gestión (Sprint v2) ─────────────────── */}
      {modalGestion && (
        <FormNuevaGestion
          clienteCod={cartera.cliente_cod}
          clienteNombre={cartera.cliente_nombre}
          contribuyente={cartera.contribuyente}
          facturas={facturas}
          facturasPreSeleccionadas={gestionFacturasPre}
          montoSugerido={gestionMontoPre}
          onClose={() => {
            setModalGestion(false);
            setGestionFacturasPre([]);
            setGestionMontoPre(0);
          }}
          onSuccess={() => {
            setModalGestion(false);
            setGestionFacturasPre([]);
            setGestionMontoPre(0);
            router.refresh();
          }}
          onIrAReportarPago={() => {
            setModalGestion(false);
            setGestionFacturasPre([]);
            setGestionMontoPre(0);
            setTab('Reportar Pago');
          }}
          onCrearSolicitud={({ gestion_id, area, tipo }) => {
            setModalGestion(false);
            setGestionFacturasPre([]);
            setGestionMontoPre(0);
            const qs = new URLSearchParams({
              cliente_cod: cartera.cliente_cod,
              gestion_id,
              area,
              tipo,
            }).toString();
            router.push(`/solicitudes/nueva?${qs}`);
          }}
        />
      )}

      {/* ── Modal Email de cobro ─────────────────────────────────── */}
      {modalEmail && (
        <ModalEmailCobro
          clienteNombre={cartera.cliente_nombre}
          clienteCod={cartera.cliente_cod}
          contribuyente={cartera.contribuyente}
          correo={maestro?.correo ?? ''}
          analistaEmail={userEmail}
          analistaNombre={analistaNombre}
          analistaTelefono={analistaTelefono}
          analistaWhatsapp={analistaWhatsapp}
          condicionPago={maestro?.condicion_pago ?? null}
          facturas={facturas}
          onClose={() => setModalEmail(false)}
          onSuccess={() => {
            setModalEmail(false);
            showToast('Email registrado');
            router.refresh();
          }}
        />
      )}

      {/* ── Modal Estado de cuenta ──────────────────────────────── */}
      {modalEdoCta && (
        <ModalEstadoCuenta
          clienteNombre={cartera.cliente_nombre}
          clienteCod={cartera.cliente_cod}
          contribuyente={cartera.contribuyente}
          correo={maestro?.correo ?? ''}
          condicionPago={maestro?.condicion_pago ?? null}
          analistaEmail={analistaEmail}
          analistaNombre={analistaNombre}
          analistaTelefono={analistaTelefono}
          analistaWhatsapp={analistaWhatsapp}
          facturas={facturas}
          onClose={() => setModalEdoCta(false)}
          onSuccess={() => {
            setModalEdoCta(false);
            showToast('Estado de cuenta enviado');
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// TAB INFORMACIÓN
// ══════════════════════════════════════════════════════════════════════
function TabInformacion({
  cartera,
  maestro,
  analistaNombre,
  esCoordinador,
  soloLectura = false,
  mora_total,
  pct_mora,
  tendenciaPago,
  onToast,
  onVerTramo,
  onVerEdoCta,
  onMaestroUpdate,
}: {
  cartera: Cartera;
  maestro: MaestroCliente | null;
  analistaNombre: string;
  esCoordinador: boolean;
  soloLectura?: boolean;
  mora_total: number;
  pct_mora: number;
  tendenciaPago: TendenciaPagoPunto[];
  onToast: (msg: string) => void;
  onVerTramo: (label: string) => void;
  onVerEdoCta: () => void;
  onMaestroUpdate: (updates: Partial<MaestroCliente>) => void;
}) {
  // Estado de edición por campo
  type CampoEditable = 'nombre_cxp' | 'telefono' | 'telefono2' | 'correo';
  const [editando, setEditando] = useState<CampoEditable | null>(null);
  const [valNombre, setValNombre] = useState(maestro?.nombre_cxp ?? '');
  const [valTel, setValTel] = useState(maestro?.telefono ?? '');
  const [valTel2, setValTel2] = useState(maestro?.telefono2 ?? '');
  const [valCorreo, setValCorreo] = useState(maestro?.correo ?? '');
  const [saving, setSaving] = useState(false);
  const acciones = useClienteAccionesController();

  // Formato teléfono CR: XXXX-XXXX (solo 8 dígitos)
  function fmtTel(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 8);
    return d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
  }
  function rawTel(v: string) {
    return v.replace(/\D/g, '').slice(0, 8);
  }
  function telValido(v: string) {
    return rawTel(v).length === 8 || rawTel(v).length === 0;
  }

  async function guardar(campo: CampoEditable) {
    setSaving(true);
    const valorMap: Record<CampoEditable, string> = {
      nombre_cxp: valNombre,
      telefono: rawTel(valTel),
      telefono2: rawTel(valTel2),
      correo: valCorreo,
    };
    let ok = true;
    try {
      await acciones.actualizarContacto({
        cliente_cod: cartera.cliente_cod,
        [campo]: valorMap[campo],
      });
    } catch {
      ok = false;
    }
    setSaving(false);
    if (ok) {
      setEditando(null);
      onToast('Guardado correctamente');
      // Actualizar la copia local de maestro en FichaCliente para que si el usuario
      // cambia de tab y vuelve, TabInformacion se remonte con los valores nuevos.
      onMaestroUpdate({ [campo]: valorMap[campo] } as Partial<MaestroCliente>);
    } else {
      onToast('Error al guardar');
    }
  }

  function cancelar(campo: CampoEditable) {
    setEditando(null);
    if (campo === 'nombre_cxp') setValNombre(maestro?.nombre_cxp ?? '');
    if (campo === 'telefono') setValTel(maestro?.telefono ?? '');
    if (campo === 'telefono2') setValTel2(maestro?.telefono2 ?? '');
    if (campo === 'correo') setValCorreo(maestro?.correo ?? '');
  }

  function copiar(valor: string, label: string) {
    navigator.clipboard.writeText(valor).then(
      () => onToast(`${label} copiado`),
      () => onToast('No se pudo copiar'),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 items-stretch" style={{ gridTemplateColumns: '0.4fr 0.6fr' }}>
        {/* ── COLUMNA IZQUIERDA (40%) ── */}
        <div className="flex flex-col gap-4">
          {/* Card 1: DATOS DE CONTACTO CxP */}
          <InfoCard2 titulo="DATOS DE CONTACTO CxP">
            <CampoEdit
              label="Nombre CxP"
              valor={valNombre}
              vacio="Sin nombre"
              editando={editando === 'nombre_cxp'}
              saving={saving}
              soloLectura={soloLectura}
              onEditar={() => setEditando('nombre_cxp')}
              onGuardar={() => guardar('nombre_cxp')}
              onCancelar={() => cancelar('nombre_cxp')}
              onChange={(v) => setValNombre(v)}
              onCopiar={valNombre ? () => copiar(valNombre, 'Nombre') : undefined}
            />
            <CampoEdit
              label="Teléfono 1"
              valor={valTel ? fmtTel(valTel) : ''}
              valorInput={valTel}
              vacio="Sin teléfono"
              type="tel"
              maxLength={9}
              invalido={!telValido(valTel)}
              hint="8 dígitos"
              editando={editando === 'telefono'}
              saving={saving}
              soloLectura={soloLectura}
              onEditar={() => setEditando('telefono')}
              onGuardar={() => guardar('telefono')}
              onCancelar={() => cancelar('telefono')}
              onChange={(v) => setValTel(fmtTel(v))}
              onCopiar={valTel ? () => copiar(fmtTel(valTel), 'Teléfono 1') : undefined}
            />
            <CampoEdit
              label="Teléfono 2"
              valor={valTel2 ? fmtTel(valTel2) : ''}
              valorInput={valTel2}
              vacio="Sin teléfono"
              type="tel"
              maxLength={9}
              invalido={!telValido(valTel2)}
              hint="8 dígitos"
              editando={editando === 'telefono2'}
              saving={saving}
              soloLectura={soloLectura}
              onEditar={() => setEditando('telefono2')}
              onGuardar={() => guardar('telefono2')}
              onCancelar={() => cancelar('telefono2')}
              onChange={(v) => setValTel2(fmtTel(v))}
              onCopiar={valTel2 ? () => copiar(fmtTel(valTel2), 'Teléfono 2') : undefined}
            />
            <CampoEdit
              label="Email CxP"
              valor={valCorreo}
              vacio="Sin email"
              type="email"
              editando={editando === 'correo'}
              saving={saving}
              soloLectura={soloLectura}
              onEditar={() => setEditando('correo')}
              onGuardar={() => guardar('correo')}
              onCancelar={() => cancelar('correo')}
              onChange={(v) => setValCorreo(v)}
              onCopiar={valCorreo ? () => copiar(valCorreo, 'Email') : undefined}
            />
          </InfoCard2>

          {/* Card 2: INFORMACIÓN FISCAL */}
          <InfoCard2 titulo="INFORMACIÓN FISCAL">
            <CampoReadOnly
              label="Contribuyente"
              valor={cartera.contribuyente}
              onCopiar={() => copiar(cartera.contribuyente, 'Contribuyente')}
              mono
            />
            <CampoReadOnly label="Agrupación" valor={maestro?.agrupacion || '—'} />
            <CampoReadOnly label="Dimensión" valor={maestro?.dimension || '—'} />
          </InfoCard2>
        </div>

        {/* ── COLUMNA DERECHA (60%): se estira a la altura de la columna izquierda ── */}
        <div className="flex flex-col">
          <div
            className="bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col flex-1"
            style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
          >
            {/* ── Header ── */}
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Distribución de Saldos por Antigüedad
              </h3>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Corte: {fmtFecha(cartera.fecha_corte)} · Clic en un tramo para ver sus facturas
              </p>
            </div>

            {/* ── Encabezados de columna ── */}
            <div
              className="flex items-center gap-3 px-4 py-1.5 border-b border-gray-100"
              style={{ backgroundColor: '#f8fafc' }}
            >
              {/* Spacer círculo */}
              <div style={{ width: '8px', flexShrink: 0 }} />
              {/* TRAMO */}
              <span
                className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider"
                style={{ width: '82px', flexShrink: 0 }}
              >
                Tramo
              </span>
              {/* Spacer barra */}
              <div className="flex-1" />
              {/* MONTO */}
              <span
                className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right"
                style={{ width: '116px', flexShrink: 0 }}
              >
                Monto
              </span>
              {/* % TOTAL */}
              <span
                className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right"
                style={{ width: '44px', flexShrink: 0 }}
              >
                % Total
              </span>
            </div>

            {/* ── Filas de datos ── */}
            <div className="divide-y divide-gray-50 flex-1">
              {AGING_TRAMOS.map(({ key, label, color }) => {
                // Math.max(0, ...) evita valores negativos de ajuste Softland
                // que causarían width:"-N%" → CSS inválido → barra al 100% por browser fallback
                const monto = Math.max(0, (cartera[key as keyof Cartera] as number) || 0);
                const pct = cartera.total > 0 ? Math.round((monto / cartera.total) * 100) : 0;
                return (
                  <div
                    key={key}
                    onClick={() => onVerTramo(label)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50/40 cursor-pointer transition-colors group"
                  >
                    {/* Círculo de color */}
                    <div
                      className="rounded-full flex-shrink-0"
                      style={{ width: '8px', height: '8px', backgroundColor: color }}
                    />
                    {/* Nombre del tramo */}
                    <span
                      className="text-[12px] font-semibold text-gray-700 group-hover:text-gray-900 transition-colors whitespace-nowrap"
                      style={{ width: '82px', flexShrink: 0 }}
                    >
                      {label}
                    </span>
                    {/* Barra de progreso */}
                    <div
                      className="flex-1 rounded-full bg-gray-100 overflow-hidden"
                      style={{ height: '5px' }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: color,
                          minWidth: monto > 0 ? '3px' : '0',
                        }}
                      />
                    </div>
                    {/* Monto completo — fmtCRC sin abreviaciones */}
                    <span
                      className="text-[12px] font-semibold tabular-nums text-right"
                      style={{
                        width: '116px',
                        flexShrink: 0,
                        color: monto > 0 ? '#1e293b' : '#d1d5db',
                      }}
                    >
                      {monto > 0 ? fmtCRC(monto) : '—'}
                    </span>
                    {/* Porcentaje */}
                    <span
                      className="text-[11px] tabular-nums text-right text-gray-400"
                      style={{ width: '44px', flexShrink: 0 }}
                    >
                      {pct > 0 ? `${pct}%` : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* ── Fila TOTAL ── */}
            <div
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderTop: '2px solid #e2e8f0', backgroundColor: '#f8fafc' }}
            >
              <div style={{ width: '8px', flexShrink: 0 }} />
              <span
                className="text-[11px] font-bold text-gray-500 uppercase tracking-wider"
                style={{ width: '82px', flexShrink: 0 }}
              >
                Total
              </span>
              <div className="flex-1" />
              <span
                className="text-[13px] font-black tabular-nums text-right text-gray-800"
                style={{ width: '116px', flexShrink: 0 }}
              >
                {fmtCRC(cartera.total)}
              </span>
              <span
                className="text-[11px] font-bold tabular-nums text-right text-gray-500"
                style={{ width: '44px', flexShrink: 0 }}
              >
                100%
              </span>
            </div>

            {/* ── Footer: chips KPI + botón ── */}
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-wrap gap-2">
                <Chip
                  label="% Mora"
                  valor={`${pct_mora}%`}
                  bg={mora_total > 0 ? '#fee2e2' : '#dcfce7'}
                  color={mora_total > 0 ? '#dc2626' : '#15803d'}
                />
                <Chip label="Mora total" valor={fmtCRC(mora_total)} />
              </div>
              <button
                type="button"
                onClick={onVerEdoCta}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-bold transition hover:opacity-90 flex-shrink-0"
                style={{ backgroundColor: '#009ee3', color: 'white' }}
              >
                Ver Estado de Cuenta →
              </button>
            </div>
          </div>
        </div>
      </div>

      <TendenciaPagoCard puntos={tendenciaPago} />
    </div>
  );
}

// ── TAB: LOGÍSTICA Y DESPACHO ──────────────────────────────────────────
function TabLogistica({
  clienteCod,
  maestro,
  onToast,
  onMaestroUpdate,
}: {
  clienteCod: string;
  maestro: MaestroCliente | null;
  onToast: (msg: string) => void;
  onMaestroUpdate: (updates: Partial<MaestroCliente>) => void;
}) {
  const [guardandoCampo, setGuardandoCampo] = useState<string | null>(null);
  const [observaciones, setObservaciones] = useState(maestro?.observaciones_logistica ?? '');
  const [personaRecibe, setPersonaRecibe] = useState(maestro?.persona_recibe ?? '');
  const [horaInicio, setHoraInicio] = useState(maestro?.hora_recibo_inicio?.slice(0, 5) ?? '');
  const [horaFin, setHoraFin] = useState(maestro?.hora_recibo_fin?.slice(0, 5) ?? '');

  const acciones = useClienteAccionesController();

  async function guardarLogistica(body: Omit<LogisticaBody, 'cliente_cod'>): Promise<boolean> {
    try {
      await acciones.actualizarLogistica({ cliente_cod: clienteCod, ...body });
      return true;
    } catch {
      return false;
    }
  }

  const requiereTramite = maestro?.cliente_tramita === 'S';
  const imprimir3 = maestro?.cantidad_impresiones === 3 || requiereTramite;

  async function guardarArray(campo: 'dia_visita' | 'dia_pago' | 'metodo_pago', valor: string[]) {
    setGuardandoCampo(campo);
    const ok = await guardarLogistica({ [campo]: valor });
    setGuardandoCampo(null);
    if (ok) {
      onToast('Guardado correctamente');
      onMaestroUpdate({ [campo]: valor } as Partial<MaestroCliente>);
    } else {
      onToast('Error al guardar');
    }
  }

  async function guardarTexto(campo: 'observaciones_logistica' | 'persona_recibe', valor: string) {
    setGuardandoCampo(campo);
    const ok = await guardarLogistica({ [campo]: valor });
    setGuardandoCampo(null);
    if (ok) {
      onToast('Guardado correctamente');
      onMaestroUpdate({ [campo]: valor } as Partial<MaestroCliente>);
    } else {
      onToast('Error al guardar');
    }
  }

  async function guardarHorario(inicio: string, fin: string) {
    setGuardandoCampo('horario');
    const ok = await guardarLogistica({ hora_recibo_inicio: inicio, hora_recibo_fin: fin });
    setGuardandoCampo(null);
    if (ok) {
      onToast('Guardado correctamente');
      onMaestroUpdate({ hora_recibo_inicio: inicio || null, hora_recibo_fin: fin || null });
    } else {
      onToast('Error al guardar');
    }
  }

  const lat = maestro?.latitud;
  const lng = maestro?.longitud;
  const tieneCoordenadas = lat != null && lng != null;

  return (
    <div className="grid gap-4 items-stretch" style={{ gridTemplateColumns: '0.6fr 0.4fr' }}>
      {/* ── COLUMNA IZQUIERDA (60%) ── */}
      <div className="flex flex-col gap-4">
        {/* Card: reglas automáticas del ERP */}
        <InfoCard2 titulo="REGLAS DE FACTURACIÓN">
          <div className="flex flex-col gap-2 py-1">
            {requiereTramite && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 w-fit">
                <AlertTriangle size={13} /> Requiere Hoja de Trámite
              </div>
            )}
            <div className="flex items-center gap-2 text-[13px] font-bold text-gray-700">
              <FileText size={14} className="text-gray-400" />
              Imprimir {imprimir3 ? '3' : '2'} Copias
            </div>
          </div>
        </InfoCard2>

        {/* Card: formulario editable */}
        <InfoCard2 titulo="DATOS DE DESPACHO Y COBRO">
          <div className="grid grid-cols-2 gap-4 py-1">
            <CampoMultiSelect
              label="Día de Visita"
              valores={maestro?.dia_visita ?? []}
              opciones={DIAS_SEMANA}
              saving={guardandoCampo === 'dia_visita'}
              onChange={(v) => guardarArray('dia_visita', v)}
            />
            <CampoMultiSelect
              label="Día de Pago"
              valores={maestro?.dia_pago ?? []}
              opciones={DIAS_SEMANA}
              saving={guardandoCampo === 'dia_pago'}
              onChange={(v) => guardarArray('dia_pago', v)}
            />
          </div>
          <div className="pt-4">
            <CampoMultiSelect
              label="Método de Pago"
              valores={maestro?.metodo_pago ?? []}
              opciones={METODOS_PAGO}
              saving={guardandoCampo === 'metodo_pago'}
              onChange={(v) => guardarArray('metodo_pago', v)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="space-y-1">
              <span className="text-[13px] font-semibold text-gray-600 flex items-center gap-1.5">
                <Clock size={13} className="text-gray-400" /> Ventana Horaria de Recibo
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  onBlur={() => {
                    if (horaInicio !== (maestro?.hora_recibo_inicio?.slice(0, 5) ?? ''))
                      guardarHorario(horaInicio, horaFin);
                  }}
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-[13px] text-gray-700 focus:outline-none focus:border-blue-400 transition"
                />
                <span className="text-[13px] text-gray-400 flex-shrink-0">a</span>
                <input
                  type="time"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                  onBlur={() => {
                    if (horaFin !== (maestro?.hora_recibo_fin?.slice(0, 5) ?? ''))
                      guardarHorario(horaInicio, horaFin);
                  }}
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-[13px] text-gray-700 focus:outline-none focus:border-blue-400 transition"
                />
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[13px] font-semibold text-gray-600 flex items-center gap-1.5">
                <User size={13} className="text-gray-400" /> Persona que Recibe
              </span>
              <input
                type="text"
                value={personaRecibe}
                onChange={(e) => setPersonaRecibe(e.target.value)}
                onBlur={() => {
                  if (personaRecibe !== (maestro?.persona_recibe ?? ''))
                    guardarTexto('persona_recibe', personaRecibe);
                }}
                placeholder="Nombre, cargo o teléfono"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700 focus:outline-none focus:border-blue-400 transition"
              />
            </div>
          </div>

          <div className="space-y-1 pt-4">
            <span className="text-[13px] font-semibold text-gray-600">Observaciones de CxC</span>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              onBlur={() => {
                if (observaciones !== (maestro?.observaciones_logistica ?? ''))
                  guardarTexto('observaciones_logistica', observaciones);
              }}
              rows={3}
              placeholder="Notas para el equipo de CxC y cobradores..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition"
            />
          </div>
        </InfoCard2>
      </div>

      {/* ── COLUMNA DERECHA (40%): mapa ── */}
      <div
        className="bg-white rounded-xl border border-gray-100 overflow-hidden flex flex-col h-full"
        style={{ borderWidth: '0.5px' }}
      >
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <MapPin size={16} className="text-gray-400" />
          <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            Ubicación del Cliente
          </h3>
        </div>
        {tieneCoordenadas ? (
          <>
            <iframe
              title="Mapa del cliente"
              src={`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
              className="w-full flex-1 h-full"
              style={{ minHeight: '350px', border: 0 }}
              loading="lazy"
            />
            <div className="p-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() =>
                  window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank')
                }
                className="flex items-center justify-center gap-1.5 w-full rounded-lg py-2 text-xs font-bold text-white transition"
                style={{ backgroundColor: '#009ee3' }}
              >
                <ExternalLink size={13} /> Abrir en Waze
              </button>
            </div>
          </>
        ) : (
          <div
            className="flex-1 flex items-center justify-center p-6 text-center"
            style={{ minHeight: '350px' }}
          >
            <p className="text-xs text-gray-400">Sin coordenadas registradas para este cliente.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CampoMultiSelect: multi-select con badges removibles, guardado reactivo ─
function CampoMultiSelect({
  label,
  valores,
  opciones,
  saving,
  onChange,
}: {
  label: string;
  valores: string[];
  opciones: readonly string[];
  saving: boolean;
  onChange: (v: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  function toggle(op: string) {
    onChange(valores.includes(op) ? valores.filter((v) => v !== op) : [...valores, op]);
  }

  return (
    <div className="space-y-0.5" ref={ref}>
      <span className="text-[13px] font-semibold text-gray-600 block">{label}</span>
      <div className="relative">
        <button
          type="button"
          disabled={saving}
          onClick={() => setAbierto((o) => !o)}
          className="w-full min-h-[34px] flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-left focus:outline-none focus:border-blue-400 transition disabled:opacity-60"
        >
          {valores.length === 0 && (
            <span className="text-[13px] text-gray-300 italic px-1">Sin seleccionar</span>
          )}
          {valores.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: '#eff6ff', color: '#009ee3' }}
            >
              {v}
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(valores.filter((x) => x !== v));
                }}
                className="rounded-full p-0.5 hover:bg-blue-100 transition-colors"
              >
                <X size={10} />
              </span>
            </span>
          ))}
        </button>
        {abierto && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg py-1 max-h-52 overflow-y-auto">
            {opciones.map((op) => (
              <label
                key={op}
                className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={valores.includes(op)}
                  onChange={() => toggle(op)}
                  className="rounded border-gray-300"
                  style={{ accentColor: '#009ee3' }}
                />
                {op}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── InfoCard2: card compacta para tab Información ─────────────────────
function InfoCard2({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div
      className="bg-white rounded-xl border border-gray-100 overflow-hidden"
      style={{ borderWidth: '0.5px' }}
    >
      <div
        className="px-3 pt-2.5 pb-1.5 border-b border-gray-100"
        style={{ borderBottomWidth: '0.5px' }}
      >
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {titulo}
        </h3>
      </div>
      <div className="px-3 py-2 space-y-1.5">{children}</div>
    </div>
  );
}

// ── CampoEdit: campo editable compacto (label arriba + valor abajo) ────
function CampoEdit({
  label,
  valor,
  valorInput,
  vacio,
  type = 'text',
  maxLength,
  editando,
  saving,
  invalido,
  hint,
  onEditar,
  onGuardar,
  onCancelar,
  onChange,
  onCopiar,
  soloLectura = false,
}: {
  label: string;
  valor: string;
  valorInput?: string;
  vacio: string;
  type?: string;
  maxLength?: number;
  editando: boolean;
  saving: boolean;
  invalido?: boolean;
  hint?: string;
  onEditar: () => void;
  onGuardar: () => void;
  onCancelar: () => void;
  onChange: (v: string) => void;
  onCopiar?: () => void;
  soloLectura?: boolean;
}) {
  const inputVal = valorInput !== undefined ? valorInput : valor;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-1 min-w-0">
        <span className="text-[13px] font-semibold text-gray-600 truncate">{label}</span>
        {!editando && (
          <div className="flex gap-1 flex-shrink-0">
            {onCopiar && (
              <button
                type="button"
                onClick={onCopiar}
                className="text-[10px] font-medium text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 leading-tight transition whitespace-nowrap"
                style={{ borderWidth: '0.5px' }}
              >
                Copiar
              </button>
            )}
            {!soloLectura && (
              <button
                type="button"
                onClick={onEditar}
                className="text-[10px] font-medium text-blue-400 hover:text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 leading-tight transition whitespace-nowrap"
                style={{ borderWidth: '0.5px' }}
              >
                Editar
              </button>
            )}
          </div>
        )}
      </div>
      {editando ? (
        <div className="flex items-center gap-1 flex-wrap">
          <input
            autoFocus
            type={type}
            value={inputVal}
            maxLength={maxLength}
            onChange={(e) => onChange(e.target.value)}
            className={`flex-1 min-w-0 rounded border px-2 py-1 text-[13px] text-gray-800 focus:outline-none focus:ring-1 transition ${
              invalido ? 'border-red-300 focus:ring-red-200' : 'border-blue-300 focus:ring-blue-200'
            }`}
            style={{ backgroundColor: '#fff', borderWidth: '1px' }}
            placeholder={vacio}
          />
          {hint && <span className="text-[10px] text-gray-400 whitespace-nowrap">{hint}</span>}
          <button
            type="button"
            disabled={saving || invalido}
            onClick={onGuardar}
            className="text-[9px] font-bold text-white rounded px-2 py-1 leading-tight disabled:opacity-50 whitespace-nowrap transition"
            style={{ backgroundColor: '#009ee3' }}
          >
            {saving ? '...' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={onCancelar}
            className="text-[9px] font-medium text-gray-500 border border-gray-200 rounded px-2 py-1 leading-tight hover:bg-gray-50 transition whitespace-nowrap"
            style={{ borderWidth: '0.5px' }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <span className="block text-[13px] text-gray-500 break-words">
          {valor || <span className="italic text-gray-300">{vacio}</span>}
        </span>
      )}
    </div>
  );
}

// ── CampoReadOnly: campo solo lectura compacto ────────────────────────
function CampoReadOnly({
  label,
  valor,
  onCopiar,
  mono,
  muted,
}: {
  label: string;
  valor: string;
  onCopiar?: () => void;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-1 min-w-0">
        <span className="text-[13px] font-semibold text-gray-600 truncate">{label}</span>
        {onCopiar && (
          <button
            type="button"
            onClick={onCopiar}
            className="flex-shrink-0 text-[10px] font-medium text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 leading-tight transition whitespace-nowrap"
            style={{ borderWidth: '0.5px' }}
          >
            Copiar
          </button>
        )}
      </div>
      <span
        className={`block text-[13px] break-words ${muted ? 'text-gray-300 italic' : 'text-gray-500'} ${mono ? 'font-mono' : ''}`}
      >
        {valor || '—'}
      </span>
    </div>
  );
}

// SUB-COMPONENTES
// ══════════════════════════════════════════════════════════════════════

// ── Botón de acción del header ────────────────────────────────────────
function ActionBtn({
  icon,
  label,
  onClick,
  disabled,
  title,
  style,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold transition"
      style={{
        color: disabled ? '#cbd5e1' : '#64748b',
        borderColor: disabled ? '#f1f5f9' : undefined,
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: 'transparent',
        ...(!disabled ? { ['--tw-hover-bg' as string]: '#f8fafc' } : {}),
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f8fafc';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Modal Email de cobro ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ModalEmailCobro({
  clienteNombre,
  clienteCod,
  contribuyente,
  correo,
  analistaEmail,
  analistaNombre,
  analistaTelefono,
  analistaWhatsapp,
  condicionPago,
  facturas,
  onClose,
  onSuccess,
}: {
  clienteNombre: string;
  clienteCod: string;
  contribuyente: string;
  correo: string;
  analistaEmail: string;
  analistaNombre: string;
  analistaTelefono: string | null;
  analistaWhatsapp: string | null;
  condicionPago: string | null;
  facturas: Factura[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  type TipoAdjunto = 'Ninguno' | 'PDF' | 'Excel';

  const ASUNTOS_COBRO = [
    'Recordatorio de Pago',
    'Notificación de Estado de Cuenta Pendiente',
    'Aviso Urgente: Regularización de Cuenta',
    'Conciliación y Seguimiento de Cuenta',
    'Formalización de Acuerdo de Pago',
  ] as const;

  const [para, setPara] = useState(correo);
  const [cc, setCc] = useState('');
  const [asunto, setAsunto] = useState<string>('Recordatorio de Pago');
  const [mensaje, setMensaje] = useState('');
  const [adjunto, setAdjunto] = useState<TipoAdjunto>('Ninguno');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Enviando...');
  const [error, setError] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const acciones = useClienteAccionesController();

  async function handleGenerarIA() {
    setAiLoading(true);
    setAiError('');

    // Calcular saldo vencido y días de mora desde las facturas que llegan al modal
    const hoy = new Date(Date.now() - 6 * 3600_000);
    const facturasVenc = facturas.filter((f) => {
      const venc = new Date(f.fecha_vencimiento);
      return f.saldo > 0 && venc < hoy;
    });
    const saldoVencido = facturasVenc.reduce((s, f) => s + f.saldo, 0);
    const saldoTotal = facturas.filter((f) => f.saldo > 0).reduce((s, f) => s + f.saldo, 0);
    const nFacturasVenc = facturasVenc.length;
    const maxDiasMora =
      facturasVenc.length > 0
        ? Math.max(
            ...facturasVenc.map((f) =>
              Math.floor((hoy.getTime() - new Date(f.fecha_vencimiento).getTime()) / 86_400_000),
            ),
          )
        : 0;

    try {
      const json = await acciones.generarEmailIA({
        clienteNombre,
        condicionPago: condicionPago ?? null,
        saldoVencido,
        saldoTotal,
        maxDiasMora,
        nFacturasVenc,
        analistaNombre,
        asunto,
      });
      if (json.ok) {
        setMensaje(json.texto);
      } else {
        setAiError('Error al generar el texto');
      }
    } catch (e) {
      const err = e as ApiError;
      setAiError(
        err.isNetworkError
          ? 'Error de conexión con el copiloto'
          : (err.message ?? 'Error al generar el texto'),
      );
    } finally {
      setAiLoading(false);
    }
  }

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault();
    if (!para.trim()) {
      setError('Ingresá un correo destinatario.');
      return;
    }
    if (!mensaje.trim()) {
      setError('Escribí un mensaje.');
      return;
    }
    setLoading(true);
    setError('');

    // ── 1. Gmail: el backend envía con la cuenta Google conectada del usuario ──

    // ── 2. Generar adjunto si corresponde ─────────────────────────────
    let adjuntoData: { base64: string; mimeType: string; filename: string } | null = null;
    if (adjunto !== 'Ninguno' && facturas.length > 0) {
      try {
        const fechaCorte = new Date(Date.now() - 6 * 3600_000).toLocaleDateString('es-CR', {
          timeZone: 'America/Costa_Rica',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        const exportParams = {
          facturas: facturas.filter((f) => (f.saldo ?? 0) > 0),
          clienteNombre,
          contribuyente,
          clienteCod,
          condicionPago: condicionPago ?? null,
          cuentas: [] as CuentaBancaria[],
          fechaCorte,
          analistaNombre,
          analistaEmail,
          analistaTelefono,
          analistaWhatsapp,
        };
        if (adjunto === 'PDF') {
          setLoadingMsg('Generando PDF...');
          const base64 = await generarEstadoCuentaBase64(exportParams);
          adjuntoData = {
            base64,
            mimeType: 'application/pdf',
            filename: `estado-cuenta-${safeFilename(clienteNombre)}.pdf`,
          };
        } else {
          setLoadingMsg('Generando Excel...');
          const base64 = await generarEstadoCuentaExcelBase64(exportParams);
          adjuntoData = {
            base64,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: `estado-cuenta-${safeFilename(clienteNombre)}.xlsx`,
          };
        }
      } catch {
        setError('Error al generar el adjunto. Intentá sin adjunto.');
        setLoading(false);
        setLoadingMsg('Enviando...');
        return;
      }
    }

    // ── 3. Enviar email vía Gmail API ──────────────────────────────────
    setLoadingMsg('Enviando...');
    // Parsear Para y CC: separar por ; o , y limpiar espacios
    const toList = para
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const ccList = cc.trim()
      ? cc
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    // ── 3-4. Enviar + registrar gestión automática (CORREO) en el servidor ──
    try {
      await acciones.enviarEmailCobro({
        to: toList.join(';'),
        cc: ccList,
        asunto: asunto.trim(),
        mensaje: mensaje.trim(),
        adjunto: adjuntoData,
        clienteNombre,
        clienteCod,
        contribuyente,
      });
    } catch (e) {
      setError((e as ApiError).message ?? 'Error al enviar el correo');
      setLoading(false);
      setLoadingMsg('Enviando...');
      return;
    }
    setLoading(false);
    setLoadingMsg('Enviando...');
    onSuccess();
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition';

  return (
    <ModalOverlay onClose={onClose} maxWidth="800px">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">Email de cobro</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">{clienteNombre}</p>
        </div>
        <CloseBtn onClose={onClose} />
      </div>
      <form onSubmit={handleEnviar} className="p-4 space-y-2">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-[12px] text-red-700 font-semibold">
            {error}
          </div>
        )}

        {/* Para */}
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wider">
            Para
          </label>
          <DirectorioInput
            value={para}
            onChange={setPara}
            className={inputCls}
            placeholder="correo@empresa.com; otro@empresa.com"
          />
          <p className="text-[10px] text-gray-400 mt-0.5">
            Separar varios correos con punto y coma (;)
          </p>
        </div>

        {/* CC */}
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wider">
            CC{' '}
            <span className="text-gray-300 font-normal normal-case tracking-normal">
              (opcional)
            </span>
          </label>
          <DirectorioInput
            value={cc}
            onChange={setCc}
            className={inputCls}
            placeholder="copia@empresa.com; otro@empresa.com"
          />
        </div>

        {/* Asunto */}
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wider">
            Asunto
          </label>
          <select value={asunto} onChange={(e) => setAsunto(e.target.value)} className={inputCls}>
            {ASUNTOS_COBRO.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        </div>

        {/* Mensaje */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Mensaje
            </label>
            <button
              type="button"
              onClick={handleGenerarIA}
              disabled={aiLoading || loading}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold transition-all"
              style={{
                background: aiLoading
                  ? '#f1f5f9'
                  : 'linear-gradient(135deg,#009ee3 0%,#0072aa 100%)',
                color: aiLoading ? '#94a3b8' : '#fff',
                border: aiLoading ? '1px solid #e2e8f0' : 'none',
                cursor: aiLoading || loading ? 'not-allowed' : 'pointer',
              }}
            >
              {aiLoading ? (
                <>
                  <svg
                    className="animate-spin"
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Redactando...
                </>
              ) : (
                <>✨ Redactar con IA</>
              )}
            </button>
          </div>
          {aiError && <p className="text-[11px] text-red-600 mb-1.5 font-medium">{aiError}</p>}
          <textarea
            value={aiLoading ? '' : mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={7}
            disabled={aiLoading}
            className={inputCls + ' resize-none'}
            placeholder={
              aiLoading ? 'Redactando con IA...' : 'Escribí el mensaje o usá ✨ Redactar con IA'
            }
            style={aiLoading ? { background: '#f8fafc', color: '#94a3b8' } : undefined}
          />
        </div>

        {/* Adjunto */}
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wider">
            <Paperclip size={10} className="inline mr-1" />
            Adjuntar estado de cuenta
          </label>
          <div className="flex gap-2">
            {(['Ninguno', 'PDF', 'Excel'] as TipoAdjunto[]).map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => setAdjunto(op)}
                className={`flex-1 py-2 rounded-xl text-[12px] font-semibold border transition ${
                  adjunto === op
                    ? 'bg-[#009ee3] border-[#009ee3] text-white'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {op === 'Ninguno' ? 'Sin adjunto' : op}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-gray-400">
          Se registrará una gestión de tipo EMAIL automáticamente.
        </p>
        <div className="flex gap-2">
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
            className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white transition disabled:opacity-60 hover:opacity-90"
            style={{ backgroundColor: '#009ee3' }}
          >
            {loading ? loadingMsg : 'Enviar y registrar'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

// ── Modal Estado de cuenta ────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ModalEstadoCuenta({
  clienteNombre,
  clienteCod,
  contribuyente,
  correo,
  condicionPago,
  analistaNombre,
  analistaEmail,
  analistaTelefono,
  analistaWhatsapp,
  facturas,
  onClose,
  onSuccess,
}: {
  clienteNombre: string;
  clienteCod: string;
  contribuyente: string;
  correo: string;
  condicionPago?: string | null;
  analistaEmail: string; // correo del analista ASIGNADO al cliente
  analistaNombre: string;
  analistaTelefono: string | null;
  analistaWhatsapp: string | null;
  facturas: Factura[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  type TipoAdjunto = 'Ninguno' | 'PDF' | 'Excel';

  const [para, setPara] = useState(correo);
  const [observaciones, setObservaciones] = useState('');
  const [adjunto, setAdjunto] = useState<TipoAdjunto>('Ninguno');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Enviando...');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');
  const acciones = useClienteAccionesController();

  const inputCls =
    'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] text-gray-800 ' +
    'focus:outline-none focus:border-[#009ee3] transition';

  async function enviarEmail() {
    if (!para.trim()) {
      setError('Ingresá un correo destinatario');
      return;
    }
    setLoading(true);
    setError('');

    // ── 1. Gmail: el backend envía con la cuenta Google conectada del usuario ──

    // ── 2. Generar adjunto si corresponde ─────────────────────────
    let adjuntoData: { base64: string; mimeType: string; filename: string } | null = null;
    if (adjunto !== 'Ninguno' && facturas.length > 0) {
      try {
        const fechaCorte = new Date(Date.now() - 6 * 3600_000).toLocaleDateString('es-CR', {
          timeZone: 'America/Costa_Rica',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        const exportParams = {
          facturas: facturas.filter((f) => (f.saldo ?? 0) > 0),
          clienteNombre,
          contribuyente,
          clienteCod,
          condicionPago: condicionPago ?? null,
          observaciones: observaciones.trim() || undefined,
          cuentas: [] as CuentaBancaria[], // el email HTML ya lleva las cuentas desde DB
          fechaCorte,
          analistaNombre,
          analistaEmail,
          analistaTelefono,
          analistaWhatsapp,
        };

        if (adjunto === 'PDF') {
          setLoadingMsg('Generando PDF...');
          const base64 = await generarEstadoCuentaBase64(exportParams);
          adjuntoData = {
            base64,
            mimeType: 'application/pdf',
            filename: `estado-cuenta-${safeFilename(clienteNombre)}.pdf`,
          };
        } else {
          setLoadingMsg('Generando Excel...');
          const base64 = await generarEstadoCuentaExcelBase64(exportParams);
          adjuntoData = {
            base64,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: `estado-cuenta-${safeFilename(clienteNombre)}.xlsx`,
          };
        }
      } catch {
        setError('Error al generar el adjunto. Intentá sin adjunto.');
        setLoading(false);
        setLoadingMsg('Enviando...');
        return;
      }
    }

    // ── 3. Enviar vía API ─────────────────────────────────────────
    setLoadingMsg('Enviando...');
    let data: EstadoCuentaEnvioResponse;
    try {
      data = await acciones.enviarEstadoCuenta({
        cliente_cod: clienteCod,
        cliente_nombre: clienteNombre,
        contribuyente,
        to_email: para.trim(),
        observaciones: observaciones.trim() || undefined,
        adjunto: adjuntoData,
      });
    } catch (e) {
      setLoading(false);
      setError((e as ApiError).message ?? 'Error al enviar');
      return;
    }

    setLoading(false);
    if (data.email_sent) {
      setEnviado(true);
      setTimeout(() => onSuccess(), 1400);
    } else {
      setError(data.email_error ?? 'Error al enviar el correo');
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">Enviar Estado de Cuenta</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">{clienteNombre}</p>
        </div>
        <CloseBtn onClose={onClose} />
      </div>

      {enviado ? (
        <div className="p-10 flex flex-col items-center text-center">
          <CheckCircle2 size={42} style={{ color: '#22c55e' }} className="mb-3" />
          <p className="text-[14px] font-bold text-gray-800">Estado de cuenta enviado</p>
          <p className="text-[12px] text-gray-400 mt-1">Gestión registrada automáticamente.</p>
        </div>
      ) : (
        <div className="p-5 space-y-4">
          {/* Destinatario */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Destinatario
            </label>
            <DirectorioInput
              value={para}
              onChange={(v) => {
                setPara(v);
                setError('');
              }}
              placeholder="correo@empresa.com; otro@empresa.com"
              className={inputCls}
            />
            {!correo && (
              <p className="text-[10px] text-amber-500 mt-1">
                Sin correo registrado — ingresá uno manualmente.
              </p>
            )}
          </div>

          {/* Observaciones (opcional) */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Observaciones{' '}
              <span className="text-gray-300 font-normal normal-case tracking-normal">
                (opcional)
              </span>
            </label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej: Por favor gestionar el pago a la brevedad posible..."
              rows={3}
              className={inputCls + ' resize-none'}
            />
            <p className="text-[10px] text-gray-400 mt-0.5">
              Si está vacío, la sección no aparece en el email.
            </p>
          </div>

          {/* Adjuntar como */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              <Paperclip size={10} className="inline mr-1" />
              Adjuntar como
            </label>
            <select
              value={adjunto}
              onChange={(e) => setAdjunto(e.target.value as TipoAdjunto)}
              className={inputCls}
            >
              <option value="Ninguno">Ninguno (solo HTML)</option>
              <option value="PDF">PDF</option>
              <option value="Excel">Excel (.xlsx)</option>
            </select>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-[12px] text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={loading || !para.trim()}
              onClick={enviarEmail}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-60 transition"
              style={{ backgroundColor: '#009ee3' }}
            >
              {loading ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {loadingMsg}
                </>
              ) : (
                <>
                  <Send size={13} />
                  Enviar estado de cuenta
                </>
              )}
            </button>
          </div>

          <p className="text-[10px] text-gray-400 text-center">
            Se registrará una gestión automáticamente al enviar.
          </p>
        </div>
      )}
    </ModalOverlay>
  );
}

// ── Overlay y botón cerrar compartidos ────────────────────────────────
function ModalOverlay({
  children,
  onClose,
  maxWidth = '480px',
}: {
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden"
        style={{ maxWidth, maxHeight: '90vh', overflowY: 'auto' }}
      >
        {children}
      </div>
    </div>
  );
}

function CloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="flex items-center justify-center rounded-lg hover:bg-gray-100 transition"
      style={{ width: '32px', height: '32px', color: '#94a3b8' }}
    >
      ✕
    </button>
  );
}

function KpiChip({
  label,
  valor,
  color,
  small,
  italic,
}: {
  label: string;
  valor: string;
  color?: string;
  small?: boolean;
  italic?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p
        className={`tabular-nums ${small ? 'text-[13px] font-semibold' : 'text-[15px] font-bold'} ${italic ? 'italic' : ''}`}
        style={{ color: color ?? '#1e293b' }}
      >
        {valor}
      </p>
    </div>
  );
}

function InfoCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-100">
        <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{titulo}</h3>
      </div>
      <div className="px-4 py-2 space-y-1">{children}</div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  valor,
  mono,
  muted,
  color,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  valor: string;
  mono?: boolean;
  muted?: boolean;
  color?: string;
  italic?: boolean;
  badge?: { bg: string; text: string };
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-300 flex-shrink-0">{icon}</span>
      <span className="text-[12px] text-gray-400 w-36 flex-shrink-0">{label}</span>
      {badge ? (
        <span
          className="text-[12px] font-bold rounded-full px-2 py-0.5"
          style={{ backgroundColor: badge.bg, color: badge.text }}
        >
          {valor}
        </span>
      ) : (
        <span
          className={`text-[13px] font-semibold ${mono ? 'font-mono' : ''} ${muted ? 'text-gray-300 italic' : ''}`}
          style={{ color: muted ? undefined : (color ?? '#374151') }}
        >
          {valor}
        </span>
      )}
    </div>
  );
}

function Chip({
  label,
  valor,
  bg,
  color,
}: {
  label: string;
  valor: string;
  bg?: string;
  color?: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold"
      style={{ backgroundColor: bg ?? '#f0f4f8', color: color ?? '#64748b' }}
    >
      <span>{label}</span>
      <span style={{ color: color ? undefined : '#374151' }}>{valor}</span>
    </div>
  );
}

function Th({
  children,
  right,
  center,
  rowSpan,
  sortKey,
  activeField,
  activeDir,
  onSort,
}: {
  children?: React.ReactNode;
  right?: boolean;
  center?: boolean;
  rowSpan?: number;
  sortKey?: SortFieldEstadoCuenta;
  activeField?: SortFieldEstadoCuenta;
  activeDir?: 'asc' | 'desc';
  onSort?: (key: SortFieldEstadoCuenta) => void;
}) {
  const sortable = !!sortKey && !!onSort;
  const active = sortable && activeField === sortKey;
  const Icon = active ? (activeDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th
      className={
        'px-4 py-1.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wider' +
        (sortable ? ' cursor-pointer select-none hover:text-gray-700 transition' : '')
      }
      style={{ textAlign: right ? 'right' : center ? 'center' : 'left' }}
      rowSpan={rowSpan}
      onClick={sortable ? () => onSort!(sortKey!) : undefined}
    >
      {sortable ? (
        <span className={'inline-flex items-center gap-1' + (right ? ' flex-row-reverse' : '')}>
          {children}
          <Icon size={11} style={{ color: active ? '#009ee3' : '#cbd5e1' }} />
        </span>
      ) : (
        children
      )}
    </th>
  );
}

function EmptyState({
  icon,
  texto,
  sub,
  comingSoon,
}: {
  icon: React.ReactNode;
  texto: string;
  sub?: string;
  comingSoon?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center px-6">
      <div className="mb-3" style={{ color: comingSoon ? '#009ee3' : '#e2e8f0' }}>
        {icon}
      </div>
      <p
        className="text-[13px] font-semibold"
        style={{ color: comingSoon ? '#0369a1' : '#6b7280' }}
      >
        {texto}
      </p>
      {sub && <p className="text-[11px] text-gray-400 mt-1 max-w-xs">{sub}</p>}
      {comingSoon && (
        <span
          className="mt-3 text-[10px] font-bold rounded-full px-3 py-1"
          style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}
        >
          PRÓXIMAMENTE
        </span>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TAB 3 — ESTADO DE CUENTA
// ══════════════════════════════════════════════════════════════════════
const TRAMOS_OPTS = [
  'Todos',
  'Al día',
  '1-30 días',
  '31-60 días',
  '61-90 días',
  '91-120 días',
  '+120 días',
];
const ESTADO_OPTS = ['Todas', 'Vencidas', 'Por vencer', 'Vence hoy', 'Pagadas'];
const POR_PAGINA = 25;

interface TabEstadoCuentaProps {
  facturas: Factura[];
  clienteCod: string;
  clienteNombre: string;
  contribuyente: string;
  condicionPago?: string | null;
  filtroTramoEdoCta: string;
  setFiltroTramoEdoCta: (v: string) => void;
  onRegistrarGestion: (facts: Factura[], montoNeto: number) => void;
  analistaNombre: string;
  analistaEmail: string;
  analistaTelefono: string | null;
  analistaWhatsapp: string | null;
}

function TabEstadoCuenta({
  facturas,
  clienteCod,
  clienteNombre,
  contribuyente,
  condicionPago,
  filtroTramoEdoCta,
  setFiltroTramoEdoCta,
  onRegistrarGestion,
  analistaNombre,
  analistaEmail,
  analistaTelefono,
  analistaWhatsapp,
}: TabEstadoCuentaProps) {
  const hoy = hoyISO();

  const [filtroEstado, setFiltroEstado] = useState('Todas');
  const [busquedaDoc, setBusquedaDoc] = useState('');
  const [pagina, setPagina] = useState(1);
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set());
  const [sortField, setSortField] = useState<SortFieldEstadoCuenta>('fecha_vencimiento');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const selectCls =
    'rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-700 bg-white ' +
    'focus:outline-none focus:border-blue-400 transition';

  function handleSort(field: SortFieldEstadoCuenta) {
    if (field === sortField) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortDir('asc');
    }
    setPagina(1);
  }

  // ── Filtrado + orden ─────────────────────────────────────────
  const filtradas = useMemo(() => {
    let data = [...facturas];
    if (filtroTramoEdoCta !== 'Todos') {
      data = data.filter((f) => facturaEnTramo(f, filtroTramoEdoCta, hoy));
    }
    if (filtroEstado !== 'Todas') {
      data = data.filter((f) => {
        const st = estadoFactura(f, hoy);
        if (filtroEstado === 'Vencidas') return st.label.startsWith('Vencida');
        if (filtroEstado === 'Por vencer') return st.label.startsWith('Vence en');
        if (filtroEstado === 'Vence hoy') return st.label === 'Vence hoy';
        if (filtroEstado === 'Pagadas') return st.label === 'Pagada';
        return true;
      });
    }
    if (busquedaDoc.trim()) {
      const q = busquedaDoc.toLowerCase();
      data = data.filter((f) => f.documento.toLowerCase().includes(q));
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      if (sortField === 'documento') return a.documento.localeCompare(b.documento) * dir;
      const da = a[sortField] ? new Date(a[sortField]).getTime() : 0;
      const db = b[sortField] ? new Date(b[sortField]).getTime() : 0;
      return (da - db) * dir;
    });

    return data;
  }, [facturas, filtroTramoEdoCta, filtroEstado, busquedaDoc, hoy, sortField, sortDir]);

  // ── Paginación ────────────────────────────────────────────────
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaReal = Math.min(pagina, totalPaginas);
  const enPagina = filtradas.slice((paginaReal - 1) * POR_PAGINA, paginaReal * POR_PAGINA);

  // ── Totales generales ─────────────────────────────────────────
  const totalMonto = filtradas.reduce((s, f) => s + (f.monto || 0), 0);
  const totalSaldo = filtradas.reduce((s, f) => s + (f.saldo || 0), 0);

  // ── Selección ─────────────────────────────────────────────────
  const toggleSel = (id: number) =>
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleTodas = () =>
    setSeleccionadas(
      seleccionadas.size === enPagina.length && enPagina.length > 0
        ? new Set()
        : new Set(enPagina.map((f) => f.id)),
    );

  // ── Pronto Pago (1.5% neto s/IVA, solo ≤15 días desde emisión) ───────
  function calcProntoPago(f: Factura): { saldo: number; descuento: number; neto: number } {
    const saldo = f.saldo || 0;
    if (!f.fecha_documento) return { saldo, descuento: 0, neto: saldo };
    const dias = Math.floor(
      (new Date(hoy).getTime() - new Date(f.fecha_documento).getTime()) / 86_400_000,
    );
    if (dias <= 15) {
      const subtotal = saldo / 1.13;
      const descuento = subtotal * 0.015;
      return { saldo, descuento, neto: saldo - descuento };
    }
    return { saldo, descuento: 0, neto: saldo };
  }

  // ── PP totals sobre todas las filtradas — para tfoot ─────────
  const totalDescuentoFiltradas = useMemo(
    () => filtradas.reduce((s, f) => s + calcProntoPago(f).descuento, 0),
    [filtradas],
  );
  const totalNetoFiltradas = useMemo(
    () => filtradas.reduce((s, f) => s + calcProntoPago(f).neto, 0),
    [filtradas],
  );

  const facturasSelList = useMemo(
    () => filtradas.filter((f) => seleccionadas.has(f.id)),
    [filtradas, seleccionadas],
  );
  const ppData = useMemo(() => facturasSelList.map(calcProntoPago), [facturasSelList, hoy]);
  const saldoTotal = ppData.reduce((s, d) => s + d.saldo, 0);
  const ahorroTotal = ppData.reduce((s, d) => s + d.descuento, 0);
  const montoNeto = Math.round(ppData.reduce((s, d) => s + d.neto, 0));

  // ── Exportar PDF y Excel ──────────────────────────────────────
  // sortField/sortDir: el estado de cuenta descargado respeta el orden
  // que el usuario dejó en pantalla (por defecto: F. Vencimiento asc.,
  // equivalente al histórico "vencidas primero").
  const buildExportParams = () => ({
    facturas: filtradas,
    clienteNombre,
    contribuyente,
    clienteCod,
    condicionPago: condicionPago ?? null,
    cuentas: [] as CuentaBancaria[],
    fechaCorte: new Date(Date.now() - 6 * 3600_000).toLocaleDateString('es-CR', {
      timeZone: 'America/Costa_Rica',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    analistaNombre,
    analistaEmail,
    analistaTelefono,
    analistaWhatsapp,
    sortField,
    sortDir,
  });

  function handleExportarPDF() {
    exportarEstadoCuentaPDF(buildExportParams()).catch(() => alert('Error generando PDF'));
  }
  function handleExportarExcel() {
    exportarEstadoCuentaExcel(buildExportParams());
  }

  // ── PDF Pronto Pago (premium) ─────────────────────────────────
  async function handlePDFProntoPago() {
    if (facturasSelList.length === 0) return;
    try {
      const { default: jsPDFModule } = await import('jspdf');
      const jsPDF =
        (jsPDFModule as unknown as { default: typeof jsPDFModule }).default ?? jsPDFModule;
      const { default: autoTable } = await import('jspdf-autotable');
      const { loadNunito, loadLogo, COL } = await import('@/lib/reportes/pdf-branding');

      const doc: any = new (jsPDF as any)({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });
      const f = await loadNunito(doc);
      const logo = await loadLogo();
      const PW = 210,
        PH = 297,
        ML = 15,
        MR = 15;

      const fechaHoy = new Date(Date.now() - 6 * 3600_000).toLocaleDateString('es-CR', {
        timeZone: 'America/Costa_Rica',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      // ── Encabezado ───────────────────────────────────────────
      if (logo) {
        try {
          const props = doc.getImageProperties(logo);
          const h = 12,
            w = Math.min(h * (props.width / props.height), 50);
          doc.addImage(logo, props.fileType || 'PNG', ML, 6, w, h);
        } catch {}
      }

      // Bloque derecho: Fecha + Sistema
      doc.setFont(f.normal, 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...COL.gray999);
      doc.text('GENERADO', PW - MR - 40, 9, { align: 'right' });
      doc.setFont(f.bold, 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...COL.navy);
      doc.text(fechaHoy, PW - MR - 40, 14.5, { align: 'right' });

      doc.setFont(f.normal, 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...COL.gray999);
      doc.text('SISTEMA', PW - MR, 9, { align: 'right' });
      doc.setFont(f.bold, 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...COL.navy);
      doc.text('SIC · Cofersa', PW - MR, 14.5, { align: 'right' });

      // Línea divisora cyan
      doc.setDrawColor(...COL.cyan);
      doc.setLineWidth(0.5);
      doc.line(ML, 21, PW - MR, 21);

      // ── Título ────────────────────────────────────────────────
      let y = 31;
      doc.setFont(f.bold, 'bold');
      doc.setFontSize(18);
      doc.setTextColor(...COL.navy);
      doc.text('Propuesta de Pronto Pago', ML, y);
      y += 8;
      doc.setFont(f.normal, 'normal');
      doc.setFontSize(11);
      doc.setTextColor(...COL.ink);
      doc.text(clienteNombre, ML, y);
      y += 6;
      doc.setFont(f.normal, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...COL.gray666);
      let subInfo = `Código: ${clienteCod}`;
      if (condicionPago) subInfo += `   ·   Condición de pago: ${condicionPago}`;
      doc.text(subInfo, ML, y);
      y += 11;

      // ── Caja KPI ─────────────────────────────────────────────
      const bW = PW - ML - MR;
      const bH = 20;
      doc.setFillColor(245, 249, 254);
      doc.setDrawColor(210, 223, 240);
      doc.setLineWidth(0.2);
      doc.roundedRect(ML, y, bW, bH, 2, 2, 'FD');

      const cW = bW / 3;
      doc.setDrawColor(210, 223, 240);
      doc.setLineWidth(0.15);
      doc.line(ML + cW, y + 3, ML + cW, y + bH - 3);
      doc.line(ML + cW * 2, y + 3, ML + cW * 2, y + bH - 3);

      const kpis = [
        {
          label: 'FACTURAS SELECCIONADAS',
          val: `${facturasSelList.length}`,
          color: COL.ink as [number, number, number],
        },
        {
          label: 'AHORRO PRONTO PAGO',
          val: ahorroTotal > 0 ? `-${fmtCRC(Math.round(ahorroTotal))}` : 'No aplica',
          color: (ahorroTotal > 0 ? [22, 163, 74] : COL.gray999) as [number, number, number],
        },
        {
          label: 'TOTAL NETO A PAGAR',
          val: fmtCRC(montoNeto),
          color: COL.navy as [number, number, number],
        },
      ];
      kpis.forEach((kpi, i) => {
        const cx = ML + cW * i + cW / 2;
        doc.setFont(f.normal, 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...COL.gray999);
        doc.text(kpi.label, cx, y + 7.5, { align: 'center' });
        doc.setFont(f.bold, 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...kpi.color);
        doc.text(kpi.val, cx, y + 15, { align: 'center' });
      });
      y += bH + 9;

      // ── Tabla ─────────────────────────────────────────────────
      const rows = facturasSelList.map((fact, idx) => {
        const pp = ppData[idx];
        return [
          fact.documento,
          fmtFecha(fact.fecha_documento),
          fmtCRC(pp.saldo),
          pp.descuento > 0 ? `-${fmtCRC(Math.round(pp.descuento))}` : '—',
          fmtCRC(Math.round(pp.neto)),
        ];
      });

      let footTopY = 0,
        footBtmY = 0;
      autoTable(doc, {
        startY: y,
        head: [['Documento', 'F. Emisión', 'Saldo Original', 'Descuento PP', 'Neto a Pagar']],
        body: rows,
        foot: [
          [
            {
              content: `TOTAL  (${facturasSelList.length} facturas)`,
              colSpan: 2,
              styles: { halign: 'left' },
            },
            fmtCRC(Math.round(saldoTotal)),
            ahorroTotal > 0 ? `-${fmtCRC(Math.round(ahorroTotal))}` : '—',
            fmtCRC(montoNeto),
          ],
        ],
        showFoot: 'lastPage',
        willDrawCell: (data: any) => {
          if (data.section === 'foot') {
            if (footTopY === 0) footTopY = data.cell.y;
            footBtmY = Math.max(footBtmY, data.cell.y + data.cell.height);
          }
        },
        styles: {
          font: f.normal,
          fontSize: 9,
          cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
          lineColor: [220, 228, 238] as any,
          lineWidth: 0.15,
        },
        headStyles: {
          fillColor: COL.cyan as any,
          textColor: [255, 255, 255] as any,
          fontStyle: 'bold',
          fontSize: 8.5,
          cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
          lineWidth: 0,
        },
        alternateRowStyles: { fillColor: [240, 249, 255] as any },
        footStyles: {
          fillColor: [224, 242, 254] as any,
          textColor: COL.navy as any,
          fontStyle: 'bold',
          fontSize: 9.5,
          lineWidth: 0,
        },
        columnStyles: {
          0: { cellWidth: 54 },
          1: { cellWidth: 24, halign: 'center' },
          2: { cellWidth: 33, halign: 'right' },
          3: { cellWidth: 33, halign: 'right', textColor: [22, 163, 74] as any },
          4: { cellWidth: 36, halign: 'right', fontStyle: 'bold', textColor: COL.navy as any },
        },
        margin: { left: ML, right: MR },
      });

      // Líneas de acento cyan en la fila de totales
      if (footTopY > 0) {
        doc.setDrawColor(...COL.cyan);
        doc.setLineWidth(0.45);
        doc.line(ML, footTopY, PW - MR, footTopY);
        doc.line(ML, footBtmY, PW - MR, footBtmY);
      }

      // ── Nota al pie de tabla ──────────────────────────────────
      const noteY = (doc as any).lastAutoTable.finalY + 7;
      if (noteY < PH - 18) {
        doc.setFont(f.normal, 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...COL.gray999);
        doc.text(
          '* Descuento del 1.5% aplicado sobre subtotal sin IVA (÷1.13) para facturas con 15 días o menos de emitidas.',
          ML,
          noteY,
        );
        doc.text(
          '  Oferta válida a la fecha de generación de este documento. Sujeto a confirmación del departamento de crédito.',
          ML,
          noteY + 4,
        );
      }

      // ── Footer en todas las páginas ───────────────────────────
      const nPags = doc.internal.getNumberOfPages();
      for (let i = 1; i <= nPags; i++) {
        doc.setPage(i);
        const fy = PH - 10;
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.2);
        doc.line(ML, fy - 3, PW - MR, fy - 3);
        doc.setFont(f.normal, 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...COL.grayBBB);
        doc.text('SIC — Sistema Inteligente de Cobranza · Cofersa © 2026', ML, fy);
        doc.text(`Página ${i} de ${nPags}`, PW - MR, fy, { align: 'right' });
      }

      doc.save(`pronto-pago-${safeFilename(clienteNombre)}.pdf`);
    } catch {
      alert('Error generando PDF Pronto Pago');
    }
  }

  // ── Excel Pronto Pago ──────────────────────────────────────────
  async function handleExcelProntoPago() {
    if (facturasSelList.length === 0) return;
    try {
      const XLSX = await import('xlsx');

      const fechaHoy = new Date(Date.now() - 6 * 3600_000).toLocaleDateString('es-CR', {
        timeZone: 'America/Costa_Rica',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      const rows: (string | number | null)[][] = [];
      rows.push(['COFERSA — PROPUESTA DE PRONTO PAGO']);
      rows.push([`Cliente: ${clienteNombre}`]);
      rows.push([`Contribuyente / Cedula: ${contribuyente}`]);
      rows.push([
        `Codigo: ${clienteCod}`,
        null,
        null,
        condicionPago ? `Condicion de pago: ${condicionPago}` : null,
        `Fecha: ${fechaHoy}`,
      ]);
      rows.push([]);
      rows.push(['Documento', 'F. Emision', 'Saldo Original', 'Descuento PP', 'Neto a Pagar']);

      facturasSelList.forEach((fact, idx) => {
        const pp = ppData[idx];
        rows.push([
          fact.documento,
          fmtFecha(fact.fecha_documento),
          Math.round(pp.saldo * 100) / 100,
          Math.round(pp.descuento * 100) / 100,
          Math.round(pp.neto * 100) / 100,
        ]);
      });

      rows.push([
        `TOTAL (${facturasSelList.length} facturas)`,
        null,
        Math.round(saldoTotal * 100) / 100,
        Math.round(ahorroTotal * 100) / 100,
        montoNeto,
      ]);
      rows.push([]);
      rows.push([`Ejecutivo: ${analistaNombre}`, null, null, null, analistaEmail]);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 18 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pronto Pago');
      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pronto-pago-${safeFilename(clienteNombre)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Error generando Excel Pronto Pago');
    }
  }

  return (
    <div className="space-y-3">
      {/* ── Barra de filtros + botones PDF/Excel ─────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filtroTramoEdoCta}
          onChange={(e) => {
            setFiltroTramoEdoCta(e.target.value);
            setPagina(1);
          }}
          className={selectCls}
        >
          {TRAMOS_OPTS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={filtroEstado}
          onChange={(e) => {
            setFiltroEstado(e.target.value);
            setPagina(1);
          }}
          className={selectCls}
        >
          {ESTADO_OPTS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        <div className="relative">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Buscar documento..."
            value={busquedaDoc}
            onChange={(e) => {
              setBusquedaDoc(e.target.value);
              setPagina(1);
            }}
            className={selectCls + ' pl-8 w-44'}
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleExportarPDF}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition"
            title="Descargar Estado de Cuenta en PDF"
          >
            <FileText size={13} /> PDF
          </button>
          <button
            onClick={handleExportarExcel}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition"
            title="Descargar Estado de Cuenta en Excel"
          >
            <FileDown size={13} /> Excel
          </button>
        </div>
      </div>

      {/* ── Barra azul flotante (facturas seleccionadas) ─────── */}
      {seleccionadas.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-2.5"
          style={{ backgroundColor: '#003B5C', color: 'white' }}
        >
          {/* Info resumida */}
          <div className="flex items-center gap-4 text-[12px]">
            <span className="opacity-60">
              {seleccionadas.size}{' '}
              {seleccionadas.size === 1 ? 'factura seleccionada' : 'facturas seleccionadas'}
            </span>
            <span className="font-bold text-[13px] tabular-nums">
              Total Neto a Pagar: {fmtCRC(montoNeto)}
            </span>
          </div>

          {/* Botones */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                onRegistrarGestion(facturasSelList, montoNeto);
                setSeleccionadas(new Set());
              }}
              className="rounded-lg px-3 py-1.5 text-[12px] font-bold transition"
              style={{ backgroundColor: '#009ee3' }}
            >
              Agregar gestión
            </button>
            <button
              onClick={handlePDFProntoPago}
              className="rounded-lg px-3 py-1.5 text-[12px] font-bold bg-white/15 hover:bg-white/25 transition"
            >
              PDF Pronto Pago
            </button>
            <button
              onClick={handleExcelProntoPago}
              className="rounded-lg px-3 py-1.5 text-[12px] font-bold bg-white/15 hover:bg-white/25 transition"
            >
              Excel Pronto Pago
            </button>
            <button
              onClick={() => setSeleccionadas(new Set())}
              className="text-white/60 hover:text-white transition text-[12px] ml-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Tabla ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {filtradas.length === 0 ? (
          <EmptyState
            icon={<FileText size={32} />}
            texto="No hay facturas con los filtros aplicados."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: '13px' }}>
                <thead>
                  {/* Fila 1: headers normales (rowSpan=2) + sección DESCUENTOS (colSpan=2) */}
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #bae6fd' }}>
                    <th className="px-4 py-1.5 w-8" rowSpan={2}>
                      <input
                        type="checkbox"
                        checked={seleccionadas.size === enPagina.length && enPagina.length > 0}
                        onChange={toggleTodas}
                        className="rounded"
                      />
                    </th>
                    <Th
                      rowSpan={2}
                      sortKey="documento"
                      activeField={sortField}
                      activeDir={sortDir}
                      onSort={handleSort}
                    >
                      Documento
                    </Th>
                    <Th
                      rowSpan={2}
                      sortKey="fecha_documento"
                      activeField={sortField}
                      activeDir={sortDir}
                      onSort={handleSort}
                    >
                      F. Emisión
                    </Th>
                    <Th
                      rowSpan={2}
                      sortKey="fecha_vencimiento"
                      activeField={sortField}
                      activeDir={sortDir}
                      onSort={handleSort}
                    >
                      F. Vencimiento
                    </Th>
                    <Th rowSpan={2} right>
                      Monto
                    </Th>
                    <Th rowSpan={2} right>
                      Saldo
                    </Th>
                    <th
                      colSpan={2}
                      className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-center"
                      style={{
                        backgroundColor: '#e0f2fe',
                        color: '#0369a1',
                        borderBottom: '1px solid #bae6fd',
                      }}
                    >
                      Descuentos
                    </th>
                    <Th rowSpan={2}>Estado</Th>
                  </tr>
                  {/* Fila 2: sub-headers de descuentos */}
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <Th right>Desc. Pronto Pago</Th>
                    <Th right>Saldo c/Descuento</Th>
                  </tr>
                </thead>
                <tbody>
                  {enPagina.map((f, i) => {
                    const est = estadoFactura(f, hoy);
                    const selec = seleccionadas.has(f.id);
                    const pp = calcProntoPago(f);
                    return (
                      <tr
                        key={f.id}
                        className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors"
                        style={
                          selec
                            ? { backgroundColor: '#eff6ff' }
                            : i % 2 === 1
                              ? { backgroundColor: '#fafbfc' }
                              : {}
                        }
                      >
                        <td className="px-4 py-1">
                          <input
                            type="checkbox"
                            checked={selec}
                            onChange={() => toggleSel(f.id)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-4 py-1 font-mono text-[12px] font-semibold text-gray-700 whitespace-nowrap">
                          {f.documento}
                        </td>
                        <td className="px-4 py-1 text-[12px] text-gray-500 whitespace-nowrap">
                          {fmtFecha(f.fecha_documento)}
                        </td>
                        <td className="px-4 py-1 text-[12px] text-gray-500 whitespace-nowrap">
                          {fmtFecha(f.fecha_vencimiento)}
                        </td>
                        <td className="px-4 py-1 text-right text-[12px] tabular-nums font-semibold text-gray-700 whitespace-nowrap">
                          {fmtCRC(f.monto)}
                        </td>
                        <td
                          className="px-4 py-1 text-right text-[12px] tabular-nums font-semibold whitespace-nowrap"
                          style={{ color: f.saldo > 0 ? '#dc2626' : '#94a3b8' }}
                        >
                          {f.saldo > 0 ? fmtCRC(f.saldo) : '—'}
                        </td>
                        {/* Desc. Pronto Pago */}
                        <td
                          className="px-4 py-1 text-right text-[12px] tabular-nums font-semibold whitespace-nowrap"
                          style={{
                            color: pp.descuento > 0 ? '#16a34a' : '#cbd5e1',
                            backgroundColor: pp.descuento > 0 ? '#f0fdf4' : undefined,
                          }}
                        >
                          {pp.descuento > 0 ? `−${fmtCRC(Math.round(pp.descuento))}` : '—'}
                        </td>
                        {/* Saldo c/Descuento */}
                        <td
                          className="px-4 py-1 text-right text-[12px] tabular-nums font-semibold whitespace-nowrap"
                          style={{
                            color: f.saldo > 0 ? '#003B5C' : '#94a3b8',
                            backgroundColor: pp.descuento > 0 ? '#f0fdf4' : undefined,
                          }}
                        >
                          {f.saldo > 0 ? fmtCRC(Math.round(pp.neto)) : '—'}
                        </td>
                        <td className="px-4 py-1 whitespace-nowrap">
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={{ backgroundColor: est.bg, color: est.color }}
                          >
                            {est.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                    <td
                      colSpan={4}
                      className="px-4 py-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-wider"
                    >
                      Total ({filtradas.length} facturas)
                    </td>
                    <td className="px-4 py-1.5 text-right text-[13px] font-bold text-gray-800 tabular-nums whitespace-nowrap">
                      {fmtCRC(totalMonto)}
                    </td>
                    <td
                      className="px-4 py-1.5 text-right text-[13px] font-bold tabular-nums whitespace-nowrap"
                      style={{ color: '#dc2626' }}
                    >
                      {fmtCRC(totalSaldo)}
                    </td>
                    <td
                      className="px-4 py-1.5 text-right text-[13px] font-bold tabular-nums whitespace-nowrap"
                      style={{ color: totalDescuentoFiltradas > 0 ? '#16a34a' : '#cbd5e1' }}
                    >
                      {totalDescuentoFiltradas > 0
                        ? `−${fmtCRC(Math.round(totalDescuentoFiltradas))}`
                        : '—'}
                    </td>
                    <td
                      className="px-4 py-1.5 text-right text-[13px] font-bold tabular-nums whitespace-nowrap"
                      style={{ color: '#003B5C' }}
                    >
                      {fmtCRC(Math.round(totalNetoFiltradas))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Paginación */}
            {totalPaginas > 1 && (
              <div
                className="flex items-center justify-between px-4 py-2 border-t border-gray-100"
                style={{ backgroundColor: '#fafbfc' }}
              >
                <span className="text-[11px] text-gray-400">
                  Página {paginaReal} de {totalPaginas} · {filtradas.length} facturas
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={paginaReal === 1}
                    onClick={() => setPagina((p) => p - 1)}
                    className="rounded-md px-2.5 py-1 text-[12px] font-semibold border border-gray-200 disabled:opacity-40 hover:bg-white transition"
                  >
                    ← Ant
                  </button>
                  <button
                    disabled={paginaReal === totalPaginas}
                    onClick={() => setPagina((p) => p + 1)}
                    className="rounded-md px-2.5 py-1 text-[12px] font-semibold border border-gray-200 disabled:opacity-40 hover:bg-white transition"
                  >
                    Sig →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Modal Recordatorio ────────────────────────────────────────────────
function ModalRecordatorio({
  factura,
  clienteNombre,
  clienteCod,
  onClose,
  onSuccess,
}: {
  factura: Factura;
  clienteNombre: string;
  clienteCod: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const hoy = hoyISO();
  const est = estadoFactura(factura, hoy);
  const [nota, setNota] = useState(
    `Estimado cliente ${clienteNombre}, le recordamos que la factura ` +
      `${factura.documento} por ${fmtCRC(factura.saldo)} se encuentra ${est.label.toLowerCase()}. ` +
      `Por favor regularice su situación a la brevedad.`,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const acciones = useClienteAccionesController();

  async function enviar() {
    setLoading(true);
    setError('');
    try {
      await acciones.registrarRecordatorio({
        cliente_cod: clienteCod,
        documento: factura.documento,
        nota,
      });
      onSuccess();
    } catch (e) {
      const err = e as ApiError;
      setError(err.isNetworkError ? 'Error de red' : (err.message ?? 'Error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="space-y-4" style={{ minWidth: '360px', maxWidth: '460px' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-gray-800">Registrar recordatorio</h3>
            <p className="text-[12px] text-gray-400 mt-0.5 flex items-center gap-1.5">
              {factura.documento}
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ backgroundColor: est.bg, color: est.color }}
              >
                {est.label}
              </span>
              <span className="font-semibold text-gray-600">{fmtCRC(factura.saldo)}</span>
            </p>
          </div>
          <CloseBtn onClose={onClose} />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">
            Nota de gestión
          </label>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:border-blue-400 resize-none"
          />
        </div>

        {error && <p className="text-[12px] text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[13px] text-gray-500 hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={loading || !nota.trim()}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white transition disabled:opacity-60"
            style={{ backgroundColor: '#009ee3' }}
          >
            {loading ? 'Guardando...' : 'Registrar gestión'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ══════════════════════════════════════════════════════════════════════
// SHARED — colores de tipo de gestión
// ══════════════════════════════════════════════════════════════════════
const TIPO_COLORES: Record<string, { bg: string; text: string }> = {
  Llamada: { bg: '#e0f2fe', text: '#0369a1' },
  Email: { bg: '#f3e8ff', text: '#7c3aed' },
  WhatsApp: { bg: '#dcfce7', text: '#15803d' },
  Visita: { bg: '#fef9c3', text: '#a16207' },
  CORREO: { bg: '#f3e8ff', text: '#7c3aed' },
  Otras: { bg: '#f1f5f9', text: '#64748b' },
};

const TIPO_ICONOS: Record<string, React.ReactNode> = {
  Llamada: <Phone size={13} />,
  Email: <Mail size={13} />,
  WhatsApp: <MessageCircle size={13} />,
  Visita: <Building2 size={13} />,
  CORREO: <Mail size={13} />,
};

// ── Modal Editar Gestión ──────────────────────────────────────────────
type TipoEdicion = 'LLAMADA' | 'WHATSAPP' | 'CORREO' | 'INTERNA' | 'VISITA';
const TIPOS_EDICION: { value: TipoEdicion; label: string }[] = [
  { value: 'LLAMADA', label: 'Llamada' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'CORREO', label: 'Correo' },
  { value: 'INTERNA', label: 'Gestión Interna' },
  { value: 'VISITA', label: 'Visita' },
];
const RESULTADOS_EDICION: Record<TipoEdicion, string[]> = {
  LLAMADA: [
    'Compromiso de pago confirmado',
    'Cliente indica pago realizado',
    'Solicitud de convenio',
    'Reclamo comercial',
    'Reclamo logístico',
    'Requiere revisión interna',
    'No contestó',
    'Número ocupado',
    'Llamar después',
    'Contacto inválido',
  ],
  WHATSAPP: [
    'Compromiso de pago confirmado',
    'Cliente indica pago realizado',
    'Solicitud de convenio',
    'Reclamo comercial',
    'Reclamo logístico',
    'Requiere revisión interna',
    'Mensaje enviado',
    'Visto sin respuesta',
    'Sin respuesta',
    'Contacto inválido',
  ],
  CORREO: [
    'Compromiso de pago confirmado',
    'Cliente indica pago realizado',
    'Solicitud de convenio',
    'Reclamo comercial',
    'Reclamo logístico',
    'Requiere revisión interna',
    'Correo enviado',
    'Pendiente respuesta',
    'Correo inválido',
  ],
  INTERNA: [
    'Validación comercial',
    'Validación logística',
    'Validación crédito',
    'Escalado coordinación',
    'Seguimiento interno',
  ],
  VISITA: [
    'Cliente visitado',
    'No localizado',
    'Compromiso de pago confirmado',
    'Solicitud de convenio',
    'Reclamo comercial',
    'Reclamo logístico',
  ],
};
function normalizarTipoEdicion(t: string): TipoEdicion {
  const u = t.toUpperCase();
  if (u === 'EMAIL') return 'CORREO';
  if (u === 'OTRAS') return 'INTERNA';
  const validos: TipoEdicion[] = ['LLAMADA', 'WHATSAPP', 'CORREO', 'INTERNA', 'VISITA'];
  return validos.includes(u as TipoEdicion) ? (u as TipoEdicion) : 'LLAMADA';
}

function ModalEditarGestion({
  gestion,
  onClose,
  onSuccess,
}: {
  gestion: Gestion;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const tipoInicial = normalizarTipoEdicion(gestion.tipo);
  const [tipo, setTipo] = useState<TipoEdicion>(tipoInicial);
  const [resultado, setResultado] = useState(() => {
    const opciones = RESULTADOS_EDICION[normalizarTipoEdicion(gestion.tipo)];
    return opciones.includes(gestion.resultado) ? gestion.resultado : opciones[0];
  });
  const [nota, setNota] = useState(gestion.nota ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const acciones = useClienteAccionesController();

  function handleTipoChange(nuevoTipo: TipoEdicion) {
    setTipo(nuevoTipo);
    const opciones = RESULTADOS_EDICION[nuevoTipo];
    if (!opciones.includes(resultado)) setResultado(opciones[0]);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nota.trim()) {
      setError('La nota es obligatoria');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await acciones.actualizarGestion({ id: gestion.id, tipo, resultado, nota });
      setLoading(false);
      onSuccess();
    } catch (e) {
      setLoading(false);
      setError((e as ApiError).message ?? 'Error al guardar');
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition';

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="text-[15px] font-bold text-gray-900">Editar gestión</h2>
        <CloseBtn onClose={onClose} />
      </div>
      <form onSubmit={guardar} className="p-5 space-y-3">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
              Tipo
            </label>
            <select
              value={tipo}
              onChange={(e) => handleTipoChange(e.target.value as TipoEdicion)}
              className={inputCls}
            >
              {TIPOS_EDICION.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
              Resultado
            </label>
            <select
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              className={inputCls}
            >
              {RESULTADOS_EDICION[tipo].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
            Nota
          </label>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            className={inputCls + ' resize-none'}
            placeholder="Descripción de la gestión..."
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
            className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white transition disabled:opacity-60 hover:opacity-90"
            style={{ backgroundColor: '#009ee3' }}
          >
            {loading ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TAB 4 — GESTIONES
// ══════════════════════════════════════════════════════════════════════
function TabGestiones({
  gestiones,
  promesas,
  solicitudes,
  userEmail,
  esCoordinador,
  soloLectura = false,
  onNuevaGestion,
  onToast,
  onRefresh,
}: {
  gestiones: Gestion[];
  promesas: Promesa[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  solicitudes: any[];
  userEmail: string;
  esCoordinador: boolean;
  soloLectura?: boolean;
  onNuevaGestion: () => void;
  onToast: (msg: string) => void;
  onRefresh: () => void;
}) {
  const hoy = hoyISO();
  const [busqueda, setBusqueda] = useState('');
  const [fTipo, setFTipo] = useState('Todos');
  const [fResultado, setFResultado] = useState('Todos');
  const [fPeriodo, setFPeriodo] = useState('90');
  const [fAnalista, setFAnalista] = useState('Todos');
  const [editando, setEditando] = useState<Gestion | null>(null);

  const base = useMemo(() => gestiones.filter((g) => g.activo !== false), [gestiones]);

  const promesaMap = useMemo(() => new Map(promesas.map((p) => [p.id, p])), [promesas]);

  const solPorGestion = useMemo(() => {
    const s = new Set<string>();
    for (const x of solicitudes) if (x?.gestion_id) s.add(x.gestion_id as string);
    return s;
  }, [solicitudes]);

  const CERRADOS = ['Resuelta', 'Cerrada', 'Rechazada', 'APROBADA', 'RECHAZADA'];
  const solAbiertas = useMemo(
    () => solicitudes.filter((x) => !CERRADOS.includes(x?.estado)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [solicitudes],
  );

  function diasDesde(fecha: string): number {
    return Math.floor((new Date(hoy).getTime() - new Date(fecha).getTime()) / 86400000);
  }
  function enPeriodo(fecha: string): boolean {
    if (fPeriodo === 'todo') return true;
    const d = diasDesde(fecha);
    if (fPeriodo === 'hoy') return d === 0;
    if (fPeriodo === 'semana') return d >= 0 && d <= 6;
    if (fPeriodo === 'mes') return d >= 0 && d <= 30;
    if (fPeriodo === '90') return d >= 0 && d <= 90;
    return true;
  }

  const filtradas = useMemo(
    () =>
      base.filter((g) => {
        if (fTipo !== 'Todos' && g.tipo !== fTipo) return false;
        if (fResultado !== 'Todos' && g.resultado !== fResultado) return false;
        if (fAnalista !== 'Todos' && g.analista_email !== fAnalista) return false;
        if (!enPeriodo(g.fecha)) return false;
        if (busqueda) {
          const q = busqueda.toLowerCase();
          if (
            !(g.nota ?? '').toLowerCase().includes(q) &&
            !(g.resultado ?? '').toLowerCase().includes(q)
          )
            return false;
        }
        return true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }),
    [base, fTipo, fResultado, fAnalista, fPeriodo, busqueda, hoy],
  );

  const ult90 = useMemo(
    () =>
      base.filter((g) => {
        const d = diasDesde(g.fecha);
        return d >= 0 && d <= 90;
      }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, hoy],
  );

  const conPromesa = useMemo(() => base.filter((g) => g.promesa_id), [base]);
  const promCumpl = conPromesa.filter(
    (g) => promesaMap.get(g.promesa_id!)?.estado === 'CUMPLIDA',
  ).length;
  const promActiv = conPromesa.filter((g) => {
    const e = promesaMap.get(g.promesa_id!)?.estado;
    return e === 'PENDIENTE' || e === 'ABONO_PARCIAL';
  }).length;

  const ordenadas = useMemo(
    () =>
      [...base].sort((a, b) =>
        `${b.fecha}T${b.hora ?? '00:00'}`.localeCompare(`${a.fecha}T${a.hora ?? '00:00'}`),
      ),
    [base],
  );
  const ultima = ordenadas[0];

  const analistasUnicos = useMemo(
    () => Array.from(new Set(base.map((g) => g.analista_email))).filter(Boolean),
    [base],
  );
  const tiposUnicos = useMemo(
    () => ['Todos', ...Array.from(new Set(base.map((g) => g.tipo)))],
    [base],
  );
  const resultadosUnicos = useMemo(
    () => ['Todos', ...Array.from(new Set(base.map((g) => g.resultado)))],
    [base],
  );

  const filtradasOrden = useMemo(
    () =>
      [...filtradas].sort((a, b) =>
        `${b.fecha}T${b.hora ?? '00:00'}`.localeCompare(`${a.fecha}T${a.hora ?? '00:00'}`),
      ),
    [filtradas],
  );

  const selCls = 'rounded-lg text-[12px] text-gray-700 bg-white focus:outline-none transition';

  return (
    <div className="space-y-3">
      {/* KPIs (4) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total gestiones" valor={ult90} sub="últimos 90 días" />
        <KpiCard
          label="Con promesa"
          valor={conPromesa.length}
          sub={`${promCumpl} cumplidas · ${promActiv} activas`}
          valorColor="#854f0b"
        />
        <KpiCard
          label="Solicitudes"
          valor={solicitudes.length}
          sub={`${solAbiertas} abierta${solAbiertas !== 1 ? 's' : ''}`}
          valorColor="#534ab7"
        />
        <KpiCard
          label="Última gestión"
          valor={ultima ? fechaRelativa(ultima.fecha) : '—'}
          sub={ultima ? `${fmtFecha(ultima.fecha)} · ${ultima.tipo}` : ''}
          esTexto
        />
      </div>

      {/* Barra de filtros (1 fila) */}
      <div
        className="flex items-center gap-2 flex-wrap"
        style={{
          backgroundColor: '#fff',
          border: '0.5px solid #e2e8f0',
          borderRadius: 10,
          padding: '8px 10px',
        }}
      >
        <div className="relative flex-1 min-w-[160px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en nota o resultado…"
            className="w-full text-[12px] text-gray-700 focus:outline-none"
            style={{ border: '0.5px solid #e2e8f0', borderRadius: 7, padding: '5px 10px 5px 28px' }}
          />
        </div>
        <span style={{ width: 1, height: 22, backgroundColor: '#e2e8f0' }} />
        <select
          value={fTipo}
          onChange={(e) => setFTipo(e.target.value)}
          className={selCls}
          style={{ border: '0.5px solid #e2e8f0', borderRadius: 7, padding: '5px 8px' }}
        >
          {tiposUnicos.map((t) => (
            <option key={t} value={t}>
              {t === 'Todos' ? 'Todos los tipos' : t}
            </option>
          ))}
        </select>
        <select
          value={fResultado}
          onChange={(e) => setFResultado(e.target.value)}
          className={selCls}
          style={{ border: '0.5px solid #e2e8f0', borderRadius: 7, padding: '5px 8px' }}
        >
          {resultadosUnicos.map((r) => (
            <option key={r} value={r}>
              {r === 'Todos' ? 'Todos los resultados' : r}
            </option>
          ))}
        </select>
        <select
          value={fPeriodo}
          onChange={(e) => setFPeriodo(e.target.value)}
          className={selCls}
          style={{ border: '0.5px solid #e2e8f0', borderRadius: 7, padding: '5px 8px' }}
        >
          <option value="hoy">Hoy</option>
          <option value="semana">Esta semana</option>
          <option value="mes">Este mes</option>
          <option value="90">Últimos 90 días</option>
          <option value="todo">Todo</option>
        </select>
        {esCoordinador && (
          <select
            value={fAnalista}
            onChange={(e) => setFAnalista(e.target.value)}
            className={selCls}
            style={{ border: '0.5px solid #e2e8f0', borderRadius: 7, padding: '5px 8px' }}
          >
            <option value="Todos">Todos los analistas</option>
            {analistasUnicos.map((a) => (
              <option key={a} value={a}>
                {a.split('@')[0]}
              </option>
            ))}
          </select>
        )}
        <span className="text-[11px] text-gray-400 ml-auto">
          {filtradasOrden.length} de {base.length}
        </span>
      </div>

      {/* Tabla compacta */}
      <TablaGestionesCompacta
        gestiones={filtradasOrden}
        promesaMap={promesaMap}
        solicitudesPorGestion={solPorGestion}
        mostrarCliente={false}
        canEdit={(g) => esCoordinador || g.analista_email === userEmail}
        onEdit={setEditando}
      />

      {/* Modal editar */}
      {editando && (
        <ModalEditarGestion
          gestion={editando}
          onClose={() => setEditando(null)}
          onSuccess={() => {
            setEditando(null);
            onToast('Gestión actualizada');
            onRefresh();
          }}
        />
      )}

      {/* Botón flotante -- Gerencia ve la ficha en solo lectura */}
      {!soloLectura && (
        <button
          type="button"
          onClick={onNuevaGestion}
          title="Registrar una nueva gestión (llamada, email, visita, etc.)"
          className="fixed bottom-16 right-6 z-40 flex items-center gap-2 text-[13px] font-bold text-white shadow-lg transition hover:opacity-90 active:scale-95"
          style={{ backgroundColor: '#009ee3', padding: '11px 18px', borderRadius: 22 }}
        >
          <Plus size={16} /> Nueva gestión
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TAB 8 — SOLICITUDES
// ══════════════════════════════════════════════════════════════════════

function TabSolicitudes({
  solicitudes,
  solicitanteMap,
  clienteCod,
  soloLectura = false,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  solicitudes: any[];
  solicitanteMap: Record<string, string>;
  clienteCod: string;
  soloLectura?: boolean;
}) {
  const router = useRouter();

  // Solo catálogo nuevo: area != null (excluye solicitudes legacy)
  const nuevas = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => solicitudes.filter((s: any) => s.area != null),
    [solicitudes],
  );

  const PEND = ['Pendiente', 'En revisión', 'Pendiente cliente', 'Pendiente tercero'];
  const RES = ['Resuelta', 'Cerrada'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendientes = nuevas.filter((s: any) => PEND.includes(s.estado)).length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enProceso = nuevas.filter((s: any) => s.estado === 'En revisión').length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resueltas = nuevas.filter((s: any) => RES.includes(s.estado)).length;

  return (
    <div className="space-y-4">
      {/* KPIs (3) — mismos estilos que el tab Gestiones */}
      <div className="grid gap-[10px]" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <KpiCard label="Pendientes" valor={pendientes} valorColor="#854f0b" />
        <KpiCard label="En proceso" valor={enProceso} valorColor="#534ab7" />
        <KpiCard label="Resueltas" valor={resueltas} valorColor="#0f6e56" />
      </div>

      {/* Botón flotante — mismo estilo que "+ Nueva gestión" (FIX 4).
          Gerencia ve la ficha en solo lectura -- no crea solicitudes. */}
      {!soloLectura && (
        <button
          type="button"
          onClick={() =>
            router.push(
              `/solicitudes/nueva?cliente_cod=${encodeURIComponent(clienteCod)}&origen=ficha`,
            )
          }
          title="Crear una nueva solicitud para este cliente"
          className="fixed bottom-16 right-6 z-40 flex items-center gap-2 text-[13px] font-bold text-white shadow-lg transition hover:opacity-90 active:scale-95"
          style={{ backgroundColor: '#009ee3', padding: '11px 18px', borderRadius: 22 }}
        >
          <Plus size={16} /> Nueva solicitud
        </button>
      )}

      {/* Lista de solicitudes del cliente (card compartido) */}
      {nuevas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-16 text-center">
          <FileText size={32} className="text-gray-200 mb-3" />
          <p className="text-[13px] font-semibold text-gray-500">
            No hay solicitudes registradas para este cliente.
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Las solicitudes se generan desde el tab Gestiones.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {nuevas.map((s: any) => (
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
