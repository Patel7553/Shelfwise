# ShelfWise v2.1 — AI-Powered Kitchen Inventory

## What's new in v2.1
- Saved Recipes — recipes you scan can now be saved and viewed later
- Big allergen warning banner at the top of each recipe
- Search box for the Recipes section

## Quick Start
1. `yarn install`
2. Create `.env.local` (copy from .env.example) with your Supabase keys
3. Run migrations in Supabase SQL Editor:
   - First: `supabase/migration.sql`
   - Then: `supabase/migration-2-recipes.sql`
4. `yarn dev`

## Files
- `app/page.js` — Frontend
- `app/api/[[...path]]/route.js` — Backend API
- `lib/supabaseAdmin.js` — Supabase client
- `supabase/migration*.sql` — DB migrations
