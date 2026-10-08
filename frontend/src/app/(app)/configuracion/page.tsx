import { redirect } from 'next/navigation';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import ConfigTabs, { type ConfigTabsData } from '@/components/configuracion/ConfigTabs';
import { getServerHttp } from '@/shared/api/server-http';
import type { ApiError } from '@/shared/api/api-error';
import { createConfiguracionApi } from '@/views/configuracion/api/configuracion-api';

// ══════════════════════════════════════════════════════════════════════
export default async function ConfiguracionPage() {
  // ── 1. Verificar sesión + rol COORDINADOR ─────────────────────────
  const { user, perfil } = await getUsuarioActual();
  if (!user?.email) redirect('/login');

  // Nota: usa el rol REAL (perfil.rol), no el rolEfectivo de "Ver como" --
  // Configuración es exclusiva del Coordinador real, sin excepción por
  // previsualización (a propósito, mismo comportamiento que antes).
  if (perfil?.rol !== 'COORDINADOR') {
    redirect('/dashboard');
  }

  // ── 2-12. Datos de la pantalla en una sola llamada (GET /configuracion) ──
  // Antes: 12 consultas en paralelo con service_role + armado aquí; ahora el backend
  // (solo COORDINADOR) devuelve ConfigTabsData ya procesado. Si falla solo el resumen de
  // automatizaciones, ese tab viene vacío sin tumbar los otros (igual que antes).
  let data: ConfigTabsData;
  try {
    data = await createConfiguracionApi(await getServerHttp()).pantalla();
  } catch (e) {
    return (
      <div className="p-5">
        <div className="bg-white rounded-2xl border border-red-200 p-5 text-sm text-red-700">
          No se pudo cargar Configuración: {(e as ApiError).message ?? 'error desconocido'}. Intente
          recargar la página.
        </div>
      </div>
    );
  }

  // ── 13. Render ────────────────────────────────────────────────────
  return (
    <div className="p-5">
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <ConfigTabs data={data} />
      </div>
    </div>
  );
}
