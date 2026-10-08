'use client';

// Procesa el `code` del Hosted UI de Cognito al volver a /auth/callback (apps multipágina).
import 'aws-amplify/auth/enable-oauth-listener';
import { setupAuth } from './setup-auth';

// Se ejecuta al cargar el bundle del cliente (antes de cualquier llamada al API).
setupAuth();

/** Montado en el layout raíz: asegura que Amplify esté configurado en el navegador. */
export function AuthBootstrap(): null {
  return null;
}
