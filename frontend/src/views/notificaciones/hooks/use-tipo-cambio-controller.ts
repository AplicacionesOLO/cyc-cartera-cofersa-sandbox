'use client';

import { useEffect, useState } from 'react';
import type { ApiError } from '@/shared/api/api-error';
import { notificacionesApi } from '../api/notificaciones-api';
import type { TipoCambioData } from '../types';

const SIN_DATOS: TipoCambioData = { compra: null, venta: null, fecha: null, error: true };

/** Tipo de cambio BCCR del topbar (antes fetch('/api/tipo-cambio')). */
export function useTipoCambioController() {
  const [data, setData] = useState<TipoCambioData | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    notificacionesApi
      .tipoCambio({ signal: controller.signal })
      .then((d) => setData(d))
      .catch((e: ApiError) => {
        if (!e.isCanceled) setData(SIN_DATOS);
      });
    return () => controller.abort();
  }, []);

  return { data };
}
