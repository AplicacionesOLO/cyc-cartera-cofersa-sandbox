'use client';

import { useCallback } from 'react';
import { notificacionesApi } from '../api/notificaciones-api';
import type { CabysResponse, HaciendaResponse } from '../types';

/**
 * Consultas públicas de Hacienda (antes /api/hacienda y /api/hacienda/cabys). El componente conserva su
 * estado; un error HTTP (p. ej. cédula inválida → 400) llega como excepción, igual que `!res.ok`.
 */
export function useHaciendaController() {
  const consultarContribuyente = useCallback(
    (identificacion: string): Promise<HaciendaResponse> =>
      notificacionesApi.hacienda(identificacion),
    [],
  );

  const buscarCabys = useCallback(
    (q: string): Promise<CabysResponse> => notificacionesApi.cabys(q),
    [],
  );

  return { consultarContribuyente, buscarCabys };
}
