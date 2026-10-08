// Tipos del usuario actual, seguros para importar desde Client Components.
import type { Usuario } from '@/types/database';

export type PerfilUsuarioActual = Pick<
  Usuario,
  'id' | 'nombre' | 'email' | 'rol' | 'iniciales' | 'color' | 'tiene_cartera_asignada'
> & { telefono?: string | null; whatsapp?: string | null };

/** Identidad mínima de la sesión (antes `User` del origen): email y avatar del IdP. */
export interface SessionUserInfo {
  email: string;
  user_metadata: { avatar_url: string | null; full_name: string | null };
}
