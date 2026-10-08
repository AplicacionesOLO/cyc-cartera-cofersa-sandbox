'use client';

import { useState, useMemo } from 'react';
import { AlertTriangle, Download, Send, X, Search } from 'lucide-react';
import type { FilaCarteraVencida } from './page';

// ── Helpers de formato ────────────────────────────────────────────

function fmtCRC(n: number): string {
  return (
    '₡' +
    Math.round(n)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  );
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// ── Color por tramo ───────────────────────────────────────────────

function colorTramo(tramo: string): { bg: string; text: string } {
  if (tramo === '+120 días') return { bg: '#fef2f2', text: '#991b1b' };
  if (tramo === '91-120 días') return { bg: '#fef2f2', text: '#dc2626' };
  if (tramo === '61-90 días') return { bg: '#fff7ed', text: '#c2410c' };
  if (tramo === '31-60 días') return { bg: '#fffbeb', text: '#b45309' };
  if (tramo === '1-30 días') return { bg: '#fffbeb', text: '#d97706' };
  return { bg: '#f0fdf4', text: '#166534' };
}

// ── Props ─────────────────────────────────────────────────────────

interface Props {
  filas: FilaCarteraVencida[];
  vendedores: string[];
  userEmail: string;
}

// ── Componente ────────────────────────────────────────────────────

export default function CarteraVencidaCliente({ filas, vendedores, userEmail }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [vendedorFiltro, setVendedorFiltro] = useState('TODOS');
  const [modalCliente, setModalCliente] = useState<FilaCarteraVencida | null>(null);

  // Filtrado combinado
  const filasFiltradas = useMemo(() => {
    return filas.filter((f) => {
      const matchBusqueda =
        busqueda === '' ||
        f.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        f.cliente_cod.toLowerCase().includes(busqueda.toLowerCase());
      const matchVendedor = vendedorFiltro === 'TODOS' || f.vendedor_nombre === vendedorFiltro;
      return matchBusqueda && matchVendedor;
    });
  }, [filas, busqueda, vendedorFiltro]);

  // Total de mora vencida (filtrado)
  const totalVencido = filasFiltradas.reduce((s, f) => s + f.monto_vencido, 0);

  // ── Export a Excel (.xlsx) ──────────────────────────────────────
  async function exportarExcel() {
    const XLSX = await import('xlsx');
    const datos = filasFiltradas.map((f) => ({
      Código: f.cliente_cod,
      Cliente: f.cliente_nombre,
      Vendedor: f.vendedor_nombre,
      'Tramo mora': f.tramo_mayor,
      'Monto vencido': f.monto_vencido,
      'Días sin gestión': f.dias_sin_gestion ?? 'Sin gestiones',
      'Última gestión': fmtFecha(f.ultima_gestion),
    }));

    const ws = XLSX.utils.json_to_sheet(datos);
    // Ancho de columnas
    ws['!cols'] = [
      { wch: 12 },
      { wch: 40 },
      { wch: 30 },
      { wch: 14 },
      { wch: 18 },
      { wch: 18 },
      { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cartera Vencida');

    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `cartera-vencida-${fecha}.xlsx`);
  }

  // ── Render principal ─────────────────────────────────────────────
  if (filas.length === 0) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Cartera Vencida</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Clientes con mora activa en tu cartera asignada
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
          <AlertTriangle size={48} className="text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Sin cartera vencida</h2>
          <p className="text-sm text-gray-500 max-w-md">
            No hay clientes con mora activa en tu cartera. ¡Excelente trabajo de cobro!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cartera Vencida</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Clientes con mora activa · {filasFiltradas.length} de {filas.length} clientes ·{' '}
            <span className="font-semibold text-red-600">{fmtCRC(totalVencido)}</span> vencido
          </p>
        </div>
        <button
          onClick={exportarExcel}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-white text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#009ee3', fontSize: '13px' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0080c0')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#009ee3')}
        >
          <Download size={14} />
          Exportar Excel
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        {/* Búsqueda */}
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar cliente o código..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ fontSize: '13px', '--tw-ring-color': '#009ee3' } as React.CSSProperties}
          />
        </div>

        {/* Filtro vendedor */}
        <select
          value={vendedorFiltro}
          onChange={(e) => setVendedorFiltro(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:border-transparent"
          style={{ fontSize: '13px' }}
        >
          <option value="TODOS">Todos los vendedores</option>
          {vendedores.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                {[
                  'Cliente',
                  'Vendedor',
                  'Tramo mora',
                  'Monto vencido',
                  'Días sin gestión',
                  'Última gestión',
                  '',
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 font-semibold uppercase tracking-wide whitespace-nowrap"
                    style={{ fontSize: '10px', color: '#9ca3af' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.map((fila, i) => {
                const { bg, text } = colorTramo(fila.tramo_mayor);
                const diasAlert =
                  fila.dias_sin_gestion === null
                    ? 'text-gray-400'
                    : fila.dias_sin_gestion >= 7
                      ? 'text-red-600 font-semibold'
                      : fila.dias_sin_gestion >= 4
                        ? 'text-amber-600 font-semibold'
                        : 'text-gray-700';

                return (
                  <tr
                    key={fila.cliente_cod}
                    style={{
                      borderBottom: i < filasFiltradas.length - 1 ? '1px solid #f9fafb' : 'none',
                    }}
                  >
                    {/* Cliente */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900" style={{ fontSize: '13px' }}>
                        {fila.cliente_nombre}
                      </p>
                      <p className="text-gray-400" style={{ fontSize: '11px' }}>
                        {fila.cliente_cod}
                      </p>
                    </td>

                    {/* Vendedor */}
                    <td className="px-4 py-3 text-gray-600" style={{ fontSize: '13px' }}>
                      {fila.vendedor_nombre || '—'}
                    </td>

                    {/* Tramo mora */}
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold"
                        style={{ background: bg, color: text, fontSize: '11px' }}
                      >
                        {fila.tramo_mayor}
                      </span>
                    </td>

                    {/* Monto vencido */}
                    <td
                      className="px-4 py-3 font-semibold tabular-nums text-right text-red-600"
                      style={{ fontSize: '13px' }}
                    >
                      {fmtCRC(fila.monto_vencido)}
                    </td>

                    {/* Días sin gestión */}
                    <td
                      className={`px-4 py-3 text-center ${diasAlert}`}
                      style={{ fontSize: '13px' }}
                    >
                      {fila.dias_sin_gestion === null
                        ? 'Sin gestiones'
                        : `${fila.dias_sin_gestion}d`}
                    </td>

                    {/* Última gestión */}
                    <td className="px-4 py-3 text-gray-500" style={{ fontSize: '13px' }}>
                      {fmtFecha(fila.ultima_gestion)}
                    </td>

                    {/* Acción */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setModalCliente(fila)}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        style={{ fontSize: '12px' }}
                      >
                        <Send size={12} />
                        Enviar agente
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sin resultados */}
      {filasFiltradas.length === 0 && (
        <div className="mt-6 text-center text-sm text-gray-400 py-8">
          No hay clientes que coincidan con los filtros aplicados.
        </div>
      )}

      {/* Modal "Enviar a agente" (placeholder) */}
      {modalCliente && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">Enviar a agente externo</h2>
              <button
                onClick={() => setModalCliente(null)}
                className="rounded-lg p-1.5 hover:bg-gray-100 transition-colors"
              >
                <X size={16} className="text-gray-500" />
              </button>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm font-semibold text-gray-900">{modalCliente.cliente_nombre}</p>
              <p className="text-xs text-gray-500">{modalCliente.cliente_cod}</p>
              <p className="text-sm font-semibold text-red-600 mt-1">
                {fmtCRC(modalCliente.monto_vencido)} vencido · {modalCliente.tramo_mayor}
              </p>
            </div>

            <div
              className="flex items-center gap-3 rounded-lg p-3 mb-4"
              style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}
            >
              <Send size={16} style={{ color: '#0284c7', flexShrink: 0 }} />
              <p className="text-sm" style={{ color: '#0369a1' }}>
                Esta función de envío a agente externo estará disponible próximamente.
              </p>
            </div>

            <button
              onClick={() => setModalCliente(null)}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
