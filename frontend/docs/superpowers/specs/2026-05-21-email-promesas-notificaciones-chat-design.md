# Diseño — Email, Promesas, Notificaciones y Chat Interno

**Fecha:** 21 de mayo de 2026  
**Estado:** Aprobado  
**Proyecto:** CYC Cofersa v3.0

---

## Resumen ejecutivo

Este documento especifica tres mejoras independientes que se implementan en secuencia:

1. **Email + Sesión** — Reparar el envío de estados de cuenta via Gmail API y manejar expiración de sesión con gracia.
2. **Promesas automáticas** — Marcar promesas vencidas como "Incumplida" automáticamente, con notificación y boost en la cola.
3. **Notificaciones reales + Chat interno** — Badge de campana en tiempo real y panel flotante de chat para el equipo.

---

## 1. Email + Sesión

### Problema actual

- El `provider_token` de Google (token de Gmail API) expira cada 60 minutos.
- Supabase no renueva este token automáticamente.
- Cuando expira, el envío de estado de cuenta falla **silenciosamente**: el sistema registra la gestión pero el correo nunca se dispara.
- El analista ve el mensaje "La sesión ha finalizado" y debe cerrar y volver a entrar.

### Solución diseñada

#### 1A — Renovación del `provider_token` (Gmail)

- Configurar el proveedor Google en Supabase con `access_type: offline` y `prompt: consent` para que Google siempre emita un `provider_refresh_token` de larga duración.
- El archivo `gmail-token.ts` ya existe y ya implementa la lógica de refresh — solo necesita que el `provider_refresh_token` esté disponible en la sesión, lo cual se logra con la configuración anterior.
- **Acción única requerida por los analistas:** cerrar sesión y volver a entrar una sola vez después del deploy para que Google emita el refresh token con los nuevos permisos.

#### 1B — Manejo de sesión vencida en la app

- Agregar un listener `onAuthStateChange` en el layout raíz `(app)/layout.tsx`.
- Cuando el evento sea `SIGNED_OUT` o `TOKEN_REFRESHED` con error, redirigir automáticamente a `/login`.
- El usuario nunca ve una pantalla rota — simplemente regresa al login limpiamente.

#### 1C — Error handling visible en el envío

- Si el envío de email falla por cualquier razón (token inválido, red, etc.), mostrar un toast de error claro al usuario en lugar de fallar silenciosamente.
- Agregar logging en el servidor para capturar fallos de Gmail API con el código de error específico.

### Archivos involucrados

- `src/app/(app)/layout.tsx` — listener de sesión
- `src/lib/supabase/client.ts` — verificar configuración de Google OAuth
- `src/app/api/clientes/estado-cuenta/route.ts` — mejorar error handling
- `src/lib/utils/gmail-token.ts` — ya implementado, validar que funcione con refresh token

### Criterio de éxito

- Un analista puede enviar un estado de cuenta 3 horas después de haber iniciado sesión sin error.
- Si la sesión vence, la app redirige al login en lugar de mostrar pantalla rota.
- Si el correo falla, el analista ve un mensaje de error claro.

---

## 2. Promesas — Marcado automático "Incumplida"

### Comportamiento diseñado

Cada noche a medianoche (hora Costa Rica, UTC-6), el sistema:

1. Busca todas las promesas con `estado = 'PENDIENTE'` y `fecha_prometida < HOY`.
2. Cambia su estado a `'INCUMPLIDA'`.
3. Crea una notificación para el analista asignado: _"Promesa incumplida — [Cliente] · ₡[monto] venció el [fecha]"_.
4. Activa el boost de prioridad en la cola del día siguiente para ese cliente (score +15 puntos en la Cola Inteligente V3).

### Implementación — Supabase Edge Function + pg_cron

#### Edge Function `mark-promesas-incumplidas`

```typescript
// Lógica:
// 1. SELECT promesas WHERE estado = 'PENDIENTE' AND fecha_prometida < CURRENT_DATE
// 2. UPDATE promesas SET estado = 'INCUMPLIDA', updated_at = NOW()
// 3. INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, link)
//    para cada promesa vencida
// 4. Retornar conteo de promesas marcadas
```

#### pg_cron schedule

```sql
-- Corre todos los días a medianoche hora Costa Rica (06:00 UTC)
SELECT cron.schedule(
  'mark-promesas-incumplidas',
  '0 6 * * *',
  $$SELECT net.http_post(url := 'https://[project].supabase.co/functions/v1/mark-promesas-incumplidas', headers := '{"Authorization": "Bearer [service_role_key]"}')$$
);
```

### Vocabulario de estados de promesas (definitivo)

| Estado       | Condición                                     |
| ------------ | --------------------------------------------- |
| `PENDIENTE`  | Fecha futura, no confirmada                   |
| `CUMPLIDA`   | Marcada manualmente por el analista           |
| `INCUMPLIDA` | Fecha pasada sin confirmación (antes: "Rota") |

> **Nota:** El término "Rota" queda eliminado del sistema. En UI, base de datos y notificaciones se usa únicamente "Incumplida".

### Boost en la Cola Inteligente

- El cliente con promesa recién marcada como Incumplida recibe `score += 15` en el cálculo de la cola del día siguiente.
- Esto lo eleva automáticamente en la lista de prioridades sin necesidad de intervención manual.

### Archivos involucrados

- `supabase/functions/mark-promesas-incumplidas/index.ts` — Edge Function (nuevo)
- `src/app/(app)/promesas/page.tsx` — actualizar label "Rota" → "Incumplida" si existe
- `src/app/(app)/mi-cartera/page.tsx` — incorporar boost de score por promesa incumplida
- `src/types/database.ts` — verificar que el tipo refleje 'INCUMPLIDA'

### Criterio de éxito

- A las 12:01am del día siguiente a una fecha prometida vencida, el estado cambia automáticamente.
- El analista recibe la notificación en la campana.
- El cliente aparece con mayor prioridad en su cola del día.

---

## 3. Notificaciones en tiempo real + Chat interno

### 3A — Sistema de notificaciones

#### Diseño del badge

- Campana 🔔 en el topbar derecho, siempre visible.
- Badge rojo con el conteo de notificaciones **no leídas**.
- Si no hay sin leer: campana sin badge.
- **Los badges individuales en el sidebar (Promesas, Solicitudes) se eliminan** — la campana es el único punto de notificación.

#### Panel de notificaciones (dropdown)

- Se abre al hacer click en la campana.
- Se cierra al hacer click fuera del panel.
- **Tabs:** Todas · Promesas · Alertas · Solicitudes
- Cada notificación muestra:
  - Icono por tipo (color diferenciado: rojo=alerta, amarillo=promesa, cyan=solicitud, verde=sync)
  - Título bold + mensaje descriptivo
  - Timestamp relativo ("Hace 2 horas", "Ayer 3:30pm")
  - Link directo a la ficha o módulo relacionado
  - Punto azul = sin leer; fondo ligeramente celeste
- Acción "Marcar todo como leído"
- Link "Ver todas las notificaciones" al pie

#### Tiempo real con Supabase Realtime

- Suscripción en el cliente a `INSERT` en la tabla `notificaciones` donde `usuario_id = usuario_actual`.
- Al llegar una notificación nueva: actualizar badge + agregar item al panel sin recargar página.
- Al marcar como leída: `UPDATE notificaciones SET leida = true`.

#### Tipos de notificaciones generadas automáticamente

| Evento                       | Tipo         | Destinatario         |
| ---------------------------- | ------------ | -------------------- |
| Promesa incumplida           | ALERTA 🚨    | Analista asignado    |
| Promesa vence hoy            | PROMESA ⏰   | Analista asignado    |
| Solicitud aprobada/rechazada | SOLICITUD 📋 | Analista solicitante |
| Nueva solicitud creada       | SOLICITUD 📋 | Coordinador          |
| Cliente sin gestión +7 días  | ALERTA ⚠️    | Analista asignado    |
| Sync completada              | SYNC 🔄      | Todos                |

#### Archivos involucrados

- `src/components/layout/Topbar.tsx` — campana + badge + panel dropdown
- `src/hooks/useNotificaciones.ts` — hook con suscripción Realtime (nuevo)
- `src/app/api/notificaciones/route.ts` — marcar leída, listar (nuevo)
- Eliminar badges de `src/components/layout/Sidebar.tsx`

---

### 3B — Chat interno del equipo

#### Concepto

Canal único "Equipo C&C" donde los 5 miembros del equipo se comunican. Accesible desde cualquier página sin perder el contexto de trabajo.

#### Posición y comportamiento

- **Panel flotante** en la esquina inferior derecha, sobre el contenido.
- Botón 💬 en el topbar con punto verde = hay miembros conectados.
- Al hacer click: el panel se abre/cierra (toggle).
- El panel tiene altura fija (480px) y ancho fijo (340px).
- No bloquea la interacción con el resto de la app.

#### Estructura del panel

```
┌─────────────────────────────────────┐
│ 💬 Equipo C&C        JD MP PC AG 4/5│  ← header navy
├─────────────────────────────────────┤
│                                     │
│  [mensajes con scroll]              │  ← fondo #f8fafc
│                                     │
│  mensajes propios: cyan, derecha    │
│  mensajes equipo: blanco, izquierda │
│                                     │
├─────────────────────────────────────┤
│ [input] ────────────────── [enviar] │  ← footer blanco
└─────────────────────────────────────┘
```

#### Funcionalidades del MVP

- Enviar y recibir mensajes de texto.
- Ver nombre + avatar de cada remitente.
- Timestamps por mensaje.
- Separador de fecha (Hoy / Ayer / DD/MM).
- Indicador de presencia: punto verde en el botón + contador "4/5" en el header.
- Scroll automático al mensaje más reciente al abrir.
- Notificación visual (punto parpadeante en el botón 💬) si llega un mensaje con el panel cerrado.

#### Funcionalidades fuera del MVP (sprint futuro)

- Reacciones con emoji.
- Adjuntar archivos o imágenes.
- Menciones @nombre.
- Mensajes directos entre dos personas.

#### Base de datos

```sql
CREATE TABLE mensajes_chat (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID REFERENCES usuarios(id) NOT NULL,
  mensaje     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: todos los usuarios del sistema pueden leer y escribir
CREATE POLICY "equipo_chat" ON mensajes_chat
  USING (auth.uid() IN (SELECT id FROM usuarios WHERE activo = true));
```

#### Tiempo real con Supabase Realtime

- Suscripción al canal `mensajes_chat` para todos los miembros.
- Al llegar un mensaje nuevo: agregar al panel en tiempo real.
- Presencia: usar Supabase Presence para saber quién está conectado.

#### Archivos involucrados

- `src/components/layout/ChatPanel.tsx` — panel flotante completo (nuevo)
- `src/hooks/useChat.ts` — mensajes + Realtime + Presence (nuevo)
- `src/app/api/chat/route.ts` — enviar mensaje (nuevo)
- `src/app/(app)/layout.tsx` — montar `<ChatPanel />` globalmente

---

## Orden de implementación recomendado

| Sprint | Tarea                                                            | Prioridad     |
| ------ | ---------------------------------------------------------------- | ------------- |
| 1      | Email: fix `offline access` en Google OAuth + listener de sesión | 🔴 Alta       |
| 1      | Email: mejorar error handling en `/api/clientes/estado-cuenta`   | 🔴 Alta       |
| 2      | Promesas: Edge Function `mark-promesas-incumplidas` + pg_cron    | 🟠 Media-Alta |
| 2      | Promesas: boost de score en Cola Inteligente                     | 🟠 Media-Alta |
| 3      | Notificaciones: hook Realtime + campana + panel dropdown         | 🟠 Media      |
| 3      | Notificaciones: eliminar badges del sidebar                      | 🟡 Baja       |
| 4      | Chat: tabla `mensajes_chat` + RLS + Realtime                     | 🟡 Media      |
| 4      | Chat: `ChatPanel.tsx` + `useChat.ts`                             | 🟡 Media      |

---

## Dependencias técnicas

- Supabase Edge Functions habilitadas en el proyecto.
- `pg_cron` extension habilitada en Supabase (disponible en todos los proyectos Pro+).
- Supabase Realtime habilitado para las tablas `notificaciones` y `mensajes_chat`.
- Variable de entorno `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` ya configuradas en Vercel.
- `SUPABASE_SERVICE_ROLE_KEY` disponible para la Edge Function.
