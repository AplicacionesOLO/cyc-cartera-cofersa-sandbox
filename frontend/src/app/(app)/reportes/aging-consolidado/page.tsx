import { redirect } from 'next/navigation';
import AgingCliente from './aging-cliente';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

export const dynamic = 'force-dynamic';

export default async function AgingPage() {
  const { user, perfil, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');
  const rol = rolEfectivo ?? 'ANALISTA';
  if (rol !== 'COORDINADOR' && rol !== 'GERENCIA') redirect('/reportes');
  return <AgingCliente generadoPor={perfil?.nombre ?? user.email ?? ''} />;
}
