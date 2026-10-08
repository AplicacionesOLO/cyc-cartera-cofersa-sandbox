// src/components/analista/PorVendedor.tsx
// Tabla de aging por vendedor — una fila por vendedor con los 6 tramos + cartera.

import Link from 'next/link';
import { fmtCRC } from '@/lib/utils/formato';
import type { VendedorResumen } from '@/types/dashboard-analista';

interface Props {
  vendedores: VendedorResumen[];
}

/** Muestra un monto completo o un guión si el valor es 0 */
function MontoCell({ v, color }: { v: number; color: string }) {
  if (v <= 0) return <span className="text-slate-300">—</span>;
  return (
    <span style={{ color }} className="font-semibold tabular-nums">
      {fmtCRC(v)}
    </span>
  );
}

const COL_COLORS = {
  aldia: '#16a34a', // green-600
  t1_30: '#d97706', // amber-600
  t31_60: '#ea580c', // orange-600
  t61_90: '#ef4444', // red-500
  t91_120: '#dc2626', // red-600
  t120p: '#991b1b', // red-800
};

export default function PorVendedor({ vendedores }: Props) {
  if (vendedores.length === 0) {
    return (
      <div
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
        style={{ borderTop: '3px solid #003B5C' }}
      >
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <div className="w-[3px] h-4 bg-[#009EE3] rounded-full flex-shrink-0" />
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Por Vendedor</p>
        </div>
        <div className="px-4 py-8 text-center">
          <p className="text-xs text-slate-500">Sin datos de vendedores disponibles.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      style={{ borderTop: '3px solid #003B5C' }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-[3px] h-4 bg-[#009EE3] rounded-full flex-shrink-0" />
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Por Vendedor</p>
        </div>
        <Link
          href="/mi-cartera"
          className="text-[10px] text-[#009EE3] font-semibold hover:underline"
        >
          Ver Mi Cartera →
        </Link>
      </div>

      {/* Tabla con scroll horizontal en pantallas pequeñas */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-4 py-2 text-left font-semibold text-slate-400 uppercase tracking-[0.4px] whitespace-nowrap">
                Vendedor
              </th>
              <th className="px-3 py-2 text-right font-semibold text-slate-400 uppercase tracking-[0.4px] whitespace-nowrap">
                Cartera
              </th>
              <th
                className="px-3 py-2 text-right font-semibold uppercase tracking-[0.4px] whitespace-nowrap"
                style={{ color: COL_COLORS.aldia }}
              >
                Al día
              </th>
              <th
                className="px-3 py-2 text-right font-semibold uppercase tracking-[0.4px] whitespace-nowrap"
                style={{ color: COL_COLORS.t1_30 }}
              >
                1-30d
              </th>
              <th
                className="px-3 py-2 text-right font-semibold uppercase tracking-[0.4px] whitespace-nowrap"
                style={{ color: COL_COLORS.t31_60 }}
              >
                31-60d
              </th>
              <th
                className="px-3 py-2 text-right font-semibold uppercase tracking-[0.4px] whitespace-nowrap"
                style={{ color: COL_COLORS.t61_90 }}
              >
                61-90d
              </th>
              <th
                className="px-3 py-2 text-right font-semibold uppercase tracking-[0.4px] whitespace-nowrap"
                style={{ color: COL_COLORS.t91_120 }}
              >
                91-120d
              </th>
              <th
                className="px-3 py-2 text-right font-semibold uppercase tracking-[0.4px] whitespace-nowrap"
                style={{ color: COL_COLORS.t120p }}
              >
                +120d
              </th>
              <th className="px-3 py-2 text-right font-semibold text-slate-500 uppercase tracking-[0.4px] whitespace-nowrap">
                Mora Total
              </th>
              <th className="px-4 py-2 text-right font-semibold text-slate-400 uppercase tracking-[0.4px] whitespace-nowrap">
                % Mora
              </th>
            </tr>
          </thead>
          <tbody>
            {vendedores.map((v, i) => (
              <tr
                key={v.vendedor_cod}
                className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i % 2 === 1 ? 'bg-slate-50/40' : ''}`}
              >
                {/* Nombre del vendedor */}
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <p className="text-xs font-semibold text-slate-800 leading-tight">
                    {v.vendedor_nombre}
                  </p>
                </td>

                {/* Cartera */}
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <span className="text-slate-600 font-semibold tabular-nums">
                    {fmtCRC(v.cartera_total)}
                  </span>
                </td>

                {/* Al día */}
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <MontoCell v={v.no_vencido} color={COL_COLORS.aldia} />
                </td>

                {/* 1-30d */}
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <MontoCell v={v.mora_tramo_1_30} color={COL_COLORS.t1_30} />
                </td>

                {/* 31-60d */}
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <MontoCell v={v.mora_tramo_31_60} color={COL_COLORS.t31_60} />
                </td>

                {/* 61-90d */}
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <MontoCell v={v.mora_tramo_61_90} color={COL_COLORS.t61_90} />
                </td>

                {/* 91-120d */}
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <MontoCell v={v.mora_tramo_91_120} color={COL_COLORS.t91_120} />
                </td>

                {/* +120d */}
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <MontoCell v={v.mora_tramo_120_plus} color={COL_COLORS.t120p} />
                </td>

                {/* Mora Total */}
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <span className="text-xs font-bold tabular-nums text-slate-800">
                    {fmtCRC(v.mora_total)}
                  </span>
                </td>

                {/* % Mora — badge con color semáforo */}
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums ${
                      v.pct_mora >= 40
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : v.pct_mora >= 20
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {v.pct_mora}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>

          {/* Totales */}
          {vendedores.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Total
                </td>
                {/* Cartera total */}
                <td className="px-3 py-2 text-right">
                  <span className="text-[11px] font-bold tabular-nums text-slate-600">
                    {fmtCRC(vendedores.reduce((s, v) => s + v.cartera_total, 0))}
                  </span>
                </td>
                {/* Al día */}
                <td className="px-3 py-2 text-right">
                  <span
                    className="text-[11px] font-bold tabular-nums"
                    style={{ color: COL_COLORS.aldia }}
                  >
                    {fmtCRC(vendedores.reduce((s, v) => s + v.no_vencido, 0))}
                  </span>
                </td>
                {/* 1-30d */}
                <td className="px-3 py-2 text-right">
                  <span
                    className="text-[11px] font-bold tabular-nums"
                    style={{ color: COL_COLORS.t1_30 }}
                  >
                    {fmtCRC(vendedores.reduce((s, v) => s + v.mora_tramo_1_30, 0))}
                  </span>
                </td>
                {/* 31-60d */}
                <td className="px-3 py-2 text-right">
                  <span
                    className="text-[11px] font-bold tabular-nums"
                    style={{ color: COL_COLORS.t31_60 }}
                  >
                    {fmtCRC(vendedores.reduce((s, v) => s + v.mora_tramo_31_60, 0))}
                  </span>
                </td>
                {/* 61-90d */}
                <td className="px-3 py-2 text-right">
                  <span
                    className="text-[11px] font-bold tabular-nums"
                    style={{ color: COL_COLORS.t61_90 }}
                  >
                    {fmtCRC(vendedores.reduce((s, v) => s + v.mora_tramo_61_90, 0))}
                  </span>
                </td>
                {/* 91-120d */}
                <td className="px-3 py-2 text-right">
                  <span
                    className="text-[11px] font-bold tabular-nums"
                    style={{ color: COL_COLORS.t91_120 }}
                  >
                    {fmtCRC(vendedores.reduce((s, v) => s + v.mora_tramo_91_120, 0))}
                  </span>
                </td>
                {/* +120d */}
                <td className="px-3 py-2 text-right">
                  <span
                    className="text-[11px] font-bold tabular-nums"
                    style={{ color: COL_COLORS.t120p }}
                  >
                    {fmtCRC(vendedores.reduce((s, v) => s + v.mora_tramo_120_plus, 0))}
                  </span>
                </td>
                {/* Mora Total */}
                <td className="px-3 py-2 text-right">
                  <span className="text-xs font-black tabular-nums text-slate-900">
                    {fmtCRC(vendedores.reduce((s, v) => s + v.mora_total, 0))}
                  </span>
                </td>
                {/* % Mora total */}
                <td className="px-4 py-2 text-right">
                  {(() => {
                    const totMora = vendedores.reduce((s, v) => s + v.mora_total, 0);
                    const totCartera = vendedores.reduce((s, v) => s + v.cartera_total, 0);
                    const pct =
                      totCartera > 0 ? Math.round((totMora / totCartera) * 100 * 10) / 10 : 0;
                    return (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums ${
                          pct >= 40
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : pct >= 20
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {pct}%
                      </span>
                    );
                  })()}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
