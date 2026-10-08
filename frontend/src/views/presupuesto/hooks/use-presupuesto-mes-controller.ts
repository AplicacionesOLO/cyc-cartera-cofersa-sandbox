'use client';

import { useCallback, useEffect, useState } from 'react';
import { presupuestoApi } from '../api/presupuesto-api';
import type { VendedorOpcion } from '../types';
import { useRemoteResource } from './use-remote-resource';

/**
 * Tab "Presupuesto del mes": congelado o estimado + acciones del coordinador
 * (congelar/regenerar, editar meta, reasignar cliente) y lista de vendedores para "mover a".
 */
export function usePresupuestoMesController(anio: number, mes: number) {
  const load = useCallback(
    (signal: AbortSignal) => presupuestoApi.mes(anio, mes, { signal }),
    [anio, mes],
  );
  const { data, loading, error, reload } = useRemoteResource(
    load,
    'Error al cargar el presupuesto.',
  );
  const [accion, setAccion] = useState(false); // congelar/regenerar/reasignar en curso
  const [vendList, setVendList] = useState<VendedorOpcion[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    presupuestoApi
      .vendedores({ signal: controller.signal })
      .then(setVendList)
      .catch(() => {
        if (!controller.signal.aborted) setVendList([]);
      });
    return () => controller.abort();
  }, []);

  async function ejecutar(fn: () => Promise<unknown>) {
    setAccion(true);
    try {
      await fn();
      await reload();
    } catch {
      alert('Error al aplicar el cambio.');
    } finally {
      setAccion(false);
    }
  }

  return {
    data,
    loading,
    error,
    reload,
    accion,
    vendList,
    /** Congelar o regenerar el mes (fn_presupuesto_guardar). */
    congelar: () => ejecutar(() => presupuestoApi.congelar(anio, mes)),
    reasignar: (clienteCod: string, vendedorCod: string) =>
      ejecutar(() => presupuestoApi.reasignar(anio, mes, clienteCod, vendedorCod)),
    guardarMeta: (vendedorCod: string, meta: number) =>
      ejecutar(() => presupuestoApi.ajustarMeta(anio, mes, vendedorCod, meta)),
  };
}
