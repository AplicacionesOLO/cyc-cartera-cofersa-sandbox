/**
 * Notificaciones internas (antes consultas a notificaciones + canal Realtime), chat del equipo
 * (/api/chat), tipo de cambio BCCR (/api/tipo-cambio) y APIs públicas de Hacienda (/api/hacienda*).
 */
import { browserHttp } from '@/shared/api/browser-http';
import { seg, type HttpClient, type RequestOptions } from '@/shared/api/http-client';
import type { MensajeChatConUsuario, Notificacion } from '@/types/database';
import type {
  CabysResponse,
  EnviarMensajeResponse,
  HaciendaResponse,
  TipoCambioData,
} from '../types';

export function createNotificacionesApi(http: HttpClient) {
  return {
    /** Últimas notificaciones del usuario autenticado (el backend usa SU perfil, no un id del front). */
    lista: (limit = 50, options?: RequestOptions) =>
      http.get<Notificacion[]>('/notificaciones', { ...options, params: { limit } }),
    marcarLeida: (id: string, options?: RequestOptions) =>
      http.patch<void>(`/notificaciones/${seg(id)}`, { leida: true }, options),
    marcarTodas: (options?: RequestOptions) =>
      http.post<{ ok: boolean; actualizadas: number }>('/notificaciones/leer-todas', {}, options),
    mensajesChat: (options?: RequestOptions) => http.get<MensajeChatConUsuario[]>('/chat', options),
    enviarMensajeChat: (mensaje: string, options?: RequestOptions) =>
      http.post<EnviarMensajeResponse>('/chat', { mensaje }, options),
    tipoCambio: (options?: RequestOptions) => http.get<TipoCambioData>('/tipo-cambio', options),
    hacienda: (identificacion: string, options?: RequestOptions) =>
      http.get<HaciendaResponse>('/hacienda', { ...options, params: { identificacion } }),
    cabys: (q: string, options?: RequestOptions) =>
      http.get<CabysResponse>('/hacienda/cabys', { ...options, params: { q } }),
  };
}

export const notificacionesApi = createNotificacionesApi(browserHttp);
