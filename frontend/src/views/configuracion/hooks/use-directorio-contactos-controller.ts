'use client';

import { useEffect, useState } from 'react';
import { configuracionApi } from '../api/configuracion-api';
import type { ContactoDirectorioActivo } from '../types';

// Caché a nivel de módulo — una sola consulta por sesión de browser (igual que antes)
let _cache: ContactoDirectorioActivo[] | null = null;
let _promise: Promise<ContactoDirectorioActivo[]> | null = null;

function fetchContactos(): Promise<ContactoDirectorioActivo[]> {
  if (_cache) return Promise.resolve(_cache);
  if (!_promise) {
    _promise = configuracionApi
      .contactosActivos()
      .then((res) => {
        _cache = res.data ?? [];
        return _cache;
      })
      .catch(() => {
        _promise = null; // reintenta en el próximo montaje; mientras tanto sin sugerencias
        return [];
      });
  }
  return _promise;
}

/** Contactos activos del directorio para el autocomplete de correos (`DirectorioInput`). */
export function useDirectorioContactosController() {
  const [contactos, setContactos] = useState<ContactoDirectorioActivo[]>(_cache ?? []);

  useEffect(() => {
    // La petición es compartida (caché de módulo) y no se cancela; el AbortController solo
    // evita actualizar el estado de un componente ya desmontado.
    const controller = new AbortController();
    fetchContactos().then((c) => {
      if (!controller.signal.aborted) setContactos(c);
    });
    return () => controller.abort();
  }, []);

  return { contactos };
}
