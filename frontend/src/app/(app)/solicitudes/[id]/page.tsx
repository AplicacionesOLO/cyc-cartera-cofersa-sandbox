import { notFound, redirect } from 'next/navigation';
import DetalleSolicitud from '@/components/solicitudes/detalle-solicitud';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import { puedeGestionarCartera } from '@/lib/utils/roles';
import { getServerHttp } from '@/shared/api/server-http';
import type { ApiError } from '@/shared/api/api-error';
import { createSolicitudesApi } from '@/views/solicitudes/api/solicitudes-api';
import type { DetalleSolicitudResponse } from '@/views/solicitudes/types';

export type {
  ComentarioConAutor,
  HistorialConAutor,
  GestionOrigenLink,
} from '@/views/solicitudes/types';

export default async function SolicitudDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { perfil, rolEfectivo } = await getUsuarioActual();
  const rol = rolEfectivo ?? 'ANALISTA';

  // Gerencia no tiene el módulo Solicitudes (solo Clientes y Pedidos Retenidos, ago 2026).
  if (rol === 'GERENCIA') redirect('/dashboard');
  // Analista de Riesgo sin cartera asignada tampoco gestiona solicitudes (mismo guard que el listado).
  if (
    rol !== 'COORDINADOR' &&
    !puedeGestionarCartera({ rol, tiene_cartera_asignada: perfil?.tiene_cartera_asignada })
  ) {
    redirect('/dashboard');
  }

  // ── Solicitud + comentarios + historial + autores + gestión origen (un solo endpoint) ──
  let data: DetalleSolicitudResponse;
  try {
    data = await createSolicitudesApi(await getServerHttp()).detalle(id);
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 404) notFound();
    return (
      <div className="p-5">
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700 font-semibold">
          No se pudo cargar la solicitud: {err.message ?? 'error desconocido'}
        </div>
      </div>
    );
  }

  return (
    <DetalleSolicitud
      solicitud={data.solicitud}
      comentarios={data.comentarios}
      historial={data.historial}
      gestionOrigen={data.gestion_origen}
      solicitanteNombre={data.solicitante_nombre}
      rol={rol as 'COORDINADOR' | 'ANALISTA' | 'GERENCIA'}
    />
  );
}
