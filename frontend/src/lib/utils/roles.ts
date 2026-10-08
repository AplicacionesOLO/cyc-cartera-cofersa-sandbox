/**
 * Nombres profesionales para mostrar en pantalla. El valor guardado en
 * `usuarios.rol` (COORDINADOR / ANALISTA / ANALISTA_RIESGO / GERENCIA) NO cambia --
 * decenas de políticas RLS y checks en el código comparan ese string exacto.
 * Este mapeo es puramente de presentación.
 */
export type RolInterno = 'COORDINADOR' | 'ANALISTA' | 'ANALISTA_RIESGO' | 'GERENCIA';

export const ROL_DISPLAY: Record<RolInterno, string> = {
  COORDINADOR: 'Coordinador de Crédito y Cuentas por Cobrar',
  ANALISTA: 'Analista de Crédito y Cobro',
  ANALISTA_RIESGO: 'Analista de Riesgo',
  GERENCIA: 'Gerencia',
};

export const ROL_OPCIONES: { value: RolInterno; label: string }[] = [
  { value: 'COORDINADOR', label: ROL_DISPLAY.COORDINADOR },
  { value: 'ANALISTA', label: ROL_DISPLAY.ANALISTA },
  { value: 'ANALISTA_RIESGO', label: ROL_DISPLAY.ANALISTA_RIESGO },
  { value: 'GERENCIA', label: ROL_DISPLAY.GERENCIA },
];

export function displayRol(rol: string): string {
  return ROL_DISPLAY[rol as RolInterno] ?? rol;
}

/**
 * GERENCIA ve exactamente lo mismo que COORDINADOR (Sidebar, Dashboard, Hub de
 * Reportes) pero no puede crear/editar/aprobar/cambiar estados en ningún módulo.
 * Punto único para gatear botones de acción -- no repetir `rol === 'GERENCIA'`
 * suelto en cada componente.
 */
export function esSoloLectura(rol: string): boolean {
  return rol === 'GERENCIA';
}

/**
 * Caso Jossmin Ordoñez (sep 2026): un ANALISTA_RIESGO normalmente no gestiona
 * cartera propia, pero puede tener cartera asignada como excepción puntual
 * (`usuarios.tiene_cartera_asignada`). Punto único para gatear Mi Cartera /
 * Gestiones / Promesas / Solicitudes -- no repetir esta combinación suelta en
 * cada guard ni en el Sidebar.
 */
export function puedeGestionarCartera(u: {
  rol: string;
  tiene_cartera_asignada?: boolean | null;
}): boolean {
  return u.rol === 'ANALISTA' || (u.rol === 'ANALISTA_RIESGO' && !!u.tiene_cartera_asignada);
}
