# ShelfWise — PRD (living document)

## What it is
Next.js App Router PWA (Supabase Postgres) for professional kitchen management: inventory + expiry tracking, HACCP compliance, AI scanners (receipts/labels/temp sheets), recipes, rota, waste log, web-push + Resend email alerts, 4-digit staff-PIN kiosk system, DPDP consent flows.

## Architecture
- `/app/app/page.js` — monolithic kitchen frontend (all views)
- `/app/app/api/[[...path]]/route.js` — monolithic backend router (~4,400 lines)
- `/app/components/shelfwise/*.jsx` — view components (inventory, dashboard, recipes, rota, haccp, supplier, …)
- `/app/supabase/*.sql` — migrations (latest: migration-20-supplier.sql, MUST be run in prod Supabase)
- Auth: owners via Supabase session; staff via chef JWT (SHELFWISE_JWT_SECRET); suppliers via owner session on kitchens row with account_type='supplier'
- LLM: Emergent gateway (gpt-4o / gpt-4o-mini). Local env has NO Supabase → DB endpoints 500 locally (expected).

## Completed (Aug 2026 session)
1. **Cache/stale-data fix (P0, recurring)**: no-store Cache-Control headers on ALL API responses (json() helper), `cache:'no-store'` in apiFetch, pageshow(bfcache) refresh listener. Tested.
2. **Label fix**: "Chef name" → "Name" (add-item form, rota dialog).
3. **Recipe overhaul**: generate = 4 parallel gpt-4o-mini calls (~5s, 4 styled recipes); dietary chips on web search; favourites (summary.favorite JSONB, POST /api/recipes/:id/favorite); AI substitutions (POST /api/recipe/substitutions); 1x-5x scaling kept. Tested (backend+frontend).
4. **Supplier account role (supplier-side)**: migration-20; signup account-type toggle; requireSupplier gate; endpoints /api/supplier/{profile,products,orders,stats} (GET/POST/PUT/DELETE); auto invoice numbers (INV-YYYY-NNNN) on fulfilment; printable invoices; SupplierDashboard (orders queue, catalog CRUD, invoices, business profile); suppliers blocked from kitchen tools server-side; no kiosk/PINs for suppliers. Backend tested (29/29).

## Backlog
- Two-way ordering: kitchens browse supplier catalogs & place orders in-app (user confirmed wanted next)
- AI stock deduction from cooked recipes (P2)
- Stripe subscriptions (P2)
- Refactor monolithic route.js / page.js

## Ops notes
- Prod admin: patel.parth1966@gmail.com. Migration-20 must be run in Supabase SQL editor before supplier features work in prod.
- Never modify .env URLs; all APIs under /api.
