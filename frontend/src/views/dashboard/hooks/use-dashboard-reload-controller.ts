'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * El dashboard se arma en el servidor (GET /dashboard/*); si el API falla, este controller vuelve a
 * pedir los datos sin recargar la página completa (router.refresh re-ejecuta el Server Component).
 */
export function useDashboardReloadController() {
  const router = useRouter();
  const [reloading, startTransition] = useTransition();
  return {
    reloading,
    reload: () => startTransition(() => router.refresh()),
  };
}
