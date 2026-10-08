import { setAccessTokenProvider, setUnauthorizedHandler } from '../api/axios-api-gateway';
import { configureAuth, getIdToken } from './cognito-auth';

let ready = false;

/** Configura Cognito y conecta el token al cliente HTTP. Idempotente (se llama en el bootstrap del cliente). */
export function setupAuth(): void {
  if (ready) return;
  configureAuth();
  setAccessTokenProvider(getIdToken);
  // 401 del API: la sesión de Cognito expiró → volver al login
  setUnauthorizedHandler(() => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.assign('/login?error=sesion_expirada');
    }
  });
  ready = true;
}
