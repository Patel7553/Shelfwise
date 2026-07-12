-- ==============================================================
-- ShelfWise — Migration #16 — Recipes: multi-tenant kitchen_id
-- ==============================================================
-- FIXES: "Failed to save recipe" error.
-- The recipes table was created (migration-2) WITHOUT a kitchen_id
-- column, but the app saves recipes per-kitchen. This adds it.
--
-- How to run (on your phone):
--   1. Open the Supabase dashboard → your ShelfWise project
--   2. SQL Editor → New query
--   3. Paste EVERYTHING below → RUN
--   4. You should see "Success. No rows returned."
-- ==============================================================

alter table if exists recipes
  add column if not exists kitchen_id uuid;

create index if not exists idx_recipes_kitchen on recipes(kitchen_id);

-- ==============================================================
-- DONE. Recipe saving will work immediately — no redeploy needed.
-- ==============================================================
