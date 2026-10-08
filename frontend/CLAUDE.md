# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# CYC Cofersa — Documento Maestro para Claude Code

**Sistema de Gestión de Cartera, Crédito y Cobro (SIC)**
Versión 5.0 · Junio 2026 · Confidencial · Cofersa

---

## INSTRUCCIONES PARA CLAUDE CODE

Este documento es la fuente de verdad del proyecto. Antes de escribir cualquier código:

1. Leé este documento completo
2. No hagas cambios no solicitados
3. Mostrá un plan antes de implementar cualquier módulo nuevo
4. Pedí aprobación antes de modificar archivos existentes
5. Avisá SIEMPRE cuando se requiera un nuevo deploy en Vercel

---

## 1. COMANDOS DE DESARROLLO

```bash
npm run dev          # servidor local en http://localhost:3000
npm run build        # build de producción (verifica errores antes de push)
npm run lint         # ESLint
npx tsc --noEmit     # chequeo de tipos sin compilar (ejecutar antes de cada commit)
```

No hay test runner configurado. La verificación es: `tsc --noEmit` limpio + `npm run build` sin errores.

**Deploy:** cada `git push origin master` activa un deploy automático en Vercel. Nunca asumir que un cambio está activo sin hacer el push.

---

## 2. CONTEXTO DEL PROYECTO

### 2.1 Empresa y equipo

- **Empresa:** Cofersa — Mayorista ferretero, Costa Rica
- **Sistema:** CRM personalizado de Gestión de Cartera, Crédito y Cobro (C&C)
- **ERP fuente:** Softland 7.00 — N8N lee directo de Softland y escribe en Supabase (ya NO se usa el cubo Excel). El maestro de clientes sí sigue por Google Apps Script (1 vez al día).
- **URL producción:** https://cyc-cartera-cofersa.vercel.app

### 2.2 Usuarios del sistema

**Verificado contra la tabla `usuarios` real en Supabase (proyecto `cyc-cartera-cofersa`, 08/sep/2026).**

| Usuario               | Rol             | Email                  | Acceso                                                                                                                                                                                                                                                                                 |
| --------------------- | --------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jeffrey Díaz          | COORDINADOR     | jdiaz@cofersa.cr       | Total — todos los módulos y analistas                                                                                                                                                                                                                                                  |
| María Paola Rodríguez | ANALISTA        | mprodriguez@cofersa.cr | Solo su cartera asignada                                                                                                                                                                                                                                                               |
| Angélica Gómez        | ANALISTA        | agomez@cofersa.cr      | Solo su cartera asignada                                                                                                                                                                                                                                                               |
| Jeaneth Aponte        | ANALISTA        | japonte@cofersa.cr     | Solo su cartera asignada — entró jun 2026 en reemplazo de Giovanny Milano (baja hace varios meses, usuario ya desactivado)                                                                                                                                                             |
| Joshua Mora Aguilar   | ANALISTA        | jmora@cofersa.cr       | Solo su cartera asignada — entró 02/sep/2026                                                                                                                                                                                                                                           |
| Jossmin Ordoñez       | ANALISTA_RIESGO | jordonez@mayoreo.biz   | Dashboard + Clientes (solo lectura) + Hub de Reportes. **Pendiente de definir (sep 2026):** además se le va a asignar cartera propia de gestión (Soporte CxC) — con el rol actual NO puede entrar a Mi Cartera/Gestiones/Promesas/Solicitudes (bloqueado server-side). Ver nota abajo. |
| Jorge García Alvarado | GERENCIA        | jgarcia@cofersa.cr     | Solo lectura — mismo alcance que Coordinador, sin poder crear/editar/aprobar (`esSoloLectura()`)                                                                                                                                                                                       |
| Frank Trujillo        | GERENCIA        | ftrujillo@mayoreo.biz  | Ídem                                                                                                                                                                                                                                                                                   |
| Oswaldo Silva Guzmán  | GERENCIA        | osilva@cofersa.cr      | Ídem                                                                                                                                                                                                                                                                                   |

Paula Chavarría (pchavarria@cofersa.cr) sigue en la tabla `usuarios` con rol `ANALISTA` y `activo=true`, pero pasó a Servicio al Cliente y ya no tiene cartera asignada — se deja así por decisión del coordinador (sep 2026), no es un descuido.

**Nomenclatura de roles (jul 2026):** el valor guardado en `usuarios.rol` sigue siendo `COORDINADOR` / `ANALISTA` / `ANALISTA_RIESGO` / `GERENCIA` (así lo comparan ~36 archivos + varias políticas RLS — no se puede cambiar el string sin romper accesos). Para mostrar en pantalla se usa una capa de nombres profesionales (`src/lib/utils/roles.ts`):

- `COORDINADOR` → "Coordinador de Crédito y Cuentas por Cobrar"
- `ANALISTA` → "Analista de Crédito y Cobro"
- `ANALISTA_RIESGO` → "Analista de Riesgo" (ve Dashboard + Clientes de solo lectura + Hub de Reportes; NO ve Mi Cartera/Gestiones/Promesas/Solicitudes, bloqueado también server-side si fuerza la URL)
- `GERENCIA` → "Gerencia" (mismo alcance que Coordinador, solo lectura — ver `esSoloLectura()`)

**⚠️ Caso abierto — Jossmin Ordoñez, ANALISTA_RIESGO con cartera propia (sep 2026):** el modelo actual de rol único no contempla "analista de riesgo que además gestiona su propia cartera". No cambiar su rol a `ANALISTA` sin antes decidir con el coordinador si se resuelve con (a) rol único `ANALISTA` sin acceso de solo-lectura a riesgo, (b) excepción de código en los 4 guards server-side (`mi-cartera`, `gestiones`, `promesas`, `solicitudes`) condicionada a que tenga cartera asignada, o (c) un rol nuevo. Ver debate en curso.

### 2.3 Datos reales que maneja el sistema

- **₡4.02 Billones** en cartera activa
- **1,359 clientes** activos
- **19,600 facturas** pendientes
- **37 vendedores** en Softland
- **Monedas:** CRC (₡) — foco principal

### 2.4 Flujo de datos (NO modificar sin aprobación)

```
TABLAS DE DATOS (pagos, cartera, facturas, saldos_favor):
Softland ERP 7.00
  → N8N (lee directo de Softland y escribe en Supabase)
  → Supabase PostgreSQL (pg_cron procesa stage → tabla final, :05)
  → Next.js / Vercel (frontend)

MAESTRO DE CLIENTES (maestro_clientes):
Softland → Google Apps Script (GAS) → Supabase   [1 vez al día]

Sincronizaciones automáticas N8N: cada hora, lunes a viernes 7:05am–5:05pm (hora Costa Rica).
  - Pagos:                       N8N escribe pagos_stage (:00) → pg_cron fn_sync_pagos procesa tabla pagos (:05)
  - Cartera · Facturas · Saldos: N8N escribe DIRECTO la tabla; los fn_sync_* del :05 solo CUENTAN filas
                                 y registran en sync_log (NO cargan datos).

⚠️ ORIGEN N8N = PRODUCCIÓN, nunca la réplica. La réplica de Softland a veces se queda "pegada" con
   data vieja → las tablas quedan congeladas aunque el historial diga "OK". Síntoma: pagos avanza pero
   cartera/facturas/saldos repiten el mismo conteo y montos (OJO: el sync_id NO sirve de testigo —
   N8N no lo rota por ciclo; el monitor compara conteo + sumas, no el sync_id).
   (Incidente 24–25/06/2026: facturas+saldos apuntaban a la réplica; reconectadas a producción.)

Monitor de frescura: fn_check_sync_salud() (cron check_sync_salud, :15 L–V) notifica al coordinador
   si una tabla deja de actualizarse ≥3 ciclos. Estado en tabla sync_salud.

Monitor de recibos revertidos (ago 2026): fn_check_recibos_reversion() (cron check_recibos_reversion,
   17:15 CR L–V) notifica al coordinador si aparece una línea de `pagos` con monto negativo cuyo
   no_recibo no está en `pagos_anulados` -- señal de que Softland anuló/revirtió un recibo después de
   que N8N ya lo había sincronizado (esa anulación posterior NO se repropaga sola). Caso real: recibo
   R025921326081860001 de FERRETERIA MAFERCO S.A quedó arrastrando -14% en Presupuesto de Cobro hasta
   que se marcó a mano en Pagos Aplicados del Mes. Dedup: no repite la notificación para el mismo
   no_recibo una vez avisado.
```

---

## 3. STACK TECNOLÓGICO (INAMOVIBLE)

| Capa          | Tecnología                           | Notas                                                                             |
| ------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| Frontend      | Next.js 16 (App Router), TypeScript  | Configurado                                                                       |
| Estilos       | Tailwind CSS                         | Con tokens personalizados Cofersa                                                 |
| Base de datos | Supabase (PostgreSQL)                | En producción                                                                     |
| Autenticación | Google OAuth vía Supabase Auth       | @cofersa.cr y @mayoreo.biz (ver `TabUsuarios.tsx` / `api/configuracion/usuarios`) |
| Hosting       | Vercel                               | `cyc-cartera-cofersa.vercel.app`                                                  |
| Email         | Gmail API (token OAuth del analista) | Vía `resolveGmailToken`                                                           |
| PDF           | jsPDF + jspdf-autotable              | Con helpers en `src/lib/reportes/pdf-branding.ts`                                 |
| Excel         | SheetJS (xlsx)                       | En `src/lib/reportes/export-tabla.ts`                                             |
| Charts        | Recharts                             | Solo en pantalla — NO se puede renderizar en jsPDF                                |

---

## 4. IDENTIDAD VISUAL Y DESIGN SYSTEM

### 4.1 Paleta de colores (inamovible)

```css
:root {
  --cofersa-navy: #003b5c; /* Sidebar, headers principales */
  --cofersa-cyan: #009ee3; /* Acento, botones primarios */
  --bg-app: #f0f4f8; /* Fondo de la app */
  --bg-card: #ffffff; /* Cards y paneles */

  /* Semáforo */
  --riesgo-alto: #dc2626; /* Rojo — mora crítica */
  --riesgo-medio: #f59e0b; /* Amarillo — mora en riesgo */
  --riesgo-bajo: #22c55e; /* Verde — al día */

  /* Aging por tramo */
  --aging-aldia: #16a34a; /* Al día — green-600 */
  --aging-1-30: #d97706; /* 1-30d — amber-600 */
  --aging-31-60: #ea580c; /* 31-60d — orange-600 */
  --aging-61-90: #ef4444; /* 61-90d — red-500 */
  --aging-91-120: #dc2626; /* 91-120d — red-600 */
  --aging-120plus: #991b1b; /* +120d — red-800 */
}
```

Los mismos colores en formato RGB para jsPDF están en `src/lib/reportes/pdf-branding.ts` (constante `COL`).

### 4.2 Tipografía

- **Fuente principal:** Nunito (Google Fonts)
- **Montos:** `tabular-nums` siempre (alineación de números)
- **Títulos de página:** 20px / weight 500-600
- **Labels de KPI:** 10-11px / uppercase / letter-spacing

### 4.3 Formato de montos — REGLA CRÍTICA

```typescript
// SIEMPRE usar fmtCRC para montos visibles al usuario
// El equipo NO está acostumbrado a formato K/M
export function fmtCRC(n: number): string {
  return (
    '₡' +
    Math.round(n)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  );
}
// fmtM() solo se permite en tooltips o contextos muy secundarios
// NUNCA usar toLocaleString() — produce espacios en algunos navegadores
```

### 4.4 Layout general

```
┌────────────────────────────────────────────────────┐
│  SIDEBAR (200px)    │  TOPBAR (52px)               │
│  #003B5C            ├──────────────────────────    │
│  Logo + nav items   │  CONTENIDO PRINCIPAL          │
│  + badges por rol   │  background: #EEF2F7          │
│  [perfil usuario]   │  padding: 16px 20px           │
└────────────────────────────────────────────────────┘
```

---

## 5. REGLAS DE DESARROLLO (OBLIGATORIAS)

1. **NO tocar el Sidebar bajo ninguna circunstancia** — está funcionando correctamente en producción. **Excepción autorizada (jul 2026):** se agregaron 3 categorías nuevas (`Control Operativo`, `Conciliación y Caja`, `Inteligencia Financiera`) exclusivas del rol `ANALISTA_RIESGO`, sin modificar los items/roles de las categorías existentes de COORDINADOR/ANALISTA. Cualquier otro cambio al Sidebar sigue requiriendo autorización explícita.
2. **Leer cada archivo antes de modificarlo** — siempre usar el Read tool primero.
3. **No hacer cambios no solicitados** — si se detecta algo mejorable en otro módulo, mencionarlo pero NO modificarlo.
4. **fmtCRC() para TODOS los montos** — sin excepción para valores visibles al usuario.
5. **TypeScript estricto** — no usar `any` salvo casos inevitables (Supabase/jsPDF). Tipos en `src/types/`.
6. **Seguridad de roles del lado del servidor** — nunca confiar solo en el frontend. Usar RLS de Supabase + verificación en Server Components.
7. **Avisar cuando requiera deploy** — después de cada push indicar que Vercel desplegará automáticamente.
8. **Error handling visible** — si una query falla, mostrar mensaje claro al usuario, nunca pantalla en blanco.
9. **Mobile-responsive** — tablas con overflow-x-auto, formularios usables en celular.
   9b. **Tablas densas (Clientes, Pedidos Retenidos, etc.)** — anchos de columna van en un array `COLS` + `<colgroup>` (%) junto con `table-layout: fixed`, NO en clases Tailwind `w-*` sobre `<td>` (no aplican con layout fijo).
10. **Optimistic UI** — actualizar UI inmediatamente al registrar gestiones o aprobar solicitudes.
11. **Verificación visual en navegador** — el login exige Google OAuth (@cofersa.cr); Claude no puede autenticarse. Verificar con `tsc --noEmit` + `npm run build` y pedirle al usuario que confirme visualmente los cambios de UI.

---

## 6. ARQUITECTURA DEL CÓDIGO

### 6.1 Estructura de rutas y route groups

```
src/app/
├── (app)/                    ← Route group autenticado (layout con Sidebar+Topbar)
│   ├── layout.tsx            ← Verifica auth, carga perfil+notificaciones, renderiza Sidebar/Topbar
│   ├── dashboard/            ← /dashboard
│   ├── clientes/[id]/        ← Ficha 360°
│   ├── reportes/             ← Hub + sub-rutas por reporte
│   ├── gestiones/
│   ├── promesas/
│   ├── solicitudes/
│   ├── equipo/
│   ├── mi-cartera/           ← Vista analista de su cartera
│   ├── gestion-cartera/
│   └── gestion-pagos/
├── auth/callback/            ← Callback Google OAuth (Supabase)
├── login/                    ← Pantalla de login
└── api/                      ← API Routes (ver §6.3)
```

**Patrón Server/Client en cada módulo:** el `page.tsx` es siempre un Server Component (verifica auth, hace queries a Supabase, pasa datos). El componente `*-cliente.tsx` o `*-tabs.tsx` es el Client Component (`'use client'`) que maneja estado, interacción y exportaciones.

### 6.2 Sistema de reportes

**Agregar un reporte nuevo requiere exactamente dos pasos:**

1. Añadir entrada en `src/lib/reportes/registry.ts` (catálogo central — define id, título, categoría, roles, href, formatos)
2. Crear la ruta `src/app/(app)/reportes/[slug]/` con `page.tsx` + `*-cliente.tsx`

El Hub (`/reportes`) lee `registry.ts` y renderiza las tarjetas automáticamente agrupadas por categoría. El orden dentro de cada categoría sigue el orden del array `REPORTES`.

**Categorías disponibles:** `GERENCIA` → `VENTAS` → `COBRANZA` → `CONTROL` → `ANALISTA`

**Componente wrapper:** `ReporteShell` (`src/components/reportes/ReporteShell.tsx`) provee la toolbar con botones PDF/Excel/Enviar. Todos los reportes lo usan.

**Patrón de exportación PDF para reportes con visualizaciones complejas:**

```typescript
// Usar helpers de src/lib/reportes/pdf-branding.ts
import {
  COL,
  loadNunito,
  loadLogo,
  drawBrandHeader,
  drawFooters,
} from '@/lib/reportes/pdf-branding';

// Documento como `any` para evitar problemas de tipos con jsPDF
const doc: any = new (jsPDF as any)({ orientation: 'landscape', unit: 'mm', format: 'a4' });
const f = await loadNunito(doc);
const logo = await loadLogo();
const PW = 297,
  PH = 210,
  ML = 12,
  MR = 12;
let y = drawBrandHeader(doc, f, PW, ML, MR, logo);
// ... dibujar contenido manualmente con doc.rect(), doc.text(), autoTable()
drawFooters(doc, f, PW, ML, MR);
```

**Para reportes de tabla simple** (sin gráficos), usar `exportTablaPDF` / `exportTablaExcel` de `src/lib/reportes/export-tabla.ts`.

**IMPORTANTE:** Recharts solo existe en pantalla. Los gráficos en PDF se dibujan manualmente con rectángulos jsPDF.

### 6.3 API Routes

```
src/app/api/
├── clientes/
│   ├── email-cobro/route.ts      ← Email cobro con CC + adjunto PDF/Excel
│   ├── estado-cuenta/route.ts    ← Estado de cuenta por email
│   └── estado/route.ts           ← Cambio de estado del cliente
├── reportes/
│   └── enviar/route.ts           ← Envío de reportes por email (vendedores/equipo)
├── ai/                           ← Endpoints IA (Anthropic SDK)
├── chat/                         ← Chat IA interno
├── configuracion/                ← Configuración del sistema
├── notas-rapidas/                ← CRUD notas rápidas predefinidas
├── saldos-favor/                 ← Saldos a favor de clientes
├── sync/                         ← Trigger manual de sincronización
└── tipo-cambio/                  ← Tipo de cambio USD/CRC
```

### 6.4 Supabase — clientes y autenticación

```typescript
// Server Component (page.tsx, layout.tsx, route.ts)
import { createClient } from '@/lib/supabase/server';
const supabase = await createClient();
const {
  data: { user },
} = await supabase.auth.getUser();

// Client Component
import { createClient } from '@/lib/supabase/client';
const supabase = createClient();

// Service role (solo en API routes o layout para bypass RLS)
import { createClient as createAdminClient } from '@supabase/supabase-js';
const admin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
```

**El `service_role` siempre bypasea RLS** — úsarlo solo cuando sea necesario (ej: leer notificaciones SYNC del coordinador).

Antes de asumir columnas/enums de una tabla o la lógica de un RPC, verificar contra el schema real: hay un MCP de Supabase ya conectado al proyecto (buscar herramientas `list_tables`/`execute_sql` vía ToolSearch) — no adivinar.

---

## 7. BASE DE DATOS SUPABASE

### 7.1 Tablas principales

```sql
cartera (
  id, codigo_cliente, nombre_cliente, vendedor, analista_id,
  no_vencido, mora_1_30, mora_31_60, mora_61_90, mora_91_120,
  mora_120_plus, total, fecha_corte, updated_at
)

facturas (
  id, cliente_id, documento, año, mes, dia,
  no_vencido, mora_1_30, mora_31_60, mora_61_90,
  mora_91_120, mora_120_plus, total, sync_id
)

maestro_clientes (
  id, contribuyente, cliente_cod, cliente_nombre,
  vendedor_nombre, vendedor_cod,
  analista_email, analista_nombre,
  correo, telefono, telefono2, limite_credito, condicion_pago,
  estado_manual, agrupacion, dimension, nombre_cxp,
  asignacion_manual, updated_at
)

gestiones (
  id, cliente_id, usuario_id, fecha, hora,
  tipo,        -- 'Llamada' | 'Email' | 'WhatsApp' | 'Visita' | 'CORREO'
  resultado,   -- 'Promesa OK' | 'No contestó' | 'No ubicado' | 'Pagó' | 'Email enviado' | etc.
  nota, promesa_fecha, promesa_monto, created_at
)

promesas (
  id, cliente_cod, contribuyente, analista_email, monto,
  fecha_creacion, fecha_promesa,
  estado,  -- 'PENDIENTE' | 'CUMPLIDA' | 'INCUMPLIDA' | 'ABONO_PARCIAL' | 'REPROGRAMADA'
  notas, activo, gestion_id, reprogramada_de_id, updated_at
  -- (verificado contra Supabase jul 2026; ver también icp_por_cliente, no documentada abajo)
)

solicitudes (
  id, tipo, cliente_id, solicitante_id, revisor_id,
  monto, monto_actual, monto_solicitado, justificacion,
  comentario_revisor, estado, created_at, updated_at
  -- tipo: 'AUMENTO_LIMITE' | 'EXCEPCION_CREDITO' | 'NOTA_CREDITO'
  -- estado: 'PENDIENTE' | 'EN_REVISION' | 'APROBADA' | 'RECHAZADA'
)

pedidos_retenidos (
  id_pedido, codigo_cliente, fecha_pedido, total_mercaderia, moneda, nivel_precio,
  vendedor, comentario_vendedor, comentario_analista,
  estado_sic,  -- 'Pendiente' | 'Aprobado' | 'Retenido'
  motivo_retencion, resuelto_por, resuelto_en, created_at, anio_mes
)

usuarios (
  id, nombre, email, rol,  -- 'COORDINADOR' | 'ANALISTA'
  avatar_url, activo, created_at
)

notificaciones (
  id, usuario_id, tipo, titulo, mensaje, leida, link, created_at
)

presupuesto_cobro (
  id, anio, mes, cliente_cod, cliente_nombre, vendedor_cod, vendedor_nombre,
  dias_prom, dias_prom_ajustado, ppto_cartera, ppto_nuevas_ventas, ppto_total,
  generado_en, generado_por
)

presupuesto_meta_vendedor (
  id, anio, mes, vendedor_cod, vendedor_nombre,
  meta_sugerida, meta_ajustada, updated_at, updated_por
)
```

### 7.2 RPCs principales

```typescript
// Dashboard analista — todas reciben analista_email: text
fn_dashboard_kpis_analista(analista_email)    // → KpisAnalistaDashboard
fn_dashboard_cola_analista(analista_email)     // → ColaItem[]
fn_dashboard_agenda_analista(analista_email)   // → AgendaGestion[]
fn_dashboard_vendedores_analista(analista_email) // → VendedorResumen[]
fn_dashboard_progreso_analista(analista_email) // → ProgresoDia

// Reportes coordinador
get_kpis_cartera()                            // → KpisCartera[]
fn_analisis_concentracion()                   // → ConcentracionResult (top10 + HHI)
fn_recuperacion_mom(p_meses, p_email)         // → RecupMomMes[] (recaudo mensual)
fn_reporte_plazo_especial(p_vendedor?)        // → facturas con condición especial
fn_presupuesto_preview(p_anio, p_mes)         // → preview presupuesto sin guardar
fn_presupuesto_guardar(p_anio, p_mes)         // → congela presupuesto del mes
fn_recuperacion(p_anio, p_mes)               // → recaudo real vs meta

// Pedidos Retenidos
fn_pedidos_retenidos(p_email?)  // → { kpis, rows } -- pedidos ERP retenidos + score ICP + aging del cliente

// NOTA: mora_91_120 puede ser negativo (ajuste Softland) → usar Math.max(0, v)
```

### 7.3 RLS — Reglas críticas

```sql
-- COORDINADOR ve todo
-- ANALISTA solo ve registros donde analista_id = su propio id
CREATE POLICY "analista_solo_su_cartera" ON cartera
  USING (
    auth.uid() IN (SELECT id FROM usuarios WHERE rol = 'COORDINADOR')
    OR analista_id = auth.uid()
  );
```

### 7.4 Patrón para RPCs con tipo cambiante

```sql
-- DROP FUNCTION IF EXISTS public.fn_nombre(text);
-- CREATE FUNCTION ...
-- (NO usar CREATE OR REPLACE cuando cambian las columnas del RETURNS TABLE)
```

---

## 8. LÓGICA DE NEGOCIO

### Semáforo de urgencia (Cola del analista)

```typescript
// ROJO: mora 61-90d ó 91-120d ó +120d ó promesa vence hoy ó sin gestión ≥10 días
// AMBAR: mora 31-60d ó promesa vence esta semana ó sin gestión ≥5 días
// VERDE: mora 1-30d, seguimiento normal
// prioridad viene de RPC como 'ROJO' | 'AMBAR' | 'VERDE'
// (la BD usa 'AMBAR' sin tilde — así viene del RPC, no cambiar)
```

### KPIs financieros

```typescript
const moraTotal = mora_1_30 + mora_31_60 + mora_61_90 + mora_91_120 + mora_120_plus;
const pctMora = (moraTotal / carteraTotal) * 100;
const DSO = (moraTotal / carteraTotal) * 30;
// mora_91_120 puede ser negativo (ajuste Softland) → Math.max(0, mora_91_120)
```

### safeFilename — helper para nombres de archivo

```typescript
// Exportado desde src/lib/utils/estado-cuenta-export.ts
export function safeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/[^a-zA-Z0-9\s]/g, '') // solo alfanumérico
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}
// Usar SIEMPRE con el nombre del cliente (no el código): estado-cuenta-Ferreteria-El-Tornillo.pdf
```

### Hora Costa Rica

```typescript
// UTC-6 siempre (sin DST). Dos helpers disponibles:
import { hoyISO } from '@/lib/utils/formato'; // '2026-06-12'
import { fechaHoyCR } from '@/lib/reportes/pdf-branding'; // '12/06/2026' (para PDFs)
```

---

## 9. VARIABLES DE ENTORNO

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Email (Gmail API vía OAuth del usuario — ya configurado)
EMAIL_FROM=cyc@cofersa.cr

# IA (Anthropic SDK — en uso para módulos de IA)
ANTHROPIC_API_KEY=

# App
NEXT_PUBLIC_APP_URL=https://cyc-cartera-cofersa.vercel.app
```

---

## 10. MÓDULOS — ESTADO ACTUAL

### ✅ En producción

- **Dashboard** (`/dashboard`) — coordinador (KPIs globales, Mi Equipo) y analista (Cola del día, Por Vendedor, Promesas, Agenda, Progreso)
- **Ficha 360° del cliente** (`/clientes/[id]`) — tabs: Información, Estado de Cuenta (PDF/Excel/Email), Gestiones, Solicitudes
- **Email de cobro** — Para/CC separados por `;`, adjunto toggle, registra gestión tipo CORREO
- **Módulos:** Clientes, Gestiones, Promesas, Solicitudes (flujo analista→coordinador), Mi Equipo, Reportes
- **Notificaciones internas** — badge sidebar + panel
- **Hub de Reportes** — Inteligencia Financiera: Resumen Ejecutivo, Presupuesto de Cobro, Migración Mora · Gestión Comercial: Mora Vendedor, Plazo Especial, Comportamiento Pago · Control de Riesgo: Recuperación, CEI, Aging, Efectividad Gestiones, Estados de Cuenta

### ⏳ Pendiente

| Feature                        | Dependencia                                    | Prioridad   |
| ------------------------------ | ---------------------------------------------- | ----------- |
| Score ICP en Ficha 360°        | Requiere ≥3 meses en `historico_pagos`         | Media       |
| Generador de emails con IA     | `ANTHROPIC_API_KEY` en .env                    | Media       |
| Briefing diario IA coordinador | Anthropic API                                  | Baja        |
| Notas de voz → gestión         | Whisper API                                    | Baja        |
| **SPF/DKIM en DNS**            | Admin DNS `cofersa.cr` — NO es tarea de código | Alta (SPAM) |

**Fix SPAM:** agregar `include:_spf.google.com` al SPF TXT de `cofersa.cr`; configurar DKIM desde Google Workspace Admin → Apps → Gmail → Autenticar correo.

---

## 11. DECISIONES YA TOMADAS (NO reabrir)

| Decisión           | Elección                             | Razón                                                                          |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------------ |
| Color sidebar      | `#003B5C` navy                       | Identidad corporativa                                                          |
| Color acento       | `#009ee3` cyan                       | Identidad corporativa                                                          |
| Fondo app          | `#EEF2F7` gris azulado               | Contrasta con cards blancas                                                    |
| Tipografía         | Nunito                               | Establecida desde versiones anteriores                                         |
| Formato montos     | `fmtCRC()` punto como separador      | `toLocaleString` da espacios en algunos browsers; equipo no acostumbrado a K/M |
| Email              | Gmail API con OAuth del analista     | Ya en producción                                                               |
| PDF genérico       | `export-tabla.ts` (`exportTablaPDF`) | Para tablas simples sin gráficos                                               |
| PDF premium        | `pdf-branding.ts` + jsPDF manual     | Para reportes con visualizaciones; Recharts no renderiza en jsPDF              |
| Excel              | SheetJS (xlsx)                       | Ya en producción                                                               |
| Nombres de archivo | Nombre del cliente (safeFilename)    | Pedido del equipo — más fácil identificar                                      |
| Aging PorVendedor  | Columnas individuales (no barra)     | Solicitado por coordinador para ver tramos exactos                             |
| Para/CC en emails  | `type="text"` (no `type="email"`)    | Para admitir múltiples correos con `;`                                         |
| jsPDF tipado       | `doc: any`                           | Las definiciones de tipos de jsPDF no incluyen todos los métodos usados        |

---

_Documento actualizado: 20 de julio 2026. Actualizar ante cualquier cambio de arquitectura o decisión aprobada._
