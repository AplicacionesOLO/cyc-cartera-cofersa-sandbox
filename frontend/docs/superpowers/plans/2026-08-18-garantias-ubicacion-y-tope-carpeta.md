# Garantías — Ubicación completa visible + tope de 25 por carpeta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer visible el texto completo de Ubicación en la tabla de garantías (sin necesitar "Ver Ficha") y bloquear el registro/edición de una garantía cuando su carpeta física ya tiene 25 garantías activas en bóveda, sugiriendo automáticamente la siguiente carpeta disponible.

**Architecture:** 2 RPCs nuevos en Postgres (`fn_contar_garantias_en_carpeta`, `fn_siguiente_carpeta_disponible`) que son la única fuente de verdad del conteo; se consultan desde el modal de alta/edición (UX en vivo + auto-sugerencia) y se repiten como validación autoritativa en el servidor (`POST`/`PATCH`). El cambio de Ubicación visible es puramente de layout (CSS/columnas), sin tocar backend.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Supabase (Postgres, RPC vía `supabase-js`), Tailwind CSS.

**Spec de referencia:** [`docs/superpowers/specs/2026-08-18-garantias-ubicacion-y-tope-carpeta-design.md`](../specs/2026-08-18-garantias-ubicacion-y-tope-carpeta-design.md)

**No hay test runner en este proyecto** (confirmado en CLAUDE.md) — la verificación de cada tarea es `npx tsc --noEmit` + `npm run build` sin errores, más confirmación visual de Jeffrey al final (el login OAuth impide que Claude verifique en el navegador).

---

### Task 1: Constante del tope + confirmar catálogo como definitivo

**Files:**

- Modify: `src/lib/auditoria-legal/ubicacion-archivo.ts`

- [ ] **Step 1: Quitar la advertencia de "placeholder" y agregar la constante del tope**

Reemplazar el comentario de cabecera (líneas 6-11) — que hoy dice que el catálogo es un placeholder pendiente de confirmar — porque Jeffrey ya confirmó que **Archivero 1/2, Bóveda de Seguridad · Gaveta A-D · Carpeta N.°** son los nombres reales:

```typescript
// src/lib/auditoria-legal/ubicacion-archivo.ts
//
// Catálogo de ubicación física estructurada (Mueble/Archivero + Gaveta/Caja +
// Carpeta N.°) para reemplazar el campo de texto libre "Código de Archivo".
//
// Confirmado por Jeffrey (ago 2026): estos SÍ son los nombres reales del
// mobiliario de la oficina de Cofersa (Archivero 1/2, Bóveda de Seguridad ·
// Gaveta A-D · Carpeta N.°). Sigue siendo la única constante que hay que tocar
// si el mobiliario cambia (no hay CHECK de estos valores en la base a
// propósito, ver la migración garantias_origen_registro_ubicacion_estructurada
// -- así, cambiar un nombre acá no requiere una migración).
export const MUEBLES_ARCHIVO = [
  { value: 'ARCHIVERO_1', label: 'Archivero Principal 1', corto: 'Archivero 1' },
  { value: 'ARCHIVERO_2', label: 'Archivero Principal 2', corto: 'Archivero 2' },
  { value: 'BOVEDA_SEGURIDAD', label: 'Bóveda de Seguridad', corto: 'Bóveda de Seguridad' },
] as const;
```

(El resto del archivo, `GAVETAS_ARCHIVO` en adelante, queda igual.)

Al final del archivo (después de `formatearUbicacionArchivo`), agregar:

```typescript
/**
 * Tope de garantías físicas por carpeta (combinación exacta Mueble + Gaveta +
 * Carpeta) -- mismo número que usa el RPC `fn_contar_garantias_en_carpeta` en
 * la base. Sólo se usa acá para el mensaje/UX del modal de alta y edición; la
 * regla que de verdad bloquea vive en el RPC y en la validación server-side de
 * POST/PATCH -- si este número cambia algún día, hay que actualizarlo en LOS
 * DOS lugares (este archivo y la migración del RPC).
 */
export const TOPE_GARANTIAS_POR_CARPETA = 25;
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a este archivo.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auditoria-legal/ubicacion-archivo.ts
git commit -m "chore(garantias): confirma catálogo de ubicación como definitivo + tope de carpeta

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: RPCs de Postgres — conteo y siguiente carpeta disponible

**Files:**

- Create: `supabase/migrations/20260818_garantias_tope_carpeta.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Tope de 25 garantías por carpeta física (combinación exacta Mueble+Gaveta+
-- Carpeta). Sólo cuentan las garantías EN_BOVEDA + activo=true -- una que ya
-- se despachó a vendedor o fue sustituida no ocupa espacio físico real en esa
-- carpeta. Se usan desde el modal (UX en vivo) y desde POST/PATCH de
-- /api/auditoria-legal/garantias (validación autoritativa, nunca confiar sólo
-- en el cliente).

CREATE OR REPLACE FUNCTION public.fn_contar_garantias_en_carpeta(
  p_mueble text, p_gaveta text, p_carpeta integer, p_excluir_id integer DEFAULT NULL
)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::integer
  FROM garantias
  WHERE ubicacion_archivero_mueble = p_mueble
    AND ubicacion_archivero_gaveta = p_gaveta
    AND ubicacion_archivero_carpeta = p_carpeta
    AND estado_custodia = 'EN_BOVEDA'
    AND activo = true
    AND (p_excluir_id IS NULL OR id != p_excluir_id);
$function$
;

-- Primer número de carpeta (a partir de p_carpeta_desde, dentro del mismo
-- Mueble+Gaveta) que todavía tiene cupo (< 25). Recorre carpetas consecutivas
-- -- no hay límite superior porque los números de carpeta no tienen techo.
CREATE OR REPLACE FUNCTION public.fn_siguiente_carpeta_disponible(
  p_mueble text, p_gaveta text, p_carpeta_desde integer DEFAULT 1
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_carpeta integer := GREATEST(1, p_carpeta_desde);
  v_conteo integer;
BEGIN
  LOOP
    v_conteo := public.fn_contar_garantias_en_carpeta(p_mueble, p_gaveta, v_carpeta);
    EXIT WHEN v_conteo < 25;
    v_carpeta := v_carpeta + 1;
  END LOOP;
  RETURN v_carpeta;
END;
$function$
;
```

- [ ] **Step 2: Aplicar la migración**

Usar la herramienta MCP de Supabase ya conectada al proyecto (`apply_migration`, buscarla vía ToolSearch si aparece diferida) con el SQL de arriba. Nombre de la migración: `garantias_tope_carpeta`.

- [ ] **Step 3: Verificar que los RPCs quedaron creados**

Con la misma MCP de Supabase, ejecutar (vía `execute_sql`):

```sql
SELECT fn_contar_garantias_en_carpeta('ARCHIVERO_1', 'GAVETA_A', 999999);
-- Esperado: 0 (no debería haber ninguna garantía real en una carpeta 999999)

SELECT fn_siguiente_carpeta_disponible('ARCHIVERO_1', 'GAVETA_A', 999999);
-- Esperado: 999999 (esa carpeta ya está libre, así que es la misma que se pidió)
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260818_garantias_tope_carpeta.sql
git commit -m "feat(garantias): RPCs de conteo y siguiente carpeta disponible

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Validación autoritativa en el alta (`POST`)

**Files:**

- Modify: `src/app/api/auditoria-legal/garantias/route.ts:41-94`

- [ ] **Step 1: Mover el bloque de validación de ubicación después de crear el cliente de Supabase**

Hoy el bloque `hayUbicacion` (líneas 41-61) corre ANTES de `const supabase = await createClient()` (línea 78) porque sólo valida formato — pero el chequeo del tope necesita una consulta a la base, así que hace falta `supabase` ya creado. El resto de la función (auth, resolución de rol) también vive después de esa línea, así que el chequeo del tope se agrega ahí, no en el bloque de formato.

Reemplazar el bloque completo `hayUbicacion` (líneas 41-61) — la parte de FORMATO no cambia, sólo se agrega el chequeo de tope inmediatamente después de la validación de rol (línea 94, después de `if (usuario?.rol === 'ANALISTA_RIESGO') { ... }`):

Primero, importar la constante del tope al principio del archivo (junto al resto de imports de `ubicacion-archivo`):

```typescript
import {
  esMuebleValido,
  esGavetaValida,
  formatearUbicacionArchivo,
  TOPE_GARANTIAS_POR_CARPETA,
} from '@/lib/auditoria-legal/ubicacion-archivo';
```

El bloque `hayUbicacion` (líneas 41-61) se deja intacto tal cual está (sigue siendo sólo validación de formato, sin tocar la base).

Después del bloque de rol (justo después de la línea `if (usuario?.rol === 'ANALISTA_RIESGO') { return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 }) }`), agregar:

```typescript
// Tope de 25 garantías por carpeta (combinación exacta Mueble+Gaveta+Carpeta,
// sólo cuenta EN_BOVEDA + activo=true -- ver fn_contar_garantias_en_carpeta).
// Se valida acá server-side de forma autoritativa aunque el modal ya avise
// en vivo: nunca confiar sólo en el frontend (CLAUDE.md regla 6).
if (hayUbicacion && ubicacionMuebleFinal && ubicacionGavetaFinal && ubicacionCarpetaFinal) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conteoCarpeta, error: conteoErr } = await (supabase as any).rpc(
    'fn_contar_garantias_en_carpeta',
    {
      p_mueble: ubicacionMuebleFinal,
      p_gaveta: ubicacionGavetaFinal,
      p_carpeta: ubicacionCarpetaFinal,
    },
  );
  if (conteoErr) {
    return NextResponse.json(
      { error: `Error al validar la carpeta: ${conteoErr.message}` },
      { status: 500 },
    );
  }
  if ((conteoCarpeta as number) >= TOPE_GARANTIAS_POR_CARPETA) {
    return NextResponse.json(
      {
        error: `${ubicacionArchivero} ya tiene ${TOPE_GARANTIAS_POR_CARPETA} garantías -- elegí otra carpeta.`,
      },
      { status: 400 },
    );
  }
}
```

Nota: `ubicacionMuebleFinal`, `ubicacionGavetaFinal`, `ubicacionCarpetaFinal` y `ubicacionArchivero` ya existen como variables (asignadas en el bloque `hayUbicacion` original, líneas 43-45 y 57-60) y siguen en scope porque son `let`/`const` de nivel de función, no del bloque `if`.

- [ ] **Step 2: Verificar tipos y build**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auditoria-legal/garantias/route.ts
git commit -m "feat(garantias): valida tope de 25 por carpeta en el alta (POST)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Validación autoritativa en la edición (`PATCH`)

**Files:**

- Modify: `src/app/api/auditoria-legal/garantias/[id]/route.ts:242-277`

- [ ] **Step 1: Agregar el chequeo de tope al bloque `tocaUbicacion`**

Importar la constante junto al resto de imports de `ubicacion-archivo`:

```typescript
import {
  esMuebleValido,
  esGavetaValida,
  formatearUbicacionArchivo,
  TOPE_GARANTIAS_POR_CARPETA,
} from '@/lib/auditoria-legal/ubicacion-archivo';
```

Dentro del bloque `if (tocaUbicacion) { ... }` (líneas 253-277), después de las 3 validaciones de formato (mueble/gaveta/carpeta, líneas 258-266) y ANTES de calcular `nuevoTexto` (línea 272), agregar el chequeo de tope — sólo si la ubicación realmente cambia (si el mueble/gaveta/carpeta resultante es idéntico al actual, no hace falta recontar):

```typescript
// Tope de 25 por carpeta -- sólo si la ubicación resultante es distinta de
// la actual (si no cambió nada, no hace falta recontar: ya estaba dentro
// del tope cuando se guardó la última vez). Se excluye esta misma garantía
// del conteo (p_excluir_id) para no contarse a sí misma al mover dentro de
// la misma carpeta o al re-guardar sin cambios reales.
const ubicacionCambio =
  mueble !== actual.ubicacion_archivero_mueble ||
  gaveta !== actual.ubicacion_archivero_gaveta ||
  carpeta !== actual.ubicacion_archivero_carpeta;
if (ubicacionCambio) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conteoCarpeta, error: conteoErr } = await (supabase as any).rpc(
    'fn_contar_garantias_en_carpeta',
    {
      p_mueble: mueble,
      p_gaveta: gaveta,
      p_carpeta: carpeta,
      p_excluir_id: garantiaId,
    },
  );
  if (conteoErr) {
    return NextResponse.json(
      { error: `Error al validar la carpeta: ${conteoErr.message}` },
      { status: 500 },
    );
  }
  if ((conteoCarpeta as number) >= TOPE_GARANTIAS_POR_CARPETA) {
    return NextResponse.json(
      {
        error: `${formatearUbicacionArchivo(mueble, gaveta, carpeta)} ya tiene ${TOPE_GARANTIAS_POR_CARPETA} garantías -- elegí otra carpeta.`,
      },
      { status: 400 },
    );
  }
}
```

- [ ] **Step 2: Verificar tipos y build**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/auditoria-legal/garantias/[id]/route.ts"
git commit -m "feat(garantias): valida tope de 25 por carpeta en la edición (PATCH)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Modal — conteo en vivo, bloqueo y auto-sugerencia de carpeta

**Files:**

- Modify: `src/app/(app)/auditoria-legal/garantias/ModalRegistrarGarantia.tsx`

- [ ] **Step 1: Importar la constante del tope**

Modificar el import existente de `ubicacion-archivo.ts` (línea 7):

```typescript
import {
  MUEBLES_ARCHIVO,
  GAVETAS_ARCHIVO,
  TOPE_GARANTIAS_POR_CARPETA,
} from '@/lib/auditoria-legal/ubicacion-archivo';
```

- [ ] **Step 2: Agregar estado del conteo, con debounce, junto al resto de estado del formulario**

Después de la línea `const [carpeta, setCarpeta] = useState(...)` (línea 133), agregar:

```typescript
// Tope de 25 garantías por carpeta (Spec, ago 2026): se consulta en vivo
// (debounce 300ms, mismo patrón que Hacienda/saldo) apenas los 3 campos de
// ubicación están completos. null = todavía no se consultó o el RPC falló
// (no bloquea la captura -- el submit igual valida server-side).
const [conteoCarpeta, setConteoCarpeta] = useState<number | null>(null);
const [buscandoSiguienteCarpeta, setBuscandoSiguienteCarpeta] = useState(false);
```

- [ ] **Step 3: Agregar el efecto que consulta el conteo**

Después del `useEffect` que consulta Hacienda en edición (línea 165-174, el que termina en `}, [garantia])`), agregar:

```typescript
// Conteo en vivo de la carpeta elegida -- se recalcula cada vez que cambia
// cualquiera de los 3 campos. p_excluir_id excluye esta misma garantía en
// edición (si no, se contaría a sí misma al re-guardar sin mover nada).
useEffect(() => {
  if (!puedeEditarUbicacion || !mueble || !gaveta || !carpeta.trim()) {
    setConteoCarpeta(null);
    return;
  }
  const carpetaNum = Number(carpeta);
  if (!Number.isInteger(carpetaNum) || carpetaNum <= 0) {
    setConteoCarpeta(null);
    return;
  }
  let cancelado = false;
  const t = setTimeout(async () => {
    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: err } = await (supabase as any).rpc('fn_contar_garantias_en_carpeta', {
        p_mueble: mueble,
        p_gaveta: gaveta,
        p_carpeta: carpetaNum,
        p_excluir_id: garantia?.id ?? null,
      });
      if (!cancelado && !err) setConteoCarpeta(data as number);
    } catch {
      /* silencioso -- el submit igual valida server-side */
    }
  }, 300);
  return () => {
    cancelado = true;
    clearTimeout(t);
  };
}, [mueble, gaveta, carpeta, puedeEditarUbicacion, garantia?.id]);

const carpetaLlena = conteoCarpeta !== null && conteoCarpeta >= TOPE_GARANTIAS_POR_CARPETA;

// "Usar Carpeta N.° siguiente disponible" -- busca la primera carpeta libre
// desde la actual (o desde 1 si aún no hay número) en el mismo Mueble+Gaveta.
async function usarSiguienteCarpetaDisponible() {
  if (!mueble || !gaveta) return;
  setBuscandoSiguienteCarpeta(true);
  try {
    const supabase = createClient();
    const desde = Number(carpeta) || 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: err } = await (supabase as any).rpc('fn_siguiente_carpeta_disponible', {
      p_mueble: mueble,
      p_gaveta: gaveta,
      p_carpeta_desde: desde,
    });
    if (!err && data) setCarpeta(String(data));
  } finally {
    setBuscandoSiguienteCarpeta(false);
  }
}
```

- [ ] **Step 4: Bloquear el submit cuando la carpeta está llena**

En `handleSubmit`, después de la validación existente de mueble/gaveta/carpeta (línea 318-322: el bloque `if (puedeEditarUbicacion && (!mueble || !gaveta || ...))`), agregar:

```typescript
if (puedeEditarUbicacion && carpetaLlena) {
  setError(
    `Esa carpeta ya tiene ${TOPE_GARANTIAS_POR_CARPETA} garantías -- elegí otra carpeta o usá "Siguiente disponible".`,
  );
  return;
}
```

- [ ] **Step 5: Mostrar el contador y el botón de auto-sugerencia junto al campo Carpeta N.°**

Reemplazar el bloque del campo "Carpeta N.°" (líneas 653-660):

```typescript
              <div>
                <label className={LABEL}>Carpeta N.° *</label>
                <input
                  type="number" inputMode="numeric" min={1} step={1}
                  value={carpeta} onChange={e => setCarpeta(e.target.value)}
                  className={INPUT} placeholder="4"
                />
              </div>
```

por:

```typescript
              <div>
                <label className={LABEL}>Carpeta N.° *</label>
                <input
                  type="number" inputMode="numeric" min={1} step={1}
                  value={carpeta} onChange={e => setCarpeta(e.target.value)}
                  className={INPUT} placeholder="4"
                />
                {/* Contador en vivo (Spec, ago 2026): sólo se muestra una vez que
                    el RPC respondió -- null mientras no hay ubicación completa
                    o mientras el RPC todavía no contesta. */}
                {conteoCarpeta !== null && !carpetaLlena && (
                  <p className={HINT}>{conteoCarpeta}/{TOPE_GARANTIAS_POR_CARPETA} garantías en esa carpeta</p>
                )}
                {carpetaLlena && (
                  <div className="mt-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2">
                    <p className="text-[11px] text-red-700">Carpeta llena ({conteoCarpeta}/{TOPE_GARANTIAS_POR_CARPETA})</p>
                    <button
                      type="button"
                      onClick={usarSiguienteCarpetaDisponible}
                      disabled={buscandoSiguienteCarpeta}
                      className="mt-1 text-[11px] font-semibold text-[#009ee3] hover:underline disabled:opacity-60"
                    >
                      {buscandoSiguienteCarpeta ? 'Buscando...' : 'Usar Carpeta N.° siguiente disponible'}
                    </button>
                  </div>
                )}
              </div>
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/auditoria-legal/garantias/ModalRegistrarGarantia.tsx
git commit -m "feat(garantias): conteo en vivo y auto-sugerencia de carpeta en el modal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Tabla — Ubicación completa visible + reacomodo de columnas

**Files:**

- Modify: `src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx`

- [ ] **Step 1: Rebalancear el array `COLS`**

Reemplazar la línea 35 y actualizar el comentario que la explica (líneas 28-34):

```typescript
// 10 columnas, TODAS con ancho fijo (normalizado, sin columna "auto" que absorba espacio
// libre). Contribuyente queda en 280px con truncado de 1 línea. Tipo Título en 140px
// para que "Letra de Cambio" entre en 1 sola línea. Ubicación sube de 140 a 190px y
// pasa de truncado en 1 línea a envolver hasta 2 (ver <td> más abajo) -- el texto es
// determinístico según el catálogo (Mueble corto · Gaveta corta · Carpeta NN) pero
// perseguir un ancho exacto de 1 sola línea es frágil si el catálogo cambia más
// adelante; envolver a 2 líneas no se rompe con eso. Acciones baja de 176 a 126px --
// desde que se colapsó a 1 botón + el disparador del menú "...", ya no necesita el
// ancho que tenía cuando había hasta 5 íconos sueltos por fila (siendo la ÚLTIMA
// columna, un botón ocasional más largo -- "Confirmar Recepción" -- puede extenderse
// un poco más allá del ancho declarado sin romper el layout, porque no hay columna
// después que lo recorte).
const COLS = [280, 110, 140, 120, 60, 110, 90, 190, 115, 126];
const TABLE_MIN_WIDTH = `${COLS.reduce((s, w) => s + w, 0)}px`;
```

- [ ] **Step 2: Quitar el truncado de 1 línea de la celda de Ubicación y permitir 2 líneas**

Reemplazar la línea 951:

```typescript
                    <td style={TD} title={r.ubicacion_archivero}>
                      <span className="line-clamp-2 leading-snug">{r.ubicacion_archivero}</span>
                    </td>
```

- [ ] **Step 3: Verificar tipos y build**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/auditoria-legal/garantias/garantias-cliente.tsx
git commit -m "feat(garantias): ubicación visible completa (2 líneas) + reacomodo de columnas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Verificación final y deploy

**Files:** ninguno (sólo comandos)

- [ ] **Step 1: Chequeo completo de tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 2: Build de producción**

Run: `npm run build`
Expected: build exitoso, sin warnings de rutas de `auditoria-legal/garantias`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errores.

- [ ] **Step 4: Push y aviso de deploy**

```bash
git push origin master
```

Avisar a Jeffrey que el push activó un deploy automático en Vercel, y pedirle que confirme visualmente en producción:

1. Que la columna Ubicación ahora se ve completa (sin necesitar "Ver Ficha"), y que Acciones sigue viéndose bien con "Ver Ficha" / "Confirmar Recepción" + el menú "...".
2. Que al registrar/editar una garantía y llenar una carpeta hasta 25, la 26 se bloquea con el aviso y el botón "Usar Carpeta N.° siguiente disponible" funciona.
3. Que editar una garantía que ya está en una carpeta llena, SIN cambiar su ubicación, sigue guardando bien (no debe bloquearse a sí misma).

---

## Self-review (Claude, antes de entregar el plan)

- **Cobertura del spec:** los 2 puntos del spec están cubiertos — Ubicación visible (Task 6), tope de 25 con las 3 reglas confirmadas (Tasks 2-5), y la limpieza del comentario de placeholder (Task 1). ✅
- **Placeholders:** ningún "TBD" ni "similar a la Task N" — cada paso tiene el código completo. ✅
- **Consistencia de tipos/nombres:** `TOPE_GARANTIAS_POR_CARPETA`, `fn_contar_garantias_en_carpeta`, `fn_siguiente_carpeta_disponible`, `conteoCarpeta`, `carpetaLlena` se usan con el mismo nombre en todas las tasks donde aparecen (modal, POST, PATCH, migración). ✅
