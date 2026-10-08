'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, FileText, FileSpreadsheet } from 'lucide-react';
import { useMoraVendedorController } from '@/views/reportes/hooks/use-mora-vendedor-controller';
import { fmtCRC } from '@/lib/utils/formato';
import { safeFilename } from '@/lib/utils/estado-cuenta-export';
import { calcAvaluoRiesgo, colorAvaluo, badgeAvaluo } from '@/lib/utils/riesgo';
import ReporteShell from '@/components/reportes/ReporteShell';
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis';
import DetalleBloqueados from './detalle-bloqueados';
import { exportTablaPDF, exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';
import type { RemitenteCorreo } from '@/lib/reportes/email-vendedor';
import type { MoraVendedorResult, MoraVendedorRow, MoraVendedorCliente } from '@/types/reportes';

type Vista = 'resumen' | 'detalle';

// Anchos de columna de la tabla resumen — compartidos con las filas de
// detalle de clientes (drill-down) para que ambas alineen perfectamente.
// # | Código | Vendedor | Cartera | No venc | 1-30 | 31-60 | 61-90 | 91-120 | +120 | Mora tot | %Mora | Avalúo
const COLS_MORA = ['3%', '8%', '16%', '9%', '8%', '7%', '7%', '7%', '7%', '7%', '8%', '6%', '7%'];

// Formato uniforme para todas las columnas de montos (mismo estilo que Cartera)
const TD_MONTO: React.CSSProperties = {
  padding: '9px 10px',
  textAlign: 'right',
  fontSize: '11px',
  color: '#475569',
  fontVariantNumeric: 'tabular-nums',
};

// Los montos en ₡0 se muestran como "—" (menos ruido visual en filas con muchas columnas de tramo)
function montoOrDash(n: number): string {
  return n === 0 ? '—' : fmtCRC(n);
}

// Mismo criterio para el export PDF/Excel: convierte los montos en 0 a null
// para que fmtCelda/valorExcel (export-tabla.ts) los rendericen en blanco.
const CRC_KEYS = [
  'cartera_total',
  'no_vencido',
  'mora_1_30',
  'mora_31_60',
  'mora_61_90',
  'mora_91_120',
  'mora_120_plus',
  'mora_total',
] as const;
function conDash<T extends Record<string, unknown>>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = { ...obj };
  CRC_KEYS.forEach((k) => {
    if (out[k] === 0) out[k] = null;
  });
  return out;
}

function avaluoDe(
  t: {
    no_vencido: number;
    mora_1_30: number;
    mora_31_60: number;
    mora_61_90: number;
    mora_91_120: number;
    mora_120_plus: number;
  },
  cartera: number,
) {
  return calcAvaluoRiesgo(
    {
      noVencido: t.no_vencido,
      m1_30: t.mora_1_30,
      m31_60: t.mora_31_60,
      m61_90: t.mora_61_90,
      m91_120: t.mora_91_120,
      m120_plus: t.mora_120_plus,
    },
    cartera,
  ).avaluoPct;
}

// ── Columnas para export ──────────────────────────────────────────────────
// Mismas columnas que la pantalla. Anchos para A4 landscape (CW = 273mm)
const COLUMNAS: ColumnaReporte[] = [
  { key: 'vendedor_cod', label: 'Código', align: 'left', format: 'text', width: 18 },
  { key: 'vendedor_nombre', label: 'Vendedor', align: 'left', format: 'text', width: 40 },
  { key: 'cartera_total', label: 'Cartera', align: 'right', format: 'crc', width: 25 },
  { key: 'no_vencido', label: 'No vencido', align: 'right', format: 'crc', width: 23 },
  { key: 'mora_1_30', label: '1-30d', align: 'right', format: 'crc', width: 22 },
  { key: 'mora_31_60', label: '31-60d', align: 'right', format: 'crc', width: 22 },
  { key: 'mora_61_90', label: '61-90d', align: 'right', format: 'crc', width: 22 },
  { key: 'mora_91_120', label: '91-120d', align: 'right', format: 'crc', width: 22 },
  { key: 'mora_120_plus', label: '+120d', align: 'right', format: 'crc', width: 22 },
  { key: 'mora_total', label: 'Mora total', align: 'right', format: 'crc', width: 24 },
  { key: 'pct_mora', label: '% Mora', align: 'right', format: 'pct', width: 12 },
  { key: 'avaluo_pct', label: 'Avalúo Riesgo', align: 'right', format: 'pct', width: 14 },
];

// Columnas para el export del detalle de clientes de UN vendedor (drill-down)
const COLUMNAS_CLIENTE: ColumnaReporte[] = [
  { key: 'cliente_cod', label: 'Código', align: 'left', format: 'text', width: 20 },
  { key: 'cliente_nombre', label: 'Cliente', align: 'left', format: 'text', width: 45 },
  { key: 'cartera_total', label: 'Cartera', align: 'right', format: 'crc', width: 24 },
  { key: 'no_vencido', label: 'No vencido', align: 'right', format: 'crc', width: 22 },
  { key: 'mora_1_30', label: '1-30d', align: 'right', format: 'crc', width: 22 },
  { key: 'mora_31_60', label: '31-60d', align: 'right', format: 'crc', width: 22 },
  { key: 'mora_61_90', label: '61-90d', align: 'right', format: 'crc', width: 22 },
  { key: 'mora_91_120', label: '91-120d', align: 'right', format: 'crc', width: 22 },
  { key: 'mora_120_plus', label: '+120d', align: 'right', format: 'crc', width: 22 },
  { key: 'mora_total', label: 'Mora total', align: 'right', format: 'crc', width: 24 },
  { key: 'pct_mora', label: '% Mora', align: 'right', format: 'pct', width: 12 },
  { key: 'avaluo_pct', label: 'Avalúo Riesgo', align: 'right', format: 'pct', width: 14 },
];

const BTN_MINI: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  borderRadius: 6,
  fontSize: '10px',
  fontWeight: 600,
  color: '#64748b',
  border: '1px solid #e2e8f0',
  background: 'white',
  cursor: 'pointer',
};

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border h-20 animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-xl border h-80 animate-pulse" />
    </div>
  );
}

interface Props {
  generadoPor: string;
  remitente: RemitenteCorreo;
  userRol: 'COORDINADOR' | 'ANALISTA' | 'GERENCIA';
  userEmail: string;
}

export default function MoraVendedorCliente({ generadoPor, remitente, userRol, userEmail }: Props) {
  const [vista, setVista] = useState<Vista>('resumen');
  // ANALISTA acota a su propia cartera (mismo patrón que fn_reporte_bloqueados)
  const { data, loading, error, reload: fetchData } = useMoraVendedorController(userRol, userEmail);
  const [supervisor, setSupervisor] = useState('');
  const [exportando, setExportando] = useState(false);
  const [exportandoClientes, setExportandoClientes] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(cod: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cod)) next.delete(cod);
      else next.add(cod);
      return next;
    });
  }

  // Toggle Resumen ↔ Detalle (compartido por ambas vistas)
  const toggle = (
    <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: '#E2E8F0' }}>
      {(
        [
          ['resumen', 'Resumen de mora'],
          ['detalle', 'Clientes bloqueados'],
        ] as [Vista, string][]
      ).map(([v, label]) => (
        <button
          key={v}
          onClick={() => setVista(v)}
          className="px-3 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap"
          style={{
            background: vista === v ? 'white' : 'transparent',
            color: vista === v ? '#003B5C' : '#94a3b8',
            boxShadow: vista === v ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  // Vista Detalle (clientes bloqueados) — componente propio con su panel de envío
  if (vista === 'detalle')
    return (
      <DetalleBloqueados
        toggle={toggle}
        remitente={remitente}
        userRol={userRol}
        userEmail={userEmail}
      />
    );

  if (loading)
    return (
      <div className="px-5 py-5">
        <Skeleton />
      </div>
    );
  if (error)
    return (
      <div className="px-5 py-5">
        <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
          <p className="text-red-600 text-sm font-semibold">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 text-[#009ee3] text-sm font-semibold hover:underline"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  if (!data) return null;

  const { kpis, rows } = data;
  const supervisores = [
    ...new Set(rows.map((r) => r.supervisor_cod).filter((s) => s && s !== '—')),
  ].sort();
  const rowsFiltradas = rows.filter((r) => !supervisor || r.supervisor_cod === supervisor);

  // Totales de la vista filtrada
  const tot = rowsFiltradas.reduce(
    (acc, r) => ({
      total_clientes: acc.total_clientes + r.total_clientes,
      cartera_total: acc.cartera_total + r.cartera_total,
      no_vencido: acc.no_vencido + r.no_vencido,
      mora_1_30: acc.mora_1_30 + r.mora_1_30,
      mora_31_60: acc.mora_31_60 + r.mora_31_60,
      mora_61_90: acc.mora_61_90 + r.mora_61_90,
      mora_91_120: acc.mora_91_120 + r.mora_91_120,
      mora_120_plus: acc.mora_120_plus + r.mora_120_plus,
      mora_total: acc.mora_total + r.mora_total,
    }),
    {
      total_clientes: 0,
      cartera_total: 0,
      no_vencido: 0,
      mora_1_30: 0,
      mora_31_60: 0,
      mora_61_90: 0,
      mora_91_120: 0,
      mora_120_plus: 0,
      mora_total: 0,
    },
  );
  const totPctMora =
    tot.cartera_total > 0 ? Math.round((tot.mora_total / tot.cartera_total) * 1000) / 10 : 0;

  function exportParams() {
    const sufijo = supervisor ? `-${supervisor}` : '';
    // Softland puede generar mora_91_120 negativa — clampear a 0 en el PDF
    const filasNorm = rowsFiltradas.map((r) =>
      conDash({
        ...r,
        mora_61_90: Math.max(0, r.mora_61_90),
        mora_91_120: Math.max(0, r.mora_91_120),
        mora_120_plus: Math.max(0, r.mora_120_plus),
        mora_total: Math.max(0, r.mora_total),
        avaluo_pct: Math.round(avaluoDe(r, r.cartera_total) * 10) / 10,
      }),
    );
    const totNorm = conDash({
      ...tot,
      mora_61_90: Math.max(0, tot.mora_61_90),
      mora_91_120: Math.max(0, tot.mora_91_120),
      mora_120_plus: Math.max(0, tot.mora_120_plus),
      mora_total: Math.max(0, tot.mora_total),
    });
    const totAvaluo = Math.round(avaluoDe(tot, tot.cartera_total) * 10) / 10;
    return {
      filas: filasNorm as unknown as Record<string, unknown>[],
      columnas: COLUMNAS,
      titulo: 'Mora por Vendedor',
      subtitulo: supervisor ? `Supervisor: ${supervisor}` : 'Todos los vendedores',
      meta: [
        { label: 'Cartera total', value: fmtCRC(tot.cartera_total) },
        { label: 'Mora total', value: fmtCRC(totNorm.mora_total) },
        { label: '% Mora', value: `${totPctMora}%` },
        { label: 'Avalúo Riesgo', value: `${totAvaluo}%` },
        { label: 'Vendedores', value: `${rowsFiltradas.length}` },
      ],
      totales: { ...totNorm, pct_mora: totPctMora, avaluo_pct: totAvaluo },
      orientacion: 'landscape' as const,
      nombreArchivo: `mora-por-vendedor${sufijo}`,
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

  // Export del detalle de clientes de UN vendedor (drill-down expandido)
  function exportParamsCliente(row: MoraVendedorRow) {
    const filasNorm = row.clientes.map((c) =>
      conDash({
        ...c,
        mora_61_90: Math.max(0, c.mora_61_90),
        mora_91_120: Math.max(0, c.mora_91_120),
        mora_120_plus: Math.max(0, c.mora_120_plus),
        mora_total: Math.max(0, c.mora_total),
        avaluo_pct: Math.round(avaluoDe(c, c.cartera_total) * 10) / 10,
      }),
    );
    const totCliente = row.clientes.reduce(
      (acc, c) => ({
        cartera_total: acc.cartera_total + c.cartera_total,
        no_vencido: acc.no_vencido + c.no_vencido,
        mora_1_30: acc.mora_1_30 + c.mora_1_30,
        mora_31_60: acc.mora_31_60 + c.mora_31_60,
        mora_61_90: acc.mora_61_90 + c.mora_61_90,
        mora_91_120: acc.mora_91_120 + c.mora_91_120,
        mora_120_plus: acc.mora_120_plus + c.mora_120_plus,
        mora_total: acc.mora_total + c.mora_total,
      }),
      {
        cartera_total: 0,
        no_vencido: 0,
        mora_1_30: 0,
        mora_31_60: 0,
        mora_61_90: 0,
        mora_91_120: 0,
        mora_120_plus: 0,
        mora_total: 0,
      },
    );
    const totPct =
      totCliente.cartera_total > 0
        ? Math.round((totCliente.mora_total / totCliente.cartera_total) * 1000) / 10
        : 0;
    const totAvaluo = Math.round(avaluoDe(totCliente, totCliente.cartera_total) * 10) / 10;
    return {
      filas: filasNorm as unknown as Record<string, unknown>[],
      columnas: COLUMNAS_CLIENTE,
      titulo: `Clientes de ${row.vendedor_nombre}`,
      subtitulo: `Código ${row.vendedor_cod} · ${row.clientes.length} cliente${row.clientes.length !== 1 ? 's' : ''}`,
      meta: [
        { label: 'Cartera total', value: fmtCRC(totCliente.cartera_total) },
        { label: 'Mora total', value: fmtCRC(totCliente.mora_total) },
        { label: '% Mora', value: `${totPct}%` },
        { label: 'Avalúo Riesgo', value: `${totAvaluo}%` },
      ],
      totales: conDash({
        cliente_nombre: 'TOTAL',
        ...totCliente,
        pct_mora: totPct,
        avaluo_pct: totAvaluo,
      }),
      orientacion: 'landscape' as const,
      nombreArchivo: `clientes-${row.vendedor_cod}-${safeFilename(row.vendedor_nombre)}`,
      generadoPor,
    };
  }

  async function onPDFCliente(row: MoraVendedorRow) {
    setExportandoClientes(true);
    try {
      await exportTablaPDF(exportParamsCliente(row));
    } finally {
      setExportandoClientes(false);
    }
  }
  async function onExcelCliente(row: MoraVendedorRow) {
    setExportandoClientes(true);
    try {
      await exportTablaExcel(exportParamsCliente(row));
    } finally {
      setExportandoClientes(false);
    }
  }

  const filtros = (
    <div className="flex flex-wrap items-center gap-3">
      {toggle}
      {supervisores.length > 0 && (
        <select
          value={supervisor}
          onChange={(e) => setSupervisor(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] bg-white text-gray-700 focus:outline-none"
          style={{ minWidth: '180px' }}
        >
          <option value="">Todos los supervisores</option>
          {supervisores.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  const kpisStrip = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KPICardAnalisis
        label="Cartera total"
        valor={fmtCRC(kpis.cartera_total)}
        sub="sync más reciente"
        color="#003B5C"
      />
      <KPICardAnalisis
        label="Mora total"
        valor={fmtCRC(kpis.mora_total)}
        sub="saldo vencido"
        color="#dc2626"
      />
      <KPICardAnalisis
        label="% Mora"
        valor={`${kpis.pct_mora}%`}
        sub="sobre cartera"
        color="#f59e0b"
      />
      <KPICardAnalisis
        label="Vendedores"
        valor={`${kpis.total_vendedores}`}
        sub="con cartera"
        color="#009ee3"
      />
    </div>
  );

  return (
    <ReporteShell
      filtros={filtros}
      kpis={kpisStrip}
      onExportPDF={onPDF}
      onExportExcel={onExcel}
      exportando={exportando}
    >
      {userRol === 'ANALISTA' && (
        <p className="text-[11px] text-gray-400 -mt-1">
          Mostrando solo los vendedores de tu cartera asignada.
        </p>
      )}
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            {rowsFiltradas.length} vendedor{rowsFiltradas.length !== 1 ? 'es' : ''}
          </span>
          <span className="text-[11px] text-gray-400">Ordenado por mayor mora</span>
        </div>

        <table
          style={{
            tableLayout: 'fixed',
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: '1080px',
          }}
        >
          <colgroup>
            {COLS_MORA.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {(
                [
                  ['#', 'center'],
                  ['Código', 'left'],
                  ['Vendedor', 'left'],
                  ['Cartera', 'right'],
                  ['No vencido', 'right'],
                  ['1-30d', 'right'],
                  ['31-60d', 'right'],
                  ['61-90d', 'right'],
                  ['91-120d', 'right'],
                  ['+120d', 'right'],
                  ['Mora total', 'right'],
                  ['% Mora', 'right'],
                  ['Avalúo Riesgo', 'center'],
                ] as [string, React.CSSProperties['textAlign']][]
              ).map(([l, a]) => (
                <th
                  key={l}
                  style={{
                    padding: '8px 10px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    textAlign: a,
                  }}
                >
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsFiltradas.map((row: MoraVendedorRow, idx) => {
              const pctColor =
                row.pct_mora > 30 ? '#dc2626' : row.pct_mora >= 15 ? '#f59e0b' : '#16a34a';
              const avaluoPct = avaluoDe(row, row.cartera_total);
              const isOpen = expanded.has(row.vendedor_cod);
              return (
                <Fragment key={`${row.vendedor_cod}-${idx}`}>
                  <tr
                    style={{
                      borderBottom: isOpen ? 'none' : '1px solid #f1f5f9',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onClick={() => toggleExpand(row.vendedor_cod)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td
                      style={{
                        padding: '9px 10px',
                        textAlign: 'center',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: '#94a3b8',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {isOpen ? (
                          <ChevronDown size={13} color="#94a3b8" />
                        ) : (
                          <ChevronRight size={13} color="#94a3b8" />
                        )}
                        {idx + 1}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '9px 10px',
                        fontSize: '11px',
                        color: '#94a3b8',
                        fontFamily: 'monospace',
                      }}
                    >
                      {row.vendedor_cod}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <p
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#0f172a',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.vendedor_nombre}
                      </p>
                    </td>
                    <td style={TD_MONTO}>{montoOrDash(row.cartera_total)}</td>
                    <td style={TD_MONTO}>{montoOrDash(row.no_vencido)}</td>
                    <td style={TD_MONTO}>{montoOrDash(row.mora_1_30)}</td>
                    <td style={TD_MONTO}>{montoOrDash(row.mora_31_60)}</td>
                    <td style={TD_MONTO}>{montoOrDash(row.mora_61_90)}</td>
                    <td style={TD_MONTO}>{montoOrDash(row.mora_91_120)}</td>
                    <td style={TD_MONTO}>{montoOrDash(row.mora_120_plus)}</td>
                    <td style={{ ...TD_MONTO, fontWeight: 700 }}>{montoOrDash(row.mora_total)}</td>
                    <td style={{ ...TD_MONTO, fontWeight: 700, color: pctColor }}>
                      {row.pct_mora}%
                    </td>
                    <td
                      style={{
                        ...TD_MONTO,
                        textAlign: 'center',
                        fontWeight: 700,
                        color: colorAvaluo(avaluoPct),
                      }}
                      title={badgeAvaluo(avaluoPct)}
                    >
                      {avaluoPct.toFixed(1)}%
                    </td>
                  </tr>

                  {isOpen && row.clientes.length > 0 && (
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <td colSpan={13} style={{ padding: '5px 10px 5px 28px' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              color: '#64748b',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {row.clientes.length} cliente{row.clientes.length !== 1 ? 's' : ''} de{' '}
                            {row.vendedor_nombre}
                          </span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onPDFCliente(row);
                              }}
                              disabled={exportandoClientes}
                              style={BTN_MINI}
                            >
                              <FileText size={11} /> PDF
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onExcelCliente(row);
                              }}
                              disabled={exportandoClientes}
                              style={BTN_MINI}
                            >
                              <FileSpreadsheet size={11} /> Excel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {isOpen &&
                    row.clientes.map((c: MoraVendedorCliente) => {
                      const cPctColor =
                        c.pct_mora > 30 ? '#dc2626' : c.pct_mora >= 15 ? '#f59e0b' : '#16a34a';
                      const cAvaluo = avaluoDe(c, c.cartera_total);
                      return (
                        <tr
                          key={c.cliente_cod}
                          style={{ background: '#fafbfc', borderBottom: '1px solid #f1f5f9' }}
                        >
                          <td></td>
                          <td colSpan={2} style={{ padding: '7px 10px 7px 18px' }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: 8,
                                overflow: 'hidden',
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '10px',
                                  color: '#94a3b8',
                                  fontFamily: 'monospace',
                                  flexShrink: 0,
                                  width: 76,
                                  display: 'inline-block',
                                }}
                              >
                                {c.cliente_cod}
                              </span>
                              <Link
                                href={`/clientes/${encodeURIComponent(c.cliente_cod)}?volver=${encodeURIComponent('/reportes/mora-vendedor')}`}
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  color: '#009ee3',
                                  textDecoration: 'none',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                onClick={(e) => e.stopPropagation()}
                                title={c.cliente_nombre}
                              >
                                {c.cliente_nombre}
                              </Link>
                            </div>
                          </td>
                          <td style={{ ...TD_MONTO, padding: '7px 10px' }}>
                            {montoOrDash(c.cartera_total)}
                          </td>
                          <td style={{ ...TD_MONTO, padding: '7px 10px' }}>
                            {montoOrDash(c.no_vencido)}
                          </td>
                          <td style={{ ...TD_MONTO, padding: '7px 10px' }}>
                            {montoOrDash(c.mora_1_30)}
                          </td>
                          <td style={{ ...TD_MONTO, padding: '7px 10px' }}>
                            {montoOrDash(c.mora_31_60)}
                          </td>
                          <td style={{ ...TD_MONTO, padding: '7px 10px' }}>
                            {montoOrDash(c.mora_61_90)}
                          </td>
                          <td style={{ ...TD_MONTO, padding: '7px 10px' }}>
                            {montoOrDash(c.mora_91_120)}
                          </td>
                          <td style={{ ...TD_MONTO, padding: '7px 10px' }}>
                            {montoOrDash(c.mora_120_plus)}
                          </td>
                          <td style={{ ...TD_MONTO, padding: '7px 10px', fontWeight: 700 }}>
                            {montoOrDash(c.mora_total)}
                          </td>
                          <td
                            style={{
                              ...TD_MONTO,
                              padding: '7px 10px',
                              fontWeight: 700,
                              color: cPctColor,
                            }}
                          >
                            {c.pct_mora}%
                          </td>
                          <td
                            style={{
                              ...TD_MONTO,
                              padding: '7px 10px',
                              textAlign: 'center',
                              fontWeight: 700,
                              color: colorAvaluo(cAvaluo),
                            }}
                            title={badgeAvaluo(cAvaluo)}
                          >
                            {cAvaluo.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  {isOpen && row.clientes.length === 0 && (
                    <tr style={{ background: '#fafbfc', borderBottom: '1px solid #f1f5f9' }}>
                      <td
                        colSpan={13}
                        style={{
                          padding: '10px 10px 10px 28px',
                          fontSize: '11px',
                          color: '#94a3b8',
                        }}
                      >
                        Sin clientes con cartera activa.
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
              <td
                colSpan={3}
                style={{
                  padding: '10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#003B5C',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Total
              </td>
              <td
                style={{
                  padding: '10px',
                  textAlign: 'right',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#003B5C',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {montoOrDash(tot.cartera_total)}
              </td>
              <td
                style={{
                  padding: '10px',
                  textAlign: 'right',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#003B5C',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {montoOrDash(tot.no_vencido)}
              </td>
              <td
                style={{
                  padding: '10px',
                  textAlign: 'right',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#003B5C',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {montoOrDash(tot.mora_1_30)}
              </td>
              <td
                style={{
                  padding: '10px',
                  textAlign: 'right',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#003B5C',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {montoOrDash(tot.mora_31_60)}
              </td>
              <td
                style={{
                  padding: '10px',
                  textAlign: 'right',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#003B5C',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {montoOrDash(tot.mora_61_90)}
              </td>
              <td
                style={{
                  padding: '10px',
                  textAlign: 'right',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#003B5C',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {montoOrDash(tot.mora_91_120)}
              </td>
              <td
                style={{
                  padding: '10px',
                  textAlign: 'right',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#003B5C',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {montoOrDash(tot.mora_120_plus)}
              </td>
              <td
                style={{
                  padding: '10px',
                  textAlign: 'right',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#003B5C',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {montoOrDash(tot.mora_total)}
              </td>
              <td
                style={{
                  padding: '10px',
                  textAlign: 'right',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: totPctMora > 30 ? '#dc2626' : totPctMora >= 15 ? '#f59e0b' : '#16a34a',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {totPctMora}%
              </td>
              <td
                style={{
                  padding: '10px',
                  textAlign: 'center',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: colorAvaluo(avaluoDe(tot, tot.cartera_total)),
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {avaluoDe(tot, tot.cartera_total).toFixed(1)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReporteShell>
  );
}
