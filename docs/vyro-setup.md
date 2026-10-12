# VYRO setup and operating notes

## Phase 1 scope

VYRO currently supports an editorial storefront, a live product/category catalogue, search, product details, authentication, and protected catalogue administration. Cart, checkout, payments, customer profiles, and order management are not available. Do not present a product as purchasable in this phase.

The catalogue starts empty on purpose. No sample product or price data is seeded. Add only verified VYRO products, variants, prices, and inventory.

## Development database

The schema is managed by Drizzle. Apply it to the development database with:

```sh
pnpm --filter @workspace/db run push
```

This command is for development only. Before changing a production database, prepare and review a migration and apply it only to the intended production environment. Do not use the development push command as a production migration.

At API startup, the service idempotently creates the generic default inventory location if it is missing. It does not create products or categories.

## Granting catalogue administrator access

Clerk sign-in does not automatically grant VYRO admin access. A trusted owner must:

1. Sign in to the VYRO site and inspect the response from `GET /api/admin/session` to obtain the signed-in account's `userId`.
2. Confirm that identifier belongs to the intended administrator.
3. Run the following SQL against the intended database, replacing the example ID with that verified Clerk user ID:

```sql
INSERT INTO vyro_user_roles (user_id, role)
VALUES ('user_replace_with_verified_clerk_id', 'admin')
ON CONFLICT (user_id)
DO UPDATE SET role = EXCLUDED.role;
```

The `vyro_user_roles` table is server-side data. Never add a public endpoint or signup flow that lets users grant themselves the admin role. Use a trusted database interface; do not put database credentials in application code or chat.

## Catalogue data and media

- Prices are integer minor units (for example, cents for a two-decimal currency); the storefront formats them for display.
- Variant stock is initialized at variant creation. Editing product details preserves stock; stock adjustments should be implemented as explicit audited inventory operations.
- Product image paths must point to files verified as the exact VYRO product. Store paths in `/assets/<filename>` form.
- The supplied cycling photography contains visible third-party bike/component branding. It is used only for editorial and story content, not as product photography for a VYRO SKU.
- Product search includes the product name, descriptions, and category name. Only published products and active categories appear publicly.

## Authentication and public data

The storefront uses Clerk for authentication. Catalogue reads are public; all `/api/admin/*` operations require a signed-in Clerk identity with an `admin` row in `vyro_user_roles`. The home and informational pages remain public for signed-in and signed-out visitors. The development preview uses Clerk development keys; before publishing, configure production Clerk credentials through the workspace auth setup.

The database is accessed only by the API server. Do not connect the browser directly to Postgres or expose database credentials.

## Before public sales

The Phase 1 checkout notice is intentional. Before enabling commerce, implement and test the complete cart, checkout, payment, inventory-reservation, order, and customer communication flows. Replace the current privacy, terms, shipping, and returns placeholders with reviewed, business-specific policies and support details before launch. No shipping or return promises are made by the current pages.
