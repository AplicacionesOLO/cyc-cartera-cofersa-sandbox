'use client';

import { useState } from 'react';
import { AlertCircle, X, Save } from 'lucide-react';
import { useConfiguracionController } from '@/views/configuracion/hooks/use-configuracion-controller';

export interface SemaforoData {
  [clave: string]: string;
}

interface Props {
  semaforo: SemaforoData;
}

const inputN =
  'w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition';

const CAMPOS = [
  {
    nivel: 'ROJO',
    color: '#dc2626',
    campos: [
      {
        clave: 'semaforo_rojo_mora_dias',
        label: 'Mora mayor a (días)',
        hint: 'Cliente con facturas en tramo ≥ N días de mora',
      },
      {
        clave: 'semaforo_rojo_sin_gestion_dias',
        label: 'Sin gestión ≥ (días)',
        hint: 'Cliente sin ninguna gestión registrada en los últimos N días',
      },
    ],
  },
  {
    nivel: 'ÁMBAR',
    color: '#d97706',
    campos: [
      {
        clave: 'semaforo_ambar_mora_min',
        label: 'Mora entre (días, mín)',
        hint: 'Tramo mínimo de mora para activar ámbar',
      },
      {
        clave: 'semaforo_ambar_mora_max',
        label: 'Mora entre (días, máx)',
        hint: 'Tramo máximo de mora para activar ámbar',
      },
      {
        clave: 'semaforo_ambar_promesa_dias',
        label: 'Promesa vence en < (días)',
        hint: 'Promesa de pago que vence en menos de N días',
      },
      {
        clave: 'semaforo_ambar_sin_gestion_dias',
        label: 'Sin gestión ≥ (días)',
        hint: 'Cliente sin gestión en los últimos N días (menor urgencia)',
      },
    ],
  },
  {
    nivel: 'VERDE',
    color: '#16a34a',
    campos: [] as { clave: string; label: string; hint: string }[],
    nota: 'Los clientes con mora solo en el tramo 1-30 días se clasifican automáticamente como VERDE.',
  },
];

export default function TabSemaforo({ semaforo: init }: Props) {
  const [form, setForm] = useState<Record<string, string>>(init);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const cfg = useConfiguracionController();

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);
    // Convertir a números para la API
    const payload: Record<string, number> = {};
    for (const [k, v] of Object.entries(form)) {
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 0) {
        setError(`Valor inválido en "${k}": debe ser un número positivo`);
        setLoading(false);
        return;
      }
      payload[k] = n;
    }
    try {
      await cfg.guardarSemaforo(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function renderGrupo(grupo: (typeof CAMPOS)[number], extraClass = '') {
    return (
      <div
        key={grupo.nivel}
        className={`bg-white rounded-xl shadow-md border border-gray-100 p-5 space-y-4 ${extraClass}`}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: grupo.color }}
          />
          <h3 className="text-sm font-bold" style={{ color: grupo.color }}>
            {grupo.nivel}
          </h3>
        </div>
        {'nota' in grupo && grupo.nota && (
          <p className="text-[12px]" style={{ color: grupo.color }}>
            {grupo.nota}
          </p>
        )}
        {grupo.campos.map((campo) => (
          <div key={campo.clave} className="flex items-center justify-between gap-4">
            <div className="text-left">
              <p className="text-sm font-medium text-gray-800">{campo.label}</p>
              <p className="text-xs text-gray-500">{campo.hint}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <input
                type="number"
                min={0}
                max={365}
                value={form[campo.clave] ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, [campo.clave]: e.target.value }))}
                className={inputN}
                required
              />
              <span className="text-xs text-gray-400">días</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold text-white disabled:opacity-60 transition"
          style={{ backgroundColor: '#009ee3' }}
        >
          <Save size={14} />
          {loading ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar reglas del semáforo'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
        <div className="flex flex-col gap-6">
          {renderGrupo(CAMPOS[0])}
          {renderGrupo(CAMPOS[2])}
        </div>
        {renderGrupo(CAMPOS[1], 'h-full')}
      </div>

      {/* Nota de aplicación */}
      <p className="text-xs text-gray-400 text-center">
        Los cambios aplican en el próximo cálculo del semáforo (en la siguiente sincronización del
        GAS).
      </p>
    </form>
  );
}
