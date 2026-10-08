import { redirect } from 'next/navigation';
import MoraVendedorCliente from './mora-vendedor-cliente';
import { displayRol } from '@/lib/utils/roles';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

export const dynamic = 'force-dynamic';

export default async function MoraVendedorPage() {
  const { user, perfil, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = rolEfectivo ?? 'ANALISTA';
  if (!['COORDINADOR', 'ANALISTA', 'GERENCIA'].includes(rol)) redirect('/reportes');

  const nombre = perfil?.nombre ?? user.email ?? '';
  const remitente = {
    nombre,
    puesto: displayRol(rol),
    telefono: perfil?.telefono ?? null,
    whatsapp: perfil?.whatsapp ?? null,
  };

  return (
    <MoraVendedorCliente
      generadoPor={nombre}
      remitente={remitente}
      userRol={rol as 'COORDINADOR' | 'ANALISTA' | 'GERENCIA'}
      userEmail={user.email ?? ''}
    />
  );
}
