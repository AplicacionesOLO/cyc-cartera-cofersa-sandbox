import { redirect } from 'next/navigation';
import PlazoEspecialCliente from './plazo-especial-cliente';
import { displayRol } from '@/lib/utils/roles';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

export const dynamic = 'force-dynamic';

export default async function FacturasPlazoEspecialPage() {
  const { user, perfil, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = rolEfectivo ?? 'ANALISTA';

  // COORDINADOR, ANALISTA y GERENCIA (solo lectura) pueden ver este reporte
  if (!['COORDINADOR', 'ANALISTA', 'GERENCIA'].includes(rol)) redirect('/reportes');

  const remitente = {
    nombre: perfil?.nombre ?? user.email ?? '',
    puesto: displayRol(rol),
    telefono: perfil?.telefono ?? null,
    whatsapp: perfil?.whatsapp ?? null,
  };

  return (
    <PlazoEspecialCliente
      remitente={remitente}
      userRol={rol as 'COORDINADOR' | 'ANALISTA' | 'GERENCIA'}
      userEmail={user.email ?? ''}
    />
  );
}
