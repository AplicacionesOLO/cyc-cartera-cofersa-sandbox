/**
 * cola-analista.ts — tipos y helpers de presentación de la Cola del día (Algoritmo V4 con ICP).
 *
 * El cálculo (consultas + semáforo critico/urgente/seguimiento/rutina, ICP, umbrales, tope diario)
 * vive en el backend: `domain/services/cola_dia.py` + `GetDashboardAnalistaUseCase` /
 * `GetMiCarteraUseCase` (GET /dashboard/analista y GET /dashboard/mi-cartera). Dashboard Analista y
 * Mi Cartera siguen usando la misma lógica y obtienen los mismos resultados.
 */

// ══════════════════════════════════════════════════════════════════════
// TIPOS EXPORTADOS
// ══════════════════════════════════════════════════════════════════════

export interface CarteraRow {
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  mora_total: number;
  dias_mora: number;
  tramo_peor: string;
  ultima_gestion_fecha: string | null;
  dias_sin_gestion: number;
  promesa_activa: boolean;
  promesa_fecha: string | null;
  promesa_monto: number | null;
  score: number;
  prioridad: 'critico' | 'urgente' | 'seguimiento' | 'rutina';
  gestionado_hoy: boolean;
  en_agenda: boolean;
  is_hard_include: boolean;
  motivo: string;
  proxima_accion: string | null;
  proxima_accion_fecha: string | null;
  icp_score: number | null; // 0-100 · null = sin historial de pagos
  pago_reciente: { monto: number; dias: number } | null; // pago en últimos 5 días
}

export interface KPIs {
  moraTotal: number;
  recuperadoMes: number;
  promesasActivas: number;
  sinGestion7d: number;
}

// ══════════════════════════════════════════════════════════════════════
// HELPER: color y etiqueta según score ICP
// ══════════════════════════════════════════════════════════════════════

export function icpColor(score: number): string {
  if (score >= 80) return '#16a34a'; // verde — Excelente/Bueno
  if (score >= 60) return '#0891b2'; // cyan  — Regular-alto
  if (score >= 40) return '#d97706'; // amber — Regular-bajo
  if (score >= 20) return '#ea580c'; // naranja — Malo
  return '#dc2626'; // rojo — Muy malo
}

export function icpLabel(score: number): string {
  if (score >= 80) return 'Bueno';
  if (score >= 60) return 'Regular';
  if (score >= 40) return 'Irregular';
  if (score >= 20) return 'Malo';
  return 'Muy malo';
}
