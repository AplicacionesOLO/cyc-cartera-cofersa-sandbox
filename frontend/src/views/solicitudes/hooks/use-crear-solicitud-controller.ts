'use client';

import { useCallback } from 'react';
import type { ApiError } from '@/shared/api/api-error';
import { uploadToPresignedUrl } from '@/shared/api/presigned-upload';
import { solicitudesApi } from '../api/solicitudes-api';
import type { CrearSolicitudResponse, NuevaSolicitudContextoResponse } from '../types';

export const MSG_CONEXION = 'Error de conexión. Intentá de nuevo.';

/** Texto a mostrar para un error del API (mismo criterio que `d.error ?? fallback` / catch de red). */
export function mensajeError(e: unknown, fallback: string): string {
  const err = e as ApiError;
  if (err?.isNetworkError) return MSG_CONEXION;
  return err?.message || fallback;
}

export interface AdjuntoParaSubir {
  name: string;
  tipo: string; // 'pdf' | 'webp' | 'jpeg' | 'img'
  blob: Blob | File | undefined;
}

/**
 * Crear solicitudes (antes API Route POST /api/solicitudes + subida directa a Storage).
 * El token de Gmail ya no viaja desde el navegador: el backend usa el refresh token guardado.
 */
export function useCrearSolicitudController() {
  const enviar = useCallback(
    (body: Record<string, unknown>): Promise<CrearSolicitudResponse> => solicitudesApi.crear(body),
    [],
  );

  /**
   * Sube los adjuntos al bucket privado y devuelve la key de cada uno (null si falló, igual que
   * antes: la solicitud continúa sin ese adjunto). Mismo patrón de ruta que Reportar Pago:
   * `${cliente_cod}/${Date.now()}_${i}_${baseName}.${ext}` (el timestamp lo pone el backend).
   */
  const subirAdjuntos = useCallback(
    async (clienteCod: string, adjuntos: AdjuntoParaSubir[]): Promise<(string | null)[]> => {
      const keys: (string | null)[] = [];
      for (let i = 0; i < adjuntos.length; i++) {
        const { name, tipo, blob } = adjuntos[i];
        if (!blob) {
          keys.push(null);
          continue;
        }
        const ext = tipo === 'pdf' ? 'pdf' : tipo;
        const baseName = name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const contentType =
          ext === 'pdf' ? 'application/pdf' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        try {
          const upload = await solicitudesApi.adjuntoUploadUrl({
            cliente_cod: clienteCod,
            filename: `${i}_${baseName}.${ext}`,
            content_type: contentType,
          });
          await uploadToPresignedUrl(upload, blob);
          keys.push(upload.key);
        } catch {
          keys.push(null); // upload falló — continúa sin URL
        }
      }
      return keys;
    },
    [],
  );

  const cargarContextoCliente = useCallback(
    (cod: string): Promise<NuevaSolicitudContextoResponse> => solicitudesApi.nuevaContexto(cod),
    [],
  );

  return { enviar, subirAdjuntos, cargarContextoCliente };
}
