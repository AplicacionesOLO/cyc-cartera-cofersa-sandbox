import { redirect } from 'next/navigation';
import IcpVendedorCliente from './icp-vendedor-cliente';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

export const dynamic = 'force-dynamic';

export default async function IcpVendedorPage() {
  const { user, perfil, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = rolEfectivo ?? 'ANALISTA';
  if (rol !== 'COORDINADOR' && rol !== 'GERENCIA') redirect('/reportes');

  const nombre = perfil?.nombre ?? user.email ?? '';

  return <IcpVendedorCliente generadoPor={nombre} />;
}
