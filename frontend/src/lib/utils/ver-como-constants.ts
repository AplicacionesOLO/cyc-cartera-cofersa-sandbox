// src/lib/utils/ver-como-constants.ts
// Parte de "Ver como" segura para importar desde Client Components (sin
// `next/headers`) -- ver-como.ts (server-only) reexporta esto y le agrega
// las funciones que sí necesitan leer la cookie.
export const COOKIE_VER_COMO = 'sic_ver_como';

export const ROLES_PREVIEW_VALIDOS = ['ANALISTA', 'ANALISTA_RIESGO', 'GERENCIA'] as const;
export type RolPreview = (typeof ROLES_PREVIEW_VALIDOS)[number];

export function esRolPreviewValido(v: unknown): v is RolPreview {
  return typeof v === 'string' && (ROLES_PREVIEW_VALIDOS as readonly string[]).includes(v);
}
