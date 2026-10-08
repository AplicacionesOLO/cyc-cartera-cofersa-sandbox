'use client';

import { useState, useRef, useLayoutEffect } from 'react';
import {
  LayoutDashboard,
  Smartphone,
  FileText,
  Users,
  BarChart3,
  Layers,
  Search,
  ExternalLink,
  Plus,
  AlertCircle,
  Building2,
  Copy,
  Check,
  Pencil,
  Percent,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import ModalRegistrarAplicacion from './ModalRegistrarAplicacion';
import ModalEditarAplicacion from './ModalEditarAplicacion';
import type { AplicacionRecurso } from '@/types/centro-recursos';
import { useCentroRecursosController } from '@/views/centro-recursos/hooks/use-centro-recursos-controller';
import { useHaciendaController } from '@/views/notificaciones/hooks/use-hacienda-controller';

interface Props {
  aplicaciones: AplicacionRecurso[];
  soyCoordinador: boolean;
}

// ── Mapa de íconos (string → componente lucide) ──────────────────────────
const ICONOS: Record<string, React.ComponentType<{ size?: number }>> = {
  LayoutDashboard,
  Smartphone,
  FileText,
  Users,
  BarChart3,
  Layers,
};

function Icono({ nombre, size = 20 }: { nombre: string; size?: number }) {
  const Cmp = ICONOS[nombre] ?? Layers;
  return <Cmp size={size} />;
}

// ── Barra de acento por aplicación (identidad visual, solo presentación) ──
function colorAcento(nombre: string): string {
  const n = nombre.toLowerCase();
  if (n.includes('scd') || n.includes('cliente digital')) return 'bg-blue-500';
  if (n.includes('factura')) return 'bg-indigo-500';
  if (n.includes('portal de clientes')) return 'bg-purple-500';
  if (n.includes('oic') || n.includes('reportes')) return 'bg-emerald-500';
  return 'bg-slate-300';
}

// ── Tipos de la respuesta de Hacienda (estado tributario) ─────────────────
interface HaciendaData {
  nombre?: string;
  tipoIdentificacion?: string;
  regimen?: string;
  situacion?: { moroso?: boolean; omiso?: boolean; estado?: string };
  actividades?: Array<{ descripcion: string; estado: string }>;
}

// ── Tipo de resultado CABYS ────────────────────────────────────────────────
interface CabysItem {
  codigo: string;
  descripcion: string;
  impuesto: number;
}

export default function TabAplicaciones({ aplicaciones: init, soyCoordinador }: Props) {
  const [aplicaciones, setAplicaciones] = useState<AplicacionRecurso[]>(init);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<AplicacionRecurso | null>(null);
  const { actualizarAplicacion } = useCentroRecursosController();
  const { consultarContribuyente, buscarCabys } = useHaciendaController();

  // Estado de la consulta de Hacienda (estado tributario)
  const [identificacion, setIdentificacion] = useState('');
  const [consultando, setConsultando] = useState(false);
  const [resultado, setResultado] = useState<HaciendaData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [copiadoNombre, setCopiadoNombre] = useState(false);

  // Estado del buscador CABYS
  const [cabysQuery, setCabysQuery] = useState('');
  const [cabysBuscando, setCabysBuscando] = useState(false);
  const [cabysResultados, setCabysResultados] = useState<CabysItem[]>([]);
  const [cabysError, setCabysError] = useState(false);
  const [cabysBuscado, setCabysBuscado] = useState(false);
  const [codigoCopiado, setCodigoCopiado] = useState<string | null>(null);

  async function handleConsultar(e: React.FormEvent) {
    e.preventDefault();
    if (!identificacion.trim()) return;
    setConsultando(true);
    setResultado(null);
    setNotFound(false);
    setError(false);
    try {
      const json = await consultarContribuyente(identificacion.trim());
      if (json.notFound) {
        setNotFound(true);
        return;
      }
      if (json.error) {
        setError(true);
        return;
      }
      setResultado(json.data as HaciendaData);
    } catch {
      setError(true);
    } finally {
      setConsultando(false);
    }
  }

  function copiarNombre() {
    if (!resultado?.nombre) return;
    navigator.clipboard.writeText(resultado.nombre).then(() => {
      setCopiadoNombre(true);
      setTimeout(() => setCopiadoNombre(false), 1500);
    });
  }

  async function handleBuscarCabys(e: React.FormEvent) {
    e.preventDefault();
    if (!cabysQuery.trim()) return;
    setCabysBuscando(true);
    setCabysError(false);
    setCabysBuscado(true);
    try {
      const json = await buscarCabys(cabysQuery.trim());
      if (json.error) {
        setCabysError(true);
        setCabysResultados([]);
        return;
      }
      setCabysResultados(json.data as CabysItem[]);
    } catch {
      setCabysError(true);
      setCabysResultados([]);
    } finally {
      setCabysBuscando(false);
    }
  }

  function copiarCodigo(codigo: string) {
    navigator.clipboard.writeText(codigo).then(() => {
      setCodigoCopiado(codigo);
      setTimeout(() => setCodigoCopiado(null), 1500);
    });
  }

  // SIC ya es la aplicación que el usuario está usando — no tiene sentido
  // linkearse a sí misma desde su propio lanzador de apps.
  const aplicacionesVisibles = aplicaciones
    .filter((a) => a.nombre.trim().toUpperCase() !== 'SIC')
    .sort((a, b) => a.orden - b.orden);

  // ── Reordenamiento de apps (FLIP: captura posiciones antes del cambio de
  // estado y anima la transición al nuevo layout del grid) ──────────────────
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevRects = useRef<Record<string, DOMRect>>({});

  useLayoutEffect(() => {
    for (const [id, el] of Object.entries(cardRefs.current)) {
      if (!el) continue;
      const prev = prevRects.current[id];
      if (!prev) continue;
      const next = el.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (dx || dy) {
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          el.style.transition = 'transform 300ms ease';
          el.style.transform = '';
        });
      }
    }
  }, [aplicaciones]);

  async function moverOrden(app: AplicacionRecurso, direccion: 'arriba' | 'abajo') {
    const idx = aplicacionesVisibles.findIndex((a) => a.id === app.id);
    const idxVecino = direccion === 'arriba' ? idx - 1 : idx + 1;
    if (idxVecino < 0 || idxVecino >= aplicacionesVisibles.length) return;
    const vecino = aplicacionesVisibles[idxVecino];
    const ordenApp = app.orden;
    const ordenVecino = vecino.orden;

    // Captura posiciones actuales antes de reordenar (para la animación FLIP)
    prevRects.current = Object.fromEntries(
      Object.entries(cardRefs.current)
        .filter(([, el]) => el)
        .map(([id, el]) => [id, el!.getBoundingClientRect()]),
    );

    setAplicaciones((prev) =>
      prev.map((a) => {
        if (a.id === app.id) return { ...a, orden: ordenVecino };
        if (a.id === vecino.id) return { ...a, orden: ordenApp };
        return a;
      }),
    );

    try {
      // Si cualquiera de los dos PUT falla (ApiError), se revierte el orden en el catch
      await Promise.all([
        actualizarAplicacion(app.id, { orden: ordenVecino }),
        actualizarAplicacion(vecino.id, { orden: ordenApp }),
      ]);
    } catch {
      setAplicaciones((prev) =>
        prev.map((a) => {
          if (a.id === app.id) return { ...a, orden: ordenApp };
          if (a.id === vecino.id) return { ...a, orden: ordenVecino };
          return a;
        }),
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Dual widget: Hacienda + CABYS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Caja izquierda: Estado Tributario */}
        <div className="bg-slate-50/60 rounded-2xl border border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={16} className="text-gray-400" />
            <h3 className="text-[13px] font-bold text-gray-700 uppercase tracking-wide">
              Estado Tributario – Hacienda
            </h3>
          </div>
          <form onSubmit={handleConsultar} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={identificacion}
                onChange={(e) => setIdentificacion(e.target.value)}
                placeholder="Cédula física o jurídica"
                className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
              />
            </div>
            <button
              type="submit"
              disabled={consultando}
              className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-60 shadow-sm hover:shadow-md transition flex-shrink-0"
              style={{ backgroundColor: '#009ee3' }}
            >
              {consultando ? 'Consultando...' : 'Consultar'}
            </button>
          </form>

          {error && (
            <div className="flex items-center gap-2 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={13} /> No se pudo consultar Hacienda en este momento. Intentá de
              nuevo más tarde.
            </div>
          )}
          {notFound && (
            <div className="flex items-center gap-2 mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              <AlertCircle size={13} /> No se encontró contribuyente con esa identificación.
            </div>
          )}
          {resultado && (
            <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-gray-800">{resultado.nombre}</p>
                <button
                  type="button"
                  onClick={copiarNombre}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold flex-shrink-0 transition-colors"
                  style={{
                    backgroundColor: copiadoNombre ? '#f0fdf4' : '#f1f5f9',
                    color: copiadoNombre ? '#16a34a' : '#64748b',
                  }}
                >
                  {copiadoNombre ? <Check size={11} /> : <Copy size={11} />}{' '}
                  {copiadoNombre ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
                {resultado.tipoIdentificacion && (
                  <span>
                    Tipo: <strong>{resultado.tipoIdentificacion}</strong>
                  </span>
                )}
                {resultado.regimen && (
                  <span>
                    Régimen: <strong>{resultado.regimen}</strong>
                  </span>
                )}
                {resultado.situacion?.estado && (
                  <span>
                    Estado: <strong>{resultado.situacion.estado}</strong>
                  </span>
                )}
              </div>
              {resultado.actividades && resultado.actividades.length > 0 && (
                <div className="pt-2">
                  <p className="text-[11px] font-bold text-gray-400 uppercase mb-1">
                    Actividades económicas
                  </p>
                  <ul className="text-xs text-gray-600 space-y-0.5">
                    {resultado.actividades.map((act, i) => (
                      <li key={i}>
                        • {act.descripcion} <span className="text-gray-400">({act.estado})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Caja derecha: Catálogo CABYS */}
        <div className="bg-slate-50/60 rounded-2xl border border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Percent size={16} className="text-gray-400" />
            <h3 className="text-[13px] font-bold text-gray-700 uppercase tracking-wide">
              Catálogo de Bienes y Servicios – CABYS
            </h3>
          </div>
          <form onSubmit={handleBuscarCabys} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={cabysQuery}
                onChange={(e) => setCabysQuery(e.target.value)}
                placeholder="Ej: arroz, transporte, o código..."
                className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
              />
            </div>
            <button
              type="submit"
              disabled={cabysBuscando}
              className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-60 shadow-sm hover:shadow-md transition flex-shrink-0"
              style={{ backgroundColor: '#009ee3' }}
            >
              {cabysBuscando ? 'Buscando...' : 'Buscar'}
            </button>
          </form>

          {cabysError && (
            <div className="flex items-center gap-2 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={13} /> No se pudo consultar el catálogo CABYS en este momento.
            </div>
          )}
          {!cabysError && cabysBuscado && !cabysBuscando && cabysResultados.length === 0 && (
            <div className="flex items-center gap-2 mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              <AlertCircle size={13} /> Sin resultados para esa búsqueda.
            </div>
          )}
          {cabysResultados.length > 0 && (
            <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 divide-y divide-gray-100 max-h-64 overflow-y-auto">
              {cabysResultados.map((item) => (
                <div
                  key={item.codigo}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-gray-700">{item.codigo}</p>
                    <p className="text-xs text-gray-600 truncate">{item.descripcion}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: '#eff6ff', color: '#009ee3' }}
                    >
                      IVA {item.impuesto}%
                    </span>
                    <button
                      type="button"
                      onClick={() => copiarCodigo(item.codigo)}
                      className="flex items-center justify-center rounded-lg p-1.5 transition-colors"
                      style={{
                        backgroundColor: codigoCopiado === item.codigo ? '#f0fdf4' : '#f1f5f9',
                        color: codigoCopiado === item.codigo ? '#16a34a' : '#64748b',
                      }}
                      title="Copiar código CABYS"
                    >
                      {codigoCopiado === item.codigo ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Lanzador de aplicaciones ── */}
      <div>
        <div className="flex justify-end mb-3">
          {soyCoordinador && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white transition"
              style={{ backgroundColor: '#009ee3' }}
            >
              <Plus size={14} /> Registrar Aplicación
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {aplicacionesVisibles.map((app, idx) => (
            <div
              key={app.id}
              ref={(el) => {
                cardRefs.current[app.id] = el;
              }}
              className="group relative bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3 overflow-hidden hover:-translate-y-1 hover:shadow-md hover:text-slate-800 transition-all duration-300 ease-in-out"
            >
              <div className={`absolute top-0 left-0 right-0 h-[3px] ${colorAcento(app.nombre)}`} />
              {soyCoordinador && (
                <div className="absolute top-3 right-2 flex items-center gap-0.5">
                  <button
                    onClick={() => moverOrden(app, 'arriba')}
                    disabled={idx === 0}
                    className="flex items-center justify-center rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title="Subir"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    onClick={() => moverOrden(app, 'abajo')}
                    disabled={idx === aplicacionesVisibles.length - 1}
                    className="flex items-center justify-center rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title="Bajar"
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    onClick={() => setEditTarget(app)}
                    className="flex items-center justify-center rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    title="Editar aplicación"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between pr-16 pt-1">
                <div
                  className="flex items-center justify-center rounded-lg"
                  style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: '#eff6ff',
                    color: '#009ee3',
                  }}
                >
                  <Icono nombre={app.icono} />
                </div>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}
                >
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500 ring-2 ring-green-400/30 animate-pulse flex-shrink-0" />
                  {app.estado}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-800">{app.nombre}</p>
                {app.descripcion && (
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{app.descripcion}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => window.open(app.url, '_blank')}
                className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition"
                style={{ backgroundColor: '#f1f5f9', color: '#374151' }}
              >
                <ExternalLink size={13} /> Abrir aplicación
              </button>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <ModalRegistrarAplicacion
          onClose={() => setShowModal(false)}
          onSuccess={(nueva) => {
            setAplicaciones((prev) => [...prev, nueva]);
            setShowModal(false);
          }}
        />
      )}

      {editTarget && (
        <ModalEditarAplicacion
          aplicacion={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={(actualizada) => {
            setAplicaciones((prev) => prev.map((a) => (a.id === actualizada.id ? actualizada : a)));
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}
