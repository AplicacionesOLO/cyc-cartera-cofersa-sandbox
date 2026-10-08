'use client';

import { useCallback } from 'react';
import { clientesApi } from '../api/clientes-api';
import type { ClienteRow, FiltrosClientes } from '../types';

/**
 * "Descargar Excel" de la lista de Clientes: TODAS las filas que coinciden con los filtros, sin
 * paginar (antes la Server Action `fetchTodosLosClientes`). El backend re-verifica la sesión.
 */
export function useExportarClientesController() {
  const fetchTodosLosClientes = useCallback(
    async (filtros: FiltrosClientes): Promise<ClienteRow[]> => {
      const result = await clientesApi.listaCompleta(filtros);
      return (result?.rows ?? []).map((r) => ({ ...r, dias_mora: 0 }));
    },
    [],
  );

  return { fetchTodosLosClientes };
}
