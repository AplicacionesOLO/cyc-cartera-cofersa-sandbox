// Límites compartidos con el backend (auditoria_legal: MAX_MB_IMAGEN/MAX_MB_PDF/MAX_LEN_*)
// y el formulario público (src/app/actualizar-perfil/[token]/formulario-actualizacion.tsx).
// Un solo lugar para no tener que mantenerlos sincronizados a mano.

export const MAX_MB_IMAGEN = 1; // ya viene comprimida a <=800KB del navegador; 1MB da margen
export const MAX_MB_PDF = 3;
export const MAX_LEN_LARGO = 200; // nombre / domicilio / profesion
export const MAX_LEN_CORTO = 30; // cedula / telefono
