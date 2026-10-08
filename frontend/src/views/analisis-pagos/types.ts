/** Tipos del módulo Análisis de Pagos / Pagos Aplicados (respuestas de /analisis-pagos/* y /pagos-*). */

export type EstadoRecibo = 'VALIDO' | 'ANULADO';

export interface ReciboRow {
  no_recibo: string;
  fecha_pago: string;
  tipo_pago: string | null;
  cliente_nombre: string | null;
  cliente_cod: string | null;
  n_clientes: number;
  n_facturas: number;
  monto_total: number;
  estado: EstadoRecibo;
  anulado_motivo: string | null;
  anulado_reemplazo: string | null;
  anulado_por: string | null;
  anulado_en: string | null;
  posible_duplicado: boolean;
  duplicado_descartado: boolean;
}

/** GET /analisis-pagos/pagos-mes (fn_pagos_mes_resumen). */
export interface ResumenPagosMes {
  kpis: { n_recibos: number; n_lineas: number; monto_total: number };
  recibos: ReciboRow[];
}

export interface RankingParams {
  email: string | null;
  meses: number;
  offset: number;
  limit: number;
  clasificacion: string | null;
  dimension: string | null;
  busqueda: string | null;
  orden: string;
}

export interface MarcarAnuladosBody {
  no_recibos: string[];
  motivo: string;
  recibo_reemplazo?: string;
}

export interface DescartarDuplicadoBody {
  no_recibo: string;
  nota?: string;
}
