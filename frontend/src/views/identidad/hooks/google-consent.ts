'use client';

import { identidadApi } from '../api/identidad-api';

export const GOOGLE_STATE_KEY = 'sic_google_state';

export function googleRedirectUri(): string {
  return `${window.location.origin}/auth/google`;
}

/** Redirige al consentimiento de Google (Gmail send + Calendar) para guardar el refresh token. */
export async function startGoogleConsent(options?: { signal?: AbortSignal }): Promise<void> {
  const state = crypto.randomUUID();
  sessionStorage.setItem(GOOGLE_STATE_KEY, state);
  const { url } = await identidadApi.googleAuthorizeUrl(googleRedirectUri(), state, options);
  window.location.assign(url);
}
