'use client';

import { useCallback } from 'react';
import { reportesApi } from '../api/reportes-api';
import { useRemoteResource } from './use-remote-resource';

/** Aging consolidado (antes rpc fn_reporte_aging). */
export function useAgingController() {
  const load = useCallback((signal: AbortSignal) => reportesApi.aging({ signal }), []);
  return useRemoteResource(load, 'Error al cargar el aging.');
}
