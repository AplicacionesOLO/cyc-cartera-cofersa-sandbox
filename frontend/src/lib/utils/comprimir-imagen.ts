/**
 * Compresión de imagen — Canvas API nativa.
 * Objetivo: max 1280 px, 65 % calidad, preferencia WebP (fallback JPEG).
 *
 * Módulo compartido: usado por Reportar Pago (comprobantes) y por
 * los adjuntos del formulario de Solicitudes.
 */

export interface ImagenComprimida {
  blob: Blob;
  formato: 'webp' | 'jpeg';
  originalKB: number;
  finalKB: number;
}

/**
 * Comprime una imagen (File | Blob) redimensionándola a max 1280 px
 * y codificándola en WebP (con fallback a JPEG al 65 % de calidad).
 *
 * - Usa `createImageBitmap` (no necesita <img> onload).
 * - Solo reduce: nunca amplía imágenes pequeñas.
 * - Si el resultado comprimido es mayor que el original lo descarta
 *   y devuelve el original en JPEG para garantizar formato estándar.
 */
export async function comprimirImagen(source: File | Blob): Promise<ImagenComprimida> {
  const MAX_PX = 1280;
  const QUALITY = 0.65;
  const originalKB = Math.round(source.size / 1024);

  const webpOK = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  })();

  const mime: string = webpOK ? 'image/webp' : 'image/jpeg';

  const bitmap = await createImageBitmap(source);

  let w = bitmap.width;
  let h = bitmap.height;

  if (w > MAX_PX || h > MAX_PX) {
    if (w >= h) {
      h = Math.round((h * MAX_PX) / w);
      w = MAX_PX;
    } else {
      w = Math.round((w * MAX_PX) / h);
      h = MAX_PX;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const compressed = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, QUALITY));

  if (!compressed) throw new Error('Canvas toBlob devolvió null');

  if (compressed.size >= source.size) {
    const fallback = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', QUALITY),
    );
    const blob = fallback ?? compressed;
    return { blob, formato: 'jpeg', originalKB, finalKB: Math.round(blob.size / 1024) };
  }

  return {
    blob: compressed,
    formato: webpOK ? 'webp' : 'jpeg',
    originalKB,
    finalKB: Math.round(compressed.size / 1024),
  };
}
