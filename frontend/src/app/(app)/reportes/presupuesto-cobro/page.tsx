import { redirect } from 'next/navigation';
import PresupuestoTabs from './presupuesto-tabs';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

export const dynamic = 'force-dynamic';

export default async function PresupuestoCobroPage() {
  const { user, perfil, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = rolEfectivo ?? 'ANALISTA';
  if (rol !== 'COORDINADOR' && rol !== 'GERENCIA') redirect('/reportes');

  const nombre = perfil?.nombre ?? user.email ?? '';
  const remitente = {
    nombre,
    puesto: 'Coordinador de Crédito y Cobro',
    telefono: perfil?.telefono ?? null,
    whatsapp: perfil?.whatsapp ?? null,
  };

  return (
    <PresupuestoTabs userEmail={user.email ?? ''} generadoPor={nombre} remitente={remitente} />
  );
}
