'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { LogRow } from '@/components/configuracion/TabLog';
import type { ApiError } from '@/shared/api/api-error';
import { configuracionApi } from '../api/configuracion-api';
import type { LogFiltros } from '../types';

interface Opciones {
  onPagina: (logs: LogRow[], total: number) => void;
  setLoading: (loading: boolean) => void;
}

/** Mismo formato que generaba GET /api/configuracion/log?format=csv. */
function construirCsv(rows: LogRow[]): string {
  const header = 'Fecha,Tabla,Acción,Descripción,Realizado por';
  const lines = rows.map((r) =>
    [
      r.realizado_en
        ? new Date(r.realizado_en).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })
        : '',
      r.tabla ?? '',
      r.accion ?? '',
      `"${(r.descripcion ?? '').replace(/"/g, '""')}"`,
      r.realizado_por ?? '',
    ].join(','),
  );
  return [header, ...lines].join('\n');
}

function descargar(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Log del Sistema: paginación con filtros + exportación CSV (todas las filas del filtro). */
export function useAuditLogController({ onPagina, setLoading }: Opciones) {
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchLogs = useCallback(
    async (filtros: Required<Pick<LogFiltros, 'page'>> & LogFiltros) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const json = await configuracionApi.log(filtros, { signal: controller.signal });
        onPagina(json.data ?? [], json.total ?? 0);
      } catch (e) {
        if ((e as ApiError).isCanceled) return;
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    },
    [onPagina, setLoading],
  );

  const exportarCsv = useCallback(async (filtros: LogFiltros) => {
    try {
      const json = await configuracionApi.logCompleto(filtros);
      descargar(
        construirCsv(json.data ?? []),
        `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch {
      // igual que la descarga original en otra pestaña: sin mensaje en el tab
    }
  }, []);

  return { fetchLogs, exportarCsv };
}
