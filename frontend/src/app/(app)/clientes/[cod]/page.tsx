import { notFound } from 'next/navigation';
import FichaCliente from '@/components/clientes/ficha/ficha-cliente';
import { esSoloLectura } from '@/lib/utils/roles';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import { getServerHttp } from '@/shared/api/server-http';
import type { ApiError } from '@/shared/api/api-error';
import { createClientesApi } from '@/views/clientes/api/clientes-api';
import type { FichaClienteResponse } from '@/views/clientes/types';

// Next.js 15+ requiere que params sea awaited
interface PageProps {
  params: Promise<{ cod: string }>;
  searchParams: Promise<{ from?: string; volver?: string }>;
}

export default async function FichaClientePage({ params, searchParams }: PageProps) {
  const { cod: raw } = await params;
  const cod = decodeURIComponent(raw ?? '');

  // ── Back navigation ─────────────────────────────────────────────────────
  // `volver` es genérico -- la URL completa (con filtros/página/orden) de la
  // pantalla que abrió esta ficha, la manda quien crea el link. Reemplaza al
  // viejo `from` (solo distinguía 'mi-cartera' vs todo lo demás -> /clientes
  // en blanco, perdiendo cualquier filtro activo). Se mantiene `from=mi-cartera`
  // como fallback para links que todavía no se migraron a `volver`.
  const { from, volver } = await searchParams;
  const volverSafe = volver && volver.startsWith('/') ? volver : null;
  const backHref = volverSafe ?? (from === 'mi-cartera' ? '/mi-cartera' : '/clientes');

  // ── Datos de la ficha en una sola llamada (GET /clientes/{cod}/ficha) ──
  // Antes ~11 consultas al origen en dos tandas; el backend las resuelve juntas,
  // incluido Anterior/Siguiente cuando `volver` apunta al listado de Clientes.
  // Usuario/rol (quien registra la gestión) sale de getUsuarioActual (cacheado por request).
  let ficha: FichaClienteResponse;
  let usuarioActual: Awaited<ReturnType<typeof getUsuarioActual>>;
  try {
    [usuarioActual, ficha] = await Promise.all([
      getUsuarioActual(),
      createClientesApi(await getServerHttp()).ficha(cod, volverSafe),
    ]);
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 404) return notFound();
    return (
      <div className="p-5">
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700 font-semibold">
          No se pudo cargar la ficha del cliente: {err.message ?? 'error desconocido'}
        </div>
      </div>
    );
  }

  const userEmail = usuarioActual.userEmail;
  const rolActual = usuarioActual.rolEfectivo ?? 'ANALISTA';
  const esCoordinador = rolActual === 'COORDINADOR';
  const soloLectura = esSoloLectura(rolActual);

  return (
    <FichaCliente
      cartera={ficha.cartera}
      maestro={ficha.maestro}
      facturas={ficha.facturas ?? []}
      gestiones={ficha.gestiones ?? []}
      promesas={ficha.promesas ?? []}
      solicitudes={ficha.solicitudes ?? []}
      solicitanteMap={ficha.solicitante_map ?? {}}
      analistaNombre={ficha.analista_nombre ?? ''}
      analistaEmail={ficha.analista_email ?? ''}
      analistaTelefono={ficha.analista_telefono ?? null}
      analistaWhatsapp={ficha.analista_whatsapp ?? null}
      userEmail={userEmail}
      esCoordinador={esCoordinador}
      soloLectura={soloLectura}
      backHref={backHref}
      volver={volverSafe}
      prevCod={ficha.prev_cod}
      nextCod={ficha.next_cod}
      posicionEnLista={ficha.posicion_en_lista}
      totalEnLista={ficha.total_en_lista}
      icp={ficha.icp ?? null}
      tendenciaPago={ficha.tendencia_pago ?? []}
      pedidosRetenidos={ficha.pedidos_retenidos ?? []}
    />
  );
}
