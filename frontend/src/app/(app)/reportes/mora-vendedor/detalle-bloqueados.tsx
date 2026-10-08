'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import type { ApiError } from '@/shared/api/api-error';
import { useBloqueadosController } from '@/views/reportes/hooks/use-mora-vendedor-controller';
import { useEnvioReporte } from '@/views/reportes/hooks/use-envio-reporte-controller';
import { fmtCRC, fmtFecha } from '@/lib/utils/formato';
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis';
import VendedorEnvioPanel from '@/components/reportes/VendedorEnvioPanel';
import DirectorioInput from '@/components/ui/DirectorioInput';
import { exportTablaPDF, exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';
import {
  htmlBloqueadosVendedor,
  asuntoBloqueados,
  htmlResumenGerencialBloqueados,
  asuntoResumenGerencialBloqueados,
  type RemitenteCorreo,
} from '@/lib/reportes/email-vendedor';
import type { BloqueadosResult, BloqueadosVendedor, BloqueadoCliente } from '@/types/reportes';

const ESC_PAGE_SIZE = 20;

const ESC_COLS: ColumnaReporte[] = [
  { key: 'cliente_cod', label: 'Código', align: 'left', format: 'text', width: 16 },
  { key: 'cliente_nombre', label: 'Cliente', align: 'left', format: 'text', width: 40 },
  { key: 'vendedor_nombre', label: 'Vendedor', align: 'left', format: 'text', width: 26 },
  { key: 'semanas', label: 'Semanas', align: 'right', format: 'text', width: 12 },
  { key: 'saldo_vencido', label: 'Saldo vencido >30d', align: 'right', format: 'crc', width: 22 },
];

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

const fechaHoy = () => {
  const d = new Date(Date.now() - 6 * 3600_000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};

interface DetalleBloqueadosProps {
  toggle: React.ReactNode;
  remitente: RemitenteCorreo;
  userRol: 'COORDINADOR' | 'ANALISTA' | 'GERENCIA';
  userEmail: string;
}

export default function DetalleBloqueados({
  toggle,
  remitente,
  userRol,
  userEmail,
}: DetalleBloqueadosProps) {
  // Snapshot semanal solo el coordinador lo dispara (evitar duplicados por varios analistas);
  // ANALISTA filtra por su email; COORDINADOR ve todo
  const { data, loading, error, reload: fetchData } = useBloqueadosController(userRol, userEmail);
  const enviarReporte = useEnvioReporte();
  const [verGer, setVerGer] = useState(false);

  // Envío del resumen gerencial (solo coordinador)
  const [gerPara, setGerPara] = useState('');
  const [gerCc, setGerCc] = useState('');
  const [gerEstado, setGerEstado] = useState<'idle' | 'enviando' | 'ok' | 'error'>('idle');
  const [gerError, setGerError] = useState<string | null>(null);

  // Paginación y export de la tabla de Escalación
  const [escPage, setEscPage] = useState(1);
  const [escExportando, setEscExportando] = useState(false);

  const fecha = fechaHoy();

  // ── Envío del resumen gerencial (un solo correo, Para/CC editable) ────
  async function enviarGerencial() {
    if (!data || gerEstado === 'enviando') return;
    const to = gerPara.trim();
    if (!to) {
      setGerEstado('error');
      setGerError('Indicá al menos un destinatario en Para.');
      return;
    }
    setGerEstado('enviando');
    setGerError(null);
    try {
      const res = await enviarReporte({
        to,
        cc: gerCc
          .split(';')
          .map((x) => x.trim())
          .filter(Boolean),
        subject: asuntoResumenGerencialBloqueados(fecha),
        html: htmlResumenGerencialBloqueados(data, fecha, remitente),
      });
      if (!res.email_sent) throw new Error('No se pudo enviar el correo.');
      setGerEstado('ok');
    } catch (e) {
      setGerEstado('error');
      setGerError((e as ApiError).message || 'Error de red');
    }
  }

  // ── Export de la lista completa de Escalación ─────────────────────────
  function escExportParams() {
    const cronicos = [...(data?.escalacion ?? [])].sort(
      (a, b) => b.saldo_vencido - a.saldo_vencido,
    );
    return {
      filas: cronicos.map((e) => ({
        cliente_cod: e.cliente_cod,
        cliente_nombre: e.cliente_nombre,
        vendedor_nombre: e.vendedor_nombre,
        semanas: `${e.semanas} sem`,
        saldo_vencido: e.saldo_vencido,
      })) as unknown as Record<string, unknown>[],
      columnas: ESC_COLS,
      titulo: 'Escalación — Clientes Crónicos Bloqueados',
      subtitulo: `≥3 semanas consecutivas bloqueados · corte ${fecha}`,
      meta: [
        { label: 'Clientes crónicos', value: `${cronicos.length}` },
        {
          label: 'Saldo vencido >30d acumulado',
          value: fmtCRC(cronicos.reduce((s, e) => s + e.saldo_vencido, 0)),
        },
      ],
      nombreArchivo: 'escalacion-clientes-cronicos',
      generadoPor: remitente.nombre,
    };
  }
  async function onEscPDF() {
    setEscExportando(true);
    try {
      await exportTablaPDF(escExportParams());
    } finally {
      setEscExportando(false);
    }
  }
  async function onEscExcel() {
    setEscExportando(true);
    try {
      await exportTablaExcel(escExportParams());
    } finally {
      setEscExportando(false);
    }
  }

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">
        {/* Toggle solo para coordinador; analista va directo a esta vista */}
        {toggle && <div className="flex items-center justify-between gap-3">{toggle}</div>}
        {userRol === 'ANALISTA' && (
          <p className="text-[11px] text-gray-400">
            Mostrando solo los vendedores de tu cartera asignada.
          </p>
        )}

        {loading ? (
          <Skeleton />
        ) : error ? (
          <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
            <p className="text-red-600 text-sm font-semibold">{error}</p>
            <button
              onClick={fetchData}
              className="mt-3 text-[#009ee3] text-sm font-semibold hover:underline"
            >
              Reintentar
            </button>
          </div>
        ) : !data ? null : (
          <VendedorEnvioPanel<BloqueadosVendedor>
            vendedores={data.vendedores}
            kpis={
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICardAnalisis
                  label="Clientes bloqueados"
                  valor={`${data.kpis.total_bloqueados}`}
                  sub="vencido >30d ≥ ₡1.000"
                  color="#dc2626"
                />
                <KPICardAnalisis
                  label="Saldo vencido >30d"
                  valor={fmtCRC(data.kpis.saldo_vencido_total)}
                  sub="acumulado (total)"
                  color="#003B5C"
                />
                <KPICardAnalisis
                  label="Críticos >120 días"
                  valor={`${data.kpis.criticos_120}`}
                  sub="clientes"
                  color="#991b1b"
                />
                <KPICardAnalisis
                  label="Vendedores"
                  valor={`${data.kpis.total_vendedores}`}
                  sub={`corte ${fmtFecha(data.kpis.fecha_semana)}`}
                  color="#f59e0b"
                />
              </div>
            }
            buildSubject={(v) => asuntoBloqueados(v, fecha)}
            buildHtml={(v) => htmlBloqueadosVendedor(v, fecha, remitente)}
            renderResumen={(v) => (
              <span>
                {v.n_clientes} cliente{v.n_clientes !== 1 ? 's' : ''} ·{' '}
                <span style={{ color: '#dc2626', fontWeight: 700 }}>{fmtCRC(v.saldo_vencido)}</span>
                {v.criticos_120 > 0 && (
                  <span style={{ color: '#991b1b' }}> · {v.criticos_120} críticos &gt;120d</span>
                )}
              </span>
            )}
            renderDetalle={(v) => <TablaClientes clientes={v.clientes} />}
            tableHeaders={['Clientes bloqueados', 'Críticos >120d', 'Saldo vencido >30d']}
            renderTablaFila={(v) => [
              <span key="n" style={{ fontWeight: 600, color: '#374151' }}>
                {v.n_clientes}
              </span>,
              <span
                key="c"
                style={{ fontWeight: 700, color: v.criticos_120 > 0 ? '#ea580c' : '#cbd5e1' }}
              >
                {v.criticos_120 || '—'}
              </span>,
              <span key="s" style={{ fontWeight: 700, color: '#dc2626' }}>
                {fmtCRC(v.saldo_vencido)}
              </span>,
            ]}
            extras={
              // Resumen Gerencial y Escalación — solo coordinador
              userRol !== 'COORDINADOR' ? undefined : (
                <div className="space-y-4 mt-2">
                  {/* Resumen Gerencial */}
                  <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                    <button
                      onClick={() => setVerGer((x) => !x)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-gray-100"
                    >
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        Resumen Gerencial — ranking por saldo vencido &gt;30d
                      </span>
                      {verGer ? (
                        <ChevronDown size={14} className="text-gray-400" />
                      ) : (
                        <ChevronRight size={14} className="text-gray-400" />
                      )}
                    </button>

                    {/* Envío por correo: KPIs + ranking + Top 10 crónicos */}
                    <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
                      <div className="flex-1 min-w-[220px]">
                        <DirectorioInput
                          value={gerPara}
                          onChange={(v) => {
                            setGerPara(v);
                            if (gerEstado !== 'idle') setGerEstado('idle');
                          }}
                          placeholder="Para: escribí un nombre del directorio o un correo"
                          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:border-blue-400 transition"
                        />
                      </div>
                      <div className="flex-1 min-w-[180px]">
                        <DirectorioInput
                          value={gerCc}
                          onChange={setGerCc}
                          placeholder="CC (opcional, separar con ;)"
                          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:border-blue-400 transition"
                        />
                      </div>
                      <button
                        onClick={enviarGerencial}
                        disabled={gerEstado === 'enviando' || !gerPara.trim()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold text-white transition disabled:opacity-40 flex-shrink-0"
                        style={{ backgroundColor: '#009ee3' }}
                      >
                        {gerEstado === 'enviando' ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Send size={13} />
                        )}
                        Enviar resumen gerencial
                      </button>
                      {gerEstado === 'ok' && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-semibold"
                          style={{ color: '#16a34a' }}
                        >
                          <CheckCircle2 size={13} /> Enviado
                        </span>
                      )}
                      {gerEstado === 'error' && gerError && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600">
                          <AlertCircle size={13} /> {gerError}
                        </span>
                      )}
                      <p className="w-full text-[10px] text-gray-400 m-0">
                        El correo incluye los KPIs del corte, el ranking por vendedor y el Top 10 de
                        clientes crónicos por saldo vencido &gt;30d, con link al reporte completo en
                        el SIC.
                      </p>
                    </div>

                    {verGer && (
                      <div className="overflow-x-auto">
                        <table
                          style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}
                        >
                          <thead>
                            <tr
                              style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}
                            >
                              {(
                                [
                                  ['#', 'center'],
                                  ['Vendedor', 'left'],
                                  ['Clientes', 'right'],
                                  ['Saldo vencido >30d', 'right'],
                                  ['% del total', 'right'],
                                  ['Críticos >120', 'right'],
                                ] as [string, React.CSSProperties['textAlign']][]
                              ).map(([l, a]) => (
                                <th
                                  key={l}
                                  style={{
                                    padding: '7px 10px',
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
                            {data.gerencial.map((g, i) => {
                              const pct =
                                data.kpis.saldo_vencido_total > 0
                                  ? Math.round(
                                      (g.saldo_vencido / data.kpis.saldo_vencido_total) * 1000,
                                    ) / 10
                                  : 0;
                              return (
                                <tr
                                  key={g.vendedor_nombre}
                                  style={{ borderBottom: '1px solid #f1f5f9' }}
                                >
                                  <td
                                    style={{
                                      padding: '6px 10px',
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
                                      padding: '6px 10px',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      color: '#0f172a',
                                    }}
                                  >
                                    {g.vendedor_nombre}
                                  </td>
                                  <td
                                    style={{
                                      padding: '6px 10px',
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
                                      padding: '6px 10px',
                                      textAlign: 'right',
                                      fontSize: '12px',
                                      fontWeight: 700,
                                      color: '#dc2626',
                                      fontVariantNumeric: 'tabular-nums',
                                    }}
                                  >
                                    {fmtCRC(g.saldo_vencido)}
                                  </td>
                                  <td
                                    style={{
                                      padding: '6px 10px',
                                      textAlign: 'right',
                                      fontSize: '12px',
                                      color: '#64748b',
                                      fontVariantNumeric: 'tabular-nums',
                                    }}
                                  >
                                    {pct}%
                                  </td>
                                  <td
                                    style={{
                                      padding: '6px 10px',
                                      textAlign: 'right',
                                      fontSize: '12px',
                                      fontWeight: 700,
                                      color: g.criticos_120 > 0 ? '#ea580c' : '#cbd5e1',
                                      fontVariantNumeric: 'tabular-nums',
                                    }}
                                  >
                                    {g.criticos_120 || '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Escalación */}
                  <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        Escalación — clientes ≥3 semanas consecutivas bloqueados
                      </span>
                      {data.escalacion.length > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={onEscPDF}
                            disabled={escExportando}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 transition disabled:opacity-50"
                          >
                            {escExportando ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <FileText size={12} />
                            )}{' '}
                            PDF
                          </button>
                          <button
                            onClick={onEscExcel}
                            disabled={escExportando}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 transition disabled:opacity-50"
                          >
                            <FileSpreadsheet size={12} /> Excel
                          </button>
                        </div>
                      )}
                    </div>
                    {data.escalacion.length === 0 ? (
                      <div className="px-4 py-6 text-center text-[12px] text-gray-400">
                        Aún no hay clientes en escalación. Se irán detectando a medida que se
                        acumule el histórico semanal.
                      </div>
                    ) : (
                      (() => {
                        const totalEscPages = Math.max(
                          1,
                          Math.ceil(data.escalacion.length / ESC_PAGE_SIZE),
                        );
                        const pagina = Math.min(escPage, totalEscPages);
                        const visibles = data.escalacion.slice(
                          (pagina - 1) * ESC_PAGE_SIZE,
                          pagina * ESC_PAGE_SIZE,
                        );
                        return (
                          <>
                            <div className="overflow-x-auto">
                              <table
                                style={{
                                  width: '100%',
                                  borderCollapse: 'collapse',
                                  minWidth: '480px',
                                }}
                              >
                                <thead>
                                  <tr
                                    style={{
                                      background: '#fff5f5',
                                      borderBottom: '1px solid #f0c9c0',
                                    }}
                                  >
                                    {(
                                      [
                                        ['Código', 'left'],
                                        ['Cliente', 'left'],
                                        ['Vendedor', 'left'],
                                        ['Semanas', 'center'],
                                        ['Saldo vencido >30d', 'right'],
                                      ] as [string, React.CSSProperties['textAlign']][]
                                    ).map(([l, a]) => (
                                      <th
                                        key={l}
                                        style={{
                                          padding: '7px 10px',
                                          fontSize: '10px',
                                          fontWeight: 600,
                                          color: '#7B0000',
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
                                  {visibles.map((e) => (
                                    <tr
                                      key={e.cliente_cod}
                                      style={{ borderBottom: '1px solid #f1f5f9' }}
                                    >
                                      <td
                                        style={{
                                          padding: '6px 10px',
                                          fontSize: '11px',
                                          fontFamily: 'monospace',
                                          color: '#64748b',
                                        }}
                                      >
                                        {e.cliente_cod}
                                      </td>
                                      <td
                                        style={{
                                          padding: '6px 10px',
                                          fontSize: '12px',
                                          fontWeight: 600,
                                          color: '#0f172a',
                                        }}
                                      >
                                        {e.cliente_nombre}
                                      </td>
                                      <td
                                        style={{
                                          padding: '6px 10px',
                                          fontSize: '11px',
                                          color: '#475569',
                                        }}
                                      >
                                        {e.vendedor_nombre}
                                      </td>
                                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                        <span
                                          style={{
                                            background: e.semanas >= 6 ? '#7B0000' : '#C00000',
                                            color: '#fff',
                                            fontWeight: 700,
                                            padding: '1px 7px',
                                            borderRadius: '3px',
                                            fontSize: '11px',
                                          }}
                                        >
                                          {e.semanas} sem
                                        </span>
                                      </td>
                                      <td
                                        style={{
                                          padding: '6px 10px',
                                          textAlign: 'right',
                                          fontSize: '12px',
                                          fontWeight: 700,
                                          color: '#dc2626',
                                          fontVariantNumeric: 'tabular-nums',
                                        }}
                                      >
                                        {fmtCRC(e.saldo_vencido)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {totalEscPages > 1 && (
                              <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100">
                                <span className="text-[11px] text-gray-400">
                                  {data.escalacion.length} clientes crónicos · página {pagina} de{' '}
                                  {totalEscPages}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => setEscPage((p) => Math.max(1, p - 1))}
                                    disabled={pagina <= 1}
                                    className="p-1 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"
                                  >
                                    <ChevronLeft size={14} />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setEscPage((p) => Math.min(totalEscPages, p + 1))
                                    }
                                    disabled={pagina >= totalEscPages}
                                    className="p-1 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"
                                  >
                                    <ChevronRight size={14} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()
                    )}
                  </div>
                </div>
              )
            }
          />
        )}
      </div>
    </div>
  );
}

function TablaClientes({ clientes }: { clientes: BloqueadoCliente[] }) {
  return (
    <table
      style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}
    >
      <colgroup>
        <col style={{ width: '90px' }} />
        <col style={{ width: '22%' }} />
        <col style={{ width: '70px' }} />
        <col style={{ width: '11%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '11%' }} />
      </colgroup>
      <thead>
        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          {(
            [
              ['Código', 'left'],
              ['Cliente', 'left'],
              ['Sem.', 'center'],
              ['1-30d', 'right'],
              ['31-60d', 'right'],
              ['61-90d', 'right'],
              ['91-120d', 'right'],
              ['+120d', 'right'],
              ['Saldo venc. >30d', 'right'],
            ] as [string, React.CSSProperties['textAlign']][]
          ).map(([l, a]) => (
            <th
              key={l}
              style={{
                padding: '7px 10px',
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
        {clientes.map((c, i) => {
          const crit = c.m120 > 0;
          return (
            <tr
              key={`${c.cliente_cod}-${i}`}
              style={{
                borderBottom: '1px solid #f1f5f9',
                background: crit ? '#fff7ed' : 'transparent',
              }}
            >
              <td
                style={{
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: '#64748b',
                }}
              >
                {c.cliente_cod}
              </td>
              <td
                style={{
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#0f172a',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.cliente_nombre}
              </td>
              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                {c.es_nuevo ? (
                  <span
                    style={{
                      background: '#28A745',
                      color: '#fff',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontSize: '9px',
                    }}
                  >
                    NUEVO
                  </span>
                ) : (
                  <span
                    style={{
                      background: c.semanas >= 3 ? '#C00000' : '#6C757D',
                      color: '#fff',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontSize: '10px',
                    }}
                  >
                    {c.semanas}
                  </span>
                )}
              </td>
              <td
                style={{
                  padding: '6px 10px',
                  textAlign: 'right',
                  fontSize: '11px',
                  color: '#d97706',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {c.m1_30 > 0 ? fmtCRC(c.m1_30) : '—'}
              </td>
              <td
                style={{
                  padding: '6px 10px',
                  textAlign: 'right',
                  fontSize: '11px',
                  color: '#ea580c',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {c.m31_60 > 0 ? fmtCRC(c.m31_60) : '—'}
              </td>
              <td
                style={{
                  padding: '6px 10px',
                  textAlign: 'right',
                  fontSize: '11px',
                  color: '#ef4444',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {c.m61_90 > 0 ? fmtCRC(c.m61_90) : '—'}
              </td>
              <td
                style={{
                  padding: '6px 10px',
                  textAlign: 'right',
                  fontSize: '11px',
                  color: '#dc2626',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {c.m91_120 > 0 ? fmtCRC(c.m91_120) : '—'}
              </td>
              <td
                style={{
                  padding: '6px 10px',
                  textAlign: 'right',
                  fontSize: '11px',
                  fontWeight: crit ? 800 : 400,
                  color: '#991b1b',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {c.m120 > 0 ? fmtCRC(c.m120) : '—'}
              </td>
              <td
                style={{
                  padding: '6px 10px',
                  textAlign: 'right',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#dc2626',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtCRC(c.saldo_vencido)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
