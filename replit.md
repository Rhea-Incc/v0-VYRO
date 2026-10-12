# VYRO Performance

VYRO is a performance-equipment storefront with a database-backed catalogue and a private catalogue-management area.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server exec tsc --project tsconfig.json --noEmit --pretty false` — check API TypeScript
- `pnpm --filter @workspace/vyro exec tsc --project tsconfig.json --noEmit --pretty false` — check storefront TypeScript
- Required environment: `DATABASE_URL`; Clerk is provisioned through the workspace auth setup

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Storefront: React 19, Vite, Wouter, Clerk
- API: Express 5, Clerk middleware
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/vyro/src/App.tsx` — public pages, Clerk flows, and catalogue-admin interface
- `artifacts/vyro/src/index.css` — storefront styles and VYRO theme tokens
- `artifacts/vyro/public/assets/` — supplied VYRO logo and optimized editorial photography
- `artifacts/api-server/src/routes/catalogue.ts` and `routes/admin.ts` — public catalogue and protected admin API
- `artifacts/api-server/src/lib/vyroCatalog.ts` — catalogue querying and serialization
- `lib/db/src/schema/vyro.ts` — catalogue, variants, inventory, roles, and audit schema
- `lib/api-spec/openapi.yaml` — API source contract; regenerate client and Zod schemas after editing
- `lib/api-client-react/src/generated/` — generated React Query hooks and response schemas
- `docs/vyro-setup.md` — database, admin-role, media, and Phase 1 operating notes

## Architecture decisions

- Public API responses expose published products and active categories; every admin route checks a server-side VYRO role associated with the signed-in Clerk user.
- Catalogue prices are stored in integer minor units. Variant stock is initialized when a variant is created and is deliberately preserved by product-detail edits.
- The supplied cycling photos visibly include other manufacturers' marks; they are editorial-only and are not seeded as VYRO product imagery.
- Phase 1 intentionally has no cart, checkout, orders, or payment integration.

## Product

The Phase 1 experience includes a responsive home page, category and search listings, product details, story and field notes, support/legal information, Clerk sign-in, and a protected product/category admin. The catalogue starts empty; owners add verified VYRO data through admin. Checkout and customer-order features are deferred to Phase 2. Privacy, terms, shipping, and returns copy is a launch placeholder, not legal approval.

## User preferences

No separate workspace-wide collaboration preferences have been stated.

## Gotchas

- Use `pnpm --filter @workspace/db run push` only for the development database; production schema changes require a reviewed migration against the intended environment.
- Admin access is not self-granted at sign-up. A trusted database owner must assign the `admin` role; see `docs/vyro-setup.md`.
- Product image paths must resolve to verified media in `artifacts/vyro/public/assets/`. Store paths in `/assets/...` form; the storefront prefixes its artifact base path when rendering.
- Do not use the supplied bike photography to represent a catalogue SKU unless the image is verified as that exact VYRO product.
- `artifacts/vyro/vite.config.ts` keeps Tailwind optimization disabled for the Clerk integration.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
