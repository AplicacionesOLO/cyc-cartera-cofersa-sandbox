# Sidebar Colapsable + Menú de Perfil Enriquecido — Diseño

**Fecha:** 2026-07-09
**Estado:** Aprobado por el usuario (Jeffrey Díaz), pendiente de plan de implementación.

## Contexto

`CLAUDE.md` protege explícitamente `src/components/sidebar.tsx` ("NO tocar el Sidebar bajo ninguna circunstancia" salvo autorización explícita). Este documento registra que el usuario solicitó y aprobó, de forma explícita y detallada, este cambio — cumple la excepción del punto 5.1 de `CLAUDE.md`.

## Objetivo

Dos mejoras de UI/UX independientes pero que se entregan juntas por tocar componentes de layout global:

1. Sidebar colapsable manualmente (botón al pie), con modo ícono-solamente + tooltips.
2. Menú de perfil del Topbar rediseñado como tarjeta ejecutiva, con rol institucional visible y dos acciones nuevas en estado "placeholder honesto".

## Fuera de alcance (explícito)

- **No** se implementa dark mode real — el switch de "Modo Oscuro" queda deshabilitado con etiqueta "Próximamente".
- **No** se implementa edición real de perfil/contraseña — el modal "Mi Perfil" es un placeholder informativo, sin campos editables.
- **No** se usa el SVG de "anillos entrelazados" propuesto inicialmente por el usuario (colores `#00A8E8`/`#1A1A1A` no coinciden con la paleta inamovible de `CLAUDE.md`) — en su lugar se usa el asset real ya existente en el proyecto, `public/icons/icon-192.png` (el mismo isotipo que ya aparece como favicon de la app).
- **No** se cambia el ancho expandido del sidebar (se mantiene en 210px, no se adopta el 260px mencionado en el prompt original, para no alterar nada ya aprobado en producción).
- **No** se toca el Topbar de notificaciones (campana) ni ninguna otra parte del layout global.

---

## Sección 1: Sidebar Inteligente y Colapsable

### Estado y persistencia

- Nuevo `useState<boolean>('isCollapsed')` en `Sidebar.tsx`, inicializado en `false` (igual que el comportamiento actual hoy), para que el primer render del servidor y del cliente coincidan y no haya warning de hidratación.
- Un `useEffect` al montar lee `localStorage['sic-sidebar-collapsed']`. Si existe y es `'true'`, ajusta `isCollapsed` a `true`. Este ajuste inicial **no anima** (se aplica un flag `hasMounted` para que la clase `transition-all` del `<aside>` solo se agregue después del primer render, evitando un "salto" visible al cargar).
- Cada toggle manual (clic en el botón) actualiza el estado y escribe el nuevo valor en `localStorage`.

### Ancho

- Expandido: `210px` (sin cambios respecto a hoy).
- Colapsado: `64px`.
- Transición: `transition-all duration-300` en el `<aside>` (solo activa después del montaje, ver arriba).

### Encabezado (logo)

- Expandido: sin cambios — logo completo (`/logo-cofersa-sidebar.png`) + texto "SIC | Powered by Cofersa".
- Colapsado: `/icons/icon-192.png` (isotipo real de dos anillos entrelazados, cyan `#009ee3` y negro — el mismo que usa la app como favicon/ícono PWA), centrado, sin texto.

### Widget de Tipo de Cambio

- Se oculta por completo cuando `isCollapsed === true` (no cabe en 64px de ancho). Reaparece al expandir. No estaba en el prompt original del usuario pero es una consecuencia directa y necesaria del colapso.

### Módulos y categorías

- **Expandido:** sin cambios — accesos raíz (Dashboard, Mi Cartera) + categorías colapsables (`CategoriaNav`) exactamente como hoy.
- **Colapsado:** las categorías pierden su encabezado (ícono + nombre + flecha — no hay espacio para el texto). Todos los ítems de todas las categorías visibles para el rol del usuario se renderizan como una columna vertical plana de íconos, en el mismo orden en que aparecen hoy, con un espacio en blanco (`gap`) ligeramente mayor entre grupos de categoría a modo de separador visual mudo (sin etiqueta).
- Cada ícono mantiene la barra cyan lateral de "activo" que ya existe hoy.
- **Tooltip premium:** al hacer hover sobre cualquier ícono en modo colapsado (tanto accesos raíz como ítems de categoría), aparece una etiqueta flotante a la derecha: fondo `bg-slate-900`, texto blanco, `rounded-lg`, `shadow-lg`, `text-[12px]`, `whitespace-nowrap`, con transición de opacidad (`opacity-0 group-hover:opacity-100 transition`), `pointer-events-none` para que no interfiera con el clic, y `z-50` para flotar sobre el contenido principal.

### Íconos nuevos para módulos de categoría

Hoy los `NavItem` dentro de `CATEGORIES` no tienen ícono (solo los accesos raíz `ROOT_ITEMS` lo tienen). Se agrega el campo (ya existe en la interfaz `NavItem`, queda poblado) con este mapeo aprobado:

| Módulo                     | Ícono (`lucide-react`) | Import nuevo?                                                                                |
| -------------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| Clientes                   | `Users`                | No (ya importado, sin usar)                                                                  |
| Gestiones                  | `ClipboardList`        | No (ya importado, sin usar)                                                                  |
| Promesas                   | `Handshake`            | No (ya importado, sin usar — mismo ícono que usa el Topbar para notificaciones tipo PROMESA) |
| Solicitudes                | `FileText`             | No (ya importado, sin usar)                                                                  |
| Estados de Cuenta          | `Mail`                 | No (ya importado, sin usar)                                                                  |
| Saldos a Favor             | `CircleDollarSign`     | Sí                                                                                           |
| Análisis de Pagos          | `BarChart3`            | No (ya importado, sin usar)                                                                  |
| Hub de Reportes / Reportes | `PieChart`             | No (ya importado, sin usar)                                                                  |
| Configuración              | `Settings`             | No (ya usado a nivel de categoría, se reutiliza)                                             |
| Bandeja de Pagos           | `Inbox`                | Sí                                                                                           |
| Recibos en Ruta            | `Receipt`              | Sí                                                                                           |

### Botón de colapsar (pie del sidebar)

- Franja propia al final del `<aside>` (después del nav scrolleable), con línea divisoria superior (`border-top: 0.5px solid rgba(255,255,255,0.07)`, mismo estilo que ya usa el separador del widget de Tipo de Cambio).
- Expandido: ícono `PanelLeftClose` (lucide-react) + texto "Colapsar menú". (Se usa un ícono de lucide en vez del emoji ◀️ del prompt original, por consistencia — el proyecto no usa emojis en ninguna parte de la UI, todo es `lucide-react`.)
- Colapsado: solo `PanelLeftOpen`, centrado.

---

## Sección 2: Menú de Perfil de Usuario (Topbar)

### Lo que ya cumple el requisito (sin cambios)

- El dropdown ya usa `rounded-xl shadow-xl`.
- El botón "Cerrar sesión" ya tiene hover rojo sutil (`hover:bg-red-50`, texto `#dc2626`) con línea divisoria antes.

### Cambios

**Ancho:** `180px` → `w-64` (256px).

**Bloque superior (cabecera):**

- Avatar 36px (foto real si existe, o iniciales con color — misma lógica `showAvatar`/`iniciales`/`color` ya usada en el chip del Topbar).
- Nombre completo en negrita (`font-bold text-gray-800`).
- Rol institucional debajo, gris pequeño (`text-[11px] text-gray-400`), usando `displayRol(rol)` de `src/lib/utils/roles.ts`.
- Requiere: nuevo prop `rol: string` en `TopbarProps`, pasado desde `layout.tsx` como `perfil.rol` (ya disponible ahí, no requiere query nueva).

**Bloque central (acciones):**

- **"Mi Perfil":** deja de ser un no-op. Abre un modal nuevo (mismo lenguaje visual que los demás modales del sistema — overlay oscuro, `bg-white rounded-xl`). Contenido: avatar + nombre + rol + mensaje "Próximamente podrás editar tus datos y contraseña desde aquí." Sin campos editables falsos (decisión explícita del usuario: Opción A, placeholder honesto).
- **"Modo Oscuro":** fila nueva con ícono `Moon` + texto "Modo Oscuro" + switch visualmente presente pero **deshabilitado** (`opacity-50 cursor-not-allowed`, sin `onClick` funcional) + etiqueta pequeña "Próximamente".

**Bloque inferior:** sin cambios (divisor + Cerrar sesión ya cumplen el estilo pedido).

---

## Archivos afectados

- `src/components/sidebar.tsx` — estado colapsable, íconos nuevos en `NavItem`, header condicional, footer con botón, tooltips, flattening de categorías en modo colapsado.
- `src/components/topbar.tsx` — nuevo prop `rol`, cabecera del dropdown con avatar+rol, fila "Modo Oscuro", conexión de "Mi Perfil" al nuevo modal.
- Nuevo componente: `src/components/ModalMiPerfil.tsx` (o ubicación equivalente a definir en el plan) — modal placeholder.
- `src/app/(app)/layout.tsx` — pasar `perfil.rol` como nuevo prop a `<Topbar>`.

## Riesgos / notas técnicas

- Hidratación: mitigado con el patrón `useState(false)` + ajuste en `useEffect` + flag `hasMounted` para no animar el ajuste inicial (detallado arriba).
- El campo `icon` en `NavItem` ya existe en la interfaz (`icon?: React.ReactNode`) — no requiere cambio de tipos, solo poblar los objetos.
- Ningún cambio de datos/roles/RLS — es puramente de presentación (mismo patrón que `displayRol`, que ya documenta `CLAUDE.md` como "capa de nombres profesionales" que no toca el string real guardado en `usuarios.rol`).
