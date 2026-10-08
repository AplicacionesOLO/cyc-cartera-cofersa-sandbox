'use client';

/**
 * FormSolicitudNueva — Flujo NUEVO (catálogo Centro Operativo)
 *
 * Selección: Cliente → Área → Tipo  (pasos compactos)
 * Detalle:   layout 2 columnas a pantalla completa, sin scroll vertical,
 *            con topbar de acciones siempre visible.
 *
 * Pre-carga desde URL (cliente_cod, gestion_id, area, tipo, origen).
 * Adjuntos: misma compresión que Reportar Pago (módulo compartido).
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  X,
  ArrowLeft,
  ChevronRight,
  Link2,
  Send,
  Building2,
  Truck,
  CreditCard,
  UserCog,
  CheckCircle2,
  Upload,
  FileText,
  Loader2,
} from 'lucide-react';
import { fmtCRC } from '@/lib/utils/formato';
import { comprimirImagen } from '@/lib/utils/comprimir-imagen';
import DirectorioInput from '@/components/ui/DirectorioInput';
import {
  AREAS,
  AREA_MAP,
  getTiposPorArea,
  getCatalogoItem,
  getResponsableFijo,
  esAreaValida,
  PRIORIDAD_CFG,
  getCamposSolicitud,
} from '@/lib/solicitudes/catalogo';
import type { AreaKey } from '@/lib/solicitudes/catalogo';
import type { ClienteConDatos, GestionOrigenPreload } from '@/views/solicitudes/types';
import { useFacturasClienteController } from '@/views/solicitudes/hooks/use-facturas-cliente-controller';
import {
  useCrearSolicitudController,
  mensajeError,
} from '@/views/solicitudes/hooks/use-crear-solicitud-controller';

const AREA_ICON: Record<AreaKey, React.ReactNode> = {
  credito_cobro: <CreditCard size={22} />,
  comercial: <Building2 size={22} />,
  logistica: <Truck size={22} />,
  actualizacion_datos: <UserCog size={22} />,
};

// Prioridad — colores del card disabled (spec)
const PRIO_BOX: Record<string, { bg: string; text: string }> = {
  Alta: { bg: '#fef2f2', text: '#b91c1c' },
  Media: { bg: '#fef9ee', text: '#854f0b' },
  Baja: { bg: '#f0fdf4', text: '#166534' },
};

const inputCls =
  'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 bg-white ' +
  'focus:outline-none focus:border-[#009ee3] focus:ring-2 focus:ring-blue-50 transition';
const inputDisabled =
  'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] bg-gray-50 text-gray-500 cursor-not-allowed';
const labelCls = 'block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5';

function initials(n: string) {
  const p = n.trim().split(/\s+/);
  return (p.length >= 2 ? p[0][0] + p[1][0] : n.slice(0, 2)).toUpperCase();
}

interface AdjuntoUI {
  name: string;
  sizeKB: number;
  tipo: string;
}

interface Props {
  userId: string;
  userEmail: string;
  clientes: ClienteConDatos[];
  preCliente: ClienteConDatos | null;
  preArea: string | null;
  preTipo: string | null;
  gestionOrigen: GestionOrigenPreload | null;
  origenFicha?: boolean;
}

export default function FormSolicitudNueva({
  clientes,
  preCliente,
  preArea,
  preTipo,
  gestionOrigen,
  origenFicha = false,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [cliente, setCliente] = useState<ClienteConDatos | null>(preCliente);
  const [area, setArea] = useState<AreaKey | ''>(preArea && esAreaValida(preArea) ? preArea : '');
  const [tipo, setTipo] = useState<string>(
    preArea && preTipo && getCatalogoItem(preArea, preTipo) ? preTipo : '',
  );
  const [busqueda, setBusqueda] = useState('');

  const descInicial = gestionOrigen
    ? `${gestionOrigen.resultado}${gestionOrigen.nota ? ' — ' + gestionOrigen.nota : ''}`
    : '';
  const [descripcion, setDescripcion] = useState(descInicial);
  const [monto, setMonto] = useState('');
  const [respNombre, setRespNombre] = useState('');
  const [respEmail, setRespEmail] = useState('');

  // ── Facturas — multi-selección ──────────────────────────────────────
  const [facturasBusq, setFacturasBusq] = useState(''); // filtro live
  const [facturasSet, setFacturasSet] = useState<Set<string>>(new Set()); // docs seleccionados
  const [factCancelada, setFactCancelada] = useState(false); // toggle "factura cancelada"
  const [factCanceladaTxt, setFactCanceladaTxt] = useState(''); // texto libre cuando cancelada

  // ── CC — con copia a ───────────────────────────────────────────────
  const [ccInput, setCcInput] = useState('');
  const [ccEmails, setCcEmails] = useState<string[]>([]);

  const [observaciones, setObservaciones] = useState('');
  const [adjuntos, setAdjuntos] = useState<AdjuntoUI[]>([]);
  const [adjuntosBlobs, setAdjuntosBlobs] = useState<Array<Blob | File>>([]);
  const [dragOver, setDragOver] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const respFijo = area ? getResponsableFijo(area) : null;

  // Responsable fijo según área
  useEffect(() => {
    if (!area) return;
    const fijo = getResponsableFijo(area);
    if (fijo) {
      setRespNombre(fijo.nombre);
      setRespEmail(fijo.email);
    } else {
      setRespNombre('');
      setRespEmail('');
    }
  }, [area]);

  // Facturas pendientes del cliente elegido (por contribuyente)
  const { facturas } = useFacturasClienteController(cliente?.contribuyente ?? null);
  const { enviar: enviarSolicitud, subirAdjuntos } = useCrearSolicitudController();

  const paso: 'cliente' | 'area' | 'tipo' | 'detalle' = !cliente
    ? 'cliente'
    : !area
      ? 'area'
      : !tipo
        ? 'tipo'
        : 'detalle';

  const catItem = area && tipo ? getCatalogoItem(area, tipo) : undefined;
  const areaDef = area ? AREA_MAP[area] : null;
  const campos = tipo ? getCamposSolicitud(tipo) : null;

  const venceStr = useMemo(() => {
    if (!catItem) return '—';
    const v = new Date(Date.now() + catItem.sla_horas * 3_600_000);
    return v.toLocaleString('es-CR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }, [catItem]);

  const q = busqueda.trim().toLowerCase();
  const listaClientes = useMemo(() => {
    const b = q
      ? clientes.filter(
          (c) =>
            c.cliente_nombre.toLowerCase().includes(q) || c.cliente_cod.toLowerCase().includes(q),
        )
      : clientes;
    return b.slice(0, 60);
  }, [clientes, q]);

  // ── CC helpers ─────────────────────────────────────────────────────
  function addCC(raw: string) {
    const emails = raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const validos: string[] = [];
    for (const e of emails) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) continue;
      if (!ccEmails.includes(e)) validos.push(e);
    }
    if (validos.length) setCcEmails((prev) => [...prev, ...validos]);
    setCcInput('');
  }

  // ── Facturas multi-select helpers ──────────────────────────────────
  const facturasFiltradas = useMemo(() => {
    const q = facturasBusq.trim().toLowerCase();
    if (!q) return facturas;
    return facturas.filter((f) => f.documento.toLowerCase().includes(q));
  }, [facturas, facturasBusq]);

  function toggleFacturaSel(doc: string) {
    setFacturasSet((prev) => {
      const next = new Set(prev);
      next.has(doc) ? next.delete(doc) : next.add(doc);
      return next;
    });
  }

  // ── Navegación FIX 2 ───────────────────────────────────────────────
  function volver() {
    if (origenFicha && cliente) {
      router.push(`/clientes/${encodeURIComponent(cliente.cliente_cod)}?tab=solicitudes`);
    } else if (origenFicha && preCliente) {
      router.push(`/clientes/${encodeURIComponent(preCliente.cliente_cod)}?tab=solicitudes`);
    } else {
      router.push('/solicitudes');
    }
  }

  // ── Adjuntos (compresión compartida) ───────────────────────────────
  // Los blobs comprimidos se guardan en adjuntosBlobs (índice paralelo a adjuntos)
  // y se suben a el storage anterior al momento de enviar la solicitud.
  const procesarArchivos = useCallback(async (files: FileList | File[]) => {
    const aceptados = ['image/jpeg', 'image/png', 'application/pdf'];
    const nextUI: AdjuntoUI[] = [];
    const nextBlobs: Array<Blob | File> = [];
    for (const f of Array.from(files)) {
      if (!aceptados.includes(f.type)) continue;
      if (f.size > 10 * 1024 * 1024) {
        setError(`"${f.name}" supera 10MB`);
        continue;
      }
      if (f.type === 'application/pdf') {
        nextUI.push({ name: f.name, sizeKB: Math.round(f.size / 1024), tipo: 'pdf' });
        nextBlobs.push(f); // PDF se sube sin modificar
      } else {
        try {
          const c = await comprimirImagen(f);
          nextUI.push({ name: f.name, sizeKB: c.finalKB, tipo: c.formato });
          nextBlobs.push(c.blob); // blob comprimido (WebP/JPEG)
        } catch {
          nextUI.push({ name: f.name, sizeKB: Math.round(f.size / 1024), tipo: 'img' });
          nextBlobs.push(f); // original como fallback
        }
      }
    }
    if (nextUI.length) {
      setAdjuntos((prev) => [...prev, ...nextUI]);
      setAdjuntosBlobs((prev) => [...prev, ...nextBlobs]);
    }
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────
  async function enviar(e?: React.FormEvent) {
    e?.preventDefault();
    if (!cliente || !area || !tipo || !catItem || !campos) return;
    if (!descripcion.trim()) {
      setError('La descripción del caso es obligatoria');
      return;
    }
    if (campos.observaciones === 'obligatoria' && !observaciones.trim()) {
      setError('Las observaciones son obligatorias para este tipo');
      return;
    }
    if (campos.factura === 'obligatoria' && !factCancelada && facturasSet.size === 0) {
      setError('Seleccioná al menos una factura para este tipo');
      return;
    }
    if (campos.factura === 'obligatoria' && factCancelada && !factCanceladaTxt.trim()) {
      setError('Ingresá el número de factura cancelada');
      return;
    }
    if (!respNombre.trim() || !respEmail.trim()) {
      setError('El responsable (nombre y email) es obligatorio');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(respEmail.trim())) {
      setError(
        'El email del responsable no es válido — elegilo del directorio o escribí el correo completo',
      );
      return;
    }

    setLoading(true);
    setError('');
    try {
      // ── Upload adjuntos al bucket privado (URL prefirmada) ─────────
      // Mismo patrón de ruta que TabReportarPago: ${cliente_cod}/${Date.now()}_${i}_${baseName}.${ext}
      // Se guarda la key en datos.adjuntos[].path; el backend firma la URL al leer/enviar.
      const keysAdjuntos = await subirAdjuntos(
        cliente.cliente_cod,
        adjuntos.map((a, i) => ({ name: a.name, tipo: a.tipo, blob: adjuntosBlobs[i] })),
      );

      const d = await enviarSolicitud({
        area,
        tipo,
        prioridad: catItem.prioridad,
        sla_horas: catItem.sla_horas,
        cliente_cod: cliente.cliente_cod,
        cliente_nombre: cliente.cliente_nombre,
        gestion_id: gestionOrigen?.id ?? undefined,
        descripcion: descripcion.trim(),
        responsable_nombre: respNombre.trim(),
        responsable_email: respEmail.trim(),
        observaciones_internas: observaciones.trim() || undefined,
        datos: {
          // Facturas del sistema (multi-selección)
          facturas: factCancelada ? null : facturasSet.size > 0 ? Array.from(facturasSet) : null,
          // Facturas canceladas (texto libre — no existen en la BD)
          facturas_canceladas: factCancelada ? factCanceladaTxt.trim() || null : null,
          monto: monto.trim() || null,
          // Con copia (CC)
          cc: ccEmails.length > 0 ? ccEmails : null,
          adjuntos: adjuntos.map((a, i) => ({
            name: a.name,
            sizeKB: a.sizeKB,
            tipo: a.tipo,
            url: null,
            path: keysAdjuntos[i] ?? null,
          })),
          origen: gestionOrigen ? 'gestion' : origenFicha ? 'ficha' : 'manual',
        },
      });
      // Si el email falló, mostrar aviso pero igual marcar como éxito
      if (d.email_error) {
        setError(
          `Solicitud creada (${d.numero ?? ''}) pero el correo no pudo enviarse: ${d.email_error}`,
        );
        setLoading(false);
        return;
      }
      setDone(true);
      setTimeout(() => volver(), 1000);
    } catch (err) {
      setError(mensajeError(err, 'Error al crear la solicitud'));
      setLoading(false);
    }
  }

  // ── Éxito ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <div
        style={{ backgroundColor: '#f0f4f8', minHeight: '100vh' }}
        className="flex items-center justify-center p-6"
      >
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-10 flex flex-col items-center text-center gap-3">
          <div className="rounded-full p-4" style={{ backgroundColor: '#dcfce7' }}>
            <CheckCircle2 size={36} style={{ color: '#16a34a' }} />
          </div>
          <p className="text-[16px] font-bold text-gray-800">¡Solicitud creada!</p>
          <p className="text-[13px] text-gray-500">
            {origenFicha ? 'Volviendo a la ficha del cliente…' : 'Volviendo a solicitudes…'}
          </p>
        </div>
      </div>
    );
  }

  // ══════════════ PASOS DE SELECCIÓN ══════════════
  if (paso !== 'detalle') {
    return (
      <div style={{ backgroundColor: '#f0f4f8', minHeight: '100vh' }}>
        <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3">
          <button
            onClick={volver}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft size={15} /> {origenFicha ? 'Volver al cliente' : 'Volver'}
          </button>
          <span className="text-gray-300">›</span>
          <span className="text-[13px] text-gray-500">Nueva solicitud</span>
        </div>

        <div className="px-5 py-6 flex flex-col items-center">
          <div className="w-full max-w-[720px] space-y-4">
            {cliente && (
              <div className="rounded-xl bg-white border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                  style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}
                >
                  {initials(cliente.cliente_nombre)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800 truncate">
                    {cliente.cliente_nombre}
                  </p>
                  <p className="text-[11px] text-gray-400">{cliente.cliente_cod}</p>
                </div>
                {!preCliente && (
                  <button
                    onClick={() => {
                      setCliente(null);
                      setArea('');
                      setTipo('');
                    }}
                    className="text-[11px] font-semibold transition hover:opacity-70"
                    style={{ color: '#009ee3' }}
                  >
                    Cambiar
                  </button>
                )}
              </div>
            )}

            {paso === 'cliente' && (
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 pt-5 pb-4 border-b border-gray-100">
                  <p className="text-[15px] font-bold text-gray-800 mb-0.5">
                    ¿Para qué cliente es la solicitud?
                  </p>
                  <p className="text-[12px] text-gray-400">Buscá por nombre o código</p>
                </div>
                <div className="px-6 py-4">
                  <div className="relative mb-4">
                    <Search
                      size={13}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      value={busqueda}
                      autoFocus
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar cliente…"
                      className="w-full h-[38px] rounded-xl border border-gray-200 pl-8 pr-8 text-[13px] text-gray-800 focus:outline-none focus:border-[#009ee3] transition"
                    />
                    {busqueda && (
                      <button
                        onClick={() => setBusqueda('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <div className="space-y-0.5 max-h-[420px] overflow-y-auto">
                    {listaClientes.length === 0 ? (
                      <p className="text-[13px] text-gray-400 text-center py-10">Sin resultados</p>
                    ) : (
                      listaClientes.map((c) => (
                        <button
                          key={c.cliente_cod}
                          onClick={() => {
                            setCliente(c);
                            setBusqueda('');
                          }}
                          className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-gray-50 transition"
                        >
                          <div
                            className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                            style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}
                          >
                            {initials(c.cliente_nombre)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-gray-800 truncate">
                              {c.cliente_nombre}
                            </p>
                            <p className="text-[11px] text-gray-400">{c.cliente_cod}</p>
                          </div>
                          {c.mora_total > 0 && (
                            <p className="text-[12px] font-bold tabular-nums text-gray-500">
                              {fmtCRC(c.mora_total)}
                            </p>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {paso === 'area' && (
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
                <p className="text-[15px] font-bold text-gray-800 mb-1">Área destino</p>
                <p className="text-[12px] text-gray-400 mb-4">
                  ¿A qué área se dirige esta solicitud?
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {AREAS.map((a) => (
                    <button
                      key={a.key}
                      onClick={() => {
                        setArea(a.key);
                        setTipo('');
                      }}
                      className="flex items-start gap-3 rounded-2xl p-4 text-left transition hover:scale-[1.01]"
                      style={{ border: `1.5px solid ${a.color}40`, backgroundColor: a.bg }}
                    >
                      <div
                        className="flex-shrink-0 rounded-xl p-2.5"
                        style={{ backgroundColor: `${a.color}20`, color: a.color }}
                      >
                        {AREA_ICON[a.key]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-gray-800 mb-0.5">{a.label}</p>
                        <p className="text-[11px] text-gray-500 leading-snug">{a.descripcion}</p>
                      </div>
                      <ChevronRight size={16} className="flex-shrink-0 self-center text-gray-300" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {paso === 'tipo' && areaDef && (
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
                <p className="text-[15px] font-bold text-gray-800 mb-1">Tipo de solicitud</p>
                <p className="text-[12px] text-gray-400 mb-4">
                  Área:{' '}
                  <span className="font-semibold" style={{ color: areaDef.color }}>
                    {areaDef.label}
                  </span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {getTiposPorArea(area).map((t) => {
                    const pr = PRIORIDAD_CFG[t.prioridad];
                    return (
                      <button
                        key={t.tipo}
                        onClick={() => setTipo(t.tipo)}
                        className="flex flex-col gap-2 rounded-xl p-3.5 text-left transition hover:scale-[1.01]"
                        style={{
                          backgroundColor: areaDef.bg,
                          border: `1.5px solid ${areaDef.color}40`,
                        }}
                      >
                        <span className="text-[13px] font-bold text-gray-800 leading-tight">
                          {t.tipo}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-[10px] font-bold rounded-full px-2 py-0.5"
                            style={{ backgroundColor: pr.bg, color: pr.text }}
                          >
                            {t.prioridad}
                          </span>
                          <span className="text-[10px] font-semibold text-gray-500">
                            SLA {t.sla_horas}h
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="pt-4">
                  <button
                    onClick={() => setArea('')}
                    className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 hover:text-gray-700"
                  >
                    <ArrowLeft size={14} /> Cambiar área
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════ PASO DETALLE — layout 2 columnas ══════════════
  const prioBox = catItem ? (PRIO_BOX[catItem.prioridad] ?? PRIO_BOX.Media) : PRIO_BOX.Media;

  return (
    <div
      style={{
        backgroundColor: '#f0f4f8',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* TOPBAR — siempre visible */}
      <div className="bg-white border-b border-gray-200 flex items-center justify-between px-6 py-3 flex-shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={volver}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-600 hover:text-gray-900 flex-shrink-0"
          >
            <ArrowLeft size={15} /> {origenFicha ? 'Volver al cliente' : 'Volver'}
          </button>
          <span className="text-gray-300 hidden sm:inline">·</span>
          <p className="text-[12px] text-gray-400 truncate hidden sm:block">
            Clientes ›{' '}
            <span className="font-semibold text-gray-600">{cliente?.cliente_nombre}</span> › Nueva
            solicitud
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={volver}
            className="rounded-xl border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={() => enviar()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#009ee3' }}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Enviar solicitud
          </button>
        </div>
      </div>

      <div style={{ padding: '20px 24px' }} className="flex-1">
        {/* CLIENTE CARD — ancho completo */}
        {cliente && (
          <div
            className="rounded-[10px] bg-white px-4 py-3 flex items-center gap-3 mb-4"
            style={{ border: '0.5px solid #e2e8f0' }}
          >
            <div
              className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-[13px] font-black"
              style={{ backgroundColor: '#009ee3', color: '#fff' }}
            >
              {initials(cliente.cliente_nombre)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-gray-800 truncate">
                {cliente.cliente_nombre}
              </p>
              <p className="text-[11px] text-gray-400">
                {cliente.cliente_cod} · {cliente.tramo_peor}
              </p>
            </div>
            <span
              className="text-[11px] font-bold rounded-full px-3 py-1 flex items-center gap-1.5 flex-shrink-0"
              style={{ backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}
            >
              <Link2 size={12} />
              {gestionOrigen
                ? 'Originada desde gestión'
                : origenFicha
                  ? 'Creada desde ficha del cliente'
                  : 'Creación manual'}
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-[12px] text-red-700 font-semibold mb-4">
            {error}
          </div>
        )}

        {/* GRID 2 COLUMNAS */}
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16 }}>
          {/* ── COLUMNA IZQUIERDA ── */}
          <div className="space-y-4">
            {/* Card 1 — Información de la solicitud */}
            {areaDef && catItem && campos && (
              <div className="rounded-[10px] bg-white" style={{ border: '0.5px solid #e2e8f0' }}>
                <div
                  className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-gray-50"
                  style={{ backgroundColor: areaDef.bg }}
                >
                  <span className="text-[12px] font-bold" style={{ color: areaDef.color }}>
                    {areaDef.label}
                  </span>
                  <ChevronRight size={12} className="text-gray-400" />
                  <span className="text-[13px] font-bold text-gray-800">{catItem.tipo}</span>
                  <span
                    className="ml-auto text-[10px] font-bold rounded-full px-2 py-0.5"
                    style={{
                      backgroundColor: PRIORIDAD_CFG[catItem.prioridad].bg,
                      color: PRIORIDAD_CFG[catItem.prioridad].text,
                    }}
                  >
                    {catItem.prioridad} · SLA {catItem.sla_horas}h
                  </span>
                </div>
                <div className="p-4 space-y-3.5">
                  <div>
                    <label className={labelCls}>Descripción del caso *</label>
                    <textarea
                      value={descripcion}
                      onChange={(e) => setDescripcion(e.target.value)}
                      rows={5}
                      placeholder="Detallá el caso, contexto y lo que se solicita…"
                      className={`${inputCls} resize-none`}
                    />
                  </div>

                  {campos.monto && (
                    <div>
                      <label className={labelCls}>{campos.monto}</label>
                      <input
                        type="text"
                        value={monto}
                        onChange={(e) => setMonto(e.target.value)}
                        placeholder="Ej: 250000"
                        className={inputCls}
                      />
                    </div>
                  )}

                  <div>
                    <label className={labelCls}>
                      Observaciones {campos.observaciones === 'obligatoria' ? '*' : '(opcional)'}
                    </label>
                    <textarea
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      rows={3}
                      placeholder="Notas, contexto adicional o el dato a actualizar…"
                      className={`${inputCls} resize-none`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Card 2 — Factura multi-selección (solo si aplica) */}
            {campos && campos.factura && (
              <div
                className="rounded-[10px] bg-white p-4 space-y-3"
                style={{ border: '0.5px solid #e2e8f0' }}
              >
                <div className="flex items-center justify-between">
                  <label className={labelCls + ' mb-0'}>
                    Factura(s) {campos.factura === 'obligatoria' ? '*' : '(opcional)'}
                  </label>
                  {/* Toggle "Factura cancelada" */}
                  <button
                    type="button"
                    onClick={() => {
                      setFactCancelada((v) => !v);
                      setFacturasSet(new Set());
                      setFactCanceladaTxt('');
                    }}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold transition"
                    style={
                      factCancelada
                        ? {
                            backgroundColor: '#ffedd5',
                            color: '#c2410c',
                            border: '1px solid #fed7aa',
                          }
                        : {
                            backgroundColor: '#f1f5f9',
                            color: '#64748b',
                            border: '1px solid #e2e8f0',
                          }
                    }
                  >
                    ⚠ Factura cancelada
                  </button>
                </div>

                {factCancelada ? (
                  /* Modo factura cancelada: input de texto libre */
                  <div>
                    <p className="text-[11px] text-orange-600 font-semibold mb-1.5">
                      La factura no existe en el sistema. Ingresá el número manualmente:
                    </p>
                    <input
                      type="text"
                      value={factCanceladaTxt}
                      onChange={(e) => setFactCanceladaTxt(e.target.value)}
                      placeholder="Ej: FAC-001, FAC-002 (separadas por coma)"
                      className={inputCls}
                    />
                  </div>
                ) : (
                  /* Modo normal: multi-selección con búsqueda */
                  <div className="space-y-2">
                    {/* Tags de facturas seleccionadas */}
                    {facturasSet.size > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {Array.from(facturasSet).map((doc) => (
                          <span
                            key={doc}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
                            style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}
                          >
                            {doc}
                            <button
                              type="button"
                              onClick={() => toggleFacturaSel(doc)}
                              className="text-blue-400 hover:text-blue-700"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Búsqueda */}
                    <div className="relative">
                      <Search
                        size={12}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                      />
                      <input
                        type="text"
                        value={facturasBusq}
                        onChange={(e) => setFacturasBusq(e.target.value)}
                        placeholder="Buscar factura…"
                        className="w-full rounded-xl border border-gray-200 pl-7 pr-3 py-2 text-[12px] text-gray-700 focus:outline-none focus:border-[#009ee3] transition"
                      />
                    </div>
                    {/* Lista */}
                    <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50 max-h-48 overflow-y-auto">
                      {facturasFiltradas.length === 0 ? (
                        <p className="text-[12px] text-gray-400 text-center py-4">
                          {facturas.length === 0 ? 'Sin facturas con saldo' : 'Sin coincidencias'}
                        </p>
                      ) : (
                        facturasFiltradas.map((f) => {
                          const sel = facturasSet.has(String(f.documento));
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => toggleFacturaSel(String(f.documento))}
                              className="w-full flex items-center justify-between px-3 py-2 text-left transition"
                              style={{ backgroundColor: sel ? '#f0f9ff' : undefined }}
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                                  style={{
                                    border: `2px solid ${sel ? '#009ee3' : '#e2e8f0'}`,
                                    backgroundColor: sel ? '#009ee3' : 'white',
                                  }}
                                >
                                  {sel && (
                                    <span className="text-white text-[9px] font-black">✓</span>
                                  )}
                                </div>
                                <span className="text-[12px] font-semibold text-gray-800">
                                  {f.documento}
                                </span>
                              </div>
                              <span className="text-[12px] font-bold tabular-nums text-gray-500">
                                {fmtCRC(f.saldo)}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── COLUMNA DERECHA ── */}
          <div className="space-y-4">
            {/* Card 1 — Responsable */}
            <div className="rounded-[10px] bg-white p-4" style={{ border: '0.5px solid #e2e8f0' }}>
              <p className="text-[12px] font-bold text-gray-700 mb-3">Responsable</p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Nombre {!respFijo && '*'}</label>
                  <input
                    type="text"
                    value={respNombre}
                    onChange={(e) => setRespNombre(e.target.value)}
                    disabled={!!respFijo}
                    placeholder="Nombre del responsable"
                    className={respFijo ? inputDisabled : inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Email {!respFijo && '*'}</label>
                  <DirectorioInput
                    value={respEmail}
                    onChange={setRespEmail}
                    onSelect={(c) => {
                      setRespEmail(c.email);
                      setRespNombre(c.nombre);
                    }}
                    multiple={false}
                    disabled={!!respFijo}
                    placeholder="Nombre o correo…"
                    className={respFijo ? inputDisabled : inputCls}
                  />
                </div>
                {respFijo && <p className="text-[11px] text-gray-400">Responsable fijo del área</p>}

                {/* CC — Con copia a (opcional) */}
                <div>
                  <label className={labelCls}>
                    Con copia a{' '}
                    <span className="font-normal normal-case tracking-normal text-gray-400">
                      (CC · opcional)
                    </span>
                  </label>
                  <div className="flex gap-1.5">
                    <div className="flex-1">
                      <DirectorioInput
                        value={ccInput}
                        onChange={setCcInput}
                        onSelect={(c) => addCC(c.email)}
                        multiple={false}
                        onBlur={() => {
                          if (ccInput.trim()) addCC(ccInput);
                        }}
                        placeholder="Nombre o email…"
                        className={inputCls}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => addCC(ccInput)}
                      className="rounded-xl px-3 py-2 text-[12px] font-bold text-white flex-shrink-0 transition hover:opacity-90"
                      style={{ backgroundColor: '#009ee3' }}
                    >
                      +
                    </button>
                  </div>
                  {ccEmails.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {ccEmails.map((e, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{
                            backgroundColor: '#f1f5f9',
                            color: '#475569',
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          {e}
                          <button
                            type="button"
                            onClick={() => setCcEmails((prev) => prev.filter((_, j) => j !== i))}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Card 2 — Prioridad y SLA */}
            {catItem && (
              <div
                className="rounded-[10px] bg-white p-4"
                style={{ border: '0.5px solid #e2e8f0' }}
              >
                <p className="text-[12px] font-bold text-gray-700 mb-3">Prioridad y SLA</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Prioridad</label>
                    <input
                      readOnly
                      value={catItem.prioridad}
                      className="w-full rounded-xl px-3 py-2.5 text-[13px] font-bold cursor-default border-0"
                      style={{ backgroundColor: prioBox.bg, color: prioBox.text }}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>SLA objetivo</label>
                    <input
                      readOnly
                      value={`${catItem.sla_horas} horas`}
                      className={inputDisabled}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className={labelCls}>Vencimiento estimado</label>
                  <input readOnly value={venceStr} className={inputDisabled} />
                </div>
              </div>
            )}

            {/* Card 3 — Adjuntos */}
            <div className="rounded-[10px] bg-white p-4" style={{ border: '0.5px solid #e2e8f0' }}>
              <p className="text-[12px] font-bold text-gray-700 mb-3">Adjuntos (opcional)</p>
              <input
                ref={fileRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) procesarArchivos(e.target.files);
                  e.target.value = '';
                }}
              />
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files) procesarArchivos(e.dataTransfer.files);
                }}
                className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all"
                style={{
                  padding: 16,
                  borderColor: dragOver ? '#009ee3' : '#e2e8f0',
                  backgroundColor: dragOver ? '#f0f9ff' : '#fafafa',
                }}
              >
                <Upload size={18} style={{ color: dragOver ? '#009ee3' : '#94a3b8' }} />
                <p
                  className="text-[12px] font-semibold"
                  style={{ color: dragOver ? '#009ee3' : '#64748b' }}
                >
                  Arrastrá o hacé clic para adjuntar
                </p>
                <p className="text-[10px] text-gray-400">PDF, JPG, PNG — máx. 10MB</p>
              </div>
              {adjuntos.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {adjuntos.map((a, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 text-[11px] rounded-lg px-2.5 py-1.5"
                      style={{ backgroundColor: '#f0fdf4', border: '0.5px solid #bbf7d0' }}
                    >
                      <FileText size={12} className="text-green-600 flex-shrink-0" />
                      <span className="flex-1 truncate text-gray-700">{a.name}</span>
                      <span className="text-gray-400">{a.sizeKB} KB</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAdjuntos((prev) => prev.filter((_, j) => j !== i));
                          setAdjuntosBlobs((prev) => prev.filter((_, j) => j !== i));
                        }}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
