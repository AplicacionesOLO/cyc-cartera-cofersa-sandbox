'use client';

import { useCallback, useState } from 'react';
import type { Gestion } from '../types';
import { reportesApi } from '../api/reportes-api';

/** Gestiones del período del analista (antes consulta directa a gestiones filtrada por su email). */
export function useGestionesPeriodoController(gestionesIniciales: Gestion[]) {
  const [gestiones, setGestiones] = useState<Gestion[]>(gestionesIniciales);
  const [cargando, setCargando] = useState(false);

  const buscarGestiones = useCallback(async (inicio: string, fin: string) => {
    setCargando(true);
    try {
      setGestiones((await reportesApi.gestionesPeriodo(inicio, fin)) ?? []);
    } catch {
      setGestiones([]);
    } finally {
      setCargando(false);
    }
  }, []);

  return { gestiones, cargando, buscarGestiones };
}
