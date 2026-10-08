'use client';

import { useState } from 'react';
import { Save, AlertCircle, X } from 'lucide-react';
import { TIPOS_SOLICITUD, AREA_MAP, type AreaKey } from '@/lib/solicitudes/catalogo';
import { useConfiguracionController } from '@/views/configuracion/hooks/use-configuracion-controller';

interface Props {
  // clave = `sla_${slug(tipo)}` → valor en horas
  // Si no existe en BD, se usa el valor del catálogo como default
  slaOverrides: Record<string, string>;
}

// Genera una clave de config_sistema a partir del nombre del tipo
function slaKey(tipo: string): string {
  return (
    'sla_' +
    tipo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
  );
}

export default function TabSLA({ slaOverrides: init }: Props) {
  const [overrides, setOverrides] = useState<Record<string, string>>(init);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const cfg = useConfiguracionController();

  function getValor(tipo: string, defaultHoras: number): string {
    const k = slaKey(tipo);
    return overrides[k] ?? String(defaultHoras);
  }

  function setValor(tipo: string, valor: string) {
    setOverrides((prev) => ({ ...prev, [slaKey(tipo)]: valor }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);

    // Construir payload con todos los valores actuales (hardcoded + overrides)
    const payload: Record<string, string> = {};
    for (const t of TIPOS_SOLICITUD) {
      payload[slaKey(t.tipo)] = getValor(t.tipo, t.sla_horas);
    }

    try {
      await cfg.guardarSla(payload);

      setSaved(true);
      setOverrides(payload);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function renderArea(areaKey: AreaKey) {
    const area = AREA_MAP[areaKey];
    const tipos = TIPOS_SOLICITUD.filter((t) => t.area === areaKey);
    if (tipos.length === 0) return null;
    return (
      <div key={areaKey} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100" style={{ backgroundColor: area.bg }}>
          <p className="text-sm font-bold" style={{ color: area.color }}>
            {area.label}
          </p>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-2 px-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Tipo de solicitud
              </th>
              <th className="py-2 px-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Prioridad
              </th>
              <th className="py-2 px-4 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider pr-6">
                SLA (horas)
              </th>
            </tr>
          </thead>
          <tbody>
            {tipos.map((t) => (
              <tr key={t.tipo} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="py-2.5 px-4 text-sm text-gray-700">{t.tipo}</td>
                <td className="py-2.5 px-4">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.prioridad === 'Alta'
                        ? 'bg-red-100 text-red-700'
                        : t.prioridad === 'Media'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {t.prioridad}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-right pr-6">
                  <div className="flex items-center justify-end gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={getValor(t.tipo, t.sla_horas)}
                      onChange={(e) => setValor(t.tipo, e.target.value)}
                      className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:border-blue-400 transition"
                    />
                    <span className="text-xs text-gray-400">h</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          {loading ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar SLA'}
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="flex flex-col gap-6">
          {renderArea('credito_cobro')}
          {renderArea('actualizacion_datos')}
        </div>
        <div className="flex flex-col gap-6">
          {renderArea('comercial')}
          {renderArea('logistica')}
        </div>
      </div>
    </form>
  );
}
