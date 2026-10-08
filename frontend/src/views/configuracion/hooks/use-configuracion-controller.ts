'use client';

import { configuracionApi, type ConfiguracionApi } from '../api/configuracion-api';

/**
 * Acciones de los tabs de Configuración (antes `fetch('/api/configuracion/...')` en cada tab).
 * Los tabs conservan su estado local (optimistic UI, errores, confirmaciones); este controller solo
 * centraliza de dónde salen y a dónde van los datos. Los errores llegan como `ApiError`
 * (extiende `Error`, así que `(e as Error).message` muestra el mismo texto que antes).
 */
export function useConfiguracionController(): ConfiguracionApi {
  return configuracionApi;
}
