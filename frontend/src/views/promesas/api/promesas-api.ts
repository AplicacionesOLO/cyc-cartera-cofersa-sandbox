/** Centro de seguimiento de promesas: bandeja, validación, reprogramación y soft-delete (PromesasApi). */
import { browserHttp } from '@/shared/api/browser-http';
import type { HttpClient, RequestOptions } from '@/shared/api/http-client';
import type {
  PromesasPagina,
  ReprogramarPromesaBody,
  ReprogramarPromesaResponse,
  ValidarPromesaBody,
  ValidarPromesaResponse,
} from '../types';

export function createPromesasApi(http: HttpClient) {
  return {
    /** Promesas activas (las más próximas primero) + gestión origen. `analista` solo aplica a Coordinador. */
    pagina: (analista?: string | null, options?: RequestOptions) =>
      http.get<PromesasPagina>('/promesas', { ...options, params: { analista } }),
    validar: (body: ValidarPromesaBody, options?: RequestOptions) =>
      http.patch<ValidarPromesaResponse>('/clientes/promesas', body, options),
    reprogramar: (body: ReprogramarPromesaBody, options?: RequestOptions) =>
      http.post<ReprogramarPromesaResponse>('/clientes/promesas/reprogramar', body, options),
    /** Soft-delete (solo Coordinador). */
    eliminar: (id: string, options?: RequestOptions) =>
      http.delete<{ ok: boolean }>('/clientes/promesas', { ...options, params: { id } }),
  };
}

export const promesasApi = createPromesasApi(browserHttp);
