'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { Inbox, Check, Loader2, ArrowLeftRight } from 'lucide-react';
import { useAplicarSaldoController } from '@/views/gestion-cartera/hooks/use-aplicar-saldo-controller';
import { fmtCRC2, fmtFecha } from '@/lib/utils/formato';

// ── Tipo (alineado a la tabla saldos_favor + join analista/vendedor + dias) ──
export interface SaldoFavor {
  id: string;
  contribuyente: string | null;
  cliente_cod: string;
  cliente_nombre: string | null;
  documento: string;
  tipo_documento: string; // N/C | O/C | REC | TEF
  fecha_documento: string | null;
  fecha_vencimiento: string | null;
  monto: number;
  estado_manual: 'pendiente' | 'aplicado';
  aplicado_por: string | null;
  aplicado_en: string | null;
  analista_email?: string | null;
  analista_nombre?: string;
  vendedor_cod?: string | null;
  vendedor_nombre?: string;
  dias_pendiente: number;
}

// ── Match (fn_matching_saldos_favor) ─────────────────────────────────────────
export interface MatchSaldo {
  cliente_cod: string;
  cliente_nombre: string;
  tipo_match: 'A' | 'B' | 'C';
  saldo_id_1: string;
  saldo_doc_1: string;
  saldo_tipo_1: string;
  saldo_monto_1: number;
  saldo_id_2: string | null;
  saldo_doc_2: string | null;
  saldo_monto_2: number | null;
  factura_doc_1: string;
  factura_saldo_1: number;
  factura_vence_1: string | null;
  factura_doc_2: string | null;
  factura_saldo_2: number | null;
  factura_vence_2: string | null;
  monto_match: number;
  descripcion: string;
}
const TITULO_MATCH: Record<string, string> = {
  A: 'Aplicación directa',
  B: 'Un saldo cubre dos facturas',
  C: 'Dos saldos cubren una factura',
};

const nombreCorto = (n: string) => n.trim().split(/\s+/).slice(0, 2).join(' ');

function badgeTipo(tipo: string) {
  const m: Record<string, { bg: string; color: string }> = {
    'N/C': { bg: '#E6F1FB', color: '#185FA5' },
    'O/C': { bg: '#EEEDFE', color: '#534AB7' },
    REC: { bg: '#EAF3DE', color: '#3B6D11' },
    TEF: { bg: '#EEF2F7', color: '#003B5C' },
  };
  const st = m[tipo] ?? { bg: '#f1f5f9', color: '#64748b' };
  return (
    <span
      style={{
        background: st.bg,
        color: st.color,
        fontSize: '10px',
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: '9999px',
      }}
    >
      {tipo}
    </span>
  );
}
function badgeEstado(estado: SaldoFavor['estado_manual']) {
  const st =
    estado === 'aplicado'
      ? { bg: '#EAF3DE', color: '#3B6D11', txt: 'Aplicado' }
      : { bg: '#FAEEDA', color: '#854F0B', txt: 'Pendiente' };
  return (
    <span
      style={{
        background: st.bg,
        color: st.color,
        fontSize: '10px',
        fontWeight: 700,
        padding: '2px 9px',
        borderRadius: '9999px',
      }}
    >
      {st.txt}
    </span>
  );
}
function badgeAnalista(nombre: string) {
  return (
    <span
      style={{
        background: '#EEEDFE',
        color: '#534AB7',
        fontSize: '10px',
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: '9999px',
      }}
    >
      {nombreCorto(nombre)}
    </span>
  );
}
const colorDias = (d: number) => (d < 15 ? '#22c55e' : d <= 30 ? '#f59e0b' : '#dc2626');

// ── Panel de detalle del match ───────────────────────────────────────────────
function MatchPanel({ m }: { m: MatchSaldo }) {
  const facturas = [
    { doc: m.factura_doc_1, saldo: m.factura_saldo_1, vence: m.factura_vence_1 },
    ...(m.factura_doc_2
      ? [{ doc: m.factura_doc_2, saldo: m.factura_saldo_2 as number, vence: m.factura_vence_2 }]
      : []),
  ];
  const cTh: React.CSSProperties = {
    padding: '5px 10px',
    fontSize: '10px',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    textAlign: 'left',
  };
  const cTd: React.CSSProperties = { padding: '5px 10px', fontSize: '11.5px', color: '#334155' };
  return (
    <div
      className="match-panel"
      style={{ padding: '12px 16px', background: '#F8FBFE', borderLeft: '3px solid #009ee3' }}
    >
      <p style={{ fontSize: '12px', fontWeight: 700, color: '#003B5C' }}>
        Match {m.tipo_match} · {TITULO_MATCH[m.tipo_match]}
      </p>
      <div className="mt-2 inline-block rounded-lg border border-slate-200 overflow-hidden bg-white">
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F1F5F9' }}>
              <th style={cTh}>Factura</th>
              <th style={{ ...cTh, textAlign: 'right' }}>Saldo</th>
              <th style={{ ...cTh, textAlign: 'center' }}>Vence</th>
            </tr>
          </thead>
          <tbody>
            {facturas.map((f, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ ...cTd, fontFamily: 'monospace', fontWeight: 600, color: '#003B5C' }}>
                  {f.doc}
                </td>
                <td style={{ ...cTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtCRC2(f.saldo)}
                </td>
                <td style={{ ...cTd, textAlign: 'center', color: '#64748b' }}>
                  {f.vence ? fmtFecha(f.vence) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '12px', marginTop: '8px', color: '#0f172a' }}>
        Monto del match: <b className="tabular-nums">{fmtCRC2(m.monto_match)}</b>
      </p>
      <p style={{ fontSize: '11px', marginTop: '2px', color: '#64748b' }}>{m.descripcion}</p>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  filas: SaldoFavor[];
  esCoordinador: boolean;
  soloLectura?: boolean; // Gerencia: ve todo, no puede marcar como aplicado
  userEmail: string;
  dentroFicha?: boolean; // oculta Cliente y Analista; muestra fila de totales
  onAplicado: (id: string) => void;
  mostrarMatch?: boolean;
  matchPorSaldo?: Map<string, MatchSaldo>;
  matchLoading?: boolean;
}

export default function SaldosFavorTabla({
  filas,
  esCoordinador,
  soloLectura = false,
  dentroFicha = false,
  onAplicado,
  mostrarMatch = false,
  matchPorSaldo,
  matchLoading = false,
}: Props) {
  const [confirmando, setConfirmando] = useState<SaldoFavor | null>(null);
  const { aplicar, guardando, error, setError } = useAplicarSaldoController();
  const [expandido, setExpandido] = useState<string | null>(null); // saldo_id con panel abierto
  const wrapRef = useRef<HTMLDivElement>(null);

  // Cerrar panel al hacer clic fuera del badge / panel
  useEffect(() => {
    if (!expandido) return;
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest('.match-badge') && !t.closest('.match-panel')) setExpandido(null);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [expandido]);

  const verCliente = !dentroFicha;
  const verAnalista = !dentroFicha && esCoordinador;
  const nCols = 7 + (verCliente ? 1 : 0) + (verAnalista ? 1 : 0) + (mostrarMatch ? 1 : 0);

  async function confirmar() {
    if (!confirmando) return;
    if (await aplicar(confirmando.id)) {
      onAplicado(confirmando.id);
      setConfirmando(null);
    }
  }

  const th: React.CSSProperties = {
    padding: '10px 14px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };
  const td: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'middle' };
  const totalMonto = filas.reduce((s, f) => s + f.monto, 0);

  return (
    <>
      <div
        ref={wrapRef}
        className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto"
      >
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #e8edf3' }}>
              <th style={{ ...th, textAlign: 'left' }}>Tipo</th>
              <th style={{ ...th, textAlign: 'left' }}>N° Documento</th>
              {verCliente && <th style={{ ...th, textAlign: 'left' }}>Cliente</th>}
              {verAnalista && <th style={{ ...th, textAlign: 'left' }}>Analista</th>}
              <th style={{ ...th, textAlign: 'right' }}>Monto</th>
              <th style={{ ...th, textAlign: 'center' }}>Fecha emisión</th>
              <th style={{ ...th, textAlign: 'center' }}>Días pendiente</th>
              <th style={{ ...th, textAlign: 'center' }}>Estado</th>
              {mostrarMatch && <th style={{ ...th, textAlign: 'center' }}>Match</th>}
              <th style={{ ...th, textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={nCols} style={{ padding: '56px 16px', textAlign: 'center' }}>
                  <Inbox size={34} style={{ color: '#cbd5e1', margin: '0 auto 10px' }} />
                  <p style={{ fontSize: '13px', color: '#94a3b8' }}>
                    {dentroFicha
                      ? 'Este cliente no tiene saldos a favor registrados.'
                      : 'No hay saldos a favor para los filtros seleccionados.'}
                  </p>
                </td>
              </tr>
            ) : (
              filas.map((s) => {
                const aplicado = s.estado_manual === 'aplicado';
                const match = matchPorSaldo?.get(s.id);
                const abierto = expandido === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr
                      style={{
                        borderBottom: abierto ? 'none' : '1px solid #f1f5f9',
                        opacity: aplicado ? 0.5 : 1,
                        transition: 'opacity .15s',
                      }}
                    >
                      <td style={td}>{badgeTipo(s.tipo_documento)}</td>
                      <td
                        style={{
                          ...td,
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#003B5C',
                          fontFamily: 'monospace',
                        }}
                      >
                        {s.documento}
                      </td>
                      {verCliente && (
                        <td style={td}>
                          <p style={{ fontSize: '12px', fontWeight: 600, color: '#003B5C' }}>
                            {s.cliente_nombre}
                          </p>
                          <p
                            style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}
                          >
                            {s.cliente_cod}
                          </p>
                        </td>
                      )}
                      {verAnalista && (
                        <td style={td}>
                          {s.analista_nombre ? (
                            badgeAnalista(s.analista_nombre)
                          ) : (
                            <span style={{ color: '#cbd5e1', fontSize: '11px' }}>—</span>
                          )}
                        </td>
                      )}
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                          {fmtCRC2(s.monto)}
                        </div>
                        {s.monto < 1000 && (
                          <div style={{ marginTop: '2px' }}>
                            <span
                              style={{
                                background: '#FAEEDA',
                                color: '#854F0B',
                                fontSize: '8px',
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: '9999px',
                              }}
                            >
                              Saldo menor
                            </span>
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          ...td,
                          textAlign: 'center',
                          fontSize: '11px',
                          color: '#64748b',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {s.fecha_documento ? fmtFecha(s.fecha_documento) : '—'}
                      </td>
                      <td
                        style={{
                          ...td,
                          textAlign: 'center',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: colorDias(s.dias_pendiente),
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {s.dias_pendiente}d
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>{badgeEstado(s.estado_manual)}</td>
                      {mostrarMatch && (
                        <td style={{ ...td, textAlign: 'center' }}>
                          {matchLoading ? (
                            <Loader2
                              size={13}
                              className="animate-spin"
                              style={{ color: '#94a3b8', display: 'inline' }}
                            />
                          ) : match ? (
                            <button
                              className="match-badge inline-flex items-center gap-1"
                              onClick={() => setExpandido(abierto ? null : s.id)}
                              style={{
                                background: '#E6F1FB',
                                color: '#185FA5',
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: '9999px',
                                border: '1px solid #cfe3f5',
                                cursor: 'pointer',
                              }}
                            >
                              <ArrowLeftRight size={11} /> Match disponible
                            </button>
                          ) : null}
                        </td>
                      )}
                      <td style={{ ...td, textAlign: 'center' }}>
                        {!aplicado && !soloLectura && (
                          <button
                            onClick={() => {
                              setError(null);
                              setConfirmando(s);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-lg px-2.5 py-1.5"
                            style={{
                              border: '1px solid #009ee3',
                              color: '#009ee3',
                              background: 'white',
                            }}
                          >
                            <Check size={12} /> Marcar aplicado
                          </button>
                        )}
                      </td>
                    </tr>
                    {mostrarMatch && match && abierto && (
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td colSpan={nCols} style={{ padding: 0 }}>
                          <MatchPanel m={match} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
          {dentroFicha && filas.length > 0 && (
            <tfoot>
              <tr style={{ background: '#EEF2F7', borderTop: '2px solid #003B5C' }}>
                <td
                  colSpan={2}
                  style={{
                    padding: '10px 14px',
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#003B5C',
                  }}
                >
                  Total saldos a favor: {filas.length} documento{filas.length !== 1 ? 's' : ''}
                </td>
                <td
                  style={{
                    padding: '10px 14px',
                    textAlign: 'right',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    color: '#003B5C',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtCRC2(totalMonto)}
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Modal de confirmación (obligatorio antes de aplicar) ─────────── */}
      {confirmando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.45)' }}
          onClick={() => !guardando && setConfirmando(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-bold text-gray-800">Confirmar aplicación</h3>
            <p className="text-[13px] text-gray-600 mt-2 leading-relaxed">
              ¿Confirmás que el documento <b className="font-mono">{confirmando.documento}</b> de{' '}
              <b>{confirmando.cliente_nombre ?? confirmando.cliente_cod}</b> ya fue aplicado en
              Softland?
            </p>
            {error && <p className="text-[12px] text-red-600 mt-3 font-semibold">{error}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setConfirmando(null)}
                disabled={guardando}
                className="rounded-lg px-4 py-2 text-[13px] font-semibold border border-slate-200 text-gray-600 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={guardando}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ background: '#009ee3' }}
              >
                {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{' '}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
