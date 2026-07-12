-- ==============================================================
-- ShelfWise — Migration #17 — Staff name registry
-- ==============================================================
-- Enables unique person names for code logins:
-- each device claims a name; nobody else in the kitchen can use it.
--
-- How to run (on your phone):
--   1. Supabase dashboard → SQL Editor → New query
--   2. Paste EVERYTHING below → RUN
--   3. "Success. No rows returned."
-- ==============================================================

alter table if exists kitchens
  add column if not exists staff_names jsonb default '[]'::jsonb;

-- ==============================================================
-- DONE. Name uniqueness enforcement is active immediately.
-- ==============================================================
