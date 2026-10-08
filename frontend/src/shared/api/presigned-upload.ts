/**
 * Subida directa a S3 con una URL prefirmada emitida por el backend.
 *
 * Va separada de axiosApiGateway a propósito: la URL ya está firmada, así que no lleva
 * baseURL ni header Authorization (agregarlo invalida la firma). Sigue siendo HTTP
 * centralizado en shared/api y devuelve errores normalizados (ApiError).
 *
 *   const upload = await attachmentsApi.createUploadUrl(taskId, file, { signal });
 *   await uploadToPresignedUrl(upload, file, { signal });
 */
import axios from 'axios';
import { normalizeError } from './api-error';

export interface PresignedUpload {
  url: string;
  key: string;
  method?: string;
  headers?: Record<string, string>;
}

export interface UploadOptions {
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

const storageClient = axios.create({ timeout: 300000 });

export async function uploadToPresignedUrl(
  upload: PresignedUpload,
  file: Blob,
  options: UploadOptions = {},
): Promise<void> {
  try {
    await storageClient.request({
      url: upload.url,
      method: (upload.method ?? 'PUT') as 'PUT' | 'POST',
      data: file,
      headers: { ...(upload.headers ?? {}) },
      signal: options.signal,
      onUploadProgress: (event) => {
        if (options.onProgress && event.total) {
          options.onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    });
  } catch (error) {
    throw normalizeError(error);
  }
}
