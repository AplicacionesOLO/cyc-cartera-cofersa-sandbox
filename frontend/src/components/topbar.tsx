'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  ClipboardList,
  Handshake,
  AlertTriangle,
  RefreshCwIcon,
  Info,
  ChevronDown,
  User,
  LogOut,
  PackageSearch,
  Scale,
} from 'lucide-react';
import { signOutUser } from '@/shared/auth/cognito-auth';
import { useNotificacionesController } from '@/views/notificaciones/hooks/use-notificaciones-controller';
import { useVerComoController } from '@/views/identidad/hooks/use-ver-como-controller';
import type { Notificacion, TipoNotif } from '@/types/database';
import BuscadorGlobal from '@/components/BuscadorGlobal';
import ModalMiPerfil from '@/components/ModalMiPerfil';
import TipoCambioTopbar from '@/components/tipo-cambio-topbar';
import { displayRol, ROL_OPCIONES } from '@/lib/utils/roles';
import { ROLES_PREVIEW_VALIDOS } from '@/lib/utils/ver-como-constants';

// ── Etiquetas de página ────────────────────────────────────────────
const PAGE_LABELS: Record<string, { title: string; sub: string }> = {
  '/dashboard': { title: 'Dashboard', sub: 'Resumen ejecutivo de cartera' },
  '/mi-cartera': { title: 'Mi Cartera', sub: 'Tu cartera asignada' },
  '/clientes': { title: 'Clientes', sub: 'Gestión de clientes' },
  '/gestiones': { title: 'Gestiones', sub: 'Registro de cobros' },
  '/promesas': { title: 'Promesas', sub: 'Seguimiento de compromisos de pago' },
  '/solicitudes': { title: 'Solicitudes', sub: 'Flujo de aprobaciones internas' },
  '/gestion-cartera/saldos-favor': {
    title: 'Saldos a Favor',
    sub: 'Documentos pendientes de aplicar en cartera',
  },
  '/gestion-cartera/pedidos-retenidos': {
    title: 'Pedidos Retenidos',
    sub: 'Motor recomendador por ICP y aging, para aprobar o retener',
  },
  '/auditoria-legal/garantias': {
    title: 'Control y Custodia de Garantías',
    sub: 'Inventario de pagarés y letras de cambio, y su custodia física',
  },
  '/auditoria-legal/auditorias-cartera': {
    title: 'Auditorías de Cartera',
    sub: 'Confirmación de saldos y muestreos por zona o vendedor',
  },
  '/auditoria-legal/cobertura': {
    title: 'Balance de Cobertura y Riesgo',
    sub: 'Cartera garantizada vs. exposición desprotegida',
  },
  '/equipo': { title: 'Mi Equipo', sub: 'Rendimiento del equipo de cobro' },
  '/reportes/presupuesto': { title: 'Presupuesto de Cobro', sub: 'Metas de recaudo asignadas' },
  '/reportes/cartera-vencida': { title: 'Cartera Vencida', sub: 'Clientes con mora activa' },
  '/reportes/gestiones-periodo': {
    title: 'Gestiones del Período',
    sub: 'Actividad de cobro por rango de fechas',
  },
  '/reportes/presupuesto-cobro': {
    title: 'Presupuesto de Cobro',
    sub: 'Meta del mes, recuperación y proyección de caja',
  },
  '/reportes/resumen-ejecutivo': {
    title: 'Resumen Ejecutivo',
    sub: 'Cartera, mora, DSO y concentración',
  },
  '/reportes/migracion-mora': {
    title: 'Matriz de Migración de Mora',
    sub: 'Roll rates entre tramos y proyección de pérdida',
  },
  '/reportes/mora-vendedor': {
    title: 'Mora por Vendedor y Clientes Bloqueados',
    sub: 'Mora por tramos y control de bloqueados, por vendedor',
  },
  '/reportes/estados-cuenta': {
    title: 'Estados de Cuenta',
    sub: 'Enviar o descargar estados de cuenta por cliente',
  },
  '/reportes/facturas-plazo-especial': {
    title: 'Facturas con Plazo Especial',
    sub: 'Envío al vendedor con copia al supervisor',
  },
  '/reportes/aging-consolidado': {
    title: 'Aging Consolidado',
    sub: 'Antigüedad de la cartera por tramos',
  },
  '/reportes/cei': {
    title: 'Índice de Efectividad de Cobro (CEI)',
    sub: 'Cobrado del mes vs saldo vencido, por supervisor y vendedor',
  },
  '/reportes/recuperacion-periodo': {
    title: 'Recuperación del Período',
    sub: 'Recaudo por rango de fechas, por analista o vendedor',
  },
  '/reportes/pagos-aplicados': {
    title: 'Pagos Aplicados del Mes',
    sub: 'Recibos del mes para contraste contra Softland',
  },
  '/reportes/efectividad-gestiones': {
    title: 'Efectividad de Gestiones',
    sub: 'Actividad del equipo: gestiones, canales y compromisos de pago',
  },
  '/reportes/mi-recuperacion': {
    title: 'Recuperación de mi cartera',
    sub: 'Cuánto han pagado tus clientes en el período',
  },
  '/reportes/icp-vendedor': {
    title: 'Comportamiento por Vendedor',
    sub: 'ICP y puntualidad de pago por vendedor',
  },
  '/reportes/cierre-mensual': {
    title: 'Resumen de Cierre Mensual',
    sub: 'Lámina ejecutiva para la reunión general de ventas',
  },
  '/reportes': { title: 'Hub de Reportes', sub: 'Reportes operativos, comerciales y ejecutivos' },
  '/configuracion': { title: 'Configuración', sub: 'Parámetros del sistema' },
  '/centro-recursos': {
    title: 'Centro de Recursos',
    sub: 'Estructura comercial, documentos oficiales y herramientas',
  },
  '/gestion-pagos/pagos-aplicados': {
    title: 'Pagos Aplicados',
    sub: 'Historial de pagos confirmados',
  },
  '/gestion-pagos/pagos-pendientes': {
    title: 'Pagos Pendientes',
    sub: 'Compromisos aún no confirmados',
  },
  '/gestion-pagos/analisis': {
    title: 'Análisis de Pagos',
    sub: 'Tendencias y comportamiento de pago',
  },
  '/bandeja-pagos': { title: 'Bandeja de Pagos', sub: 'Conciliación y caja — próximamente' },
  '/recibos-ruta': { title: 'Recibos en Ruta', sub: 'Conciliación y caja — próximamente' },
};

// ── Config visual por tipo de notificación ────────────────────────
const TIPO_CFG: Record<TipoNotif, { icon: React.ReactNode; color: string; bg: string }> = {
  SOLICITUD: { icon: <ClipboardList size={13} />, color: '#009ee3', bg: '#e0f2fe' },
  PROMESA: { icon: <Handshake size={13} />, color: '#f59e0b', bg: '#fef9c3' },
  ALERTA: { icon: <AlertTriangle size={13} />, color: '#dc2626', bg: '#fee2e2' },
  SYNC: { icon: <RefreshCwIcon size={13} />, color: '#22c55e', bg: '#dcfce7' },
  PEDIDO_RETENIDO: { icon: <PackageSearch size={13} />, color: '#ea580c', bg: '#ffedd5' },
  GARANTIA: { icon: <Scale size={13} />, color: '#003B5C', bg: '#e2e8f0' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

// ── Trunca nombre a "Nombre Apellido" (máx 2 palabras) ────────────
function nombreCorto(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return partes.slice(0, 2).join(' ');
}

// ── Formatea ISO UTC → "DD/MM/YYYY · H:MM AM/PM" en hora CR (UTC-6) ──
function fmtSync(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 60 * 60 * 1000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = d.getUTCFullYear();
  const h = d.getUTCHours();
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} · ${h % 12 || 12}:${mi} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ── Props ─────────────────────────────────────────────────────────
interface TopbarProps {
  ultimaSync?: string; // ISO UTC — updated_at más reciente de cartera
  usuarioId: string;
  // Chip de usuario
  nombre: string;
  iniciales: string;
  color: string;
  avatarUrl?: string | null;
  rol: string; // rol EFECTIVO (real, o el previsualizado si aplica) -- usado para Buscador/gating
  rolReal: string; // rol REAL en `usuarios` -- usado para identidad y para decidir si mostrar "Ver como"
  verComoActivo: string | null; // rol que se está previsualizando ahora mismo, o null
}

// ── Componente ────────────────────────────────────────────────────
export default function Topbar({
  ultimaSync,
  usuarioId,
  nombre,
  iniciales,
  color,
  avatarUrl,
  rol,
  rolReal,
  verComoActivo,
}: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Título de página — busca la ruta más específica primero
  const match = Object.entries(PAGE_LABELS)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([key]) => pathname.startsWith(key));
  const page = match?.[1] ?? { title: 'SIC', sub: 'Sistema Inteligente de Cobranza' };

  // ── Estado: dropdown notificaciones ──────────────────────────
  const [notiOpen, setNotiOpen] = useState(false);
  const { notis, marcarLeida, marcarTodas } = useNotificacionesController(usuarioId);
  const notiRef = useRef<HTMLDivElement>(null);
  const noLeidas = notis.filter((n) => !n.leida).length;

  // Tab activo para filtrar notificaciones
  type TabNotif = 'todas' | TipoNotif;
  const [tabNotif, setTabNotif] = useState<TabNotif>('todas');

  // Notificaciones filtradas según tab activo
  const notisFiltradas = tabNotif === 'todas' ? notis : notis.filter((n) => n.tipo === tabNotif);

  // ── Estado: dropdown usuario ──────────────────────────────────
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const [perfilOpen, setPerfilOpen] = useState(false);

  // ── "Ver como" (solo Coordinador) ──────────────────────────────
  // (cookie + router.refresh() viven en el controller; el backend valida que el rol real sea COORDINADOR)
  const { loading: cambiandoVista, cambiar: cambiarVista } = useVerComoController();
  async function verComo(rolElegido: string | null) {
    await cambiarVista(rolElegido);
    setUserOpen(false);
  }

  // ── Estado: error de avatar ───────────────────────────────────
  const [avatarErr, setAvatarErr] = useState(false);

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notiRef.current && !notiRef.current.contains(e.target as Node)) setNotiOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Notificaciones: carga inicial + refresco periódico ──────────────
  // Perf (ago 2026): Topbar persiste montado entre navegaciones, así que se
  // cargan una sola vez acá, al montar. El canal Realtime (postgres_changes)
  // del origen se reemplazó por polling cada 60 s + al volver a enfocar la
  // ventana (useNotificacionesController); marcar leída/todas sigue siendo
  // optimista.

  // ── Click en notificación ─────────────────────────────────────
  async function handleNotiClick(n: Notificacion) {
    if (!n.leida) await marcarLeida(n.id);
    if (n.link) {
      setNotiOpen(false);
      router.push(n.link);
    }
  }

  // ── Cerrar sesión ─────────────────────────────────────────────
  async function handleLogout() {
    await signOutUser();
    router.push('/login');
  }

  // Determinar si mostrar foto o iniciales
  const showAvatar = Boolean(avatarUrl) && !avatarErr;

  return (
    <header
      className="flex items-center justify-between px-6 flex-shrink-0"
      style={{ height: '52px', background: 'white', borderBottom: '1px solid #E2E8F0' }}
    >
      {/* ── Título de página ─────────────────────────────────── */}
      <div>
        <h1 className="font-bold text-gray-900 leading-tight" style={{ fontSize: '18px' }}>
          {page.title}
        </h1>
        <p className="text-gray-400 leading-tight" style={{ fontSize: '12px' }}>
          {page.sub}
        </p>
      </div>

      {/* ── Derecha ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Buscador global */}
        <BuscadorGlobal rol={rol} />

        {/* Chip de sincronización */}
        <div
          className="hidden sm:flex items-center gap-1.5 rounded-lg px-2.5 py-1"
          style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}
          title="Última sincronización con Softland"
        >
          <div
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: '#16a34a' }}
          />
          <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 600 }}>
            {ultimaSync ? fmtSync(ultimaSync) : 'Sin datos aún'}
          </span>
        </div>

        {/* Tipo de cambio */}
        <TipoCambioTopbar />

        <div className="hidden sm:block w-px h-5 bg-gray-100" />

        {/* ── Campana de notificaciones ────────────────────── */}
        <div className="relative" ref={notiRef}>
          <button
            onClick={() => {
              setNotiOpen((v) => !v);
              setUserOpen(false);
            }}
            className="relative flex items-center justify-center rounded-lg hover:bg-gray-50 transition-colors"
            style={{ width: '34px', height: '34px', color: notiOpen ? '#009ee3' : '#64748b' }}
            title={noLeidas > 0 ? `${noLeidas} notificaciones sin leer` : 'Notificaciones'}
          >
            <Bell size={18} />
            {noLeidas > 0 && (
              <span
                className="absolute top-0 right-0 flex items-center justify-center rounded-full text-white font-black"
                style={{
                  background: '#dc2626',
                  fontSize: '9px',
                  minWidth: '15px',
                  height: '15px',
                  padding: '0 3px',
                  lineHeight: 1,
                }}
              >
                {noLeidas > 99 ? '99+' : noLeidas}
              </span>
            )}
          </button>

          {/* Dropdown notificaciones */}
          {notiOpen && (
            <div
              className="absolute right-0 mt-2 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{
                width: '340px',
                maxHeight: '480px',
                border: '1px solid #e2e8f0',
                zIndex: 100,
                top: '100%',
              }}
            >
              <div
                className="flex items-center justify-between px-4 py-3 flex-shrink-0"
                style={{ borderBottom: '1px solid #f1f5f9' }}
              >
                <div className="flex items-center gap-2">
                  <Bell size={14} className="text-gray-500" />
                  <span className="text-sm font-bold text-gray-800">Notificaciones</span>
                  {noLeidas > 0 && (
                    <span
                      className="text-[10px] font-black rounded-full px-1.5 py-0.5"
                      style={{ backgroundColor: '#dc2626', color: 'white' }}
                    >
                      {noLeidas}
                    </span>
                  )}
                </div>
                {noLeidas > 0 && (
                  <button
                    onClick={marcarTodas}
                    className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-gray-600 transition"
                  >
                    <CheckCheck size={12} />
                    Marcar todo
                  </button>
                )}
              </div>

              {/* Tabs de filtro */}
              <div
                className="flex gap-1 px-3 py-2 flex-shrink-0"
                style={{ borderBottom: '1px solid #f1f5f9' }}
              >
                {(
                  [
                    { key: 'todas', label: 'Todas' },
                    { key: 'PROMESA', label: 'Promesas' },
                    { key: 'ALERTA', label: 'Alertas' },
                    { key: 'SOLICITUD', label: 'Solicitudes' },
                    { key: 'PEDIDO_RETENIDO', label: 'Pedidos' },
                  ] as { key: TabNotif; label: string }[]
                ).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTabNotif(t.key)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors"
                    style={{
                      background: tabNotif === t.key ? 'rgba(0,158,227,0.12)' : 'transparent',
                      color: tabNotif === t.key ? '#009ee3' : '#94a3b8',
                    }}
                  >
                    {t.label}
                    {t.key !== 'todas' && (
                      <span className="ml-1" style={{ opacity: 0.7 }}>
                        {notis.filter((n) => n.tipo === t.key && !n.leida).length || ''}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="overflow-y-auto flex-1">
                {notisFiltradas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center mb-3"
                      style={{ backgroundColor: '#f1f5f9' }}
                    >
                      <Bell size={18} className="text-gray-300" />
                    </div>
                    <p className="text-[13px] font-semibold text-gray-500">
                      Sin notificaciones nuevas
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">Todo al día por ahora.</p>
                  </div>
                ) : (
                  notisFiltradas.map((n, i) => {
                    const cfg = TIPO_CFG[n.tipo] ?? {
                      icon: <Info size={13} />,
                      color: '#64748b',
                      bg: '#f1f5f9',
                    };
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleNotiClick(n)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left transition hover:bg-gray-50"
                        style={{
                          borderBottom:
                            i < notisFiltradas.length - 1 ? '1px solid #f8fafc' : 'none',
                          backgroundColor: n.leida ? 'transparent' : '#f8fbff',
                        }}
                      >
                        <div
                          className="flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5"
                          style={{
                            width: '28px',
                            height: '28px',
                            backgroundColor: cfg.bg,
                            color: cfg.color,
                          }}
                        >
                          {cfg.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-[12px] leading-snug"
                            style={{
                              fontWeight: n.leida ? 500 : 700,
                              color: n.leida ? '#64748b' : '#1e293b',
                            }}
                          >
                            {n.titulo}
                          </p>
                          {n.mensaje && (
                            <p className="text-[11px] text-gray-400 mt-0.5 leading-snug line-clamp-2">
                              {n.mensaje}
                            </p>
                          )}
                          <p className="text-[10px] text-gray-300 mt-1 font-medium">
                            {timeAgo(n.created_at)}
                          </p>
                        </div>
                        {!n.leida && (
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                            style={{ backgroundColor: '#009ee3' }}
                          />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Separador */}
        <div className="w-px h-5 bg-gray-100" />

        {/* ── Chip de usuario ──────────────────────────────── */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => {
              setUserOpen((v) => !v);
              setNotiOpen(false);
            }}
            className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-gray-50"
            style={{ border: '1px solid #E2E8F0' }}
          >
            {/* Avatar */}
            {showAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl!}
                alt={nombre}
                onError={() => setAvatarErr(true)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                className="flex items-center justify-center rounded-full text-white font-bold flex-shrink-0"
                style={{ width: '28px', height: '28px', backgroundColor: color, fontSize: '11px' }}
              >
                {iniciales}
              </div>
            )}

            {/* Nombre */}
            <span
              className="hidden sm:block font-semibold text-gray-700 leading-none"
              style={{
                fontSize: '12px',
                maxWidth: '120px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {nombreCorto(nombre)}
            </span>

            {/* Chevron */}
            <ChevronDown
              size={13}
              className="text-gray-400 flex-shrink-0 transition-transform"
              style={{ transform: userOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>

          {/* Dropdown usuario */}
          {userOpen && (
            <div
              className="absolute right-0 mt-2 bg-white rounded-xl shadow-xl overflow-hidden"
              style={{
                width: '256px',
                border: '1px solid #e2e8f0',
                zIndex: 100,
                top: '100%',
              }}
            >
              {/* Cabecera del dropdown */}
              <div
                className="px-4 py-3 flex items-center gap-2.5"
                style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}
              >
                {showAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl!}
                    alt={nombre}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    className="flex items-center justify-center rounded-full text-white font-bold flex-shrink-0"
                    style={{
                      width: '36px',
                      height: '36px',
                      backgroundColor: color,
                      fontSize: '13px',
                    }}
                  >
                    {iniciales}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-gray-800 truncate">{nombre}</p>
                  <p className="text-[11px] text-gray-600 leading-snug">{displayRol(rolReal)}</p>
                </div>
              </div>

              {/* "Ver como" -- solo Coordinador. Tu rol real nunca cambia, esto
                  solo previsualiza cómo se ve el SIC con otro rol (ver banner). */}
              {rolReal === 'COORDINADOR' && (
                <>
                  <div className="px-4 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Ver como
                  </div>
                  {[
                    { value: 'COORDINADOR', label: 'Coordinador (yo)' },
                    ...ROL_OPCIONES.filter((o) =>
                      (ROLES_PREVIEW_VALIDOS as readonly string[]).includes(o.value),
                    ),
                  ].map((opt) => {
                    const activo = (verComoActivo ?? 'COORDINADOR') === opt.value;
                    return (
                      <button
                        key={opt.value}
                        disabled={cambiandoVista}
                        onClick={() => verComo(opt.value === 'COORDINADOR' ? null : opt.value)}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-gray-50 disabled:opacity-50"
                        style={{
                          fontSize: '12.5px',
                          color: activo ? '#003B5C' : '#374151',
                          fontWeight: activo ? 700 : 500,
                        }}
                      >
                        <span
                          className="flex-shrink-0 rounded-full"
                          style={{
                            width: 8,
                            height: 8,
                            border: `1.5px solid ${activo ? '#009ee3' : '#cbd5e1'}`,
                            background: activo ? '#009ee3' : 'transparent',
                          }}
                        />
                        {opt.value === 'COORDINADOR' ? 'Coordinador (yo)' : opt.label}
                      </button>
                    );
                  })}
                  <p className="px-4 pb-2 pt-0.5 text-[10px] text-gray-400 leading-snug">
                    Solo vos ves esto — tu rol real nunca cambia.
                  </p>
                  <div style={{ height: '1px', background: '#f1f5f9' }} />
                </>
              )}

              {/* Mi perfil */}
              <button
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-gray-50"
                style={{ color: '#374151', fontSize: '13px' }}
                onClick={() => {
                  setUserOpen(false);
                  setPerfilOpen(true);
                }}
              >
                <User size={14} className="text-gray-400 flex-shrink-0" />
                <span className="font-medium">Mi perfil</span>
              </button>

              <div style={{ height: '1px', background: '#f1f5f9' }} />

              {/* Cerrar sesión */}
              <button
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-red-50"
                style={{ color: '#dc2626', fontSize: '13px' }}
                onClick={handleLogout}
              >
                <LogOut size={14} className="flex-shrink-0" />
                <span className="font-medium">Cerrar sesión</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {perfilOpen && (
        <ModalMiPerfil
          nombre={nombre}
          rol={displayRol(rolReal)}
          iniciales={iniciales}
          color={color}
          avatarUrl={showAvatar ? avatarUrl : null}
          onClose={() => setPerfilOpen(false)}
        />
      )}
    </header>
  );
}
