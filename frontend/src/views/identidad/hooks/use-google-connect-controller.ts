'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApiError } from '@/shared/api/api-error';
import { identidadApi } from '../api/identidad-api';
import { GOOGLE_STATE_KEY, googleRedirectUri, startGoogleConsent } from './google-consent';

/** Vuelta del consentimiento de Google: canjea el `code` en el backend y guarda el refresh token. */
export function useGoogleConnectController() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const expected = sessionStorage.getItem(GOOGLE_STATE_KEY);
    sessionStorage.removeItem(GOOGLE_STATE_KEY);

    if (params.get('error') || !code || !state || state !== expected) {
      setError(
        'No se completó la autorización de Gmail. Puede reintentar o continuar sin envío de correos.',
      );
      setLoading(false);
      return;
    }
    identidadApi
      .connectGoogle(code, googleRedirectUri(), { signal: controller.signal })
      .then(() => router.replace('/dashboard'))
      .catch((e: ApiError) => {
        if (e.isCanceled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => controller.abort();
  }, [router]);

  return {
    error,
    loading,
    reintentar: () => startGoogleConsent().catch((e: ApiError) => setError(e.message)),
    continuar: () => router.replace('/dashboard'),
  };
}
