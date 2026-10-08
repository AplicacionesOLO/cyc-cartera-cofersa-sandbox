// src/lib/auditoria-legal/persona.ts

/**
 * Cédula jurídica en Costa Rica: 10 dígitos que empiezan con 3. Las físicas
 * son de 9 y los DIMEX de 12. Verificado contra el maestro de clientes (jul
 * 2026): de los 1,048 clientes que cumplen esta regla, 967 (92%) traen
 * S.A./S.R.L./Limitada en el nombre -- discriminante confiable.
 *
 * Se usa para: el KPI "Sin Aval Personal" en la tabla de Garantías, y para
 * decidir la plantilla del pagaré (A jurídica / B física) sin depender de
 * que la API de Hacienda esté disponible en el momento de generar el
 * documento.
 */
export function esPersonaJuridica(contribuyente: string): boolean {
  const c = contribuyente.trim();
  return c.length === 10 && c.startsWith('3');
}
