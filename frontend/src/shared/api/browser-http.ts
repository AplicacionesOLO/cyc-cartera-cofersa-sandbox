/** Implementación de HttpClient para Client Components (axiosApiGateway con token Cognito). */
import { axiosApiGateway } from './axios-api-gateway';
import { toQueryString, type HttpClient, type RequestOptions } from './http-client';

function config(options?: RequestOptions) {
  return { signal: options?.signal, responseType: options?.responseType ?? 'json' } as const;
}

function withQuery(url: string, options?: RequestOptions): string {
  return `${url}${toQueryString(options?.params)}`;
}

export const browserHttp: HttpClient = {
  async get<T>(url: string, options?: RequestOptions) {
    return (await axiosApiGateway.get<T>(withQuery(url, options), config(options))).data;
  },
  async post<T>(url: string, body?: unknown, options?: RequestOptions) {
    return (await axiosApiGateway.post<T>(withQuery(url, options), body, config(options))).data;
  },
  async put<T>(url: string, body?: unknown, options?: RequestOptions) {
    return (await axiosApiGateway.put<T>(withQuery(url, options), body, config(options))).data;
  },
  async patch<T>(url: string, body?: unknown, options?: RequestOptions) {
    return (await axiosApiGateway.patch<T>(withQuery(url, options), body, config(options))).data;
  },
  async delete<T>(url: string, options?: RequestOptions) {
    return (await axiosApiGateway.delete<T>(withQuery(url, options), config(options))).data;
  },
};
