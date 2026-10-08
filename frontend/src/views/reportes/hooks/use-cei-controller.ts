'use client';

import { useCallback, useState } from 'react';
import { reportesApi } from '../api/reportes-api';
import { useRemoteResource } from './use-remote-resource';

/** CEI por vendedor (antes rpc fn_reporte_cei) + cierre manual (fn_snapshot_cierre_cartera). */
export function useCeiController(anio: number, mes: number) {
  const load = useCallback(
    async (signal: AbortSignal) => (await reportesApi.cei(anio, mes, { signal })) ?? [],
    [anio, mes],
  );
  const resource = useRemoteResource(load, 'Error al cargar el CEI.');
  const [snapping, setSnapping] = useState(false);

  /** Guarda la cartera vencida actual como cierre de (anioCierre, mesCierre). Lanza si falla. */
  const tomarCierre = useCallback(async (anioCierre: number, mesCierre: number) => {
    setSnapping(true);
    try {
      await reportesApi.tomarCierreCartera(anioCierre, mesCierre);
    } finally {
      setSnapping(false);
    }
  }, []);

  return { ...resource, snapping, tomarCierre };
}
