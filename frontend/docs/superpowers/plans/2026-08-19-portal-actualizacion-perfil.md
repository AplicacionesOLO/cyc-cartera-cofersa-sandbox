# Portal de Actualización de Perfil + Campaña de Auditoría Legal 2026 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portal público con token temporal donde un cliente sin garantía sube su cédula (y personería jurídica si aplica) y confirma sus datos de representante legal, para que el analista revise y apruebe generando el pagaré con esos datos, reutilizando `personas_legales`/`maestro_clientes`/`ModalEmitirPagare`.

**Architecture:** 1 tabla nueva (`solicitudes_actualizacion`, llave `contribuyente`) + 1 bucket privado (`expedientes-clientes`) + rutas API server-side con service role para todo lo que toca el portal público (nunca RLS de cliente anónimo) + integración no invasiva en `garantias-cliente.tsx` (fetch directo a `solicitudes_actualizacion`, sin tocar el RPC existente de "Sin Garantía") + extensión mínima de `ModalEmitirPagare` para pre-llenar datos.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Supabase (Postgres + Storage + RLS), `browser-image-compression` (nueva dependencia), Gmail API (patrón ya existente).

**Spec de referencia:** [`docs/superpowers/specs/2026-08-19-portal-actualizacion-perfil-design.md`](../specs/2026-08-19-portal-actualizacion-perfil-design.md)

**No hay test runner en este proyecto** — verificación por tarea: `npx tsc --noEmit` + `npm run build` limpios. Verificación visual del portal público la puede hacer Claude en el navegador (no requiere login), pero el flujo de aprobación en `/auditoria-legal/garantias` sí requiere que Jeffrey confirme visualmente (OAuth).

**3 mejoras que agrego a lo ya aprobado (avisadas, no aplicadas todavía sin decir):**

1. **Expiración automática por cron** (Task 1): sin esto, el índice único parcial de `solicitudes_actualizacion` deja una solicitud vencida bloqueando para siempre el reenvío a ese contribuyente — es un bug real, no un nice-to-have, así que lo incluyo como parte del modelo de datos base.
2. **Botón "Copiar link"** además de enviar por correo (Task 9) — ya lo mencionaste vos mismo en el segundo mensaje ("el envío será por correo o link copiable"), lo hago explícito como parte del modal.
3. **Rate limiting del portal público** — lo dejo **fuera de este plan a propósito** (el token de 256 bits ya hace inviable un ataque de fuerza bruta, y el proyecto no tiene infraestructura de rate-limit por IP hoy); lo anoto acá para que quede escrito y decidas después si hace falta.

---

### Task 1: Migración — tabla, bucket privado y cron de expiración

**Files:**

- Create: `supabase/migrations/20260819_solicitudes_actualizacion_perfil.sql`

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Portal de Actualización de Perfil (campaña Auditoría Legal 2026). Ver spec
-- docs/superpowers/specs/2026-08-19-portal-actualizacion-perfil-design.md.
-- Reutiliza personas_legales (UPSERT por cédula, ya existe) y maestro_clientes
-- (vía fn_actualizar_contacto_cliente, ya existe) -- esta tabla es sólo el
-- tracking del trámite del portal, no un duplicado de datos de persona.

create table public.solicitudes_actualizacion (
  id                 bigserial primary key,
  contribuyente      text not null,
  cliente_nombre     text not null,
  tipo_persona       text not null check (tipo_persona in ('FISICA','JURIDICA')),
  token_hash         text not null unique,
  token_expira_en    timestamptz not null,
  estado             text not null default 'ENVIADA'
                       check (estado in ('ENVIADA','DATOS_RECIBIDOS','APROBADA','EXPIRADA')),
  datos_temporales   jsonb,
  url_cedula         text,
  url_personeria     text,
  enviada_por        uuid references public.usuarios(id),
  enviada_en         timestamptz not null default now(),
  respondida_en      timestamptz,
  aprobada_por       uuid references public.usuarios(id),
  aprobada_en        timestamptz,
  garantia_id        bigint references public.garantias(id),
  nota_revision      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Una sola solicitud "viva" por contribuyente a la vez -- igual patrón que
-- garantias_contribuyente_idx (índice único parcial).
create unique index solicitudes_actualizacion_contribuyente_activa_idx
  on public.solicitudes_actualizacion (contribuyente)
  where estado in ('ENVIADA','DATOS_RECIBIDOS');

alter table public.solicitudes_actualizacion enable row level security;

-- Mismo patrón que personas_legales: sólo personal activo autenticado. El
-- portal público NUNCA usa este cliente RLS -- siempre pasa por API routes
-- con el service role (ver Task 5/6), que valida el token a mano.
create policy solicitudes_actualizacion_select_activos on public.solicitudes_actualizacion
  for select using (fn_es_usuario_activo());
create policy solicitudes_actualizacion_insert_activos on public.solicitudes_actualizacion
  for insert with check (fn_es_usuario_activo());
create policy solicitudes_actualizacion_update_activos on public.solicitudes_actualizacion
  for update using (fn_es_usuario_activo());

create trigger solicitudes_actualizacion_updated_at
  before update on public.solicitudes_actualizacion
  for each row execute function update_updated_at();

-- Bucket privado para los documentos del portal (a diferencia de
-- comprobantes-pago, que es público). Sin políticas de storage.objects a
-- propósito: ni el portal (sin sesión) ni la UI de revisión leen este bucket
-- directo -- todo pasa por API routes con service role (subida y URLs
-- firmadas), así que "privado sin políticas" es la postura correcta, no un
-- descuido.
insert into storage.buckets (id, name, public)
values ('expedientes-clientes', 'expedientes-clientes', false)
on conflict (id) do nothing;

-- Expiración automática: sin esto, una solicitud vencida (estado='ENVIADA' o
-- 'DATOS_RECIBIDOS' pasado token_expira_en) queda bloqueando el índice único
-- de arriba para siempre -- nunca se podría volver a enviar a ese
-- contribuyente. Corre 1 vez al día, mismo estilo que fn_check_sync_salud.
create or replace function public.fn_expirar_solicitudes_actualizacion()
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  update solicitudes_actualizacion
  set estado = 'EXPIRADA', updated_at = now()
  where estado in ('ENVIADA','DATOS_RECIBIDOS')
    and token_expira_en < now();
$function$
;

select cron.schedule(
  'expirar_solicitudes_actualizacion_diario',
  '0 12 * * *',  -- 6:00am Costa Rica (UTC-6)
  $$SELECT public.fn_expirar_solicitudes_actualizacion()$$
);
```

- [ ] **Step 2: Aplicar la migración**

Usar la herramienta MCP de Supabase (`apply_migration`, confirmar primero con `list_projects` que el proyecto conectado es `swkmrufsyhnaeoijasrz` / `cyc-cartera-cofersa` — **no aplicar si aparece cualquier otro proyecto**). Nombre de la migración: `solicitudes_actualizacion_perfil`.

- [ ] **Step 3: Verificar**

Con `execute_sql`:

```sql
SELECT * FROM information_schema.columns WHERE table_name = 'solicitudes_actualizacion' ORDER BY ordinal_position;
SELECT id, name, public FROM storage.buckets WHERE id = 'expedientes-clientes';
SELECT public.fn_expirar_solicitudes_actualizacion(); -- no debe dar error (tabla vacía todavía)
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260819_solicitudes_actualizacion_perfil.sql
git commit -m "feat(auditoria-legal): tabla solicitudes_actualizacion + bucket privado + expiración

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Tipos TypeScript y catálogo de estados

**Files:**

- Create: `src/types/actualizacion-perfil.ts`
- Modify: `src/lib/auditoria-legal/catalogo.ts`

- [ ] **Step 1: Crear el archivo de tipos**

```typescript
// src/types/actualizacion-perfil.ts
import type { EstadoCivil } from './auditoria-legal';

export type EstadoSolicitudActualizacion = 'ENVIADA' | 'DATOS_RECIBIDOS' | 'APROBADA' | 'EXPIRADA';
export type TipoPersonaSolicitud = 'FISICA' | 'JURIDICA';

/** Fila de la tabla solicitudes_actualizacion (select completo). */
export interface SolicitudActualizacion {
  id: number;
  contribuyente: string;
  cliente_nombre: string;
  tipo_persona: TipoPersonaSolicitud;
  estado: EstadoSolicitudActualizacion;
  token_expira_en: string;
  datos_temporales: DatosTemporalesSolicitud | null;
  url_cedula: string | null;
  url_personeria: string | null;
  enviada_en: string;
  respondida_en: string | null;
  aprobada_en: string | null;
  garantia_id: number | null;
  nota_revision: string | null;
}

/** Lo que el cliente completa en el formulario público. */
export interface DatosTemporalesSolicitud {
  nombre: string;
  cedula: string;
  estado_civil: EstadoCivil;
  profesion: string;
  domicilio: string;
  telefono?: string;
}

/** Body de POST /api/auditoria-legal/solicitudes-actualizacion (crear + enviar). */
export interface CrearSolicitudPayload {
  contribuyente: string;
  cliente_nombre: string;
  correo_destino: string;
}

/** Body de POST /api/actualizar-perfil/[token] (el cliente envía el formulario). */
export interface EnviarFormularioPayload extends DatosTemporalesSolicitud {
  // Los archivos van en FormData aparte (cedula, personeria), no en este JSON.
}

/** Respuesta de GET /api/actualizar-perfil/[token]. */
export interface TokenValidoResponse {
  valido: true;
  tipo_persona: TipoPersonaSolicitud;
  cliente_nombre: string;
  nota_revision: string | null;
  datos_previos: DatosTemporalesSolicitud | null;
}
export interface TokenInvalidoResponse {
  valido: false;
}
```

- [ ] **Step 2: Agregar catálogo de estados/badges en `catalogo.ts`**

Al final del archivo, agregar:

```typescript
import type { EstadoSolicitudActualizacion } from '@/types/actualizacion-perfil';

// Badges del portal de actualización (Sin Garantía) -- mismo estilo de color
// plano que CUSTODIA_BADGE, sin emoji (CLAUDE.md §4, sistema de diseño).
export const ESTADO_SOLICITUD_LABEL: Record<EstadoSolicitudActualizacion, string> = {
  ENVIADA: 'Actualización Enviada',
  DATOS_RECIBIDOS: 'Datos Recibidos — Pendiente de Revisión',
  APROBADA: 'Aprobada',
  EXPIRADA: 'Enlace Vencido',
};
export const ESTADO_SOLICITUD_BADGE: Record<
  EstadoSolicitudActualizacion,
  { bg: string; text: string }
> = {
  ENVIADA: { bg: '#fef3c7', text: '#d97706' },
  DATOS_RECIBIDOS: { bg: '#dbeafe', text: '#1d4ed8' },
  APROBADA: { bg: '#dcfce7', text: '#15803d' },
  EXPIRADA: { bg: '#f1f5f9', text: '#64748b' },
};
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit` — esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/types/actualizacion-perfil.ts src/lib/auditoria-legal/catalogo.ts
git commit -m "feat(auditoria-legal): tipos y catálogo de estados del portal de actualización

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Helpers de token, storage y compresión

**Files:**

- Create: `src/lib/auditoria-legal/token-solicitud.ts`
- Create: `src/lib/auditoria-legal/storage-expedientes.ts`
- Modify: `package.json` (nueva dependencia)

- [ ] **Step 1: Instalar la librería de compresión**

```bash
npm install browser-image-compression
```

- [ ] **Step 2: Helper de token**

```typescript
// src/lib/auditoria-legal/token-solicitud.ts
import { randomBytes, createHash } from 'crypto';

/** Token crudo de 256 bits (64 caracteres hex) -- va en el link del correo, nunca se persiste. */
export function generarTokenSolicitud(): string {
  return randomBytes(32).toString('hex');
}

/** SHA-256 del token -- esto sí se guarda en token_hash. */
export function hashearToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Vigencia del link: 7 días desde ahora. */
export function calcularExpiracion(): string {
  return new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
}
```

- [ ] **Step 3: Helper de Storage (paths + signed URLs, sólo server-side)**

```typescript
// src/lib/auditoria-legal/storage-expedientes.ts
// Sólo se usa desde API routes con el cliente admin (service role) -- el
// bucket 'expedientes-clientes' es privado y no tiene políticas de
// storage.objects (ver migración), así que el cliente anon nunca puede
// leerlo ni escribirlo directo.
export const BUCKET_EXPEDIENTES = 'expedientes-clientes';

export type TipoDocumentoExpediente = 'cedula' | 'personeria';

/** '020503045/cedula_1755638400000.jpg' */
export function pathExpediente(
  contribuyente: string,
  tipo: TipoDocumentoExpediente,
  extension: string,
): string {
  return `${contribuyente}/${tipo}_${Date.now()}.${extension}`;
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit` — esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/auditoria-legal/token-solicitud.ts src/lib/auditoria-legal/storage-expedientes.ts
git commit -m "feat(auditoria-legal): helpers de token y storage del portal de actualización

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Plantilla de correo + endpoint para crear y enviar la solicitud

**Files:**

- Create: `src/lib/auditoria-legal/email-actualizacion-perfil.ts`
- Create: `src/app/api/auditoria-legal/solicitudes-actualizacion/route.ts`

- [ ] **Step 1: Plantilla del correo**

```typescript
// src/lib/auditoria-legal/email-actualizacion-perfil.ts
// Mismo patrón visual que email-cobro/estado-cuenta: header navy/cyan,
// tabla ancha, Nunito. Tono institucional y administrativo (pedido de legal).

export function asuntoAuditoriaAnual(): string {
  return 'Auditoría Anual de Control Interno y Normativa Comercial 2026 — Cofersa S.A.';
}

export function htmlAuditoriaAnual(clienteNombre: string, link: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:600px){.sic-main{width:100%!important;border-radius:0!important}}</style></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Nunito',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
    <tr><td align="center">
      <table class="sic-main" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);width:100%;max-width:640px;">
        <tr>
          <td style="background:#003B5C;padding:20px 32px;">
            <p style="margin:0;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">COFERSA S.A. · AUDITORÍA Y CONTROL LEGAL</p>
            <h1 style="margin:6px 0 0;color:#ffffff;font-size:19px;font-weight:800;">Auditoría Anual de Control Interno y Normativa Comercial 2026</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 14px 0;font-size:13px;color:#334155;line-height:1.75;">Estimado(a) <b>${clienteNombre}</b>,</p>
            <p style="margin:0 0 14px 0;font-size:13px;color:#334155;line-height:1.75;">
              Como parte de la Auditoría Anual de Control Interno y Normativa Comercial 2026 de Cofersa S.A.,
              le solicitamos actualizar la documentación de su expediente comercial. Este trámite es breve
              y no requiere crear una cuenta ni iniciar sesión.
            </p>
            <p style="margin:0 0 20px 0;font-size:13px;color:#334155;line-height:1.75;">
              Por favor ingrese al siguiente enlace y complete la información solicitada:
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
              <tr><td style="background:#009EE3;border-radius:8px;">
                <a href="${link}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;">Actualizar mi información</a>
              </td></tr>
            </table>
            <p style="margin:0 0 6px 0;font-size:11.5px;color:#94a3b8;line-height:1.6;">
              Este enlace es personal y vence en 7 días. Si usted no solicitó este trámite, puede ignorar este correo.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #eef2f7;">
            <p style="margin:0;font-size:10.5px;color:#94a3b8;">SIC — Sistema Inteligente de Cobranza · Cofersa © 2026</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
```

- [ ] **Step 2: Endpoint para crear la solicitud + enviar el correo**

```typescript
// src/app/api/auditoria-legal/solicitudes-actualizacion/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { resolveGmailToken } from '@/lib/utils/gmail-token';
import {
  generarTokenSolicitud,
  hashearToken,
  calcularExpiracion,
} from '@/lib/auditoria-legal/token-solicitud';
import { esPersonaJuridica } from '@/lib/auditoria-legal/persona';
import {
  asuntoAuditoriaAnual,
  htmlAuditoriaAnual,
} from '@/lib/auditoria-legal/email-actualizacion-perfil';
import type { CrearSolicitudPayload } from '@/types/actualizacion-perfil';

// POST /api/auditoria-legal/solicitudes-actualizacion
// Crea la solicitud (token nuevo) y envía el correo de Auditoría Anual 2026.
// Devuelve también el link crudo (para el botón "Copiar link" del modal) --
// es la ÚNICA vez que el token crudo sale del servidor.
export async function POST(req: NextRequest) {
  let body: CrearSolicitudPayload & {
    providerToken?: string | null;
    providerRefreshToken?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { contribuyente, cliente_nombre, correo_destino, providerToken, providerRefreshToken } =
    body;
  if (!contribuyente?.trim() || !cliente_nombre?.trim() || !correo_destino?.trim()) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
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
  if (!usuario?.id)
    return NextResponse.json(
      { error: 'Tu usuario no está registrado en el sistema.' },
      { status: 400 },
    );
  if (usuario.rol === 'ANALISTA_RIESGO') {
    return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const token = generarTokenSolicitud();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: nueva, error: insErr } = await (admin as any)
    .from('solicitudes_actualizacion')
    .insert({
      contribuyente: contribuyente.trim(),
      cliente_nombre: cliente_nombre.trim(),
      tipo_persona: esPersonaJuridica(contribuyente) ? 'JURIDICA' : 'FISICA',
      token_hash: hashearToken(token),
      token_expira_en: calcularExpiracion(),
      enviada_por: usuario.id,
    })
    .select('id')
    .single();

  if (insErr || !nueva) {
    // El índice único parcial rechaza una segunda solicitud activa para el mismo contribuyente.
    return NextResponse.json(
      {
        error:
          insErr?.code === '23505'
            ? 'Ya hay una solicitud activa para este contribuyente.'
            : `Error al crear la solicitud: ${insErr?.message ?? 'desconocido'}`,
      },
      { status: insErr?.code === '23505' ? 409 : 500 },
    );
  }

  const link = `${process.env.NEXT_PUBLIC_APP_URL}/actualizar-perfil/${token}`;

  const accessToken = await resolveGmailToken(providerToken, providerRefreshToken, user.email);
  let emailEnviado = false;
  let emailError: string | null = null;
  if (accessToken) {
    try {
      const raw = construirRawEmail(
        correo_destino.trim(),
        asuntoAuditoriaAnual(),
        htmlAuditoriaAnual(cliente_nombre.trim(), link),
      );
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      });
      emailEnviado = res.ok;
      if (!res.ok) emailError = `Gmail API respondió ${res.status}`;
    } catch (e) {
      emailError = (e as Error).message;
    }
  } else {
    emailError = 'No se pudo obtener un token de Gmail vigente';
  }

  return NextResponse.json({
    ok: true,
    id: (nueva as { id: number }).id,
    link,
    email_sent: emailEnviado,
    email_error: emailEnviado ? null : emailError,
  });
}

function construirRawEmail(to: string, subject: string, html: string): string {
  const mensaje = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ].join('\r\n');
  return Buffer.from(mensaje)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
```

**Nota para quien implemente:** revisar `src/app/api/clientes/email-cobro/route.ts` u otra ruta existente que use Gmail API para confirmar el nombre exacto del helper de armado del mensaje raw (`construirRawEmail` arriba es una implementación mínima de referencia) — si ya existe un helper compartido para esto en el repo, reusarlo en vez de duplicar.

- [ ] **Step 3: Verificar tipos y build**

Run: `npx tsc --noEmit` y `npm run build` — esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auditoria-legal/email-actualizacion-perfil.ts src/app/api/auditoria-legal/solicitudes-actualizacion/route.ts
git commit -m "feat(auditoria-legal): endpoint y correo para solicitar actualización de perfil

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Portal público — validar token y recibir el formulario

**Files:**

- Create: `src/app/api/actualizar-perfil/[token]/route.ts`

- [ ] **Step 1: GET (validar token) y POST (recibir formulario + archivos)**

```typescript
// src/app/api/actualizar-perfil/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { hashearToken } from '@/lib/auditoria-legal/token-solicitud';
import { pathExpediente, BUCKET_EXPEDIENTES } from '@/lib/auditoria-legal/storage-expedientes';
import { ESTADO_CIVIL_OPCIONES } from '@/types/auditoria-legal';
import type {
  TokenValidoResponse,
  TokenInvalidoResponse,
  DatosTemporalesSolicitud,
} from '@/types/actualizacion-perfil';

type Params = { params: Promise<{ token: string }> };

const MAX_MB_IMAGEN = 1; // ya viene comprimida a <=800KB del navegador; 1MB da margen
const MAX_MB_PDF = 3;

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buscarSolicitudActiva(sb: any, token: string) {
  const tokenHash = hashearToken(token);
  const { data } = await sb
    .from('solicitudes_actualizacion')
    .select(
      'id, contribuyente, cliente_nombre, tipo_persona, estado, token_expira_en, datos_temporales, nota_revision',
    )
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (!data) return null;
  if (data.estado !== 'ENVIADA') return null;
  if (new Date(data.token_expira_en).getTime() < Date.now()) return null;
  return data;
}

// GET: valida el token y devuelve lo necesario para pintar el formulario.
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const sb = admin();
  const solicitud = await buscarSolicitudActiva(sb, token);
  if (!solicitud)
    return NextResponse.json<TokenInvalidoResponse>({ valido: false }, { status: 404 });

  return NextResponse.json<TokenValidoResponse>({
    valido: true,
    tipo_persona: solicitud.tipo_persona,
    cliente_nombre: solicitud.cliente_nombre,
    nota_revision: solicitud.nota_revision,
    datos_previos: solicitud.datos_temporales,
  });
}

// POST: recibe el formulario (multipart/form-data -- campos de texto + cedula + personeria opcional).
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const sb = admin();
  const solicitud = await buscarSolicitudActiva(sb, token);
  if (!solicitud)
    return NextResponse.json({ error: 'Este enlace ya no es válido.' }, { status: 404 });

  const form = await req.formData();
  const nombre = String(form.get('nombre') ?? '')
    .trim()
    .toUpperCase();
  const cedula = String(form.get('cedula') ?? '').trim();
  const estadoCivil = String(form.get('estado_civil') ?? '');
  const profesion = String(form.get('profesion') ?? '').trim();
  const domicilio = String(form.get('domicilio') ?? '').trim();
  const telefono = String(form.get('telefono') ?? '').trim();
  const cedulaFile = form.get('cedula_file') as File | null;
  const personeriaFile = form.get('personeria_file') as File | null;

  if (
    !nombre ||
    !cedula ||
    !ESTADO_CIVIL_OPCIONES.includes(estadoCivil as never) ||
    !profesion ||
    !domicilio
  ) {
    return NextResponse.json({ error: 'Completá todos los campos requeridos.' }, { status: 400 });
  }
  if (!cedulaFile)
    return NextResponse.json({ error: 'Adjuntá la imagen de tu cédula.' }, { status: 400 });
  if (cedulaFile.size > MAX_MB_IMAGEN * 1024 * 1024) {
    return NextResponse.json(
      { error: `La imagen de cédula supera ${MAX_MB_IMAGEN}MB.` },
      { status: 400 },
    );
  }
  if (solicitud.tipo_persona === 'JURIDICA') {
    if (!personeriaFile)
      return NextResponse.json(
        { error: 'Adjuntá la certificación de personería jurídica.' },
        { status: 400 },
      );
    if (personeriaFile.size > MAX_MB_PDF * 1024 * 1024) {
      return NextResponse.json(
        { error: `El PDF de personería supera ${MAX_MB_PDF}MB.` },
        { status: 400 },
      );
    }
  }

  const extCedula = (cedulaFile.name.split('.').pop() || 'jpg').toLowerCase();
  const pathCedula = pathExpediente(solicitud.contribuyente, 'cedula', extCedula);
  const { error: upErr1 } = await sb.storage
    .from(BUCKET_EXPEDIENTES)
    .upload(pathCedula, cedulaFile);
  if (upErr1)
    return NextResponse.json(
      { error: `Error al subir la cédula: ${upErr1.message}` },
      { status: 500 },
    );

  let pathPersoneria: string | null = null;
  if (personeriaFile) {
    pathPersoneria = pathExpediente(solicitud.contribuyente, 'personeria', 'pdf');
    const { error: upErr2 } = await sb.storage
      .from(BUCKET_EXPEDIENTES)
      .upload(pathPersoneria, personeriaFile);
    if (upErr2)
      return NextResponse.json(
        { error: `Error al subir la personería: ${upErr2.message}` },
        { status: 500 },
      );
  }

  const datosTemporales: DatosTemporalesSolicitud = {
    nombre,
    cedula,
    estado_civil: estadoCivil as DatosTemporalesSolicitud['estado_civil'],
    profesion,
    domicilio,
    ...(telefono ? { telefono } : {}),
  };

  const { error: updErr } = await sb
    .from('solicitudes_actualizacion')
    .update({
      datos_temporales: datosTemporales,
      url_cedula: pathCedula,
      url_personeria: pathPersoneria,
      estado: 'DATOS_RECIBIDOS',
      respondida_en: new Date().toISOString(),
    })
    .eq('id', solicitud.id)
    .eq('estado', 'ENVIADA'); // compare-and-swap: no pisar un envío concurrente/ya procesado

  if (updErr)
    return NextResponse.json({ error: `Error al guardar: ${updErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verificar tipos y build**

Run: `npx tsc --noEmit` y `npm run build` — esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/actualizar-perfil/[token]/route.ts"
git commit -m "feat(auditoria-legal): API del portal público (validar token + recibir formulario)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Backend — aprobar/rechazar solicitud

**Files:**

- Create: `src/app/api/auditoria-legal/solicitudes-actualizacion/[id]/route.ts`

- [ ] **Step 1: GET (detalle + URLs firmadas) y PATCH (aprobar/rechazar)**

```typescript
// src/app/api/auditoria-legal/solicitudes-actualizacion/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { BUCKET_EXPEDIENTES } from '@/lib/auditoria-legal/storage-expedientes';

type Params = { params: Promise<{ id: string }> };

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function checkAcceso() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email)
    return {
      ok: false as const,
      res: NextResponse.json({ error: 'No autorizado' }, { status: 401 }),
    };
  const { data: usuarioRow } = await supabase
    .from('usuarios')
    .select('id, rol')
    .ilike('email', user.email)
    .limit(1)
    .single();
  const usuario = usuarioRow as { id: string; rol: string } | null;
  if (!usuario?.id)
    return {
      ok: false as const,
      res: NextResponse.json(
        { error: 'Tu usuario no está registrado en el sistema.' },
        { status: 400 },
      ),
    };
  if (usuario.rol === 'ANALISTA_RIESGO')
    return {
      ok: false as const,
      res: NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 }),
    };
  return { ok: true as const, usuarioId: usuario.id };
}

// GET: detalle de la solicitud + URLs firmadas (5 min) para el modal de revisión.
export async function GET(_req: NextRequest, { params }: Params) {
  const check = await checkAcceso();
  if (!check.ok) return check.res;
  const { id } = await params;

  const sb = admin();
  const { data: solicitud } = await sb
    .from('solicitudes_actualizacion')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!solicitud) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });

  let urlCedula: string | null = null;
  let urlPersoneria: string | null = null;
  if (solicitud.url_cedula) {
    const { data } = await sb.storage
      .from(BUCKET_EXPEDIENTES)
      .createSignedUrl(solicitud.url_cedula, 300);
    urlCedula = data?.signedUrl ?? null;
  }
  if (solicitud.url_personeria) {
    const { data } = await sb.storage
      .from(BUCKET_EXPEDIENTES)
      .createSignedUrl(solicitud.url_personeria, 300);
    urlPersoneria = data?.signedUrl ?? null;
  }

  return NextResponse.json({
    ...solicitud,
    url_cedula_firmada: urlCedula,
    url_personeria_firmada: urlPersoneria,
  });
}

// PATCH: { accion: 'APROBAR' } hace el UPSERT en personas_legales y marca APROBADA.
//        { accion: 'RECHAZAR', nota } vuelve a ENVIADA con la nota de revisión.
export async function PATCH(req: NextRequest, { params }: Params) {
  const check = await checkAcceso();
  if (!check.ok) return check.res;
  const { id } = await params;

  let body: { accion?: 'APROBAR' | 'RECHAZAR'; nota?: string; garantia_id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const sb = admin();
  const { data: solicitud } = await sb
    .from('solicitudes_actualizacion')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!solicitud) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
  if (solicitud.estado !== 'DATOS_RECIBIDOS') {
    return NextResponse.json(
      { error: 'Esta solicitud no tiene datos pendientes de revisión.' },
      { status: 409 },
    );
  }

  if (body.accion === 'RECHAZAR') {
    if (!body.nota?.trim())
      return NextResponse.json({ error: 'Indicá el motivo del rechazo' }, { status: 400 });
    const { error } = await sb
      .from('solicitudes_actualizacion')
      .update({ estado: 'ENVIADA', nota_revision: body.nota.trim() })
      .eq('id', id)
      .eq('estado', 'DATOS_RECIBIDOS');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.accion === 'APROBAR') {
    const datos = solicitud.datos_temporales as {
      nombre: string;
      cedula: string;
      estado_civil: string;
      profesion: string;
      domicilio: string;
      telefono?: string;
    } | null;
    if (!datos)
      return NextResponse.json(
        { error: 'La solicitud no tiene datos capturados.' },
        { status: 409 },
      );

    const { error: upsertErr } = await sb.from('personas_legales').upsert(
      {
        cedula: datos.cedula,
        nombre: datos.nombre.toUpperCase(),
        estado_civil: datos.estado_civil,
        profesion: datos.profesion,
        domicilio: datos.domicilio,
        ...(datos.telefono ? { telefono: datos.telefono } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'cedula' },
    );
    if (upsertErr)
      return NextResponse.json(
        { error: `Error al guardar la persona: ${upsertErr.message}` },
        { status: 500 },
      );

    const { error: updErr } = await sb
      .from('solicitudes_actualizacion')
      .update({
        estado: 'APROBADA',
        aprobada_por: check.usuarioId,
        aprobada_en: new Date().toISOString(),
        ...(body.garantia_id ? { garantia_id: body.garantia_id } : {}),
      })
      .eq('id', id)
      .eq('estado', 'DATOS_RECIBIDOS');
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, datos });
  }

  return NextResponse.json({ error: 'accion inválida' }, { status: 400 });
}
```

- [ ] **Step 2: Verificar tipos y build**

Run: `npx tsc --noEmit` y `npm run build` — esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/auditoria-legal/solicitudes-actualizacion/[id]/route.ts"
git commit -m "feat(auditoria-legal): aprobar/rechazar solicitud de actualización

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Middleware — permitir la ruta pública del portal

**Files:**

- Modify: `src/middleware.ts`

**IMPORTANTE:** hoy `middleware.ts` redirige a `/login` CUALQUIER ruta que no empiece con `/login` o `/auth` — sin este cambio, `/actualizar-perfil/[token]` rebota a login y el portal público nunca funciona. Es un cambio necesario y deliberado al modelo de autenticación de toda la app, no un efecto secundario — avisar a Jeffrey al terminar esta tarea.

- [ ] **Step 1: Agregar `/actualizar-perfil` a las rutas públicas**

```typescript
const { pathname } = request.nextUrl;
const isPublic =
  pathname.startsWith('/login') ||
  pathname.startsWith('/auth') ||
  pathname.startsWith('/actualizar-perfil');
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit` — esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(auditoria-legal): permite /actualizar-perfil como ruta pública sin login

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Portal público — página y formulario con compresión

**Files:**

- Create: `src/app/actualizar-perfil/[token]/page.tsx`
- Create: `src/app/actualizar-perfil/[token]/formulario-actualizacion.tsx`

- [ ] **Step 1: Página (Server Component, fuera de `(app)`)**

```typescript
// src/app/actualizar-perfil/[token]/page.tsx
import FormularioActualizacion from './formulario-actualizacion'
import type { TokenValidoResponse } from '@/types/actualizacion-perfil'

export default async function ActualizarPerfilPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const res = await fetch(`${base}/api/actualizar-perfil/${token}`, { cache: 'no-store' })
  const data = await res.json()

  return (
    <div style={{ minHeight: '100vh', background: '#EEF2F7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#003B5C' }}>Cofersa S.A.</p>
          <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#003B5C', margin: '4px 0 0' }}>Actualización de Perfil</h1>
        </div>
        {res.ok && (data as TokenValidoResponse).valido ? (
          <FormularioActualizacion token={token} data={data as TokenValidoResponse} />
        ) : (
          <div style={{ background: 'white', borderRadius: '16px', padding: '32px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626' }}>Este enlace ya no es válido</p>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
              Puede haber vencido o ya haberse utilizado. Contactá a tu analista de crédito para solicitar uno nuevo.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Formulario cliente con compresión**

```typescript
// src/app/actualizar-perfil/[token]/formulario-actualizacion.tsx
'use client'

import { useState } from 'react'
import imageCompression from 'browser-image-compression'
import { ESTADO_CIVIL_OPCIONES } from '@/types/auditoria-legal'
import type { TokenValidoResponse } from '@/types/actualizacion-perfil'

const MAX_MB_PDF = 3
const INPUT = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition'
const LABEL = 'block text-[11px] font-bold text-gray-500 uppercase mb-1'

export default function FormularioActualizacion({ token, data }: { token: string; data: TokenValidoResponse }) {
  const previos = data.datos_previos
  const [nombre, setNombre] = useState(previos?.nombre ?? '')
  const [cedula, setCedula] = useState(previos?.cedula ?? '')
  const [estadoCivil, setEstadoCivil] = useState(previos?.estado_civil ?? '')
  const [profesion, setProfesion] = useState(previos?.profesion ?? '')
  const [domicilio, setDomicilio] = useState(previos?.domicilio ?? '')
  const [telefono, setTelefono] = useState(previos?.telefono ?? '')
  const [cedulaFile, setCedulaFile] = useState<File | null>(null)
  const [personeriaFile, setPersoneriaFile] = useState<File | null>(null)
  const [comprimiendo, setComprimiendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState(false)

  async function onCedulaFile(f: File | null) {
    if (!f) { setCedulaFile(null); return }
    setComprimiendo(true); setError('')
    try {
      const comprimido = await imageCompression(f, { maxSizeMB: 0.8, maxWidthOrHeight: 1920, useWebWorker: true })
      setCedulaFile(comprimido)
    } catch {
      setError('No se pudo procesar la imagen de la cédula. Probá con otra foto.')
    } finally {
      setComprimiendo(false)
    }
  }

  function onPersoneriaFile(f: File | null) {
    if (f && f.size > MAX_MB_PDF * 1024 * 1024) {
      setError(`El PDF de personería supera ${MAX_MB_PDF}MB. Escaneá en menor resolución.`)
      return
    }
    setPersoneriaFile(f)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!nombre.trim() || !cedula.trim() || !estadoCivil || !profesion.trim() || !domicilio.trim()) {
      setError('Completá todos los campos requeridos.'); return
    }
    if (!cedulaFile) { setError('Adjuntá la imagen de tu cédula.'); return }
    if (data.tipo_persona === 'JURIDICA' && !personeriaFile) { setError('Adjuntá la certificación de personería jurídica.'); return }

    setEnviando(true)
    try {
      const form = new FormData()
      form.append('nombre', nombre.toUpperCase())
      form.append('cedula', cedula.trim())
      form.append('estado_civil', estadoCivil)
      form.append('profesion', profesion.trim())
      form.append('domicilio', domicilio.trim())
      if (telefono.trim()) form.append('telefono', telefono.trim())
      form.append('cedula_file', cedulaFile)
      if (personeriaFile) form.append('personeria_file', personeriaFile)

      const res = await fetch(`/api/actualizar-perfil/${token}`, { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al enviar la información')
      setEnviado(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center">
        <p className="text-[15px] font-bold text-green-600">¡Recibimos tu información!</p>
        <p className="text-[12px] text-gray-500 mt-2">Un analista la va a revisar. Gracias por completar tu actualización de perfil.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 space-y-3">
      {data.nota_revision && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
          Su envío anterior requiere corrección: <b>{data.nota_revision}</b>. Por favor actualice los datos o adjuntos solicitados.
        </div>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div>
        <label className={LABEL}>Nombre Completo *</label>
        <input value={nombre} onChange={e => setNombre(e.target.value.toUpperCase())} className={`${INPUT} uppercase`} />
      </div>
      <div>
        <label className={LABEL}>Cédula *</label>
        <input value={cedula} onChange={e => setCedula(e.target.value)} className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Estado Civil *</label>
        <select value={estadoCivil} onChange={e => setEstadoCivil(e.target.value)} className={`${INPUT} bg-white`}>
          <option value="">Seleccionar...</option>
          {ESTADO_CIVIL_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <label className={LABEL}>Profesión *</label>
        <input value={profesion} onChange={e => setProfesion(e.target.value)} className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Domicilio *</label>
        <input value={domicilio} onChange={e => setDomicilio(e.target.value)} className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Teléfono (opcional)</label>
        <input value={telefono} onChange={e => setTelefono(e.target.value)} className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Foto de su Cédula *</label>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => onCedulaFile(e.target.files?.[0] ?? null)} className="text-[13px]" />
        {comprimiendo && <p className="text-[11px] text-gray-400 mt-1">Procesando imagen...</p>}
      </div>
      {data.tipo_persona === 'JURIDICA' && (
        <div>
          <label className={LABEL}>Certificación de Personería Jurídica (PDF) *</label>
          <input type="file" accept="application/pdf" onChange={e => onPersoneriaFile(e.target.files?.[0] ?? null)} className="text-[13px]" />
        </div>
      )}
      <button type="submit" disabled={enviando || comprimiendo}
        className="w-full rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
        style={{ background: '#009ee3' }}>
        {enviando ? 'Enviando...' : 'Enviar Información'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Verificar tipos y build**

Run: `npx tsc --noEmit` y `npm run build` — esperado: sin errores.

- [ ] **Step 4: Verificación visual (Claude puede hacerla — no requiere login)**

Usar `preview_start` con la URL del portal en desarrollo (`npm run dev`), navegar a un token real creado a mano en la base de pruebas (o insertado manualmente vía `execute_sql` para probar), confirmar que el formulario carga, que el banner de `nota_revision` aparece cuando corresponde, y que el campo de personería sólo se muestra para `JURIDICA`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/actualizar-perfil/[token]/page.tsx" "src/app/actualizar-perfil/[token]/formulario-actualizacion.tsx"
git commit -m "feat(auditoria-legal): portal público de actualización de perfil

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Modal "Solicitar Actualización" (con botón Copiar link)

**Files:**

- Create: `src/app/(app)/auditoria-legal/garantias/ModalSolicitarActualizacion.tsx`

- [ ] **Step 1: Modal**

```typescript
// src/app/(app)/auditoria-legal/garantias/ModalSolicitarActualizacion.tsx
'use client'

import { useState } from 'react'
import { X, Mail, Loader2, Copy, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { asuntoAuditoriaAnual } from '@/lib/auditoria-legal/email-actualizacion-perfil'

export interface ModalSolicitarActualizacionProps {
  contribuyente: string
  clienteNombre: string
  correoSugerido: string
  onClose: () => void
  onEnviado: () => void
}

export default function ModalSolicitarActualizacion({ contribuyente, clienteNombre, correoSugerido, onClose, onEnviado }: ModalSolicitarActualizacionProps) {
  const [correo, setCorreo] = useState(correoSugerido)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function enviar() {
    if (!correo.trim()) { setError('Indicá un correo de destino'); return }
    setEnviando(true); setError('')
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/auditoria-legal/solicitudes-actualizacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contribuyente, cliente_nombre: clienteNombre, correo_destino: correo.trim(),
          providerToken: session?.provider_token ?? null,
          providerRefreshToken: session?.provider_refresh_token ?? null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al crear la solicitud')
      setLink(json.link as string)
      if (!json.email_sent) setError(`La solicitud se creó, pero el correo no se pudo enviar — ${json.email_error ?? ''}. Podés copiar el link y enviarlo manualmente.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  function copiarLink() {
    if (!link) return
    navigator.clipboard.writeText(link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><Mail size={16} /> Solicitar Actualización</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <p className="text-[12.5px] text-gray-600">
            Se enviará el correo <b>&ldquo;{asuntoAuditoriaAnual()}&rdquo;</b> a <b>{clienteNombre}</b> con un enlace
            válido por 7 días para completar su expediente.
          </p>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Correo de destino</label>
            <input value={correo} onChange={e => setCorreo(e.target.value)} disabled={!!link}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50" />
          </div>
          {link && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-gray-500 truncate">{link}</span>
              <button type="button" onClick={copiarLink} className="shrink-0 text-[11px] font-semibold text-[#009ee3] hover:underline inline-flex items-center gap-1">
                {copiado ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
              </button>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            {link ? (
              <button onClick={onEnviado} className="px-4 py-2 text-sm font-bold text-white rounded-lg" style={{ background: '#009ee3' }}>Listo</button>
            ) : (
              <>
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancelar</button>
                <button onClick={enviar} disabled={enviando} className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60 inline-flex items-center gap-2" style={{ background: '#009ee3' }}>
                  {enviando ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Enviar Solicitud
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit` — esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/auditoria-legal/garantias/ModalSolicitarActualizacion.tsx"
git commit -m "feat(auditoria-legal): modal para solicitar actualización de perfil

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Modal "Revisar Datos Recibidos" (aprobar/rechazar)

**Files:**

- Create: `src/app/(app)/auditoria-legal/garantias/ModalRevisarActualizacion.tsx`

- [ ] **Step 1: Modal de revisión**

```typescript
// src/app/(app)/auditoria-legal/garantias/ModalRevisarActualizacion.tsx
'use client'

import { useState, useEffect } from 'react'
import { X, FileText, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { ESTADO_CIVIL_OPCIONES } from '@/types/auditoria-legal'
import type { DatosTemporalesSolicitud } from '@/types/actualizacion-perfil'

export interface ModalRevisarActualizacionProps {
  solicitudId: number
  onClose: () => void
  /** Se llama con los datos aprobados -- el padre abre ModalEmitirPagare pre-llenado. */
  onAprobado: (datos: DatosTemporalesSolicitud) => void
}

interface SolicitudDetalle {
  id: number
  cliente_nombre: string
  tipo_persona: 'FISICA' | 'JURIDICA'
  datos_temporales: DatosTemporalesSolicitud | null
  url_cedula_firmada: string | null
  url_personeria_firmada: string | null
}

export default function ModalRevisarActualizacion({ solicitudId, onClose, onAprobado }: ModalRevisarActualizacionProps) {
  const [data, setData] = useState<SolicitudDetalle | null>(null)
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [rechazando, setRechazando] = useState(false)
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/auditoria-legal/solicitudes-actualizacion/${solicitudId}`)
      .then(r => r.json())
      .then(j => setData(j as SolicitudDetalle))
      .catch(() => setError('Error al cargar la solicitud'))
      .finally(() => setCargando(false))
  }, [solicitudId])

  async function aprobar() {
    if (!data?.datos_temporales) return
    setProcesando(true); setError('')
    try {
      const res = await fetch(`/api/auditoria-legal/solicitudes-actualizacion/${solicitudId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'APROBAR' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al aprobar')
      onAprobado(data.datos_temporales)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProcesando(false)
    }
  }

  async function rechazar() {
    if (!nota.trim()) { setError('Indicá el motivo del rechazo'); return }
    setProcesando(true); setError('')
    try {
      const res = await fetch(`/api/auditoria-legal/solicitudes-actualizacion/${solicitudId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'RECHAZAR', nota: nota.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al rechazar')
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-900">Revisar Datos Recibidos</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          {cargando ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
          ) : !data?.datos_temporales ? (
            <p className="text-sm text-red-600">No se pudo cargar la solicitud.</p>
          ) : (
            <>
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                <Campo label="Nombre" valor={data.datos_temporales.nombre} />
                <Campo label="Cédula" valor={data.datos_temporales.cedula} />
                <Campo label="Estado Civil" valor={data.datos_temporales.estado_civil} />
                <Campo label="Profesión" valor={data.datos_temporales.profesion} />
                <Campo label="Domicilio" valor={data.datos_temporales.domicilio} />
                {data.datos_temporales.telefono && <Campo label="Teléfono" valor={data.datos_temporales.telefono} />}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                {data.url_cedula_firmada && (
                  <a href={data.url_cedula_firmada} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 overflow-hidden block">
                    <img src={data.url_cedula_firmada} alt="Cédula" className="w-full h-32 object-cover" />
                    <p className="text-[10px] text-center py-1 text-gray-500">Ver cédula completa</p>
                  </a>
                )}
                {data.url_personeria_firmada && (
                  <a href={data.url_personeria_firmada} target="_blank" rel="noopener noreferrer"
                    className="rounded-lg border border-slate-200 flex flex-col items-center justify-center h-32 gap-2 text-gray-500 hover:bg-slate-50">
                    <FileText size={24} />
                    <span className="text-[11px]">Ver personería (PDF)</span>
                  </a>
                )}
              </div>

              {!rechazando ? (
                <div className="flex justify-end gap-2 pt-3">
                  <button onClick={() => setRechazando(true)} disabled={procesando}
                    className="px-4 py-2 text-sm font-semibold text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-60 inline-flex items-center gap-1.5">
                    <XCircle size={14} /> Rechazar
                  </button>
                  <button onClick={aprobar} disabled={procesando}
                    className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60 inline-flex items-center gap-1.5" style={{ background: '#16a34a' }}>
                    {procesando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Aprobar y Generar Pagaré
                  </button>
                </div>
              ) : (
                <div className="space-y-2 pt-2">
                  <label className="block text-[11px] font-bold text-gray-500 uppercase">Motivo del rechazo</label>
                  <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Ej: la foto de la cédula no es legible" />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setRechazando(false)} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancelar</button>
                    <button onClick={rechazar} disabled={procesando} className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60" style={{ background: '#dc2626' }}>
                      Confirmar Rechazo
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-gray-700">{valor}{label === 'Estado Civil' && !ESTADO_CIVIL_OPCIONES.includes(valor as never) ? ' (valor inesperado)' : ''}</p>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit` — esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/auditoria-legal/garantias/ModalRevisarActualizacion.tsx"
git commit -m "feat(auditoria-legal): modal de revisión y aprobación de actualización de perfil

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Extender `ModalEmitirPagare` para aceptar datos prellenados

**Files:**

- Modify: `src/app/(app)/auditoria-legal/garantias/ModalEmitirPagare.tsx`

- [ ] **Step 1: Nuevo prop opcional + efecto de pre-llenado**

Agregar a `ModalEmitirPagareProps` (después de `clientePreseleccionado`):

```typescript
  /** Si viene (desde la aprobación del portal de actualización), pre-llena el
   *  nombre y cédula del representante legal y dispara el autocompletado por
   *  cédula contra personas_legales (ya se hizo el UPSERT antes de abrir este
   *  modal) -- sólo aplica al camino jurídico, la física ya se autocompleta
   *  sola por contribuyente (ver el useEffect existente más abajo). */
  representanteLegalPrellenado?: { nombre: string; cedula: string }
```

Agregar `representanteLegalPrellenado` a la firma de la función:

```typescript
export default function ModalEmitirPagare({ onClose, onExito, clientePreseleccionado, representanteLegalPrellenado }: ModalEmitirPagareProps) {
```

Después del `useEffect` existente que llama a `seleccionar(clientePreseleccionado)` (el que tiene el comentario "Cliente ya elegido desde el tab..."), agregar:

```typescript
// Pre-llenado desde la aprobación del portal de actualización (Spec ago
// 2026): sólo dispara cuando ya hay un cliente resuelto (sel) y el
// contribuyente resultó JURÍDICA -- para física el useEffect de arriba ya
// autocompleta solo por contribuyente. Se dispara una sola vez.
useEffect(() => {
  if (!representanteLegalPrellenado || !sel) return;
  setRepresentanteNombre(representanteLegalPrellenado.nombre);
  setRepresentanteCedula(representanteLegalPrellenado.cedula);
  buscarRepresentantePorCedulaDirecta(representanteLegalPrellenado.cedula);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [sel, representanteLegalPrellenado]);
```

**Nota para quien implemente:** `buscarRepresentantePorCedula()` ya existe pero lee la cédula desde el estado `representanteCedula` (que en ese punto ya se acaba de setear arriba, pero React no garantiza que el estado ya esté actualizado dentro del mismo efecto) — la forma segura es extraer la lógica de esa función a una variante que reciba la cédula por parámetro. Refactorizar así:

```typescript
async function buscarRepresentantePorCedulaDirecta(cedulaCruda: string) {
  const seq = ++representanteSeqRef.current;
  const cedula = cedulaCruda.trim();
  if (!cedula || !cedulaValida(cedula)) return;
  const cedulaNormalizada = normalizarCedula(cedula);
  const supabase = createClient();
  const { data: p } = await supabase
    .from('personas_legales')
    .select('*')
    .eq('cedula', cedulaNormalizada)
    .maybeSingle();
  if (seq !== representanteSeqRef.current) return;
  if (p) {
    const persona = p as PersonaLegal;
    setRepresentanteDatos({
      estadoCivil: persona.estado_civil ?? '',
      profesion: persona.profesion ?? '',
      provincia: '',
      canton: '',
      distrito: '',
      senas: persona.domicilio ?? '',
    });
    setRepresentanteAutocompletado(true);
  }
}

async function buscarRepresentantePorCedula() {
  return buscarRepresentantePorCedulaDirecta(representanteCedula);
}
```

Reemplazar la función `buscarRepresentantePorCedula` existente por estas dos.

- [ ] **Step 2: Verificar tipos y build**

Run: `npx tsc --noEmit` y `npm run build` — esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/auditoria-legal/garantias/ModalEmitirPagare.tsx"
git commit -m "feat(auditoria-legal): ModalEmitirPagare acepta representante prellenado

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Integrar todo en `garantias-cliente.tsx` (tab Sin Garantía)

**Files:**

- Modify: `src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx`

- [ ] **Step 1: Estado y fetch de solicitudes activas**

Importar (junto al resto de imports del componente):

```typescript
import { Mail } from 'lucide-react'; // agregar a la línea de imports de lucide-react ya existente
import ModalSolicitarActualizacion from './ModalSolicitarActualizacion';
import ModalRevisarActualizacion from './ModalRevisarActualizacion';
import { ESTADO_SOLICITUD_LABEL, ESTADO_SOLICITUD_BADGE } from '@/lib/auditoria-legal/catalogo';
import type { SolicitudActualizacion } from '@/types/actualizacion-perfil';
```

Después de la declaración de `clientesSinGarantia`, agregar:

```typescript
// Solicitudes de actualización activas por contribuyente (Spec ago 2026) --
// fetch directo, sin tocar fn_garantias_clientes_sin_garantia (RLS ya
// permite SELECT a personal activo, mismo patrón que vendedoresLista).
const [solicitudesPorContribuyente, setSolicitudesPorContribuyente] = useState<
  Map<string, SolicitudActualizacion>
>(new Map());
const [solicitandoPara, setSolicitandoPara] = useState<ClienteSinGarantiaRow | null>(null);
const [revisandoId, setRevisandoId] = useState<number | null>(null);

const fetchSolicitudes = useCallback(async (contribuyentes: string[]) => {
  if (contribuyentes.length === 0) {
    setSolicitudesPorContribuyente(new Map());
    return;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from('solicitudes_actualizacion')
    .select(
      'id, contribuyente, cliente_nombre, tipo_persona, estado, token_expira_en, datos_temporales, url_cedula, url_personeria, enviada_en, respondida_en, aprobada_en, garantia_id, nota_revision',
    )
    .in('contribuyente', contribuyentes)
    .neq('estado', 'APROBADA'); // ya no aporta nada a la vista de Sin Garantía
  setSolicitudesPorContribuyente(
    new Map(((data ?? []) as SolicitudActualizacion[]).map((s) => [s.contribuyente, s])),
  );
}, []);

useEffect(() => {
  if (clientesSinGarantia) fetchSolicitudes(clientesSinGarantia.map((c) => c.contribuyente));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [clientesSinGarantia]);
```

- [ ] **Step 2: Botón/badge en la columna Acciones del tab "Sin Garantía"**

Localizar la celda de Acciones dentro de `sinGarantiaPagina.map(c => (...))` (el `<td>` que hoy sólo tiene el botón "Registrar / Emitir") y reemplazar su contenido:

```typescript
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => abrirRegistroDesdeSinGarantia(c)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors hover:opacity-90"
                          style={{ background: '#dc2626', border: '1px solid #dc2626', color: '#fff' }}
                        >
                          <Plus size={12} /> Registrar / Emitir
                        </button>
                        {(() => {
                          const solicitud = solicitudesPorContribuyente.get(c.contribuyente)
                          if (!solicitud) {
                            return (
                              <button
                                type="button"
                                onClick={() => setSolicitandoPara(c)}
                                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors hover:bg-slate-50"
                                style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#475569' }}
                              >
                                <Mail size={12} /> Solicitar Actualización
                              </button>
                            )
                          }
                          if (solicitud.estado === 'DATOS_RECIBIDOS') {
                            return (
                              <button
                                type="button"
                                onClick={() => setRevisandoId(solicitud.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors hover:opacity-90"
                                style={{ background: '#009ee3', border: '1px solid #009ee3', color: '#fff' }}
                              >
                                Revisar Datos Recibidos
                              </button>
                            )
                          }
                          const badge = ESTADO_SOLICITUD_BADGE[solicitud.estado]
                          return (
                            <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', background: badge.bg, color: badge.text, whiteSpace: 'nowrap' }}>
                              {ESTADO_SOLICITUD_LABEL[solicitud.estado]}
                            </span>
                          )
                        })()}
                      </div>
                    </td>
```

- [ ] **Step 3: Wiring de los 2 modales nuevos + apertura pre-llenada de `ModalEmitirPagare`**

Agregar estado para el pre-llenado (junto a `emitiendoNueva`):

```typescript
const [representantePrellenado, setRepresentantePrellenado] = useState<{
  nombre: string;
  cedula: string;
} | null>(null);
```

Al final del render, junto a los demás modales condicionales, agregar:

```typescript
      {solicitandoPara && (
        <ModalSolicitarActualizacion
          contribuyente={solicitandoPara.contribuyente}
          clienteNombre={solicitandoPara.cliente_nombre}
          correoSugerido=""
          onClose={() => setSolicitandoPara(null)}
          onEnviado={() => { setSolicitandoPara(null); fetchSolicitudes((clientesSinGarantia ?? []).map(c => c.contribuyente)) }}
        />
      )}

      {revisandoId && (
        <ModalRevisarActualizacion
          solicitudId={revisandoId}
          onClose={() => { setRevisandoId(null); fetchSolicitudes((clientesSinGarantia ?? []).map(c => c.contribuyente)) }}
          onAprobado={datos => {
            const solicitud = [...solicitudesPorContribuyente.values()].find(s => s.id === revisandoId)
            setRevisandoId(null)
            if (solicitud) {
              setClienteParaRegistrar({ contribuyente: solicitud.contribuyente, cliente_nombre: solicitud.cliente_nombre, n_codigos: 1 })
              if (solicitud.tipo_persona === 'JURIDICA') setRepresentantePrellenado({ nombre: datos.nombre, cedula: datos.cedula })
              setEmitiendoNueva(true)
            }
            fetchSolicitudes((clientesSinGarantia ?? []).map(c => c.contribuyente))
          }}
        />
      )}
```

Modificar el bloque existente de `ModalEmitirPagare` para pasar el nuevo prop y limpiar el estado al cerrar/salir:

```typescript
      {emitiendoNueva && (
        <ModalEmitirPagare
          clientePreseleccionado={clienteParaRegistrar ?? undefined}
          representanteLegalPrellenado={representantePrellenado ?? undefined}
          onClose={() => { setEmitiendoNueva(false); setClienteParaRegistrar(null); setRepresentantePrellenado(null) }}
          onExito={async nuevaId => {
            setEmitiendoNueva(false)
            setClienteParaRegistrar(null)
            setRepresentantePrellenado(null)
            await fetchData({ silent: true })
            await fetchSinGarantia()
            router.push(`/pagare/${nuevaId}`)
          }}
        />
      )}
```

- [ ] **Step 4: Verificar tipos y build**

Run: `npx tsc --noEmit` y `npm run build` — esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx"
git commit -m "feat(auditoria-legal): integra el portal de actualización en el tab Sin Garantía

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Verificación final, lint y deploy

**Files:** ninguno (sólo comandos)

- [ ] **Step 1: Chequeo completo de tipos**

Run: `npx tsc --noEmit` — esperado: 0 errores.

- [ ] **Step 2: Build de producción**

Run: `npm run build` — esperado: build exitoso, incluida la ruta nueva `/actualizar-perfil/[token]`.

- [ ] **Step 3: Lint**

Run: `npm run lint` — esperado: 0 errores nuevos (comparar contra el baseline del repo, igual que en el trabajo anterior de Garantías — puede haber warnings preexistentes no relacionados).

- [ ] **Step 4: Verificación visual del portal público**

Con `npm run dev` + `preview_start`, insertar una solicitud de prueba a mano (`execute_sql` contra un contribuyente de prueba) y navegar a `/actualizar-perfil/<token-de-prueba>` para confirmar el formulario completo, sin necesidad de login.

- [ ] **Step 5: Aviso de deploy**

Avisar a Jeffrey que hace falta un `git push origin master` para desplegar, y pedirle que confirme visualmente en producción:

1. Que "Solicitar Actualización" en Sin Garantía envía el correo y el link funciona.
2. Que completar el formulario (física y jurídica) sube los archivos y pasa a "Datos Recibidos".
3. Que "Revisar Datos Recibidos" → "Aprobar y Generar Pagaré" abre `ModalEmitirPagare` con el representante ya precargado (caso jurídica) y sigue el flujo normal.
4. Que "Rechazar" con una nota hace que el portal muestre el banner de corrección al volver a entrar con el mismo link.
5. Que un contribuyente con solicitud activa NO puede recibir una segunda "Solicitar Actualización" hasta que la primera se apruebe/rechace/venza.

---

## Self-review (Claude, antes de entregar el plan)

- **Cobertura del spec:** los 6 puntos aprobados + el ajuste de banner de `nota_revision` están cubiertos (Tasks 1-12). Las 2 mejoras que agregué (expiración por cron, botón copiar link) están explícitas al inicio del plan, no escondidas. ✅
- **Placeholders:** sin “TBD” — el único punto marcado explícitamente como "nota para quien implemente" (Task 4, helper de Gmail raw; Task 11, refactor de `buscarRepresentantePorCedula`) tiene código completo de referencia, no una descripción vaga — se marca así porque puede haber un helper ya existente en el repo que convenga reusar en vez de duplicar, y quien ejecute la tarea debe verificarlo primero (mismo criterio que "leer el archivo completo antes de modificarlo").
- **Consistencia de nombres:** `solicitudes_actualizacion`, `personas_legales`, `ESTADO_SOLICITUD_LABEL/BADGE`, `SolicitudActualizacion`, `DatosTemporalesSolicitud`, `representanteLegalPrellenado` se usan de forma consistente en todas las tasks donde aparecen (migración, tipos, backend, frontend).
- **Riesgo más alto del plan:** Task 7 (middleware) — es el único cambio a un archivo de seguridad transversal a toda la app. Aislado en su propia tarea con su propio commit a propósito, para poder revertirlo solo si hiciera falta.
