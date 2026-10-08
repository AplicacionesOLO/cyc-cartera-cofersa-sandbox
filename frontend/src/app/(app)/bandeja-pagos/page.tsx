import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import { redirect } from 'next/navigation';
import { Inbox } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function BandejaPagosPage() {
  const { user } = await getUsuarioActual();
  if (!user) redirect('/login');

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div
        className="flex flex-col items-center justify-center text-center px-5"
        style={{ paddingTop: '15vh' }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'rgba(0,59,92,0.08)' }}
        >
          <Inbox size={26} style={{ color: '#003B5C' }} />
        </div>
        <h1 className="text-lg font-semibold text-gray-800">Bandeja de Pagos</h1>
        <p className="text-sm text-gray-400 mt-1 max-w-sm">
          Este módulo de conciliación y caja está en construcción. Próximamente disponible.
        </p>
      </div>
    </div>
  );
}
