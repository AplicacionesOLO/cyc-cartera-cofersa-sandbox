'use client';

import { useState } from 'react';
import { Plus, Pencil, X, AlertCircle } from 'lucide-react';
import { displayRol, ROL_OPCIONES, type RolInterno } from '@/lib/utils/roles';
import { useConfiguracionController } from '@/views/configuracion/hooks/use-configuracion-controller';

export interface UsuarioRow {
  id: string;
  nombre: string;
  email: string;
  rol: RolInterno;
  iniciales: string;
  color: string;
  activo: boolean;
  meta_individual: number;
  telefono: string | null;
  whatsapp: string | null;
  created_at: string;
}

interface Props {
  usuarios: UsuarioRow[];
}

const inputC =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition';
const thCls = 'py-2.5 px-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider';
const tdCls = 'py-2.5 px-3 text-sm text-gray-700';
const DOMINIOS = ['cofersa.cr', 'mayoreo.biz'];

export default function TabUsuarios({ usuarios: init }: Props) {
  const [rows, setRows] = useState<UsuarioRow[]>(init);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<UsuarioRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);

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
      <div className="flex items-center gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-700">
            {rows.length} usuario{rows.length !== 1 ? 's' : ''} registrado
            {rows.length !== 1 ? 's' : ''}
          </p>
          <p className="text-[11px] text-gray-400">Dominios: @cofersa.cr · @mayoreo.biz</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white ml-auto"
          style={{ backgroundColor: '#009ee3' }}
        >
          <Plus size={14} /> Agregar usuario
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '26%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead className="bg-gray-50">
            <tr>
              <th className={thCls}>Usuario</th>
              <th className={thCls}>Correo</th>
              <th className={thCls}>Rol</th>
              <th className={thCls}>Estado</th>
              <th className={thCls}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-gray-400">
                  Sin usuarios registrados
                </td>
              </tr>
            )}
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className={tdCls}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="flex-shrink-0 flex items-center justify-center rounded-full text-white text-[12px] font-bold"
                      style={{ width: 32, height: 32, backgroundColor: u.color }}
                    >
                      {u.iniciales}
                    </div>
                    <span className="font-semibold text-gray-900 truncate">{u.nombre}</span>
                  </div>
                </td>
                <td className={tdCls + ' text-gray-500 truncate'}>{u.email}</td>
                <td className={tdCls}>
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold leading-tight"
                    style={
                      u.rol === 'COORDINADOR'
                        ? { backgroundColor: '#003B5C', color: 'white' }
                        : u.rol === 'ANALISTA'
                          ? { backgroundColor: '#e0f2fe', color: '#0369a1' }
                          : { backgroundColor: '#e2e8f0', color: '#334155' }
                    }
                  >
                    {displayRol(u.rol)}
                  </span>
                </td>
                <td className={tdCls}>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className={tdCls}>
                  <button
                    onClick={() => setEditTarget(u)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    <Pencil size={12} /> Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <ModalUsuario
          title="Agregar usuario"
          onClose={() => setShowAdd(false)}
          onSuccess={(u) => {
            setRows((prev) => [...prev, u]);
            setShowAdd(false);
          }}
        />
      )}
      {editTarget && (
        <ModalUsuario
          title="Editar usuario"
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={(u) => {
            setRows((prev) => prev.map((r) => (r.id === u.id ? u : r)));
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────
function ModalUsuario({
  title,
  initial,
  onClose,
  onSuccess,
}: {
  title: string;
  initial?: UsuarioRow;
  onClose: () => void;
  onSuccess: (u: UsuarioRow) => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    nombre: initial?.nombre ?? '',
    email: initial?.email ?? '',
    rol: initial?.rol ?? ('ANALISTA' as RolInterno),
    iniciales: initial?.iniciales ?? '',
    color: initial?.color ?? '#009ee3',
    meta_individual: String(initial?.meta_individual ?? 0),
    telefono: initial?.telefono ?? '',
    whatsapp: initial?.whatsapp ?? '',
    activo: initial?.activo ?? true,
  });
  const [loading, setL] = useState(false);
  const [error, setErr] = useState('');
  const cfg = useConfiguracionController();

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));
  }
  function setBool(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value === 'true' }));
  }

  // Auto-sugerir iniciales al escribir nombre
  function handleNombre(e: React.ChangeEvent<HTMLInputElement>) {
    const nombre = e.target.value;
    const auto = nombre
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    setForm((prev) => ({ ...prev, nombre, iniciales: prev.iniciales || auto }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.email.trim()) {
      setErr('Nombre y email son requeridos');
      return;
    }
    const dominio = form.email.split('@')[1];
    if (!DOMINIOS.includes(dominio)) {
      setErr('Solo se permiten correos @cofersa.cr o @mayoreo.biz');
      return;
    }
    setL(true);
    setErr('');
    try {
      const payload = isEdit
        ? {
            nombre: form.nombre,
            rol: form.rol,
            activo: form.activo,
            meta_individual: Number(form.meta_individual),
            telefono: form.telefono || null,
            whatsapp: form.whatsapp || null,
            iniciales: form.iniciales,
            color: form.color,
          }
        : {
            nombre: form.nombre,
            email: form.email,
            rol: form.rol,
            iniciales: form.iniciales,
            color: form.color,
            meta_individual: Number(form.meta_individual),
            telefono: form.telefono || null,
            whatsapp: form.whatsapp || null,
          };
      const json = isEdit
        ? await cfg.actualizarUsuario(initial!.id, payload)
        : await cfg.crearUsuario(payload);
      onSuccess({
        ...(initial ?? { id: json.data.id, created_at: new Date().toISOString() }),
        ...json.data,
      } as UsuarioRow);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setL(false);
    }
  }

  const inputCls =
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
        <form onSubmit={handleSubmit} className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Nombre completo *
            </label>
            <input value={form.nombre} onChange={handleNombre} className={inputCls} required />
          </div>
          {!isEdit && (
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Email corporativo *
              </label>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                className={inputCls}
                required
                placeholder="nombre@cofersa.cr"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Rol
              </label>
              <select value={form.rol} onChange={set('rol')} className={inputCls}>
                {ROL_OPCIONES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {isEdit && (
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                  Estado
                </label>
                <select
                  value={String(form.activo)}
                  onChange={setBool('activo')}
                  className={inputCls}
                >
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Iniciales
              </label>
              <input
                value={form.iniciales}
                onChange={set('iniciales')}
                className={inputCls}
                maxLength={2}
                placeholder="AB"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Color avatar
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={set('color')}
                  className="h-9 w-12 rounded border border-gray-200 cursor-pointer"
                />
                <span className="text-xs text-gray-500">{form.color}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Teléfono
              </label>
              <input
                value={form.telefono}
                onChange={set('telefono')}
                className={inputCls}
                placeholder="+506 1234-5678"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                WhatsApp
              </label>
              <input
                value={form.whatsapp}
                onChange={set('whatsapp')}
                className={inputCls}
                placeholder="+50612345678"
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
              {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
