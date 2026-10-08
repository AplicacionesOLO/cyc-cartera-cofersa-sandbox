/** Gestión de Cartera: pedidos retenidos, saldos a favor (+ matching), comprobantes y reporte de pagos. */
import { browserHttp } from '@/shared/api/browser-http';
import { seg, type HttpClient, type RequestOptions } from '@/shared/api/http-client';
import type {
  ActualizarPedidoBody,
  ActualizarPedidoResponse,
  ComprobanteUpload,
  ComprobanteUploadRequest,
  MatchingListResponse,
  MatchingResumenResponse,
  PedidosRetenidosResult,
  ReportarPagoBody,
  ReportarPagoResponse,
  SaldoFavor,
} from '../types';

export function createGestionCarteraApi(http: HttpClient) {
  return {
    /** fn_pedidos_retenidos(p_email): `email` vacío = Vista Global. */
    pedidosRetenidos: (email: string | null, options?: RequestOptions) =>
      http.get<PedidosRetenidosResult>('/pedidos-retenidos', { ...options, params: { email } }),
    actualizarPedido: (id: string, body: ActualizarPedidoBody, options?: RequestOptions) =>
      http.put<ActualizarPedidoResponse>(`/pedidos-retenidos/${seg(id)}`, body, options),

    /** fn_saldos_favor(p_email): el backend fuerza la cartera propia del analista. */
    saldosFavor: (email: string | null, options?: RequestOptions) =>
      http.get<SaldoFavor[]>('/saldos-favor', { ...options, params: { email } }),
    /** Saldos de un cliente (tab de la Ficha 360°), sin `dias_pendiente` (se calcula en el front). */
    saldosFavorCliente: (clienteCod: string, options?: RequestOptions) =>
      http.get<Omit<SaldoFavor, 'dias_pendiente'>[]>('/saldos-favor/por-cliente', {
        ...options,
        params: { cliente_cod: clienteCod },
      }),
    aplicarSaldo: (id: string, options?: RequestOptions) =>
      http.post<{ ok: boolean }>(`/saldos-favor/${seg(id)}/aplicar`, undefined, options),
    matchingLista: (options?: RequestOptions) =>
      http.get<MatchingListResponse>('/saldos-favor/matching', {
        ...options,
        params: { scope: 'list' },
      }),
    matchingCliente: (clienteCod: string, options?: RequestOptions) =>
      http.get<MatchingListResponse>('/saldos-favor/matching', {
        ...options,
        params: { cliente_cod: clienteCod },
      }),
    matchingResumen: (options?: RequestOptions) =>
      http.get<MatchingResumenResponse>('/saldos-favor/matching', options),

    /** URL prefirmada PUT para subir el comprobante al bucket privado `comprobantes-pago`. */
    comprobanteUploadUrl: (body: ComprobanteUploadRequest, options?: RequestOptions) =>
      http.post<ComprobanteUpload>('/gestion-cartera/comprobantes/upload-url', body, options),
    /** URL prefirmada GET de un comprobante (key S3 o URL pública legada). */
    comprobanteDownloadUrl: (key: string, options?: RequestOptions) =>
      http.get<{ url: string }>('/gestion-cartera/comprobantes/download-url', {
        ...options,
        params: { key },
      }),
    reportarPago: (body: ReportarPagoBody, options?: RequestOptions) =>
      http.post<ReportarPagoResponse>('/clientes/pagos/reportar', body, options),
  };
}

export const gestionCarteraApi = createGestionCarteraApi(browserHttp);
