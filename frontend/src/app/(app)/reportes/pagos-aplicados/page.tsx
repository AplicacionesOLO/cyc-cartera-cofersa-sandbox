import { redirect } from 'next/navigation';
import { esSoloLectura } from '@/lib/utils/roles';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import PagosAplicadosCliente from '@/components/analisis-pagos/PagosAplicadosCliente';

export const dynamic = 'force-dynamic';

export default async function PagosAplicadosReportePage() {
  const { user, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  // Reporte de control: COORDINADOR (gestiona) y GERENCIA (solo lectura, supervisión)
  const rol = rolEfectivo ?? '';
  if (rol !== 'COORDINADOR' && rol !== 'GERENCIA') redirect('/reportes');

  return <PagosAplicadosCliente soloLectura={esSoloLectura(rol)} />;
}
