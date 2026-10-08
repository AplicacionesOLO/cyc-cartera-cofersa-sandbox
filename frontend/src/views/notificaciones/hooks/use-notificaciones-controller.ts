'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError } from '@/shared/api/api-error';
import type { Notificacion } from '@/types/database';
import { notificacionesApi } from '../api/notificaciones-api';

/** Intervalo de refresco: reemplaza el canal Realtime postgres_changes (INSERT) del origen. */
export const POLL_NOTIFICACIONES_MS = 60_000;
const LIMITE = 50;

interface Options {
  /** Lista inicial (p. ej. la que recibe PanelNotificaciones por props). */
  initial?: Notificacion[];
  /** false = no carga ni refresca (solo acciones de marcar como leída). */
  poll?: boolean;
}

/**
 * Notificaciones del usuario: carga al montar, refresca cada 60 s y al volver a enfocar la ventana.
 * Las notificaciones las insertan funciones SQL / cron (no la API), por eso se usa polling y no
 * WebSocket. Marcar como leída es optimista (igual que el original) y un fallo no rompe la UI.
 */
export function useNotificacionesController(usuarioId: string, options: Options = {}) {
  const { initial, poll = true } = options;
  const [notis, setNotis] = useState<Notificacion[]>(initial ?? []);
  const [error, setError] = useState<string | null>(null);
  const leidasLocales = useRef<Set<string>>(new Set());

  const cargar = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await notificacionesApi.lista(LIMITE, { signal });
      // conserva las marcadas como leídas localmente mientras su PATCH está en vuelo
      setNotis(data.map((n) => (leidasLocales.current.has(n.id) ? { ...n, leida: true } : n)));
      setError(null);
    } catch (e) {
      const err = e as ApiError;
      if (!err.isCanceled) setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (!usuarioId || !poll) return;
    const controller = new AbortController();
    void cargar(controller.signal);
    const timer = window.setInterval(() => void cargar(controller.signal), POLL_NOTIFICACIONES_MS);
    const onFocus = () => void cargar(controller.signal);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void cargar(controller.signal);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [usuarioId, poll, cargar]);

  const marcarLeida = useCallback(async (id: string) => {
    setNotis((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)));
    leidasLocales.current.add(id);
    try {
      await notificacionesApi.marcarLeida(id);
    } catch {
      // igual que el original: la UI ya la muestra leída y no se interrumpe la navegación
    } finally {
      leidasLocales.current.delete(id);
    }
  }, []);

  const marcarTodas = useCallback(async () => {
    setNotis((prev) => prev.map((n) => ({ ...n, leida: true })));
    try {
      await notificacionesApi.marcarTodas();
    } catch {
      // optimista, como el original (el siguiente refresco refleja el estado real)
    }
  }, []);

  return { notis, error, recargar: cargar, marcarLeida, marcarTodas };
}
