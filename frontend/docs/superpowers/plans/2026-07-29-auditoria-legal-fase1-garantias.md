# Auditoría y Control Legal — Fase 1 (Garantías) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el Tab 1 ("Control y Custodia de Garantías") del módulo nuevo "Auditoría y Control Legal": modelo de datos por contribuyente, ciclo de vida de custodia con correo real al vendedor, integración con Hacienda, y el shell de sidebar con las 3 rutas (Tab 2/3 en placeholder).

**Architecture:** 2 tablas nuevas (`garantias`, `garantia_eventos`) + 4 RPCs de solo-lectura/escritura simple en Supabase, 3 API routes Next.js que reusan el patrón sesión-cliente ya establecido (sin bypass de service role — la RLS es permisiva por diseño, igual que `pedidos_retenidos`), un par Server/Client Component para la tabla, un modal de registro, y una categoría nueva en `sidebar.tsx`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS + Storage), Gmail API (correo real vía `resolveGmailToken`), API pública de Hacienda ya integrada (`/api/hacienda`).

**Spec de referencia:** [`docs/superpowers/specs/2026-07-29-auditoria-control-legal-fase1-garantias-design.md`](../specs/2026-07-29-auditoria-control-legal-fase1-garantias-design.md)

---

## Nota sobre verificación (no hay test runner en este proyecto)

CLAUDE.md es explícito: _"No hay test runner configurado. La verificación es: `tsc --noEmit` limpio + `npm run build` sin errores."_ Este plan reemplaza el ciclo clásico "test que falla → implementar → test pasa" por: **implementar → verificar con `npx tsc --noEmit` (o una consulta SQL de control cuando el paso es de base de datos) → commit**. La Tarea 11 corre `npm run build` completo como verificación final de todo el conjunto.

---

## Mapa de archivos

**Crear:**

- `src/types/auditoria-legal.ts`
- `src/lib/auditoria-legal/catalogo.ts`
- `src/app/api/auditoria-legal/garantias/route.ts`
- `src/app/api/auditoria-legal/garantias/[id]/custodia/route.ts`
- `src/app/api/auditoria-legal/garantias/[id]/documento/route.ts`
- `src/app/(app)/auditoria-legal/garantias/page.tsx`
- `src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx`
- `src/app/(app)/auditoria-legal/garantias/ModalRegistrarGarantia.tsx`
- `src/components/auditoria-legal/ProximamenteTab.tsx`
- `src/app/(app)/auditoria-legal/auditorias-cartera/page.tsx`
- `src/app/(app)/auditoria-legal/cobertura/page.tsx`

**Modificar:**

- `src/components/sidebar.tsx` (líneas 89-90: nueva categoría entre "Inteligencia Financiera" y "Sistema")

**Base de datos (vía Supabase MCP, sin archivos en el repo):**

- Tablas `garantias`, `garantia_eventos` + RLS
- RPCs `fn_garantias_lista`, `fn_resolver_responsables_contribuyente`, `fn_saldo_contribuyente`, `fn_buscar_contribuyentes`
- Config `HOLGURA_GARANTIA_PCT` en `config_sistema`
- Bucket de Storage `garantias-legal`

---

## Task 1: Base de datos — tablas, RLS, RPCs, config, bucket

**Files:**

- Ninguno en el repo — todo vía Supabase MCP (`apply_migration` para DDL, `execute_sql` para el `INSERT` de config).

- [ ] **Step 1: Crear las tablas `garantias` y `garantia_eventos`**

Usar el tool `apply_migration` del MCP de Supabase (project_id del proyecto `cyc-cartera-cofersa`, id `swkmrufsyhnaeoijasrz`) con este SQL:

```sql
create table public.garantias (
  id                    bigint generated always as identity primary key,
  contribuyente         text not null,
  cliente_nombre        text not null,
  tipo_titulo           text not null check (tipo_titulo in ('Pagaré','Letra de Cambio')),
  monto_garantizado     numeric not null check (monto_garantizado > 0),
  tiene_fiador          boolean not null default false,
  fiador_nombre         text,
  fiador_cedula         text,
  fiador_telefono       text,
  representante_legal   text,
  fecha_emision         date not null,
  fecha_vencimiento     date not null,
  ubicacion_archivero   text not null,
  estado_custodia       text not null default 'EN_BOVEDA' check (estado_custodia in ('EN_BOVEDA','ENVIADO_VENDEDOR','EN_FIRMA')),
  documento_pdf_url     text,
  activo                boolean not null default true,
  reemplazada_por_id    bigint references public.garantias(id),
  registrado_por        uuid not null references public.usuarios(id),
  analista_email        text not null,
  vendedor_cod          text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.garantia_eventos (
  id            bigint generated always as identity primary key,
  garantia_id   bigint not null references public.garantias(id),
  tipo_evento   text not null check (tipo_evento in (
    'APERTURA_EXPEDIENTE','ENTREGA_A_VENDEDOR','TRAMITE_DE_FIRMA',
    'REINGRESO_A_CUSTODIA','SUSTITUCION_DE_TITULO'
  )),
  usuario_id    uuid not null references public.usuarios(id),
  nota          text,
  created_at    timestamptz not null default now()
);

create index garantias_contribuyente_idx on public.garantias(contribuyente) where activo = true;
create index garantias_analista_email_idx on public.garantias(analista_email);
create index garantia_eventos_garantia_id_idx on public.garantia_eventos(garantia_id);
```

- [ ] **Step 2: Verificar que las tablas existen**

Correr con `execute_sql`:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('garantias', 'garantia_eventos');
```

Expected: 2 filas (`garantias`, `garantia_eventos`).

- [ ] **Step 3: Habilitar RLS y crear las políticas**

`apply_migration` con este SQL. **Importante:** a diferencia de `gestiones` (donde INSERT/UPDATE exigen `analista_email = auth.jwt()->>'email'`), acá se usa el mismo patrón permisivo que `pedidos_retenidos` (`fn_es_usuario_activo()` sin más restricción) — porque quien registra una garantía o cambia su custodia no necesariamente es el analista dueño resuelto automáticamente (ver Task 3, resolución por mayor saldo entre los `cliente_cod` del contribuyente). Restringir por `analista_email = jwt` rompería ese flujo.

```sql
alter table public.garantias enable row level security;
alter table public.garantia_eventos enable row level security;

create policy garantias_select_activos on public.garantias
  for select using (fn_es_usuario_activo());

create policy garantias_insert_activos on public.garantias
  for insert with check (fn_es_usuario_activo());

create policy garantias_update_activos on public.garantias
  for update using (fn_es_usuario_activo());

create policy garantia_eventos_select_activos on public.garantia_eventos
  for select using (fn_es_usuario_activo());

create policy garantia_eventos_insert_activos on public.garantia_eventos
  for insert with check (fn_es_usuario_activo());
```

- [ ] **Step 4: Verificar las políticas**

```sql
select tablename, policyname, cmd from pg_policies
where tablename in ('garantias', 'garantia_eventos') order by tablename, cmd;
```

Expected: 5 filas.

- [ ] **Step 5: Insertar el parámetro de configuración `HOLGURA_GARANTIA_PCT`**

Con `execute_sql` (INSERT normal, no DDL):

```sql
insert into public.config_sistema (clave, valor, descripcion) values (
  'HOLGURA_GARANTIA_PCT',
  '25',
  '% de margen sobre el saldo actual del contribuyente para calcular el monto objetivo de garantía. Default basado en percentil 75 de crecimiento mensual observado en historico_aging_factura (jul 2026, muestra de 2 meses -- revisar con más historial acumulado).'
)
on conflict (clave) do nothing;
```

- [ ] **Step 6: Verificar el config**

```sql
select clave, valor from config_sistema where clave = 'HOLGURA_GARANTIA_PCT';
```

Expected: 1 fila, `valor = '25'`.

- [ ] **Step 7: Crear el bucket de Storage `garantias-legal` + política de subida**

`apply_migration`:

```sql
insert into storage.buckets (id, name, public) values ('garantias-legal', 'garantias-legal', true)
on conflict (id) do nothing;

create policy usuarios_activos_suben_garantias_legal on storage.objects
  for insert to authenticated
  with check (bucket_id = 'garantias-legal' and fn_es_usuario_activo());
```

- [ ] **Step 8: Verificar el bucket**

```sql
select id, public from storage.buckets where id = 'garantias-legal';
```

Expected: 1 fila, `public = true`.

- [ ] **Step 9: Crear las 4 RPCs**

`apply_migration`:

```sql
-- 1) Búsqueda de contribuyentes para el modal (agrupa por contribuyente, no por cliente_cod)
create or replace function public.fn_buscar_contribuyentes(p_query text)
returns table (contribuyente text, cliente_nombre text, n_codigos bigint)
language sql stable security definer set search_path to 'public'
as $function$
  select distinct on (mc.contribuyente)
    mc.contribuyente, mc.cliente_nombre,
    count(*) over (partition by mc.contribuyente) as n_codigos
  from maestro_clientes mc
  where mc.cliente_nombre ilike '%' || p_query || '%'
     or mc.contribuyente  ilike '%' || p_query || '%'
  order by mc.contribuyente, mc.cliente_nombre
  limit 8;
$function$;

-- 2) Saldo actual + monto objetivo (saldo * (1+holgura%)) de un contribuyente puntual
create or replace function public.fn_saldo_contribuyente(p_contribuyente text)
returns table (saldo_actual numeric, monto_objetivo numeric)
language sql stable security definer set search_path to 'public'
as $function$
  with s as (
    select coalesce(sum(total), 0) as saldo from cartera where contribuyente = p_contribuyente
  ),
  h as (
    select coalesce((select valor::numeric from config_sistema where clave = 'HOLGURA_GARANTIA_PCT'), 0) as pct
  )
  select s.saldo, s.saldo * (1 + h.pct / 100) from s, h;
$function$;

-- 3) Resuelve analista y vendedor responsables de un contribuyente: el cliente_cod
-- con mayor saldo entre todos los códigos de ese contribuyente (ver spec: 67
-- contribuyentes tienen >1 cliente_cod, 8 con analistas distintos entre ellos).
create or replace function public.fn_resolver_responsables_contribuyente(p_contribuyente text)
returns table (analista_email text, vendedor_cod text, hay_conflicto_analista boolean)
language sql stable security definer set search_path to 'public'
as $function$
  with candidatos as (
    select mc.analista_email, mc.vendedor_cod, coalesce(c.total, 0) as saldo
    from maestro_clientes mc
    left join cartera c on c.cliente_cod = mc.cliente_cod
    where mc.contribuyente = p_contribuyente
  )
  select
    (select analista_email from candidatos order by saldo desc nulls last limit 1),
    (select vendedor_cod   from candidatos order by saldo desc nulls last limit 1),
    (select count(distinct analista_email) from candidatos) > 1;
$function$;

-- 4) Listado principal de Tab 1 -- une saldo agregado por contribuyente, calcula
-- monto_objetivo/cobertura_pct/semaforo/vencido. p_email NULL = ve todo (coordinador).
create or replace function public.fn_garantias_lista(p_email text default null)
returns table (
  id                   bigint,
  contribuyente        text,
  cliente_nombre       text,
  tipo_titulo          text,
  monto_garantizado    numeric,
  tiene_fiador         boolean,
  fiador_nombre        text,
  fiador_cedula        text,
  fiador_telefono      text,
  representante_legal  text,
  fecha_emision        date,
  fecha_vencimiento    date,
  ubicacion_archivero  text,
  estado_custodia      text,
  documento_pdf_url    text,
  analista_email       text,
  vendedor_cod         text,
  saldo_contribuyente  numeric,
  monto_objetivo       numeric,
  cobertura_pct        numeric,
  semaforo             text,
  vencido              boolean
)
language sql stable security definer set search_path to 'public'
as $function$
  with saldo as (
    select c.contribuyente, sum(c.total) as saldo_total
    from cartera c
    group by c.contribuyente
  ),
  holgura as (
    select coalesce((select valor::numeric from config_sistema where clave = 'HOLGURA_GARANTIA_PCT'), 0) as pct
  )
  select
    g.id, g.contribuyente, g.cliente_nombre, g.tipo_titulo, g.monto_garantizado,
    g.tiene_fiador, g.fiador_nombre, g.fiador_cedula, g.fiador_telefono, g.representante_legal,
    g.fecha_emision, g.fecha_vencimiento, g.ubicacion_archivero, g.estado_custodia,
    g.documento_pdf_url, g.analista_email, g.vendedor_cod,
    coalesce(s.saldo_total, 0) as saldo_contribuyente,
    coalesce(s.saldo_total, 0) * (1 + (select pct from holgura) / 100) as monto_objetivo,
    case when coalesce(s.saldo_total, 0) = 0 then 100
         else round(g.monto_garantizado / s.saldo_total * 100, 1)
    end as cobertura_pct,
    case
      when g.monto_garantizado < coalesce(s.saldo_total, 0) then 'ROJO'
      when g.monto_garantizado < coalesce(s.saldo_total, 0) * (1 + (select pct from holgura) / 100) then 'AMBAR'
      else 'VERDE'
    end as semaforo,
    (g.fecha_vencimiento < current_date) as vencido
  from garantias g
  left join saldo s on s.contribuyente = g.contribuyente
  where g.activo = true
    and (p_email is null or g.analista_email = p_email)
  order by
    case when g.fecha_vencimiento < current_date then 0 else 1 end,
    g.fecha_vencimiento asc;
$function$;
```

- [ ] **Step 10: Verificar las 4 RPCs con una llamada real**

```sql
select * from fn_buscar_contribuyentes('a');
select * from fn_saldo_contribuyente((select contribuyente from maestro_clientes limit 1));
select * from fn_resolver_responsables_contribuyente((select contribuyente from maestro_clientes limit 1));
select * from fn_garantias_lista(null);
```

Expected: las primeras 3 devuelven filas sin error; la última devuelve 0 filas (todavía no hay garantías), sin error de tipo/columna.

- [ ] **Step 11: Commit**

Este task no toca archivos del repo (todo vive en Supabase). No hay `git commit` acá — el estado de la base de datos ya quedó aplicado. Continuar a la Tarea 2.

**Addendum (post code-review de Task 1 + hallazgo en Task 3):**

- Code review de Task 1 encontró que las 4 RPCs eran ejecutables por `anon` (heredado de un GRANT a PUBLIC, no un grant explícito) — se corrigió con `revoke execute ... from public` en las 4 funciones, más: trigger `updated_at` en `garantias`, 3 índices de FK faltantes, `garantias_contribuyente_idx` recreado como UNIQUE parcial (refuerza a nivel de BD la regla de "una sola garantía activa por contribuyente"), y un CHECK `fecha_vencimiento > fecha_emision`. Todo verificado independientemente, ver detalle en el reporte de la sesión de implementación.
- Durante Task 3 se encontró que `notificaciones_tipo_check` no incluía `'GARANTIA'` — el insert de notificación al coordinador (cuando `hay_conflicto_analista` es true) fallaba silenciosamente contra esa constraint. Se amplió:

```sql
alter table public.notificaciones drop constraint notificaciones_tipo_check;
alter table public.notificaciones add constraint notificaciones_tipo_check
  check (tipo = any (array['SOLICITUD','PROMESA','ALERTA','SYNC','PEDIDO_RETENIDO','GARANTIA']));
```

---

## Task 2: Tipos TypeScript

**Files:**

- Create: `src/types/auditoria-legal.ts`
- Create: `src/lib/auditoria-legal/catalogo.ts`

**Nota (post-review de calidad):** el semáforo reusa el tipo `PrioridadCola` ya existente en `src/types/dashboard-analista.ts` (mismos valores `'ROJO'|'AMBAR'|'VERDE'` que la Cola del analista) en vez de declarar un `Semaforo` propio duplicado. Los objetos de configuración con colores/labels (`ACCION_CUSTODIA_CFG`, `ESTADO_CUSTODIA_LABEL`, `SEMAFORO_COLOR`) viven en `src/lib/auditoria-legal/catalogo.ts`, siguiendo el mismo patrón que `src/lib/solicitudes/catalogo.ts` (`ESTADO_CFG`/`PRIORIDAD_CFG`) — `types.ts` queda con solo tipos/interfaces puros. `SEMAFORO_COLOR` usa `{ bg, text }` (no `{ color, bg }`), igual que `ESTADO_CFG`/`PRIORIDAD_CFG`.

- [ ] **Step 1: Crear el archivo de tipos puros**

```typescript
// src/types/auditoria-legal.ts
import type { PrioridadCola } from './dashboard-analista';

export type TipoTitulo = 'Pagaré' | 'Letra de Cambio';
export type EstadoCustodia = 'EN_BOVEDA' | 'ENVIADO_VENDEDOR' | 'EN_FIRMA';
export type TipoEventoGarantia =
  | 'APERTURA_EXPEDIENTE'
  | 'ENTREGA_A_VENDEDOR'
  | 'TRAMITE_DE_FIRMA'
  | 'REINGRESO_A_CUSTODIA'
  | 'SUSTITUCION_DE_TITULO';

export interface GarantiaListaRow {
  id: number;
  contribuyente: string;
  cliente_nombre: string;
  tipo_titulo: TipoTitulo;
  monto_garantizado: number;
  tiene_fiador: boolean;
  fiador_nombre: string | null;
  fiador_cedula: string | null;
  fiador_telefono: string | null;
  representante_legal: string | null;
  fecha_emision: string;
  fecha_vencimiento: string;
  ubicacion_archivero: string;
  estado_custodia: EstadoCustodia;
  documento_pdf_url: string | null;
  analista_email: string;
  vendedor_cod: string | null;
  saldo_contribuyente: number;
  monto_objetivo: number;
  cobertura_pct: number;
  semaforo: PrioridadCola;
  vencido: boolean;
}

export interface ContribuyenteBusqueda {
  contribuyente: string;
  cliente_nombre: string;
  n_codigos: number;
}

export interface SaldoContribuyente {
  saldo_actual: number;
  monto_objetivo: number;
}

export interface HaciendaData {
  nombre?: string;
  tipoIdentificacion?: string;
  regimen?: string;
  situacion?: { moroso?: boolean; omiso?: boolean; estado?: string };
  actividades?: Array<{ descripcion: string; estado: string }>;
}

export interface RegistrarGarantiaPayload {
  contribuyente: string;
  cliente_nombre: string;
  tipo_titulo: TipoTitulo;
  monto_garantizado: number;
  tiene_fiador: boolean;
  fiador_nombre?: string;
  fiador_cedula?: string;
  fiador_telefono?: string;
  representante_legal?: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  ubicacion_archivero: string;
}

export type AccionCustodia = 'ENTREGAR' | 'TRAMITE_FIRMA' | 'REINGRESAR';
```

- [ ] **Step 2: Crear el catálogo de configuración (labels/colores)**

```typescript
// src/lib/auditoria-legal/catalogo.ts
import type { AccionCustodia, EstadoCustodia, TipoEventoGarantia } from '@/types/auditoria-legal';
import type { PrioridadCola } from '@/types/dashboard-analista';

export const ACCION_CUSTODIA_CFG: Record<
  AccionCustodia,
  { label: string; desde: EstadoCustodia; hacia: EstadoCustodia; evento: TipoEventoGarantia }
> = {
  ENTREGAR: {
    label: 'Entregar a Vendedor',
    desde: 'EN_BOVEDA',
    hacia: 'ENVIADO_VENDEDOR',
    evento: 'ENTREGA_A_VENDEDOR',
  },
  TRAMITE_FIRMA: {
    label: 'Enviar a Trámite de Firma',
    desde: 'ENVIADO_VENDEDOR',
    hacia: 'EN_FIRMA',
    evento: 'TRAMITE_DE_FIRMA',
  },
  REINGRESAR: {
    label: 'Reingresar a Custodia',
    desde: 'EN_FIRMA',
    hacia: 'EN_BOVEDA',
    evento: 'REINGRESO_A_CUSTODIA',
  },
};

export const ESTADO_CUSTODIA_LABEL: Record<EstadoCustodia, string> = {
  EN_BOVEDA: 'En Bóveda',
  ENVIADO_VENDEDOR: 'Enviado a Vendedor',
  EN_FIRMA: 'En Firma',
};

export const SEMAFORO_COLOR: Record<PrioridadCola, { bg: string; text: string }> = {
  ROJO: { bg: '#fee2e2', text: '#dc2626' },
  AMBAR: { bg: '#fef3c7', text: '#d97706' },
  VERDE: { bg: '#e6f4ea', text: '#16a34a' },
};
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/types/auditoria-legal.ts src/lib/auditoria-legal/catalogo.ts
git commit -m "feat(auditoria-legal): tipos TypeScript + catálogo de configuración para Garantías (Fase 1)"
```

---

## Task 3: API route — crear/sustituir garantía

**Files:**

- Create: `src/app/api/auditoria-legal/garantias/route.ts`

- [ ] **Step 1: Escribir el route completo**

```typescript
// src/app/api/auditoria-legal/garantias/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { RegistrarGarantiaPayload } from '@/types/auditoria-legal';

// POST /api/auditoria-legal/garantias
// Crea una garantía nueva para un contribuyente. Si ese contribuyente ya tiene
// una garantía activa, la marca como sustituida (activo=false, reemplazada_por_id)
// y registra el evento SUSTITUCION_DE_TITULO sobre la garantía anterior.
export async function POST(req: NextRequest) {
  let body: RegistrarGarantiaPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const {
    contribuyente,
    cliente_nombre,
    tipo_titulo,
    monto_garantizado,
    tiene_fiador,
    fiador_nombre,
    fiador_cedula,
    fiador_telefono,
    representante_legal,
    fecha_emision,
    fecha_vencimiento,
    ubicacion_archivero,
  } = body;

  if (
    !contribuyente?.trim() ||
    !cliente_nombre?.trim() ||
    !tipo_titulo ||
    !monto_garantizado ||
    !fecha_emision ||
    !fecha_vencimiento ||
    !ubicacion_archivero?.trim()
  ) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  }
  if (!['Pagaré', 'Letra de Cambio'].includes(tipo_titulo)) {
    return NextResponse.json({ error: 'tipo_titulo inválido' }, { status: 400 });
  }
  if (tiene_fiador && !fiador_nombre?.trim()) {
    return NextResponse.json(
      { error: 'Nombre del fiador requerido cuando tiene_fiador es true' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // usuarios.id es un UUID independiente, distinto de auth.uid() -- se busca por email.
  const { data: usuarioRow } = await supabase
    .from('usuarios')
    .select('id')
    .ilike('email', user.email)
    .limit(1)
    .single();
  const registradoPor = (usuarioRow as { id: string } | null)?.id ?? null;
  if (!registradoPor) {
    return NextResponse.json(
      { error: 'Tu usuario no está registrado en el sistema.' },
      { status: 400 },
    );
  }

  // Resolver analista y vendedor responsables (mayor saldo entre los cliente_cod del contribuyente)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: resueltoData, error: resErr } = await (supabase as any)
    .rpc('fn_resolver_responsables_contribuyente', { p_contribuyente: contribuyente })
    .single();
  if (resErr)
    return NextResponse.json(
      { error: `Error al resolver responsables: ${resErr.message}` },
      { status: 500 },
    );
  const resuelto = resueltoData as {
    analista_email: string | null;
    vendedor_cod: string | null;
    hay_conflicto_analista: boolean;
  };

  // ¿Ya existe una garantía activa para este contribuyente? (sustitución)
  const { data: garantiaAnterior } = await supabase
    .from('garantias')
    .select('id, tipo_titulo, monto_garantizado')
    .eq('contribuyente', contribuyente)
    .eq('activo', true)
    .maybeSingle();

  // Insertar la garantía nueva
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: nueva, error: insErr } = await (supabase as any)
    .from('garantias')
    .insert({
      contribuyente,
      cliente_nombre,
      tipo_titulo,
      monto_garantizado,
      tiene_fiador: !!tiene_fiador,
      fiador_nombre: tiene_fiador ? (fiador_nombre?.trim() ?? null) : null,
      fiador_cedula: tiene_fiador ? (fiador_cedula?.trim() ?? null) : null,
      fiador_telefono: tiene_fiador ? (fiador_telefono?.trim() ?? null) : null,
      representante_legal: representante_legal?.trim() || null,
      fecha_emision,
      fecha_vencimiento,
      ubicacion_archivero: ubicacion_archivero.trim(),
      estado_custodia: 'EN_BOVEDA',
      activo: true,
      registrado_por: registradoPor,
      analista_email: resuelto.analista_email ?? '',
      vendedor_cod: resuelto.vendedor_cod ?? null,
    })
    .select('id')
    .single();

  if (insErr || !nueva) {
    return NextResponse.json(
      { error: `Error al crear la garantía: ${insErr?.message ?? 'desconocido'}` },
      { status: 500 },
    );
  }
  const nuevaId = (nueva as { id: number }).id;

  // Evento de apertura de expediente
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('garantia_eventos').insert({
    garantia_id: nuevaId,
    tipo_evento: 'APERTURA_EXPEDIENTE',
    usuario_id: registradoPor,
    nota: garantiaAnterior
      ? `Sustituye a ${(garantiaAnterior as { tipo_titulo: string }).tipo_titulo} #${(garantiaAnterior as { id: number }).id}`
      : null,
  });

  // Si había una garantía anterior activa, marcarla como sustituida
  if (garantiaAnterior) {
    const anteriorId = (garantiaAnterior as { id: number }).id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('garantias')
      .update({ activo: false, reemplazada_por_id: nuevaId, updated_at: new Date().toISOString() })
      .eq('id', anteriorId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('garantia_eventos').insert({
      garantia_id: anteriorId,
      tipo_evento: 'SUSTITUCION_DE_TITULO',
      usuario_id: registradoPor,
      nota: `Sustituida por ${tipo_titulo} #${nuevaId}`,
    });
  }

  // Si hay conflicto de analista entre los códigos del contribuyente, avisar al coordinador
  if (resuelto.hay_conflicto_analista) {
    const { data: coordRow } = await supabase
      .from('usuarios')
      .select('id')
      .eq('rol', 'COORDINADOR')
      .limit(1)
      .single();
    if (coordRow) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('notificaciones').insert({
        usuario_id: (coordRow as { id: string }).id,
        tipo: 'GARANTIA',
        titulo: 'Garantía con analista ambiguo',
        mensaje: `El contribuyente ${contribuyente} (${cliente_nombre}) tiene códigos de cliente asignados a más de un analista. Se resolvió automáticamente a ${resuelto.analista_email ?? 'ninguno'} -- confirmá o reasigná si hace falta.`,
        leida: false,
        link: `/auditoria-legal/garantias`,
        created_at: new Date().toISOString(),
      });
    }
  }

  return NextResponse.json({ ok: true, id: nuevaId, sustituyo: !!garantiaAnterior });
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Verificar manualmente con una llamada real**

Con el servidor local corriendo (`npm run dev`) y sesión iniciada en el navegador, ejecutar en la consola del navegador (o con `curl` pasando la cookie de sesión):

```bash
curl -X POST http://localhost:3000/api/auditoria-legal/garantias \
  -H "Content-Type: application/json" \
  -d '{"contribuyente":"3101082969","cliente_nombre":"Prueba S.A.","tipo_titulo":"Pagaré","monto_garantizado":1000000,"tiene_fiador":false,"fecha_emision":"2026-07-29","fecha_vencimiento":"2027-07-29","ubicacion_archivero":"Archivero Test"}'
```

Expected: `{"ok":true,"id":<numero>,"sustituyo":false}` (o `401` si no hay cookie de sesión válida -- en ese caso probar desde el navegador logueado en vez de `curl`).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auditoria-legal/garantias/route.ts
git commit -m "feat(auditoria-legal): API para crear/sustituir garantías"
```

**Addendum (post code-review):** el código de Step 1 arriba insertaba la garantía nueva ANTES de desactivar la anterior. Eso viola el índice único parcial `garantias_contribuyente_idx` que el addendum de Task 1 agregó (`UNIQUE (contribuyente) WHERE activo = true`) — reproducido en vivo por el reviewer con un `23505 duplicate key`. La corrección (aplicada, commit separado) reordena a **desactivar la anterior primero, luego insertar la nueva**, con reactivación manual de la anterior si el insert de la nueva falla igual, más: rol `ANALISTA_RIESGO` bloqueado server-side (403), logging de los 3 escrituras secundarias que antes se descartaban en silencio, y `contribuyente`/`cliente_nombre` trimeados de forma consistente. El archivo `route.ts` en el repo ya tiene la versión corregida — si estás leyendo este plan para reconstruir el módulo desde cero, usá el código tal como está en el repo, no el bloque de Step 1 arriba (que documenta la versión con el bug, dejada así a propósito para que quede registro de qué se corrigió y por qué).

---

## Task 4: API route — transición de custodia + correo real

**Files:**

- Create: `src/app/api/auditoria-legal/garantias/[id]/custodia/route.ts`

- [ ] **Step 1: Escribir el route completo**

```typescript
// src/app/api/auditoria-legal/garantias/[id]/custodia/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveGmailToken } from '@/lib/utils/gmail-token';
import type { AccionCustodia } from '@/types/auditoria-legal';
import { ACCION_CUSTODIA_CFG } from '@/lib/auditoria-legal/catalogo';
import { fmtCRC } from '@/lib/utils/formato';

type Params = { params: Promise<{ id: string }> };

// PATCH /api/auditoria-legal/garantias/[id]/custodia
// Body: { accion: 'ENTREGAR' | 'TRAMITE_FIRMA' | 'REINGRESAR', providerToken?, providerRefreshToken? }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const garantiaId = Number(id);
  if (!Number.isFinite(garantiaId))
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  let body: {
    accion?: AccionCustodia;
    providerToken?: string | null;
    providerRefreshToken?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { accion, providerToken, providerRefreshToken } = body;
  if (!accion || !ACCION_CUSTODIA_CFG[accion]) {
    return NextResponse.json({ error: 'accion inválida' }, { status: 400 });
  }
  const cfg = ACCION_CUSTODIA_CFG[accion];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: usuarioRow } = await supabase
    .from('usuarios')
    .select('id')
    .ilike('email', user.email)
    .limit(1)
    .single();
  const usuarioId = (usuarioRow as { id: string } | null)?.id ?? null;
  if (!usuarioId)
    return NextResponse.json(
      { error: 'Tu usuario no está registrado en el sistema.' },
      { status: 400 },
    );

  const { data: garantiaRow, error: getErr } = await supabase
    .from('garantias')
    .select(
      'id, contribuyente, cliente_nombre, tipo_titulo, monto_garantizado, estado_custodia, vendedor_cod, fecha_vencimiento',
    )
    .eq('id', garantiaId)
    .single();
  if (getErr || !garantiaRow)
    return NextResponse.json({ error: 'Garantía no encontrada' }, { status: 404 });

  const garantia = garantiaRow as {
    id: number;
    contribuyente: string;
    cliente_nombre: string;
    tipo_titulo: string;
    monto_garantizado: number;
    estado_custodia: string;
    vendedor_cod: string | null;
    fecha_vencimiento: string;
  };

  if (garantia.estado_custodia !== cfg.desde) {
    return NextResponse.json(
      {
        error: `Esta garantía está en estado '${garantia.estado_custodia}', no se puede aplicar '${cfg.label}' (requiere '${cfg.desde}')`,
      },
      { status: 409 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await (supabase as any)
    .from('garantias')
    .update({ estado_custodia: cfg.hacia, updated_at: new Date().toISOString() })
    .eq('id', garantiaId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('garantia_eventos').insert({
    garantia_id: garantiaId,
    tipo_evento: cfg.evento,
    usuario_id: usuarioId,
    nota: null,
  });

  let emailSent = false;
  let emailTo: string | null = null;
  let emailError: string | null = null;

  // Solo la acción ENTREGAR dispara correo real al vendedor + supervisor en copia.
  if (accion === 'ENTREGAR') {
    if (!garantia.vendedor_cod) {
      emailError = 'No se pudo resolver un vendedor para este contribuyente -- no se envió correo.';
    } else {
      const { data: vendedorRow } = await supabase
        .from('vendedores')
        .select('email, nombre, supervisor_cod')
        .eq('cod', garantia.vendedor_cod)
        .maybeSingle();
      const vendedor = vendedorRow as {
        email: string | null;
        nombre: string;
        supervisor_cod: string | null;
      } | null;

      if (!vendedor?.email) {
        emailError = 'El vendedor asignado no tiene correo registrado -- no se envió correo.';
      } else {
        let supervisorEmail: string | null = null;
        if (vendedor.supervisor_cod) {
          const { data: supRow } = await supabase
            .from('supervisores')
            .select('email')
            .eq('cod', vendedor.supervisor_cod)
            .maybeSingle();
          supervisorEmail = (supRow as { email: string | null } | null)?.email ?? null;
        }

        const gmailToken = await resolveGmailToken(providerToken, providerRefreshToken, user.email);
        if (!gmailToken) {
          emailError =
            'Sesión de Google expirada. Cerrá sesión y volvé a ingresar para renovar el acceso.';
        } else {
          const { data: analistaRow } = await supabase
            .from('usuarios')
            .select('nombre')
            .eq('id', usuarioId)
            .single();
          const nombreAnalista = (analistaRow as { nombre: string } | null)?.nombre ?? user.email;

          const htmlBody = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Nunito',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);width:100%;max-width:780px;">
        <tr><td style="background:#003B5C;padding:20px 32px;">
          <p style="margin:0;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">AUDITORÍA Y CONTROL LEGAL</p>
          <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:800;">Garantía para entregar a firma</h1>
        </td></tr>
        <tr><td style="padding:20px 32px 0;">
          <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Cliente</p>
          <p style="margin:0;font-size:18px;font-weight:800;color:#1e293b;">${garantia.cliente_nombre}</p>
          <p style="margin:2px 0 0;font-size:12px;color:#94a3b8;font-family:monospace;">${garantia.contribuyente}</p>
        </td></tr>
        <tr><td style="padding:16px 32px 0;">
          <p style="margin:0;font-size:12px;color:#475569;"><strong>Tipo de título:</strong> ${garantia.tipo_titulo}</p>
          <p style="margin:6px 0 0;font-size:12px;color:#475569;"><strong>Monto:</strong> ${fmtCRC(garantia.monto_garantizado)}</p>
          <p style="margin:6px 0 0;font-size:12px;color:#475569;"><strong>Vencimiento:</strong> ${garantia.fecha_vencimiento}</p>
        </td></tr>
        <tr><td style="padding:20px 32px 28px;">
          <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">Por favor gestionar la firma con el cliente y devolver el documento firmado al analista correspondiente.</p>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">SIC Cofersa · Auditoría y Control Legal · ${new Date().toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' })}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

          const encH = (str: string) =>
            `=?UTF-8?B?${Buffer.from(str, 'utf-8').toString('base64')}?=`;
          const subject = `[Auditoría y Control Legal] Garantía a firmar — ${garantia.cliente_nombre}`;
          const rawEmail = [
            `From: ${encH(nombreAnalista)} <${user.email}>`,
            `To: ${vendedor.email}`,
            supervisorEmail ? `Cc: ${supervisorEmail}` : null,
            `Subject: ${encH(subject)}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=utf-8',
            '',
            htmlBody,
          ]
            .filter((l): l is string => l !== null)
            .join('\r\n');
          const encoded = Buffer.from(rawEmail)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

          try {
            const gmailRes = await fetch(
              'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${gmailToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ raw: encoded }),
              },
            );
            if (gmailRes.ok) {
              emailSent = true;
              emailTo = vendedor.email;
            } else {
              const ge = await gmailRes.json().catch(() => ({}));
              emailError =
                (ge as { error?: { message?: string } })?.error?.message ??
                `Error Gmail API (${gmailRes.status})`;
            }
          } catch {
            emailError = 'Error de red al contactar Gmail API.';
          }
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    nuevo_estado: cfg.hacia,
    email_sent: emailSent,
    email_to: emailTo,
    email_error: emailError,
  });
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/auditoria-legal/garantias/[id]/custodia/route.ts"
git commit -m "feat(auditoria-legal): API de transición de custodia con correo real al vendedor"
```

---

## Task 5: API route — subir PDF de la garantía firmada

**Files:**

- Create: `src/app/api/auditoria-legal/garantias/[id]/documento/route.ts`

- [ ] **Step 1: Escribir el route completo**

```typescript
// src/app/api/auditoria-legal/garantias/[id]/documento/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> };

// POST /api/auditoria-legal/garantias/[id]/documento
// multipart/form-data con campo "file" -- sube el PDF firmado al bucket
// garantias-legal y guarda la URL pública en garantias.documento_pdf_url.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const garantiaId = Number(id);
  if (!Number.isFinite(garantiaId))
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Form data inválido' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Solo se acepta PDF' }, { status: 400 });
  }

  const { data: garantiaRow } = await supabase
    .from('garantias')
    .select('id, contribuyente')
    .eq('id', garantiaId)
    .single();
  if (!garantiaRow) return NextResponse.json({ error: 'Garantía no encontrada' }, { status: 404 });

  const path = `${garantiaId}_${Date.now()}.pdf`;
  const { error: upErr } = await supabase.storage
    .from('garantias-legal')
    .upload(path, file, { contentType: 'application/pdf', cacheControl: '3600', upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const {
    data: { publicUrl },
  } = supabase.storage.from('garantias-legal').getPublicUrl(path);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await (supabase as any)
    .from('garantias')
    .update({ documento_pdf_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', garantiaId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, documento_pdf_url: publicUrl });
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/auditoria-legal/garantias/[id]/documento/route.ts"
git commit -m "feat(auditoria-legal): API para adjuntar el PDF de la garantía firmada"
```

---

## Task 6: Server Component — página Tab 1

**Files:**

- Create: `src/app/(app)/auditoria-legal/garantias/page.tsx`

- [ ] **Step 1: Escribir el Server Component**

```typescript
// src/app/(app)/auditoria-legal/garantias/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GarantiasCliente from './garantias-cliente'

export const dynamic = 'force-dynamic'

export default async function GarantiasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfilRow } = await supabase
    .from('usuarios').select('rol').eq('email', user.email!).limit(1).maybeSingle()
  const rol = ((perfilRow as { rol: string } | null)?.rol ?? 'ANALISTA') as 'COORDINADOR' | 'ANALISTA' | 'ANALISTA_RIESGO'
  if (rol === 'ANALISTA_RIESGO') redirect('/dashboard')

  return <GarantiasCliente userRol={rol} userEmail={user.email!} />
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: error esperado _"Cannot find module './garantias-cliente'"_ — se resuelve en la Tarea 7. No hacer commit todavía.

---

## Task 7: Client Component — tabla de Garantías

**Files:**

- Create: `src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx`

- [ ] **Step 1: Escribir el Client Component**

```typescript
// src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Paperclip } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtCRC, fmtFecha } from '@/lib/utils/formato'
import ModalRegistrarGarantia from './ModalRegistrarGarantia'
import type { GarantiaListaRow, AccionCustodia } from '@/types/auditoria-legal'
import { ACCION_CUSTODIA_CFG, ESTADO_CUSTODIA_LABEL, SEMAFORO_COLOR } from '@/lib/auditoria-legal/catalogo'

interface Props {
  userRol: 'COORDINADOR' | 'ANALISTA'
  userEmail: string
}

// 9 columnas: Contribuyente | Tipo Título | Monto | Fiador | Cobertura | Vencimiento | Ubicación | Custodia | Acción
const COLS = ['190px', '105px', '125px', '65px', '100px', '95px', '170px', '135px', undefined]

const TD: React.CSSProperties = { padding: '11px 12px', fontSize: '12.5px', color: '#334155' }

function Skeleton() {
  return <div className="bg-white rounded-xl border h-80 animate-pulse mx-5 mt-5" />
}

export default function GarantiasCliente({ userRol, userEmail }: Props) {
  const [rows, setRows] = useState<GarantiaListaRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [procesando, setProcesando] = useState<Set<number>>(new Set())
  const [subiendoPdf, setSubiendoPdf] = useState<Set<number>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const supabase = createClient()
      const pEmail = userRol === 'ANALISTA' ? userEmail : null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: err } = await (supabase as any).rpc('fn_garantias_lista', { p_email: pEmail })
      if (err) throw err
      setRows(data as GarantiaListaRow[])
    } catch {
      setError('Error al cargar las garantías.')
    } finally {
      setLoading(false)
    }
  }, [userRol, userEmail])

  useEffect(() => { fetchData() }, [fetchData])

  async function ejecutarAccion(row: GarantiaListaRow, accion: AccionCustodia) {
    setProcesando(prev => new Set(prev).add(row.id))
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/auditoria-legal/garantias/${row.id}/custodia`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion,
          providerToken: session?.provider_token ?? null,
          providerRefreshToken: session?.provider_refresh_token ?? null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al actualizar custodia')
      await fetchData()
      if (accion === 'ENTREGAR' && json.email_error) {
        alert(`Estado actualizado, pero el correo no se pudo enviar: ${json.email_error}`)
      }
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setProcesando(prev => { const next = new Set(prev); next.delete(row.id); return next })
    }
  }

  async function subirPdf(row: GarantiaListaRow, file: File) {
    setSubiendoPdf(prev => new Set(prev).add(row.id))
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/auditoria-legal/garantias/${row.id}/documento`, { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al subir el PDF')
      await fetchData()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setSubiendoPdf(prev => { const next = new Set(prev); next.delete(row.id); return next })
    }
  }

  if (loading) return <div style={{ background: '#EEF2F7', minHeight: '100%' }}><Skeleton /></div>
  if (error) return (
    <div className="px-5 py-5">
      <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
        <p className="text-red-600 text-sm font-semibold">{error}</p>
        <button onClick={fetchData} className="mt-3 text-[#009ee3] text-sm font-semibold hover:underline">Reintentar</button>
      </div>
    </div>
  )
  if (!rows) return null

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">
        <div className="flex justify-end">
          <button
            onClick={() => setShowModal(true)}
            className="rounded-lg px-4 py-2 text-sm font-bold text-white"
            style={{ background: '#009ee3' }}
          >
            + Registrar Garantía
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
          <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse', minWidth: '1180px' }}>
            <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <thead>
              <tr style={{ background: '#f0f4f8', borderBottom: '1px solid #e2e8f0' }}>
                {['Contribuyente', 'Tipo Título', 'Monto Garantizado', 'Fiador', 'Cobertura', 'Vencimiento', 'Ubicación', 'Custodia', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 12px', fontSize: '10.5px', fontWeight: 600, color: '#64748b',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                    textAlign: i === 2 ? 'right' : i === 3 || i === 4 ? 'center' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={9} style={{ padding: '32px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>Sin garantías registradas</td></tr>
              )}
              {rows.map(r => {
                const sem = SEMAFORO_COLOR[r.semaforo]
                const accionDisponible = !r.vencido
                  ? (Object.entries(ACCION_CUSTODIA_CFG).find(([, c]) => c.desde === r.estado_custodia)?.[0] as AccionCustodia | undefined)
                  : undefined
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={TD}>
                      <div style={{ fontWeight: 600, color: '#1a202c' }}>{r.cliente_nombre}</div>
                      <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>{r.contribuyente}</div>
                    </td>
                    <td style={TD}>{r.tipo_titulo}</td>
                    <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(r.monto_garantizado)}</td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <span style={{
                        fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                        background: r.tiene_fiador ? '#e6f4ea' : '#f1f5f9',
                        color: r.tiene_fiador ? '#16a34a' : '#64748b',
                      }}>{r.tiene_fiador ? 'SÍ' : 'NO'}</span>
                    </td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: 600, color: sem.color }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: sem.color, display: 'inline-block' }} />
                        {r.cobertura_pct}%
                      </span>
                    </td>
                    <td style={{ ...TD, color: r.vencido ? '#dc2626' : '#334155', fontWeight: r.vencido ? 600 : 400 }}>
                      {fmtFecha(r.fecha_vencimiento)}
                    </td>
                    <td style={TD}>{r.ubicacion_archivero}</td>
                    <td style={TD}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '10.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px',
                          background: r.vencido ? '#fee2e2' : '#eef2f7',
                          color: r.vencido ? '#dc2626' : '#334155',
                        }}>{r.vencido ? 'VENCIDO' : ESTADO_CUSTODIA_LABEL[r.estado_custodia]}</span>
                        <label style={{ cursor: 'pointer', color: r.documento_pdf_url ? '#16a34a' : '#94a3b8' }} title={r.documento_pdf_url ? 'PDF adjunto -- clic para reemplazar' : 'Adjuntar PDF firmado'}>
                          {subiendoPdf.has(r.id) ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
                          <input
                            type="file" accept="application/pdf" style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) subirPdf(r, f); e.target.value = '' }}
                          />
                        </label>
                      </div>
                    </td>
                    <td style={TD}>
                      {accionDisponible ? (
                        <button
                          onClick={() => ejecutarAccion(r, accionDisponible)}
                          disabled={procesando.has(r.id)}
                          className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap disabled:opacity-50"
                          style={{ background: '#fff', border: '1px solid #009ee3', color: '#009ee3' }}
                        >
                          {procesando.has(r.id) ? 'Procesando...' : ACCION_CUSTODIA_CFG[accionDisponible].label}
                        </button>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#a0aec0' }}>— (registrar sustitución)</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <ModalRegistrarGarantia
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchData() }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: error esperado _"Cannot find module './ModalRegistrarGarantia'"_ — se resuelve en la Tarea 8.

---

## Task 8: Modal "Registrar Garantía"

**Files:**

- Create: `src/app/(app)/auditoria-legal/garantias/ModalRegistrarGarantia.tsx`

- [ ] **Step 1: Escribir el modal completo**

```typescript
// src/app/(app)/auditoria-legal/garantias/ModalRegistrarGarantia.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtCRC } from '@/lib/utils/formato'
import type { ContribuyenteBusqueda, SaldoContribuyente, HaciendaData, TipoTitulo } from '@/types/auditoria-legal'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

interface GarantiaActivaExistente { id: number; tipo_titulo: string; monto_garantizado: number }

export default function ModalRegistrarGarantia({ onClose, onSuccess }: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<ContribuyenteBusqueda[]>([])
  const [seleccionado, setSeleccionado] = useState<ContribuyenteBusqueda | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [hacienda, setHacienda] = useState<HaciendaData | null>(null)
  const [haciendaError, setHaciendaError] = useState(false)
  const [saldo, setSaldo] = useState<SaldoContribuyente | null>(null)
  const [garantiaActiva, setGarantiaActiva] = useState<GarantiaActivaExistente | null>(null)

  const [tipoTitulo, setTipoTitulo] = useState<TipoTitulo>('Pagaré')
  const [monto, setMonto] = useState('')
  const [tieneFiador, setTieneFiador] = useState(false)
  const [fiadorNombre, setFiadorNombre] = useState('')
  const [fiadorCedula, setFiadorCedula] = useState('')
  const [fiadorTelefono, setFiadorTelefono] = useState('')
  const [representanteLegal, setRepresentanteLegal] = useState('')
  const [fechaEmision, setFechaEmision] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [ubicacion, setUbicacion] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Búsqueda de contribuyentes con debounce
  useEffect(() => {
    if (seleccionado || busqueda.trim().length < 2) { setResultados([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc('fn_buscar_contribuyentes', { p_query: busqueda.trim() })
      setResultados((data ?? []) as ContribuyenteBusqueda[])
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busqueda, seleccionado])

  // Al seleccionar un contribuyente: lookup de Hacienda + saldo/objetivo + garantía activa existente
  useEffect(() => {
    if (!seleccionado) return
    setHacienda(null); setHaciendaError(false); setSaldo(null); setGarantiaActiva(null)

    fetch(`/api/hacienda?identificacion=${encodeURIComponent(seleccionado.contribuyente)}`)
      .then(res => res.json())
      .then(json => {
        if (json.error || json.notFound) { setHaciendaError(true); return }
        setHacienda(json.data as HaciendaData)
      })
      .catch(() => setHaciendaError(true))

    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).rpc('fn_saldo_contribuyente', { p_contribuyente: seleccionado.contribuyente })
      .single()
      .then(({ data }: { data: SaldoContribuyente | null }) => { if (data) setSaldo(data) })

    supabase.from('garantias')
      .select('id, tipo_titulo, monto_garantizado')
      .eq('contribuyente', seleccionado.contribuyente)
      .eq('activo', true)
      .maybeSingle()
      .then(({ data }) => { if (data) setGarantiaActiva(data as GarantiaActivaExistente) })
  }, [seleccionado])

  const requiereRepresentanteLegal = !haciendaError && hacienda ? hacienda.tipoIdentificacion === 'Jurídica' : true

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!seleccionado) { setError('Seleccioná un contribuyente'); return }
    if (!monto || Number(monto) <= 0) { setError('Monto garantizado inválido'); return }
    if (!fechaEmision || !fechaVencimiento) { setError('Completá las fechas de emisión y vencimiento'); return }
    if (!ubicacion.trim()) { setError('Indicá la ubicación en archivero'); return }
    if (tieneFiador && !fiadorNombre.trim()) { setError('Indicá el nombre del fiador'); return }

    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auditoria-legal/garantias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contribuyente: seleccionado.contribuyente,
          cliente_nombre: seleccionado.cliente_nombre,
          tipo_titulo: tipoTitulo,
          monto_garantizado: Number(monto),
          tiene_fiador: tieneFiador,
          fiador_nombre: fiadorNombre, fiador_cedula: fiadorCedula, fiador_telefono: fiadorTelefono,
          representante_legal: representanteLegal,
          fecha_emision: fechaEmision, fecha_vencimiento: fechaVencimiento,
          ubicacion_archivero: ubicacion,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al registrar la garantía')
      onSuccess()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Registrar Garantía</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3 overflow-y-auto">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Cliente *</label>
            {seleccionado ? (
              <div className="rounded-lg border border-gray-200 px-3 py-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{seleccionado.cliente_nombre}</div>
                  <div className="text-xs text-gray-400">{seleccionado.contribuyente}</div>
                </div>
                <button type="button" onClick={() => { setSeleccionado(null); setBusqueda('') }} className="text-[#009ee3] text-xs font-semibold">Cambiar</button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o cédula..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                />
                {resultados.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-56 overflow-y-auto">
                    {resultados.map(r => (
                      <button
                        key={r.contribuyente} type="button"
                        onClick={() => { setSeleccionado(r); setResultados([]) }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                      >
                        <div className="font-semibold text-gray-800">{r.cliente_nombre}</div>
                        <div className="text-xs text-gray-400">{r.contribuyente}{r.n_codigos > 1 ? ` · ${r.n_codigos} códigos` : ''}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {seleccionado && !haciendaError && hacienda && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: hacienda.situacion?.moroso || hacienda.situacion?.omiso ? '#dc2626' : '#22c55e' }} />
              <strong>Hacienda:</strong> {hacienda.situacion?.moroso ? 'Moroso' : hacienda.situacion?.omiso ? 'Omiso' : 'Al día'}{hacienda.regimen ? ` — ${hacienda.regimen}` : ''}
            </div>
          )}

          {garantiaActiva && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
              Este contribuyente ya tiene una garantía activa ({garantiaActiva.tipo_titulo}, {fmtCRC(garantiaActiva.monto_garantizado)}). Registrar una nueva la marcará como <strong>sustituida</strong>.
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Tipo de Título *</label>
              <select value={tipoTitulo} onChange={e => setTipoTitulo(e.target.value as TipoTitulo)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400">
                <option value="Pagaré">Pagaré</option>
                <option value="Letra de Cambio">Letra de Cambio</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Monto Garantizado (₡) *</label>
              <input type="number" min="1" value={monto} onChange={e => setMonto(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          {saldo && (
            <p className="-mt-2 ml-1 text-[11px] text-gray-400">Sugerido: {fmtCRC(saldo.monto_objetivo)} (saldo actual + holgura configurada) — no bloquea el monto que digites</p>
          )}

          <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5">
            <span className="text-sm font-semibold text-gray-800">¿Tiene fiador / aval?</span>
            <div className="flex bg-gray-200 rounded-full p-0.5">
              <button type="button" onClick={() => setTieneFiador(true)}
                className="px-3.5 py-1 rounded-full text-xs font-semibold"
                style={tieneFiador ? { background: '#009ee3', color: '#fff' } : { color: '#64748b' }}>Sí</button>
              <button type="button" onClick={() => setTieneFiador(false)}
                className="px-3.5 py-1 rounded-full text-xs font-semibold"
                style={!tieneFiador ? { background: '#009ee3', color: '#fff' } : { color: '#64748b' }}>No</button>
            </div>
          </div>

          {tieneFiador && (
            <div className="flex flex-col gap-2.5 pl-3 border-l-2" style={{ borderColor: '#e0f2fe' }}>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Nombre del Fiador *</label>
                <input value={fiadorNombre} onChange={e => setFiadorNombre(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Cédula</label>
                  <input value={fiadorCedula} onChange={e => setFiadorCedula(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div className="flex-1">
                  <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Teléfono</label>
                  <input value={fiadorTelefono} onChange={e => setFiadorTelefono(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
              </div>
            </div>
          )}

          {requiereRepresentanteLegal && (
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Representante Legal</label>
              <input value={representanteLegal} onChange={e => setRepresentanteLegal(e.target.value)}
                placeholder="Quien firma en representación de la empresa"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Fecha Emisión *</label>
              <input type="date" value={fechaEmision} onChange={e => setFechaEmision(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Vencimiento *</label>
              <input type="date" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Ubicación en Archivero *</label>
            <input value={ubicacion} onChange={e => setUbicacion(e.target.value)}
              placeholder="Ej. Archivero A - Gaveta 3"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancelar</button>
            <button type="submit" disabled={loading || !seleccionado}
              className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60" style={{ backgroundColor: '#009ee3' }}>
              {loading ? 'Registrando...' : 'Registrar Garantía'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (esto también resuelve el error pendiente de la Tarea 7).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/auditoria-legal/garantias"
git commit -m "feat(auditoria-legal): página, tabla y modal de registro de Garantías (Tab 1)"
```

---

## Task 9: Placeholders para Tab 2 y Tab 3

**Files:**

- Create: `src/components/auditoria-legal/ProximamenteTab.tsx`
- Create: `src/app/(app)/auditoria-legal/auditorias-cartera/page.tsx`
- Create: `src/app/(app)/auditoria-legal/cobertura/page.tsx`

- [ ] **Step 1: Componente compartido**

```typescript
// src/components/auditoria-legal/ProximamenteTab.tsx
import { Clock } from 'lucide-react'

export default function ProximamenteTab({ titulo }: { titulo: string }) {
  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }} className="flex items-center justify-center px-5 py-5">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-10 py-12 text-center max-w-md">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#eff6ff' }}>
          <Clock size={22} color="#009ee3" />
        </div>
        <h2 className="text-base font-bold text-gray-800 mb-1.5">{titulo}</h2>
        <p className="text-sm text-gray-500">Esta sección está en construcción y se habilitará en una próxima fase de Auditoría y Control Legal.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Página placeholder de Auditorías de Cartera**

```typescript
// src/app/(app)/auditoria-legal/auditorias-cartera/page.tsx
import ProximamenteTab from '@/components/auditoria-legal/ProximamenteTab'

export default function AuditoriasCarteraPage() {
  return <ProximamenteTab titulo="Auditorías de Cartera" />
}
```

- [ ] **Step 3: Página placeholder de Balance de Cobertura y Riesgo**

```typescript
// src/app/(app)/auditoria-legal/cobertura/page.tsx
import ProximamenteTab from '@/components/auditoria-legal/ProximamenteTab'

export default function CoberturaPage() {
  return <ProximamenteTab titulo="Balance de Cobertura y Riesgo" />
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/auditoria-legal src/app/\(app\)/auditoria-legal/auditorias-cartera src/app/\(app\)/auditoria-legal/cobertura
git commit -m "feat(auditoria-legal): placeholders de Auditorías de Cartera y Cobertura (Fases 2-3)"
```

---

## Task 10: Sidebar — nueva categoría "Auditoría y Control Legal"

**Files:**

- Modify: `src/components/sidebar.tsx:7-29` (imports), `src/components/sidebar.tsx:89-90` (inserción de categoría)

⚠️ **Antes de este paso, confirmar explícitamente con Jeffrey** que se procede a modificar `sidebar.tsx` (CLAUDE.md §5.1: "NO tocar el Sidebar bajo ninguna circunstancia" salvo autorización explícita — ya cubierta por el pedido original y el spec aprobado, pero se reconfirma en el momento del cambio real).

- [ ] **Step 1: Agregar el ícono `Scale` a los imports de lucide-react**

En `src/components/sidebar.tsx:7-29`, agregar `Scale` al import existente:

```typescript
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
} from 'lucide-react';
```

- [ ] **Step 2: Insertar la categoría nueva entre "Inteligencia Financiera" y "Sistema"**

En `src/components/sidebar.tsx:89-90`, donde hoy dice:

```tsx
  {
    label: 'Sistema',
```

reemplazar por (agrega la categoría nueva ANTES, sin tocar nada de "Sistema" ni de "Inteligencia Financiera"):

```tsx
  {
    label: 'Auditoría y Control Legal',
    icon: <Scale size={13} />,
    roles: ['COORDINADOR', 'ANALISTA'],
    items: [
      { label: 'Control y Custodia de Garantías', href: '/auditoria-legal/garantias',           icon: <Scale size={16} />, roles: ['COORDINADOR', 'ANALISTA'] },
      { label: 'Auditorías de Cartera',           href: '/auditoria-legal/auditorias-cartera',  icon: <Scale size={16} />, roles: ['COORDINADOR', 'ANALISTA'] },
      { label: 'Balance de Cobertura y Riesgo',   href: '/auditoria-legal/cobertura',            icon: <Scale size={16} />, roles: ['COORDINADOR', 'ANALISTA'] },
    ],
  },
  {
    label: 'Sistema',
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Verificar visualmente en el navegador**

Con `npm run dev` corriendo, abrir `http://localhost:3000/dashboard` logueado, confirmar:

- La categoría "Auditoría y Control Legal" aparece entre "Inteligencia Financiera" y "Sistema", con ícono de balanza.
- Sus 3 sub-items navegan a `/auditoria-legal/garantias` (tabla funcional), `/auditoria-legal/auditorias-cartera` y `/auditoria-legal/cobertura` (ambas "Próximamente").
- Colapsar el sidebar: el ícono de balanza aparece en la posición correcta, con tooltip "Auditoría y Control Legal" al pasar el mouse.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(auditoria-legal): agrega categoría de sidebar entre Inteligencia Financiera y Sistema"
```

---

## Task 11: Verificación final

**Files:** Ninguno nuevo — solo verificación de todo el conjunto.

- [ ] **Step 1: Type-check completo**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 2: Build de producción**

Run: `npm run build`
Expected: build exitoso sin errores (warnings de ESLint no bloquean, pero revisarlos si aparecen).

- [ ] **Step 3: Probar el flujo completo en el navegador**

Con `npm run dev`, como COORDINADOR:

1. Ir a `/auditoria-legal/garantias`, click "+ Registrar Garantía".
2. Buscar un contribuyente real (probar uno con múltiples `cliente_cod`, ej. `3101082969`), confirmar que aparece 1 sola vez con "49 códigos".
3. Seleccionarlo, confirmar que aparece el badge de Hacienda (o el modal sigue funcionando si Hacienda no responde) y el monto sugerido.
4. Completar el formulario y registrar. Confirmar que la fila aparece en la tabla con el semáforo de Cobertura correcto.
5. Click "Entregar a Vendedor" -- confirmar que el estado cambia a "Enviado a Vendedor" y que llega el correo (o que el error se muestra claramente si el vendedor no tiene email).
6. Continuar el ciclo completo hasta "Reingresar a Custodia", adjuntar un PDF de prueba con el ícono de clip.
7. Repetir el registro para el mismo contribuyente y confirmar el aviso de sustitución.

- [ ] **Step 4: Avisar que se requiere deploy**

Recordar a Jeffrey que hace falta `git push origin master` para que Vercel despliegue estos cambios a producción (CLAUDE.md §1) -- no hacer el push sin que lo pida explícitamente.

---

## Self-Review

**1. Cobertura del spec:** Roles/acceso (Task 10 roles array) ✓ · Modelo de datos por contribuyente (Task 1) ✓ · Config `HOLGURA_GARANTIA_PCT` (Task 1) ✓ · Ciclo de custodia con botones contextuales (Task 7) ✓ · Correo real al vendedor+supervisor (Task 4) ✓ · Hacienda on-demand + Representante Legal condicional (Task 8) ✓ · PDF adjunto (Task 5, 7) ✓ · Sustitución de título (Task 3) ✓ · Resolución de analista/vendedor por mayor saldo + notificación de conflicto (Task 1 RPC, Task 3) ✓ · Sidebar con las 3 rutas + placeholders (Task 9, 10) ✓ · Semáforo Cobertura reusando rojo/ámbar/verde (Task 1 RPC, Task 7) ✓.

**2. Placeholders:** ninguno pendiente -- cada paso tiene código completo, sin "TODO" ni "implementar después".

**3. Consistencia de tipos:** `GarantiaListaRow` (tipo, en `types/auditoria-legal.ts`) y `ACCION_CUSTODIA_CFG`/`ESTADO_CUSTODIA_LABEL`/`SEMAFORO_COLOR` (config, en `lib/auditoria-legal/catalogo.ts`, post-review de calidad de Task 2) se definen una vez y se importan igual en Tasks 4 y 7 -- mismos nombres y mismo origen en ambos lugares.

**4. Fuera de alcance respetado:** no se tocó `gestiones`, no se construyó Tab 3 como reporte agregado, no se tocó la ficha 360 -- todo consistente con el spec.

---

Plan completo y guardado en `docs/superpowers/plans/2026-07-29-auditoria-legal-fase1-garantias.md`. Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — despacho un subagente nuevo por cada una de las 11 tareas, con revisión entre tareas.

**2. Ejecución en esta sesión** — ejecuto las tareas en este mismo chat con `executing-plans`, en lote con checkpoints para que revisés.

¿Cuál preferís?
