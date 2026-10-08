// src/lib/utils/usuario-actual.ts
//
// Resuelve el usuario autenticado + su perfil (`usuarios`) + su rol efectivo ("Ver como") UNA sola
// vez por request, sin importar cuántos Server Components lo llamen (React.cache()).
//
// Sesión: cookies de Amplify (Cognito). Perfil: GET /me del API (el backend lo busca por email en
// `usuarios` con activo = true; sin fila activa responde 403 acceso_denegado → perfil null, y el
// layout redirige a /auth/denegado igual que antes).
import { cache } from 'react';
import { getServerIdentity } from '@/shared/auth/amplify-server';
import { getServerHttp } from '@/shared/api/server-http';
import { ApiError } from '@/shared/api/api-error';
import { createIdentidadApi, type MeResponse } from '@/views/identidad/api/identidad-api';
import { resolverRolEfectivo } from '@/lib/utils/ver-como';
import type { Usuario } from '@/types/database';
import type { PerfilUsuarioActual, SessionUserInfo } from './usuario-actual-types';

export type { PerfilUsuarioActual, SessionUserInfo } from './usuario-actual-types';

export interface UsuarioActual {
  /** `null` si no hay sesión válida -- llamar a redirect('/login') en ese caso. */
  user: SessionUserInfo | null;
  userEmail: string;
  /** `null` si el email no tiene fila activa en `usuarios` -- sin perfil no hay acceso. */
  perfil: PerfilUsuarioActual | null;
  rolReal: Usuario['rol'] | null;
  /** Rol real, o el de previsualización si Coordinador tiene "Ver como" activo. */
  rolEfectivo: string | null;
  /** Datos del layout (antes 2 consultas aparte a `usuarios` y `sync_log`). */
  totalEquipo: number;
  ultimaSync: string;
  gmailConectado: boolean;
  /** Error de red/servidor al consultar el perfil (distinto de "sin acceso"). */
  error: string | null;
}

const VACIO = {
  perfil: null,
  rolReal: null,
  rolEfectivo: null,
  totalEquipo: 5,
  ultimaSync: '',
  gmailConectado: false,
};

export const getUsuarioActual = cache(async (): Promise<UsuarioActual> => {
  const identity = await getServerIdentity();
  if (!identity) {
    return { user: null, userEmail: '', ...VACIO, error: null };
  }
  const user: SessionUserInfo = {
    email: identity.email,
    user_metadata: { avatar_url: identity.picture, full_name: identity.name },
  };

  let me: MeResponse;
  try {
    me = await createIdentidadApi(await getServerHttp()).me();
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 401) return { user: null, userEmail: '', ...VACIO, error: null };
    if (err.status === 403) return { user, userEmail: identity.email, ...VACIO, error: null };
    return { user, userEmail: identity.email, ...VACIO, error: err.message };
  }

  const perfil = me.perfil;
  const rolReal = perfil.rol;
  const rolEfectivo = await resolverRolEfectivo(rolReal);
  return {
    user: { ...user, email: me.user.email || identity.email },
    userEmail: me.user.email || identity.email,
    perfil,
    rolReal,
    rolEfectivo,
    totalEquipo: me.total_equipo,
    ultimaSync: me.ultima_sync,
    gmailConectado: me.gmail_conectado,
    error: null,
  };
});
