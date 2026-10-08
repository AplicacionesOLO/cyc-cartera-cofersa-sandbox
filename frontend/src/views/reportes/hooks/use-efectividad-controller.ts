'use client';

import { useCallback, useState } from 'react';
import type { EfectividadResult } from '@/types/reportes';
import { reportesApi } from '../api/reportes-api';

/** Efectividad de gestiones (antes rpc fn_reporte_efectividad). Se carga a demanda por rango. */
export function useEfectividadController() {
  const [data, setData] = useState<EfectividadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);

  const fetchData = useCallback(async (iniDate: string, finDate: string) => {
    setLoading(true);
    setError(null);
    try {
      setData(await reportesApi.efectividad(iniDate, finDate));
      setCargado(true);
    } catch (e) {
      setError('Error al cargar el reporte. Intentá de nuevo.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, cargado, fetchData };
}
