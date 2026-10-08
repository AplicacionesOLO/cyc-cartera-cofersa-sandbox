'use client';

import { useState, useEffect } from 'react';
import {
  Download,
  Search,
  RefreshCw,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Users,
  AlertTriangle,
  Ban,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  usePagosAplicadosController,
  useMarcarAnuladoController,
  useDescartarDuplicadoController,
} from '@/views/analisis-pagos/hooks/use-pagos-aplicados-controller';
import type { ReciboRow } from '@/views/analisis-pagos/types';
import { fmtCRC } from '@/lib/utils/formato';
import KPICardAnalisis from './KPICardAnalisis';
import { exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';

const COLUMNAS: ColumnaReporte[] = [
  { key: 'no_recibo', label: 'Recibo', align: 'left', format: 'text', width: 18 },
  { key: 'fecha_pago', label: 'Fecha', align: 'center', format: 'fecha', width: 14 },
  { key: 'tipo_pago', label: 'Tipo', align: 'center', format: 'text', width: 10 },
  { key: 'cliente_cod', label: 'Código', align: 'left', format: 'text', width: 14 },
  { key: 'cliente_nombre', label: 'Cliente', align: 'left', format: 'text', width: 44 },
  { key: 'n_clientes', label: 'Cods', align: 'right', format: 'int', width: 10 },
  { key: 'n_facturas', label: 'Facturas', align: 'right', format: 'int', width: 12 },
  { key: 'monto_total', label: 'Monto', align: 'right', format: 'crc', width: 26 },
  { key: 'estado', label: 'Estado', align: 'center', format: 'text', width: 12 },
];

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function mesesRecientes(n = 12): { anio: number; mes: number; label: string }[] {
  const hoy = new Date(Date.now() - 6 * 3600_000); // Costa Rica UTC-6
  const out: { anio: number; mes: number; label: string }[] = [];
  let y = hoy.getUTCFullYear();
  let m = hoy.getUTCMonth() + 1;
  for (let i = 0; i < n; i++) {
    out.push({ anio: y, mes: m, label: `${MESES[m - 1]} ${y}` });
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  return out;
}

const PAGE_SIZE = 50;
const selCls =
  'rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:border-blue-400';
const tdCls = 'px-3 py-2 text-sm text-gray-700';
const thCls = 'px-3 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50';

interface Props {
  soloLectura?: boolean; // Gerencia: ve todo, no anula/desmarca/descarta nada
}

export default function PagosAplicadosCliente({ soloLectura = false }: Props) {
  const opciones = mesesRecientes(12);
  const [anio, setAnio] = useState(opciones[0].anio);
  const [mes, setMes] = useState(opciones[0].mes);
  const [exportando, setExportando] = useState(false);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [soloMulti, setSoloMulti] = useState(false);
  const [soloDup, setSoloDup] = useState(false);
  const [orden, setOrden] = useState<'fecha' | 'monto'>('fecha');
  const [pagina, setPagina] = useState(1);

  // Marcar / desmarcar anulado + descartar posible duplicado
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [modalAnular, setModalAnular] = useState<string[] | null>(null);
  const [confirmDesmarcar, setConfirmDesmarcar] = useState<ReciboRow | null>(null);
  const [modalDescartar, setModalDescartar] = useState<ReciboRow | null>(null);
  const [toast, setToast] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  const {
    data,
    loading,
    error,
    reload: fetchData,
    desmarcar,
  } = usePagosAplicadosController(anio, mes, () => setSeleccionados(new Set()));

  const recibos = data?.recibos ?? [];
  const tipos = Array.from(new Set(recibos.map((r) => r.tipo_pago).filter(Boolean))) as string[];

  // Filtro + orden
  const q = busqueda.trim().toLowerCase();
  const filtradas = recibos
    .filter((r) => {
      if (filtroTipo && r.tipo_pago !== filtroTipo) return false;
      if (soloMulti && r.n_clientes <= 1) return false;
      if (soloDup && !r.posible_duplicado) return false;
      if (
        q &&
        !(
          r.no_recibo.toLowerCase().includes(q) ||
          (r.cliente_nombre ?? '').toLowerCase().includes(q) ||
          (r.cliente_cod ?? '').toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    })
    .sort((a, b) =>
      orden === 'monto'
        ? b.monto_total - a.monto_total
        : b.fecha_pago.localeCompare(a.fecha_pago) || b.no_recibo.localeCompare(a.no_recibo),
    );

  // Resetear página al cambiar filtros / mes
  useEffect(() => {
    setPagina(1);
  }, [busqueda, filtroTipo, soloMulti, soloDup, orden, anio, mes]);

  const totalPag = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const pagSafe = Math.min(pagina, totalPag);
  const visibles = filtradas.slice((pagSafe - 1) * PAGE_SIZE, pagSafe * PAGE_SIZE);
  const sumaFiltrada = filtradas
    .filter((r) => r.estado === 'VALIDO')
    .reduce((s, r) => s + (r.monto_total || 0), 0);
  const nDuplicados = recibos.filter((r) => r.posible_duplicado).length;

  const labelMes =
    opciones.find((o) => o.anio === anio && o.mes === mes)?.label ?? `${mes}/${anio}`;

  function onMesChange(v: string) {
    const [a, m] = v.split('-').map(Number);
    setAnio(a);
    setMes(m);
  }

  function toggleSeleccion(no_recibo: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(no_recibo)) next.delete(no_recibo);
      else next.add(no_recibo);
      return next;
    });
  }

  async function handleDesmarcar(r: ReciboRow) {
    setConfirmDesmarcar(null);
    showToast(await desmarcar(r.no_recibo));
  }

  async function onExcel() {
    if (filtradas.length === 0) return;
    setExportando(true);
    try {
      const totalMonto = sumaFiltrada;
      const totalFact = filtradas.reduce((s, r) => s + (r.n_facturas || 0), 0);
      await exportTablaExcel({
        filas: filtradas.map((r) => ({
          ...r,
          estado: r.estado === 'ANULADO' ? 'Anulado' : 'Válido',
        })) as unknown as Record<string, unknown>[],
        columnas: COLUMNAS,
        titulo: 'Pagos Aplicados — Resumen por Recibo',
        subtitulo:
          labelMes +
          (filtroTipo ? ` · ${filtroTipo}` : '') +
          (soloMulti ? ' · solo varios clientes' : '') +
          (soloDup ? ' · solo posibles duplicados' : ''),
        meta: [
          { label: 'Recibos', value: `${filtradas.length}` },
          { label: 'Monto filtrado (válidos)', value: fmtCRC(sumaFiltrada) },
          { label: 'Mes', value: labelMes },
        ],
        totales: { no_recibo: 'TOTAL', n_facturas: totalFact, monto_total: totalMonto },
        nombreArchivo: `pagos-aplicados-${anio}-${String(mes).padStart(2, '0')}`,
      });
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="p-5 space-y-4">
      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-lg"
          style={{ backgroundColor: '#003B5C' }}
        >
          {toast}
        </div>
      )}

      {/* ── Barra de filtros ───────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={`${anio}-${mes}`}
          onChange={(e) => onMesChange(e.target.value)}
          className={selCls}
        >
          {opciones.map((o) => (
            <option key={`${o.anio}-${o.mes}`} value={`${o.anio}-${o.mes}`}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className={selCls}
        >
          <option value="">Todos los tipos</option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value as 'fecha' | 'monto')}
          className={selCls}
        >
          <option value="fecha">Más recientes</option>
          <option value="monto">Mayor monto</option>
        </select>

        <button
          onClick={() => setSoloMulti((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition"
          style={
            soloMulti
              ? { backgroundColor: '#b45309', color: 'white', borderColor: '#b45309' }
              : { color: '#64748b', borderColor: '#e2e8f0' }
          }
          title="Recibos aplicados a más de un código de cliente (posibles malas aplicaciones)"
        >
          <Users size={14} /> Varios clientes
        </button>

        <button
          onClick={() => setSoloDup((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition"
          style={
            soloDup
              ? { backgroundColor: '#d97706', color: 'white', borderColor: '#d97706' }
              : { color: '#64748b', borderColor: '#e2e8f0' }
          }
          title="Mismo cliente + mismo monto + fecha dentro de 3 días, ninguno marcado como anulado todavía"
        >
          <AlertTriangle size={14} /> Posibles duplicados
          {nDuplicados > 0 ? ` (${nDuplicados})` : ''}
        </button>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar recibo, código o cliente…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          />
        </div>

        <button
          onClick={onExcel}
          disabled={exportando || filtradas.length === 0}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ml-auto"
          style={{ backgroundColor: '#16a34a' }}
        >
          <Download size={14} /> {exportando ? 'Exportando…' : 'Excel'}
        </button>
      </div>

      {/* ── KPIs del mes (solo recibos válidos) ─────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPICardAnalisis
          label="Recibos del mes"
          valor={`${data?.kpis.n_recibos ?? 0}`}
          sub={labelMes}
          color="#009ee3"
        />
        <KPICardAnalisis
          label="Líneas aplicadas"
          valor={`${data?.kpis.n_lineas ?? 0}`}
          sub="recibo × factura"
          color="#003B5C"
        />
        <KPICardAnalisis
          label="Monto total"
          valor={fmtCRC(data?.kpis.monto_total ?? 0)}
          sub="bruto del mes, sin anulados"
          color="#16a34a"
        />
      </div>

      {/* ── Resumen del filtro + actualizar ────────────────────── */}
      <div className="flex items-center gap-2 text-[12px] text-gray-500">
        <span>
          Mostrando <strong className="text-gray-700">{filtradas.length}</strong> de{' '}
          {recibos.length} recibos
          {' · '}
          <strong className="text-gray-700 tabular-nums">{fmtCRC(sumaFiltrada)}</strong> válidos
        </span>
        <button
          onClick={fetchData}
          className="ml-auto flex items-center gap-1.5 hover:text-gray-700"
        >
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* ── Barra de selección múltiple -- Gerencia ve en solo lectura ── */}
      {!soloLectura && seleccionados.size > 0 && (
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-2.5"
          style={{ backgroundColor: '#FEF3C7' }}
        >
          <span className="text-[13px] font-semibold text-amber-800">
            {seleccionados.size} recibo(s) seleccionado(s)
          </span>
          <button
            onClick={() => setModalAnular(Array.from(seleccionados))}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white"
            style={{ backgroundColor: '#b45309' }}
          >
            <Ban size={13} /> Marcar como anulados
          </button>
          <button
            onClick={() => setSeleccionados(new Set())}
            className="ml-auto text-xs text-amber-800 hover:underline"
          >
            Cancelar selección
          </button>
        </div>
      )}

      {/* ── Tabla (encabezado fijo + scroll acotado) ───────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: '58vh' }}>
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={thCls + ' text-center w-8'}></th>
                <th className={thCls + ' text-left'}>Recibo</th>
                <th className={thCls + ' text-center'}>Fecha</th>
                <th className={thCls + ' text-center'}>Tipo</th>
                <th className={thCls + ' text-left'}>Código</th>
                <th className={thCls + ' text-left'}>Cliente</th>
                <th className={thCls + ' text-right'}>Cods</th>
                <th className={thCls + ' text-right'}>Facturas</th>
                <th className={thCls + ' text-right'}>Monto</th>
                <th className={thCls + ' text-center'}>Estado</th>
                <th className={thCls + ' text-right'}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-sm text-gray-400">
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && error && (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-sm text-red-600">
                    {error}
                  </td>
                </tr>
              )}
              {!loading && !error && visibles.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-sm text-gray-400">
                    <CreditCard size={32} className="mx-auto mb-2 text-gray-300" />
                    Sin recibos para los filtros seleccionados
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                visibles.map((r, i) => {
                  const anulado = r.estado === 'ANULADO';
                  return (
                    <tr
                      key={`${r.no_recibo}-${i}`}
                      className={`border-t border-gray-100 hover:bg-gray-50 ${anulado ? 'opacity-60' : ''}`}
                    >
                      <td className={tdCls + ' text-center'}>
                        {!anulado && !soloLectura && (
                          <input
                            type="checkbox"
                            checked={seleccionados.has(r.no_recibo)}
                            onChange={() => toggleSeleccion(r.no_recibo)}
                            className="rounded"
                          />
                        )}
                      </td>
                      <td className={tdCls + ' font-mono text-xs text-gray-600'}>
                        <span className={anulado ? 'line-through' : ''}>{r.no_recibo}</span>
                        {r.posible_duplicado && !anulado && (
                          <>
                            <span
                              title="Mismo cliente + mismo monto + fecha cercana, sin marcar todavía"
                              className="ml-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700"
                            >
                              <AlertTriangle size={9} /> DUP
                            </span>
                            {!soloLectura && (
                              <button
                                onClick={() => setModalDescartar(r)}
                                title="Revisado — no es un duplicado real"
                                className="ml-1 text-[9px] font-semibold text-gray-400 hover:text-gray-600 underline"
                              >
                                no es duplicado
                              </button>
                            )}
                          </>
                        )}
                      </td>
                      <td className={tdCls + ' text-center text-gray-500'}>
                        {r.fecha_pago ? r.fecha_pago.split('-').reverse().join('/') : '—'}
                      </td>
                      <td className={tdCls + ' text-center'}>
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600">
                          {r.tipo_pago ?? '—'}
                        </span>
                      </td>
                      <td className={tdCls + ' font-mono text-xs text-gray-500'}>
                        {r.cliente_cod ?? '—'}
                      </td>
                      <td className={tdCls + ' font-medium ' + (anulado ? 'line-through' : '')}>
                        {r.cliente_nombre ?? '—'}
                      </td>
                      <td
                        className={
                          tdCls +
                          ' text-right tabular-nums ' +
                          (r.n_clientes > 1 ? 'text-amber-600 font-semibold' : 'text-gray-400')
                        }
                      >
                        {r.n_clientes}
                      </td>
                      <td className={tdCls + ' text-right tabular-nums text-gray-500'}>
                        {r.n_facturas}
                      </td>
                      <td
                        className={
                          tdCls +
                          ' text-right tabular-nums font-semibold ' +
                          (anulado ? 'line-through' : '')
                        }
                        style={{ color: anulado ? '#94a3b8' : '#003B5C' }}
                      >
                        {fmtCRC(r.monto_total)}
                      </td>
                      <td className={tdCls + ' text-center'}>
                        {anulado ? (
                          <span
                            title={[r.anulado_motivo, r.anulado_por && `Por: ${r.anulado_por}`]
                              .filter(Boolean)
                              .join(' · ')}
                            className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-500"
                          >
                            Anulado
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700">
                            Válido
                          </span>
                        )}
                      </td>
                      <td className={tdCls + ' text-right'}>
                        {soloLectura ? null : anulado ? (
                          <button
                            onClick={() => setConfirmDesmarcar(r)}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium ml-auto"
                          >
                            <RotateCcw size={12} /> Desmarcar
                          </button>
                        ) : (
                          <button
                            onClick={() => setModalAnular([r.no_recibo])}
                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium ml-auto"
                          >
                            <Ban size={12} /> Marcar anulado
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* ── Paginación ───────────────────────────────────────── */}
        {!loading && !error && filtradas.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50">
            <span className="text-[12px] text-gray-500">
              Página {pagSafe} de {totalPag}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagSafe <= 1}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] text-gray-600 disabled:opacity-40 hover:bg-white"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <button
                onClick={() => setPagina((p) => Math.min(totalPag, p + 1))}
                disabled={pagSafe >= totalPag}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] text-gray-600 disabled:opacity-40 hover:bg-white"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: marcar como anulado (uno o varios) ───────────── */}
      {modalAnular && (
        <ModalAnular
          noRecibos={modalAnular}
          onClose={() => setModalAnular(null)}
          onSuccess={(n) => {
            setModalAnular(null);
            showToast(`${n} recibo(s) marcado(s) como anulado`);
            fetchData();
          }}
        />
      )}

      {/* ── Modal: descartar posible duplicado ──────────────────── */}
      {modalDescartar && (
        <ModalDescartarDuplicado
          recibo={modalDescartar}
          onClose={() => setModalDescartar(null)}
          onSuccess={() => {
            setModalDescartar(null);
            showToast('Descartado — no se va a volver a marcar como posible duplicado');
            fetchData();
          }}
        />
      )}

      {/* ── Confirmación: desmarcar ──────────────────────────────── */}
      {confirmDesmarcar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <p className="font-bold text-gray-900">¿Desmarcar recibo?</p>
            <p className="text-sm text-gray-600">
              <strong className="font-mono">{confirmDesmarcar.no_recibo}</strong> (
              {fmtCRC(confirmDesmarcar.monto_total)}) volverá a contar en la recuperación del mes.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDesmarcar(null)}
                className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDesmarcar(confirmDesmarcar)}
                className="px-4 py-2 text-sm font-bold text-white rounded-lg bg-blue-600 hover:bg-blue-700"
              >
                Desmarcar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal: marcar recibo(s) como anulado(s) ────────────────────────────
function ModalAnular({
  noRecibos,
  onClose,
  onSuccess,
}: {
  noRecibos: string[];
  onClose: () => void;
  onSuccess: (n: number) => void;
}) {
  const { esMultiple, motivo, setMotivo, reemplazo, setReemplazo, loading, error, submit } =
    useMarcarAnuladoController(noRecibos, onSuccess);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit();
  }

  const iC =
    'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Ban size={16} />{' '}
            {esMultiple
              ? `Marcar ${noRecibos.length} recibos como anulados`
              : `Marcar recibo como anulado`}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {!esMultiple && (
            <p className="text-xs text-gray-500 font-mono bg-gray-50 rounded-lg px-3 py-2">
              {noRecibos[0]}
            </p>
          )}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Motivo *
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className={iC}
              rows={2}
              placeholder="Ej: Cambio de cuentas bancarias — cierre de mes"
              required
            />
          </div>
          {!esMultiple && (
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Recibo que lo sustituye (opcional)
              </label>
              <input
                value={reemplazo}
                onChange={(e) => setReemplazo(e.target.value)}
                className={iC}
                placeholder="Ej: RECOF0026042"
              />
            </div>
          )}
          <p className="text-[11px] text-gray-400">
            No se borra nada — el recibo queda visible tachado en el reporte y sale de los totales
            de recuperación. Se puede desmarcar en cualquier momento.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60"
              style={{ backgroundColor: '#b45309' }}
            >
              {loading ? 'Guardando...' : 'Marcar como anulado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal: descartar posible duplicado (revisado, no es un duplicado real) ──
function ModalDescartarDuplicado({
  recibo,
  onClose,
  onSuccess,
}: {
  recibo: ReciboRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { nota, setNota, loading, error, submit } = useDescartarDuplicadoController(
    recibo.no_recibo,
    onSuccess,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit();
  }

  const iC =
    'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">¿No es un duplicado?</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <p className="text-sm text-gray-600">
            <strong className="font-mono">{recibo.no_recibo}</strong> ({fmtCRC(recibo.monto_total)})
            deja de marcarse como posible duplicado. Si otro recibo coincidía solo con este, también
            deja de marcarse.
          </p>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Nota (opcional)
            </label>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              className={iC}
              rows={2}
              placeholder="Ej: cliente divide el pago en varios cheques (verificado en Softland)"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60"
              style={{ backgroundColor: '#009ee3' }}
            >
              {loading ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
