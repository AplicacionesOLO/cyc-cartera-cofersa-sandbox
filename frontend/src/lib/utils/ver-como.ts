// src/lib/utils/ver-como.ts
// "Ver como" -- Coordinador puede previsualizar el SIC con la interfaz de otro
// rol (Analista, Analista de Riesgo, Gerencia) SIN cambiar su rol real en
// `usuarios`. Es una cookie de sesión, nunca se confía en ella sola: siempre
// se exige que el rol REAL leído de la base sea COORDINADOR antes de aplicar
// la previsualización (ver /api/preview-rol).
//
// Alcance a propósito: solo cambia qué se RENDERIZA (Sidebar, qué dashboard,
// qué botones de acción). Las escrituras siguen autorizándose con el rol real
// de la sesión (la autenticación anterior), nunca con esta cookie -- no es un sandbox de
// seguridad, es una vista. Esto es seguro porque cada rol de solo lectura ya
// es un subconjunto estricto de lo que Coordinador puede hacer hoy.
//
// Server-only (usa next/headers) -- los Client Components que solo necesitan
// las constantes/tipos importan de ver-como-constants.ts en su lugar.
import { cookies } from 'next/headers';
import { COOKIE_VER_COMO, esRolPreviewValido, type RolPreview } from './ver-como-constants';

export { COOKIE_VER_COMO, ROLES_PREVIEW_VALIDOS, esRolPreviewValido } from './ver-como-constants';
export type { RolPreview } from './ver-como-constants';

/** Lee la cookie de previsualización activa (o null si no hay ninguna válida). */
export async function getRolPreviewCookie(): Promise<RolPreview | null> {
  const store = await cookies();
  const val = store.get(COOKIE_VER_COMO)?.value;
  return esRolPreviewValido(val) ? val : null;
}

/**
 * Dado el rol REAL de `usuarios` (ya resuelto contra la base), devuelve el rol
 * a usar para renderizar la pantalla actual: el de previsualización si el rol
 * real es COORDINADOR y hay una cookie activa; si no, el rol real tal cual.
 *
 * Reemplaza el patrón `(row?.rol ?? 'ANALISTA')` en cada page.tsx -- se le
 * pasa ese mismo valor ya resuelto y devuelve el rol "efectivo" a usar de ahí
 * en adelante (Sidebar, gating de módulos, botones de acción).
 */
export async function resolverRolEfectivo(rolReal: string): Promise<string> {
  if (rolReal !== 'COORDINADOR') return rolReal;
  const preview = await getRolPreviewCookie();
  return preview ?? rolReal;
}
