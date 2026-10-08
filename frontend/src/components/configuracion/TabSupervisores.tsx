'use client';

import { useState } from 'react';
import { Plus, Pencil, X, AlertCircle, UserX, RotateCcw } from 'lucide-react';
import { fmtFecha } from '@/lib/utils/formato';
import { useConfiguracionController } from '@/views/configuracion/hooks/use-configuracion-controller';

export interface SupervisorRow {
  cod: string;
  nombre: string;
  email: string | null;
  activo: boolean;
  n_vendedores: number;
  created_at: string;
  es_jefe_regional: boolean;
  jefe_regional_cod: string | null;
  cargo_jerarquia: string | null;
}

interface Props {
  supervisores: SupervisorRow[];
}

const inputC =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition';
const thCls = 'py-2.5 px-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider';
const tdCls = 'py-2.5 px-3 text-sm text-gray-700';

export default function TabSupervisores({ supervisores: init }: Props) {
  const [rows, setRows] = useState<SupervisorRow[]>(init);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<SupervisorRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeact, setConfirmDeact] = useState<SupervisorRow | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [mostrarInac, setMostrarInac] = useState(false);
  const cfg = useConfiguracionController();

  const visibles = mostrarInac ? rows : rows.filter((r) => r.activo);

  // ── Cambio de "Reporta a" (optimistic update) ─────────────────────
  async function handleJefeChange(cod: string, nuevoCod: string) {
    const codFinal = nuevoCod || null;
    const anterior = rows.find((r) => r.cod === cod)?.jefe_regional_cod ?? null;

    setRows((prev) => prev.map((r) => (r.cod === cod ? { ...r, jefe_regional_cod: codFinal } : r)));
    setSaving((prev) => ({ ...prev, [cod]: true }));
    try {
      await cfg.actualizarSupervisor(cod, { jefe_regional_cod: codFinal });
    } catch (e) {
      setRows((prev) =>
        prev.map((r) => (r.cod === cod ? { ...r, jefe_regional_cod: anterior } : r)),
      );
      setError((e as Error).message);
    } finally {
      setSaving((prev) => {
        const n = { ...prev };
        delete n[cod];
        return n;
      });
    }
  }

  async function handleDeactivate(s: SupervisorRow) {
    if (s.n_vendedores > 0) {
      setError(
        `${s.nombre} tiene ${s.n_vendedores} vendedor(es) activo(s) asignados. Reasigná los vendedores primero.`,
      );
      setConfirmDeact(null);
      return;
    }
    try {
      await cfg.desactivarSupervisor(s.cod);
      setRows((prev) => prev.map((r) => (r.cod === s.cod ? { ...r, activo: false } : r)));
    } catch (e) {
      setError((e as Error).message);
    }
    setConfirmDeact(null);
  }

  async function handleReactivate(s: SupervisorRow) {
    try {
      await cfg.actualizarSupervisor(s.cod, { activo: true });
      setRows((prev) => prev.map((r) => (r.cod === s.cod ? { ...r, activo: true } : r)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

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

      <div className="flex items-center gap-3 justify-end">
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
          <Plus size={14} /> Agregar supervisor
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className={thCls}>Código</th>
              <th className={thCls}>Nombre</th>
              <th className={thCls}>Correo</th>
              <th className={thCls}>Vendedores</th>
              <th className={thCls}>Jerarquía</th>
              <th className={thCls}>Estado</th>
              <th className={thCls}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-gray-400">
                  {mostrarInac ? 'Sin supervisores registrados' : 'No hay supervisores activos'}
                </td>
              </tr>
            )}
            {visibles.map((s) => {
              return (
                <tr key={s.cod} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className={tdCls + ' font-mono text-xs text-gray-500'}>{s.cod}</td>
                  <td className={tdCls + ' font-semibold'}>{s.nombre}</td>
                  <td className={tdCls + ' text-gray-500'}>{s.email ?? '—'}</td>
                  <td className={tdCls}>
                    <span
                      className="font-bold"
                      style={{ color: s.n_vendedores > 0 ? '#003B5C' : '#94a3b8' }}
                    >
                      {s.n_vendedores}
                    </span>
                  </td>
                  <td className={tdCls}>
                    {s.es_jefe_regional ? (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-700">
                        {s.cargo_jerarquia || 'Jefe Regional'}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <select
                          value={s.jefe_regional_cod ?? ''}
                          onChange={(e) => handleJefeChange(s.cod, e.target.value)}
                          disabled={saving[s.cod]}
                          className="min-w-0 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400 transition disabled:opacity-50"
                        >
                          <option value="">Sin asignar</option>
                          {rows
                            .filter((r) => r.es_jefe_regional && r.activo)
                            .map((j) => (
                              <option key={j.cod} value={j.cod}>
                                {j.nombre}
                              </option>
                            ))}
                        </select>
                        {saving[s.cod] && (
                          <span className="text-[11px] text-blue-500 flex-shrink-0">
                            guardando...
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className={tdCls}>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {s.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditTarget(s)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        <Pencil size={12} /> Editar
                      </button>
                      {s.activo ? (
                        <button
                          onClick={() => setConfirmDeact(s)}
                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          <UserX size={12} /> Desactivar
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(s)}
                          className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium"
                        >
                          <RotateCcw size={12} /> Reactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Agregar */}
      {showAdd && (
        <ModalSupervisor
          title="Agregar supervisor"
          jefesRegionales={rows.filter((r) => r.es_jefe_regional && r.activo)}
          onClose={() => setShowAdd(false)}
          onSuccess={(nuevo) => {
            setRows((prev) => [...prev, { ...nuevo, n_vendedores: 0 }]);
            setShowAdd(false);
          }}
        />
      )}

      {/* Modal Editar */}
      {editTarget && (
        <ModalSupervisor
          title="Editar supervisor"
          initial={editTarget}
          jefesRegionales={rows.filter(
            (r) => r.es_jefe_regional && r.activo && r.cod !== editTarget.cod,
          )}
          onClose={() => setEditTarget(null)}
          onSuccess={(updated) => {
            setRows((prev) => prev.map((r) => (r.cod === updated.cod ? { ...r, ...updated } : r)));
            setEditTarget(null);
          }}
        />
      )}

      {/* Confirmación desactivar */}
      {confirmDeact && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <p className="font-bold text-gray-900">¿Desactivar supervisor?</p>
            <p className="text-sm text-gray-600">
              Se desactivará a <strong>{confirmDeact.nombre}</strong>. Esta acción es reversible.
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

// ── Modal Crear / Editar Supervisor ───────────────────────────────────
function ModalSupervisor({
  title,
  initial,
  jefesRegionales,
  onClose,
  onSuccess,
}: {
  title: string;
  initial?: SupervisorRow;
  jefesRegionales: SupervisorRow[];
  onClose: () => void;
  onSuccess: (s: SupervisorRow) => void;
}) {
  const [form, setForm] = useState({
    cod: initial?.cod ?? '',
    nombre: initial?.nombre ?? '',
    email: initial?.email ?? '',
  });
  const [esJefeRegional, setEsJefeRegional] = useState(initial?.es_jefe_regional ?? false);
  const [jefeRegionalCod, setJefeRegionalCod] = useState(initial?.jefe_regional_cod ?? '');
  const [cargoJerarquia, setCargoJerarquia] = useState(initial?.cargo_jerarquia ?? 'Jefe Regional');
  const [loading, setL] = useState(false);
  const [error, setErr] = useState('');
  const isEdit = !!initial;
  const cfg = useConfiguracionController();

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.cod.trim() || !form.nombre.trim()) {
      setErr('Código y nombre son requeridos');
      return;
    }
    setL(true);
    setErr('');
    try {
      const payload = {
        cod: form.cod,
        nombre: form.nombre,
        email: form.email || undefined,
        es_jefe_regional: esJefeRegional,
        jefe_regional_cod: esJefeRegional ? null : jefeRegionalCod || null,
        cargo_jerarquia: esJefeRegional ? cargoJerarquia.trim() || 'Jefe Regional' : null,
      };
      const json = isEdit
        ? await cfg.actualizarSupervisor(initial!.cod, payload)
        : await cfg.crearSupervisor(payload);
      onSuccess({
        ...(initial ?? { n_vendedores: 0, activo: true, created_at: new Date().toISOString() }),
        ...json.data,
      } as SupervisorRow);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setL(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Código *
            </label>
            <input
              value={form.cod}
              onChange={set('cod')}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition"
              required
              disabled={isEdit}
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Nombre completo *
            </label>
            <input
              value={form.nombre}
              onChange={set('nombre')}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Correo corporativo
            </label>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 pt-1">
            <input
              type="checkbox"
              checked={esJefeRegional}
              onChange={(e) => setEsJefeRegional(e.target.checked)}
            />
            Es tope de la jerarquía (Jefe Regional / Gerente de Ventas)
          </label>

          {esJefeRegional && (
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Cargo a mostrar
              </label>
              <input
                value={cargoJerarquia}
                onChange={(e) => setCargoJerarquia(e.target.value)}
                placeholder="Jefe Regional"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition"
              />
            </div>
          )}

          {!esJefeRegional && (
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Reporta a
              </label>
              <select
                value={jefeRegionalCod}
                onChange={(e) => setJefeRegionalCod(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 transition"
              >
                <option value="">Sin asignar</option>
                {jefesRegionales.map((j) => (
                  <option key={j.cod} value={j.cod}>
                    {j.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

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
              {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear supervisor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
