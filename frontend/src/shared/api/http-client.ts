/**
 * Contrato HTTP común a navegador (axiosApiGateway) y servidor (server-http, Server Components).
 * Los `xApi` de cada módulo se escriben una vez contra esta interfaz:
 *
 *   export function createClientesApi(http: HttpClient) { return { lista: (p, o) => http.get(...) } }
 *   export const clientesApi = createClientesApi(browserHttp);           // Client Components
 *   const api = createClientesApi(await getServerHttp());                // Server Components
 */
export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  params?: Record<string, QueryValue | QueryValue[]>;
  signal?: AbortSignal;
  /** 'blob' para descargas (PDF/Excel generados por el backend). */
  responseType?: 'json' | 'blob';
}

export interface HttpClient {
  get<T>(url: string, options?: RequestOptions): Promise<T>;
  post<T>(url: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(url: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(url: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T>(url: string, options?: RequestOptions): Promise<T>;
}

/** Codifica un segmento de ruta (`/clientes/${seg(cod)}`). */
export function seg(value: string | number): string {
  return encodeURIComponent(String(value));
}

export function toQueryString(params?: RequestOptions['params']): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (value !== undefined && value !== null && value !== '') search.append(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
