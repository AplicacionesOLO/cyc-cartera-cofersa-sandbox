'use client';

import { useCallback } from 'react';
import { uploadToPresignedUrl } from '@/shared/api/presigned-upload';
import { auditoriaLegalApi } from '../api/auditoria-legal-api';
import type { FormularioActualizacionPayload } from '../types';

/**
 * Formulario público por token. Antes un multipart a /api/actualizar-perfil/[token]; ahora: el backend
 * valida y firma las subidas → PUT directo a S3 → envío de los datos con las rutas subidas.
 */
export function useActualizarPerfilController(token: string) {
  const enviar = useCallback(
    async (campos: FormularioActualizacionPayload, cedula: Blob, personeria: File | null) => {
      const uploads = await auditoriaLegalApi.uploadsActualizacion(token, {
        ...campos,
        cedula_file: { content_type: cedula.type, size: cedula.size },
        ...(personeria
          ? { personeria_file: { content_type: personeria.type, size: personeria.size } }
          : {}),
      });
      await uploadToPresignedUrl(uploads.cedula, cedula);
      if (uploads.personeria && personeria)
        await uploadToPresignedUrl(uploads.personeria, personeria);
      return auditoriaLegalApi.enviarActualizacion(token, {
        ...campos,
        cedula_key: uploads.cedula.key,
        personeria_key: uploads.personeria?.key ?? null,
      });
    },
    [token],
  );

  return { enviar };
}
