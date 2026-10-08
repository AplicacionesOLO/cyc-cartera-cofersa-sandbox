'use client';

import type { IcpClasificacion } from '@/types/analisis-pagos';

// ── Helpers exportados ────────────────────────────────────────────────────────

export function icpClasificacion(score: number): IcpClasificacion {
  if (score >= 85) return 'EXCELENTE';
  if (score >= 70) return 'BUENO';
  if (score >= 50) return 'REGULAR';
  if (score >= 25) return 'MALO';
  return 'MUY MALO';
}

export function icpColorPrimary(score: number): string {
  if (score >= 85) return '#16a34a';
  if (score >= 70) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  if (score >= 25) return '#ea580c';
  return '#dc2626';
}

const ICP_CFG: Record<IcpClasificacion, { bg: string; text: string }> = {
  EXCELENTE: { bg: '#E1F5EE', text: '#0F6E56' },
  BUENO: { bg: '#EAF3DE', text: '#3B6D11' },
  REGULAR: { bg: '#FAEEDA', text: '#633806' },
  MALO: { bg: '#FAECE7', text: '#712B13' },
  'MUY MALO': { bg: '#FCEBEB', text: '#A32D2D' },
};

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  score?: number;
  clasificacion?: string;
  size?: 'sm' | 'md';
}

export default function ICPBadge({ score, clasificacion, size = 'md' }: Props) {
  const cls =
    (clasificacion as IcpClasificacion) ??
    (score !== undefined ? icpClasificacion(score) : 'REGULAR');
  const cfg = ICP_CFG[cls] ?? ICP_CFG['REGULAR'];
  const textSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]';

  return (
    <span
      className={`${textSize} font-bold px-2 py-0.5 rounded-full whitespace-nowrap`}
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {cls}
    </span>
  );
}
