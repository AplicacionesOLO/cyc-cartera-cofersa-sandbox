'use client';

import { useState, Fragment } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Lock,
  Loader2,
  FileText,
  FileSpreadsheet,
  RefreshCw,
  Pencil,
  Check,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { fmtCRC } from '@/lib/utils/formato';
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis';
import { exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla';
import { exportPresupuestoPDF } from '@/lib/reportes/pdf-presupuesto';
import DirectorioInput from '@/components/ui/DirectorioInput';
import type { RemitenteCorreo } from '@/lib/reportes/email-vendedor';
import type { PptoCliente } from '@/types/presupuesto';
import { usePresupuestoMesController } from '@/views/presupuesto/hooks/use-presupuesto-mes-controller';
import { useEnvioPresupuestoGeneralController } from '@/views/presupuesto/hooks/use-envio-presupuesto-general-controller';
import type { PresupuestoMes, PresupuestoVendedorRow } from '@/views/presupuesto/types';

// "Nuevas ventas" se omite del export (solo referencia en pantalla). Anchos en mm que
// llenan el ancho útil A4 horizontal (≈273mm) para que no quede media hoja vacía ni se corten montos.
const COLS: ColumnaReporte[] = [
  { key: 'vendedor_nombre', label: 'Vendedor', align: 'left', format: 'text', width: 99 },
  { key: 'n_clientes', label: 'Clientes', align: 'right', format: 'int', width: 36 },
  { key: 'ppto_cartera', label: 'Cobro cartera', align: 'right', format: 'crc', width: 69 },
  { key: 'meta', label: 'Meta', align: 'right', format: 'crc', width: 69 },
];

type VendedorRow = PresupuestoVendedorRow;
type Data = PresupuestoMes;

interface Props {
  anio: number;
  mes: number;
  userEmail: string;
  generadoPor: string;
  mesLabel: string;
  remitente: RemitenteCorreo;
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border h-20 animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-xl border h-72 animate-pulse" />
    </div>
  );
}

// userEmail se conserva en Props por compatibilidad: el backend toma el email del usuario autenticado.
export default function TabPresupuesto({ anio, mes, generadoPor, mesLabel, remitente }: Props) {
  const ctl = usePresupuestoMesController(anio, mes);
  const { loading, error, accion, vendList } = ctl;
  const data: Data | null = ctl.data;
  const fetchData = ctl.reload;
  const [abierto, setAbierto] = useState<Set<string>>(new Set());
  const [exportando, setExportando] = useState(false);
  const [editMeta, setEditMeta] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [showEnviar, setShowEnviar] = useState(false);

  async function congelar() {
    if (!confirm(`¿Congelar el presupuesto de ${mesLabel}? Fija la meta del mes.`)) return;
    await ctl.congelar();
  }
  async function regenerar() {
    if (
      !confirm(
        `¿Regenerar el presupuesto de ${mesLabel}? Esto DESCARTA los ajustes manuales (reasignaciones y metas editadas) y recalcula desde la cartera actual.`,
      )
    )
      return;
    await ctl.congelar();
  }
  async function reasignar(clienteCod: string, vendedorCod: string) {
    await ctl.reasignar(clienteCod, vendedorCod);
  }
  async function guardarMeta(vendedorCod: string) {
    const val = Math.round(Number(editVal.replace(/[^\d]/g, '')) || 0);
    setEditMeta(null);
    await ctl.guardarMeta(vendedorCod, val);
  }

  function exportParams() {
    const filas = (data?.vendedores ?? []).map((v) => ({ ...v, meta: v.meta ?? v.ppto_total }));
    return {
      filas: filas as unknown as Record<string, unknown>[],
      columnas: COLS,
      titulo: 'Presupuesto de Cobro',
      subtitulo: `${mesLabel}${data?.congelado ? ' · congelado' : ' · estimado'}`,
      meta: [
        { label: 'Meta total', value: fmtCRC(data?.kpis.ppto_total ?? 0) },
        { label: 'Cobro de cartera', value: fmtCRC(data?.kpis.ppto_cartera ?? 0) },
        { label: 'Clientes', value: `${data?.kpis.n_clientes ?? 0}` },
      ],
      totales: {
        vendedor_nombre: 'TOTAL',
        n_clientes: data?.kpis.n_clientes ?? 0,
        ppto_cartera: data?.kpis.ppto_cartera ?? 0,
        meta: data?.kpis.ppto_total ?? 0,
      },
      orientacion: 'landscape' as const,
      nombreArchivo: `presupuesto-cobro-${anio}-${String(mes).padStart(2, '0')}`,
      generadoPor,
    };
  }
  async function onPDF() {
    setExportando(true);
    try {
      await exportPresupuestoPDF({
        vendedores: (data?.vendedores ?? []).map((v) => ({
          vendedor_cod: v.vendedor_cod,
          vendedor_nombre: v.vendedor_nombre,
          meta: v.meta ?? v.ppto_total,
        })),
        mesLabel,
        congelado: !!data?.congelado,
        metaTotal: data?.kpis.ppto_total ?? 0,
        generadoPor,
        nombreArchivo: `presupuesto-cobro-${anio}-${String(mes).padStart(2, '0')}`,
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

  if (loading) return <Skeleton />;
  if (error)
    return (
      <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
        <p className="text-red-600 text-sm font-semibold">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 text-[#009ee3] text-sm font-semibold hover:underline"
        >
          Reintentar
        </button>
      </div>
    );
  if (!data) return null;

  const k = data.kpis;
  const congelado = data.congelado;
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span
          className="text-[12px] font-semibold px-2.5 py-1 rounded-lg"
          style={{
            background: congelado ? 'rgba(22,163,74,0.10)' : 'rgba(245,158,11,0.10)',
            color: congelado ? '#16a34a' : '#b45309',
          }}
        >
          {congelado ? '● Mes congelado — ajustable' : '○ Estimado (no congelado)'}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onPDF}
            disabled={exportando}
            style={{ ...BTN, opacity: exportando ? 0.5 : 1 }}
          >
            {exportando ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}{' '}
            PDF
          </button>
          <button onClick={onExcel} disabled={exportando} style={BTN}>
            <FileSpreadsheet size={13} /> Excel
          </button>
          {congelado && (
            <button
              onClick={() => setShowEnviar(true)}
              style={{ ...BTN, background: '#009ee3', color: 'white', borderColor: '#009ee3' }}
            >
              <Send size={13} /> Enviar Presupuesto General
            </button>
          )}
          {congelado ? (
            <button
              onClick={regenerar}
              disabled={accion}
              style={{ ...BTN, color: '#b45309', borderColor: '#fcd34d' }}
            >
              {accion ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}{' '}
              Regenerar
            </button>
          ) : (
            <button
              onClick={congelar}
              disabled={accion}
              style={{ ...BTN, background: '#003B5C', color: 'white', borderColor: '#003B5C' }}
            >
              {accion ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}{' '}
              Congelar mes
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICardAnalisis
          label={congelado ? 'Meta total' : 'Presupuesto estimado'}
          valor={fmtCRC(k.ppto_total)}
          sub={`${k.n_clientes} clientes · ${k.n_vendedores} vendedores`}
          color="#003B5C"
        />
        <KPICardAnalisis
          label="Cobro de cartera"
          valor={fmtCRC(k.ppto_cartera)}
          sub="facturas que pagan este mes"
          color="#009ee3"
        />
        <KPICardAnalisis
          label="Nuevas ventas"
          valor={fmtCRC(k.ppto_nuevas_ventas)}
          sub="cobro de ventas del mes"
          color="#16a34a"
        />
        <KPICardAnalisis
          label="% Nuevas ventas"
          valor={`${k.ppto_total > 0 ? Math.round((k.ppto_nuevas_ventas / k.ppto_total) * 100) : 0}%`}
          sub="del presupuesto"
          color="#f59e0b"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            Presupuesto por vendedor — {mesLabel}
          </span>
          <span className="text-[11px] text-gray-400">
            {data.vendedores.length} vendedores {congelado && '· clic en cliente para reasignar'}
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {(
                [
                  ['Vendedor', 'left'],
                  ['Clientes', 'right'],
                  ['Cobro cartera', 'right'],
                  ['Nuevas ventas', 'right'],
                  [congelado ? 'Meta' : 'Presupuesto', 'right'],
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
            {data.vendedores.map((v) => {
              const open = abierto.has(v.vendedor_cod);
              const meta = v.meta ?? v.ppto_total;
              return (
                <Fragment key={v.vendedor_cod}>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td
                      style={{ padding: '9px 12px', cursor: 'pointer' }}
                      onClick={() =>
                        setAbierto((prev) => {
                          const n = new Set(prev);
                          n.has(v.vendedor_cod) ? n.delete(v.vendedor_cod) : n.add(v.vendedor_cod);
                          return n;
                        })
                      }
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {open ? (
                          <ChevronDown size={13} className="text-gray-400" />
                        ) : (
                          <ChevronRight size={13} className="text-gray-400" />
                        )}
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
                          {v.vendedor_nombre}
                        </span>
                      </span>
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
                      {v.n_clientes}
                    </td>
                    <td
                      style={{
                        padding: '9px 12px',
                        textAlign: 'right',
                        fontSize: '12px',
                        color: '#475569',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCRC(v.ppto_cartera)}
                    </td>
                    <td
                      style={{
                        padding: '9px 12px',
                        textAlign: 'right',
                        fontSize: '12px',
                        color: '#16a34a',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCRC(v.ppto_nuevas_ventas)}
                    </td>
                    <td
                      style={{
                        padding: '9px 12px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {congelado && editMeta === v.vendedor_cod ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            autoFocus
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') guardarMeta(v.vendedor_cod);
                              if (e.key === 'Escape') setEditMeta(null);
                            }}
                            style={{
                              width: '110px',
                              textAlign: 'right',
                              fontSize: '12px',
                              border: '1px solid #009ee3',
                              borderRadius: '6px',
                              padding: '2px 6px',
                            }}
                          />
                          <button onClick={() => guardarMeta(v.vendedor_cod)}>
                            <Check size={14} className="text-green-600" />
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 justify-end">
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#003B5C' }}>
                            {fmtCRC(meta)}
                          </span>
                          {v.meta_editada && (
                            <span
                              title="Meta editada manualmente"
                              style={{ fontSize: '8px', color: '#f59e0b', fontWeight: 700 }}
                            >
                              ✎
                            </span>
                          )}
                          {congelado && (
                            <button
                              title="Editar meta"
                              onClick={() => {
                                setEditMeta(v.vendedor_cod);
                                setEditVal(String(Math.round(meta)));
                              }}
                            >
                              <Pencil size={11} className="text-gray-300 hover:text-gray-500" />
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                  {open &&
                    v.clientes.map((c: PptoCliente) => (
                      <tr
                        key={c.cliente_cod}
                        style={{ borderBottom: '1px solid #f8fafc', background: '#fcfdfe' }}
                      >
                        <td style={{ padding: '5px 12px 5px 30px' }}>
                          <span style={{ fontSize: '11px', color: '#475569' }}>
                            {c.cliente_nombre}
                          </span>
                          <span
                            style={{
                              fontSize: '9px',
                              color: '#94a3b8',
                              marginLeft: '6px',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            #{c.cliente_cod}
                          </span>
                          <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '6px' }}>
                            · {c.dias_prom}d prom
                          </span>
                          {congelado && (
                            <select
                              value=""
                              disabled={accion}
                              onChange={(e) => {
                                if (e.target.value) reasignar(c.cliente_cod, e.target.value);
                              }}
                              title="Mover a otro vendedor"
                              style={{
                                marginLeft: '8px',
                                fontSize: '10px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                padding: '1px 4px',
                                color: '#64748b',
                                background: 'white',
                              }}
                            >
                              <option value="">↪ mover…</option>
                              {vendList.map((vd) => (
                                <option key={vd.cod} value={vd.cod}>
                                  {vd.nombre}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td></td>
                        <td
                          style={{
                            padding: '5px 12px',
                            textAlign: 'right',
                            fontSize: '11px',
                            color: '#64748b',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {c.ppto_cartera > 0 ? fmtCRC(c.ppto_cartera) : '—'}
                        </td>
                        <td
                          style={{
                            padding: '5px 12px',
                            textAlign: 'right',
                            fontSize: '11px',
                            color: '#16a34a',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {c.ppto_nuevas_ventas > 0 ? fmtCRC(c.ppto_nuevas_ventas) : '—'}
                        </td>
                        <td
                          style={{
                            padding: '5px 12px',
                            textAlign: 'right',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#374151',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {fmtCRC(c.ppto_total)}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
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
              <td
                style={{
                  padding: '10px 12px',
                  textAlign: 'right',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#003B5C',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {k.n_clientes}
              </td>
              <td
                style={{
                  padding: '10px 12px',
                  textAlign: 'right',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#003B5C',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtCRC(k.ppto_cartera)}
              </td>
              <td
                style={{
                  padding: '10px 12px',
                  textAlign: 'right',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#16a34a',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtCRC(k.ppto_nuevas_ventas)}
              </td>
              <td
                style={{
                  padding: '10px 12px',
                  textAlign: 'right',
                  fontSize: '13px',
                  fontWeight: 800,
                  color: '#003B5C',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtCRC(k.ppto_total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {showEnviar && (
        <ModalEnviarGeneral
          vendedores={data.vendedores}
          mesLabel={mesLabel}
          metaTotal={k.ppto_total}
          remitente={remitente}
          onClose={() => setShowEnviar(false)}
        />
      )}
    </div>
  );
}

// ── Modal: Enviar Presupuesto General (un solo correo a todo el equipo) ──
function ModalEnviarGeneral({
  vendedores,
  mesLabel,
  metaTotal,
  remitente,
  onClose,
}: {
  vendedores: VendedorRow[];
  mesLabel: string;
  metaTotal: number;
  remitente: RemitenteCorreo;
  onClose: () => void;
}) {
  const { cargando, nAuto, toAuto, ccExtra, setCcExtra, enviando, resultado, enviar } =
    useEnvioPresupuestoGeneralController(vendedores, mesLabel, metaTotal, remitente);

  return (
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
        if (!enviando) onClose();
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
            <Send size={16} /> Enviar Presupuesto General
          </span>
          <button
            onClick={() => {
              if (!enviando) onClose();
            }}
            style={{ color: '#A8C4E0' }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '18px' }}>
          {cargando ? (
            <p
              style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '10px 0' }}
            >
              Armando lista de destinatarios…
            </p>
          ) : (
            <>
              <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
                Se enviará un solo correo con el presupuesto de{' '}
                <b style={{ color: '#003B5C' }}>{mesLabel}</b> a{' '}
                <b style={{ color: '#003B5C' }}>{nAuto} destinatarios</b> (vendedores con meta
                asignada, supervisores y analistas), en "Para".
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
                Agregar en copia (opcional)
              </label>
              <DirectorioInput
                value={ccExtra}
                onChange={setCcExtra}
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
              {resultado && (
                <div
                  style={{
                    marginTop: '12px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: resultado.ok ? '#16a34a' : '#dc2626',
                  }}
                >
                  {resultado.ok ? (
                    <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                  ) : (
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                  )}
                  <span>
                    {resultado.msg}
                    {!resultado.ok && /Google|expirada|401/i.test(resultado.msg)
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
                    if (!enviando) onClose();
                  }}
                  style={{
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
                  }}
                >
                  Cerrar
                </button>
                <button
                  onClick={enviar}
                  disabled={enviando || toAuto.length === 0}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '1px solid #009ee3',
                    background: '#009ee3',
                    color: 'white',
                    opacity: enviando || toAuto.length === 0 ? 0.5 : 1,
                  }}
                >
                  {enviando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}{' '}
                  Enviar a todos
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
