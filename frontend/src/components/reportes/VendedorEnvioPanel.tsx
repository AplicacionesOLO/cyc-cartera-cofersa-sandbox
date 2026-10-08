'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MailX,
  FlaskConical,
} from 'lucide-react';
import type { ApiError } from '@/shared/api/api-error';
import {
  useEnvioReporte,
  usePortafolioDestinatarios,
} from '@/views/reportes/hooks/use-envio-reporte-controller';

type EstadoEnvio = 'ok' | 'error' | 'sin-correo' | 'procesando';

export interface VendedorBase {
  vendedor_cod: string;
  vendedor_nombre: string;
  vendedor_email: string | null;
  supervisor_email: string | null;
  analistas_email: string[];
}

interface Props<T extends VendedorBase> {
  vendedores: T[];
  buildSubject: (v: T) => string;
  buildHtml: (v: T) => string;
  renderResumen: (v: T) => React.ReactNode;
  renderDetalle: (v: T) => React.ReactNode;
  kpis?: React.ReactNode;
  extras?: React.ReactNode;
  // Modo tabla ejecutiva: cuando se pasa tableHeaders se activa la vista de tabla
  tableHeaders?: string[];
  renderTablaFila?: (v: T) => React.ReactNode[];
  renderFilasDetalle?: (v: T, totalCols: number) => React.ReactNode[];
}

export default function VendedorEnvioPanel<T extends VendedorBase>({
  vendedores,
  buildSubject,
  buildHtml,
  renderResumen,
  renderDetalle,
  kpis,
  extras,
  tableHeaders,
  renderTablaFila,
  renderFilasDetalle,
}: Props<T>) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [abierto, setAbierto] = useState<Set<string>>(new Set());
  const [corriendo, setCorriendo] = useState(false);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<Map<string, EstadoEnvio>>(new Map());
  const [testEmail, setTestEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const portaMap = usePortafolioDestinatarios();
  const enviarReporte = useEnvioReporte();

  const modoPrueba = testEmail.trim().length > 0 && /\S+@\S+\.\S+/.test(testEmail.trim());

  const seleccionables = modoPrueba
    ? vendedores
    : vendedores.filter((v) => v.vendedor_email?.trim());
  const todosMarc =
    seleccionables.length > 0 && seleccionables.every((v) => sel.has(v.vendedor_cod));
  const seleccion = vendedores.filter((v) => sel.has(v.vendedor_cod));

  function toggle(cod: string) {
    setSel((prev) => {
      const n = new Set(prev);
      n.has(cod) ? n.delete(cod) : n.add(cod);
      return n;
    });
  }
  function toggleTodos() {
    setSel((prev) => {
      const n = new Set(prev);
      if (todosMarc) seleccionables.forEach((v) => n.delete(v.vendedor_cod));
      else seleccionables.forEach((v) => n.add(v.vendedor_cod));
      return n;
    });
  }
  function toggleAbierto(cod: string) {
    setAbierto((prev) => {
      const n = new Set(prev);
      n.has(cod) ? n.delete(cod) : n.add(cod);
      return n;
    });
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function enviar() {
    if (seleccion.length === 0 || corriendo) return;
    setCorriendo(true);
    setResultado(new Map());
    setErrorMsg(null);
    setProgreso({ hechos: 0, total: seleccion.length });
    const res = new Map<string, EstadoEnvio>();
    let primerError: string | null = null;

    let hechos = 0;
    for (const v of seleccion) {
      if (!modoPrueba && !v.vendedor_email?.trim()) {
        res.set(v.vendedor_cod, 'sin-correo');
        setResultado(new Map(res));
        hechos++;
        setProgreso({ hechos, total: seleccion.length });
        continue;
      }
      res.set(v.vendedor_cod, 'procesando');
      setResultado(new Map(res));
      const miembros = portaMap[v.vendedor_cod] ?? [];
      const to = modoPrueba
        ? testEmail.trim()
        : [v.vendedor_email!.trim(), ...miembros].filter((x) => x && x.trim()).join(';');
      const cc = modoPrueba
        ? []
        : [v.supervisor_email ?? '', ...(v.analistas_email ?? [])].filter((x) => x && x.trim());
      const subject = modoPrueba ? `[PRUEBA] ${buildSubject(v)}` : buildSubject(v);
      try {
        const data = await enviarReporte({ to, cc, subject, html: buildHtml(v) });
        const ok = !!data.email_sent;
        res.set(v.vendedor_cod, ok ? 'ok' : 'error');
        if (!ok && !primerError) primerError = 'No se pudo enviar el correo.';
      } catch (err) {
        res.set(v.vendedor_cod, 'error');
        if (!primerError) primerError = (err as ApiError).message || 'Error de red';
      }
      setResultado(new Map(res));
      hechos++;
      setProgreso({ hechos, total: seleccion.length });
      await sleep(450);
    }
    setErrorMsg(primerError);
    setCorriendo(false);
  }

  const okCount = [...resultado.values()].filter((v) => v === 'ok').length;
  const errCount = [...resultado.values()].filter((v) => v === 'error').length;
  const sinCount = [...resultado.values()].filter((v) => v === 'sin-correo').length;

  // Columnas totales en modo tabla: checkbox + Vendedor + tableHeaders + Portafolio + Correo + Estado
  const totalCols = tableHeaders ? tableHeaders.length + 5 : 0;

  return (
    <div className="space-y-4">
      {kpis}

      {/* Modo prueba */}
      <div
        className="bg-white rounded-xl border px-4 py-2.5 flex flex-wrap items-center gap-2"
        style={{ borderColor: modoPrueba ? '#f59e0b' : '#e2e8f0' }}
      >
        <FlaskConical size={14} style={{ color: modoPrueba ? '#f59e0b' : '#94a3b8' }} />
        <span className="text-[12px] font-semibold text-gray-600">Modo prueba:</span>
        <input
          type="text"
          value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)}
          placeholder="tu-correo@cofersa.cr (opcional)"
          className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-200"
        />
        <span className="text-[11px] text-gray-400">
          {modoPrueba
            ? '⚠ Todos los envíos irán a tu correo (sin CC, asunto [PRUEBA]).'
            : 'Dejalo vacío para enviar de verdad a cada vendedor.'}
        </span>
      </div>

      {/* Toolbar de envío */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={toggleTodos}
          className="text-[12px] font-semibold text-[#009ee3] hover:underline"
        >
          {todosMarc ? 'Quitar todos' : `Seleccionar todos (${seleccionables.length})`}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-gray-500">
            {seleccion.length} vendedor{seleccion.length !== 1 ? 'es' : ''}
          </span>
          <button
            onClick={enviar}
            disabled={corriendo || seleccion.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition disabled:opacity-40"
            style={{
              background: modoPrueba ? '#f59e0b' : '#009ee3',
              color: 'white',
              border: `1px solid ${modoPrueba ? '#f59e0b' : '#009ee3'}`,
            }}
          >
            {corriendo ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {modoPrueba ? 'Enviar prueba a mi correo' : 'Enviar a vendedores'}
          </button>
        </div>
      </div>

      {/* Error */}
      {errorMsg && (
        <div
          className="rounded-xl border px-4 py-3 flex items-start gap-2"
          style={{ background: '#fef2f2', borderColor: '#fecaca' }}
        >
          <AlertCircle size={15} style={{ color: '#dc2626', marginTop: '1px', flexShrink: 0 }} />
          <div>
            <p className="text-[12px] font-semibold text-red-700">{errorMsg}</p>
            {/Google|expirada|401/i.test(errorMsg) && (
              <p className="text-[11px] text-red-500 mt-0.5">
                Cerrá sesión (menú arriba a la derecha) y volvé a entrar con Google; luego reintentá
                el envío.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Progreso */}
      {progreso && (
        <div className="bg-white rounded-xl border border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold text-gray-700">
              Enviando… {progreso.hechos}/{progreso.total}
            </span>
            <span className="text-[11px] text-gray-400">
              {okCount > 0 && <span style={{ color: '#16a34a' }}>{okCount} ok</span>}
              {errCount > 0 && (
                <span style={{ color: '#dc2626' }} className="ml-2">
                  {errCount} error
                </span>
              )}
              {sinCount > 0 && (
                <span style={{ color: '#f59e0b' }} className="ml-2">
                  {sinCount} sin correo
                </span>
              )}
            </span>
          </div>
          <div
            style={{
              height: '6px',
              borderRadius: '3px',
              background: '#f1f5f9',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(progreso.hechos / progreso.total) * 100}%`,
                height: '100%',
                background: '#009ee3',
                transition: 'width 0.2s',
              }}
            />
          </div>
        </div>
      )}

      {/* ── Lista vendedores ── */}
      {tableHeaders && renderTablaFila ? (
        // ── MODO TABLA EJECUTIVA ──────────────────────────────────────────
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {/* Checkbox maestro */}
                  <th style={{ width: '40px', padding: '9px 12px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={todosMarc}
                      onChange={toggleTodos}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  {/* Vendedor */}
                  <th
                    style={{
                      padding: '9px 14px',
                      textAlign: 'left',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Vendedor
                  </th>
                  {/* Columnas de datos dinámicas */}
                  {tableHeaders.map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '9px 14px',
                        textAlign: 'right',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                  {/* Portafolio */}
                  <th
                    style={{
                      padding: '9px 14px',
                      textAlign: 'center',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Portafolio
                  </th>
                  {/* Correo */}
                  <th
                    style={{
                      padding: '9px 14px',
                      textAlign: 'left',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Correo
                  </th>
                  {/* Estado (sin título) */}
                  <th style={{ width: '40px' }} />
                </tr>
              </thead>
              <tbody>
                {vendedores.flatMap((v, i) => {
                  const estado = resultado.get(v.vendedor_cod);
                  const marcado = sel.has(v.vendedor_cod);
                  const open = abierto.has(v.vendedor_cod);
                  const sinMail = !v.vendedor_email?.trim();
                  const celdas = renderTablaFila(v);

                  const rowStyle: React.CSSProperties = {
                    borderBottom: open ? 'none' : '1px solid #f1f5f9',
                    background: marcado ? '#f0f9ff' : i % 2 === 1 ? '#fafafa' : 'white',
                    transition: 'background 0.15s',
                  };

                  const filas: React.ReactNode[] = [
                    <tr key={`h-${v.vendedor_cod}`} style={rowStyle}>
                      {/* Checkbox */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={marcado}
                          disabled={sinMail && !modoPrueba}
                          onChange={() => toggle(v.vendedor_cod)}
                          style={{ cursor: sinMail && !modoPrueba ? 'not-allowed' : 'pointer' }}
                        />
                      </td>
                      {/* Vendedor + caret */}
                      <td style={{ padding: '9px 14px' }}>
                        <button
                          onClick={() => toggleAbierto(v.vendedor_cod)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            textAlign: 'left',
                          }}
                        >
                          {open ? (
                            <ChevronDown size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                          ) : (
                            <ChevronRight size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                          )}
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              color: '#1e293b',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {v.vendedor_nombre}
                          </span>
                        </button>
                      </td>
                      {/* Celdas dinámicas (Meta, Cobrado, %, Proy…) */}
                      {celdas.map((cell, ci) => (
                        <td
                          key={ci}
                          style={{
                            padding: '9px 14px',
                            textAlign: 'right',
                            fontSize: '12px',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {cell}
                        </td>
                      ))}
                      {/* Portafolio */}
                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                        {!modoPrueba && (portaMap[v.vendedor_cod]?.length ?? 0) > 0 && (
                          <span
                            title={`Portafolio acotado — también va a: ${(portaMap[v.vendedor_cod] ?? []).join(', ')}`}
                            style={{
                              background: '#E6F4FB',
                              color: '#0277a8',
                              padding: '2px 8px',
                              borderRadius: 9999,
                              fontSize: '10px',
                              fontWeight: 700,
                            }}
                          >
                            +{portaMap[v.vendedor_cod].length}
                          </span>
                        )}
                      </td>
                      {/* Correo */}
                      <td style={{ padding: '9px 14px' }}>
                        {sinMail ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '10px',
                              color: '#f59e0b',
                              fontWeight: 600,
                            }}
                          >
                            <MailX size={11} />
                            Sin correo
                          </span>
                        ) : (
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                            {v.vendedor_email}
                          </span>
                        )}
                      </td>
                      {/* Estado */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', width: '40px' }}>
                        {estado === 'ok' && <CheckCircle2 size={15} style={{ color: '#16a34a' }} />}
                        {estado === 'error' && (
                          <AlertCircle size={15} style={{ color: '#dc2626' }} />
                        )}
                        {estado === 'sin-correo' && (
                          <MailX size={15} style={{ color: '#f59e0b' }} />
                        )}
                        {estado === 'procesando' && (
                          <Loader2
                            size={15}
                            className="animate-spin"
                            style={{ color: '#009ee3' }}
                          />
                        )}
                      </td>
                    </tr>,
                  ];

                  // Fila de detalle (acordeón)
                  if (open) {
                    if (renderFilasDetalle) {
                      // Inyectar filas directamente en el <tbody> para alineación perfecta de columnas
                      filas.push(...renderFilasDetalle(v, totalCols));
                    } else {
                      filas.push(
                        <tr key={`d-${v.vendedor_cod}`}>
                          <td
                            colSpan={totalCols}
                            style={{ padding: 0, borderBottom: '1px solid #f1f5f9' }}
                          >
                            <div style={{ borderTop: '1px solid #f1f5f9', overflowX: 'auto' }}>
                              {renderDetalle(v)}
                            </div>
                          </td>
                        </tr>,
                      );
                    }
                  }

                  return filas;
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // ── MODO CARDS (original) ─────────────────────────────────────────
        <div className="space-y-2">
          {vendedores.map((v) => {
            const estado = resultado.get(v.vendedor_cod);
            const marcado = sel.has(v.vendedor_cod);
            const open = abierto.has(v.vendedor_cod);
            const sinMail = !v.vendedor_email?.trim();
            return (
              <div
                key={v.vendedor_cod}
                className="bg-white rounded-xl border overflow-hidden"
                style={{ borderColor: marcado ? '#009ee3' : '#e2e8f0' }}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={sinMail && !modoPrueba}
                    onChange={() => toggle(v.vendedor_cod)}
                  />
                  <button
                    onClick={() => toggleAbierto(v.vendedor_cod)}
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                  >
                    {open ? (
                      <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-gray-800 truncate">
                        {v.vendedor_nombre}
                      </p>
                      <div className="text-[11px] text-gray-400">{renderResumen(v)}</div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {sinMail ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 font-semibold">
                        <MailX size={11} />
                        Sin correo
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400 hidden sm:inline">
                        {v.vendedor_email}
                      </span>
                    )}
                    {!modoPrueba && (portaMap[v.vendedor_cod]?.length ?? 0) > 0 && (
                      <span
                        className="inline-flex items-center text-[10px] font-bold flex-shrink-0"
                        style={{
                          background: '#E6F4FB',
                          color: '#0277a8',
                          padding: '1px 7px',
                          borderRadius: 9999,
                        }}
                        title={`Portafolio acotado — también va a: ${(portaMap[v.vendedor_cod] ?? []).join(', ')}`}
                      >
                        +{portaMap[v.vendedor_cod].length} portafolio
                      </span>
                    )}
                    {estado === 'ok' && <CheckCircle2 size={16} style={{ color: '#16a34a' }} />}
                    {estado === 'error' && <AlertCircle size={16} style={{ color: '#dc2626' }} />}
                    {estado === 'sin-correo' && <MailX size={16} style={{ color: '#f59e0b' }} />}
                    {estado === 'procesando' && (
                      <Loader2 size={16} className="animate-spin" style={{ color: '#009ee3' }} />
                    )}
                  </div>
                </div>
                {open && (
                  <div className="border-t border-gray-100 overflow-x-auto">{renderDetalle(v)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {extras}
    </div>
  );
}
