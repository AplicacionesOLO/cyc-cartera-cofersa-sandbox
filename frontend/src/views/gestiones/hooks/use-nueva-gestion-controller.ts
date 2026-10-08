'use client';

import { useEffect, useState } from 'react';
import type { ApiError } from '@/shared/api/api-error';
import { gestionesApi } from '../api/gestiones-api';
import type { FormalizarBitacoraBody, NuevaGestionBody } from '../types';

/** Resultado de una acción: `ok` con dato, o el mensaje de error a mostrar tal cual en el formulario. */
export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string };

const MSG_SESION_VENCIDA =
  'Su sesión venció. Recargue la página (Ctrl+F5) e inicie sesión de nuevo; su gestión NO se guardó.';
const MSG_SERVICIO_CAIDO =
  'El servicio de autenticación no está respondiendo. Su gestión NO se guardó: espere un minuto e inténtelo de nuevo.';

/**
 * Formulario "Registrar gestión" (ficha 360°): otros códigos del contribuyente, optimización de la
 * nota con IA (POST /ai/formalizar-bitacora) y registro (POST /clientes/gestiones/nueva).
 */
export function useNuevaGestionController(contribuyente: string, clienteCod: string) {
  const [codigosContribuyente, setCodigosContribuyente] = useState<
    { cod: string; nombre: string }[]
  >([]);

  // Contribuyente — otros códigos del mismo contribuyente
  useEffect(() => {
    if (!contribuyente) return;
    const controller = new AbortController();
    gestionesApi
      .codigosContribuyente(contribuyente, clienteCod, { signal: controller.signal })
      .then((data) => {
        if (data.length > 0) {
          setCodigosContribuyente(
            data.map((d) => ({ cod: d.cliente_cod, nombre: d.cliente_nombre })),
          );
        }
      })
      .catch(() => {
        /* sin otros códigos: el checkbox "aplicar a todos" no se muestra */
      });
    return () => controller.abort();
  }, [contribuyente, clienteCod]);

  async function formalizar(body: FormalizarBitacoraBody): Promise<Resultado<string>> {
    try {
      const d = await gestionesApi.formalizarBitacora(body);
      if (d.texto) return { ok: true, data: d.texto };
      return { ok: false, error: 'IA: No se pudo optimizar la nota' };
    } catch (e) {
      const err = e as ApiError;
      if (err.isNetworkError)
        return { ok: false, error: 'Error de conexión al optimizar. Intentá de nuevo.' };
      return { ok: false, error: `IA: ${err.message || 'No se pudo optimizar la nota'}` };
    }
  }

  async function registrar(body: NuevaGestionBody): Promise<Resultado<{ gestion_id: string }>> {
    try {
      const d = await gestionesApi.registrar(body);
      return { ok: true, data: { gestion_id: d.gestion_id ?? '' } };
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) return { ok: false, error: MSG_SESION_VENCIDA };
      if (err.isNetworkError || err.status === 503) return { ok: false, error: MSG_SERVICIO_CAIDO };
      return { ok: false, error: err.message || 'Error al guardar. Intentá de nuevo.' };
    }
  }

  /**
   * Propaga la gestión a otros códigos del mismo contribuyente (sin promesa). Igual que el origen,
   * un fallo en un código hermano no bloquea el flujo.
   */
  async function registrarEnCodigos(body: NuevaGestionBody, cods: string[]): Promise<void> {
    await Promise.all(
      cods.map((cod) =>
        gestionesApi.registrar({ ...body, cliente_cod: cod, promesa: null }).catch(() => null),
      ),
    );
  }

  return { codigosContribuyente, formalizar, registrar, registrarEnCodigos };
}
