// src/types/pedidos-retenidos.ts
// Tipos para el módulo Pedidos Retenidos (fn_pedidos_retenidos)

export type EstadoSic = 'Pendiente' | 'Aprobado' | 'Retenido';
export type Recomendacion = 'APROBAR' | 'REVISAR' | 'RETENER' | 'SIN_HISTORIAL';

export interface PedidoRetenido {
  id_pedido: string;
  codigo_cliente: string;
  cliente_nombre: string;
  fecha_pedido: string | null;
  total_mercaderia: number;
  vendedor: string | null;
  estado_sic: EstadoSic;
  comentario_analista: string | null;
  motivo_retencion: string | null;
  resuelto_por: string | null;
  resuelto_en: string | null;
  created_at: string;
  analista_email: string | null;
  analista_nombre: string | null;
  icp_score: number | null;
  icp_clasificacion: string | null;
  cartera_total: number;
  no_vencido: number;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number;
  mora_120_plus: number;
  cant_no_vencido: number;
  cant_mora_1_30: number;
  cant_mora_31_60: number;
  cant_mora_61_90: number;
  cant_mora_91_120: number;
  cant_mora_120_plus: number;
  es_cronico: boolean;
  recomendacion: Recomendacion;
}

export interface PedidosRetenidosKPIs {
  monto_total_retenido: number;
  pedidos_en_espera: number;
  ticket_promedio: number;
  casos_cronicos: number;
  anio_mes: string;
}

export interface PedidosRetenidosResult {
  kpis: PedidosRetenidosKPIs;
  rows: PedidoRetenido[];
}

// Motivos rápidos para retener un pedido (obligatorio al marcar 'Retenido').
// Dos tramos de mora a propósito: el pedido ya entra a esta pantalla porque
// Softland lo retuvo por facturas vencidas a +31 días (criterio parametrizado
// allá, no algo que el analista elija) -- "Mora vencida" cubre ese caso base,
// "Mora crítica" queda para cuando la situación escaló más allá de eso.
export const MOTIVOS_RETENCION = [
  'Supera límite de crédito',
  'Mora vencida (+31 días)',
  'Mora crítica (+60 días)',
  'Acuerdo de pago incumplido',
  'Cliente bloqueado',
  'Otro',
] as const;
