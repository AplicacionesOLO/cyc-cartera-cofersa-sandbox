# Email + Sesión — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantizar que el envío de estado de cuenta via Gmail API funcione siempre, y que cuando la sesión de Supabase expire la app redirija al login en vez de romperse.

**Architecture:** El `provider_refresh_token` de Google solo se emite cuando se solicita `access_type: offline` **y** `prompt: consent`. La app ya tiene `offline` configurado pero le falta `consent`, por lo que los usuarios actuales no tienen refresh token. Con ese parámetro agregado, `gmail-token.ts` (ya existente) renueva el provider_token automáticamente. El listener `onAuthStateChange` en `ClientWrapper` maneja expiración real de sesión Supabase.

**Tech Stack:** Next.js 14, Supabase Auth, Google OAuth, Gmail API

---

## Mapa de archivos

| Acción    | Archivo                                    | Cambio                                          |
| --------- | ------------------------------------------ | ----------------------------------------------- |
| Modificar | `src/app/login/page.tsx`                   | Agregar `prompt: 'consent'` a queryParams OAuth |
| Modificar | `src/components/layout/client-wrapper.tsx` | Agregar listener `onAuthStateChange`            |

---

### Task 1: Agregar `prompt: consent` al login OAuth

**Archivos:**

- Modificar: `src/app/login/page.tsx` líneas 30-37

**Contexto:** Sin `prompt: 'consent'`, Google solo emite un `refresh_token` en la primera autorización. Los usuarios actuales autorizaron la app antes de que existiera este parámetro — su `provider_refresh_token` es null. Con `prompt: 'consent'` Google siempre emite un refresh token fresco, incluso si ya autorizaron antes.

- [ ] **Paso 1: Localizar el bloque `queryParams` en el login**

Abrir `src/app/login/page.tsx`. Buscar el bloque `queryParams` dentro de `signInWithOAuth` (alrededor de línea 30).

Estado actual:

```typescript
queryParams: {
  access_type: 'offline',
  // Sin 'prompt': Google entra directo si ya hay sesión activa y
  // la app fue autorizada antes. Solo muestra pantalla en el primer login.
},
```

- [ ] **Paso 2: Agregar `prompt: 'consent'`**

```typescript
queryParams: {
  // 'offline' emite el refresh_token (largo plazo) además del access_token
  access_type: 'offline',
  // 'consent' fuerza a Google a re-emitir el refresh_token en cada login.
  // Necesario para usuarios que autorizaron la app antes de que configuráramos offline.
  prompt: 'consent',
},
```

- [ ] **Paso 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Salida esperada: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "fix: agregar prompt consent al OAuth para garantizar refresh_token de Gmail"
```

---

### Task 2: Agregar listener de sesión en ClientWrapper

**Archivos:**

- Modificar: `src/components/layout/client-wrapper.tsx`

**Contexto:** El hook `useSessionTimeout` maneja inactividad (30 min). Pero si la sesión de Supabase expira por otra razón (sesión en otro dispositivo revocada, token expirado del servidor), Supabase dispara el evento `SIGNED_OUT`. Sin un listener, la app queda rota sin redirigir al login.

- [ ] **Paso 1: Agregar imports necesarios**

Abrir `src/components/layout/client-wrapper.tsx`. El archivo actual importa:

```typescript
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import SessionTimeoutModal from '@/components/session-timeout-modal';
```

Agregar al inicio:

```typescript
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
```

- [ ] **Paso 2: Agregar el hook `useAuthListener` dentro del componente**

Reemplazar el contenido completo de `ClientWrapper` con:

```typescript
'use client'

/**
 * ClientWrapper
 *
 * Componente cliente que envuelve el contenido de la app autenticada.
 * Se encarga de:
 *   1. Montar el hook useSessionTimeout (inactividad 30 min)
 *   2. Mostrar el SessionTimeoutModal cuando corresponde
 *   3. Escuchar eventos de auth de Supabase y redirigir al login si la sesión expira
 */

import { useEffect }         from 'react'
import { useRouter }         from 'next/navigation'
import { createClient }      from '@/lib/supabase/client'
import { useSessionTimeout } from '@/hooks/useSessionTimeout'
import SessionTimeoutModal   from '@/components/session-timeout-modal'

interface Props {
  children: React.ReactNode
}

export default function ClientWrapper({ children }: Props) {
  const router = useRouter()
  const { showWarning, secondsLeft, resetTimer, closeSession } = useSessionTimeout()

  // ── Listener de eventos de autenticación Supabase ─────────────────────
  // Complementa useSessionTimeout (inactividad) cubriendo expiración real
  // de sesión Supabase: token revocado desde otro dispositivo o servidor.
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        // La sesión expiró o fue revocada — redirigir al login limpiamente
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
    </>
  )
}
```

- [ ] **Paso 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Salida esperada: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add src/components/layout/client-wrapper.tsx
git commit -m "fix: agregar listener onAuthStateChange para redirigir al login cuando expira sesión Supabase"
```

---

### Task 3: Deploy y verificación

- [ ] **Paso 1: Push a main**

```bash
git push origin master
```

Verificar en Vercel dashboard que el deploy completa sin errores.

- [ ] **Paso 2: Notificar al equipo — acción requerida una sola vez**

Enviar mensaje al equipo:

> _"Hubo una mejora en el sistema. Para que el envío de estados de cuenta funcione sin interrupciones, necesito que cada uno cierre sesión en el SIC y vuelva a entrar con su cuenta de Google. Solo hay que hacerlo esta vez. Gracias."_

- [ ] **Paso 3: Verificar que el refresh token llega**

Después de que los analistas vuelvan a entrar, verificar en **Supabase Dashboard → Authentication → Users** que el usuario tiene `provider_refresh_token` en su metadata (columna `raw_user_meta_data` o en el panel de Auth).

Alternativamente, en la consola del navegador (con la sesión activa):

```javascript
const {
  data: { session },
} = await supabase.auth.getSession();
console.log('refresh token:', session?.provider_refresh_token ? '✅ presente' : '❌ null');
```

Resultado esperado: `✅ presente`

- [ ] **Paso 4: Probar envío de estado de cuenta**

1. Abrir el SIC con la sesión recién renovada.
2. Ir a la ficha de un cliente con correo registrado.
3. Click en "Enviar estado de cuenta".
4. Esperar al menos **65 minutos** (para que el provider_token expire).
5. Sin cerrar sesión, volver a enviar otro estado de cuenta a otro cliente.
6. Verificar que el correo llega sin mensaje de error.

Resultado esperado: el correo llega al destinatario y la app muestra el toast de confirmación.
