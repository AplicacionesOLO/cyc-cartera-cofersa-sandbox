'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupervisorOpcion, VendedorOpcion } from '../types';
import { reportesApi } from '../api/reportes-api';
import { useRemoteResource } from './use-remote-resource';

interface Filtro {
  anio: number;
  mes: number;
  supervisorCod: string;
  vendedorCod: string;
}

/** Matriz de migración (antes rpc fn_reporte_migracion_mora + supervisores/vendedores). */
export function useMigracionMoraController({ anio, mes, supervisorCod, vendedorCod }: Filtro) {
  const [sups, setSups] = useState<SupervisorOpcion[]>([]);
  const [vens, setVens] = useState<VendedorOpcion[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    reportesApi
      .migracionFiltros({ signal: controller.signal })
      .then((f) => {
        setSups(f.supervisores ?? []);
        setVens(f.vendedores ?? []);
      })
      .catch(() => {
        /* catálogos opcionales: igual que el origen, sin opciones de filtro si fallan */
      });
    return () => controller.abort();
  }, []);

  const load = useCallback(
    (signal: AbortSignal) =>
      reportesApi.migracionMora(
        { anio, mes, supervisorCod: supervisorCod || null, vendedorCod: vendedorCod || null },
        { signal },
      ),
    [anio, mes, supervisorCod, vendedorCod],
  );
  const resource = useRemoteResource(load, 'Error al cargar la matriz de migración.');
  return { ...resource, sups, vens };
}
