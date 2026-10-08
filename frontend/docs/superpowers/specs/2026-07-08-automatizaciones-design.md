# Automatizaciones — Diseño

**Módulo:** Automatizaciones (SIC Cofersa) · **Versión:** 1.1 · **Fecha:** 08/07/2026
**Alcance:** Opción B — visibilidad + control on/off sobre automatizaciones que ya corren, más 2 reglas nuevas que conectan piezas a medio construir.

---

## Resumen y objetivo

Hoy el sistema ya ejecuta automatizaciones reales (`fn_notificar_promesas_hoy`, `fn_check_sync_salud`, `fn_conciliar_promesas`) pero corren "a ciegas": nadie las ve, nadie las puede apagar, y no hay un lugar donde el coordinador confirme que están funcionando. Al mismo tiempo, dos piezas ya construidas a medias no se conectan a nada: el parámetro `dias_sin_gestion_alerta` (configurable en `TabParametros`, pero ninguna función lo lee) y el `sla_vencimiento` de `solicitudes` (se guarda, pero nada lo revisa).

El objetivo de v1 es doble:

1. **Dar visibilidad y control** sobre las automatizaciones que ya corren en producción: una pestaña nueva en Configuración (`Automatizaciones`, exclusiva de COORDINADOR) donde cada regla se puede prender/apagar, muestra cuándo corrió, cuándo vuelve a correr, y un log de actividad clickeable.
2. **Cerrar el circuito de las 2 piezas a medias**, convirtiéndolas en reglas reales con su propia función SQL, cron y notificación.

El techo de la acción automática es explícito y no negociable en v1: **notificación interna + tarea sugerida en la agenda del analista**. El sistema nunca envía email ni WhatsApp al cliente sin que un humano lo revise primero.

Arquitectura de datos: **cero tablas nuevas**. Los on/off viven en `config_sistema` (la misma tabla clave/valor que ya usan `TabSemaforo`/`TabParametros`/`TabSLA`) y el "log de actividad" es una vista sobre `notificaciones` (la tabla que ya usan estas funciones), no una tabla de auditoría nueva.

---

## Alcance v1

Las 5 reglas candidatas, con la decisión final de cuál lleva on/off y cuál no:

| #   | Regla                                  | id interno              | ¿On/off? | Por qué                                                                                                                                                                                     |
| --- | -------------------------------------- | ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Promesa vence hoy sin cumplir          | `promesas_hoy`          | Sí       | Ya existe (`fn_notificar_promesas_hoy`), se envuelve con guard clause                                                                                                                       |
| 2   | Conciliación automática de promesas    | `conciliacion_promesas` | **No**   | Ya existe (`fn_conciliar_promesas`); apagarla deja promesas con estado incorrecto que otros reportes ya consumen — es housekeeping del sistema, no una alerta que el usuario decide activar |
| 3   | Salud de sincronización N8N ↔ Softland | `sync_salud`            | Sí       | Ya existe (`fn_check_sync_salud`); vive en su **propia sub-sección** de la pantalla (técnica/IT), separada de las reglas de cobranza                                                        |
| 4   | Cliente sin gestión ≥ N días           | `sin_gestion`           | Sí       | **Nueva** — activa `dias_sin_gestion_alerta`                                                                                                                                                |
| 5   | Solicitud con SLA vencido              | `sla_solicitudes`       | Sí       | **Nueva** — usa `solicitudes.sla_vencimiento`                                                                                                                                               |

Tabla maestra de referencia cruzada (id ↔ función ↔ clave de config ↔ tipo de notificación ↔ cron):

| id                      | Función SQL                        | Clave en `config_sistema`               | `notificaciones.tipo` | Prefijo de `titulo`                                                                         | Cron job                                 |
| ----------------------- | ---------------------------------- | --------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `promesas_hoy`          | `fn_notificar_promesas_hoy`        | `automatizacion_promesas_hoy_activa`    | `PROMESA`             | (único, no necesita filtro)                                                                 | `notificar-promesas-hoy` (existente)     |
| `conciliacion_promesas` | `fn_conciliar_promesas`            | _(ninguna)_                             | `ALERTA`              | `Promesa cumplida automáticamente —` / `Abono parcial detectado —` / `Promesa incumplida —` | `evening-conciliar-promesas` (existente) |
| `sync_salud`            | `fn_check_sync_salud`              | `automatizacion_sync_salud_activa`      | `SYNC`                | (único, no necesita filtro)                                                                 | `check_sync_salud` (existente)           |
| `sin_gestion`           | `fn_notificar_sin_gestion` (nueva) | `automatizacion_sin_gestion_activa`     | `ALERTA`              | `Sin gestión ≥`                                                                             | `notificar-sin-gestion` (nueva)          |
| `sla_solicitudes`       | `fn_notificar_sla_vencido` (nueva) | `automatizacion_sla_solicitudes_activa` | `SOLICITUD`           | `SLA vencido —`                                                                             | `notificar-sla-vencido` (nueva)          |

> **Nota de reconciliación 1 — nombres canónicos.** Los 4 diseños parciales usaban ids ligeramente distintos para las mismas reglas (`sin_gestion` vs `gestion_pendiente`; `sla_solicitudes` vs `sla_vencido`; `conciliacion_promesas` vs `conciliar_promesas`; y la clave de `sync_salud` con/sin prefijo `automatizacion_`). Se resolvió por mayoría y por consistencia interna del diseño SQL (que es el único que llegó a escribir las funciones completas end-to-end): `sin_gestion`, `sla_solicitudes`, `conciliacion_promesas`, y `automatizacion_sync_salud_activa` (con prefijo, para que las 4 claves de `config_sistema` de este módulo compartan un único namespace — la separación visual de "Salud del sistema" se logra agrupando en la UI, no cambiando el nombre de la clave). Esta tabla es la fuente de verdad; el resto del documento la usa sin excepción.

---

## Arquitectura de datos

### `config_sistema` — claves nuevas

`config_sistema` es `(clave text PK, valor text NOT NULL, descripcion text)` — sin columna `tipo`; verificado contra `supabase/schema_export/02_tables.sql:46-50`. No existe hoy ningún booleano real en la tabla, así que se usa la convención `'true'/'false'` como texto (no `'on'/'off'`), igual que el resto de valores de `config_sistema` que hoy son upserteados con `String(v)` desde `parametros/route.ts` y `sla/route.ts`.

| clave                                   | valores               | default  | gobierna |
| --------------------------------------- | --------------------- | -------- | -------- |
| `automatizacion_promesas_hoy_activa`    | `'true'` \| `'false'` | `'true'` | Regla 1  |
| `automatizacion_sync_salud_activa`      | `'true'` \| `'false'` | `'true'` | Regla 3  |
| `automatizacion_sin_gestion_activa`     | `'true'` \| `'false'` | `'true'` | Regla 4  |
| `automatizacion_sla_solicitudes_activa` | `'true'` \| `'false'` | `'true'` | Regla 5  |

La regla 2 (`fn_conciliar_promesas`) **no lleva clave** — es la decisión ya tomada, no apagable.

`dias_sin_gestion_alerta` **ya existe** en `TabParametros`/`parametros/route.ts` — no se crea de nuevo, solo se lee por primera vez desde SQL.

Seed (mismo `migration` que las guard clauses):

```sql
INSERT INTO config_sistema (clave, valor, descripcion) VALUES
  ('automatizacion_promesas_hoy_activa',    'true', 'Notifica al analista si tiene promesas que vencen hoy'),
  ('automatizacion_sync_salud_activa',      'true', 'Alerta al coordinador si una tabla de sync deja de recibir datos nuevos'),
  ('automatizacion_sin_gestion_activa',     'true', 'Notifica al analista los clientes de su cartera sin gestión registrada hace ≥ N días (usa dias_sin_gestion_alerta)'),
  ('automatizacion_sla_solicitudes_activa', 'true', 'Notifica al responsable (o a coordinación) cuando una solicitud supera su SLA sin resolverse')
ON CONFLICT (clave) DO NOTHING;
```

**Por qué el seed es obligatorio, no opcional:** si la clave no existe todavía en `config_sistema`, el guard clause de cada función usa `COALESCE(v_activa, 'true') = 'false'` — o sea, **falla abierta** (la automatización sigue activa, igual que corre hoy). Esto evita apagar silenciosamente algo que ya está en producción el día del deploy. Pero eso significa que hasta que corra el seed, el switch en la UI mostraría `activa: true` por default sin que exista la fila — el seed garantiza que lo que ve el coordinador coincida con lo que la función realmente lee desde el primer render.

### `notificaciones` — sin ALTER TABLE, sin tipos nuevos

`notificaciones.tipo` tiene un CHECK constraint real y cerrado, verificado en `02_tables.sql:553`:

```sql
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK ((tipo = ANY (ARRAY['SOLICITUD'::text, 'PROMESA'::text, 'ALERTA'::text, 'SYNC'::text])));
```

Las 5 reglas caben reutilizando estos 4 valores existentes — **no se agrega ningún tipo nuevo**. `ALERTA` ya es compartido hoy por `fn_conciliar_promesas` y por `src/app/api/clientes/estado/route.ts` (cambio manual de estado de cliente); se distinguen por prefijo de `titulo`, patrón que ya existe en el código y que este diseño simplemente extiende a las 2 reglas nuevas.

> **Nota de reconciliación 2 — el hallazgo más importante del merge.** Dos de los cuatro diseños parciales (UI e Integración con la Agenda) proponían crear tipos nuevos (`'GESTION'`/`'SLA'` uno, `'AUTOMATIZACION'` el otro), lo que exige `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT` más actualizar `TipoNotif` en `src/types/database.ts` y el mapa `TIPO_CFG` duplicado en `src/components/topbar.tsx` y `src/components/notificaciones/panel-notificaciones.tsx`. Se descarta explícitamente: contradice el espíritu de la decisión ya tomada ("cero tablas nuevas", reusar `notificaciones` tal cual existe) y el propio diseño de API, que verificó el CHECK constraint contra el código real y concluyó que **no hace falta ninguna migración de esquema** para las 5 reglas. Consecuencia práctica: `topbar.tsx`, `panel-notificaciones.tsx` y `src/types/database.ts` **no se tocan** en este módulo.

Mapeo final `tipo` + prefijo de `titulo` → regla (usado por la vista de la siguiente sección):

| Regla                   | `tipo`      | Prefijo de `titulo`                                                                                                                          | `link`                               |
| ----------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `promesas_hoy`          | `PROMESA`   | _(no hace falta filtrar por título — único `tipo=PROMESA` del sistema)_                                                                      | `/promesas`                          |
| `conciliacion_promesas` | `ALERTA`    | `Promesa cumplida automáticamente —` / `Abono parcial detectado —` / `Promesa incumplida —` (verificado línea 927-931 de `03_functions.sql`) | `/clientes/{cod}`                    |
| `sync_salud`            | `SYNC`      | _(único `tipo=SYNC` del sistema)_                                                                                                            | `/configuracion`                     |
| `sin_gestion`           | `ALERTA`    | `Sin gestión ≥`                                                                                                                              | `/clientes/{cod}`                    |
| `sla_solicitudes`       | `SOLICITUD` | `SLA vencido —`                                                                                                                              | `/solicitudes/{id}` o `/solicitudes` |

### Vista `v_automatizaciones_feed` (no es tabla nueva — es "la vista filtrada sobre notificaciones" de la decisión ya tomada)

Punto único de verdad para "qué fila de `notificaciones` pertenece a qué regla". La usan el endpoint de feed, la función de estadísticas y el `page.tsx` de Configuración — así nunca pueden desincronizarse tres implementaciones distintas del mismo criterio de clasificación.

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

Ojo con precedencia de operadores: `AND` liga más fuerte que `OR` en SQL — los paréntesis alrededor de cada bloque `OR` son obligatorios; sin ellos, por ejemplo, el filtro de `conciliacion_promesas` matchearía `titulo LIKE 'Abono parcial%'` sin importar el `tipo`, y podría capturar filas de otro origen.

Esta vista excluye automáticamente el `ALERTA` de `clientes/estado/route.ts` (título `"Estado de cliente cambiado a..."`, no matchea ningún patrón) y todo `SOLICITUD` genérico de aprobación/rechazo (`'Solicitud aprobada: ...'` / `'Solicitud rechazada: ...'`, confirmado en `src/app/api/solicitudes/[id]/route.ts:66-78`).

---

## Funciones SQL

### 1. Guard clauses en las 2 funciones existentes

**`fn_notificar_promesas_hoy`** (`03_functions.sql:1360-1426`):

```diff
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
+  v_activa    TEXT;
 BEGIN
+  -- Guard clause: on/off desde config_sistema (módulo Automatizaciones)
+  SELECT valor INTO v_activa
+  FROM config_sistema WHERE clave = 'automatizacion_promesas_hoy_activa';
+  IF COALESCE(v_activa, 'true') = 'false' THEN
+    RETURN;
+  END IF;
+
   v_hoy_cr := (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE;
   -- ... resto de la función sin cambios ...
```

**`fn_check_sync_salud`** (`03_functions.sql:570-593`):

```diff
 CREATE OR REPLACE FUNCTION public.fn_check_sync_salud()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
 AS $function$
 DECLARE
   fp_cartera text; fp_facturas text; fp_saldos text; fp_pagos text;
+  v_activa   text;
 BEGIN
+  SELECT valor INTO v_activa
+  FROM config_sistema WHERE clave = 'automatizacion_sync_salud_activa';
+  IF COALESCE(v_activa, 'true') = 'false' THEN
+    RETURN;
+  END IF;
+
   SELECT coalesce(max(updated_at)::text,'') || '|' || count(*) || '|' || round(coalesce(sum(total),0))
     INTO fp_cartera FROM cartera;
   -- ... resto de la función sin cambios ...
```

Ambas siguen `RETURNS void` y se despliegan con `CREATE OR REPLACE FUNCTION` — no requieren el patrón `DROP FUNCTION IF EXISTS` de CLAUDE.md §7.4 (ese patrón solo aplica si cambian las columnas de un `RETURNS TABLE`).

### 2. `fn_notificar_sin_gestion` (nueva — Regla 4)

Diseño per-cliente (una notificación por cliente que cruza el umbral, no un resumen agregado por analista): es la única forma de que el widget de "tareas sugeridas" en el dashboard del analista pueda mostrar filas clickeables que llevan directo al cliente afectado, y de que "disparó N veces esta semana" cuente eventos reales en vez de "días en que corrió el cron". Replica el criterio **completo** de `fn_cola_del_dia`, no solo una parte de él:

- **Mora agregada por el par `(cliente_cod, contribuyente)`**, no solo `cliente_cod` — `cartera` tiene `UNIQUE(contribuyente, cliente_cod)`, no `UNIQUE(cliente_cod)` (`02_tables.sql:531`), y un mismo `cliente_cod` puede tener más de una fila bajo distinto `contribuyente`. `fn_cola_del_dia` hace este join explícito (`03_functions.sql:732`); la primera versión de esta función lo omitía y podía sumar mora que no le corresponde al contribuyente vigente del cliente.
- **Última gestión filtrada por `activo/archived/legacy` Y por el analista actualmente asignado al cliente**, excluyendo además las gestiones `tipo='SISTEMA'` que genera automáticamente cada cambio de estado manual (`clientes/estado/route.ts:59-70`). Sin este filtro, un bloqueo/desbloqueo administrativo del coordinador resetea a 0 el contador de días sin gestión de un cliente que en realidad no tuvo contacto real de cobranza en semanas — justo el caso que la regla existe para detectar.
- **`mora_91_120` protegido con `GREATEST(...,0)`** (ajuste de Softland, documentado en CLAUDE.md §8).
- **Dedup aislado a esta regla:** el guard `EXISTS` filtra también por prefijo de `titulo` (`'Sin gestión ≥%'`), no solo por `tipo='ALERTA'` + `link` — sin ese filtro de título, una notificación `ALERTA` sin leer de _otro_ origen sobre el mismo cliente (conciliación de promesas, cambio de estado manual) hace que el `EXISTS` dé verdadero y la alerta de "sin gestión" nunca se cree, sin error visible.

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

  -- Casteo defensivo del parámetro (mismo estilo que fn_cargar_pagos_stage con dias_atraso)
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
      -- Join por (cliente_cod, contribuyente): cartera NO tiene cliente_cod único
      -- (UNIQUE(contribuyente, cliente_cod)) — mismo patrón que fn_cola_del_dia (03_functions.sql:732)
      SELECT mc.cliente_cod,
             SUM(c.mora_1_30 + c.mora_31_60 + c.mora_61_90 + GREATEST(c.mora_91_120,0) + c.mora_120_plus) AS mora_total
      FROM mc
      JOIN cartera c ON c.cliente_cod = mc.cliente_cod AND c.contribuyente = mc.contribuyente
      GROUP BY mc.cliente_cod
      HAVING SUM(c.mora_1_30 + c.mora_31_60 + c.mora_61_90 + GREATEST(c.mora_91_120,0) + c.mora_120_plus) > 0
    ),
    ultima_gestion AS (
      -- Mismo filtro de "gestión válida" que usa fn_cola_del_dia: activo/archived/legacy
      -- + hecha por el analista actualmente asignado al cliente + excluye tipo='SISTEMA'
      -- (los cambios de estado automáticos vía clientes/estado/route.ts no cuentan como contacto real)
      -- CORREGIDO en implementación (ver plan, nota post-Tarea 5): gestiones NO tiene
      -- columna usuario_id — se compara analista_email directo, sin pasar por usuarios.
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
      -- techo de volumen: máx 5 clientes por analista por corrida, priorizando los más viejos
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

    -- Dedup persistente y aislado a ESTA regla: filtra también por prefijo de título,
    -- para no confundirse con otras notificaciones tipo=ALERTA que comparten el mismo
    -- link (conciliación de promesas, cambio de estado manual del cliente).
    -- Mientras la alerta de ESTE cliente siga sin leer, no se duplica. Si el analista
    -- la marca leída pero no gestiona al cliente, la próxima corrida vuelve a cumplir
    -- el umbral y genera una alerta nueva (reaparición intencional).
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

### 3. `fn_notificar_sla_vencido` (nueva — Regla 5)

Agrupa por `responsable_email` (columna real, verificada en `02_tables.sql:422`, poblada solo por el flujo nuevo de catálogo por área — desestructurada en `src/app/api/solicitudes/route.ts:84` e insertada en la línea `:114`), resuelve a `usuarios.id`, y hace **fallback a todos los COORDINADOR activos** cuando el email no coincide con nadie (typo, correo de alguien inactivo, o campo vacío) — así la alerta nunca se pierde en silencio. El dedup diario de la rama principal excluye explícitamente el título exacto del fallback (`'SLA vencido — responsable no identificado'`) para que ambas ramas no se bloqueen entre sí cuando apuntan al mismo usuario — caso real y no hipotético: Jeffrey Díaz es COORDINADOR (destinatario del fallback) y además `responsableFijo` de dos áreas del catálogo (`credito_cobro`, `actualizacion_datos`, `src/lib/solicitudes/catalogo.ts:69,76,98`); sin este ajuste, si el fallback se disparaba temprano en el día, su propia solicitud vencida más tarde ese mismo día quedaba silenciada por el guard. Excluye estados terminales de ambos vocabularios que conviven en la tabla: el nuevo (`'Resuelta'`, `'Cerrada'`, `'Rechazada'`, ver `src/lib/solicitudes/catalogo.ts:21-28`) y el legacy (`'APROBADA'`, `'RECHAZADA'`, CLAUDE.md §7.1) — el filtro `sla_vencimiento IS NOT NULL` ya excluye por sí solo las solicitudes legacy, pero se deja la exclusión legacy por defensa en profundidad.

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

    -- Dedup diario, pero excluye explícitamente el título exacto del fallback: sin esto,
    -- un usuario que ya recibió el fallback ("responsable no identificado") más temprano
    -- el mismo día nunca vería su propia alerta directa más tarde (caso real: Jeffrey Díaz
    -- es COORDINADOR — destinatario del fallback — y también responsableFijo de 2 áreas).
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

  -- Fallback: solicitudes cuyo responsable no se pudo resolver → avisa a coordinación
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

> **Nota de reconciliación 3 — dedup distinto entre las dos reglas nuevas, a propósito.** `fn_notificar_sin_gestion` usa dedup "persistente mientras no se lea" (por cliente, aislado por prefijo de título); `fn_notificar_sla_vencido` usa dedup "una vez por día calendario" (por responsable, aislado del título exacto del fallback para no cruzarse con él). No es una inconsistencia: la regla 4 necesita granularidad por cliente porque alimenta un widget clickeable en el dashboard del analista (ver sección de Integración), mientras que la regla 5 es un broadcast de bajo volumen a coordinación donde un resumen diario es suficiente y más simple.

### 4. `fn_automatizaciones_resumen` — estadística semanal

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

Devuelve `{"promesas_hoy": 3, "conciliacion_promesas": 11, "sync_salud": 0, "sin_gestion": 5, "sla_solicitudes": 2}` — regla ausente en el objeto significa `0` disparos esa semana (el merge en Node debe usar `resumen[regla.id] ?? 0`).

### Archivos de migración propuestos

Siguiendo la convención real del repo (`supabase/migrations/YYYYMMDD_descripcion.sql`, verificado contra `20260615_fn_conciliar_promesas.sql` / `20260615_cron_conciliar_promesas.sql`):

- `supabase/migrations/20260708_automatizaciones_config_sistema.sql` — seed de las 4 claves
- `supabase/migrations/20260708_automatizaciones_funciones.sql` — guard clauses en `fn_notificar_promesas_hoy`/`fn_check_sync_salud` + `fn_notificar_sin_gestion` + `fn_notificar_sla_vencido`
- `supabase/migrations/20260708_automatizaciones_cron.sql` — los 2 `cron.schedule` nuevos
- `supabase/migrations/20260708_automatizaciones_vista_stats.sql` — `v_automatizaciones_feed` + `fn_automatizaciones_resumen`

---

## Cron jobs nuevos

Convención del proyecto (`08_cron_jobs.sql`, verificada): horarios en UTC, CR = UTC−6, ventana operativa 7:05am–5:05pm CR = 13:05–23:05 UTC, `1-5` = lunes a viernes.

```sql
SELECT cron.schedule('notificar-sin-gestion', '10 13 * * 1-5', $$SELECT public.fn_notificar_sin_gestion();$$);
SELECT cron.schedule('notificar-sla-vencido', '20 13-23 * * 1-5', $$SELECT public.fn_notificar_sla_vencido();$$);
```

- **`notificar-sin-gestion` — una vez al día, 07:10 CR:** "días sin gestión" es un delta de fechas por calendario, solo cambia en el corte de día — correr más seguido no agrega información. Se escalona 10 minutos después de `notificar-promesas-hoy` (07:00 CR) para que ambas notificaciones matutinas del analista lleguen juntas, y después del ciclo N8N de las 07:05 CR para no competir con la escritura de `cartera`.
- **`notificar-sla-vencido` — cada hora en horario operativo, 07:20–17:20 CR:** el SLA más corto del catálogo real es de 2 horas (`Desbloqueo temporal de cuenta`, área `credito_cobro`, `src/lib/solicitudes/catalogo.ts`) — una corrida diaria dejaría un caso vencido hasta 24h sin avisar a nadie. Se escalona al minuto `:20` para no coincidir con `check_sync_salud` (`:15`) ni con los syncs de N8N (`:00`/`:05`).

Referencia de los 3 cron existentes que **no se tocan** (verificados en `08_cron_jobs.sql:51-53`):

| Job                          | Expresión (UTC)    | Horario CR                   |
| ---------------------------- | ------------------ | ---------------------------- |
| `notificar-promesas-hoy`     | `0 13 * * 1-5`     | L-V 7:00am                   |
| `evening-conciliar-promesas` | `30 23 * * *`      | Todos los días 5:30pm        |
| `check_sync_salud`           | `15 13-23 * * 1-5` | L-V cada hora, 7:15am–5:15pm |

Ambos cron nuevos corren solo `L-V`, igual que `notificar-promesas-hoy`/`check_sync_salud` — coherente con que N8N tampoco sincroniza fin de semana.

---

## API routes

### Piezas compartidas

**`src/lib/automatizaciones/registry.ts`** — catálogo estático (análogo a `src/lib/reportes/registry.ts`), fuente de verdad de las 5 reglas:

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

El default `'true'` para las 3 reglas que ya corren hoy sin flag es crítico: si la clave todavía no existe en `config_sistema`, la ausencia **nunca** debe leerse como "apagada" — apagaría automatizaciones vivas en el primer deploy. Mismo patrón que `DEFAULTS_SEMAFORO` en `configuracion/page.tsx`.

**`src/lib/automatizaciones/cron.ts`** — calcula última/próxima ejecución a partir de la expresión cron, sin librería externa (el subconjunto de cron real del proyecto es siempre `minuto hora * * dow`, con `hora` como entero o rango tipo `13-23`, y `dow` como `*` o rango tipo `1-5`):

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

Es "programada", no "real": se deriva 100% de la expresión cron, no de un log de ejecuciones. El cron de Supabase corre igual todos los días aunque no encuentre nada que notificar, así que un log de corridas reales no aportaría más precisión que este cálculo determinístico.

**`src/lib/automatizaciones/obtener-datos.ts`** — función compartida que arma el payload completo de las 5 reglas (config + stats + timing), usada tanto por el Server Component de Configuración como por el endpoint `GET`, para no duplicar la lógica de enriquecimiento en dos lugares. Las llamadas a `admin.from()`/`admin.rpc()` van envueltas en `(admin as any)`, mismo patrón que usa el 100% del código comparable del repo (`parametros/route.ts`, `sla/route.ts`, `TabSincronizacion.tsx`, etc.):

```typescript
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

### Endpoints

Los 3 usan **exactamente** el mismo patrón de autorización y de cliente que ya usan `parametros`, `sla` y `log`:

```typescript
const check = await checkCoordinador();
if (!check.ok) return check.res;
const admin = getAdminClient();
```

#### `GET /api/configuracion/automatizaciones`

Devuelve `obtenerAutomatizacionesData(admin)`. Usado por el botón "Actualizar" de la pestaña — la carga inicial la hace el Server Component directamente, sin pasar por HTTP (ver sección de UI).

```json
{
  "data": [
    {
      "id": "promesas_hoy",
      "categoria": "cobranza",
      "nombre": "Promesa vence hoy sin cumplir",
      "descripcion": "...",
      "rpc": "fn_notificar_promesas_hoy",
      "toggleable": true,
      "activa": true,
      "cron": "0 13 * * 1-5",
      "cronLegible": "L-V 7:00am (CR)",
      "ultima_ejecucion_programada": "2026-07-08T13:00:00.000Z",
      "proxima_ejecucion_programada": "2026-07-09T13:00:00.000Z",
      "disparos_7d": 3
    }
  ]
}
```

#### `PUT /api/configuracion/automatizaciones`

Togglea una regla. El body habla en términos de dominio (`id`/`activa`); el servidor traduce a `clave`/`valor` — así el frontend nunca necesita conocer el nombre interno de la clave en `config_sistema`.

**Body:** `{ "id": "sin_gestion", "activa": false }`

1. Valida `id` contra `REGLAS.filter(r => r.toggleable).map(r => r.id)` (rechaza `conciliacion_promesas` y cualquier `id` desconocido).
2. `(admin as any).from('config_sistema').upsert({ clave: regla.configKey, valor: String(activa) }, { onConflict: 'clave' })`.
3. `insertAuditLog(admin, { tabla: 'config_sistema', accion: 'UPDATE', descripcion: 'Automatización "${regla.nombre}" ${activa ? "activada" : "desactivada"}', valor_nuevo: { clave: regla.configKey, valor: String(activa) }, realizado_por: check.email })`.

**Respuesta:** `{ "data": { "id": "sin_gestion", "activa": false } }`

#### `GET /api/configuracion/automatizaciones/feed`

Feed de actividad, clickeable, sobre `v_automatizaciones_feed`.

**Query params:** `regla` (opcional, un `ReglaId`), `dias` (opcional, default `14`).

```typescript
const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
let query = (admin as any)
  .from('v_automatizaciones_feed')
  .select('id, usuario_id, tipo, titulo, mensaje, link, leida, created_at, regla_id')
  .gte('created_at', desde)
  .order('created_at', { ascending: false })
  .limit(100);
if (regla) query = query.eq('regla_id', regla);
```

El join con `usuarios` (para mostrar nombre/email del destinatario) se hace en Node con un segundo `select` acotado a los `usuario_id` distintos de la página — no se usa embedding de PostgREST porque `v_automatizaciones_feed` es una vista, no una tabla con FK declarado.

```json
{
  "data": [
    {
      "id": "a1b2c3d4-...",
      "regla_id": "sin_gestion",
      "tipo": "ALERTA",
      "titulo": "Sin gestión ≥ 15 días — Ferretería El Tornillo",
      "mensaje": "El cliente Ferretería El Tornillo (00123) no tiene gestión registrada hace 17 días.",
      "link": "/clientes/00123",
      "leida": false,
      "created_at": "2026-07-08T13:10:04.000Z",
      "usuario": { "nombre": "María Paola Rodríguez", "email": "mrodriguez@cofersa.cr" }
    }
  ],
  "mostrados": 34,
  "truncado": false
}
```

> **Nota post-implementación:** el nombre original `total_ventana` era engañoso dado el `.limit(100)` de la consulta — sugería "total de eventos en la ventana" cuando en realidad era "cantidad devuelta, tope 100". Se renombró a `mostrados` + `truncado` (booleano que avisa si se llegó al tope) durante la revisión de calidad de la Tarea 10.

**Archivos:**

- `src/app/api/configuracion/automatizaciones/route.ts` — `GET` + `PUT` (mismo archivo, igual que `sla/route.ts`)
- `src/app/api/configuracion/automatizaciones/feed/route.ts` — `GET`

---

## Componentes de UI

### Árbol de archivos

```
src/lib/automatizaciones/registry.ts              ← catálogo REGLAS[] (nuevo)
src/lib/automatizaciones/cron.ts                  ← calcularEjecuciones (nuevo)
src/lib/automatizaciones/obtener-datos.ts         ← obtenerAutomatizacionesData (nuevo)
src/app/api/configuracion/automatizaciones/route.ts        ← GET + PUT (nuevo)
src/app/api/configuracion/automatizaciones/feed/route.ts   ← GET (nuevo)
src/components/configuracion/TabAutomatizaciones.tsx         ← orquestador (nuevo)
src/components/configuracion/FeedActividadAutomatizaciones.tsx ← feed (nuevo, archivo aparte)
src/components/analista/TareasSugeridasAutomatizacion.tsx    ← widget dashboard analista (nuevo)
src/components/configuracion/ConfigTabs.tsx        ← modificado: tab nuevo
src/app/(app)/configuracion/page.tsx               ← modificado: query + armado de datos
src/app/(app)/dashboard/page.tsx                   ← modificado: usuarioId + widget
```

### `TabAutomatizaciones.tsx`

```typescript
export interface ReglaEstado {
  id: ReglaId;
  activa: boolean; // conciliacion_promesas: siempre true (no toggleable, solo lectura)
  disparos_7d: number;
  ultima_ejecucion_programada: string | null;
  proxima_ejecucion_programada: string | null;
}

export interface EventoActividad {
  id: string;
  regla_id: ReglaId;
  titulo: string;
  mensaje: string | null;
  link: string | null;
  created_at: string;
}

export interface AutomatizacionesData {
  reglas: ReglaEstado[]; // 5 entradas
  eventos: EventoActividad[];
}

interface Props {
  automatizaciones: AutomatizacionesData;
}

export default function TabAutomatizaciones({ automatizaciones: init }: Props) {
  const [reglas, setReglas] = useState<ReglaEstado[]>(init.reglas);
  const [eventos, setEventos] = useState<EventoActividad[]>(init.eventos);
  const [loading, setLoading] = useState<ReglaId | null>(null); // regla en vuelo (deshabilita solo ESE switch)
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ReglaId | null>(null); // ✓ Guardado, 2s
  const [refreshing, setRefreshing] = useState(false);
  // ...
}
```

Sin loading de carga inicial: igual que `TabSemaforo`/`TabParametros`/`TabSLA`, los datos llegan resueltos por props desde `page.tsx` (Server Component). El único loading es el toggle en vuelo y el refresco manual del feed.

Sub-componentes internos (no exportados, definidos en el mismo archivo, igual que `ResultBadge` en `TabSincronizacion.tsx`): `ToggleSwitch` (pill 40×22px, hit-area ≥44×44px para mobile), `SeccionHeader`, `ReglaCard`.

### Layout de "Reglas" — tres zonas

```
┌─ SeccionHeader: "Reglas de cobranza" ──────────────────────────┐
│  grid-cols-1 lg:grid-cols-2 gap-3                               │
│  [ReglaCard: promesas_hoy]   [ReglaCard: sin_gestion]           │
│  [ReglaCard: sla_solicitudes]                                   │
└───────────────────────────────────────────────────────────────┘

┌─ SeccionHeader: "Mantenimiento automático" · "Siempre activo" ─┐
│  [ReglaCard: conciliacion_promesas]  ← ancho completo, sin toggle │
└─────────────────────────────────────────────────────────────────┘

┌─ bg-slate-50 border border-slate-200 rounded-xl p-4 (p-3 en mobile) ─┐
│  SeccionHeader: "Salud del sistema" · "Monitoreo técnico — no es cobranza" │
│  [ReglaCard: sync_salud]  ← ancho completo                           │
└────────────────────────────────────────────────────────────────────┘
```

La zona "Salud del sistema" es la única con fondo propio (tono neutro, sin cyan/navy de marca) — comunica "IT", no "cobranza", tal como pidió el usuario.

**Anatomía de una `ReglaCard` con toggle** (ej. `promesas_hoy`):

```
┌────────────────────────────────────────────────────────────────┐
│ [icon 30x30]  Promesa vence hoy sin cumplir      [ToggleSwitch] │
│  bg:#fef9c3   Le avisa al analista cuando...      ✓ Guardado    │ ← 2s tras togglear
│  color:#f59e0b                                                  │
│ ──────────────────────────────────────────────────────────────  │
│  ⚡ Disparó 3 veces esta semana                                 │
│  Última ejecución: hoy 07:00am    Próxima: mañana 7:00am        │
└────────────────────────────────────────────────────────────────┘
```

- Contenedor: `bg-white rounded-xl border border-gray-200 p-4`; borde pasa a `border-green-300` cuando `saved === regla.id` (mismo patrón exacto de `TabParametros`).
- Icon chip 30×30px, mismo tamaño que el chip de `panel-notificaciones.tsx` — el ojo asocia la card con sus eventos en el feed.
- `ToggleSwitch`: ON = `#009ee3` (cyan de marca, un solo lenguaje "cyan = encendido" en toda la pantalla), OFF = `bg-gray-200`. Thumb 18px, `transition-transform duration-150`.
- Mini-estadística: `⚡ Disparó {n} veces esta semana` (si `n===0`: `"No se disparó esta semana"`, gris claro).
- Fila de fechas: `flex-col sm:flex-row sm:justify-between` — "Última ejecución: {fmt(ultima_ejecucion_programada)}" / "Próxima: {fmt(proxima_ejecucion_programada)}".
- Cuando `activa === false`: card en `opacity-60`, fila de fechas reemplazada por `"Regla desactivada — no se generarán notificaciones"` (`text-amber-600`).

**Card de `conciliacion_promesas`** (zona "Mantenimiento", sin toggle): badge de solo lectura `"SIEMPRE ACTIVO"` (mismo look que `badgeEjecutor()` en `TabSincronizacion.tsx`, reimplementado localmente en este archivo porque esa función no está exportada — ver detalle en `FeedActividadAutomatizaciones.tsx` más abajo), descripción explica por qué no se puede apagar, y la mini-estadística muestra 3 sub-conteos (`"Esta semana: 5 cumplidas · 2 abonos · 1 incumplida"`) derivados de parsear el prefijo del `titulo` de cada evento de esa regla en el feed.

**Card de `sync_salud`** (zona "Salud del sistema"): misma anatomía, con `ServerCog`/`Database` como ícono. El enriquecimiento "por tabla" (punto verde/rojo por `cartera`/`facturas`/`saldos`/`pagos`, usando la tabla `sync_salud` ya existente) queda marcado como **mejora opcional, fuera de v1** (requeriría pasar datos adicionales de `sync_salud` al componente) — el mínimo viable de v1 es igual al resto de cards.

### `FeedActividadAutomatizaciones.tsx`

Archivo separado (tiene lógica propia de agrupado por día + navegación + refresco — complejidad comparable a `TabLog.tsx`).

```
┌─ SeccionHeader: "Actividad reciente" ────────── [RefreshCw ⟳ Actualizar] ┐
│  HOY                                                          3 eventos   │
│  ─────────────────────────────────────────────────────────────────────   │
│  [🟡] Promesa de pago vence hoy              07:00am                     │
│       Ferretería El Tornillo · ₡450.000               →                  │
│  [🟢] Promesa cumplida automáticamente        05:30pm                    │
│       Distribuidora Central                            →                  │
│  [🔵] Sincronización detenida: facturas       09:15am                    │
│       No recibe datos desde 07:15am CR (3 ciclos)      →                  │
│                                                                            │
│  AYER                                                          1 evento   │
│  [🔴] Promesa incumplida                      05:30pm                    │
│       Comercial Los Andes                               →                  │
└────────────────────────────────────────────────────────────────────────┘
```

- Agrupado por día CR (mismo cálculo que `fmtDayCR`/`hoyCR` de `TabSincronizacion.tsx`, **duplicado localmente en este archivo nuevo** porque esas funciones son locales al archivo original y no están exportadas — mismo criterio UTC-6 sin DST, sin agregar un `export` nuevo a un componente que hoy no lo necesita). "HOY" en cyan, "AYER" por comparación de fecha, contador de eventos a la derecha.
- Cada fila: `<button>` de ancho completo (accesibilidad, mismo patrón que `panel-notificaciones.tsx`), icon chip 24×24 con color/ícono de la regla — **con la excepción de `conciliacion_promesas`**, donde el color real se deriva del prefijo del `titulo` (`iconoConciliacion(titulo)`: verde+`CheckCircle2` / amber+`MinusCircle` / rojo+`XCircle`).
- Click → marca `leida=true` (mismo verbo `update({leida:true}).eq('id', id)` que usa toda la app) y `router.push(evento.link)`.
- Límite: últimos 14 días o 100 eventos (lo que ocurra primero) — sin paginación tipo `TabLog` (es actividad reciente, no auditoría exhaustiva).
- Empty state: círculo `bg-gray-100` + ícono `Zap`/`Bell`, `"Sin actividad todavía"` + `"Cuando una regla se dispare vas a ver el detalle acá."`.

### Estados (errores/confirmación)

| Estado                         | Tratamiento                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Error de red al togglear       | Banner `bg-red-50 border-red-200 text-red-700` (idéntico a `TabSemaforo`/`TabSLA`) + rollback optimista del switch a su posición anterior                                   |
| Error de red al refrescar feed | Texto inline `text-red-500` junto al botón "Actualizar", sin banner grande                                                                                                  |
| Confirmación de toggle         | Optimistic UI (CLAUDE.md §5.10): switch cambia de posición al click, antes de la respuesta; si confirma, `"✓ Guardado"` 2s + borde verde (patrón exacto de `TabParametros`) |
| Feed vacío                     | Ver arriba                                                                                                                                                                  |

### Integración en `ConfigTabs.tsx`

Tabs reales verificados (`ConfigTabs.tsx:31-39`): `vendedores`, `supervisores`, `usuarios`, `parametros`, `semaforo`, `sla`, `directorio`, `log`, `sincronizacion`. Se inserta `automatizaciones` entre `sla` y `directorio` (agrupa con las otras "reglas del sistema"):

```typescript
import TabAutomatizaciones, { type AutomatizacionesData } from './TabAutomatizaciones'

export interface ConfigTabsData {
  // ...todo lo existente sin tocar...
  automatizaciones: AutomatizacionesData   // ← NUEVO
}

const TABS = [
  { id: 'vendedores',   label: 'Vendedores' },
  { id: 'supervisores', label: 'Supervisores' },
  { id: 'usuarios',     label: 'Usuarios' },
  { id: 'parametros',   label: 'Parámetros' },
  { id: 'semaforo',     label: 'Semáforo' },
  { id: 'sla',          label: 'SLA Solicitudes' },
  { id: 'automatizaciones', label: 'Automatizaciones' },  // ← NUEVO
  { id: 'directorio',   label: 'Directorio' },
  { id: 'log',           label: 'Log del Sistema' },
  { id: 'sincronizacion', label: 'Sincronización' },
] as const

{active === 'automatizaciones' && <TabAutomatizaciones automatizaciones={data.automatizaciones} />}
```

Un import, un campo de tipo, una entrada de array, una rama de render — mismo tamaño de diff que cualquier tab existente. El tab-nav ya usa `flex flex-wrap gap-2`, no requiere cambios para acomodar la pill nueva.

### Cambios en `(app)/configuracion/page.tsx`

Se integran dos llamadas más al `Promise.all` existente (no dos `await` secuenciales fuera del array — eso serializaría innecesariamente dos queries independientes):

```typescript
const admin = getAdminClient();
const [automatizaciones, { data: eventosRes }] = await Promise.all([
  obtenerAutomatizacionesData(admin),
  (admin as any)
    .from('v_automatizaciones_feed')
    .select('id, usuario_id, tipo, titulo, mensaje, link, leida, created_at, regla_id')
    .gte('created_at', new Date(Date.now() - 14 * 86_400_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(100),
]);

const data: ConfigTabsData = {
  // ...campos existentes...
  automatizaciones: { reglas: automatizaciones, eventos: eventosRes ?? [] },
};
```

`obtenerAutomatizacionesData` internamente ya hace su propio `Promise.all` de 2 queries — al combinarla en el array externo con la consulta del feed, las 3 queries de este módulo corren en paralelo entre sí.

### Responsive

Sin overflow horizontal que resolver (no hay tablas HTML en este tab, todo es flex/grid): `grid-cols-1 lg:grid-cols-2` para la zona de cobranza; fila de fechas `flex-col sm:flex-row`; botón "Actualizar" pasa de `icon+texto` a solo `icon` bajo `sm`; hit-area del `ToggleSwitch` ≥44×44px táctil aunque el pill visual sea de 40×22px.

---

## Integración con la agenda del analista

**Restricción de riesgo ya acordada, confirmada por lectura del código real:** `fn_cola_del_dia` (`03_functions.sql:712-796`) es 100% dinámica (4 CTEs sobre `maestro_clientes`+`cartera`+`gestiones`+`promesas`, sin tabla intermedia) — **y además no se invoca desde ningún lugar de la aplicación**. La "Cola del Día" real (Dashboard Analista y Mi Cartera) se calcula con `computarColaDia()`, una implementación TypeScript paralela en `src/lib/utils/cola-analista.ts` ("Algoritmo V4 con ICP"). Este diseño no toca ninguna de las dos: ni el RPC SQL (que ni siquiera llegaría a pantalla) ni `cola-analista.ts` (fuente de verdad activamente afinada para 2 pantallas, que no debe acoplarse a una feature de automatizaciones).

**Solución: widget separado**, alimentado por `notificaciones` (no por `cola-analista.ts`), con cero acoplamiento al algoritmo de scoring.

### Componente `TareasSugeridasAutomatizacion.tsx`

`src/components/analista/TareasSugeridasAutomatizacion.tsx`, junto a sus hermanos (`DashboardResumen.tsx`, `AgendaCompacta.tsx`, `PorVendedor.tsx`).

**Posición:** dentro de la columna principal de `DashboardAnalista()` (`src/app/(app)/dashboard/page.tsx`), inmediatamente debajo de `<DashboardResumen .../>` (que ya contiene la Cola del Día) y arriba de `<PorVendedor .../>`:

```tsx
<div className="flex-1 min-w-0 flex flex-col gap-4">
  <DashboardResumen kpis={kpis} cola={colaParaDashboard} promesas={promesas} hoyStr={hoyStr} />
  <TareasSugeridasAutomatizacion eventos={tareasSugeridas} /> {/* ← NUEVO */}
  <PorVendedor vendedores={vendedores} />
</div>
```

Esta posición comunica la jerarquía correcta: Cola del Día = lista de trabajo primaria por scoring de cartera; Tareas Sugeridas = capa secundaria detectada por reglas. Cero riesgo de interferir con `cola-analista.ts` porque no comparten componente ni lógica.

**Fuente de datos** (solo Regla 4 — ver "Control de acceso" para por qué): filtra por el mismo esquema `tipo=ALERTA` + prefijo de título que usa `fn_notificar_sin_gestion`, sin ningún tipo de notificación nuevo. **Se consulta con el cliente admin (`service_role`), no con el `supabase` de sesión del analista.** La política RLS real de `notificaciones` es `USING (usuario_id = auth.uid())` (`06_policies.sql:66-68`), pero `notificaciones.usuario_id` siempre se puebla con `usuarios.id`, un UUID independiente de `auth.uid()` — documentado explícitamente en el propio código (`src/app/api/solicitudes/route.ts:58-59`: _"usuarios.id es un UUID independiente..., distinto de auth.uid()"_). Si en producción `usuarios.id ≠ auth.uid()`, como asume el resto del sistema (de ahí existen `get_usuario_id()`/`get_mi_rol()` para resolver ese join), una consulta RLS-scoped devolvería 0 filas siempre y el widget quedaría permanentemente vacío sin error visible. El mismo riesgo ya existe hoy en la campana del Topbar (`src/app/(app)/layout.tsx:44-59`, que sí usa el `supabase` de sesión) — pero no se hereda sin mitigar en esta pieza nueva: se usa `getAdminClient()` server-side, igual que ya hace `obtenerAutomatizacionesData` para el lado coordinador, filtrando explícitamente por `usuario_id = usuarioId` en la query en vez de depender de RLS:

```typescript
(admin as any)
  .from('notificaciones')
  .select('id, titulo, mensaje, link, created_at')
  .eq('usuario_id', usuarioId) // usuarios.id del analista, no auth.uid() — seguro porque corre con admin, no con RLS
  .eq('tipo', 'ALERTA')
  .ilike('titulo', 'Sin gestión ≥%')
  .eq('leida', false)
  .order('created_at', { ascending: false })
  .limit(5);
```

Esto se agrega al `Promise.allSettled([...])` ya existente en `DashboardAnalista()` — mismo patrón de paralelismo que `agendaGestionesRes`/`promesasRes`, sustituyendo únicamente el cliente por `admin` para esta consulta puntual.

**Cambio necesario en `dashboard/page.tsx`:** hoy `DashboardPage()` solo hace `select('rol, nombre')` (verificado, línea 72) y pasa `userEmail` a `DashboardAnalista`, que no recibe `usuarioId`. Cambio mínimo, un solo archivo:

```diff
- .select('rol, nombre')
+ .select('id, rol, nombre')
  ...
- const row = data as { rol: string; nombre: string } | null
+ const row = data as { id: string; rol: string; nombre: string } | null
  ...
- return <DashboardAnalista supabase={supabase} hoyStr={hoyStr} userEmail={userEmail} nombre={nombreUsuario} />
+ return <DashboardAnalista supabase={supabase} hoyStr={hoyStr} userEmail={userEmail} usuarioId={row?.id ?? ''} nombre={nombreUsuario} />
```

`DashboardAnalista` ya recibe `supabase` como prop desde `page.tsx`; para la consulta puntual del widget también importa `getAdminClient()` (mismo helper que usa `configuracion/page.tsx`), sin exponerlo al cliente — la llamada ocurre enteramente en el Server Component, antes de que cualquier HTML llegue al navegador.

**Acción al hacer clic:** replica exactamente `handleNotiClick` de `src/components/topbar.tsx` — marca `leida=true` y navega con `router.push(link)`. Cero UX nueva: el analista ya conoce este comportamiento porque es el mismo de la campana del Topbar.

**Diseño visual:** mismo lenguaje que sus vecinas (`border-top: 3px solid #003B5C`, header con barra de acento + label uppercase 10px, igual que "Cola del Día" en `DashboardResumen.tsx`), lista de filas clicables (ícono + texto + timeago), estado vacío con el mismo tono que `colaVisible.length === 0`. Máx. 5 filas visibles (ya viene acotado por el `LIMIT 5` de la función SQL), con footer "Ver todas →" si hiciera falta, mismo idioma que el footer de Cola del Día/Mis Promesas.

**Por qué el dedup persistente del SQL importa para la UX del widget:** si el analista marca leída una alerta pero no gestiona al cliente, la próxima corrida del cron (07:10 CR del día siguiente) vuelve a encontrar el umbral cumplido y genera una alerta nueva — el widget "recuerda" que el cliente sigue sin atención sin necesitar estado adicional en el frontend.

---

## Control de acceso

### Pestaña "Automatizaciones" en Configuración

Configuración es hoy exclusivo de COORDINADOR, confirmado en dos capas:

1. **Server-side (la que importa):** `src/app/(app)/configuracion/page.tsx` — `if (perfilRow?.rol !== 'COORDINADOR') redirect('/dashboard')`. Sin excepciones — **también redirige a `ANALISTA_RIESGO`**, a diferencia de otras pantallas donde ese rol sí tiene secciones propias.
2. **Nav (defensa en profundidad):** `src/components/sidebar.tsx` — `{ label: 'Configuración', href: '/configuracion', roles: ['COORDINADOR'] }`.

La pestaña `Automatizaciones` **hereda este gate gratis**, sin trabajo adicional de seguridad: si `ANALISTA`/`ANALISTA_RIESGO` fuerzan `/configuracion` por URL, el `redirect` server-side los intercepta antes de que `ConfigTabs` se renderice. Los 3 endpoints nuevos (`GET`/`PUT /automatizaciones`, `GET /automatizaciones/feed`) usan `checkCoordinador()` — mismo checker que ya usan `parametros`/`sla`/`log`, sin checker nuevo.

### Widget "Tareas sugeridas"

Vive solo en `DashboardAnalista()` (`dashboard/page.tsx` bifurca completamente entre `DashboardCoordinador` y `DashboardAnalista`, sin JSX compartido — colocar el widget solo en la segunda es un borde natural). Solo consume notificaciones de la Regla 4 (`sin_gestion`):

- **Regla 4** es intrínsecamente analista-facing: el destinatario siempre es `maestro_clientes.analista_email`.
- **Regla 5** (SLA solicitudes) es intrínsecamente coordinador-facing en la práctica, aunque por un motivo más preciso que "aprobar/rechazar": las solicitudes que realmente importan para esta regla son las del flujo nuevo por área — el único que llena `sla_vencimiento` — y esas cambian de estado vía `src/app/api/solicitudes/[id]/estado/route.ts`, que **no tiene ningún gate de rol** y **nunca setea `revisor_id`** en ningún estado, ni siquiera al pasar a `'Resuelta'`/`'Cerrada'`. El endpoint legacy `src/app/api/solicitudes/[id]/route.ts` sí setea `revisor_id` al aprobar/rechazar (gateado a `rol='COORDINADOR'`), pero gobierna únicamente `AUMENTO_LIMITE`/`EXCEPCION_CREDITO`/`NOTA_CREDITO` — el mismo flujo legacy que este diseño ya reconoce que nunca llena `sla_vencimiento`. En ambos casos la conclusión es la misma: mientras una solicitud relevante para la Regla 5 está pendiente, no existe un "revisor asignado" individual a quien dirigir un widget — `fn_notificar_sla_vencido` ya resuelve esto con su fallback a `usuarios.rol='COORDINADOR'`.

No hace falta un widget nuevo para la Regla 5: `Topbar` (con su campana) se renderiza para todos los roles desde `src/app/(app)/layout.tsx` sin gating — el COORDINADOR ya recibe sus notificaciones de SLA vencido por el canal existente que funciona hoy en producción.

---

## Manejo de errores y casos borde

Mismo shape de error en los 2 endpoints de escritura/lectura de Configuración, replicando literalmente lo que ya hacen `parametros/route.ts`/`sla/route.ts`:

| Situación                               | Status        | Body                                                                                                                                                                        |
| --------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin sesión / sin email                  | 401           | `{ "error": "No autorizado" }`                                                                                                                                              |
| Rol distinto de COORDINADOR             | 403           | `{ "error": "Acceso restringido al coordinador" }`                                                                                                                          |
| `PUT` con JSON inválido                 | 400           | `{ "error": "Body JSON inválido" }`                                                                                                                                         |
| `PUT` sin `id` o `activa` no booleano   | 400           | `{ "error": "id y activa (boolean) son requeridos" }`                                                                                                                       |
| `PUT` con `id` inexistente en `REGLAS`  | 400           | `{ "error": "Regla no reconocida: {id}" }`                                                                                                                                  |
| `PUT` con `id: 'conciliacion_promesas'` | 400           | `{ "error": "Esta regla no se puede desactivar: es housekeeping automático del sistema" }`                                                                                  |
| Falla el `upsert` en `config_sistema`   | 500           | `{ "error": error.message }`                                                                                                                                                |
| Falla `fn_automatizaciones_resumen`     | 500 (parcial) | El `GET` de listado **no** falla completo: si la RPC de stats falla, se degrada devolviendo `disparos_7d: null` por regla en vez de tumbar el on/off, que es lo crítico     |
| Falla el `select` del feed              | 500           | `{ "error": error.message }`                                                                                                                                                |
| `insertAuditLog` falla                  | —             | Nunca se propaga (try/catch vacío en `admin.ts`, mismo patrón que `pagos-anulados`/`pagos-duplicado-descartado`) — el toggle se considera exitoso aunque la auditoría falle |

### Casos borde de las funciones SQL

- **`cliente_cod` no es único en `cartera`** (la clave real es `(contribuyente, cliente_cod)`, `02_tables.sql:531`): `mora_cli` une por el par completo, igual que `fn_cola_del_dia` (`03_functions.sql:732`), para no sumar mora de un contribuyente distinto bajo el mismo código de cliente.
- **Gestiones automáticas de sistema no cuentan como contacto real:** `ultima_gestion` excluye `tipo='SISTEMA'` (generadas por `clientes/estado/route.ts` en cada cambio de estado manual) y solo cuenta gestiones hechas por el analista actualmente asignado al cliente — igual criterio que `fn_cola_del_dia` — para que un bloqueo/desbloqueo administrativo no resetee el contador de días sin gestión.
- **Dedup de `sin_gestion` aislado por título:** el guard `EXISTS` filtra también `titulo LIKE 'Sin gestión ≥%'`, no solo `tipo='ALERTA'` + `link`, para no confundirse con notificaciones de conciliación de promesas o cambio de estado que comparten el mismo cliente y el mismo `link`.
- **Dedup diario de `sla_vencido` no cruza con el fallback:** el guard de la rama principal excluye el título exacto `'SLA vencido — responsable no identificado'`, para que un mismo usuario (p. ej. Jeffrey Díaz, COORDINADOR y también `responsableFijo` de 2 áreas del catálogo) no pierda su propia alerta directa por haber recibido antes la de fallback el mismo día.
- **`responsable_email` sin match en `usuarios`** (typo, correo inactivo, campo vacío): resuelto por el fallback a coordinación en `fn_notificar_sla_vencido` — sin ese fallback la alerta se perdería en silencio.
- **Solicitudes legacy** (`AUMENTO_LIMITE`/`EXCEPCION_CREDITO`/`NOTA_CREDITO`) nunca disparan la Regla 5 — `sla_vencimiento` solo lo llena el flujo nuevo por área. Es el alcance esperado, no un bug, pero hay que comunicarlo así al coordinador.
- **`dias_sin_gestion_alerta` ausente en `config_sistema`** (nadie lo ha guardado desde `TabParametros`, que a diferencia de `TabSemaforo` no tiene defaults visibles): `fn_notificar_sin_gestion` cae a `15` días por defecto de forma silenciosa. Se recomienda sembrar esa fila explícitamente al desplegar, para que lo que ve el coordinador en pantalla coincida con lo que el cron realmente usa.
- **`mora_91_120` negativo** (ajuste Softland, CLAUDE.md §8): protegido con `GREATEST(mora_91_120,0)` en el `HAVING` de `mora_cli` — sin esto, un cliente con ajuste negativo grande podría quedar excluido incorrectamente de la Regla 4 pese a tener mora real en otros tramos.
- **Posible mismatch RLS `auth.uid()` vs `usuarios.id`** en la fuente de datos del widget nuevo: mitigado consultando con `getAdminClient()` server-side en vez del cliente de sesión del analista (ver sección de Integración). **[Actualización 09/07/2026]** Este mismatch se corrigió en la raíz: las políticas RLS de `notificaciones` (`"Usuario ve sus propias notificaciones"` y `"Usuario actualiza sus notificaciones"`) comparaban `usuario_id = auth.uid()` directo, lo cual solo coincidía por casualidad para 1 de 6 usuarios reales (`usuarios.id` y `auth.users.id` son espacios de UUID separados). Se corrigieron para resolver por email (`usuario_id = (SELECT id FROM usuarios WHERE email = auth.jwt()->>'email' LIMIT 1)`), igual que el patrón ya probado en `notas_rapidas`. Verificado con simulación de JWT en Supabase (antes: 0 filas visibles para `jdiaz@cofersa.cr` pese a tener 9 notificaciones reales; después: 9, y sin fuga hacia otros usuarios). El workaround de `getAdminClient()` del widget de Task 14 queda como defensa adicional (correcto y no dañino de mantener), pero ya no es estrictamente necesario para que el widget vea datos — el cliente de sesión normal ahora también funcionaría.
- **Volumen al activar por primera vez:** el `LIMIT 5`/analista/corrida de la Regla 4 evita que un backlog inicial (ej. 40 clientes cruzan el umbral el primer día) inunde la campana; el resto se cubre en corridas subsecuentes.
- **Reentrancia del `EXISTS` anti-duplicado:** si una función corriera dos veces solapadas (cron + trigger manual), dos transacciones concurrentes podrían pasar el `EXISTS` antes de que cualquiera haga el `INSERT`, generando una notificación duplicada. Es una debilidad preexistente en el patrón que ya usa `fn_notificar_promesas_hoy` (heredada al replicarlo), no algo introducido por este diseño. Una solución robusta requeriría un índice único parcial o un advisory lock — fuera de alcance de v1.
- **Hallazgo colateral, fuera de alcance:** `src/app/api/clientes/estado/route.ts` lee `analista_id` de `maestro_clientes`, pero esa tabla no tiene esa columna (solo `analista_email`/`analista_nombre`) — esa notificación de cambio de estado probablemente nunca se dispara hoy. No se toca en este diseño.

---

## Plan de pruebas manual

Sin test runner (CLAUDE.md): la verificación es `tsc --noEmit` limpio + `npm run build` sin errores + prueba manual dirigida.

**1. Compilación**

- [ ] `npx tsc --noEmit` limpio tras agregar los 7 archivos nuevos y modificar los 3 existentes.
- [ ] `npm run build` sin errores.

**2. Migraciones SQL (Supabase SQL editor o MCP)**

- [ ] Aplicar las 4 migraciones en orden; `SELECT clave, valor FROM config_sistema WHERE clave LIKE 'automatizacion_%';` devuelve 4 filas en `'true'`.
- [ ] `SELECT jobname, schedule FROM cron.job WHERE jobname IN ('notificar-sin-gestion','notificar-sla-vencido');` confirma ambos jobs con la expresión correcta.

**3. Guard clauses (fail-open del día 1)**

- [ ] Sin la fila de seed (probar en una copia/branch antes del `INSERT`), correr `SELECT public.fn_notificar_promesas_hoy();` manualmente y confirmar que sigue insertando notificaciones (COALESCE fail-open).
- [ ] Con el seed aplicado, `UPDATE config_sistema SET valor='false' WHERE clave='automatizacion_promesas_hoy_activa';`, correr la función, confirmar que **no** inserta nada nuevo; revertir a `'true'`.
- [ ] Repetir el mismo apagado/encendido para `automatizacion_sync_salud_activa` contra `fn_check_sync_salud`.

**4. `fn_notificar_sin_gestion`**

- [ ] Bajar temporalmente `dias_sin_gestion_alerta` a un valor bajo (ej. `1`) desde `TabParametros`.
- [ ] Correr `SELECT public.fn_notificar_sin_gestion();` manualmente; confirmar filas en `notificaciones` con `tipo='ALERTA'` y `titulo LIKE 'Sin gestión ≥%'`, tope de 5 por analista.
- [ ] Re-correr inmediatamente: confirmar que no duplica (dedup persistente por `titulo`+`link`+`leida=false`).
- [ ] Marcar una notificación como `leida=true` vía UI y re-correr: confirmar que **esa** alerta reaparece y las demás no.
- [ ] Con un cliente que tenga una notificación `ALERTA` sin leer de **otro** origen (p. ej. cambio de estado manual, mismo `link`), confirmar que igual se genera su alerta de `Sin gestión ≥` — el guard ya no debe confundirla con la notificación ajena.
- [ ] Con un cliente cuya única gestión reciente sea `tipo='SISTEMA'` (generada por un cambio de estado), confirmar que igual se considera "sin gestión" si supera el umbral (no debe resetear el contador).
- [ ] Restaurar `dias_sin_gestion_alerta` al valor real.

**5. `fn_notificar_sla_vencido`**

- [ ] Sobre una solicitud de prueba (no producción viva), forzar `sla_vencimiento` a un timestamp pasado con `responsable_email` de un usuario real y activo; correr la función; confirmar notificación `tipo='SOLICITUD'`, `titulo LIKE 'SLA vencido%'`, dirigida al usuario correcto.
- [ ] Repetir con `responsable_email` que no matchea ningún usuario (typo o vacío); confirmar que todos los `COORDINADOR` activos reciben la notificación de fallback `"SLA vencido — responsable no identificado"`.
- [ ] Con un usuario que reciba primero el fallback ("responsable no identificado") y luego, el mismo día, tenga una solicitud propia vencida (`responsable_email` = su correo), confirmar que **ambas** notificaciones llegan — no deben bloquearse entre sí.

**6. Vista y estadística**

- [ ] `SELECT * FROM v_automatizaciones_feed ORDER BY created_at DESC LIMIT 20;` — confirmar `regla_id` correcto por fila y ninguna fila con `regla_id` nulo colándose (el `WHERE` de la vista ya debería excluirlas).
- [ ] `SELECT public.fn_automatizaciones_resumen();` devuelve un jsonb con las claves esperadas.

**7. API**

- [ ] Como COORDINADOR: `PUT` togglear cada una de las 4 reglas toggleables; confirmar fila nueva en `config_audit_log`.
- [ ] `PUT` con `id: 'conciliacion_promesas'` → 400 con el mensaje específico.
- [ ] Como ANALISTA (o sesión sin auth): cualquiera de los 3 endpoints → 403/401.
- [ ] `GET .../feed?regla=sin_gestion&dias=7` filtra correctamente vs. sin query params.

**8. UI — pestaña Automatizaciones**

- [ ] Render inicial (vía Server Component, sin loading spinner) muestra las 5 cards en las 3 zonas correctas.
- [ ] Toggle: click cambia el switch inmediatamente (optimista), aparece `"✓ Guardado"` + borde verde a los ~200-500ms.
- [ ] Forzar un error de red (throttle/offline en devtools) al togglear: el switch revierte y aparece el banner rojo.
- [ ] Feed: agrupado HOY/AYER correcto, click en una fila marca `leida` y navega al `link`.
- [ ] Empty state del feed en un ambiente sin actividad reciente.
- [ ] Responsive: 375px de ancho — grid cae a 1 columna, fila de fechas se apila, botón "Actualizar" queda solo con ícono.

**9. Widget del dashboard analista**

- [ ] Como un analista con al menos un cliente cruzando el umbral de `dias_sin_gestion_alerta`: el widget muestra hasta 5 tareas.
- [ ] Click en una tarea marca `leida=true` y navega a `/clientes/{cod}`.
- [ ] Tras registrar una gestión al cliente y re-correr el cron (o la función manualmente), la tarea correspondiente ya no reaparece.

**10. Control de acceso**

- [ ] Como ANALISTA o ANALISTA_RIESGO, forzar `/configuracion` por URL: `redirect('/dashboard')`.
- [ ] Confirmar que la pestaña "Automatizaciones" no aparece en el nav para esos roles (no debería ni llegar a intentarlo, dado el redirect de página completa).

---

## Riesgos identificados y cómo se mitigan

1. **Fail-open silencioso si el seed no corre antes del primer deploy de las guard clauses.** Mitigado: la migración de seed y las guard clauses van en el mismo lote de migraciones, en el orden `config_sistema` → `funciones` (ver "Archivos de migración propuestos"), y el fail-open (`COALESCE(...,'true')`) garantiza que aunque el orden se invirtiera por error, nada se apaga solo.
2. **`responsable_email` como texto libre sin FK a `usuarios`.** Un typo pierde la alerta de SLA en silencio si no hubiera fallback. Mitigado con el broadcast a `COORDINADOR` cuando `v_uid` no resuelve (§ Funciones SQL, punto 3).
3. **Reentrancia del `EXISTS` anti-duplicado** (carrera entre corridas solapadas) — debilidad preexistente en el patrón de `fn_notificar_promesas_hoy`, heredada al replicarlo en las 2 funciones nuevas. No se resuelve en v1 (requeriría índice único parcial o advisory lock); el impacto es bajo (como mucho una notificación duplicada el mismo día).
4. **Volumen inicial al activar la Regla 4** con un `dias_sin_gestion_alerta` bajo puede generar una ráfaga de notificaciones el primer día. Mitigado con el `LIMIT 5`/analista/corrida; se recomienda avisar al equipo antes de bajar el umbral agresivamente.
5. **Inconsistencia ya existente entre `fn_cola_del_dia` y `fn_clientes_lista`** al calcular "última gestión" (uno filtra `activo/archived/legacy` + analista asignado, el otro no filtra nada de eso). Se replicó el criterio **completo** de `fn_cola_del_dia` en `fn_notificar_sin_gestion` (filtro `activo/archived/legacy` + gestión hecha por el analista actualmente asignado al cliente + exclusión de gestiones `tipo='SISTEMA'`) por ser la fuente operativa más usada — vale que el equipo sepa que `fn_clientes_lista` sigue usando un criterio más simple, sin arreglarlo en este diseño.
6. **`mora_91_120` negativo** podría excluir clientes de la Regla 4 incorrectamente. Mitigado con `GREATEST(mora_91_120,0)`.
7. **Cron nuevo compitiendo por recursos con los ciclos de N8N.** Mitigado escalonando minutos (`:10` y `:20`) lejos de `:00`/`:05` (N8N) y `:15` (`check_sync_salud`).
8. **Ambos cron nuevos corren solo L-V**, igual que el resto del sistema — un SLA de 2h que vence viernes 5pm no se re-evalúa hasta el lunes. Es el mismo comportamiento que ya acepta el resto del sistema (N8N tampoco sincroniza fin de semana), no algo que este diseño empeore.
9. **Hallazgo colateral: `fn_cola_del_dia` no lee los umbrales de `TabSemaforo`** (hardcodeados en SQL). No forma parte de este alcance — se deja anotado.
10. **Hallazgo colateral: `clientes/estado/route.ts` referencia una columna `analista_id` que `maestro_clientes` no tiene** — esa notificación probablemente nunca se dispara. No se toca en este diseño.
11. **Dedup de `sin_gestion` podía chocar con alertas `ALERTA` de otro origen** (conciliación de promesas, cambio de estado del cliente) y suprimir en silencio la alerta de cobranza sin dejar rastro. Mitigado agregando `titulo LIKE 'Sin gestión ≥%'` al guard `EXISTS`, aislando el dedup exclusivamente a esta regla.
12. **Dedup diario de `sla_vencido` podía chocar entre la rama principal y el fallback** cuando ambas apuntan al mismo usuario (caso real: Jeffrey Díaz es COORDINADOR y también `responsableFijo` de dos áreas del catálogo). Mitigado excluyendo explícitamente el título exacto del fallback (`'SLA vencido — responsable no identificado'`) del guard de la rama principal, para que no se bloqueen entre sí.
13. **Posible mismatch RLS `auth.uid()` vs `usuarios.id`** dejaría el widget de tareas sugeridas permanentemente vacío si se consultara con el cliente de sesión del analista. Mitigado consultando con `getAdminClient()` server-side (mismo patrón que el resto del módulo), sin depender de la política RLS de `notificaciones`. **[Actualización 09/07/2026]** Corregido en la raíz — ver nota en "Casos borde de las funciones SQL": las políticas RLS de `notificaciones` ahora resuelven por email en vez de `auth.uid()`. El uso de `getAdminClient()` en el widget ya no es indispensable, pero se deja tal cual (no se tocó código de Task 14 ya enviado a producción).

---

## Fuera de alcance explícito

- **Email/WhatsApp automático al cliente.** El techo es notificación interna + tarea sugerida; ninguna regla envía comunicación externa sin revisión humana. No negociable en v1.
- **On/off para `fn_conciliar_promesas`.** Decisión ya tomada — apagarla deja promesas con estado incorrecto arrastrándose a otros reportes.
- **Tocar `fn_cola_del_dia` o `src/lib/utils/cola-analista.ts`.** El widget de tareas sugeridas es un componente y una fuente de datos totalmente separados (`notificaciones`), sin acoplamiento a ninguno de los dos.
- **Tablas nuevas.** Cero — todo vive en `config_sistema` (claves) y `notificaciones` (vía la vista `v_automatizaciones_feed`).
- **Valores nuevos en `notificaciones.tipo`** (se descartaron explícitamente `'GESTION'`, `'SLA'`, `'AUTOMATIZACION'` propuestos por 2 de los 4 diseños parciales — ver Nota de reconciliación 2). Consecuencia: `src/types/database.ts`, `src/components/topbar.tsx` y `src/components/notificaciones/panel-notificaciones.tsx` no se tocan.
- **Paginación tipo `TabLog`** en el feed de Automatizaciones. Es una ventana de actividad reciente (14 días/100 eventos) con botón "Actualizar", no un log de auditoría exhaustiva — para eso ya existe el tab "Log del Sistema".
- **Widget de tareas sugeridas para el COORDINADOR.** Sus alertas relevantes (Regla 5) ya le llegan por el Topbar existente, sin gating de rol — no se construye una segunda superficie en v1.
- **Enriquecimiento de la card `sync_salud` con estado por tabla** (puntos verde/rojo por `cartera`/`facturas`/`saldos`/`pagos`). Queda marcado como mejora opcional post-v1.
- **Arreglar que `fn_cola_del_dia` no lea los umbrales de `TabSemaforo`.** Hallazgo colateral documentado, no se corrige aquí.
- **Arreglar la referencia rota a `analista_id` en `clientes/estado/route.ts`.** Hallazgo colateral documentado, no se corrige aquí.
- **Mecanismo robusto anti-reentrancia** (índice único parcial / advisory lock) para el patrón `EXISTS`-antes-de-`INSERT`. Se hereda la debilidad preexistente del patrón original; no se resuelve en v1.

---

## Verificación aplicada

Esta versión incorpora las correcciones validadas de 3 revisiones adversariales independientes (factibilidad técnica, seguridad/riesgo, completitud). Cambios concretos aplicados sobre la síntesis original:

- **`fn_notificar_sin_gestion` corregida en dos puntos de lógica real:** la CTE de mora ahora une `cartera` por `(cliente_cod, contribuyente)` en vez de solo `cliente_cod` (que no es único en la tabla), y la CTE de "última gestión" ahora filtra por el analista actualmente asignado y excluye gestiones `tipo='SISTEMA'`, para que un cambio de estado administrativo no resetee el contador de días sin contacto real.
- **Dos bugs de deduplicación corregidos**, ambos capaces de suprimir alertas legítimas en silencio: el guard de `sin_gestion` ahora filtra también por prefijo de título (evita chocar con `ALERTA` de conciliación de promesas o cambio de estado), y el guard diario de `sla_vencido` ahora excluye el título exacto del fallback (evita que el mismo usuario pierda su propia alerta directa por haber recibido antes el aviso de "responsable no identificado" — caso real con Jeffrey Díaz).
- **Mitigado un riesgo de RLS no verificable en producción:** el widget de tareas sugeridas del dashboard analista ahora consulta `notificaciones` con el cliente admin (`service_role`) en vez del cliente de sesión, evitando que un eventual mismatch `auth.uid()` vs `usuarios.id` deje el widget permanentemente vacío sin error visible. **[Actualización 09/07/2026 — corregido en la raíz]** El mismatch dejó de ser hipotético: se confirmó por SQL que 5 de 6 usuarios reales tenían `usuarios.id != auth.uid()`, dejando la campana de notificaciones, el realtime y "marcar como leída" completamente rotos (0 filas) para casi todo el equipo, en producción, desde antes de este módulo. Se corrigieron las políticas RLS de `notificaciones` (migración `fix_notificaciones_rls_email_resolve`) para resolver por email igual que `notas_rapidas`, verificado con simulación de JWT (antes/después + chequeo anti-fuga entre usuarios). El workaround de `getAdminClient()` en el widget de Task 14 sigue siendo válido y no se tocó, pero ahora es defensivo/redundante en vez de estrictamente necesario.
- **Citas de código corregidas:** la justificación de "Regla 5 es coordinador-facing" ahora cita el endpoint que realmente gobierna el flujo relevante (`solicitudes/[id]/estado/route.ts`, sin gate de rol, sin `revisor_id`) en vez del endpoint legacy; se corrigieron además las líneas citadas de `08_cron_jobs.sql` y `solicitudes/route.ts`.
- **Snippets de TypeScript alineados con la convención real del repo:** todas las llamadas nuevas a `.from()`/`.rpc()` sobre `admin` llevan el cast `(admin as any)` que usa el 100% del código comparable, y las funciones de formato (`fmtDayCR`/`hoyCR`/`badgeEjecutor`) se documentan como duplicadas localmente en vez de importadas, porque no están exportadas en su archivo de origen.
- **Paralelismo real en `configuracion/page.tsx`:** las dos queries nuevas ahora se integran genuinamente al array de `Promise.all` existente en vez de ejecutarse como `await` secuenciales fuera de él.
- **Plan de pruebas ampliado** con casos específicos para verificar cada una de las correcciones anteriores (aislamiento de dedup, exclusión de gestiones `SISTEMA`, no colisión entre fallback y alerta directa de SLA).
