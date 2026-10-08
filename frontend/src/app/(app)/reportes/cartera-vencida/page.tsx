import { getServerHttp } from '@/shared/api/server-http';
import { createReportesApi } from '@/views/reportes/api/reportes-api';
import type { CarteraVencidaRow } from '@/views/reportes/types';
import { redirect } from 'next/navigation';
import CarteraVencidaCliente from './cartera-vencida-cliente';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';

// ── Tipos de datos que maneja esta página ────────────────────────

export interface FilaCarteraVencida {
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  tramo_mayor: string; // e.g. "+120 días"
  monto_vencido: number; // suma de todos los tramos de mora
  dias_sin_gestion: number | null;
  ultima_gestion: string | null; // fecha ISO
}

// ── Helpers ──────────────────────────────────────────────────────

/** Tramo de mora más grave del cliente */
function tramoMayor(row: {
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number;
  mora_120_plus: number;
}): string {
  if (row.mora_120_plus > 0) return '+120 días';
  if (row.mora_91_120 > 0) return '91-120 días';
  if (row.mora_61_90 > 0) return '61-90 días';
  if (row.mora_31_60 > 0) return '31-60 días';
  if (row.mora_1_30 > 0) return '1-30 días';
  return 'Al día';
}

// ── Página (Server Component) ────────────────────────────────────

export default async function CarteraVencidaPage() {
  // Verificar sesión y rol
  const { user, rolEfectivo } = await getUsuarioActual();
  if (!user) redirect('/login');

  // Esta página es solo para ANALISTA -- allow-list explícito.
  const rol = rolEfectivo ?? 'ANALISTA';
  if (rol !== 'ANALISTA') redirect('/reportes');

  // 1-2. Cartera con mora > 0 de los clientes asignados al analista (maestro_clientes),
  // con la fecha de su última gestión (GET /reportes/cartera-vencida).
  type FilaCartera = CarteraVencidaRow;
  let cartera: FilaCartera[];
  try {
    cartera = (await createReportesApi(await getServerHttp()).carteraVencida()) ?? [];
  } catch {
    return (
      <div className="px-5 py-5">
        <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
          <p className="text-red-600 text-sm font-semibold">
            Error al cargar la cartera vencida. Intentá de nuevo.
          </p>
        </div>
      </div>
    );
  }

  if (cartera.length === 0) {
    return <CarteraVencidaCliente filas={[]} vendedores={[]} userEmail={user.email!} />;
  }

  // 3. Última gestión por cliente_cod (para días sin gestión) -- ya viene en cada fila
  const ultimaGestionMap: Record<string, string> = {};
  for (const g of cartera) {
    if (g.ultima_gestion) ultimaGestionMap[g.cliente_cod] = g.ultima_gestion;
  }

  const hoy = new Date();

  // 4. Construir filas finales
  const filas: FilaCarteraVencida[] = cartera.map((r) => {
    const moraTotal =
      (r.mora_1_30 ?? 0) +
      (r.mora_31_60 ?? 0) +
      (r.mora_61_90 ?? 0) +
      (r.mora_91_120 ?? 0) +
      (r.mora_120_plus ?? 0);

    const ultimaGestion = ultimaGestionMap[r.cliente_cod] ?? null;
    let diasSinGestion: number | null = null;
    if (ultimaGestion) {
      const diff = hoy.getTime() - new Date(ultimaGestion).getTime();
      diasSinGestion = Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    return {
      cliente_cod: r.cliente_cod,
      cliente_nombre: r.cliente_nombre,
      vendedor_nombre: r.vendedor_nombre,
      tramo_mayor: tramoMayor(r),
      monto_vencido: moraTotal,
      dias_sin_gestion: diasSinGestion,
      ultima_gestion: ultimaGestion,
    };
  });

  // Lista única de vendedores para el filtro
  const vendedores = [...new Set(filas.map((f) => f.vendedor_nombre).filter(Boolean))].sort();

  return <CarteraVencidaCliente filas={filas} vendedores={vendedores} userEmail={user.email!} />;
}
