// src/lib/auditoria-legal/ubicacion-archivo.ts
//
// Catálogo de ubicación física estructurada (Mueble/Archivero + Gaveta/Caja +
// Carpeta N.°) para reemplazar el campo de texto libre "Código de Archivo".
//
// Confirmado por Jeffrey (ago 2026): estos SÍ son los nombres reales del
// mobiliario de la oficina de Cofersa (Archivero 1/2, Bóveda de Seguridad ·
// Gaveta A-D · Carpeta N.°). Sigue siendo la única constante que hay que tocar
// si el mobiliario cambia (no hay CHECK de estos valores en la base a
// propósito, ver la migración garantias_origen_registro_ubicacion_estructurada
// -- así, cambiar un nombre acá no requiere una migración).
export const MUEBLES_ARCHIVO = [
  { value: 'ARCHIVERO_1', label: 'Archivero Principal 1', corto: 'Archivero 1' },
  { value: 'ARCHIVERO_2', label: 'Archivero Principal 2', corto: 'Archivero 2' },
  { value: 'BOVEDA_SEGURIDAD', label: 'Bóveda de Seguridad', corto: 'Bóveda de Seguridad' },
] as const;

export const GAVETAS_ARCHIVO = [
  { value: 'GAVETA_A', label: 'Gaveta A (Superior)', corto: 'Gaveta A' },
  { value: 'GAVETA_B', label: 'Gaveta B', corto: 'Gaveta B' },
  { value: 'GAVETA_C', label: 'Gaveta C', corto: 'Gaveta C' },
  { value: 'GAVETA_D', label: 'Gaveta D (Inferior)', corto: 'Gaveta D' },
] as const;

export type MuebleArchivo = (typeof MUEBLES_ARCHIVO)[number]['value'];
export type GavetaArchivo = (typeof GAVETAS_ARCHIVO)[number]['value'];

export function esMuebleValido(v: string): v is MuebleArchivo {
  return MUEBLES_ARCHIVO.some((m) => m.value === v);
}
export function esGavetaValida(v: string): v is GavetaArchivo {
  return GAVETAS_ARCHIVO.some((g) => g.value === v);
}

/**
 * Arma el texto uniforme que se guarda en `ubicacion_archivero` y se muestra en
 * la columna Ubicación de la tabla, ej. "Archivero 1 · Gaveta A · Carpeta 04".
 * Usa el nombre CORTO del catálogo (no el label completo del dropdown) -- así
 * el texto no se alarga con calificadores como "Principal" o "(Superior)".
 * Carpeta se rellena a 2 dígitos, igual que el ejemplo del pedido.
 */
export function formatearUbicacionArchivo(mueble: string, gaveta: string, carpeta: number): string {
  const muebleCorto = MUEBLES_ARCHIVO.find((m) => m.value === mueble)?.corto ?? mueble;
  const gavetaCorta = GAVETAS_ARCHIVO.find((g) => g.value === gaveta)?.corto ?? gaveta;
  return `${muebleCorto} · ${gavetaCorta} · Carpeta ${String(carpeta).padStart(2, '0')}`;
}

/**
 * Tope de garantías físicas por carpeta (combinación exacta Mueble + Gaveta +
 * Carpeta) -- mismo número que usa el RPC `fn_contar_garantias_en_carpeta` en
 * la base. Sólo se usa acá para el mensaje/UX del modal de alta y edición; la
 * regla que de verdad bloquea vive en el RPC y en la validación server-side de
 * POST/PATCH -- si este número cambia algún día, hay que actualizarlo en LOS
 * DOS lugares (este archivo y la migración del RPC).
 */
export const TOPE_GARANTIAS_POR_CARPETA = 25;
