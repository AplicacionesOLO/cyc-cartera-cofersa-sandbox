import { redirect } from 'next/navigation';
import MigracionCliente from './migracion-cliente';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

export const dynamic = 'force-dynamic';

export default async function MigracionMoraPage() {
  const { user, perfil, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = rolEfectivo ?? 'ANALISTA';
  if (rol !== 'COORDINADOR' && rol !== 'GERENCIA') redirect('/reportes');

  return <MigracionCliente generadoPor={perfil?.nombre ?? user.email ?? ''} />;
}
