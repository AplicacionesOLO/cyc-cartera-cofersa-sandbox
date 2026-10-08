'use client';

import { useCallback, useState } from 'react';
import { presupuestoApi } from '../api/presupuesto-api';
import type { RecuperacionPeriodoParams } from '../types';
import { useRemoteResource } from './use-remote-resource';

/** Tab "Proyección (Tesorería)": fn_proyeccion_cobro con N semanas pasadas. */
export function useProyeccionController(semanasPasadas: number) {
  const load = useCallback(
    (signal: AbortSignal) => presupuestoApi.proyeccion(semanasPasadas, { signal }),
    [semanasPasadas],
  );
  return useRemoteResource(load, 'Error al cargar la proyección.');
}

/** "Sin pago este mes": clientes con presupuesto y cero cobro + presupuesto de cartera del mes. */
export function useSinPagoController(anio: number, mes: number) {
  const load = useCallback(
    (signal: AbortSignal) => presupuestoApi.sinPago(anio, mes, { signal }),
    [anio, mes],
  );
  const { data, loading, error, reload } = useRemoteResource(
    load,
    'Error al cargar clientes sin pago.',
  );
  return {
    filas: data?.filas ?? [],
    pptoTotal: Number(data?.ppto_total ?? 0),
    loading,
    error,
    reload,
  };
}

/** Comparativo mensual de recaudo (13 meses). */
export function useRecuperacionMomController(esAnalista: boolean, userEmail: string | null) {
  const load = useCallback(
    async (signal: AbortSignal) =>
      (await presupuestoApi.recuperacionMom(13, esAnalista ? userEmail : null, { signal })) ?? [],
    [esAnalista, userEmail],
  );
  return useRemoteResource(load, 'Error al cargar el comparativo mensual.');
}

/** Recuperación por tramos de mora del período. */
export function useRecuperacionTramosController(params: RecuperacionPeriodoParams) {
  const { ini, fin, email, group } = params;
  const load = useCallback(
    (signal: AbortSignal) =>
      presupuestoApi.recuperacionTramos({ ini, fin, email, group }, { signal }),
    [ini, fin, email, group],
  );
  return useRemoteResource(load, 'Error al cargar los tramos de recuperación.');
}

/** Resumen de recuperación por período (+ meta del mes cuando es la vista del analista). */
export function useRecuperacionPeriodoController(
  params: RecuperacionPeriodoParams & { esAnalista: boolean; enabled: boolean },
) {
  const { ini, fin, email, group, esAnalista, enabled } = params;
  const [meta, setMeta] = useState<number>(0);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const r = await presupuestoApi.recuperacionPeriodo({ ini, fin, email, group }, { signal });
      if (esAnalista && email) {
        const now = new Date(Date.now() - 6 * 3600_000);
        // Igual que el original: si la meta no se puede leer, queda en 0 (no bloquea el resumen).
        const m = await presupuestoApi
          .metaAnalista(email, now.getUTCFullYear(), now.getUTCMonth() + 1, { signal })
          .catch(() => null);
        setMeta(Number(m?.meta ?? 0));
      }
      return r;
    },
    [ini, fin, email, group, esAnalista],
  );
  const resource = useRemoteResource(load, 'Error al cargar la recuperación.', { enabled });
  return { ...resource, meta };
}
