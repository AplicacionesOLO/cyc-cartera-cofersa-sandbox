import { redirect } from 'next/navigation';
import CeiCliente from './cei-cliente';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

export const dynamic = 'force-dynamic';

export default async function CeiPage() {
  const { user, perfil, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = rolEfectivo ?? 'ANALISTA';
  if (rol !== 'COORDINADOR' && rol !== 'GERENCIA') redirect('/reportes');

  return <CeiCliente generadoPor={perfil?.nombre ?? user.email ?? ''} />;
}
