'use client';

import { useState, useRef } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Loader2, FileText, FileSpreadsheet } from 'lucide-react';
import { useRecuperacionPeriodoController } from '@/views/presupuesto/hooks/use-recuperacion-reportes-controller';
import { fmtCRC, fmtM, fmtFecha, hoyISO } from '@/lib/utils/formato';
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis';
import { exportTablaPDF, exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';
import RecuperacionTramos from './RecuperacionTramos';
import RecuperacionMom from './RecuperacionMom';
import TabSinPago from '@/app/(app)/reportes/presupuesto-cobro/tab-sin-pago';
import DimensionFilter from '@/components/reportes/DimensionFilter';

interface Props {
  esAnalista: boolean;
  userEmail: string | null;
  generadoPor: string;
}

type VistaKey = 'resumen' | 'tramos' | 'mom' | 'sin-pago';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const VISTAS: { key: VistaKey; label: string }[] = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'tramos', label: 'Por Tramos' },
  { key: 'mom', label: 'Comparativo Mensual' },
  { key: 'sin-pago', label: 'Sin pago este mes' },
];

const inicioMes = () => {
  const d = new Date(Date.now() - 6 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

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

export default function RecuperacionPeriodoCliente({ esAnalista, userEmail, generadoPor }: Props) {
  const [activeVista, setActiveVista] = useState<VistaKey>('resumen');
  const [ini, setIni] = useState(inicioMes());
  const [fin, setFin] = useState(hoyISO());
  const [group, setGroup] = useState<'analista' | 'vendedor'>(esAnalista ? 'vendedor' : 'analista');
  const [exportando, setExportando] = useState(false);
  const tramosExportRef = useRef<{ onPDF: () => void; onExcel: () => void }>({
    onPDF: () => {},
    onExcel: () => {},
  });
  const momExportRef = useRef<{ onPDF: () => void; onExcel: () => void }>({
    onPDF: () => {},
    onExcel: () => {},
  });
  const hoyDate = new Date(Date.now() - 6 * 3600_000);
  const [sinPagoAnio, setSinPagoAnio] = useState(hoyDate.getUTCFullYear());
  const [sinPagoMes, setSinPagoMes] = useState(hoyDate.getUTCMonth() + 1);
  const [filtroDim, setFiltroDim] = useState('');

  // Solo cargamos datos del resumen cuando la vista activa lo requiere
  const { data, meta, loading, error } = useRecuperacionPeriodoController({
    ini,
    fin,
    group,
    esAnalista,
    email: esAnalista ? userEmail : null,
    enabled: activeVista === 'resumen',
  });

  function preset(tipo: 'mes' | 'mespasado' | '7' | '30') {
    const hoy = new Date(Date.now() - 6 * 3600_000);
    if (tipo === 'mes') {
      setIni(inicioMes());
      setFin(hoyISO());
    } else if (tipo === 'mespasado') {
      const y = hoy.getUTCFullYear(),
        m = hoy.getUTCMonth();
      const pIni = new Date(Date.UTC(y, m - 1, 1)),
        pFin = new Date(Date.UTC(y, m, 0));
      setIni(pIni.toISOString().slice(0, 10));
      setFin(pFin.toISOString().slice(0, 10));
    } else {
      const n = Number(tipo);
      const d = new Date(hoy);
      d.setUTCDate(d.getUTCDate() - n + 1);
      setIni(d.toISOString().slice(0, 10));
      setFin(hoyISO());
    }
  }

  const k = data?.kpis;
  const promedioDiario = k && k.dias > 0 ? Math.round(k.total / k.dias) : 0;
  const pctAlcance = meta > 0 && k ? Math.round((k.total / meta) * 100) : 0;
  let acum = 0;
  const chart = (data?.serie ?? []).map((s) => {
    acum += s.monto;
    return { dia: s.dia.slice(5), monto: s.monto, acum };
  });

  function exportParams() {
    const cols: ColumnaReporte[] = [
      { key: 'cliente_nombre', label: 'Cliente', align: 'left', format: 'text', width: 60 },
      {
        key: esAnalista ? 'vendedor' : group,
        label: esAnalista ? 'Vendedor' : group === 'vendedor' ? 'Vendedor' : 'Analista',
        align: 'left',
        format: 'text',
        width: 40,
      },
      { key: 'cobrado', label: 'Recaudado', align: 'right', format: 'crc', width: 30 },
    ];
    return {
      filas: (data?.top_clientes ?? []) as unknown as Record<string, unknown>[],
      columnas: cols,
      titulo: esAnalista ? 'Recuperación de mi cartera' : 'Recuperación del Período',
      subtitulo: `${fmtFecha(ini)} – ${fmtFecha(fin)}`,
      meta: [
        { label: 'Total recaudado', value: fmtCRC(k?.total ?? 0) },
        { label: 'Clientes', value: `${k?.n_clientes ?? 0}` },
        { label: 'Pagos', value: `${k?.n_pagos ?? 0}` },
      ],
      nombreArchivo: esAnalista ? 'mi-recuperacion' : `recuperacion-periodo`,
      generadoPor,
    };
  }
  async function onPDF() {
    setExportando(true);
    try {
      await exportTablaPDF(exportParams());
    } finally {
      setExportando(false);
    }
  }
  async function onExcel() {
    setExportando(true);
    try {
      await exportTablaExcel(exportParams());
    } finally {
      setExportando(false);
    }
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
  const inputCls =
    'rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] text-gray-700 focus:outline-none';

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">
        {/* ── Fila: pestañas + controles contextuales ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-0.5 p-0.5 rounded-xl" style={{ background: '#E2E8F0' }}>
            {VISTAS.map((v) => (
              <button
                key={v.key}
                onClick={() => setActiveVista(v.key)}
                className="px-4 py-2 rounded-lg text-[12px] font-bold transition-all"
                style={{
                  background: activeVista === v.key ? 'white' : 'transparent',
                  color: activeVista === v.key ? '#003B5C' : '#94a3b8',
                  boxShadow: activeVista === v.key ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
          {activeVista === 'mom' && (
            <div className="flex items-center gap-2">
              <button onClick={() => momExportRef.current.onPDF()} style={BTN}>
                <FileText size={13} /> PDF
              </button>
              <button onClick={() => momExportRef.current.onExcel()} style={BTN}>
                <FileSpreadsheet size={13} /> Excel
              </button>
            </div>
          )}
          {activeVista === 'sin-pago' && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                  Mes
                </span>
                <select
                  value={`${sinPagoAnio}-${sinPagoMes}`}
                  onChange={(e) => {
                    const [a, m] = e.target.value.split('-').map(Number);
                    setSinPagoAnio(a);
                    setSinPagoMes(m);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] bg-white text-gray-700 focus:outline-none"
                >
                  {Array.from({ length: 14 }, (_, i) => {
                    const d = new Date(
                      Date.UTC(hoyDate.getUTCFullYear(), hoyDate.getUTCMonth() - i, 1),
                    );
                    return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
                  }).map((o) => (
                    <option key={`${o.anio}-${o.mes}`} value={`${o.anio}-${o.mes}`}>
                      {MESES[o.mes - 1]} {o.anio}
                    </option>
                  ))}
                </select>
              </div>
              <DimensionFilter tipo="dimension" value={filtroDim} onChange={setFiltroDim} />
            </div>
          )}
        </div>

        {/* ── Controles de período y agrupación (solo Resumen y Por Tramos) ── */}
        {activeVista !== 'mom' && activeVista !== 'sin-pago' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={ini}
                max={fin}
                onChange={(e) => setIni(e.target.value)}
                className={inputCls}
              />
              <span className="text-gray-400 text-[12px]">→</span>
              <input
                type="date"
                value={fin}
                min={ini}
                max={hoyISO()}
                onChange={(e) => setFin(e.target.value)}
                className={inputCls}
              />
              <div className="flex gap-1 ml-1">
                {(
                  [
                    ['mes', 'Este mes'],
                    ['mespasado', 'Mes pasado'],
                    ['7', '7d'],
                    ['30', '30d'],
                  ] as [string, string][]
                ).map(([t, l]) => (
                  <button
                    key={t}
                    onClick={() => preset(t as 'mes' | 'mespasado' | '7' | '30')}
                    className="px-2 py-1 rounded-md text-[11px] font-semibold text-[#009ee3] hover:bg-blue-50"
                  >
                    {l}
                  </button>
                ))}
              </div>
              {!esAnalista && (
                <div
                  className="flex gap-0.5 p-0.5 rounded-lg ml-2"
                  style={{ background: '#E2E8F0' }}
                >
                  {(
                    [
                      ['analista', 'Por analista'],
                      ['vendedor', 'Por vendedor'],
                    ] as ['analista' | 'vendedor', string][]
                  ).map(([g, l]) => (
                    <button
                      key={g}
                      onClick={() => setGroup(g)}
                      className="px-3 py-1.5 rounded-md text-[11px] font-bold transition-all"
                      style={{
                        background: group === g ? 'white' : 'transparent',
                        color: group === g ? '#003B5C' : '#94a3b8',
                        boxShadow: group === g ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
              {esAnalista && (
                <div
                  className="flex gap-0.5 p-0.5 rounded-lg ml-2"
                  style={{ background: '#E2E8F0' }}
                >
                  {(
                    [
                      ['vendedor', 'Por vendedor'],
                      ['analista', 'Resumen'],
                    ] as ['analista' | 'vendedor', string][]
                  ).map(([g, l]) => (
                    <button
                      key={g}
                      onClick={() => setGroup(g)}
                      className="px-3 py-1.5 rounded-md text-[11px] font-bold transition-all"
                      style={{
                        background: group === g ? 'white' : 'transparent',
                        color: group === g ? '#003B5C' : '#94a3b8',
                        boxShadow: group === g ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeVista === 'resumen' && (
                <>
                  <button
                    onClick={onPDF}
                    disabled={exportando || !data}
                    style={{ ...BTN, opacity: exportando ? 0.5 : 1 }}
                  >
                    {exportando ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <FileText size={13} />
                    )}{' '}
                    PDF
                  </button>
                  <button onClick={onExcel} disabled={!data} style={BTN}>
                    <FileSpreadsheet size={13} /> Excel
                  </button>
                </>
              )}
              {activeVista === 'tramos' && (
                <>
                  <button onClick={() => tramosExportRef.current.onPDF()} style={BTN}>
                    <FileText size={13} /> PDF
                  </button>
                  <button onClick={() => tramosExportRef.current.onExcel()} style={BTN}>
                    <FileSpreadsheet size={13} /> Excel
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Contenido por vista ── */}

        {activeVista === 'resumen' &&
          (loading ? (
            <Skeleton />
          ) : error ? (
            <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
              <p className="text-red-600 text-sm font-semibold">{error}</p>
            </div>
          ) : !data || !k ? null : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICardAnalisis
                  label="Total recaudado"
                  valor={fmtCRC(k.total)}
                  sub={`${fmtFecha(ini)} – ${fmtFecha(fin)}`}
                  color="#16a34a"
                />
                <KPICardAnalisis
                  label="Clientes que pagaron"
                  valor={`${k.n_clientes}`}
                  sub={`${k.n_pagos} pagos`}
                  color="#003B5C"
                />
                <KPICardAnalisis
                  label="Promedio diario"
                  valor={fmtCRC(promedioDiario)}
                  sub={`${k.dias} días`}
                  color="#009ee3"
                />
                <KPICardAnalisis
                  label="Pagos registrados"
                  valor={`${k.n_pagos}`}
                  sub="en el período"
                  color="#f59e0b"
                />
              </div>
              {esAnalista && meta > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <KPICardAnalisis
                    label="Meta del mes"
                    valor={fmtCRC(meta)}
                    sub="objetivo mensual"
                    color="#003B5C"
                  />
                  <KPICardAnalisis
                    label="Alcance de meta"
                    valor={`${pctAlcance}%`}
                    sub={`${fmtCRC(k.total)} cobrado`}
                    color={pctAlcance >= 80 ? '#16a34a' : pctAlcance >= 50 ? '#f59e0b' : '#dc2626'}
                  />
                </div>
              )}
              {chart.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 p-4">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Recaudo diario
                  </p>
                  <div style={{ width: '100%', height: '200px' }}>
                    <ResponsiveContainer>
                      <AreaChart data={chart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gRP" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#16a34a" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
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
                        <Tooltip formatter={(v: any) => fmtCRC(Number(v))} />
                        <Area
                          type="monotone"
                          dataKey="monto"
                          stroke="#16a34a"
                          strokeWidth={2}
                          fill="url(#gRP)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {(group === 'vendedor' || !esAnalista) && data.grupos && data.grupos.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                      Recaudo por {group === 'vendedor' ? 'vendedor' : 'analista'}
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        {(
                          [
                            ['#', 'center'],
                            [group === 'vendedor' ? 'Vendedor' : 'Analista', 'left'],
                            ['Clientes', 'right'],
                            ['Pagos', 'right'],
                            ['Recaudado', 'right'],
                          ] as [string, React.CSSProperties['textAlign']][]
                        ).map(([l, a]) => (
                          <th
                            key={l}
                            style={{
                              padding: '8px 12px',
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
                      {data.grupos.map((g, i) => (
                        <tr key={g.nombre} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td
                            style={{
                              padding: '9px 12px',
                              textAlign: 'center',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#94a3b8',
                            }}
                          >
                            {i + 1}
                          </td>
                          <td
                            style={{
                              padding: '9px 12px',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: '#0f172a',
                            }}
                          >
                            {g.nombre}
                          </td>
                          <td
                            style={{
                              padding: '9px 12px',
                              textAlign: 'right',
                              fontSize: '12px',
                              color: '#374151',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {g.n_clientes}
                          </td>
                          <td
                            style={{
                              padding: '9px 12px',
                              textAlign: 'right',
                              fontSize: '12px',
                              color: '#64748b',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {g.n_pagos}
                          </td>
                          <td
                            style={{
                              padding: '9px 12px',
                              textAlign: 'right',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: '#16a34a',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {fmtCRC(g.cobrado)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    Top clientes que pagaron
                  </span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {(
                        [
                          ['Cliente', 'left'],
                          [esAnalista ? 'Vendedor' : 'Analista', 'left'],
                          ['Recaudado', 'right'],
                        ] as [string, React.CSSProperties['textAlign']][]
                      ).map(([l, a]) => (
                        <th
                          key={l}
                          style={{
                            padding: '8px 12px',
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
                    {data.top_clientes.map((c) => (
                      <tr key={c.cliente_cod} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td
                          style={{
                            padding: '8px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#0f172a',
                          }}
                        >
                          {c.cliente_nombre}
                          <span
                            style={{
                              fontSize: '10px',
                              color: '#94a3b8',
                              marginLeft: '6px',
                              fontFamily: 'monospace',
                            }}
                          >
                            {c.cliente_cod}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '11px', color: '#475569' }}>
                          {esAnalista ? c.vendedor : c.analista}
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            textAlign: 'right',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#16a34a',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {fmtCRC(c.cobrado)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ))}

        {activeVista === 'tramos' && (
          <RecuperacionTramos
            esAnalista={esAnalista}
            userEmail={userEmail}
            ini={ini}
            fin={fin}
            group={group}
            generadoPor={generadoPor}
            registerExport={(h) => {
              tramosExportRef.current = h;
            }}
          />
        )}

        {activeVista === 'mom' && (
          <RecuperacionMom
            esAnalista={esAnalista}
            userEmail={userEmail}
            generadoPor={generadoPor}
            registerExport={(h) => {
              momExportRef.current = h;
            }}
          />
        )}

        {activeVista === 'sin-pago' && (
          <TabSinPago
            anio={sinPagoAnio}
            mes={sinPagoMes}
            mesLabel={`${MESES[sinPagoMes - 1]} ${sinPagoAnio}`}
            generadoPor={generadoPor}
            filtroDim={filtroDim}
          />
        )}
      </div>
    </div>
  );
}
