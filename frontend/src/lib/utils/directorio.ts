/**
 * Utilidad de búsqueda en el directorio de la empresa.
 * Alimenta el autocomplete de correos en la Ficha 360° y en Solicitudes.
 *
 * IMPORTANTE: solo para Server Components (usa el HttpClient del servidor). Los Client
 * Components usan `useDirectorioContactosController` (vía `DirectorioInput`).
 * Ambos leen GET /configuracion/directorio-activo (contactos activos, cualquier usuario activo).
 */
import 'server-only';
import { getServerHttp } from '@/shared/api/server-http';
import { createConfiguracionApi } from '@/views/configuracion/api/configuracion-api';

export interface ContactoDirectorio {
  nombre: string;
  email: string;
  cargo: string | null;
  area: string;
}

function aContacto(c: {
  nombre: string;
  email: string;
  cargo: string | null;
  area: string | null;
}): ContactoDirectorio {
  return { nombre: c.nombre, email: c.email, cargo: c.cargo, area: c.area ?? '' };
}

/**
 * Busca contactos activos por nombre o email.
 * Útil en Server Components para cargar sugerencias iniciales.
 */
export async function buscarContactos(query: string): Promise<ContactoDirectorio[]> {
  if (!query.trim()) return [];
  try {
    const api = createConfiguracionApi(await getServerHttp());
    const res = await api.contactosActivos({ q: query, limit: 8 });
    return (res.data ?? []).map(aContacto);
  } catch {
    return [];
  }
}

/**
 * Retorna todos los contactos activos de un área específica.
 */
export async function contactosPorArea(area: string): Promise<ContactoDirectorio[]> {
  try {
    const api = createConfiguracionApi(await getServerHttp());
    const res = await api.contactosActivos({ area });
    return (res.data ?? []).map(aContacto);
  } catch {
    return [];
  }
}
