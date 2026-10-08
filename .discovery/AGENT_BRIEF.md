# Brief para agentes de migración por módulo (Supabase → AWS, estándares Intelix)

Proyecto: SIC Cofersa (Next.js 16 App Router + TypeScript). Original (SOLO LECTURA, no tocar):
`C:\Users\jalvarez\Documents\cyc-cartera-cofersa\src`. Salida (aquí se trabaja):
`C:\Users\jalvarez\Documents\cyc-cartera-cofersa\migration-output\` → `frontend/` (copia del front a
refactorizar), `backend/` (Lambda Python 3.13 hexagonal), `database/` (Aurora, ya generada y validada).

Lee también el `CLAUDE.md` del proyecto (raíz del repo): reglas de negocio, roles, fmtCRC, **NO tocar
`src/components/sidebar.tsx`**, mensajes de error visibles, etc. Esas reglas siguen vigentes.

## Objetivo de cada módulo
Eliminar TODO acceso a Supabase (`createClient`, `supabase.from/rpc/auth/storage/channel`,
`@supabase/*`, `SUPABASE_*`) y TODA API Route de Next (`src/app/api/**/route.ts`) de tu alcance,
reemplazándolos por: endpoint en API Gateway → Lambda Python (use case + repository SQL en Aurora) y,
en el front, `Page/Component → controller (hook) → xApi → HttpClient`. **Conservar la UI**: mismo JSX,
clases, textos, mensajes de error y comportamiento. Se mueve código, no se rediseña.

## Base ya construida (NO modificar; si necesitás un cambio ahí, reportalo en tu respuesta final)
Backend (`migration-output/backend/src`):
- `domain/entities/usuario.py` — `Usuario` (id, email, nombre, rol, iniciales, color, activo, telefono,
  whatsapp, tiene_cartera_asignada) + props `es_coordinador`, `es_global` (COORDINADOR|GERENCIA),
  `es_solo_lectura` (GERENCIA), `puede_gestionar_cartera`. Constantes `COORDINADOR, ANALISTA,
  ANALISTA_RIESGO, GERENCIA`.
- `domain/exceptions` — `ValidationError`(400) `UnauthorizedError`(401) `ForbiddenError`(403)
  `NotFoundError`(404) `ConflictError`(409) `BusinessRuleViolation`(422). El mensaje (`message`) llega a
  la UI como `ApiError.message`: usá los MISMOS textos de error que devolvía la API Route original.
- `application/use_cases/common.py` — `require_usuario(uow, principal)` (perfil activo por email, si no
  ForbiddenError acceso_denegado), `require_roles(u, *roles, message=)`, `require_coordinador(u, message=)`,
  `require_escritura(u)` (GERENCIA = solo lectura), `analista_scope(u, requested_email)` (global → lo
  pedido o None; resto → su propio email), `parse_uuid/parse_int/parse_optional_int/parse_number/
  parse_date/parse_optional_date/require_text/optional_text/split_emails/only_keys`, `hoy_cr()`,
  `ahora_cr()` (UTC-6).
- `application/ports/app_unit_of_work.py` — `AppUnitOfWork` con `usuarios: UsuarioDirectory` y un
  repository por módulo con el nombre del módulo: `clientes, gestiones, promesas, solicitudes, dashboard,
  reportes, presupuesto, analisis_pagos, gestion_cartera, auditoria_legal, configuracion, centro_recursos,
  notificaciones, jobs`. `UnitOfWorkFactory = Callable[[Principal|None], AppUnitOfWork]`.
- `application/ports/usuarios.py` — `UsuarioDirectory`: find_activo_by_email, find_by_id, list_activos,
  count_activos, ultima_sync_cartera, get/set_google_refresh_token.
- `application/ports/integraciones.py` — `EmailMessage(to, subject, html, cc, bcc, reply_to,
  sender_name, attachments=(EmailAttachment(filename, content_type, data: bytes),))`, `GoogleOAuth`,
  `GmailSender`, `GoogleCalendar`, `LanguageModel.complete(model=, system=, prompt=, max_tokens=)`,
  `ExternalHttp.get_json/get_text/post_json(url, ...) -> (status, body)`, `IntegrationConfig.get/require(key)`.
- `application/use_cases/mailer.py` — `UsuarioMailer.send(uow, usuario, EmailMessage)`: envía con Gmail
  en nombre del usuario usando su refresh token guardado (reemplaza resolveGmailToken + provider_token;
  el front YA NO manda providerToken/providerRefreshToken: ignorarlos si vienen).
- `application/ports/object_storage.py` — `ObjectStorage` (presign_upload, presign_download, delete,
  exists, list, put_bytes, get_bytes); `application/ports/file_storage.py: safe_key(...)`.
- `entrypoints/lambda_handlers/container.py` — `uow_factory`, `resolve_principal`, `mailer()`,
  `google_oauth()`, `calendar()`, `language_model()`, `external_http()`, `integration_config()`,
  `storage("comprobantes-pago"|"documentos-recursos"|"expedientes-clientes"|"garantias-legal")`.
- `entrypoints/lambda_handlers/router.py` — `api_router(ROUTES, authenticated=True)`.
- `infrastructure/database/postgresql/app_unit_of_work.py` — crea `uow.<modulo>` bajo demanda
  importando `infrastructure/database/postgresql/<modulo>_repository.py: Postgres<Modulo>Repository`
  (nombres EXACTOS en el dict `REPOSITORIES`: p. ej. `gestion_cartera_repository.py:
  PostgresGestionCarteraRepository`, `auditoria_legal_repository.py: PostgresAuditoriaLegalRepository`).
- Integración de secretos: claves extra en el secreto de la app (vía `container.integration_config()`):
  `google_client_id`, `google_client_secret`, `anthropic_api_key`, `bccr_token`, `bccr_email`,
  `ingesta_api_key`, `n8n_webhook_pagos_url`, `n8n_webhook_pedidos_retenidos_url`, `email_coordinador`,
  `app_url`. Valores por defecto que estaban hardcodeados en el original (p. ej. 'jdiaz@cofersa.cr',
  la URL de N8N) pueden quedar como fallback en el use case igual que en el original.
- Tests: `tests/fakes/fake_app_unit_of_work.py` — `FakeAppUnitOfWork(**repos)` (`uow.factory`),
  `FakeUsuarioDirectory.add(email, rol, nombre, **extra)`, `principal_for(usuario)`, `FakeGoogleOAuth`,
  `FakeGmail`, `FakeCalendar`, `FakeLanguageModel`, `FakeExternalHttp`, `FakeIntegrationConfig`,
  `FakeStorage`. Integración: `tests/integration/conftest.py` fixtures `uow` (`with uow() as u:`
  service_role; `uow(principal)`), `make_usuario(rol, **extra) -> (email, id)`.
- Ejemplo completo de un módulo: `backend/src/application/use_cases/me.py`,
  `entrypoints/lambda_handlers/me.py`, `tests/unit/test_me.py`,
  `tests/integration/test_usuarios_repository.py`.

Frontend (`migration-output/frontend/src`):
- `shared/api/http-client.ts` — `HttpClient {get, post, put, patch, delete}`, `RequestOptions {params,
  signal, responseType: 'json'|'blob'}`, `seg(v)` para segmentos de ruta.
- `shared/api/browser-http.ts` — `browserHttp` (axiosApiGateway + token Cognito).
- `shared/api/server-http.ts` — `await getServerHttp()` (SOLO en Server Components / page.tsx server).
- `shared/api/api-error.ts` — `ApiError {status, code, title, message, isCanceled}`.
- `shared/api/presigned-upload.ts` — `uploadToPresignedUrl({url, key, headers}, file)` (subidas a S3).
- `shared/api/static-asset.ts` — `loadStaticArrayBuffer/loadStaticBlob` (archivos de /public).
- `shared/auth/cognito-auth.ts` — `getSessionUser()`, `signOutUser()`.
- `lib/utils/usuario-actual.ts` — `getUsuarioActual()` (server, ya migrado: `{user:{email,
  user_metadata:{avatar_url, full_name}}, userEmail, perfil, rolReal, rolEfectivo, ...}`).
- `views/identidad/` — ejemplo de módulo (api + hooks). `identidadApi.calendarEvents(timeMin, timeMax)`
  reemplaza googleCalendarService (devuelve items crudos de Calendar v3).
- `lib/utils/analistas-equipo.ts` — YA migrado: `analistasConCarteraReal(http)` → `[{email, nombre}]`
  (GET /me/analistas-con-cartera; reemplaza `FILTRO_ROL_ELEGIBLE_CARTERA` + `emailsConCarteraReal` +
  la consulta a `usuarios`), y `filtrarConCarteraReal(filas, set)` sigue igual. En server:
  `await analistasConCarteraReal(await getServerHttp())`.
- `middleware.ts`, `app/login`, `app/auth/*`, `app/(app)/layout.tsx`, `components/ver-como-banner.tsx`,
  `hooks/useSessionTimeout.ts`, `lib/reportes/pdf-branding.ts`, `lib/reportes/export-tabla.ts`,
  `lib/utils/estado-cuenta-export.ts` ya están migrados.
- `lib/supabase/*` se borra al final: no importarlo.

## Convenciones backend (las verifica el validador)
- Capas: `domain` (stdlib), `application` (domain+application; NUNCA infrastructure/psycopg/boto3/SQL),
  `infrastructure` (adapters con SQL), `entrypoints` (handlers delgados ≤ 30 líneas por función, sin
  importar psycopg/boto3/`infrastructure.database`).
- Archivos de tu módulo `<m>` (snake_case, p. ej. `gestion_cartera`):
  - `application/ports/<m>.py` → `class <M>Repository(ABC)` con métodos con intención.
  - `application/use_cases/<m>.py` (o `<m>_<tema>.py` si es largo) → `class <Verbo><Cosa>UseCase`
    con `__init__(self, uow_factory, ...ports)` y `execute(self, principal, ...)`. Aquí va la
    autorización (roles, scope por analista, solo lectura) y la validación autoritativa.
  - `domain/entities/<m>.py` si hace falta (dataclasses frozen / constantes de estados).
  - `infrastructure/database/postgresql/<m>_repository.py` → `class Postgres<M>Repository(<M>Repository)`
    `__init__(self, connection)`; SQL como constantes, SIEMPRE parametrizado (`%s`/`%(x)s`), nombres
    Aurora SIN calificar: tablas `tbl_<tabla>`, vistas `vw_<vista>` (icp_por_cliente → vw_icp_por_cliente,
    v_automatizaciones_feed → vw_v_automatizaciones_feed), funciones con su nombre de
    `database/naming-map.json` (casi todas iguales: `fn_x`; `get_kpis_cartera` → `fn_get_kpis_cartera`,
    `get_kpis_saldos_favor` → `fn_get_kpis_saldos_favor`, `_recalc_metas` → `fn__recalc_metas`,
    `get_mi_rol` → `fn_get_mi_rol`). NUNCA `public.`/`auth.`/`storage.` ni el nombre original de una
    tabla en un string SQL. Filas = dict (`dict_row`). RPC que devuelve JSON: `SELECT fn_x(%s) AS r` y
    devolver `row["r"]`; RPC que devuelve tabla: `SELECT * FROM fn_x(%s)`. Respetar argumentos con
    nombre (`fn_x(p_email => %s)`) cuando el original pasaba solo algunos.
  - `entrypoints/lambda_handlers/<m>.py` → funciones privadas `_xxx(request)` + fábricas de casos de uso
    (`def _uc_x(): return XUseCase(container.uow_factory, container.mailer())`) + `ROUTES = {(método,
    recurso): func}` + `<m>_handler = api_router(ROUTES)`. `request.require_principal()`,
    `request.path_param("cod")`, `request.query_str/query_int/query_bool/query_list`, `request.json_body()`.
    Respuestas: valor → 200 (dict/list/dataclass; Decimal/fecha/uuid se serializan como PostgREST),
    `None` → 204, `created(x)` → 201 (`from entrypoints.lambda_handlers.http_adapter import created`).
  - `tests/fakes/fake_<m>.py` → `class Fake<M>Repository(<M>Repository)` en memoria.
  - `tests/unit/test_<m>.py` → camino feliz + autorización (rol / scope ajeno) + validaciones + efectos.
  - `tests/integration/test_<m>_repository.py` (marker `pytestmark = pytest.mark.integration`) que
    ejerza TODOS los métodos SQL del repository contra el esquema generado (inserta lo mínimo con
    `u.connection.cursor()`; las funciones fn_* se pueden llamar sobre tablas vacías).
- Correr: `cd migration-output/backend && python -m pytest -q tests/unit/test_<m>.py && python -m ruff check
  --output-format concise src tests` (line-length 110; `python -m ruff format <tus archivos>` ayuda) y la
  integración: `PYTHONIOENCODING=utf-8 PYTHONPATH="C:/Users/jalvarez/AppData/Local/Temp/claude/C--Users-jalvarez-Documents-cyc-cartera-cofersa/87c11f16-9ad9-49d7-91bf-5126fbfe0821/scratchpad/pgfix" python "C:/Users/jalvarez/AppData/Local/Temp/claude/C--Users-jalvarez-Documents-cyc-cartera-cofersa/87c11f16-9ad9-49d7-91bf-5126fbfe0821/scratchpad/pgfix/run_integration.py" tests/integration/test_<m>_repository.py`
  (levanta un PostgreSQL efímero con el esquema Aurora real; tarda ~1 min).
- Esquema real de cada tabla/función (columnas, tipos, cuerpo de las fn_*):
  `migration-output/database/aurora_postgresql_schema.sql` (buscá `tbl_<tabla> (` o `FUNCTION ...fn_x(`)
  y `migration-output/.discovery/supabase-schema.json`. No inventes columnas.
- Sin TODO/FIXME/HACK/XXX, sin pseudocódigo, sin `NotImplementedError`, sin secretos/IDs de AWS en código.

## Convenciones de API (paths)
- Una Lambda por módulo: `function: <Modulo>Api` (PascalCase, p. ej. `GestionCarteraApi`), mismo
  `handler: entrypoints.lambda_handlers.<m>.<m>_handler` para todos los endpoints del módulo.
- Route Handler original `/api/a/b` → path `/a/b` (mismo método, mismo body/forma de respuesta; los
  segmentos `[x]` → `{x}`). Consultas que el front hacía directo a Supabase → endpoints REST nuevos con
  intención. Para Server Components con varias consultas, preferí UN endpoint agregado por pantalla
  (`GET /clientes/{cod}/ficha`) que devuelva todo lo que la página necesitaba, con la MISMA forma.
- Nombres de parámetro por posición (API Gateway exige el mismo nombre en el mismo nivel):
  `/clientes/{cod}`, `/solicitudes/{id}`, `/garantias/{id}`, `/pedidos-retenidos/{id}`,
  `/configuracion/usuarios/{id}`, `/configuracion/vendedores/{cod}`, `/configuracion/supervisores/{cod}`,
  `/configuracion/directorio/{id}`, `/configuracion/portafolio-acotado/{principal_cod}`,
  `/centro-recursos/aplicaciones/{id}`, `/centro-recursos/marcas/{id}`, `/notificaciones/{id}`,
  `/pagos-anulados/{no_recibo}`, `/pagos-duplicado-descartado/{no_recibo}`,
  `/actualizar-perfil/{token}`. Si necesitás otro prefijo nuevo, usá uno que empiece con el nombre de tu
  módulo para no chocar.
- API Gateway corta a los 29 s: nada síncrono puede esperar más (timeout de la Lambda ≤ 29).
- Respuesta de error: el adaptador devuelve `{"error": {code,title,message,details}}`; el front recibe
  `ApiError` con `.message`. Donde el componente original hacía `const d = await res.json(); if
  (!res.ok) setError(d.error ?? '...')`, ahora `try { await xApi.y() } catch (e) { setError((e as
  ApiError).message ?? '...') }` mostrando el mismo texto.

## Convenciones frontend (las verifica el validador)
- Módulo `src/views/<modulo-kebab>/`: `api/<modulo>-api.ts` con
  `export function create<Modulo>Api(http: HttpClient) { return {...} }` y
  `export const <modulo>Api = create<Modulo>Api(browserHttp)`; `hooks/use-<nombre>-controller.ts`
  (estado, loading/error, AbortController en cargas con useEffect, acciones); opcionalmente
  `components/` (≤ 200 líneas c/u) y `pages/` (≤ 250, solo componen, no importan `/api/`). Nombres de
  archivo kebab-case.
- Los componentes existentes (`src/components/**`, `src/app/(app)/**`) se quedan donde están y con su
  JSX; solo se cambia de dónde salen los datos: usan el controller del módulo (Client Components) o,
  en Server Components (`page.tsx` sin 'use client'), `const api = create<Modulo>Api(await
  getServerHttp())` y manejan el error mostrando un mensaje (regla 8 del CLAUDE.md), nunca pantalla en
  blanco.
- PROHIBIDO fuera de `src/shared/api/`: `fetch(`, `axios`, `XMLHttpRequest`. Todas las llamadas a
  `/api/...` del original pasan a `xApi`. Descargas de archivos generados por el backend: responseType
  'blob'. Subidas a Storage → endpoint que devuelve URL prefirmada + `uploadToPresignedUrl`.
- Los buckets de Supabase eran públicos en 3 casos (`getPublicUrl`); en AWS son privados: el backend
  devuelve URLs prefirmadas GET (guardá en BD la key/ruta como antes; generá la URL al leer).
- Tipos nuevos: en `src/views/<modulo>/types.ts` (no editar `src/types/database.ts`; si un tipo de ahí
  te sirve, importalo).
- TypeScript: `cd migration-output/frontend && npx tsc --noEmit 2>&1 | grep -E "<tus rutas>"` (otros
  agentes trabajan en paralelo: ignorá errores de archivos que no son tuyos). No corras `npm install` ni
  `npm run build` (lo hace el coordinador al final).

## Alcance y archivos
- Solo editá/creás archivos de TU alcance (listado en tu prompt) + los archivos nuevos de tu módulo.
  Si un archivo de tu alcance importa algo de otro módulo que todavía usa Supabase, no lo toques:
  reportalo. Borrá las `route.ts` originales de tu alcance cuando quede su endpoint en el backend.
- No modifiques: la base compartida listada arriba, `migration-output/database/**`, `template.yaml`,
  `samconfig.toml`, `migration-manifest.yaml`, `src/components/sidebar.tsx`.

## Entrega (obligatoria)
1. Escribí `migration-output/.discovery/manifest-parts/<m>.yaml` con EXACTAMENTE estas claves:
```yaml
module: {name: <m>, entities: [tablas], use_cases: [XUseCase, ...]}
api_endpoints:
  - {method: GET, path: /clientes/{cod}/ficha, function: ClientesApi,
     handler: entrypoints.lambda_handlers.clientes.clientes_handler, use_case: GetFichaClienteUseCase,
     module: clientes, auth: cognito, source: ["src/app/(app)/clientes/[cod]/page.tsx:42", ...],
     timeout: 29}          # timeout/memory opcionales; source = archivo:línea de CADA operación Supabase
                           # (from/rpc/storage/auth de datos) o route.ts original que reemplaza
storage_buckets: [{name: garantias-legal, functions: [AuditoriaLegalApi]}]   # solo si usás S3
authorization_rules:       # UNA por política RLS de tus tablas (ver lista en tu prompt)
  - {table: public.x, policy: nombre, command: SELECT, enforced_in: "XUseCase (require_usuario + analista_scope)"}
scheduled_jobs: []         # solo el módulo jobs
async_workers: []          # solo si hace falta (SQS)
structural_changes: ["texto: qué cambió de forma y por qué"]
incompatibilities: ["texto: lo que no tiene equivalente exacto y cómo se resolvió"]
migration_risks: ["texto"]
pending: ["cosas que necesitás de otro módulo o de la base compartida"]
```
2. Respondé con un resumen breve: archivos creados/editados/borrados, resultados de pytest unitario +
   integración + ruff + tsc (de tus archivos), y la lista `pending`.
