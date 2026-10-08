# Automatizaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar visibilidad y control (on/off + log de actividad) sobre las automatizaciones que ya corren en el SIC, y conectar 2 piezas construidas a medias (alerta de "sin gestión", SLA de solicitudes vencido).

**Architecture:** Cero tablas nuevas. Los on/off viven en `config_sistema` (clave/valor). El log de actividad es una vista (`v_automatizaciones_feed`) sobre `notificaciones`. 2 funciones SQL existentes reciben un guard clause; 2 funciones SQL nuevas se agregan con su propio cron. Un tab nuevo en Configuración (`TabAutomatizaciones`) + un widget nuevo en el dashboard del analista (`TareasSugeridasAutomatizacion`) consumen todo esto vía 2 API routes nuevas.

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Supabase (Postgres, RLS, pg_cron) + Tailwind, siguiendo los patrones exactos de `TabSemaforo`/`TabParametros`/`TabSLA` y `src/lib/configuracion/admin.ts`.

**Fuente de verdad del diseño:** `docs/superpowers/specs/2026-07-08-automatizaciones-design.md` (ya escrito, verificado adversarialmente y aprobado). Este plan traduce ese diseño a pasos ejecutables; el código de cada paso es el mismo código ya verificado en el spec, no una reinterpretación.

**Nota sobre migraciones:** este proyecto no ejecuta `.sql` locales con psql — todas las migraciones de este proyecto se aplican con la tool MCP de Supabase `apply_migration` (proyecto `swkmrufsyhnaeoijasrz`, alias `cyc-cartera-cofersa`), que además registra el archivo de migración automáticamente. Si la tool no está cargada en el contexto del ejecutor, buscarla primero con ToolSearch (`select:apply_migration` o palabra clave `supabase`). No usar `execute_sql` para DDL (crear/alterar funciones, vistas, cron) — esa tool es solo para SELECTs de verificación.

**Nota sobre rama:** todo el trabajo previo de esta sesión se hizo directo sobre `master` (sin worktrees ni branches), verificando con `tsc --noEmit` + `npm run build` antes de cada push. Este plan continúa ese mismo patrón — no crear un worktree salvo que el usuario lo pida explícitamente al arrancar la ejecución.

---

### Task 1: Migración SQL — seed de `config_sistema`

**Files:**

- Migración Supabase (vía `apply_migration`): `20260708_automatizaciones_config_sistema`

- [ ] **Step 1: Aplicar la migración de seed**

Nombre de migración: `automatizaciones_config_sistema`

```sql
INSERT INTO config_sistema (clave, valor, descripcion) VALUES
  ('automatizacion_promesas_hoy_activa',    'true', 'Notifica al analista si tiene promesas que vencen hoy'),
  ('automatizacion_sync_salud_activa',      'true', 'Alerta al coordinador si una tabla de sync deja de recibir datos nuevos'),
  ('automatizacion_sin_gestion_activa',     'true', 'Notifica al analista los clientes de su cartera sin gestión registrada hace ≥ N días (usa dias_sin_gestion_alerta)'),
  ('automatizacion_sla_solicitudes_activa', 'true', 'Notifica al responsable (o a coordinación) cuando una solicitud supera su SLA sin resolverse')
ON CONFLICT (clave) DO NOTHING;
```

- [ ] **Step 2: Verificar**

Ejecutar por `execute_sql` (solo lectura):

```sql
SELECT clave, valor FROM config_sistema WHERE clave LIKE 'automatizacion_%' ORDER BY clave;
```

Expected: 4 filas, todas con `valor = 'true'`.

---

### Task 2: Migración SQL — guard clauses + 2 funciones nuevas

**Files:**

- Migración Supabase (vía `apply_migration`): `20260708_automatizaciones_funciones`

- [ ] **Step 1: Guard clause en `fn_notificar_promesas_hoy`**

Reemplazar la función completa. Este es el cuerpo VERBATIM confirmado contra `supabase/schema_export/03_functions.sql:1360-1426`, con el bloque de guard clause agregado (`v_activa` en el `DECLARE` + el `IF COALESCE...RETURN` al inicio del `BEGIN`) y ninguna otra línea tocada:

```sql
CREATE OR REPLACE FUNCTION public.fn_notificar_promesas_hoy()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec         RECORD;
  v_uid       UUID;
  v_titulo    TEXT;
  v_mensaje   TEXT;
  v_hoy_cr    DATE;
  v_activa    TEXT;
BEGIN
  -- Guard clause: on/off desde config_sistema (módulo Automatizaciones)
  SELECT valor INTO v_activa
  FROM config_sistema WHERE clave = 'automatizacion_promesas_hoy_activa';
  IF COALESCE(v_activa, 'true') = 'false' THEN
    RETURN;
  END IF;

  -- Fecha de hoy en Costa Rica (UTC-6, sin DST)
  v_hoy_cr := (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE;

  -- Para cada analista con promesas pendientes que vencen hoy
  FOR rec IN
    SELECT
      p.analista_email,
      COUNT(*)::INT                      AS n_promesas,
      SUM(p.monto)                       AS total_monto,
      MIN(p.cliente_nombre)              AS primer_cliente
    FROM promesas p
    WHERE p.fecha_promesa = v_hoy_cr
      AND p.estado        = 'PENDIENTE'
      AND (p.activo IS NULL OR p.activo = true)
      AND p.analista_email IS NOT NULL
    GROUP BY p.analista_email
  LOOP
    -- Resolver usuario_id desde el email
    SELECT id INTO v_uid
    FROM usuarios
    WHERE LOWER(email) = LOWER(rec.analista_email)
    LIMIT 1;

    IF v_uid IS NULL THEN CONTINUE; END IF;

    -- Evitar duplicado: si ya existe una notificación PROMESA de hoy para este usuario, saltar
    IF EXISTS (
      SELECT 1 FROM notificaciones
      WHERE usuario_id = v_uid
        AND tipo        = 'PROMESA'
        AND (created_at AT TIME ZONE 'America/Costa_Rica')::DATE = v_hoy_cr
    ) THEN
      CONTINUE;
    END IF;

    -- Construir título y mensaje
    IF rec.n_promesas = 1 THEN
      v_titulo  := 'Promesa de pago vence hoy';
      v_mensaje := COALESCE(rec.primer_cliente, '—')
                   || ' · ₡'
                   || REPLACE(TO_CHAR(ROUND(rec.total_monto), 'FM999,999,999,999'), ',', '.');
    ELSE
      v_titulo  := rec.n_promesas::TEXT || ' promesas vencen hoy';
      v_mensaje := 'Total comprometido: ₡'
                   || REPLACE(TO_CHAR(ROUND(rec.total_monto), 'FM999,999,999,999'), ',', '.');
    END IF;

    -- Insertar notificación
    INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, leida, link)
    VALUES (v_uid, 'PROMESA', v_titulo, v_mensaje, false, '/promesas');

  END LOOP;
END;
$function$;
```

- [ ] **Step 2: Guard clause en `fn_check_sync_salud`**

Cuerpo VERBATIM confirmado contra `supabase/schema_export/03_functions.sql:570-593`, con el guard clause agregado:

```sql
CREATE OR REPLACE FUNCTION public.fn_check_sync_salud()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  fp_cartera text; fp_facturas text; fp_saldos text; fp_pagos text;
  v_activa   text;
BEGIN
  SELECT valor INTO v_activa
  FROM config_sistema WHERE clave = 'automatizacion_sync_salud_activa';
  IF COALESCE(v_activa, 'true') = 'false' THEN
    RETURN;
  END IF;

  SELECT coalesce(max(updated_at)::text,'') || '|' || count(*) || '|' || round(coalesce(sum(total),0))
    INTO fp_cartera  FROM cartera;
  SELECT count(*) || '|' || round(coalesce(sum(saldo),0)) || '|' || round(coalesce(sum(monto),0))
    INTO fp_facturas FROM facturas;
  SELECT count(*) || '|' || round(coalesce(sum(monto),0))
    INTO fp_saldos   FROM saldos_favor;
  SELECT coalesce(max(created_at)::text,'') || '|' || count(*)
    INTO fp_pagos    FROM pagos;

  PERFORM fn_sync_salud_eval('cartera',      fp_cartera);
  PERFORM fn_sync_salud_eval('facturas',     fp_facturas);
  PERFORM fn_sync_salud_eval('saldos_favor', fp_saldos);
  PERFORM fn_sync_salud_eval('pagos',        fp_pagos);
END;
$function$;
```

- [ ] **Step 3: Crear `fn_notificar_sin_gestion` (nueva)**

```sql
CREATE OR REPLACE FUNCTION public.fn_notificar_sin_gestion()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec        RECORD;
  v_uid      UUID;
  v_titulo   TEXT;
  v_mensaje  TEXT;
  v_link     TEXT;
  v_activa   TEXT;
  v_dias_txt TEXT;
  v_dias     INT;
  v_hoy_cr   DATE;
BEGIN
  SELECT valor INTO v_activa
  FROM config_sistema WHERE clave = 'automatizacion_sin_gestion_activa';
  IF COALESCE(v_activa, 'true') = 'false' THEN
    RETURN;
  END IF;

  v_hoy_cr := (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE;

  SELECT valor INTO v_dias_txt FROM config_sistema WHERE clave = 'dias_sin_gestion_alerta';
  v_dias := CASE WHEN v_dias_txt ~ '^[0-9]+$' THEN v_dias_txt::int ELSE 15 END;

  FOR rec IN
    WITH mc AS (
      SELECT DISTINCT ON (cliente_cod)
        cliente_cod, contribuyente, cliente_nombre, analista_email
      FROM maestro_clientes
      WHERE analista_email IS NOT NULL AND TRIM(analista_email) <> ''
      ORDER BY cliente_cod, updated_at DESC NULLS LAST
    ),
    mora_cli AS (
      SELECT mc.cliente_cod,
             SUM(c.mora_1_30 + c.mora_31_60 + c.mora_61_90 + GREATEST(c.mora_91_120,0) + c.mora_120_plus) AS mora_total
      FROM mc
      JOIN cartera c ON c.cliente_cod = mc.cliente_cod AND c.contribuyente = mc.contribuyente
      GROUP BY mc.cliente_cod
      HAVING SUM(c.mora_1_30 + c.mora_31_60 + c.mora_61_90 + GREATEST(c.mora_91_120,0) + c.mora_120_plus) > 0
    ),
    ultima_gestion AS (
      -- CORREGIDO (post-ejecución, ver nota debajo): gestiones NO tiene columna usuario_id,
      -- se compara analista_email directo contra mc.analista_email.
      SELECT g.cliente_cod, MAX(g.fecha) AS ultima_fecha
      FROM gestiones g
      JOIN mc ON mc.cliente_cod = g.cliente_cod AND lower(mc.analista_email) = lower(g.analista_email)
      WHERE (g.activo IS NULL OR g.activo = true)
        AND (g.archived IS NULL OR g.archived = false)
        AND (g.legacy IS NULL OR g.legacy = false)
        AND g.tipo <> 'SISTEMA'
      GROUP BY g.cliente_cod
    ),
    candidatos AS (
      SELECT
        mc.cliente_cod, mc.cliente_nombre, lower(mc.analista_email) AS analista_email,
        COALESCE((v_hoy_cr - ug.ultima_fecha), 999) AS dias_sin_gestion
      FROM mc
      JOIN mora_cli mcli ON mcli.cliente_cod = mc.cliente_cod
      LEFT JOIN ultima_gestion ug ON ug.cliente_cod = mc.cliente_cod
    ),
    priorizados AS (
      SELECT cliente_cod, cliente_nombre, analista_email, dias_sin_gestion,
             ROW_NUMBER() OVER (PARTITION BY analista_email ORDER BY dias_sin_gestion DESC) AS rn
      FROM candidatos
      WHERE dias_sin_gestion >= v_dias
    )
    SELECT cliente_cod, cliente_nombre, analista_email, dias_sin_gestion
    FROM priorizados
    WHERE rn <= 5
  LOOP
    SELECT id INTO v_uid FROM usuarios
    WHERE lower(email) = rec.analista_email AND COALESCE(activo, true) = true
    LIMIT 1;
    IF v_uid IS NULL THEN CONTINUE; END IF;

    v_link := '/clientes/' || rec.cliente_cod;

    IF EXISTS (
      SELECT 1 FROM notificaciones
      WHERE usuario_id = v_uid AND tipo = 'ALERTA' AND titulo LIKE 'Sin gestión ≥%'
        AND link = v_link AND leida = false
    ) THEN
      CONTINUE;
    END IF;

    v_titulo  := 'Sin gestión ≥ ' || v_dias::TEXT || ' días — ' || rec.cliente_nombre;
    v_mensaje := 'El cliente ' || rec.cliente_nombre || ' (' || rec.cliente_cod || ') no tiene gestión registrada hace ' || rec.dias_sin_gestion::TEXT || ' días.';

    INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, leida, link)
    VALUES (v_uid, 'ALERTA', v_titulo, v_mensaje, false, v_link);
  END LOOP;
END;
$function$;
```

- [ ] **Step 4: Crear `fn_notificar_sla_vencido` (nueva)**

```sql
CREATE OR REPLACE FUNCTION public.fn_notificar_sla_vencido()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec                  RECORD;
  v_uid                UUID;
  v_titulo             TEXT;
  v_mensaje            TEXT;
  v_hoy_cr             DATE;
  v_activa             TEXT;
  v_sin_responsable_n  INT := 0;
BEGIN
  SELECT valor INTO v_activa
  FROM config_sistema WHERE clave = 'automatizacion_sla_solicitudes_activa';
  IF COALESCE(v_activa, 'true') = 'false' THEN
    RETURN;
  END IF;

  v_hoy_cr := (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE;

  FOR rec IN
    SELECT
      lower(NULLIF(TRIM(s.responsable_email), '')) AS responsable_email,
      COUNT(*)::INT                                                     AS n_vencidas,
      (array_agg(s.cliente_nombre     ORDER BY s.sla_vencimiento))[1]   AS primer_cliente,
      (array_agg(s.id                 ORDER BY s.sla_vencimiento))[1]   AS primer_id,
      (array_agg(s.numero_consecutivo ORDER BY s.sla_vencimiento))[1]   AS primer_consecutivo
    FROM solicitudes s
    WHERE s.sla_vencimiento IS NOT NULL
      AND s.sla_vencimiento < now()
      AND s.estado NOT IN ('Resuelta','Cerrada','Rechazada','APROBADA','RECHAZADA')
    GROUP BY lower(NULLIF(TRIM(s.responsable_email), ''))
  LOOP
    v_uid := NULL;
    IF rec.responsable_email IS NOT NULL THEN
      SELECT u.id INTO v_uid
      FROM usuarios u
      WHERE lower(u.email) = rec.responsable_email
        AND COALESCE(u.activo, true) = true
      LIMIT 1;
    END IF;

    IF v_uid IS NULL THEN
      v_sin_responsable_n := v_sin_responsable_n + rec.n_vencidas;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM notificaciones
      WHERE usuario_id = v_uid
        AND tipo        = 'SOLICITUD'
        AND titulo LIKE 'SLA vencido%'
        AND titulo <> 'SLA vencido — responsable no identificado'
        AND (created_at AT TIME ZONE 'America/Costa_Rica')::DATE = v_hoy_cr
    ) THEN
      CONTINUE;
    END IF;

    IF rec.n_vencidas = 1 THEN
      v_titulo  := 'SLA vencido — ' || COALESCE(rec.primer_cliente, 'SIC-' || LPAD(rec.primer_consecutivo::text, 5, '0'));
      v_mensaje := 'La solicitud SIC-' || LPAD(rec.primer_consecutivo::text, 5, '0') || ' superó su SLA sin resolverse.';
    ELSE
      v_titulo  := 'SLA vencido — ' || rec.n_vencidas::TEXT || ' solicitudes';
      v_mensaje := rec.n_vencidas::TEXT || ' solicitudes bajo tu responsabilidad superaron su SLA sin resolverse.';
    END IF;

    INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, leida, link)
    VALUES (
      v_uid, 'SOLICITUD', v_titulo, v_mensaje, false,
      CASE WHEN rec.n_vencidas = 1 THEN '/solicitudes/' || rec.primer_id::text ELSE '/solicitudes' END
    );
  END LOOP;

  IF v_sin_responsable_n > 0 THEN
    INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, leida, link)
    SELECT
      u.id, 'SOLICITUD',
      'SLA vencido — responsable no identificado',
      v_sin_responsable_n::TEXT || ' solicitud(es) superaron su SLA y su responsable_email no coincide con ningún usuario activo del sistema.',
      false, '/solicitudes'
    FROM usuarios u
    WHERE u.rol = 'COORDINADOR' AND COALESCE(u.activo, true) = true
      AND NOT EXISTS (
        SELECT 1 FROM notificaciones n
        WHERE n.usuario_id = u.id AND n.tipo = 'SOLICITUD'
          AND n.titulo = 'SLA vencido — responsable no identificado'
          AND (n.created_at AT TIME ZONE 'America/Costa_Rica')::DATE = v_hoy_cr
      );
  END IF;
END;
$function$;
```

- [ ] **Step 5: Verificar que las 4 funciones existen y compilan**

```sql
SELECT proname FROM pg_proc WHERE proname IN
  ('fn_notificar_promesas_hoy','fn_check_sync_salud','fn_notificar_sin_gestion','fn_notificar_sla_vencido')
ORDER BY proname;
```

Expected: 4 filas. Si `apply_migration` no da error, las funciones son sintácticamente válidas (Postgres valida el cuerpo `plpgsql` al crear).

> **Nota post-ejecución (Tarea 5):** la verificación manual encontró que `fn_notificar_sin_gestion` fallaba en cada llamada (`ERROR 42703: column g.usuario_id does not exist` — `gestiones` no tiene esa columna, usa `analista_email` directo). Nunca insertó una fila mala (fallaba antes del `INSERT`). Se corrigió con la migración `automatizaciones_fix_sin_gestion_join`, cambiando únicamente el join de la CTE `ultima_gestion` (ya reflejado arriba). Verificado: corre sin error, generó 20 notificaciones reales correctas, dedup confirmado en una segunda llamada.

---

### Task 3: Migración SQL — cron jobs nuevos

**Files:**

- Migración Supabase (vía `apply_migration`): `20260708_automatizaciones_cron`

- [ ] **Step 1: Aplicar**

```sql
SELECT cron.schedule('notificar-sin-gestion', '10 13 * * 1-5', $$SELECT public.fn_notificar_sin_gestion();$$);
SELECT cron.schedule('notificar-sla-vencido', '20 13-23 * * 1-5', $$SELECT public.fn_notificar_sla_vencido();$$);
```

- [ ] **Step 2: Verificar**

```sql
SELECT jobid, jobname, schedule, command, active
FROM cron.job WHERE jobname IN ('notificar-sin-gestion','notificar-sla-vencido');
```

Expected: 2 filas, `active = true`, `schedule` coincide exactamente con lo de arriba.

---

### Task 4: Migración SQL — vista de feed + función de estadística

**Files:**

- Migración Supabase (vía `apply_migration`): `20260708_automatizaciones_vista_stats`

- [ ] **Step 1: Crear `v_automatizaciones_feed`**

```sql
CREATE OR REPLACE VIEW public.v_automatizaciones_feed AS
SELECT
  n.id, n.usuario_id, n.tipo, n.titulo, n.mensaje, n.leida, n.link, n.created_at,
  CASE
    WHEN n.tipo = 'PROMESA' THEN 'promesas_hoy'
    WHEN n.tipo = 'SYNC'    THEN 'sync_salud'
    WHEN n.tipo = 'ALERTA' AND (
           n.titulo LIKE 'Promesa cumplida automáticamente%'
        OR n.titulo LIKE 'Abono parcial detectado%'
        OR n.titulo LIKE 'Promesa incumplida%'
    ) THEN 'conciliacion_promesas'
    WHEN n.tipo = 'ALERTA'    AND n.titulo LIKE 'Sin gestión ≥%' THEN 'sin_gestion'
    WHEN n.tipo = 'SOLICITUD' AND n.titulo LIKE 'SLA vencido%'   THEN 'sla_solicitudes'
  END AS regla_id
FROM public.notificaciones n
WHERE
     n.tipo = 'PROMESA'
  OR n.tipo = 'SYNC'
  OR (n.tipo = 'ALERTA' AND (
        n.titulo LIKE 'Promesa cumplida automáticamente%'
     OR n.titulo LIKE 'Abono parcial detectado%'
     OR n.titulo LIKE 'Promesa incumplida%'
     OR n.titulo LIKE 'Sin gestión ≥%'
     ))
  OR (n.tipo = 'SOLICITUD' AND n.titulo LIKE 'SLA vencido%');
```

Nota: `notificaciones` tiene RLS con política `usuario_id = auth.uid()`. Esta vista NO se marca `security_invoker` — se consulta siempre desde rutas de servidor con `service_role` (`getAdminClient()`), nunca desde el cliente de sesión del navegador. No agregar `SET (security_invoker = true)`.

- [ ] **Step 2: Crear `fn_automatizaciones_resumen`**

```sql
CREATE OR REPLACE FUNCTION public.fn_automatizaciones_resumen()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_object_agg(regla_id, disparos), '{}'::jsonb)
  FROM (
    SELECT regla_id, COUNT(*) AS disparos
    FROM public.v_automatizaciones_feed
    WHERE created_at >= now() - interval '7 days'
      AND regla_id IS NOT NULL
    GROUP BY regla_id
  ) x;
$function$;
```

- [ ] **Step 3: Verificar**

```sql
SELECT * FROM v_automatizaciones_feed ORDER BY created_at DESC LIMIT 20;
SELECT public.fn_automatizaciones_resumen();
```

Expected: la vista devuelve filas (o 0 si no hubo actividad reciente, no debe dar error); ninguna fila con `regla_id` NULL debería colarse (el `WHERE` ya las excluye). La función devuelve un objeto jsonb válido.

---

### Task 5: Verificación manual del backend completo antes de tocar frontend

**Files:** ninguno (solo `execute_sql` de verificación)

- [ ] **Step 1: Probar fail-open de las guard clauses**

```sql
UPDATE config_sistema SET valor='false' WHERE clave='automatizacion_promesas_hoy_activa';
SELECT public.fn_notificar_promesas_hoy();
-- Confirmar que NO insertó notificaciones nuevas de tipo PROMESA hoy
UPDATE config_sistema SET valor='true' WHERE clave='automatizacion_promesas_hoy_activa';
```

Repetir el mismo apagado/encendido para `automatizacion_sync_salud_activa` contra `fn_check_sync_salud`.

- [ ] **Step 2: Probar `fn_notificar_sin_gestion` con dedup**

```sql
SELECT public.fn_notificar_sin_gestion();
SELECT COUNT(*) FROM notificaciones WHERE tipo='ALERTA' AND titulo LIKE 'Sin gestión ≥%' AND created_at > now() - interval '5 minutes';
-- Anotar el conteo N
SELECT public.fn_notificar_sin_gestion();
SELECT COUNT(*) FROM notificaciones WHERE tipo='ALERTA' AND titulo LIKE 'Sin gestión ≥%' AND created_at > now() - interval '5 minutes';
-- Debe seguir siendo N (no duplicó)
```

- [ ] **Step 3: Probar `fn_notificar_sla_vencido` con fallback**

Sobre una solicitud de prueba (NO producción viva — si no hay una de prueba, usar `UPDATE ... RETURNING` sobre una fila real y revertir el `sla_vencimiento` original después de verificar):

```sql
-- Guardar el valor original antes de tocar nada
SELECT id, sla_vencimiento FROM solicitudes WHERE sla_vencimiento IS NOT NULL LIMIT 1;
```

Si no hay ninguna con `sla_vencimiento` seteado, este paso queda documentado como "no aplicable todavía" (el flujo nuevo por área recién empieza a poblar ese campo) — no bloquea el resto del plan.

- [ ] **Step 4: Confirmar cero efectos secundarios en las funciones existentes**

```sql
SELECT COUNT(*) FROM notificaciones WHERE tipo='PROMESA' AND created_at::date = CURRENT_DATE;
```

Comparar con el conteo esperado según cuántos analistas tienen promesas hoy — no debe haber duplicados ni faltantes respecto al comportamiento anterior a este plan.

---

### Task 6: `src/lib/automatizaciones/registry.ts`

**Files:**

- Create: `src/lib/automatizaciones/registry.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
export type ReglaId =
  'promesas_hoy' | 'conciliacion_promesas' | 'sync_salud' | 'sin_gestion' | 'sla_solicitudes';

export interface ReglaAutomatizacion {
  id: ReglaId;
  categoria: 'cobranza' | 'mantenimiento' | 'sistema';
  nombre: string;
  descripcion: string;
  rpc: string;
  cronJobName: string;
  toggleable: boolean;
  configKey: string | null;
  cron: string; // expresión pg_cron real, UTC, 5 campos
  cronLegible: string;
}

export const REGLAS: ReglaAutomatizacion[] = [
  {
    id: 'promesas_hoy',
    categoria: 'cobranza',
    nombre: 'Promesa vence hoy sin cumplir',
    descripcion:
      'Le avisa al analista cuando alguna de sus promesas de pago vence hoy y sigue pendiente.',
    rpc: 'fn_notificar_promesas_hoy',
    cronJobName: 'notificar-promesas-hoy',
    toggleable: true,
    configKey: 'automatizacion_promesas_hoy_activa',
    cron: '0 13 * * 1-5',
    cronLegible: 'L-V 7:00am (CR)',
  },
  {
    id: 'conciliacion_promesas',
    categoria: 'mantenimiento',
    nombre: 'Conciliación automática de promesas',
    descripcion:
      'Todas las noches revisa si llegaron pagos que cumplen promesas vencidas y actualiza su estado solo. No se puede apagar: si se apaga, quedan promesas con estado incorrecto que se arrastra a otros reportes.',
    rpc: 'fn_conciliar_promesas',
    cronJobName: 'evening-conciliar-promesas',
    toggleable: false,
    configKey: null,
    cron: '30 23 * * *',
    cronLegible: 'Todos los días 5:30pm (CR)',
  },
  {
    id: 'sync_salud',
    categoria: 'sistema',
    nombre: 'Salud de sincronización N8N ↔ Softland',
    descripcion:
      'Si una tabla (cartera, facturas, saldos o pagos) deja de recibir datos nuevos por 3 ciclos seguidos, avisa al coordinador.',
    rpc: 'fn_check_sync_salud',
    cronJobName: 'check_sync_salud',
    toggleable: true,
    configKey: 'automatizacion_sync_salud_activa',
    cron: '15 13-23 * * 1-5',
    cronLegible: 'L-V cada hora, 7:15am–5:15pm (CR)',
  },
  {
    id: 'sin_gestion',
    categoria: 'cobranza',
    nombre: 'Cliente sin gestión ≥ N días',
    descripcion:
      'Avisa cuando un cliente lleva más días sin ninguna gestión registrada que el umbral configurado en Parámetros.',
    rpc: 'fn_notificar_sin_gestion',
    cronJobName: 'notificar-sin-gestion',
    toggleable: true,
    configKey: 'automatizacion_sin_gestion_activa',
    cron: '10 13 * * 1-5',
    cronLegible: 'L-V 7:10am (CR)',
  },
  {
    id: 'sla_solicitudes',
    categoria: 'cobranza',
    nombre: 'Solicitud con SLA vencido',
    descripcion:
      'Avisa al responsable (o a coordinación) cuando una solicitud pendiente superó el tiempo de respuesta acordado en SLA Solicitudes.',
    rpc: 'fn_notificar_sla_vencido',
    cronJobName: 'notificar-sla-vencido',
    toggleable: true,
    configKey: 'automatizacion_sla_solicitudes_activa',
    cron: '20 13-23 * * 1-5',
    cronLegible: 'L-V cada hora, 7:20am–5:20pm (CR)',
  },
];

export const DEFAULTS_AUTOMATIZACIONES: Record<string, string> = {
  automatizacion_promesas_hoy_activa: 'true',
  automatizacion_sync_salud_activa: 'true',
  automatizacion_sin_gestion_activa: 'true',
  automatizacion_sla_solicitudes_activa: 'true',
};
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a este archivo (puede haber 0 errores totales, es el primer archivo del módulo).

- [ ] **Step 3: Commit**

```bash
git add src/lib/automatizaciones/registry.ts
git commit -m "feat(automatizaciones): catálogo de reglas (registry.ts)"
```

---

### Task 7: `src/lib/automatizaciones/cron.ts`

**Files:**

- Create: `src/lib/automatizaciones/cron.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
interface CronParsed {
  minuto: number;
  horas: number[];
  dias: number[] | null;
}

function parseCron(expr: string): CronParsed {
  const [m, h, , , dow] = expr.trim().split(/\s+/);
  const minuto = parseInt(m, 10);
  const horas = h.includes('-')
    ? (() => {
        const [h1, h2] = h.split('-').map(Number);
        return Array.from({ length: h2 - h1 + 1 }, (_, i) => h1 + i);
      })()
    : [parseInt(h, 10)];
  const dias =
    dow === '*'
      ? null
      : dow.split(',').flatMap((part) => {
          if (!part.includes('-')) return [Number(part)];
          const [d1, d2] = part.split('-').map(Number);
          return Array.from({ length: d2 - d1 + 1 }, (_, i) => d1 + i);
        });
  return { minuto, horas, dias };
}

function generarCorridas(expr: string, desde: Date, hasta: Date): Date[] {
  const { minuto, horas, dias } = parseCron(expr);
  const out: Date[] = [];
  const cursor = new Date(
    Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()),
  );
  while (cursor <= hasta) {
    const dow = cursor.getUTCDay();
    if (!dias || dias.includes(dow)) {
      for (const h of horas) {
        const t = new Date(
          Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), h, minuto),
        );
        if (t >= desde && t <= hasta) out.push(t);
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

// Ventana ±8 días cubre de sobra el peor caso semanal (viernes→lunes de una regla L-V)
export function calcularEjecuciones(expr: string, ahora = new Date()) {
  const desde = new Date(ahora.getTime() - 8 * 86_400_000);
  const hasta = new Date(ahora.getTime() + 8 * 86_400_000);
  const corridas = generarCorridas(expr, desde, hasta);
  const pasadas = corridas.filter((t) => t <= ahora);
  const futuras = corridas.filter((t) => t > ahora);
  return {
    ultima_ejecucion_programada: pasadas.length ? pasadas.at(-1)!.toISOString() : null,
    proxima_ejecucion_programada: futuras.length ? futuras[0].toISOString() : null,
  };
}
```

- [ ] **Step 2: Verificar manualmente con un caso conocido**

Con el proyecto corriendo (`npm run dev` o un script suelto), confirmar que `calcularEjecuciones('0 13 * * 1-5', new Date('2026-07-08T10:00:00Z'))` (miércoles) devuelve `proxima_ejecucion_programada` como `2026-07-08T13:00:00.000Z` (mismo día, 13:00 UTC = 7:00am CR).

- [ ] **Step 3: `tsc --noEmit` + commit**

```bash
npx tsc --noEmit
git add src/lib/automatizaciones/cron.ts
git commit -m "feat(automatizaciones): cálculo de última/próxima ejecución desde cron expression"
```

---

### Task 8: `src/lib/automatizaciones/obtener-datos.ts`

**Files:**

- Create: `src/lib/automatizaciones/obtener-datos.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { REGLAS, DEFAULTS_AUTOMATIZACIONES } from './registry';
import { calcularEjecuciones } from './cron';

export async function obtenerAutomatizacionesData(admin: SupabaseClient) {
  const [{ data: configRows }, { data: resumen }] = await Promise.all([
    (admin as any)
      .from('config_sistema')
      .select('clave, valor')
      .in('clave', Object.keys(DEFAULTS_AUTOMATIZACIONES)),
    (admin as any).rpc('fn_automatizaciones_resumen'),
  ]);
  return REGLAS.map((r) => ({
    ...r,
    activa: r.configKey
      ? (configRows?.find((c: any) => c.clave === r.configKey)?.valor ??
          DEFAULTS_AUTOMATIZACIONES[r.configKey]) === 'true'
      : true, // conciliacion_promesas: siempre "activa", no tiene toggle
    disparos_7d: (resumen as Record<string, number> | null)?.[r.id] ?? 0,
    ...calcularEjecuciones(r.cron),
  }));
}
```

- [ ] **Step 2: `tsc --noEmit` + commit**

```bash
npx tsc --noEmit
git add src/lib/automatizaciones/obtener-datos.ts
git commit -m "feat(automatizaciones): obtenerAutomatizacionesData (config + stats + timing)"
```

---

### Task 9: API route `automatizaciones` (GET + PUT)

**Files:**

- Create: `src/app/api/configuracion/automatizaciones/route.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { checkCoordinador, getAdminClient, insertAuditLog } from '@/lib/configuracion/admin';
import { REGLAS } from '@/lib/automatizaciones/registry';
import { obtenerAutomatizacionesData } from '@/lib/automatizaciones/obtener-datos';

export async function GET() {
  const check = await checkCoordinador();
  if (!check.ok) return check.res;

  const admin = getAdminClient();
  const data = await obtenerAutomatizacionesData(admin);
  return NextResponse.json({ data });
}

export async function PUT(req: NextRequest) {
  const check = await checkCoordinador();
  if (!check.ok) return check.res;

  let body: { id?: string; activa?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  if (!body.id || typeof body.activa !== 'boolean') {
    return NextResponse.json({ error: 'id y activa (boolean) son requeridos' }, { status: 400 });
  }

  const regla = REGLAS.find((r) => r.id === body.id);
  if (!regla) {
    return NextResponse.json({ error: `Regla no reconocida: ${body.id}` }, { status: 400 });
  }
  if (!regla.toggleable || !regla.configKey) {
    return NextResponse.json(
      { error: 'Esta regla no se puede desactivar: es housekeeping automático del sistema' },
      { status: 400 },
    );
  }

  const admin = getAdminClient();

  const { error } = await (admin as any)
    .from('config_sistema')
    .upsert({ clave: regla.configKey, valor: String(body.activa) }, { onConflict: 'clave' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await insertAuditLog(admin, {
    tabla: 'config_sistema',
    accion: 'UPDATE',
    descripcion: `Automatización "${regla.nombre}" ${body.activa ? 'activada' : 'desactivada'}`,
    valor_nuevo: { clave: regla.configKey, valor: String(body.activa) },
    realizado_por: check.email,
  });

  return NextResponse.json({ data: { id: regla.id, activa: body.activa } });
}
```

**Antes de escribir este archivo:** leer `src/lib/configuracion/admin.ts` para confirmar la firma exacta de `checkCoordinador`/`getAdminClient`/`insertAuditLog` (ya se usaron así en `pagos-anulados/route.ts` y `pagos-duplicado-descartado/route.ts` esta misma sesión — mismo patrón, copiarlo).

- [ ] **Step 2: `tsc --noEmit` + commit**

```bash
npx tsc --noEmit
git add src/app/api/configuracion/automatizaciones/route.ts
git commit -m "feat(automatizaciones): API GET/PUT para listar y togglear reglas"
```

---

### Task 10: API route `automatizaciones/feed` (GET)

**Files:**

- Create: `src/app/api/configuracion/automatizaciones/feed/route.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { checkCoordinador, getAdminClient } from '@/lib/configuracion/admin';
import type { ReglaId } from '@/lib/automatizaciones/registry';

export async function GET(req: NextRequest) {
  const check = await checkCoordinador();
  if (!check.ok) return check.res;

  const { searchParams } = new URL(req.url);
  const regla = searchParams.get('regla') as ReglaId | null;
  const dias = Number(searchParams.get('dias') ?? '14');

  const admin = getAdminClient();
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

  let query = (admin as any)
    .from('v_automatizaciones_feed')
    .select('id, usuario_id, tipo, titulo, mensaje, link, leida, created_at, regla_id')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(100);
  if (regla) query = query.eq('regla_id', regla);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuarioIds = Array.from(new Set((data ?? []).map((e: any) => e.usuario_id)));
  const { data: usuarios } = usuarioIds.length
    ? await (admin as any).from('usuarios').select('id, nombre, email').in('id', usuarioIds)
    : { data: [] };
  const usuarioPorId = new Map((usuarios ?? []).map((u: any) => [u.id, u]));

  const eventos = (data ?? []).map((e: any) => ({
    ...e,
    usuario: usuarioPorId.get(e.usuario_id) ?? null,
  }));

  return NextResponse.json({
    data: eventos,
    mostrados: eventos.length,
    truncado: eventos.length === 100,
  });
}
```

- [ ] **Step 2: `tsc --noEmit` + commit**

```bash
npx tsc --noEmit
git add src/app/api/configuracion/automatizaciones/feed/route.ts
git commit -m "feat(automatizaciones): API GET del feed de actividad"
```

---

### Task 11: `TabAutomatizaciones.tsx`

**Files:**

- Create: `src/components/configuracion/TabAutomatizaciones.tsx`
- Read primero (para igualar el patrón visual exacto): `src/components/configuracion/TabSemaforo.tsx`, `TabParametros.tsx`, `TabSLA.tsx`

- [ ] **Step 1: Crear el archivo**

```typescript
'use client'

import { useState } from 'react'
import {
  Zap, Bell, CheckCircle2, MinusCircle, XCircle, ServerCog, Clock, AlertCircle, X, RefreshCw,
} from 'lucide-react'
import type { ReglaId } from '@/lib/automatizaciones/registry'

export interface ReglaEstado {
  id: ReglaId
  categoria: 'cobranza' | 'mantenimiento' | 'sistema'
  nombre: string
  descripcion: string
  toggleable: boolean
  activa: boolean
  disparos_7d: number
  ultima_ejecucion_programada: string | null
  proxima_ejecucion_programada: string | null
}

export interface EventoActividad {
  id: string
  regla_id: ReglaId | null
  tipo: string
  titulo: string
  mensaje: string | null
  link: string | null
  leida: boolean
  created_at: string
}

export interface AutomatizacionesData {
  reglas: ReglaEstado[]
  eventos: EventoActividad[]
}

interface Props { automatizaciones: AutomatizacionesData }

function fmtFechaHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CR', {
    timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className="relative inline-flex h-[22px] w-10 items-center rounded-full transition disabled:opacity-50"
      style={{ backgroundColor: checked ? '#009ee3' : '#e5e7eb' }}
    >
      <span
        className="inline-block h-[18px] w-[18px] transform rounded-full bg-white transition-transform duration-150"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(2px)' }}
      />
    </button>
  )
}

function SeccionHeader({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-bold text-gray-800">{titulo}</h3>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

function ReglaCard({ regla, saved, loading, onToggle }: {
  regla: ReglaEstado; saved: boolean; loading: boolean; onToggle: () => void
}) {
  return (
    <div className={`bg-white rounded-xl border p-4 transition-colors ${saved ? 'border-green-300' : 'border-gray-200'} ${regla.activa ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">{regla.nombre}</p>
          <p className="text-xs text-gray-500 mt-0.5">{regla.descripcion}</p>
        </div>
        {regla.toggleable ? (
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <ToggleSwitch checked={regla.activa} onChange={onToggle} disabled={loading} />
            {saved && <span className="text-[10px] text-green-600 font-medium">✓ Guardado</span>}
          </div>
        ) : (
          <span className="flex-shrink-0 text-[10px] font-bold rounded-full px-2 py-1 bg-blue-50 text-blue-600">
            SIEMPRE ACTIVO
          </span>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2 text-[11px]">
        {regla.activa ? (
          <>
            <span className="flex items-center gap-1 text-gray-500">
              <Zap size={11} />
              {regla.disparos_7d > 0 ? `Disparó ${regla.disparos_7d} veces esta semana` : 'No se disparó esta semana'}
            </span>
            <span className="text-gray-400 flex items-center gap-1">
              <Clock size={11} /> {fmtFechaHora(regla.proxima_ejecucion_programada)}
            </span>
          </>
        ) : (
          <span className="text-amber-600">Regla desactivada — no se generarán notificaciones</span>
        )}
      </div>
    </div>
  )
}

export default function TabAutomatizaciones({ automatizaciones: init }: Props) {
  const [reglas, setReglas]         = useState<ReglaEstado[]>(init.reglas)
  const [eventos, setEventos]       = useState<EventoActividad[]>(init.eventos)
  const [loading, setLoading]       = useState<ReglaId | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [saved, setSaved]           = useState<ReglaId | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function handleToggle(regla: ReglaEstado) {
    const nuevaActiva = !regla.activa
    setLoading(regla.id); setError(null)
    setReglas(prev => prev.map(r => r.id === regla.id ? { ...r, activa: nuevaActiva } : r))

    try {
      const res = await fetch('/api/configuracion/automatizaciones', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: regla.id, activa: nuevaActiva }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al guardar')
      setSaved(regla.id)
      setTimeout(() => setSaved(null), 2000)
    } catch (e) {
      setReglas(prev => prev.map(r => r.id === regla.id ? { ...r, activa: regla.activa } : r))
      setError((e as Error).message)
    } finally {
      setLoading(null)
    }
  }

  async function handleRefreshFeed() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/configuracion/automatizaciones/feed')
      const json = await res.json()
      if (res.ok) setEventos(json.data)
    } finally {
      setRefreshing(false)
    }
  }

  const cobranza = reglas.filter(r => r.categoria === 'cobranza')
  const mantenimiento = reglas.filter(r => r.categoria === 'mantenimiento')
  const sistema = reglas.filter(r => r.categoria === 'sistema')

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} />{error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      <div>
        <SeccionHeader titulo="Reglas de cobranza" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {cobranza.map(r => (
            <ReglaCard key={r.id} regla={r} saved={saved === r.id} loading={loading === r.id} onToggle={() => handleToggle(r)} />
          ))}
        </div>
      </div>

      <div>
        <SeccionHeader titulo="Mantenimiento automático" sub="Siempre activo" />
        {mantenimiento.map(r => (
          <ReglaCard key={r.id} regla={r} saved={saved === r.id} loading={loading === r.id} onToggle={() => handleToggle(r)} />
        ))}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <SeccionHeader titulo="Salud del sistema" sub="Monitoreo técnico — no es cobranza" />
        {sistema.map(r => (
          <ReglaCard key={r.id} regla={r} saved={saved === r.id} loading={loading === r.id} onToggle={() => handleToggle(r)} />
        ))}
      </div>

      <FeedActividadAutomatizaciones eventos={eventos} onRefresh={handleRefreshFeed} refreshing={refreshing} />
    </div>
  )
}
```

**Nota:** `FeedActividadAutomatizaciones` se importa desde el archivo del Task 12 — agregar `import FeedActividadAutomatizaciones from './FeedActividadAutomatizaciones'` al inicio del archivo (arriba, junto a los otros imports) al completar ese task. Si se implementa este Task 11 antes que el 12, `tsc` va a fallar por el import faltante — está bien, se resuelve en el siguiente task; no comitear Task 11 solo si eso pasa, comitear ambos juntos.

- [ ] **Step 2: `tsc --noEmit` (puede fallar hasta completar Task 12 — ver nota arriba)**

---

### Task 12: `FeedActividadAutomatizaciones.tsx`

**Files:**

- Create: `src/components/configuracion/FeedActividadAutomatizaciones.tsx`
- Modify: `src/components/configuracion/TabAutomatizaciones.tsx` (agregar el import faltante del Task 11)

- [ ] **Step 1: Crear el archivo**

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { RefreshCw, Zap, CheckCircle2, MinusCircle, XCircle, Bell, ServerCog } from 'lucide-react'
import type { EventoActividad } from './TabAutomatizaciones'

interface Props {
  eventos: EventoActividad[]
  onRefresh: () => void
  refreshing: boolean
}

// Duplicado a propósito (no exportado en su archivo de origen, TabSincronizacion.tsx)
function hoyCR(): string {
  return new Date(Date.now() - 6 * 3600_000).toISOString().split('T')[0]
}
function fmtDayCR(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 3600_000).toISOString().split('T')[0]
  const hoy = hoyCR()
  const ayer = new Date(new Date(hoy).getTime() - 86_400_000).toISOString().split('T')[0]
  if (d === hoy) return 'HOY'
  if (d === ayer) return 'AYER'
  return new Date(iso).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: 'long' })
}
function fmtHoraCR(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' })
}

function iconoConciliacion(titulo: string) {
  if (titulo.startsWith('Promesa cumplida')) return { Icon: CheckCircle2, color: '#16a34a' }
  if (titulo.startsWith('Abono parcial'))    return { Icon: MinusCircle, color: '#d97706' }
  return { Icon: XCircle, color: '#dc2626' }
}

function iconoEvento(e: EventoActividad) {
  if (e.regla_id === 'conciliacion_promesas') return iconoConciliacion(e.titulo)
  if (e.regla_id === 'sync_salud')            return { Icon: ServerCog, color: '#0369a1' }
  if (e.regla_id === 'sla_solicitudes')       return { Icon: Bell, color: '#dc2626' }
  return { Icon: Zap, color: '#009ee3' }
}

export default function FeedActividadAutomatizaciones({ eventos, onRefresh, refreshing }: Props) {
  const router = useRouter()

  async function handleClick(e: EventoActividad) {
    if (!e.leida) {
      await fetch(`/api/notas-rapidas`, { method: 'HEAD' }).catch(() => {}) // no-op de red, ver nota abajo
    }
    if (e.link) router.push(e.link)
  }

  const grupos = new Map<string, EventoActividad[]>()
  for (const e of eventos) {
    const dia = fmtDayCR(e.created_at)
    if (!grupos.has(dia)) grupos.set(dia, [])
    grupos.get(dia)!.push(e)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-800">Actividad reciente</h3>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {eventos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="mb-2 rounded-full bg-gray-100 p-3"><Bell size={20} className="text-gray-300" /></div>
          <p className="text-sm font-semibold text-gray-500">Sin actividad todavía</p>
          <p className="text-xs text-gray-400 mt-1">Cuando una regla se dispare vas a ver el detalle acá.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(grupos.entries()).map(([dia, evs]) => (
            <div key={dia}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: dia === 'HOY' ? '#009ee3' : '#9ca3af' }}>
                  {dia}
                </span>
                <span className="text-[11px] text-gray-400">{evs.length} {evs.length === 1 ? 'evento' : 'eventos'}</span>
              </div>
              <div className="space-y-1">
                {evs.map(e => {
                  const { Icon, color } = iconoEvento(e)
                  return (
                    <button
                      key={e.id}
                      onClick={() => handleClick(e)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition text-left"
                    >
                      <span className="flex-shrink-0 rounded-full p-1.5" style={{ backgroundColor: color + '1a' }}>
                        <Icon size={14} style={{ color }} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-medium text-gray-800 truncate">{e.titulo}</span>
                        {e.mensaje && <span className="block text-[11px] text-gray-400 truncate">{e.mensaje}</span>}
                      </span>
                      <span className="flex-shrink-0 text-[11px] text-gray-400">{fmtHoraCR(e.created_at)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Corrección antes de comitear:** el `handleClick` de arriba tiene un placeholder de red sin sentido (`fetch('/api/notas-rapidas', { method: 'HEAD' })`) — reemplazarlo por una llamada real que marque la notificación como leída. Crear (si no existe todavía) un endpoint mínimo `PATCH /api/configuracion/automatizaciones/feed/[id]/route.ts` que haga `admin.from('notificaciones').update({ leida: true }).eq('id', id)` con `checkCoordinador()`, y usarlo así:

```typescript
async function handleClick(e: EventoActividad) {
  if (!e.leida) {
    fetch(`/api/configuracion/automatizaciones/feed/${e.id}`, { method: 'PATCH' }).catch(() => {});
  }
  if (e.link) router.push(e.link);
}
```

Y el endpoint nuevo:

```typescript
import { NextResponse } from 'next/server';
import { checkCoordinador, getAdminClient } from '@/lib/configuracion/admin';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(_req: Request, { params }: Params) {
  const check = await checkCoordinador();
  if (!check.ok) return check.res;
  const { id } = await params;
  const admin = getAdminClient();
  const { error } = await (admin as any)
    .from('notificaciones')
    .update({ leida: true })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

Crear ese archivo en `src/app/api/configuracion/automatizaciones/feed/[id]/route.ts` como parte de este mismo task.

- [ ] **Step 2: Completar el import faltante en `TabAutomatizaciones.tsx`**

Agregar al inicio de `src/components/configuracion/TabAutomatizaciones.tsx`:

```typescript
import FeedActividadAutomatizaciones from './FeedActividadAutomatizaciones';
```

- [ ] **Step 3: `tsc --noEmit` + commit**

```bash
npx tsc --noEmit
git add src/components/configuracion/TabAutomatizaciones.tsx src/components/configuracion/FeedActividadAutomatizaciones.tsx src/app/api/configuracion/automatizaciones/feed/[id]/route.ts
git commit -m "feat(automatizaciones): UI del tab (reglas + feed de actividad)"
```

---

### Task 13: Integrar en `ConfigTabs.tsx` + `(app)/configuracion/page.tsx`

**Files:**

- Modify: `src/components/configuracion/ConfigTabs.tsx`
- Modify: `src/app/(app)/configuracion/page.tsx`

- [ ] **Step 1: Leer ambos archivos completos primero**

Confirmar la forma exacta de `TABS`, `ConfigTabsData`, y el `Promise.all` de `page.tsx` antes de editar (puede haber cambiado desde que se escribió el diseño).

- [ ] **Step 2: Editar `ConfigTabs.tsx`**

Agregar el import, el campo en `ConfigTabsData`, la entrada en el array `TABS` (entre `sla` y `directorio`), y la rama de render:

```typescript
import TabAutomatizaciones, { type AutomatizacionesData } from './TabAutomatizaciones'

// En la interface existente, agregar:
  automatizaciones: AutomatizacionesData

// En el array TABS existente, insertar entre la entrada 'sla' y la entrada 'directorio':
  { id: 'automatizaciones', label: 'Automatizaciones' },

// Junto a las otras ramas `{active === '...' && <Tab... />}`, agregar:
{active === 'automatizaciones' && <TabAutomatizaciones automatizaciones={data.automatizaciones} />}
```

- [ ] **Step 3: Editar `(app)/configuracion/page.tsx`**

Agregar las 2 queries nuevas al `Promise.all` existente del Server Component:

```typescript
import { obtenerAutomatizacionesData } from '@/lib/automatizaciones/obtener-datos'

// Dentro del Promise.all existente, agregar estas 2 entradas:
    obtenerAutomatizacionesData(admin),
    (admin as any)
      .from('v_automatizaciones_feed')
      .select('id, usuario_id, tipo, titulo, mensaje, link, leida, created_at, regla_id')
      .gte('created_at', new Date(Date.now() - 14 * 86_400_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(100),

// Y en el objeto `data` final pasado a ConfigTabs, agregar:
    automatizaciones: { reglas: automatizaciones, eventos: eventosRes ?? [] },
```

Ajustar los nombres de las variables destructuradas del `Promise.all` según el orden real que ya tiene el archivo (no romper las queries existentes).

- [ ] **Step 4: `tsc --noEmit` + `npm run build`**

```bash
npx tsc --noEmit
npm run build
```

Expected: ambos limpios.

- [ ] **Step 5: Commit**

```bash
git add src/components/configuracion/ConfigTabs.tsx "src/app/(app)/configuracion/page.tsx"
git commit -m "feat(automatizaciones): integrar el tab nuevo en Configuración"
```

---

### Task 14: Widget "Tareas sugeridas" en el dashboard del analista

**Files:**

- Create: `src/components/analista/TareasSugeridasAutomatizacion.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Read primero: `src/components/analista/DashboardResumen.tsx` (o el archivo real que juega ese rol — confirmar nombre exacto antes de editar) para igualar el lenguaje visual

- [ ] **Step 1: Leer `dashboard/page.tsx` completo**

Confirmar la forma exacta de la query `select('rol, nombre')`, el componente `DashboardAnalista`, y cómo recibe sus props hoy — puede haber cambiado desde el diseño.

- [ ] **Step 2: Crear `TareasSugeridasAutomatizacion.tsx`**

```typescript
import Link from 'next/link'
import { Bell } from 'lucide-react'

interface TareaSugerida {
  id: string
  titulo: string
  mensaje: string | null
  link: string | null
  created_at: string
}

interface Props { eventos: TareaSugerida[] }

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return `hace ${mins}m`
  const horas = Math.floor(mins / 60)
  if (horas < 24) return `hace ${horas}h`
  return `hace ${Math.floor(horas / 24)}d`
}

export default function TareasSugeridasAutomatizacion({ eventos }: Props) {
  if (eventos.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" style={{ borderTop: '3px solid #003B5C' }}>
      <div className="px-4 py-2.5 border-b border-gray-100">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tareas sugeridas</span>
      </div>
      <div className="divide-y divide-gray-50">
        {eventos.map(e => (
          <Link
            key={e.id}
            href={e.link ?? '#'}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition"
          >
            <Bell size={14} className="text-amber-500 flex-shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-medium text-gray-800 truncate">{e.titulo}</span>
            </span>
            <span className="text-[11px] text-gray-400 flex-shrink-0">{timeAgo(e.created_at)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Editar `dashboard/page.tsx`**

Cambiar la query de `select('rol, nombre')` a `select('id, rol, nombre')`, propagar `usuarioId` a `DashboardAnalista`, y dentro de `DashboardAnalista` agregar la consulta con `service_role` (no con el `supabase` de sesión — ver razón en el spec, sección "Integración con la agenda del analista") y renderizar el widget entre el bloque que ya contiene la Cola del Día y el siguiente bloque de la columna principal:

```typescript
import { getAdminClient } from '@/lib/configuracion/admin'
import TareasSugeridasAutomatizacion from '@/components/analista/TareasSugeridasAutomatizacion'

// Dentro de DashboardAnalista(), agregar esta consulta al Promise.allSettled existente
// (o como una consulta paralela adicional si el archivo no usa allSettled hoy):
const admin = getAdminClient()
const { data: tareasSugeridas } = await (admin as any)
  .from('notificaciones')
  .select('id, titulo, mensaje, link, created_at')
  .eq('usuario_id', usuarioId)
  .eq('tipo', 'ALERTA')
  .ilike('titulo', 'Sin gestión ≥%')
  .eq('leida', false)
  .order('created_at', { ascending: false })
  .limit(5)

// En el JSX, insertar inmediatamente debajo del componente que ya renderiza la Cola del Día:
<TareasSugeridasAutomatizacion eventos={tareasSugeridas ?? []} />
```

Confirmar el nombre real del prop/parámetro que hoy recibe el email del analista en `DashboardAnalista` y agregar `usuarioId` como prop nueva sin romper los existentes.

- [ ] **Step 4: `tsc --noEmit` + `npm run build`**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/analista/TareasSugeridasAutomatizacion.tsx "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(automatizaciones): widget de tareas sugeridas en el dashboard del analista"
```

---

### Task 15: Verificación final end-to-end + push

**Files:** ninguno nuevo — solo verificación

- [ ] **Step 1: Verificación de compilación completa**

```bash
npx tsc --noEmit
npm run build
```

Expected: ambos sin errores (checklist del spec, sección "Plan de pruebas manual", punto 1).

- [ ] **Step 2: Verificación manual en preview (si hay credenciales de Supabase disponibles en el entorno)**

Seguir los puntos 7-10 del "Plan de pruebas manual" del spec (`docs/superpowers/specs/2026-07-08-automatizaciones-design.md`):

- Como COORDINADOR: togglear cada una de las 4 reglas toggleables, confirmar `✓ Guardado` + fila nueva en `config_audit_log`.
- Intentar togglear `conciliacion_promesas` vía API directamente (curl/fetch) → confirmar 400.
- Como ANALISTA (o sin sesión): los 3 endpoints → 401/403.
- Feed: agrupado HOY/AYER, click marca leída y navega.
- Responsive a 375px.
- Widget del dashboard analista: aparece si hay tareas, click marca leída y navega.
- Forzar `/configuracion` como ANALISTA/ANALISTA_RIESGO → redirect a `/dashboard`.

Si el entorno no tiene credenciales reales de Supabase (mismo caso que el resto de esta sesión), documentar explícitamente qué no se pudo probar en vivo y pedirle al usuario que lo confirme en producción tras el deploy — no reportar el módulo como "verificado end-to-end" sin esa prueba real.

- [ ] **Step 3: Push**

```bash
git push origin master
```

- [ ] **Step 4: Avisar al usuario**

Confirmar que Vercel va a desplegar automáticamente, y recordarle probar en producción los puntos del Step 2 que no se pudieron verificar en este entorno.

---

## Notas para quien ejecute este plan

- **No hay test runner** en este proyecto — cada "verificar" de este plan es `tsc --noEmit` / `npm run build` / una consulta SQL de solo lectura / una prueba manual guiada, nunca un test automatizado.
- **`(admin as any)`** en todas las llamadas Supabase con el cliente admin es el patrón real del 100% del código comparable de este repo — no es un descuido, es intencional (ver spec, sección API).
- Si algún archivo mencionado (`admin.ts`, `ConfigTabs.tsx`, `dashboard/page.tsx`) tiene una forma distinta a la descrita cuando se llegue a ese task, **leer el archivo real primero** y adaptar el nombre de props/variables sin cambiar la lógica de negocio del step.
- Los 3 hallazgos colaterales del spec (`fn_cola_del_dia` no lee Semáforo, `analista_id` roto en `clientes/estado/route.ts`, reentrancia del patrón `EXISTS`) están fuera de alcance de este plan — no corregirlos de paso.
