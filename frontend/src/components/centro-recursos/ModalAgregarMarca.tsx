'use client';

import { useState } from 'react';
import { X, Tag } from 'lucide-react';
import type { Comprador } from '@/types/centro-recursos';
import { useCentroRecursosController } from '@/views/centro-recursos/hooks/use-centro-recursos-controller';

interface MarcaCreada {
  id: string;
  nombre: string;
  proveedor: string | null;
  notas: string | null;
  comprador_id: string;
}

interface Props {
  compradores: Comprador[];
  onClose: () => void;
  onSuccess: (marca: MarcaCreada) => void;
}

export default function ModalAgregarMarca({ compradores, onClose, onSuccess }: Props) {
  const [nombre, setNombre] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [compradorId, setCompradorId] = useState(compradores[0]?.id ?? '');
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { crearMarca } = useCentroRecursosController();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !compradorId) {
      setError('Nombre y comprador son requeridos');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await crearMarca({
        nombre: nombre.trim(),
        proveedor: proveedor.trim(),
        comprador_id: compradorId,
        notas: notas.trim(),
      });
      onSuccess(data as MarcaCreada);
    } catch (e) {
      setError((e as Error).message || 'Error al registrar la marca');
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
            <Tag size={16} /> Agregar Marca
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Nombre de la marca *
            </label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition"
              placeholder="Ej: Black & Decker"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Proveedor
            </label>
            <input
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition"
              placeholder="Nombre del proveedor"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Comprador / Gerente de Marca *
            </label>
            <select
              value={compradorId}
              onChange={(e) => setCompradorId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 transition"
              required
            >
              {compradores.length === 0 && <option value="">Sin compradores registrados</option>}
              {compradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Notas
            </label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition"
              rows={2}
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
              disabled={loading || compradores.length === 0}
              className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60"
              style={{ backgroundColor: '#009ee3' }}
            >
              {loading ? 'Guardando...' : 'Registrar marca'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
