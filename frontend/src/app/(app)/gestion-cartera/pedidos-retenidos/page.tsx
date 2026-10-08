import { redirect } from 'next/navigation';
import PedidosRetenidosCliente from './pedidos-retenidos-cliente';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import { puedeGestionarCartera } from '@/lib/utils/roles';

export const dynamic = 'force-dynamic';

export default async function PedidosRetenidosPage() {
  const { user, userEmail, perfil, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = (rolEfectivo ?? 'ANALISTA') as
    'COORDINADOR' | 'ANALISTA' | 'ANALISTA_RIESGO' | 'GERENCIA';
  // Excepción (sep 2026): ANALISTA_RIESGO con tiene_cartera_asignada=true sí entra.
  if (
    rol === 'ANALISTA_RIESGO' &&
    !puedeGestionarCartera({ rol, tiene_cartera_asignada: perfil?.tiene_cartera_asignada })
  ) {
    redirect('/dashboard');
  }

  return <PedidosRetenidosCliente userRol={rol} userEmail={userEmail} />;
}
