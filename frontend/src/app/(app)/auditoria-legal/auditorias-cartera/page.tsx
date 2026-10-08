import { redirect } from 'next/navigation';
import ProximamenteTab from '@/components/auditoria-legal/ProximamenteTab';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

export const dynamic = 'force-dynamic';

export default async function AuditoriasCarteraPage() {
  const { user, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  // Mismo gate que /auditoria-legal/garantias: el módulo no está disponible para
  // ANALISTA_RIESGO (CLAUDE.md §2.2). Se pone desde ya, aunque esta pantalla
  // todavía no muestre datos, para que la Fase 2 no tenga que recordarlo.
  const rol = rolEfectivo ?? 'ANALISTA';
  if (rol === 'ANALISTA_RIESGO') redirect('/dashboard');

  return <ProximamenteTab titulo="Auditorías de Cartera" />;
}
