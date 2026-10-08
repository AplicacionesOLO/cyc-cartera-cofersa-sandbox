'use client';

import { useState, useEffect, Fragment } from 'react';
import {
  Search,
  MessageCircle,
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { buildWhatsAppUrl } from '@/lib/utils/whatsapp';
import ModalAgregarMarca from './ModalAgregarMarca';
import type { AgenteDirectorio, JefeRegionalNodo, Comprador, Marca } from '@/types/centro-recursos';
import { useCentroRecursosController } from '@/views/centro-recursos/hooks/use-centro-recursos-controller';

interface Props {
  agentes: AgenteDirectorio[];
  arbol: JefeRegionalNodo[];
  compradores: Comprador[];
  soyCoordinador: boolean;
  marcaInicial?: string; // ?marca=<id> desde el buscador global -- resalta y filtra por esa marca al entrar
}

type Perspectiva = 'ventas' | 'marca';

type Filtro =
  | { tipo: 'todos' }
  | { tipo: 'acotado' }
  | { tipo: 'jefe'; valor: string }
  | { tipo: 'supervisor'; valor: string }
  | { tipo: 'vendedor'; valor: string }
  | { tipo: 'analista'; valor: string }
  | { tipo: 'comprador'; valor: string }
  | { tipo: 'marca'; valor: string };

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

// Anchos compartidos por la tabla raíz y la sub-tabla de miembros acotados,
// para que ambas alineen exactamente las mismas columnas (mismo colgroup).
const COL_WIDTHS = ['12%', '30%', '14%', '24%', '20%'];
const CHEVRON_SLOT = 19; // px — ancho del chevron/placeholder + gap en la fila raíz

function ColgroupAgentes() {
  return (
    <colgroup>
      {COL_WIDTHS.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  );
}

// Normalización puramente visual (capa de presentación): unifica el nombre
// mostrado para un mismo código de ruta cuando la fila de supervisor y la de
// vendedor placeholder llegaron con variantes distintas del nombre. No toca
// datos ni relaciones en el origen — solo el string que se dibuja en pantalla.
const NOMBRES_OFICIALES: Record<string, string> = {
  '112': 'Joshua Wright Abarca', // Ruta de Control (vendedor placeholder Z112)
  JWRIGHT: 'Joshua Wright Abarca', // Nodo de Supervisor
  '221': 'Viviana Maria Arce', // Ruta de Control (vendedor placeholder Z221)
  VARCE: 'Viviana Maria Arce', // Nodo de Supervisor
  // Esteban Araya (159 / EARAYA) confirmado igual en ambos lados — no requiere entrada.
};
function nombreOficial(cod: string, nombreOriginal: string): string {
  return NOMBRES_OFICIALES[cod] ?? nombreOriginal;
}

// Quita acentos y normaliza espacios/mayúsculas para comparar nombres de forma tolerante
function normalizarNombre(nombre: string): string {
  return nombre.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

// Detecta si dos nombres representan a la misma persona, aunque uno traiga un
// apellido de más (ej. "ESTEBAN ARAYA" vs "ESTEBAN ARAYA MONGE"). Solo se usa
// para decidir qué NO repetir en el árbol — nunca para escribir en la base.
function mismaPersona(nombreA: string, nombreB: string): boolean {
  const a = normalizarNombre(nombreA);
  const b = normalizarNombre(nombreB);
  if (a === b) return true;
  const doblePalabra = (s: string) => s.split(' ').slice(0, 2).join(' ');
  return doblePalabra(a) === doblePalabra(b);
}

export default function TabDirectorioAgentes({
  agentes,
  arbol,
  compradores: compradoresInit,
  soyCoordinador,
  marcaInicial,
}: Props) {
  const [compradores, setCompradores] = useState<Comprador[]>(compradoresInit);
  const [busqueda, setBusqueda] = useState('');
  const [perspectiva, setPerspectiva] = useState<Perspectiva>(marcaInicial ? 'marca' : 'ventas');
  const [filtro, setFiltro] = useState<Filtro>(
    marcaInicial ? { tipo: 'marca', valor: marcaInicial } : { tipo: 'todos' },
  );
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [showModalMarca, setShowModalMarca] = useState(false);
  const [showAnalistaMenu, setShowAnalistaMenu] = useState(false);

  // Si llega ?marca=<id> desde el buscador global después del primer render
  // (navegación cliente sin remount), sincroniza perspectiva + filtro igual.
  useEffect(() => {
    if (marcaInicial) {
      setPerspectiva('marca');
      setFiltro({ tipo: 'marca', valor: marcaInicial });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcaInicial]);

  // ── Kanban de marcas: drag & drop + edición inline (solo coordinador) ────
  const [draggingMarca, setDraggingMarca] = useState<string | null>(null);
  const [dragOverComprador, setDragOverComprador] = useState<string | null>(null);
  const [editandoMarca, setEditandoMarca] = useState<{ id: string; valor: string } | null>(null);
  const { actualizarMarca } = useCentroRecursosController();

  function iniciarEdicionMarca(m: Marca) {
    setEditandoMarca({ id: m.id, valor: m.nombre });
  }
  function cancelarEdicionMarca() {
    setEditandoMarca(null);
  }

  async function confirmarEdicionMarca(marcaId: string) {
    if (!editandoMarca || editandoMarca.id !== marcaId) return;
    const valor = editandoMarca.valor.trim();
    if (!valor) return;
    try {
      await actualizarMarca(marcaId, { nombre: valor });
      setCompradores((prev) =>
        prev.map((c) => ({
          ...c,
          marcas: c.marcas.map((m) => (m.id === marcaId ? { ...m, nombre: valor } : m)),
        })),
      );
      setEditandoMarca(null);
    } catch {
      // deja el input abierto para que el usuario reintente o cancele
    }
  }

  async function moverMarca(marcaId: string, nuevoCompradorId: string) {
    const origen = compradores.find((c) => c.marcas.some((m) => m.id === marcaId));
    if (!origen || origen.id === nuevoCompradorId) return;
    const marca = origen.marcas.find((m) => m.id === marcaId)!;

    // Optimistic update — mueve la marca en el estado antes de confirmar con el servidor
    setCompradores((prev) =>
      prev.map((c) => {
        if (c.id === origen.id) return { ...c, marcas: c.marcas.filter((m) => m.id !== marcaId) };
        if (c.id === nuevoCompradorId) return { ...c, marcas: [...c.marcas, marca] };
        return c;
      }),
    );

    try {
      await actualizarMarca(marcaId, { comprador_id: nuevoCompradorId });
    } catch {
      // Revertir si falla la persistencia
      setCompradores((prev) =>
        prev.map((c) => {
          if (c.id === nuevoCompradorId)
            return { ...c, marcas: c.marcas.filter((m) => m.id !== marcaId) };
          if (c.id === origen.id) return { ...c, marcas: [...c.marcas, marca] };
          return c;
        }),
      );
    }
  }

  function cambiarPerspectiva(p: Perspectiva) {
    setPerspectiva(p);
    setFiltro({ tipo: 'todos' });
  }

  const q = busqueda.trim().toLowerCase();

  // ── Perspectiva Ventas ────────────────────────────────────────────
  // Purga de duplicados (solo UI): un vendedor que ya aparece como miembro
  // secundario dentro del acordeón de su Principal no debe repetirse como
  // fila independiente en la raíz de la tabla. No toca datos ni consultas —
  // solo se calcula acá, a partir de lo que ya trae `agentes.miembros_acotado`.
  const codsMiembro = new Set<string>();
  agentes.forEach((a) => a.miembros_acotado.forEach((m) => codsMiembro.add(m.cod)));

  const coincideBusquedaAgente = (a: AgenteDirectorio) => {
    if (!q) return true;
    return [
      a.cod,
      a.nombre,
      a.supervisor_nombre,
      a.jefe_regional_nombre,
      a.zona,
      a.analista_nombre,
    ].some((v) => (v ?? '').toLowerCase().includes(q));
  };
  const coincideFiltroAgente = (a: AgenteDirectorio) => {
    switch (filtro.tipo) {
      case 'todos':
        return true;
      case 'acotado':
        return a.es_principal_acotado;
      case 'jefe':
        return filtro.valor === '__sin_asignar__'
          ? !!a.supervisor_cod && !a.jefe_regional_cod
          : a.jefe_regional_cod === filtro.valor;
      case 'supervisor':
        return a.supervisor_cod === filtro.valor;
      case 'vendedor':
        return a.cod === filtro.valor;
      case 'analista':
        return a.analista_nombre === filtro.valor;
      default:
        return true;
    }
  };
  const agentesVisibles = agentes.filter(
    (a) =>
      (a.es_principal_acotado || !codsMiembro.has(a.cod)) &&
      coincideBusquedaAgente(a) &&
      coincideFiltroAgente(a),
  );
  const analistasUnicos = Array.from(
    new Set(agentes.map((a) => a.analista_nombre).filter((n): n is string => !!n)),
  ).sort((x, y) => x.localeCompare(y));

  function toggleExpandido(cod: string) {
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(cod)) next.delete(cod);
      else next.add(cod);
      return next;
    });
  }

  // ── Perspectiva Marca ─────────────────────────────────────────────
  const coincideBusquedaComprador = (c: Comprador) => {
    if (!q) return true;
    return [c.nombre, c.email, ...c.marcas.map((m) => m.nombre)].some((v) =>
      (v ?? '').toLowerCase().includes(q),
    );
  };
  const coincideFiltroComprador = (c: Comprador) => {
    switch (filtro.tipo) {
      case 'todos':
        return true;
      case 'comprador':
        return c.id === filtro.valor;
      case 'marca':
        return c.marcas.some((m) => m.id === filtro.valor);
      default:
        return true;
    }
  };
  const compradoresVisibles = compradores.filter(
    (c) => coincideBusquedaComprador(c) && coincideFiltroComprador(c),
  );
  const marcaResaltada = filtro.tipo === 'marca' ? filtro.valor : null;

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* ── Panel izquierdo: filtros y árbol ── */}
      <div className="w-full lg:w-1/4 flex-shrink-0 lg:sticky lg:top-4 space-y-4">
        {/* Toggle de perspectiva */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-1.5 flex gap-1">
          <button
            onClick={() => cambiarPerspectiva('ventas')}
            className="flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors"
            style={
              perspectiva === 'ventas'
                ? { backgroundColor: '#eff6ff', color: '#009ee3' }
                : { color: '#64748b' }
            }
          >
            👔 Estructura de Ventas
          </button>
          <button
            onClick={() => cambiarPerspectiva('marca')}
            className="flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors"
            style={
              perspectiva === 'marca'
                ? { backgroundColor: '#eff6ff', color: '#009ee3' }
                : { color: '#64748b' }
            }
          >
            🏷️ Gerencias de Marca
          </button>
        </div>

        {/* Vistas rápidas */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-1.5">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
            Vistas Rápidas
          </p>
          <button
            onClick={() => setFiltro({ tipo: 'todos' })}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors"
            style={
              filtro.tipo === 'todos'
                ? { backgroundColor: '#eff6ff', color: '#009ee3' }
                : { color: '#374151' }
            }
          >
            {perspectiva === 'ventas' ? '🌍 Todos los Agentes' : '🌍 Todos los Compradores'}
          </button>
          {perspectiva === 'ventas' && (
            <button
              onClick={() => setFiltro({ tipo: 'acotado' })}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors"
              style={
                filtro.tipo === 'acotado'
                  ? { backgroundColor: '#eff6ff', color: '#009ee3' }
                  : { color: '#374151' }
              }
            >
              🔒 Portafolio Acotado
            </button>
          )}
          {perspectiva === 'ventas' && (
            <div className="relative">
              <button
                onClick={() => setShowAnalistaMenu((v) => !v)}
                className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors"
                style={
                  filtro.tipo === 'analista'
                    ? { backgroundColor: '#eff6ff', color: '#009ee3' }
                    : { color: '#374151' }
                }
              >
                <span className="truncate">
                  👩‍💻 Por Analista{filtro.tipo === 'analista' ? `: ${filtro.valor}` : ''}
                </span>
                <ChevronDown
                  size={13}
                  className="flex-shrink-0 transition-transform duration-200"
                  style={{ transform: showAnalistaMenu ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
              {showAnalistaMenu && (
                <div className="absolute left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg z-10 py-1 max-h-56 overflow-y-auto">
                  {analistasUnicos.length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">Sin analistas asignadas</p>
                  )}
                  {analistasUnicos.map((nombre) => (
                    <button
                      key={nombre}
                      onClick={() => {
                        setFiltro({ tipo: 'analista', valor: nombre });
                        setShowAnalistaMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors truncate"
                      style={
                        filtro.tipo === 'analista' && filtro.valor === nombre
                          ? { color: '#009ee3', fontWeight: 600 }
                          : { color: '#374151' }
                      }
                    >
                      {nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Árbol relacional */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
            Árbol Relacional
          </p>
          <div className="space-y-1">
            {perspectiva === 'ventas'
              ? arbol.map((nodo) => (
                  <NodoJefeRegional
                    key={nodo.cod}
                    nodo={nodo}
                    agentes={agentes}
                    filtro={filtro}
                    setFiltro={setFiltro}
                  />
                ))
              : compradores.map((c) => (
                  <NodoComprador key={c.id} comprador={c} filtro={filtro} setFiltro={setFiltro} />
                ))}
          </div>
        </div>
      </div>

      {/* ── Panel derecho ── */}
      <div className="flex-1 min-w-0 w-full rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <div className="relative max-w-md flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={
                perspectiva === 'ventas'
                  ? 'Buscar por código, agente, supervisor, zona o analista...'
                  : 'Buscar por comprador o marca...'
              }
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
            />
          </div>
          {perspectiva === 'marca' && soyCoordinador && (
            <button
              onClick={() => setShowModalMarca(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white transition"
              style={{ backgroundColor: '#009ee3' }}
            >
              <Plus size={13} /> Agregar Marca
            </button>
          )}
        </div>

        {perspectiva === 'ventas' ? (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: '820px', tableLayout: 'fixed' }}>
              <ColgroupAgentes />
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-2 px-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Código
                  </th>
                  <th className="py-2 px-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Agente
                  </th>
                  <th className="py-2 px-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Zona / Canal
                  </th>
                  <th className="py-2 px-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Contacto
                  </th>
                  <th className="py-2 px-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Analista
                  </th>
                </tr>
              </thead>
              <tbody>
                {agentesVisibles.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-gray-400">
                      Sin resultados
                    </td>
                  </tr>
                )}
                {agentesVisibles.map((a) => {
                  const wa = buildWhatsAppUrl(a.telefono);
                  const expandido = expandidas.has(a.cod);
                  return (
                    <Fragment key={a.cod}>
                      <tr className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                        <td className="py-2 px-4 text-xs">
                          <div className="flex items-center gap-1.5">
                            {a.es_principal_acotado ? (
                              <button
                                onClick={() => toggleExpandido(a.cod)}
                                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                              >
                                {expandido ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              </button>
                            ) : (
                              <span className="inline-block" style={{ width: '13px' }} />
                            )}
                            <span className="font-mono bg-slate-50 text-slate-600 px-2 py-1 rounded">
                              {a.cod}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-4 text-sm truncate">
                          <span className="font-bold text-gray-800">{a.nombre}</span>
                          {a.es_principal_acotado && (
                            <span className="bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded ml-2">
                              Acotado
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-xs">
                          {a.zona ? (
                            <span className="font-mono bg-slate-50 text-slate-600 px-2 py-1 rounded">
                              {a.zona}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-sm">
                          {wa ? (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-full bg-green-50 text-green-700 hover:bg-green-100 transition-colors px-3 py-1 text-xs font-semibold"
                            >
                              <MessageCircle size={12} /> {a.telefono}
                            </a>
                          ) : (
                            <span className="text-xs text-gray-300">Sin contacto</span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-sm">
                          {a.analista_nombre ? (
                            <div className="flex items-center gap-2">
                              <div
                                className="flex items-center justify-center rounded-full text-white font-bold flex-shrink-0"
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  fontSize: '9px',
                                  backgroundColor: '#009ee3',
                                }}
                              >
                                {iniciales(a.analista_nombre)}
                              </div>
                              <span>{a.analista_nombre}</span>
                            </div>
                          ) : (
                            <span className="text-gray-300">Sin asignar</span>
                          )}
                        </td>
                      </tr>
                      {a.es_principal_acotado && (
                        <tr key={a.cod + '_miembros'}>
                          <td colSpan={5} style={{ padding: 0 }}>
                            <div
                              className="grid transition-all duration-200"
                              style={{ gridTemplateRows: expandido ? '1fr' : '0fr' }}
                            >
                              <div className="overflow-hidden">
                                <div className="bg-slate-50/60 py-2">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1 px-4">
                                    Vendedores secundarios de esta ruta
                                  </p>
                                  <table className="w-full" style={{ tableLayout: 'fixed' }}>
                                    <ColgroupAgentes />
                                    <tbody>
                                      {a.miembros_acotado.map((m) => {
                                        const waSec = buildWhatsAppUrl(m.telefono);
                                        return (
                                          <tr key={m.cod} className="border-t border-slate-100/80">
                                            <td className="py-1.5 px-4 text-xs">
                                              <div className="flex items-center gap-1.5">
                                                <span
                                                  className="inline-block flex-shrink-0"
                                                  style={{ width: CHEVRON_SLOT }}
                                                />
                                                <span className="font-mono bg-white text-slate-600 px-2 py-1 rounded border border-gray-100">
                                                  {m.cod}
                                                </span>
                                              </div>
                                            </td>
                                            <td className="py-1.5 px-4 text-sm font-semibold text-gray-700 truncate">
                                              <div className="flex items-center gap-2">
                                                <span
                                                  className="inline-block border-l-2 border-slate-200 flex-shrink-0"
                                                  style={{ height: '14px' }}
                                                />
                                                <span className="truncate">{m.nombre}</span>
                                              </div>
                                            </td>
                                            <td className="py-1.5 px-4 text-xs">
                                              {m.zona ? (
                                                <span className="font-mono bg-white text-slate-600 px-2 py-1 rounded border border-gray-100">
                                                  {m.zona}
                                                </span>
                                              ) : (
                                                <span className="text-gray-300">—</span>
                                              )}
                                            </td>
                                            <td className="py-1.5 px-4 text-sm">
                                              {waSec ? (
                                                <a
                                                  href={waSec}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-1.5 rounded-full bg-green-50 text-green-700 hover:bg-green-100 transition-colors px-3 py-1 text-xs font-semibold"
                                                >
                                                  <MessageCircle size={11} /> {m.telefono}
                                                </a>
                                              ) : (
                                                <span className="text-xs text-gray-300">
                                                  Sin contacto
                                                </span>
                                              )}
                                            </td>
                                            <td className="py-1.5 px-4 text-sm">
                                              {m.analista_nombre ? (
                                                <div className="flex items-center gap-2">
                                                  <div
                                                    className="flex items-center justify-center rounded-full text-white font-bold flex-shrink-0"
                                                    style={{
                                                      width: '20px',
                                                      height: '20px',
                                                      fontSize: '8px',
                                                      backgroundColor: '#009ee3',
                                                    }}
                                                  >
                                                    {iniciales(m.analista_nombre)}
                                                  </div>
                                                  <span className="text-xs truncate">
                                                    {m.analista_nombre}
                                                  </span>
                                                </div>
                                              ) : (
                                                <span className="text-gray-300 text-xs">
                                                  Sin asignar
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            {compradoresVisibles.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Sin resultados</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {compradoresVisibles.map((c) => {
                  const esDropZone = soyCoordinador && dragOverComprador === c.id;
                  return (
                    <div
                      key={c.id}
                      onDragOver={(e) => {
                        if (soyCoordinador) e.preventDefault();
                      }}
                      onDragEnter={(e) => {
                        if (soyCoordinador) {
                          e.preventDefault();
                          setDragOverComprador(c.id);
                        }
                      }}
                      onDragLeave={() =>
                        setDragOverComprador((prev) => (prev === c.id ? null : prev))
                      }
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverComprador(null);
                        const marcaId = e.dataTransfer.getData('text/plain');
                        if (marcaId) moverMarca(marcaId, c.id);
                      }}
                      className="bg-white rounded-xl border shadow-sm p-4 transition-colors"
                      style={{
                        borderColor: esDropZone ? '#009ee3' : '#f3f4f6',
                        borderWidth: esDropZone ? '2px' : '1px',
                        backgroundColor: esDropZone ? '#f0f9ff' : 'white',
                      }}
                    >
                      <p className="font-bold text-sm text-gray-800">{c.nombre}</p>
                      <p className="text-xs text-gray-400">{c.email}</p>
                      <div className="mb-2 mt-1">
                        {(() => {
                          const wa = buildWhatsAppUrl(c.telefono);
                          return wa ? (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-full bg-green-50 text-green-700 hover:bg-green-100 transition-colors px-2.5 py-0.5 text-[11px] font-semibold"
                            >
                              <MessageCircle size={11} /> {c.telefono}
                            </a>
                          ) : (
                            <span className="text-[11px] text-gray-300">Sin contacto</span>
                          );
                        })()}
                      </div>
                      {c.marcas.length === 0 ? (
                        <p className="text-xs text-gray-300">
                          {esDropZone ? 'Soltá aquí la marca' : 'Sin marcas asignadas'}
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {c.marcas.map((m) => {
                            const editando = editandoMarca?.id === m.id;
                            const resaltada = marcaResaltada === m.id;
                            return (
                              <div
                                key={m.id}
                                draggable={soyCoordinador && !editando}
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('text/plain', m.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                  setDraggingMarca(m.id);
                                }}
                                onDragEnd={() => setDraggingMarca(null)}
                                className="group relative rounded-lg px-2 py-1.5 text-xs transition-colors"
                                style={{
                                  backgroundColor: resaltada ? '#eff6ff' : '#f8fafc',
                                  color: resaltada ? '#009ee3' : '#374151',
                                  cursor: soyCoordinador && !editando ? 'grab' : 'default',
                                  opacity: draggingMarca === m.id ? 0.4 : 1,
                                }}
                                title={m.nombre}
                              >
                                {editando ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      autoFocus
                                      value={editandoMarca.valor}
                                      onChange={(e) =>
                                        setEditandoMarca({ id: m.id, valor: e.target.value })
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') confirmarEdicionMarca(m.id);
                                        if (e.key === 'Escape') cancelarEdicionMarca();
                                      }}
                                      className="w-full min-w-0 rounded border border-blue-300 px-1 py-0.5 text-xs focus:outline-none"
                                    />
                                    <button
                                      onClick={() => confirmarEdicionMarca(m.id)}
                                      className="flex-shrink-0 text-green-600 hover:text-green-700"
                                    >
                                      <Check size={13} />
                                    </button>
                                    <button
                                      onClick={cancelarEdicionMarca}
                                      className="flex-shrink-0 text-red-500 hover:text-red-600"
                                    >
                                      <X size={13} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <p className="font-semibold truncate flex-1 min-w-0">
                                      {m.nombre}
                                    </p>
                                    {soyCoordinador && (
                                      <button
                                        onClick={() => iniciarEdicionMarca(m)}
                                        className="flex-shrink-0 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                      >
                                        <Pencil size={11} />
                                      </button>
                                    )}
                                  </div>
                                )}
                                {resaltada && !editando && (
                                  <>
                                    {m.proveedor && (
                                      <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                                        Proveedor: {m.proveedor}
                                      </p>
                                    )}
                                    {m.notas && (
                                      <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                                        {m.notas}
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showModalMarca && (
        <ModalAgregarMarca
          compradores={compradores}
          onClose={() => setShowModalMarca(false)}
          onSuccess={(marca) => {
            setCompradores((prev) =>
              prev.map((c) =>
                c.id === marca.comprador_id
                  ? {
                      ...c,
                      marcas: [
                        ...c.marcas,
                        {
                          id: marca.id,
                          nombre: marca.nombre,
                          proveedor: marca.proveedor,
                          notas: marca.notas,
                        },
                      ],
                    }
                  : c,
              ),
            );
            setShowModalMarca(false);
          }}
        />
      )}
    </div>
  );
}

// ── Nodo de Jefe Regional con sus Supervisores (árbol colapsable) ────────
function NodoJefeRegional({
  nodo,
  agentes,
  filtro,
  setFiltro,
}: {
  nodo: JefeRegionalNodo;
  agentes: AgenteDirectorio[];
  filtro: Filtro;
  setFiltro: (f: Filtro) => void;
}) {
  const [open, setOpen] = useState(true);

  const totalJefe = agentes.filter((a) =>
    nodo.cod === '__sin_asignar__'
      ? !!a.supervisor_cod && !a.jefe_regional_cod
      : a.jefe_regional_cod === nodo.cod,
  ).length;

  const activoJefe = filtro.tipo === 'jefe' && filtro.valor === nodo.cod;

  // Regla de nodo único: si esta "ruta de control" (vendedor placeholder de 0
  // clientes) representa a la misma persona que ya aparece arriba como
  // Supervisor, no se vuelve a dibujar como fila independiente al fondo.
  const rutasControlUnicas = nodo.rutasControl.filter((v) => {
    const nombreRuta = nombreOficial(v.cod, v.nombre);
    return !nodo.supervisores.some((sup) =>
      mismaPersona(nombreOficial(sup.cod, sup.nombre), nombreRuta),
    );
  });

  return (
    <div>
      <button
        onClick={() => setFiltro({ tipo: 'jefe', valor: nodo.cod })}
        className={`w-full flex items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors ${activoJefe ? 'bg-blue-50/50 text-blue-600' : ''}`}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <ChevronDown
            size={13}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            className="text-gray-400 flex-shrink-0 transition-transform duration-200"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          />
          <span
            className={`font-bold text-sm truncate uppercase ${activoJefe ? 'text-blue-600' : 'text-gray-800'}`}
          >
            {nodo.nombre}
          </span>
        </span>
        <span className="bg-slate-100 text-slate-500 text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-auto flex-shrink-0">
          ({totalJefe})
        </span>
      </button>

      <div
        className="grid transition-all duration-200"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="pl-6 space-y-0.5 mt-0.5">
            {nodo.supervisores.map((sup) => {
              const totalSup = agentes.filter((a) => a.supervisor_cod === sup.cod).length;
              const activoSup = filtro.tipo === 'supervisor' && filtro.valor === sup.cod;
              return (
                <button
                  key={sup.cod}
                  onClick={() => setFiltro({ tipo: 'supervisor', valor: sup.cod })}
                  className={`w-full flex items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors ${activoSup ? 'bg-blue-50/50 text-blue-600' : 'text-gray-600'}`}
                >
                  <span className="text-sm truncate uppercase">
                    {nombreOficial(sup.cod, sup.nombre)}
                  </span>
                  <span className="bg-slate-100 text-slate-500 text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-auto flex-shrink-0">
                    ({totalSup})
                  </span>
                </button>
              );
            })}

            {nodo.canalesEspeciales.length > 0 && (
              <div className="pt-1.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase px-2 mb-0.5">
                  Canales Especiales
                </p>
                {nodo.canalesEspeciales.map((v) => {
                  const activoV = filtro.tipo === 'vendedor' && filtro.valor === v.cod;
                  return (
                    <button
                      key={v.cod}
                      onClick={() => setFiltro({ tipo: 'vendedor', valor: v.cod })}
                      className={`w-full flex items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors ${activoV ? 'bg-blue-50/50 text-blue-600' : 'text-gray-600'}`}
                    >
                      <span className="text-sm truncate uppercase">{v.nombre}</span>
                      <span
                        className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 flex-shrink-0"
                        style={{ backgroundColor: '#f0f9ff', color: '#0369a1' }}
                      >
                        {v.tipo_canal}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {rutasControlUnicas.length > 0 && (
              <div className="pt-1.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase px-2 mb-0.5">
                  🛠️ Control Operativo
                </p>
                {rutasControlUnicas.map((v) => {
                  const activoV = filtro.tipo === 'vendedor' && filtro.valor === v.cod;
                  return (
                    <button
                      key={v.cod}
                      onClick={() => setFiltro({ tipo: 'vendedor', valor: v.cod })}
                      className={`w-full flex items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors ${activoV ? 'bg-blue-50/50 text-blue-600' : 'text-gray-400'}`}
                    >
                      <span className="text-sm truncate uppercase">
                        {nombreOficial(v.cod, v.nombre)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Nodo de Comprador con sus Marcas (árbol colapsable) ──────────────────
function NodoComprador({
  comprador,
  filtro,
  setFiltro,
}: {
  comprador: Comprador;
  filtro: Filtro;
  setFiltro: (f: Filtro) => void;
}) {
  const [open, setOpen] = useState(false);
  const activo = filtro.tipo === 'comprador' && filtro.valor === comprador.id;

  return (
    <div>
      <button
        onClick={() => setFiltro({ tipo: 'comprador', valor: comprador.id })}
        className={`w-full flex items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors ${activo ? 'bg-blue-50/50 text-blue-600' : ''}`}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <ChevronDown
            size={13}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            className="text-gray-400 flex-shrink-0 transition-transform duration-200"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          />
          <span
            className={`font-bold text-sm truncate ${activo ? 'text-blue-600' : 'text-gray-800'}`}
          >
            {comprador.nombre}
          </span>
        </span>
        <span className="bg-slate-100 text-slate-500 text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-auto flex-shrink-0">
          ({comprador.marcas.length})
        </span>
      </button>

      <div
        className="grid transition-all duration-200"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="pl-6 space-y-0.5 mt-0.5">
            {comprador.marcas.map((m) => {
              const activoMarca = filtro.tipo === 'marca' && filtro.valor === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setFiltro({ tipo: 'marca', valor: m.id })}
                  className={`w-full flex items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors ${activoMarca ? 'bg-blue-50/50 text-blue-600' : 'text-gray-600'}`}
                >
                  <span className="text-sm truncate">{m.nombre}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
