# PUFFIN SRL — Plataforma Operativa

Sistema de gestión operacional integral para empresa argentina de construcción y maquinaria pesada.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at /api)
- `pnpm --filter @workspace/puffin run dev` — run the frontend (proxied at /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + TailwindCSS + shadcn/ui + wouter
- API: Express 5 + JWT auth (jsonwebtoken)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — Drizzle schema files (empresas, usuarios, empleados, maquinas, jornadas, combustible, mantenimientos, documentos, alertas, incidentes, actividad)
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/api-client-react/src/generated/` — Orval-generated hooks and Zod schemas
- `artifacts/api-server/src/routes/` — Express route handlers (one file per module)
- `artifacts/puffin/src/pages/` — React page components
- `artifacts/puffin/src/components/layout/app-layout.tsx` — Sidebar + navigation
- `attached_assets/logo_puffin_1782946440101.jpeg` — Company logo

## Architecture decisions

- **Auth**: JWT (8h expiry) stored in localStorage as `puffin_token`. PIN hashed with SHA-256 + salt `puffin-salt`. JWT secret from `SESSION_SECRET` env var.
- **Assets**: Vite `@assets` alias resolves to `attached_assets/` at workspace root. `server.fs.allow` must include that path since it's outside the artifact root.
- **Routing**: All API routes under `/api` prefix via shared proxy. Frontend at `/`.
- **Spanish-only**: All UI text, labels, and messages are in Spanish.
- **empresa_id = 1**: Single-tenant setup for PUFFIN SRL (empresa seeded as id=1).

## Product

- Login con PIN de acceso (usuario + PIN numérico)
- Panel de control con métricas operativas en tiempo real
- Gestión de Operarios (empleados)
- Gestión de Maquinaria con fichas detalladas
- Registro de Jornadas de trabajo
- Control de Combustible
- Seguimiento de Mantenimientos
- Gestión de Documentación con alertas de vencimiento
- Centro de Alertas (roja/amarilla/verde)
- Calendario de eventos y vencimientos
- Reportes operativos
- Registro de Incidentes
- Feed de Actividad del sistema

## User preferences

- Interfaz completamente en español
- Sin emojis en la UI
- Marca: azul marino #1B2B5E, verde forestal #4A7A2B
- Logo: `attached_assets/logo_puffin_1782946440101.jpeg`

## Gotchas

- Deep imports into `@workspace/api-client-react/src/...` break Vite — always import from the package root `@workspace/api-client-react`
- Logo imports must use `@assets/` alias (not relative `../../../attached_assets/`), and `server.fs.allow` must include the attached_assets dir
- Run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec change before editing route handlers

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Default login: usuario `admin`, PIN `1234`
