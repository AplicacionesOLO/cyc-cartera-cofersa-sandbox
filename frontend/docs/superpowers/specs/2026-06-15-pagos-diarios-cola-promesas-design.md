# Diseño — Mejoras al SIC aprovechando pagos diarios

**Fecha:** 2026-06-15
**Autor:** Jeffrey Díaz (con Claude Code)
**Estado:** Aprobado para planificación

---

## Contexto

La tabla `pagos` ahora se sincroniza cada hora vía N8N (≈73,160 filas, nov 2025 → presente),
por lo que el detalle de pagos está al día. Esto habilita tres mejoras que antes no eran
posibles con datos rezagados. Las tres comparten el tema "pagos al día" pero son
**independientes** y se implementan por separado.

### Hallazgos técnicos clave

- **`pagos` es por factura:** cada fila es un pago aplicado a una factura. Un mismo `no_recibo`
  genera varias filas (el cliente paga un paquete de facturas). Por eso el monto de un pago
  casi nunca coincide exacto con una promesa → el matching es por
  **cliente + ventana de fechas + monto acumulado**, no por monto exacto.
  Columnas relevantes: `cliente_cod`, `fecha_pago`, `monto_pago`, `no_recibo`, `tipo_pago`.
- **Conciliación actual:** el cron nocturno `mark-promesas-incumplidas` marca INCUMPLIDA toda
  promesa PENDIENTE vencida **sin mirar pagos** (marca incumplida aunque el cliente haya pagado).
- **Regla ⑦ ya existente** en `cola-analista.ts`: `mora_total < ₡100.000 → fuera de la cola`.
  Como `cartera` también sincroniza por hora, cuando un cliente paga su mora baja casi en
  tiempo real y sale solo de la cola.
- **Chips redundantes** en `tabla-promesas.tsx:440-454`: "Ver cliente" y "Gestión origen"
  llaman ambos a `onVerCliente` (mismo destino), y el contenido de la gestión origen ya se
  muestra en el cuerpo de la tarjeta.

### Fuera de alcance (decisión explícita)

- **No se toca el KPI "Recuperado del mes".** Mide el monto cobrado por pagos; se mantiene como
  está. (Nota: hoy `recuperadoMes` en `cola-analista.ts` se deriva de promesas CUMPLIDAS; no se
  modifica en este trabajo.)
- No se modifica el Sidebar ni el flujo de datos Softland → N8N → Supabase.

---

## Pieza 1 — Señal de pago reciente en la cola del analista

### Propósito

Hacer visible que un cliente está pagando, **sin** cambiar las reglas de exclusión (siguen
guiadas por la mora real). Criterio conservador acordado: la exclusión la decide la mora;
el pago solo informa.

### Cambios

- En `computarColaDia` (`src/lib/utils/cola-analista.ts`), agregar una consulta a `pagos`:
  suma de `monto_pago` por `cliente_cod` con `fecha_pago >= hoy − 5 días`.
- Nuevo campo en `CarteraRow`:
  ```ts
  pago_reciente: { monto: number; dias: number } | null
  ```
  `dias` = días desde el pago más reciente dentro de la ventana.
- La vista `mi-cartera-view.tsx` y la cola del Dashboard pintan un badge verde
  **"Pagó ₡X · hace Nd"** cuando `pago_reciente != null`.

### No cambia

- Ninguna regla de inclusión/exclusión ni el scoring. La regla ⑦ (mora < ₡100K → fuera)
  sigue siendo la única que saca clientes por bajo monto.

### Constante

- `VENTANA_PAGO_RECIENTE = 5` (días).

---

## Pieza 2 — Auto-conciliación de promesas por monto acumulado

### Propósito

Cerrar automáticamente las promesas vencidas usando los pagos reales, eliminando falsos
INCUMPLIDA y reduciendo el trabajo manual.

### Disparador

Renombrar el cron nocturno `mark-promesas-incumplidas` → **`conciliar-promesas`**
(misma programación: 00:00 hora Costa Rica / 06:00 UTC, vía pg_cron).
Evalúa cada promesa con `estado = 'PENDIENTE'`, `activo != false` y `fecha_promesa < hoy`.

### Lógica de conciliación

Para cada cliente con promesas vencidas:

1. Construir el **pool de pagos** del cliente: suma de `monto_pago` con `fecha_pago` entre la
   `fecha_creacion` **más antigua** de sus promesas vencidas y hoy (inclusive).
2. Procesar sus promesas vencidas **de la más antigua a la más nueva** (`fecha_promesa` asc),
   consumiendo el pool para evitar contar un mismo pago dos veces:
   - **Pool asignado ≥ monto prometido** → `CUMPLIDA`
     · `comentario_validacion = 'Conciliación automática: ₡X en pagos desde la promesa'`
     · notificación "Promesa cumplida automáticamente · ₡X detectados"
   - **0 < pool asignado < monto** → `ABONO_PARCIAL`
     · `monto_abono_parcial = <asignado>`
     · evento + notificación de abono detectado
   - **pool asignado = 0** → `INCUMPLIDA` (comportamiento actual)
     · notificación de incumplimiento (igual que hoy)
3. En todos los casos automáticos: `validado_por = 'sistema'`, `fecha_validacion = hoy`,
   y se agrega un evento al timeline (`eventos`).

### Ejemplo

Promesa de **₡100.000**. El cliente registra un pago cuyo recibo aplica a varias facturas
(p. ej. filas de ₡40.000 + ₡35.000 + ₡25.000). La **suma = ₡100.000 ≥ ₡100.000** → la promesa
se marca **CUMPLIDA**. (La suma puede provenir de uno o varios recibos dentro de la ventana.)

### Notas

- El matching es heurístico (cliente + ventana + monto acumulado); no pretende ligar un pago a
  una factura específica. Es suficiente para el seguimiento operativo de promesas.
- La conciliación no altera la `cartera` ni la mora real; solo el estado de la promesa.

---

## Pieza 3 — Rediseño de la página de Promesas

Archivos: `src/app/(app)/promesas/page.tsx`, `src/components/promesas/tabla-promesas.tsx`.

### Acumulación de promesas viejas

Se resuelve con la Pieza 2: las vencidas se auto-cierran cada noche, así que dejan de
acumularse por meses. La vista por defecto se mantiene mostrando solo promesas **abiertas**
(ya excluye CUMPLIDA/INCUMPLIDA/REPROGRAMADA).

### Chips redundantes

- Eliminar el chip **"Gestión origen"** (mismo destino que "Ver cliente"; su contenido ya
  aparece en el cuerpo de la tarjeta).
- Mantener un único botón de navegación **"Ver ficha"** + los botones de acción
  (Cumplida / Abono / Incumplida / Reprogramar).

### Paginación

- Paginación **client-side de 12 tarjetas por página** (2 columnas × 6 filas), con el mismo
  estilo de números ya usado en Ranking de Clientes y Sincronización.
- Resetear a página 1 cuando cambian filtros/búsqueda.

---

## Orden de implementación sugerido

1. **Pieza 2** primero (resuelve la acumulación que afecta a la Pieza 3).
2. **Pieza 3** (rediseño visual, ya con la acumulación bajo control).
3. **Pieza 1** (señal informativa en la cola; independiente).

## Verificación

- `npx tsc --noEmit` limpio + `npm run build` sin errores (no hay test runner).
- Pieza 2: prueba manual en datos reales — verificar que una promesa vencida con pago suficiente
  pasa a CUMPLIDA, una con pago parcial a ABONO_PARCIAL, y una sin pago a INCUMPLIDA, sin
  doble conteo entre dos promesas del mismo cliente.
- Pieza 3: revisar que la paginación, el filtro por defecto y el botón único funcionen en
  desktop y móvil.
- Cada push a `master` despliega automáticamente en Vercel.
