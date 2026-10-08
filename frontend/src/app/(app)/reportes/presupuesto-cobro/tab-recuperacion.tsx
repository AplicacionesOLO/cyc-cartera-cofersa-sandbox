'use client';

import { useState } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  FileText,
  FileSpreadsheet,
  Send,
  Loader2,
  X,
  Building2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useRecuperacionMesController } from '@/views/presupuesto/hooks/use-recuperacion-mes-controller';
import { fmtCRC, fmtM } from '@/lib/utils/formato';
import { getBusinessDaysInMonth, getElapsedBusinessDays } from '@/lib/utils/dias-habiles';
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis';
import VendedorEnvioPanel from '@/components/reportes/VendedorEnvioPanel';
import DirectorioInput from '@/components/ui/DirectorioInput';
import { htmlPresupuestoVendedor, asuntoPresupuesto } from '@/lib/reportes/email-presupuesto';
import { htmlRecupGerencia, asuntoRecupGerencia } from '@/lib/reportes/email-recuperacion-gerencia';
import { exportTablaPDF, exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';
import type { RemitenteCorreo } from '@/lib/reportes/email-vendedor';
import type { RecuperacionResult, RecupVendedor, RecupCliente } from '@/types/presupuesto';

const COLS_GER: ColumnaReporte[] = [
  { key: 'vendedor_nombre', label: 'Cobrador', align: 'left', format: 'text', width: 62 },
  { key: 'meta', label: 'Ppto Cobro', align: 'right', format: 'crc', width: 33 },
  { key: 'cobrado', label: 'Monto Cobrado', align: 'right', format: 'crc', width: 33 },
  { key: 'faltante', label: 'Monto Faltante', align: 'right', format: 'crc', width: 33 },
  { key: 'pct', label: '% Alcance', align: 'right', format: 'pct', width: 21 },
];

type VendEnvio = RecupVendedor & { analistas_email: string[] };

interface Props {
  anio: number;
  mes: number;
  mesLabel: string;
  remitente: RemitenteCorreo;
}

function detectarCierre(anio: number, mes: number): boolean {
  const hoy = new Date(Date.now() - 6 * 3600_000);
  return (
    anio < hoy.getUTCFullYear() || (anio === hoy.getUTCFullYear() && mes < hoy.getUTCMonth() + 1)
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border h-20 animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-xl border h-64 animate-pulse" />
    </div>
  );
}

function pctCol(pct: number | null): string {
  return pct === null ? '#94a3b8' : pct >= 90 ? '#16a34a' : pct >= 60 ? '#f59e0b' : '#dc2626';
}

// Reconstruye proyección/días con el mismo criterio de días hábiles (Lun-Vie)
// que usa el widget Meta Mensual del Dashboard. No toca fn_recuperacion (que
// sigue en calendario) -- solo ajusta lo que se muestra en pantalla y lo que
// se envía por correo (gerencia + por vendedor), para que ambos coincidan.
function aplicarDiasHabiles(data: RecuperacionResult): RecuperacionResult {
  const { anio, mes } = data.kpis;
  const hoyCR = new Date(Date.now() - 6 * 3600_000);
  const esMesActual = anio === hoyCR.getUTCFullYear() && mes === hoyCR.getUTCMonth() + 1;
  const diaRef = esMesActual ? hoyCR.getUTCDate() : new Date(Date.UTC(anio, mes, 0)).getUTCDate();

  const diasMes = getBusinessDaysInMonth(anio, mes);
  const diasTranscurridos = getElapsedBusinessDays(anio, mes, diaRef);
  const factor = diasTranscurridos > 0 ? diasMes / diasTranscurridos : 0;

  const vendedores = data.vendedores.map((v) => {
    const proyeccion = Math.round(v.cobrado * factor);
    return {
      ...v,
      proyeccion,
      pct_proyectado: v.meta > 0 ? Math.round((proyeccion / v.meta) * 1000) / 10 : null,
    };
  });
  const proyeccionTotal = Math.round(data.kpis.cobrado_total * factor);

  return {
    ...data,
    kpis: {
      ...data.kpis,
      dias_mes: diasMes,
      dias_transcurridos: diasTranscurridos,
      proyeccion_fin_mes: proyeccionTotal,
      pct_proyectado:
        data.kpis.meta_total > 0
          ? Math.round((proyeccionTotal / data.kpis.meta_total) * 1000) / 10
          : 0,
    },
    vendedores,
  };
}

export default function TabRecuperacion({ anio, mes, mesLabel, remitente }: Props) {
  const esCierre = detectarCierre(anio, mes);
  const {
    data,
    loading,
    error,
    enviandoGer,
    resultGer,
    setResultGer,
    enviarGerencia: enviarCorreoGerencia,
  } = useRecuperacionMesController(anio, mes);
  const [exportando, setExportando] = useState(false);
  const [modalGer, setModalGer] = useState(false);
  const [toGer, setToGer] = useState('');
  const [chartView, setChartView] = useState<'acumulado' | 'por-dia'>('acumulado');

  if (loading) return <Skeleton />;
  if (error)
    return (
      <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
        <p className="text-red-600 text-sm font-semibold">{error}</p>
      </div>
    );
  if (!data) return null;

  const dataAdj = aplicarDiasHabiles(data);
  const k = dataAdj.kpis;
  const sinMeta = !k.congelado || k.meta_total <= 0;
  const kpiPctColor = k.pct >= 90 ? '#16a34a' : k.pct >= 60 ? '#f59e0b' : '#dc2626';

  let acum = 0;
  const chartAcum = dataAdj.serie.map((s) => {
    acum += s.monto;
    return { dia: s.dia.slice(8, 10), acum };
  });
  const chartDiario = dataAdj.serie.map((s) => ({ dia: s.dia.slice(8, 10), monto: s.monto }));

  // Vendedores sin meta (perdieron toda su cartera en una reasignación, por ejemplo)
  // no aparecen en la lista de envío -- mismo filtro que ya usa el consolidado de gerencia.
  const vendedores: VendEnvio[] = dataAdj.vendedores
    .filter((v) => v.meta > 0)
    .map((v) => ({
      ...v,
      analistas_email: v.analista_email ? [v.analista_email] : [],
    }));

  const faltanteGlobal = Math.round(k.meta_total - k.cobrado_total);

  // ── Reporte consolidado para gerencia ────────────────────────────────────
  function gerParams() {
    const filas = dataAdj.vendedores
      .filter((v) => v.meta > 0)
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
      .map((v) => ({ ...v, faltante: Math.round(v.meta - v.cobrado) }));
    return {
      filas: filas as unknown as Record<string, unknown>[],
      columnas: COLS_GER,
      titulo: esCierre
        ? 'Resultado de Cierre — Cobranza Consolidada'
        : 'Resumen de Cobranza Consolidado',
      subtitulo: esCierre
        ? `${mesLabel} · Cierre del mes`
        : `${mesLabel} · avance al ${k.dias_transcurridos}/${k.dias_mes} días hábiles`,
      meta: esCierre
        ? [
            { label: 'Meta total', value: fmtCRC(k.meta_total) },
            { label: 'Cobrado', value: fmtCRC(k.cobrado_total) },
            { label: '% Cumplimiento', value: `${k.pct}%` },
            {
              label: 'Faltante',
              value: faltanteGlobal <= 0 ? 'Meta superada' : fmtCRC(faltanteGlobal),
            },
          ]
        : [
            { label: 'Meta total', value: fmtCRC(k.meta_total) },
            { label: 'Cobrado', value: fmtCRC(k.cobrado_total) },
            { label: '% Avance global', value: `${k.pct}%` },
            { label: 'Proyección cierre', value: fmtCRC(k.proyeccion_fin_mes) },
          ],
      barra: {
        pct: k.pct,
        pctProyectado: k.pct_proyectado,
        colorPct: (k.pct >= 90 ? [22, 163, 74] : k.pct >= 60 ? [245, 158, 11] : [220, 38, 38]) as [
          number,
          number,
          number,
        ],
        nota: 'Barra sólida = cobrado · barra clara = proyección de cierre',
      },
      totales: {
        vendedor_nombre: 'TOTAL',
        meta: k.meta_total,
        cobrado: k.cobrado_total,
        faltante: Math.round(k.meta_total - k.cobrado_total),
        pct: k.pct,
      },
      orientacion: 'portrait' as const,
      nombreArchivo: `resumen-cobranza-${anio}-${String(mes).padStart(2, '0')}`,
      generadoPor: remitente.nombre,
    };
  }
  async function onPDFGer() {
    setExportando(true);
    try {
      await exportTablaPDF(gerParams());
    } finally {
      setExportando(false);
    }
  }
  async function onExcelGer() {
    setExportando(true);
    try {
      await exportTablaExcel(gerParams());
    } finally {
      setExportando(false);
    }
  }

  async function enviarGerencia() {
    await enviarCorreoGerencia(
      toGer.trim(),
      asuntoRecupGerencia(mesLabel, k.pct, esCierre),
      htmlRecupGerencia(dataAdj, mesLabel, remitente, esCierre),
    );
  }

  const BTN: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid #e2e8f0',
    background: 'white',
    color: '#374151',
  };

  const kpisStrip = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KPICardAnalisis
        label="Meta del mes"
        valor={sinMeta ? '—' : fmtCRC(k.meta_total)}
        sub={mesLabel}
        color="#003B5C"
      />
      <KPICardAnalisis
        label="Cobrado"
        valor={fmtCRC(k.cobrado_total)}
        sub={esCierre ? 'Cierre del mes' : `${k.dias_transcurridos}/${k.dias_mes} días hábiles`}
        color="#16a34a"
      />
      <KPICardAnalisis
        label={esCierre ? '% Cumplimiento' : '% Avance'}
        valor={sinMeta ? '—' : `${k.pct}%`}
        sub={esCierre ? 'resultado final' : 'de la meta'}
        color={kpiPctColor}
      />
      {esCierre ? (
        <KPICardAnalisis
          label="Faltante"
          valor={sinMeta ? '—' : faltanteGlobal <= 0 ? 'Meta superada' : fmtCRC(faltanteGlobal)}
          sub={faltanteGlobal <= 0 ? 'sobrecumplimiento' : 'por cobrar'}
          color={faltanteGlobal <= 0 ? '#16a34a' : '#dc2626'}
        />
      ) : (
        <KPICardAnalisis
          label="Proyección cierre"
          valor={fmtCRC(k.proyeccion_fin_mes)}
          sub={sinMeta ? 'al ritmo actual' : `${k.pct_proyectado}% de la meta`}
          color="#009ee3"
        />
      )}
    </div>
  );

  const extras = (
    <>
      {!sinMeta && (
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              {esCierre ? 'Cumplimiento final' : 'Avance de recaudo'}
            </span>
            <span className="text-[12px] font-black" style={{ color: kpiPctColor }}>
              {esCierre ? `${k.pct}% cumplimiento` : `${k.pct}% · proyectado ${k.pct_proyectado}%`}
            </span>
          </div>
          <div
            style={{
              height: '12px',
              borderRadius: '6px',
              background: '#f1f5f9',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {!esCierre && (
              <div
                style={{
                  width: `${Math.min(100, k.pct_proyectado)}%`,
                  height: '100%',
                  background: '#bfdbfe',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                }}
              />
            )}
            <div
              style={{
                width: `${Math.min(100, k.pct)}%`,
                height: '100%',
                borderRadius: '6px',
                background: kpiPctColor,
                position: 'absolute',
                top: 0,
                left: 0,
              }}
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            {esCierre
              ? 'Resultado final del mes'
              : 'Barra sólida = cobrado · barra clara = proyección de cierre'}
          </p>
        </div>
      )}

      {chartAcum.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          {/* Título + Segmented Control */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              {chartView === 'acumulado' ? 'Recaudo acumulado del mes' : 'Recaudo diario del mes'}
            </p>
            <div
              style={{
                display: 'flex',
                background: '#f1f5f9',
                borderRadius: '6px',
                padding: '2px',
                gap: '1px',
              }}
            >
              {(['acumulado', 'por-dia'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setChartView(opt)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.15s',
                    background: chartView === opt ? 'white' : 'transparent',
                    color: chartView === opt ? '#1e293b' : '#94a3b8',
                    boxShadow: chartView === opt ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {opt === 'acumulado' ? 'Acumulado' : 'Por Día'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ width: '100%', height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              {chartView === 'acumulado' ? (
                <AreaChart data={chartAcum} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#009ee3" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#009ee3" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis
                    tickFormatter={(v) => fmtM(v)}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    width={55}
                  />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip
                    formatter={(v: any) => fmtCRC(Number(v))}
                    labelFormatter={(l) => `Día ${l}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="acum"
                    stroke="#009ee3"
                    strokeWidth={2}
                    fill="url(#gRec)"
                  />
                </AreaChart>
              ) : (
                <BarChart data={chartDiario} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis
                    tickFormatter={(v) => fmtM(v)}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    width={55}
                  />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip
                    formatter={(v: any) => fmtCRC(Number(v))}
                    labelFormatter={(l) => `Día ${l}`}
                  />
                  <Bar dataKey="monto" fill="#009ee3" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      {sinMeta && (
        <div
          className="rounded-xl border px-4 py-3"
          style={{ background: '#fffbeb', borderColor: '#fde68a' }}
        >
          <p className="text-[12px] text-amber-700 font-semibold">
            Este mes no tiene presupuesto congelado.
          </p>
          <p className="text-[11px] text-amber-600 mt-0.5">
            Andá a "Presupuesto del mes" y congelá la meta para comparar el cobrado y enviar el
            avance a los vendedores.
          </p>
        </div>
      )}

      {/* Barra consolidado gerencia */}
      {!sinMeta && (
        <div className="bg-white rounded-xl border border-slate-100 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            {esCierre ? 'Resultado de cierre para gerencia' : 'Resumen consolidado para gerencia'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onPDFGer}
              disabled={exportando}
              style={{ ...BTN, opacity: exportando ? 0.5 : 1 }}
            >
              {exportando ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}{' '}
              PDF
            </button>
            <button onClick={onExcelGer} disabled={exportando} style={BTN}>
              <FileSpreadsheet size={13} /> Excel
            </button>
            <button
              onClick={() => {
                setResultGer(null);
                setModalGer(true);
              }}
              style={{ ...BTN, background: '#003B5C', color: 'white', borderColor: '#003B5C' }}
            >
              <Building2 size={13} /> Enviar a gerencia
            </button>
          </div>
        </div>
      )}

      {/* Modal gerencia */}
      {modalGer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => {
            if (!enviandoGer) setModalGer(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '460px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div
              style={{
                background: '#003B5C',
                padding: '14px 18px',
                borderRadius: '14px 14px 0 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span
                style={{
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Building2 size={16} />{' '}
                {esCierre ? 'Enviar cierre a gerencia' : 'Enviar resumen a gerencia'}
              </span>
              <button
                onClick={() => {
                  if (!enviandoGer) setModalGer(false);
                }}
                style={{ color: '#A8C4E0' }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '18px' }}>
              <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
                Se enviará el resumen consolidado de <b style={{ color: '#003B5C' }}>{mesLabel}</b>{' '}
                desde tu correo. Podés poner varios destinatarios separados por <b>;</b>
              </p>
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Para
              </label>
              <DirectorioInput
                value={toGer}
                onChange={setToGer}
                placeholder="Nombre o correo… (separá varios con ;)"
                style={{
                  width: '100%',
                  marginTop: '4px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  fontSize: '13px',
                  color: '#334155',
                }}
              />
              {resultGer && (
                <div
                  style={{
                    marginTop: '12px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: resultGer.ok ? '#16a34a' : '#dc2626',
                  }}
                >
                  {resultGer.ok ? (
                    <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                  ) : (
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                  )}
                  <span>
                    {resultGer.msg}
                    {!resultGer.ok && /Google|expirada|401/i.test(resultGer.msg)
                      ? ' — Cerrá sesión y volvé a entrar con Google.'
                      : ''}
                  </span>
                </div>
              )}
              <div
                style={{
                  marginTop: '16px',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                }}
              >
                <button
                  onClick={() => {
                    if (!enviandoGer) setModalGer(false);
                  }}
                  style={{ ...BTN }}
                >
                  Cerrar
                </button>
                <button
                  onClick={enviarGerencia}
                  disabled={enviandoGer || !toGer.trim()}
                  style={{
                    ...BTN,
                    background: '#009ee3',
                    color: 'white',
                    borderColor: '#009ee3',
                    opacity: enviandoGer || !toGer.trim() ? 0.5 : 1,
                  }}
                >
                  {enviandoGer ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Send size={13} />
                  )}{' '}
                  Enviar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <VendedorEnvioPanel<VendEnvio>
        vendedores={vendedores}
        kpis={
          <>
            {kpisStrip}
            {extras}
          </>
        }
        buildSubject={(v) => asuntoPresupuesto(v, mesLabel, esCierre)}
        buildHtml={(v) => htmlPresupuestoVendedor(v, mesLabel, remitente, esCierre)}
        renderResumen={(v) => {
          const falt = Math.round(v.meta - v.cobrado);
          return (
            <span>
              Meta {fmtCRC(v.meta)} · Cobrado{' '}
              <span style={{ color: '#16a34a', fontWeight: 700 }}>{fmtCRC(v.cobrado)}</span>
              {v.pct !== null && (
                <span style={{ color: pctCol(v.pct), fontWeight: 700 }}> · {v.pct}%</span>
              )}
              {esCierre ? (
                <span style={{ color: falt <= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                  {' '}
                  · {falt <= 0 ? 'Meta superada' : `Faltante ${fmtCRC(falt)}`}
                </span>
              ) : (
                <span> · proy {fmtCRC(v.proyeccion)}</span>
              )}
            </span>
          );
        }}
        tableHeaders={
          esCierre
            ? ['Meta', 'Cobrado', '% Cumplimiento', 'Faltante']
            : ['Meta', 'Cobrado', '% Alcance', 'Monto Proyectado']
        }
        renderTablaFila={(v) => {
          const falt = Math.round(v.meta - v.cobrado);
          return [
            <span key="meta" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtCRC(v.meta)}
            </span>,
            <span
              key="cob"
              style={{ color: '#16a34a', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
            >
              {fmtCRC(v.cobrado)}
            </span>,
            <span key="pct" style={{ color: pctCol(v.pct), fontWeight: 700 }}>
              {v.pct !== null ? `${v.pct}%` : '—'}
            </span>,
            esCierre ? (
              <span
                key="falt"
                style={{
                  color: falt <= 0 ? '#16a34a' : '#dc2626',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {falt <= 0 ? 'Superada' : fmtCRC(falt)}
              </span>
            ) : (
              <span key="proy" style={{ color: '#0369a1', fontVariantNumeric: 'tabular-nums' }}>
                {fmtCRC(v.proyeccion)}
              </span>
            ),
          ];
        }}
        renderDetalle={(v) => <TablaClientes clientes={v.clientes} />}
        renderFilasDetalle={(v, tc) => {
          const lista = (v.clientes ?? []).filter((c) => c.meta > 0);

          // Sin clientes: una sola fila que abarca toda la tabla
          if (lista.length === 0)
            return [
              <tr key="empty">
                <td
                  colSpan={tc}
                  style={{
                    padding: '12px 14px 12px 40px',
                    fontSize: '11px',
                    color: '#94a3b8',
                    borderTop: '1px solid #f1f5f9',
                    background: '#fafafa',
                  }}
                >
                  Sin clientes con meta este mes.
                </td>
              </tr>,
            ];

          // Encabezado de sub-sección — columnas espejo de la tabla principal
          const subHdr = (
            <tr key="sub-hdr" style={{ background: '#f0f4f8', borderTop: '2px solid #e2e8f0' }}>
              <td style={{ width: '40px', padding: '5px 12px' }} />
              <td
                style={{
                  padding: '5px 14px 5px 24px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Cliente
              </td>
              <td
                style={{
                  padding: '5px 14px',
                  textAlign: 'right',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                }}
              >
                Meta
              </td>
              <td
                style={{
                  padding: '5px 14px',
                  textAlign: 'right',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                }}
              >
                Cobrado
              </td>
              <td
                style={{
                  padding: '5px 14px',
                  textAlign: 'right',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                }}
              >
                % Avance
              </td>
              <td colSpan={tc - 5} />
            </tr>
          );

          // Filas de clientes alineadas con las columnas del vendedor
          const filas = lista.map((c, i) => {
            const col =
              c.pct === null
                ? '#94a3b8'
                : c.pct >= 90
                  ? '#16a34a'
                  : c.pct >= 60
                    ? '#f59e0b'
                    : '#dc2626';
            return (
              <tr
                key={c.cliente_cod}
                style={{
                  background: i % 2 === 0 ? 'white' : '#f8fafc',
                  borderTop: '1px solid #f1f5f9',
                }}
              >
                {/* Col 0 — checkbox (vacío) */}
                <td style={{ width: '40px', padding: '6px 12px' }} />
                {/* Col 1 — Vendedor → código + nombre del cliente */}
                <td style={{ padding: '6px 14px 6px 24px', borderLeft: '2px solid #e2e8f0' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      color: '#94a3b8',
                      fontWeight: 600,
                    }}
                  >
                    {c.cliente_cod}
                  </span>
                  <span style={{ fontSize: '11px', color: '#475569', marginLeft: '6px' }}>
                    — {c.cliente_nombre}
                  </span>
                </td>
                {/* Col 2 — Meta */}
                <td
                  style={{
                    padding: '6px 14px',
                    textAlign: 'right',
                    fontSize: '11px',
                    color: '#64748b',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtCRC(c.meta)}
                </td>
                {/* Col 3 — Cobrado */}
                <td
                  style={{
                    padding: '6px 14px',
                    textAlign: 'right',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#16a34a',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {c.cobrado > 0 ? fmtCRC(c.cobrado) : '—'}
                </td>
                {/* Col 4 — % Avance */}
                <td
                  style={{
                    padding: '6px 14px',
                    textAlign: 'right',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: col,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {c.pct === null ? '—' : `${c.pct}%`}
                </td>
                {/* Cols restantes vacías (Monto Proyectado + Portafolio + Correo + Estado) */}
                <td colSpan={tc - 5} />
              </tr>
            );
          });

          return [subHdr, ...filas];
        }}
      />
    </div>
  );
}

function TablaClientes({ clientes }: { clientes: RecupCliente[] }) {
  const lista = (clientes ?? []).filter((c) => c.meta > 0);
  if (lista.length === 0)
    return (
      <div className="px-4 py-4 text-[11px] text-gray-400">Sin clientes con meta este mes.</div>
    );
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
      <thead>
        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          {(
            [
              ['Cliente', 'left'],
              ['Meta', 'right'],
              ['Cobrado', 'right'],
              ['% Avance', 'right'],
            ] as [string, React.CSSProperties['textAlign']][]
          ).map(([l, a]) => (
            <th
              key={l}
              style={{
                padding: '7px 12px',
                fontSize: '10px',
                fontWeight: 600,
                color: '#64748b',
                textTransform: 'uppercase',
                textAlign: a,
              }}
            >
              {l}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lista.map((c) => {
          const col =
            c.pct === null
              ? '#94a3b8'
              : c.pct >= 90
                ? '#16a34a'
                : c.pct >= 60
                  ? '#f59e0b'
                  : '#dc2626';
          return (
            <tr key={c.cliente_cod} style={{ borderBottom: '1px solid #f8fafc' }}>
              <td style={{ padding: '6px 12px', fontSize: '11px', color: '#475569' }}>
                {c.cliente_nombre}
              </td>
              <td
                style={{
                  padding: '6px 12px',
                  textAlign: 'right',
                  fontSize: '11px',
                  color: '#64748b',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtCRC(c.meta)}
              </td>
              <td
                style={{
                  padding: '6px 12px',
                  textAlign: 'right',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#16a34a',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {c.cobrado > 0 ? fmtCRC(c.cobrado) : '—'}
              </td>
              <td
                style={{
                  padding: '6px 12px',
                  textAlign: 'right',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: col,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {c.pct === null ? '—' : `${c.pct}%`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
