// src/lib/utils/dias-habiles.ts
// Conteo de días hábiles (Lunes a Viernes). `month` es 1-indexado (1 = enero).
// Uso: widget Meta Mensual del Dashboard y la pestaña Recuperación de
// Presupuesto de Cobro (pantalla + correos a gerencia/vendedores). NO se usa
// en fn_recuperacion (RPC), que sigue en días calendario a propósito.

export function getBusinessDaysInMonth(year: number, month: number): number {
  const diasEnMes = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let total = 0;
  for (let d = 1; d <= diasEnMes; d++) {
    const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) total++;
  }
  return total;
}

export function getElapsedBusinessDays(year: number, month: number, currentDay: number): number {
  const diasEnMes = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const hasta = Math.min(Math.max(currentDay, 0), diasEnMes);
  let total = 0;
  for (let d = 1; d <= hasta; d++) {
    const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) total++;
  }
  return total;
}

export function getRemainingBusinessDays(year: number, month: number, currentDay: number): number {
  return getBusinessDaysInMonth(year, month) - getElapsedBusinessDays(year, month, currentDay);
}
