// src/types/analisis-pagos.ts
// Tipos para el módulo Análisis de Pagos

export type IcpClasificacion = 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'MALO' | 'MUY MALO';

export interface RankingKPIs {
  icp_promedio: number;
  // Tramo 1: pagan en fecha o con tolerancia (≤5d)
  cnt_puntual: number;
  pct_puntual: number;
  // Tramo 2: atraso manejable (6-30d)
  cnt_moderado: number;
  pct_moderado: number;
  // Tramo 3: atraso grave (>30d)
  cnt_grave: number;
  pct_grave: number;
  // 5ª KPI: días promedio general
  dias_atraso_promedio: number;
  total_clientes: number;
}

export interface RankingRow {
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  vendedor_cod: string;
  analista_nombre: string;
  dimension: string;
  icp_score: number;
  n_pagos: number;
  dias_atraso_prom: number;
  pagos_puntual: number;
  clasificacion: IcpClasificacion;
  tendencia_3m: number;
  cartera_actual: number;
}

export interface RankingResult {
  kpis: RankingKPIs;
  total: number;
  rows: RankingRow[];
}

export interface VendedorRow {
  vendedor_cod: string;
  vendedor_nombre: string;
  supervisor_cod: string;
  total_clientes: number;
  icp_promedio: number;
  pct_a_tiempo: number;
  dias_atraso_prom: number;
  clientes_criticos: number;
}

export interface VendedorKPIs {
  mejor_icp_vendedor: string;
  mejor_icp_valor: number;
  mayor_riesgo_vendedor: string;
  mayor_riesgo_pct: number;
  mejor_puntual_vendedor: string;
  mejor_puntual_pct: number;
  peor_dias_vendedor: string;
  peor_dias_valor: number;
}

export interface VendedorResult {
  kpis: VendedorKPIs;
  rows: VendedorRow[];
}

export interface AlertaRow {
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  analista_nombre: string;
  cartera_actual: number;
  icp_actual: number;
  icp_anterior: number;
  variacion: number;
  dias_actual: number;
  dias_anterior: number;
}

export interface AlertasKPIs {
  deterioro_critico: number;
  deterioro_moderado: number;
  recuperacion: number;
  sin_historial: number;
}

export interface AlertasResult {
  kpis: AlertasKPIs;
  deterioro_critico: AlertaRow[];
  deterioro_moderado: AlertaRow[];
  recuperacion: AlertaRow[];
}

export interface ConcentracionRow {
  rank: number;
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  mora_total: number;
  pct_mora: number;
  pct_acumulado: number;
  icp_score: number | null;
  clasificacion: IcpClasificacion | null;
}

export interface ConcentracionKPIs {
  pct_top10: number;
  pct_top3_vendedores: number;
  pct_grandes: number;
  hhi_nivel: 'ALTO' | 'MEDIO' | 'BAJO';
  hhi_valor: number;
}

export interface ConcentracionResult {
  kpis: ConcentracionKPIs;
  top10: ConcentracionRow[];
  total_mora: number;
}

export interface TendenciaPagoPunto {
  anio: number;
  mes: number;
  dias_atraso_prom: number;
  icp_mes: number;
  monto_pagado: number;
  n_pagos: number;
  pct_a_tiempo: number;
}
