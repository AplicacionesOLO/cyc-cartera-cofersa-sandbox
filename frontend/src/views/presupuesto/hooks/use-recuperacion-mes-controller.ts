'use client';

import { useCallback, useState } from 'react';
import type { ApiError } from '@/shared/api/api-error';
import { presupuestoApi } from '../api/presupuesto-api';
import { useRemoteResource } from './use-remote-resource';

/** Tab "Recuperación": fn_recuperacion del mes + envío del consolidado a gerencia. */
export function useRecuperacionMesController(anio: number, mes: number) {
  const load = useCallback(
    (signal: AbortSignal) => presupuestoApi.recuperacion(anio, mes, { signal }),
    [anio, mes],
  );
  const resource = useRemoteResource(load, 'Error al cargar la recuperación.');
  const [enviandoGer, setEnviandoGer] = useState(false);
  const [resultGer, setResultGer] = useState<{ ok: boolean; msg: string } | null>(null);

  async function enviarGerencia(to: string, subject: string, html: string) {
    if (!to || enviandoGer) return;
    setEnviandoGer(true);
    setResultGer(null);
    try {
      const j = await presupuestoApi.enviar({ to: to.replace(/;/g, ', '), subject, html });
      if (j.email_sent) setResultGer({ ok: true, msg: 'Correo enviado a gerencia.' });
      else setResultGer({ ok: false, msg: 'Error al enviar el correo.' });
    } catch (err) {
      setResultGer({ ok: false, msg: (err as ApiError).message || 'Error de red' });
    } finally {
      setEnviandoGer(false);
    }
  }

  return { ...resource, enviandoGer, resultGer, setResultGer, enviarGerencia };
}
