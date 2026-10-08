/**
 * HttpClient para Server Components: llama al API Gateway reenviando el ID token del usuario
 * (cookies de Amplify). Nunca accede a la base de datos.
 */
import 'server-only';
import { env } from '../config/env';
import { getServerIdentity } from '../auth/amplify-server';
import { ApiError, normalizeError } from './api-error';
import { toQueryString, type HttpClient, type RequestOptions } from './http-client';

async function call<T>(
  token: string | null,
  method: string,
  url: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}${url}${toQueryString(options?.params)}`, {
      method,
      cache: 'no-store',
      signal: options?.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: token } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw normalizeError(error);
  }
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    throw normalizeError({ isAxiosError: true, response: { status: response.status, data } });
  }
  return data as T;
}

/** Cliente HTTP del servidor ligado a la sesión de la request actual. */
export async function getServerHttp(): Promise<HttpClient> {
  const identity = await getServerIdentity();
  const token = identity?.idToken ?? null;
  return {
    get: <T>(url: string, options?: RequestOptions) =>
      call<T>(token, 'GET', url, undefined, options),
    post: <T>(url: string, body?: unknown, options?: RequestOptions) =>
      call<T>(token, 'POST', url, body ?? {}, options),
    put: <T>(url: string, body?: unknown, options?: RequestOptions) =>
      call<T>(token, 'PUT', url, body ?? {}, options),
    patch: <T>(url: string, body?: unknown, options?: RequestOptions) =>
      call<T>(token, 'PATCH', url, body ?? {}, options),
    delete: <T>(url: string, options?: RequestOptions) =>
      call<T>(token, 'DELETE', url, undefined, options),
  };
}

export { ApiError };
