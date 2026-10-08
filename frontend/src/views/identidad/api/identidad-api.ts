/** Usuario actual: perfil, "Ver como", conexión de Gmail y Calendar (GET /me, /me/*). */
import { browserHttp } from '@/shared/api/browser-http';
import type { HttpClient, RequestOptions } from '@/shared/api/http-client';
import type { PerfilUsuarioActual } from '@/lib/utils/usuario-actual-types';

export interface MeResponse {
  user: { email: string };
  perfil: PerfilUsuarioActual;
  rol: string;
  gmail_conectado: boolean;
  total_equipo: number;
  ultima_sync: string;
}

export interface AnalistaConCartera {
  email: string;
  nombre: string;
}

export interface PreviewRolResponse {
  ok: boolean;
  previsualizando: boolean;
  rol?: string;
}

export interface GoogleCalendarItem {
  id: string;
  summary?: string;
  colorId?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  status?: string;
}

export function createIdentidadApi(http: HttpClient) {
  return {
    me: (options?: RequestOptions) => http.get<MeResponse>('/me', options),
    /** Filtro "por analista": elegibles por rol + con cartera real en maestro_clientes, por nombre. */
    analistasConCartera: (options?: RequestOptions) =>
      http.get<AnalistaConCartera[]>('/me/analistas-con-cartera', options),
    previewRol: (rol: string | null, options?: RequestOptions) =>
      http.post<PreviewRolResponse>('/me/preview-rol', { rol }, options),
    googleAuthorizeUrl: (redirectUri: string, state: string, options?: RequestOptions) =>
      http.get<{ url: string }>('/me/google/authorize-url', {
        ...options,
        params: { redirect_uri: redirectUri, state },
      }),
    connectGoogle: (code: string, redirectUri: string, options?: RequestOptions) =>
      http.post<{ ok: boolean; gmail_conectado: boolean }>(
        '/me/google/connect',
        { code, redirect_uri: redirectUri },
        options,
      ),
    calendarEvents: (timeMin: string, timeMax: string, options?: RequestOptions) =>
      http.get<GoogleCalendarItem[]>('/me/calendar/events', {
        ...options,
        params: { timeMin, timeMax },
      }),
  };
}

export const identidadApi = createIdentidadApi(browserHttp);
