'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { gestionesApi } from '../api/gestiones-api';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Notas del día (GET/POST /notas-rapidas). Carga el contenido de `hoyStr` y lo entrega ya
 * parseado con `parse` (función estable, de módulo); `saveItems` guarda el contenido serializado
 * y expone el estado del guardado.
 */
export function useNotasRapidasController<T>(hoyStr: string, parse: (raw: string) => T[]) {
  const [items, setItems] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Carga inicial ────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    gestionesApi
      .notaRapida(hoyStr, { signal: controller.signal })
      .then((data) => setItems(parse(data.contenido ?? '')))
      .catch(() => {
        /* sin conexión (o cancelada) — lista vacía */
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, [hoyStr, parse]);

  // ── Limpieza al desmontar ───────────────────────────────────────
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // ── Guardar en BD ───────────────────────────────────────────────
  const saveItems = useCallback(
    async (newItems: T[]) => {
      setSaveState('saving');
      try {
        await gestionesApi.guardarNotaRapida(hoyStr, JSON.stringify(newItems));
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveState('idle'), 1500);
    },
    [hoyStr],
  );

  return { items, setItems, loaded, saveState, saveItems };
}
