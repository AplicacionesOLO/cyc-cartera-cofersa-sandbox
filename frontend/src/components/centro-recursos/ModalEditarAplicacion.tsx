'use client';

import { useState } from 'react';
import { X, Pencil } from 'lucide-react';
import type { AplicacionRecurso } from '@/types/centro-recursos';
import { useCentroRecursosController } from '@/views/centro-recursos/hooks/use-centro-recursos-controller';

interface Props {
  aplicacion: AplicacionRecurso;
  onClose: () => void;
  onSuccess: (app: AplicacionRecurso) => void;
}

export default function ModalEditarAplicacion({ aplicacion, onClose, onSuccess }: Props) {
  const [nombre, setNombre] = useState(aplicacion.nombre);
  const [url, setUrl] = useState(aplicacion.url);
  const [notas, setNotas] = useState(aplicacion.descripcion ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { actualizarAplicacion } = useCentroRecursosController();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !url.trim()) {
      setError('Nombre y URL son requeridos');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await actualizarAplicacion(aplicacion.id, {
        nombre: nombre.trim(),
        url: url.trim(),
        descripcion: notas.trim(),
      });
      onSuccess(data);
    } catch (e) {
      setError((e as Error).message || 'Error al guardar');
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
            <Pencil size={16} /> Editar Aplicación
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
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              URL destino *
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition"
              placeholder="https://... (Vercel, carpeta de red, ERP futuro)"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Notas Operativas
            </label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition"
              rows={3}
              placeholder="Notas internas para el equipo"
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
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
