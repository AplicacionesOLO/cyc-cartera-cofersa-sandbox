/**
 * Carga de archivos estáticos propios del frontend (`/public`: fuentes Nunito, logo) para jsPDF/xlsx.
 * No pasa por API Gateway: son recursos del mismo origen.
 */
export async function loadStaticArrayBuffer(path: string): Promise<ArrayBuffer> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (${response.status})`);
  return response.arrayBuffer();
}

export async function loadStaticBlob(path: string): Promise<Blob> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (${response.status})`);
  return response.blob();
}
