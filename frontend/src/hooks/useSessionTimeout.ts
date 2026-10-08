/**
 * useSessionTimeout
 *
 * Detecta inactividad del usuario y cierra la sesión automáticamente.
 *
 * Comportamiento:
 *  - Timer de 30 minutos (1800s) que se reinicia en cada evento de actividad.
 *  - A los 28 minutos (quedan 120s) → showWarning = true.
 *  - A los 30 minutos exactos → signOut de Cognito + redirect a /login.
 *
 * Eventos que reinician el timer:
 *   mousemove, mousedown, keydown, scroll, touchstart
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOutUser } from '@/shared/auth/cognito-auth';

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const WARNING_MS = 28 * 60 * 1000; // aviso a los 28 minutos (2 min antes)
const TICK_MS = 1000; // intervalo del contador visible

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
];

export interface SessionTimeoutState {
  showWarning: boolean; // true cuando faltan ≤ 120s
  secondsLeft: number; // segundos restantes (solo relevante cuando showWarning)
  resetTimer: () => void; // reiniciar manualmente el timer
  closeSession: () => void; // cerrar sesión manualmente
}

export function useSessionTimeout(): SessionTimeoutState {
  const router = useRouter();

  // Momento en que expira la sesión (ms desde epoch)
  const expiresAt = useRef<number>(Date.now() + TIMEOUT_MS);
  const tickInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(120);

  // ── signOut centralizado ──────────────────────────────────────
  const closeSession = useCallback(async () => {
    if (tickInterval.current) clearInterval(tickInterval.current);
    await signOutUser().catch(() => undefined);
    router.push('/login');
  }, [router]);

  // ── Reiniciar timer ───────────────────────────────────────────
  const resetTimer = useCallback(() => {
    expiresAt.current = Date.now() + TIMEOUT_MS;
    setShowWarning(false);
    setSecondsLeft(120);
  }, []);

  // ── Ticker principal ──────────────────────────────────────────
  useEffect(() => {
    tickInterval.current = setInterval(() => {
      const remaining = expiresAt.current - Date.now();

      if (remaining <= 0) {
        // Tiempo agotado — cerrar sesión
        closeSession();
        return;
      }

      if (remaining <= TIMEOUT_MS - WARNING_MS) {
        // Quedan ≤ 120 segundos → mostrar aviso
        setShowWarning(true);
        setSecondsLeft(Math.ceil(remaining / 1000));
      } else {
        setShowWarning(false);
      }
    }, TICK_MS);

    return () => {
      if (tickInterval.current) clearInterval(tickInterval.current);
    };
  }, [closeSession]);

  // ── Escuchar eventos de actividad ─────────────────────────────
  useEffect(() => {
    const handler = () => resetTimer();

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, handler, { passive: true });
    }
    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, handler);
      }
    };
  }, [resetTimer]);

  return { showWarning, secondsLeft, resetTimer, closeSession };
}
