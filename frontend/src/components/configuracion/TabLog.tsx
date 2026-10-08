'use client';

import React, { useState, useCallback } from 'react';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtFechaHora } from '@/lib/utils/formato';
import { useAuditLogController } from '@/views/configuracion/hooks/use-audit-log-controller';

export interface LogRow {
  id: string;
  tabla: string;
  accion: string;
  descripcion: string;
  realizado_por: string;
  realizado_en: string;
}

interface Props {
  logs: LogRow[];
  total: number;
}

const TABLAS = ['vendedores', 'supervisores', 'usuarios', 'config_sistema', 'directorio_empresa'];
const PAGE_SIZE = 50;

const ACCION_CFG: Record<string, React.CSSProperties> = {
  INSERT: { backgroundColor: '#dcfce7', color: '#15803d' },
  UPDATE: { backgroundColor: '#e0f2fe', color: '#0369a1' },
  DELETE: { backgroundColor: '#fee2e2', color: '#dc2626' },
};

export default function TabLog({ logs: initLogs, total: initTotal }: Props) {
  const [logs, setLogs] = useState<LogRow[]>(initLogs);
  const [total, setTotal] = useState(initTotal);
  const [page, setPage] = useState(1);
  const [tabla, setTabla] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const onPagina = useCallback((data: LogRow[], t: number) => {
    setLogs(data);
    setTotal(t);
  }, []);
  const { fetchLogs, exportarCsv } = useAuditLogController({ onPagina, setLoading });

  async function handleFilter() {
    setPage(1);
    await fetchLogs({ page: 1, tabla, desde, hasta });
  }

  async function handlePage(p: number) {
    setPage(p);
    await fetchLogs({ page: p, tabla, desde, hasta });
  }

  function handleExportCSV() {
    void exportarCsv({ tabla, desde, hasta });
  }

  const inputC =
    'rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition';

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={tabla} onChange={(e) => setTabla(e.target.value)} className={inputC}>
          <option value="">Todas las tablas</option>
          {TABLAS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className={inputC}
          />
          <span className="text-xs text-gray-400">a</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className={inputC}
          />
        </div>
        <button
          onClick={handleFilter}
          className="rounded-lg px-4 py-2 text-sm font-bold text-white transition"
          style={{ backgroundColor: '#009ee3' }}
        >
          Filtrar
        </button>
        <button
          onClick={() => {
            setTabla('');
            setDesde('');
            setHasta('');
            setPage(1);
            fetchLogs({ page: 1, tabla: '', desde: '', hasta: '' });
          }}
          className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 transition"
        >
          Limpiar
        </button>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition ml-auto"
        >
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {/* Conteo */}
      <p className="text-xs text-gray-400">
        {total} registro{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
      </p>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Cargando...</div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            Sin registros para este filtro
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-4 px-4 py-3 hover:bg-gray-50">
                <div
                  className="flex-shrink-0 text-[11px] text-gray-400 tabular-nums mt-0.5"
                  style={{ minWidth: '130px' }}
                >
                  {fmtFechaHora(log.realizado_en)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{log.descripcion}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {log.realizado_por.split('@')[0]}
                    <span className="ml-2 opacity-60">[{log.tabla}]</span>
                  </p>
                </div>
                <span
                  className="flex-shrink-0 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold mt-0.5"
                  style={ACCION_CFG[log.accion] ?? { backgroundColor: '#f1f5f9', color: '#475569' }}
                >
                  {log.accion}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => handlePage(page - 1)}
            disabled={page === 1 || loading}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm text-gray-600">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => handlePage(page + 1)}
            disabled={page === totalPages || loading}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
