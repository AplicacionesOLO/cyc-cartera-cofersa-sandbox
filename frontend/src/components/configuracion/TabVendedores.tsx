'use client';

import { useState, useRef, Fragment } from 'react';
import {
  Plus,
  X,
  CheckCircle2,
  AlertCircle,
  UserX,
  RotateCcw,
  Eye,
  ChevronDown,
  ChevronRight,
  Search,
  Route,
  Users,
  Pencil,
} from 'lucide-react';
import { fmtFechaHora } from '@/lib/utils/formato';
import { fmtTel, telValido } from '@/lib/utils/telefono';
import { useConfiguracionController } from '@/views/configuracion/hooks/use-configuracion-controller';

// ── Tipos ─────────────────────────────────────────────────────────────
export interface VendedorRow {
  cod: string;
  nombre: string;
  email: string | null;
  zona: string | null;
  telefono: string | null;
  analista_email: string | null;
  asignado_por: string | null;
  asignado_en: string | null;
  supervisor_cod: string | null;
  supervisor_nombre: string | null;
  activo: boolean;
  n_clientes: number;
  tipo_canal: string;
}

export const CANALES_VENDEDOR = [
  'Venta Regular',
  'Televenta',
  'Cuenta Clave',
  'Ruta Administrativa',
] as const;
export interface AnalistaBasico {
  nombre: string;
  email: string;
  iniciales: string;
  color: string;
}
export interface SupervisorBasico {
  cod: string;
  nombre: string;
}
export interface RutaMiembro {
  cod: string;
  nombre: string;
  activo: boolean;
}
export interface RutaGrupo {
  principal_cod: string;
  principal_nombre: string;
  nombre_ruta: string;
  rol_funcional: string | null;
  activo: boolean;
  miembros: RutaMiembro[];
}

interface Props {
  vendedores: VendedorRow[];
  analistas: AnalistaBasico[];
  supervisores: SupervisorBasico[];
  rutas: RutaGrupo[];
}

type FiltroCartera = '' | 'GENERALISTA' | 'ACOTADO';
type FiltroRapido = '' | 'GENERALISTA' | 'ACOTADO' | 'SIN_ANALISTA';

// Anchos de columna compartidos entre la tabla madre y el bloque expandible
// de rutas (deben coincidir exactamente para que las sub-filas alineen).
const COLS_VENDEDORES = ['2%', '6%', '21%', '6%', '8%', '10%', '15%', '6%', '15%', '11%'];

// ── Estilos comunes ───────────────────────────────────────────────────
const thCls =
  'py-2.5 px-2.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider';
const tdCls = 'py-2 px-2.5 text-sm text-gray-700';
const inputC =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition';
const selC =
  'rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 transition';

function rutaDe(cod: string, rutas: RutaGrupo[]): RutaGrupo | null {
  return (
    rutas.find(
      (r) =>
        r.activo && (r.principal_cod === cod || r.miembros.some((m) => m.activo && m.cod === cod)),
    ) ?? null
  );
}
function esPrincipal(cod: string, ruta: RutaGrupo | null): boolean {
  return !!ruta && ruta.principal_cod === cod;
}

// ── Componente ────────────────────────────────────────────────────────
export default function TabVendedores({
  vendedores: init,
  analistas,
  supervisores,
  rutas: initRutas,
}: Props) {
  const [rows, setRows] = useState<VendedorRow[]>(init);
  const [rutas, setRutas] = useState<RutaGrupo[]>(initRutas);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [highlighted, setHighlighted] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroAn, setFiltroAn] = useState('');
  const [filtroSup, setFiltroSup] = useState('');
  const [filtroCartera, setFiltroCartera] = useState<FiltroCartera>('');
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>('');
  const [showModalVendedor, setShowModalVendedor] = useState(false);
  const [editTarget, setEditTarget] = useState<VendedorRow | null>(null);
  const [modalRuta, setModalRuta] = useState<
    { mode: 'crear' } | { mode: 'editar'; ruta: RutaGrupo } | null
  >(null);
  const [verInactivos, setVerInactivos] = useState(false);
  const [confirmDeact, setConfirmDeact] = useState<VendedorRow | null>(null);
  const [confirmDesactRuta, setConfirmDesactRuta] = useState<RutaGrupo | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const cfg = useConfiguracionController();

  // ── Activos / inactivos ───────────────────────────────────────────
  const activos = rows.filter((v) => v.activo);
  const inactivos = rows.filter((v) => !v.activo);

  const rutasActivas = rutas.filter((r) => r.activo);
  const codsEnAcotado = new Set<string>();
  rutasActivas.forEach((r) => {
    codsEnAcotado.add(r.principal_cod);
    r.miembros.filter((m) => m.activo).forEach((m) => codsEnAcotado.add(m.cod));
  });

  // ── Filtro ─────────────────────────────────────────────────────────
  const baseList = verInactivos ? inactivos : activos;

  // "contexto": solo los filtros normales (búsqueda/supervisor/analista) —
  // alimenta los contadores de las tarjetas KPI, que así reaccionan a esos
  // filtros pero no se auto-colapsan cuando se activa un filtro rápido.
  const contexto = baseList.filter((v) => {
    const q = busqueda.toLowerCase();
    const matchQ = !q || v.nombre.toLowerCase().includes(q) || v.cod.toLowerCase().includes(q);
    const matchAn = !filtroAn || v.analista_email === filtroAn;
    const matchSup = !filtroSup || v.supervisor_cod === filtroSup;
    return matchQ && matchAn && matchSup;
  });
  const contextoAcotado = contexto.filter((v) => codsEnAcotado.has(v.cod)).length;
  const contextoGeneralistas = contexto.length - contextoAcotado;
  const contextoSinAnalista = contexto.filter((v) => !v.analista_email).length;

  // "filtered": contexto + filtro de cartera (dropdown o tarjeta KPI) + filtro rápido "sin analista"
  const filtered = contexto.filter((v) => {
    const ruta = rutaDe(v.cod, rutas);
    const matchCartera = !filtroCartera || (filtroCartera === 'GENERALISTA' ? !ruta : !!ruta);
    const matchSinAnalista = filtroRapido !== 'SIN_ANALISTA' || !v.analista_email;
    return matchCartera && matchSinAnalista;
  });

  // ── Tarjetas KPI como filtros rápidos ──────────────────────────────
  function aplicarFiltroRapido(f: FiltroRapido) {
    if (f === filtroRapido) {
      setFiltroRapido('');
      setFiltroCartera('');
      return;
    }
    setFiltroRapido(f);
    setFiltroCartera(f === 'ACOTADO' || f === 'GENERALISTA' ? f : '');
  }

  // ── Cambio de supervisor (optimistic update) ─────────────────────
  async function handleSupervisorChange(cod: string, nuevoCod: string) {
    const codFinal = nuevoCod || null;
    const supervisor = supervisores.find((s) => s.cod === codFinal) ?? null;
    const anterior = rows.find((r) => r.cod === cod) ?? null;

    setRows((prev) =>
      prev.map((r) =>
        r.cod === cod
          ? { ...r, supervisor_cod: codFinal, supervisor_nombre: supervisor?.nombre ?? null }
          : r,
      ),
    );
    const key = cod + '_sup';
    setSaving((prev) => ({ ...prev, [key]: true }));
    if (timerRef.current[key]) clearTimeout(timerRef.current[key]);

    try {
      await cfg.actualizarVendedor(cod, { supervisor_cod: codFinal });
      setHighlighted((prev) => ({ ...prev, [key]: true }));
      timerRef.current[key] = setTimeout(() => {
        setHighlighted((prev) => {
          const n = { ...prev };
          delete n[key];
          return n;
        });
      }, 1500);
    } catch (e) {
      setRows((prev) =>
        prev.map((r) =>
          r.cod === cod
            ? {
                ...r,
                supervisor_cod: anterior?.supervisor_cod ?? null,
                supervisor_nombre: anterior?.supervisor_nombre ?? null,
              }
            : r,
        ),
      );
      setError((e as Error).message);
    } finally {
      setSaving((prev) => {
        const n = { ...prev };
        delete n[key];
        return n;
      });
    }
  }

  // ── Cambio de analista (optimistic update) ────────────────────────
  async function handleAnalistaChange(cod: string, nuevoEmail: string) {
    const emailFinal = nuevoEmail || null;
    const anterior = rows.find((r) => r.cod === cod)?.analista_email ?? null;

    setRows((prev) =>
      prev.map((r) =>
        r.cod === cod
          ? { ...r, analista_email: emailFinal, asignado_en: new Date().toISOString() }
          : r,
      ),
    );
    setSaving((prev) => ({ ...prev, [cod]: true }));
    if (timerRef.current[cod]) clearTimeout(timerRef.current[cod]);

    try {
      await cfg.actualizarVendedor(cod, { analista_email: emailFinal });
      setHighlighted((prev) => ({ ...prev, [cod]: true }));
      timerRef.current[cod] = setTimeout(() => {
        setHighlighted((prev) => {
          const n = { ...prev };
          delete n[cod];
          return n;
        });
      }, 1500);
    } catch (e) {
      setRows((prev) => prev.map((r) => (r.cod === cod ? { ...r, analista_email: anterior } : r)));
      setError((e as Error).message);
    } finally {
      setSaving((prev) => {
        const n = { ...prev };
        delete n[cod];
        return n;
      });
    }
  }

  // ── Cambio de canal (optimistic update) ───────────────────────────
  async function handleCanalChange(cod: string, nuevoCanal: string) {
    const anterior = rows.find((r) => r.cod === cod)?.tipo_canal ?? 'Venta Regular';
    const key = cod + '_canal';

    setRows((prev) => prev.map((r) => (r.cod === cod ? { ...r, tipo_canal: nuevoCanal } : r)));
    setSaving((prev) => ({ ...prev, [key]: true }));

    try {
      await cfg.actualizarVendedor(cod, { tipo_canal: nuevoCanal });
      setHighlighted((prev) => ({ ...prev, [key]: true }));
      timerRef.current[key] = setTimeout(() => {
        setHighlighted((prev) => {
          const n = { ...prev };
          delete n[key];
          return n;
        });
      }, 1500);
    } catch (e) {
      setRows((prev) => prev.map((r) => (r.cod === cod ? { ...r, tipo_canal: anterior } : r)));
      setError((e as Error).message);
    } finally {
      setSaving((prev) => {
        const n = { ...prev };
        delete n[key];
        return n;
      });
    }
  }

  // ── Desactivar / reactivar vendedor ───────────────────────────────
  async function handleDeactivate(v: VendedorRow) {
    setConfirmDeact(null);
    try {
      await cfg.desactivarVendedor(v.cod);
      setRows((prev) => prev.map((r) => (r.cod === v.cod ? { ...r, activo: false } : r)));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function handleReactivate(v: VendedorRow) {
    try {
      await cfg.actualizarVendedor(v.cod, { activo: true });
      setRows((prev) => prev.map((r) => (r.cod === v.cod ? { ...r, activo: true } : r)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // ── Rutas de portafolio acotado ────────────────────────────────────
  async function recargarRutas() {
    try {
      const json = await cfg.rutas();
      setRutas(json.data);
    } catch {
      /* igual que antes: si falla la recarga se mantiene la lista actual */
    }
  }
  function toggleExpand(cod: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cod)) next.delete(cod);
      else next.add(cod);
      return next;
    });
  }
  async function handleDesactivarRuta(ruta: RutaGrupo) {
    setConfirmDesactRuta(null);
    try {
      await cfg.desactivarRuta(ruta.principal_cod);
      await recargarRutas();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function handleReactivarRuta(ruta: RutaGrupo) {
    try {
      await cfg.actualizarRuta(ruta.principal_cod, { activo: true });
      await recargarRutas();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function handleQuitarMiembro(ruta: RutaGrupo, cod: string) {
    const nuevaLista = ruta.miembros.filter((m) => m.activo && m.cod !== cod).map((m) => m.cod);
    try {
      await cfg.actualizarRuta(ruta.principal_cod, { miembros: nuevaLista });
      await recargarRutas();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Stat cards — también funcionan como filtros rápidos */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            key: '' as FiltroRapido,
            label: 'Total vendedores',
            value: contexto.length,
            color: '#003B5C',
          },
          {
            key: 'GENERALISTA' as FiltroRapido,
            label: 'Generalistas',
            value: contextoGeneralistas,
            color: '#64748b',
          },
          {
            key: 'ACOTADO' as FiltroRapido,
            label: `Portafolio acotado · ${rutasActivas.length} ruta${rutasActivas.length === 1 ? '' : 's'}`,
            value: contextoAcotado,
            color: '#009ee3',
          },
          {
            key: 'SIN_ANALISTA' as FiltroRapido,
            label: 'Sin analista',
            value: contextoSinAnalista,
            color: contextoSinAnalista > 0 ? '#dc2626' : '#22c55e',
          },
        ].map((c) => {
          const activo = c.key !== '' && filtroRapido === c.key;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => aplicarFiltroRapido(c.key)}
              className="bg-white rounded-xl border p-4 text-center cursor-pointer transition-colors hover:bg-gray-50"
              style={
                activo
                  ? {
                      borderColor: '#009ee3',
                      borderWidth: '2px',
                      boxShadow: '0 0 0 3px rgba(0,158,227,0.12)',
                    }
                  : { borderColor: '#e5e7eb', borderWidth: '1px' }
              }
            >
              <p className="text-2xl font-bold" style={{ color: c.color }}>
                {c.value}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">{c.label}</p>
            </button>
          );
        })}
      </div>

      {/* Filtros + botones */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Buscar por nombre o código..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className={inputC + ' flex-1 min-w-[180px] max-w-xs'}
        />
        <select
          value={filtroCartera}
          onChange={(e) => setFiltroCartera(e.target.value as FiltroCartera)}
          className={selC}
        >
          <option value="">Todas las carteras</option>
          <option value="GENERALISTA">Solo generalistas</option>
          <option value="ACOTADO">Solo portafolio acotado</option>
        </select>
        <select value={filtroSup} onChange={(e) => setFiltroSup(e.target.value)} className={selC}>
          <option value="">Todos los supervisores</option>
          {supervisores.map((s) => (
            <option key={s.cod} value={s.cod}>
              {s.nombre}
            </option>
          ))}
        </select>
        <select value={filtroAn} onChange={(e) => setFiltroAn(e.target.value)} className={selC}>
          <option value="">Todos los analistas</option>
          {analistas.map((a) => (
            <option key={a.email} value={a.email}>
              {a.nombre}
            </option>
          ))}
        </select>
        <button
          onClick={() => setVerInactivos((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ml-auto transition"
          style={
            verInactivos
              ? { backgroundColor: '#003B5C', color: 'white', borderColor: '#003B5C' }
              : { color: '#64748b', borderColor: '#e2e8f0' }
          }
        >
          <Eye size={14} />{' '}
          {verInactivos
            ? 'Ver activos'
            : `Ver inactivos${inactivos.length ? ` (${inactivos.length})` : ''}`}
        </button>
        <button
          onClick={() => setShowModalVendedor(true)}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white"
          style={{ backgroundColor: '#009ee3' }}
        >
          <Plus size={14} /> Agregar vendedor
        </button>
        <button
          onClick={() => setModalRuta({ mode: 'crear' })}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white"
          style={{ backgroundColor: '#003B5C' }}
        >
          <Route size={14} /> Crear ruta
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ tableLayout: 'fixed', minWidth: '1250px' }}>
            <colgroup>
              {COLS_VENDEDORES.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                <th className={thCls}></th>
                <th className={thCls}>Código</th>
                <th className={thCls}>Vendedor</th>
                <th className={thCls}>Zona</th>
                <th className={thCls}>Rol en Ruta</th>
                <th className={thCls}>Canal</th>
                <th className={thCls}>Supervisor</th>
                <th className={thCls + ' text-right'}>Clientes</th>
                <th className={thCls}>Analista asignado</th>
                <th className={thCls}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-sm text-gray-400">
                    {verInactivos ? 'No hay vendedores inactivos' : 'Sin resultados'}
                  </td>
                </tr>
              )}
              {filtered.map((v) => {
                const ruta = rutaDe(v.cod, rutas);
                const principal = esPrincipal(v.cod, ruta);
                const isExpanded = expanded.has(v.cod);
                return (
                  <Fragment key={v.cod}>
                    <tr
                      className="border-t border-gray-100 transition-colors"
                      style={highlighted[v.cod] ? { backgroundColor: '#f0fdf4' } : undefined}
                    >
                      <td className={tdCls + ' text-center'}>
                        {ruta && (
                          <button
                            onClick={() => toggleExpand(v.cod)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                      </td>
                      <td className={tdCls + ' font-mono text-xs text-gray-500 truncate'}>
                        {v.cod}
                      </td>
                      <td className={tdCls + ' font-semibold truncate'} title={v.nombre}>
                        {v.nombre}
                      </td>
                      <td className={tdCls + ' font-mono text-xs text-gray-400 truncate'}>
                        {v.zona ?? '—'}
                      </td>
                      <td className={tdCls}>
                        {ruta ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                              principal ? 'bg-red-100 text-red-700' : 'bg-cyan-100 text-cyan-700'
                            }`}
                          >
                            {principal ? 'Principal' : 'Miembro'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600">
                            Generalista
                          </span>
                        )}
                      </td>
                      <td className={tdCls}>
                        <select
                          value={v.tipo_canal}
                          onChange={(e) => handleCanalChange(v.cod, e.target.value)}
                          disabled={saving[v.cod + '_canal']}
                          className="w-full min-w-0 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400 transition disabled:opacity-50"
                          style={{
                            background: highlighted[v.cod + '_canal'] ? '#f0fdf4' : undefined,
                          }}
                        >
                          {CANALES_VENDEDOR.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={tdCls}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <select
                            value={v.supervisor_cod ?? ''}
                            onChange={(e) => handleSupervisorChange(v.cod, e.target.value)}
                            disabled={saving[v.cod + '_sup']}
                            className="w-full min-w-0 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400 transition disabled:opacity-50"
                            style={{
                              background: highlighted[v.cod + '_sup'] ? '#f0fdf4' : undefined,
                            }}
                          >
                            <option value="">Sin supervisor</option>
                            {supervisores.map((s) => (
                              <option key={s.cod} value={s.cod}>
                                {s.nombre}
                              </option>
                            ))}
                          </select>
                          {saving[v.cod + '_sup'] && (
                            <span className="text-[11px] text-blue-500 flex-shrink-0">
                              guardando...
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className={tdCls + ' text-right font-semibold'}
                        style={{ color: v.n_clientes > 0 ? '#003B5C' : '#cbd5e1' }}
                      >
                        {v.n_clientes}
                      </td>
                      <td className={tdCls}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <select
                            value={v.analista_email ?? ''}
                            onChange={(e) => handleAnalistaChange(v.cod, e.target.value)}
                            disabled={saving[v.cod]}
                            className="w-full min-w-0 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400 transition disabled:opacity-50"
                          >
                            <option value="">Sin asignar</option>
                            {analistas.map((a) => (
                              <option key={a.email} value={a.email}>
                                {a.nombre}
                              </option>
                            ))}
                          </select>
                          {saving[v.cod] && (
                            <span className="text-[11px] text-blue-500 flex-shrink-0">
                              guardando...
                            </span>
                          )}
                          {highlighted[v.cod] && (
                            <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                          )}
                        </div>
                      </td>
                      <td className={tdCls}>
                        <div className="flex items-center justify-end gap-2.5">
                          <button
                            onClick={() => setEditTarget(v)}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                          >
                            <Pencil size={12} /> Editar
                          </button>
                          {v.activo ? (
                            <button
                              onClick={() => setConfirmDeact(v)}
                              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium whitespace-nowrap"
                            >
                              <UserX size={12} /> Desactivar
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReactivate(v)}
                              className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium whitespace-nowrap"
                            >
                              <RotateCcw size={12} /> Reactivar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && ruta && (
                      <tr key={v.cod + '_expand'}>
                        <td
                          colSpan={10}
                          className="border-t border-dashed border-gray-200"
                          style={{ padding: '10px 12px' }}
                        >
                          <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                            <div className="flex items-center gap-4 flex-wrap px-2.5 pb-2 mb-1 border-b border-slate-100">
                              <span className="text-[10px] font-bold text-gray-400 uppercase">
                                Ruta:{' '}
                                <span
                                  className="text-sm font-semibold normal-case"
                                  style={{ color: '#003B5C' }}
                                >
                                  {ruta.nombre_ruta}
                                </span>
                              </span>
                              {ruta.rol_funcional && (
                                <span className="text-[10px] font-bold text-gray-400 uppercase">
                                  Rol:{' '}
                                  <span
                                    className="text-sm font-semibold normal-case"
                                    style={{ color: '#003B5C' }}
                                  >
                                    {ruta.rol_funcional}
                                  </span>
                                </span>
                              )}
                            </div>
                            <table className="w-full" style={{ tableLayout: 'fixed' }}>
                              <colgroup>
                                {COLS_VENDEDORES.map((w, i) => (
                                  <col key={i} style={{ width: w }} />
                                ))}
                              </colgroup>
                              <tbody className="divide-y divide-slate-100">
                                <tr>
                                  <td></td>
                                  <td className="py-2 px-2.5 font-mono text-[11px] text-gray-400 truncate">
                                    {ruta.principal_cod}
                                  </td>
                                  <td className="py-2 px-2.5 text-sm font-semibold text-gray-800 truncate">
                                    {ruta.principal_nombre}
                                  </td>
                                  <td></td>
                                  <td className="py-2 px-2.5">
                                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-700">
                                      Principal
                                    </span>
                                  </td>
                                  <td colSpan={4}></td>
                                  <td className="py-2 px-2.5">
                                    <div className="flex items-center justify-end gap-3">
                                      <button
                                        onClick={() => setModalRuta({ mode: 'editar', ruta })}
                                        className="text-xs font-bold whitespace-nowrap"
                                        style={{ color: '#009ee3' }}
                                      >
                                        Editar ruta
                                      </button>
                                      <button
                                        onClick={() => setConfirmDesactRuta(ruta)}
                                        className="text-xs font-bold text-red-600 whitespace-nowrap"
                                      >
                                        Desactivar ruta
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                                {ruta.miembros
                                  .filter((m) => m.activo)
                                  .map((m) => (
                                    <tr key={m.cod}>
                                      <td></td>
                                      <td className="py-2 px-2.5 font-mono text-[11px] text-gray-400 truncate">
                                        {m.cod}
                                      </td>
                                      <td className="py-2 px-2.5 text-sm font-semibold text-gray-800 truncate">
                                        {m.nombre}
                                      </td>
                                      <td></td>
                                      <td className="py-2 px-2.5">
                                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-cyan-100 text-cyan-700">
                                          Miembro
                                        </span>
                                      </td>
                                      <td colSpan={4}></td>
                                      <td className="py-2 px-2.5">
                                        <div className="flex items-center justify-end">
                                          <button
                                            onClick={() => handleQuitarMiembro(ruta, m.cod)}
                                            className="text-[11px] font-bold text-red-600 whitespace-nowrap"
                                          >
                                            Quitar del grupo
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
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

      {/* Modal agregar vendedor */}
      {showModalVendedor && (
        <ModalAgregarVendedor
          analistas={analistas}
          supervisores={supervisores}
          onClose={() => setShowModalVendedor(false)}
          onSuccess={(nuevo) => {
            setRows((prev) => [
              ...prev,
              { ...nuevo, supervisor_nombre: null, activo: true, n_clientes: 0 },
            ]);
            setShowModalVendedor(false);
          }}
        />
      )}

      {/* Modal crear/editar ruta */}
      {modalRuta && (
        <ModalRuta
          mode={modalRuta.mode}
          ruta={modalRuta.mode === 'editar' ? modalRuta.ruta : undefined}
          vendedores={activos}
          principalesConRutaActiva={rutasActivas.map((r) => r.principal_cod)}
          onClose={() => setModalRuta(null)}
          onSuccess={async () => {
            setModalRuta(null);
            await recargarRutas();
          }}
        />
      )}

      {editTarget && (
        <ModalEditarVendedor
          vendedor={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={(v) => {
            setRows((prev) => prev.map((r) => (r.cod === v.cod ? v : r)));
            setEditTarget(null);
          }}
        />
      )}

      {/* Confirmación desactivar vendedor */}
      {confirmDeact && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <p className="font-bold text-gray-900">¿Desactivar vendedor?</p>
            <p className="text-sm text-gray-600">
              Se desactivará a <strong>{confirmDeact.nombre}</strong> y saldrá de la lista de
              distribución. No afecta su cartera ni los saldos de sus clientes. La acción es
              reversible desde
              <span className="font-medium"> “Ver inactivos”</span>.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeact(null)}
                className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeactivate(confirmDeact)}
                className="px-4 py-2 text-sm font-bold text-white rounded-lg bg-red-500 hover:bg-red-600"
              >
                Desactivar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación desactivar ruta */}
      {confirmDesactRuta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <p className="font-bold text-gray-900">¿Desactivar ruta?</p>
            <p className="text-sm text-gray-600">
              Se desactivará <strong>{confirmDesactRuta.nombre_ruta}</strong>. Sus miembros dejarán
              de recibir copia de los correos de esa ruta. Es reversible.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDesactRuta(null)}
                className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDesactivarRuta(confirmDesactRuta)}
                className="px-4 py-2 text-sm font-bold text-white rounded-lg bg-red-500 hover:bg-red-600"
              >
                Desactivar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal Agregar Vendedor ────────────────────────────────────────────
function ModalAgregarVendedor({
  analistas,
  supervisores,
  onClose,
  onSuccess,
}: {
  analistas: AnalistaBasico[];
  supervisores: SupervisorBasico[];
  onClose: () => void;
  onSuccess: (v: VendedorRow) => void;
}) {
  const [form, setForm] = useState({
    cod: '',
    nombre: '',
    email: '',
    zona: '',
    telefono: '',
    supervisor_cod: '',
    analista_email: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cfg = useConfiguracionController();

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.cod.trim() || !form.nombre.trim()) {
      setError('Código y nombre son requeridos');
      return;
    }
    if (!telValido(form.telefono)) {
      setError('El teléfono debe tener exactamente 8 dígitos');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const json = await cfg.crearVendedor({
        cod: form.cod.trim(),
        nombre: form.nombre.trim(),
        email: form.email || undefined,
        zona: form.zona || undefined,
        telefono: form.telefono || undefined,
        supervisor_cod: form.supervisor_cod || undefined,
        analista_email: form.analista_email || undefined,
      });
      onSuccess(json.data as VendedorRow);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Agregar vendedor</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Código *
              </label>
              <input
                value={form.cod}
                onChange={set('cod')}
                className={inputC}
                placeholder="Ej: 042"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Nombre *
              </label>
              <input
                value={form.nombre}
                onChange={set('nombre')}
                className={inputC}
                placeholder="Nombre completo"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Correo
            </label>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              className={inputC}
              placeholder="vendedor@cofersa.cr"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Zona
              </label>
              <input
                value={form.zona}
                onChange={set('zona')}
                className={inputC}
                placeholder="Ej: Zona Norte"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Teléfono
              </label>
              <input
                type="tel"
                value={form.telefono}
                maxLength={9}
                onChange={(e) => setForm((prev) => ({ ...prev, telefono: fmtTel(e.target.value) }))}
                className={inputC}
                placeholder="Ej: 8843-3302"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Supervisor
            </label>
            <select value={form.supervisor_cod} onChange={set('supervisor_cod')} className={inputC}>
              <option value="">Sin supervisor</option>
              {supervisores.map((s) => (
                <option key={s.cod} value={s.cod}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Analista Asignado
            </label>
            <select value={form.analista_email} onChange={set('analista_email')} className={inputC}>
              <option value="">Sin asignar</option>
              {analistas.map((a) => (
                <option key={a.email} value={a.email}>
                  {a.nombre}
                </option>
              ))}
            </select>
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
              {loading ? 'Guardando...' : 'Crear vendedor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal Editar Vendedor ─────────────────────────────────────────────
function ModalEditarVendedor({
  vendedor,
  onClose,
  onSuccess,
}: {
  vendedor: VendedorRow;
  onClose: () => void;
  onSuccess: (v: VendedorRow) => void;
}) {
  const [form, setForm] = useState({
    nombre: vendedor.nombre,
    email: vendedor.email ?? '',
    zona: vendedor.zona ?? '',
    telefono: fmtTel(vendedor.telefono ?? ''),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cfg = useConfiguracionController();

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setError('El nombre es requerido');
      return;
    }
    if (!telValido(form.telefono)) {
      setError('El teléfono debe tener exactamente 8 dígitos');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await cfg.actualizarVendedor(vendedor.cod, {
        nombre: form.nombre.trim(),
        email: form.email.trim() || null,
        zona: form.zona.trim() || null,
        telefono: form.telefono.trim() || null,
      });
      onSuccess({
        ...vendedor,
        nombre: form.nombre.trim(),
        email: form.email.trim() || null,
        zona: form.zona.trim() || null,
        telefono: form.telefono.trim() || null,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Pencil size={16} /> Editar vendedor — {vendedor.cod}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Nombre *
            </label>
            <input value={form.nombre} onChange={set('nombre')} className={inputC} required />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Correo
            </label>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              className={inputC}
              placeholder="vendedor@cofersa.cr"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Zona
              </label>
              <input
                value={form.zona}
                onChange={set('zona')}
                className={inputC}
                placeholder="Ej: Zona Norte"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Teléfono
              </label>
              <input
                type="tel"
                value={form.telefono}
                maxLength={9}
                onChange={(e) => setForm((prev) => ({ ...prev, telefono: fmtTel(e.target.value) }))}
                className={inputC}
                placeholder="Ej: 8843-3302"
              />
            </div>
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
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal Crear / Editar Ruta ──────────────────────────────────────────
function ModalRuta({
  mode,
  ruta,
  vendedores,
  principalesConRutaActiva,
  onClose,
  onSuccess,
}: {
  mode: 'crear' | 'editar';
  ruta?: RutaGrupo;
  vendedores: VendedorRow[];
  principalesConRutaActiva: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = mode === 'editar';
  const [principal, setPrincipal] = useState(ruta?.principal_cod ?? '');
  const [nombreRuta, setNombreRuta] = useState(ruta?.nombre_ruta ?? '');
  const [rolFuncional, setRolFuncional] = useState(ruta?.rol_funcional ?? '');
  const [miembros, setMiembros] = useState<Set<string>>(
    new Set((ruta?.miembros ?? []).filter((m) => m.activo).map((m) => m.cod)),
  );
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cfg = useConfiguracionController();

  const opcionesPrincipal = vendedores.filter((v) => !principalesConRutaActiva.includes(v.cod));
  const q = busqueda.trim().toLowerCase();
  const opcionesMiembro = vendedores
    .filter((v) => v.cod !== principal)
    .filter((v) => !q || v.nombre.toLowerCase().includes(q) || v.cod.toLowerCase().includes(q));

  function toggleMiembro(cod: string) {
    setMiembros((prev) => {
      const next = new Set(prev);
      if (next.has(cod)) next.delete(cod);
      else next.add(cod);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!principal) {
      setError('Elegí el vendedor principal');
      return;
    }
    if (!nombreRuta.trim()) {
      setError('Ponele un nombre a la ruta');
      return;
    }
    if (miembros.size === 0) {
      setError('Marcá al menos un miembro adicional');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (isEdit) {
        await cfg.actualizarRuta(principal, {
          nombre_ruta: nombreRuta.trim(),
          rol_funcional: rolFuncional.trim() || null,
          miembros: [...miembros],
        });
      } else {
        await cfg.crearRuta({
          principal_cod: principal,
          nombre_ruta: nombreRuta.trim(),
          rol_funcional: rolFuncional.trim() || null,
          miembros: [...miembros],
        });
      }
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Route size={16} />{' '}
            {isEdit
              ? `Editar ruta — ${ruta?.principal_nombre}`
              : 'Crear ruta de portafolio acotado'}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Vendedor principal (dueño de la ruta) *
            </label>
            {isEdit ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 font-medium">
                {ruta?.principal_nombre}
              </div>
            ) : (
              <select
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
                className={inputC}
                required
              >
                <option value="">Seleccioná un vendedor…</option>
                {opcionesPrincipal.map((v) => (
                  <option key={v.cod} value={v.cod}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Nombre de ruta *
              </label>
              <input
                value={nombreRuta}
                onChange={(e) => setNombreRuta(e.target.value)}
                className={inputC}
                placeholder="Ej: Cuentas Claves"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Rol funcional
              </label>
              <input
                value={rolFuncional}
                onChange={(e) => setRolFuncional(e.target.value)}
                className={inputC}
                placeholder="Ej: Agente de Ventas"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Miembros adicionales *
            </label>
            <div className="relative mb-1.5">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Buscar vendedor…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
              {opcionesMiembro.length === 0 && (
                <p className="px-3 py-3 text-xs text-gray-400">Sin resultados</p>
              )}
              {opcionesMiembro.map((v) => (
                <label
                  key={v.cod}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={miembros.has(v.cod)}
                    onChange={() => toggleMiembro(v.cod)}
                  />
                  <Users size={13} className="text-gray-300" /> {v.nombre}
                </label>
              ))}
            </div>
            {miembros.size > 0 && (
              <p className="text-[11px] text-gray-400 mt-1">{miembros.size} seleccionado(s)</p>
            )}
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
              {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear ruta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
