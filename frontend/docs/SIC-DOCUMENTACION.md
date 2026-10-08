# SIC — Sistema Inteligente de Cobranza · Cofersa

### Documentación maestra del proyecto

_Última actualización: 30 de mayo 2026_

---

## 1. ¿Qué es el SIC?

El **SIC (Sistema Inteligente de Cobranza)** es el CRM/ERP de **Gestión de Cartera, Crédito y Cobro (C&C)** de **Cofersa** (mayorista ferretero, Costa Rica). Centraliza la gestión de cobro del equipo de C&C y, cada vez más, la **planeación financiera de caja** y los **reportes ejecutivos/comerciales** que antes vivían dispersos en Excel y Google Apps Script (GAS).

**Datos reales que maneja:** ~₡5.1 billones en cartera activa, ~1.300 clientes activos, ~20.000 facturas pendientes, 37 vendedores, 8 supervisores.

**Usuarios:**

| Rol                            | Acceso                                                      |
| ------------------------------ | ----------------------------------------------------------- |
| **COORDINADOR** (Jeffrey Díaz) | Total — todos los módulos, todos los analistas y vendedores |
| **ANALISTA** (4 analistas)     | Solo su cartera asignada                                    |

**URL producción:** https://cyc-cartera-cofersa.vercel.app

---

## 2. Stack técnico

| Capa          | Tecnología                                                              |
| ------------- | ----------------------------------------------------------------------- |
| Frontend      | Next.js 14 (App Router), TypeScript, Tailwind                           |
| Base de datos | Supabase (PostgreSQL) — proyecto `swkmrufsyhnaeoijasrz`                 |
| Auth          | Google OAuth vía Supabase (solo `@cofersa.cr`)                          |
| Hosting / CI  | Vercel (deploy automático en cada `git push` a `master`)                |
| Email         | Gmail API con el token OAuth del usuario logueado (`resolveGmailToken`) |
| PDF / Excel   | jsPDF + jspdf-autotable · SheetJS (xlsx)                                |
| Gráficos      | Recharts                                                                |

**Regla de deploy:** todo cambio requiere `git push`; Vercel despliega solo. Siempre se avisa tras el push.

---

## 3. Flujo de datos

```
Softland ERP 7.00
  → Power Query / Cubo Excel (actualización manual 3× al día)
  → Google Apps Script (lee el cubo y escribe en Supabase)
  → Supabase PostgreSQL
  → Next.js / Vercel (frontend)

Sincronizaciones: 7:15am · 12:15pm · 4:15pm (hora CR)
```

Cada sync trae un `sync_id`; las consultas usan el **sync más reciente** para evitar duplicados. La tabla `cartera` se reemplaza por sync (1 snapshot); `facturas` también; `maestro_clientes` se actualiza; `pagos` es un **ledger acumulativo** (histórico de pagos, sin `sync_id`).

---

## 4. Modelo de datos (tablas principales)

| Tabla                           | Contenido                                                                               | Clave                                     |
| ------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------- |
| `cartera`                       | Aging por cliente (no vencido + 5 tramos), total, vendedor                              | `cliente_cod` + `contribuyente`           |
| `facturas`                      | Facturas abiertas: documento, fecha_documento, fecha_vencimiento, monto, saldo          | `contribuyente` (⚠ no trae `cliente_cod`) |
| `maestro_clientes`              | Maestro (solo activos): vendedor, analista, condicion_pago, límite, contacto, dimensión | `cliente_cod`, `contribuyente`            |
| `pagos`                         | Ledger de pagos: monto_pago, fecha_pago, dias_atraso, no_recibo, no_factura             | `(no_recibo, no_factura)` único           |
| `gestiones`                     | Registro de cobro (llamada/email/visita/CORREO)                                         | `cliente_cod`, `analista_email`           |
| `promesas`                      | Compromisos de pago (Pendiente/Cumplida/Rota)                                           | `cliente_cod`                             |
| `solicitudes`                   | Aumento límite / excepción / nota de crédito                                            | flujo analista→coordinador                |
| `vendedores` / `supervisores`   | Catálogos comerciales con correos                                                       | `cod`, `supervisor_cod`                   |
| `usuarios`                      | Usuarios del SIC (rol, meta_individual, telefono, whatsapp, google_refresh_token)       | `email`                                   |
| `ventas_mensuales`              | Ventas totales mensuales (para DSO)                                                     | `anio, mes`                               |
| **`historico_bloqueados`**      | Snapshot semanal de clientes bloqueados (para "semanas consecutivas")                   | `(fecha_semana, cliente_cod)`             |
| **`presupuesto_cobro`**         | Presupuesto mensual congelado por cliente→vendedor                                      | `(anio, mes, cliente_cod)`                |
| **`presupuesto_meta_vendedor`** | Meta por vendedor (sugerida + ajustada manual)                                          | `(anio, mes, vendedor_cod)`               |

---

## 5. Módulos en producción

### 5.1 Dashboard (analista y coordinador)

KPIs de cartera, cola del día con semáforo (ROJO/ÁMBAR/VERDE), promesas, agenda, progreso. Coordinador: KPIs globales, aging consolidado, Mi Equipo, tendencia de cartera + **DSO** (Recharts).

### 5.2 Ficha 360° del cliente

Header con datos y acciones (Llamar / WhatsApp / Email de cobro / Estado de cuenta). Tabs: Información, Estado de Cuenta (con export PDF/Excel y envío por correo), Gestiones, Solicitudes. Reporte de pago con OCR (Tesseract).

### 5.3 Clientes / Gestiones / Promesas / Solicitudes / Mi Equipo

Módulos operativos del flujo de C&C (tablas con filtros, semáforos, flujos de aprobación, notificaciones internas en tiempo real vía Supabase Realtime).

### 5.4 Análisis de Pagos (`/gestion-pagos/analisis`)

Inteligencia de comportamiento de pago basada en el **ICP (Índice de Comportamiento de Pago, 0-100)**. 4 pestañas:

- **Ranking de clientes** — ICP, clasificación (EXCELENTE→MUY MALO), días atraso, tendencia 3m, mora activa. Filtros + paginación.
- **Perfil por vendedor** — ICP, % puntual, días atraso, críticos por vendedor.
- **Alertas de deterioro** — clientes que empeoraron su ICP.
- **Concentración de riesgo** — Top 10 mora, índice HHI.

RPCs: `fn_analisis_ranking_clientes`, `fn_analisis_perfil_vendedor`, `fn_analisis_alertas_deterioro`, `fn_analisis_concentracion`.

### 5.5 Hub de Reportes (`/reportes`)

Punto central **dirigido por un registro** (`src/lib/reportes/registry.ts`): cada reporte se define una vez (título, categoría, rol, formatos, programable). Categorías: Gerencia · Ventas · Cobranza · Control · Analista. Infraestructura reutilizable:

- `export-tabla.ts` — exportador genérico PDF/Excel (branding Cofersa, fuente Nunito con ₡, `safeFilename`).
- `ReporteShell.tsx` — layout común (toolbar + KPIs + contenido).
- `VendedorEnvioPanel.tsx` — selección de vendedores + envío individual + **Modo prueba** (todo a tu correo con asunto `[PRUEBA]`).
- `/api/reportes/enviar` — envía HTML por Gmail del usuario, con CC y adjunto opcional.

**Reportes disponibles:**

| Reporte                                                              | Categoría | Qué hace                                                                                                                                                       |
| -------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resumen Ejecutivo                                                    | Gerencia  | Cartera, %mora, DSO, aging, top 10 deudores, HHI. Export PDF/Excel + envío HTML                                                                                |
| **Presupuesto de Cobro**                                             | Gerencia  | (ver sección 6)                                                                                                                                                |
| Mora por Vendedor                                                    | Ventas    | Aging por vendedor; toggle **Detalle = Clientes Bloqueados**                                                                                                   |
| Comportamiento de Pago por Vendedor                                  | Ventas    | ICP por vendedor (reusa Análisis de Pagos)                                                                                                                     |
| Facturas con Plazo Especial                                          | Ventas    | Facturas con plazo ≠ al del cliente; envío por vendedor (CC supervisor + analista)                                                                             |
| Estados de Cuenta                                                    | Cobranza  | Analista marca clientes → envía o descarga (un PDF por cliente)                                                                                                |
| Aging Consolidado                                                    | Cobranza  | Antigüedad total de la cartera; 3 vistas: consolidado / por analista / por vendedor (`fn_reporte_aging`)                                                       |
| Recuperación del Período                                             | Cobranza  | Recaudo por rango de fechas libre, por analista o vendedor; serie diaria + top clientes (`fn_recuperacion_periodo`). Distinto al Presupuesto (mensual vs meta) |
| Cartera Vencida / Gestiones del Período / Recuperación de mi cartera | Analista  | Reportes operativos del analista (solo lectura), dentro del Hub                                                                                                |

**Sidebar del analista** (Inteligencia de Negocio): **Análisis de Pagos** + **Reportes** (Hub role-aware con las 3 tarjetas del analista). "Cartera Vencida" y "Gestiones del Período" dejaron de ser ítems sueltos.

**Clientes Bloqueados** (dentro de Mora por Vendedor): "bloqueado" = saldo vencido >30d ≥ ₡1.000 (regla derivada, no un flag). Incluye Resumen Gerencial + Escalación (≥3 semanas) con histórico semanal (`historico_bloqueados`, snapshot automático al abrir).

---

## 6. Presupuesto de Cobro (`/reportes/presupuesto-cobro`) — el módulo financiero clave

Replica la metodología manual de Jeffrey (Excel) en el SIC, con seguimiento diario y proyección de caja. Mide a los vendedores (comisión).

### Metodología (regla "asesores")

Presupuesto **por cliente → vendedor → empresa**, congelado el primer día hábil, solo clientes activos (`maestro_clientes`). Cada cliente aporta dos componentes:

**① Cobro de cartera existente** — suma de facturas abiertas cuya **fecha esperada de pago ≤ fin de mes**:

- Fecha esperada = `vencimiento + (atraso_promedio − castigo)`.
- **Castigo:** 1-45d→0 · 46-75d→−2 · >75d→−5 (espera que el cliente mejore).
- **Plazo especial** (plazo factura ≠ plazo cliente) → usa el vencimiento real.
- **Cliente nuevo / sin historial** → usa el vencimiento.
- Facturas vencidas viejas pendientes → siempre entran.

**② Cobro de ventas nuevas** — `venta_mensual_prom × (30 − días_prom) / 30` si paga en <30d; si no, 0.

- `venta_mensual_prom` = promedio mensual de pagos del cliente (de `pagos`, sin depender de TI).
- `días_prom` = `plazo_cliente + atraso_promedio` (de `pagos`, por contribuyente).

**Atribución de vendedor:** cada contribuyente se asigna al vendedor de su **código con más cartera** (dueño comercial real) — evita que OFICINA absorba clientes ajenos.

### Pestañas

1. **Presupuesto del mes** — Generar (preview en vivo) → **Congelar mes** (fija la meta). Una vez congelado: **modo ajuste** → reasignar un cliente a otro vendedor (mueve su presupuesto completo) y/o editar la meta de un vendedor a mano. "Regenerar" recalcula desde cero (avisa que descarta ajustes).
2. **Recuperación** — meta vs cobrado real, % avance, **proyección de cierre** (run-rate) y % proyectado, por vendedor; detalle por cliente; serie diaria. Desde acá se **envía el avance semanal** a cada vendedor (Modo prueba disponible).
3. **Proyección (Tesorería)** — flujo de caja esperado por semana a **8 semanas** (dinámico: Semana 1 = semana en curso) + cobrado real/% cumplimiento.

### RPCs

`fn_presupuesto_calc` (cálculo base), `fn_presupuesto_preview` (estimado), `fn_presupuesto_guardar` (congelar), `fn_presupuesto_frozen` (lee el congelado), `fn_presupuesto_reasignar`, `fn_presupuesto_meta` (editar), `_recalc_metas`, `fn_recuperacion`, `fn_proyeccion_cobro`.

---

## 7. Convenciones técnicas

- **Montos:** siempre `fmtCRC()` (punto de miles, sin decimales). Nunca `toLocaleString()`. `fmtM`/`fmtKPI` para compactos.
- **Fechas:** `fmtFecha`, hora CR = UTC-6; comparaciones de fecha en RPCs usan `(now() AT TIME ZONE 'America/Costa_Rica')::date`.
- **Branding:** navy `#003B5C`, cyan `#009ee3`, fondo `#f0f4f8`. Tipografía Nunito. Semáforo: verde `#16a34a`, ámbar `#f59e0b`, rojo `#dc2626`.
- **Tablas:** `table-layout: fixed` con anchos definidos (evita columnas vacías).
- **RPCs:** `SECURITY DEFINER`; dedup de `maestro_clientes` por `contribuyente` con `DISTINCT ON`; `#variable_conflict use_column` cuando hay `RETURNS TABLE`.
- **Envío de correo:** usa el `provider_token` de Google de la sesión (dura 1h) con fallback al `google_refresh_token` persistido en `usuarios`.

---

## 8. Dependencias externas / pendientes

| Tema                                             | Estado                                                                                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Carga diaria de pagos** (`pagos`) vía sync/N8N | Pendiente TI. Llave única `(no_recibo, no_factura)` lista para upsert idempotente. Habilita la Recuperación diaria                                                   |
| **`cliente_cod` en `facturas`**                  | Mejora opcional: precisión exacta en 77 contribuyentes con varios vendedores                                                                                         |
| **Refresh token de Gmail** persistido            | Login pide `access_type=offline`+`consent`; el callback guarda en `usuarios.google_refresh_token`. Necesario para envíos fuera de la 1ª hora y para envío programado |
| **Envío programado** (Vercel Cron)               | Fase futura — reemplaza el resto de GAS automáticos                                                                                                                  |
| **SPF/DKIM** de `cofersa.cr`                     | Tarea de admin DNS (anti-SPAM en envíos masivos)                                                                                                                     |
| GAS de Bloqueados y Plazo Especial               | Apagar triggers (no borrar aún) cuando el SIC corra estable                                                                                                          |

---

## 9. Estructura de carpetas clave

```
src/
├── app/(app)/reportes/         ← Hub + todos los reportes (presupuesto-cobro, mora-vendedor, etc.)
├── app/api/reportes/enviar/    ← envío genérico por Gmail
├── app/api/clientes/           ← email-cobro, estado-cuenta (+ /data), recordatorio
├── components/reportes/        ← HubGrid, ReporteShell, VendedorEnvioPanel
├── components/analisis-pagos/  ← tabs ICP, KPICard, ICPBadge, ICPBar
├── lib/reportes/               ← registry, export-tabla, email-vendedor, email-presupuesto
├── lib/utils/                  ← formato (fmtCRC...), estado-cuenta-export, gmail-token
└── types/                      ← reportes, presupuesto, analisis-pagos, database
```

---

## 10. Historial de avances (sesiones recientes)

1. **Análisis de Pagos** — módulo ICP completo (4 pestañas) + rediseño de tablas a `table-layout:fixed`.
2. **Hub de Reportes** — fundación (registry + shell + exportador) y reportes de Gerencia/Ventas (Resumen Ejecutivo, Mora por Vendedor, Comportamiento por Vendedor).
3. **Estados de Cuenta** (analista) — enviar/descargar por cliente.
4. **Clientes Bloqueados + Plazo Especial** — réplica de los GAS con envío individual por vendedor (CC supervisor + analista) + Modo prueba.
5. **Presupuesto de Cobro** — metodología completa, congelar/ajustar, recuperación con proyección por vendedor, proyección de caja a 8 semanas, envío semanal de avance.

> **Para retomar:** el diseño/pulido visual de las pantallas del presupuesto quedó pendiente, y el roadmap sigue con la automatización de envíos (Cron) y la carga diaria de pagos.
