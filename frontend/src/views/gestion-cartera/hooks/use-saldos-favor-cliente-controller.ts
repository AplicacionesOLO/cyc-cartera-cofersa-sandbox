'use client';

import { useEffect, useState } from 'react';
import type { ApiError } from '@/shared/api/api-error';
import { gestionCarteraApi } from '../api/gestion-cartera-api';
import type { SaldoFavor } from '../types';

const diasDesde = (iso: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : 0;

/** Saldos a favor de un cliente (tab de la Ficha 360°). `setRows` para el optimistic UI. */
export function useSaldosFavorClienteController(clienteCod: string) {
  const [rows, setRows] = useState<SaldoFavor[]>([]);
  // Para qué cliente se cargó el estado actual (undefined = todavía nada) y con qué error.
  const [cargado, setCargado] = useState<{ key: string | undefined; error: string | null }>({
    key: undefined,
    error: null,
  });

  useEffect(() => {
    const ctrl = new AbortController();
    gestionCarteraApi
      .saldosFavorCliente(clienteCod, { signal: ctrl.signal })
      .then((data) => {
        setRows(
          (data ?? []).map((r) => ({
            ...r,
            dias_pendiente: diasDesde(r.fecha_documento),
          })) as SaldoFavor[],
        );
        setCargado({ key: clienteCod, error: null });
      })
      .catch((e) => {
        if (!(e as ApiError).isCanceled)
          setCargado({ key: clienteCod, error: 'No se pudieron cargar los saldos a favor.' });
      });
    return () => ctrl.abort();
  }, [clienteCod]);

  const loading = cargado.key !== clienteCod;
  return { rows, setRows, loading, error: loading ? null : cargado.error };
}
