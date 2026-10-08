'use client';

import { useState } from 'react';
import { Zap, Clock, AlertCircle, X } from 'lucide-react';
import type { ReglaId } from '@/lib/automatizaciones/registry';
import FeedActividadAutomatizaciones from './FeedActividadAutomatizaciones';
import { useConfiguracionController } from '@/views/configuracion/hooks/use-configuracion-controller';

export interface ReglaEstado {
  id: ReglaId;
  categoria: 'cobranza' | 'mantenimiento' | 'sistema';
  nombre: string;
  descripcion: string;
  toggleable: boolean;
  activa: boolean;
  disparos_7d: number;
  ultima_ejecucion_programada: string | null;
  proxima_ejecucion_programada: string | null;
}

export interface EventoActividad {
  id: string;
  regla_id: ReglaId | null;
  tipo: string;
  titulo: string;
  mensaje: string | null;
  link: string | null;
  leida: boolean;
  created_at: string;
}

export interface AutomatizacionesData {
  reglas: ReglaEstado[];
  eventos: EventoActividad[];
}

interface Props {
  automatizaciones: AutomatizacionesData;
}

function fmtFechaHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CR', {
    timeZone: 'America/Costa_Rica',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className="relative inline-flex h-[22px] w-10 items-center rounded-full transition disabled:opacity-50"
      style={{ backgroundColor: checked ? '#009ee3' : '#e5e7eb' }}
    >
      <span
        className="inline-block h-[18px] w-[18px] transform rounded-full bg-white transition-transform duration-150"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

function SeccionHeader({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-bold text-gray-800">{titulo}</h3>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function ReglaCard({
  regla,
  saved,
  loading,
  onToggle,
}: {
  regla: ReglaEstado;
  saved: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`bg-white rounded-xl border p-4 transition-colors ${saved ? 'border-green-300' : 'border-gray-200'} ${regla.activa ? '' : 'opacity-60'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">{regla.nombre}</p>
          <p className="text-xs text-gray-500 mt-0.5">{regla.descripcion}</p>
        </div>
        {regla.toggleable ? (
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <ToggleSwitch checked={regla.activa} onChange={onToggle} disabled={loading} />
            {saved && <span className="text-[10px] text-green-600 font-medium">✓ Guardado</span>}
          </div>
        ) : (
          <span className="flex-shrink-0 text-[10px] font-bold rounded-full px-2 py-1 bg-blue-50 text-blue-600">
            SIEMPRE ACTIVO
          </span>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2 text-[11px]">
        {regla.activa ? (
          <>
            <span className="flex items-center gap-1 text-gray-500">
              <Zap size={11} />
              {regla.disparos_7d > 0
                ? `Disparó ${regla.disparos_7d} veces esta semana`
                : 'No se disparó esta semana'}
            </span>
            <span className="text-gray-400 flex items-center gap-1">
              <Clock size={11} /> {fmtFechaHora(regla.proxima_ejecucion_programada)}
            </span>
          </>
        ) : (
          <span className="text-amber-600">Regla desactivada — no se generarán notificaciones</span>
        )}
      </div>
    </div>
  );
}

export default function TabAutomatizaciones({ automatizaciones: init }: Props) {
  const [reglas, setReglas] = useState<ReglaEstado[]>(init.reglas);
  const [eventos, setEventos] = useState<EventoActividad[]>(init.eventos);
  const [loading, setLoading] = useState<ReglaId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ReglaId | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const cfg = useConfiguracionController();

  async function handleToggle(regla: ReglaEstado) {
    const nuevaActiva = !regla.activa;
    setLoading(regla.id);
    setError(null);
    setReglas((prev) => prev.map((r) => (r.id === regla.id ? { ...r, activa: nuevaActiva } : r)));

    try {
      await cfg.toggleAutomatizacion(regla.id, nuevaActiva);
      setSaved(regla.id);
      setTimeout(() => setSaved(null), 2000);
    } catch (e) {
      setReglas((prev) =>
        prev.map((r) => (r.id === regla.id ? { ...r, activa: regla.activa } : r)),
      );
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function handleRefreshFeed() {
    setRefreshing(true);
    try {
      const json = await cfg.feed();
      setEventos(json.data);
    } catch {
      // igual que antes: si falla la recarga se mantiene el feed actual
    } finally {
      setRefreshing(false);
    }
  }

  const cobranza = reglas.filter((r) => r.categoria === 'cobranza');
  const mantenimiento = reglas.filter((r) => r.categoria === 'mantenimiento');
  const sistema = reglas.filter((r) => r.categoria === 'sistema');

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X size={12} />
          </button>
        </div>
      )}

      <div>
        <SeccionHeader titulo="Reglas de cobranza" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {cobranza.map((r) => (
            <ReglaCard
              key={r.id}
              regla={r}
              saved={saved === r.id}
              loading={loading === r.id}
              onToggle={() => handleToggle(r)}
            />
          ))}
        </div>
      </div>

      <div>
        <SeccionHeader titulo="Mantenimiento automático" sub="Siempre activo" />
        {mantenimiento.map((r) => (
          <ReglaCard
            key={r.id}
            regla={r}
            saved={saved === r.id}
            loading={loading === r.id}
            onToggle={() => handleToggle(r)}
          />
        ))}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <SeccionHeader titulo="Salud del sistema" sub="Monitoreo técnico — no es cobranza" />
        {sistema.map((r) => (
          <ReglaCard
            key={r.id}
            regla={r}
            saved={saved === r.id}
            loading={loading === r.id}
            onToggle={() => handleToggle(r)}
          />
        ))}
      </div>

      <FeedActividadAutomatizaciones
        eventos={eventos}
        onRefresh={handleRefreshFeed}
        refreshing={refreshing}
      />
    </div>
  );
}
