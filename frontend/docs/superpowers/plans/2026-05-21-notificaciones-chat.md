# Notificaciones en Tiempo Real + Chat Interno — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El badge de notificaciones se actualiza en tiempo real sin recargar la página. El panel agrega tabs de filtro por tipo. Los badges del sidebar se eliminan (la campana es el único punto). Un panel flotante de chat permite al equipo comunicarse desde cualquier pantalla.

**Architecture:** Supabase Realtime (Postgres Changes) para notificaciones nuevas en el topbar. Supabase Realtime (Postgres Changes + Presence) para el chat. El `ChatPanel` se monta en el layout de la app y flota sobre el contenido. Los tipos nuevos se agregan a `database.ts`. No hay rediseño de componentes existentes — solo extensiones.

**Tech Stack:** Next.js 14, Supabase Realtime, Supabase Presence, React hooks, Tailwind CSS

---

## Mapa de archivos

| Acción    | Archivo                                                | Cambio                                                          |
| --------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| Modificar | `src/components/topbar.tsx`                            | Agregar Realtime subscription + tabs de filtro                  |
| Modificar | `src/components/sidebar.tsx`                           | Eliminar `badgeKey` de Gestiones, Promesas, Solicitudes         |
| Modificar | `src/app/(app)/layout.tsx`                             | Eliminar cómputo de `badgeCounts` + montar `<ChatPanel />`      |
| Modificar | `src/types/database.ts`                                | Agregar `MensajeChat`, `PresenciaChat`, `MensajeChatConUsuario` |
| Crear     | `supabase/migrations/20260521000001_mensajes_chat.sql` | Tabla + RLS                                                     |
| Crear     | `src/app/api/chat/route.ts`                            | POST endpoint para enviar mensaje                               |
| Crear     | `src/hooks/useChat.ts`                                 | Hook: mensajes + Realtime + Presence                            |
| Crear     | `src/components/layout/ChatPanel.tsx`                  | Panel flotante de chat                                          |

---

### Task 1: Agregar Realtime y tabs al Topbar

**Archivos:**

- Modificar: `src/components/topbar.tsx`

**Contexto:** El Topbar ya tiene el panel de notificaciones completo. La lista de `notis` viene del servidor (prop `init`) y se guarda en `useState(init)`. Hay que agregar: (1) suscripción Realtime para que nuevas notificaciones lleguen sin recargar, (2) estado de tab activo para filtrar por tipo.

- [ ] **Paso 1: Agregar el estado del tab activo**

En `src/components/topbar.tsx`, dentro del componente `Topbar`, localizar el bloque de estado (alrededor de línea 89):

```typescript
const [notiOpen, setNotiOpen] = useState(false);
const [notis, setNotis] = useState<Notificacion[]>(init);
```

Agregar debajo:

```typescript
// Tab activo para filtrar notificaciones
type TabNotif = 'todas' | TipoNotif;
const [tabNotif, setTabNotif] = useState<TabNotif>('todas');

// Notificaciones filtradas según tab activo
const notisFiltradas = tabNotif === 'todas' ? notis : notis.filter((n) => n.tipo === tabNotif);
```

- [ ] **Paso 2: Agregar la suscripción Realtime**

Después del bloque de `useEffect` que cierra dropdowns al hacer click fuera (línea ~108), agregar:

```typescript
// ── Suscripción Realtime: nuevas notificaciones llegan en vivo ────────
useEffect(() => {
  if (!usuarioId) return;

  const supabase = createClient();
  const channel = supabase
    .channel(`notificaciones:${usuarioId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notificaciones',
        filter: `usuario_id=eq.${usuarioId}`,
      },
      (payload) => {
        // Agregar la nueva notificación al inicio de la lista (más reciente arriba)
        setNotis((prev) => [payload.new as Notificacion, ...prev]);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [usuarioId]);
```

- [ ] **Paso 3: Agregar las tabs de filtro al panel dropdown**

En el panel dropdown de notificaciones, localizar el header (alrededor de línea 214):

```tsx
<div
  className="flex items-center justify-between px-4 py-3 flex-shrink-0"
  style={{ borderBottom: '1px solid #f1f5f9' }}
>
  ...
</div>
```

Agregar después del cierre de ese `div` y antes de `<div className="overflow-y-auto flex-1">`:

```tsx
{
  /* Tabs de filtro */
}
<div className="flex gap-1 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #f1f5f9' }}>
  {(
    [
      { key: 'todas', label: 'Todas' },
      { key: 'PROMESA', label: 'Promesas' },
      { key: 'ALERTA', label: 'Alertas' },
      { key: 'SOLICITUD', label: 'Solicitudes' },
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
</div>;
```

- [ ] **Paso 4: Usar `notisFiltradas` en lugar de `notis` en el map**

En el cuerpo del dropdown, localizar:

```tsx
notis.map((n, i) => {
```

Reemplazar con:

```tsx
notisFiltradas.map((n, i) => {
```

Y actualizar la condición `borderBottom` del map:

```tsx
borderBottom: i < notisFiltradas.length - 1 ? '1px solid #f8fafc' : 'none',
```

- [ ] **Paso 5: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Salida esperada: sin errores.

- [ ] **Paso 6: Commit**

```bash
git add src/components/topbar.tsx
git commit -m "feat: agregar Realtime y tabs de filtro al panel de notificaciones"
```

---

### Task 2: Eliminar badges del Sidebar

**Archivos:**

- Modificar: `src/components/sidebar.tsx`
- Modificar: `src/app/(app)/layout.tsx`

**Contexto:** Los badges de Gestiones, Promesas y Solicitudes en el sidebar duplican información que ahora centraliza la campana. Según el diseño aprobado, la campana es el único punto de notificación.

- [ ] **Paso 1: Eliminar `badgeKey` de los nav items en `sidebar.tsx`**

En `src/components/sidebar.tsx`, localizar los 3 items con `badgeKey` (dentro de la sección "GESTIÓN DE CARTERA" para ANALISTA):

```typescript
{
  label: 'Gestiones',
  href: '/gestiones',
  icon: <ClipboardList size={16} />,
  roles: ['ANALISTA'],
  badgeKey: 'gestionesHoy',          // ← eliminar esta línea
},
{
  label: 'Promesas',
  href: '/promesas',
  icon: <Handshake size={16} />,
  roles: ['ANALISTA'],
  badgeKey: 'promesasVencidas',      // ← eliminar esta línea
},
{
  label: 'Solicitudes',
  href: '/solicitudes',
  icon: <FileText size={16} />,
  roles: ['ANALISTA'],
  badgeKey: 'solicitudesPendientes', // ← eliminar esta línea
},
```

Resultado después del cambio:

```typescript
{
  label: 'Gestiones',
  href: '/gestiones',
  icon: <ClipboardList size={16} />,
  roles: ['ANALISTA'],
},
{
  label: 'Promesas',
  href: '/promesas',
  icon: <Handshake size={16} />,
  roles: ['ANALISTA'],
},
{
  label: 'Solicitudes',
  href: '/solicitudes',
  icon: <FileText size={16} />,
  roles: ['ANALISTA'],
},
```

- [ ] **Paso 2: Eliminar el cómputo de `badgeCounts` en `layout.tsx`**

En `src/app/(app)/layout.tsx`, localizar el bloque completo de badgeCounts (líneas 66-98):

```typescript
// Badges de navegación para el ANALISTA
const badgeCounts: BadgeCounts = {};
if (perfil.rol === 'ANALISTA' && user.email) {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    // ... (queries de conteo)
    badgeCounts.gestionesHoy = gHoy ?? 0;
    badgeCounts.promesasVencidas = pVencidas ?? 0;
    badgeCounts.solicitudesPendientes = sPend ?? 0;
  } catch {
    /* badges no críticos */
  }
}
```

Eliminar todo ese bloque. También eliminar el prop `badgeCounts={badgeCounts}` del `<Sidebar />`.

- [ ] **Paso 3: Limpiar imports huérfanos en `layout.tsx`**

Verificar si `BadgeCounts` ya no se usa. Si aparece solo en el import:

```typescript
import type { BadgeCounts } from '@/components/sidebar';
```

Eliminar esa línea.

- [ ] **Paso 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Salida esperada: sin errores.

- [ ] **Paso 5: Commit**

```bash
git add src/components/sidebar.tsx src/app/(app)/layout.tsx
git commit -m "feat: eliminar badges del sidebar — campana centraliza notificaciones"
```

---

### Task 3: Crear la tabla `mensajes_chat`

**Archivos:**

- Crear: `supabase/migrations/20260521000001_mensajes_chat.sql`

- [ ] **Paso 1: Crear el archivo de migración**

Crear `supabase/migrations/20260521000001_mensajes_chat.sql`:

```sql
-- Tabla de mensajes del chat interno del equipo C&C
CREATE TABLE IF NOT EXISTS public.mensajes_chat (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  mensaje     TEXT NOT NULL CHECK (char_length(trim(mensaje)) > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para cargar los últimos N mensajes eficientemente
CREATE INDEX IF NOT EXISTS mensajes_chat_created_at_idx
  ON public.mensajes_chat (created_at DESC);

-- Habilitar RLS
ALTER TABLE public.mensajes_chat ENABLE ROW LEVEL SECURITY;

-- Política: solo usuarios activos del sistema pueden leer y escribir
CREATE POLICY "equipo_puede_leer_chat" ON public.mensajes_chat
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.usuarios WHERE activo = true)
  );

CREATE POLICY "equipo_puede_escribir_chat" ON public.mensajes_chat
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT id FROM public.usuarios WHERE activo = true)
    AND auth.uid() = usuario_id
  );

-- Habilitar Realtime para esta tabla
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes_chat;
```

- [ ] **Paso 2: Ejecutar la migración en Supabase**

Opción A — Supabase CLI:

```bash
supabase db push
```

Opción B — SQL Editor (Supabase Dashboard → SQL Editor → New query):
Pegar el contenido del archivo y ejecutar.

- [ ] **Paso 3: Verificar que la tabla existe**

En Supabase Dashboard → Table Editor: debe aparecer `mensajes_chat`.

- [ ] **Paso 4: Commit**

```bash
git add supabase/migrations/20260521000001_mensajes_chat.sql
git commit -m "feat: crear tabla mensajes_chat con RLS y Realtime"
```

---

### Task 4: Agregar tipos al database.ts

**Archivos:**

- Modificar: `src/types/database.ts`

- [ ] **Paso 1: Agregar interfaces nuevas**

En `src/types/database.ts`, agregar después de la interfaz `Notificacion` (línea ~217):

```typescript
// ── Chat interno ──────────────────────────────────────────────────────

export interface MensajeChat {
  id: string;
  usuario_id: string;
  mensaje: string;
  created_at: string;
}

/** MensajeChat con los datos del remitente ya incluidos (resultado del join) */
export interface MensajeChatConUsuario extends MensajeChat {
  usuario: Pick<Usuario, 'nombre' | 'iniciales' | 'color'> | null;
}

/** Estado de presencia de un miembro en el canal de chat */
export interface PresenciaChat {
  usuario_id: string;
  nombre: string;
  iniciales: string;
  color: string;
  online_at: string;
}
```

- [ ] **Paso 2: Agregar `mensajes_chat` al tipo `Database`**

En `src/types/database.ts`, dentro del objeto `Tables` de `Database`, agregar después de `notificaciones`:

```typescript
mensajes_chat: {
  Row: MensajeChat;
  Insert: Partial<MensajeChat>;
  Update: Partial<MensajeChat>;
}
```

- [ ] **Paso 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Salida esperada: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: agregar tipos MensajeChat, MensajeChatConUsuario y PresenciaChat"
```

---

### Task 5: Crear el API route de chat

**Archivos:**

- Crear: `src/app/api/chat/route.ts`

- [ ] **Paso 1: Crear el directorio y el archivo**

```bash
mkdir -p src/app/api/chat
```

Crear `src/app/api/chat/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/chat
 * Envía un mensaje al canal de chat del equipo.
 * Body: { mensaje: string }
 */
export async function POST(req: NextRequest) {
  let body: { mensaje?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { mensaje } = body;

  if (!mensaje?.trim()) {
    return NextResponse.json({ error: 'El mensaje no puede estar vacío' }, { status: 400 });
  }

  if (mensaje.trim().length > 1000) {
    return NextResponse.json({ error: 'El mensaje excede los 1000 caracteres' }, { status: 400 });
  }

  const supabase = await createClient();

  // Verificar sesión
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Obtener usuario_id del sistema
  const { data: usuarioRow } = await supabase
    .from('usuarios')
    .select('id, activo')
    .eq('email', user.email!)
    .single();

  const usuario = usuarioRow as { id: string; activo: boolean } | null;

  if (!usuario?.activo) {
    return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 });
  }

  // Insertar mensaje
  const { data, error } = await supabase
    .from('mensajes_chat')
    .insert({ usuario_id: usuario.id, mensaje: mensaje.trim() })
    .select('id, created_at')
    .single();

  if (error) {
    console.error('[chat] Error al insertar mensaje:', error.message);
    return NextResponse.json({ error: 'Error al enviar el mensaje' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id, created_at: data.created_at });
}
```

- [ ] **Paso 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Salida esperada: sin errores.

- [ ] **Paso 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: API route POST /api/chat para enviar mensajes"
```

---

### Task 6: Crear el hook useChat

**Archivos:**

- Crear: `src/hooks/useChat.ts`

- [ ] **Paso 1: Crear el archivo**

Crear `src/hooks/useChat.ts`:

```typescript
/**
 * useChat
 *
 * Hook que maneja el estado del chat interno del equipo:
 *   - Carga los últimos 50 mensajes al montar
 *   - Suscripción Realtime para mensajes nuevos en tiempo real
 *   - Supabase Presence para saber quién está conectado
 *   - Función para enviar mensajes
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { MensajeChatConUsuario, PresenciaChat } from '@/types/database';

interface UseChatOptions {
  usuarioId: string;
  nombre: string;
  iniciales: string;
  color: string;
}

export function useChat({ usuarioId, nombre, iniciales, color }: UseChatOptions) {
  const [mensajes, setMensajes] = useState<MensajeChatConUsuario[]>([]);
  const [conectados, setConectados] = useState<PresenciaChat[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const presenceChannelRef =
    useRef<
      ReturnType<typeof createClient>['channel'] extends (...args: infer A) => infer R
        ? R
        : never | null
    >(null);

  const supabase = createClient();

  // ── Carga inicial: últimos 50 mensajes ────────────────────────────────
  useEffect(() => {
    if (!usuarioId) return;

    async function cargar() {
      setCargando(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: fetchErr } = await (supabase as any)
        .from('mensajes_chat')
        .select('*, usuario:usuarios!usuario_id(nombre, iniciales, color)')
        .order('created_at', { ascending: true })
        .limit(50);

      if (fetchErr) {
        setError('No se pudieron cargar los mensajes.');
        console.error('[useChat] Error cargando mensajes:', fetchErr.message);
      } else {
        setMensajes(data ?? []);
      }
      setCargando(false);
    }

    cargar();
  }, [usuarioId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime: mensajes nuevos ─────────────────────────────────────────
  useEffect(() => {
    if (!usuarioId) return;

    const channel = supabase
      .channel('mensajes_chat_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes_chat' },
        async (payload) => {
          // Fetch el mensaje completo con datos del usuario
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any)
            .from('mensajes_chat')
            .select('*, usuario:usuarios!usuario_id(nombre, iniciales, color)')
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMensajes((prev) => [...prev, data as MensajeChatConUsuario]);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [usuarioId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Presence: quién está conectado ───────────────────────────────────
  useEffect(() => {
    if (!usuarioId) return;

    const channel = supabase.channel('presencia_equipo_cyc', {
      config: { presence: { key: usuarioId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenciaChat>();
        // Cada key del state es un usuarioId, el valor es un array de tracks
        const lista: PresenciaChat[] = Object.values(state).flatMap(
          (arr) => arr as PresenciaChat[],
        );
        setConectados(lista);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            usuario_id: usuarioId,
            nombre,
            iniciales,
            color,
            online_at: new Date().toISOString(),
          });
        }
      });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    presenceChannelRef.current = channel as any;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [usuarioId, nombre, iniciales, color]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Enviar mensaje ────────────────────────────────────────────────────
  const enviarMensaje = useCallback(async (texto: string): Promise<boolean> => {
    const trimmed = texto.trim();
    if (!trimmed) return false;

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje: trimmed }),
    });

    return res.ok;
  }, []);

  return { mensajes, conectados, cargando, error, enviarMensaje };
}
```

- [ ] **Paso 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Salida esperada: sin errores (puede haber un warning menor por el tipo del ref — ignorable).

- [ ] **Paso 3: Commit**

```bash
git add src/hooks/useChat.ts
git commit -m "feat: hook useChat con Realtime y Presence"
```

---

### Task 7: Crear el ChatPanel

**Archivos:**

- Crear: `src/components/layout/ChatPanel.tsx`

- [ ] **Paso 1: Crear el archivo**

Crear `src/components/layout/ChatPanel.tsx`:

```tsx
'use client';

/**
 * ChatPanel
 *
 * Panel flotante de chat del equipo C&C.
 * Se monta en el layout principal (app/(app)/layout.tsx vía ClientWrapper).
 * Flota en la esquina inferior derecha sobre el contenido.
 *
 * Funcionalidades:
 *   - Toggle abierto/cerrado
 *   - Lista de mensajes con scroll automático
 *   - Indicador de presencia (quién está conectado)
 *   - Input + envío con Enter o botón
 *   - Punto parpadeante cuando llega mensaje con panel cerrado
 */

import { useState, useEffect, useRef } from 'react';
import { Send, X, ChevronDown } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import type { MensajeChatConUsuario } from '@/types/database';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtFechaChat(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);

  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit' });
}

// ── Componente Avatar ──────────────────────────────────────────────────────

function AvatarChip({
  iniciales,
  color,
  size = 28,
}: {
  iniciales: string;
  color: string;
  size?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.35,
        fontWeight: 700,
        color: 'white',
      }}
    >
      {iniciales}
    </div>
  );
}

// ── Componente Mensaje ─────────────────────────────────────────────────────

function BurbujaMensaje({
  msg,
  esMio,
  mostrarNombre,
}: {
  msg: MensajeChatConUsuario;
  esMio: boolean;
  mostrarNombre: boolean;
}) {
  const nombre = msg.usuario?.nombre ?? 'Usuario';
  const iniciales = msg.usuario?.iniciales ?? '??';
  const color = msg.usuario?.color ?? '#64748b';

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        flexDirection: esMio ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
      }}
    >
      {!esMio && <AvatarChip iniciales={iniciales} color={color} size={26} />}
      <div style={{ maxWidth: '72%' }}>
        {mostrarNombre && !esMio && (
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#003B5C',
              marginBottom: 2,
              marginLeft: 2,
            }}
          >
            {nombre.split(' ')[0]}
          </p>
        )}
        <div
          style={{
            padding: '7px 11px',
            borderRadius: esMio ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
            background: esMio ? '#009ee3' : 'white',
            color: esMio ? 'white' : '#1e293b',
            fontSize: 12,
            lineHeight: 1.5,
            border: esMio ? 'none' : '1px solid #e2e8f0',
            wordBreak: 'break-word',
          }}
        >
          {msg.mensaje}
        </div>
        <p
          style={{
            fontSize: 9,
            color: '#94a3b8',
            marginTop: 2,
            textAlign: esMio ? 'right' : 'left',
          }}
        >
          {fmtHora(msg.created_at)}
        </p>
      </div>
      {esMio && <AvatarChip iniciales={iniciales} color={color} size={26} />}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  usuarioId: string;
  nombre: string;
  iniciales: string;
  color: string;
  totalEquipo: number; // para el indicador "4/5"
}

// ── Componente principal ───────────────────────────────────────────────────

export default function ChatPanel({
  usuarioId,
  nombre,
  iniciales,
  color,
  totalEquipo,
}: ChatPanelProps) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [tieneNuevo, setTieneNuevo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevCount = useRef(0);

  const { mensajes, conectados, cargando, enviarMensaje } = useChat({
    usuarioId,
    nombre,
    iniciales,
    color,
  });

  // ── Scroll al último mensaje al abrir o al llegar uno nuevo ──────────
  useEffect(() => {
    if (abierto) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTieneNuevo(false);
    }
  }, [abierto, mensajes.length]);

  // ── Badge de nuevo mensaje cuando el panel está cerrado ───────────────
  useEffect(() => {
    if (!abierto && mensajes.length > prevCount.current) {
      setTieneNuevo(true);
    }
    prevCount.current = mensajes.length;
  }, [mensajes.length, abierto]);

  // ── Separadores de fecha ──────────────────────────────────────────────
  function necesitaSeparador(i: number): boolean {
    if (i === 0) return true;
    const prev = new Date(mensajes[i - 1].created_at).toDateString();
    const curr = new Date(mensajes[i].created_at).toDateString();
    return prev !== curr;
  }

  // ── Enviar ────────────────────────────────────────────────────────────
  async function handleEnviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setTexto('');
    await enviarMensaje(t);
    setEnviando(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        right: 20,
        width: 340,
        zIndex: 200,
        fontFamily: "'Nunito', sans-serif",
      }}
    >
      {/* ── Panel expandido ─────────────────────────────────────── */}
      {abierto && (
        <div
          style={{
            height: 480,
            background: 'white',
            borderRadius: '14px 14px 0 0',
            border: '1px solid #e2e8f0',
            borderBottom: 'none',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.10)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '11px 14px',
              background: '#003B5C',
              borderRadius: '14px 14px 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ color: 'white', fontWeight: 700, fontSize: 13, margin: 0 }}>
                💬 Equipo C&C
              </p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, margin: 0 }}>
                {conectados.length}/{totalEquipo} conectados ahora
              </p>
            </div>
            {/* Avatares de conectados */}
            <div style={{ display: 'flex' }}>
              {conectados.slice(0, 4).map((u, i) => (
                <div key={u.usuario_id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                  <AvatarChip iniciales={u.iniciales} color={u.color} size={22} />
                </div>
              ))}
            </div>
            {/* Botón cerrar */}
            <button
              onClick={() => setAbierto(false)}
              style={{
                color: 'rgba(255,255,255,0.6)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <ChevronDown size={16} />
            </button>
          </div>

          {/* Mensajes */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 12px 6px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: '#f8fafc',
            }}
          >
            {cargando ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 20 }}>
                Cargando mensajes…
              </div>
            ) : mensajes.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 20 }}>
                Sin mensajes aún. ¡Escribí el primero!
              </div>
            ) : (
              mensajes.map((msg, i) => (
                <div key={msg.id}>
                  {necesitaSeparador(i) && (
                    <div style={{ textAlign: 'center', margin: '4px 0' }}>
                      <span
                        style={{
                          fontSize: 10,
                          color: '#94a3b8',
                          background: '#e8edf2',
                          padding: '2px 10px',
                          borderRadius: 99,
                        }}
                      >
                        {fmtFechaChat(msg.created_at)}
                      </span>
                    </div>
                  )}
                  <BurbujaMensaje
                    msg={msg}
                    esMio={msg.usuario_id === usuarioId}
                    mostrarNombre={i === 0 || mensajes[i - 1].usuario_id !== msg.usuario_id}
                  />
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: '10px 10px 12px',
              borderTop: '1px solid #e2e8f0',
              background: 'white',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <input
              ref={inputRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un mensaje al equipo…"
              maxLength={1000}
              disabled={enviando}
              style={{
                flex: 1,
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '8px 12px',
                fontSize: 12,
                outline: 'none',
                fontFamily: 'inherit',
                color: '#1e293b',
              }}
            />
            <button
              onClick={handleEnviar}
              disabled={!texto.trim() || enviando}
              style={{
                width: 34,
                height: 34,
                background: texto.trim() ? '#009ee3' : '#e2e8f0',
                borderRadius: 9,
                border: 'none',
                cursor: texto.trim() ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s',
              }}
            >
              <Send size={14} color={texto.trim() ? 'white' : '#94a3b8'} />
            </button>
          </div>
        </div>
      )}

      {/* ── Botón flotante (panel cerrado) ──────────────────────── */}
      <button
        onClick={() => {
          setAbierto((v) => !v);
          setTieneNuevo(false);
        }}
        style={{
          width: '100%',
          padding: '10px 16px',
          background: abierto ? '#002d47' : '#003B5C',
          border: 'none',
          borderRadius: abierto ? 0 : '12px 12px 0 0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 16 }}>💬</span>
        <span style={{ color: 'white', fontWeight: 700, fontSize: 13, flex: 1, textAlign: 'left' }}>
          Equipo C&C
        </span>
        {/* Indicador de conectados */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#22c55e',
              display: 'inline-block',
            }}
          />
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>
            {conectados.length}/{totalEquipo}
          </span>
        </span>
        {/* Badge de mensaje nuevo */}
        {tieneNuevo && !abierto && (
          <span
            style={{
              background: '#dc2626',
              color: 'white',
              fontSize: 9,
              fontWeight: 800,
              padding: '1px 5px',
              borderRadius: 99,
              animation: 'pulse 1s infinite',
            }}
          >
            NUEVO
          </span>
        )}
        <X
          size={14}
          color="rgba(255,255,255,0.4)"
          style={{
            transform: abierto ? 'rotate(0)' : 'rotate(45deg)',
            transition: 'transform 0.2s',
          }}
        />
      </button>
    </div>
  );
}
```

- [ ] **Paso 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Salida esperada: sin errores.

- [ ] **Paso 3: Commit**

```bash
git add src/components/layout/ChatPanel.tsx
git commit -m "feat: ChatPanel componente flotante del equipo"
```

---

### Task 8: Montar ChatPanel en el layout + pasar props

**Archivos:**

- Modificar: `src/app/(app)/layout.tsx`
- Modificar: `src/components/layout/client-wrapper.tsx`

**Contexto:** El layout es un Server Component y tiene acceso al perfil del usuario y a `usuarioId`. El `ChatPanel` es un Client Component. La forma más limpia es pasar las props necesarias al `ClientWrapper` y que éste monte el panel.

- [ ] **Paso 1: Actualizar la interfaz de `ClientWrapper`**

En `src/components/layout/client-wrapper.tsx`, actualizar la interfaz `Props` y el componente:

```typescript
'use client'

import { useEffect }         from 'react'
import { useRouter }         from 'next/navigation'
import { createClient }      from '@/lib/supabase/client'
import { useSessionTimeout } from '@/hooks/useSessionTimeout'
import SessionTimeoutModal   from '@/components/session-timeout-modal'
import ChatPanel             from '@/components/layout/ChatPanel'

interface Props {
  children:     React.ReactNode
  // Props para el ChatPanel
  usuarioId:    string
  nombre:       string
  iniciales:    string
  color:        string
  totalEquipo:  number
}

export default function ClientWrapper({
  children, usuarioId, nombre, iniciales, color, totalEquipo,
}: Props) {
  const router = useRouter()
  const { showWarning, secondsLeft, resetTimer, closeSession } = useSessionTimeout()

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        router.push('/login')
      }
    })
    return () => subscription.unsubscribe()
  }, [router])

  return (
    <>
      {children}
      {showWarning && (
        <SessionTimeoutModal
          secondsLeft={secondsLeft}
          onContinue={resetTimer}
          onClose={closeSession}
        />
      )}
      {/* Chat flotante — solo cuando el usuario está identificado */}
      {usuarioId && (
        <ChatPanel
          usuarioId={usuarioId}
          nombre={nombre}
          iniciales={iniciales}
          color={color}
          totalEquipo={totalEquipo}
        />
      )}
    </>
  )
}
```

- [ ] **Paso 2: Pasar las props desde el layout**

En `src/app/(app)/layout.tsx`, necesitamos el total de usuarios activos para el indicador. Agregar esta query después de la carga de `usuarioId`:

```typescript
// Total de usuarios activos (para el indicador de presencia del chat)
let totalEquipo = 5; // fallback — 5 miembros del equipo C&C
try {
  const { count } = await supabase
    .from('usuarios')
    .select('*', { count: 'exact', head: true })
    .eq('activo', true);
  if (count) totalEquipo = count;
} catch {
  /* fallback al valor hardcodeado */
}
```

Luego, actualizar la llamada a `<ClientWrapper>`:

```tsx
<ClientWrapper
  usuarioId={usuarioId}
  nombre={perfil.nombre}
  iniciales={perfil.iniciales}
  color={perfil.color}
  totalEquipo={totalEquipo}
>
  {children}
</ClientWrapper>
```

- [ ] **Paso 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Salida esperada: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add src/app/(app)/layout.tsx src/components/layout/client-wrapper.tsx
git commit -m "feat: montar ChatPanel en el layout global de la app"
```

---

### Task 9: Deploy y verificación end-to-end

- [ ] **Paso 1: Push final a main**

```bash
git push origin master
```

Verificar en Vercel dashboard que el deploy completa sin errores de build.

- [ ] **Paso 2: Verificar notificaciones en tiempo real**

1. Abrir el SIC en dos navegadores diferentes (sesiones distintas).
2. En el browser A, crear una gestión que genere una notificación (o insertar una notificación de prueba directo en Supabase).
3. Verificar que en el browser B el badge de la campana se actualiza **sin recargar la página**.

- [ ] **Paso 3: Verificar las tabs de filtro**

1. Abrir el panel de notificaciones.
2. Hacer click en "Promesas" — solo deben aparecer notificaciones de tipo `PROMESA`.
3. Hacer click en "Alertas" — solo deben aparecer las de tipo `ALERTA`.
4. Hacer click en "Todas" — vuelven a aparecer todas.

- [ ] **Paso 4: Verificar que los badges del sidebar desaparecieron**

Confirmar que en el sidebar ya no aparecen los números rojos sobre Gestiones, Promesas ni Solicitudes.

- [ ] **Paso 5: Verificar el chat**

1. Abrir la app como Jeffrey (coordinador).
2. Confirmar que el panel flotante de chat aparece en la esquina inferior derecha.
3. Hacer click en el panel para abrirlo.
4. Escribir un mensaje y enviarlo con Enter o el botón.
5. Abrir la app en otro browser como María Paola.
6. Verificar que el mensaje de Jeffrey aparece en tiempo real en el panel de María.
7. Verificar que el indicador de presencia muestra correctamente cuántos están conectados.

- [ ] **Paso 6: Verificar el badge de mensaje nuevo**

1. Con el panel cerrado en el browser de María, Jeffrey envía un mensaje.
2. Verificar que aparece el badge "NUEVO" parpadeante en el botón del chat.
3. Al abrir el panel, el badge desaparece.
