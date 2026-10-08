'use client';

import { useState } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { useAlertasDeterioroController } from '@/views/analisis-pagos/hooks/use-analisis-icp-controller';
import { fmtCRC } from '@/lib/utils/formato';
import KPICardAnalisis from './KPICardAnalisis';
import type { AlertaRow } from '@/types/analisis-pagos';

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border h-24 animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-xl border h-48 animate-pulse" />
    </div>
  );
}

interface Props {
  userEmail: string | null;
  onDataLoaded?: (count: number) => void;
}

export default function TabAlertasDeterioro({ userEmail, onDataLoaded }: Props) {
  const { data, loading, error } = useAlertasDeterioroController(userEmail ?? null, onDataLoaded);
  const [recuperColapsado, setRecuperColapsado] = useState(true);

  if (loading) return <Skeleton />;
  if (error)
    return (
      <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
        <p className="text-red-600 text-sm font-semibold">{error}</p>
      </div>
    );
  if (!data) return null;

  const { kpis, deterioro_critico, deterioro_moderado, recuperacion } = data;

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICardAnalisis
          label="Deterioro crítico"
          valor={kpis.deterioro_critico}
          sub="ICP bajó > 20 pts en 3 meses"
          color="#dc2626"
          icon={<AlertTriangle size={14} />}
        />
        <KPICardAnalisis
          label="Deterioro moderado"
          valor={kpis.deterioro_moderado}
          sub="ICP bajó 10-20 pts"
          color="#f59e0b"
          icon={<TrendingDown size={14} />}
        />
        <KPICardAnalisis
          label="En recuperación"
          valor={kpis.recuperacion}
          sub="ICP subió > 15 pts"
          color="#16a34a"
          icon={<TrendingUp size={14} />}
        />
        <KPICardAnalisis
          label="Sin historial suficiente"
          valor={kpis.sin_historial}
          sub="menos de 5 pagos registrados"
          color="#94a3b8"
          icon={<Users size={14} />}
          muted
        />
      </div>

      {/* Sección deterioro crítico */}
      {deterioro_critico.length > 0 && (
        <AlertaSeccion
          titulo="Deterioro crítico"
          descripcion={`${deterioro_critico.length} cliente${deterioro_critico.length !== 1 ? 's' : ''} con caída de ICP superior a 20 puntos`}
          rows={deterioro_critico}
          colorBorde="#dc2626"
          colorFondo="#FCEBEB"
          colorBadge={{ bg: 'rgba(220,38,38,0.12)', text: '#991b1b' }}
        />
      )}

      {/* Sección deterioro moderado */}
      {deterioro_moderado.length > 0 && (
        <AlertaSeccion
          titulo="Deterioro moderado"
          descripcion={`${deterioro_moderado.length} cliente${deterioro_moderado.length !== 1 ? 's' : ''} con caída de ICP entre 10 y 20 puntos`}
          rows={deterioro_moderado}
          colorBorde="#f59e0b"
          colorFondo="#FAEEDA"
          colorBadge={{ bg: 'rgba(245,158,11,0.12)', text: '#92400e' }}
        />
      )}

      {/* Sección recuperación — colapsada por defecto */}
      {recuperacion.length > 0 && (
        <div>
          <button
            onClick={() => setRecuperColapsado((v) => !v)}
            className="flex items-center gap-2 mb-3 text-[13px] font-bold text-gray-700 hover:text-green-600 transition-colors"
          >
            <TrendingUp size={16} className="text-green-600" />
            En recuperación ({recuperacion.length})
            <span className="text-[11px] font-normal text-gray-400">
              {recuperColapsado ? '— clic para ver' : '— clic para colapsar'}
            </span>
          </button>
          {!recuperColapsado && (
            <AlertaSeccion
              titulo="En recuperación"
              descripcion=""
              rows={recuperacion}
              colorBorde="#16a34a"
              colorFondo="#E1F5EE"
              colorBadge={{ bg: 'rgba(22,163,74,0.12)', text: '#15803d' }}
              esPositivo
            />
          )}
        </div>
      )}

      {/* Estado vacío */}
      {deterioro_critico.length === 0 &&
        deterioro_moderado.length === 0 &&
        recuperacion.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-100 p-12 text-center">
            <TrendingUp size={40} className="mx-auto text-green-300 mb-3" />
            <p className="text-sm font-semibold text-gray-500">
              Sin alertas de deterioro en el período
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              Se necesitan al menos 3 pagos en cada período de 3 meses para detectar cambios
            </p>
          </div>
        )}
    </div>
  );
}

// ── Sección de alertas ────────────────────────────────────────────────────────

function AlertaSeccion({
  titulo,
  descripcion,
  rows,
  colorBorde,
  colorFondo,
  colorBadge,
  esPositivo,
}: {
  titulo: string;
  descripcion: string;
  rows: AlertaRow[];
  colorBorde: string;
  colorFondo: string;
  colorBadge: { bg: string; text: string };
  esPositivo?: boolean;
}) {
  return (
    <div>
      {descripcion && <p className="text-[12px] text-gray-500 mb-3">{descripcion}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {rows.map((row: AlertaRow) => (
          <AlertaCard
            key={row.cliente_cod}
            row={row}
            colorFondo={colorFondo}
            colorBorde={colorBorde}
            colorBadge={colorBadge}
            esPositivo={esPositivo}
          />
        ))}
      </div>
    </div>
  );
}

// ── Card de alerta individual ─────────────────────────────────────────────────

function AlertaCard({
  row,
  colorFondo,
  colorBorde,
  colorBadge,
  esPositivo,
}: {
  row: AlertaRow;
  colorFondo: string;
  colorBorde: string;
  colorBadge: { bg: string; text: string };
  esPositivo?: boolean;
}) {
  const variacionAbs = Math.abs(Math.round(row.variacion));
  const signo = esPositivo ? `+${variacionAbs}` : `-${variacionAbs}`;

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: colorFondo, borderColor: `${colorBorde}40` }}
    >
      {/* Fila 1: nombre + variación */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-gray-800 truncate">{row.cliente_nombre}</p>
          <p className="text-[10px] text-gray-500">
            {row.vendedor_nombre}
            {row.analista_nombre !== '—' && ` · ${row.analista_nombre}`}
          </p>
        </div>
        <span
          className="text-[12px] font-black px-2.5 py-1 rounded-lg flex-shrink-0"
          style={{ background: colorBadge.bg, color: colorBadge.text }}
        >
          {signo} pts
        </span>
      </div>

      {/* Fila 2: ICP anterior → ICP actual */}
      <div className="flex items-center gap-2 mt-2 mb-2">
        <span className="text-[11px] font-bold text-gray-600 tabular-nums">
          ICP {row.icp_anterior}
        </span>
        <span className="text-gray-300">→</span>
        <span className="text-[14px] font-black tabular-nums" style={{ color: colorBorde }}>
          ICP {row.icp_actual}
        </span>
      </div>

      {/* Fila 3: métricas */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-gray-500">
        <span>
          Días ant.: <strong className="text-gray-700">{row.dias_anterior}d</strong>
        </span>
        <span>
          Días act.: <strong style={{ color: colorBorde }}>{row.dias_actual}d</strong>
        </span>
        {row.cartera_actual > 0 && (
          <span>
            En mora: <strong className="text-gray-700">{fmtCRC(row.cartera_actual)}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
