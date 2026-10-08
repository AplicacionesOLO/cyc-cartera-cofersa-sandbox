# Garantías — Ubicación completa visible + tope de 25 por carpeta

**Fecha:** 18 de agosto 2026
**Módulo:** `Auditoría y Control Legal → Garantías` (`/auditoria-legal/garantias`)
**Estado:** Aprobado por Jeffrey Díaz — pendiente de plan de implementación

## Contexto

Dos pedidos puntuales sobre la tabla de garantías:

1. La columna **Ubicación** trunca el texto (`Archivero 1 · Gaveta A · Car...`) y hay que abrir "Ver Ficha" para ver la ubicación completa. La columna **Acciones** quedó con más ancho del que necesita desde que se colapsó a 1 botón + menú "...".
2. No existe ningún control sobre cuántas garantías se archivan en una misma carpeta física. Se pide un tope de **25 garantías por carpeta** que bloquee el registro/edición cuando se alcance, y sugiera automáticamente la siguiente carpeta disponible.

**Confirmado por Jeffrey:** el catálogo de `src/lib/auditoria-legal/ubicacion-archivo.ts` (Archivero 1/2, Bóveda de Seguridad · Gaveta A-D · Carpeta N.°) ya refleja el mobiliario real de la oficina — deja de ser un placeholder. Se quita el comentario de advertencia de placeholder del archivo como parte de este trabajo (limpieza menor, no un cambio de comportamiento).

## 1. Ubicación completa + reacomodo de columnas

### Diseño

- **`src/app/(app)/auditoria-legal/garantias/garantias-cliente.tsx`**
  - Quitar la clase `truncate` de la celda de Ubicación (línea ~951) y reemplazarla por un contenedor que permita **hasta 2 líneas** con elipsis en la segunda (`line-clamp-2` de Tailwind), en vez de 1 línea con `truncate`.
  - Redistribuir el array `COLS`: ensanchar el índice de Ubicación y angostar el de Acciones. Sin cambiar el ancho total de la tabla (`TABLE_MIN_WIDTH` se recalcula solo, ya que es la suma de `COLS`).
  - Se mantiene el atributo `title` con el texto completo (ya existe) como respaldo para el caso raro que ni con 2 líneas alcance.
- Sin cambios de tipos, RPC, ni backend — es 100% visual.

### Por qué 2 líneas y no un ancho "exacto"

El texto de Ubicación es determinístico dado el catálogo actual (`Mueble corto · Gaveta corta · Carpeta NN`), pero perseguir un ancho en px que garantice 1 sola línea para el peor caso de hoy (`Bóveda de Seguridad · Gaveta A · Carpeta 04`, ~43 caracteres) es frágil si el catálogo cambia en el futuro (aunque hoy Jeffrey confirmó que ya es el real, no se descarta que se agreguen muebles/gavetas nuevas más adelante). Permitir 2 líneas es una solución que no se rompe con esos cambios, sin tener que medir píxeles de nuevo cada vez.

## 2. Tope de 25 garantías por carpeta

### Reglas de negocio confirmadas

- Cuentan como "ocupando espacio" únicamente las garantías con **`estado_custodia = 'EN_BOVEDA'` y `activo = true`** en esa combinación exacta — una garantía despachada a vendedor o sustituida ya no ocupa el cupo físico.
- El tope es por **combinación exacta Mueble + Gaveta + Carpeta** (no por número de carpeta aislado) — `Carpeta 04` en `Archivero 1 · Gaveta A` es un cupo distinto de `Carpeta 04` en `Archivero 2 · Gaveta B`.
- Al llegar a 25: el sistema **bloquea el guardado** y **sugiere automáticamente** el siguiente número de carpeta con espacio libre dentro de la misma Gaveta/Mueble elegidos.

### Arquitectura

**RPC nuevo — `fn_contar_garantias_en_carpeta`**

```sql
fn_contar_garantias_en_carpeta(
  p_mueble text, p_gaveta text, p_carpeta int, p_excluir_id int default null
) returns int
-- SELECT count(*) FROM garantias
-- WHERE ubicacion_archivero_mueble = p_mueble
--   AND ubicacion_archivero_gaveta = p_gaveta
--   AND ubicacion_archivero_carpeta = p_carpeta
--   AND estado_custodia = 'EN_BOVEDA' AND activo = true
--   AND (p_excluir_id IS NULL OR id != p_excluir_id)
```

**RPC nuevo — `fn_siguiente_carpeta_disponible`**

```sql
fn_siguiente_carpeta_disponible(
  p_mueble text, p_gaveta text, p_carpeta_desde int default 1
) returns int
-- Primer número de carpeta >= p_carpeta_desde, en ese Mueble+Gaveta, con
-- conteo (mismo criterio de arriba) < 25. Recorre carpetas consecutivas
-- desde p_carpeta_desde hasta encontrar una con cupo.
```

Dos RPCs separados (en vez de resolver todo en el cliente) porque el conteo real debe vivir en la base para que el chequeo del servidor (POST/PATCH) y el del cliente (UX) usen exactamente la misma fuente de verdad — no se duplica la regla en JS.

**Cliente — `ModalRegistrarGarantia.tsx`**

- Al completar Mueble + Gaveta + Carpeta (los 3 campos ya existen), disparar `fn_contar_garantias_en_carpeta` (debounce 300ms, mismo patrón que la búsqueda de contribuyentes).
- Mostrar un contador discreto junto al campo Carpeta: `18/25`.
- Si el conteo ya es `>= 25`:
  - Bloquear el submit (mismo mecanismo que las demás validaciones de `handleSubmit`, más una bandera de estado para deshabilitar el botón antes de intentar enviar).
  - Mostrar aviso: `Carpeta 04 está llena (25/25).`
  - Botón **"Usar Carpeta N.° siguiente disponible"** que llama a `fn_siguiente_carpeta_disponible` y actualiza el campo Carpeta automáticamente.
- En edición (`garantia` presente), se pasa el propio `id` como `p_excluir_id` para no contarse a sí misma.

**Servidor — autoritativo, nunca confiar sólo en el cliente:**

- **`POST /api/auditoria-legal/garantias`** (alta): cuando `hayUbicacion` es true (bloque ya existente que valida mueble/gaveta/carpeta), agregar la llamada a `fn_contar_garantias_en_carpeta` antes del insert. Si `>= 25`, responder `400` con el mismo mensaje de "carpeta llena".
- **`PATCH /api/auditoria-legal/garantias/[id]`** (edición): mismo chequeo cuando el payload trae `ubicacion_mueble/gaveta/carpeta` (sólo aplica si `puedeEditarUbicacion`, ya validado ahí), pasando el `id` de la garantía como `p_excluir_id`.

### Manejo de errores

- RPC falla (conexión, etc.) → en el cliente, no bloquear la captura de datos (igual que Hacienda/saldo, que fallan en silencio) — el submit igual pasa por el chequeo servidor, que si falla el RPC, responde `500` con mensaje claro (no un guardado silencioso sin validar).
- Mensaje de "carpeta llena" idéntico en cliente y servidor para que la experiencia no cambie según de dónde venga el rechazo (mismo patrón que `MAX_MB` en subida de PDF).

## Testing / verificación

- No hay test runner en el proyecto (regla del CLAUDE.md) — verificación: `tsc --noEmit` limpio + `npm run build` sin errores + confirmación visual de Jeffrey (login OAuth impide que Claude verifique en navegador).
- Casos a confirmar manualmente:
  1. Ubicación con texto largo (`Bóveda de Seguridad · Gaveta A · Carpeta 04`) se ve completo en 1-2 líneas, sin "...".
  2. Registrar la garantía #25 en una carpeta: pasa. La #26: bloqueada, con sugerencia de la siguiente carpeta libre.
  3. Editar una garantía que YA está en una carpeta llena (25/25) sin cambiar su ubicación: debe permitir guardar (no debe contarse a sí misma).
  4. Mover una garantía en edición hacia una carpeta llena de otra combinación: debe bloquear igual que en alta.
