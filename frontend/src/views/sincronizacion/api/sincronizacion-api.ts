/** Configuración → Sincronización (antes /api/sync/* y consultas a sync_log). */
import { browserHttp } from '@/shared/api/browser-http';
import type { HttpClient, RequestOptions } from '@/shared/api/http-client';
import type {
  SyncConteoResponse,
  SyncEncoladoResponse,
  SyncEstadoResponse,
  SyncRow,
  SyncTipo,
} from '../types';

export function createSincronizacionApi(http: HttpClient) {
  return {
    historial: (options?: RequestOptions) => http.get<SyncRow[]>('/sync/historial', options),
    /** Última fila de sync_log del tipo ejecutada desde `desde` (null mientras el worker no termina). */
    estado: (tipo: SyncTipo, desde?: string, options?: RequestOptions) =>
      http.get<SyncEstadoResponse>('/sync/estado', { ...options, params: { tipo, desde } }),
    syncCartera: (options?: RequestOptions) =>
      http.post<SyncConteoResponse>('/sync/cartera', undefined, options),
    syncFacturas: (options?: RequestOptions) =>
      http.post<SyncConteoResponse>('/sync/facturas', undefined, options),
    syncSaldosFavor: (options?: RequestOptions) =>
      http.post<SyncConteoResponse>('/sync/saldos_favor', undefined, options),
    /** 202: encolado; el resultado se lee con `estado('pagos', solicitado_en)`. */
    syncPagos: (options?: RequestOptions) =>
      http.post<SyncEncoladoResponse>('/sync/pagos', undefined, options),
    syncPedidosRetenidos: (options?: RequestOptions) =>
      http.post<SyncEncoladoResponse>('/sync/pedidos-retenidos', undefined, options),
  };
}

export const sincronizacionApi = createSincronizacionApi(browserHttp);
