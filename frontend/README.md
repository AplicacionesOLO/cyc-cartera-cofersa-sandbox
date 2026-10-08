# SIC · Sistema Inteligente de Cobranza (Cofersa)

CRM interno de gestión de cartera, crédito y cobro. Next.js (App Router) + Supabase + Vercel.

La fuente de verdad de arquitectura, reglas de negocio, identidad visual y decisiones ya tomadas es [`CLAUDE.md`](./CLAUDE.md). Leelo antes de tocar código — este README solo cubre cómo levantar el proyecto.

## Requisitos

- Node.js 20+
- Un proyecto de Supabase (Postgres) propio
- Credenciales OAuth de Google propias (login + Gmail API)
- API key de Anthropic propia (opcional — solo si se usan los módulos de IA)

**Importante:** cada instalación (cada país/empresa) debe generar sus **propias** credenciales de Supabase, Google Cloud y Anthropic. Nunca reutilizar las de esta instancia (Cofersa Costa Rica).

## Instalación

```bash
npm install
cp .env.example .env.local   # completar con valores reales (ver abajo)
npm run dev                  # http://localhost:3000
```

## Variables de entorno

Ver [`.env.example`](./.env.example) para la lista completa con dónde obtener cada valor. Ninguna variable sensible va al repositorio — solo a Vercel / `.env.local`.

## Base de datos

El código en este repo (Next.js) es autosuficiente, pero **el esquema de base de datos vive en Supabase**. La carpeta [`supabase/migrations`](./supabase/migrations) contiene solo el historial parcial de migraciones antiguas — **no** es una fuente completa del esquema real.

La fuente completa y actualizada (2026-07-08) está en [`supabase/schema_export`](./supabase/schema_export): tablas, funciones RPC, RLS, triggers, vistas, bucket de Storage y jobs de `pg_cron`, listos para aplicar en orden a un proyecto de Supabase nuevo. Ver el README de esa carpeta para el orden exacto y lo que falta configurar aparte (Auth, usuario inicial, datos).

## Comandos

```bash
npm run dev          # servidor local
npm run build        # build de producción — debe pasar sin errores antes de cada push
npm run lint         # ESLint
npx tsc --noEmit     # chequeo de tipos — ejecutar antes de cada commit
```

No hay test runner configurado. La verificación del proyecto es `tsc --noEmit` limpio + `npm run build` sin errores.

## Deploy

Cada `git push` a `master` dispara un deploy automático en Vercel (ver proyecto conectado en el dashboard de Vercel). No hay paso manual de deploy.
