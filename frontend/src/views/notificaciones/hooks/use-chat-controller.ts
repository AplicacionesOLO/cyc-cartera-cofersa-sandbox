'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiError } from '@/shared/api/api-error';
import type { MensajeChatConUsuario, PresenciaChat } from '@/types/database';
import { notificacionesApi } from '../api/notificaciones-api';

interface UseChatOptions {
  usuarioId: string;
  nombre: string;
  iniciales: string;
  color: string;
}

/**
 * Chat interno del equipo (ChatPanel, hoy desmontado en ClientWrapper).
 *
 * La tabla `mensajes_chat` no existe en el esquema real de producción: en el origen la carga fallaba
 * ("No se pudieron cargar los mensajes.") y el envío devolvía error. GET/POST /chat reproducen ese
 * comportamiento. Sin el canal en vivo anterior no hay mensajes en vivo ni lista de conectados.
 */
export function useChatController({ usuarioId }: UseChatOptions) {
  const [mensajes, setMensajes] = useState<MensajeChatConUsuario[]>([]);
  const [conectados] = useState<PresenciaChat[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!usuarioId) return;
    const controller = new AbortController();
    setCargando(true);
    notificacionesApi
      .mensajesChat({ signal: controller.signal })
      .then((data) => setMensajes(data ?? []))
      .catch((e: ApiError) => {
        if (e.isCanceled) return;
        setError('No se pudieron cargar los mensajes.');
        console.error('[useChat] Error cargando mensajes:', e.message);
      })
      .finally(() => setCargando(false));
    return () => controller.abort();
  }, [usuarioId]);

  const enviarMensaje = useCallback(async (texto: string): Promise<boolean> => {
    const trimmed = texto.trim();
    if (!trimmed) return false;
    try {
      await notificacionesApi.enviarMensajeChat(trimmed);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { mensajes, conectados, cargando, error, enviarMensaje };
}
