/**
 * Error normalizado del estándar: title, message, severity (+ status/code/details).
 * Extiende Error para que el código existente que usaba `error.message` siga funcionando.
 */
export type ApiErrorSeverity = 'error' | 'warning' | 'info';

export interface ApiErrorInit {
  status: number;
  code: string;
  title: string;
  message: string;
  severity: ApiErrorSeverity;
  details?: Record<string, unknown>;
  isCanceled?: boolean;
  isNetworkError?: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly severity: ApiErrorSeverity;
  readonly details: Record<string, unknown>;
  readonly isCanceled: boolean;
  readonly isNetworkError: boolean;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.title = init.title;
    this.severity = init.severity;
    this.details = init.details ?? {};
    this.isCanceled = init.isCanceled ?? false;
    this.isNetworkError = init.isNetworkError ?? false;
  }
}

/** Textos por defecto. Traducirlos al idioma de la UI si no es español. */
export const DEFAULT_ERROR_MESSAGES: Record<string, { title: string; message: string }> = {
  network: {
    title: 'Sin conexión',
    message: 'No fue posible contactar al servidor. Intente nuevamente.',
  },
  canceled: { title: 'Cancelado', message: 'La solicitud fue cancelada.' },
  401: { title: 'Sesión expirada', message: 'Inicie sesión nuevamente.' },
  403: { title: 'Acceso denegado', message: 'No tiene permisos para realizar esta acción.' },
  404: { title: 'No encontrado', message: 'El recurso solicitado no existe.' },
  409: { title: 'Conflicto', message: 'El registro ya existe o fue modificado.' },
  422: {
    title: 'Operación no permitida',
    message: 'La operación no cumple las reglas del negocio.',
  },
  400: { title: 'Datos inválidos', message: 'Revise los datos ingresados.' },
  500: { title: 'Error interno', message: 'Ocurrió un error inesperado.' },
};

interface ErrorBody {
  error?: { code?: string; title?: string; message?: string; details?: Record<string, unknown> };
  message?: string;
}

interface AxiosLikeError {
  isAxiosError?: boolean;
  code?: string;
  message?: string;
  name?: string;
  response?: { status: number; data?: unknown };
}

function severityFor(status: number): ApiErrorSeverity {
  if (status === 0 || status >= 500) return 'error';
  if (status === 401 || status === 403 || status === 409 || status === 422) return 'warning';
  return 'error';
}

export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const e = (error ?? {}) as AxiosLikeError;

  if (e.code === 'ERR_CANCELED' || e.name === 'CanceledError' || e.name === 'AbortError') {
    const d = DEFAULT_ERROR_MESSAGES.canceled;
    return new ApiError({ status: 0, code: 'canceled', ...d, severity: 'info', isCanceled: true });
  }

  if (e.response) {
    const status = e.response.status;
    const body = (e.response.data ?? {}) as ErrorBody;
    const fallback =
      DEFAULT_ERROR_MESSAGES[status] ?? DEFAULT_ERROR_MESSAGES[status >= 500 ? 500 : 400];
    return new ApiError({
      status,
      code: body.error?.code ?? `http_${status}`,
      title: body.error?.title ?? fallback.title,
      message: body.error?.message ?? body.message ?? fallback.message,
      severity: severityFor(status),
      details: body.error?.details,
    });
  }

  if (e.isAxiosError || e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED') {
    const d = DEFAULT_ERROR_MESSAGES.network;
    return new ApiError({
      status: 0,
      code: 'network_error',
      ...d,
      severity: 'error',
      isNetworkError: true,
    });
  }

  const d = DEFAULT_ERROR_MESSAGES[500];
  return new ApiError({
    status: 0,
    code: 'unknown_error',
    title: d.title,
    message: e.message || d.message,
    severity: 'error',
  });
}
