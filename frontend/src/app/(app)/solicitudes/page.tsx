import { redirect } from 'next/navigation';
import ListaSolicitudes from '@/components/solicitudes/lista-solicitudes';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import { puedeGestionarCartera } from '@/lib/utils/roles';
import { getServerHttp } from '@/shared/api/server-http';
import type { ApiError } from '@/shared/api/api-error';
import { createSolicitudesApi } from '@/views/solicitudes/api/solicitudes-api';
import type { Solicitud } from '@/types/database';

export default async function SolicitudesPage() {
  // Rol del usuario logueado — resuelto una sola vez por request (usuario-actual.ts)
  const { userEmail, perfil, rolEfectivo } = await getUsuarioActual();
  const rol = rolEfectivo ?? 'ANALISTA';
  const userName = perfil?.nombre ?? '';
  const userId = perfil?.id ?? '';

  // Analista de Riesgo no gestiona cobro -- si fuerza la URL, lo mandamos al Dashboard.
  // Excepción (sep 2026): ANALISTA_RIESGO con tiene_cartera_asignada=true sí entra.
  // Gerencia tampoco ve este módulo (solo Clientes y Pedidos Retenidos, ago 2026).
  if (rol === 'GERENCIA') redirect('/dashboard');
  if (
    rol !== 'COORDINADOR' &&
    !puedeGestionarCartera({ rol, tiene_cartera_asignada: perfil?.tiene_cartera_asignada })
  ) {
    redirect('/dashboard');
  }

  // Fetch solicitudes (ANALISTA: solo las propias; COORDINADOR: todas) + mapa solicitante_id → nombre
  let solicitudes: Solicitud[] = [];
  let solicitanteMap: Record<string, string> = {};
  let error: string | null = null;
  try {
    const data = await createSolicitudesApi(await getServerHttp()).lista(rol === 'ANALISTA');
    solicitudes = data.solicitudes;
    solicitanteMap = data.solicitante_map;
  } catch (e) {
    error = (e as ApiError).message ?? 'Error desconocido';
  }

  if (error) {
    return (
      <div className="p-5">
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700 font-semibold">
          No se pudieron cargar las solicitudes: {error}
        </div>
      </div>
    );
  }

  const coordId = rol === 'COORDINADOR' ? userId : '';

  return (
    <ListaSolicitudes
      solicitudes={solicitudes}
      rol={rol as 'COORDINADOR' | 'ANALISTA' | 'GERENCIA'}
      userEmail={userEmail}
      userName={userName}
      coordId={coordId}
      solicitanteMap={solicitanteMap}
    />
  );
}
