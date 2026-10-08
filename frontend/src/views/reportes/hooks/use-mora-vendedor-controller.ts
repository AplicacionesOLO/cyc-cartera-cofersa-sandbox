'use client';

import { useCallback } from 'react';
import { reportesApi } from '../api/reportes-api';
import { useRemoteResource } from './use-remote-resource';

/** Mora por vendedor (antes rpc fn_reporte_mora_vendedor). ANALISTA acota a su propia cartera. */
export function useMoraVendedorController(userRol: string, userEmail: string) {
  const load = useCallback(
    (signal: AbortSignal) =>
      reportesApi.moraVendedor(userRol === 'ANALISTA' ? userEmail : null, { signal }),
    [userRol, userEmail],
  );
  return useRemoteResource(load, 'Error al cargar el reporte de mora por vendedor.');
}

/** Facturas con plazo especial (antes rpc fn_reporte_plazo_especial). ANALISTA ve solo sus vendedores. */
export function usePlazoEspecialController(userRol: string, userEmail: string) {
  const load = useCallback(
    (signal: AbortSignal) =>
      reportesApi.plazoEspecial(userRol === 'ANALISTA' ? userEmail : null, { signal }),
    [userRol, userEmail],
  );
  return useRemoteResource(load, 'Error al cargar facturas con plazo especial.');
}

/**
 * Clientes bloqueados (antes rpc fn_snapshot_bloqueados_semana + fn_reporte_bloqueados).
 * El snapshot semanal solo lo dispara el coordinador (el backend lo vuelve a validar).
 */
export function useBloqueadosController(userRol: string, userEmail: string) {
  const load = useCallback(
    (signal: AbortSignal) =>
      reportesApi.bloqueados(userRol === 'ANALISTA' ? userEmail : null, userRol === 'COORDINADOR', {
        signal,
      }),
    [userRol, userEmail],
  );
  return useRemoteResource(load, 'Error al cargar clientes bloqueados.');
}
