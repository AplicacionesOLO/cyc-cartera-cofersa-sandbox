import { notFound, redirect } from 'next/navigation';
import { esSoloLectura, puedeGestionarCartera } from '@/lib/utils/roles';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import PaginaNuevaSolicitud from '@/components/clientes/ficha/pagina-nueva-solicitud';
import { getServerHttp } from '@/shared/api/server-http';
import type { ApiError } from '@/shared/api/api-error';
import { createSolicitudesApi } from '@/views/solicitudes/api/solicitudes-api';
import type { NuevaSolicitudContextoResponse } from '@/views/solicitudes/types';

interface PageProps {
  params: Promise<{ cod: string }>;
}

export default async function NuevaSolicitudClientePage({ params }: PageProps) {
  const { cod } = await params;

  // Gerencia ve la ficha del cliente en solo lectura -- no crea solicitudes.
  // Analista de Riesgo sin cartera asignada tampoco (guard del módulo Solicitudes).
  const { perfil, rolEfectivo } = await getUsuarioActual();
  const rol = rolEfectivo ?? '';
  if (
    esSoloLectura(rol) ||
    (rol !== 'COORDINADOR' &&
      !puedeGestionarCartera({ rol, tiene_cartera_asignada: perfil?.tiene_cartera_asignada }))
  ) {
    redirect(`/clientes/${encodeURIComponent(cod)}?tab=solicitudes`);
  }

  // ── 1-3. Cartera, maestro y facturas pendientes del cliente (por contribuyente, igual que ficha) ──
  let data: NuevaSolicitudContextoResponse;
  try {
    data = await createSolicitudesApi(await getServerHttp()).nuevaContexto(cod);
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 404) notFound();
    return (
      <div className="p-5">
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700 font-semibold">
          No se pudo cargar el cliente: {err.message ?? 'error desconocido'}
        </div>
      </div>
    );
  }
  const cartera = data.cartera;
  const maestro = data.maestro;
  const facturas = data.facturas;

  // ── 4. Cálculos derivados ─────────────────────────────────────────────
  const moraTotal =
    (cartera.mora_1_30 || 0) +
    (cartera.mora_31_60 || 0) +
    (cartera.mora_61_90 || 0) +
    (cartera.mora_91_120 || 0) +
    (cartera.mora_120_plus || 0);

  const tramoPeor =
    (cartera.mora_120_plus || 0) > 0
      ? '+120 días'
      : (cartera.mora_91_120 || 0) > 0
        ? '91-120 días'
        : (cartera.mora_61_90 || 0) > 0
          ? '61-90 días'
          : (cartera.mora_31_60 || 0) > 0
            ? '31-60 días'
            : (cartera.mora_1_30 || 0) > 0
              ? '1-30 días'
              : 'Al día';

  const limite = maestro?.limite_credito ?? 0;
  const creditoDisp = limite > 0 ? limite - cartera.total : null;

  return (
    <PaginaNuevaSolicitud
      clienteCod={cod}
      clienteNombre={cartera.cliente_nombre}
      limiteActual={limite}
      moraTotal={moraTotal}
      diasAtraso={tramoPeor}
      creditoDisponible={creditoDisp}
      condicionPago={maestro?.condicion_pago ? String(maestro.condicion_pago) : '—'}
      facturas={facturas}
    />
  );
}
