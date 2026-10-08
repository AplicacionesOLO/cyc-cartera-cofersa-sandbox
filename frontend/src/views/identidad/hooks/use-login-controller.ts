'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  completeNewPassword,
  signInWithEmail,
  signInWithProvider,
} from '@/shared/auth/cognito-auth';

const MENSAJES_ERROR: Record<string, string> = {
  acceso_denegado:
    'Su cuenta no tiene acceso al SIC. Si considera que es un error, contacte al Coordinador de Crédito y Cobro.',
  auth_error: 'Error al iniciar sesión con Google. Intente de nuevo.',
  sesion_expirada: 'Su sesión expiró. Ingrese nuevamente.',
};

/** Login: Google vía Cognito Hosted UI (IdP federado) o correo/contraseña (Cognito). */
export function useLoginController() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconsent, setReconsent] = useState(false);
  const [needsNewPassword, setNeedsNewPassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('error');
    if (code && MENSAJES_ERROR[code]) setError(MENSAJES_ERROR[code]);
    // reconsent=1 → falta autorizar el envío de correos (Gmail) para esta cuenta
    if (params.get('reconsent')) setReconsent(true);
  }, []);

  async function loginWithGoogle() {
    setLoading(true);
    setError(null);
    try {
      await signInWithProvider('Google');
    } catch {
      setError(MENSAJES_ERROR.auth_error);
      setLoading(false);
    }
  }

  async function loginWithEmail(email: string, password: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithEmail(email, password);
      if (!result.isSignedIn) {
        // Usuario creado por el administrador: Cognito exige cambiar la contraseña temporal.
        if (result.nextStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
          setNeedsNewPassword(true);
        } else {
          setError('Correo o contraseña incorrectos.');
        }
        setLoading(false);
        return;
      }
      router.push('/auth/callback');
    } catch {
      setError('Correo o contraseña incorrectos.');
      setLoading(false);
    }
  }

  async function setNewPassword(newPassword: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await completeNewPassword(newPassword);
      if (!result.isSignedIn) {
        setError('No se pudo completar el ingreso. Intente de nuevo.');
        setLoading(false);
        return;
      }
      router.push('/auth/callback');
    } catch {
      setError(
        'La contraseña no cumple la política: mínimo 12 caracteres con mayúscula, minúscula, número y símbolo.',
      );
      setLoading(false);
    }
  }

  return {
    loading,
    error,
    setError,
    reconsent,
    needsNewPassword,
    loginWithGoogle,
    loginWithEmail,
    setNewPassword,
  };
}
