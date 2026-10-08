'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Handshake,
  Activity,
  ScrollText,
  Coins,
  Package,
  PieChart,
  BarChart3,
  Settings,
  Wallet,
  LineChart,
  ChevronDown,
  CircleDollarSign,
  Inbox,
  Receipt,
  PanelLeftClose,
  PanelLeftOpen,
  Folder,
  PackageSearch,
  Scale,
  FileSignature,
  ClipboardCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Usuario, Notificacion } from '@/types/database';

// ── Tipos ─────────────────────────────────────────────────────────
type Rol = 'COORDINADOR' | 'ANALISTA' | 'ANALISTA_RIESGO' | 'GERENCIA';

export interface BadgeCounts {
  gestionesHoy?: number;
  promesasVencidas?: number;
  solicitudesPendientes?: number;
}

interface NavItem {
  label: string;
  href: string;
  roles: Rol[];
  icon: React.ReactNode;
  badgeKey?: keyof BadgeCounts;
}

interface NavCategory {
  label: string;
  icon: React.ReactNode;
  roles: Rol[];
  items: NavItem[];
  /**
   * Exclusiva de ANALISTA_RIESGO *sin* cartera propia (sep 2026). Un
   * ANALISTA_RIESGO con `tiene_cartera_asignada=true` (caso Jossmin) ya ve
   * Dashboard/Clientes/Reportes/Centro de Recursos por las categorías
   * normales de ANALISTA -- mantener esta también sería duplicado.
   */
  soloRiesgoSinCartera?: boolean;
}

// ── Accesos raíz (sin categoría, arriba) ──────────────────────────
const ROOT_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: <LayoutDashboard size={16} />,
    roles: ['COORDINADOR', 'ANALISTA', 'GERENCIA'],
  },
  { label: 'Mi Cartera', href: '/mi-cartera', icon: <Package size={16} />, roles: ['ANALISTA'] },
];

// ── Categorías ────────────────────────────────────────────────────
const CATEGORIES: NavCategory[] = [
  {
    label: 'Gestión de Cartera',
    icon: <Wallet size={13} />,
    roles: ['COORDINADOR', 'ANALISTA', 'GERENCIA'],
    items: [
      {
        label: 'Clientes',
        href: '/clientes',
        icon: <Users size={16} />,
        roles: ['COORDINADOR', 'ANALISTA', 'GERENCIA'],
      },
      {
        label: 'Gestiones',
        href: '/gestiones',
        icon: <Activity size={16} />,
        roles: ['COORDINADOR', 'ANALISTA'],
      },
      {
        label: 'Promesas',
        href: '/promesas',
        icon: <Handshake size={16} />,
        roles: ['COORDINADOR', 'ANALISTA'],
      },
      {
        label: 'Solicitudes',
        href: '/solicitudes',
        icon: <ClipboardList size={16} />,
        roles: ['COORDINADOR', 'ANALISTA'],
      },
      {
        label: 'Estados de Cuenta',
        href: '/reportes/estados-cuenta',
        icon: <ScrollText size={16} />,
        roles: ['ANALISTA'],
      },
      {
        label: 'Saldos a Favor',
        href: '/gestion-cartera/saldos-favor',
        icon: <CircleDollarSign size={16} />,
        roles: ['COORDINADOR', 'ANALISTA'],
      },
      {
        label: 'Pedidos Retenidos',
        href: '/gestion-cartera/pedidos-retenidos',
        icon: <PackageSearch size={16} />,
        roles: ['COORDINADOR', 'ANALISTA', 'GERENCIA'],
      },
      {
        label: 'Centro de Recursos',
        href: '/centro-recursos',
        icon: <Folder size={16} />,
        roles: ['ANALISTA'],
      },
    ],
  },
  {
    label: 'Inteligencia Financiera',
    icon: <LineChart size={13} />,
    roles: ['COORDINADOR', 'ANALISTA', 'GERENCIA'],
    items: [
      {
        label: 'Análisis de Pagos',
        href: '/gestion-pagos/analisis',
        icon: <BarChart3 size={16} />,
        roles: ['COORDINADOR', 'ANALISTA', 'GERENCIA'],
      },
      {
        label: 'Hub de Reportes',
        href: '/reportes',
        icon: <PieChart size={16} />,
        roles: ['COORDINADOR', 'GERENCIA'],
      },
      { label: 'Reportes', href: '/reportes', icon: <PieChart size={16} />, roles: ['ANALISTA'] },
    ],
  },
  {
    label: 'Auditoría y Control Legal',
    icon: <Scale size={13} />,
    roles: ['COORDINADOR', 'ANALISTA', 'GERENCIA'],
    items: [
      {
        label: 'Control y Custodia de Garantías',
        href: '/auditoria-legal/garantias',
        icon: <FileSignature size={16} />,
        roles: ['COORDINADOR', 'ANALISTA', 'GERENCIA'],
      },
      {
        label: 'Auditorías de Cartera',
        href: '/auditoria-legal/auditorias-cartera',
        icon: <ClipboardCheck size={16} />,
        roles: ['COORDINADOR', 'ANALISTA', 'GERENCIA'],
      },
    ],
  },
  {
    label: 'Sistema',
    icon: <Settings size={13} />,
    roles: ['COORDINADOR', 'GERENCIA'],
    items: [
      // Gerencia sí ve Centro de Recursos (directorio/documentos/apps, solo
      // lectura) -- Configuración sigue exclusiva de Coordinador.
      {
        label: 'Centro de Recursos',
        href: '/centro-recursos',
        icon: <Folder size={16} />,
        roles: ['COORDINADOR', 'GERENCIA'],
      },
      {
        label: 'Configuración',
        href: '/configuracion',
        icon: <Settings size={16} />,
        roles: ['COORDINADOR'],
      },
    ],
  },
  // ── Categorías exclusivas de Analista de Riesgo ──────────────────
  // Ninguna toca los roles/items de las categorías de arriba -- ese rol
  // simplemente no aparece en sus arrays de `roles`, así que quedan ocultas.
  {
    label: 'Control Operativo',
    icon: <LayoutDashboard size={13} />,
    roles: ['ANALISTA_RIESGO'],
    soloRiesgoSinCartera: true,
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: <LayoutDashboard size={16} />,
        roles: ['ANALISTA_RIESGO'],
      },
      {
        label: 'Clientes',
        href: '/clientes',
        icon: <Users size={16} />,
        roles: ['ANALISTA_RIESGO'],
      },
    ],
  },
  {
    label: 'Conciliación y Caja',
    icon: <Coins size={13} />,
    roles: ['ANALISTA_RIESGO'],
    items: [
      {
        label: 'Bandeja de Pagos',
        href: '/bandeja-pagos',
        icon: <Inbox size={16} />,
        roles: ['ANALISTA_RIESGO'],
      },
      {
        label: 'Recibos en Ruta',
        href: '/recibos-ruta',
        icon: <Receipt size={16} />,
        roles: ['ANALISTA_RIESGO'],
      },
    ],
  },
  {
    label: 'Inteligencia Financiera',
    icon: <LineChart size={13} />,
    roles: ['ANALISTA_RIESGO'],
    soloRiesgoSinCartera: true,
    items: [
      {
        label: 'Reportes',
        href: '/reportes',
        icon: <PieChart size={16} />,
        roles: ['ANALISTA_RIESGO'],
      },
      {
        label: 'Centro de Recursos',
        href: '/centro-recursos',
        icon: <Folder size={16} />,
        roles: ['ANALISTA_RIESGO'],
      },
    ],
  },
];

// ── Badge inline ──────────────────────────────────────────────────
function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="flex items-center justify-center rounded-full text-white font-bold ml-auto flex-shrink-0"
      style={{
        background: '#dc2626',
        fontSize: '9px',
        minWidth: '16px',
        height: '16px',
        padding: '0 4px',
        lineHeight: 1,
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────
interface SidebarProps {
  usuario: Pick<
    Usuario,
    'nombre' | 'email' | 'rol' | 'iniciales' | 'color' | 'tiene_cartera_asignada'
  > | null;
  notificaciones: Notificacion[];
  usuarioId: string;
  badgeCounts?: BadgeCounts;
}

// Excepción general (sep 2026, caso Jossmin Ordoñez): un ANALISTA_RIESGO con
// `tiene_cartera_asignada=true` se trata como ANALISTA para efectos de menú
// -- ve exactamente lo mismo que un analista normal (Dashboard, Mi Cartera,
// Gestión de Cartera, Inteligencia Financiera), más su categoría exclusiva
// "Conciliación y Caja" (esa NO pasa por esta equivalencia, sigue gateada
// solo por `roles: ['ANALISTA_RIESGO']`, así que un analista normal nunca la ve).
//
// Excepción explícita DENTRO de la excepción: Auditoría y Control Legal se
// mantiene fuera a propósito -- esas 2 páginas ya bloquean ANALISTA_RIESGO
// server-side con su propio comentario citando CLAUDE.md §2.2; no es parte
// de "gestión de cartera", es una decisión aparte del coordinador que no se
// tocó acá.
const HREFS_BLOQUEADOS_ANALISTA_RIESGO = new Set([
  '/auditoria-legal/garantias',
  '/auditoria-legal/auditorias-cartera',
]);

function analistaRiesgoConCartera(rol: Rol, tieneCarteraAsignada: boolean): boolean {
  return rol === 'ANALISTA_RIESGO' && tieneCarteraAsignada;
}

function tieneAccesoItem(item: NavItem, rol: Rol, tieneCarteraAsignada: boolean): boolean {
  if (item.roles.includes(rol)) return true;
  if (!analistaRiesgoConCartera(rol, tieneCarteraAsignada)) return false;
  if (HREFS_BLOQUEADOS_ANALISTA_RIESGO.has(item.href)) return false;
  return item.roles.includes('ANALISTA');
}

function tieneAccesoCategoria(cat: NavCategory, rol: Rol, tieneCarteraAsignada: boolean): boolean {
  if (cat.soloRiesgoSinCartera && analistaRiesgoConCartera(rol, tieneCarteraAsignada)) return false;
  if (cat.roles.includes(rol)) return true;
  if (!analistaRiesgoConCartera(rol, tieneCarteraAsignada)) return false;
  return cat.items.some((i) => tieneAccesoItem(i, rol, tieneCarteraAsignada));
}

// ── Categoría colapsable ──────────────────────────────────────────
function CategoriaNav({
  cat,
  rol,
  tieneCarteraAsignada,
  activeHref,
  badgeCounts,
}: {
  cat: NavCategory;
  rol: Rol;
  tieneCarteraAsignada: boolean;
  activeHref: string | null;
  badgeCounts: BadgeCounts;
}) {
  const [open, setOpen] = useState(true); // defaultOpen: true
  const items = cat.items.filter((i) => tieneAccesoItem(i, rol, tieneCarteraAsignada));
  if (items.length === 0) return null;

  return (
    <div>
      {/* Encabezado de categoría: icono + label + caret */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 group"
      >
        <span style={{ color: 'rgba(255,255,255,0.40)' }}>{cat.icon}</span>
        <span
          className="flex-1 text-left font-bold uppercase"
          style={{ color: 'rgba(255,255,255,0.40)', fontSize: '11px', letterSpacing: '0.12em' }}
        >
          {cat.label}
        </span>
        <ChevronDown
          size={13}
          className={cn('transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')}
          style={{ color: 'rgba(255,255,255,0.30)' }}
        />
      </button>

      {/* Submódulos con línea guía vertical */}
      <div
        className="grid transition-all duration-200"
        style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <div className="relative pl-[30px] mt-1">
            {/* Línea guía */}
            <span
              className="absolute top-1 bottom-1"
              style={{ left: '14px', width: '1px', background: 'rgba(255,255,255,0.12)' }}
            />
            <ul className="space-y-1.5">
              {items.map((item) => {
                const active = item.href === activeHref;
                const badge = item.badgeKey ? (badgeCounts[item.badgeKey] ?? 0) : 0;
                return (
                  <li key={item.label} className="relative">
                    {/* Micro-barra cyan en la extrema izquierda de la pantalla */}
                    {active && (
                      <span
                        className="absolute rounded-r-md"
                        style={{
                          left: '-30px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '4px',
                          height: '20px',
                          background: '#009ee3',
                        }}
                      />
                    )}
                    <Link
                      href={item.href}
                      prefetch={false}
                      className={cn(
                        'flex items-center rounded-lg px-3 py-1.5 text-[13px] transition-colors',
                        active
                          ? 'font-semibold text-white'
                          : 'font-medium text-blue-200/70 hover:text-white hover:bg-white/5',
                      )}
                      style={active ? { background: 'rgba(255,255,255,0.08)' } : undefined}
                    >
                      <span className="flex-1 leading-none">{item.label}</span>
                      <NavBadge count={badge} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Ícono con tooltip flotante (solo se usa en modo colapsado) ─────
// El tooltip se renderiza vía portal a document.body, posicionado con
// getBoundingClientRect(), para escapar de cualquier overflow ancestro
// (permite mantener overflow-y-auto normal en el <nav>, sin sacrificar
// el scroll de seguridad en pantallas chicas).
function NavIconTooltip({
  label,
  href,
  active,
  icon,
}: {
  label: string;
  href: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const pathname = usePathname();
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const visible = hovering || focused;
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Cierra el tooltip apenas cambia la ruta (justo cuando Next.js termina la
  // navegación del lado del cliente), sin depender del foco del DOM. Así el
  // usuario que navega por teclado conserva su posición de tabulación.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHovering(false);
    setFocused(false);
  }, [pathname]);

  // Si el usuario hace scroll del <nav> con la rueda del mouse sin mover el
  // cursor, no se dispara mouseleave/blur: el ícono se desliza bajo el
  // cursor pero el tooltip (position: fixed) queda flotando en coordenadas
  // viejas. Se oculta apenas se detecta cualquier scroll mientras es visible.
  // Fase de captura para detectar el scroll del <nav> interno aunque no
  // haga bubble hasta window.
  useEffect(() => {
    if (!visible) return;
    function handleScroll() {
      setHovering(false);
      setFocused(false);
    }
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [visible]);

  function updatePos() {
    const rect = linkRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.top + rect.height / 2, left: rect.right + 8 });
  }
  function handleMouseEnter() {
    updatePos();
    setHovering(true);
  }
  function handleMouseLeave() {
    setHovering(false);
  }
  function handleFocus() {
    updatePos();
    setFocused(true);
  }
  function handleBlur() {
    setFocused(false);
  }

  return (
    <li className="relative">
      {active && (
        <span
          className="absolute rounded-r-md"
          style={{
            left: '0',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '4px',
            height: '20px',
            background: '#009ee3',
          }}
        />
      )}
      <Link
        ref={linkRef}
        href={href}
        prefetch={false}
        aria-label={label}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn(
          'flex items-center justify-center rounded-lg mx-2 transition-colors',
          active ? 'text-white' : 'text-blue-200/70 hover:text-white hover:bg-white/5',
        )}
        style={{ height: '38px', background: active ? 'rgba(255,255,255,0.08)' : undefined }}
      >
        {icon}
      </Link>
      {mounted &&
        createPortal(
          <span
            className={cn(
              'pointer-events-none fixed whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-white shadow-lg transition-opacity duration-150',
              visible ? 'opacity-100' : 'opacity-0',
            )}
            style={{
              top: pos.top,
              left: pos.left,
              transform: 'translateY(-50%)',
              zIndex: 500,
              backgroundColor: '#003B5C',
            }}
          >
            {label}
          </span>,
          document.body,
        )}
    </li>
  );
}

// ── Componente ────────────────────────────────────────────────────
export default function Sidebar({ usuario, badgeCounts = {} }: SidebarProps) {
  const pathname = usePathname();
  const rol: Rol = (usuario?.rol as Rol) ?? 'ANALISTA';
  const tieneCarteraAsignada = !!usuario?.tiene_cartera_asignada;

  // ── Colapsar/expandir (persistido en localStorage) ────────────────
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  // Aplica el valor guardado ANTES de activar la transición, para que el
  // ajuste inicial (si el usuario ya tenía el sidebar colapsado) no se anime.
  // No se puede resolver con un lazy initializer de useState: leer
  // localStorage durante el render del cliente reintroduciría el mismatch
  // de hidratación (el servidor siempre renderiza expandido) que este
  // efecto está evitando.
  useEffect(() => {
    const saved = window.localStorage.getItem('sic-sidebar-collapsed');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === 'true') setIsCollapsed(true);
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setHasMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function toggleCollapsed() {
    setIsCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem('sic-sidebar-collapsed', String(next));
      return next;
    });
  }

  // Ruta activa: el href más específico (prefijo más largo) que coincide.
  // Hace que /reportes/cei mantenga activo 'Hub de Reportes', y que
  // /reportes/estados-cuenta gane sobre /reportes (prefijo más largo).
  const visibleHrefs = [
    ...ROOT_ITEMS.filter((i) => tieneAccesoItem(i, rol, tieneCarteraAsignada)),
    ...CATEGORIES.flatMap((c) => c.items).filter((i) =>
      tieneAccesoItem(i, rol, tieneCarteraAsignada),
    ),
  ].map((i) => i.href);
  const matches = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const activeHref = visibleHrefs.filter(matches).sort((a, b) => b.length - a.length)[0] ?? null;

  const rootItems = ROOT_ITEMS.filter((i) => tieneAccesoItem(i, rol, tieneCarteraAsignada));

  const visibleCategories = CATEGORIES.filter((c) =>
    tieneAccesoCategoria(c, rol, tieneCarteraAsignada),
  )
    .map((c) => ({
      ...c,
      items: c.items.filter((i) => tieneAccesoItem(i, rol, tieneCarteraAsignada)),
    }))
    .filter((c) => c.items.length > 0);

  return (
    <aside
      className={cn(
        'flex flex-col flex-shrink-0 h-screen',
        hasMounted && 'transition-all duration-300',
      )}
      style={{ width: isCollapsed ? '64px' : '210px', backgroundColor: '#003B5C' }}
    >
      {/* ── Header: logo + identidad SIC ──────────────────────── */}
      {isCollapsed ? (
        <div
          className="px-2 pt-3.5 pb-3 flex justify-center"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="bg-white rounded-xl p-2 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="Cofersa" className="w-7 h-7 object-contain" />
          </div>
        </div>
      ) : (
        <div
          className="px-3 pt-3.5 pb-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="px-2.5 py-1.5 flex items-center justify-center bg-white rounded-xl w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-cofersa-sidebar.png"
              alt="Cofersa"
              className="w-[90%] h-auto max-h-[44px] object-contain mx-auto"
            />
          </div>
          <div className="flex items-center justify-center mt-2.5" style={{ gap: '6px' }}>
            <span style={{ color: '#009ee3', fontWeight: 700, fontSize: '15px', lineHeight: 1 }}>
              SIC
            </span>
            <span
              style={{
                color: 'rgba(255,255,255,0.25)',
                fontWeight: 400,
                fontSize: '13px',
                lineHeight: 1,
              }}
            >
              |
            </span>
            <span
              style={{
                color: 'rgba(255,255,255,0.55)',
                fontWeight: 400,
                fontSize: '10px',
                letterSpacing: '0.06em',
              }}
            >
              Powered by Cofersa
            </span>
          </div>
        </div>
      )}

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto py-3">
        {isCollapsed ? (
          <div className="space-y-4">
            {/* Accesos raíz */}
            <ul className="space-y-1">
              {rootItems.map((item) => (
                <NavIconTooltip
                  key={item.href}
                  label={item.label}
                  href={item.href}
                  active={item.href === activeHref}
                  icon={item.icon}
                />
              ))}
            </ul>

            {/* Categorías aplanadas (sin encabezado, solo íconos) */}
            {visibleCategories.map((cat) => (
              <ul key={cat.label} className="space-y-1">
                {cat.items.map((item) => (
                  <NavIconTooltip
                    key={item.href}
                    label={item.label}
                    href={item.href}
                    active={item.href === activeHref}
                    icon={item.icon}
                  />
                ))}
              </ul>
            ))}
          </div>
        ) : (
          <>
            {/* Accesos raíz */}
            <ul className="space-y-0.5">
              {rootItems.map((item) => {
                const active = item.href === activeHref;
                return (
                  <li key={item.href} className="relative">
                    {active && (
                      <span
                        className="absolute rounded-r-md"
                        style={{
                          left: '0',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '4px',
                          height: '20px',
                          background: '#009ee3',
                        }}
                      />
                    )}
                    <Link
                      href={item.href}
                      prefetch={false}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg mx-2 px-3 py-2 text-[13px] transition-colors',
                        active
                          ? 'font-semibold text-white'
                          : 'font-medium text-blue-200/70 hover:text-white hover:bg-white/5',
                      )}
                      style={active ? { background: 'rgba(255,255,255,0.08)' } : undefined}
                    >
                      <span className="flex-shrink-0">{item.icon}</span>
                      <span className="flex-1 leading-none">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Categorías */}
            <div className="mt-5 space-y-4">
              {CATEGORIES.filter((c) => tieneAccesoCategoria(c, rol, tieneCarteraAsignada)).map(
                (cat) => (
                  <CategoriaNav
                    key={cat.label}
                    cat={cat}
                    rol={rol}
                    tieneCarteraAsignada={tieneCarteraAsignada}
                    activeHref={activeHref}
                    badgeCounts={badgeCounts}
                  />
                ),
              )}
            </div>
          </>
        )}
      </nav>

      {/* ── Botón colapsar/expandir (pie del sidebar) ──────────────── */}
      <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            'w-full flex items-center gap-2 py-3 text-[12px] font-semibold transition-colors hover:bg-white/5',
            isCollapsed ? 'justify-center' : 'px-4',
          )}
          style={{ color: 'rgba(255,255,255,0.55)' }}
          title={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
          aria-label={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {isCollapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <>
              <PanelLeftClose size={16} />
              <span>Colapsar menú</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
