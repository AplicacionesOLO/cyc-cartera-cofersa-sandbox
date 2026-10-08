# Mejoras pagos diarios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aprovechar la carga diaria de pagos para (2) auto-conciliar promesas vencidas contra pagos reales, (3) limpiar y paginar la página de Promesas, y (1) mostrar una señal de pago reciente en la cola del analista.

**Architecture:** Pieza 2 es una función Postgres (`fn_conciliar_promesas`) disparada por pg_cron de noche, siguiendo el patrón ya usado por `fn_sync_pagos`/`fn_cron_cierre_mensual`; reemplaza la llamada HTTP a la edge function `mark-promesas-incumplidas`. Piezas 1 y 3 son cambios en React/TypeScript sobre componentes existentes.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Supabase (PostgreSQL + pg_cron) · Tailwind. Sin test runner — verificación: `npx tsc --noEmit` + `npm run build`, y para SQL, consultas de verificación vía el MCP de Supabase (`execute_sql`/`apply_migration`).

**Project ID Supabase:** `swkmrufsyhnaeoijasrz`

---

## File Structure

| Archivo                                                    | Responsabilidad                           | Acción                       |
| ---------------------------------------------------------- | ----------------------------------------- | ---------------------------- |
| `supabase/migrations/20260615_fn_conciliar_promesas.sql`   | Función SQL de conciliación               | Crear                        |
| `supabase/migrations/20260615_cron_conciliar_promesas.sql` | Repuntar el cron nocturno                 | Crear                        |
| `supabase/functions/mark-promesas-incumplidas/index.ts`    | Edge function (queda obsoleta)            | Modificar (marcar deprecada) |
| `src/components/promesas/tabla-promesas.tsx`               | Página de Promesas (chips + paginación)   | Modificar                    |
| `src/lib/utils/cola-analista.ts`                           | Cola del analista (campo `pago_reciente`) | Modificar                    |
| `src/components/cartera/mi-cartera-view.tsx`               | Render del badge de pago reciente         | Modificar                    |

---

# PIEZA 2 — Auto-conciliación de promesas

### Task 1: Función SQL `fn_conciliar_promesas`

**Files:**

- Create: `supabase/migrations/20260615_fn_conciliar_promesas.sql`

- [ ] **Step 1: Escribir el archivo de migración con la función completa**

Crear `supabase/migrations/20260615_fn_conciliar_promesas.sql` con exactamente este contenido:

```sql
-- ================================================================
-- fn_conciliar_promesas
-- Concilia promesas PENDIENTE vencidas contra pagos reales.
-- Reemplaza la lógica de la edge function mark-promesas-incumplidas.
--   pagos acumulados >= monto   -> CUMPLIDA
--   0 < pagos < monto           -> ABONO_PARCIAL (monto_abono_parcial = asignado)
--   sin pagos                   -> INCUMPLIDA
-- Asignación greedy más-antigua-primero por cliente, sin doble conteo.
-- ================================================================
CREATE OR REPLACE FUNCTION public.fn_conciliar_promesas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoy          date := (now() AT TIME ZONE 'America/Costa_Rica')::date;
  v_cur_client   text := NULL;
  v_pool         numeric := 0;
  v_window_start date;
  v_asignado     numeric;
  v_estado       text;
  v_tipo_ev      text;
  v_desc         text;
  v_uid          uuid;
  v_monto_str    text;
  v_cumplidas    int := 0;
  v_abonos       int := 0;
  v_incumplidas  int := 0;
  v_notis        int := 0;
  rec            record;
BEGIN
  FOR rec IN
    SELECT id, cliente_cod, cliente_nombre, analista_email, monto, fecha_promesa, fecha_creacion
    FROM promesas
    WHERE estado = 'PENDIENTE'
      AND activo IS NOT FALSE
      AND fecha_promesa < v_hoy
    ORDER BY cliente_cod, fecha_promesa ASC, fecha_creacion ASC
  LOOP
    -- Nuevo cliente: recomputar pool de pagos disponible
    IF rec.cliente_cod IS DISTINCT FROM v_cur_client THEN
      v_cur_client := rec.cliente_cod;

      -- Ventana: desde la promesa pendiente más antigua, nunca antes de la
      -- última validación de una promesa ya cerrada (evita reutilizar pagos).
      SELECT GREATEST(
               (SELECT MIN(p2.fecha_creacion)
                  FROM promesas p2
                 WHERE p2.cliente_cod = rec.cliente_cod
                   AND p2.estado = 'PENDIENTE'
                   AND p2.activo IS NOT FALSE
                   AND p2.fecha_promesa < v_hoy),
               COALESCE((SELECT MAX(p3.fecha_validacion)
                  FROM promesas p3
                 WHERE p3.cliente_cod = rec.cliente_cod
                   AND p3.estado IN ('CUMPLIDA','ABONO_PARCIAL')
                   AND p3.fecha_validacion IS NOT NULL), DATE '1900-01-01')
             )
        INTO v_window_start;

      SELECT COALESCE(SUM(pg.monto_pago), 0)
        INTO v_pool
        FROM pagos pg
       WHERE pg.cliente_cod = rec.cliente_cod
         AND pg.fecha_pago >= v_window_start
         AND pg.fecha_pago <= v_hoy;
    END IF;

    -- Asignación greedy (más antigua primero)
    IF v_pool >= rec.monto THEN
      v_asignado := rec.monto;  v_pool := v_pool - rec.monto;
      v_estado := 'CUMPLIDA';   v_tipo_ev := 'cumplida';
    ELSIF v_pool > 0 THEN
      v_asignado := v_pool;     v_pool := 0;
      v_estado := 'ABONO_PARCIAL'; v_tipo_ev := 'abono';
    ELSE
      v_asignado := 0;
      v_estado := 'INCUMPLIDA';  v_tipo_ev := 'incumplida';
    END IF;

    v_monto_str := '₡' || replace(to_char(round(v_asignado), 'FM999,999,999,990'), ',', '.');

    IF v_estado = 'CUMPLIDA' THEN
      v_desc := 'Conciliación automática: ' || v_monto_str || ' en pagos desde la promesa';
    ELSIF v_estado = 'ABONO_PARCIAL' THEN
      v_desc := 'Conciliación automática: abono de ' || v_monto_str || ' detectado (menor al monto prometido)';
    ELSE
      v_desc := 'Conciliación automática: sin pagos detectados desde la promesa';
    END IF;

    UPDATE promesas SET
      estado                = v_estado,
      fecha_validacion      = v_hoy,
      validado_por          = 'sistema',
      comentario_validacion = v_desc,
      monto_abono_parcial   = CASE WHEN v_estado = 'ABONO_PARCIAL' THEN v_asignado ELSE monto_abono_parcial END,
      eventos               = COALESCE(eventos, '[]'::jsonb) || jsonb_build_object(
                                'fecha',       v_hoy::text,
                                'tipo',        v_tipo_ev,
                                'descripcion', v_desc,
                                'por',         'sistema'
                              ),
      updated_at            = now()
    WHERE id = rec.id;

    IF    v_estado = 'CUMPLIDA'      THEN v_cumplidas   := v_cumplidas + 1;
    ELSIF v_estado = 'ABONO_PARCIAL' THEN v_abonos      := v_abonos + 1;
    ELSE                                  v_incumplidas := v_incumplidas + 1;
    END IF;

    SELECT id INTO v_uid FROM usuarios WHERE email = rec.analista_email LIMIT 1;
    IF v_uid IS NOT NULL THEN
      INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, link, leida)
      VALUES (
        v_uid, 'ALERTA',
        CASE v_estado
          WHEN 'CUMPLIDA'      THEN 'Promesa cumplida automáticamente — ' || COALESCE(rec.cliente_nombre, rec.cliente_cod)
          WHEN 'ABONO_PARCIAL' THEN 'Abono parcial detectado — '          || COALESCE(rec.cliente_nombre, rec.cliente_cod)
          ELSE                      'Promesa incumplida — '                || COALESCE(rec.cliente_nombre, rec.cliente_cod)
        END,
        v_desc, '/clientes/' || rec.cliente_cod, false
      );
      v_notis := v_notis + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'fecha', v_hoy, 'cumplidas', v_cumplidas, 'abonos', v_abonos,
    'incumplidas', v_incumplidas, 'notificaciones', v_notis
  );
END;
$$;
```

- [ ] **Step 2: Aplicar la migración a Supabase**

Usar el MCP de Supabase `apply_migration` con `project_id = swkmrufsyhnaeoijasrz`, `name = "fn_conciliar_promesas"` y el cuerpo SQL del Step 1.
Esperado: respuesta sin error.

- [ ] **Step 3: Preview seguro (sin persistir) y revisión del resumen**

Ejecutar vía MCP `execute_sql` (`project_id = swkmrufsyhnaeoijasrz`):

```sql
BEGIN;
SELECT public.fn_conciliar_promesas();
ROLLBACK;
```

Esperado: un objeto jsonb tipo `{"fecha":"2026-06-15","cumplidas":N,"abonos":N,"incumplidas":N,"notificaciones":N}`. El `ROLLBACK` deshace todos los cambios — es solo una vista previa. Revisar que los números sean razonables (no debería marcar todo incumplido si hay pagos).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260615_fn_conciliar_promesas.sql
git commit -m "feat(promesas): fn_conciliar_promesas — auto-concilia promesas vencidas con pagos"
```

---

### Task 2: Repuntar el cron nocturno a la función SQL

**Files:**

- Create: `supabase/migrations/20260615_cron_conciliar_promesas.sql`

Contexto: hoy el job `nightly-mark-promesas-incumplidas` (jobid 2, schedule `0 6 * * *` = 00:00 CR) hace `net.http_post` a la edge function. Se reemplaza por una llamada directa a la función SQL.

- [ ] **Step 1: Escribir el archivo de migración**

Crear `supabase/migrations/20260615_cron_conciliar_promesas.sql`:

```sql
-- Reemplaza el cron que llamaba la edge function por la función SQL nativa.
SELECT cron.unschedule('nightly-mark-promesas-incumplidas');
SELECT cron.schedule(
  'nightly-conciliar-promesas',
  '0 6 * * *',                       -- 00:00 hora Costa Rica (UTC-6)
  $$SELECT public.fn_conciliar_promesas();$$
);
```

- [ ] **Step 2: Aplicar la migración**

Usar el MCP `apply_migration` (`project_id = swkmrufsyhnaeoijasrz`, `name = "cron_conciliar_promesas"`, cuerpo del Step 1).
Esperado: sin error.

- [ ] **Step 3: Verificar el estado de los cron jobs**

Ejecutar vía MCP `execute_sql`:

```sql
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE '%promesas%' ORDER BY jobname;
```

Esperado: una sola fila `nightly-conciliar-promesas` con `schedule = '0 6 * * *'` y command `SELECT public.fn_conciliar_promesas();`. No debe quedar `nightly-mark-promesas-incumplidas`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260615_cron_conciliar_promesas.sql
git commit -m "chore(cron): apuntar conciliación nocturna a fn_conciliar_promesas"
```

---

### Task 3: Marcar la edge function como obsoleta

**Files:**

- Modify: `supabase/functions/mark-promesas-incumplidas/index.ts:1-11`

No se elimina (borrar una edge function requiere acción en el dashboard); solo se documenta que ya no se usa.

- [ ] **Step 1: Reemplazar el bloque de comentario de cabecera**

Reemplazar las líneas 1-11 (el comentario `/** ... */` actual) por:

```typescript
/**
 * mark-promesas-incumplidas — OBSOLETA (2026-06-15)
 *
 * Reemplazada por la función SQL public.fn_conciliar_promesas(), llamada por
 * el cron 'nightly-conciliar-promesas'. Esta edge function ya NO está
 * agendada y se conserva solo como referencia histórica. No invocar.
 *
 * Solo aceptaba peticiones con el Service Role Key en el header Authorization.
 */
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/mark-promesas-incumplidas/index.ts
git commit -m "docs(functions): marcar mark-promesas-incumplidas como obsoleta"
```

---

# PIEZA 3 — Rediseño de la página de Promesas

### Task 4: Eliminar chip redundante "Gestión origen"

**Files:**

- Modify: `src/components/promesas/tabla-promesas.tsx:440-454`

- [ ] **Step 1: Reemplazar los dos botones redundantes por uno solo**

En `PromesaCard`, reemplazar este bloque (líneas 440-454):

```tsx
        <button
          onClick={onVerCliente}
          className="flex items-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1.5 transition hover:opacity-80"
          style={{ backgroundColor: '#eef2f7', color: '#475569' }}
        >
          <ExternalLink size={11} /> Ver cliente
        </button>
        <button
          onClick={onVerCliente}
          className="flex items-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1.5 transition hover:opacity-80"
          style={{ backgroundColor: '#eef2f7', color: '#475569' }}
          title="Abre la ficha del cliente — pestaña Gestiones"
        >
          <FileText size={11} /> Gestión origen
        </button>
```

por:

```tsx
<button
  onClick={onVerCliente}
  className="flex items-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1.5 transition hover:opacity-80"
  style={{ backgroundColor: '#eef2f7', color: '#475569' }}
>
  <ExternalLink size={11} /> Ver ficha
</button>
```

- [ ] **Step 2: Verificar tipos y build**

Run: `npx tsc --noEmit`
Esperado: sin errores. (`FileText` sigue importado y usado en la sección "Gestión origen" del cuerpo de la card, línea ~388, así que no queda import sin usar.)

- [ ] **Step 3: Commit**

```bash
git add src/components/promesas/tabla-promesas.tsx
git commit -m "fix(promesas): eliminar chip redundante 'Gestión origen' en las tarjetas"
```

---

### Task 5: Paginación de tarjetas (12 por página)

**Files:**

- Modify: `src/components/promesas/tabla-promesas.tsx`

- [ ] **Step 1: Agregar constante e import de iconos**

En la línea 13 (`import { useState, useMemo } from 'react'`), agregar `useEffect`:

```tsx
import { useState, useMemo, useEffect } from 'react';
```

En el bloque de iconos `lucide-react` (líneas 15-19), agregar `ChevronLeft` y `ChevronRight` a la lista de imports existente (mantener los demás):

```tsx
import {
  Clock,
  CheckCircle2,
  XCircle,
  Coins,
  CalendarClock,
  CalendarDays,
  Search,
  User,
  ArrowRight,
  FileText,
  History,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  Handshake,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
```

- [ ] **Step 2: Agregar estado de paginación y reset por filtros**

Justo después de `const [expandido, setExpandido] = useState<Set<string>>(new Set())` (línea 119), agregar:

```tsx
const PROMESAS_POR_PAGINA = 12;
const [page, setPage] = useState(1);
useEffect(() => {
  setPage(1);
}, [estadoF, anaF, quick, busqueda]);
```

- [ ] **Step 3: Derivar la página visible y el total de páginas**

Inmediatamente después del `useMemo` de `filtradas` (después de la línea 173), agregar:

```tsx
const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PROMESAS_POR_PAGINA));
const pagina = Math.min(page, totalPaginas);
const visibles = filtradas.slice((pagina - 1) * PROMESAS_POR_PAGINA, pagina * PROMESAS_POR_PAGINA);
```

- [ ] **Step 4: Renderizar `visibles` en lugar de `filtradas` y agregar el pie de paginación**

Reemplazar el bloque de listado (líneas 273-289) que hace `filtradas.map(...)`:

```tsx
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filtradas.map(p => (
            <PromesaCard
              key={p.id}
              p={p}
              hoy={hoy}
              rol={rol}
              gestion={p.gestion_id ? gestionesMap[p.gestion_id] : undefined}
              expandido={expandido.has(p.id)}
              onToggleExp={() => toggleExp(p.id)}
              onVerCliente={() => router.push(`/clientes/${encodeURIComponent(p.cliente_cod)}`)}
              onAccion={(tipo) => setModal({ tipo, promesa: p })}
            />
          ))}
        </div>
      )}
```

por:

```tsx
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {visibles.map(p => (
              <PromesaCard
                key={p.id}
                p={p}
                hoy={hoy}
                rol={rol}
                gestion={p.gestion_id ? gestionesMap[p.gestion_id] : undefined}
                expandido={expandido.has(p.id)}
                onToggleExp={() => toggleExp(p.id)}
                onVerCliente={() => router.push(`/clientes/${encodeURIComponent(p.cliente_cod)}`)}
                onAccion={(tipo) => setModal({ tipo, promesa: p })}
              />
            ))}
          </div>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={pagina === 1}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 bg-white transition disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft size={13} /> Anterior
              </button>
              <span className="text-[12px] text-gray-500 font-semibold tabular-nums">
                Página {pagina} de {totalPaginas}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 bg-white transition disabled:opacity-40 hover:bg-gray-50"
              >
                Siguiente <ChevronRight size={13} />
              </button>
            </div>
          )}
        </>
      )}
```

- [ ] **Step 5: Verificar build**

Run: `npx tsc --noEmit && npm run build`
Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/promesas/tabla-promesas.tsx
git commit -m "feat(promesas): paginación de 12 tarjetas por página"
```

---

# PIEZA 1 — Señal de pago reciente en la cola

### Task 6: Campo `pago_reciente` en la cola del analista

**Files:**

- Modify: `src/lib/utils/cola-analista.ts`

- [ ] **Step 1: Agregar el campo al tipo `CarteraRow`**

En la interfaz `CarteraRow` (después de la línea 47 `icp_score: number | null`), agregar:

```ts
  pago_reciente:        { monto: number; dias: number } | null  // pago en últimos 5 días
```

- [ ] **Step 2: Agregar la constante de ventana**

Después de la línea 63 (`export const ICP_SMART_EXCLUDE = 80`), agregar:

```ts
export const VENTANA_PAGO_RECIENTE = 5; // días — ventana para la señal de pago reciente
```

- [ ] **Step 3: Consultar pagos recientes dentro de `computarColaDia`**

Después del bloque "7. ICP por cliente" (después de la línea 377, justo antes de `// 8. Construir CarteraRow[]`), agregar:

```ts
// 7b. Pago reciente por cliente (últimos VENTANA_PAGO_RECIENTE días)
const pagoRecienteMap: Record<string, { monto: number; dias: number }> = {};
{
  const desde = new Date(hoyMs - VENTANA_PAGO_RECIENTE * 86_400_000).toISOString().slice(0, 10);
  const { data: pagosData } = await supabase
    .from('pagos')
    .select('cliente_cod, fecha_pago, monto_pago')
    .in('cliente_cod', codigos)
    .gte('fecha_pago', desde);
  ((pagosData ?? []) as { cliente_cod: string; fecha_pago: string; monto_pago: number }[]).forEach(
    (p) => {
      const cur = pagoRecienteMap[p.cliente_cod];
      const dias = Math.max(0, Math.floor((hoyMs - new Date(p.fecha_pago).getTime()) / 86_400_000));
      pagoRecienteMap[p.cliente_cod] = {
        monto: (cur?.monto ?? 0) + Number(p.monto_pago || 0),
        dias: cur ? Math.min(cur.dias, dias) : dias,
      };
    },
  );
}
```

- [ ] **Step 4: Asignar el campo en la construcción del row**

En el objeto retornado por el `.map` (donde está `icp_score,` cerca de la línea 442), agregar la línea:

```ts
      pago_reciente:        pagoRecienteMap[c.cliente_cod] ?? null,
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Esperado: sin errores. (Si falla por `pago_reciente` faltante en algún consumidor de `CarteraRow`, es esperado hasta la Task 7; pero como el campo es opcional en el render, no debería romper. Si rompe, completar Task 7 antes del build.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/cola-analista.ts
git commit -m "feat(cola): calcular señal de pago reciente (últimos 5 días) por cliente"
```

---

### Task 7: Renderizar el badge de pago reciente

**Files:**

- Modify: `src/components/cartera/mi-cartera-view.tsx` (dos lugares: ~661 y ~919)

- [ ] **Step 1: Badge en la vista de lista compacta**

Después del bloque de Promesa (líneas 654-661), justo antes del `</div>` de la línea 662, insertar:

```tsx
{
  /* Pago reciente */
}
{
  row.pago_reciente && (
    <>
      <Divider />
      <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: '#16a34a' }}>
        Pagó {fmtCRC(row.pago_reciente.monto)} · hace {row.pago_reciente.dias}d
      </span>
    </>
  );
}
```

- [ ] **Step 2: Badge en la vista de tarjeta (agenda)**

Después del bloque de Promesa (líneas 915-919), justo antes del `</div>` de la línea 920, insertar:

```tsx
{
  row.pago_reciente && (
    <p className="text-[10px] mt-0.5 font-bold" style={{ color: '#16a34a' }}>
      Pagó {fmtCRC(row.pago_reciente.monto)} · hace {row.pago_reciente.dias}d
    </p>
  );
}
```

- [ ] **Step 3: Verificar build completo**

Run: `npx tsc --noEmit && npm run build`
Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/cartera/mi-cartera-view.tsx
git commit -m "feat(cola): mostrar badge de pago reciente en Mi Cartera"
```

---

## Verificación final

- [ ] `npx tsc --noEmit` limpio y `npm run build` sin errores.
- [ ] Preview SQL (Task 1, Step 3) mostró conteos coherentes.
- [ ] `cron.job` tiene `nightly-conciliar-promesas` y ya no `nightly-mark-promesas-incumplidas`.
- [ ] Página de Promesas: un solo botón "Ver ficha" por tarjeta + paginación visible cuando hay >12.
- [ ] Mi Cartera: badge verde "Pagó ₡X · hace Nd" en clientes con pago en los últimos 5 días.
- [ ] `git push origin master` → deploy automático en Vercel (avisar al usuario).

## Notas de despliegue

- Las migraciones SQL (Tasks 1-2) se aplican vía el MCP de Supabase, **no** requieren push para activarse — quedan vivas al aplicarlas. El archivo en `supabase/migrations/` es para control de versiones.
- El cron corre 00:00 CR; la primera conciliación real ocurre esa noche. Para validar antes, puede ejecutarse `SELECT public.fn_conciliar_promesas();` manualmente (sin ROLLBACK) en una ventana controlada.
- Los cambios de UI (Piezas 1 y 3) sí requieren `git push` para desplegar en Vercel.
