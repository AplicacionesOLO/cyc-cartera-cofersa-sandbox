'use client';

import { useCallback, useEffect, useState } from 'react';
import { clientesApi } from '@/views/clientes/api/clientes-api';
import type { EstadoCuentaData } from '@/views/clientes/types';
import type { EnvioReporteBody, EnvioReporteResult } from '../types';
import { reportesApi } from '../api/reportes-api';

interface EnvioEstadoCuentaBody {
  cliente_cod: string;
  cliente_nombre: string;
  contribuyente: string;
  to_email: string;
}

/**
 * Envío de un reporte HTML por el Gmail del usuario (antes API Route reportes/enviar con
 * providerToken). Lanza ApiError con el mensaje del backend si el envío falla.
 */
export function useEnvioReporte() {
  return useCallback(
    (body: EnvioReporteBody): Promise<EnvioReporteResult> => reportesApi.enviar(body),
    [],
  );
}

/** Miembros de cada Portafolio Acotado (antes rpc fn_portafolio_destinatarios). */
export function usePortafolioDestinatarios() {
  const [portaMap, setPortaMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const controller = new AbortController();
    reportesApi
      .portafolioDestinatarios({ signal: controller.signal })
      .then((r) => setPortaMap(r ?? {}))
      .catch(() => {
        /* igual que el origen: sin destinatarios extra si falla */
      });
    return () => controller.abort();
  }, []);

  return portaMap;
}

/** Opciones distintas de maestro_clientes.dimension | agrupacion para el filtro. */
export function useDimensionOpciones(tipo: 'dimension' | 'agrupacion') {
  const [opciones, setOpciones] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    reportesApi
      .dimensiones(tipo, { signal: controller.signal })
      .then((r) => setOpciones([...new Set((r ?? []).filter(Boolean))]))
      .catch(() => {
        /* filtro opcional: queda solo "Todas" */
      });
    return () => controller.abort();
  }, [tipo]);

  return opciones;
}

/**
 * Acciones del envío masivo de estados de cuenta (clientesApi, módulo clientes:
 * antes API Routes clientes/estado-cuenta/data y clientes/estado-cuenta).
 */
export function useEstadosCuentaController() {
  const cargarEstadoCuenta = useCallback(
    (cod: string): Promise<EstadoCuentaData> => clientesApi.estadoCuentaData(cod),
    [],
  );
  /** true si el correo salió (el backend lanza ApiError si falla). */
  const enviarEstadoCuenta = useCallback(async (body: EnvioEstadoCuentaBody): Promise<boolean> => {
    const r = await clientesApi.enviarEstadoCuenta({ ...body, adjunto: null });
    return r?.email_sent !== false;
  }, []);
  return { cargarEstadoCuenta, enviarEstadoCuenta };
}
