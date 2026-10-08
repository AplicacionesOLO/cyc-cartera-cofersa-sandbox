'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApiError } from '@/shared/api/api-error';
import { COOKIE_VER_COMO } from '@/lib/utils/ver-como-constants';
import { identidadApi } from '../api/identidad-api';

/**
 * "Ver como" (antes POST /api/preview-rol, que fijaba la cookie desde el servidor).
 * El backend valida que el rol REAL sea COORDINADOR; la cookie solo cambia qué se renderiza
 * (las escrituras siguen autorizándose con el rol real en el API).
 */
export function useVerComoController() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cambiar(rol: string | null) {
    setLoading(true);
    setError(null);
    try {
      const res = await identidadApi.previewRol(rol);
      const secure = window.location.protocol === 'https:' ? '; secure' : '';
      document.cookie = res.previsualizando
        ? `${COOKIE_VER_COMO}=${res.rol}; path=/; max-age=${60 * 60 * 8}; samesite=lax${secure}`
        : `${COOKIE_VER_COMO}=; path=/; max-age=0; samesite=lax${secure}`;
      router.refresh();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setLoading(false);
    }
  }

  return { loading, error, cambiar };
}
