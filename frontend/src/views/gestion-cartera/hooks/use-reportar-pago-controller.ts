'use client';

import { useCallback } from 'react';
import { uploadToPresignedUrl } from '@/shared/api/presigned-upload';
import { gestionCarteraApi } from '../api/gestion-cartera-api';
import type { ReportarPagoBody, ReportarPagoResponse } from '../types';

/**
 * Reporte de pago desde la Ficha 360°:
 * 1. Comprobante (ya comprimido en el navegador) → URL prefirmada PUT del bucket privado
 *    `comprobantes-pago` (antes storage.upload + getPublicUrl en un bucket público).
 * 2. POST /clientes/pagos/reportar con la key S3 en `url_comprobante`.
 */
export function useReportarPagoController() {
  /** Sube el comprobante; devuelve la key o undefined si falla (la subida no es bloqueante). */
  const subirComprobante = useCallback(
    async (
      clienteCod: string,
      archivo: Blob,
      filename: string,
      contentType: string,
    ): Promise<string | undefined> => {
      try {
        const upload = await gestionCarteraApi.comprobanteUploadUrl({
          cliente_cod: clienteCod,
          filename,
          content_type: contentType,
        });
        await uploadToPresignedUrl(upload, archivo);
        return upload.key;
      } catch {
        return undefined;
      }
    },
    [],
  );

  /** Lanza ApiError con el mismo `message` que devolvía la API Route original. */
  const reportarPago = useCallback(
    (body: ReportarPagoBody): Promise<ReportarPagoResponse> => gestionCarteraApi.reportarPago(body),
    [],
  );

  return { subirComprobante, reportarPago };
}
