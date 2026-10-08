/**
 * Utilidades de fecha/hora para la zona horaria America/Costa_Rica (UTC-6, sin DST).
 * TODAS las fechas y horas del módulo de gestiones deben pasar por estas funciones.
 */

const TZ = 'America/Costa_Rica';

/** Fecha actual en CR → 'YYYY-MM-DD' */
export function hoyISO_CR(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
}

/** Hora actual en CR → 'HH:MM:SS' */
export function horaActual_CR(): string {
  return new Date().toLocaleTimeString('sv-SE', { timeZone: TZ, hour12: false });
}

/** Timestamp completo en CR → { fecha: 'YYYY-MM-DD', hora: 'HH:MM:SS' } */
export function ahoraCR(): { fecha: string; hora: string } {
  return {
    fecha: hoyISO_CR(),
    hora: horaActual_CR(),
  };
}

/**
 * Compara si una fecha ISO 'YYYY-MM-DD' es anterior a hoy en CR.
 * Usado para validar que "próxima acción" no sea pasada.
 */
export function esFechaPasadaCR(fechaISO: string): boolean {
  return fechaISO < hoyISO_CR();
}

/**
 * Formatea una fecha ISO para mostrarla en la UI (ej: "14 may 2026").
 * Siempre interpreta la fecha en CR.
 */
export function fmtFechaCR(fechaISO: string | null | undefined): string {
  if (!fechaISO) return '—';
  const [y, m, d] = fechaISO.split('-').map(Number);
  const dt = new Date(y, m - 1, d); // local — sin timezone offset
  return dt.toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Formatea fecha + hora para el timeline (ej: "14 may 2026 · 09:15").
 */
export function fmtFechaHoraCR(fechaISO: string, horaISO: string): string {
  return `${fmtFechaCR(fechaISO)} · ${horaISO?.slice(0, 5) ?? ''}`;
}
