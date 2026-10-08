'use client';

import { useCallback } from 'react';
import { reportesApi } from '../api/reportes-api';
import { useRemoteResource } from './use-remote-resource';

/** Comportamiento de pago por vendedor (antes rpc fn_analisis_perfil_vendedor). */
export function useIcpVendedorController(periodo: number) {
  const load = useCallback(
    (signal: AbortSignal) => reportesApi.icpVendedor(periodo, { signal }),
    [periodo],
  );
  return useRemoteResource(load, 'Error al cargar el comportamiento de pago por vendedor.');
}
