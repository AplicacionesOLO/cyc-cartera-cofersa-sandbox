/**
 * Avalúo de Riesgo — fórmula corporativa (Cofersa).
 *
 * Pondera el monto de cada tramo de antigüedad por su probabilidad de
 * pérdida: cuanto más viejo el tramo, mayor el peso (+120d cuenta al 100%,
 * es decir, se considera pérdida total). El % resultante se mide contra
 * un benchmark corporativo de 15%.
 *
 * Es una fórmula lineal sobre montos (no sobre comportamiento de pago,
 * eso es el ICP) — aplica igual a nivel de cartera total, por vendedor o
 * por cliente individual, siempre que se le pasen sus propios montos por
 * tramo. Extraída de src/app/(app)/dashboard/page.tsx para reutilizarla
 * en Mora por Vendedor sin duplicar los pesos.
 */

export interface TramosAntiguedad {
  noVencido: number;
  m1_30: number;
  m31_60: number;
  m61_90: number;
  m91_120: number;
  m120_plus: number;
}

export interface AvaluoRiesgo {
  riesgoNoVencido: number;
  riesgo1_30: number;
  riesgo31_60: number;
  riesgo61_90: number;
  riesgo91_120: number;
  riesgo120Plus: number;
  totalRiesgo: number;
  avaluoPct: number; // totalRiesgo / cartera * 100
}

const PESO_NO_VENCIDO = 0.15;
const PESO_1_30 = 0.2;
const PESO_31_60 = 0.25;
const PESO_61_90 = 0.25;
const PESO_91_120 = 0.25;
const PESO_120_PLUS = 1.0;

export function calcAvaluoRiesgo(t: TramosAntiguedad, cartera: number): AvaluoRiesgo {
  const riesgoNoVencido = Math.max(0, t.noVencido) * PESO_NO_VENCIDO;
  const riesgo1_30 = Math.max(0, t.m1_30) * PESO_1_30;
  const riesgo31_60 = Math.max(0, t.m31_60) * PESO_31_60;
  const riesgo61_90 = Math.max(0, t.m61_90) * PESO_61_90;
  const riesgo91_120 = Math.max(0, t.m91_120) * PESO_91_120;
  const riesgo120Plus = Math.max(0, t.m120_plus) * PESO_120_PLUS;
  const totalRiesgo =
    riesgoNoVencido + riesgo1_30 + riesgo31_60 + riesgo61_90 + riesgo91_120 + riesgo120Plus;
  const avaluoPct = cartera > 0 ? (totalRiesgo / cartera) * 100 : 0;
  return {
    riesgoNoVencido,
    riesgo1_30,
    riesgo31_60,
    riesgo61_90,
    riesgo91_120,
    riesgo120Plus,
    totalRiesgo,
    avaluoPct,
  };
}

// Semáforo estándar del Avalúo (mismo usado en el Dashboard)
export function colorAvaluo(avaluoPct: number): string {
  return avaluoPct >= 25 ? '#dc2626' : avaluoPct >= 15 ? '#f59e0b' : '#16a34a';
}
export function bgAvaluo(avaluoPct: number): string {
  return avaluoPct >= 25 ? '#fef2f2' : avaluoPct >= 15 ? '#fffbeb' : '#f0fdf4';
}
export function badgeAvaluo(avaluoPct: number): string {
  return avaluoPct >= 25 ? 'CRÍTICO' : avaluoPct >= 15 ? 'SOBRE META' : 'DENTRO DE META';
}
