import { redirect } from 'next/navigation';
import Sidebar from '@/components/sidebar';
import Topbar from '@/components/topbar';
import VerComoBanner from '@/components/ver-como-banner';
import ClientWrapper from '@/components/layout/client-wrapper';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import type { Usuario, Notificacion } from '@/types/database';

// Sidebar recibe `notificaciones` en su firma de props pero no la usa en
// ningún lado del componente (confirmado ago 2026) -- no se toca sidebar.tsx
// (regla del proyecto), solo se le deja de pedir el dato real.
const NOTIFICACIONES_SIDEBAR_NO_USADAS: Notificacion[] = [];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Perfil del usuario — SOLO emails registrados y activos en `usuarios`.
  // Sin fila en usuarios NO hay acceso: autenticarse con una cuenta Google
  // corporativa no basta (incidente 15/07/2026 — un jefe regional entró y el
  // fallback anterior le pintaba la interfaz de COORDINADOR).
  //
  // Perf (ago 2026): auth.getUser() + el perfil + el rol efectivo ahora
  // vienen de getUsuarioActual() (React.cache()) -- este layout corre en
  // CADA navegación de toda la app, y cada page.tsx hijo volvía a repetir
  // exactamente esta misma resolución por su cuenta (ver usuario-actual.ts).
  // Notificaciones ya no se cargan acá -- Topbar las trae del lado del
  // cliente al montar (ver components/topbar.tsx), porque el Server
  // Component se re-ejecuta en cada navegación pero Topbar persiste montado
  // y nunca resincronizaba esa prop, así que la query se desperdiciaba.
  // totalEquipo y última sincronización vienen en la misma respuesta de GET /me
  // (antes eran 2 consultas cacheadas con unstable_cache).
  const {
    user,
    perfil,
    rolEfectivo: rolEfectivoRaw,
    totalEquipo,
    ultimaSync,
    error,
  } = await getUsuarioActual();
  if (!user) redirect('/login');
  if (error) {
    return (
      <div
        className="flex h-screen items-center justify-center p-6"
        style={{ background: '#EEF2F7' }}
      >
        <div className="max-w-md rounded-xl border border-red-200 bg-white px-6 py-5 text-sm text-red-700 shadow">
          No se pudo cargar su perfil del SIC: {error}. Recargue la página en unos segundos.
        </div>
      </div>
    );
  }
  if (!perfil) redirect('/auth/denegado');
  const usuarioId = perfil.id;

  // "Ver como" -- solo Coordinador puede previsualizar otro rol; el resto
  // siempre ve su propio rol real, sin excepción (ver lib/utils/ver-como.ts).
  const rolEfectivo = rolEfectivoRaw ?? perfil.rol;
  const previsualizando = rolEfectivo !== perfil.rol;
  const perfilParaSidebar = previsualizando
    ? { ...perfil, rol: rolEfectivo as Usuario['rol'] }
    : perfil;

  // Avatar URL desde el IdP (claim picture del token de Cognito/Google)
  const avatarUrl: string | null = user.user_metadata?.avatar_url ?? null;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#EEF2F7' }}>
      <Sidebar
        usuario={perfilParaSidebar}
        notificaciones={NOTIFICACIONES_SIDEBAR_NO_USADAS}
        usuarioId={usuarioId}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {previsualizando && <VerComoBanner rolPreview={rolEfectivo} />}
        <Topbar
          ultimaSync={ultimaSync}
          usuarioId={usuarioId}
          nombre={perfil.nombre}
          iniciales={perfil.iniciales}
          color={perfil.color}
          avatarUrl={avatarUrl}
          rol={rolEfectivo}
          rolReal={perfil.rol}
          verComoActivo={previsualizando ? rolEfectivo : null}
        />
        <main className="flex-1 overflow-y-auto">
          <ClientWrapper
            usuarioId={usuarioId}
            nombre={perfil.nombre}
            iniciales={perfil.iniciales}
            color={perfil.color}
            totalEquipo={totalEquipo}
          >
            {children}
          </ClientWrapper>
        </main>
        <footer
          className="text-center shrink-0"
          style={{ fontSize: '11px', fontWeight: 400, color: '#94a3b8', padding: '5px 0' }}
        >
          SIC — Sistema Inteligente de Cobranza · Cofersa © 2026
        </footer>
      </div>
    </div>
  );
}
