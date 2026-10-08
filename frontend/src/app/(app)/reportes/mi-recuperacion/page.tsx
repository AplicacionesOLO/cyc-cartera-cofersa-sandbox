import { redirect } from 'next/navigation';
import RecuperacionPeriodoCliente from '@/components/reportes/RecuperacionPeriodoCliente';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

export const dynamic = 'force-dynamic';

export default async function MiRecuperacionPage() {
  const { user, perfil } = await getUsuarioActual();
  if (!user) redirect('/login');
  const nombre = perfil?.nombre ?? user.email ?? '';
  return (
    <RecuperacionPeriodoCliente esAnalista userEmail={user.email ?? ''} generadoPor={nombre} />
  );
}
