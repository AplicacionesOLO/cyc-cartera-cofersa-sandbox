# Portal de Actualización de Perfil + Campaña de Auditoría Legal 2026

**Fecha:** 19 de agosto 2026
**Módulo:** `Auditoría y Control Legal → Garantías` (tab "Sin Garantía") + nueva ruta pública `/actualizar-perfil/[token]`
**Estado:** Aprobado por Jeffrey Díaz (6 puntos, 100%) — pendiente de plan de implementación

## Contexto

Cofersa está por lanzar una campaña de Auditoría Anual de Control Interno y Normativa Comercial 2026 para completar los expedientes legales de clientes que hoy aparecen en el tab **"Sin Garantía"** (`fn_garantias_clientes_sin_garantia`). El objetivo: pedirles por correo, mediante un link temporal sin login, que suban su cédula (y personería jurídica si son empresa) y confirmen sus datos de representante legal, para que el analista pueda aprobar y generar el pagaré directamente desde esos datos.

**Corrección importante de una iteración anterior de este spec:** se asumió inicialmente que no existían tablas de personas — es falso. `personas_legales` (cédula como PK) ya existe en producción desde la migración `20260730_auditoria_legal_fase1_garantias.sql` y ya se usa para autocompletar deudor/representante/fiador entre garantías distintas (`POST /api/auditoria-legal/garantias/[id]/pagare`, `onConflict: 'cedula'`). Este módulo se construye reutilizando esa tabla, no una nueva.

## Decisiones ya tomadas (no reabrir)

| Decisión                   | Elección                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Alcance del portal         | Física y jurídica, con documentos distintos (física: sólo cédula de identidad; jurídica: cédula del representante + personería)     |
| Integración con aprobación | Reusa `ModalEmitirPagare` pre-llenado — no se duplica lógica de negocio                                                             |
| Llave de la solicitud      | `contribuyente` (cédula), igual que `garantias` — no un `cliente_id` nuevo                                                          |
| Tablas de personas/cliente | Reutilizar `personas_legales` (UPSERT por cédula) y `maestro_clientes` vía `fn_actualizar_contacto_cliente()` — no crear duplicados |
| WhatsApp                   | Fuera de alcance (bot pausado, sin worker 24/7) — sólo correo con link                                                              |
| Diseño visual              | Sin emoji en badges/estados — mismo sistema de colores que el resto del módulo (`CUSTODIA_BADGE`)                                   |

## 1. Modelo de datos

### Tabla nueva: `solicitudes_actualizacion`

```sql
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

-- Una sola solicitud "viva" por contribuyente a la vez.
create unique index solicitudes_actualizacion_contribuyente_activa_idx
  on public.solicitudes_actualizacion (contribuyente)
  where estado in ('ENVIADA','DATOS_RECIBIDOS');

alter table public.solicitudes_actualizacion enable row level security;
-- Mismas políticas que personas_legales: sólo personal activo, nunca el portal público
-- (el portal usa service role vía API routes, ver §2).
create policy solicitudes_actualizacion_select_activos on public.solicitudes_actualizacion
  for select using (fn_es_usuario_activo());
create policy solicitudes_actualizacion_insert_activos on public.solicitudes_actualizacion
  for insert with check (fn_es_usuario_activo());
create policy solicitudes_actualizacion_update_activos on public.solicitudes_actualizacion
  for update using (fn_es_usuario_activo());

create trigger solicitudes_actualizacion_updated_at
  before update on public.solicitudes_actualizacion
  for each row execute function update_updated_at();
```

`tipo_persona` se deriva de `esPersonaJuridica(contribuyente)` al crear la solicitud — determina qué documentos pide el portal (personería sólo si `JURIDICA`).

`datos_temporales` guarda exactamente lo que el cliente cargó en el formulario (`nombre`, `cedula`, `estado_civil`, `profesion`, `domicilio`, `telefono`) — es un borrador hasta que el analista aprueba; sólo en la aprobación se hace el UPSERT real contra `personas_legales`.

### Reutilización de `personas_legales` (sin cambios de esquema)

Al aprobar (§4), el servidor hace:

```typescript
await supabase.from('personas_legales').upsert(
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
```

Mismo patrón exacto que ya usa `pagare/route.ts` — no se toca esa tabla ni se le agregan columnas.

### Reutilización de `maestro_clientes` (contacto CxP)

Si el cliente actualiza teléfono/correo de contacto en el portal, se llama a `fn_actualizar_contacto_cliente()` (ya existe, ya respeta el trigger que protege ediciones manuales del GAS) — no se escribe directo a `maestro_clientes` desde este flujo.

## 2. Seguridad del token

- Generación: `crypto.randomBytes(32).toString('hex')` en el servidor, al confirmar el envío desde el modal "Solicitar Actualización".
- Persistencia: sólo se guarda `sha256(token)` en `token_hash`. El token crudo va únicamente en la URL del correo (`/actualizar-perfil/<token>`) — no se vuelve a mostrar en la UI ni se loguea.
- Expiración: `token_expira_en = now() + 7 días`, fijada al crear la solicitud.
- Uso único: el portal sólo acepta escritura mientras `estado = 'ENVIADA'`. Al pasar a `DATOS_RECIBIDOS` el mismo token ya no permite reenviar el formulario (lo valida el servidor, no el cliente).
- Validación: toda ruta del portal (`GET` para cargar el formulario, `POST` para enviarlo) recibe el token crudo, lo hashea, y busca `token_hash` con `estado='ENVIADA'` y `token_expira_en > now()` usando el **cliente admin (service role)** — el portal público nunca usa el cliente Supabase con anon key contra esta tabla (la RLS de la tabla exige `fn_es_usuario_activo()`, que un visitante sin sesión nunca cumple).
- Token inválido/vencido/ya usado → mismo mensaje genérico ("Este enlace ya no es válido") sin distinguir el motivo, para no dar pistas de enumeración.

## 3. Storage y compresión

- Bucket nuevo: `expedientes-clientes`, **privado** (`public: false`), a diferencia de `comprobantes-pago`.
- Ruta de archivo: `expedientes-clientes/<contribuyente>/<tipo_doc>_<timestamp>.<ext>` — `tipo_doc` es `cedula` o `personeria`.
- El analista ve los archivos en el modal de revisión vía `createSignedUrl` (expiración corta, ej. 5 minutos) generada al abrir el modal — nunca un link público permanente.
- Compresión de imágenes (cédula, JPG/PNG/WebP): librería nueva `browser-image-compression` (client-side, sin servidor), tope 800KB preservando legibilidad. Se agrega como dependencia nueva del proyecto.
- PDF de personería (sólo jurídica): sin compresión — se valida únicamente el tope de 3MB, mismo patrón que `MAX_MB` en el módulo de garantías (chequeo previo en cliente + validación real en el servidor, porque Vercel corta el body ~4.5MB antes de que el handler corra).

## 4. Flujo en `/auditoria-legal/garantias` (tab "Sin Garantía")

### Botón "Solicitar Actualización"

- Aparece en la columna Acciones del tab "Sin Garantía", sólo si el contribuyente no tiene ya una solicitud activa (`ENVIADA` o `DATOS_RECIBIDOS`).
- Abre un modal con el preview del correo (asunto + cuerpo institucional, ver §6) y el destinatario (precargado del correo en `maestro_clientes`, editable).
- Al confirmar: el servidor genera el token, crea la fila en `solicitudes_actualizacion` (`estado='ENVIADA'`), y envía el correo vía Gmail API con el mismo patrón de `resolveGmailToken` que ya usan `email-cobro`/`estado-cuenta`.

### Badge de estado por fila

Reemplaza/acompaña el botón cuando hay una solicitud activa — mismo estilo de badges de color plano que `CUSTODIA_BADGE` (sin emoji):

- `ENVIADA` → ámbar, "Actualización Enviada"
- `DATOS_RECIBIDOS` → azul, "Datos Recibidos — Pendiente de Revisión"

### Revisión y aprobación

- Con `estado='DATOS_RECIBIDOS'`, el botón cambia a **"Revisar Datos Recibidos"** → modal que muestra:
  - Los campos de `datos_temporales` (nombre, cédula, estado civil, profesión, domicilio, teléfono).
  - La imagen de cédula y (si aplica) el PDF de personería, vía URL firmada.
- Botón **"Aprobar y Generar Pagaré"**:
  1. Hace el UPSERT en `personas_legales` (§1).
  2. Marca la solicitud `estado='APROBADA'`, `aprobada_por`, `aprobada_en`.
  3. Cierra este modal y abre `ModalEmitirPagare` con `clientePreseleccionado` (contribuyente/cliente_nombre) y los campos de representante ya precargados — el resto del flujo (crear garantía, generar pagaré, despachar a vendedor) es exactamente el que ya existe hoy, sin cambios.
  4. Al terminar ese flujo, se guarda `garantia_id` en la solicitud para trazabilidad.
- Botón **"Rechazar"** (nuevo, menor — no estaba en la propuesta original de 6 puntos, se agrega porque el flujo de aprobación necesita una salida cuando los datos/documentos no son legibles o son incorrectos): vuelve el estado a `ENVIADA` y guarda el motivo en `nota_revision`, para que el cliente pueda reenviar con el mismo link (siempre que no haya vencido).

## 5. Portal público `/actualizar-perfil/[token]`

- Ruta fuera del route group `(app)` — sin Sidebar/Topbar, con el branding Cofersa (logo, colores navy/cyan) en una página simple.
- `page.tsx` (Server Component): valida el token contra `solicitudes_actualizacion` (vía API route/acción server-side con service role) antes de renderizar. Si inválido → pantalla de error genérica; si válido → pasa `tipo_persona` y datos precargados (si los hay) al formulario cliente.
- Formulario (`'use client'`):
  - Nombre completo (se fuerza a MAYÚSCULAS al tipear, igual que `representante_legal` en `ModalRegistrarGarantia`).
  - Cédula.
  - Estado civil (select, mismas 4 opciones de `ESTADO_CIVIL_OPCIONES`).
  - Profesión, Domicilio.
  - Teléfono (opcional).
  - Adjuntar cédula (imagen) — se comprime en el navegador antes de subir.
  - Adjuntar personería jurídica (PDF) — sólo si `tipo_persona === 'JURIDICA'`.
- Al enviar (`POST /api/actualizar-perfil/[token]`):
  1. Vuelve a validar el token (mismo chequeo que el GET).
  2. Sube los archivos al bucket privado (ruta de §3).
  3. Guarda `datos_temporales` + `url_cedula` + `url_personeria`, `estado='DATOS_RECIBIDOS'`, `respondida_en=now()`.
  4. Muestra pantalla de confirmación ("Recibimos tu información, un analista la va a revisar").

## 6. Correo de Auditoría Anual 2026

- Plantilla nueva (`src/lib/auditoria-legal/email-actualizacion-perfil.ts`), mismo patrón que las plantillas de correo existentes (`email-presupuesto.ts`, `email-vendedor.ts`): función que arma `asunto` + `html`.
- Tono institucional y administrativo, asunto tipo: _"Auditoría Anual de Control Interno y Normativa Comercial 2026 — Cofersa S.A."_
- Cuerpo: explica el propósito de la auditoría, incluye el link `/actualizar-perfil/<token>`, aclara la vigencia de 7 días, y usa el mismo branding (logo, navy `#003B5C`, cyan `#009ee3`) que el resto de correos del sistema.
- Envío: mismo mecanismo ya usado por `email-cobro`/`estado-cuenta` (Gmail API con OAuth del analista/coordinador que dispara la acción, vía `resolveGmailToken`).

## Manejo de errores

- Token inválido/vencido/reusado → mensaje genérico en el portal, sin filtrar el motivo exacto.
- Archivo de cédula sobre el peso tras comprimir, o PDF de personería > 3MB → error claro en el formulario antes de intentar subir (mismo patrón `MAX_MB` de garantías).
- Falla al enviar el correo tras crear la solicitud → la solicitud ya quedó creada (estado `ENVIADA`), se avisa al analista como aviso (no error bloqueante) — mismo patrón que el correo de despacho a vendedor en `ejecutarAccion`/`ENTREGAR`.
- Falla al subir a Storage desde el portal → no se marca `DATOS_RECIBIDOS`, se le pide al cliente reintentar (mismo token, sigue vigente si no venció).

## Testing / verificación

Sin test runner en el proyecto — verificación: `tsc --noEmit` limpio + `npm run build` sin errores + confirmación visual de Jeffrey (login OAuth impide que Claude verifique el portal público autenticado, pero el portal en sí no requiere login — sí se puede probar navegando directo a un token real generado en desarrollo).

Casos a confirmar manualmente:

1. Enviar solicitud a un contribuyente física y a uno jurídica — confirmar que el correo llega y el link funciona.
2. Completar el formulario como física (sin campo de personería) y como jurídica (con personería) — confirmar compresión de imagen y tope del PDF.
3. Un token vencido (>7 días) o ya usado no debe permitir reenviar el formulario.
4. Aprobar una solicitud con datos recibidos — confirmar que `ModalEmitirPagare` se abre precargado y el flujo de garantía + pagaré sigue funcionando igual que hoy.
5. Rechazar una solicitud — el cliente puede volver a enviar con el mismo link (si no venció).
