'use client';

import { useState } from 'react';
import { CalendarCheck, AlertCircle, CheckCircle2, Pencil } from 'lucide-react';
import { fmtCRC } from '@/lib/utils/formato';
import { useConfiguracionController } from '@/views/configuracion/hooks/use-configuracion-controller';

export interface VentaMensualRow {
  anio: number;
  mes: number;
  total_ventas_sin_iva: number;
  cartera_total_mes: number | null;
}

interface Props {
  ventasMensuales: VentaMensualRow[];
  /** Año/mes sugerido por defecto -- el mes recién cerrado, hora Costa Rica */
  mesSugerido: { anio: number; mes: number };
}

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

// Formatea un input de monto tal cual lo escribe el usuario -- sin locale, sin K/M
function soloDigitos(v: string): string {
  return v.replace(/[^\d]/g, '');
}

export default function TabCierreMes({ ventasMensuales: init, mesSugerido }: Props) {
  const [rows, setRows] = useState<VentaMensualRow[]>(init);
  const [anio, setAnio] = useState(mesSugerido.anio);
  const [mes, setMes] = useState(mesSugerido.mes);
  const [ventas, setVentas] = useState('');
  const [cartera, setCartera] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const cfg = useConfiguracionController();

  const existente = rows.find((r) => r.anio === anio && r.mes === mes) ?? null;

  function resetForm() {
    setVentas('');
    setCartera('');
    setConfirmando(false);
  }

  async function guardar() {
    const ventasNum = Number(ventas);
    if (!ventas || ventasNum <= 0) {
      setError('Ingresá la venta sin IVA del mes');
      return;
    }

    if (existente && !confirmando) {
      // Primer click sobre un mes ya cargado -- pedir confirmación explícita antes de reemplazar
      setConfirmando(true);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const json = await cfg.guardarCierreMes({
        anio,
        mes,
        total_ventas_sin_iva: ventasNum,
        cartera_total_mes: cartera ? Number(cartera) : null,
      });

      setRows((prev) => {
        const sinEsteMs = prev.filter((r) => !(r.anio === anio && r.mes === mes));
        return [...sinEsteMs, json.data as VentaMensualRow].sort((a, b) =>
          b.anio !== a.anio ? b.anio - a.anio : b.mes - a.mes,
        );
      });
      setOk(`${MESES[mes - 1]} ${anio} guardado`);
      resetForm();
      setTimeout(() => setOk(null), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function cargarParaEditar(row: VentaMensualRow) {
    setAnio(row.anio);
    setMes(row.mes);
    setVentas(String(Math.round(row.total_ventas_sin_iva)));
    setCartera(row.cartera_total_mes ? String(Math.round(row.cartera_total_mes)) : '');
    setConfirmando(false);
    setError(null);
    setOk(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="space-y-6">
      {/* ── Explicación ─────────────────────────────────────────────── */}
      <div
        className="rounded-xl px-4 py-3 flex items-start gap-2.5"
        style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}
      >
        <CalendarCheck size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#1D4ED8' }} />
        <p className="text-[12px]" style={{ color: '#1E40AF' }}>
          El snapshot de cartera/aging del mes (reporte <strong>Cierre Mensual</strong>) se congela
          solo, la última noche del mes. Lo único manual es esta venta -- se usa para calcular{' '}
          <strong>DSO</strong> en el Dashboard y el Resumen Ejecutivo. La Cartera Total del corte es
          opcional: si se deja vacía, ese mes se muestra como &quot;estimado&quot; en el gráfico de
          DSO.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      {ok && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 size={14} />
          {ok}
        </div>
      )}

      {/* ── Formulario ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm font-semibold text-gray-800 mb-4">Cargar venta del mes</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Mes
            </label>
            <select
              value={mes}
              onChange={(e) => {
                setMes(Number(e.target.value));
                setConfirmando(false);
              }}
              className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {MESES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Año
            </label>
            <input
              type="number"
              value={anio}
              onChange={(e) => {
                setAnio(Number(e.target.value));
                setConfirmando(false);
              }}
              className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Ventas sin IVA (₡)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={ventas}
              onChange={(e) => setVentas(soloDigitos(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Cartera Total del corte (₡){' '}
              <span className="normal-case text-gray-300">· opcional</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={cartera}
              onChange={(e) => setCartera(soloDigitos(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {confirmando && existente && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-[12px] text-amber-800">
            <AlertCircle size={13} className="flex-shrink-0" />
            Ya existe un valor para{' '}
            <strong>
              {MESES[mes - 1]} {anio}
            </strong>{' '}
            ({fmtCRC(existente.total_ventas_sin_iva)}). Presioná &quot;Confirmar reemplazo&quot;
            para sobreescribirlo.
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={guardar}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-bold text-white transition disabled:opacity-60"
            style={{ background: confirmando ? '#d97706' : '#009ee3' }}
          >
            {loading
              ? 'Guardando...'
              : confirmando
                ? 'Confirmar reemplazo'
                : existente
                  ? 'Reemplazar'
                  : 'Guardar'}
          </button>
          {confirmando && (
            <button
              onClick={resetForm}
              className="text-[12px] text-gray-500 hover:text-gray-700 font-medium"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* ── Historial ───────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
          Meses cargados
        </p>
        {rows.length === 0 ? (
          <p className="text-[12px] text-gray-400 text-center py-8">Sin meses cargados aún.</p>
        ) : (
          <div className="bg-white border border-slate-100 rounded-xl overflow-hidden overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
              <thead>
                <tr>
                  <th
                    style={{
                      padding: '8px 14px',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      textAlign: 'left',
                      background: '#f8fafc',
                    }}
                  >
                    Mes
                  </th>
                  <th
                    style={{
                      padding: '8px 14px',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      textAlign: 'right',
                      background: '#f8fafc',
                    }}
                  >
                    Ventas sin IVA
                  </th>
                  <th
                    style={{
                      padding: '8px 14px',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      textAlign: 'right',
                      background: '#f8fafc',
                    }}
                  >
                    Cartera Total del corte
                  </th>
                  <th
                    style={{
                      padding: '8px 14px',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      textAlign: 'right',
                      background: '#f8fafc',
                    }}
                  ></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${r.anio}-${r.mes}`}
                    style={{
                      borderTop: '1px solid #f1f5f9',
                      background: i % 2 === 1 ? '#fafafa' : 'white',
                    }}
                  >
                    <td
                      style={{
                        padding: '8px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#374151',
                      }}
                    >
                      {MESES[r.mes - 1]} {r.anio}
                    </td>
                    <td
                      style={{
                        padding: '8px 14px',
                        fontSize: '12px',
                        color: '#374151',
                        textAlign: 'right',
                      }}
                      className="tabular-nums"
                    >
                      {fmtCRC(r.total_ventas_sin_iva)}
                    </td>
                    <td
                      style={{ padding: '8px 14px', fontSize: '12px', textAlign: 'right' }}
                      className="tabular-nums"
                    >
                      {r.cartera_total_mes ? (
                        <span style={{ color: '#374151' }}>{fmtCRC(r.cartera_total_mes)}</span>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>— estimado</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                      <button
                        onClick={() => cargarParaEditar(r)}
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50"
                      >
                        <Pencil size={11} /> Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
