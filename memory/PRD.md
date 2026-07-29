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
5. **Two-way B2B ordering (migration-21)**: supplier_connections table + kitchens.supplier_code (SUP-XXXXXX auto-generated) + supplier_orders.requested_delivery_date. AUTOMATIC connection (no approval) via code/email/name search. Kitchen endpoints /api/kitchen/suppliers{,/search,/:id/catalog}, /api/kitchen/orders (server re-prices from catalog, enforces min order), connect/disconnect. Supplier endpoints: /api/supplier/clients; profile adds deliveryDays+minOrderValue+code. Frontend: kitchen-ordering.jsx MarketplaceView (connect panel, 3-step wizard: catalog+cart → review+delivery date+notes → confirmation w/ ORD-ref; history w/ reorder) as "Order from Suppliers" tab in OrdersView; supplier.jsx Clients tab + code display + via-ShelfWise badges. Backend tested (24/24). Orders placed by kitchens set kitchen_id → land in supplier queue (fixes "order not appearing on supplier side").
6. **PWA auto-update fix**: /api/version now uses .next/BUILD_ID (works on any host); client reloads stale installs at launch via persisted last-seen version.
7. **Connection codes + Order Summary (migration-22)**: supplier_invites table (single-use CON-XXXXXX codes carrying supplier's internal client_code onto supplier_connections.client_code). Supplier Clients tab: code generator (label + client code), copy/revoke, editable client-code chip. Connect endpoint tries invites first, falls back to SUP- general code. INVOICES REMOVED: no invoice_number generation; "Summaries" tab lists fulfilled orders by orderRef with View / CSV export / printable "ORDER SUMMARY" (client code, SKU column, explicit not-a-tax-invoice disclaimer). Order items store sku. Backend tested (25/25).
8. **Order lifecycle notifications + kitchen edit/cancel + tracker (no migration)**: notifyOrderEvent (best-effort Resend email + web-push) on placed/confirmed/fulfilled/updated/cancelled; PUT+DELETE /api/kitchen/orders/:id (pending only, 409 otherwise w/ "contact supplier" message, re-priced server-side); Amazon-style OrderStatusTracker (Placed→Confirmed→Delivered + cancelled banner) in kitchen order history; Edit/Cancel buttons (confirm prompt) + per-order CSV; OrderWizard edit mode; POST /api/supplier/products/sample (20 demo items, empty-catalog only) + "Load 20 sample products" button. Backend tested (19/19). NOTE: RESEND_API_KEY not in preview env — emails prod-only; supplier "in-app" = pending badge + 60s polling (no push registration UI for suppliers yet).
9. **Kitchen-side summaries + Add items + Low-Stock section removed (frontend only)**: printOrderSummary exported and reused — kitchen order history now has "Summary (Print/PDF)" + CSV per order (with supplier's clientCode/currency); "Add items" button on pending orders opens edit wizard at catalog step (saves via existing PUT, supplier notified 'updated'); confirmed message now says "change or add items"; OrdersView slimmed to MarketplaceView only — legacy "Low Stock & Email Orders" tab REMOVED (legacy dialogs kept unused in orders.jsx).

## Backlog
- Order notifications (email/push to supplier on new order; to kitchen on confirm/fulfil)
- Invoice emailing to customer
- AI stock deduction from cooked recipes (P2)
- Stripe subscriptions (P2)
- Refactor monolithic route.js / page.js

## Ops notes
- Prod admin: patel.parth1966@gmail.com. Migrations 20 AND 21 must be run in Supabase SQL editor; then redeploy.
- Never modify .env URLs; all APIs under /api.

## Session (Aug 2026) — 3 UX fixes
1. "Added by [Name]" for Owner: NEW POST /api/staff/owner-name renames the isOwner entry in kitchens.staff_names;
   ownerDisplayName() helper resolves owner identity in validatedPersonFromRequest; auth/me returns owner personName;
   Settings → Staff owner card has "👤 Your name" edit (settings-auth.jsx). Owner must set their name ONCE in
   Settings → Staff for "Added by <real name>" (until then shows "Added by Owner").
2. "Supplier Client Code" renamed to "Account Number" everywhere (labels only — DB column stays client_code, still optional).
3. Order Summary truncation fixed: product names now wrap (break-words) instead of truncate in browse/review/done/
   history/OrderDetailDialog; print HTML td word-break.

## Session (Aug 2026, cont.) — "Added by Parth" stale-identity bug fix
- validatedPersonFromRequest: owner/admin sessions now ALWAYS use ownerDisplayName of their own kitchen;
  x-person-name header IGNORED for owner sessions; legacy chef header only matches non-owner staff.
- getPersonName() (page.js) prefers me.personName (server truth) over localStorage — fixes preparedBy prefill
  + HACCP checkedBy/recordedBy stale-name leak.
- signOutAll() clears sw_person_name + sw_kiosk_user (no cross-account identity inheritance).
- Owner-name prompt dismiss flag keyed per kitchen id.
- Verified: 9/9 attribution unit tests, 10/10 backend regression, UI screenshot.
- NOTE: production (https://kitchen-stock-39.emergent.host) needs REDEPLOY to get this fix. If a kitchen's
  owner entry was already saved with the wrong name, correct it in Settings → Staff → "Your name" —
  items added AFTER the fix use the corrected name; old items keep the name stamped at creation time.

## Session (Aug 2026, cont. 2) — Push routing + camera option fixes
1. PUSH ROUTING: browser push subscription now RE-BINDS to the active account on every login
   (page.js effect posts existing subscription to /api/push/subscribe, throttled 12h per kitchen via
   sw_push_bound localStorage key). signOutAll() (apiClient.js) detaches the device's push registration
   (POST /api/push/unsubscribe) BEFORE clearing tokens, so a signed-out account's notifications stop.
   Backend upsert by endpoint already reassigns kitchen_id — no backend change needed.
2. TAKE PHOTO OPTION: all image-upload flows now offer BOTH "📷 Take photo" (input capture=environment)
   and "🖼️ Choose from library" (no capture): Scan Logbook dialog, Scan Recipe dialog (multi-page),
   product form photo, barcode AI fallback (page.js). scanners.jsx + haccp.jsx already had both.
3. Verified via mocked-session screenshots (Scan Recipe dialog shows both tiles). Production needs REDEPLOY.
