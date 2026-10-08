/** Dashboard (coordinador/gerencia y analista) y Mi Cartera — GET /dashboard/*. */
import { browserHttp } from '@/shared/api/browser-http';
import type { HttpClient, RequestOptions } from '@/shared/api/http-client';
import type {
  DashboardAnalistaResponse,
  DashboardCoordinadorResponse,
  MiCarteraResponse,
} from '../types';

export function createDashboardApi(http: HttpClient) {
  return {
    /** KPIs globales, DSO, pedidos retenidos, Mi Equipo, meta mensual e histórico (COORDINADOR/GERENCIA). */
    coordinador: (options?: RequestOptions) =>
      http.get<DashboardCoordinadorResponse>('/dashboard/coordinador', options),
    /** KPIs, vendedores, cola del día, agenda, promesas y tareas del analista (el backend limita el email). */
    analista: (email?: string, options?: RequestOptions) =>
      http.get<DashboardAnalistaResponse>('/dashboard/analista', {
        ...options,
        params: { ...options?.params, email },
      }),
    /** Cola del día completa (Algoritmo V4) + KPIs de Mi Cartera. */
    miCartera: (email?: string, options?: RequestOptions) =>
      http.get<MiCarteraResponse>('/dashboard/mi-cartera', {
        ...options,
        params: { ...options?.params, email },
      }),
  };
}

export const dashboardApi = createDashboardApi(browserHttp);
