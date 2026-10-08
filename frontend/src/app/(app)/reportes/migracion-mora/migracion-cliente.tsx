'use client';

import { useState } from 'react';
import { useMigracionMoraController } from '@/views/reportes/hooks/use-migracion-mora-controller';
import { fmtCRC, fmtKPI } from '@/lib/utils/formato';
import ReporteShell from '@/components/reportes/ReporteShell';
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis';
import { exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';
import { exportMigracionMoraPDF } from '@/lib/reportes/migracion-mora-pdf';
import type { MigracionMoraResult } from '@/types/reportes';

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

// Tramos origen (mes anterior) y columnas destino (mes actual, + Pagado)
const TRAMOS = ['NO_VENCIDO', '1_30', '31_60', '61_90', '91_120', '120_PLUS'] as const;
const DESTINOS = [...TRAMOS, 'PAGADO'] as const;
const LABEL: Record<string, string> = {
  NO_VENCIDO: 'No vencido',
  '1_30': '1–30',
  '31_60': '31–60',
  '61_90': '61–90',
  '91_120': '91–120',
  '120_PLUS': '+120',
  PAGADO: 'Pagado',
};

interface Props {
  generadoPor: string;
}
interface Vend {
  cod: string;
  nombre: string;
  supervisor_cod: string | null;
}
interface Sup {
  cod: string;
  nombre: string;
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border h-20 animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-xl border h-80 animate-pulse" />
    </div>
  );
}

// Color condicional: cuellos de botella (rodamiento a un tramo peor) en rojo/ámbar; pagado en verde
function cellStyle(fromIdx: number, to: string, pct: number): React.CSSProperties {
  if (to === 'PAGADO') return { background: '#f0fdf4', color: '#15803d' };
  const toIdx = (TRAMOS as readonly string[]).indexOf(to);
  const peor = toIdx > fromIdx;
  if (peor && pct > 0.5) return { background: '#fef2f2', color: '#b91c1c' };
  if (peor && pct > 0.25) return { background: '#fffbeb', color: '#b45309' };
  return { background: 'transparent', color: '#475569' };
}

export default function MigracionCliente({ generadoPor }: Props) {
  const hoy = new Date(Date.now() - 6 * 3600_000);
  const [anio, setAnio] = useState(hoy.getUTCFullYear());
  const [mes, setMes] = useState(hoy.getUTCMonth() + 1);
  const [exportando, setExportando] = useState(false);
  const [supF, setSupF] = useState('');
  const [venF, setVenF] = useState('');
  // Catálogos de filtro + matriz (controller del módulo reportes)
  const {
    data,
    loading,
    error,
    reload: fetchData,
    sups: supsApi,
    vens: vensApi,
  } = useMigracionMoraController({ anio, mes, supervisorCod: supF, vendedorCod: venF });
  const sups: Sup[] = supsApi;
  const vens: Vend[] = vensApi;

  // Selector: primer mes comparable = junio 2026 (compara contra el cierre de mayo)
  const FLOOR_ANIO = 2026,
    FLOOR_MES = 6;
  const opcionesMes: { anio: number; mes: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    const a = d.getUTCFullYear(),
      m = d.getUTCMonth() + 1;
    if (a * 100 + m >= FLOOR_ANIO * 100 + FLOOR_MES) opcionesMes.push({ anio: a, mes: m });
  }
  const vensFiltrados = supF ? vens.filter((v) => v.supervisor_cod === supF) : vens;

  const selCls =
    'rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] bg-white text-gray-700 focus:outline-none';
  const filtros = (
    <>
      <select
        value={`${anio}-${mes}`}
        onChange={(e) => {
          const [a, m] = e.target.value.split('-').map(Number);
          setAnio(a);
          setMes(m);
        }}
        className={selCls}
      >
        {opcionesMes.map((o) => (
          <option key={`${o.anio}-${o.mes}`} value={`${o.anio}-${o.mes}`}>
            {MESES[o.mes - 1]} {o.anio}
          </option>
        ))}
      </select>
      <select
        value={supF}
        onChange={(e) => {
          setSupF(e.target.value);
          setVenF('');
        }}
        className={selCls}
        style={{ minWidth: '160px' }}
      >
        <option value="">Todos los supervisores</option>
        {sups.map((s) => (
          <option key={s.cod} value={s.cod}>
            {s.nombre}
          </option>
        ))}
      </select>
      <select
        value={venF}
        onChange={(e) => setVenF(e.target.value)}
        className={selCls}
        style={{ minWidth: '160px' }}
      >
        <option value="">Todos los vendedores</option>
        {vensFiltrados.map((v) => (
          <option key={v.cod} value={v.cod}>
            {v.nombre}
          </option>
        ))}
      </select>
    </>
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

  // ── Estado "en preparación": faltan dos cierres consecutivos ──────────────
  if (data && !data.disponible) {
    return (
      <ReporteShell filtros={filtros}>
        <div className="bg-white rounded-xl border border-slate-100 p-10 text-center">
          <div
            className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4"
            style={{ background: '#eff6ff' }}
          >
            <span style={{ color: '#0277a8', fontSize: 22 }}>⏳</span>
          </div>
          <p className="text-[15px] font-bold text-gray-800">Reporte en preparación</p>
          <p className="text-[12px] text-gray-500 mt-2 max-w-md mx-auto">{data.mensaje}</p>
          <p className="text-[11px] text-gray-400 mt-3 max-w-md mx-auto">
            La matriz compara el cierre de cartera de dos meses consecutivos. Se llena
            automáticamente con el cierre mensual (último día de cada mes).
          </p>
        </div>
      </ReporteShell>
    );
  }
  if (!data || !data.matriz) return null;

  const matriz = data.matriz;
  const kpis = data.kpis!;
  const rollColor =
    kpis.roll_critico_pct > 50 ? '#dc2626' : kpis.roll_critico_pct > 25 ? '#f59e0b' : '#16a34a';

  // ── Export Excel (matriz en colones + % por celda, ponderada por saldo origen) ──
  const COLS: ColumnaReporte[] = [
    { key: 'tramo', label: 'Tramo (mes anterior)', align: 'left', format: 'text', width: 22 },
    ...DESTINOS.flatMap((d) => [
      {
        key: `${d}_pct`,
        label: `${LABEL[d]} %`,
        align: 'right' as const,
        format: 'pct' as const,
        width: 10,
      },
      {
        key: d,
        label: `${LABEL[d]} ₡`,
        align: 'right' as const,
        format: 'crc' as const,
        width: 16,
      },
    ]),
    { key: 'saldo_origen', label: 'Saldo origen', align: 'right', format: 'crc', width: 16 },
  ];
  const filasExport = matriz.map((row) => {
    const o: Record<string, unknown> = { tramo: LABEL[row.tramo], saldo_origen: row.saldo_origen };
    DESTINOS.forEach((d) => {
      const monto = row.destinos?.[d] ?? 0;
      o[d] = monto;
      o[`${d}_pct`] = row.saldo_origen > 0 ? Math.round((monto / row.saldo_origen) * 1000) / 10 : 0;
    });
    return o;
  });
  function exportParams() {
    return {
      filas: filasExport,
      columnas: COLS,
      titulo: 'Matriz de Migración de Mora (Roll Rates)',
      subtitulo: `${data!.anterior.label} → ${data!.periodo.label}${data!.provisional ? ' · base provisional' : ''}`,
      meta: [
        { label: 'Rodamiento crítico (91–120 → +120)', value: `${kpis.roll_critico_pct}%` },
        { label: 'Pérdida esperada', value: fmtCRC(kpis.perdida_esperada) },
        { label: 'Vencido actual', value: fmtCRC(kpis.vencido_actual) },
      ],
      orientacion: 'landscape' as const,
      nombreArchivo: `migracion-mora-${anio}-${String(mes).padStart(2, '0')}`,
      generadoPor,
    };
  }
  const filtroLabel = (() => {
    const supNombre = supF ? sups.find((s) => s.cod === supF)?.nombre : null;
    const venNombre = venF ? vens.find((v) => v.cod === venF)?.nombre : null;
    const partes = [
      supNombre ? `Supervisor: ${supNombre}` : null,
      venNombre ? `Vendedor: ${venNombre}` : null,
    ].filter(Boolean) as string[];
    return partes.length ? partes.join(' · ') : null;
  })();
  async function onPDF() {
    setExportando(true);
    try {
      await exportMigracionMoraPDF({
        matriz,
        kpis,
        anteriorLabel: data!.anterior.label,
        periodoLabel: data!.periodo.label,
        provisional: !!data!.provisional,
        filtroLabel,
        generadoPor,
        nombreArchivo: `migracion-mora-${anio}-${String(mes).padStart(2, '0')}`,
      });
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

  const kpiStrip = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <KPICardAnalisis
        label="Rodamiento Crítico"
        valor={`${kpis.roll_critico_pct}%`}
        sub="91–120 → +120 (entra a pérdida)"
        color={rollColor}
      />
      <KPICardAnalisis
        label="Pérdida Esperada"
        valor={fmtKPI(kpis.perdida_esperada)}
        sub="proyección encadenada a +120"
        color="#dc2626"
      />
      <KPICardAnalisis
        label="Vencido Actual"
        valor={fmtKPI(kpis.vencido_actual)}
        sub={`saldo vencido · ${data.periodo.label}`}
        color="#475569"
      />
    </div>
  );

  const thS: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: '10px',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    background: '#f8fafc',
  };

  return (
    <ReporteShell
      filtros={filtros}
      kpis={kpiStrip}
      onExportPDF={onPDF}
      onExportExcel={onExcel}
      exportando={exportando}
    >
      {data.provisional && (
        <div
          className="rounded-xl border px-4 py-3"
          style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}
        >
          <p className="text-[12px] font-semibold" style={{ color: '#0277a8' }}>
            Base provisional
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: '#0369a1' }}>
            El mes base ({data.anterior.label}) usa un cierre aproximado. La matriz será 100% real
            cuando ambos meses tengan cierre definitivo.
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            {data.anterior.label} (filas) → {data.periodo.label} (columnas)
          </span>
          <span className="text-[11px] text-gray-400">% del saldo del tramo · ₡ debajo</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '920px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ ...thS, textAlign: 'left' }}>Tramo origen</th>
              {DESTINOS.map((d) => (
                <th key={d} style={{ ...thS, textAlign: 'right' }}>
                  {LABEL[d]}
                </th>
              ))}
              <th style={{ ...thS, textAlign: 'right' }}>Saldo origen</th>
            </tr>
          </thead>
          <tbody>
            {matriz.map((row) => {
              const fromIdx = (TRAMOS as readonly string[]).indexOf(row.tramo);
              return (
                <tr key={row.tramo} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td
                    style={{
                      padding: '9px 10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#003B5C',
                    }}
                  >
                    {LABEL[row.tramo]}
                  </td>
                  {DESTINOS.map((d) => {
                    const monto = row.destinos?.[d] ?? 0;
                    const pct = row.saldo_origen > 0 ? monto / row.saldo_origen : 0;
                    const st = cellStyle(fromIdx, d, pct);
                    return (
                      <td key={d} style={{ padding: '7px 10px', textAlign: 'right', ...st }}>
                        {monto > 0 ? (
                          <>
                            <div
                              style={{
                                fontSize: '12px',
                                fontWeight: 700,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {(pct * 100).toFixed(1)}%
                            </div>
                            <div
                              style={{
                                fontSize: '10px',
                                opacity: 0.7,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {fmtCRC(monto)}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: '#cbd5e1', fontSize: '12px' }}>—</span>
                        )}
                      </td>
                    );
                  })}
                  <td
                    style={{
                      padding: '9px 10px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#475569',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtCRC(row.saldo_origen)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 px-1 text-[11px] text-gray-500">
        <span>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 2,
              marginRight: 5,
            }}
          />
          Rodamiento &gt;50% (cuello de botella)
        </span>
        <span>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 2,
              marginRight: 5,
            }}
          />
          Rodamiento 25–50%
        </span>
        <span>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 2,
              marginRight: 5,
            }}
          />
          Pagado / recuperado
        </span>
      </div>
    </ReporteShell>
  );
}
