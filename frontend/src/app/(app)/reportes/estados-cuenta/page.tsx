import { redirect } from 'next/navigation';
import { getServerHttp } from '@/shared/api/server-http';
import { createReportesApi } from '@/views/reportes/api/reportes-api';
import type { ContribEC } from '@/views/reportes/types';
import EstadosCuentaCliente from './estados-cuenta-cliente';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import { puedeGestionarCartera } from '@/lib/utils/roles';
import { analistasConCarteraReal } from '@/lib/utils/analistas-equipo';

export const dynamic = 'force-dynamic';

export type { ContribEC };

export default async function EstadosCuentaPage() {
  const { user, perfil, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = rolEfectivo ?? 'ANALISTA';
  // Explícito (no "!== COORDINADOR"): Gerencia también ve todo, como Coordinador.
  // ANALISTA_RIESGO con tiene_cartera_asignada=true (sep 2026) se acota igual que ANALISTA.
  const esAnalista = puedeGestionarCartera({
    rol,
    tiene_cartera_asignada: perfil?.tiene_cartera_asignada,
  });

  // Perf: la lista de analistas (solo para el filtro del coordinador) no
  // depende del RPC de contribuyentes ni viceversa -- van en paralelo.
  // El backend devuelve los contribuyentes ya enriquecidos con el vendedor del código
  // representativo (maestro_clientes). La lista de analistas del filtro del coordinador es
  // elegible por rol ∩ con cartera real hoy (GET /me/analistas-con-cartera).
  const http = await getServerHttp();
  let contribsEnriquecidos: ContribEC[];
  let analistas: { email: string; nombre: string }[];
  try {
    [contribsEnriquecidos, analistas] = await Promise.all([
      createReportesApi(http)
        .estadosCuenta(esAnalista ? (user.email ?? null) : null)
        .then((r) => r ?? []),
      esAnalista ? Promise.resolve([]) : analistasConCarteraReal(http),
    ]);
  } catch {
    return (
      <div className="px-5 py-5">
        <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
          <p className="text-red-600 text-sm font-semibold">
            Error al cargar los estados de cuenta. Intentá de nuevo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <EstadosCuentaCliente
      contribuyentes={contribsEnriquecidos}
      esAnalista={esAnalista}
      analistas={analistas}
    />
  );
}
