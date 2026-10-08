# Módulo Configuración SIC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace read-only `/configuracion` with a full admin control panel (COORDINADOR only) with 8 interactive tabs, 11 API routes, and full audit trail.

**Architecture:** Server Component page loads initial data and checks COORDINADOR role (redirects otherwise). Tab components are Client Components receiving props for zero-flash load, calling API routes for mutations. All writes use Supabase service role key + log to `config_audit_log`.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, Tailwind CSS v4, fmtCRC/fmtFechaHora from @/lib/utils/formato.

---

## Files

### New utility

- Create: `src/lib/configuracion/admin.ts` — getAdminClient(), insertAuditLog(), checkCoordinador()

### API Routes (new)

- Create: `src/app/api/configuracion/vendedores/route.ts`
- Create: `src/app/api/configuracion/vendedores/[cod]/route.ts`
- Create: `src/app/api/configuracion/supervisores/route.ts`
- Create: `src/app/api/configuracion/supervisores/[cod]/route.ts`
- Create: `src/app/api/configuracion/usuarios/route.ts`
- Create: `src/app/api/configuracion/usuarios/[id]/route.ts`
- Create: `src/app/api/configuracion/parametros/route.ts`
- Create: `src/app/api/configuracion/semaforo/route.ts`
- Create: `src/app/api/configuracion/directorio/route.ts`
- Create: `src/app/api/configuracion/directorio/[id]/route.ts`
- Create: `src/app/api/configuracion/log/route.ts`

### Components (new)

- Create: `src/components/configuracion/TabVendedores.tsx`
- Create: `src/components/configuracion/TabSupervisores.tsx`
- Create: `src/components/configuracion/TabUsuarios.tsx`
- Create: `src/components/configuracion/TabParametros.tsx`
- Create: `src/components/configuracion/TabSemaforo.tsx`
- Create: `src/components/configuracion/TabSLA.tsx`
- Create: `src/components/configuracion/TabDirectorio.tsx`
- Create: `src/components/configuracion/TabLog.tsx`
- Create: `src/components/configuracion/ConfigTabs.tsx`

### Modify

- Rewrite: `src/app/(app)/configuracion/page.tsx`

### New utility

- Create: `src/lib/utils/directorio.ts`

---

## Task 1: Shared Admin Utility

- [x] Create `src/lib/configuracion/admin.ts` with getAdminClient, insertAuditLog

## Task 2: API Routes — Vendedores + Supervisores

- [x] vendedores/route.ts — GET list, POST create
- [x] vendedores/[cod]/route.ts — PUT update/reassign, DELETE deactivate
- [x] supervisores/route.ts — GET list, POST create
- [x] supervisores/[cod]/route.ts — PUT update, DELETE deactivate

## Task 3: API Routes — Usuarios + Parámetros + Semáforo

- [x] usuarios/route.ts — GET list
- [x] usuarios/[id]/route.ts — PUT update (rol, activo, meta, tel, whatsapp) + POST create
- [x] parametros/route.ts — GET + PUT
- [x] semaforo/route.ts — GET + PUT (batch)

## Task 4: API Routes — Directorio + Log

- [x] directorio/route.ts — GET list, POST create
- [x] directorio/[id]/route.ts — PUT update, DELETE deactivate
- [x] log/route.ts — GET with filters + ?format=csv

## Task 5: Tab Components

- [x] TabVendedores.tsx — inline dropdown with optimistic update, add modal
- [x] TabSupervisores.tsx — table + modals
- [x] TabUsuarios.tsx — list + add/edit modal with domain validation
- [x] TabParametros.tsx — inline edit cards
- [x] TabSemaforo.tsx — group form with save
- [x] TabSLA.tsx — table with inline number inputs
- [x] TabDirectorio.tsx — table + add/edit modal
- [x] TabLog.tsx — paginated list + CSV export
- [x] ConfigTabs.tsx — tab nav + orchestration

## Task 6: Page + Utility

- [x] page.tsx — Server Component, role guard, data loading, ConfigTabs render
- [x] src/lib/utils/directorio.ts — buscarContactos()

---

_Sprint: 26 mayo 2026 · SIC Cofersa_
