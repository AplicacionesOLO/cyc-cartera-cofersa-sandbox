'use client';

import { useCallback, useState } from 'react';
import type { ApiError } from '@/shared/api/api-error';
import { analisisPagosApi } from '../api/analisis-pagos-api';
import type { ResumenPagosMes } from '../types';
import { useRemoteResource } from './use-remote-resource';

/** Pagos Aplicados del Mes: resumen por recibo + desmarcar anulado. */
export function usePagosAplicadosController(
  anio: number,
  mes: number,
  onLoaded?: (r: ResumenPagosMes) => void,
) {
  const load = useCallback(
    (signal: AbortSignal) => analisisPagosApi.pagosMes(anio, mes, { signal }),
    [anio, mes],
  );
  const resource = useRemoteResource(load, 'No se pudo cargar el resumen de pagos.', { onLoaded });

  /** Devuelve el mensaje para el toast (éxito o error del API). */
  async function desmarcar(noRecibo: string): Promise<string> {
    try {
      await analisisPagosApi.desmarcarAnulado(noRecibo);
      await resource.reload();
      return `Recibo ${noRecibo} vuelve a contar en recuperación`;
    } catch (e) {
      return (e as ApiError).message ?? 'Error al desmarcar';
    }
  }

  return { ...resource, desmarcar };
}

/** Modal "Marcar como anulado" (uno o varios recibos). */
export function useMarcarAnuladoController(noRecibos: string[], onSuccess: (n: number) => void) {
  const esMultiple = noRecibos.length > 1;
  const [motivo, setMotivo] = useState('');
  const [reemplazo, setReemplazo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!motivo.trim()) {
      setError('El motivo es requerido');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const json = await analisisPagosApi.marcarAnulados({
        no_recibos: noRecibos,
        motivo: motivo.trim(),
        recibo_reemplazo: !esMultiple && reemplazo.trim() ? reemplazo.trim() : undefined,
      });
      onSuccess(json.marcados ?? noRecibos.length);
    } catch (e) {
      setError((e as ApiError).message ?? 'Error');
    } finally {
      setLoading(false);
    }
  }

  return { esMultiple, motivo, setMotivo, reemplazo, setReemplazo, loading, error, submit };
}

/** Modal "¿No es un duplicado?" (descarta el badge de posible duplicado). */
export function useDescartarDuplicadoController(noRecibo: string, onSuccess: () => void) {
  const [nota, setNota] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setLoading(true);
    setError('');
    try {
      await analisisPagosApi.descartarDuplicado({
        no_recibo: noRecibo,
        nota: nota.trim() || undefined,
      });
      onSuccess();
    } catch (e) {
      setError((e as ApiError).message ?? 'Error');
    } finally {
      setLoading(false);
    }
  }

  return { nota, setNota, loading, error, submit };
}
