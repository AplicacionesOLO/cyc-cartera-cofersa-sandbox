/** Solicitudes internas (Lambda SolicitudesApi: /solicitudes/*). */
import { browserHttp } from '@/shared/api/browser-http';
import { seg, type HttpClient, type RequestOptions } from '@/shared/api/http-client';
import type { Factura } from '@/types/database';
import type {
  AdjuntoUploadUrl,
  CambiarEstadoResponse,
  ComentarioCreado,
  CrearSolicitudResponse,
  DetalleSolicitudResponse,
  ListaSolicitudesResponse,
  NuevaSolicitudClientesResponse,
  NuevaSolicitudContextoResponse,
} from '../types';

export function createSolicitudesApi(http: HttpClient) {
  return {
    /** Listado (COORDINADOR/GERENCIA todas; el resto solo las propias) + mapa id → nombre. */
    lista: (soloPropias: boolean, options?: RequestOptions) =>
      http.get<ListaSolicitudesResponse>('/solicitudes', {
        ...options,
        params: { solo_propias: soloPropias || undefined },
      }),
    detalle: (id: string, options?: RequestOptions) =>
      http.get<DetalleSolicitudResponse>(`/solicitudes/${seg(id)}`, options),
    /** Cartera + maestro + nombres de analistas + gestión origen para /solicitudes/nueva. */
    nuevaClientes: (soloMiCartera: boolean, gestionId: string | null, options?: RequestOptions) =>
      http.get<NuevaSolicitudClientesResponse>('/solicitudes/nueva-clientes', {
        ...options,
        params: { solo_mi_cartera: soloMiCartera || undefined, gestion_id: gestionId },
      }),
    /** Cartera + maestro + facturas pendientes de un cliente. */
    nuevaContexto: (cod: string, options?: RequestOptions) =>
      http.get<NuevaSolicitudContextoResponse>('/solicitudes/nueva-contexto', {
        ...options,
        params: { cod },
      }),
    facturasPendientes: (contribuyente: string, options?: RequestOptions) =>
      http.get<Factura[]>('/solicitudes/facturas', { ...options, params: { contribuyente } }),
    adjuntoUploadUrl: (
      body: { cliente_cod: string; filename: string; content_type: string },
      options?: RequestOptions,
    ) => http.post<AdjuntoUploadUrl>('/solicitudes/adjuntos/upload-url', body, options),
    crear: (body: Record<string, unknown>, options?: RequestOptions) =>
      http.post<CrearSolicitudResponse>('/solicitudes', body, options),
    resolver: (
      id: string,
      accion: 'APROBAR' | 'RECHAZAR' | 'CANCELAR',
      comentario?: string,
      options?: RequestOptions,
    ) => http.patch<{ ok: boolean }>(`/solicitudes/${seg(id)}`, { accion, comentario }, options),
    cambiarEstado: (id: string, estadoNuevo: string, nota?: string, options?: RequestOptions) =>
      http.patch<CambiarEstadoResponse>(
        `/solicitudes/${seg(id)}/estado`,
        { estado_nuevo: estadoNuevo, nota },
        options,
      ),
    comentar: (id: string, contenido: string, options?: RequestOptions) =>
      http.post<{ ok: boolean; comentario: ComentarioCreado }>(
        `/solicitudes/${seg(id)}/comentarios`,
        { contenido },
        options,
      ),
  };
}

export const solicitudesApi = createSolicitudesApi(browserHttp);
