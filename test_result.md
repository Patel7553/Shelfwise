#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  ShelfWise — Kitchen inventory & waste-reduction web app for restaurants, cafes, hotels & institutional kitchens.
  Built with Next.js (App Router) + MongoDB. Core features: dashboard with status counts, product CRUD, search/filter/sort,
  CSV export, AI Logbook Scan (GPT-4o vision), Recipe Scan (ingredient + allergen extraction), per-kitchen settings
  with onboarding wizard + custom fields.

backend:
  - task: "AI Recipe Web Search (POST /api/recipe/web-search)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            NEW FEATURE (this session): POST /api/recipe/web-search
            Body: { query: "dish name", servings?: number (1-20, default 4) }
            Auth: requires Bearer token (Supabase owner token OR chef JWT signed with SHELFWISE_JWT_SECRET).
            Uses gpt-4o-mini via EMERGENT_LLM_KEY to return the 3 best-known web recipes for the dish.
            Response: { recipes: [{ title, description, source, style, servings, prepMinutes, cookMinutes,
                        difficulty, cuisine, allergens[], ingredients[{name, quantity(number), unit}], steps[], notes }] }
            All ingredient quantities sanitised to numbers server-side for client scaling (1x-5x).
            Main agent smoke-tested locally with chef JWT: 200 OK, 3 recipes, valid shape, numeric quantities.
            NOTE: Supabase env vars NOT configured locally — auth only testable via chef JWT
            (SHELFWISE_JWT_SECRET=local-dev-secret-shelfwise-2026 added to /app/.env for local dev testing).
        - working: "NA"
          agent: "main"
          comment: |
            UPDATE (user feedback): 1) Refactored to 3 PARALLEL LLM calls (one per style:
            Classic Traditional / Quick & Easy / Restaurant Quality) — response time cut
            from ~23s to ~11s. 2) Default servings changed from 4 to 1 (backend default
            + frontend input default). Smoke-tested: 200 OK in 11.3s, 3 recipes,
            servings=1 when omitted, numeric quantities intact. Needs focused retest.
        - working: true
          agent: "testing"
          comment: |
            ✅ AI Recipe Web Search endpoint fully tested and working (5/5 tests passed):
            - Test 1: POST without auth header → 401 "Not authenticated" ✓
            - Test 2: POST with valid JWT but empty body {} → 400 "query (dish name) required" ✓
            - Test 3: POST with valid JWT + {"query": "Spaghetti Carbonara", "servings": 4} → 200 with 3 recipes ✓
              * All recipes have correct structure: title, source, style, servings=4, prepMinutes, cookMinutes, difficulty, cuisine
              * Allergens array contains lowercase strings (eggs, dairy, gluten for carbonara) ✓
              * Ingredients array: all quantities are numeric type (not strings) ✓
              * Steps array: non-empty strings ✓
              * Recipes from known sources: BBC Good Food, Jamie Oliver, Serious Eats ✓
            - Test 4: POST with valid JWT + {"query": "Butter Chicken", "servings": 2} → 200, all recipes have servings=2 ✓
            - Test 5: POST with valid JWT + {"query": ""} → 400 "query (dish name) required" ✓
            
            Authentication: Chef JWT generated locally using SHELFWISE_JWT_SECRET works correctly.
            LLM Integration: gpt-4o-mini calls via EMERGENT_LLM_KEY working (20-30s response time).
            Data Validation: All ingredient quantities correctly sanitized to numeric type for client-side scaling.
            Test file: /app/test_recipe_web_search.py (can be re-run anytime).
        - working: true
          agent: "testing"
          comment: |
            ✅ FOCUSED RETEST COMPLETE - Parallel LLM optimization verified (4/4 tests passed):
            - Test 1: POST without auth header → 401 "Not authenticated" ✓
            - Test 2: POST with valid JWT but empty body {} → 400 "query (dish name) required" ✓
            - Test 3: POST {"query": "Spaghetti Carbonara"} (servings OMITTED) → 200 ✓
              * Response time: 6.4s (excellent! much faster than old ~25s, even better than expected ~8-15s)
              * Returns 3 recipes with 3 DISTINCT styles: "Classic Traditional", "Quick & Easy", "Restaurant Quality" ✓
              * EVERY recipe has servings === 1 (new default when omitted) ✓
              * All ingredient quantities are numeric type ✓
              * Allergens are lowercase arrays ✓
              * Steps are non-empty strings ✓
            - Test 4: POST {"query": "Lasagna", "servings": 6} → 200 ✓
              * Response time: 6.9s
              * All 3 recipes have servings === 6 ✓
            
            PERFORMANCE: Parallel LLM calls working excellently - response times 6.4-6.9s (vs old ~25s).
            DEFAULT SERVINGS: Confirmed changed from 4 to 1 when omitted from request body.
            STYLES: All 3 recipes have distinct styles from WEB_RECIPE_STYLES array.
            Test file: /app/test_recipe_web_search.py (updated for focused retest).

  - task: "Products CRUD + filtering"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Endpoints:
              GET /api/products?status=&category=&storage=&search=&sort=
              POST /api/products
              PUT /api/products/:id
              DELETE /api/products/:id
              POST /api/products/bulk
            Server-side computes _status (Expired / Expiring / Critical / Ok) per record.
            Filters: status, category, storage, search (name substring, case-insensitive), sort by expiryDate asc/desc.
            Uses uuid v4 (no Mongo ObjectId leakage). All persistence in MONGO_URL DB_NAME (env-driven).
        - working: true
          agent: "testing"
          comment: |
            ✅ All CRUD operations tested and working:
            - GET /api/products: Returns 8 items, all with _status field and UUID v4 IDs
            - Filter by status (Expired/Expiring/Critical/Ok): All filters working correctly
            - Filter by category (Dairy): Returns 2 items, all match
            - Filter by storage (Fridge): Returns 5 items, all match
            - Search by name (case-insensitive): "milk" finds "Whole Milk"
            - Sort by expiryDate (asc/desc): Both directions working correctly
            - POST /api/products with customFields: Created successfully, custom fields preserved
            - PUT /api/products/:id with customFields: Updated successfully, changes persisted
            - POST /api/products/bulk: Inserted 2 items successfully
            - DELETE /api/products/:id: Deletion verified
            No ObjectId leakage, all responses JSON-serializable.

  - task: "Dashboard stats endpoint"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            GET /api/stats returns { total, expiring, expired, critical } — counts must match
            the underlying products with computed statuses.
        - working: true
          agent: "testing"
          comment: |
            ✅ Stats endpoint working correctly:
            - Total: 8/8 ✓
            - Expired: 1/1 ✓
            - Expiring: 4/4 ✓
            - Critical: 1/1 ✓
            All counts match underlying products perfectly.

  - task: "Facets endpoint (categories, storages)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            GET /api/facets returns distinct categories + storages from existing products, sorted alphabetically.
        - working: true
          agent: "testing"
          comment: |
            ✅ Facets endpoint working correctly:
            - Returns 7 distinct categories, sorted alphabetically
            - Returns 3 distinct storages, sorted alphabetically
            All data correctly extracted and sorted.

  - task: "Seed sample data"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            POST /api/seed wipes products collection and inserts 8 sample kitchen items spanning Expired / Expiring / Ok / Critical.
        - working: true
          agent: "testing"
          comment: |
            ✅ Seed endpoint working correctly:
            - Successfully inserted 8 sample products
            - Products span all status types (Expired/Expiring/Critical/Ok)

  - task: "AI Logbook Scan (vision)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            POST /api/scan accepts { image: "data:image/...;base64,..." } and calls GPT-4o via
            Emergent Universal LLM Key at https://integrations.emergentagent.com/llm/v1/chat/completions.
            Returns { items: [{ name, quantity, unit, expiryDate, category, storageType, location, preparedBy }] }.
            Verified manually with a sample grocery list image → 7 items extracted.
            Validates that image is a data URL and key is set. Should reject invalid payloads with 400.
        - working: true
          agent: "testing"
          comment: |
            ✅ AI Logbook Scan working correctly:
            - Invalid payload (missing image): Returns 400 ✓
            - Invalid payload (non-data-url): Returns 400 ✓
            - Valid data URL: Returns 200 with items array ✓
            Error handling and validation working as expected.

  - task: "AI Recipe Scan"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            POST /api/recipe accepts { image } OR { text }. Calls GPT-4o, parses recipe into
            { title, servings, ingredients[], allergens[], steps[] } and cross-references with inventory
            (substring matching) to add matched[] with status (in_stock / low / expired / missing) +
            summary { inStock, low, expired, missing }. Verified manually with carbonara + creamy salmon pasta recipes.
        - working: true
          agent: "testing"
          comment: |
            ✅ AI Recipe Scan working correctly:
            - Invalid payload (no image/text): Returns 400 ✓
            - With text (Spaghetti Carbonara): Returns complete recipe with title, 7 ingredients, 3 allergens, matched ingredients, and summary ✓
            - With image: Returns 200 with all required fields ✓
            Inventory matching and summary generation working correctly.

  - task: "Kitchen settings & custom fields"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            GET /api/settings returns single 'kitchen' doc (or defaults with onboarded:false).
            PUT /api/settings upserts the kitchen doc with kitchenName, kitchenType, onboarded, customFields[].
            customFields are sanitized: key forced to /^[a-z0-9_]+$/, type restricted to text|number|date,
            entries without label are filtered out.
            Products POST + PUT accept and persist customFields as a free-form object { [key]: value }.
        - working: true
          agent: "testing"
          comment: |
            ✅ Kitchen settings working correctly:
            - GET /api/settings: Returns kitchen doc with all required fields ✓
            - PUT /api/settings: Successfully updates kitchenName, kitchenType, onboarded, and 4 custom fields ✓
            - Persistence verified: GET after PUT returns updated values ✓
            Custom fields sanitization and validation working as expected.

frontend:
  - task: "Frontend UI (Dashboard, Inventory, Scan, Recipe, Wizard)"
    implemented: true
    working: "NA"
    file: "app/page.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Frontend complete with Dashboard view (status cards, urgent items, expiry alert banner),
            Inventory view (search, status/category/storage filters, expiry sort, CSV export, image thumbnails),
            Add/Edit dialog with photo upload + dynamic custom fields, AI Scan dialog, Recipe Scan dialog,
            3-step Setup Wizard auto-opens for new kitchens, Settings dialog for editing later.
            Backend testing first per protocol — frontend testing requires explicit user permission.

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        NEW SESSION (June 2025): Added AI Recipe Web Search feature.
        Backend: POST /api/recipe/web-search { query, servings? } → { recipes: [3 best web recipes] }.
        Frontend: New "Search Web Recipes" tab in RecipesView with allergen badges, 1x-5x scaling, save-to-collection.
        IMPORTANT TESTING CONSTRAINTS:
        - Supabase env vars are NOT configured locally, so owner login/signup CANNOT be tested locally.
        - To authenticate locally, mint a chef JWT:
          node -e "console.log(require('/app/node_modules/jsonwebtoken').sign({kitchen_id:'test-kitchen',role:'chef'},'local-dev-secret-shelfwise-2026',{expiresIn:'1h'}))"
          and send it as Authorization: Bearer <token>.
        - Test ONLY the new endpoint (recipe/web-search) + auth rejection. Do NOT test Supabase-dependent endpoints locally (they will 401/500 — this is expected, not a bug).
    - agent: "main"
      message: |
        Backend implementation is complete across 4 phases. Please run a comprehensive backend test pass.

        Environment notes:
          - Base URL: read NEXT_PUBLIC_BASE_URL from /app/.env and prefix with /api
          - All endpoints prefixed with /api
          - MongoDB and EMERGENT_LLM_KEY are pre-configured in /app/.env — DO NOT modify

        Suggested test flow:
          1. POST /api/seed to load sample data.
          2. GET /api/products with no filter → expect 8 items, each with _status field.
          3. GET /api/products?status=Expired, ?status=Expiring, ?status=Critical, ?status=Ok — verify subsets.
          4. GET /api/products?category=Dairy, ?storage=Fridge — verify category/storage filters.
          5. GET /api/products?search=milk — case-insensitive substring on name.
          6. GET /api/products?sort=asc and ?sort=desc — verify ordering by expiryDate.
          7. GET /api/stats — counts must match GET /api/products groupings.
          8. GET /api/facets — distinct sorted categories and storages.
          9. POST /api/products with full payload (including customFields: { supplier: "ACME" }) → 201 + record returned.
          10. PUT /api/products/:id with updates including customFields → updated record.
          11. POST /api/products/bulk with array of 2-3 items.
          12. DELETE /api/products/:id.
          13. GET /api/settings (initially onboarded:false) → PUT with kitchenName, kitchenType, customFields, onboarded:true → GET again to confirm persistence.
          14. POST /api/scan with invalid payload (missing image / non-data-url) → expect 400.
          15. POST /api/scan with valid data URL of a small handwritten/text image → expect 200 with items[].
          16. POST /api/recipe with { text: "..." } using a real recipe → expect title, ingredients, allergens, matched, summary.
          17. POST /api/recipe with neither image nor text → 400.
          18. Confirm all responses are JSON-serializable (no ObjectId leakage).

        Known constraints:
          - Use the EMERGENT_LLM_KEY already in /app/.env — do not request a new key.
          - GPT-4o vision calls can take 1-5 seconds per call; keep timeouts generous.
    
    - agent: "testing"
      message: |
        ✅ BACKEND TESTING COMPLETE - ALL TESTS PASSED (22/22)
        
        Comprehensive backend test suite executed successfully. All endpoints tested with real-looking data:
        
        **Test Results Summary:**
        1. ✅ Products CRUD + filtering (10 tests) - All operations working
        2. ✅ Dashboard stats endpoint - Counts match perfectly
        3. ✅ Facets endpoint - Distinct values sorted correctly
        4. ✅ Seed sample data - 8 products inserted
        5. ✅ AI Logbook Scan - Error handling + valid requests working
        6. ✅ AI Recipe Scan - Text/image processing + inventory matching working
        7. ✅ Kitchen settings & custom fields - CRUD + persistence working
        8. ✅ Data integrity - No ObjectId leakage, all UUID v4
        
        **Key Validations:**
        - Status computation (Expired/Expiring/Critical/Ok) working correctly
        - All filters (status, category, storage, search, sort) working
        - Custom fields preserved in products and settings
        - AI endpoints using EMERGENT_LLM_KEY successfully
        - Error handling (400 responses) working as expected
        - All responses JSON-serializable
        
        **Test file:** /app/backend_test.py (can be re-run anytime)
        
        No critical issues found. Backend is production-ready.
    
    - agent: "testing"
      message: |
        ✅ NEW FEATURE TESTING COMPLETE - AI Recipe Web Search (5/5 tests passed)
        
        Tested POST /api/recipe/web-search endpoint as per review_request:
        
        **Test Results:**
        1. ✅ Authentication: No auth header → 401 "Not authenticated"
        2. ✅ Validation: Empty body → 400 "query (dish name) required"
        3. ✅ Valid request (Spaghetti Carbonara, servings=4):
           - Returns 200 with 3 recipes from known sources (BBC Good Food, Jamie Oliver, Serious Eats)
           - All recipes have correct structure and required fields
           - Allergens array contains lowercase strings (eggs, dairy, gluten)
           - ALL ingredient quantities are numeric type (not strings) ✓
           - Steps array non-empty with string values
           - Servings correctly set to 4
        4. ✅ Servings parameter: Butter Chicken with servings=2 → all recipes have servings=2
        5. ✅ Empty query validation: Empty string → 400 error
        
        **Key Validations:**
        - Chef JWT authentication working correctly (SHELFWISE_JWT_SECRET)
        - LLM integration via EMERGENT_LLM_KEY working (gpt-4o-mini, 20-30s response time)
        - Ingredient quantity sanitization to numeric type working perfectly
        - Error handling (401, 400) working as expected
        
        **Test file:** /app/test_recipe_web_search.py
        
        No issues found. Endpoint is production-ready.
    
    - agent: "testing"
      message: |
        ✅ FOCUSED RETEST COMPLETE - Parallel LLM Optimization Verified (4/4 tests passed)
        
        Tested POST /api/recipe/web-search after parallel LLM refactor and default servings change:
        
        **Test Results:**
        1. ✅ Authentication: No auth header → 401 "Not authenticated"
        2. ✅ Validation: Empty body → 400 "query (dish name) required"
        3. ✅ Spaghetti Carbonara (servings OMITTED):
           - Response time: 6.4s (EXCELLENT! Much faster than old ~25s, even better than expected ~8-15s)
           - Returns 3 recipes with 3 DISTINCT styles: "Classic Traditional", "Quick & Easy", "Restaurant Quality"
           - EVERY recipe has servings === 1 (new default when omitted) ✓
           - All ingredient quantities numeric, allergens lowercase, steps non-empty ✓
        4. ✅ Lasagna with servings=6:
           - Response time: 6.9s
           - All 3 recipes have servings === 6 ✓
        
        **Key Findings:**
        - ⚡ PERFORMANCE: Parallel LLM calls working excellently - response times 6.4-6.9s (vs old ~25s)
        - 🎯 DEFAULT SERVINGS: Confirmed changed from 4 to 1 when omitted from request body
        - 🎨 STYLES: All 3 recipes have distinct styles from WEB_RECIPE_STYLES array
        - 🔒 AUTH & VALIDATION: Working correctly
        
        **Test file:** /app/test_recipe_web_search.py (updated for focused retest)
        
        No issues found. Parallel optimization is a huge success!


---

## 2026-06-14 — Onboarding Widget Picker (Phase 3+)

**Feature added by main agent**: Visual widget picker added to first-time signup flow + Setup Wizard.

**Frontend changes** (`/app/app/page.js`):
1. `LoginGate` — added new `'type'` step between login and widgets so first-time signup now asks: Name → Email → Kitchen Name → **Kitchen Type** → **Dashboard Widgets** → Code
2. `LoginGate` widget picker upgraded from plain checkboxes to clickable cards with icons, descriptions, emerald active state. "Urgent items list" widget removed per user request.
3. `SetupWizard` (Settings → Re-run wizard) — added new step 2 "What do you want on your dashboard?" with the same card UI between Kitchen Setup and Custom Fields. Total steps now 4.
4. `SettingsDialog` — added "Re-run setup wizard" button in Kitchen Profile tab so existing users can revisit onboarding any time.

**Backend changes**: None — uses existing `dashboardWidgets` JSONB column added in migration #4.

**Tested locally**: Playwright screenshot run confirms all 3 new steps render correctly (login form → kitchen type grid → widget cards). Code is packaged into `/app/public/shelfwise-supabase.zip` for the user to push to GitHub → Vercel.

**Pending user action**: Replace files in local repo, `git add . && git commit && git push` to deploy.

---

## 2026-07-03 — HACCP Compliance Module (Migration 9)

**Feature added by main agent**: Full HACCP food safety records module to support UK/EU legal compliance and pass health inspections. This is the app's biggest B2B selling point — kitchens are legally required to maintain 3+ months of these records.

**DB changes** (`supabase/migration-9-haccp.sql`) — 4 new tables:
1. `haccp_temperature_logs` — fridge/freezer/hot-hold readings, PASS/FAIL flag
2. `haccp_cleaning_tasks` — task templates with frequency (daily/weekly/monthly), soft-deletable via `active=false`
3. `haccp_cleaning_log` — completion audit trail
4. `haccp_delivery_checks` — supplier goods-in inspection (temp, packaging, labels, overall pass)
All indexed by `(kitchen_id, timestamp desc)`. All FK to `kitchens` with `on delete cascade`.

**Backend changes** (`app/api/[[...path]]/route.js`):
- New row-shape helpers: `haccpTempFromDb`, `haccpTaskFromDb`, `haccpCleaningLogFromDb`, `haccpDeliveryFromDb`
- Added `'haccp'` to the `ownerOrChef` GET path allowlist
- GET endpoints: `/api/haccp/temperatures`, `/api/haccp/cleaning-tasks`, `/api/haccp/cleaning-log`, `/api/haccp/deliveries`, `/api/haccp/export?days=N`
- POST endpoints: same paths — log temp, create/edit cleaning task, mark cleaning complete, log delivery check
- DELETE endpoints: `/api/haccp/temperatures/:id`, `/api/haccp/cleaning-tasks/:id` (soft-delete), `/api/haccp/cleaning-log/:id`, `/api/haccp/deliveries/:id`
- All routes are kitchen-scoped via `requireOwnerOrChef` + `.eq('kitchen_id', kid)`; return `[]` gracefully if migration-9 not yet run.

**Frontend changes** (`app/app/page.js`):
- Added `Thermometer`, `Droplets`, `Truck`, `ClipboardCheck`, `FileText` icons from lucide-react
- Added `'haccp'` to both `MODULES` (SetupWizardV2) and `ALL_MODULES` (SettingsDialog) so users can enable it
- Added `hasHaccp` derived boolean + `Compliance` nav button (desktop + mobile) + `view === 'haccp'` render slot
- New `HaccpView` component (~470 lines) with 3 tabs: **Temperatures | Cleaning | Deliveries**
- Summary cards at top: 7-day temps count + fails, cleaning tasks due today, deliveries + rejections, total records
- Per-tab: Add / Edit / Delete actions with modal dialogs, table view with PASS/FAIL badges
- Cleaning tab intelligently highlights tasks that are OVERDUE based on their frequency + last completion timestamp
- **Print 30-day report** button — opens a browser popup with a fully formatted HACCP audit report (auto-triggers `window.print()`); user saves as PDF for inspectors.

**Testing**: Backend endpoints not tested by automated agent (require live Supabase auth) — user will validate end-to-end on Vercel after running migration-9-haccp.sql in Supabase SQL Editor.

**Pending user action**:
1. Run `supabase/migration-9-haccp.sql` in Supabase SQL Editor.
2. Extract `shelfwise-session-haccp.zip` and drag-drop replace files in local repo.
3. Commit + push → Vercel auto-deploys.
4. Enable "HACCP Compliance" module in Settings → Modules for the desired kitchens.

---

## 2026-07-03 — Barcode Scanner: GPT-4o Vision Fallback

**Bug fix by main agent**: User reported barcode scanner "still can't scan any products" — even for UK Tesco items. Root cause: Open Food Facts returns records with EMPTY `product_name` for many UK own-brand items, so the flow flagged them as `found` and opened an empty form. UPCitemdb trial tier is also rate-limited at 100/day, and Indian regional products are missing entirely.

**Backend changes** (`app/api/[[...path]]/route.js`):
- New `identifyProductFromPhoto(base64, barcodeHint)` helper — GPT-4o Vision reads the front of a pack and returns `{name, brand, quantity, unit, category, storageType, confidence}`.
- New POST endpoint `/api/identify-product` — accepts `{image, barcode?}`, requires auth, returns the parsed product.

**Frontend changes** (`app/app/page.js`):
- `onBarcodeFound()` now only treats a public-database result as "found" when the `product_name` field is a non-empty string (previously it accepted blank).
- New `aiFallback` state + `handleAiFallbackPhoto()` handler for the AI Vision fallback flow.
- New `<Dialog>` "Identify by photo" — appears when all 4 public databases return nothing. User taps → device camera opens → snaps front of pack → AI extracts details → prefills SnapItem form.
- After AI success, product is saved to inventory with the barcode in `customFields.barcode` — next scan of the same code hits the user's history match instantly (learning behaviour).

**Testing**: User will validate end-to-end on Vercel with real UK Tesco / Indian products.

**Pending user action**: Extract `shelfwise-session-barcode-ai.zip` → drag-drop replace `app/page.js` + `app/api/[[...path]]/route.js` → commit + sync → wait 2 min for Vercel.

---

## 2026-07-03 — Weekly Digest Email (Vercel Cron + Resend)

**Feature added by main agent**: Automated Monday 8am UTC weekly digest email — waste, cost, expiring items and top-wasted items. Uses existing Resend + verified `shelfwise.co.in` domain. Sent to owner email only.

**DB changes** (`supabase/migration-10-weekly-digest.sql`):
- New column `kitchens.weekly_digest_enabled boolean not null default true` — owner-controlled toggle
- New column `kitchens.last_digest_sent_at timestamptz` — dedupe safety net

**Backend changes** (`app/api/[[...path]]/route.js`):
- `resendSend({to, subject, html})` helper — reusable wrapper around Resend API
- `computeWeeklyDigest(sb, kitchen)` — aggregates last 7 days per kitchen: inventory value, expired, expiring-in-7-days, reorder-needed, waste (count + cost + top 3 items), money-at-risk
- `buildDigestHtml(digest)` — branded responsive email template (green hero, stat grid, expiring table, waste breakdown, CTA)
- `escapeHtml()` — XSS-safe formatter
- GET `/api/cron/weekly-digest` — bearer-token-secured; loops all approved kitchens with digest enabled; sends via Resend with 550ms pacing; updates `last_digest_sent_at`; returns per-kitchen success/failure array
- POST `/api/digest/send-test` — owner-only; computes their own digest and sends to owner_email; used by the "Send me a test digest now" button
- `kitchenToApi()` now exposes `weeklyDigestEnabled` + `lastDigestSentAt`
- PUT `/api/settings` accepts `weeklyDigestEnabled` boolean

**Vercel config** (`vercel.json` — NEW FILE at repo root):
- `crons: [{ path: '/api/cron/weekly-digest', schedule: '0 8 * * 1' }]` — Monday 8am UTC
- Vercel automatically calls this endpoint with `Authorization: Bearer $CRON_SECRET` — user must set CRON_SECRET env var in Vercel

**Frontend changes** (`app/app/page.js`):
- SettingsDialog "Login & Emails" tab: new emerald card "📊 Weekly Digest Email" with ON/OFF toggle + "Send me a test digest now" button (calls `/api/digest/send-test`)
- `weeklyDigest` + `digestSending` state; `sendTestDigest()` handler; wired into `save()` payload

**Testing**: Local sandbox has no Supabase creds so cron returns 500 (expected). User will validate on Vercel after (a) running migration-10, (b) adding CRON_SECRET env var, (c) deploying.

**Pending user action**:
1. Run `supabase/migration-10-weekly-digest.sql` in Supabase SQL Editor.
2. In Vercel → Settings → Environment Variables, add `CRON_SECRET` = any random 32+ char string (Vercel auto-adds it to the cron request).
3. Extract zip → drag-drop `app/page.js`, `app/api/[[...path]]/route.js`, `vercel.json` (NEW at root) → commit + sync.
4. Test flow: log in → Settings → Login & Emails → toggle ON → "Send me a test digest now" → check inbox.
5. Wait until Monday 8am UTC to see the cron fire.
