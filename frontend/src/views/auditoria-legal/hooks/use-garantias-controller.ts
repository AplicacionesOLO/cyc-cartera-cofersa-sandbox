'use client';

import { useCallback, useEffect, useState } from 'react';
import { uploadToPresignedUrl } from '@/shared/api/presigned-upload';
import type { ApiError } from '@/shared/api/api-error';
import { auditoriaLegalApi, type CustodiaPayload } from '../api/auditoria-legal-api';
import type { AccionSolicitud, VendedorLista } from '../types';

/**
 * Datos y acciones de la pantalla de Garantías (garantias-cliente.tsx). El componente conserva su estado
 * de UI; aquí solo se centraliza de dónde salen los datos (antes el SDK anterior + fetch a /api/auditoria-legal).
 */
export function useGarantiasController() {
  const [vendedoresLista, setVendedoresLista] = useState<VendedorLista[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    auditoriaLegalApi
      .vendedores({ signal: controller.signal })
      .then(setVendedoresLista)
      .catch((e: ApiError) => {
        if (!e.isCanceled) setVendedoresLista([]);
      });
    return () => controller.abort();
  }, []);

  const cargarGarantias = useCallback(
    (miCartera: boolean) => auditoriaLegalApi.garantias(miCartera),
    [],
  );
  const cargarSinGarantia = useCallback(
    (miCartera: boolean) => auditoriaLegalApi.sinGarantia(miCartera),
    [],
  );
  const cargarSolicitudes = useCallback(() => auditoriaLegalApi.solicitudes(), []);
  const cambiarCustodia = useCallback(
    (id: number, payload: CustodiaPayload) => auditoriaLegalApi.custodia(id, payload),
    [],
  );
  const verSolicitud = useCallback((id: number) => auditoriaLegalApi.solicitud(id), []);
  const gestionarSolicitud = useCallback(
    (id: number, accion: AccionSolicitud) => auditoriaLegalApi.gestionarSolicitud(id, accion),
    [],
  );

  /** PDF firmado: URL prefirmada → PUT directo a S3 → confirmación (antes multipart a la API Route). */
  const subirDocumento = useCallback(async (id: number, file: File) => {
    const upload = await auditoriaLegalApi.documentoUploadUrl(id, {
      content_type: file.type,
      size: file.size,
    });
    await uploadToPresignedUrl(upload, file);
    return auditoriaLegalApi.adjuntarDocumento(id, upload.key);
  }, []);

  return {
    vendedoresLista,
    cargarGarantias,
    cargarSinGarantia,
    cargarSolicitudes,
    cambiarCustodia,
    subirDocumento,
    verSolicitud,
    gestionarSolicitud,
  };
}
