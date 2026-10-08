// Teléfono CR: exactamente 8 dígitos, formato XXXX-XXXX.
// Compartido por todos los modales de contacto del SIC (Vendedores, Directorio, Usuarios)
// para que el campo teléfono tenga siempre la misma estructura y validación.

export function fmtTel(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
}

export function telValido(v: string): boolean {
  const d = v.replace(/\D/g, '');
  return d.length === 0 || d.length === 8;
}
