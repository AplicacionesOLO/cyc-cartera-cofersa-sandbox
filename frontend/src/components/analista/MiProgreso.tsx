// src/components/analista/MiProgreso.tsx
// Barras de progreso: gestiones del día y meta del mes (estimado).

import { fmtCRC } from '@/lib/utils/formato';
import type { KpisAnalistaDashboard } from '@/types/dashboard-analista';

interface Props {
  kpis: KpisAnalistaDashboard;
  metaGestionesDiarias: number;
}

export default function MiProgreso({ kpis, metaGestionesDiarias }: Props) {
  const pctGestiones = Math.min((kpis.gestiones_hoy / metaGestionesDiarias) * 100, 100);
  const pctMeta = Math.min(kpis.meta_pct, 100);

  const metaBarColor =
    kpis.meta_pct >= 80 ? 'bg-emerald-500' : kpis.meta_pct >= 50 ? 'bg-amber-500' : 'bg-[#009EE3]';

  const metaValorColor =
    kpis.meta_pct >= 80
      ? 'text-emerald-600'
      : kpis.meta_pct >= 50
        ? 'text-amber-600'
        : 'text-slate-700';

  return (
    <div
      className="bg-white border border-slate-200 rounded-lg p-3"
      style={{ borderTop: '3px solid #003B5C' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-[3px] h-4 bg-[#009EE3] rounded-full flex-shrink-0" />
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Mi Progreso</p>
      </div>

      {/* Gestiones hoy */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-slate-500">Gestiones hoy</span>
          <span className="font-semibold tabular-nums">
            {kpis.gestiones_hoy}/{metaGestionesDiarias}
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#009EE3] rounded-full transition-all"
            style={{ width: `${pctGestiones}%` }}
          />
        </div>
      </div>

      {/* Meta del mes (estimado) */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-slate-500">
            Meta del mes
            <span className="text-slate-400 ml-1">(est.)</span>
          </span>
          <span className={`font-semibold tabular-nums ${metaValorColor}`}>{kpis.meta_pct}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${metaBarColor}`}
            style={{ width: `${pctMeta}%` }}
          />
        </div>
        <p className="text-[9px] text-slate-400 mt-1 text-right tabular-nums">
          {fmtCRC(kpis.cobrado_mes_estimado)} de {fmtCRC(kpis.meta_individual)}
        </p>
      </div>

      {/* Clientes urgentes */}
      <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
        <span className="text-[10px] text-slate-500">Clientes urgentes (+60d)</span>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded tabular-nums ${
            kpis.clientes_urgentes > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {kpis.clientes_urgentes}
        </span>
      </div>
    </div>
  );
}
