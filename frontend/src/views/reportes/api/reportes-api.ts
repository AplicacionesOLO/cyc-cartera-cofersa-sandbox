/**
 * Reportes del Hub (API /reportes/*). Reemplaza las RPC fn_reporte_* y las consultas directas a
 * consultas directas a la base de src/app/(app)/reportes/** y la API Route reportes/enviar.
 */
import { browserHttp } from '@/shared/api/browser-http';
import type { HttpClient, RequestOptions } from '@/shared/api/http-client';
import type {
  AgingResult,
  BloqueadosResult,
  CeiVendedorRow,
  EfectividadResult,
  MigracionMoraResult,
  MoraVendedorResult,
  PlazoEspecialResult,
} from '@/types/reportes';
import type { VendedorResult } from '@/types/analisis-pagos';
import type {
  CarteraVencidaRow,
  CierreMensualRaw,
  ContribEC,
  EnvioReporteBody,
  EnvioReporteResult,
  Gestion,
  MigracionFiltros,
  ResumenEjecutivoRaw,
} from '../types';

export function createReportesApi(http: HttpClient) {
  return {
    aging: (options?: RequestOptions) => http.get<AgingResult>('/reportes/aging', options),
    cei: (anio: number, mes: number, options?: RequestOptions) =>
      http.get<CeiVendedorRow[]>('/reportes/cei', { ...options, params: { anio, mes } }),
    /** Cierre manual del CEI (fn_snapshot_cierre_cartera). */
    tomarCierreCartera: (anio: number, mes: number, options?: RequestOptions) =>
      http.post<{ ok: boolean }>(
        '/reportes/cei/cierre',
        { anio, mes, provisional: false },
        options,
      ),
    efectividad: (ini: string, fin: string, options?: RequestOptions) =>
      http.get<EfectividadResult>('/reportes/efectividad', { ...options, params: { ini, fin } }),
    icpVendedor: (meses: number, options?: RequestOptions) =>
      http.get<VendedorResult>('/reportes/icp-vendedor', { ...options, params: { meses } }),
    migracionMora: (
      p: { anio: number; mes: number; supervisorCod: string | null; vendedorCod: string | null },
      options?: RequestOptions,
    ) =>
      http.get<MigracionMoraResult>('/reportes/migracion-mora', {
        ...options,
        params: {
          anio: p.anio,
          mes: p.mes,
          supervisor_cod: p.supervisorCod,
          vendedor_cod: p.vendedorCod,
        },
      }),
    migracionFiltros: (options?: RequestOptions) =>
      http.get<MigracionFiltros>('/reportes/migracion-mora/filtros', options),
    /** `email` acota a la cartera de un analista (el backend siempre acota al ANALISTA a la suya). */
    moraVendedor: (email: string | null, options?: RequestOptions) =>
      http.get<MoraVendedorResult>('/reportes/mora-vendedor', { ...options, params: { email } }),
    /** `snapshot`: el coordinador dispara el snapshot semanal antes de leer. */
    bloqueados: (email: string | null, snapshot: boolean, options?: RequestOptions) =>
      http.get<BloqueadosResult>('/reportes/bloqueados', {
        ...options,
        params: { email, snapshot },
      }),
    plazoEspecial: (email: string | null, options?: RequestOptions) =>
      http.get<PlazoEspecialResult>('/reportes/plazo-especial', { ...options, params: { email } }),
    portafolioDestinatarios: (options?: RequestOptions) =>
      http.get<Record<string, string[]>>('/reportes/portafolio-destinatarios', options),
    dimensiones: (tipo: 'dimension' | 'agrupacion', options?: RequestOptions) =>
      http.get<string[]>('/reportes/dimensiones', { ...options, params: { tipo } }),
    estadosCuenta: (email: string | null, options?: RequestOptions) =>
      http.get<ContribEC[]>('/reportes/estados-cuenta', { ...options, params: { email } }),
    carteraVencida: (options?: RequestOptions) =>
      http.get<CarteraVencidaRow[]>('/reportes/cartera-vencida', options),
    gestionesPeriodo: (ini: string, fin: string, options?: RequestOptions) =>
      http.get<Gestion[]>('/reportes/gestiones-periodo', { ...options, params: { ini, fin } }),
    resumenEjecutivo: (options?: RequestOptions) =>
      http.get<ResumenEjecutivoRaw>('/reportes/resumen-ejecutivo', options),
    cierreMensual: (anio: number, mes: number, options?: RequestOptions) =>
      http.get<CierreMensualRaw>('/reportes/cierre-mensual', { ...options, params: { anio, mes } }),
    /** Correo HTML desde el Gmail del usuario (antes API Route reportes/enviar). */
    enviar: (body: EnvioReporteBody, options?: RequestOptions) =>
      http.post<EnvioReporteResult>('/reportes/enviar', body, options),
  };
}

export const reportesApi = createReportesApi(browserHttp);
