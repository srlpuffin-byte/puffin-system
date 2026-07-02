---
name: API Client Lib Build
description: Why typecheck fails claiming hooks don't exist even though they're in the generated files
---

## Rule
Always run `pnpm run typecheck:libs` before running `pnpm --filter @workspace/puffin run typecheck`. Without it, the compiler reports false "has no exported member" errors for all `@workspace/api-client-react` hooks.

**Why:** `lib/api-client-react` is a composite lib package. It must emit declarations (`tsc --build`) before leaf artifacts can resolve its types. The generated files exist but declarations aren't built until you run `typecheck:libs`.

**How to apply:** Whenever you see TS2305 errors like "Module '@workspace/api-client-react' has no exported member 'useGetDashboardResumen'" — run `pnpm run typecheck:libs` first. The hooks are real; the declarations just need rebuilding.
