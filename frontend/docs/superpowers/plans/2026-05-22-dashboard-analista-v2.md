# Dashboard Analista v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar el dashboard del analista con KPI cards de fondo blanco, eliminar Gestión Rápida y lista de gestiones del día, agregar paneles Por Vendedor / Agenda Compacta / Mi Progreso, y conectar todo con datos reales vía RPCs de Supabase.

**Architecture:** `page.tsx` llama 3 RPCs + 2 queries directas en paralelo como Server Component; los resultados se pasan como props a componentes presentacionales. `DashboardResumen` se reescribe con las nuevas props. Se crean cuatro componentes nuevos: `AgendaCompacta`, `MiProgreso`, `NotasRapidas`, `PorVendedor`. Se eliminan `gestion-rapida.tsx` y `CalendarioNotas.tsx`.

**Tech Stack:** Next.js 15 App Router, TypeScript estricto, Supabase Server Client, Tailwind CSS, `fmtCRC()` de `@/lib/utils/formato`

---

## Mapa de archivos

| Acción     | Archivo                                         | Cambio                                                                |
| ---------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| Crear      | `src/types/dashboard-analista.ts`               | Interfaces para los 3 RPCs y 2 queries                                |
| Modificar  | `src/app/(app)/dashboard/page.tsx`              | `DashboardAnalista`: usar RPCs, nuevo layout, eliminar imports viejos |
| Reescribir | `src/components/analista/DashboardResumen.tsx`  | White KPIs, Cola (5 filas), Promesas (4 filas), nuevas props          |
| Crear      | `src/components/analista/PorVendedor.tsx`       | Panel de distribución de mora por vendedor                            |
| Crear      | `src/components/analista/AgendaCompacta.tsx`    | Agenda hoy+mañana con gestiones y promesas                            |
| Crear      | `src/components/analista/MiProgreso.tsx`        | Barras de progreso: gestiones y meta                                  |
| Crear      | `src/components/analista/NotasRapidas.tsx`      | Extracción del textarea de notas de CalendarioNotas                   |
| Modificar  | `src/components/dashboard/saludo-dashboard.tsx` | Agregar prop `kpis` para strip de métricas                            |
| Eliminar   | `src/components/dashboard/gestion-rapida.tsx`   | Ya no se usa                                                          |
| Eliminar   | `src/components/analista/CalendarioNotas.tsx`   | Reemplazado por AgendaCompacta + NotasRapidas                         |

---

### Task 1: Definir tipos TypeScript para las RPCs

**Archivos:**

- Crear: `src/types/dashboard-analista.ts`

- [ ] **Paso 1: Crear el archivo de tipos**

```typescript
// src/types/dashboard-analista.ts

/**
 * Tipos de retorno de las RPCs del dashboard analista.
 * IMPORTANTE: mora_91_120 puede ser negativo (ajuste de Softland).
 * Siempre usar Math.max(0, kpis.mora_91_120) al renderizar.
 */

export interface KpisAnalistaDashboard {
  total_clientes: number;
  cartera_total: number;
  mora_total: number;
  no_vencido: number;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number; // puede ser negativo
  mora_120_plus: number;
  pct_mora: number;
  gestiones_hoy: number;
  promesas_activas: number;
  promesas_vencen_hoy: number;
  clientes_urgentes: number;
  meta_individual: number;
  cobrado_mes_estimado: number;
  meta_pct: number;
}

export interface VendedorResumen {
  vendedor_nombre: string;
  vendedor_cod: string;
  clientes_asignados: number;
  clientes_con_saldo: number;
  cartera_total: number;
  mora_total: number;
  pct_mora: number;
}

// prioridad usa 'AMBAR' (sin tilde) — así viene de la RPC
export type PrioridadCola = 'ROJO' | 'AMBAR' | 'VERDE';

export interface ColaItem {
  cliente_cod: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  mora_total: number;
  mora_1_30: number;
  mora_31_60: number;
  mora_61_90: number;
  mora_91_120: number;
  mora_120_plus: number;
  cartera_total: number;
  prioridad: PrioridadCola;
  ultima_gestion_fecha: string | null;
  dias_sin_gestion: number;
  tiene_promesa_hoy: boolean;
  promesa_vencida: boolean;
  proxima_accion: string | null;
  proxima_accion_fecha: string | null;
}

export interface AgendaGestion {
  id: string;
  cliente_cod: string;
  proxima_accion: string;
  proxima_accion_fecha: string;
}

export interface AgendaPromesa {
  id: string;
  cliente_nombre: string;
  cliente_cod: string;
  fecha_promesa: string;
  monto: number;
}

export interface PromesaPendiente {
  id: string;
  cliente_nombre: string;
  cliente_cod: string;
  monto: number;
  fecha_promesa: string;
  estado: string;
  monto_abono_parcial: number | null;
}
```

- [ ] **Paso 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Salida esperada: sin errores.

- [ ] **Paso 3: Commit**

```bash
git add src/types/dashboard-analista.ts
git commit -m "feat(dashboard-analista): agregar tipos TypeScript para RPCs"
```

---

### Task 2: Actualizar DashboardAnalista en page.tsx con datos RPC

**Archivos:**

- Modificar: `src/app/(app)/dashboard/page.tsx` — solo la función `DashboardAnalista` (líneas ~358-629)

**Contexto:** La función actual hace múltiples queries directas a tablas. La reemplazamos por 3 RPCs + 2 queries directas, todas en paralelo con `Promise.all`. El layout aún usa los componentes viejos — eso lo arreglamos en Task 9.

- [ ] **Paso 1: Agregar el nuevo import de tipos al inicio de page.tsx**

Localizar la línea de imports al inicio del archivo (después de las últimas importaciones existentes) y agregar:

```typescript
import type {
  KpisAnalistaDashboard,
  VendedorResumen,
  ColaItem as ColaItemRPC,
  AgendaGestion,
  AgendaPromesa,
  PromesaPendiente,
} from '@/types/dashboard-analista';
```

- [ ] **Paso 2: Reemplazar el cuerpo de la función DashboardAnalista**

Reemplazar desde `async function DashboardAnalista({` hasta el `return (` que le corresponde (manteniendo el cierre de la función y el `return` de DashboardCoordinador intactos).

La función completa nueva es:

```typescript
async function DashboardAnalista({ supabase, hoyStr, userEmail, nombre }: {
  supabase: Awaited<ReturnType<typeof createClient>>
  hoyStr: string
  userEmail: string
  nombre: string
}) {
  const manana = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  // ── Llamadas en paralelo ──────────────────────────────────────────────
  const [
    kpisRes,
    vendedoresRes,
    colaRes,
    agendaGestionesRes,
    agendaPromesasRes,
    promesasRes,
  ] = await Promise.allSettled([
    // 1. KPIs
    (supabase as any).rpc('fn_dashboard_analista_kpis', { p_email: userEmail }),

    // 2. Resumen por vendedor
    (supabase as any).rpc('fn_dashboard_vendedores_analista', { p_email: userEmail }),

    // 3. Cola del día (traer 20, mostrar 5)
    (supabase as any).rpc('fn_cola_del_dia', { p_email: userEmail, p_limit: 20 }),

    // 4. Agenda: gestiones con próxima acción hoy o mañana
    supabase.from('gestiones')
      .select('id, cliente_cod, proxima_accion, proxima_accion_fecha')
      .eq('analista_email', userEmail)
      .in('proxima_accion_fecha', [hoyStr, manana])
      .eq('activo', true)
      .order('proxima_accion_fecha', { ascending: true })
      .limit(5),

    // 5. Agenda: promesas pendientes hoy o mañana
    supabase.from('promesas')
      .select('id, cliente_nombre, cliente_cod, fecha_promesa, monto')
      .eq('analista_email', userEmail)
      .eq('estado', 'PENDIENTE')
      .in('fecha_promesa', [hoyStr, manana])
      .order('fecha_promesa', { ascending: true })
      .limit(5),

    // 6. Mis promesas pendientes (panel lateral, máx 5 para deduplica a 4)
    supabase.from('promesas')
      .select('id, cliente_nombre, cliente_cod, monto, fecha_promesa, estado, monto_abono_parcial')
      .eq('analista_email', userEmail)
      .eq('estado', 'PENDIENTE')
      .eq('activo', true)
      .order('fecha_promesa', { ascending: true })
      .limit(5),
  ])

  // ── Extraer datos con fallback seguro ─────────────────────────────────
  const kpisRaw = kpisRes.status === 'fulfilled' && !kpisRes.value.error
    ? (kpisRes.value.data as KpisAnalistaDashboard[] | null)?.[0] ?? null
    : null

  const kpis: KpisAnalistaDashboard = kpisRaw ?? {
    total_clientes: 0, cartera_total: 0, mora_total: 0, no_vencido: 0,
    mora_1_30: 0, mora_31_60: 0, mora_61_90: 0, mora_91_120: 0, mora_120_plus: 0,
    pct_mora: 0, gestiones_hoy: 0, promesas_activas: 0, promesas_vencen_hoy: 0,
    clientes_urgentes: 0, meta_individual: 0, cobrado_mes_estimado: 0, meta_pct: 0,
  }

  const vendedores: VendedorResumen[] = vendedoresRes.status === 'fulfilled' && !vendedoresRes.value.error
    ? (vendedoresRes.value.data as VendedorResumen[] | null) ?? []
    : []

  // Deduplicar cola por cliente_cod (suma de mora si hay duplicados por contribuyente)
  const colaRaw: ColaItemRPC[] = colaRes.status === 'fulfilled' && !colaRes.value.error
    ? (colaRes.value.data as ColaItemRPC[] | null) ?? []
    : []

  const colaDeduplicada: ColaItemRPC[] = colaRaw.reduce((acc: ColaItemRPC[], item) => {
    const existing = acc.find(x => x.cliente_cod === item.cliente_cod)
    if (!existing || item.mora_total > existing.mora_total) {
      return [...acc.filter(x => x.cliente_cod !== item.cliente_cod), item]
    }
    return acc
  }, []).sort((a, b) => {
    const prioOrder: Record<string, number> = { 'ROJO': 0, 'AMBAR': 1, 'VERDE': 2 }
    const pa = prioOrder[a.prioridad] ?? 2
    const pb = prioOrder[b.prioridad] ?? 2
    return pa !== pb ? pa - pb : b.mora_total - a.mora_total
  })

  const agendaGestiones: AgendaGestion[] = agendaGestionesRes.status === 'fulfilled' && !agendaGestionesRes.value.error
    ? (agendaGestionesRes.value.data as AgendaGestion[] | null) ?? []
    : []

  const agendaPromesas: AgendaPromesa[] = agendaPromesasRes.status === 'fulfilled' && !agendaPromesasRes.value.error
    ? (agendaPromesasRes.value.data as AgendaPromesa[] | null) ?? []
    : []

  const promesas: PromesaPendiente[] = promesasRes.status === 'fulfilled' && !promesasRes.value.error
    ? (promesasRes.value.data as PromesaPendiente[] | null) ?? []
    : []

  return (
    <div className="min-h-full" style={{ background: '#EEF2F7' }}>
      <div className="px-4 sm:px-6 pt-5 pb-6">

        {/* Header: saludo + strip de métricas */}
        <div className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <SaludoDashboard nombre={nombre} />
          <StripMetricas kpis={kpis} />
        </div>

        {/* Layout 2 columnas */}
        <div className="flex flex-col lg:flex-row gap-5 lg:items-start">

          {/* Columna principal */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <DashboardResumen
              kpis={kpis}
              cola={colaDeduplicada}
              promesas={promesas}
              hoyStr={hoyStr}
            />
            <PorVendedorPanel vendedores={vendedores} />
          </div>

          {/* Columna derecha ~260px */}
          <div className="w-full lg:w-64 xl:w-72 flex-shrink-0 flex flex-col gap-4">
            <AgendaCompacta
              gestiones={agendaGestiones}
              promesas={agendaPromesas}
              hoyStr={hoyStr}
            />
            <MiProgresoPanel kpis={kpis} />
            <NotasRapidasPanel hoyStr={hoyStr} />
          </div>

        </div>
      </div>
    </div>
  )
}
```

Nota: `StripMetricas`, `PorVendedorPanel`, `AgendaCompacta`, `MiProgresoPanel`, `NotasRapidasPanel` se agregan como imports o componentes inline en tareas posteriores.

- [ ] **Paso 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Salida esperada: solo errores de "Cannot find name" para los componentes nuevos (aún no creados) — eso es esperado en este punto.

- [ ] **Paso 4: Commit**

```bash
git add src/app/(app)/dashboard/page.tsx src/types/dashboard-analista.ts
git commit -m "feat(dashboard-analista): conectar con RPCs en paralelo, preparar layout"
```

---

### Task 3: Reescribir DashboardResumen — KPIs blancos + Cola + Promesas

**Archivos:**

- Reescribir: `src/components/analista/DashboardResumen.tsx`

**Contexto:** El componente actual tiene KPIs con degradados de colores oscuros, y recibe `misRows`, `miCartera`, etc. Las nuevas props son `kpis` (KpisAnalistaDashboard) + `cola` (ColaItemRPC[]) + `promesas` (PromesaPendiente[]) + `hoyStr`. Contiene: KPI cards × 4, Cola del Día (5 filas max), Mis Promesas (4 items max).

- [ ] **Paso 1: Reemplazar el contenido completo del archivo**

```typescript
// src/components/analista/DashboardResumen.tsx
// Columna izquierda del Dashboard Analista: KPIs + Cola del Día + Mis Promesas.
// Panel Por Vendedor vive en PorVendedor.tsx (full-width debajo).

import Link from 'next/link'
import { fmtCRC } from '@/lib/utils/formato'
import type {
  KpisAnalistaDashboard,
  ColaItem,
  PrioridadCola,
  PromesaPendiente,
} from '@/types/dashboard-analista'

export interface DashboardResumenProps {
  kpis:     KpisAnalistaDashboard
  cola:     ColaItem[]
  promesas: PromesaPendiente[]
  hoyStr:   string
}

// ── Helpers de color ──────────────────────────────────────────────────
const prioCfg: Record<PrioridadCola, { dot: string }> = {
  ROJO:  { dot: '#dc2626' },
  AMBAR: { dot: '#f59e0b' },
  VERDE: { dot: '#16a34a' },
}

function accionSugerida(item: ColaItem): string {
  if (item.prioridad === 'ROJO' && item.promesa_vencida) return 'Seguimiento urgente'
  if (item.prioridad === 'ROJO')                         return 'Llamar hoy'
  if (item.prioridad === 'AMBAR' && item.tiene_promesa_hoy) return 'Confirmar pago'
  if (item.prioridad === 'AMBAR')                        return 'Contactar'
  return 'Recordatorio'
}

// ── Componente principal ──────────────────────────────────────────────
export default function DashboardResumen({
  kpis, cola, promesas, hoyStr,
}: DashboardResumenProps) {
  const colaVisible   = cola.slice(0, 5)
  const colaRestantes = Math.max(0, cola.length - 5)
  const promVisible   = promesas.slice(0, 4)
  const promRestantes = Math.max(0, promesas.length - 4)

  return (
    <div className="flex flex-col gap-4">

      {/* ── KPI Cards (4 tarjetas, fondo blanco) ──────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">

        {/* Card 1: Mi Cartera */}
        <KpiCard
          label="Mi Cartera"
          valor={fmtCRC(kpis.cartera_total)}
          badge={`${kpis.total_clientes} clientes`}
          badgeClass="bg-slate-100 text-slate-600"
        />

        {/* Card 2: En Mora */}
        <KpiCard
          label="En Mora"
          valor={fmtCRC(kpis.mora_total)}
          valorClass="text-red-700"
          badge={`${kpis.pct_mora}% de mi cartera`}
          badgeClass="bg-red-50 text-red-700 border border-red-200"
        />

        {/* Card 3: Gestiones Hoy — con barra de progreso */}
        <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
            Gestiones Hoy
          </p>
          <p className="text-lg font-bold tabular-nums text-slate-900 mb-1 leading-tight">
            {kpis.gestiones_hoy}
            <span className="text-sm font-normal text-slate-400">/15</span>
          </p>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#009EE3] rounded-full transition-all"
              style={{ width: `${Math.min((kpis.gestiones_hoy / 15) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Card 4: Promesas Activas */}
        <KpiCard
          label="Promesas Activas"
          valor={String(kpis.promesas_activas)}
          badge={
            kpis.promesas_vencen_hoy > 0
              ? `${kpis.promesas_vencen_hoy} vence${kpis.promesas_vencen_hoy > 1 ? 'n' : ''} hoy`
              : 'Al día'
          }
          badgeClass={
            kpis.promesas_vencen_hoy > 0
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-emerald-50 text-emerald-700'
          }
        />
      </div>

      {/* ── Cola del Día + Mis Promesas en grid ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4">

        {/* Cola del Día */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                Cola del Día
              </p>
              <p className="text-xs font-semibold text-slate-800 mt-0.5">
                Prioridad de contacto
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                {cola.filter(c => c.prioridad === 'ROJO').length}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                {cola.filter(c => c.prioridad === 'AMBAR').length}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                {cola.filter(c => c.prioridad === 'VERDE').length}
              </span>
            </div>
          </div>

          {colaVisible.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-xs text-slate-500">
                Sin clientes con mora pendiente en tu cartera.
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-50">
                {colaVisible.map(item => {
                  const cfg = prioCfg[item.prioridad]
                  const moraCrit = Math.max(0, item.mora_61_90 || 0)
                    + Math.max(0, item.mora_91_120 || 0)
                    + (item.mora_120_plus || 0)
                  const diasLabel =
                    item.dias_sin_gestion === 999
                      ? 'Sin gestiones registradas'
                      : item.dias_sin_gestion >= 7
                      ? `Sin contacto ${item.dias_sin_gestion} días`
                      : null

                  return (
                    <div
                      key={item.cliente_cod}
                      className="px-4 py-2.5 flex items-start gap-3"
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                        style={{ background: cfg.dot }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-800 truncate">
                            {item.cliente_nombre || item.cliente_cod}
                          </p>
                          {moraCrit > 0 && (
                            <p className="text-xs font-bold text-red-700 flex-shrink-0 tabular-nums">
                              {fmtCRC(moraCrit)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-slate-400">{item.cliente_cod}</span>
                          <span className="text-[10px] text-slate-300">·</span>
                          <span className="text-[10px] text-slate-500">
                            {accionSugerida(item)}
                          </span>
                          {diasLabel && (
                            <>
                              <span className="text-[10px] text-slate-300">·</span>
                              <span className={`text-[10px] font-semibold ${
                                item.dias_sin_gestion >= 7 && item.dias_sin_gestion !== 999
                                  ? 'text-red-500'
                                  : 'text-slate-400'
                              }`}>
                                {diasLabel}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {colaRestantes > 0 && (
                <div className="px-4 py-2 border-t border-slate-100 text-center">
                  <Link
                    href="/mi-cartera"
                    className="text-[10px] text-[#009EE3] font-semibold hover:underline"
                  >
                    Ver los {colaRestantes + 5} clientes →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>

        {/* Mis Promesas */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              Mis Promesas
            </p>
            <p className="text-xs font-semibold text-slate-800 mt-0.5">
              {kpis.promesas_activas} pendientes
            </p>
          </div>

          {promVisible.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-xs text-slate-500">
                No hay compromisos de pago pendientes.
              </p>
            </div>
          ) : (
            <>
              <div className="p-3 space-y-2">
                {promVisible.map(p => {
                  const venceHoy = p.fecha_promesa === hoyStr
                  const vencida  = p.fecha_promesa < hoyStr && p.estado === 'PENDIENTE'
                  const bgClass  = vencida || venceHoy ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'
                  const badge    = vencida ? 'VENCIDA' : venceHoy ? 'HOY' : null
                  const badgeCls = vencida
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'

                  return (
                    <div
                      key={p.id}
                      className={`rounded-lg px-3 py-2 border ${bgClass}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-semibold text-slate-800 truncate flex-1">
                          {p.cliente_nombre || p.cliente_cod}
                        </p>
                        {badge && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${badgeCls}`}>
                            {badge}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[10px] text-slate-400">{p.fecha_promesa}</p>
                        <p className="text-xs font-bold text-slate-700 tabular-nums">
                          {fmtCRC(p.monto)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
              {promRestantes > 0 && (
                <div className="px-4 py-2 border-t border-slate-100 text-center">
                  <Link
                    href="/promesas"
                    className="text-[10px] text-[#009EE3] font-semibold hover:underline"
                  >
                    Ver todas →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── KPI Card (fondo blanco) ───────────────────────────────────────────
function KpiCard({
  label, valor, valorClass = 'text-slate-900', badge, badgeClass,
}: {
  label:       string
  valor:       string
  valorClass?: string
  badge:       string
  badgeClass:  string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4">
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-lg font-bold tabular-nums mb-2 leading-tight ${valorClass}`}>
        {valor}
      </p>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${badgeClass}`}>
        {badge}
      </span>
    </div>
  )
}
```

- [ ] **Paso 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "DashboardResumen\|dashboard-analista"
```

Salida esperada: sin errores relacionados con estos archivos.

- [ ] **Paso 3: Commit**

```bash
git add src/components/analista/DashboardResumen.tsx
git commit -m "feat(dashboard-analista): rediseñar KPIs blancos, Cola (5 filas), Promesas (4 items)"
```

---

### Task 4: Crear panel PorVendedor

**Archivos:**

- Crear: `src/components/analista/PorVendedor.tsx`

- [ ] **Paso 1: Crear el componente**

```typescript
// src/components/analista/PorVendedor.tsx
// Panel de distribución de mora por vendedor. Full-width debajo de Cola+Promesas.

import Link from 'next/link'
import { fmtCRC } from '@/lib/utils/formato'
import type { VendedorResumen } from '@/types/dashboard-analista'

interface Props {
  vendedores: VendedorResumen[]
}

export default function PorVendedor({ vendedores }: Props) {
  const visibles   = vendedores.slice(0, 5)
  const restantes  = Math.max(0, vendedores.length - 5)

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
        <div>
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
            Por vendedor
          </p>
          <p className="text-xs font-semibold text-slate-800 mt-0.5">
            Distribución de mora por agente
          </p>
        </div>
        <Link
          href="/mi-cartera"
          className="text-[10px] text-[#009EE3] font-semibold hover:underline"
        >
          Ver Mi Cartera →
        </Link>
      </div>

      {/* Cabecera de columnas */}
      <div className="px-4 py-1.5 grid grid-cols-[1fr_80px_80px_60px] gap-2 bg-slate-50 border-b border-slate-100">
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.4px]">
          Vendedor
        </span>
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.4px] text-right">
          Clientes
        </span>
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.4px] text-right">
          Mora total
        </span>
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.4px] text-right">
          % Mora
        </span>
      </div>

      {visibles.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-xs text-slate-500">Sin datos de vendedores disponibles.</p>
        </div>
      ) : (
        <>
          {visibles.map(v => (
            <div
              key={v.vendedor_cod}
              className="px-4 py-2 grid grid-cols-[1fr_80px_80px_60px] gap-2 items-center border-b border-slate-50 hover:bg-slate-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate">{v.vendedor_nombre}</p>
                <p className="text-[10px] text-slate-400">{v.clientes_con_saldo} con saldo activo</p>
              </div>
              <p className="text-xs text-slate-500 tabular-nums text-right">
                {v.clientes_asignados}
              </p>
              <p className="text-xs font-semibold tabular-nums text-slate-800 text-right">
                {fmtCRC(v.mora_total)}
              </p>
              <div className="text-right">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums ${
                  v.pct_mora >= 40 ? 'bg-red-50 text-red-700'     :
                  v.pct_mora >= 20 ? 'bg-amber-50 text-amber-700' :
                  'bg-emerald-50 text-emerald-700'
                }`}>
                  {v.pct_mora}%
                </span>
              </div>
            </div>
          ))}

          {restantes > 0 && (
            <div className="px-4 py-2 text-center border-t border-slate-100">
              <Link
                href="/mi-cartera"
                className="text-[10px] text-[#009EE3] font-semibold hover:underline"
              >
                Ver los {vendedores.length} vendedores →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Paso 2: Commit**

```bash
git add src/components/analista/PorVendedor.tsx
git commit -m "feat(dashboard-analista): agregar panel Por Vendedor"
```

---

### Task 5: Crear AgendaCompacta

**Archivos:**

- Crear: `src/components/analista/AgendaCompacta.tsx`

**Contexto:** Reemplaza el grid de calendario mensual. Es un Client Component porque formatea fechas con `Intl`. Muestra eventos de hoy y mañana separados en dos secciones.

- [ ] **Paso 1: Crear el componente**

```typescript
'use client'

// src/components/analista/AgendaCompacta.tsx
// Agenda compacta hoy+mañana. Reemplaza el calendario mensual.

import type { AgendaGestion, AgendaPromesa } from '@/types/dashboard-analista'
import { fmtCRC } from '@/lib/utils/formato'

interface Props {
  gestiones: AgendaGestion[]
  promesas:  AgendaPromesa[]
  hoyStr:    string
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

function labelDia(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  return `${DIAS[fecha.getDay()]} ${d} ${MESES[m - 1]}`
}

// Tipo unificado para renderizar items mezclados
type ItemAgenda =
  | { tipo: 'gestion'; id: string; cliente_cod: string; accion: string; fecha: string }
  | { tipo: 'promesa'; id: string; cliente: string; monto: number; fecha: string }

export default function AgendaCompacta({ gestiones, promesas, hoyStr }: Props) {
  const mananaStr = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  function buildItems(fecha: string): ItemAgenda[] {
    const items: ItemAgenda[] = []
    for (const g of gestiones.filter(x => x.proxima_accion_fecha === fecha)) {
      items.push({ tipo: 'gestion', id: g.id, cliente_cod: g.cliente_cod, accion: g.proxima_accion, fecha })
    }
    for (const p of promesas.filter(x => x.fecha_promesa === fecha)) {
      items.push({ tipo: 'promesa', id: p.id, cliente: p.cliente_nombre || p.cliente_cod, monto: p.monto, fecha })
    }
    return items
  }

  const itemsHoy    = buildItems(hoyStr)
  const itemsManana = buildItems(mananaStr)

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-3">
        Agenda
      </p>

      {/* Hoy */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold text-[#009EE3] uppercase tracking-wider mb-2">
          Hoy — {labelDia(hoyStr)}
        </p>
        {itemsHoy.length === 0 ? (
          <p className="text-[10px] text-slate-400 italic">Sin eventos para hoy.</p>
        ) : (
          <div className="space-y-1.5">
            {itemsHoy.map(item => (
              <AgendaItem key={`${item.tipo}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </div>

      <hr className="border-slate-100 my-2" />

      {/* Mañana */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
          {labelDia(mananaStr)}
        </p>
        {itemsManana.length === 0 ? (
          <p className="text-[10px] text-slate-400 italic">Sin eventos.</p>
        ) : (
          <div className="space-y-1.5">
            {itemsManana.map(item => (
              <AgendaItem key={`${item.tipo}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AgendaItem({ item }: { item: ItemAgenda }) {
  const dotColor = item.tipo === 'promesa' ? '#f59e0b' : '#009EE3'
  const texto = item.tipo === 'promesa'
    ? `${item.cliente} · ${fmtCRC(item.monto)}`
    : `${item.cliente_cod} · ${item.accion}`

  return (
    <div className="flex items-start gap-2">
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1"
        style={{ background: dotColor }}
      />
      <p className="text-[10px] text-slate-600 leading-tight">{texto}</p>
    </div>
  )
}
```

- [ ] **Paso 2: Commit**

```bash
git add src/components/analista/AgendaCompacta.tsx
git commit -m "feat(dashboard-analista): crear AgendaCompacta hoy+mañana"
```

---

### Task 6: Crear MiProgreso y NotasRapidas

**Archivos:**

- Crear: `src/components/analista/MiProgreso.tsx`
- Crear: `src/components/analista/NotasRapidas.tsx`

- [ ] **Paso 1: Crear MiProgreso.tsx**

```typescript
// src/components/analista/MiProgreso.tsx
// Barras de progreso: gestiones del día y meta del mes.

import { fmtCRC } from '@/lib/utils/formato'
import type { KpisAnalistaDashboard } from '@/types/dashboard-analista'

interface Props {
  kpis: KpisAnalistaDashboard
}

export default function MiProgreso({ kpis }: Props) {
  const pctGestiones = Math.min((kpis.gestiones_hoy / 15) * 100, 100)
  const pctMeta      = Math.min(kpis.meta_pct, 100)

  const metaBarColor =
    kpis.meta_pct >= 80 ? 'bg-emerald-500' :
    kpis.meta_pct >= 50 ? 'bg-amber-500'   : 'bg-[#009EE3]'

  const metaValorColor =
    kpis.meta_pct >= 80 ? 'text-emerald-600' :
    kpis.meta_pct >= 50 ? 'text-amber-600'   : 'text-slate-700'

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-3">
        Mi progreso
      </p>

      {/* Gestiones hoy */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-slate-500">Gestiones hoy</span>
          <span className="font-semibold tabular-nums">
            {kpis.gestiones_hoy}/15
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#009EE3] rounded-full transition-all"
            style={{ width: `${pctGestiones}%` }}
          />
        </div>
      </div>

      {/* Meta del mes (estimado) */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-slate-500">
            Meta del mes
            <span className="text-slate-400 ml-1">(est.)</span>
          </span>
          <span className={`font-semibold tabular-nums ${metaValorColor}`}>
            {kpis.meta_pct}%
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${metaBarColor}`}
            style={{ width: `${pctMeta}%` }}
          />
        </div>
        <p className="text-[9px] text-slate-400 mt-1 text-right tabular-nums">
          {fmtCRC(kpis.cobrado_mes_estimado)} de {fmtCRC(kpis.meta_individual)}
        </p>
      </div>

      {/* Clientes urgentes */}
      <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
        <span className="text-[10px] text-slate-500">Clientes urgentes (+60d)</span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded tabular-nums ${
          kpis.clientes_urgentes > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
        }`}>
          {kpis.clientes_urgentes}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Paso 2: Crear NotasRapidas.tsx** (extraído de `CalendarioNotas.tsx`)

```typescript
'use client'

// src/components/analista/NotasRapidas.tsx
// Textarea de notas con auto-guardado. Columna derecha del dashboard.
// Extraído de CalendarioNotas.tsx — solo la sección de notas, sin el calendario.

import { useState, useCallback, useRef } from 'react'
import { FileText, Check, Loader2 } from 'lucide-react'

interface Props {
  hoyStr: string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const MESES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
]

function labelFecha(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${y}`
}

export default function NotasRapidas({ hoyStr }: Props) {
  const [nota,      setNota]      = useState('')
  const [loaded,    setLoaded]    = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cargar nota al montar
  const cargarNota = useCallback(async () => {
    try {
      const res  = await fetch(`/api/notas-rapidas?fecha=${hoyStr}`)
      const data = await res.json()
      setNota(data.contenido ?? '')
    } catch {
      // sin conexión — campo vacío
    } finally {
      setLoaded(true)
    }
  }, [hoyStr])

  // useEffect equivalente pero con ref para ejecutar solo una vez
  const loadedRef = useRef(false)
  if (!loadedRef.current && typeof window !== 'undefined') {
    loadedRef.current = true
    cargarNota()
  }

  const guardarNota = useCallback(async (contenido: string) => {
    setSaveState('saving')
    try {
      const res = await fetch('/api/notas-rapidas', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fecha: hoyStr, contenido }),
      })
      setSaveState(res.ok ? 'saved' : 'error')
    } catch {
      setSaveState('error')
    }
    setTimeout(() => setSaveState('idle'), 2000)
  }, [hoyStr])

  function handleChange(v: string) {
    setNota(v)
    setSaveState('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => guardarNota(v), 1000)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex-1">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={13} style={{ color: '#009ee3' }} />
          <span className="text-xs font-medium text-slate-700">Notas Rápidas</span>
        </div>
        <div className="text-[10px] h-4 flex items-center gap-1">
          {saveState === 'saving' && (
            <>
              <Loader2 size={10} className="animate-spin text-slate-400" />
              <span className="text-slate-400">Guardando...</span>
            </>
          )}
          {saveState === 'saved' && (
            <>
              <Check size={10} className="text-emerald-500" />
              <span className="text-emerald-500">Guardado</span>
            </>
          )}
          {saveState === 'error' && (
            <span className="text-red-500">Error al guardar</span>
          )}
        </div>
      </div>

      <div className="p-3">
        <p className="text-[10px] text-slate-400 mb-2">{labelFecha(hoyStr)}</p>
        {!loaded ? (
          <div className="flex justify-center py-6">
            <Loader2 size={16} className="animate-spin text-slate-300" />
          </div>
        ) : (
          <textarea
            value={nota}
            onChange={e => handleChange(e.target.value)}
            placeholder="Notas del día..."
            rows={4}
            className="w-full resize-none border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 bg-white focus:outline-none focus:border-[#009ee3] transition"
            style={{ fontFamily: 'Nunito, sans-serif', lineHeight: '1.6' }}
          />
        )}
        <p className="text-[9px] text-slate-400 text-right mt-1">
          Guardado automático
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Paso 3: Commit**

```bash
git add src/components/analista/MiProgreso.tsx src/components/analista/NotasRapidas.tsx
git commit -m "feat(dashboard-analista): crear MiProgreso y NotasRapidas"
```

---

### Task 7: Actualizar SaludoDashboard — agregar strip de métricas

**Archivos:**

- Modificar: `src/components/dashboard/saludo-dashboard.tsx`

**Contexto:** El strip de métricas usa datos de `kpis` pero `SaludoDashboard` es un Client Component. El strip se renderiza junto al saludo como un elemento aparte dentro del mismo componente, recibiendo `kpis` como prop opcional (para no romper el dashboard del coordinador que no pasa kpis).

- [ ] **Paso 1: Localizar las props del componente**

El archivo tiene:

```typescript
interface Props {
  nombre: string;
}
```

- [ ] **Paso 2: Agregar la prop kpis y el import del tipo**

Reemplazar la sección de imports + interface:

```typescript
'use client';

/**
 * SaludoDashboard
 * Saludo dinámico según hora local de Costa Rica (America/Costa_Rica).
 * Es un client component para poder leer la hora del navegador.
 */

import { useEffect, useState } from 'react';
import type { KpisAnalistaDashboard } from '@/types/dashboard-analista';

interface Props {
  nombre: string;
  kpis?: KpisAnalistaDashboard;
}
```

- [ ] **Paso 3: Agregar el StripMetricas al return del componente**

Reemplazar el `return` completo:

```typescript
  if (!saludo) return null

  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 pb-1">
      {/* Saludo */}
      <div>
        <h2
          style={{
            fontSize:   '20px',
            fontWeight: 500,
            color:      '#1e293b',
            lineHeight: 1.2,
            margin:     0,
          }}
        >
          {saludo}, <span style={{ fontWeight: 700 }}>{nombre}</span>
        </h2>
        <p
          style={{
            fontSize:  '13px',
            color:     '#64748b',
            marginTop: '3px',
            lineHeight: 1,
          }}
        >
          {fecha}
        </p>
      </div>

      {/* Strip de métricas rápidas (solo analista) */}
      {kpis && (
        <div className="flex gap-0 items-center bg-white border border-slate-200 rounded-lg overflow-hidden flex-shrink-0">
          <div className="px-3 py-2 border-r border-slate-100 text-center">
            <p className="text-sm font-bold tabular-nums text-slate-800">{kpis.gestiones_hoy}</p>
            <p className="text-[9px] text-slate-400 uppercase tracking-[0.4px]">gestiones</p>
          </div>
          <div className="px-3 py-2 border-r border-slate-100 text-center">
            <p className={`text-sm font-bold tabular-nums ${kpis.promesas_activas > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {kpis.promesas_activas}
            </p>
            <p className="text-[9px] text-slate-400 uppercase tracking-[0.4px]">promesas</p>
          </div>
          <div className="px-3 py-2 text-center">
            <p className={`text-sm font-bold tabular-nums ${kpis.clientes_urgentes > 0 ? 'text-red-600' : 'text-slate-800'}`}>
              {kpis.clientes_urgentes}
            </p>
            <p className="text-[9px] text-slate-400 uppercase tracking-[0.4px]">urgentes</p>
          </div>
        </div>
      )}
    </div>
  )
```

- [ ] **Paso 4: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "saludo-dashboard"
```

Salida esperada: sin errores.

- [ ] **Paso 5: Commit**

```bash
git add src/components/dashboard/saludo-dashboard.tsx
git commit -m "feat(dashboard-analista): agregar strip de métricas en SaludoDashboard"
```

---

### Task 8: Wiring final en page.tsx — layout, imports, cleanup

**Archivos:**

- Modificar: `src/app/(app)/dashboard/page.tsx`

**Contexto:** Hay que agregar los imports de los nuevos componentes, crear `StripMetricas` como función inline (ya que usa `kpis` del Server Component directamente), y el componente `PorVendedorPanel`, `MiProgresoPanel`, `NotasRapidasPanel` que son wrappers. También hay que eliminar los imports viejos de `GestionRapida`, `DashboardResumen` con las props viejas y `CalendarioNotas`.

- [ ] **Paso 1: Reemplazar el bloque de imports al inicio del archivo**

Localizar la sección de imports al inicio (líneas 1-14 del archivo actual) y reemplazar:

```typescript
import { createClient } from '@/lib/supabase/server';
import { fmtM, fmtFecha, hoyISO } from '@/lib/utils/formato';
import {
  TrendingDown,
  Users,
  ClipboardCheck,
  Handshake,
  Activity,
  Shield,
  Timer,
  CheckCircle2,
} from 'lucide-react';
import DashboardResumen from '@/components/analista/DashboardResumen';
import PorVendedor from '@/components/analista/PorVendedor';
import AgendaCompacta from '@/components/analista/AgendaCompacta';
import MiProgreso from '@/components/analista/MiProgreso';
import NotasRapidas from '@/components/analista/NotasRapidas';
import SaludoDashboard from '@/components/dashboard/saludo-dashboard';
import type {
  KpisAnalistaDashboard,
  VendedorResumen,
  ColaItem as ColaItemRPC,
  AgendaGestion,
  AgendaPromesa,
  PromesaPendiente,
} from '@/types/dashboard-analista';
```

- [ ] **Paso 2: Localizar y reemplazar el return del DashboardAnalista**

Dentro de `DashboardAnalista`, el `return (` contiene el layout con los componentes viejos. Reemplazar el return completo con el nuevo layout:

```typescript
  return (
    <div className="min-h-full" style={{ background: '#EEF2F7' }}>
      <div className="px-4 sm:px-6 pt-5 pb-6">

        {/* Header: saludo + strip de métricas */}
        <div className="mb-5">
          <SaludoDashboard nombre={nombre} kpis={kpis} />
        </div>

        {/* Layout 2 columnas */}
        <div className="flex flex-col lg:flex-row gap-5 lg:items-start">

          {/* Columna principal */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <DashboardResumen
              kpis={kpis}
              cola={colaDeduplicada}
              promesas={promesas}
              hoyStr={hoyStr}
            />
            <PorVendedor vendedores={vendedores} />
          </div>

          {/* Columna derecha */}
          <div className="w-full lg:w-64 xl:w-72 flex-shrink-0 flex flex-col gap-4">
            <AgendaCompacta
              gestiones={agendaGestiones}
              promesas={agendaPromesas}
              hoyStr={hoyStr}
            />
            <MiProgreso kpis={kpis} />
            <NotasRapidas hoyStr={hoyStr} />
          </div>

        </div>
      </div>
    </div>
  )
```

- [ ] **Paso 3: Eliminar los tipos, variables y helpers que ya no se usan en DashboardAnalista**

Los siguientes ya no se usan en `DashboardAnalista` (pero algunos los usa `DashboardCoordinador` — verificar antes de borrar):

- `interface CarteraRow` — solo analista la usaba → **ELIMINAR**
- `interface CarteraRowFull` — solo analista → **ELIMINAR**
- `interface ClienteOpt` → import de gestion-rapida ya no existe → **ELIMINAR el import**
- `const tipoIconAnalista` (al final del archivo) → ya no se usa → **ELIMINAR**
- La línea `import GestionRapida from '@/components/dashboard/gestion-rapida'` → **ELIMINAR** (ya reemplazada en el paso anterior)
- La línea `import type { ClienteOpt } from '@/components/dashboard/gestion-rapida'` → **ELIMINAR**
- La línea `import CalendarioNotas from '@/components/analista/CalendarioNotas'` → **ELIMINAR**
- La línea `import { fetchCalendarEvents } from '@/lib/services/googleCalendarService'` → **ELIMINAR** (ya no se usa en analista)
- La línea `import type { CalendarEvent } from '@/lib/services/googleCalendarService'` → **ELIMINAR**
- El bloque `const _unused = { AlertTriangle }` → **ELIMINAR** (y el import de `AlertTriangle`)

- [ ] **Paso 4: Verificar que compila sin errores**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

Salida esperada: sin errores (o solo advertencias menores de `eslint-disable`).

- [ ] **Paso 5: Commit**

```bash
git add src/app/(app)/dashboard/page.tsx
git commit -m "feat(dashboard-analista): wiring final del layout v2"
```

---

### Task 9: Eliminar archivos obsoletos

**Archivos:**

- Eliminar: `src/components/dashboard/gestion-rapida.tsx`
- Eliminar: `src/components/analista/CalendarioNotas.tsx`

- [ ] **Paso 1: Verificar que nadie más los importa**

```bash
grep -r "gestion-rapida" /c/Projects/cyc-cofersa/src --include="*.tsx" --include="*.ts"
grep -r "CalendarioNotas" /c/Projects/cyc-cofersa/src --include="*.tsx" --include="*.ts"
```

Salida esperada: cero resultados.

- [ ] **Paso 2: Eliminar los archivos**

```bash
rm /c/Projects/cyc-cofersa/src/components/dashboard/gestion-rapida.tsx
rm /c/Projects/cyc-cofersa/src/components/analista/CalendarioNotas.tsx
```

- [ ] **Paso 3: Verificar que el build sigue limpio**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Salida esperada: sin errores nuevos.

- [ ] **Paso 4: Commit**

```bash
git add -A
git commit -m "feat(dashboard-analista): eliminar gestion-rapida y CalendarioNotas"
```

---

### Task 10: Deploy y validación final

- [ ] **Paso 1: Push**

```bash
git push origin master
```

Verificar en Vercel dashboard que el build completa sin errores.

- [ ] **Paso 2: Checklist de validación visual**

Ingresar al SIC como analista y verificar cada punto:

- [ ] KPI cards tienen fondo blanco (no navy, verde, teal ni gris oscuro)
- [ ] Gestión Rápida no aparece en ninguna parte del dashboard
- [ ] Lista de "Gestiones de Hoy" no aparece como sección separada
- [ ] Cola del Día muestra máximo 5 filas + link "Ver los N clientes →"
- [ ] Panel "Por vendedor" aparece con datos reales (mora por agente)
- [ ] Calendario mensual NO aparece — reemplazado por Agenda compacta (hoy/mañana)
- [ ] Ningún emoji en los empty states
- [ ] Todos los montos usan `fmtCRC()` (sin abreviaciones M/B/K)
- [ ] Sidebar completamente intacto
- [ ] No hay secciones con espacio vacío visible
- [ ] Strip de métricas (gestiones / promesas / urgentes) aparece junto al saludo
- [ ] Panel "Mi Progreso" muestra barras de gestiones y meta con etiqueta "(est.)"
- [ ] Notas Rápidas aparece en la columna derecha y guarda automáticamente

- [ ] **Paso 3: Verificar datos reales**

Abrir DevTools → Network y verificar:

- Las 3 RPCs responden 200 (`fn_dashboard_analista_kpis`, `fn_dashboard_vendedores_analista`, `fn_cola_del_dia`)
- Los montos en KPIs son los mismos que en el módulo Mi Cartera
- La Cola muestra clientes en orden ROJO → AMBAR → VERDE

---

## Self-Review: Cobertura del Spec

**Sección 2.1 — Eliminar Gestión Rápida:** ✅ Task 8 elimina import, Task 9 elimina archivo.

**Sección 2.2 — Eliminar lista Gestiones de Hoy:** ✅ Task 8 reemplaza el `return` que tenía esa sección.

**Sección 2.3 — KPI cards blancas:** ✅ Task 3 reescribe `DashboardResumen` con `bg-white`.

**Sección 2.4 — Agenda compacta:** ✅ Task 5 crea `AgendaCompacta.tsx`.

**Sección 2.5 — Por Vendedor:** ✅ Task 4 crea `PorVendedor.tsx`.

**Sección 2.6 — Mi Progreso:** ✅ Task 6 crea `MiProgreso.tsx`.

**Sección 2.7 — Cola máx 5 filas + dedup:** ✅ Task 3 implementa `colaVisible = cola.slice(0, 5)` + dedup en Task 2.

**Sección 2.8 — Promesas máx 4 items:** ✅ Task 3 implementa `promVisible = promesas.slice(0, 4)`.

**Sección 2.9 — Empty states sin emojis:** ✅ Task 3 usa texto plano en todos los empty states.

**Sección 2.10 — Strip de métricas:** ✅ Task 7 agrega el strip en `SaludoDashboard`.

**PASO 1 — RPCs:** ✅ Task 2 implementa las 3 RPCs + 2 queries en `Promise.allSettled`.

**PASO 3 — Layout final:** ✅ Task 8 arma el grid 2 columnas con `flex-col gap-4`.

**PASO 4 — Loading states:** ⚠️ Los Server Components no necesitan loaders propios (el navegador muestra el loader de página durante el fetch). Si se quieren skeletons, requeriría convertir el data-fetching a Client Components con `useEffect`. El spec menciona skeletons pero el resto de la app usa Server Components. **Decisión: omitir skeletons** para mantener consistencia arquitectural — el layout carga de una sola vez como todo el resto de la app.

**mora_91_120 negativo:** ✅ `Math.max(0, item.mora_91_120)` aplicado en `DashboardResumen` (línea de `moraCrit`).

**fmtCRC en todos los montos:** ✅ Todos los componentes usan `fmtCRC()`, no `fmtM()`.

**meta_pct label "(est.)":** ✅ Presente en `MiProgreso.tsx`.
