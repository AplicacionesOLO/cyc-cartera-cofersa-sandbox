import { redirect } from 'next/navigation';
import GarantiasCliente from './garantias-cliente';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

export const dynamic = 'force-dynamic';

export default async function GarantiasPage() {
  const { user, userEmail, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = (rolEfectivo ?? 'ANALISTA') as
    'COORDINADOR' | 'ANALISTA' | 'ANALISTA_RIESGO' | 'GERENCIA';
  // Auditoría y Control Legal no está disponible para ANALISTA_RIESGO (CLAUDE.md §2.2).
  if (rol === 'ANALISTA_RIESGO') redirect('/dashboard');

  return <GarantiasCliente userRol={rol} userEmail={userEmail} />;
}
