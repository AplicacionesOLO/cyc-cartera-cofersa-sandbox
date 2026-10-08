import { redirect } from 'next/navigation';
import { esSoloLectura, puedeGestionarCartera } from '@/lib/utils/roles';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import { analistasConCarteraReal } from '@/lib/utils/analistas-equipo';
import { getServerHttp } from '@/shared/api/server-http';
import type { ApiError } from '@/shared/api/api-error';
import { createGestionCarteraApi } from '@/views/gestion-cartera/api/gestion-cartera-api';
import SaldosFavorCliente from './saldos-favor-cliente';
import type { SaldoFavor } from '@/components/saldos-favor/saldos-favor-tabla';

export const dynamic = 'force-dynamic';

export default async function SaldosFavorPage() {
  const { user, userEmail, perfil, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = rolEfectivo ?? 'ANALISTA';
  // Gerencia no tiene este módulo (solo Clientes y Pedidos Retenidos, ago 2026).
  if (esSoloLectura(rol)) redirect('/dashboard');
  // Alcance de la consulta: ANALISTA (y ANALISTA_RIESGO con tiene_cartera_asignada=true,
  // sep 2026) ve nada más su cartera -- Coordinador ve todo.
  const esAnalista = puedeGestionarCartera({
    rol,
    tiene_cartera_asignada: perfil?.tiene_cartera_asignada,
  });
  const soloLectura = esSoloLectura(rol);

  // Role-based en el query: analista solo su cartera (p_email); coordinador/gerencia todos (null).
  // El backend vuelve a aplicar la regla con el rol real (el analista nunca ve otra cartera).
  // Perf: la lista de analistas (solo para el filtro de coordinador/gerencia)
  // no depende de los saldos ni viceversa -- van en paralelo en vez de en cadena.
  const http = await getServerHttp();
  let filas: SaldoFavor[];
  let analistas: { email: string; nombre: string }[];
  try {
    [filas, analistas] = await Promise.all([
      createGestionCarteraApi(http).saldosFavor(esAnalista ? userEmail : null),
      // Lista de analistas para el filtro -- elegible por rol ∩ con cartera real hoy.
      esAnalista ? Promise.resolve([]) : analistasConCarteraReal(http).catch(() => []),
    ]);
  } catch (e) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-red-200 p-6 text-sm text-red-700">
          No se pudieron cargar los saldos a favor: {(e as ApiError).message ?? 'error desconocido'}
          . Intente recargar la página.
        </div>
      </div>
    );
  }

  return (
    <SaldosFavorCliente
      filasIniciales={filas ?? []}
      esAnalista={esAnalista}
      soloLectura={soloLectura}
      analistas={analistas}
      userEmail={userEmail}
    />
  );
}
