'use client';

import { useCallback } from 'react';
import { uploadToPresignedUrl } from '@/shared/api/presigned-upload';
import type { AplicacionRecurso, DocumentoRecurso } from '@/types/centro-recursos';
import { centroRecursosApi } from '../api/centro-recursos-api';
import type {
  CambiosAplicacion,
  MarcaFila,
  NuevaAplicacion,
  NuevaMarca,
  NuevoDocumento,
} from '../types';

/**
 * Acciones del Centro de Recursos (solo Coordinador; el backend lo valida con el rol real).
 * Los componentes conservan su propio estado/optimistic UI y reciben `ApiError` (con el mismo
 * `.message` que devolvía la API Route original) cuando algo falla.
 */
export function useCentroRecursosController() {
  const crearAplicacion = useCallback(
    async (body: NuevaAplicacion): Promise<AplicacionRecurso> =>
      (await centroRecursosApi.crearAplicacion(body)).data,
    [],
  );

  const actualizarAplicacion = useCallback(
    async (id: string, cambios: CambiosAplicacion): Promise<AplicacionRecurso> =>
      (await centroRecursosApi.actualizarAplicacion(id, cambios)).data,
    [],
  );

  /** Subida en dos pasos: URL prefirmada → PUT a S3 → registro del documento. */
  const cargarDocumento = useCallback(async (doc: NuevoDocumento): Promise<DocumentoRecurso> => {
    const upload = await centroRecursosApi.urlCargaDocumento(
      doc.file.name,
      doc.file.type || 'application/octet-stream',
    );
    await uploadToPresignedUrl(upload, doc.file);
    const res = await centroRecursosApi.registrarDocumento({
      key: upload.key,
      titulo: doc.titulo,
      descripcion: doc.descripcion,
      categoria: doc.categoria,
    });
    return res.data;
  }, []);

  const crearMarca = useCallback(
    async (body: NuevaMarca): Promise<MarcaFila> => (await centroRecursosApi.crearMarca(body)).data,
    [],
  );

  const actualizarMarca = useCallback(
    async (id: string, cambios: { nombre?: string; comprador_id?: string }): Promise<MarcaFila> =>
      (await centroRecursosApi.actualizarMarca(id, cambios)).data,
    [],
  );

  return { crearAplicacion, actualizarAplicacion, cargarDocumento, crearMarca, actualizarMarca };
}
