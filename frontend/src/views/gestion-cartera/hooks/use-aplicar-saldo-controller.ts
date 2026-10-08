'use client';

import { useCallback, useState } from 'react';
import { gestionCarteraApi } from '../api/gestion-cartera-api';

/** Marcar un saldo a favor como aplicado (antes UPDATE directo a saldos_favor con RLS). */
export function useAplicarSaldoController() {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Devuelve true si se aplicó; ante error deja el mismo mensaje que el original. */
  const aplicar = useCallback(async (id: string): Promise<boolean> => {
    setGuardando(true);
    setError(null);
    try {
      await gestionCarteraApi.aplicarSaldo(id);
      return true;
    } catch {
      setError('No se pudo marcar como aplicado. Intentá de nuevo.');
      return false;
    } finally {
      setGuardando(false);
    }
  }, []);

  return { aplicar, guardando, error, setError };
}
