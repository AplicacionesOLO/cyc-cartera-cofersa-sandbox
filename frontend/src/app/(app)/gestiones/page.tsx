import { redirect } from 'next/navigation';
import TablaGestiones from '@/components/gestiones/tabla-gestiones';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import { puedeGestionarCartera } from '@/lib/utils/roles';
import { analistasConCarteraReal, type AnalistaConCartera } from '@/lib/utils/analistas-equipo';
import { getServerHttp } from '@/shared/api/server-http';
import type { ApiError } from '@/shared/api/api-error';
import { createGestionesApi } from '@/views/gestiones/api/gestiones-api';
import type { Gestion } from '@/types/database';
import type { ReferenciasGestiones } from '@/views/gestiones/types';

export type { SolicitudGestionRef } from '@/views/gestiones/types';

export default async function GestionesPage() {
  // Rol del usuario logueado — resuelto una sola vez por request (usuario-actual.ts)
  const { userEmail, perfil, rolEfectivo } = await getUsuarioActual();
  const rol = rolEfectivo ?? 'ANALISTA';
  const nombre = perfil?.nombre ?? '';

  // Analista de Riesgo no gestiona cobro -- si fuerza la URL, lo mandamos al Dashboard.
  // Excepción (sep 2026): ANALISTA_RIESGO con tiene_cartera_asignada=true sí entra.
  // Gerencia tampoco ve este módulo (solo Clientes y Pedidos Retenidos, ago 2026).
  // El API aplica el mismo guard (GestionesApi → require_gestor_cartera).
  if (rol === 'GERENCIA') redirect('/dashboard');
  if (
    rol !== 'COORDINADOR' &&
    !puedeGestionarCartera({ rol, tiene_cartera_asignada: perfil?.tiene_cartera_asignada })
  ) {
    redirect('/dashboard');
  }

  const http = await getServerHttp();
  const api = createGestionesApi(http);
  // ANALISTA solo las propias, COORDINADOR todas. ANALISTA_RIESGO con cartera solo llega hasta acá
  // si puedeGestionarCartera() ya dio true arriba -- se acota igual que ANALISTA ("Ver como" incluido).
  const alcance = rol === 'ANALISTA' || rol === 'ANALISTA_RIESGO' ? userEmail : null;
  const necesitaAnalistas = rol === 'COORDINADOR' || rol === 'GERENCIA';

  let gestiones: Gestion[];
  let referencias: ReferenciasGestiones;
  let analistas: AnalistaConCartera[];
  try {
    // Gestiones (en lotes de 1000), referencias de la bandeja y analistas en paralelo
    [gestiones, referencias, analistas] = await Promise.all([
      api.listaCompleta(alcance),
      api.referencias(alcance),
      necesitaAnalistas
        ? analistasConCarteraReal(http)
        : Promise.resolve([] as AnalistaConCartera[]),
    ]);
  } catch (e) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        No se pudieron cargar las gestiones: {(e as ApiError).message ?? 'error desconocido'}.
        Recargue la página para reintentar.
      </div>
    );
  }

  return (
    <TablaGestiones
      gestiones={gestiones}
      solicitudes={referencias.solicitudes}
      promesaEstadoMap={referencias.promesa_estados}
      nombreClienteMap={referencias.nombres_cliente}
      codsConCartera={new Set(referencias.cods_con_cartera)}
      rol={rol as 'COORDINADOR' | 'ANALISTA' | 'GERENCIA'}
      userEmail={userEmail}
      userName={nombre}
      analistas={analistas}
    />
  );
}
