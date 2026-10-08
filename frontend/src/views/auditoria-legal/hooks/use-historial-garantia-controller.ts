'use client';

import { useEffect, useState } from 'react';
import type { ApiError } from '@/shared/api/api-error';
import type { GarantiaEventoRow } from '@/types/auditoria-legal';
import { auditoriaLegalApi } from '../api/auditoria-legal-api';

/** Timeline de garantia_eventos para "Ver Historial". */
export function useHistorialGarantiaController(garantiaId: number) {
  const [eventos, setEventos] = useState<GarantiaEventoRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    auditoriaLegalApi
      .eventos(garantiaId, { signal: controller.signal })
      .then((data) => {
        setError('');
        setEventos(data);
      })
      .catch((e: ApiError) => {
        if (!e.isCanceled) setError('Error al cargar el historial.');
      });
    return () => controller.abort();
  }, [garantiaId]);

  return { eventos, error };
}
