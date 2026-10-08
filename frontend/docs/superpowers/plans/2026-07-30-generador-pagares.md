# Generador de Pagarés Oficiales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generar el pagaré oficial imprimible desde una garantía ya registrada en "Control y Custodia de Garantías", con selección automática de plantilla (jurídica/física), datos demográficos reutilizables entre garantías distintas, y un documento que nunca cambia después de generado.

**Architecture:** Tabla nueva `personas_legales` (memoria por cédula, para autocompletar), columnas nuevas en `garantias` que guardan la fotografía exacta de lo que quedó impreso, un endpoint que hace ambas cosas atómicamente, un modal de captura que sólo aparece la primera vez, y una vista de impresión en una ruta fuera de `(app)` (sin sidebar/topbar) que usa `@media print` + `window.print()`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS), React (client components).

**Spec de referencia:** [`docs/superpowers/specs/2026-07-30-generador-pagares-design.md`](../specs/2026-07-30-generador-pagares-design.md)

---

## Nota sobre verificación

Sin test runner en este proyecto (CLAUDE.md): la verificación es `npx tsc --noEmit` + `npm run build`. Para la lógica pura de `numeroALetras` (Task 3), que si tiene errores reales de conteo no los detecta ni tsc ni el build, se verifica ejecutándola de verdad con `npx tsx` (se descarga on-demand vía npx, no se agrega como dependencia permanente).

## Mapa de archivos

**Crear:**

- `src/lib/auditoria-legal/persona.ts` (helper `esPersonaJuridica` compartido)
- `src/lib/utils/numero-a-letras.ts`
- `src/lib/auditoria-legal/pagare-template.ts` (contenido legal + `fechaLegal`)
- `src/app/api/auditoria-legal/garantias/[id]/pagare/route.ts`
- `src/app/(app)/auditoria-legal/garantias/ModalGenerarPagare.tsx`
- `src/app/(print)/pagare/[id]/page.tsx`
- `src/app/(print)/pagare/[id]/PagareImprimible.tsx`

**Modificar:**

- `src/types/auditoria-legal.ts` (tipos nuevos)
- `src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx` (usar `esPersonaJuridica` compartido + botón "Generar Pagaré")
- `src/components/configuracion/TabParametros.tsx` (parámetro de tasa de interés)
- `src/app/api/configuracion/parametros/route.ts` (whitelist)
- `supabase/migrations/20260730_auditoria_legal_fase1_garantias.sql` (consolidar el schema nuevo)

---

## Task 1: Base de datos

**Files:** Ninguno en el repo en este paso — todo vía Supabase MCP (`apply_migration`). El archivo `.sql` del repo se actualiza en el Task 9.

- [ ] **Step 1: Crear `personas_legales` + RLS + trigger**

Usar `apply_migration` (project_id `swkmrufsyhnaeoijasrz`):

```sql
create table if not exists public.personas_legales (
  cedula        text primary key,
  nombre        text not null,
  estado_civil  text check (estado_civil is null or estado_civil in ('Soltero','Casado','Divorciado','Unión Libre')),
  profesion     text,
  domicilio     text,
  telefono      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.personas_legales enable row level security;

create policy personas_legales_select_activos on public.personas_legales
  for select using (fn_es_usuario_activo());
create policy personas_legales_insert_activos on public.personas_legales
  for insert with check (fn_es_usuario_activo());
create policy personas_legales_update_activos on public.personas_legales
  for update using (fn_es_usuario_activo());

create trigger personas_legales_updated_at
  before update on public.personas_legales
  for each row execute function update_updated_at();
```

- [ ] **Step 2: Verificar**

```sql
select table_name from information_schema.tables where table_name = 'personas_legales';
select policyname, cmd from pg_policies where tablename = 'personas_legales' order by cmd;
select tgname from pg_trigger where tgrelid = 'public.personas_legales'::regclass and not tgisinternal;
```

Expected: 1 tabla, 3 políticas (select/insert/update), 1 trigger.

- [ ] **Step 3: Columnas nuevas en `garantias`**

```sql
alter table public.garantias
  add column if not exists deudor_estado_civil          text,
  add column if not exists deudor_profesion              text,
  add column if not exists deudor_domicilio              text,
  add column if not exists representante_cedula           text,
  add column if not exists representante_estado_civil     text,
  add column if not exists representante_profesion        text,
  add column if not exists representante_domicilio        text,
  add column if not exists fiador_estado_civil             text,
  add column if not exists fiador_profesion                text,
  add column if not exists fiador_domicilio                text,
  add column if not exists tasa_interes_moratorio           numeric,
  add column if not exists lugar_emision                    text,
  add column if not exists documento_pagare_generado_en     timestamptz;

alter table public.garantias
  add constraint garantias_deudor_estado_civil_check
    check (deudor_estado_civil is null or deudor_estado_civil in ('Soltero','Casado','Divorciado','Unión Libre')),
  add constraint garantias_representante_estado_civil_check
    check (representante_estado_civil is null or representante_estado_civil in ('Soltero','Casado','Divorciado','Unión Libre')),
  add constraint garantias_fiador_estado_civil_check
    check (fiador_estado_civil is null or fiador_estado_civil in ('Soltero','Casado','Divorciado','Unión Libre')),
  add constraint garantias_tasa_interes_moratorio_check
    check (tasa_interes_moratorio is null or (tasa_interes_moratorio > 0 and tasa_interes_moratorio <= 100));
```

- [ ] **Step 4: Verificar**

```sql
select column_name from information_schema.columns
where table_name = 'garantias' and column_name in (
  'deudor_estado_civil','deudor_profesion','deudor_domicilio',
  'representante_cedula','representante_estado_civil','representante_profesion','representante_domicilio',
  'fiador_estado_civil','fiador_profesion','fiador_domicilio',
  'tasa_interes_moratorio','lugar_emision','documento_pagare_generado_en'
);
```

Expected: 13 filas.

- [ ] **Step 5: Ampliar `garantia_eventos_tipo_evento_check` con `GENERACION_PAGARE`**

```sql
alter table public.garantia_eventos drop constraint garantia_eventos_tipo_evento_check;
alter table public.garantia_eventos add constraint garantia_eventos_tipo_evento_check
  check (tipo_evento = any (array[
    'APERTURA_EXPEDIENTE','ENTREGA_A_VENDEDOR','TRAMITE_DE_FIRMA','REINGRESO_A_CUSTODIA',
    'SUSTITUCION_DE_TITULO','ADJUNTO_DOCUMENTO','CORRECCION_DATOS','GENERACION_PAGARE'
  ]));
```

- [ ] **Step 6: Verificar**

```sql
select pg_get_constraintdef(oid) from pg_constraint where conname = 'garantia_eventos_tipo_evento_check';
```

Expected: incluye `'GENERACION_PAGARE'::text` (8 valores en total).

- [ ] **Step 7: Config nuevo en `config_sistema`**

```sql
insert into public.config_sistema (clave, valor, descripcion) values
  ('PAGARE_ACREEDOR_RAZON_SOCIAL', 'Consorcio Ferretero de San José Sociedad Anónima', 'Razón social del acreedor (Cofersa) que aparece en todo pagaré generado por el sistema.'),
  ('PAGARE_ACREEDOR_CEDULA_JURIDICA', '3-101-096760', 'Cédula jurídica del acreedor (Cofersa) que aparece en todo pagaré generado.'),
  ('PAGARE_LUGAR_EMISION_DEFAULT', 'Tibás, San José, Costa Rica', 'Lugar de emisión sugerido al generar un pagaré -- editable por garantía.'),
  ('TASA_INTERES_MORATORIO_DEFAULT', '', 'Tasa de interés moratorio (% mensual) sugerida al generar un pagaré. Vacío a propósito hasta que se defina desde Configuración > Parámetros.')
on conflict (clave) do nothing;
```

- [ ] **Step 8: Verificar**

```sql
select clave, valor from config_sistema where clave like 'PAGARE_%' or clave = 'TASA_INTERES_MORATORIO_DEFAULT' order by clave;
```

Expected: 4 filas con los valores de arriba.

- [ ] **Step 9: No git commit** — todo vive en Supabase, se consolida en el `.sql` del repo en el Task 9.

---

## Task 2: Tipos TypeScript + helper compartido `esPersonaJuridica`

**Files:**

- Create: `src/lib/auditoria-legal/persona.ts`
- Modify: `src/types/auditoria-legal.ts`
- Modify: `src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx:27-38` (quitar la función local, usar el import)

- [ ] **Step 1: Crear el helper compartido**

```typescript
// src/lib/auditoria-legal/persona.ts

/**
 * Cédula jurídica en Costa Rica: 10 dígitos que empiezan con 3. Las físicas
 * son de 9 y los DIMEX de 12. Verificado contra el maestro de clientes (jul
 * 2026): de los 1,048 clientes que cumplen esta regla, 967 (92%) traen
 * S.A./S.R.L./Limitada en el nombre -- discriminante confiable.
 *
 * Se usa para: el KPI "Sin Aval Personal" en la tabla de Garantías, y para
 * decidir la plantilla del pagaré (A jurídica / B física) sin depender de
 * que la API de Hacienda esté disponible en el momento de generar el
 * documento.
 */
export function esPersonaJuridica(contribuyente: string): boolean {
  const c = contribuyente.trim();
  return c.length === 10 && c.startsWith('3');
}
```

- [ ] **Step 2: Actualizar `garantias-cliente.tsx` para usar el helper compartido**

En `src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx`, reemplazar:

```typescript
/**
 * Cédula jurídica en Costa Rica: 10 dígitos que empiezan con 3. Las físicas son
 * de 9 y los DIMEX de 12. Verificado contra el maestro (jul 2026): de los 1,048
 * clientes que cumplen esta regla, 967 (92%) traen S.A./S.R.L./Limitada en el
 * nombre, así que es un discriminante confiable. Se usa para el KPI de riesgo
 * "sociedad sin aval de una persona física" -- si la sociedad no paga y nadie
 * la avala personalmente, no hay patrimonio individual detrás del título.
 */
function esPersonaJuridica(contribuyente: string): boolean {
  const c = contribuyente.trim();
  return c.length === 10 && c.startsWith('3');
}
```

por (se borra la función local, se importa la compartida):

```typescript
import { esPersonaJuridica } from '@/lib/auditoria-legal/persona';
```

Ese `import` va agregado junto a los otros imports al inicio del archivo (línea 12, después del import de `catalogo`), y la función local (líneas 27-38 actuales) se borra completa. El resto del archivo no cambia -- `esPersonaJuridica` se sigue llamando igual en el cálculo de `kpis.sinAval`.

- [ ] **Step 3: Agregar `documento_pagare_generado_en` a `GarantiaListaRow`**

En `src/types/auditoria-legal.ts`, dentro de la interfaz `GarantiaListaRow` (línea 15-38), agregar el campo al final (antes del `}` de cierre, después de `vencido: boolean`):

```typescript
documento_pagare_generado_en: string | null;
```

Este campo es lo que decide, en la tabla de Garantías, si el botón "Generar Pagaré" abre el modal de captura (Task 6) o navega directo a la vista de impresión (Task 7) -- ver Task 8. Sale de `fn_garantias_lista`, que se amplía para devolverlo en el Task 8 Step 2.

- [ ] **Step 4: Tipos nuevos en `src/types/auditoria-legal.ts`**

Agregar al final del archivo (después de `export type AccionCustodia = ...`):

```typescript
export type EstadoCivil = 'Soltero' | 'Casado' | 'Divorciado' | 'Unión Libre';
export const ESTADO_CIVIL_OPCIONES: EstadoCivil[] = [
  'Soltero',
  'Casado',
  'Divorciado',
  'Unión Libre',
];

export interface PersonaLegal {
  cedula: string;
  nombre: string;
  estado_civil: EstadoCivil | null;
  profesion: string | null;
  domicilio: string | null;
  telefono: string | null;
}

/**
 * Body de POST /api/auditoria-legal/garantias/[id]/pagare. Los campos de
 * deudor/representante/fiador son condicionales según la plantilla:
 * - Física (garantia.contribuyente NO es jurídica): deudor_*
 * - Jurídica: representante_*
 * - Fiador: solo si garantia.tiene_fiador
 * La ruta valida cuáles corresponden según el contribuyente real, no confía
 * en que el cliente mande exactamente los correctos.
 */
export interface GenerarPagarePayload {
  tasa_interes_moratorio: number;
  lugar_emision: string;
  deudor_estado_civil?: EstadoCivil;
  deudor_profesion?: string;
  deudor_domicilio?: string;
  representante_cedula?: string;
  representante_estado_civil?: EstadoCivil;
  representante_profesion?: string;
  representante_domicilio?: string;
  fiador_estado_civil?: EstadoCivil;
  fiador_profesion?: string;
  fiador_domicilio?: string;
}

/** Fila completa de `garantias` que necesita la vista de impresión del pagaré. */
export interface GarantiaPagareRow {
  id: number;
  contribuyente: string;
  cliente_nombre: string;
  tipo_titulo: TipoTitulo;
  monto_garantizado: number;
  fecha_emision: string;
  fecha_vencimiento: string;
  tiene_fiador: boolean;
  fiador_nombre: string | null;
  fiador_cedula: string | null;
  fiador_telefono: string | null;
  fiador_estado_civil: EstadoCivil | null;
  fiador_profesion: string | null;
  fiador_domicilio: string | null;
  representante_legal: string | null;
  representante_cedula: string | null;
  representante_estado_civil: EstadoCivil | null;
  representante_profesion: string | null;
  representante_domicilio: string | null;
  deudor_estado_civil: EstadoCivil | null;
  deudor_profesion: string | null;
  deudor_domicilio: string | null;
  tasa_interes_moratorio: number | null;
  lugar_emision: string | null;
  documento_pagare_generado_en: string | null;
}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auditoria-legal/persona.ts src/types/auditoria-legal.ts "src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx"
git commit -m "refactor(auditoria-legal): comparte esPersonaJuridica + tipos del Generador de Pagarés"
```

---

## Task 3: `numeroALetras`

**Files:**

- Create: `src/lib/utils/numero-a-letras.ts`

- [ ] **Step 1: Escribir la utilidad completa**

```typescript
// src/lib/utils/numero-a-letras.ts
//
// Convierte un monto entero en colones a su expresión formal en letras, para
// el texto legal de un pagaré (ej. 2500000 -> "DOS MILLONES QUINIENTOS MIL
// COLONES EXACTOS"). Sin céntimos: los montos de este sistema siempre son
// enteros (fmtCRC ya redondea, ver src/lib/utils/formato.ts).
//
// Límite: hasta ₡999.999.999 -- muy por encima de cualquier monto_garantizado
// real (la cartera completa de Cofersa es ₡4.02B, pero eso es la suma de
// miles de facturas, no el monto de un solo título). Un monto mayor lanza,
// no trunca en silencio.
//
// Nota conocida: no maneja el singular ("UN COLÓN EXACTO" para monto=1) --
// no es un caso real para un pagaré de garantía, así que no se resuelve.

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const ESPECIALES_10_19 = [
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISÉIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
];
const ESPECIALES_20_29 = [
  'VEINTE',
  'VEINTIUNO',
  'VEINTIDÓS',
  'VEINTITRÉS',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISÉIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
];
const DECENAS = [
  '',
  '',
  '',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
];
const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

/** 0-99 */
function dosDigitos(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (n < 20) return ESPECIALES_10_19[n - 10];
  if (n < 30) return ESPECIALES_20_29[n - 20];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`;
}

/** 0-999 */
function tresDigitos(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c === 0) return dosDigitos(resto);
  if (resto === 0) return CENTENAS[c];
  return `${CENTENAS[c]} ${dosDigitos(resto)}`;
}

// Apócope de "uno" antes de un sustantivo ("veintiún mil", "un millón" ya se
// maneja aparte como caso especial). Sólo afecta la última palabra del token.
function apocope(texto: string): string {
  if (texto === 'VEINTIUNO') return 'VEINTIÚN';
  return texto.replace(/\bUNO$/, 'UN');
}

export function numeroALetras(monto: number): string {
  const n = Math.round(Math.abs(monto));
  if (n > 999_999_999) throw new Error('numeroALetras: monto fuera de rango (máximo ₡999.999.999)');
  if (n === 0) return 'CERO COLONES EXACTOS';

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const partes: string[] = [];
  if (millones > 0)
    partes.push(millones === 1 ? 'UN MILLÓN' : `${apocope(tresDigitos(millones))} MILLONES`);
  if (miles > 0) partes.push(miles === 1 ? 'MIL' : `${apocope(tresDigitos(miles))} MIL`);
  if (resto > 0) partes.push(apocope(tresDigitos(resto)));

  return `${partes.join(' ')} COLONES EXACTOS`;
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Verificar el comportamiento real** (no hay test runner -- se ejecuta la función de verdad)

Crear un archivo temporal `scratch-numero-a-letras.mjs` en la raíz del repo (fuera de `src/`, se borra en el Step 5):

```javascript
// scratch-numero-a-letras.mjs -- verificación manual, se borra después
import { numeroALetras } from './src/lib/utils/numero-a-letras.ts';

const casos = [
  [1, 'UN'],
  [21, 'VEINTIÚN'],
  [31, 'TREINTA Y UN'],
  [100, 'CIEN COLONES EXACTOS'],
  [150, 'CIENTO CINCUENTA COLONES EXACTOS'],
  [1000, 'MIL COLONES EXACTOS'],
  [21000, 'VEINTIÚN MIL COLONES EXACTOS'],
  [100000, 'CIEN MIL COLONES EXACTOS'],
  [1000000, 'UN MILLÓN COLONES EXACTOS'],
  [2500000, 'DOS MILLONES QUINIENTOS MIL COLONES EXACTOS'],
  [1234567, 'UN MILLÓN DOSCIENTOS TREINTA Y CUATRO MIL QUINIENTOS SESENTA Y SIETE COLONES EXACTOS'],
  [100000000, 'CIEN MILLONES COLONES EXACTOS'],
];

let fallos = 0;
for (const [n, esperadoParcial] of casos) {
  const resultado = numeroALetras(n);
  const ok = resultado.includes(esperadoParcial);
  console.log(`${ok ? '✓' : '✗'} ${n} -> ${resultado}`);
  if (!ok) {
    console.log(`   esperaba que incluyera: ${esperadoParcial}`);
    fallos++;
  }
}
console.log(fallos === 0 ? '\nTodos los casos pasaron.' : `\n${fallos} caso(s) fallaron.`);
```

Run: `npx tsx scratch-numero-a-letras.mjs`
Expected: los 12 casos con ✓ y "Todos los casos pasaron." al final. Si algo falla, corregir `numero-a-letras.ts` antes de continuar (no ajustar el caso de prueba para que pase).

- [ ] **Step 4: Borrar el archivo temporal**

```bash
rm scratch-numero-a-letras.mjs
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/numero-a-letras.ts
git commit -m "feat(auditoria-legal): utilidad numeroALetras para el texto del pagare"
```

---

## Task 4: Parámetro de tasa de interés en Configuración

**Files:**

- Modify: `src/components/configuracion/TabParametros.tsx:12-18`
- Modify: `src/app/api/configuracion/parametros/route.ts:5-9`

- [ ] **Step 1: Agregar la clave a `PARAM_META`**

En `src/components/configuracion/TabParametros.tsx`, dentro del objeto `PARAM_META` (línea 12), agregar después de la entrada `HOLGURA_GARANTIA_PCT`:

```typescript
  TASA_INTERES_MORATORIO_DEFAULT: { label: '% Interés moratorio (pagarés)', hint: 'Tasa mensual sugerida al generar un pagaré -- se puede ajustar por garantía puntual', tipo: 'porcentaje' },
```

- [ ] **Step 2: Agregar la clave al whitelist del API**

En `src/app/api/configuracion/parametros/route.ts`, dentro de `CLAVES_PARAMETROS` (línea 5), agregar:

```typescript
  'TASA_INTERES_MORATORIO_DEFAULT',
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/configuracion/TabParametros.tsx src/app/api/configuracion/parametros/route.ts
git commit -m "feat(auditoria-legal): tasa de interes moratorio editable desde Configuracion"
```

---

## Task 5: API — generar el pagaré (upsert de personas + fotografía en la garantía)

**Files:**

- Create: `src/app/api/auditoria-legal/garantias/[id]/pagare/route.ts`

- [ ] **Step 1: Escribir el route completo**

```typescript
// src/app/api/auditoria-legal/garantias/[id]/pagare/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { esPersonaJuridica } from '@/lib/auditoria-legal/persona';
import type { EstadoCivil, GenerarPagarePayload } from '@/types/auditoria-legal';

type Params = { params: Promise<{ id: string }> };

const ESTADOS_CIVILES: readonly string[] = ['Soltero', 'Casado', 'Divorciado', 'Unión Libre'];

type GarantiaActual = {
  id: number;
  activo: boolean;
  contribuyente: string;
  cliente_nombre: string;
  tiene_fiador: boolean;
  fiador_nombre: string | null;
  fiador_cedula: string | null;
  fiador_telefono: string | null;
  representante_legal: string | null;
};

function validarEstadoCivil(v: unknown, campo: string): EstadoCivil | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !ESTADOS_CIVILES.includes(v)) {
    throw new Error(`${campo} inválido`);
  }
  return v as EstadoCivil;
}

// POST /api/auditoria-legal/garantias/[id]/pagare
// Primera generación del pagaré de una garantía: guarda los datos demográficos
// del deudor/representante/fiador que apliquen según la plantilla, hace upsert
// de cada persona en `personas_legales` (para autocompletar la próxima vez que
// aparezca en OTRA garantía), y marca `documento_pagare_generado_en`. A partir
// de ahí esos datos quedan fijos en la garantía -- reimprimir no vuelve a leer
// `personas_legales`, sólo la propia fila (ver GET en la vista de impresión).
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const garantiaId = Number(id);
  if (!Number.isInteger(garantiaId) || garantiaId <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  let body: GenerarPagarePayload;
  try {
    body = (await req.json()) as GenerarPagarePayload;
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: usuarioRow } = await supabase
    .from('usuarios')
    .select('id, rol')
    .ilike('email', user.email)
    .limit(1)
    .single();
  const usuario = usuarioRow as { id: string; rol: string } | null;
  const usuarioId = usuario?.id ?? null;
  if (!usuarioId) {
    return NextResponse.json(
      { error: 'Tu usuario no está registrado en el sistema.' },
      { status: 400 },
    );
  }
  if (usuario?.rol === 'ANALISTA_RIESGO') {
    return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
  }

  const { data: actualRow } = await supabase
    .from('garantias')
    .select(
      'id, activo, contribuyente, cliente_nombre, tiene_fiador, fiador_nombre, fiador_cedula, fiador_telefono, representante_legal',
    )
    .eq('id', garantiaId)
    .maybeSingle();
  if (!actualRow) return NextResponse.json({ error: 'Garantía no encontrada' }, { status: 404 });
  const actual = actualRow as GarantiaActual;

  if (!actual.activo) {
    return NextResponse.json(
      {
        error:
          'Esta garantía fue sustituida por otra: es un registro histórico y no se le puede generar pagaré.',
      },
      { status: 409 },
    );
  }

  // ── Validaciones ──────────────────────────────────────────────────────────
  const tasa = Number(body.tasa_interes_moratorio);
  if (!Number.isFinite(tasa) || tasa <= 0 || tasa > 100) {
    return NextResponse.json(
      { error: 'La tasa de interés moratorio debe ser un número entre 0 y 100' },
      { status: 400 },
    );
  }
  const lugar = (body.lugar_emision ?? '').trim();
  if (!lugar)
    return NextResponse.json({ error: 'El lugar de emisión es requerido' }, { status: 400 });

  const esFisica = !esPersonaJuridica(actual.contribuyente);
  const updates: Record<string, string | number> = {
    tasa_interes_moratorio: tasa,
    lugar_emision: lugar,
    documento_pagare_generado_en: new Date().toISOString(),
  };
  // Personas a upsertear en personas_legales: (cedula, datos). Se arma según
  // qué bloque aplica -- nunca los tres al mismo tiempo salvo que haya fiador.
  const personas: Array<{
    cedula: string;
    nombre: string;
    estado_civil?: EstadoCivil;
    profesion?: string;
    domicilio?: string;
    telefono?: string | null;
  }> = [];

  try {
    if (esFisica) {
      const estadoCivil = validarEstadoCivil(body.deudor_estado_civil, 'deudor_estado_civil');
      if (!estadoCivil)
        return NextResponse.json({ error: 'deudor_estado_civil es requerido' }, { status: 400 });
      const profesion = (body.deudor_profesion ?? '').trim();
      const domicilio = (body.deudor_domicilio ?? '').trim();
      if (!profesion || !domicilio) {
        return NextResponse.json(
          { error: 'Profesión y domicilio del deudor son requeridos' },
          { status: 400 },
        );
      }
      updates.deudor_estado_civil = estadoCivil;
      updates.deudor_profesion = profesion;
      updates.deudor_domicilio = domicilio;
      personas.push({
        cedula: actual.contribuyente,
        nombre: actual.cliente_nombre,
        estado_civil: estadoCivil,
        profesion,
        domicilio,
      });
    } else {
      const cedula = (body.representante_cedula ?? '').trim();
      if (!actual.representante_legal || !cedula) {
        return NextResponse.json(
          {
            error:
              'Falta el nombre o la cédula del representante legal (editá la garantía para completarlo)',
          },
          { status: 400 },
        );
      }
      const estadoCivil = validarEstadoCivil(
        body.representante_estado_civil,
        'representante_estado_civil',
      );
      if (!estadoCivil)
        return NextResponse.json(
          { error: 'representante_estado_civil es requerido' },
          { status: 400 },
        );
      const profesion = (body.representante_profesion ?? '').trim();
      const domicilio = (body.representante_domicilio ?? '').trim();
      if (!profesion || !domicilio) {
        return NextResponse.json(
          { error: 'Profesión y domicilio del representante son requeridos' },
          { status: 400 },
        );
      }
      updates.representante_cedula = cedula;
      updates.representante_estado_civil = estadoCivil;
      updates.representante_profesion = profesion;
      updates.representante_domicilio = domicilio;
      personas.push({
        cedula,
        nombre: actual.representante_legal,
        estado_civil: estadoCivil,
        profesion,
        domicilio,
      });
    }

    if (actual.tiene_fiador) {
      if (!actual.fiador_nombre || !actual.fiador_cedula) {
        return NextResponse.json(
          { error: 'Falta el nombre o la cédula del fiador (editá la garantía para completarlo)' },
          { status: 400 },
        );
      }
      const estadoCivil = validarEstadoCivil(body.fiador_estado_civil, 'fiador_estado_civil');
      if (!estadoCivil)
        return NextResponse.json({ error: 'fiador_estado_civil es requerido' }, { status: 400 });
      const profesion = (body.fiador_profesion ?? '').trim();
      const domicilio = (body.fiador_domicilio ?? '').trim();
      if (!profesion || !domicilio) {
        return NextResponse.json(
          { error: 'Profesión y domicilio del fiador son requeridos' },
          { status: 400 },
        );
      }
      updates.fiador_estado_civil = estadoCivil;
      updates.fiador_profesion = profesion;
      updates.fiador_domicilio = domicilio;
      personas.push({
        cedula: actual.fiador_cedula,
        nombre: actual.fiador_nombre,
        estado_civil: estadoCivil,
        profesion,
        domicilio,
        telefono: actual.fiador_telefono,
      });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // ── Upsert de cada persona en personas_legales (memoria entre garantías) ──
  for (const p of personas) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertErr } = await (supabase as any).from('personas_legales').upsert(
      {
        cedula: p.cedula,
        nombre: p.nombre,
        estado_civil: p.estado_civil,
        profesion: p.profesion,
        domicilio: p.domicilio,
        ...(p.telefono !== undefined ? { telefono: p.telefono } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'cedula' },
    );
    if (upsertErr)
      console.error('[garantias][pagare] Error al upsertear persona_legal:', p.cedula, upsertErr);
  }

  // ── Fotografía en la garantía (esto es lo que efectivamente imprime) ──────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await (supabase as any)
    .from('garantias')
    .update(updates)
    .eq('id', garantiaId)
    .eq('activo', true);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: eventoErr } = await (supabase as any).from('garantia_eventos').insert({
    garantia_id: garantiaId,
    tipo_evento: 'GENERACION_PAGARE',
    usuario_id: usuarioId,
    nota: `Pagaré generado (${esFisica ? 'plantilla física' : 'plantilla jurídica'}${actual.tiene_fiador ? ' + fiador' : ''})`,
  });
  if (eventoErr)
    console.error('[garantias][pagare] Error al registrar evento GENERACION_PAGARE:', eventoErr);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Verificar el esquema en vivo antes de dar por bueno el paso**

Consultar contra Supabase (project `swkmrufsyhnaeoijasrz`) que todas las columnas usadas en `.update(updates)` existen con el nombre exacto (`deudor_estado_civil`, `representante_cedula`, etc. -- los del Task 1), y que `personas_legales` acepta `upsert` con `onConflict: 'cedula'` (la PK es `cedula`, así que el default de Supabase ya funciona sin `onConflict` explícito, pero dejarlo explícito documenta la intención).

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/auditoria-legal/garantias/[id]/pagare/route.ts"
git commit -m "feat(auditoria-legal): API para generar el pagare (upsert personas_legales + foto en la garantia)"
```

---

## Task 6: Modal de captura — `ModalGenerarPagare`

**Files:**

- Create: `src/app/(app)/auditoria-legal/garantias/ModalGenerarPagare.tsx`

- [ ] **Step 1: Escribir el modal completo**

Sigue el mismo patrón hand-rolled que `ModalRegistrarGarantia.tsx` (overlay, caja blanca, `SeccionTitulo`). Sólo se muestra cuando `documento_pagare_generado_en` es `null` -- si ya existe, el llamador abre directo la vista de impresión (Task 7/8).

```typescript
// src/app/(app)/auditoria-legal/garantias/ModalGenerarPagare.tsx
'use client'

import { useState, useEffect } from 'react'
import { X, FileSignature, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { esPersonaJuridica } from '@/lib/auditoria-legal/persona'
import { ESTADO_CIVIL_OPCIONES } from '@/types/auditoria-legal'
import type { EstadoCivil, GarantiaListaRow, GenerarPagarePayload, PersonaLegal } from '@/types/auditoria-legal'

export interface ModalGenerarPagareProps {
  garantia: GarantiaListaRow
  onClose: () => void
  onSuccess: () => void
}

const LABEL = 'block text-[11px] font-bold text-gray-500 uppercase mb-1'
const INPUT = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition'

interface DatosPersona {
  estadoCivil: EstadoCivil | ''
  profesion: string
  domicilio: string
}

const VACIO: DatosPersona = { estadoCivil: '', profesion: '', domicilio: '' }

export default function ModalGenerarPagare({ garantia, onClose, onSuccess }: ModalGenerarPagareProps) {
  const esFisica = !esPersonaJuridica(garantia.contribuyente)

  const [tasa, setTasa] = useState('')
  const [lugar, setLugar] = useState('')
  const [deudor, setDeudor] = useState<DatosPersona>(VACIO)
  const [representanteCedula, setRepresentanteCedula] = useState('')
  const [representante, setRepresentante] = useState<DatosPersona>(VACIO)
  const [fiador, setFiador] = useState<DatosPersona>(VACIO)
  const [cargandoDefaults, setCargandoDefaults] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Precarga: tasa/lugar sugeridos desde config_sistema, y si la cédula que
  // corresponda (deudor física, representante, o fiador) ya está en
  // personas_legales, se autocompleta -- así no se vuelve a digitar entre
  // garantías distintas de la misma persona.
  useEffect(() => {
    let cancelado = false
    async function cargar() {
      const supabase = createClient()
      const { data: config } = await supabase
        .from('config_sistema')
        .select('clave, valor')
        .in('clave', ['TASA_INTERES_MORATORIO_DEFAULT', 'PAGARE_LUGAR_EMISION_DEFAULT'])
      if (cancelado) return
      const cfg = new Map((config ?? []).map((r: { clave: string; valor: string }) => [r.clave, r.valor]))
      setTasa(cfg.get('TASA_INTERES_MORATORIO_DEFAULT') || '')
      setLugar(cfg.get('PAGARE_LUGAR_EMISION_DEFAULT') || '')

      const cedulaDeudorORepresentante = esFisica ? garantia.contribuyente : null
      const cedulas = [cedulaDeudorORepresentante, garantia.tiene_fiador ? garantia.fiador_cedula : null].filter((c): c is string => !!c)
      if (cedulas.length > 0) {
        const { data: personas } = await supabase.from('personas_legales').select('*').in('cedula', cedulas)
        if (cancelado) return
        const porCedula = new Map((personas ?? []).map((p: PersonaLegal) => [p.cedula, p]))
        if (esFisica) {
          const p = porCedula.get(garantia.contribuyente)
          if (p) setDeudor({ estadoCivil: p.estado_civil ?? '', profesion: p.profesion ?? '', domicilio: p.domicilio ?? '' })
        }
        if (garantia.tiene_fiador && garantia.fiador_cedula) {
          const p = porCedula.get(garantia.fiador_cedula)
          if (p) setFiador({ estadoCivil: p.estado_civil ?? '', profesion: p.profesion ?? '', domicilio: p.domicilio ?? '' })
        }
      }
      setCargandoDefaults(false)
    }
    cargar()
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cuando el analista termina de escribir la cédula del representante legal
  // (puede repetirse en distintas sociedades que representa), buscar si ya
  // está en personas_legales y autocompletar -- mismo espíritu que el
  // useEffect de arriba, pero disparado on-blur porque acá la cédula no se
  // conoce de antemano (a diferencia del deudor física o el fiador, que ya
  // vienen en la garantía).
  async function buscarRepresentantePorCedula() {
    const cedula = representanteCedula.trim()
    if (!cedula) return
    const supabase = createClient()
    const { data: p } = await supabase.from('personas_legales').select('*').eq('cedula', cedula).maybeSingle()
    if (p) {
      const persona = p as PersonaLegal
      setRepresentante({ estadoCivil: persona.estado_civil ?? '', profesion: persona.profesion ?? '', domicilio: persona.domicilio ?? '' })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const tasaNum = Number(tasa)
    if (!Number.isFinite(tasaNum) || tasaNum <= 0 || tasaNum > 100) { setError('Indicá una tasa de interés moratorio válida (0-100%)'); return }
    if (!lugar.trim()) { setError('Indicá el lugar de emisión'); return }
    if (esFisica) {
      if (!deudor.estadoCivil || !deudor.profesion.trim() || !deudor.domicilio.trim()) {
        setError('Completá estado civil, profesión y domicilio del deudor'); return
      }
    } else {
      if (!garantia.representante_legal) { setError('Esta garantía no tiene representante legal registrado -- editala primero'); return }
      if (!representanteCedula.trim()) { setError('Indicá la cédula del representante legal'); return }
      if (!representante.estadoCivil || !representante.profesion.trim() || !representante.domicilio.trim()) {
        setError('Completá estado civil, profesión y domicilio del representante legal'); return
      }
    }
    if (garantia.tiene_fiador && (!fiador.estadoCivil || !fiador.profesion.trim() || !fiador.domicilio.trim())) {
      setError('Completá estado civil, profesión y domicilio del fiador'); return
    }

    setLoading(true); setError('')
    try {
      const payload: GenerarPagarePayload = { tasa_interes_moratorio: tasaNum, lugar_emision: lugar.trim() }
      if (esFisica) {
        payload.deudor_estado_civil = deudor.estadoCivil as EstadoCivil
        payload.deudor_profesion = deudor.profesion.trim()
        payload.deudor_domicilio = deudor.domicilio.trim()
      } else {
        payload.representante_cedula = representanteCedula.trim()
        payload.representante_estado_civil = representante.estadoCivil as EstadoCivil
        payload.representante_profesion = representante.profesion.trim()
        payload.representante_domicilio = representante.domicilio.trim()
      }
      if (garantia.tiene_fiador) {
        payload.fiador_estado_civil = fiador.estadoCivil as EstadoCivil
        payload.fiador_profesion = fiador.profesion.trim()
        payload.fiador_domicilio = fiador.domicilio.trim()
      }

      const res = await fetch(`/api/auditoria-legal/garantias/${garantia.id}/pagare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al generar el pagaré')
      onSuccess()
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <FileSignature size={16} /> Generar Pagaré — {garantia.cliente_nombre}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X size={16} /></button>
        </div>

        {cargandoDefaults ? (
          <div className="p-8 flex items-center justify-center text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <p className="text-[11px] text-gray-400 -mt-1">
              Plantilla: <b className="text-gray-600">{esFisica ? 'Persona Física' : 'Persona Jurídica'}</b> (según el formato de la cédula {garantia.contribuyente})
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Tasa de Interés Moratorio (% mensual) *</label>
                <input type="number" min="0.01" max="100" step="0.01" value={tasa} onChange={e => setTasa(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Lugar de Emisión *</label>
                <input value={lugar} onChange={e => setLugar(e.target.value)} className={INPUT} />
              </div>
            </div>

            {esFisica ? (
              <PersonaFieldset titulo="Datos del Deudor (persona física)" valor={deudor} onChange={setDeudor} />
            ) : (
              <div className="space-y-2.5 pl-3" style={{ borderLeft: '2px solid #009ee3' }}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Datos del Representante Legal{garantia.representante_legal ? ` — ${garantia.representante_legal}` : ''}
                </p>
                <div>
                  <label className={LABEL}>Cédula del Representante Legal *</label>
                  <input
                    value={representanteCedula}
                    onChange={e => setRepresentanteCedula(e.target.value)}
                    onBlur={buscarRepresentantePorCedula}
                    className={INPUT}
                  />
                </div>
                <PersonaFieldsetCampos valor={representante} onChange={setRepresentante} />
              </div>
            )}

            {garantia.tiene_fiador && (
              <PersonaFieldset titulo={`Datos del Fiador — ${garantia.fiador_nombre ?? ''}`} valor={fiador} onChange={setFiador} />
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancelar</button>
              <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60 transition" style={{ backgroundColor: '#009ee3' }}>
                {loading ? 'Generando...' : 'Guardar y Generar PDF'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function PersonaFieldset({ titulo, valor, onChange }: { titulo: string; valor: DatosPersona; onChange: (v: DatosPersona) => void }) {
  return (
    <div className="space-y-2.5 pl-3" style={{ borderLeft: '2px solid #009ee3' }}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{titulo}</p>
      <PersonaFieldsetCampos valor={valor} onChange={onChange} />
    </div>
  )
}

function PersonaFieldsetCampos({ valor, onChange }: { valor: DatosPersona; onChange: (v: DatosPersona) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <label className={LABEL}>Estado Civil *</label>
        <select value={valor.estadoCivil} onChange={e => onChange({ ...valor, estadoCivil: e.target.value as EstadoCivil })} className={`${INPUT} bg-white`}>
          <option value="">Seleccionar...</option>
          {ESTADO_CIVIL_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <label className={LABEL}>Profesión / Oficio *</label>
        <input value={valor.profesion} onChange={e => onChange({ ...valor, profesion: e.target.value })} className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Domicilio Exacto *</label>
        <input value={valor.domicilio} onChange={e => onChange({ ...valor, domicilio: e.target.value })} className={INPUT} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/auditoria-legal/garantias/ModalGenerarPagare.tsx"
git commit -m "feat(auditoria-legal): modal de captura de datos para generar el pagare"
```

---

## Task 7: Vista de impresión

**Files:**

- Create: `src/app/(print)/pagare/[id]/page.tsx`
- Create: `src/app/(print)/pagare/[id]/PagareImprimible.tsx`
- Create: `src/lib/auditoria-legal/pagare-template.ts`

**Por qué una ruta fuera de `(app)`:** el grupo de rutas `(app)` tiene su propio `layout.tsx` que agrega el Sidebar/Topbar (CLAUDE.md: no tocar el Sidebar). Una ruta bajo `(print)` (sin paréntesis en la URL real -- queda en `/pagare/[id]`) no hereda ese layout, sólo el root (`src/app/layout.tsx`, que sólo pone `<html>/<body>` + la fuente Nunito) -- así se imprime limpio sin tocar ningún archivo compartido.

- [ ] **Step 1: Helper de fecha legal + contenido de las cláusulas**

```typescript
// src/lib/auditoria-legal/pagare-template.ts
import { numeroALetras } from '@/lib/utils/numero-a-letras';
import { fmtCRC } from '@/lib/utils/formato';
import { esPersonaJuridica } from '@/lib/auditoria-legal/persona';
import type { GarantiaPagareRow } from '@/types/auditoria-legal';

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** '2026-07-30' -> '30 de julio de 2026' */
export function fechaLegal(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split('-').map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

export interface AcreedorConfig {
  razonSocial: string;
  cedulaJuridica: string;
}

export interface ContenidoPagare {
  esFisica: boolean;
  montoTexto: string;
  montoLetras: string;
  fechaEmisionTexto: string;
  fechaVencimientoTexto: string;
}

export function construirContenido(g: GarantiaPagareRow): ContenidoPagare {
  return {
    esFisica: !esPersonaJuridica(g.contribuyente),
    montoTexto: fmtCRC(g.monto_garantizado),
    montoLetras: numeroALetras(g.monto_garantizado),
    fechaEmisionTexto: fechaLegal(g.fecha_emision),
    fechaVencimientoTexto: fechaLegal(g.fecha_vencimiento),
  };
}
```

- [ ] **Step 2: Server Component — obtiene la garantía y valida acceso**

```typescript
// src/app/(print)/pagare/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import PagareImprimible from './PagareImprimible'
import type { GarantiaPagareRow, AcreedorConfig } from '@/types/auditoria-legal'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const COLUMNAS_PAGARE = `
  id, contribuyente, cliente_nombre, tipo_titulo, monto_garantizado, fecha_emision, fecha_vencimiento,
  tiene_fiador, fiador_nombre, fiador_cedula, fiador_telefono, fiador_estado_civil, fiador_profesion, fiador_domicilio,
  representante_legal, representante_cedula, representante_estado_civil, representante_profesion, representante_domicilio,
  deudor_estado_civil, deudor_profesion, deudor_domicilio,
  tasa_interes_moratorio, lugar_emision, documento_pagare_generado_en
`.trim()

export default async function PagarePage({ params }: Params) {
  const { id } = await params
  const garantiaId = Number(id)
  if (!Number.isInteger(garantiaId) || garantiaId <= 0) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfilRow } = await supabase
    .from('usuarios').select('rol').eq('email', user.email!).limit(1).maybeSingle()
  const rol = (perfilRow as { rol: string } | null)?.rol ?? 'ANALISTA'
  if (rol === 'ANALISTA_RIESGO') redirect('/dashboard')

  const { data: garantiaRow } = await supabase
    .from('garantias').select(COLUMNAS_PAGARE).eq('id', garantiaId).maybeSingle()
  if (!garantiaRow) notFound()
  const garantia = garantiaRow as unknown as GarantiaPagareRow
  if (!garantia.documento_pagare_generado_en) notFound()

  const { data: configRows } = await supabase
    .from('config_sistema').select('clave, valor')
    .in('clave', ['PAGARE_ACREEDOR_RAZON_SOCIAL', 'PAGARE_ACREEDOR_CEDULA_JURIDICA'])
  const cfg = new Map((configRows ?? []).map(r => [r.clave, r.valor]))
  const acreedor: AcreedorConfig = {
    razonSocial: cfg.get('PAGARE_ACREEDOR_RAZON_SOCIAL') ?? '',
    cedulaJuridica: cfg.get('PAGARE_ACREEDOR_CEDULA_JURIDICA') ?? '',
  }

  return <PagareImprimible garantia={garantia} acreedor={acreedor} />
}
```

- [ ] **Step 3: Client Component — el documento + `@media print`**

```typescript
// src/app/(print)/pagare/[id]/PagareImprimible.tsx
'use client'

import { Printer } from 'lucide-react'
import { construirContenido } from '@/lib/auditoria-legal/pagare-template'
import type { GarantiaPagareRow, AcreedorConfig } from '@/types/auditoria-legal'

interface Props { garantia: GarantiaPagareRow; acreedor: AcreedorConfig }

export default function PagareImprimible({ garantia, acreedor }: Props) {
  const c = construirContenido(garantia)

  return (
    <div>
      <style>{`
        @media print {
          .no-imprimir { display: none !important; }
          @page { size: letter; margin: 2.2cm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="no-imprimir sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
        <span className="text-sm font-semibold text-gray-700">Vista previa — Pagaré #{garantia.id}</span>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white"
          style={{ background: '#009ee3' }}
        >
          <Printer size={15} /> Imprimir
        </button>
      </div>

      <div className="mx-auto max-w-[21.6cm] bg-white px-10 py-8 text-[13px] leading-relaxed text-gray-900" style={{ fontFamily: 'var(--font-nunito), sans-serif' }}>
        <h1 className="text-center text-lg font-bold uppercase tracking-wide mb-1">Pagaré</h1>
        <p className="text-center text-[11px] text-gray-500 mb-6">N.° {garantia.id} — SIC Cofersa</p>

        <p className="mb-4">
          <b>Monto:</b> {c.montoTexto} ({c.montoLetras})
        </p>
        <p className="mb-4">
          <b>Lugar y fecha de emisión:</b> {garantia.lugar_emision}, {c.fechaEmisionTexto}.{' '}
          <b>Fecha de vencimiento:</b> {c.fechaVencimientoTexto}.
        </p>

        {c.esFisica ? (
          <p className="mb-4 text-justify">
            Yo, <b>{garantia.cliente_nombre}</b>, mayor de edad, {garantia.deudor_estado_civil?.toLowerCase()},{' '}
            {garantia.deudor_profesion}, vecino(a) de {garantia.deudor_domicilio}, portador(a) de la cédula de
            identidad número {garantia.contribuyente}, por este medio y a título personal debo y pagaré
            incondicionalmente a la orden de <b>{acreedor.razonSocial}</b>, cédula jurídica número{' '}
            {acreedor.cedulaJuridica}, o a quien sus derechos represente, la suma de {c.montoLetras.toLowerCase()}{' '}
            ({c.montoTexto}), en el plazo antes indicado, SIN NECESIDAD DE PROTESTO, aviso o requerimiento de
            ninguna especie, a los cuales renuncio expresamente.
          </p>
        ) : (
          <p className="mb-4 text-justify">
            Yo, <b>{garantia.representante_legal}</b>, mayor de edad, {garantia.representante_estado_civil?.toLowerCase()},{' '}
            {garantia.representante_profesion}, vecino(a) de {garantia.representante_domicilio}, portador(a) de la
            cédula de identidad número {garantia.representante_cedula}, en mi condición de Representante Legal de{' '}
            <b>{garantia.cliente_nombre}</b>, cédula jurídica número {garantia.contribuyente}, por este medio y en
            nombre de mi representada debo y pagaré incondicionalmente a la orden de{' '}
            <b>{acreedor.razonSocial}</b>, cédula jurídica número {acreedor.cedulaJuridica}, o a quien sus derechos
            represente, la suma de {c.montoLetras.toLowerCase()} ({c.montoTexto}), en el plazo antes indicado, SIN
            NECESIDAD DE PROTESTO, aviso o requerimiento de ninguna especie, a los cuales renuncio expresamente en
            nombre de mi representada.
          </p>
        )}

        <p className="mb-4 text-justify">
          En caso de mora en el pago, reconoceré un interés moratorio del <b>{garantia.tasa_interes_moratorio}%</b> mensual
          sobre el saldo adeudado, calculado desde la fecha de vencimiento hasta la cancelación efectiva de esta obligación.
        </p>

        {garantia.tiene_fiador && (
          <p className="mb-4 text-justify">
            Yo, <b>{garantia.fiador_nombre}</b>, mayor de edad, {garantia.fiador_estado_civil?.toLowerCase()},{' '}
            {garantia.fiador_profesion}, vecino(a) de {garantia.fiador_domicilio}, portador(a) de la cédula número{' '}
            {garantia.fiador_cedula}, teléfono {garantia.fiador_telefono}, por este medio me constituyo en FIADOR Y
            CODEUDOR SOLIDARIO de la obligación anterior, por aval, respondiendo solidariamente con el deudor
            principal por el pago total de esta obligación, con renuncia expresa a los beneficios de excusión y división.
          </p>
        )}

        <div className="mt-16 grid grid-cols-2 gap-10 text-center text-[12px]">
          <div>
            <div className="border-t border-gray-800 pt-1.5">
              {c.esFisica ? 'Deudor Principal' : 'Representante Legal (con Sello)'}
            </div>
          </div>
          {garantia.tiene_fiador && (
            <div>
              <div className="border-t border-gray-800 pt-1.5">Fiador Solidario</div>
            </div>
          )}
        </div>

        <p className="mt-16 border-t border-gray-100 pt-3 text-center text-[9px] text-gray-400">
          Documento generado por el SIC — texto legal sin revisión de asesoría externa.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/(print) src/lib/auditoria-legal/pagare-template.ts
git commit -m "feat(auditoria-legal): vista de impresion del pagare (plantillas juridica y fisica)"
```

---

## Task 8: Botón "Generar Pagaré" en la tabla

**Files:**

- Modify: `src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx`

- [ ] **Step 1: Import + estado + navegación**

Agregar el import de `ModalGenerarPagare` y el ícono `FileSignature` junto a los demás imports de `lucide-react` (línea 4-7), y `useRouter` de `next/navigation`:

```typescript
import { useRouter } from 'next/navigation';
```

y agregar `FileSignature` a la lista de íconos importados de `lucide-react` (junto a `Loader2, Paperclip, FileText, X, Search, Truck, Pencil, ShieldAlert, Wallet, CalendarClock, Undo2`).

Agregar el import del modal nuevo, junto al de `ModalRegistrarGarantia`:

```typescript
import ModalGenerarPagare from './ModalGenerarPagare';
```

Dentro del componente, junto a los demás `useState` (después de `editando`):

```typescript
const router = useRouter();
// Garantía para la que se está capturando datos del pagaré (modal). Si la
// garantía ya tiene documento_pagare_generado_en, no se abre este modal --
// se navega directo a la vista de impresión.
const [generandoPagare, setGenerandoPagare] = useState<GarantiaListaRow | null>(null);

function abrirPagare(row: GarantiaListaRow) {
  if (row.documento_pagare_generado_en) router.push(`/pagare/${row.id}`);
  else setGenerandoPagare(row);
}
```

- [ ] **Step 2: Ampliar `fn_garantias_lista` para devolver `documento_pagare_generado_en`**

`GarantiaListaRow.documento_pagare_generado_en` (Task 2, Step 3) sale de esta función -- hay que agregarle la columna. Usar `apply_migration` (project_id `swkmrufsyhnaeoijasrz`), recreando la función completa con el mismo cuerpo que ya está en producción más la columna nueva en `returns table` y en el `select`:

```sql
create or replace function public.fn_garantias_lista(p_email text default null)
returns table (
  id                            bigint,
  contribuyente                 text,
  cliente_nombre                text,
  tipo_titulo                   text,
  monto_garantizado             numeric,
  tiene_fiador                  boolean,
  fiador_nombre                 text,
  fiador_cedula                 text,
  fiador_telefono               text,
  representante_legal           text,
  fecha_emision                 date,
  fecha_vencimiento             date,
  ubicacion_archivero           text,
  estado_custodia               text,
  documento_pdf_url             text,
  analista_email                text,
  vendedor_cod                  text,
  saldo_contribuyente           numeric,
  monto_objetivo                numeric,
  cobertura_pct                 numeric,
  semaforo                      text,
  vencido                       boolean,
  documento_pagare_generado_en  timestamptz
)
language sql stable security definer set search_path to 'public'
as $function$
  with hoy_cr as (
    select (now() at time zone 'America/Costa_Rica')::date as d
  ),
  saldo as (
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
    (g.fecha_vencimiento < (select d from hoy_cr)) as vencido,
    g.documento_pagare_generado_en
  from garantias g
  left join saldo s on s.contribuyente = g.contribuyente
  where g.activo = true
    and (p_email is null or g.analista_email = p_email)
  order by
    case when g.fecha_vencimiento < (select d from hoy_cr) then 0 else 1 end,
    g.fecha_vencimiento asc;
$function$;

revoke execute on function public.fn_garantias_lista(text) from public;
grant execute on function public.fn_garantias_lista(text) to authenticated, service_role;
```

Verificar:

```sql
select documento_pagare_generado_en from fn_garantias_lista(null) limit 1;
```

Expected: la columna existe y devuelve `null` para las garantías que aún no tienen pagaré generado (no falla con "column does not exist"). No hay commit de git en este paso -- vive en Supabase, se consolida en el `.sql` del repo en el Task 9 (igual que el resto del Task 1).

- [ ] **Step 3: Botón en la columna Acciones**

En el `<div style={{ display: 'flex', ... }}>` de la columna Acciones (dentro del `.map(r => ...)`, justo antes del botón de editar `<Pencil>`), agregar:

```tsx
<button
  type="button"
  onClick={() => abrirPagare(r)}
  disabled={r.tipo_titulo !== 'Pagaré'}
  className="inline-flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
  style={{ color: '#64748b', border: '1px solid #e2e8f0' }}
  title={
    r.tipo_titulo !== 'Pagaré'
      ? 'Solo disponible para garantías tipo Pagaré'
      : r.documento_pdf_url
        ? 'Generar/ver pagaré'
        : 'Generar pagaré'
  }
  aria-label="Generar pagaré"
>
  <FileSignature size={13} />
</button>
```

- [ ] **Step 4: Renderizar el modal al final del componente**

Junto a los otros modales (`showModal`, `editando`), agregar:

```tsx
{
  generandoPagare && (
    <ModalGenerarPagare
      garantia={generandoPagare}
      onClose={() => setGenerandoPagare(null)}
      onSuccess={() => {
        const id = generandoPagare.id;
        setGenerandoPagare(null);
        router.push(`/pagare/${id}`);
      }}
    />
  );
}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx" src/types/auditoria-legal.ts
git commit -m "feat(auditoria-legal): boton Generar Pagare en la tabla de Garantias"
```

---

## Task 9: Verificación final

**Files:** `supabase/migrations/20260730_auditoria_legal_fase1_garantias.sql` (consolidar), ninguno más nuevo.

- [ ] **Step 1: Consolidar el SQL nuevo en el archivo de migración del repo**

Agregar al final de `supabase/migrations/20260730_auditoria_legal_fase1_garantias.sql` todo el SQL aplicado en el Task 1 (tabla `personas_legales`, columnas nuevas de `garantias`, el `GENERACION_PAGARE` en el CHECK de `garantia_eventos`, y los 4 `insert` de `config_sistema`), más la recreación de `fn_garantias_lista` con la columna `documento_pagare_generado_en` agregada (Task 8, Step 2) -- para que el archivo del repo siga reflejando exactamente lo que hay en producción, mismo criterio que se usó en la Fase 1.

- [ ] **Step 2: Type-check completo**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Build de producción**

Run: `npm run build`
Expected: build exitoso. Confirmar que aparecen las rutas nuevas: `/api/auditoria-legal/garantias/[id]/pagare`, `/pagare/[id]`.

- [ ] **Step 4: Verificación funcional contra la base real (sin usar datos de producción)**

Con una transacción revertida (`BEGIN...ROLLBACK`, mismo patrón usado en el resto de este módulo), insertar una garantía de prueba tipo Pagaré (una física, una jurídica con fiador), llamar la lógica del endpoint de generación manualmente vía SQL equivalente para confirmar que `personas_legales` recibe el upsert y que `documento_pagare_generado_en` queda seteado, luego `ROLLBACK`.

- [ ] **Step 5: Avisar que se requiere deploy**

Recordarle a Jeffrey que hace falta `git push` para que Vercel despliegue -- no hacerlo sin que lo pida explícitamente.

---

## Self-Review

**1. Cobertura del spec:** selección de plantilla por cédula (Task 2, 6, 7) ✓ · `personas_legales` + snapshot inmutable (Task 1, 5) ✓ · config de acreedor/lugar/tasa (Task 1, 4) ✓ · `numeroALetras` (Task 3) ✓ · impresión `@media print` fuera de `(app)` (Task 7) ✓ · botón en la tabla + reimpresión sin volver a preguntar (Task 8) ✓ · advertencia de revisión legal en el pie del documento (Task 7) ✓.

**2. Placeholders:** ninguno. (Dos huecos detectados en la primera redacción -- el campo de cédula del representante legal faltando en el modal, y `documento_pagare_generado_en` ausente de `GarantiaListaRow` -- ya están resueltos en el código de las Tasks 2, 6 y 8, no quedan como notas pendientes.)

**3. Consistencia de tipos:** `GenerarPagarePayload`, `GarantiaPagareRow`, `PersonaLegal`, `EstadoCivil` se definen una vez (Task 2) y se usan con los mismos nombres en Tasks 5, 6, 7. `esPersonaJuridica` se define una sola vez (Task 2) y la usan Tasks 5, 6, 7 sin duplicar la lógica.

**4. Fuera de alcance respetado:** no se tocó Letra de Cambio, no se agregaron Prenda/Hipoteca, no se tocó el Sidebar, no se implementó firma electrónica.

---

Plan completo, guardado en `docs/superpowers/plans/2026-07-30-generador-pagares.md`. Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — despacho un subagente nuevo por cada una de las 9 tareas, con revisión entre tareas (mismo patrón que la Fase 1).

**2. Ejecución en esta sesión** — lo corremos acá mismo en lote, con checkpoints para que revisés.

¿Cuál preferís?
