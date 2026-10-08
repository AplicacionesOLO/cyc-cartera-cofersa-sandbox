'use client';

import { useState } from 'react';
import type { ApiError } from '@/shared/api/api-error';
import { promesasApi } from '../api/promesas-api';
import type { ReprogramarPromesaBody, ValidarPromesaBody } from '../types';

/**
 * Acciones del modal de una promesa (cumplir / incumplir / abono / reprogramar).
 * Devuelven `true` si el API respondió OK; si no, dejan el mismo mensaje de error que mostraba la
 * API Route original en `error`.
 */
export function useAccionPromesaController() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function ejecutar(accion: () => Promise<unknown>): Promise<boolean> {
    setLoading(true);
    try {
      await accion();
      return true;
    } catch (e) {
      const err = e as ApiError;
      setError(
        err.isNetworkError ? 'Error de conexión. Intente de nuevo.' : err.message || 'Error',
      );
      setLoading(false);
      return false;
    }
  }

  return {
    loading,
    setLoading,
    error,
    setError,
    validar: (body: ValidarPromesaBody) => ejecutar(() => promesasApi.validar(body)),
    reprogramar: (body: ReprogramarPromesaBody) => ejecutar(() => promesasApi.reprogramar(body)),
  };
}
