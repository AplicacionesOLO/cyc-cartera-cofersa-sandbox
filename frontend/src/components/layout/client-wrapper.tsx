'use client';

/**
 * ClientWrapper
 *
 * Componente cliente que envuelve el contenido de la app autenticada.
 * Se encarga de:
 *   1. Montar el hook useSessionTimeout (inactividad 30 min)
 *   2. Mostrar el SessionTimeoutModal cuando corresponde
 *   3. Escuchar eventos de auth (Cognito/Amplify Hub) y redirigir al login si la sesión
 *      expira por razones externas (token revocado, otro dispositivo, etc.)
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChange } from '@/shared/auth/cognito-auth';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import SessionTimeoutModal from '@/components/session-timeout-modal';

interface Props {
  children: React.ReactNode;
  usuarioId: string;
  nombre: string;
  iniciales: string;
  color: string;
  totalEquipo: number;
}

export default function ClientWrapper({
  children,
  usuarioId,
  nombre,
  iniciales,
  color,
  totalEquipo,
}: Props) {
  const router = useRouter();
  const { showWarning, secondsLeft, resetTimer, closeSession } = useSessionTimeout();

  // ── Listener de eventos de autenticación (Cognito) ────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChange((event) => {
      // el origen emitía SIGNED_OUT también cuando fallaba el refresh; en Cognito eso es SESSION_EXPIRED
      if (event === 'SIGNED_OUT' || event === 'SESSION_EXPIRED') {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  return (
    <>
      {children}
      {showWarning && (
        <SessionTimeoutModal
          secondsLeft={secondsLeft}
          onContinue={resetTimer}
          onClose={closeSession}
        />
      )}
      {/* ChatPanel desactivado — espacio reservado para futura implementación */}
    </>
  );
}
