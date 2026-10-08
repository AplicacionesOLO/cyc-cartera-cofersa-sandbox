// src/components/analista/DashboardResumen.tsx
// Columna izquierda del Dashboard Analista: KPIs + Cola del Día + Mis Promesas.
// La Cola del Día usa el mismo CarteraRow que Mi Cartera — misma lógica de prioridad.

import Link from 'next/link';
import { fmtCRC } from '@/lib/utils/formato';
import type { KpisAnalistaDashboard, PromesaPendiente } from '@/types/dashboard-analista';
import type { CarteraRow } from '@/lib/utils/cola-analista';

export interface DashboardResumenProps {
  kpis: KpisAnalistaDashboard;
  cola: CarteraRow[]; // solo pendientes (gestionado_hoy = false)
  promesas: PromesaPendiente[];
  hoyStr: string;
  montoRetenido: number;
  pedidosEnEspera: number;
}

// ── Colores por prioridad (mismo diseño que Mi Cartera) ───────────────
const PRIO_DOT: Record<CarteraRow['prioridad'], string> = {
  critico: '#dc2626',
  urgente: '#f59e0b',
  seguimiento: '#3b82f6',
  rutina: '#16a34a',
};

// Mapa a las 3 categorías del badge de cabecera
function prioToTier(p: CarteraRow['prioridad']): 'rojo' | 'ambar' | 'verde' {
  if (p === 'critico') return 'rojo';
  if (p === 'urgente') return 'ambar';
  return 'verde';
}

// Acción sugerida corta para la cola del dashboard
function accionLabel(row: CarteraRow): string {
  if (row.prioridad === 'critico') {
    if (row.promesa_activa && row.promesa_fecha) return 'Verificar promesa';
    return 'Llamar hoy';
  }
  if (row.prioridad === 'urgente') return 'Contactar pronto';
  if (row.prioridad === 'seguimiento') return 'Seguimiento';
  return 'Recordatorio';
}

// ── Componente principal ──────────────────────────────────────────────
export default function DashboardResumen({
  kpis,
  cola,
  promesas,
  hoyStr,
  montoRetenido,
  pedidosEnEspera,
}: DashboardResumenProps) {
  const colaVisible = cola.slice(0, 5);
  const colaRestantes = cola.length;
  const promVisible = promesas.slice(0, 4);
  const promRestantes = Math.max(0, promesas.length - 4);

  // Conteos por tier para los badges del encabezado
  const nRojo = cola.filter((r) => prioToTier(r.prioridad) === 'rojo').length;
  const nAmbar = cola.filter((r) => prioToTier(r.prioridad) === 'ambar').length;
  const nVerde = cola.filter((r) => prioToTier(r.prioridad) === 'verde').length;

  return (
    <div className="flex flex-col gap-4">
      {/* ── KPI Cards (5 tarjetas) ──────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {/* Card 1: Mi Cartera */}
        <KpiCard
          label="Mi Cartera"
          valor={fmtCRC(kpis.cartera_total)}
          badge={`${kpis.total_clientes} clientes`}
          badgeClass="bg-slate-100 text-slate-600"
          borderColor="#009EE3"
        />

        {/* Card 2: En Mora */}
        <KpiCard
          label="En Mora"
          valor={fmtCRC(kpis.mora_total)}
          badge={`${kpis.pct_mora}% de mi cartera`}
          badgeClass="bg-red-50 text-red-700 border border-red-200"
          borderColor="#ef4444"
        />

        {/* Card 3: Venc >30D / Cartera — % de mora vencida sobre la cartera del analista */}
        {(() => {
          const venc30 =
            Math.max(0, kpis.mora_31_60) +
            Math.max(0, kpis.mora_61_90) +
            Math.max(0, kpis.mora_91_120) +
            Math.max(0, kpis.mora_120_plus);
          const pct = kpis.cartera_total > 0 ? (venc30 / kpis.cartera_total) * 100 : 0;
          const accentColor = pct > 10 ? '#ea580c' : pct > 5 ? '#f59e0b' : '#16a34a';
          return (
            <KpiCard
              label="Venc >30D / Cartera"
              valor={`${pct.toFixed(1)}%`}
              badge={`${fmtCRC(venc30)} vencido`}
              badgeClass="bg-slate-100 text-slate-600"
              borderColor={accentColor}
            />
          );
        })()}

        {/* Card 4: Cobrado este mes — promesas cumplidas del mes en curso */}
        {(() => {
          const cobrado = kpis.cobrado_mes_estimado || 0;
          const meta = kpis.meta_individual || 0;
          const pct = meta > 0 ? Math.min(Math.round((cobrado / meta) * 100), 999) : 0;
          const accentColor = pct >= 80 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#009EE3';
          const badge = meta > 0 ? `${pct}% de meta` : 'sin meta definida';
          const badgeClass =
            pct >= 80
              ? 'bg-emerald-50 text-emerald-700'
              : pct >= 50
                ? 'bg-amber-50 text-amber-700'
                : 'bg-slate-100 text-slate-600';
          return (
            <KpiCard
              label="Cobrado este mes"
              valor={fmtCRC(cobrado)}
              valorClass={cobrado > 0 ? 'text-slate-900' : 'text-slate-400'}
              badge={badge}
              badgeClass={badgeClass}
              borderColor={accentColor}
            />
          );
        })()}

        {/* Card 5: Pedidos Retenidos */}
        <KpiCard
          label="Pedidos Retenidos"
          valor={fmtCRC(montoRetenido)}
          valorClass={montoRetenido > 0 ? 'text-slate-900' : 'text-slate-400'}
          badge={`${pedidosEnEspera} pedido${pedidosEnEspera !== 1 ? 's' : ''}`}
          badgeClass={
            pedidosEnEspera > 0
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-slate-100 text-slate-600'
          }
          borderColor={pedidosEnEspera > 0 ? '#dc2626' : '#16a34a'}
        />
      </div>

      {/* ── Cola del Día + Mis Promesas en grid ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4">
        {/* Cola del Día */}
        <div
          className="bg-white border border-slate-200 rounded-lg overflow-hidden"
          style={{ borderTop: '3px solid #003B5C' }}
        >
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-[3px] h-4 bg-[#009EE3] rounded-full flex-shrink-0" />
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Cola del Día
              </p>
            </div>
            {/* Badges ROJO / AMBAR / VERDE */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                {nRojo}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                {nAmbar}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                {nVerde}
              </span>
            </div>
          </div>

          {colaVisible.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-xs font-semibold text-emerald-600">
                ✓ Sin clientes pendientes en la cola
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Todos gestionados o sin mora activa</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-50">
                {colaVisible.map((row) => {
                  const dotColor = PRIO_DOT[row.prioridad];
                  const diasLabel =
                    row.dias_sin_gestion === 999
                      ? 'Sin gestiones registradas'
                      : row.dias_sin_gestion >= 7
                        ? `Sin contacto ${row.dias_sin_gestion} días`
                        : null;

                  return (
                    <Link
                      key={row.cliente_cod}
                      href={`/clientes/${encodeURIComponent(row.cliente_cod)}?from=mi-cartera`}
                      prefetch={false}
                      className="px-4 py-2.5 flex items-start gap-3 hover:bg-slate-50 transition-colors"
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                        style={{ background: dotColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-800 truncate">
                            {row.cliente_nombre || row.cliente_cod}
                          </p>
                          {row.mora_total > 0 && (
                            <p className="text-xs font-bold flex-shrink-0 tabular-nums text-slate-700">
                              {fmtCRC(row.mora_total)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-slate-400">{row.cliente_cod}</span>
                          <span className="text-[10px] text-slate-300">·</span>
                          <span className="text-[10px] text-slate-500">{accionLabel(row)}</span>
                          {diasLabel && (
                            <>
                              <span className="text-[10px] text-slate-300">·</span>
                              <span className="text-[10px] font-semibold text-red-500">
                                {diasLabel}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              {colaRestantes > 5 && (
                <div className="px-4 py-2 border-t border-slate-100 text-center">
                  <Link
                    href="/mi-cartera"
                    className="text-[10px] text-[#009EE3] font-semibold hover:underline"
                  >
                    Ver los {colaRestantes} clientes →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>

        {/* Mis Promesas */}
        <div
          className="bg-white border border-slate-200 rounded-lg overflow-hidden"
          style={{ borderTop: '3px solid #003B5C' }}
        >
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <div className="w-[3px] h-4 bg-amber-400 rounded-full flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Mis Promesas
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {kpis.promesas_activas} pendientes
              </p>
            </div>
          </div>

          {promVisible.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-xs text-slate-500">No hay compromisos de pago pendientes.</p>
            </div>
          ) : (
            <>
              <div className="p-3 space-y-2">
                {promVisible.map((p) => {
                  const venceHoy = p.fecha_promesa === hoyStr;
                  const vencida = p.fecha_promesa < hoyStr && p.estado === 'PENDIENTE';
                  const bgClass =
                    vencida || venceHoy
                      ? 'bg-red-50 border-red-200'
                      : 'bg-slate-50 border-slate-100';
                  const badge = vencida ? 'VENCIDA' : venceHoy ? 'HOY' : null;
                  const badgeCls = vencida
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700';

                  return (
                    <div key={p.id} className={`rounded-lg px-3 py-2 border ${bgClass}`}>
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-semibold text-slate-800 truncate flex-1">
                          {p.cliente_nombre || p.cliente_cod}
                        </p>
                        {badge && (
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${badgeCls}`}
                          >
                            {badge}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[10px] text-slate-400">{p.fecha_promesa}</p>
                        <p className="text-xs font-bold text-slate-700 tabular-nums">
                          {fmtCRC(p.monto)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {promRestantes > 0 && (
                <div className="px-4 py-2 border-t border-slate-100 text-center">
                  <Link
                    href="/promesas"
                    className="text-[10px] text-[#009EE3] font-semibold hover:underline"
                  >
                    Ver todas →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────
function KpiCard({
  label,
  valor,
  valorClass = 'text-slate-900',
  badge,
  badgeClass,
  borderColor = '#009EE3',
}: {
  label: string;
  valor: string;
  valorClass?: string;
  badge: string;
  badgeClass: string;
  borderColor?: string;
}) {
  return (
    <div
      className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4 text-center"
      style={{ borderTop: '3px solid #003B5C' }}
    >
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums mb-2 leading-tight ${valorClass}`}>{valor}</p>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${badgeClass}`}>{badge}</span>
    </div>
  );
}
