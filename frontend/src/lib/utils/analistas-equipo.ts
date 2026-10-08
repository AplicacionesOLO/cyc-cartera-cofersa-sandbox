// src/lib/utils/analistas-equipo.ts
//
// Punto único para "quién es analista con cartera real hoy" -- usado en los
// filtros "por analista" del coordinador/gerencia (saldos-favor, estados de
// cuenta, promesas, gestiones, presupuesto de cobro) y en "Mi Equipo" del
// Dashboard.
//
// El cruce (elegible por rol: ANALISTA, o ANALISTA_RIESGO con
// tiene_cartera_asignada=true; Y con al menos un cliente en
// maestro_clientes.analista_email) ahora lo resuelve el API:
// GET /me/analistas-con-cartera → [{ email, nombre }] ordenado por nombre.
import type { HttpClient } from '@/shared/api/http-client';
import { createIdentidadApi, type AnalistaConCartera } from '@/views/identidad/api/identidad-api';

export type { AnalistaConCartera };

/** Analistas activos con cartera real (server: `await getServerHttp()`; client: `browserHttp`). */
export async function analistasConCarteraReal(http: HttpClient): Promise<AnalistaConCartera[]> {
  return createIdentidadApi(http).analistasConCartera();
}

/** Aplica el cruce sobre una lista de filas { email, ... } con el set de emails devuelto por el API. */
export function filtrarConCarteraReal<T extends { email: string | null }>(
  filas: T[],
  emailsConCartera: Set<string>,
): T[] {
  return filas.filter((f) => f.email && emailsConCartera.has(f.email));
}
