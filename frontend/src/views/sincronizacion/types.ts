/** Fila de sync_log (GET /sync/historial, GET /sync/estado). */
export interface SyncRow {
  id: number;
  tipo: string;
  ejecutado_en: string;
  ejecutado_por: string;
  insertados: number;
  en_stage: number;
  omitidos: number;
  total_tabla: number;
  ultimo_registro: string | null;
  error: string | null;
}

export type SyncTipo = 'pagos' | 'cartera' | 'facturas' | 'saldos_favor' | 'pedidos_retenidos';

/** POST /sync/{cartera,facturas,saldos_favor}: resultado de fn_sync_* (solo cuenta filas). */
export interface SyncConteoResponse {
  ok: boolean;
  resultado: { total_tabla?: number; ultimo_registro?: string | null; error?: string };
}

/** POST /sync/{pagos,pedidos-retenidos} → 202: el worker SQS llama a N8N, espera y procesa. */
export interface SyncEncoladoResponse {
  ok: boolean;
  encolado: boolean;
  tipo: SyncTipo;
  solicitado_en: string;
  n8n_configurado: boolean;
}

export interface SyncEstadoResponse {
  tipo: SyncTipo;
  ultimo: SyncRow | null;
  completado: boolean;
}

export interface ResultadoSync {
  ok: boolean;
  msg: string;
}
