'use client';

import { useDashboardReloadController } from '../hooks/use-dashboard-reload-controller';

/** Mensaje visible cuando falla GET /dashboard/* (nunca pantalla en blanco). */
export function DashboardError({ mensaje }: { mensaje?: string }) {
  const { reloading, reload } = useDashboardReloadController();
  return (
    <div className="min-h-full" style={{ background: '#EEF2F7' }}>
      <div className="px-6 pt-5 pb-6">
        <div className="bg-white rounded-xl border border-red-200 p-6 text-sm text-red-700">
          No se pudo cargar el dashboard: {mensaje ?? 'error desconocido'}. Intente recargar la
          página.
          <button
            onClick={reload}
            disabled={reloading}
            className="ml-3 rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold hover:bg-red-50 disabled:opacity-60"
          >
            {reloading ? 'Reintentando...' : 'Reintentar'}
          </button>
        </div>
      </div>
    </div>
  );
}
