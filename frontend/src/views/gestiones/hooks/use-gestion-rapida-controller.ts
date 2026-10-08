'use client';

import type { ApiError } from '@/shared/api/api-error';
import { gestionesApi } from '../api/gestiones-api';
import type { GestionRapidaBody } from '../types';

/** Registro simple de `modal-gestion` (POST /gestiones/rapida): gestión + promesa en una transacción. */
export function useGestionRapidaController() {
  async function registrar(body: GestionRapidaBody): Promise<string | null> {
    try {
      await gestionesApi.registrarRapida(body);
      return null;
    } catch (e) {
      return `Error al guardar: ${(e as ApiError).message}`;
    }
  }
  return { registrar };
}
