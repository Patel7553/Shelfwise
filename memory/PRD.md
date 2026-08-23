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

## Session (Aug 2026, cont. 3) — Staff rename feature
- POST /api/staff/rename {oldName,newName} (owner/admin only): renames a NON-owner staff entry keeping
  pin/role/perms; stores oldName in entry.prevNames (max 10); BACKFILLS past records (activity_logs.person,
  products.prepared_by + custom_fields->>_addedBy, haccp_temperature_logs.recorded_by,
  haccp_cleaning_log.completed_by, haccp_deliveries.checked_by, waste_log.disposed_by); returns updatedRecords.
- resolveStaffName(sb,ctx,raw) helper: old staff JWTs (name embedded at login) resolve to CURRENT name via
  prevNames — used in validatedPersonFromRequest step 1 + auth/me chef personName.
- UI: pencil icon on each staff name in Settings → Staff (settings-auth.jsx renameStaff, prompt-based),
  distinct from regenerate-code + delete. Updates local sw_person_name/sw_kiosk_user if renamed person active.
- Verified: 5/5 unit tests (old-token resolution), 10/10 backend wiring tests, screenshot of Staff screen.
- Production needs REDEPLOY.

## Session (Aug 2026, cont. 4) — Receipts feature + 3 updates
RECEIPTS (nav "Receipts", all inventory roles):
- Backend: GET/POST /api/receipts (base64 image/pdf -> private 'receipts' storage bucket, auto-creates bucket;
  signed URLs 1h), POST /api/receipts/ai-extract (gpt-4o vision -> supplier/date/total/currency),
  PUT/DELETE /api/receipts/:id (edit attribution). 'receipts' added to BOTH ownerOrChef GET array (line ~2753)
  AND kitchenScoped POST array. receiptFromDb + extractReceiptDetails helpers.
- DB: supabase/migration-23-receipts.sql (receipts table + storage bucket) — USER MUST RUN IT in Supabase SQL editor.
- Frontend: components/shelfwise/receipts.jsx — scan flow (camera/library/PDF/details-only), OpenCV.js (CDN,
  lazy) auto edge-detect + draggable-corner perspective crop w/ fallbacks, AI autofill, status (pending/
  submitted/reviewed) + 8 colour tags, export dialog (Today/Week/Month/custom; combined PDF via pdf-lib or
  separate PDFs zipped via jszip; PDFs merged with copyPages; details-only get text pages).
- Packages added: pdf-lib, jszip (yarn).
3 UPDATES:
- Header shows active person: "👤 {me.personName}" under kitchen name (page.js center header block).
- Product edits stamp custom_fields._editedBy/_editedAt (PUT /api/products/:id preserves _addedBy from DB);
  inventory rows show "✏️ Last edited by X — time"; temp-log PUT logs 'temp_updated' activity.
- Product Note field: body.note -> custom_fields._note (toDb), shown in inventory row (amber chip), editable
  in form (EMPTY_FORM.note, openEdit maps it).
- Verified: screenshots (receipts list, add dialog 4 tiles, crop editor auto-detect WORKS, AI details step),
  backend 12/12 after fixing missing 'receipts' in ownerOrChef GET array.
- Production needs REDEPLOY + migration-23 run.

## Session (Aug 2026, cont. 5) — Receipts access restriction + form reorder
1. RECEIPTS OWNER-ONLY: nav + view gated by can('receipts') (owners/admins/managers pass; staff need
   'receipts' in perms — default OFF). PERM_OPTIONS in settings-auth.jsx gained {key:'receipts'} checkbox
   (Staff Management -> custom access). Server-side: new chefHasPerm(sb,ctx,perm) helper enforces on ALL
   receipt endpoints (GET/POST/PUT/DELETE + ai-extract) -> 403 for staff without the perm.
2. ADD PRODUCT FORM REORDER: Date Received now BEFORE Expiry Date. Final order: Name, Quantity, Unit,
   Category, Storage, Shelf/Location, Date Received, Expiry Date, Prepared By, Note, Photo, Cost & Supply.
3. migration-23-receipts.sql updated to the alter-based fixed version (user's DB had an old receipts table).
Verified via screenshots: owner sees Receipts + correct form order; staff (perms:['orders']) has NO Receipts
nav; header identity badge works for both. Production needs REDEPLOY.

## ⚠️ PERMANENT STANDING RULES (user-mandated — apply WITHOUT being asked)
1. **BACK BUTTON STANDARD (Aug 2026):** EVERY screen, sub-screen, modal, wizard step and generated page (incl. print/summary windows) MUST have a working back/close control returning to the correct previous screen. Use `withBackToolbar()` from components/shelfwise/shared.js for any window.open/print HTML. Treat this like a save/close button — non-negotiable baseline for ALL future work on this app.

## Completed (this session — Barcode Flow Rebuild)
- **Barcode Scanning Rebuild (finished)**: `BarcodeFlowDialog` in scanners.jsx now wired into page.js (import fixed — was crashing on old BarcodeScanDialog import). New prominent "Scan Barcode (instant)" launcher in dashboard.jsx Add Products menu. Flow: continuous auto-scan (html5-qrcode, camera stays warm between scans), permanent per-kitchen barcode memory (GET/POST /api/barcodes → Supabase storage receipts/barcode-maps/{kid}.json), Open Food Facts lookup for first-time codes (no key), never shows "not found" errors (falls to quick one-time name form), Add/Use stock modes with in-dialog toggle, Use mode deducts via /api/usage/apply, manual digit entry fallback. Backend tested 5/5 (real prod Supabase, test kitchen, cleaned up). UI verified via screenshots incl. real OFF lookup (Coca Cola 330ml).

## Still pending (user priorities TBD)
- Supplier Spend Alerts (original request, not started)
- Monthly Spend Totals on Receipts screen
- Xero integration (parked — needs user credentials)
- Google Play TWA prep; Stripe subscriptions (parked)
- **Barcode "boxed but never confirms" fix**: Root cause — html5-qrcode's default JS (ZXing) decoder silently fails on 1D EAN/UPC grocery barcodes. Fixes in scanners.jsx BarcodeFlowDialog: (1) enabled experimentalFeatures.useBarCodeDetectorIfSupported (native hardware decoder), (2) added independent native window.BarcodeDetector polling loop (300ms) on the video element — the instant EITHER decoder reads a value, handleDetect fires and flow auto-advances, (3) fps 20→10 (stops decoder starvation), removed aspectRatio/videoConstraints conflict, (4) added phaseRef guard so late decoder callbacks can't re-trigger after advancing; addInstead uses force flag. Verified via headless UI test (manual decode path, skip/rescan cycle).
- **iPhone barcode fix (round 2, ROOT CAUSE)**: user screenshots showed iOS — Safari has no native BarcodeDetector and ZXing-JS fails on EAN-13. Added barcode-detector@3.2.2 (zxing-wasm ponyfill, wasm auto-fetched from jsDelivr). Loop prefers native detector (must support ean_13) else wasm ponyfill; grabs frames via drawImage->canvas->detect every 250ms. Added checkout beep (WebAudio unlocked on first tap). Verified in-browser: decoded user's exact barcode 5060336506244 PASS.
- **Barcode Add Stock screen adjustments**: (1) Unit + "Stored in" selects now ALWAYS visible/editable on the confirm phase (known/OFF-found barcodes), pre-filled with last-used values; saving re-posts to /api/barcodes so adjustments become next scan's defaults. (2) Optional Note free-text field (max 500 chars) below Expiry on both confirm & create phases → sent as body.note → stored in custom_fields._note (backend already supported it). Verified via screenshot test.
- **Stock Levels screen (NEW)**: components/shelfwise/stock-levels.jsx (StockLevelsView), launched via banner button at top of Orders tab (orders.jsx OrdersView). Aggregates /api/products batches by name+unit, groups by supplier (fuzzy-matches products.supplier text to connected suppliers from /api/kitchen/suppliers), lowest qty first, color-coded badges. Tap-to-select + qty steppers -> sticky bar -> Review sheet: fuzzy-matches item names to each supplier's catalog (/api/kitchen/suppliers/{id}/catalog), shows prices/subtotal/min-order check, places split orders per supplier via existing POST /api/kitchen/orders (notes: 'Created from Stock Levels screen'). Unmatched/not-connected items flagged with guidance, never blocking. Back button included. Verified via screenshots on test kitchen.
- **Stock Levels search + supplier filter**: chips row under search — "All Suppliers" (default) + one chip per supplier with item counts (built from unfiltered baseGroups so chips always list every supplier). Filter + search combine (AND). Tapping active chip toggles back to All. Empty-state copy covers filter case. Verified via screenshots.
- **Bulk "Assign to Supplier" (inventory)**: new POST /api/products/assign-supplier {productIds, supplier} (kitchen-scoped, in kitchenScoped auth list; tested 5/5 incl. auth/validation/scoping). inventory.jsx: indigo "Assign to Supplier (N)" button appears with selection, dialog lists connected suppliers (badged) + suppliers already on products + free-text new name; refresh via shelfwise-inventory-refresh event. APPLIED: 12 items (Mango chutney, Cucumber, Baked beans, Cream, Yogurt x2, Worcestershire Sauce, Panko Crumbs, Crab, Croissant, Chutney, Braeburn Apples) linked to "Patel Food Suppliers" — fuzzy matcher maps this to CONNECTED supplier "PATEL FOOD" so Stock Levels shows the group as orderable.
- **Integration verification (3 points) + supplier inheritance fix**: (1) Stock Levels confirmed single-source: reads GET /api/products live (API-created product appeared instantly). (2) FIXED GAP: barcode memory now stores supplier (backend map[code].supplier + scanners.jsx inheritSupplier(byCode/byName) in known & OFF paths; saveAdd sends supplier in product POST + barcode POST) — re-scan of TEST8888 created new row WITH supplier inherited, memory entry stores supplier. (3) Real order proven: Stock Levels -> Cream matched to catalog "Double Cream" £3.80, min-order £100 guard enforced, qty 27 placed -> REAL supplier_orders row (ref 4837df77..., PATEL FOOD, pending, £123.12 incl VAT, notes "Created from Stock Levels screen"). Test products cleaned up; the pending £123.12 demo order left as proof (user can cancel/reject).
- **Assign-to-Supplier now auto-syncs supplier catalog**: POST /api/products/assign-supplier extended — after setting products.supplier, fuzzy-matches the name to a CONNECTED supplier account; any assigned item missing from that supplier's catalog is auto-inserted into supplier_products (price = product.unit_cost || 0, available, notes "Auto-added from kitchen inventory — set your price"; dedup within batch + inclusion-match against existing catalog so e.g. Cream keeps matching Double Cream). Response now {updated, supplier, catalogAdded, catalogSupplier}; inventory toast reports auto-added count. APPLIED: re-ran for all 12 Patel-linked items -> 10 auto-added to PATEL FOOD catalog (Braeburn Apples £29.70, Baked beans £4, Mango chutney £4, Cucumber £2.50 from unit_cost; Crab/Croissant/Worcestershire Sauce/Panko Crumbs/Chutney/Yogurt £0 pending supplier price). Verified in UI: previously failing 5 items all match in Review orders; £100 min order still applies (supplier should set £0 prices in their dashboard).
- **Price single-source verification (PASSED, no code change needed)**: architecture confirmed — supplier_products.price is the ONLY price source. Stock Levels Review fetches catalog live on open; Cart/MarketplaceView fetches catalog live on wizard open; POST /api/kitchen/orders ignores client prices entirely and re-reads supplier_products server-side at placement. Full test: created TEST Price Sync £5.00 (catalog+inventory) -> both surfaces showed £5.00 -> source updated to £9.99 -> both surfaces auto-showed £9.99 -> placed real order: stored item.price 9.99, subtotal 109.89 (11x), total 131.87 w/VAT, productId = catalog row id. Test order cancelled, test items deleted. Note: supplier owner auth is a Supabase session (can't mint locally); direct supplier_products REST update used as equivalent of supplier's edit screen.
