import { redirect } from 'next/navigation';
import HubGrid from '@/components/reportes/HubGrid';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

export const dynamic = 'force-dynamic';

export default async function ReportesPage() {
  const { user, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = (rolEfectivo ?? 'ANALISTA') as
    'COORDINADOR' | 'ANALISTA' | 'ANALISTA_RIESGO' | 'GERENCIA';

  return <HubGrid rol={rol} />;
}
