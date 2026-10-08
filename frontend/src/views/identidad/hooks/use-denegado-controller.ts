'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOutUser } from '@/shared/auth/cognito-auth';

/**
 * Sesión autenticada cuyo email NO está activo en `usuarios`: cierra la sesión de Cognito y vuelve
 * al login con el mensaje de acceso denegado (antes GET /auth/denegado con signOut del proveedor anterior).
 */
export function useDenegadoController() {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    signOutUser()
      .catch(() => undefined)
      .finally(() => {
        if (active) router.replace('/login?error=acceso_denegado');
      });
    return () => {
      active = false;
    };
  }, [router]);
}
