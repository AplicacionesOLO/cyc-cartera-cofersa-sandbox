'use client';

import { useCallback } from 'react';
import type { AlertasResult } from '@/types/analisis-pagos';
import { analisisPagosApi } from '../api/analisis-pagos-api';
import type { RankingParams } from '../types';
import { useRemoteResource } from './use-remote-resource';

/** Tab "Ranking de clientes" (paginado en el servidor). */
export function useRankingClientesController(params: RankingParams) {
  const { email, meses, offset, limit, clasificacion, dimension, busqueda, orden } = params;
  const load = useCallback(
    (signal: AbortSignal) =>
      analisisPagosApi.rankingClientes(
        { email, meses, offset, limit, clasificacion, dimension, busqueda, orden },
        { signal },
      ),
    [email, meses, offset, limit, clasificacion, dimension, busqueda, orden],
  );
  return useRemoteResource(load, 'Error al cargar el ranking. Intentá de nuevo.');
}

/** Tab "Perfil por vendedor". */
export function usePerfilVendedorController(email: string | null, meses: number, orden: string) {
  const load = useCallback(
    (signal: AbortSignal) => analisisPagosApi.perfilVendedor(email, meses, orden, { signal }),
    [email, meses, orden],
  );
  return useRemoteResource(load, 'Error al cargar datos de vendedores.');
}

/** Tab "Alertas de deterioro" (avisa la cantidad crítica para el badge del tab). */
export function useAlertasDeterioroController(
  email: string | null,
  onDataLoaded?: (count: number) => void,
) {
  const load = useCallback(
    (signal: AbortSignal) => analisisPagosApi.alertasDeterioro(email, { signal }),
    [email],
  );
  return useRemoteResource(load, 'Error al cargar alertas.', {
    onLoaded: (r: AlertasResult) => onDataLoaded?.(r.kpis.deterioro_critico),
  });
}

/** Tab "Concentración de riesgo": no se consulta para quien gestiona cartera propia. */
export function useConcentracionController(esAnalista: boolean) {
  const load = useCallback((signal: AbortSignal) => analisisPagosApi.concentracion({ signal }), []);
  return useRemoteResource(load, 'Error al cargar datos de concentración.', {
    enabled: !esAnalista,
  });
}
