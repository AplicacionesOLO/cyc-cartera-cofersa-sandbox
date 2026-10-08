import { redirect } from 'next/navigation';
import EfectividadCliente from './efectividad-cliente';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

export const dynamic = 'force-dynamic';

export default async function EfectividadGestionesPage() {
  const { user, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = rolEfectivo ?? 'ANALISTA';
  if (rol !== 'COORDINADOR' && rol !== 'GERENCIA') redirect('/reportes');

  return <EfectividadCliente />;
}
