'use client';

import { useState } from 'react';
import { Pencil, Check, X, AlertCircle } from 'lucide-react';
import { fmtCRC } from '@/lib/utils/formato';
import { useConfiguracionController } from '@/views/configuracion/hooks/use-configuracion-controller';

export interface ParamRow {
  clave: string;
  valor: string;
  descripcion?: string;
}

interface Props {
  parametros: ParamRow[];
}

// Metadata de visualización por clave
const PARAM_META: Record<
  string,
  { label: string; hint: string; tipo: 'monto' | 'numero' | 'porcentaje' }
> = {
  meta_mensual: {
    label: 'Meta mensual de cobro (₡)',
    hint: 'Calcula % de avance en el dashboard del coordinador',
    tipo: 'monto',
  },
  meta_gestiones_diarias: {
    label: 'Meta de gestiones diarias por analista',
    hint: 'Barra de progreso /N en el dashboard del analista',
    tipo: 'numero',
  },
  dias_sin_gestion_alerta: {
    label: 'Días sin gestión para alerta',
    hint: 'Activa notificación de cliente sin contacto reciente',
    tipo: 'numero',
  },
  pct_mora_referencia: {
    label: '% Mora objetivo (línea de referencia)',
    hint: 'Línea de referencia visual en el gráfico TendenciaCartera',
    tipo: 'porcentaje',
  },
  HOLGURA_GARANTIA_PCT: {
    label: '% Holgura para garantías',
    hint: 'Margen sobre el saldo del contribuyente para el monto objetivo de garantía y el semáforo de cobertura',
    tipo: 'porcentaje',
  },
  TASA_INTERES_MORATORIO_DEFAULT: {
    label: '% Interés moratorio (pagarés)',
    hint: 'Tasa mensual sugerida al generar un pagaré -- se puede ajustar por garantía puntual',
    tipo: 'porcentaje',
  },
};

function formatValor(clave: string, valor: string): string {
  const meta = PARAM_META[clave];
  if (!meta) return valor;
  const n = Number(valor);
  if (isNaN(n)) return valor;
  if (meta.tipo === 'monto') return fmtCRC(n);
  if (meta.tipo === 'porcentaje') return `${n}%`;
  return `${n}`;
}

export default function TabParametros({ parametros: init }: Props) {
  const [rows, setRows] = useState<ParamRow[]>(init);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const cfg = useConfiguracionController();

  function startEdit(row: ParamRow) {
    setEditing(row.clave);
    setDraft(row.valor);
    setError(null);
  }

  async function handleSave(clave: string) {
    setLoading(true);
    setError(null);
    try {
      await cfg.guardarParametro(clave, draft);
      setRows((prev) => prev.map((r) => (r.clave === clave ? { ...r, valor: draft } : r)));
      setEditing(null);
      setSaved(clave);
      setTimeout(() => setSaved(null), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Asegurar que todas las claves tengan representación
  const allClaves = Object.keys(PARAM_META);
  const allRows: ParamRow[] = allClaves.map((clave) => {
    const existing = rows.find((r) => r.clave === clave);
    return existing ?? { clave, valor: '', descripcion: PARAM_META[clave]?.hint ?? '' };
  });

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

      <div className="space-y-3">
        {allRows.map((row) => {
          const meta = PARAM_META[row.clave];
          const isEdit = editing === row.clave;
          const isSaved = saved === row.clave;
          return (
            <div
              key={row.clave}
              className={`bg-white rounded-xl border p-4 transition-colors ${isSaved ? 'border-green-300' : 'border-gray-200'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">{meta?.label ?? row.clave}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {meta?.hint ?? row.descripcion ?? ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isEdit ? (
                    <>
                      <input
                        type={meta?.tipo === 'monto' ? 'number' : 'number'}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="w-32 rounded-lg border border-blue-300 px-2.5 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-100"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSave(row.clave);
                          if (e.key === 'Escape') setEditing(null);
                        }}
                      />
                      <button
                        onClick={() => handleSave(row.clave)}
                        disabled={loading}
                        className="flex items-center justify-center rounded-lg p-1.5 bg-green-500 hover:bg-green-600 text-white transition"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="flex items-center justify-center rounded-lg p-1.5 hover:bg-gray-100 text-gray-500 transition"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-bold text-gray-900 tabular-nums">
                        {row.valor ? (
                          formatValor(row.clave, row.valor)
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </span>
                      {isSaved && (
                        <span className="text-xs text-green-600 font-medium">✓ Guardado</span>
                      )}
                      <button
                        onClick={() => startEdit(row)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50"
                      >
                        <Pencil size={12} /> Editar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
