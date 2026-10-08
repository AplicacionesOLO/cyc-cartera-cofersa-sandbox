'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Layers,
  MailX,
  Mail,
  FileText,
  FileSpreadsheet,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useEstadosCuentaController } from '@/views/reportes/hooks/use-envio-reporte-controller';
import { fmtCRC, fmtFecha, diasDesde } from '@/lib/utils/formato';
import {
  exportarEstadoCuentaPDF,
  exportarEstadoCuentaExcel,
  type EstadoCuentaExportParams,
} from '@/lib/utils/estado-cuenta-export';
import type { ContribEC } from './page';

type EstadoEnvio = 'ok' | 'error' | 'sin-correo' | 'procesando';
const nombreCorto = (n: string) => n.trim().split(/\s+/).slice(0, 2).join(' ');

interface Props {
  contribuyentes: ContribEC[];
  esAnalista: boolean;
  analistas: { email: string; nombre: string }[];
}

export default function EstadosCuentaCliente({ contribuyentes, esAnalista, analistas }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [soloSaldo, setSoloSaldo] = useState(true);
  const [conCorreo, setConCorreo] = useState(false);
  const [sinReciente, setSinReciente] = useState(false);
  const [analistaF, setAnalistaF] = useState('');
  const [vendedorF, setVendedorF] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [corriendo, setCorriendo] = useState(false);
  const [progreso, setProgreso] = useState<{
    hechos: number;
    total: number;
    modo: 'envio' | 'pdf' | 'excel';
  } | null>(null);
  const [resultado, setResultado] = useState<Map<string, EstadoEnvio>>(new Map());
  const { cargarEstadoCuenta, enviarEstadoCuenta } = useEstadosCuentaController();

  const vendedores = useMemo(() => {
    const map = new Map<string, string>();
    contribuyentes.forEach((c) => {
      if (c.vendedor_cod && c.vendedor_nombre) map.set(c.vendedor_cod, c.vendedor_nombre);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [contribuyentes]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return contribuyentes.filter((c) => {
      if (soloSaldo && c.saldo <= 0) return false;
      if (conCorreo && !c.correo.trim()) return false;
      if (sinReciente && c.ultimo_envio && diasDesde(c.ultimo_envio) <= 30) return false;
      if (analistaF && c.analista_email !== analistaF) return false;
      if (vendedorF && c.vendedor_cod !== vendedorF) return false;
      if (!q) return true;
      return (
        c.cliente_nombre.toLowerCase().includes(q) || c.contribuyente.toLowerCase().includes(q)
      );
    });
  }, [contribuyentes, busqueda, soloSaldo, conCorreo, sinReciente, analistaF, vendedorF]);

  const PER_PAGE = 50;
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PER_PAGE));
  const efectivaPagina = Math.min(paginaActual, totalPaginas);
  const paginaFiltrados = filtrados.slice(
    (efectivaPagina - 1) * PER_PAGE,
    efectivaPagina * PER_PAGE,
  );

  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, soloSaldo, conCorreo, sinReciente, analistaF, vendedorF]);

  const seleccionados = filtrados.filter((c) => sel.has(c.contribuyente));
  const todos = filtrados.length > 0 && filtrados.every((c) => sel.has(c.contribuyente));
  const saldoSel = seleccionados.reduce((s, c) => s + c.saldo, 0);

  function toggle(k: string) {
    setSel((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  }
  function toggleTodos() {
    setSel((prev) => {
      const n = new Set(prev);
      if (todos) filtrados.forEach((c) => n.delete(c.contribuyente));
      else filtrados.forEach((c) => n.add(c.contribuyente));
      return n;
    });
  }
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function descargar(modo: 'pdf' | 'excel') {
    if (seleccionados.length === 0 || corriendo) return;
    setCorriendo(true);
    setResultado(new Map());
    setProgreso({ hechos: 0, total: seleccionados.length, modo });
    const res = new Map<string, EstadoEnvio>();
    for (let i = 0; i < seleccionados.length; i++) {
      const c = seleccionados[i];
      res.set(c.contribuyente, 'procesando');
      setResultado(new Map(res));
      try {
        const d = await cargarEstadoCuenta(c.rep_cod);
        const params = {
          facturas: d.facturas as unknown as EstadoCuentaExportParams['facturas'],
          clienteNombre: d.clienteNombre,
          contribuyente: d.contribuyente,
          clienteCod: d.clienteCod,
          condicionPago: d.condicionPago,
          cuentas: d.cuentas,
          fechaCorte: d.fechaCorte,
          analistaNombre: d.analistaNombre,
          analistaEmail: d.analistaEmail,
          analistaTelefono: d.analistaTelefono,
          analistaWhatsapp: d.analistaWhatsapp,
        };
        if (modo === 'pdf') await exportarEstadoCuentaPDF(params);
        else await exportarEstadoCuentaExcel(params);
        res.set(c.contribuyente, 'ok');
      } catch {
        res.set(c.contribuyente, 'error');
      }
      setResultado(new Map(res));
      setProgreso({ hechos: i + 1, total: seleccionados.length, modo });
      await sleep(600);
    }
    setCorriendo(false);
  }

  async function enviar() {
    if (seleccionados.length === 0 || corriendo) return;
    const conMail = seleccionados.filter((c) => c.correo.trim());
    const sinMail = seleccionados.length - conMail.length;
    if (conMail.length === 0) {
      alert('Ninguno de los contribuyentes seleccionados tiene correo registrado.');
      return;
    }
    if (
      sinMail > 0 &&
      !confirm(
        `${sinMail} contribuyente(s) seleccionados no tienen correo y se omitirán. ¿Enviar a los ${conMail.length} que sí tienen?`,
      )
    )
      return;

    setCorriendo(true);
    setResultado(new Map());
    setProgreso({ hechos: 0, total: seleccionados.length, modo: 'envio' });
    const res = new Map<string, EstadoEnvio>();
    let hechos = 0;
    for (const c of seleccionados) {
      if (!c.correo.trim()) {
        res.set(c.contribuyente, 'sin-correo');
        setResultado(new Map(res));
        hechos++;
        setProgreso({ hechos, total: seleccionados.length, modo: 'envio' });
        continue;
      }
      res.set(c.contribuyente, 'procesando');
      setResultado(new Map(res));
      try {
        const ok = await enviarEstadoCuenta({
          cliente_cod: c.rep_cod,
          cliente_nombre: c.cliente_nombre,
          contribuyente: c.contribuyente,
          to_email: c.correo.trim(),
        });
        res.set(c.contribuyente, ok ? 'ok' : 'error');
      } catch {
        res.set(c.contribuyente, 'error');
      }
      setResultado(new Map(res));
      hechos++;
      setProgreso({ hechos, total: seleccionados.length, modo: 'envio' });
      await sleep(450);
    }
    setCorriendo(false);
  }

  const okCount = [...resultado.values()].filter((v) => v === 'ok').length;
  const errCount = [...resultado.values()].filter((v) => v === 'error').length;

  // ── estilos ──
  const pill = (activo: boolean): React.CSSProperties => ({
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
  const BTN = (enabled: boolean, primary = false): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 15px',
    borderRadius: '9px',
    fontSize: '12px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    transition: 'all 0.1s',
    border: `1px solid ${primary ? '#009ee3' : '#e2e8f0'}`,
    background: primary ? '#009ee3' : 'white',
    color: primary ? 'white' : '#374151',
    opacity: enabled ? 1 : 0.4,
    cursor: enabled ? 'pointer' : 'default',
  });

  function badgeCodigos(n: number) {
    return (
      <span
        className="inline-flex items-center gap-1"
        style={{
          background: '#E6F4FB',
          color: '#0B6FA4',
          fontSize: '10px',
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: '9999px',
        }}
      >
        <Layers size={11} />
        {n} cód.
      </span>
    );
  }
  function badgeAnalista(nombre: string) {
    return (
      <span
        className="inline-flex items-center gap-1"
        style={{
          background: '#EEEDFE',
          color: '#534AB7',
          fontSize: '10px',
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: '9999px',
          maxWidth: '100%',
        }}
      >
        <Users size={10} />
        {nombreCorto(nombre)}
      </span>
    );
  }
  function correoCell(c: ContribEC) {
    return c.correo ? (
      <span className="inline-flex items-center gap-1 min-w-0" style={{ color: '#475569' }}>
        <Mail size={11} className="text-slate-300 shrink-0" />
        <span className="truncate">{c.correo}</span>
      </span>
    ) : (
      <span
        className="inline-flex items-center gap-1"
        style={{
          background: '#f1f5f9',
          color: '#94a3b8',
          fontSize: '10px',
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: '9999px',
        }}
      >
        <MailX size={11} />
        Sin correo
      </span>
    );
  }
  function estadoCell(c: ContribEC) {
    const estado = resultado.get(c.contribuyente);
    if (estado === 'procesando')
      return (
        <Loader2
          size={15}
          className="animate-spin"
          style={{ color: '#009ee3', display: 'inline' }}
        />
      );
    if (estado === 'ok')
      return <CheckCircle2 size={15} style={{ color: '#16a34a', display: 'inline' }} />;
    if (estado === 'error')
      return <AlertCircle size={15} style={{ color: '#dc2626', display: 'inline' }} />;
    if (!c.correo.trim())
      return (
        <span
          style={{
            background: '#FCEBEB',
            color: '#A32D2D',
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 9px',
            borderRadius: '9999px',
          }}
        >
          Sin correo
        </span>
      );
    if (c.ultimo_envio)
      return (
        <span
          style={{
            background: '#EAF3DE',
            color: '#3B6D11',
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 9px',
            borderRadius: '9999px',
          }}
        >
          Enviado
        </span>
      );
    return (
      <span
        style={{
          background: '#FAEEDA',
          color: '#854F0B',
          fontSize: '10px',
          fontWeight: 700,
          padding: '2px 9px',
          borderRadius: '9999px',
        }}
      >
        Pendiente
      </span>
    );
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

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">
        {/* Toolbar: filtros + acciones en una sola tarjeta */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1" style={{ minWidth: '220px' }}>
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o contribuyente…"
                className="w-full rounded-full border border-slate-200 pl-9 pr-3 py-2 text-[12.5px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#cfe9f9] focus:border-[#009ee3]"
              />
            </div>
            <label style={pill(soloSaldo)}>
              <input
                type="checkbox"
                checked={soloSaldo}
                onChange={(e) => setSoloSaldo(e.target.checked)}
                className="accent-[#009ee3]"
              />
              Solo con saldo
            </label>
            <label style={pill(conCorreo)}>
              <input
                type="checkbox"
                checked={conCorreo}
                onChange={(e) => setConCorreo(e.target.checked)}
                className="accent-[#009ee3]"
              />
              Con correo
            </label>
            <label style={pill(sinReciente)}>
              <input
                type="checkbox"
                checked={sinReciente}
                onChange={(e) => setSinReciente(e.target.checked)}
                className="accent-[#009ee3]"
              />
              Sin envío reciente
            </label>
            {!esAnalista && (
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
            )}
            {vendedores.length > 0 && (
              <select
                value={vendedorF}
                onChange={(e) => setVendedorF(e.target.value)}
                className="rounded-full border border-slate-200 px-3.5 py-2 text-[12px] bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#cfe9f9]"
                style={{ minWidth: '170px' }}
              >
                <option value="">Todos los vendedores</option>
                {vendedores.map(([cod, nombre]) => (
                  <option key={cod} value={cod}>
                    {nombre}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[13px] text-slate-600">
                <b className="text-slate-800">{filtrados.length}</b> contribuyente
                {filtrados.length !== 1 ? 's' : ''}
              </span>
              {seleccionados.length > 0 && (
                <span
                  className="text-[12px] font-semibold rounded-full px-3 py-1"
                  style={{ background: '#E6F4FB', color: '#0B6FA4' }}
                >
                  {seleccionados.length} sel · {fmtCRC(saldoSel)}
                </span>
              )}
              <button
                onClick={toggleTodos}
                className="text-[12px] font-semibold text-[#009ee3] hover:underline"
              >
                {todos ? 'Quitar todos' : 'Seleccionar todos'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => descargar('pdf')}
                disabled={!seleccionados.length || corriendo}
                style={BTN(!!seleccionados.length && !corriendo)}
              >
                {corriendo && progreso?.modo === 'pdf' ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <FileText size={13} />
                )}{' '}
                PDF
              </button>
              <button
                onClick={() => descargar('excel')}
                disabled={!seleccionados.length || corriendo}
                style={BTN(!!seleccionados.length && !corriendo)}
              >
                {corriendo && progreso?.modo === 'excel' ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={13} />
                )}{' '}
                Excel
              </button>
              <button
                onClick={enviar}
                disabled={!seleccionados.length || corriendo}
                style={BTN(!!seleccionados.length && !corriendo, true)}
              >
                {corriendo && progreso?.modo === 'envio' ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Send size={13} />
                )}{' '}
                Enviar correo
              </button>
            </div>
          </div>
        </div>

        {/* Progreso */}
        {progreso && (
          <div className="bg-white rounded-xl border border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-gray-700">
                {progreso.modo === 'envio' ? 'Enviando' : 'Generando'}… {progreso.hechos}/
                {progreso.total}
              </span>
              <span className="text-[11px] text-gray-400">
                {okCount > 0 && <span style={{ color: '#16a34a' }}>{okCount} ok</span>}
                {errCount > 0 && (
                  <span style={{ color: '#dc2626' }} className="ml-2">
                    {errCount} error
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

        {filtrados.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-[13px] text-slate-400">
            Sin contribuyentes para los filtros
          </div>
        ) : (
          <>
            {/* ===== Tabla (pantallas anchas, sin scroll horizontal) ===== */}
            <div className="hidden lg:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table
                className="w-full"
                style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}
              >
                <colgroup>
                  <col style={{ width: '44px' }} />
                  <col />
                  <col style={{ width: '88px' }} />
                  {!esAnalista && <col style={{ width: '150px' }} />}
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '128px' }} />
                  <col style={{ width: '104px' }} />
                  <col style={{ width: '104px' }} />
                </colgroup>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #e8edf3' }}>
                    <th style={{ ...th, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={todos}
                        onChange={toggleTodos}
                        className="accent-[#009ee3]"
                      />
                    </th>
                    <th style={{ ...th, textAlign: 'left' }}>Cliente</th>
                    <th style={{ ...th, textAlign: 'center' }}>Códigos</th>
                    {!esAnalista && <th style={{ ...th, textAlign: 'left' }}>Analista</th>}
                    <th style={{ ...th, textAlign: 'left' }}>Correo</th>
                    <th style={{ ...th, textAlign: 'right' }}>Saldo total</th>
                    <th style={{ ...th, textAlign: 'center' }}>Últ. envío</th>
                    <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {paginaFiltrados.map((c) => {
                    const marcado = sel.has(c.contribuyente);
                    return (
                      <tr
                        key={c.contribuyente}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: marcado ? '#EAF3FF' : 'transparent',
                          transition: 'background .1s',
                        }}
                      >
                        <td style={{ ...td, textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() => toggle(c.contribuyente)}
                            className="accent-[#009ee3]"
                          />
                        </td>
                        <td style={td}>
                          <p
                            style={{
                              fontSize: '12.5px',
                              fontWeight: 600,
                              color: '#003B5C',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {c.cliente_nombre}
                          </p>
                          <p
                            style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}
                          >
                            {c.contribuyente}
                          </p>
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>{badgeCodigos(c.n_codigos)}</td>
                        {!esAnalista && (
                          <td style={{ ...td, overflow: 'hidden' }}>
                            <div className="truncate">{badgeAnalista(c.analista_nombre)}</div>
                          </td>
                        )}
                        <td style={{ ...td, fontSize: '11px', overflow: 'hidden', maxWidth: 0 }}>
                          <div className="truncate">{correoCell(c)}</div>
                        </td>
                        <td
                          style={{
                            ...td,
                            textAlign: 'right',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            color: c.saldo > 0 ? '#0f172a' : '#cbd5e1',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {c.saldo > 0 ? fmtCRC(c.saldo) : '—'}
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
                          {c.ultimo_envio ? fmtFecha(c.ultimo_envio) : '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>{estadoCell(c)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ===== Tarjetas (pantallas angostas, cero scroll horizontal) ===== */}
            <div className="lg:hidden space-y-2.5">
              {paginaFiltrados.map((c) => {
                const marcado = sel.has(c.contribuyente);
                return (
                  <div
                    key={c.contribuyente}
                    className="bg-white rounded-xl border shadow-sm p-3.5"
                    style={{ borderColor: marcado ? '#009ee3' : '#e8edf3' }}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => toggle(c.contribuyente)}
                        className="mt-1 accent-[#009ee3] shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p
                              className="text-[13px] font-semibold truncate"
                              style={{ color: '#003B5C' }}
                            >
                              {c.cliente_nombre}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {c.contribuyente}
                            </p>
                          </div>
                          <div className="shrink-0">{estadoCell(c)}</div>
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-400">Saldo</span>
                            <span
                              style={{
                                fontWeight: 700,
                                color: c.saldo > 0 ? '#0f172a' : '#cbd5e1',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {c.saldo > 0 ? fmtCRC(c.saldo) : '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-400">Códigos</span>
                            {badgeCodigos(c.n_codigos)}
                          </div>
                          {!esAnalista && (
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <span className="text-slate-400 shrink-0">Analista</span>
                              <span className="truncate">{badgeAnalista(c.analista_nombre)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-400">Últ. envío</span>
                            <span style={{ color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                              {c.ultimo_envio ? fmtFecha(c.ultimo_envio) : '—'}
                            </span>
                          </div>
                          <div className="col-span-2 flex items-center gap-2 min-w-0 pt-0.5 border-t border-slate-50">
                            <span className="text-slate-400 shrink-0 mt-1">Correo</span>
                            <span className="min-w-0 mt-1">{correoCell(c)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* ── Paginación ── */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between bg-white rounded-xl border border-slate-100 px-4 py-2.5">
                <span className="text-[12px] text-gray-500">
                  {(efectivaPagina - 1) * PER_PAGE + 1}–
                  {Math.min(efectivaPagina * PER_PAGE, filtrados.length)} de {filtrados.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                    disabled={efectivaPagina === 1}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 10px',
                      borderRadius: '7px',
                      fontSize: '12px',
                      fontWeight: 600,
                      border: '1px solid #e2e8f0',
                      background: 'white',
                      color: '#374151',
                      opacity: efectivaPagina === 1 ? 0.4 : 1,
                      cursor: efectivaPagina === 1 ? 'default' : 'pointer',
                    }}
                  >
                    <ChevronLeft size={13} /> Ant.
                  </button>
                  <span className="text-[12px] font-semibold text-gray-600">
                    {efectivaPagina}/{totalPaginas}
                  </span>
                  <button
                    onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                    disabled={efectivaPagina === totalPaginas}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 10px',
                      borderRadius: '7px',
                      fontSize: '12px',
                      fontWeight: 600,
                      border: '1px solid #e2e8f0',
                      background: 'white',
                      color: '#374151',
                      opacity: efectivaPagina === totalPaginas ? 0.4 : 1,
                      cursor: efectivaPagina === totalPaginas ? 'default' : 'pointer',
                    }}
                  >
                    Sig. <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
