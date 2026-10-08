import { redirect } from 'next/navigation';
import TablaPromesas from '@/components/promesas/tabla-promesas';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import { puedeGestionarCartera } from '@/lib/utils/roles';
import { analistasConCarteraReal, type AnalistaConCartera } from '@/lib/utils/analistas-equipo';
import { getServerHttp } from '@/shared/api/server-http';
import type { ApiError } from '@/shared/api/api-error';
import { createPromesasApi } from '@/views/promesas/api/promesas-api';
import type { PromesasPagina } from '@/views/promesas/types';

// Datos de la gestión origen que enriquecen cada card
export type { GestionOrigen } from '@/views/promesas/types';

export default async function PromesasPage() {
  // ── Rol del usuario logueado — resuelto una sola vez por request (usuario-actual.ts) ──
  const { userEmail, perfil, rolEfectivo } = await getUsuarioActual();
  const rol = rolEfectivo ?? 'ANALISTA';

  // Analista de Riesgo no gestiona cobro -- si fuerza la URL, lo mandamos al Dashboard.
  // Excepción (sep 2026): ANALISTA_RIESGO con tiene_cartera_asignada=true sí entra.
  // Gerencia tampoco ve este módulo (solo Clientes y Pedidos Retenidos, ago 2026).
  // El API aplica el mismo guard (PromesasApi → require_gestor_cartera).
  if (rol === 'GERENCIA') redirect('/dashboard');
  if (
    rol !== 'COORDINADOR' &&
    !puedeGestionarCartera({ rol, tiene_cartera_asignada: perfil?.tiene_cartera_asignada })
  ) {
    redirect('/dashboard');
  }

  // ── Promesas activas (las más próximas primero, tope 800) + gestión origen ──
  //    ANALISTA → solo las propias  ·  COORDINADOR → todas
  //    ANALISTA_RIESGO con cartera solo llega hasta acá si puedeGestionarCartera() ya dio true
  //    arriba (ver redirect) -- se acota igual que ANALISTA ("Ver como" incluido).
  const http = await getServerHttp();
  const alcance = rol === 'ANALISTA' || rol === 'ANALISTA_RIESGO' ? userEmail : null;
  // La lista de analistas (solo para el filtro de Coordinador/Gerencia) va en paralelo.
  const necesitaAnalistas = rol === 'COORDINADOR' || rol === 'GERENCIA';

  let pagina: PromesasPagina;
  let analistas: AnalistaConCartera[];
  try {
    [pagina, analistas] = await Promise.all([
      createPromesasApi(http).pagina(alcance),
      necesitaAnalistas
        ? analistasConCarteraReal(http)
        : Promise.resolve([] as AnalistaConCartera[]),
    ]);
  } catch (e) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        No se pudieron cargar las promesas: {(e as ApiError).message ?? 'error desconocido'}.
        Recargue la página para reintentar.
      </div>
    );
  }

  return (
    <TablaPromesas
      promesas={pagina.promesas}
      gestionesMap={pagina.gestionesMap}
      rol={rol as 'COORDINADOR' | 'ANALISTA' | 'GERENCIA'}
      userEmail={userEmail}
      analistas={analistas}
    />
  );
}
