'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiError } from '@/shared/api/api-error';
import { gestionCarteraApi } from '../api/gestion-cartera-api';
import type { ActualizarPedidoBody, PedidosRetenidosResult } from '../types';

const MSG_ERROR = 'Error al cargar los pedidos retenidos.';

/**
 * Pedidos Retenidos: carga fn_pedidos_retenidos (score ICP + aging) y resuelve pedidos.
 * `pEmail` = email del analista para "Mi cartera", o null para Vista Global.
 * `setData` queda expuesto para el optimistic UI del componente.
 */
export function usePedidosRetenidosController(pEmail: string | null) {
  const [data, setData] = useState<PedidosRetenidosResult | null>(null);
  // Para qué `pEmail` se cargó el estado actual (undefined = todavía nada) y con qué error.
  const [cargado, setCargado] = useState<{ key: string | null | undefined; error: string | null }>({
    key: undefined,
    error: null,
  });
  const [recargando, setRecargando] = useState(false);

  // La petición no toca estado; el resultado se aplica en el callback (efecto o "Reintentar").
  const pedir = useCallback(
    (signal?: AbortSignal) => gestionCarteraApi.pedidosRetenidos(pEmail, { signal }),
    [pEmail],
  );
  const aplicar = useCallback(
    (p: Promise<PedidosRetenidosResult>) =>
      p
        .then((result) => {
          setData(result);
          setCargado({ key: pEmail, error: null });
        })
        .catch((e) => {
          if (!(e as ApiError).isCanceled) setCargado({ key: pEmail, error: MSG_ERROR });
        }),
    [pEmail],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    aplicar(pedir(ctrl.signal));
    return () => ctrl.abort();
  }, [pedir, aplicar]);

  /** "Reintentar": vuelve a cargar mostrando el skeleton. */
  const fetchData = useCallback(async () => {
    setRecargando(true);
    setCargado((prev) => ({ ...prev, error: null }));
    await aplicar(pedir());
    setRecargando(false);
  }, [pedir, aplicar]);

  /** PUT /pedidos-retenidos/{id}; lanza ApiError si falla (el componente revierte). */
  const actualizarPedido = useCallback(
    (id: string, body: ActualizarPedidoBody) => gestionCarteraApi.actualizarPedido(id, body),
    [],
  );

  const loading = recargando || cargado.key !== pEmail;
  return {
    data,
    setData,
    loading,
    error: loading ? null : cargado.error,
    fetchData,
    actualizarPedido,
  };
}
