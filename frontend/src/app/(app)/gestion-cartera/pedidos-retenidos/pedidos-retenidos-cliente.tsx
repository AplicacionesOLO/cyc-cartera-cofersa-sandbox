'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  RotateCcw,
  Globe2,
  User as UserIcon,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';
import { usePedidosRetenidosController } from '@/views/gestion-cartera/hooks/use-pedidos-retenidos-controller';
import { fmtCRC } from '@/lib/utils/formato';
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis';
import { exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';
import { MOTIVOS_RETENCION } from '@/types/pedidos-retenidos';
import type { PedidoRetenido, Recomendacion } from '@/types/pedidos-retenidos';
import { esSoloLectura } from '@/lib/utils/roles';

interface Props {
  // ANALISTA_RIESGO solo llega hasta acá si tiene_cartera_asignada=true (ver
  // page.tsx) -- a partir de ahí se comporta exactamente como ANALISTA.
  userRol: 'COORDINADOR' | 'ANALISTA' | 'ANALISTA_RIESGO' | 'GERENCIA';
  userEmail: string;
}

// Anchos de columna compartidos por el encabezado y las filas -- 7 columnas.
// El checkbox de selección y el chevron de expandir viven DENTRO de la celda
// de Recomendación (no son columnas propias).
// Recomendación | Identificador | Cliente | Fecha | Total | Vendedor | Estado
//
// OJO: NO son todas porcentaje. Usar % en todas hace que las columnas de
// contenido corto y predecible (Fecha, Total, Vendedor, Estado) se agranden
// de más en una pantalla ancha (espacio vacío) pero se aprieten de más en una
// laptop angosta con el sidebar abierto (el nombre del cliente envolviendo) --
// eso fue justo el problema reportado. La solución: ancho FIJO en px para las
// columnas de contenido predecible (calibrado con longitudes reales de jul
// 2026: vendedor p90/máx 27 caracteres sin poder envolver -- whiteSpace:
// nowrap --, total tipo "₡307.539,31", fecha tipo "22/7/2026"), y Cliente
// SIN ancho fijo (undefined) para que absorba automáticamente todo el
// espacio restante, sea mucho o poco -- así siempre es la columna que más
// aire tiene disponible, en vez de competir en igualdad de condiciones con
// columnas que no lo necesitan.
// Identificador subió de 130px a 190px -- a 130px un id_pedido de 20
// caracteres en monoespaciado (~6.6px/carácter) da ~132px, literalmente al
// filo, por eso envolvía a 2 líneas. 190px da margen real para que el
// pedido completo entre en una sola línea (sigue con break-all como
// respaldo, nunca trunca, por si algún día llega un código más largo).
//
// Recomendación y Total a Facturar medidos con el navegador (no a ojo,
// después de que el ancho fijo anterior desbordara el propio TEXTO DEL
// ENCABEZADO -- no el contenido de las filas -- sobre la columna vecina):
// "RECOMENDACIÓN" necesita 116px con su padding (mayúsculas + letter-spacing
// 0.04em) y la columna estaba en 100px -- se desbordaba 16px sobre
// Identificador. "TOTAL A FACTURAR" necesita 126px y la columna estaba en
// 125px, al filo por 1px. Subo ambas con margen real esta vez.
const COLS = ['125px', '190px', undefined, '85px', '135px', '215px', '180px'];

type SortKey = 'id_pedido' | 'fecha_pedido' | 'total_mercaderia' | 'vendedor' | 'cliente_nombre';

// Headers de la tabla -- solo Identificador/Cliente/Fecha/Total/Vendedor son ordenables
const HEADERS: { label: string; sortKey?: SortKey }[] = [
  { label: 'Recomendación' },
  { label: 'Identificador', sortKey: 'id_pedido' },
  { label: 'Cliente', sortKey: 'cliente_nombre' },
  { label: 'Fecha', sortKey: 'fecha_pedido' },
  { label: 'Total a Facturar', sortKey: 'total_mercaderia' },
  { label: 'Vendedor', sortKey: 'vendedor' },
  { label: 'Estado' },
];

// Columnas del export a Excel -- misma data que se ve en pantalla (respeta
// filtros/orden vigentes), pero con Pedido+Código separados (en pantalla
// van fusionados en "Identificador") y el monto como número real (sumable
// en Excel), no como texto formateado.
const COLS_EXCEL: ColumnaReporte[] = [
  { key: 'id_pedido', label: 'Pedido', align: 'left', format: 'text' },
  { key: 'codigo_cliente', label: 'Código', align: 'left', format: 'text', width: 12 },
  { key: 'cliente_nombre', label: 'Cliente', align: 'left', format: 'text', width: 32 },
  { key: 'fecha_pedido', label: 'Fecha', align: 'left', format: 'fecha' },
  { key: 'total_mercaderia', label: 'Total a Facturar', align: 'right', format: 'crc', width: 16 },
  { key: 'vendedor', label: 'Vendedor', align: 'left', format: 'text', width: 28 },
  { key: 'recomendacion', label: 'Recomendación', align: 'left', format: 'text' },
  { key: 'estado_sic', label: 'Estado', align: 'left', format: 'text' },
];

// Chips de "Quick Rationale" -- se inyectan en el textarea de Comentarios de la Gestión
const CHIPS_RATIONALE = [
  'Acuerdo de pago activo',
  'Abono en tránsito',
  'Autorizado por Gerencia',
  'Cliente en negociación activa',
];

// EXCEPCIÓN puntual (jul 2026, confirmada con Jeffrey): esta columna espeja
// el formato exacto de Softland -- coma de miles, punto decimal, 2 decimales
// siempre. El resto del sistema sigue usando fmtCRC() (entero) sin excepción.
function fmtMontoERP(n: number): string {
  return '₡' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TD: React.CSSProperties = {
  padding: '9px 10px',
  fontSize: '11px',
  color: '#475569',
};
const TD_MONTO: React.CSSProperties = {
  ...TD,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

// Colores de tramo de aging -- mismos tokens que el resto del SIC (SIC-DOCUMENTACION)
const AGING_COLORS: Record<string, string> = {
  no_vencido: '#16a34a',
  mora_1_30: '#d97706',
  mora_31_60: '#ea580c',
  mora_61_90: '#ef4444',
  mora_91_120: '#dc2626',
  mora_120_plus: '#991b1b',
};
const AGING_LABELS: Record<string, string> = {
  no_vencido: 'Al día',
  mora_1_30: '1-30d',
  mora_31_60: '31-60d',
  mora_61_90: '61-90d',
  mora_91_120: '91-120d',
  mora_120_plus: '+120d',
};

const RECOMENDACION_CFG: Record<Recomendacion, { label: string; color: string; bg: string }> = {
  APROBAR: { label: '🟢 APROBAR', color: '#16a34a', bg: '#f0fdf4' },
  REVISAR: { label: '🟡 REVISAR', color: '#f59e0b', bg: '#fffbeb' },
  RETENER: { label: '🔴 RETENER', color: '#dc2626', bg: '#fef2f2' },
  SIN_HISTORIAL: { label: '⚪ SIN HISTORIAL', color: '#94a3b8', bg: '#f8fafc' },
};

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border h-20 animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-xl border h-80 animate-pulse" />
    </div>
  );
}

export default function PedidosRetenidosCliente({ userRol, userEmail }: Props) {
  const soloLectura = esSoloLectura(userRol);
  const tieneCarteraPropia = userRol === 'ANALISTA' || userRol === 'ANALISTA_RIESGO';
  const searchParams = useSearchParams();
  const pedidoInicial = searchParams.get('pedido') ?? undefined;
  const yaEnfoco = useRef(false);

  const [vistaGlobal, setVistaGlobal] = useState(false); // solo relevante para ANALISTA
  const pEmail = tieneCarteraPropia && !vistaGlobal ? userEmail : null;
  const { data, setData, loading, error, fetchData, actualizarPedido } =
    usePedidosRetenidosController(pEmail);
  const [busqueda, setBusqueda] = useState('');
  const [vendedorF, setVendedorF] = useState('');
  const [recomendacionF, setRecomendacionF] = useState('');
  const [analistasF, setAnalistasF] = useState<Set<string>>(new Set());
  const [analistaAbierto, setAnalistaAbierto] = useState(false);
  const analistaRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [retenerAbierto, setRetenerAbierto] = useState<{ id: string; motivo: string } | null>(null);
  const [guardando, setGuardando] = useState<Set<string>>(new Set());
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [procesandoLote, setProcesandoLote] = useState(false);
  const [loteMotivo, setLoteMotivo] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(
    null,
  );
  const [comentariosDraft, setComentariosDraft] = useState<Record<string, string>>({});
  const [guardandoComentario, setGuardandoComentario] = useState<Set<string>>(new Set());
  const [exportando, setExportando] = useState(false);

  // Cierra el dropdown de Analistas al hacer clic fuera
  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (analistaRef.current && !analistaRef.current.contains(e.target as Node))
        setAnalistaAbierto(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  function toggleAnalista(nombre: string) {
    setAnalistasF((prev) => {
      const next = new Set(prev);
      if (next.has(nombre)) next.delete(nombre);
      else next.add(nombre);
      return next;
    });
  }

  // ── Deep-link ?pedido=<id> desde el badge de Ficha 360: expande y hace scroll ──
  useEffect(() => {
    if (!pedidoInicial || yaEnfoco.current || !data) return;
    if (!data.rows.some((r) => r.id_pedido === pedidoInicial)) return;
    yaEnfoco.current = true;
    setExpanded((prev) => new Set(prev).add(pedidoInicial));
    setTimeout(() => {
      document
        .getElementById(`fila-pedido-${pedidoInicial}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }, [pedidoInicial, data]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSeleccion(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSort(key: SortKey) {
    setSortConfig((prev) =>
      prev && prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  }

  function inyectarChip(id: string, base: string, texto: string) {
    setComentariosDraft((prev) => {
      const actual = (prev[id] ?? base).trim();
      return { ...prev, [id]: actual ? `${actual} ${texto}.` : `${texto}.` };
    });
  }

  async function guardarComentario(id: string, texto: string) {
    setGuardandoComentario((prev) => new Set(prev).add(id));
    const anterior = data;
    setData((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) =>
              r.id_pedido === id ? { ...r, comentario_analista: texto.trim() || null } : r,
            ),
          }
        : prev,
    );
    try {
      await actualizarPedido(id, { comentario_analista: texto });
      setComentariosDraft((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch {
      setData(anterior); // revertir
    } finally {
      setGuardandoComentario((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function actualizarEstado(
    id: string,
    patch: { estado_sic: string; motivo_retencion?: string },
  ) {
    setGuardando((prev) => new Set(prev).add(id));
    const anterior = data;
    // Optimistic update
    setData((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) =>
              r.id_pedido === id
                ? {
                    ...r,
                    estado_sic: patch.estado_sic as PedidoRetenido['estado_sic'],
                    motivo_retencion:
                      patch.motivo_retencion ??
                      (patch.estado_sic === 'Pendiente' ? null : r.motivo_retencion),
                    resuelto_por: patch.estado_sic === 'Pendiente' ? null : userEmail,
                  }
                : r,
            ),
          }
        : prev,
    );
    try {
      await actualizarPedido(id, patch);
      setRetenerAbierto(null);
      setSeleccionados((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      setData(anterior); // revertir
    } finally {
      setGuardando((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function aprobarSeleccionados() {
    const ids = [...seleccionados];
    if (ids.length === 0) return;
    setProcesandoLote(true);
    try {
      await Promise.all(ids.map((id) => actualizarEstado(id, { estado_sic: 'Aprobado' })));
    } finally {
      setProcesandoLote(false);
    }
  }

  async function retenerSeleccionados() {
    const ids = [...seleccionados];
    if (ids.length === 0 || !loteMotivo) return;
    setProcesandoLote(true);
    try {
      await Promise.all(
        ids.map((id) =>
          actualizarEstado(id, { estado_sic: 'Retenido', motivo_retencion: loteMotivo }),
        ),
      );
      setLoteMotivo('');
    } finally {
      setProcesandoLote(false);
    }
  }

  if (loading)
    return (
      <div className="px-5 py-5">
        <Skeleton />
      </div>
    );
  if (error)
    return (
      <div className="px-5 py-5">
        <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
          <p className="text-red-600 text-sm font-semibold">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 text-[#009ee3] text-sm font-semibold hover:underline"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  if (!data) return null;

  const { kpis, rows } = data;

  const vendedores = [
    ...new Set(rows.map((r) => r.vendedor).filter((v): v is string => !!v)),
  ].sort();
  const analistas = [
    ...new Set(rows.map((r) => r.analista_nombre).filter((v): v is string => !!v)),
  ].sort();

  const q = busqueda.trim().toLowerCase();
  const rowsFiltradas = rows.filter((r) => {
    if (vendedorF && r.vendedor !== vendedorF) return false;
    if (recomendacionF && r.recomendacion !== recomendacionF) return false;
    if (analistasF.size > 0 && !analistasF.has(r.analista_nombre ?? '')) return false;
    if (!q) return true;
    return (
      r.cliente_nombre.toLowerCase().includes(q) ||
      r.codigo_cliente.toLowerCase().includes(q) ||
      r.id_pedido.toLowerCase().includes(q)
    );
  });

  // KPIs reactivos -- se recalculan sobre rowsFiltradas (búsqueda + vendedor +
  // analistas), no sobre el agregado global del RPC. Mismo criterio de negocio
  // que fn_pedidos_retenidos (estado_sic por métrica).
  const kpisReactivos = {
    monto_total_retenido: rowsFiltradas
      .filter((r) => r.estado_sic === 'Pendiente' || r.estado_sic === 'Retenido')
      .reduce((s, r) => s + r.total_mercaderia, 0),
    pedidos_en_espera: rowsFiltradas.filter((r) => r.estado_sic === 'Pendiente').length,
    ticket_promedio: (() => {
      const pend = rowsFiltradas.filter((r) => r.estado_sic === 'Pendiente');
      return pend.length ? pend.reduce((s, r) => s + r.total_mercaderia, 0) / pend.length : 0;
    })(),
    casos_cronicos: new Set(rowsFiltradas.filter((r) => r.es_cronico).map((r) => r.codigo_cliente))
      .size,
  };

  // Sort local -- sin selección se mantiene el orden del RPC (pendientes primero,
  // críticos arriba); al elegir columna se ordena sobre rowsFiltradas.
  const rowsOrdenadas = !sortConfig
    ? rowsFiltradas
    : [...rowsFiltradas].sort((a, b) => {
        const dir = sortConfig.direction === 'asc' ? 1 : -1;
        if (sortConfig.key === 'total_mercaderia')
          return (a.total_mercaderia - b.total_mercaderia) * dir;
        if (sortConfig.key === 'fecha_pedido') {
          const av = a.fecha_pedido ? new Date(a.fecha_pedido).getTime() : 0;
          const bv = b.fecha_pedido ? new Date(b.fecha_pedido).getTime() : 0;
          return (av - bv) * dir;
        }
        const av = (a[sortConfig.key] ?? '').toString().toLowerCase();
        const bv = (b[sortConfig.key] ?? '').toString().toLowerCase();
        return av.localeCompare(bv) * dir;
      });

  const pendientesVisibles = rowsFiltradas.filter((r) => r.estado_sic === 'Pendiente');
  const todosSeleccionados =
    pendientesVisibles.length > 0 &&
    pendientesVisibles.every((r) => seleccionados.has(r.id_pedido));

  function toggleSeleccionTodos() {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (todosSeleccionados) pendientesVisibles.forEach((r) => next.delete(r.id_pedido));
      else pendientesVisibles.forEach((r) => next.add(r.id_pedido));
      return next;
    });
  }

  // Exporta exactamente lo que está en pantalla en ese momento -- respeta
  // búsqueda/analista/vendedor/recomendación y el orden aplicado. Filtrar
  // por un vendedor antes de exportar da justo su lista para compartirle.
  async function exportarExcel() {
    setExportando(true);
    try {
      await exportTablaExcel({
        // recomendacion viaja como código de enum (RETENER/REVISAR/...) --
        // se sustituye por la misma etiqueta con emoji que ve el analista
        // en pantalla, para que el Excel del vendedor sea autoexplicativo.
        filas: rowsOrdenadas.map((r) => ({
          ...r,
          recomendacion: RECOMENDACION_CFG[r.recomendacion].label,
        })),
        columnas: COLS_EXCEL,
        titulo: 'Pedidos Retenidos',
        subtitulo: `Mes ${kpis.anio_mes}`,
        meta: [
          { label: 'Monto Total Retenido', value: fmtCRC(kpisReactivos.monto_total_retenido) },
          { label: 'Pedidos en Espera', value: `${kpisReactivos.pedidos_en_espera}` },
          { label: 'Ticket Promedio', value: fmtCRC(kpisReactivos.ticket_promedio) },
        ],
        nombreArchivo: `pedidos-retenidos-${kpis.anio_mes}`,
        generadoPor: userEmail,
      });
    } finally {
      setExportando(false);
    }
  }

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">
        {/* ── Toggle Mi Cartera / Vista Global ──────────────────────────── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[12px] text-gray-400">
            Mes en curso: <b className="text-gray-600">{kpis.anio_mes}</b>
          </span>
          {tieneCarteraPropia ? (
            <button
              onClick={() => setVistaGlobal((v) => !v)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-bold transition-colors"
              style={
                vistaGlobal
                  ? { background: '#eff6ff', color: '#009ee3', border: '1px solid #bae6fd' }
                  : { background: 'white', color: '#374151', border: '1px solid #e2e8f0' }
              }
            >
              {vistaGlobal ? (
                <>
                  <Globe2 size={14} /> Vista Global
                </>
              ) : (
                <>
                  <UserIcon size={14} /> Mi Cartera
                </>
              )}
            </button>
          ) : (
            <span
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold"
              style={{ background: '#eff6ff', color: '#009ee3' }}
            >
              <Globe2 size={14} /> Vista Global
            </span>
          )}
        </div>

        {/* ── KPIs -- reactivos sobre rowsFiltradas (búsqueda/vendedor/analistas) ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICardAnalisis
            label="Monto Total Retenido"
            valor={fmtCRC(kpisReactivos.monto_total_retenido)}
            sub="pendiente + retenido"
            color="#dc2626"
          />
          <KPICardAnalisis
            label="Pedidos en Espera"
            valor={`${kpisReactivos.pedidos_en_espera}`}
            sub="esperando decisión"
            color="#f59e0b"
          />
          <KPICardAnalisis
            label="Ticket Promedio"
            valor={fmtCRC(kpisReactivos.ticket_promedio)}
            sub="de los pendientes"
            color="#009ee3"
          />
          <KPICardAnalisis
            label="Casos Crónicos"
            valor={`${kpisReactivos.casos_cronicos}`}
            sub="clientes reincidentes"
            color="#7c3aed"
          />
        </div>

        {/* ── Filtros ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1" style={{ minWidth: '220px' }}>
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por cliente, código o número de pedido..."
                className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-[12.5px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-50 focus:border-blue-400"
              />
            </div>
            {analistas.length > 1 && (
              <div className="relative" ref={analistaRef}>
                <button
                  type="button"
                  onClick={() => setAnalistaAbierto((v) => !v)}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[12px] bg-white text-gray-700 hover:bg-slate-50 focus:outline-none"
                  style={{ minWidth: '180px' }}
                >
                  <span className="flex-1 text-left truncate">
                    {analistasF.size === 0
                      ? 'Todos los analistas'
                      : analistasF.size === 1
                        ? [...analistasF][0]
                        : `${analistasF.size} analistas`}
                  </span>
                  <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />
                </button>
                {analistaAbierto && (
                  <div className="absolute z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-white shadow-lg py-1.5 max-h-64 overflow-y-auto">
                    {analistas.map((a) => (
                      <label
                        key={a}
                        className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-gray-700 hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={analistasF.has(a)}
                          onChange={() => toggleAnalista(a)}
                          className="cursor-pointer"
                        />
                        {a}
                      </label>
                    ))}
                    {analistasF.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setAnalistasF(new Set())}
                        className="w-full text-left px-3 py-1.5 text-[11px] text-gray-400 hover:text-gray-600 border-t border-slate-100 mt-1"
                      >
                        Limpiar selección
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {vendedores.length > 0 && (
              <select
                value={vendedorF}
                onChange={(e) => setVendedorF(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] bg-white text-gray-700 focus:outline-none"
                style={{ minWidth: '180px' }}
              >
                <option value="">Todos los vendedores</option>
                {vendedores.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            )}
            <select
              value={recomendacionF}
              onChange={(e) => setRecomendacionF(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] bg-white text-gray-700 focus:outline-none"
              style={{ minWidth: '170px' }}
            >
              <option value="">Toda recomendación</option>
              {Object.entries(RECOMENDACION_CFG).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Barra de acciones en lote -- flotante, animada, siempre montada ──
             Gerencia ve el módulo en solo lectura, para supervisión. ── */}
        <div
          className="fixed left-1/2 z-50 flex flex-wrap items-center gap-3 rounded-2xl px-5 py-3 shadow-2xl transition-all duration-300"
          style={{
            background: '#0f172a',
            bottom: !soloLectura && seleccionados.size > 0 ? '24px' : '-120px',
            opacity: !soloLectura && seleccionados.size > 0 ? 1 : 0,
            transform: 'translateX(-50%)',
            pointerEvents: !soloLectura && seleccionados.size > 0 ? 'auto' : 'none',
          }}
        >
          <span className="text-[12px] font-semibold text-white whitespace-nowrap">
            {seleccionados.size} pedido{seleccionados.size !== 1 ? 's' : ''} seleccionado
            {seleccionados.size !== 1 ? 's' : ''}
          </span>
          <select
            value={loteMotivo}
            onChange={(e) => setLoteMotivo(e.target.value)}
            className="rounded-lg border-0 text-[11px] px-2 py-1.5 text-gray-700 focus:outline-none"
            style={{ minWidth: '170px' }}
          >
            <option value="">Motivo (para retener)...</option>
            {MOTIVOS_RETENCION.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button
              onClick={aprobarSeleccionados}
              disabled={procesandoLote}
              className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50 whitespace-nowrap"
              style={{ background: '#16a34a' }}
            >
              🟢 {procesandoLote ? 'Procesando...' : 'Aprobar Seleccionados'}
            </button>
            <button
              onClick={retenerSeleccionados}
              disabled={procesandoLote || !loteMotivo}
              title={!loteMotivo ? 'Elegí un motivo para retener en lote' : undefined}
              className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50 whitespace-nowrap"
              style={{ background: '#dc2626' }}
            >
              🔴 {procesandoLote ? 'Procesando...' : 'Retener Seleccionados'}
            </button>
            <button
              onClick={() => {
                setSeleccionados(new Set());
                setLoteMotivo('');
              }}
              className="text-[12px] text-slate-400 hover:text-slate-200"
            >
              Cancelar
            </button>
          </div>
        </div>

        {/* ── Tabla ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50 flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              {rowsFiltradas.length} pedido{rowsFiltradas.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-gray-400">
                Pendientes primero · críticos arriba
              </span>
              <button
                type="button"
                onClick={exportarExcel}
                disabled={exportando || rowsOrdenadas.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {exportando ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={13} />
                )}
                {exportando ? 'Generando...' : 'Exportar Excel'}
              </button>
            </div>
          </div>

          <table
            style={{
              tableLayout: 'fixed',
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: '1120px',
            }}
          >
            <colgroup>
              {COLS.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {HEADERS.map((h, i) => {
                  const alineado = i === 4 || i === 6 ? 'right' : 'left';
                  const activo = h.sortKey && sortConfig?.key === h.sortKey;
                  return (
                    <th
                      key={i}
                      onClick={h.sortKey ? () => handleSort(h.sortKey!) : undefined}
                      style={{
                        padding: '8px 10px',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        textAlign: alineado,
                        cursor: h.sortKey ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}
                    >
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          justifyContent: alineado === 'right' ? 'flex-end' : 'flex-start',
                          width: '100%',
                          minWidth: 0,
                        }}
                      >
                        {i === 0 && pendientesVisibles.length > 0 && (
                          <input
                            type="checkbox"
                            checked={todosSeleccionados}
                            onChange={toggleSeleccionTodos}
                            onClick={(e) => e.stopPropagation()}
                            style={{ cursor: 'pointer' }}
                          />
                        )}
                        {h.label}
                        {activo &&
                          (sortConfig!.direction === 'asc' ? (
                            <ArrowUp size={10} />
                          ) : (
                            <ArrowDown size={10} />
                          ))}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rowsOrdenadas.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: '32px',
                      textAlign: 'center',
                      fontSize: '12px',
                      color: '#94a3b8',
                    }}
                  >
                    Sin pedidos retenidos
                  </td>
                </tr>
              )}
              {rowsOrdenadas.map((r) => {
                const isOpen = expanded.has(r.id_pedido);
                const rec = RECOMENDACION_CFG[r.recomendacion];
                const editandoMotivo = retenerAbierto?.id === r.id_pedido;
                const totalAging =
                  r.no_vencido +
                  r.mora_1_30 +
                  r.mora_31_60 +
                  r.mora_61_90 +
                  r.mora_91_120 +
                  r.mora_120_plus;
                const esPendiente = r.estado_sic === 'Pendiente';
                return (
                  <Fragment key={r.id_pedido}>
                    <tr
                      id={`fila-pedido-${r.id_pedido}`}
                      onClick={() => toggleExpand(r.id_pedido)}
                      style={{
                        borderBottom: isOpen ? 'none' : '1px solid #f1f5f9',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={TD}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '4px',
                          }}
                        >
                          {esPendiente && (
                            <input
                              type="checkbox"
                              checked={seleccionados.has(r.id_pedido)}
                              onChange={() => toggleSeleccion(r.id_pedido)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ cursor: 'pointer' }}
                            />
                          )}
                          {isOpen ? (
                            <ChevronDown size={13} color="#94a3b8" />
                          ) : (
                            <ChevronRight size={13} color="#94a3b8" />
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: rec.color,
                            background: rec.bg,
                            padding: '2px 7px',
                            borderRadius: '4px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {rec.label}
                        </span>
                      </td>
                      <td style={TD}>
                        <div className="break-all font-mono font-semibold text-slate-700">
                          {r.id_pedido}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">{r.codigo_cliente}</div>
                      </td>
                      <td style={TD}>
                        <Link
                          href={`/clientes/${encodeURIComponent(r.codigo_cliente)}?volver=${encodeURIComponent('/gestion-cartera/pedidos-retenidos')}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ fontWeight: 600, color: '#009ee3', textDecoration: 'none' }}
                          title={r.cliente_nombre}
                        >
                          {r.cliente_nombre}
                        </Link>
                      </td>
                      <td style={TD}>
                        {r.fecha_pedido
                          ? new Date(r.fecha_pedido).toLocaleDateString('es-CR')
                          : '—'}
                      </td>
                      <td style={{ ...TD_MONTO, fontWeight: 700 }}>
                        {fmtMontoERP(r.total_mercaderia)}
                      </td>
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.vendedor ?? '—'}</td>
                      <td
                        style={{ ...TD, textAlign: 'right' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.estado_sic === 'Pendiente' ? (
                          editandoMotivo ? (
                            <div className="flex items-center justify-end gap-1">
                              <select
                                value={retenerAbierto.motivo}
                                onChange={(e) =>
                                  setRetenerAbierto({ id: r.id_pedido, motivo: e.target.value })
                                }
                                className="rounded border border-red-200 text-[11px] px-1 py-1"
                                style={{ maxWidth: '120px' }}
                              >
                                <option value="">Motivo...</option>
                                {MOTIVOS_RETENCION.map((m) => (
                                  <option key={m} value={m}>
                                    {m}
                                  </option>
                                ))}
                              </select>
                              <button
                                disabled={!retenerAbierto.motivo || guardando.has(r.id_pedido)}
                                onClick={() =>
                                  actualizarEstado(r.id_pedido, {
                                    estado_sic: 'Retenido',
                                    motivo_retencion: retenerAbierto.motivo,
                                  })
                                }
                                className="text-green-600 hover:text-green-700 disabled:opacity-40"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => setRetenerAbierto(null)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                disabled={guardando.has(r.id_pedido)}
                                onClick={() =>
                                  actualizarEstado(r.id_pedido, { estado_sic: 'Aprobado' })
                                }
                                className="rounded px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                                style={{ background: '#16a34a' }}
                              >
                                ✓ Aprobar
                              </button>
                              <button
                                disabled={guardando.has(r.id_pedido)}
                                onClick={() => setRetenerAbierto({ id: r.id_pedido, motivo: '' })}
                                className="rounded px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                                style={{ background: '#dc2626' }}
                              >
                                ✕ Retener
                              </button>
                            </div>
                          )
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: '4px',
                                color: r.estado_sic === 'Aprobado' ? '#16a34a' : '#dc2626',
                                background: r.estado_sic === 'Aprobado' ? '#f0fdf4' : '#fef2f2',
                              }}
                            >
                              {r.estado_sic}
                            </span>
                            <button
                              title="Reabrir"
                              disabled={guardando.has(r.id_pedido)}
                              onClick={() =>
                                actualizarEstado(r.id_pedido, { estado_sic: 'Pendiente' })
                              }
                              className="text-gray-400 hover:text-gray-600 disabled:opacity-40"
                            >
                              <RotateCcw size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr style={{ background: '#fafbfc', borderBottom: '1px solid #f1f5f9' }}>
                        <td colSpan={7} style={{ padding: '14px 20px' }}>
                          <div className="grid grid-cols-12 gap-6">
                            {/* PANEL IZQUIERDO -- Radiografía de Saldos */}
                            <div className="col-span-12 lg:col-span-6">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                                Radiografía de saldos · cartera total {fmtCRC(r.cartera_total)}
                              </p>
                              {totalAging > 0 ? (
                                <>
                                  {/* Barra compacta -- vistazo rápido de la proporción por tramo */}
                                  <div
                                    style={{
                                      display: 'flex',
                                      height: '6px',
                                      borderRadius: '3px',
                                      overflow: 'hidden',
                                      background: '#f1f5f9',
                                      marginBottom: '10px',
                                    }}
                                  >
                                    {(
                                      [
                                        'no_vencido',
                                        'mora_1_30',
                                        'mora_31_60',
                                        'mora_61_90',
                                        'mora_91_120',
                                        'mora_120_plus',
                                      ] as const
                                    ).map((k) => {
                                      const val = r[k];
                                      if (val <= 0) return null;
                                      const pct = (val / totalAging) * 100;
                                      return (
                                        <div
                                          key={k}
                                          style={{ width: `${pct}%`, background: AGING_COLORS[k] }}
                                          title={`${AGING_LABELS[k]}: ${fmtCRC(val)}`}
                                        />
                                      );
                                    })}
                                  </div>
                                  {/* Tabla formal -- inspirada en la pestaña "Vencimiento" de Softland */}
                                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <th
                                          style={{
                                            textAlign: 'left',
                                            padding: '4px 8px',
                                            fontSize: '10px',
                                            fontWeight: 700,
                                            color: '#94a3b8',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.03em',
                                          }}
                                        >
                                          Tramo
                                        </th>
                                        <th
                                          style={{
                                            textAlign: 'right',
                                            padding: '4px 8px',
                                            fontSize: '10px',
                                            fontWeight: 700,
                                            color: '#94a3b8',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.03em',
                                          }}
                                        >
                                          Facturas
                                        </th>
                                        <th
                                          style={{
                                            textAlign: 'right',
                                            padding: '4px 8px',
                                            fontSize: '10px',
                                            fontWeight: 700,
                                            color: '#94a3b8',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.03em',
                                          }}
                                        >
                                          Monto
                                        </th>
                                        <th
                                          style={{
                                            textAlign: 'right',
                                            padding: '4px 8px',
                                            fontSize: '10px',
                                            fontWeight: 700,
                                            color: '#94a3b8',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.03em',
                                          }}
                                        >
                                          % Cartera
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(
                                        [
                                          'no_vencido',
                                          'mora_1_30',
                                          'mora_31_60',
                                          'mora_61_90',
                                          'mora_91_120',
                                          'mora_120_plus',
                                        ] as const
                                      ).map((k) => {
                                        const monto = r[k];
                                        const cant = r[`cant_${k}` as 'cant_no_vencido'];
                                        const pct = (monto / totalAging) * 100;
                                        return (
                                          <tr key={k} style={{ borderBottom: '1px solid #f8fafc' }}>
                                            <td
                                              style={{
                                                padding: '5px 8px',
                                                fontSize: '11px',
                                                color: '#475569',
                                              }}
                                            >
                                              <span
                                                style={{
                                                  width: '8px',
                                                  height: '8px',
                                                  borderRadius: '2px',
                                                  background: AGING_COLORS[k],
                                                  display: 'inline-block',
                                                  marginRight: '6px',
                                                }}
                                              />
                                              {AGING_LABELS[k]}
                                            </td>
                                            <td
                                              style={{
                                                padding: '5px 8px',
                                                fontSize: '11px',
                                                textAlign: 'right',
                                                color: '#94a3b8',
                                                fontVariantNumeric: 'tabular-nums',
                                              }}
                                            >
                                              {cant > 0 ? cant : '—'}
                                            </td>
                                            <td
                                              style={{
                                                padding: '5px 8px',
                                                fontSize: '11px',
                                                textAlign: 'right',
                                                color: '#475569',
                                                fontWeight: 600,
                                                fontVariantNumeric: 'tabular-nums',
                                              }}
                                            >
                                              {fmtCRC(monto)}
                                            </td>
                                            <td
                                              style={{
                                                padding: '5px 8px',
                                                fontSize: '11px',
                                                textAlign: 'right',
                                                color: '#94a3b8',
                                                fontVariantNumeric: 'tabular-nums',
                                              }}
                                            >
                                              {monto > 0 ? `${pct.toFixed(0)}%` : '—'}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                      <tr style={{ background: rec.bg }}>
                                        <td
                                          style={{
                                            padding: '6px 8px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            color: rec.color,
                                          }}
                                        >
                                          TOTAL
                                        </td>
                                        <td
                                          style={{
                                            padding: '6px 8px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            textAlign: 'right',
                                            color: rec.color,
                                            fontVariantNumeric: 'tabular-nums',
                                          }}
                                        >
                                          {r.cant_no_vencido +
                                            r.cant_mora_1_30 +
                                            r.cant_mora_31_60 +
                                            r.cant_mora_61_90 +
                                            r.cant_mora_91_120 +
                                            r.cant_mora_120_plus}
                                        </td>
                                        <td
                                          style={{
                                            padding: '6px 8px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            textAlign: 'right',
                                            color: rec.color,
                                            fontVariantNumeric: 'tabular-nums',
                                          }}
                                        >
                                          {fmtCRC(totalAging)}
                                        </td>
                                        <td
                                          style={{
                                            padding: '6px 8px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            textAlign: 'right',
                                            color: rec.color,
                                          }}
                                        >
                                          100%
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </>
                              ) : (
                                <p className="text-[11px] text-gray-300">
                                  Sin saldo en cartera para este cliente.
                                </p>
                              )}
                            </div>

                            {/* PANEL DERECHO -- Ficha de Decisión */}
                            <div className="col-span-12 lg:col-span-6 bg-slate-50 rounded-lg p-4 space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">
                                    Score ICP
                                  </p>
                                  <p className="text-[13px] font-semibold text-gray-700">
                                    {r.icp_score !== null
                                      ? `${r.icp_score} / 100 · ${r.icp_clasificacion ?? ''}`
                                      : 'Sin historial'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">
                                    Analista
                                  </p>
                                  <p className="text-[13px] font-semibold text-gray-700">
                                    {r.analista_nombre ?? 'Sin asignar'}
                                  </p>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-slate-200">
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                                  Comentarios de la Gestión
                                </p>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                  {CHIPS_RATIONALE.map((chip) => (
                                    <button
                                      key={chip}
                                      type="button"
                                      onClick={() =>
                                        inyectarChip(
                                          r.id_pedido,
                                          comentariosDraft[r.id_pedido] ??
                                            r.comentario_analista ??
                                            '',
                                          chip,
                                        )
                                      }
                                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-600 hover:border-[#009ee3] hover:text-[#009ee3] transition-colors"
                                    >
                                      {chip}
                                    </button>
                                  ))}
                                </div>
                                <textarea
                                  value={
                                    comentariosDraft[r.id_pedido] ?? r.comentario_analista ?? ''
                                  }
                                  onChange={(e) =>
                                    setComentariosDraft((prev) => ({
                                      ...prev,
                                      [r.id_pedido]: e.target.value,
                                    }))
                                  }
                                  rows={3}
                                  placeholder="Escribí una nota de gestión..."
                                  className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[12px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-50 focus:border-blue-400"
                                />
                                <div className="flex justify-end mt-1.5">
                                  <button
                                    type="button"
                                    disabled={
                                      guardandoComentario.has(r.id_pedido) ||
                                      (comentariosDraft[r.id_pedido] ??
                                        r.comentario_analista ??
                                        '') === (r.comentario_analista ?? '')
                                    }
                                    onClick={() =>
                                      guardarComentario(
                                        r.id_pedido,
                                        comentariosDraft[r.id_pedido] ??
                                          r.comentario_analista ??
                                          '',
                                      )
                                    }
                                    className="rounded-lg px-3 py-1 text-[11px] font-bold text-white disabled:opacity-40"
                                    style={{ background: '#009ee3' }}
                                  >
                                    {guardandoComentario.has(r.id_pedido)
                                      ? 'Guardando...'
                                      : 'Guardar'}
                                  </button>
                                </div>
                              </div>

                              {r.motivo_retencion && (
                                <p className="text-[11px] text-red-600 pt-2 border-t border-slate-200">
                                  <b>Motivo de retención:</b> {r.motivo_retencion}
                                </p>
                              )}
                              {r.resuelto_por && (
                                <p className="text-[10px] text-gray-400">
                                  Resuelto por {r.resuelto_por}
                                  {r.resuelto_en
                                    ? ` · ${new Date(r.resuelto_en).toLocaleString('es-CR')}`
                                    : ''}
                                </p>
                              )}
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
      </div>
    </div>
  );
}
