# INSTRUCCIÓN — Módulo de Configuración SIC

## Para Claude Code · Sprint Configuración · 26 mayo 2026

---

## CONTEXTO DEL PROYECTO

Sistema SIC (Sistema Inteligente de Cobranza) — Next.js 14 App Router, TypeScript estricto, Tailwind CSS v4, Supabase PostgreSQL, Vercel.

**URL producción:** `https://cyc-cartera-cofersa.vercel.app`

Este sprint reemplaza completamente el módulo de Configuración actual (`/app/configuracion/page.tsx`) que era de solo lectura. El nuevo módulo es un panel de control funcional exclusivo del rol COORDINADOR.

---

## TABLAS NUEVAS EN SUPABASE (ya creadas, listas para usar)

```sql
-- supervisores: jefes directos de vendedores
supervisores (cod PK, nombre, email, activo, created_at)

-- vendedores: fuente de verdad para asignaciones analista
vendedores (cod PK, nombre, email, zona, supervisor_cod FK→supervisores,
            analista_email FK→usuarios.email, activo,
            asignado_por, asignado_en, created_at)

-- maestro_clientes: campo nuevo agregado
maestro_clientes.asignacion_manual BOOLEAN DEFAULT FALSE
-- TRUE = analista asignado directamente al cliente (excepción)
-- FALSE = hereda analista del vendedor (flujo normal)

-- directorio_empresa: autocomplete de correos para emails del SIC
directorio_empresa (id UUID PK, nombre, email, cargo, area, activo, created_at)

-- config_audit_log: trazabilidad de cambios en configuración
config_audit_log (id UUID PK, tabla, accion, descripcion,
                  valor_anterior JSONB, valor_nuevo JSONB,
                  realizado_por, realizado_en)
```

## TABLA EXISTENTE RELEVANTE

```sql
-- usuarios: ya existe, no modificar estructura
usuarios (id UUID, email, nombre, rol, iniciales, color,
          activo, meta_individual, created_at, telefono,
          whatsapp, google_refresh_token)
-- CHECK constraint: rol IN ('COORDINADOR', 'ANALISTA')
-- Dominios permitidos: @cofersa.cr y @mayoreo.biz
```

---

## RESTRICCIÓN DE ACCESO — CRÍTICO

El módulo completo es SOLO para COORDINADOR. En el Server Component principal:

```typescript
// /app/configuracion/page.tsx — primera línea de lógica
const session = await getServerSession();
if (!session || session.user.rol !== 'COORDINADOR') {
  redirect('/dashboard');
}
```

Los analistas que intenten acceder directamente a `/configuracion` deben ser redirigidos a `/dashboard`.

---

## ESTRUCTURA DE ARCHIVOS A CREAR

```
/app/configuracion/
  page.tsx                          ← reemplazar completamente

/app/api/configuracion/
  vendedores/route.ts               ← GET lista, POST crear
  vendedores/[cod]/route.ts         ← PUT actualizar, DELETE desactivar
  supervisores/route.ts             ← GET lista, POST crear
  supervisores/[cod]/route.ts       ← PUT actualizar
  usuarios/route.ts                 ← GET lista
  usuarios/[id]/route.ts            ← PUT actualizar rol/activo
  parametros/route.ts               ← GET y PUT parámetros del sistema
  semaforo/route.ts                 ← GET y PUT reglas del semáforo
  directorio/route.ts               ← GET lista, POST crear
  directorio/[id]/route.ts          ← PUT actualizar, DELETE desactivar
  log/route.ts                      ← GET log con filtros

/components/configuracion/
  ConfigTabs.tsx                    ← navegación por tabs
  TabVendedores.tsx                 ← distribución vendedores
  TabSupervisores.tsx               ← gestión supervisores
  TabUsuarios.tsx                   ← gestión usuarios
  TabParametros.tsx                 ← parámetros operativos
  TabSemaforo.tsx                   ← reglas semáforo
  TabSLA.tsx                        ← SLA solicitudes
  TabDirectorio.tsx                 ← directorio empresa
  TabLog.tsx                        ← log de cambios
```

---

## DISEÑO — SEGUIR EXACTAMENTE EL DESIGN SYSTEM EXISTENTE

```css
/* Colores — NO cambiar */
--cofersa-navy:  #003B5C   /* headers de sección, badges coordinador */
--cofersa-cyan:  #009ee3   /* botones primarios, tab activo, links */
--bg-app:        #EEF2F7   /* fondo general */
--bg-card:       #ffffff

/* Tab activo */
border-bottom: 2px solid #009ee3;
color: #009ee3;

/* Botón primario */
background: #009ee3; color: white; border-radius: 6px;

/* Tabla */
thead: bg-gray-50, text-xs uppercase text-gray-500
tbody tr: border-b hover:bg-gray-50
td: py-2.5 px-3 text-sm
```

**Tipografía:** Nunito (ya cargada globalmente)
**Formato montos:** usar `fmtCRC()` de `src/lib/utils/formato.ts`
**Fechas:** usar `fmtFechaHora()` de `src/lib/utils/formato.ts`

---

## TAB 1 — DISTRIBUCIÓN DE VENDEDORES

### Descripción

Es el tab más importante. Permite al coordinador ver y reasignar qué analista atiende a cada vendedor. Los cambios son inmediatos en Supabase y se registran en `config_audit_log`.

### UI

- Header con 4 stat cards: Total vendedores | Cambios este mes | Analistas activos | Sin asignación
- Filtros: búsqueda por nombre/código + dropdown filtrar por analista
- Tabla con columnas: Código | Vendedor | Correo | Zona | Supervisor | Analista Asignado | Clientes | Última modificación
- Columna "Analista Asignado": dropdown `<select>` inline con los 5 analistas activos
- Al cambiar el dropdown: llamada inmediata a la API, sin botón de guardar
- Feedback visual: fila se pone en verde por 1.5 segundos, columna "Última modificación" actualiza con timestamp y nombre del coordinador
- Botón "+ Agregar vendedor" que abre modal con campos: Código, Nombre, Correo, Zona, Supervisor (select), Analista (select)

### API Route — PUT /api/configuracion/vendedores/[cod]

```typescript
// Payload del PUT
{
  analista_email: string,
  supervisor_cod?: string,
  zona?: string,
  nombre?: string,
  email?: string
}

// Lógica:
// 1. UPDATE vendedores SET analista_email, asignado_por, asignado_en
// 2. UPDATE maestro_clientes SET analista_email WHERE vendedor_cod = cod AND asignacion_manual = FALSE
// 3. INSERT config_audit_log con valor_anterior y valor_nuevo
// 4. Retornar vendedor actualizado
```

### Query para cargar la tabla

```typescript
// Incluir count de clientes por vendedor
const { data } = await supabase
  .from('vendedores')
  .select(
    `
    *,
    supervisores(nombre),
    clientes_count:maestro_clientes(count)
  `,
  )
  .eq('activo', true)
  .order('nombre');
```

---

## TAB 2 — SUPERVISORES

### UI

- Tabla: Código | Nombre | Correo | Vendedores asignados | Estado | Acciones
- Botón "+ Agregar supervisor"
- Acciones: Editar (modal) | Desactivar (con confirmación)
- Al desactivar un supervisor: verificar que no tenga vendedores activos asignados, si tiene mostrar advertencia con lista de vendedores afectados

### Campos del modal de creación/edición

- Código (único, requerido)
- Nombre completo (requerido)
- Correo corporativo (requerido, validar formato)

---

## TAB 3 — USUARIOS DEL SISTEMA

### UI

- Header: "N usuarios registrados" + badge "Dominios: @cofersa.cr · @mayoreo.biz"
- Botón "+ Agregar usuario"
- Lista con avatar de iniciales, nombre, email, badge de dominio, badge de rol, badge de estado, botón Editar

### Modal agregar usuario — campos

- Nombre completo (requerido)
- Email (requerido — validar que sea @cofersa.cr o @mayoreo.biz, rechazar otros dominios)
- Rol: select COORDINADOR / ANALISTA
- Iniciales (2 caracteres, auto-sugeridas del nombre)
- Color (color picker simple, default #009ee3)
- Meta individual (número, default 0)
- Teléfono (opcional)
- WhatsApp (opcional)

### Modal editar usuario — campos editables

- Nombre, rol, activo (toggle), meta_individual, telefono, whatsapp
- Email NO es editable una vez creado

### Validación de dominio

```typescript
const DOMINIOS_PERMITIDOS = ['cofersa.cr', 'mayoreo.biz'];
const dominio = email.split('@')[1];
if (!DOMINIOS_PERMITIDOS.includes(dominio)) {
  return error('Solo se permiten correos @cofersa.cr o @mayoreo.biz');
}
```

### Nota sobre auth

Al crear un usuario nuevo en la tabla `usuarios`, el usuario podrá hacer login con Google OAuth con su cuenta corporativa. El sistema los reconoce por email en el primer login.

---

## TAB 4 — PARÁMETROS OPERATIVOS

### Parámetros a mostrar (leer de `config_sistema` tabla existente)

Los parámetros existen en la tabla `config_sistema`. Si la tabla tiene estructura diferente, leer con:

```typescript
const { data } = await supabase.from('config_sistema').select('*').single();
```

### UI

- Card por parámetro con: label, descripción/hint, valor actual, botón "Editar"
- Al hacer clic en Editar: el valor se convierte en input editable inline con botones Guardar/Cancelar
- Guardar hace UPDATE en `config_sistema` y registra en `config_audit_log`

### Parámetros del sistema

| Clave                   | Label                                  | Hint                                        | Tipo       |
| ----------------------- | -------------------------------------- | ------------------------------------------- | ---------- |
| meta_mensual            | Meta mensual de cobro (CRC)            | Calcula % de avance en dashboard            | número     |
| meta_gestiones_diarias  | Meta de gestiones diarias por analista | Barra de progreso /N en dashboard analista  | número     |
| dias_sin_gestion_alerta | Días sin gestión para alerta           | Activa notificación de cliente sin contacto | número     |
| pct_mora_referencia     | % mora objetivo (línea en gráfico)     | Referencia visual en TendenciaCarteraChart  | porcentaje |

---

## TAB 5 — SEMÁFORO DE RIESGO

### UI

- Tres secciones: ROJO / ÁMBAR / VERDE
- Cada condición es un input numérico editable
- Botón "Guardar reglas del semáforo" al final (único tab con guardado explícito porque múltiples campos se guardan juntos)
- Mostrar nota: "Los cambios aplican en el próximo cálculo del semáforo"

### Reglas actuales (hardcodeadas en el código — migrar a config_sistema)

```
ROJO:  mora > 60 días | promesa vencida | sin gestión >= 10 días
ÁMBAR: mora 31-60 días | promesa vence en < 7 días | sin gestión >= 5 días
VERDE: mora 1-30 días
```

### Campos a guardar en config_sistema

```
semaforo_rojo_mora_dias: 60
semaforo_rojo_sin_gestion_dias: 10
semaforo_ambar_mora_min: 31
semaforo_ambar_mora_max: 60
semaforo_ambar_promesa_dias: 7
semaforo_ambar_sin_gestion_dias: 5
```

---

## TAB 6 — SLA SOLICITUDES

### UI

- Tabla: Área | Tipo de solicitud | SLA actual (horas) | input editable
- Botón "Guardar SLA" al final
- Los tipos de solicitud vienen de la lógica existente del módulo de Solicitudes

### Tipos con sus SLA actuales (hardcodeados — migrar)

```
Crédito y Cobro / Aumento de límite de crédito: 24h
Crédito y Cobro / Caso especial: 48h
Crédito y Cobro / Bloqueo de cuenta: 4h
Crédito y Cobro / Revisión de límite: 24h
Crédito y Cobro / Solicitud de convenio: 48h
Crédito y Cobro / Exoneración de intereses: 72h
Comercial / Revisión de cartera con vendedor: 24h
Comercial / Autorización descuento: 12h
Comercial / Cambio de condición de pago: 48h
Logística / Refacturación: 72h
Logística / Devolución: 48h
Logística / Ajuste de factura: 24h
Actualización / Actualización datos cliente: 2h
```

---

## TAB 7 — DIRECTORIO EMPRESA

### UI

- Header: "N contactos" + filtro por área
- Botón "+ Agregar contacto"
- Tabla: Nombre | Email | Cargo | Área | Estado | Acciones
- Acciones: Editar | Desactivar

### Áreas disponibles (select fijo)

Ventas | Logística | Crédito y Cobro | Gerencia | TI | Compras | Recursos Humanos | Contabilidad | Otro

### Uso del directorio

Este tab es el que alimenta el autocomplete de correos en:

- Campo "Para" y "CC" al enviar emails desde la Ficha 360° del cliente
- Campo "Para" y "CC" en el módulo de Solicitudes

Para el autocomplete, existe o debe crearse una función utilitaria:

```typescript
// src/lib/utils/directorio.ts
export async function buscarContactos(query: string) {
  const { data } = await supabase
    .from('directorio_empresa')
    .select('nombre, email, cargo, area')
    .eq('activo', true)
    .or(`nombre.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(8);
  return data || [];
}
```

---

## TAB 8 — LOG DEL SISTEMA

### UI

- Header: "Registro de cambios" + botón "Exportar CSV"
- Filtros: por tabla (dropdown) + por fecha (date range)
- Lista cronológica inversa (más reciente primero):
  - Timestamp | Descripción del cambio | Tabla | Usuario que realizó el cambio
- Paginación de 50 registros por página

### Ejemplo de entradas del log

```
26/05 · 14:30  Vendedor 02 reasignado: Angélica → María Paola  [vendedores]  Jeffrey D.
26/05 · 14:15  Meta mensual actualizada: ₡2.500M → ₡3.000M     [parametros]  Jeffrey D.
26/05 · 10:00  Usuario gmilano@cofersa.cr activado              [usuarios]    Jeffrey D.
```

---

## LÓGICA DE AUDITORÍA — APLICAR EN TODAS LAS APIS

Cada API route que modifica datos debe insertar en `config_audit_log`:

```typescript
await supabase.from('config_audit_log').insert({
  tabla: 'vendedores', // nombre de la tabla modificada
  accion: 'UPDATE', // INSERT | UPDATE | DELETE
  descripcion: `Vendedor ${cod} reasignado de ${valorAnterior.analista_email} a ${nuevoEmail}`,
  valor_anterior: { analista_email: valorAnterior.analista_email },
  valor_nuevo: { analista_email: nuevoEmail },
  realizado_por: session.user.email,
  realizado_en: new Date().toISOString(),
});
```

---

## COMPONENTES COMPARTIDOS A REUTILIZAR

Buscar en el codebase y reutilizar:

- `ModalConfirmacion` o similar para confirmaciones de borrado/desactivación
- Componentes de badge de estado (activo/inactivo)
- Componentes de avatar con iniciales
- `fmtCRC`, `fmtFecha`, `fmtFechaHora` de `src/lib/utils/formato.ts`
- Cliente de Supabase del servidor en `src/lib/supabase/server.ts`
- Verificación de sesión y rol existente en el proyecto

---

## CONSIDERACIONES TÉCNICAS IMPORTANTES

1. **Server Components para datos iniciales** — la página principal carga los datos en el servidor para evitar flash de contenido vacío. Los tabs usan Client Components para interactividad.

2. **Optimistic updates en el tab Vendedores** — al cambiar el analista, actualizar la UI inmediatamente antes de confirmar la respuesta de la API. Si la API falla, revertir.

3. **El trigger `trg_asignar_analista` ya existe en Supabase** — cuando se actualiza `analista_email` en `vendedores`, el trigger en `maestro_clientes` actualiza en cascada todos los clientes del vendedor donde `asignacion_manual = FALSE`. No replicar esta lógica en el frontend.

4. **RLS activo** — todas las tablas nuevas tienen RLS. Las API routes del servidor usan la service role key para bypasear RLS cuando es necesario (operaciones de escritura del coordinador).

5. **No usar `toLocaleString()`** — para formateo de números usar siempre las funciones de `src/lib/utils/formato.ts`.

6. **Navbar y layout existente** — la página de Configuración usa el mismo layout que el resto del SIC. No crear un layout nuevo. Solo reemplazar el contenido de la page.

---

## ORDEN DE IMPLEMENTACIÓN SUGERIDO

1. API routes (backend primero, sin UI)
2. Verificar APIs con curl o Postman
3. Tab Vendedores (el más crítico)
4. Tab Usuarios
5. Tab Supervisores
6. Tab Directorio
7. Tab Parámetros + Semáforo + SLA (los más simples)
8. Tab Log
9. Función utilitaria `buscarContactos` para autocomplete

---

## ENTREGABLE ESPERADO

- `/app/configuracion/page.tsx` completamente reescrito
- Todas las API routes funcionando
- Todos los tabs con datos reales de Supabase
- Cambios de asignación de vendedor reflejados inmediatamente en el SIC
- Cada cambio registrado en `config_audit_log`
- Módulo accesible solo para COORDINADOR

---

_Instrucción generada el 26/05/2026 · Sprint Configuración SIC_
_COFERSA / OLO · Confidencial_
