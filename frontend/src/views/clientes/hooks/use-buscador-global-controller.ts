'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clientesApi } from '../api/clientes-api';
import type { ClienteResultado, FacturaResultado, MarcaResultado } from '../types';

const DEBOUNCE_MS = 280;

/**
 * Buscador global del Topbar: índices Clientes / Facturas / Marcas (GET /clientes/buscar) con
 * debounce de 280 ms. Cada búsqueda nueva cancela la anterior. Un error deja las listas vacías
 * (igual que el `catch` del fetch original).
 */
export function useBuscadorGlobalController() {
  const [clientes, setClientes] = useState<ClienteResultado[]>([]);
  const [facturas, setFacturas] = useState<FacturaResultado[]>([]);
  const [marcas, setMarcas] = useState<MarcaResultado[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const limpiar = useCallback(() => {
    setClientes([]);
    setFacturas([]);
    setMarcas([]);
  }, []);

  const cancelar = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
  }, []);

  const buscar = useCallback(
    (val: string) => {
      cancelar();
      if (val.trim().length < 2) {
        limpiar();
        return;
      }
      timerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        try {
          const data = await clientesApi.buscar(val, { signal: controller.signal });
          setClientes(Array.isArray(data.clientes) ? data.clientes : []);
          setFacturas(Array.isArray(data.facturas) ? data.facturas : []);
          setMarcas(Array.isArray(data.marcas) ? data.marcas : []);
        } catch {
          if (!controller.signal.aborted) limpiar();
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      }, DEBOUNCE_MS);
    },
    [cancelar, limpiar],
  );

  useEffect(() => cancelar, [cancelar]);

  return { clientes, facturas, marcas, loading, buscar, limpiar };
}
