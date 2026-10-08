'use client';

import { useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  X,
  AlertCircle,
  UserX,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
} from 'lucide-react';
import { displayRol } from '@/lib/utils/roles';
import { fmtTel, telValido } from '@/lib/utils/telefono';
import { useConfiguracionController } from '@/views/configuracion/hooks/use-configuracion-controller';
import type { VendedorRow } from './TabVendedores';
import type { UsuarioRow } from './TabUsuarios';

export interface DirectorioRow {
  id: string;
  nombre: string;
  email: string;
  cargo: string | null;
  area: string;
  telefono: string | null;
  activo: boolean;
  created_at: string;
  es_comprador: boolean;
}

// Fila unificada para la vista -- una misma persona puede existir en más de
// una fuente a la vez (ej. un gerente cargado a mano en Directorio que AHORA
// también tiene login al SIC como usuario 'GERENCIA'). Se fusiona por email
// en una sola fila en vez de listarla duplicada por cada fuente.
type Origen = 'manual' | 'vendedor' | 'equipo';
interface FilaDirectorio {
  id: string;
  nombre: string;
  email: string;
  cargo: string | null;
  area: string;
  telefono: string | null;
  activo: boolean;
  origenes: Origen[]; // todas las fuentes que aportan a esta fila (orden sin importancia)
  manual?: DirectorioRow; // presente si alguna de las fuentes es 'manual' (necesario para editar/desactivar)
  manualInactivoPeroActivoPorOtraFuente: boolean; // ver nota junto a "Estado" más abajo
}

interface Props {
  contactos: DirectorioRow[];
  vendedores: VendedorRow[];
  usuarios: UsuarioRow[];
}

const AREAS = [
  'Ventas',
  'Logística',
  'Crédito y Cobro',
  'Gerencia',
  'TI',
  'Compras',
  'Recursos Humanos',
  'Contabilidad',
  'Otro',
];

// Área por defecto según el rol del usuario, SOLO cuando esa persona no tiene
// además un contacto manual con su propia área ya asignada (ver precedencia
// en el merge de abajo: manual > equipo > vendedor).
const AREA_POR_ROL: Record<string, string> = {
  COORDINADOR: 'Crédito y Cobro',
  ANALISTA: 'Crédito y Cobro',
  ANALISTA_RIESGO: 'Crédito y Cobro',
  GERENCIA: 'Gerencia',
};

// Badges de origen -- 'manual' no lleva badge (es el contacto "base"); un
// origen adicional (vendedor y/o equipo) se agrega como badge de más, nunca
// como fila aparte.
const ORIGEN_BADGE: Record<Exclude<Origen, 'manual'>, { label: string; cls: string }> = {
  vendedor: { label: 'Vendedor', cls: 'bg-cyan-50 text-cyan-700' },
  equipo: { label: 'Equipo C&C', cls: 'bg-[#003B5C]/10 text-[#003B5C]' },
};

const inputC =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition';
const thCls = 'py-2.5 px-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider';
const tdCls = 'py-2.5 px-3 text-sm text-gray-700';

export default function TabDirectorio({ contactos: init, vendedores, usuarios }: Props) {
  const [rows, setRows] = useState<DirectorioRow[]>(init);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [mostrarInac, setMostrarInac] = useState(false);
  const cfg = useConfiguracionController();
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<DirectorioRow | null>(null);
  const [confirmDeact, setConfirmDeact] = useState<DirectorioRow | null>(null);
  const [colapsadas, setColapsadas] = useState<Set<string>>(new Set());

  // ── Fusionar directorio manual + Vendedores (con email) + Usuarios (equipo C&C) por email ──
  // Antes se listaba una fila por cada fuente -- una misma persona con contacto
  // manual Y login al SIC aparecía duplicada (y en áreas distintas si divergían).
  // Ahora se agrupa por email normalizado en una sola fila, con precedencia
  // manual > equipo > vendedor para los campos de display (el contacto manual
  // es el que un humano curó a propósito; el resto son datos derivados).
  const todas: FilaDirectorio[] = useMemo(() => {
    type Fuentes = { manual?: DirectorioRow; vendedor?: VendedorRow; usuario?: UsuarioRow };
    const porEmail = new Map<string, Fuentes>();

    function upsert(email: string, patch: Fuentes) {
      const key = email.trim().toLowerCase();
      if (!key) return;
      porEmail.set(key, { ...porEmail.get(key), ...patch });
    }

    rows.forEach((c) => upsert(c.email, { manual: c }));
    vendedores.filter((v) => v.email).forEach((v) => upsert(v.email!, { vendedor: v }));
    usuarios.forEach((u) => upsert(u.email, { usuario: u }));

    return Array.from(porEmail.entries()).map(([email, { manual, vendedor, usuario }]) => {
      const origenes: Origen[] = [];
      if (manual) origenes.push('manual');
      if (vendedor) origenes.push('vendedor');
      if (usuario) origenes.push('equipo');

      const cargoVendedor = vendedor
        ? vendedor.zona
          ? `Vendedor · ${vendedor.zona}`
          : 'Vendedor'
        : null;
      const areaVendedor = vendedor ? 'Ventas' : null;
      const cargoUsuario = usuario ? displayRol(usuario.rol) : null;
      const areaUsuario = usuario ? (AREA_POR_ROL[usuario.rol] ?? 'Crédito y Cobro') : null;

      // Un contacto manual desactivado no "revive" solo -- pero si la misma
      // persona sigue activa como vendedor o como usuario del SIC, la fila
      // combinada se muestra activa igual (avisamos con una nota en Estado).
      const activo =
        (manual?.activo ?? false) || (vendedor?.activo ?? false) || (usuario?.activo ?? false);
      const manualInactivoPeroActivoPorOtraFuente = !!manual && !manual.activo && activo;

      return {
        id: manual?.id ?? `sin-manual-${email}`,
        nombre: manual?.nombre ?? usuario?.nombre ?? vendedor?.nombre ?? email,
        email,
        cargo: manual?.cargo ?? cargoUsuario ?? cargoVendedor,
        area: manual?.area ?? areaUsuario ?? areaVendedor ?? 'Otro',
        telefono: manual?.telefono ?? usuario?.telefono ?? vendedor?.telefono ?? null,
        activo,
        origenes,
        manual,
        manualInactivoPeroActivoPorOtraFuente,
      };
    });
  }, [rows, vendedores, usuarios]);

  const q = busqueda.trim().toLowerCase();
  const visibles = todas.filter((c) => {
    const matchQ = !q || c.nombre.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
    const matchAct = mostrarInac || c.activo;
    return matchQ && matchAct;
  });

  const porArea = AREAS.map((area) => ({
    area,
    filas: visibles.filter((c) => c.area === area).sort((a, b) => a.nombre.localeCompare(b.nombre)),
  })).filter((g) => g.filas.length > 0);

  // Con búsqueda activa, todas las áreas con resultados se muestran expandidas
  function estaExpandida(area: string) {
    return q ? true : !colapsadas.has(area);
  }
  function toggleArea(area: string) {
    setColapsadas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  }

  async function handleDeactivate(c: DirectorioRow) {
    try {
      await cfg.desactivarContacto(c.id);
      setRows((prev) => prev.map((r) => (r.id === c.id ? { ...r, activo: false } : r)));
    } catch (e) {
      setError((e as Error).message);
    }
    setConfirmDeact(null);
  }

  const totalActivos = todas.filter((r) => r.activo).length;

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

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-gray-700">
            {totalActivos} contacto{totalActivos !== 1 ? 's' : ''} activo
            {totalActivos !== 1 ? 's' : ''}
          </p>
          <p className="text-[11px] text-gray-400">
            Directorio + Vendedores + Equipo C&C · alimenta el autocomplete de correos en el SIC
          </p>
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <input
            type="text"
            placeholder="Buscar..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={inputC + ' w-48'}
          />
          <button
            type="button"
            onClick={() => setColapsadas(new Set())}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-2"
            title="Expandir todas las áreas"
          >
            <ChevronsDown size={14} /> Expandir
          </button>
          <button
            type="button"
            onClick={() => setColapsadas(new Set(porArea.map((g) => g.area)))}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-2"
            title="Colapsar todas las áreas"
          >
            <ChevronsUp size={14} /> Colapsar
          </button>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={mostrarInac}
              onChange={(e) => setMostrarInac(e.target.checked)}
              className="rounded"
            />
            Mostrar inactivos
          </label>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white"
            style={{ backgroundColor: '#009ee3' }}
          >
            <Plus size={14} /> Agregar contacto
          </button>
        </div>
      </div>

      {/* Secciones por área */}
      <div className="space-y-3">
        {porArea.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 py-8 text-center text-sm text-gray-400">
            Sin resultados
          </div>
        )}
        {porArea.map(({ area, filas }) => {
          const expandida = estaExpandida(area);
          const activosArea = filas.filter((f) => f.activo).length;
          return (
            <div key={area} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleArea(area)}
                disabled={!!q}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 disabled:cursor-default"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-bold text-sm text-gray-800">{area}</span>
                  <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold bg-gray-100 text-gray-500">
                    {activosArea} activo{activosArea !== 1 ? 's' : ''}
                    {filas.length !== activosArea ? ` · ${filas.length} total` : ''}
                  </span>
                </div>
                {!q && (
                  <ChevronDown
                    size={16}
                    className={`text-gray-400 transition-transform ${expandida ? 'rotate-180' : ''}`}
                  />
                )}
              </button>

              {expandida && (
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className={thCls}>Nombre</th>
                        <th className={thCls}>Email</th>
                        <th className={thCls}>Cargo</th>
                        <th className={thCls}>Teléfono</th>
                        <th className={thCls}>Origen</th>
                        <th className={thCls}>Estado</th>
                        <th className={thCls}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((c) => {
                        const badges = c.origenes.filter(
                          (o): o is Exclude<Origen, 'manual'> => o !== 'manual',
                        );
                        const origenesSecundarios = c.origenes.filter((o) => o !== 'manual');
                        return (
                          <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className={tdCls + ' font-semibold'}>{c.nombre}</td>
                            <td className={tdCls + ' text-gray-500 font-mono text-xs'}>
                              {c.email}
                            </td>
                            <td className={tdCls + ' text-gray-500'}>
                              {c.cargo ?? '—'}
                              {c.manual?.es_comprador && (
                                <span className="ml-1.5 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700">
                                  Comprador
                                </span>
                              )}
                            </td>
                            <td className={tdCls + ' text-gray-500 font-mono text-xs'}>
                              {c.telefono ?? '—'}
                            </td>
                            <td className={tdCls}>
                              {badges.length > 0 ? (
                                <div className="flex items-center gap-1 flex-wrap">
                                  {badges.map((o) => (
                                    <span
                                      key={o}
                                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ORIGEN_BADGE[o].cls}`}
                                    >
                                      {ORIGEN_BADGE[o].label}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                            <td className={tdCls}>
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                              >
                                {c.activo ? 'Activo' : 'Inactivo'}
                              </span>
                              {c.manualInactivoPeroActivoPorOtraFuente && (
                                <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                                  Contacto desactivado, pero sigue activo por{' '}
                                  {origenesSecundarios
                                    .map((o) => ORIGEN_BADGE[o as Exclude<Origen, 'manual'>].label)
                                    .join(' / ')}
                                </p>
                              )}
                            </td>
                            <td className={tdCls}>
                              <div className="flex flex-col gap-1">
                                {c.manual && (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => setEditTarget(c.manual!)}
                                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                      <Pencil size={12} /> Editar
                                    </button>
                                    {c.manual.activo && (
                                      <button
                                        onClick={() => setConfirmDeact(c.manual!)}
                                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium"
                                      >
                                        <UserX size={12} /> Desactivar
                                      </button>
                                    )}
                                  </div>
                                )}
                                {(c.origenes.includes('vendedor') ||
                                  c.origenes.includes('equipo')) && (
                                  <span className="text-xs text-gray-400">
                                    Editar en{' '}
                                    {[
                                      c.origenes.includes('vendedor') && 'tab Vendedores',
                                      c.origenes.includes('equipo') && 'tab Usuarios',
                                    ]
                                      .filter(Boolean)
                                      .join(' / ')}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showAdd && (
        <ModalContacto
          title="Agregar contacto"
          onClose={() => setShowAdd(false)}
          onSuccess={(c) => {
            setRows((prev) => [...prev, c]);
            setShowAdd(false);
          }}
        />
      )}
      {editTarget && (
        <ModalContacto
          title="Editar contacto"
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={(c) => {
            setRows((prev) => prev.map((r) => (r.id === c.id ? c : r)));
            setEditTarget(null);
          }}
        />
      )}
      {confirmDeact && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <p className="font-bold text-gray-900">¿Desactivar contacto?</p>
            <p className="text-sm text-gray-600">
              Se desactivará a <strong>{confirmDeact.nombre}</strong> del directorio. Ya no
              aparecerá en el autocomplete.
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
    </div>
  );
}

// ── Modal Crear / Editar ──────────────────────────────────────────────
function ModalContacto({
  title,
  initial,
  onClose,
  onSuccess,
}: {
  title: string;
  initial?: DirectorioRow;
  onClose: () => void;
  onSuccess: (c: DirectorioRow) => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    nombre: initial?.nombre ?? '',
    email: initial?.email ?? '',
    cargo: initial?.cargo ?? '',
    area: initial?.area ?? 'Ventas',
    telefono: fmtTel(initial?.telefono ?? ''),
    activo: initial?.activo ?? true,
  });
  const [esComprador, setEsComprador] = useState(initial?.es_comprador ?? false);
  const [loading, setL] = useState(false);
  const [error, setErr] = useState('');
  const cfg = useConfiguracionController();

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.email.trim()) {
      setErr('Nombre y email son requeridos');
      return;
    }
    if (!telValido(form.telefono)) {
      setErr('El teléfono debe tener exactamente 8 dígitos');
      return;
    }
    setL(true);
    setErr('');
    try {
      const payload = {
        nombre: form.nombre,
        email: form.email,
        cargo: form.cargo || undefined,
        area: form.area,
        telefono: form.telefono || undefined,
        es_comprador: esComprador,
        ...(isEdit ? { activo: form.activo } : {}),
      };
      const json = isEdit
        ? await cfg.actualizarContacto(initial!.id, payload)
        : await cfg.crearContacto(payload);
      onSuccess({
        ...(initial ?? { id: json.data.id, created_at: new Date().toISOString() }),
        ...json.data,
      } as DirectorioRow);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setL(false);
    }
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
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Nombre *
              </label>
              <input
                value={form.nombre}
                onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                className={iC}
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Cargo
              </label>
              <input
                value={form.cargo}
                onChange={(e) => setForm((p) => ({ ...p, cargo: e.target.value }))}
                className={iC}
                placeholder="Ej: Gerente de Ventas"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Email *
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className={iC}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Área
              </label>
              <select value={form.area} onChange={set('area')} className={iC}>
                {AREAS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Teléfono
              </label>
              <input
                type="tel"
                value={form.telefono}
                maxLength={9}
                onChange={(e) => setForm((p) => ({ ...p, telefono: fmtTel(e.target.value) }))}
                className={iC}
                placeholder="8888-8888"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 pt-1">
            <input
              type="checkbox"
              checked={esComprador}
              onChange={(e) => setEsComprador(e.target.checked)}
            />
            Es comprador / Gerente de Marca
          </label>
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
              {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Agregar contacto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
