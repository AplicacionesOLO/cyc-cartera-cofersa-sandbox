'use client';

import { useEffect, useState } from 'react';
import type { ApiError } from '@/shared/api/api-error';
import type { Factura } from '@/types/database';
import { solicitudesApi } from '../api/solicitudes-api';

interface Resultado {
  contribuyente: string | null;
  facturas: Factura[];
  error: string | null;
}

/** Facturas con saldo > 0 del contribuyente (antes consulta directa a la tabla facturas). */
export function useFacturasClienteController(contribuyente: string | null) {
  const [res, setRes] = useState<Resultado>({ contribuyente: null, facturas: [], error: null });

  useEffect(() => {
    if (!contribuyente) return;
    const controller = new AbortController();
    solicitudesApi
      .facturasPendientes(contribuyente, { signal: controller.signal })
      .then((rows) => setRes({ contribuyente, facturas: rows ?? [], error: null }))
      .catch((e: ApiError) => {
        if (e.isCanceled) return;
        setRes({
          contribuyente,
          facturas: [],
          error: e.message ?? 'No se pudieron cargar las facturas',
        });
      });
    return () => controller.abort();
  }, [contribuyente]);

  return {
    facturas: res.facturas,
    loading: !!contribuyente && res.contribuyente !== contribuyente,
    error: res.error,
  };
}
