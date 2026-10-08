# Generador de Pagarés Oficiales — Diseño

**Fecha:** 2026-07-30
**Estado:** Pendiente de aprobación de Jeffrey Díaz
**Módulo base:** Auditoría y Control Legal → Control y Custodia de Garantías (Fase 1, ya en producción)
**Spec/plan de referencia:** [`2026-07-29-auditoria-control-legal-fase1-garantias-design.md`](2026-07-29-auditoria-control-legal-fase1-garantias-design.md)

## Contexto

Cofersa usaba letra de cambio como garantía; a partir de ahora hace el cambio a **pagaré** como instrumento principal. Este módulo necesita poder generar el documento imprimible desde una garantía ya registrada, para dárselo a firmar al cliente y reforzar la cobertura de la cartera.

**No hay revisión de un abogado sobre el texto legal** (decisión explícita de Jeffrey). Las cláusulas se redactaron con base en investigación real del Código de Comercio de Costa Rica (Ley N.° 3284, arts. ~802-825, que remiten el pagaré a las reglas de la letra de cambio), no inventadas ni copiadas de una plantilla de terceros:

- Elementos esenciales de un pagaré válido: la palabra "PAGARÉ" en el texto, promesa **incondicional** de pago de una suma determinada, beneficiario, fecha y lugar de emisión, firma del suscriptor.
- Cláusula **"sin protesto"**: dispensa del protesto formal, el tenedor conserva las acciones cambiarias sin pasar por notario.
- **Aval solidario** (fiador): se expresa con la fórmula "por aval" + firma; la obligación del avalista es solidaria con la del avalado y subsiste aunque la obligación avalada sea nula por otra causa.
- Intereses moratorios: cláusula contractual, liquidable al vencimiento.

Fuentes: [Confección de Pagaré y Letra de Cambio en Costa Rica — Bufete de Costa Rica](https://bufetedecostarica.com/confeccion-de-pagare-y-letra-de-cambio-en-costa-rica/), [Código de Comercio, Ley N.° 3284 — Asamblea Legislativa](https://www.asamblea.go.cr/sd/SiteAssets/Lists/Consultas%20Biblioteca/EditForm/C%C3%B3digo%20de%20Comercio.pdf).

## Fuera de alcance de esta fase

- Letra de cambio (el switch es hacia pagaré únicamente; `tipo_titulo` sigue con los 2 valores ya existentes).
- Firma electrónica / envío del PDF por correo para firma remota (Fase futura).
- Auditorías de Cartera (Tab 2) y Balance de Cobertura (Tab 3) — sin cambios.

## Advertencia visible en el documento (obligatoria, no negociable)

Cada pagaré generado lleva impresa una línea discreta en el pie: _"Documento generado por el SIC — texto legal sin revisión de asesoría externa."_ No es un watermark agresivo, pero tiene que quedar en el papel, no solo en la pantalla — si algún día se revisa y aprueba formalmente, esa línea se retira en una fase posterior.

## 1. Selección de plantilla (Jurídica vs. Física)

**Se decide por el formato de la cédula (`garantias.contribuyente`), no por la consulta a Hacienda.** Ya existe y está validado en producción el mismo criterio (`esPersonaJuridica`, usado hoy para el KPI "Sin Aval Personal"): 10 dígitos que empiezan con "3" = jurídica; cualquier otro formato = física. Esto es determinista y no depende de que la API de Hacienda esté disponible en el momento de generar el documento — al contrario de la validación del Representante Legal en el modal de registro (que si es la fuente correcta ahí, porque solo es un dato informativo, no la base para decidir qué documento imprimir).

- **PLANTILLA A — Persona Jurídica:** Sociedad Deudora → Representante Legal → Fiador Solidario (si aplica). Firman: Representante Legal (con sello) y Fiador Solidario.
- **PLANTILLA B — Persona Física:** Deudor Principal (actúa a título personal) → Fiador Solidario (si aplica, opcional). Firman: Deudor Principal y Fiador Solidario.

## 2. Modelo de datos

### Tabla nueva `personas_legales` — memoria para no volver a digitar

```sql
personas_legales (
  cedula        text primary key,
  nombre        text not null,
  estado_civil  text check (estado_civil in ('Soltero','Casado','Divorciado','Unión Libre')),
  profesion     text,
  domicilio     text,
  telefono      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
)
```

Cualquier persona física puede aparecer aquí en cualquiera de sus 3 roles posibles (deudor física, representante legal, fiador) según la garantía. Al escribir una cédula en el modal de generación, si existe se autocompleta todo; si no existe (o el analista corrige algo), se hace `upsert` — la próxima garantía que involucre a esa misma persona ya la encuentra.

**No se convierte `fiador_cedula` en una foreign key hacia esta tabla.** Es una decisión deliberada: `fiador_cedula` ya es una columna en producción con datos reales; forzar la constraint ahora exige backfill y agrega riesgo a una columna que ya funciona. El cruce se hace en la aplicación (buscar por cédula, no por integridad referencial de la BD). Igual de funcional para lo que se pidió, sin tocar una columna que ya está en uso.

### Columnas nuevas en `garantias` — lo que efectivamente queda impreso

Un pagaré firmado es un documento fijo: si `personas_legales` cambia después (la persona se mudó, cambió de profesión), el pagaré **ya emitido** no debe cambiar solo. Por eso estos campos son una **fotografía** al momento de generar el documento, no un join en vivo contra `personas_legales`:

```sql
alter table public.garantias add column deudor_estado_civil        text;
alter table public.garantias add column deudor_profesion           text;
alter table public.garantias add column deudor_domicilio            text;

alter table public.garantias add column representante_cedula        text;
alter table public.garantias add column representante_estado_civil  text;
alter table public.garantias add column representante_profesion     text;
alter table public.garantias add column representante_domicilio     text;

alter table public.garantias add column fiador_estado_civil          text;
alter table public.garantias add column fiador_profesion             text;
alter table public.garantias add column fiador_domicilio             text;

alter table public.garantias add column tasa_interes_moratorio       numeric;
alter table public.garantias add column lugar_emision                text;
alter table public.garantias add column documento_pagare_generado_en timestamptz;
```

`representante_legal` (nombre) y `fiador_nombre/cedula/telefono` ya existen — no se duplican. `deudor_cedula` no hace falta como columna nueva: cuando el contribuyente es física, `garantias.contribuyente` ya es esa cédula.

Reimprimir un pagaré (mismo garantía, más tarde) usa exactamente estas columnas, nunca vuelve a preguntar nada. Editar una garantía puntual para corregir un dato del pagaré sigue el flujo de edición que ya existe (`PATCH .../garantias/[id]`), que registra el cambio en el expediente.

### Config nuevo en `config_sistema`

```
PAGARE_ACREEDOR_RAZON_SOCIAL     = 'Consorcio Ferretero de San José Sociedad Anónima'
PAGARE_ACREEDOR_CEDULA_JURIDICA  = '3-101-096760'
PAGARE_LUGAR_EMISION_DEFAULT     = 'Tibás, San José, Costa Rica'
TASA_INTERES_MORATORIO_DEFAULT   = ''  -- vacío a propósito: es una decisión de negocio de
                                        -- Jeffrey, no la va a inventar el sistema. Se puede
                                        -- fijar desde Configuración > Parámetros cuando la
                                        -- definan, y hasta entonces el modal la pide vacía
                                        -- (el analista la escribe a mano por garantía).
```

Los primeros 3 son fijos (acreedor de todos los pagarés); el último es el valor sugerido que se puede ajustar por garantía, igual que `HOLGURA_GARANTIA_PCT`.

## 3. Flujo — "Generar Pagaré"

Nueva acción en la columna Acciones de la tabla de Garantías (icono junto a los que ya existen), habilitada solo cuando la garantía es `tipo_titulo = 'Pagaré'` (no aplica a Letra de Cambio).

1. **Primera vez:** abre un modal con los campos faltantes según la plantilla que corresponda (deudor física, o representante + posible fiador). Al escribir una cédula, se dispara la búsqueda en `personas_legales`; si hay coincidencia, se autocompleta estado civil/profesión/domicilio/teléfono (editable igual). Tasa de interés y lugar de emisión vienen precargados desde `config_sistema`, editables.
2. **Guardar y Generar PDF:** hace `upsert` de cada persona involucrada en `personas_legales`, guarda la fotografía de esos datos en la garantía, marca `documento_pagare_generado_en`, registra un evento en el expediente, y abre la vista de impresión.
3. **Vista de impresión:** hoja tamaño carta, `@media print`, vista previa en pantalla antes de imprimir. Botón "Imprimir" dispara `window.print()`.
4. **Reimpresión posterior:** el criterio es `garantias.documento_pagare_generado_en IS NOT NULL` — si ya tiene fecha, "Generar Pagaré" abre directo la vista de impresión con los datos ya guardados en la garantía (no vuelve a pedir nada ni relee `personas_legales`). Si es `NULL`, se muestra el modal de captura de la Sección 3.1.

## 4. Contenido de cada plantilla

**Común a ambas:** encabezado con razón social/cédula de Cofersa (acreedor), monto en número y en letras (`numeroALetras`), fecha y lugar de emisión, fecha de vencimiento, cláusula de promesa incondicional de pago, cláusula "SIN PROTESTO", cláusula de intereses moratorios (con la tasa de esa garantía), consecutivo de trazabilidad SIC (usa el `id` de la garantía), pie con la advertencia de revisión legal.

**Plantilla A (Jurídica):** bloque Sociedad Deudora (razón social + cédula jurídica = `cliente_nombre`/`contribuyente`), bloque Representante Legal (nombre, cédula, estado civil, profesión, domicilio), bloque Fiador Solidario si `tiene_fiador`. Firmas: "Representante Legal (con Sello)" + "Fiador Solidario".

**Plantilla B (Física):** bloque Deudor Principal (nombre, cédula = `cliente_nombre`/`contribuyente`, estado civil, profesión, domicilio), bloque Fiador Solidario si `tiene_fiador`. Firmas: "Deudor Principal" + "Fiador Solidario" (esta última solo si hay fiador).

## 5. `numeroALetras`

Utilidad pura en `src/lib/utils/numero-a-letras.ts`. Convierte un entero en colones a texto formal: `2500000 → "DOS MILLONES QUINIENTOS MIL COLONES EXACTOS"`. Sin decimales/céntimos — los montos de este sistema siempre son enteros (`fmtCRC` ya redondea). Reglas de español a cuidar: "un millón" (no "uno millones"), "veintiuno" vs "veintiún", "cien" vs "ciento", "mil" sin "un" delante.

## 6. Impresión

`@media print` con la hoja en tamaño carta (Letter), márgenes profesionales, tipografía legible (Nunito, la misma del resto del sistema). Vista previa en pantalla idéntica a lo que sale impreso. No usa jsPDF (a diferencia del resto de los reportes del sistema) — es HTML + CSS de impresión, porque da mejor control de paginación y tipografía para un documento de texto denso como este; es una divergencia deliberada del patrón `pdf-branding.ts`, no un descuido.

## Decisiones clave (resumen)

| Decisión               | Elección                                                        | Razón                                                                         |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Selección de plantilla | Por formato de cédula, no por Hacienda                          | Determinista, no depende de una API externa                                   |
| Datos reutilizables    | Tabla `personas_legales` nueva                                  | Autocompletar entre garantías distintas, como pidió Jeffrey                   |
| Reimpresión            | Fotografía en `garantias`, no join en vivo                      | Un documento firmado no cambia solo si la persona actualiza sus datos después |
| `fiador_cedula`        | Sigue siendo texto simple, sin FK                               | Ya está en producción; cruce por cédula en la aplicación, no por constraint   |
| Tasa de interés        | Configurable, sin default inventado                             | Decisión de negocio de Jeffrey, no del sistema                                |
| Revisión legal         | Ninguna — texto basado en investigación real, marcado en el pie | Decisión explícita de Jeffrey                                                 |
| Motor de impresión     | `@media print` + `window.print()`, no jsPDF                     | Mejor control de paginación para texto denso; pedido explícito                |
