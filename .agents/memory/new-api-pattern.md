---
name: New API Endpoints Pattern
description: How to add new API endpoints that are NOT in the OpenAPI spec, for PUFFIN SRL
---

## Rule
For endpoints beyond the OpenAPI spec, use this pattern instead of adding to the spec + running codegen:

**Backend:**
1. Create `artifacts/api-server/src/routes/<name>.ts` — Express Router, imports from `@workspace/db`
2. Register in `artifacts/api-server/src/routes/index.ts`

**Frontend:**
1. Use `apiFetch<T>()` from `artifacts/puffin/src/lib/api.ts` — gets token from localStorage `puffin_token`
2. Wrap with `useQuery`/`useMutation` from `@tanstack/react-query` directly in the page

**Why:** Avoids modifying the OpenAPI spec and re-running codegen (which regenerates all files). Faster iteration for new endpoints that aren't yet part of the stable API contract.

**How to apply:** When the user asks for a new feature that needs a new endpoint, check if it's worth adding to the spec first. If it's a one-off or prototype, use `apiFetch` directly.
