import { redirect } from 'next/navigation';
import MiCarteraView from '@/components/cartera/mi-cartera-view';
import type { CarteraRow, KPIs } from '@/lib/utils/cola-analista';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import { puedeGestionarCartera } from '@/lib/utils/roles';
import { getServerHttp } from '@/shared/api/server-http';
import type { ApiError } from '@/shared/api/api-error';
import { createDashboardApi } from '@/views/dashboard/api/dashboard-api';
import type { MiCarteraResponse } from '@/views/dashboard/types';

// Re-exportar tipos para que MiCarteraView (que importa de aquí) siga funcionando
// mientras migramos. MiCarteraView importa directamente desde cola-analista ahora.
export type { CarteraRow, KPIs };

const EMPTY_KPIS: KPIs = {
  moraTotal: 0,
  recuperadoMes: 0,
  promesasActivas: 0,
  sinGestion7d: 0,
};

export default async function MiCarteraPage() {
  // getUsuarioActual() ya la resolvió el layout para esta misma request
  // (React.cache()), así que este await no repite ningún round-trip de red.
  const { userEmail, rolEfectivo, perfil } = await getUsuarioActual();
  if (!userEmail) return <MiCarteraView rows={[]} kpis={EMPTY_KPIS} />;

  // Analista de Riesgo no gestiona cobro -- si fuerza la URL, lo mandamos al Dashboard.
  // Excepción (sep 2026): un ANALISTA_RIESGO con tiene_cartera_asignada=true (caso
  // Jossmin Ordoñez) sí entra -- ver puedeGestionarCartera().
  // Gerencia nunca: "Mi Cartera" es la cartera individual de un analista, no
  // una vista gerencial (esa es el Dashboard).
  // (El backend aplica la misma regla con el rol real y responde 403.)
  const rolMiCartera = rolEfectivo ?? '';
  if (rolMiCartera === 'GERENCIA') redirect('/dashboard');
  if (
    rolMiCartera !== 'COORDINADOR' &&
    !puedeGestionarCartera({
      rol: rolMiCartera,
      tiene_cartera_asignada: perfil?.tiene_cartera_asignada,
    })
  ) {
    redirect('/dashboard');
  }

  // Toda la lógica de scoring vive en el backend (Algoritmo V4, GET /dashboard/mi-cartera)
  let data: MiCarteraResponse;
  try {
    data = await createDashboardApi(await getServerHttp()).miCartera(userEmail);
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 403) redirect('/dashboard');
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-red-200 p-6 text-sm text-red-700">
          No se pudo cargar Mi Cartera: {err.message ?? 'error desconocido'}. Intente recargar la
          página.
        </div>
      </div>
    );
  }

  return <MiCarteraView rows={data.rows} kpis={data.kpis} />;
}
