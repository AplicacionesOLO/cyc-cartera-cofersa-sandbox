// src/types/dashboard-analista.ts

/**
 * Tipos de retorno de las RPCs del dashboard analista.
 * IMPORTANTE: mora_91_120 puede ser negativo (ajuste de Softland).
 * Siempre usar Math.max(0, kpis.mora_91_120) al renderizar.
 */

export interface KpisAnalistaDashboard {
  total_clientes: number;
  cartera_total: number;
  mora_total: number;
  no_vencido: number;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number; // puede ser negativo
  mora_120_plus: number;
  pct_mora: number;
  gestiones_hoy: number;
  promesas_activas: number;
  promesas_vencen_hoy: number;
  clientes_urgentes: number;
  meta_individual: number;
  cobrado_mes_estimado: number;
  meta_pct: number;
}

export interface VendedorResumen {
  vendedor_nombre: string;
  vendedor_cod: string;
  cartera_total: number;
  no_vencido: number;
  mora_total: number;
  pct_mora: number;
  mora_tramo_1_30: number;
  mora_tramo_31_60: number;
  mora_tramo_61_90: number;
  mora_tramo_91_120: number;
  mora_tramo_120_plus: number;
}

// prioridad usa 'AMBAR' (sin tilde) — así viene de la RPC
export type PrioridadCola = 'ROJO' | 'AMBAR' | 'VERDE';

export interface ColaItem {
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  mora_total: number;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number;
  mora_120_plus: number;
  cartera_total: number;
  prioridad: PrioridadCola;
  ultima_gestion_fecha: string | null;
  dias_sin_gestion: number;
  tiene_promesa_hoy: boolean;
  promesa_vencida: boolean;
  proxima_accion: string | null;
  proxima_accion_fecha: string | null;
}

export interface AgendaGestion {
  id: string;
  cliente_cod: string;
  proxima_accion: string;
  proxima_accion_fecha: string;
  cliente_nombre?: string; // enriched: nombre real del cliente
  accion_label?: string; // enriched: texto legible de la acción
}

export interface AgendaPromesa {
  id: string;
  cliente_nombre: string;
  cliente_cod: string;
  fecha_promesa: string;
  monto: number;
}

export interface PromesaPendiente {
  id: string;
  cliente_nombre: string;
  cliente_cod: string;
  monto: number;
  fecha_promesa: string;
  estado: string;
  monto_abono_parcial: number | null;
}
