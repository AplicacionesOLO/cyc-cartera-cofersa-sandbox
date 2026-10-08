import { redirect } from 'next/navigation';
import AnalisisPagosTabs from '@/components/analisis-pagos/AnalisisPagosTabs';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import { puedeGestionarCartera } from '@/lib/utils/roles';

export const dynamic = 'force-dynamic';

export default async function AnalisisPagosPage() {
  const { user, userEmail, perfil, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = rolEfectivo ?? 'ANALISTA';
  // ANALISTA_RIESGO con tiene_cartera_asignada=true (sep 2026) se acota igual que ANALISTA.
  const esAnalista = puedeGestionarCartera({
    rol,
    tiene_cartera_asignada: perfil?.tiene_cartera_asignada,
  });

  return <AnalisisPagosTabs userEmail={userEmail} esAnalista={esAnalista} />;
}
