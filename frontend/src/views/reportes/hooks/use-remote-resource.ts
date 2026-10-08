'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError } from '@/shared/api/api-error';

export interface RemoteResource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Carga con loading/error y AbortController (cancela la carga anterior y al desmontar).
 * `load` debe estar memoizado (useCallback) con sus dependencias: cada cambio recarga.
 * `mensajeError` es el texto que la pantalla mostraba ante cualquier fallo.
 */
export function useRemoteResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  mensajeError: string,
  options: { enabled?: boolean; onLoaded?: (data: T) => void } = {},
): RemoteResource<T> {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const onLoadedRef = useRef(options.onLoaded);
  useEffect(() => {
    onLoadedRef.current = options.onLoaded;
  }, [options.onLoaded]);

  const reload = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await load(controller.signal);
      if (controller.signal.aborted) return;
      setData(result);
      onLoadedRef.current?.(result);
    } catch (e) {
      if (controller.signal.aborted || (e as ApiError).isCanceled) return;
      setError(mensajeError);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [load, mensajeError]);

  useEffect(() => {
    // carga remota al montar / cambiar dependencias (sincroniza con el API)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (enabled) void reload();
    else setLoading(false);
    return () => controllerRef.current?.abort();
  }, [reload, enabled]);

  return { data, loading, error, reload };
}
