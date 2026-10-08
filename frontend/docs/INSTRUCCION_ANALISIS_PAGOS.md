# INSTRUCCIÓN — Módulo Análisis de Pagos + Sidebar

## Para Claude Code · Sprint Inteligencia de Negocio · 29 mayo 2026

---

## CONTEXTO

Sistema SIC — Next.js 14 App Router, TypeScript estricto, Tailwind CSS v4, Supabase PostgreSQL, Vercel.

Este sprint tiene **3 tareas** en orden de ejecución:

1. Actualizar sidebar del **analista** (2 cambios quirúrgicos)
2. Actualizar sidebar del **coordinador** (restructura de secciones)
3. Construir el módulo **Análisis de Pagos** en `/gestion-pagos/analisis`

---

## TAREA 1 — SIDEBAR DEL ANALISTA (cambios mínimos)

**Archivo:** el componente de navegación lateral — buscar en `src/components/`, `src/app/layout.tsx` o equivalente donde se renderiza el sidebar con items condicionales por rol.

**Cambio 1 — Renombrar sección:**

```
ANTES: "INTELIGENCIA"
DESPUÉS: "INTELIGENCIA DE NEGOCIO"
```

**Cambio 2 — Eliminar ítem:**
Eliminar el ítem "Presupuesto de Cobro" (ruta `/reportes/presupuesto`) del sidebar del analista.

**Cambio 3 — Mantener ítem existente:**
El ítem "Análisis de Pagos" ya existe en el sidebar del analista apuntando a `/gestion-pagos/analisis`. No mover ni cambiar la ruta — solo asegurarse de que queda visible en la sección "INTELIGENCIA DE NEGOCIO".

**Lo que NO cambia en el sidebar del analista:**

- Dashboard
- Mi Cartera
- Gestiones de Cartera: Clientes, Gestiones, Promesas, Solicitudes
- Cartera Vencida
- Gestiones del Período
- Tipo de cambio en el footer del sidebar
- Cualquier otro ítem existente

---

## TAREA 2 — SIDEBAR DEL COORDINADOR (restructura)

**Mismo archivo** que la Tarea 1.

La nueva estructura para el rol COORDINADOR debe quedar así:

```
[Logo Cofersa / SIC]

Dashboard

──────────────────
GESTIÓN DE CARTERA
  → Clientes           (/clientes)
  → Gestiones          (/gestiones)
  → Promesas           (/promesas)
  → Solicitudes        (/solicitudes)

──────────────────
ADMINISTRACIÓN
  → Mi Equipo          (/equipo)

──────────────────
INTELIGENCIA DE NEGOCIO
  → Análisis de Pagos  (/gestion-pagos/analisis)

──────────────────
REPORTES
  → Hub de Reportes    (/reportes)

──────────────────
CONFIGURACIÓN          (/configuracion)

──────────────────
[Footer: Tipo de cambio BCCR]
```

**Notas importantes:**

- El ítem "REPORTES" apunta a `/reportes` que ya existe como hub. No crear página nueva.
- "CONFIGURACIÓN" es un ítem suelto sin subsección, tal como está hoy.
- Eliminar del sidebar del coordinador: "Presupuesto de Cobro", "Cartera Vencida" como ítem suelto (pasa a ser un reporte dentro del hub de Reportes en un sprint futuro), "Gestiones del Período" como ítem suelto.

---

## TAREA 3 — MÓDULO ANÁLISIS DE PAGOS

**Archivo a reemplazar:** `/app/gestion-pagos/analisis/page.tsx`

Este archivo actualmente muestra un placeholder "Módulo en construcción". Reemplazarlo completamente con el módulo funcional descrito a continuación.

### Restricción de acceso

```typescript
// El módulo es accesible para AMBOS roles.
// La diferencia es en los DATOS que ven, no en el acceso.
// NO redirigir a ningún rol — ambos acceden.
```

---

## DISEÑO — SEGUIR EXACTAMENTE EL DESIGN SYSTEM

```css
--cofersa-navy: #003b5c --cofersa-cyan: #009ee3 --bg-app: #eef2f7 --bg-card: #ffffff
  /* Semáforo ICP */ EXCELENTE (85-100): #16a34a BUENO (70-84): #22c55e REGULAR (50-69): #f59e0b
  MALO (25-49): #ea580c MUY MALO (0-24): #dc2626;
```

**Tipografía:** Nunito
**Formato montos:** `fmtCRC()` de `src/lib/utils/formato.ts`
**NUNCA:** `toLocaleString()`

---

## ESTRUCTURA DEL MÓDULO

### Header de página

```
Título: "Análisis de Pagos"
Subtítulo: "Comportamiento histórico · Rankings · Alertas · Concentración de riesgo"

Selector de período (derecha):
  - Últimos 3 meses
  - Últimos 6 meses (default)
  - Últimos 9 meses
```

### 4 tabs de navegación

```
🏆 Ranking de clientes
👥 Perfil por vendedor
⚠️ Alertas de deterioro  [badge con número]
🎯 Concentración de riesgo
```

---

## LÓGICA DE ROL — CRÍTICA

Toda query a Supabase debe respetar esta regla:

```typescript
// ANALISTA: solo ve clientes cuyos vendedores le están asignados
const esAnalista = session.user.rol === 'ANALISTA';
const filtroAnalista = esAnalista ? `vendedor_cod.in.(${vendedoresPropios})` : null; // coordinador ve todo

// vendedoresPropios se obtiene así:
const { data: vendedores } = await supabase
  .from('vendedores')
  .select('cod')
  .eq('analista_email', session.user.email)
  .eq('activo', true);
```

**Esta lógica aplica a LAS 4 VISTAS sin excepción.**

---

## TAB 1 — RANKING DE CLIENTES

### KPI cards (fila superior, 4 cards)

```
Card 1: ICP promedio cartera
  Valor: promedio ponderado del campo icp calculado (ver abajo)
  Color: #009ee3
  Sub: "sobre 100 puntos"

Card 2: Pagan a tiempo
  Valor: % clientes con días_atraso_promedio ≤ 0
  Color: #16a34a
  Sub: "pagan antes o en fecha"

Card 3: Pagadores críticos
  Valor: COUNT clientes con score ICP < 25
  Color: #dc2626
  Sub: "ICP < 25 — MUY MALO"

Card 4: Días atraso promedio
  Valor: promedio de dias_atraso de tabla pagos (período seleccionado)
  Sub: "ponderado por período"
```

### Filtros

```
- Búsqueda libre por nombre de cliente
- Por analista (coordinador: todos | analista: oculto/fijo)
- Por supervisor (coordinador: todos | analista: sus supervisores)
- Por vendedor (coordinador: 37 vendedores | analista: sus vendedores)
- Por clasificación ICP: Todos / EXCELENTE / BUENO / REGULAR / MALO / MUY MALO
- Por dimensión: Todos / Grandes / Medianos / Pequeños (campo dimension de maestro_clientes)
- Ordenar por: ICP ascendente (default) / ICP descendente / Días atraso ↑ / Cartera mayor a menor
```

### Tabla principal

Columnas:

```
# | Cliente | Vendedor | Score ICP [barra visual] | Clasificación [badge] |
Días atraso prom. | Facturas pagadas | Tendencia 3m | Cartera actual
```

Lógica de cada columna:

**Score ICP:**

```typescript
// Calcular desde tabla pagos con ponderación por período
// Últimos 3 meses: peso 50%, meses 4-6: 30%, meses 7-9: 20%
// ICP = 100 - (días_atraso_ponderado normalizado a escala 0-100)
// Máximo penalización: 90+ días = score 0
// Score negativo (pagó anticipado) = score 100
```

**Tendencia 3m:**
Comparar ICP actual vs ICP hace 3 meses. Mostrar:

- `▼ N pts` en rojo si bajó
- `▲ N pts` en verde si subió
- `— sin cambio` si varió menos de 3 puntos

**Barra visual del ICP:**
Barra horizontal de color proporcional al score, color según clasificación.

**Paginación:** 25 clientes por página, servidor.

### Query principal

```typescript
// Calcular ICP por cliente desde tabla pagos
// JOIN con maestro_clientes para datos del cliente
// JOIN con vendedores para vendedor y analista
// Filtrar por período seleccionado
// Aplicar filtro de rol (analista ve solo sus vendedores)
```

---

## TAB 2 — PERFIL POR VENDEDOR

### KPI cards (4 cards)

```
Card 1: Mejor ICP promedio — nombre del vendedor con mayor ICP prom. de su cartera
Card 2: Mayor concentración de riesgo — vendedor con mayor % clientes ICP < 50
Card 3: Mayor % pago puntual — vendedor con mayor % clientes que pagan a tiempo
Card 4: Peor días atraso prom. — vendedor con mayor días_atraso promedio
```

### Tabla de vendedores

**37 vendedores** (o los asignados al analista si es analista).

Columnas:

```
# | Vendedor | Clientes totales | ICP promedio [barra] |
% pagan a tiempo | Días atraso prom. | Clientes ICP crítico (<50)
```

Ordenado por ICP promedio ascendente (los peores primero para acción inmediata).

**Filtros:**

- Por supervisor (coordinador: todos | analista: sus supervisores)
- Ordenar por: ICP prom. / % pago puntual / días atraso / clientes críticos

### Query

```typescript
// GROUP BY vendedor_cod
// AVG(dias_atraso) de tabla pagos JOIN maestro_clientes
// COUNT clientes con ICP < 50
// Filtrar vendedores según rol
```

---

## TAB 3 — ALERTAS DE DETERIORO

### KPI cards (4 cards)

```
Card 1: Deterioro crítico — clientes cuyo ICP bajó > 20 pts en 3 meses — color #dc2626
Card 2: Deterioro moderado — ICP bajó 10-20 pts — color #f59e0b
Card 3: En recuperación — ICP subió > 15 pts — color #16a34a
Card 4: Sin historial suficiente — menos de 5 pagos registrados
```

### Lógica de deterioro

```typescript
// ICP actual: calculado sobre los últimos 3 meses
// ICP anterior: calculado sobre los 3 meses previos a eso (meses 4-6)
// Variación = ICP actual - ICP anterior
// Deterioro crítico: variación < -20
// Deterioro moderado: variación entre -20 y -10
// Recuperación: variación > +15
```

### Cards de alerta (no tabla)

Mostrar como cards individuales, agrupadas:

**Sección "Deterioro crítico"** — fondo rojo suave (#FCEBEB)
Cada card muestra:

```
Nombre del cliente
Vendedor · Analista · Cartera actual
ICP hace 3 meses → ICP actual [variación en rojo]
Días atraso anterior: Xd | Días atraso actual: Xd | En mora: ₡X
```

**Sección "Deterioro moderado"** — fondo ámbar suave (#FAEEDA)
Mismo formato pero colores ámbar.

**Sección "En recuperación"** — fondo verde suave (#E1F5EE) — colapsada por defecto

**Ordenamiento:** por magnitud de caída (mayor caída primero).

---

## TAB 4 — CONCENTRACIÓN DE RIESGO

**Solo visible para COORDINADOR.**
Si el usuario es ANALISTA mostrar mensaje: "Esta vista está disponible para el coordinador."

### KPI cards (4 cards)

```
Card 1: Top 10 clientes / mora total — % que representan
Card 2: Top 3 vendedores / mora total — % que concentran
Card 3: Clientes "Grandes" / mora total — % por dimensión
Card 4: Índice de concentración — ALTO / MEDIO / BAJO según HHI
```

### Barra visual de distribución

Barra horizontal segmentada donde cada segmento es un cliente del top 10, con color por ICP. El segmento final es "Resto". Hover muestra nombre y %.

### Tabla top 10

Columnas:

```
# | Cliente | Vendedor | Mora total | % del total mora |
ICP [badge] | Riesgo acumulado (% acumulado del top)
```

El "riesgo acumulado" se pone en rojo cuando supera el 40% — señal de alta concentración.

### Query

```typescript
// SELECT cliente_cod, SUM(mora_1_30 + mora_31_60 + mora_61_90 + mora_91_120 + mora_120_plus) as mora_total
// FROM cartera
// JOIN maestro_clientes USING (cliente_cod)
// GROUP BY cliente_cod
// ORDER BY mora_total DESC
// LIMIT 10
```

---

## TABLAS SUPABASE INVOLUCRADAS

```sql
pagos           -- fuente del ICP y días de atraso
                -- campos clave: cliente_cod, fecha_pago, fecha_vencimiento_factura,
                --               dias_atraso, monto_pagado

maestro_clientes -- nombre, vendedor_cod, analista_email, dimension, agrupacion

cartera         -- saldos por tramo para concentración de riesgo
                -- mora_1_30, mora_31_60, mora_61_90, mora_91_120, mora_120_plus

vendedores      -- cod, nombre, analista_email, supervisor_cod
                -- para filtros y para verificar qué vendedores ve cada analista

supervisores    -- para el filtro de supervisor en la vista del coordinador
```

---

## CÁLCULO DEL ICP — ESPECIFICACIÓN EXACTA

```typescript
function calcularICP(diasAtraso: number[]): number {
  // diasAtraso: array de días de atraso por cada pago
  // Negativo = pagó anticipado (se trata como 0 para el cálculo)
  const promedioAjustado =
    diasAtraso
      .map((d) => Math.max(0, d)) // negativos → 0
      .reduce((a, b) => a + b, 0) / diasAtraso.length;

  // Escala: 0 días atraso = 100 puntos
  //         90+ días atraso = 0 puntos
  const score = Math.max(0, Math.round(100 - (promedioAjustado / 90) * 100));
  return score;
}

// Clasificación:
// 85-100: EXCELENTE (#16a34a)
// 70-84:  BUENO (#22c55e)
// 50-69:  REGULAR (#f59e0b)
// 25-49:  MALO (#ea580c)
// 0-24:   MUY MALO (#dc2626)
```

**Nota:** Esta lógica ya está implementada en el módulo de clientes (Ficha 360°). Reutilizar la función existente — no reimplementar.

---

## COMPONENTES A CREAR

```
/app/gestion-pagos/analisis/
  page.tsx                  ← página principal (Server Component)

/components/analisis-pagos/
  AnalisisPagosTabs.tsx     ← navegación entre tabs (Client)
  TabRankingClientes.tsx    ← tab 1
  TabPerfilVendedor.tsx     ← tab 2
  TabAlertasDeterioro.tsx   ← tab 3
  TabConcentracion.tsx      ← tab 4
  ICPBadge.tsx              ← badge reutilizable de clasificación ICP
  ICPBar.tsx                ← barra visual de ICP reutilizable
  KPICardAnalisis.tsx       ← card de KPI para este módulo
```

---

## CONSIDERACIONES TÉCNICAS

1. **Server Component para carga inicial** — la página carga los datos del primer tab (Ranking) en el servidor. Los otros tabs cargan al hacer clic (client-side fetch).

2. **RLS ya activo** en todas las tablas. Las queries del servidor usan service role solo cuando es necesario para bypasear RLS en agregaciones.

3. **Paginación server-side** en el Tab 1 — 25 clientes por página para no cargar los 1.293 de una vez.

4. **El período seleccionado** (3/6/9 meses) pasa como query param y afecta todas las queries de todos los tabs.

5. **No usar `toLocaleString()`** — usar `fmtCRC()` de `src/lib/utils/formato.ts` para todos los montos.

6. **Reutilizar** el componente de badge de ICP que ya existe en la Ficha 360° del cliente.

7. **El tab de Concentración** verifica el rol en el Server Component y muestra el mensaje de acceso restringido si es analista — no redirige, solo muestra el mensaje dentro del tab.

---

## ORDEN DE IMPLEMENTACIÓN

1. Cambios en el sidebar (Tarea 1 y 2) — más rápido, sin riesgo
2. Página base con los 4 tabs vacíos — confirmar navegación
3. Tab Ranking (más complejo, es el principal)
4. Tab Perfil por vendedor
5. Tab Alertas de deterioro
6. Tab Concentración de riesgo

**Confirmar con Jeffrey después de cada tab antes de continuar.**

---

## ENTREGABLE ESPERADO

- Sidebar analista actualizado (sin Presupuesto de Cobro, sección renombrada)
- Sidebar coordinador con nueva estructura
- Módulo `/gestion-pagos/analisis` funcional con datos reales de Supabase
- Ambos perfiles acceden al módulo con datos filtrados según su rol
- Tab Concentración solo visible para coordinador

---

_Instrucción generada el 29/05/2026 · Sprint Inteligencia de Negocio_
_COFERSA / OLO · Sistema SIC · Confidencial_
