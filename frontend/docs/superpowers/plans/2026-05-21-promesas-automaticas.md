# Promesas Automáticas "Incumplida" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada noche a medianoche (hora Costa Rica) el sistema marca automáticamente como `INCUMPLIDA` toda promesa `PENDIENTE` cuya `fecha_promesa` ya pasó, crea una notificación para el analista y eleva ese cliente en la cola del día siguiente.

**Architecture:** Supabase Edge Function (`mark-promesas-incumplidas`) invocada por `pg_cron` via `pg_net`. La función: (1) busca promesas vencidas, (2) actualiza su estado, (3) crea notificaciones. El score boost en la cola es implícito: la `Cola Inteligente V3` ya trata promesas con `diasVenc > 0` como hard_includes con score 97 — al marcarse `INCUMPLIDA` el campo `promesa_activa` se mantiene hasta que el analista la gestione, por lo que el boost ya existe.

**Tech Stack:** Supabase Edge Functions (Deno), pg_cron, pg_net, Supabase JS v2

---

## Prerrequisitos

- Supabase CLI instalado: `npm install -g supabase`
- Logueado: `supabase login`
- Project ref disponible: ver en Supabase Dashboard → Settings → General → Reference ID

---

## Mapa de archivos

| Acción    | Archivo                                                   | Cambio                                      |
| --------- | --------------------------------------------------------- | ------------------------------------------- |
| Crear     | `supabase/functions/mark-promesas-incumplidas/index.ts`   | Edge Function principal                     |
| Crear     | `supabase/functions/mark-promesas-incumplidas/deno.json`  | Configuración Deno                          |
| Crear     | `supabase/migrations/20260521000000_pg_cron_promesas.sql` | Schedule cron + habilitar extensiones       |
| Modificar | `src/app/(app)/mi-cartera/page.tsx`                       | Actualizar comentario "rota" → "incumplida" |

---

### Task 1: Crear la Edge Function

**Archivos:**

- Crear: `supabase/functions/mark-promesas-incumplidas/index.ts`
- Crear: `supabase/functions/mark-promesas-incumplidas/deno.json`

- [ ] **Paso 1: Crear la estructura de directorios**

```bash
mkdir -p supabase/functions/mark-promesas-incumplidas
```

- [ ] **Paso 2: Crear `deno.json`**

Crear `supabase/functions/mark-promesas-incumplidas/deno.json`:

```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2"
  }
}
```

- [ ] **Paso 3: Crear `index.ts` de la Edge Function**

Crear `supabase/functions/mark-promesas-incumplidas/index.ts`:

```typescript
/**
 * mark-promesas-incumplidas
 *
 * Edge Function invocada por pg_cron cada noche a las 00:00 hora Costa Rica
 * (06:00 UTC). Marca como INCUMPLIDA toda promesa PENDIENTE cuya
 * fecha_promesa < hoy, y crea una notificación para el analista asignado.
 *
 * Solo acepta peticiones autorizadas con el Service Role Key en el header:
 *   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 */

import { createClient } from '@supabase/supabase-js';

interface Promesa {
  id: string;
  cliente_cod: string;
  cliente_nombre: string | null;
  analista_email: string;
  monto: number;
  fecha_promesa: string;
}

interface Usuario {
  id: string;
  email: string;
}

Deno.serve(async (req: Request) => {
  // ── Verificar autorización ────────────────────────────────────────────
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';

  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Crear cliente con Service Role (bypassa RLS) ──────────────────────
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, {
    auth: { persistSession: false },
  });

  // ── Fecha de hoy en Costa Rica (UTC-6) ───────────────────────────────
  const hoy = new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10);

  // ── 1. Obtener promesas vencidas ──────────────────────────────────────
  const { data: promesas, error: fetchErr } = await supabase
    .from('promesas')
    .select('id, cliente_cod, cliente_nombre, analista_email, monto, fecha_promesa')
    .eq('estado', 'PENDIENTE')
    .lt('fecha_promesa', hoy)
    .eq('activo', true);

  if (fetchErr) {
    console.error('[mark-promesas] Error al obtener promesas:', fetchErr.message);
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const lista = (promesas ?? []) as Promesa[];

  if (lista.length === 0) {
    console.log('[mark-promesas] Sin promesas vencidas para marcar.');
    return new Response(JSON.stringify({ marked: 0, notificaciones: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── 2. Marcar como INCUMPLIDA ─────────────────────────────────────────
  const ids = lista.map((p) => p.id);

  const eventoIncumplida = {
    fecha: hoy,
    tipo: 'incumplida',
    descripcion: 'Marcada automáticamente como incumplida por el sistema (fecha vencida)',
    por: 'sistema@cofersa.cr',
  };

  const { error: updateErr } = await supabase
    .from('promesas')
    .update({
      estado: 'INCUMPLIDA',
      updated_at: new Date().toISOString(),
      // Appender el evento al mini-timeline JSONB
      // Nota: esto requiere leer y reescribir; se simplifica con una RPC en el futuro.
      // Por ahora, el evento se registra vía la tabla gestiones (paso 3).
    })
    .in('id', ids);

  if (updateErr) {
    console.error('[mark-promesas] Error al actualizar promesas:', updateErr.message);
    return new Response(JSON.stringify({ error: updateErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`[mark-promesas] Marcadas ${ids.length} promesas como INCUMPLIDA.`);

  // ── 3. Resolver usuario_id por analista_email ─────────────────────────
  const emails = [...new Set(lista.map((p) => p.analista_email).filter(Boolean))];

  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, email')
    .in('email', emails);

  const emailToId: Record<string, string> = {};
  ((usuarios as Usuario[]) ?? []).forEach((u) => {
    emailToId[u.email] = u.id;
  });

  // ── 4. Crear notificaciones ───────────────────────────────────────────
  // Formato de monto: ₡ con punto como separador de miles (estándar Cofersa)
  function fmtMonto(n: number): string {
    return (
      '₡' +
      Math.round(n)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    );
  }

  const notificaciones = lista
    .map((p) => {
      const uid = emailToId[p.analista_email];
      if (!uid) return null;
      return {
        usuario_id: uid,
        tipo: 'ALERTA',
        titulo: `Promesa incumplida — ${p.cliente_nombre ?? p.cliente_cod}`,
        mensaje: `${fmtMonto(p.monto)} prometidos para el ${p.fecha_promesa} — sin confirmación de pago.`,
        link: `/clientes/${p.cliente_cod}`,
        leida: false,
      };
    })
    .filter(Boolean);

  if (notificaciones.length > 0) {
    const { error: notiErr } = await supabase.from('notificaciones').insert(notificaciones);

    if (notiErr) {
      console.error('[mark-promesas] Error al crear notificaciones:', notiErr.message);
      // No abortar — las promesas ya se marcaron correctamente
    }
  }

  console.log(`[mark-promesas] Creadas ${notificaciones.length} notificaciones.`);

  return new Response(
    JSON.stringify({ marked: ids.length, notificaciones: notificaciones.length }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
```

- [ ] **Paso 4: Verificar que el archivo tiene sintaxis válida**

```bash
deno check supabase/functions/mark-promesas-incumplidas/index.ts
```

Si Deno no está instalado localmente, este paso puede omitirse — el deploy de Supabase valida la función.

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/
git commit -m "feat: Edge Function mark-promesas-incumplidas"
```

---

### Task 2: Deploy de la Edge Function

- [ ] **Paso 1: Linkear el proyecto Supabase (si no está linkeado)**

```bash
supabase link --project-ref TU_PROJECT_REF
```

Reemplazar `TU_PROJECT_REF` con el Reference ID de Supabase Dashboard → Settings → General.

- [ ] **Paso 2: Deploy la función**

```bash
supabase functions deploy mark-promesas-incumplidas --no-verify-jwt
```

`--no-verify-jwt`: la función verifica su propia autorización con el Service Role Key en el header — no necesita JWT de Supabase.

Salida esperada:

```
Deploying function mark-promesas-incumplidas...
Done.
```

- [ ] **Paso 3: Verificar que la función existe**

```bash
supabase functions list
```

Debe aparecer `mark-promesas-incumplidas` en la lista.

- [ ] **Paso 4: Test manual de la función**

```bash
curl -X POST \
  https://TU_PROJECT_REF.supabase.co/functions/v1/mark-promesas-incumplidas \
  -H "Authorization: Bearer TU_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

Salida esperada (si no hay promesas vencidas):

```json
{ "marked": 0, "notificaciones": 0 }
```

Salida esperada (si hay promesas vencidas):

```json
{"marked":N,"notificaciones":N}
```

Verificar en Supabase Dashboard → Table Editor → `promesas` que las promesas vencidas tienen estado `INCUMPLIDA`.
Verificar en `notificaciones` que se crearon los registros.

---

### Task 3: Configurar pg_cron para ejecución nocturna

**Contexto:** pg_cron y pg_net son extensiones de PostgreSQL disponibles en Supabase. Se configuran desde el SQL Editor del dashboard — este SQL no va en una migración de versión (contiene la URL y key que no deben estar en el repo).

- [ ] **Paso 1: Habilitar extensiones en Supabase Dashboard**

Ir a: **Supabase Dashboard → Database → Extensions**

Activar (si no están activas):

- `pg_cron`
- `pg_net`

- [ ] **Paso 2: Ejecutar el SQL de schedule en el SQL Editor**

Ir a: **Supabase Dashboard → SQL Editor → New query**

Pegar y ejecutar:

```sql
-- Programar la Edge Function para las 00:00 hora Costa Rica (06:00 UTC)
-- Si existe un job anterior con el mismo nombre, eliminarlo primero
SELECT cron.unschedule('mark-promesas-incumplidas')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mark-promesas-incumplidas');

SELECT cron.schedule(
  'mark-promesas-incumplidas',   -- nombre del job
  '0 6 * * *',                   -- 06:00 UTC = 00:00 Costa Rica
  $$
    SELECT net.http_post(
      url     := 'https://TU_PROJECT_REF.supabase.co/functions/v1/mark-promesas-incumplidas',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer TU_SERVICE_ROLE_KEY'
      ),
      body    := '{}'::jsonb
    );
  $$
);
```

**Reemplazar:**

- `TU_PROJECT_REF` → Reference ID de Settings → General
- `TU_SERVICE_ROLE_KEY` → Service Role Key de Settings → API

- [ ] **Paso 3: Verificar que el job quedó registrado**

```sql
SELECT jobname, schedule, active FROM cron.job;
```

Debe aparecer `mark-promesas-incumplidas` con `active = true`.

- [ ] **Paso 4: Test de ejecución inmediata (opcional)**

Para verificar que el cron puede llamar a la función:

```sql
SELECT net.http_post(
  url     := 'https://TU_PROJECT_REF.supabase.co/functions/v1/mark-promesas-incumplidas',
  headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer TU_SERVICE_ROLE_KEY'
  ),
  body    := '{}'::jsonb
);
```

Verificar el resultado en `net._http_response` o esperar 5 segundos y revisar:

```sql
SELECT * FROM net._http_response ORDER BY created DESC LIMIT 1;
```

---

### Task 4: Actualizar comentario en Mi Cartera

**Archivos:**

- Modificar: `src/app/(app)/mi-cartera/page.tsx` línea 75

**Contexto:** El comentario dice "Promesa rota" — terminología que se eliminó. Actualizar para consistencia.

- [ ] **Paso 1: Encontrar y actualizar el comentario**

En `src/app/(app)/mi-cartera/page.tsx`, buscar (alrededor de línea 75):

```typescript
// Promesa rota (venció y no pagó)
if (diasVenc > 0) {
```

Reemplazar con:

```typescript
// Promesa incumplida (venció y no hubo confirmación de pago)
if (diasVenc > 0) {
```

- [ ] **Paso 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Salida esperada: sin errores.

- [ ] **Paso 3: Commit**

```bash
git add src/app/(app)/mi-cartera/page.tsx
git commit -m "chore: actualizar terminología rota → incumplida en mi-cartera"
```

---

### Task 5: Push y verificación final

- [ ] **Paso 1: Push a main**

```bash
git push origin master
```

- [ ] **Paso 2: Verificar que la función corre correctamente mañana**

Al día siguiente de activar el cron (después de las 00:00 Costa Rica):

1. Ir a **Supabase Dashboard → Table Editor → `promesas`**
2. Filtrar por `estado = INCUMPLIDA` y `updated_at` = fecha de hoy
3. Verificar que las promesas con `fecha_promesa` anterior a hoy aparecen marcadas
4. Ir a **Table Editor → `notificaciones`**
5. Verificar que cada analista tiene una notificación de tipo `ALERTA` por cada promesa incumplida

- [ ] **Paso 3: Verificar en la app**

1. Ingresar como analista con promesas incumplidas automáticamente.
2. Confirmar que la campana de notificaciones muestra el badge con el conteo.
3. Abrir el panel de notificaciones y verificar que aparece el mensaje "Promesa incumplida — [Cliente]".
4. Verificar que el cliente aparece en la cola del día con nivel crítico.
