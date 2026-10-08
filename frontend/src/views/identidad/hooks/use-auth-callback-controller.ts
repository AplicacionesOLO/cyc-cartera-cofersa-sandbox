'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hub } from 'aws-amplify/utils';
import { getIdToken } from '@/shared/auth/cognito-auth';
import type { ApiError } from '@/shared/api/api-error';
import { identidadApi } from '../api/identidad-api';
import { startGoogleConsent } from './google-consent';

const RECONSENT_KEY = 'sic_reconsent';

/**
 * Destino del Hosted UI de Cognito (antes /auth/callback del origen).
 * 1. Espera la sesión de Cognito (Amplify procesa el `code` de la URL).
 * 2. GET /me: sin fila activa en `usuarios` → /auth/denegado.
 * 3. Sin refresh token de Gmail → consentimiento de Google una sola vez (antes: reconsent=1).
 */
export function useAuthCallbackController() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let done = false;

    async function continuar() {
      if (done || !(await getIdToken())) return;
      done = true;
      try {
        const me = await identidadApi.me({ signal: controller.signal });
        const yaIntento = sessionStorage.getItem(RECONSENT_KEY) === '1';
        if (!me.gmail_conectado && !yaIntento) {
          sessionStorage.setItem(RECONSENT_KEY, '1');
          await startGoogleConsent({ signal: controller.signal });
          return;
        }
        sessionStorage.removeItem(RECONSENT_KEY);
        router.replace('/dashboard');
      } catch (e) {
        const err = e as ApiError;
        if (err.isCanceled) return;
        if (err.status === 403) router.replace('/auth/denegado');
        else setError(err.message);
      }
    }

    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn' || payload.event === 'signInWithRedirect') void continuar();
      if (payload.event === 'signInWithRedirect_failure') router.replace('/login?error=auth_error');
    });
    void continuar();
    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [router]);

  return { error };
}
