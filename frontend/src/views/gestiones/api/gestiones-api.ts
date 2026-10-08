/** Gestiones de cobro: bandeja, registro/edición, notas rápidas y bitácora con IA (GestionesApi). */
import { browserHttp } from '@/shared/api/browser-http';
import type { HttpClient, RequestOptions } from '@/shared/api/http-client';
import type { Gestion } from '@/types/database';
import type {
  ActualizarGestionBody,
  CodigoContribuyente,
  FormalizarBitacoraBody,
  GestionRapidaBody,
  NotaRapidaResponse,
  NuevaGestionBody,
  NuevaGestionResponse,
  OkResponse,
  ReferenciasGestiones,
} from '../types';

/** Tamaño de lote de la bandeja (igual que el `.range()` de 1000 del origen). */
export const GESTIONES_PAGE = 1000;

export function createGestionesApi(http: HttpClient) {
  return {
    /** Un lote de la bandeja (fecha/hora desc). `analista` solo aplica a Coordinador. */
    lista: (
      params: { offset: number; limit?: number; analista?: string | null },
      options?: RequestOptions,
    ) =>
      http.get<Gestion[]>('/gestiones', {
        ...options,
        params: {
          offset: params.offset,
          limit: params.limit ?? GESTIONES_PAGE,
          analista: params.analista,
        },
      }),
    /** Todas las gestiones del alcance, en lotes. */
    async listaCompleta(analista?: string | null, options?: RequestOptions): Promise<Gestion[]> {
      const out: Gestion[] = [];
      for (let offset = 0; ; offset += GESTIONES_PAGE) {
        const lote = await http.get<Gestion[]>('/gestiones', {
          ...options,
          params: { offset, limit: GESTIONES_PAGE, analista },
        });
        out.push(...lote);
        if (lote.length < GESTIONES_PAGE) break;
      }
      return out;
    },
    referencias: (analista?: string | null, options?: RequestOptions) =>
      http.get<ReferenciasGestiones>('/gestiones/referencias', {
        ...options,
        params: { analista },
      }),
    /** Otros códigos del mismo contribuyente (excluye `excluir`). */
    codigosContribuyente: (contribuyente: string, excluir: string, options?: RequestOptions) =>
      http.get<CodigoContribuyente[]>('/gestiones/codigos-contribuyente', {
        ...options,
        params: { contribuyente, excluir },
      }),
    registrar: (body: NuevaGestionBody, options?: RequestOptions) =>
      http.post<NuevaGestionResponse>('/clientes/gestiones/nueva', body, options),
    registrarRapida: (body: GestionRapidaBody, options?: RequestOptions) =>
      http.post<OkResponse>('/gestiones/rapida', body, options),
    actualizar: (body: ActualizarGestionBody, options?: RequestOptions) =>
      http.patch<OkResponse>('/clientes/gestiones', body, options),
    /** Soft-delete (solo Coordinador). */
    eliminar: (id: string, options?: RequestOptions) =>
      http.delete<OkResponse>('/clientes/gestiones', { ...options, params: { id } }),
    notaRapida: (fecha: string, options?: RequestOptions) =>
      http.get<NotaRapidaResponse>('/notas-rapidas', { ...options, params: { fecha } }),
    guardarNotaRapida: (fecha: string, contenido: string, options?: RequestOptions) =>
      http.post<OkResponse>('/notas-rapidas', { fecha, contenido }, options),
    formalizarBitacora: (body: FormalizarBitacoraBody, options?: RequestOptions) =>
      http.post<{ ok: boolean; texto: string }>('/ai/formalizar-bitacora', body, options),
  };
}

export const gestionesApi = createGestionesApi(browserHttp);
