/**
 * Análisis de Pagos (ICP) y Pagos Aplicados del Mes (Lambda AnalisisPagosApi).
 * Reemplaza las llamadas directas de la UI a fn_analisis_* y fn_pagos_mes_resumen, y las API Routes
 * pagos-anulados[/no_recibo] y pagos-duplicado-descartado[/no_recibo] de Next.
 */
import { browserHttp } from '@/shared/api/browser-http';
import { seg, type HttpClient, type RequestOptions } from '@/shared/api/http-client';
import type {
  AlertasResult,
  ConcentracionResult,
  RankingResult,
  VendedorResult,
} from '@/types/analisis-pagos';
import type {
  DescartarDuplicadoBody,
  MarcarAnuladosBody,
  RankingParams,
  ResumenPagosMes,
} from '../types';

export function createAnalisisPagosApi(http: HttpClient) {
  return {
    rankingClientes: (p: RankingParams, options?: RequestOptions) =>
      http.get<RankingResult>('/analisis-pagos/ranking-clientes', { ...options, params: { ...p } }),
    perfilVendedor: (
      email: string | null,
      meses: number,
      orden: string,
      options?: RequestOptions,
    ) =>
      http.get<VendedorResult>('/analisis-pagos/perfil-vendedor', {
        ...options,
        params: { email, meses, orden },
      }),
    alertasDeterioro: (email: string | null, options?: RequestOptions) =>
      http.get<AlertasResult>('/analisis-pagos/alertas-deterioro', {
        ...options,
        params: { email },
      }),
    concentracion: (options?: RequestOptions) =>
      http.get<ConcentracionResult>('/analisis-pagos/concentracion', options),
    pagosMes: (anio: number, mes: number, options?: RequestOptions) =>
      http.get<ResumenPagosMes>('/analisis-pagos/pagos-mes', { ...options, params: { anio, mes } }),
    marcarAnulados: (body: MarcarAnuladosBody, options?: RequestOptions) =>
      http.post<{ ok: boolean; marcados: number }>('/pagos-anulados', body, options),
    desmarcarAnulado: (noRecibo: string, options?: RequestOptions) =>
      http.delete<{ ok: boolean }>(`/pagos-anulados/${seg(noRecibo)}`, options),
    descartarDuplicado: (body: DescartarDuplicadoBody, options?: RequestOptions) =>
      http.post<{ ok: boolean }>('/pagos-duplicado-descartado', body, options),
    revertirDescarteDuplicado: (noRecibo: string, options?: RequestOptions) =>
      http.delete<{ ok: boolean }>(`/pagos-duplicado-descartado/${seg(noRecibo)}`, options),
  };
}

export const analisisPagosApi = createAnalisisPagosApi(browserHttp);
