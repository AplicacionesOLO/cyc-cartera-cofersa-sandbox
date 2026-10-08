'use client';

import { useState, useMemo } from 'react';
import { useCeiController } from '@/views/reportes/hooks/use-cei-controller';
import { fmtCRC, fmtKPI } from '@/lib/utils/formato';
import ReporteShell from '@/components/reportes/ReporteShell';
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis';
import { exportTablaPDF, exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';
import type { CeiVendedorRow } from '@/types/reportes';

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
const nombreCorto = (n: string) => n.trim().split(/\s+/).slice(0, 2).join(' ');
const ceiColor = (c: number | null) =>
  c === null ? '#94a3b8' : c >= 60 ? '#16a34a' : c >= 40 ? '#f59e0b' : '#dc2626';

const COLS: ColumnaReporte[] = [
  { key: 'vendedor_nombre', label: 'Vendedor', align: 'left', format: 'text', width: 48 },
  { key: 'supervisor_nombre', label: 'Supervisor', align: 'left', format: 'text', width: 36 },
  { key: 'analista_nombre', label: 'Analista', align: 'left', format: 'text', width: 36 },
  { key: 'cobrado', label: 'Cobrado', align: 'right', format: 'crc', width: 34 },
  { key: 'vencido', label: 'Saldo vencido', align: 'right', format: 'crc', width: 34 },
  { key: 'cei', label: 'CEI %', align: 'right', format: 'pct', width: 18 },
];

interface Props {
  generadoPor: string;
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border h-20 animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-xl border h-72 animate-pulse" />
    </div>
  );
}

export default function CeiCliente({ generadoPor }: Props) {
  const hoy = new Date(Date.now() - 6 * 3600_000);
  const [anio, setAnio] = useState(hoy.getUTCFullYear());
  const [mes, setMes] = useState(hoy.getUTCMonth() + 1);
  const {
    data: rows,
    loading,
    error,
    reload: fetchData,
    snapping,
    tomarCierre: guardarCierre,
  } = useCeiController(anio, mes);
  const data: CeiVendedorRow[] = rows ?? [];
  const [exportando, setExportando] = useState(false);
  const [supervisorF, setSupervisorF] = useState('');
  const [analistaF, setAnalistaF] = useState('');

  // Cierre manual: guarda la cartera vencida actual como cierre del mes en curso
  // (= apertura del mes siguiente). Respaldo del cron automático de fin de mes.
  async function tomarCierre() {
    const ca = hoy.getUTCFullYear(),
      cm = hoy.getUTCMonth() + 1;
    if (
      !confirm(
        `Esto guardará la cartera vencida ACTUAL como cierre de ${MESES[cm - 1]} ${ca}, que será la apertura del CEI del mes siguiente. ¿Continuar?`,
      )
    )
      return;
    try {
      await guardarCierre(ca, cm);
      alert(`Cierre de ${MESES[cm - 1]} ${ca} guardado.`);
      fetchData();
    } catch {
      alert('No se pudo guardar el cierre de cartera.');
    }
  }

  // Primer mes con apertura disponible. Mayo no quedó guardado por vendedor, así que
  // el CEI arranca en junio 2026 (apertura provisional) y será real desde julio.
  const FLOOR_ANIO = 2026,
    FLOOR_MES = 6;
  const opcionesMes: { anio: number; mes: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    const a = d.getUTCFullYear(),
      m = d.getUTCMonth() + 1;
    if (a * 100 + m >= FLOOR_ANIO * 100 + FLOOR_MES) opcionesMes.push({ anio: a, mes: m });
  }
  const mesLabel = `${MESES[mes - 1]} ${anio}`;

  // Estado de la apertura (cierre del mes anterior) que usa el CEI como denominador
  const provisional = data.length > 0 && !!data[0]?.provisional;
  const sinApertura = !loading && data.length > 0 && data.every((r) => r.vencido === 0);
  const apLabel = data[0]?.apertura_mes
    ? `${MESES[data[0].apertura_mes - 1]} ${data[0].apertura_anio}`
    : 'mes anterior';

  const supervisores = useMemo(() => {
    const m = new Map<string, string>();
    data.forEach((r) => {
      if (r.supervisor_cod) m.set(r.supervisor_cod, r.supervisor_nombre);
    });
    return [...m.entries()]
      .map(([cod, nombre]) => ({ cod, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [data]);
  const analistas = useMemo(() => {
    const m = new Map<string, string>();
    data.forEach((r) => {
      if (r.analista_email) m.set(r.analista_email, r.analista_nombre);
    });
    return [...m.entries()]
      .map(([email, nombre]) => ({ email, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [data]);

  const filtrados = useMemo(
    () =>
      data.filter(
        (r) =>
          (!supervisorF || r.supervisor_cod === supervisorF) &&
          (!analistaF || r.analista_email === analistaF),
      ),
    [data, supervisorF, analistaF],
  );

  const totCob = filtrados.reduce((s, r) => s + r.cobrado, 0);
  const totVen = filtrados.reduce((s, r) => s + r.vencido, 0);
  const ceiGlobal = totVen > 0 ? Math.round((totCob / totVen) * 1000) / 10 : 0;
  const conCei = filtrados.filter((r) => r.cei !== null && r.vencido > 0);
  const top = conCei.length ? conCei.reduce((a, b) => (b.cei! > a.cei! ? b : a)) : null;
  const critico = conCei.length ? conCei.reduce((a, b) => (b.cei! < a.cei! ? b : a)) : null;

  const porSup = useMemo(() => {
    const m = new Map<string, { nombre: string; cob: number; ven: number; n: number }>();
    filtrados.forEach((r) => {
      const k = r.supervisor_cod || '—';
      const e = m.get(k) || { nombre: r.supervisor_nombre, cob: 0, ven: 0, n: 0 };
      e.cob += r.cobrado;
      e.ven += r.vencido;
      e.n += 1;
      m.set(k, e);
    });
    return [...m.values()]
      .map((e) => ({ ...e, cei: e.ven > 0 ? Math.round((e.cob / e.ven) * 1000) / 10 : null }))
      .sort((a, b) => b.ven - a.ven);
  }, [filtrados]);

  const detalle = useMemo(() => [...filtrados].sort((a, b) => b.vencido - a.vencido), [filtrados]);

  function exportParams() {
    return {
      filas: detalle as unknown as Record<string, unknown>[],
      columnas: COLS,
      titulo: 'Índice de Efectividad de Cobro (CEI)',
      subtitulo: `${mesLabel} · cobrado del mes vs saldo vencido a la apertura (cierre ${apLabel})${provisional ? ' · apertura provisional' : ''}${supervisorF ? ` · ${supervisores.find((s) => s.cod === supervisorF)?.nombre}` : ''}`,
      meta: [
        { label: 'CEI global', value: `${ceiGlobal}%` },
        { label: 'Cobrado', value: fmtCRC(totCob) },
        { label: 'Saldo vencido', value: fmtCRC(totVen) },
      ],
      totales: { vendedor_nombre: 'TOTAL', cobrado: totCob, vencido: totVen, cei: ceiGlobal },
      orientacion: 'landscape' as const,
      nombreArchivo: `cei-${anio}-${String(mes).padStart(2, '0')}`,
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
        value={supervisorF}
        onChange={(e) => setSupervisorF(e.target.value)}
        className={selCls}
        style={{ minWidth: '160px' }}
      >
        <option value="">Todos los supervisores</option>
        {supervisores.map((s) => (
          <option key={s.cod} value={s.cod}>
            {s.nombre}
          </option>
        ))}
      </select>
      <select
        value={analistaF}
        onChange={(e) => setAnalistaF(e.target.value)}
        className={selCls}
        style={{ minWidth: '160px' }}
      >
        <option value="">Todos los analistas</option>
        {analistas.map((a) => (
          <option key={a.email} value={a.email}>
            {a.nombre}
          </option>
        ))}
      </select>
      <button
        onClick={tomarCierre}
        disabled={snapping}
        className="rounded-lg border px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
        style={{ borderColor: '#009ee3', color: '#009ee3' }}
        title="Guarda la cartera vencida actual como cierre del mes en curso (apertura del mes siguiente)"
      >
        {snapping ? 'Guardando…' : 'Tomar cierre de cartera'}
      </button>
    </>
  );

  const kpis = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <KPICardAnalisis
        label="CEI Global"
        valor={`${ceiGlobal}%`}
        sub={`${fmtKPI(totCob)} cobrado · ${fmtKPI(totVen)} vencido`}
        color={ceiColor(ceiGlobal)}
      />
      <KPICardAnalisis
        label="Vendedor Top Cobro"
        valor={top ? `${top.cei}%` : '—'}
        sub={top ? nombreCorto(top.vendedor_nombre) : 'Sin datos'}
        color="#16a34a"
      />
      <KPICardAnalisis
        label="Vendedor Más Crítico"
        valor={critico ? `${critico.cei}%` : '—'}
        sub={critico ? nombreCorto(critico.vendedor_nombre) : 'Sin datos'}
        color="#dc2626"
      />
    </div>
  );

  const thS: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: '10px',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    background: '#f8fafc',
  };
  const tdN: React.CSSProperties = {
    padding: '9px 12px',
    textAlign: 'right',
    fontSize: '12px',
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <ReporteShell
      filtros={filtros}
      kpis={kpis}
      onExportPDF={onPDF}
      onExportExcel={onExcel}
      exportando={exportando}
    >
      {sinApertura ? (
        <div
          className="rounded-xl border px-4 py-3"
          style={{ background: '#fffbeb', borderColor: '#fde68a' }}
        >
          <p className="text-[12px] text-amber-700 font-semibold">
            No hay cierre de cartera para la apertura de {mesLabel}.
          </p>
          <p className="text-[11px] text-amber-600 mt-0.5">
            El CEI necesita el saldo vencido al cierre de {apLabel}. Se generará automáticamente el
            último día de cada mes, o podés tomarlo con “Tomar cierre de cartera”.
          </p>
        </div>
      ) : provisional ? (
        <div
          className="rounded-xl border px-4 py-3"
          style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}
        >
          <p className="text-[12px] font-semibold" style={{ color: '#0277a8' }}>
            Apertura provisional
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: '#0369a1' }}>
            El saldo vencido usa la cartera actual como aproximación del cierre de {apLabel} (no
            quedó guardado a tiempo). El primer CEI con cierre real será Julio 2026.
          </p>
        </div>
      ) : null}

      {totCob === 0 && !sinApertura && (
        <div
          className="rounded-xl border px-4 py-3"
          style={{ background: '#fffbeb', borderColor: '#fde68a' }}
        >
          <p className="text-[12px] text-amber-700 font-semibold">
            Aún no hay pagos cargados para {mesLabel}.
          </p>
          <p className="text-[11px] text-amber-600 mt-0.5">
            El CEI se completa con la carga de pagos del mes. El cobrado aparecerá a medida que se
            carguen los pagos de {mesLabel}.
          </p>
        </div>
      )}

      {/* Resumen por supervisor */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            Resumen por supervisor
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ ...thS, textAlign: 'left' }}>Supervisor</th>
              <th style={{ ...thS, textAlign: 'right' }}>Vendedores</th>
              <th style={{ ...thS, textAlign: 'right' }}>Cobrado</th>
              <th style={{ ...thS, textAlign: 'right' }}>Saldo vencido</th>
              <th style={{ ...thS, textAlign: 'right' }}>CEI</th>
            </tr>
          </thead>
          <tbody>
            {porSup.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td
                  style={{
                    padding: '9px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#0f172a',
                  }}
                >
                  {s.nombre}
                </td>
                <td style={{ ...tdN, color: '#475569' }}>{s.n}</td>
                <td style={{ ...tdN, color: '#16a34a', fontWeight: 600 }}>
                  {s.cob > 0 ? fmtCRC(s.cob) : '—'}
                </td>
                <td style={{ ...tdN, color: '#475569' }}>{fmtCRC(s.ven)}</td>
                <td style={{ ...tdN, fontWeight: 700, color: ceiColor(s.cei) }}>
                  {s.cei === null ? '—' : `${s.cei}%`}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#EEF2F7', borderTop: '2px solid #003B5C' }}>
              <td
                style={{
                  padding: '10px 12px',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#003B5C',
                  textTransform: 'uppercase',
                }}
              >
                Total
              </td>
              <td style={{ ...tdN, fontWeight: 700, color: '#003B5C' }}>{filtrados.length}</td>
              <td style={{ ...tdN, fontWeight: 700, color: '#003B5C' }}>{fmtCRC(totCob)}</td>
              <td style={{ ...tdN, fontWeight: 700, color: '#003B5C' }}>{fmtCRC(totVen)}</td>
              <td style={{ ...tdN, fontWeight: 800, color: ceiColor(ceiGlobal) }}>{ceiGlobal}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Detalle por vendedor */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            Detalle por vendedor
          </span>
          <span className="text-[11px] text-gray-400">
            {detalle.length} vendedor{detalle.length !== 1 ? 'es' : ''}
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ ...thS, textAlign: 'left' }}>Vendedor</th>
              <th style={{ ...thS, textAlign: 'left' }}>Supervisor</th>
              <th style={{ ...thS, textAlign: 'left' }}>Analista</th>
              <th style={{ ...thS, textAlign: 'right' }}>Cobrado</th>
              <th style={{ ...thS, textAlign: 'right' }}>Saldo vencido</th>
              <th style={{ ...thS, textAlign: 'right' }}>CEI</th>
            </tr>
          </thead>
          <tbody>
            {detalle.map((r) => (
              <tr key={r.vendedor_cod} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td
                  style={{
                    padding: '9px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#003B5C',
                  }}
                >
                  {r.vendedor_nombre}
                </td>
                <td style={{ padding: '9px 12px', fontSize: '11px', color: '#64748b' }}>
                  {r.supervisor_nombre}
                </td>
                <td style={{ padding: '9px 12px', fontSize: '11px', color: '#64748b' }}>
                  {nombreCorto(r.analista_nombre)}
                </td>
                <td style={{ ...tdN, color: '#16a34a', fontWeight: 600 }}>
                  {r.cobrado > 0 ? fmtCRC(r.cobrado) : '—'}
                </td>
                <td style={{ ...tdN, color: '#475569' }}>{fmtCRC(r.vencido)}</td>
                <td style={{ ...tdN, fontWeight: 700, color: ceiColor(r.cei) }}>
                  {r.cei === null ? '—' : `${r.cei}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReporteShell>
  );
}
