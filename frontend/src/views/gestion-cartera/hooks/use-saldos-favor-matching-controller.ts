'use client';

import { useEffect, useState } from 'react';
import { gestionCarteraApi } from '../api/gestion-cartera-api';
import type { MatchSaldo } from '../types';

/**
 * Matching de saldos a favor (fn_matching_saldos_favor), no bloqueante y role-scoped en el backend.
 * Sin `clienteCod` → lista del módulo (scope=list); con `clienteCod` → matches del cliente (Ficha 360°).
 * `matches` = null mientras carga; ante error queda en [] (igual que el original).
 */
export function useSaldosFavorMatchingController(clienteCod?: string) {
  const [matches, setMatches] = useState<MatchSaldo[] | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const req = clienteCod
      ? gestionCarteraApi.matchingCliente(clienteCod, { signal: ctrl.signal })
      : gestionCarteraApi.matchingLista({ signal: ctrl.signal });
    req
      .then((d) => {
        if (!ctrl.signal.aborted) setMatches((d.matches ?? []) as MatchSaldo[]);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setMatches([]);
      });
    return () => ctrl.abort();
  }, [clienteCod]);

  return { matches };
}
