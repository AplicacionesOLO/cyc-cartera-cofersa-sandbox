import { redirect } from 'next/navigation';
import FormSolicitudNueva from '@/components/solicitudes/form-solicitud-nueva';
import { esSoloLectura, puedeGestionarCartera } from '@/lib/utils/roles';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import { getServerHttp } from '@/shared/api/server-http';
import type { ApiError } from '@/shared/api/api-error';
import { createSolicitudesApi } from '@/views/solicitudes/api/solicitudes-api';
import type { ClienteConDatos, NuevaSolicitudClientesResponse } from '@/views/solicitudes/types';

// ── Tipos que reciben los formularios (definidos en el módulo views/solicitudes) ──
export type { ClienteConDatos, GestionOrigenPreload } from '@/views/solicitudes/types';

export default async function NuevaSolicitudPage({
  searchParams,
}: {
  searchParams: Promise<{
    cliente_cod?: string;
    gestion_id?: string;
    area?: string;
    tipo?: string;
    origen?: string;
  }>;
}) {
  const sp = await searchParams;

  const { userEmail, perfil, rolEfectivo } = await getUsuarioActual();
  const userId = perfil?.id ?? '';
  const rol = rolEfectivo ?? 'ANALISTA';

  // Gerencia no tiene el módulo Solicitudes (solo Clientes y Pedidos Retenidos, ago 2026).
  if (esSoloLectura(rol)) redirect('/dashboard');
  // Analista de Riesgo sin cartera asignada tampoco crea solicitudes (mismo guard que el listado).
  if (
    rol !== 'COORDINADOR' &&
    !puedeGestionarCartera({ rol, tiene_cartera_asignada: perfil?.tiene_cartera_asignada })
  ) {
    redirect('/dashboard');
  }

  // ── Cartera + maestro (para selección manual de cliente) + nombres de analistas + gestión
  // origen de la URL -- un solo endpoint (ANALISTA: solo el maestro de su cartera) ──────────
  let data: NuevaSolicitudClientesResponse;
  try {
    data = await createSolicitudesApi(await getServerHttp()).nuevaClientes(
      rol === 'ANALISTA',
      sp.gestion_id ?? null,
    );
  } catch (e) {
    return (
      <div className="p-5">
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700 font-semibold">
          No se pudo cargar el formulario de solicitud:{' '}
          {(e as ApiError).message ?? 'error desconocido'}
        </div>
      </div>
    );
  }
  const gestionOrigen = data.gestion_origen;
  const carteraList = data.cartera;
  const maestroList = data.maestro;

  const maestroMap: Record<string, (typeof maestroList)[number]> = {};
  maestroList.forEach((m) => {
    maestroMap[m.cliente_cod] = m;
  });

  const codsPermitidos = data.solo_mi_cartera
    ? new Set(maestroList.map((m) => m.cliente_cod))
    : null;
  const carteraFiltrada = codsPermitidos
    ? carteraList.filter((c) => codsPermitidos.has(c.cliente_cod))
    : carteraList;

  const analistaNombreMap: Record<string, string> = data.analista_nombres;

  const clientes: ClienteConDatos[] = carteraFiltrada.map((c) => {
    const m = maestroMap[c.cliente_cod];
    const mora_total =
      (c.mora_1_30 || 0) +
      (c.mora_31_60 || 0) +
      (c.mora_61_90 || 0) +
      (c.mora_91_120 || 0) +
      (c.mora_120_plus || 0);
    const tramo_peor =
      (c.mora_120_plus || 0) > 0
        ? '+120 días'
        : (c.mora_91_120 || 0) > 0
          ? '91-120 días'
          : (c.mora_61_90 || 0) > 0
            ? '61-90 días'
            : (c.mora_31_60 || 0) > 0
              ? '31-60 días'
              : (c.mora_1_30 || 0) > 0
                ? '1-30 días'
                : 'Al día';
    const analista_email = m?.analista_email ?? '';
    return {
      cliente_cod: c.cliente_cod,
      cliente_nombre: c.cliente_nombre,
      contribuyente: c.contribuyente,
      vendedor_nombre: c.vendedor_nombre,
      analista_email,
      analista_nombre: analistaNombreMap[analista_email] ?? analista_email.split('@')[0] ?? '—',
      limite_credito: m?.limite_credito ?? 0,
      estado_manual: m?.estado_manual ?? 'Normal',
      mora_total,
      tramo_peor,
    };
  });
  clientes.sort((a, b) => b.mora_total - a.mora_total);

  // ── Pre-carga desde URL (originada desde una gestión) ─────────────────
  // gestionOrigen ya se resolvió arriba, junto con cartera/maestro.
  const preCliente = sp.cliente_cod
    ? (clientes.find((c) => c.cliente_cod === sp.cliente_cod) ?? null)
    : null;

  return (
    <FormSolicitudNueva
      userId={userId}
      userEmail={userEmail}
      clientes={clientes}
      preCliente={preCliente}
      preArea={sp.area ?? null}
      preTipo={sp.tipo ?? null}
      gestionOrigen={gestionOrigen}
      origenFicha={sp.origen === 'ficha'}
    />
  );
}
