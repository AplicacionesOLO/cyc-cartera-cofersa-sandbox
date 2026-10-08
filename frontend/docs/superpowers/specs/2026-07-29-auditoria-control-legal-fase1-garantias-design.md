# Auditoría y Control Legal — Fase 1: Garantías

**Fecha:** 2026-07-29
**Estado:** Aprobado por Jeffrey Díaz, listo para plan de implementación
**Alcance de este documento:** Solo la Fase 1 (Garantías) del módulo completo. Las fases 2-4 se diseñan por separado cuando corresponda.

## Contexto

Módulo nuevo e independiente para el SIC: seguimiento de garantías de clientes (pagarés, letras de cambio) y su custodia física, más auditorías de confirmación de saldo de cartera. El pedido original describía 3 tabs + integración con la ficha 360° del cliente de una sola vez; se decidió construir en 4 fases porque son subsistemas relativamente independientes con una dependencia de orden natural (ver §Fases).

## Nomenclatura oficial (no parafrasear)

| Nivel                  | Nombre exacto                   | Ruta                                  | Fase         |
| ---------------------- | ------------------------------- | ------------------------------------- | ------------ |
| Módulo (sidebar, raíz) | **Auditoría y Control Legal**   | `/auditoria-legal`                    | —            |
| Tab 1                  | Control y Custodia de Garantías | `/auditoria-legal/garantias`          | **1 (esta)** |
| Tab 2                  | Auditorías de Cartera           | `/auditoria-legal/auditorias-cartera` | 2            |
| Tab 3                  | Balance de Cobertura y Riesgo   | `/auditoria-legal/cobertura`          | 3            |
| Ficha 360° (nueva tab) | Expediente Legal                | —                                     | 4            |

## Fases y dependencias

1. **Garantías** (este documento) — dato base: inventario + custodia + despacho.
2. **Auditorías de Cartera** — independiente de Garantías, mismo nivel de esfuerzo.
3. **Cobertura y Riesgo** — reporte derivado: depende de que Garantías tenga datos reales cargados (la columna "Cobertura" de la Fase 1 ya calcula lo mismo a nivel de fila, así que Fase 3 es principalmente presentación agregada).
4. **Expediente Legal en Ficha 360** — vitrina que resume Garantías + Auditorías; depende de que ambas existan.

## Roles y acceso

- **COORDINADOR + ANALISTA** (todos) tienen acceso — mismo patrón que la categoría "Inteligencia Financiera" existente. No se crea un rol nuevo.
- Cada analista ve/gestiona las garantías de los contribuyentes de su propia cartera; el coordinador ve todo.
- RLS resuelta por `analista_email` (no `auth.uid()` directo) — mismo patrón real ya usado en `cartera`/`gestiones`, no el snippet de `auth.uid() = analista_id` de CLAUDE.md §7.3 (problema de mismatch ya documentado en memoria del proyecto).

## Decisión clave: la unidad es el CONTRIBUYENTE, no el `cliente_cod`

Verificado contra la base real (jul 2026): **67 contribuyentes** de 1,472 tienen más de un `cliente_cod` en `maestro_clientes` (310 filas afectadas, ~21% del total; el caso más extremo tiene 49 códigos). Es la misma persona/empresa (mismo `contribuyente`) con varios códigos de cliente en Softland. Confirmado también que `cliente_nombre` es siempre idéntico entre los códigos de un mismo contribuyente (0 inconsistencias).

Implicaciones para el modelo:

- `garantias` se vincula por **`contribuyente`**, no por `cliente_cod`. Un contribuyente = una garantía activa a la vez, sin importar cuántos códigos tenga.
- El saldo usado para Cobertura/holgura es la **suma de `cartera.total` de todos los `cliente_cod`** de ese contribuyente — no el de un solo código (si no, se subestima la exposición real en esos 67 casos).
- Analista responsable de la garantía: se resuelve automático como el analista del `cliente_cod` con **mayor saldo** dentro de ese contribuyente. Verificado que **8 de los 67** contribuyentes multi-código tienen sus códigos repartidos entre analistas distintos — en esos casos, además del auto-resuelto, se notifica al coordinador para que confirme o reasigne (no bloquea el registro).
- El buscador de cliente en el modal de registro busca/selecciona por contribuyente (nombre + cédula), no por código individual.
- Consecuencia para Fase 4: cuando Expediente Legal se construya en la ficha 360 (que hoy vive por `cliente_cod`), debe consultar la garantía por `contribuyente` — así muestra la misma garantía sin importar cuál de los códigos del contribuyente se esté viendo.

## Modelo de datos

```sql
garantias (
  id                    bigint PK
  contribuyente         text NOT NULL      -- identidad real (cédula física o jurídica). Llave de negocio.
  cliente_nombre        text               -- denormalizado para mostrar (consistente entre códigos del mismo contribuyente)
  tipo_titulo           text               -- 'Pagaré' | 'Letra de Cambio'
  monto_garantizado     numeric            -- siempre CRC
  tiene_fiador          boolean
  fiador_nombre         text null
  fiador_cedula         text null
  fiador_telefono       text null
  representante_legal   text null          -- solo relevante si Hacienda.tipoIdentificacion = 'Jurídica'; visible igual (opcional) si Hacienda no respondió
  fecha_emision         date
  fecha_vencimiento     date
  ubicacion_archivero   text               -- libre, ej "Archivero A - Gaveta 3"
  estado_custodia       text               -- 'EN_BOVEDA' | 'ENVIADO_VENDEDOR' | 'EN_FIRMA'  ("Vencido" se calcula, no se guarda)
  documento_pdf_url     text null          -- Storage, bucket nuevo (ver §Integraciones)
  activo                boolean default true  -- false = sustituida por una garantía más nueva del mismo contribuyente
  reemplazada_por_id    bigint null references garantias(id)
  registrado_por        uuid               -- usuarios.id
  analista_email        text               -- responsable resuelto (ver regla arriba)
  created_at timestamptz default now()
  updated_at timestamptz default now()
)

garantia_eventos (
  id             bigint PK
  garantia_id    bigint FK -> garantias
  tipo_evento    text     -- ver §Vocabulario
  usuario_id     uuid     -- usuarios.id
  nota           text null
  created_at timestamptz default now()
)
```

Config nuevo en `config_sistema` (mismo patrón que `UMBRAL_SCORE_RIESGO_ALTO`, `DIAS_SIN_GESTION_ALERTA`):

```
clave: HOLGURA_GARANTIA_PCT
valor: 25
descripcion: "% de margen sobre el saldo actual del contribuyente para calcular el monto
  objetivo de garantía. Default basado en percentil 75 de crecimiento mensual observado
  en historico_aging_factura (jul 2026, muestra de solo 2 meses — recalcular cuando haya
  6-12 meses de historial acumulado)."
```

## Cálculo de Cobertura (derivado, no almacenado)

```
saldo_contribuyente = SUM(cartera.total) WHERE contribuyente = X   -- todos los cliente_cod
monto_objetivo       = saldo_contribuyente × (1 + HOLGURA_GARANTIA_PCT / 100)
cobertura_pct        = monto_garantizado_activo / saldo_contribuyente × 100

Semáforo (reusa el mismo rojo/ámbar/verde de la Cola del analista):
  🔴 Rojo   — monto_garantizado < saldo_contribuyente (no cubre ni la deuda actual)
  🟡 Ámbar  — saldo_contribuyente ≤ monto_garantizado < monto_objetivo (cubre hoy, sin margen)
  🟢 Verde  — monto_garantizado ≥ monto_objetivo
```

`límite_credito` de `maestro_clientes` fue evaluado y **descartado** como referencia: 1,015 de 1,472 clientes (69%) tienen exactamente ₡100,000,000, 78 más tienen exactamente ₡200,000,000 — valores genéricos de placeholder. Mediana de uso real (saldo/límite) = 1.6%. No representa una evaluación real de riesgo por cliente.

## Ciclo de vida de custodia

```
EN_BOVEDA
   │  botón "Entregar a Vendedor"
   │  → dispara correo REAL (Gmail API, mismo patrón que el resto del SIC) al vendedor + supervisor en copia
   ▼
ENVIADO_VENDEDOR
   │  botón "Enviar a Trámite de Firma"
   ▼
EN_FIRMA
   │  botón "Reingresar a Custodia"
   │  → sugerencia contextual (no obligatoria) de adjuntar el PDF firmado
   ▼
EN_BOVEDA (vuelve al inicio del ciclo)

En cualquier estado: si hoy > fecha_vencimiento, la UI MUESTRA "Vencido" en vez del
estado real (calculado en la query, no se persiste). No tiene botón de acción — la
sustitución se hace registrando una garantía nueva para el mismo contribuyente, lo
que marca la anterior activo=false + reemplazada_por_id + evento SUSTITUCION_DE_TITULO.
```

Cada transición inserta una fila en `garantia_eventos` con usuario y fecha — es la fuente de auditoría ("¿quién despachó esto el 3 de marzo?").

## Vocabulario (consistencia entre botón, evento y estado)

| Botón en la tabla         | Evento registrado (`tipo_evento`) | Estado resultante (`estado_custodia`) |
| ------------------------- | --------------------------------- | ------------------------------------- |
| (registro inicial)        | `APERTURA_EXPEDIENTE`             | `EN_BOVEDA`                           |
| Entregar a Vendedor       | `ENTREGA_A_VENDEDOR`              | `ENVIADO_VENDEDOR`                    |
| Enviar a Trámite de Firma | `TRAMITE_DE_FIRMA`                | `EN_FIRMA`                            |
| Reingresar a Custodia     | `REINGRESO_A_CUSTODIA`            | `EN_BOVEDA`                           |
| (registrar sustitución)   | `SUSTITUCION_DE_TITULO`           | `EN_BOVEDA` (en la nueva)             |

Los badges de estado ("En Bóveda", "Enviado a Vendedor", "En Firma", "Vencido") son los definidos en el pedido original — no cambian.

## Integraciones

1. **Hacienda** (`GET /api/hacienda?identificacion=`, **ya existe en producción**, se reusa tal cual — hoy alimenta el widget de Centro de Recursos). Al seleccionar el contribuyente en el modal de registro: lookup on-demand (no masivo) que muestra badge "Al día / Moroso / Omiso" + nombre oficial, y determina si se muestra el campo Representante Legal (`tipoIdentificacion = 'Jurídica'`). Si Hacienda no responde a tiempo, el campo Representante Legal queda visible igual (opcional) y el badge simplemente no aparece — nunca bloquea el registro.
2. **Alerta desde Solicitudes de Aumento de Límite**: cuando una solicitud tipo `AUMENTO_LIMITE` pasa a `APROBADA`, si el cálculo de Cobertura de ese contribuyente da rojo o ámbar, se dispara una notificación (tabla `notificaciones` existente) al analista responsable.
3. **Notificación de vencimiento próximo** (<60 días, mismo umbral que el KPI de Fase 3): mismo patrón que `automatizacion_sin_gestion_activa` en `config_sistema` — notifica solo al analista dueño.
4. **PDF de la garantía firmada**: columna `documento_pdf_url`, subido a un bucket de Storage nuevo (ej. `garantias-legal`), mismo patrón que los buckets ya existentes `comprobantes-pago`/`documentos-recursos`. La acción de adjuntar vive en Tab 1, disponible en cualquier momento (no atada estrictamente a un estado), con sugerencia contextual al hacer "Reingresar a Custodia".

### Explícitamente descartado o diferido

- **Espejo en Gestiones**: descartado — no se duplica el historial de custodia en la tabla `gestiones`.
- **Verificación por IA del PDF contra los datos capturados** (usando los endpoints de Anthropic SDK ya existentes en `/api/ai`, comparando monto/vencimiento del PDF vs. lo digitado): idea anotada para una fase futura, no bloquea esta.
- **Importación masiva de garantías/Excel existente**: existe un Excel y garantías físicas en el archivero, pero están desactualizadas — se decidió arrancar en cero (el módulo se puebla a medida que cada analista ubica y confirma la garantía física real de sus clientes) en vez de migrar datos no confiables.
- `límite_credito` como referencia de cobertura: descartado (ver arriba).

## API routes

```
POST   /api/auditoria-legal/garantias                     — crear / sustituir
PATCH  /api/auditoria-legal/garantias/[id]/custodia       — transición de estado (+ evento + correo real si aplica)
POST   /api/auditoria-legal/garantias/[id]/documento      — sube el PDF a Storage
GET    /api/hacienda                                      — ya existe, sin cambios, se reusa
```

## UI — Sidebar

Categoría nueva "Auditoría y Control Legal" entre "Inteligencia Financiera" y "Sistema" en `sidebar.tsx`, roles `['COORDINADOR', 'ANALISTA']`, ícono `Scale` (lucide-react, 13px en header de categoría / 16px en sub-items). Modo colapsado reusa el componente `NavIconTooltip` ya existente, sin construir nada nuevo. Los 3 sub-items de navegación se crean todos ahora; las rutas de Tab 2 y Tab 3 muestran una vista "Próximamente" (mismo patrón que `disponible: false` en `registry.ts`) hasta que sus fases se construyan.

**Nota:** modificar `sidebar.tsx` requiere confirmación explícita de Jeffrey antes del cambio, por la regla de CLAUDE.md §5.1 — el pedido original ya especifica esta categoría con detalle, se toma como autorización, pero se reconfirma en el momento de implementar.

## UI — Tab 1: tabla de Garantías

9 columnas (patrón `COLS` + `<colgroup>` + `table-layout: fixed`, regla CLAUDE.md §5.9b — nunca clases `w-*` de Tailwind sobre `<td>`):

Contribuyente (nombre + cédula en 2 líneas) · Tipo Título · Monto Garantizado (`fmtCRC`, tabular-nums) · Fiador (badge Sí/No) · Cobertura (semáforo + %) · Vencimiento · Ubicación Archivero · Estado Custodia (badge) · Acción (botón contextual según estado, ver ciclo de vida).

Botón "+ Registrar Garantía" arriba a la derecha, abre el modal.

## UI — Modal "Registrar Garantía"

Campos en orden: Contribuyente (buscador — muestra nombre + cédula al seleccionar) → badge de Hacienda automático → aviso si el contribuyente ya tiene una garantía activa (ofrece sustitución) → Tipo de Título (select) → Monto Garantizado (input libre + texto de ayuda "sugerido: ₡X" no bloqueante) → toggle Fiador (Sí/No) → si Sí: Nombre/Cédula/Teléfono → Representante Legal (condicional, ver Integraciones) → Fecha de Emisión → Fecha de Vencimiento → Ubicación en Archivero.

## Mockups de referencia

Los mockups visuales usados durante el diseño (sidebar expandido/colapsado, tabla completa, modal de registro) quedaron en `.superpowers/brainstorm/` (no versionado — ver `.gitignore`). Sirvieron para validar layout con Jeffrey; el detalle final de estilos se resuelve durante la implementación siguiendo el design system de CLAUDE.md §4.

## Fuera de alcance de esta fase

- Tab 2 (Auditorías de Cartera) — Fase 2.
- Tab 3 (Balance de Cobertura y Riesgo) como pantalla de reporte agregado — Fase 3. La columna Cobertura de Tab 1 ya cubre el cálculo a nivel de fila.
- Expediente Legal en Ficha 360 — Fase 4.
- Todo lo listado en "Explícitamente descartado o diferido" arriba.

## Pendiente a futuro (no bloquea esta fase)

- Recalcular `HOLGURA_GARANTIA_PCT` cuando `historico_aging_factura` acumule 6-12 meses de historial (hoy solo hay 2).
- Evaluar verificación por IA del PDF adjunto contra los datos capturados.
- Evaluar si conviene segmentar la holgura por perfil de riesgo/dimensión del cliente en vez de un único % global.
