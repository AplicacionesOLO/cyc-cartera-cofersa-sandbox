'use client';

import { useState } from 'react';
import { X, UploadCloud } from 'lucide-react';
import type { DocumentoRecurso } from '@/types/centro-recursos';
import { useCentroRecursosController } from '@/views/centro-recursos/hooks/use-centro-recursos-controller';

const CATEGORIAS = ['Formas de Pago', 'Políticas de Crédito', 'Plantillas de Convenios'] as const;

interface Props {
  onClose: () => void;
  onSuccess: (doc: DocumentoRecurso) => void;
}

export default function ModalCargarDocumento({ onClose, onSuccess }: Props) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS)[number]>(CATEGORIAS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { cargarDocumento } = useCentroRecursosController();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) {
      setError('El título es requerido');
      return;
    }
    if (!file) {
      setError('Seleccioná un archivo');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const data = await cargarDocumento({
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        categoria,
        file,
      });
      onSuccess(data);
    } catch (e) {
      setError((e as Error).message || 'Error al cargar el documento');
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
            <UploadCloud size={16} /> Cargar Nuevo Documento
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Título *
            </label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition"
              placeholder="Ej: Política de Crédito 2026"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Descripción
            </label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition"
              rows={2}
              placeholder="Descripción corta"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Categoría *
            </label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as (typeof CATEGORIAS)[number])}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 transition"
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
              Archivo *
            </label>
            <input
              type="file"
              accept=".pdf,.docx,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
              required
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
              {loading ? 'Cargando...' : 'Cargar documento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
