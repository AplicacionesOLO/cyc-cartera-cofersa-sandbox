import { getServerHttp } from '@/shared/api/server-http';
import { createReportesApi } from '@/views/reportes/api/reportes-api';
import { redirect } from 'next/navigation';
import GestionesPeriodoCliente from './gestiones-periodo-cliente';
import type { Gestion } from '@/types/database';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

// ── Tipos exportados para el componente cliente ───────────────────

export interface MetricasGestiones {
  total: number;
  porTipo: Record<string, number>;
  porResultado: Record<string, number>;
  promesasGeneradas: number;
  gestionesConExito: number; // resultado = 'Promesa OK' | 'Pagó' | 'Aceptó convenio'
}

// ── Página (Server Component) ────────────────────────────────────

export default async function GestionesPeriodoPage() {
  const { user, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  const rol = rolEfectivo ?? 'ANALISTA';
  // Reporte exclusivo de ANALISTA (registry.ts) -- allow-list explícito, no
  // solo excluir COORDINADOR (eso dejaba pasar a cualquier otro rol nuevo).
  if (rol !== 'ANALISTA') redirect('/reportes');

  // Período por defecto: mes en curso
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Traer gestiones del período por defecto
  let gestiones: Gestion[];
  try {
    gestiones = ((await createReportesApi(await getServerHttp()).gestionesPeriodo(
      inicioMes,
      finMes,
    )) ?? []) as Gestion[];
  } catch {
    return (
      <div className="px-5 py-5">
        <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
          <p className="text-red-600 text-sm font-semibold">
            Error al cargar tus gestiones del período. Intentá de nuevo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <GestionesPeriodoCliente
      gestionesIniciales={gestiones}
      inicioMesDefault={inicioMes}
      finMesDefault={finMes}
      userEmail={user.email!}
    />
  );
}
