'use client';

import { useState, useMemo, useEffect } from 'react';
import { Search, Files, Coins, AlertTriangle, TableProperties, ArrowLeftRight } from 'lucide-react';
import { fmtCRC2, fmtFecha } from '@/lib/utils/formato';
import SaldosFavorTabla, {
  type SaldoFavor,
  type MatchSaldo,
} from '@/components/saldos-favor/saldos-favor-tabla';
import { useSaldosFavorMatchingController } from '@/views/gestion-cartera/hooks/use-saldos-favor-matching-controller';

interface Props {
  filasIniciales: SaldoFavor[];
  esAnalista: boolean;
  soloLectura?: boolean;
  analistas: { email: string; nombre: string }[];
  userEmail: string;
}

const PAGE_SIZE = 25;
const TIPOS = ['N/C', 'O/C', 'REC', 'TEF'] as const;
type Tipo = (typeof TIPOS)[number];

// Estilo de pill por tipo cuando está activo
const PILL_TIPO: Record<Tipo, { bg: string; color: string; border: string }> = {
  'N/C': { bg: '#E6F1FB', color: '#185FA5', border: '#378ADD' },
  'O/C': { bg: '#EEEDFE', color: '#534AB7', border: '#AFA9EC' },
  REC: { bg: '#EAF3DE', color: '#3B6D11', border: '#97C459' },
  TEF: { bg: '#EEF2F7', color: '#003B5C', border: '#B5C9D6' },
};

export default function SaldosFavorCliente({
  filasIniciales,
  esAnalista,
  soloLectura = false,
  analistas,
  userEmail,
}: Props) {
  const [rows, setRows] = useState<SaldoFavor[]>(filasIniciales);
  const [busqueda, setBusqueda] = useState('');
  const [tipos, setTipos] = useState<Record<Tipo, boolean>>({
    'N/C': true,
    'O/C': true,
    REC: true,
    TEF: true,
  });
  const [pendientes, setPendientes] = useState(true);
  const [aplicados, setAplicados] = useState(false);
  const [analistaF, setAnalistaF] = useState('');
  const [vendedorF, setVendedorF] = useState('');
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);
  const [soloMatch, setSoloMatch] = useState(false); // KPI clickeable: solo con match

  // Matching: carga en paralelo, no bloqueante (role-scoped en el servidor); null = cargando
  const { matches } = useSaldosFavorMatchingController();

  const matchPorSaldo = useMemo(() => {
    const m = new Map<string, MatchSaldo>();
    (matches ?? []).forEach((x) => {
      if (x.saldo_id_1) m.set(x.saldo_id_1, x);
      if (x.saldo_id_2) m.set(x.saldo_id_2, x);
    });
    return m;
  }, [matches]);

  function togglePendientes() {
    setPendientes((v) => {
      const n = !v;
      if (n) setAplicados(false);
      return n;
    });
  }
  function toggleAplicados() {
    setAplicados((v) => {
      const n = !v;
      if (n) setPendientes(false);
      return n;
    });
  }
  function toggleTipo(t: Tipo) {
    setTipos((prev) => ({ ...prev, [t]: !prev[t] }));
  }

  function onAplicado(id: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              estado_manual: 'aplicado',
              aplicado_por: userEmail,
              aplicado_en: new Date().toISOString(),
            }
          : r,
      ),
    );
  }

  // Vendedores con saldos PENDIENTES en la cartera del analista (CAMBIO 5/6)
  const vendedoresActivos = useMemo(() => {
    if (!esAnalista) return [];
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (r.estado_manual === 'pendiente' && r.vendedor_cod)
        m.set(r.vendedor_cod, r.vendedor_nombre ?? r.vendedor_cod);
    });
    return [...m.entries()]
      .map(([cod, nombre]) => ({ cod, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [rows, esAnalista]);

  // KPIs reactivos
  const kpis = useMemo(
    () => ({
      total: rows.length,
      monto: rows.reduce((s, r) => s + r.monto, 0),
      criticos: rows.filter((r) => r.dias_pendiente > 30).length,
    }),
    [rows],
  );

  const tiposActivos = TIPOS.filter((t) => tipos[t]);
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return rows.filter((r) => {
      if (pendientes && r.estado_manual !== 'pendiente') return false;
      if (tiposActivos.length > 0 && !tiposActivos.includes(r.tipo_documento as Tipo)) return false;
      if (analistaF && r.analista_email !== analistaF) return false;
      if (vendedorF && r.vendedor_cod !== vendedorF) return false;
      if (soloMatch && !matchPorSaldo.has(r.id)) return false;
      if (!q) return true;
      return (
        (r.cliente_nombre ?? '').toLowerCase().includes(q) || r.documento.toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, busqueda, pendientes, tipos, analistaF, vendedorF, soloMatch, matchPorSaldo]);

  // Reset de página cuando cambian filtros
  useEffect(() => {
    setPagina(1);
  }, [busqueda, tipos, pendientes, aplicados, analistaF, vendedorF, soloMatch]);

  const totalRows = filtrados.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageActual = Math.min(pagina, totalPages);
  const desde = totalRows === 0 ? 0 : (pageActual - 1) * PAGE_SIZE + 1;
  const hasta = Math.min(pageActual * PAGE_SIZE, totalRows);
  const pageRows = filtrados.slice((pageActual - 1) * PAGE_SIZE, pageActual * PAGE_SIZE);
  const totalMonto = filtrados.reduce((s, r) => s + r.monto, 0);
  // Aplicaciones (matches) representadas en los documentos visibles (clave = saldo_id_1)
  const aplicacionesVisibles = new Set(
    filtrados.map((r) => matchPorSaldo.get(r.id)?.saldo_id_1).filter(Boolean),
  ).size;

  // ── Exportar Excel (todos los filtrados, no solo la página) ──────────────
  async function exportarExcel() {
    setExportando(true);
    try {
      const XLSX = await import('xlsx');
      const header = esAnalista
        ? [
            'Tipo',
            'N° Documento',
            'Cliente',
            'Código cliente',
            'Vendedor',
            'Monto',
            'Fecha emisión',
            'Días pendiente',
            'Estado',
          ]
        : [
            'Tipo',
            'N° Documento',
            'Cliente',
            'Código cliente',
            'Analista',
            'Vendedor',
            'Monto',
            'Fecha emisión',
            'Días pendiente',
            'Estado',
          ];
      const body = filtrados.map((r) => {
        const base = [r.tipo_documento, r.documento, r.cliente_nombre ?? '', r.cliente_cod];
        const tail = [
          r.vendedor_nombre ?? '',
          Math.round(r.monto * 100) / 100,
          r.fecha_documento ? fmtFecha(r.fecha_documento) : '',
          r.dias_pendiente,
          r.estado_manual === 'aplicado' ? 'Aplicado' : 'Pendiente',
        ];
        return esAnalista ? [...base, ...tail] : [...base, r.analista_nombre ?? '', ...tail];
      });
      const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Saldos a favor');
      const hoy = new Date(Date.now() - 6 * 3600_000);
      const ymd = `${hoy.getUTCFullYear()}${String(hoy.getUTCMonth() + 1).padStart(2, '0')}${String(hoy.getUTCDate()).padStart(2, '0')}`;
      XLSX.writeFile(wb, `${esAnalista ? 'mis-saldos-favor' : 'saldos-favor'}-${ymd}.xlsx`);
    } finally {
      setExportando(false);
    }
  }

  // ── Estilos ──
  const pillBase = (activo: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 13px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all .1s',
    border: `1px solid ${activo ? '#009ee3' : '#e2e8f0'}`,
    background: activo ? '#E6F4FB' : 'white',
    color: activo ? '#0B6FA4' : '#64748b',
  });
  const pillTipo = (t: Tipo): React.CSSProperties => {
    const on = tipos[t];
    const c = PILL_TIPO[t];
    return {
      padding: '6px 12px',
      borderRadius: '9999px',
      fontSize: '11px',
      fontWeight: 700,
      cursor: 'pointer',
      fontFamily: 'monospace',
      transition: 'all .1s',
      border: `1px solid ${on ? c.border : '#e2e8f0'}`,
      background: on ? c.bg : 'white',
      color: on ? c.color : '#94a3b8',
    };
  };

  // KPI card
  function KpiCard({
    topColor,
    pillBg,
    pillColor,
    icon,
    label,
    valor,
    sub,
    valorColor,
    onClick,
    active,
  }: {
    topColor: string;
    pillBg: string;
    pillColor: string;
    icon: React.ReactNode;
    label: string;
    valor: string | number;
    sub: string;
    valorColor?: string;
    onClick?: () => void;
    active?: boolean;
  }) {
    return (
      <div
        onClick={onClick}
        style={{
          background: active ? '#F2FAFE' : 'white',
          borderRadius: '12px',
          border: `0.5px solid ${active ? '#009ee3' : '#e2e8f0'}`,
          borderTop: `2px solid ${topColor}`,
          padding: '12px 14px',
          cursor: onClick ? 'pointer' : 'default',
          boxShadow: active ? '0 0 0 2px rgba(0,158,227,0.18)' : undefined,
          transition: 'all .12s',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '8px',
              background: pillBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ color: pillColor }}>{icon}</span>
          </div>
          <div className="min-w-0">
            <p
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {label}
            </p>
            <p
              style={{
                fontSize: '20px',
                fontWeight: 500,
                lineHeight: 1.15,
                color: valorColor ?? '#1e293b',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {valor}
            </p>
            <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>{sub}</p>
          </div>
        </div>
      </div>
    );
  }

  // Paginación numerada
  const pageNums: number[] = [];
  {
    const start = Math.max(1, pageActual - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = Math.max(1, end - 4); i <= end; i++) pageNums.push(i);
  }

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">
        {/* ── CAMBIO 1: KPI cards ───────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          <KpiCard
            topColor="#009ee3"
            pillBg="#E6F1FB"
            pillColor="#009ee3"
            icon={<Files size={15} />}
            label="Total documentos"
            valor={kpis.total}
            sub="pendientes de aplicar"
          />
          <KpiCard
            topColor="#f59e0b"
            pillBg="#FAEEDA"
            pillColor="#f59e0b"
            icon={<Coins size={15} />}
            label="Monto total"
            valor={fmtCRC2(kpis.monto)}
            sub="saldo a favor"
          />
          <KpiCard
            topColor="#dc2626"
            pillBg="#FCEBEB"
            pillColor="#dc2626"
            icon={<AlertTriangle size={15} />}
            label="Críticos +30 días"
            valor={kpis.criticos}
            sub="con más de 30 días"
            valorColor={kpis.criticos > 0 ? '#dc2626' : undefined}
          />
          <KpiCard
            topColor="#009ee3"
            pillBg="#E6F1FB"
            pillColor="#009ee3"
            icon={<ArrowLeftRight size={15} />}
            label="Aplicaciones detectadas"
            valor={matches === null ? '—' : matches.length}
            sub={
              matches === null
                ? 'cargando…'
                : soloMatch
                  ? '✓ mostrando solo matches'
                  : matches.length > 0
                    ? 'clic para ver los listos'
                    : 'matches disponibles'
            }
            valorColor="#009ee3"
            active={soloMatch}
            onClick={matches && matches.length > 0 ? () => setSoloMatch((v) => !v) : undefined}
          />
        </div>

        {/* ── Filtros ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1" style={{ minWidth: '220px' }}>
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por cliente o número de documento…"
                className="w-full rounded-full border border-slate-200 pl-9 pr-3 py-2 text-[12.5px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#cfe9f9] focus:border-[#009ee3]"
              />
            </div>
            {/* CAMBIO 4: pills de tipo */}
            {TIPOS.map((t) => (
              <button key={t} type="button" style={pillTipo(t)} onClick={() => toggleTipo(t)}>
                {t}
              </button>
            ))}
            <span style={{ width: '1px', height: '22px', background: '#e2e8f0' }} />
            <button type="button" style={pillBase(pendientes)} onClick={togglePendientes}>
              Solo pendientes
            </button>
            <button type="button" style={pillBase(aplicados)} onClick={toggleAplicados}>
              Mostrar aplicados
            </button>
            {/* CAMBIO 5: selector analista (coord) / vendedor (analista) */}
            {!esAnalista ? (
              <select
                value={analistaF}
                onChange={(e) => setAnalistaF(e.target.value)}
                className="rounded-full border border-slate-200 px-3.5 py-2 text-[12px] bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#cfe9f9]"
                style={{ minWidth: '170px' }}
              >
                <option value="">Todos los analistas</option>
                {analistas.map((a) => (
                  <option key={a.email} value={a.email}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={vendedorF}
                onChange={(e) => setVendedorF(e.target.value)}
                className="rounded-full border border-slate-200 px-3.5 py-2 text-[12px] bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#cfe9f9]"
                style={{ minWidth: '170px' }}
              >
                <option value="">Todos los vendedores</option>
                {vendedoresActivos.map((v) => (
                  <option key={v.cod} value={v.cod}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* ── CAMBIO 6: banner analista ─────────────────────────── */}
        {esAnalista && vendedoresActivos.length > 0 && (
          <div
            style={{
              background: '#E6F1FB',
              borderLeft: '3px solid #009ee3',
              borderRadius: '0 8px 8px 0',
              padding: '8px 12px',
            }}
          >
            <p style={{ fontSize: '11px', color: '#185FA5' }}>
              {vendedoresActivos.length} vendedor{vendedoresActivos.length !== 1 ? 'es' : ''} con
              saldos a favor activos en tu cartera
            </p>
          </div>
        )}

        {/* ── CAMBIO 8: barra de acciones ───────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12.5px] text-slate-600">
            {soloMatch && (
              <>
                <b className="text-slate-800">{aplicacionesVisibles}</b> aplicación
                {aplicacionesVisibles !== 1 ? 'es' : ''} ·{' '}
              </>
            )}
            <b className="text-slate-800">{totalRows}</b> documento{totalRows !== 1 ? 's' : ''} ·{' '}
            <b className="text-slate-800 tabular-nums">{fmtCRC2(totalMonto)}</b>
          </span>
          <button
            onClick={exportarExcel}
            disabled={exportando || totalRows === 0}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
            style={{ border: '1px solid #16a34a', color: '#16a34a', background: 'white' }}
          >
            <TableProperties size={14} /> {exportando ? 'Exportando…' : 'Exportar Excel'}
          </button>
        </div>

        {/* ── Tabla (página actual) ─────────────────────────────── */}
        <SaldosFavorTabla
          filas={pageRows}
          esCoordinador={!esAnalista}
          soloLectura={soloLectura}
          userEmail={userEmail}
          onAplicado={onAplicado}
          mostrarMatch
          matchPorSaldo={matchPorSaldo}
          matchLoading={matches === null}
        />

        {/* ── CAMBIO 7: paginación ──────────────────────────────── */}
        {totalRows > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <span className="text-[12px] text-slate-500">
              Mostrando {desde}–{hasta} de {totalRows} documentos
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pageActual <= 1}
                className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold border border-slate-200 text-slate-600 disabled:opacity-40"
              >
                ‹
              </button>
              {pageNums.map((n) => (
                <button
                  key={n}
                  onClick={() => setPagina(n)}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-semibold border"
                  style={
                    n === pageActual
                      ? { background: '#009ee3', borderColor: '#009ee3', color: 'white' }
                      : { background: 'white', borderColor: '#e2e8f0', color: '#64748b' }
                  }
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPagina((p) => Math.min(totalPages, p + 1))}
                disabled={pageActual >= totalPages}
                className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold border border-slate-200 text-slate-600 disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
