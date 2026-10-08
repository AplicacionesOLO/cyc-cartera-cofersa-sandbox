'use client';

import { useState } from 'react';
import { X, Layers } from 'lucide-react';
import type { AplicacionRecurso } from '@/types/centro-recursos';
import { useCentroRecursosController } from '@/views/centro-recursos/hooks/use-centro-recursos-controller';

const ICONOS_DISPONIBLES = [
  'LayoutDashboard',
  'Smartphone',
  'FileText',
  'Users',
  'BarChart3',
  'Layers',
] as const;
const ESTADOS_DISPONIBLES = ['Live', 'Operativa', 'Mantenimiento'] as const;

interface Props {
  onClose: () => void;
  onSuccess: (app: AplicacionRecurso) => void;
}

export default function ModalRegistrarAplicacion({ onClose, onSuccess }: Props) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [url, setUrl] = useState('');
  const [icono, setIcono] = useState<(typeof ICONOS_DISPONIBLES)[number]>('Layers');
  const [estado, setEstado] = useState<(typeof ESTADOS_DISPONIBLES)[number]>('Operativa');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { crearAplicacion } = useCentroRecursosController();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !url.trim()) {
      setError('Nombre y URL son requeridos');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await crearAplicacion({
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        url: url.trim(),
        icono,
        estado,
      });
      onSuccess(data);
    } catch (e) {
      setError((e as Error).message || 'Error al registrar la aplicación');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Layers size={16} /> Registrar Aplicación
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
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition"
              placeholder="Ej: Portal de Clientes"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Descripción
            </label>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition"
              placeholder="Descripción breve"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              URL *
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition"
              placeholder="https://..."
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Ícono
              </label>
              <select
                value={icono}
                onChange={(e) => setIcono(e.target.value as (typeof ICONOS_DISPONIBLES)[number])}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 transition"
              >
                {ICONOS_DISPONIBLES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                Estado
              </label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as (typeof ESTADOS_DISPONIBLES)[number])}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 transition"
              >
                {ESTADOS_DISPONIBLES.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
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
              {loading ? 'Guardando...' : 'Registrar aplicación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
