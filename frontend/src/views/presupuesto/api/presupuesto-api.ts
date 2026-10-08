/**
 * Presupuesto de Cobro, Recuperación, Proyección y Sin pago (Lambda PresupuestoApi).
 * Reemplaza las llamadas directas de la UI a fn_presupuesto_*, fn_recuperacion*, fn_proyeccion_cobro,
 * fn_sin_pago_cliente y fn_meta_analista_mes, y las lecturas directas de tablas.
 */
import { browserHttp } from '@/shared/api/browser-http';
import type { HttpClient, RequestOptions } from '@/shared/api/http-client';
import type { ProyeccionResult, RecuperacionResult } from '@/types/presupuesto';
import type { RecupMomResult, RecupPeriodoResult, RecupTramosResult } from '@/types/reportes';
import type {
  DestinatariosPresupuesto,
  EnvioCorreoBody,
  EnvioCorreoResult,
  PresupuestoAccionResult,
  PresupuestoMes,
  RecuperacionPeriodoParams,
  SinPagoResponse,
  VendedorOpcion,
} from '../types';

export function createPresupuestoApi(http: HttpClient) {
  return {
    mes: (anio: number, mes: number, options?: RequestOptions) =>
      http.get<PresupuestoMes>('/presupuesto/mes', { ...options, params: { anio, mes } }),
    /** Congelar o regenerar (descarta ajustes manuales). */
    congelar: (anio: number, mes: number, options?: RequestOptions) =>
      http.post<PresupuestoAccionResult>('/presupuesto/mes/congelar', { anio, mes }, options),
    ajustarMeta: (
      anio: number,
      mes: number,
      vendedorCod: string,
      meta: number,
      options?: RequestOptions,
    ) =>
      http.post<PresupuestoAccionResult>(
        '/presupuesto/mes/meta',
        { anio, mes, vendedor_cod: vendedorCod, meta },
        options,
      ),
    reasignar: (
      anio: number,
      mes: number,
      clienteCod: string,
      vendedorCod: string,
      options?: RequestOptions,
    ) =>
      http.post<PresupuestoAccionResult>(
        '/presupuesto/mes/reasignar',
        { anio, mes, cliente_cod: clienteCod, vendedor_cod: vendedorCod },
        options,
      ),
    vendedores: (options?: RequestOptions) =>
      http.get<VendedorOpcion[]>('/presupuesto/vendedores', options),
    destinatarios: (options?: RequestOptions) =>
      http.get<DestinatariosPresupuesto>('/presupuesto/destinatarios', options),
    /** Correo HTML desde el Gmail del usuario (antes la API Route reportes/enviar). */
    enviar: (body: EnvioCorreoBody, options?: RequestOptions) =>
      http.post<EnvioCorreoResult>('/presupuesto/enviar', body, options),
    recuperacion: (anio: number, mes: number, options?: RequestOptions) =>
      http.get<RecuperacionResult>('/presupuesto/recuperacion', {
        ...options,
        params: { anio, mes },
      }),
    proyeccion: (semanasPasadas: number, options?: RequestOptions) =>
      http.get<ProyeccionResult>('/presupuesto/proyeccion', {
        ...options,
        params: { semanas: 8, semanas_pasadas: semanasPasadas },
      }),
    sinPago: (anio: number, mes: number, options?: RequestOptions) =>
      http.get<SinPagoResponse>('/presupuesto/sin-pago', { ...options, params: { anio, mes } }),
    recuperacionMom: (meses: number, email: string | null, options?: RequestOptions) =>
      http.get<RecupMomResult | null>('/presupuesto/recuperacion-mom', {
        ...options,
        params: { meses, email },
      }),
    recuperacionPeriodo: (p: RecuperacionPeriodoParams, options?: RequestOptions) =>
      http.get<RecupPeriodoResult>('/presupuesto/recuperacion-periodo', {
        ...options,
        params: { ...p },
      }),
    recuperacionTramos: (p: RecuperacionPeriodoParams, options?: RequestOptions) =>
      http.get<RecupTramosResult>('/presupuesto/recuperacion-tramos', {
        ...options,
        params: { ...p },
      }),
    metaAnalista: (email: string, anio: number, mes: number, options?: RequestOptions) =>
      http.get<{ meta: number }>('/presupuesto/meta-analista', {
        ...options,
        params: { email, anio, mes },
      }),
  };
}

export const presupuestoApi = createPresupuestoApi(browserHttp);
