'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, Clock, ChevronDown } from 'lucide-react';
import { useSincronizacionController } from '@/views/sincronizacion/hooks/use-sincronizacion-controller';
import type { SyncRow } from '@/views/sincronizacion/types';

interface CicloRow {
  hora: string;
  pagos?: SyncRow;
  cartera?: SyncRow;
  facturas?: SyncRow;
  saldos?: SyncRow;
  pedidos_retenidos?: SyncRow;
  hasError: boolean;
  ejecutor: string;
}

// ── Configuración visual por tipo ─────────────────────────────────────────────
const TIPO_CFG = {
  pagos: { label: 'Pagos', color: '#003B5C', bg: '#E6EEF4', btnColor: '#009ee3' },
  cartera: { label: 'Cartera', color: '#059669', bg: '#ECFDF5', btnColor: '#059669' },
  facturas: { label: 'Facturas', color: '#7c3aed', bg: '#F5F3FF', btnColor: '#7c3aed' },
  saldos_favor: { label: 'Saldos a Favor', color: '#d97706', bg: '#FFF7ED', btnColor: '#d97706' },
  pedidos_retenidos: {
    label: '📦 Pedidos Retenidos',
    color: '#ea580c',
    bg: '#FFF3ED',
    btnColor: '#ea580c',
  },
} as const;

const TIPOS_ORDEN = ['pagos', 'cartera', 'facturas', 'saldos_favor', 'pedidos_retenidos'] as const;

// ── Helpers hora Costa Rica (UTC-6) ───────────────────────────────────────────
function nowCR() {
  return new Date(Date.now() - 6 * 3600_000);
}

function fmtDayCR(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 3600_000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}
function fmtTimeCR(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function fmtCR(iso: string) {
  return `${fmtDayCR(iso)} ${fmtTimeCR(iso)}`;
}

function hoyCR(): string {
  const d = nowCR();
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

function getNextCycle(): { hora: string; mins: number } | null {
  const d = nowCR();
  const h = d.getUTCHours(),
    m = d.getUTCMinutes();
  if (h < 7 || (h === 17 && m >= 5) || h >= 18) return null;
  const nextH = m < 5 ? h : h + 1;
  if (nextH > 17) return null;
  return { hora: `${String(nextH).padStart(2, '0')}:05`, mins: nextH * 60 + 5 - (h * 60 + m) };
}

function badgeEjecutor(por: string) {
  const auto = por === 'pg_cron' || por === 'n8n' || por === 'n8n-automatico';
  return auto ? (
    <span
      style={{
        background: '#e0f2fe',
        color: '#0369a1',
        padding: '1px 6px',
        borderRadius: '3px',
        fontSize: '10px',
        fontWeight: 600,
      }}
    >
      Automático
    </span>
  ) : (
    <span style={{ fontSize: '11px', color: '#64748b' }}>{por}</span>
  );
}

// ── Agrupa filas de sync_log por día → ciclo (mismo minuto) ──────────────────
function buildCiclosByDay(rows: SyncRow[]): Record<string, Record<string, CicloRow>> {
  const byDay: Record<string, Record<string, CicloRow>> = {};
  for (const row of rows) {
    const day = fmtDayCR(row.ejecutado_en);
    const hora = fmtTimeCR(row.ejecutado_en);
    if (!byDay[day]) byDay[day] = {};
    if (!byDay[day][hora]) byDay[day][hora] = { hora, hasError: false, ejecutor: '' };
    const c = byDay[day][hora];
    if (row.tipo === 'pagos') c.pagos = row;
    if (row.tipo === 'cartera') c.cartera = row;
    if (row.tipo === 'facturas') c.facturas = row;
    if (row.tipo === 'saldos_favor') c.saldos = row;
    if (row.tipo === 'pedidos_retenidos') c.pedidos_retenidos = row;
    if (row.error) c.hasError = true;
    if (!c.ejecutor) c.ejecutor = row.ejecutado_por;
  }
  return byDay;
}

// ── Estilos de celdas de tabla ─────────────────────────────────────────────────
const TH: React.CSSProperties = {
  padding: '7px 12px',
  fontSize: '10px',
  fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  background: '#f8fafc',
};
const THR: React.CSSProperties = { ...TH, textAlign: 'right' };
const TD: React.CSSProperties = { padding: '6px 12px', fontSize: '12px', color: '#374151' };
const TDR: React.CSSProperties = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const SYNC_PHASES = ['Consultando N8N...', 'Cargando pagos frescos...', 'Procesando pagos...'];

export default function TabSincronizacion() {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [countdown, setCountdown] = useState<{ hora: string; mins: number } | null>(null);

  // Auto-expandir el día más reciente cada vez que se carga el historial
  const onHistorial = useCallback((rows: SyncRow[]) => {
    if (rows.length > 0) {
      setExpandedDays(new Set([fmtDayCR(rows[0].ejecutado_en)]));
    }
  }, []);

  // Historial (GET /sync/historial) + acciones manuales (POST /sync/*; Pagos y Pedidos Retenidos
  // se encolan y el controller espera la fila nueva de sync_log)
  const {
    historial,
    loading,
    syncing,
    phase,
    resultado,
    syncingCartera,
    resultadoCartera,
    syncingFacturas,
    resultadoFacturas,
    syncingSaldos,
    resultadoSaldos,
    syncingPedidos,
    resultadoPedidos,
    handleSync,
    handleSyncCartera,
    handleSyncFacturas,
    handleSyncSaldos,
    handleSyncPedidos,
  } = useSincronizacionController(onHistorial);

  // Countdown — actualiza cada 30 seg
  useEffect(() => {
    const update = () => setCountdown(getNextCycle());
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  const toggleDay = (day: string) =>
    setExpandedDays((prev) => {
      const n = new Set(prev);
      n.has(day) ? n.delete(day) : n.add(day);
      return n;
    });

  // ── Datos derivados ────────────────────────────────────────────────────────
  const ciclosByDay = buildCiclosByDay(historial);
  // Ordenar por fecha REAL descendente (hoy primero). Las claves son 'DD/MM/YYYY',
  // que como texto no respetan el orden cronológico (ni el cruce de mes).
  const dayKeys = Object.keys(ciclosByDay).sort((a, b) => {
    const [da, ma, ya] = a.split('/');
    const [db, mb, yb] = b.split('/');
    return `${yb}${mb}${db}`.localeCompare(`${ya}${ma}${da}`);
  });
  const todayKey = hoyCR();
  const todayCiclos = Object.values(ciclosByDay[todayKey] ?? {});
  const todayErrors = todayCiclos.filter((c) => c.hasError).length;
  const lastByTipo = Object.fromEntries(
    TIPOS_ORDEN.map((t) => [t, historial.find((r) => r.tipo === t)]),
  );

  // ── Componente de resultado inline ────────────────────────────────────────
  function ResultBadge({ r }: { r: { ok: boolean; msg: string } }) {
    return (
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-medium mt-2 leading-snug"
        style={
          r.ok
            ? { background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }
            : { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }
        }
      >
        {r.ok ? (
          <CheckCircle2 size={11} className="flex-shrink-0" />
        ) : (
          <AlertCircle size={11} className="flex-shrink-0" />
        )}
        {r.msg}
      </div>
    );
  }

  // ── Acción manual por tipo (handler + estado de carga + resultado) ───────
  const ACCIONES: Record<
    (typeof TIPOS_ORDEN)[number],
    {
      onClick: () => void;
      syncing: boolean;
      resultado: { ok: boolean; msg: string } | null;
      label: string;
      labelLoading: string;
    }
  > = {
    pagos: {
      onClick: handleSync,
      syncing: syncing,
      resultado: resultado,
      label: 'Sincronizar pagos',
      labelLoading: SYNC_PHASES[phase],
    },
    cartera: {
      onClick: handleSyncCartera,
      syncing: syncingCartera,
      resultado: resultadoCartera,
      label: 'Sincronizar',
      labelLoading: 'Registrando...',
    },
    facturas: {
      onClick: handleSyncFacturas,
      syncing: syncingFacturas,
      resultado: resultadoFacturas,
      label: 'Sincronizar',
      labelLoading: 'Registrando...',
    },
    saldos_favor: {
      onClick: handleSyncSaldos,
      syncing: syncingSaldos,
      resultado: resultadoSaldos,
      label: 'Sincronizar',
      labelLoading: 'Registrando...',
    },
    pedidos_retenidos: {
      onClick: handleSyncPedidos,
      syncing: syncingPedidos,
      resultado: resultadoPedidos,
      label: '⚡ Sincronizar ahora',
      labelLoading: 'Sincronizando...',
    },
  };

  return (
    <div className="grid grid-cols-12 gap-6 items-start">
      {/* ── COLUMNA IZQUIERDA (9/12): tarjetas de acción + historial ──────── */}
      <div className="col-span-9 flex flex-col gap-6">
        {/* Tarjetas de acción KPI: estado + botón manual integrados */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
            Estado y sincronización manual
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {TIPOS_ORDEN.map((tipo) => {
              const cfg = TIPO_CFG[tipo];
              const last = lastByTipo[tipo];
              const accion = ACCIONES[tipo];
              return (
                <div
                  key={tipo}
                  className="bg-white border border-slate-100 rounded-xl p-3.5 flex flex-col justify-between h-full"
                  style={{ borderTop: `3px solid ${cfg.color}` }}
                >
                  <div>
                    <p
                      className="text-[10px] font-bold uppercase tracking-wider mb-2"
                      style={{ color: cfg.color }}
                    >
                      {cfg.label}
                    </p>
                    {last ? (
                      <>
                        <p className="text-[15px] font-black tabular-nums text-gray-800 leading-tight">
                          {Number(last.total_tabla).toLocaleString('es-CR')}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                          {fmtCR(last.ejecutado_en)}
                        </p>
                        <span
                          className="inline-block mt-2 text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={
                            last.error
                              ? { background: '#fee2e2', color: '#dc2626' }
                              : { background: '#dcfce7', color: '#16a34a' }
                          }
                        >
                          {last.error ? 'ERROR' : '✓ OK'}
                        </span>
                      </>
                    ) : (
                      <p className="text-[11px] text-gray-300 mt-1">Sin registros aún</p>
                    )}
                  </div>

                  <div className="border-t border-slate-100 mt-3 pt-3">
                    <button
                      onClick={accion.onClick}
                      disabled={accion.syncing}
                      className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] font-bold transition disabled:opacity-60"
                      style={{
                        background: cfg.bg,
                        color: cfg.btnColor,
                        cursor: accion.syncing ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <RefreshCw
                        size={11}
                        className={accion.syncing ? 'animate-spin flex-shrink-0' : 'flex-shrink-0'}
                      />
                      <span className="truncate">
                        {accion.syncing ? accion.labelLoading : accion.label}
                      </span>
                    </button>
                    {accion.resultado && <ResultBadge r={accion.resultado} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── HISTORIAL — una fila por ciclo ─────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
            Historial de sincronizaciones
          </p>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white border rounded-xl h-12 animate-pulse" />
              ))}
            </div>
          ) : dayKeys.length === 0 ? (
            <p className="text-[12px] text-gray-400 text-center py-8">Sin registros aún.</p>
          ) : (
            <div className="space-y-2">
              {dayKeys.map((day) => {
                const ciclos = Object.values(ciclosByDay[day]).sort((a, b) =>
                  b.hora.localeCompare(a.hora),
                );
                const hasErr = ciclos.some((c) => c.hasError);
                const isOpen = expandedDays.has(day);
                const isToday = day === todayKey;

                return (
                  <div
                    key={day}
                    className="bg-white border border-slate-100 rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() => toggleDay(day)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="text-[13px] font-bold text-gray-800 tabular-nums">
                          {isToday ? <span className="text-[#009ee3]">Hoy</span> : day}
                          {isToday && (
                            <span className="text-gray-400 font-normal ml-2 text-[11px]">
                              {day}
                            </span>
                          )}
                        </p>
                        <span className="text-[11px] text-gray-400">
                          {ciclos.length} ciclo{ciclos.length !== 1 ? 's' : ''}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded`}
                          style={
                            hasErr
                              ? { background: '#fee2e2', color: '#dc2626' }
                              : { background: '#dcfce7', color: '#16a34a' }
                          }
                        >
                          {hasErr ? 'CON ERRORES' : 'TODO OK'}
                        </span>
                      </div>
                      <ChevronDown
                        size={14}
                        className="text-gray-400 transition-transform duration-200 flex-shrink-0"
                        style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      />
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-100 overflow-x-auto">
                        <table
                          style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}
                        >
                          <thead>
                            <tr>
                              <th style={TH}>Hora</th>
                              <th style={{ ...THR, color: TIPO_CFG.pagos.color }}>Pagos</th>
                              <th style={{ ...THR, color: '#16a34a' }}>+ Nuevos</th>
                              <th style={{ ...THR, color: TIPO_CFG.cartera.color }}>Cartera</th>
                              <th style={{ ...THR, color: TIPO_CFG.facturas.color }}>Facturas</th>
                              <th style={{ ...THR, color: TIPO_CFG.saldos_favor.color }}>Saldos</th>
                              <th style={{ ...THR, color: TIPO_CFG.pedidos_retenidos.color }}>
                                Pedidos
                              </th>
                              <th style={TH}>Ejecutor</th>
                              <th style={THR}>Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ciclos.map((ciclo, i) => (
                              <tr
                                key={ciclo.hora}
                                style={{
                                  borderTop: '1px solid #f1f5f9',
                                  background: i % 2 === 1 ? '#fafafa' : 'white',
                                }}
                              >
                                <td style={TD}>
                                  <span
                                    style={{
                                      fontFamily: 'monospace',
                                      fontWeight: 700,
                                      color: '#374151',
                                    }}
                                  >
                                    {ciclo.hora}
                                  </span>
                                </td>
                                <td style={TDR}>
                                  {ciclo.pagos ? (
                                    Number(ciclo.pagos.total_tabla).toLocaleString('es-CR')
                                  ) : (
                                    <span style={{ color: '#cbd5e1' }}>—</span>
                                  )}
                                </td>
                                <td style={TDR}>
                                  {ciclo.pagos ? (
                                    ciclo.pagos.insertados > 0 ? (
                                      <span style={{ color: '#16a34a', fontWeight: 700 }}>
                                        +{ciclo.pagos.insertados.toLocaleString('es-CR')}
                                      </span>
                                    ) : (
                                      <span style={{ color: '#94a3b8' }}>0</span>
                                    )
                                  ) : (
                                    <span style={{ color: '#cbd5e1' }}>—</span>
                                  )}
                                </td>
                                <td style={TDR}>
                                  {ciclo.cartera ? (
                                    Number(ciclo.cartera.total_tabla).toLocaleString('es-CR')
                                  ) : (
                                    <span style={{ color: '#cbd5e1' }}>—</span>
                                  )}
                                </td>
                                <td style={TDR}>
                                  {ciclo.facturas ? (
                                    Number(ciclo.facturas.total_tabla).toLocaleString('es-CR')
                                  ) : (
                                    <span style={{ color: '#cbd5e1' }}>—</span>
                                  )}
                                </td>
                                <td style={TDR}>
                                  {ciclo.saldos ? (
                                    Number(ciclo.saldos.total_tabla).toLocaleString('es-CR')
                                  ) : (
                                    <span style={{ color: '#cbd5e1' }}>—</span>
                                  )}
                                </td>
                                <td style={TDR}>
                                  {ciclo.pedidos_retenidos ? (
                                    Number(ciclo.pedidos_retenidos.total_tabla).toLocaleString(
                                      'es-CR',
                                    )
                                  ) : (
                                    <span style={{ color: '#cbd5e1' }}>—</span>
                                  )}
                                </td>
                                <td style={TD}>{badgeEjecutor(ciclo.ejecutor)}</td>
                                <td style={{ ...TDR, paddingRight: '16px' }}>
                                  {ciclo.hasError ? (
                                    <span
                                      style={{
                                        fontSize: '10px',
                                        background: '#fee2e2',
                                        color: '#dc2626',
                                        padding: '2px 7px',
                                        borderRadius: '3px',
                                        fontWeight: 700,
                                      }}
                                    >
                                      ERROR
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: '10px',
                                        background: '#dcfce7',
                                        color: '#16a34a',
                                        padding: '2px 7px',
                                        borderRadius: '3px',
                                        fontWeight: 700,
                                      }}
                                    >
                                      OK
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── COLUMNA DERECHA (3/12): sidebar de estado ──────────────────────── */}
      <div className="col-span-3 flex flex-col gap-4">
        {/* Próximo ciclo */}
        <div className="bg-white border border-slate-100 rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Clock size={12} className="text-gray-400" />
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Próximo ciclo automático
            </p>
          </div>
          {countdown ? (
            <div>
              <p className="text-3xl font-black tabular-nums text-gray-800 leading-none">
                {countdown.hora}
              </p>
              <p className="text-[12px] text-gray-400 mt-1">
                en {countdown.mins} min · hora Costa Rica
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[13px] font-semibold text-gray-400">Fuera de horario</p>
              <p className="text-[11px] text-gray-300 mt-0.5">7:05am – 5:05pm · L–V</p>
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Ciclos hoy</span>
              <span className="text-[13px] font-bold tabular-nums text-gray-700">
                {todayCiclos.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Estado del día</span>
              {loading ? (
                <span className="text-[11px] text-gray-300">—</span>
              ) : todayErrors > 0 ? (
                <span className="text-[11px] font-bold text-red-600">
                  {todayErrors} error{todayErrors > 1 ? 'es' : ''}
                </span>
              ) : (
                <span className="text-[11px] font-bold text-green-600">Todo OK</span>
              )}
            </div>
          </div>
        </div>

        {/* Info horario */}
        <div
          className="rounded-xl px-4 py-3"
          style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}
        >
          <p
            className="text-[10px] font-bold uppercase tracking-wider mb-2"
            style={{ color: '#1D4ED8' }}
          >
            Sincronizaciones automáticas N8N
          </p>
          <div className="space-y-1">
            <p className="text-[11px]" style={{ color: '#1E40AF' }}>
              <span className="font-semibold">Pagos:</span> N8N :00 → pg_cron :05
            </p>
            <p className="text-[11px]" style={{ color: '#1E40AF' }}>
              <span className="font-semibold">Cartera · Facturas · Saldos:</span> N8N directo →
              pg_cron :05
            </p>
            <p className="text-[11px]" style={{ color: '#9a3412' }}>
              <span className="font-semibold">Pedidos Retenidos:</span> manual por ahora (a la
              espera del flujo N8N para este dataset)
            </p>
            <p className="text-[11px] mt-1.5" style={{ color: '#3B82F6' }}>
              Lunes a viernes · 7:05am – 5:05pm (CR)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
