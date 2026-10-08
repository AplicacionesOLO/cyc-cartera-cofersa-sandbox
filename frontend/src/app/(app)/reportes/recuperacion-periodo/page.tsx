import { redirect } from 'next/navigation';
import RecuperacionPeriodoCliente from '@/components/reportes/RecuperacionPeriodoCliente';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

export const dynamic = 'force-dynamic';

export default async function RecuperacionPeriodoPage() {
  const { user, perfil, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');
  const rol = rolEfectivo ?? 'ANALISTA';
  if (rol !== 'COORDINADOR' && rol !== 'GERENCIA') redirect('/reportes');
  return (
    <RecuperacionPeriodoCliente
      esAnalista={false}
      userEmail={null}
      generadoPor={perfil?.nombre ?? user.email ?? ''}
    />
  );
}
