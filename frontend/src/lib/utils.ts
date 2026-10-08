import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formatea número como CRC. NUNCA usar toLocaleString() */
export function formatCRC(n: number | null | undefined): string {
  const val = Math.round(Number(n) || 0);
  return 'CRC ' + val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Formatea número corto (miles = K, millones = M) */
export function formatCRCCorto(n: number | null | undefined): string {
  const val = Math.round(Number(n) || 0);
  if (val >= 1_000_000_000) return 'CRC ' + (val / 1_000_000_000).toFixed(1) + 'B';
  if (val >= 1_000_000) return 'CRC ' + (val / 1_000_000).toFixed(1) + 'M';
  if (val >= 1_000) return 'CRC ' + (val / 1_000).toFixed(0) + 'K';
  return formatCRC(val);
}

/** Formatea fecha ISO a dd/mm/yyyy */
export function formatFecha(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return fecha;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Hoy en formato YYYY-MM-DD */
export function hoy(): string {
  return new Date().toISOString().split('T')[0];
}

/** Nivel de riesgo basado en score */
export function nivelScore(score: number): 'ROJO' | 'AMARILLO' | 'VERDE' {
  if (score >= 70) return 'ROJO';
  if (score >= 40) return 'AMARILLO';
  return 'VERDE';
}
