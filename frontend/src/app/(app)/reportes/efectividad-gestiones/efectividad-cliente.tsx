'use client';

import { useState } from 'react';
import { useEfectividadController } from '@/views/reportes/hooks/use-efectividad-controller';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts';
import {
  Activity,
  Users,
  TrendingUp,
  MessageSquare,
  Calendar,
  Download,
  RefreshCw,
} from 'lucide-react';
import type {
  EfectividadResult,
  EfectividadAnalista,
  EfectividadTipo,
  EfectividadResultado,
} from '@/types/reportes';
import { exportTablaExcel } from '@/lib/reportes/export-tabla';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n: number, d: number) {
  if (!d) return '0.0%';
  return `${((n / d) * 100).toFixed(1)}%`;
}

function hoyISO(): string {
  return new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
}

function primerDiaMes(): string {
  const cr = new Date(Date.now() - 6 * 3600_000);
  return `${cr.getUTCFullYear()}-${String(cr.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function fmtDia(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function nombreCorto(s: string) {
  if (s.includes('@')) return s.split('@')[0].replace(/\./g, ' ');
  const p = s.trim().split(/\s+/);
  return p.length >= 2 ? `${p[0]} ${p[p.length - 1]}` : p[0];
}

// ── Paleta de canales ─────────────────────────────────────────────────────────

const CANAL_COLOR: Record<string, string> = {
  WHATSAPP: '#22c55e',
  CORREO: '#009ee3',
  LLAMADA: '#f59e0b',
  VISITA: '#8b5cf6',
  INTERNA: '#94a3b8',
};
const CANAL_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  CORREO: 'Correo',
  LLAMADA: 'Llamada',
  VISITA: 'Visita',
  INTERNA: 'Interna',
};

// Resultados que cuentan como compromiso (nombres actuales + legacy para datos históricos)
const COMPROMISOS_SET = new Set([
  'Compromiso de pago confirmado',
  'Solicitud de convenio',
  'Pago Reportado (Por Verificar)',
  // legacy
  'Cliente indica pago realizado',
  'Pagó',
  'Aceptó convenio',
  'Promesa OK',
]);
// Resultados sin contacto real (nombres actuales + legacy)
const NO_CONTACTO_SET = new Set([
  'No contestó',
  'Número ocupado',
  'Sin respuesta',
  'No localizado',
  'Local cerrado',
  'Contacto inválido',
  'Correo inválido',
  // legacy
  'No ubicado',
  'Pendiente',
]);

// ── Sub-componentes ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div
      className="bg-white rounded-xl p-4 flex items-center gap-4"
      style={{ border: '1px solid #e2e8f0' }}
    >
      <div
        className="flex-shrink-0 rounded-xl flex items-center justify-center"
        style={{ width: 44, height: 44, background: `${accent}18` }}
      >
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide leading-none">
          {label}
        </p>
        <p className="text-[24px] font-black text-gray-900 leading-none mt-1 tabular-nums">
          {value}
        </p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{sub}</p>}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip(p: any) {
  if (!p.active || !p.payload?.length) return null;
  const title: string = p.label ?? p.payload[0]?.name ?? '';
  return (
    <div
      className="bg-white rounded-xl shadow-lg p-3 text-[12px]"
      style={{ border: '1px solid #e2e8f0' }}
    >
      {title && <p className="font-bold text-gray-700 mb-1.5">{title}</p>}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(p.payload as any[]).map((e: any) => (
        <div key={e.name} className="flex items-center gap-2 mt-0.5">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: e.color ?? e.fill }}
          />
          <span className="text-gray-500">{e.name}:</span>
          <span className="font-bold text-gray-800 tabular-nums">{e.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function EfectividadCliente() {
  const [ini, setIni] = useState(primerDiaMes);
  const [fin, setFin] = useState(hoyISO);
  const { data, loading, error, cargado, fetchData } = useEfectividadController();

  function handleExportExcel() {
    if (!data) return;
    exportTablaExcel({
      nombreArchivo: `efectividad-gestiones-${ini}-${fin}`,
      titulo: `Efectividad de Gestiones · ${ini} al ${fin}`,
      meta: [
        { label: 'Total gestiones', value: String(data.kpis.total) },
        {
          label: 'Compromisos',
          value: `${data.kpis.compromisos} (${pct(data.kpis.compromisos, data.kpis.total)})`,
        },
        { label: 'Clientes', value: String(data.kpis.clientes_gestionados) },
      ],
      columnas: [
        { key: 'analista_nombre', label: 'Analista', format: 'text', width: 28 },
        { key: 'total', label: 'Total', format: 'int', width: 10 },
        { key: 'compromisos', label: 'Compromisos', format: 'int', width: 14 },
        { key: 'tasa_pct', label: 'Tasa %', format: 'pct', width: 10 },
        { key: 'clientes_gestionados', label: 'Clientes', format: 'int', width: 12 },
        { key: 'whatsapps', label: 'WhatsApp', format: 'int', width: 12 },
        { key: 'correos', label: 'Correo', format: 'int', width: 10 },
        { key: 'llamadas', label: 'Llamada', format: 'int', width: 10 },
        { key: 'visitas', label: 'Visita', format: 'int', width: 10 },
        { key: 'dias_activos', label: 'Días activos', format: 'int', width: 14 },
      ],
      filas: data.por_analista.map((a: EfectividadAnalista) => ({
        ...a,
        tasa_pct: a.total > 0 ? parseFloat(((a.compromisos / a.total) * 100).toFixed(2)) : 0,
      })),
      totales: {
        analista_nombre: 'TOTAL',
        total: data.kpis.total,
        compromisos: data.kpis.compromisos,
        tasa_pct: parseFloat(((data.kpis.compromisos / data.kpis.total) * 100).toFixed(2)),
        clientes_gestionados: data.kpis.clientes_gestionados,
      },
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* ── Controles ──────────────────────────────────────────── */}
      <div
        className="bg-white rounded-xl px-5 py-4 flex flex-wrap items-center gap-4"
        style={{ border: '1px solid #e2e8f0' }}
      >
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-gray-400 flex-shrink-0" />
          <span className="text-[12px] font-semibold text-gray-500">Desde</span>
          <input
            type="date"
            value={ini}
            onChange={(e) => setIni(e.target.value)}
            className="text-[13px] font-medium text-gray-800 rounded-lg px-3 py-1.5"
            style={{ border: '1px solid #e2e8f0', outline: 'none' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-gray-500">Hasta</span>
          <input
            type="date"
            value={fin}
            onChange={(e) => setFin(e.target.value)}
            className="text-[13px] font-medium text-gray-800 rounded-lg px-3 py-1.5"
            style={{ border: '1px solid #e2e8f0', outline: 'none' }}
          />
        </div>
        <button
          onClick={() => fetchData(ini, fin)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: '#003B5C' }}
        >
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Activity size={14} />}
          {loading ? 'Cargando…' : 'Generar'}
        </button>

        {cargado && (
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors hover:bg-gray-50 ml-auto"
            style={{ border: '1px solid #e2e8f0', color: '#64748b' }}
          >
            <Download size={13} /> Excel
          </button>
        )}
      </div>

      {/* ── Error ────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-[13px]">
          {error}
        </div>
      )}

      {/* ── Placeholder inicial ───────────────────────────────────── */}
      {!cargado && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-300">
          <Activity size={48} strokeWidth={1.2} className="mb-4" />
          <p className="text-[14px] font-semibold text-gray-400">
            Seleccioná el período y presioná <strong>Generar</strong>
          </p>
          <p className="text-[12px] text-gray-400 mt-1">
            Gestiones por canal, compromisos de pago y rendimiento por analista
          </p>
        </div>
      )}

      {/* ── Reporte ──────────────────────────────────────────────── */}
      {cargado && data && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total gestiones"
              value={data.kpis.total.toLocaleString('es-CR')}
              sub={`${data.serie_diaria.length} días con actividad`}
              icon={<Activity size={20} />}
              accent="#003B5C"
            />
            <KpiCard
              label="Compromisos de pago"
              value={data.kpis.compromisos}
              sub={`${pct(data.kpis.compromisos, data.kpis.total)} del total`}
              icon={<TrendingUp size={20} />}
              accent="#009ee3"
            />
            <KpiCard
              label="Clientes contactados"
              value={data.kpis.clientes_gestionados}
              sub="clientes únicos en el período"
              icon={<Users size={20} />}
              accent="#22c55e"
            />
            <KpiCard
              label="Analistas activos"
              value={data.kpis.analistas_activos}
              sub={`${data.por_tipo.length} canales utilizados`}
              icon={<MessageSquare size={20} />}
              accent="#8b5cf6"
            />
          </div>

          {/* Analistas + Canal */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Bar analistas */}
            <div
              className="lg:col-span-2 bg-white rounded-xl p-5"
              style={{ border: '1px solid #e2e8f0' }}
            >
              <p className="text-[13px] font-bold text-gray-700 mb-4">Gestiones por analista</p>
              <ResponsiveContainer
                width="100%"
                height={Math.max(200, data.por_analista.length * 40)}
              >
                <BarChart
                  data={data.por_analista.map((a: EfectividadAnalista) => ({
                    nombre: nombreCorto(a.analista_nombre),
                    Total: a.total,
                    Compromisos: a.compromisos,
                  }))}
                  layout="vertical"
                  margin={{ left: 8, right: 24, top: 0, bottom: 0 }}
                  barCategoryGap="30%"
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="nombre"
                    tick={{ fontSize: 11, fill: '#374151' }}
                    width={100}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RTooltip content={<ChartTooltip />} />
                  <Bar dataKey="Total" fill="#003B5C" radius={[0, 4, 4, 0]} barSize={14} />
                  <Bar dataKey="Compromisos" fill="#009ee3" radius={[0, 4, 4, 0]} barSize={9} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-end gap-4 mt-3">
                {[
                  { c: '#003B5C', l: 'Total' },
                  { c: '#009ee3', l: 'Compromisos' },
                ].map((x) => (
                  <div key={x.l} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ background: x.c }} />
                    <span className="text-[11px] text-gray-500">{x.l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Donut canal */}
            <div className="bg-white rounded-xl p-5" style={{ border: '1px solid #e2e8f0' }}>
              <p className="text-[13px] font-bold text-gray-700 mb-2">Canal de gestión</p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={data.por_tipo.map((t: EfectividadTipo) => ({
                      name: CANAL_LABEL[t.tipo] ?? t.tipo,
                      value: t.total,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={68}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {data.por_tipo.map((t: EfectividadTipo, i: number) => (
                      <Cell key={i} fill={CANAL_COLOR[t.tipo] ?? '#94a3b8'} />
                    ))}
                  </Pie>
                  <RTooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-1">
                {data.por_tipo.map((t: EfectividadTipo) => (
                  <div key={t.tipo} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: CANAL_COLOR[t.tipo] ?? '#94a3b8' }}
                      />
                      <span className="text-[12px] text-gray-600">
                        {CANAL_LABEL[t.tipo] ?? t.tipo}
                      </span>
                    </div>
                    <span className="text-[12px] tabular-nums">
                      <span className="font-bold text-gray-800">{t.total}</span>
                      <span className="text-gray-400 ml-1">({pct(t.total, data.kpis.total)})</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Serie diaria */}
          <div className="bg-white rounded-xl p-5" style={{ border: '1px solid #e2e8f0' }}>
            <p className="text-[13px] font-bold text-gray-700 mb-4">Actividad diaria</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart
                data={data.serie_diaria.map((d) => ({
                  dia: fmtDia(d.dia),
                  Total: d.total,
                  Compromisos: d.compromisos,
                }))}
                margin={{ left: 0, right: 10, top: 5, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#003B5C" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#003B5C" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gComp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#009ee3" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#009ee3" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="dia"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <RTooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="Total"
                  stroke="#003B5C"
                  strokeWidth={2}
                  fill="url(#gTotal)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Area
                  type="monotone"
                  dataKey="Compromisos"
                  stroke="#009ee3"
                  strokeWidth={2}
                  fill="url(#gComp)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-end gap-4 mt-2">
              {[
                { c: '#003B5C', l: 'Total' },
                { c: '#009ee3', l: 'Compromisos' },
              ].map((x) => (
                <div key={x.l} className="flex items-center gap-1.5">
                  <div className="w-4 h-1.5 rounded-full" style={{ background: x.c }} />
                  <span className="text-[11px] text-gray-500">{x.l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tabla detallada */}
          <div
            className="bg-white rounded-xl overflow-hidden"
            style={{ border: '1px solid #e2e8f0' }}
          >
            <div className="px-5 py-3.5" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <p className="text-[13px] font-bold text-gray-700">Rendimiento por analista</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {(
                      [
                        { l: 'Analista', a: 'left' },
                        { l: 'Total', a: 'right' },
                        { l: 'Compromisos', a: 'right' },
                        { l: 'Tasa', a: 'right' },
                        { l: 'Clientes', a: 'right' },
                        { l: 'WA', a: 'right' },
                        { l: 'Correo', a: 'right' },
                        { l: 'Tel', a: 'right' },
                        { l: 'Visita', a: 'right' },
                        { l: 'Días activos', a: 'right' },
                        { l: 'Prom/día', a: 'right' },
                      ] as { l: string; a: string }[]
                    ).map(({ l, a }) => (
                      <th
                        key={l}
                        className={`px-3 py-2.5 font-semibold text-gray-500 text-${a}`}
                        style={{
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                        }}
                      >
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.por_analista.map((a: EfectividadAnalista, i: number) => {
                    const tasa = a.total > 0 ? (a.compromisos / a.total) * 100 : 0;
                    const promDia =
                      a.dias_activos > 0 ? (a.total / a.dias_activos).toFixed(1) : '—';
                    return (
                      <tr
                        key={a.analista_email}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: i % 2 === 0 ? 'white' : '#fafbfc',
                        }}
                      >
                        <td className="px-3 py-3 font-medium text-gray-800">{a.analista_nombre}</td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums text-gray-900">
                          {a.total}
                        </td>
                        <td
                          className="px-3 py-3 text-right font-bold tabular-nums"
                          style={{ color: '#009ee3' }}
                        >
                          {a.compromisos}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span
                            className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                            style={{
                              background:
                                tasa >= 20 ? '#dcfce7' : tasa >= 10 ? '#fef9c3' : '#fee2e2',
                              color: tasa >= 20 ? '#16a34a' : tasa >= 10 ? '#d97706' : '#dc2626',
                            }}
                          >
                            {tasa.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-600">
                          {a.clientes_gestionados}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-500">
                          {a.whatsapps || '—'}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-500">
                          {a.correos || '—'}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-500">
                          {a.llamadas || '—'}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-500">
                          {a.visitas || '—'}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-600">
                          {a.dias_activos}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-600">
                          {promDia}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                    <td className="px-3 py-3 font-black text-gray-800">TOTAL</td>
                    <td className="px-3 py-3 text-right font-black tabular-nums">
                      {data.kpis.total}
                    </td>
                    <td
                      className="px-3 py-3 text-right font-black tabular-nums"
                      style={{ color: '#009ee3' }}
                    >
                      {data.kpis.compromisos}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-[12px] font-bold text-gray-700 tabular-nums">
                        {pct(data.kpis.compromisos, data.kpis.total)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-gray-600">
                      {data.kpis.clientes_gestionados}
                    </td>
                    <td colSpan={6} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Top resultados */}
          <div className="bg-white rounded-xl p-5" style={{ border: '1px solid #e2e8f0' }}>
            <p className="text-[13px] font-bold text-gray-700 mb-4">Distribución de resultados</p>
            <div className="space-y-2">
              {data.por_resultado.map((r: EfectividadResultado) => {
                const isCompromiso = COMPROMISOS_SET.has(r.resultado);
                const isNegativo = NO_CONTACTO_SET.has(r.resultado);
                const barColor = isCompromiso ? '#009ee3' : isNegativo ? '#dc2626' : '#cbd5e1';
                const maxVal = data.por_resultado[0]?.total ?? 1;
                return (
                  <div key={r.resultado} className="flex items-center gap-3">
                    <span
                      className="text-[12px] text-gray-600 flex-shrink-0 truncate"
                      style={{ width: 220 }}
                      title={r.resultado}
                    >
                      {r.resultado}
                    </span>
                    <div
                      className="flex-1 h-4 rounded-full overflow-hidden"
                      style={{ background: '#f1f5f9' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(r.total / maxVal) * 100}%`, background: barColor }}
                      />
                    </div>
                    <span className="text-[12px] font-bold text-gray-700 tabular-nums w-8 text-right">
                      {r.total}
                    </span>
                    <div className="w-8 flex-shrink-0">
                      {isCompromiso && (
                        <span
                          className="text-[10px] font-bold rounded-full px-1.5 py-0.5"
                          style={{ background: '#e0f2fe', color: '#009ee3' }}
                        >
                          ✓
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div
              className="flex items-center gap-4 mt-4 pt-3"
              style={{ borderTop: '1px solid #f1f5f9' }}
            >
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#009ee3' }} />
                <span className="text-[11px] text-gray-500">Compromiso de pago ✓</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#dc2626' }} />
                <span className="text-[11px] text-gray-500">Sin contacto</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#cbd5e1' }} />
                <span className="text-[11px] text-gray-500">Otros</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
