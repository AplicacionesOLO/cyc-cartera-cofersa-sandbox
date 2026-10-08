/**
 * Cliente HTTP único hacia API Gateway (estándar: HTTP centralizado, no fetch suelto).
 *
 * - baseURL por ambiente (src/shared/config/env).
 * - Authorization: ID token de Cognito (lo aporta el provider registrado por auth).
 * - 401 → limpia sesión (handler registrado por auth).
 * - Errores normalizados (ApiError: title, message, severity).
 * - Cancelación: pasar { signal } de un AbortController.
 */
import axios, { type AxiosError, type AxiosInstance } from 'axios';
import { env } from '../config/env';
import { normalizeError } from './api-error';

type TokenProvider = () => Promise<string | null | undefined>;

let tokenProvider: TokenProvider | null = null;
let unauthorizedHandler: (() => void | Promise<void>) | null = null;

export function setAccessTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

export function setUnauthorizedHandler(handler: (() => void | Promise<void>) | null): void {
  unauthorizedHandler = handler;
}

export const axiosApiGateway: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

axiosApiGateway.interceptors.request.use(async (config) => {
  const token = tokenProvider ? await tokenProvider() : null;
  if (token) {
    config.headers.set('Authorization', token);
  }
  return config;
});

axiosApiGateway.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401 && unauthorizedHandler) {
      try {
        await unauthorizedHandler();
      } catch {
        // la limpieza de sesión no debe ocultar el error original
      }
    }
    return Promise.reject(normalizeError(error));
  },
);
