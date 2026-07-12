-- ==============================================================
-- ShelfWise — Migration #18 — Activity Log
-- ==============================================================
-- Records WHO did WHAT and WHEN (items added/edited/deleted,
-- recipes saved, waste logged, temperatures logged).
-- Owner can view the full history in Settings → Staff & Activity.
--
-- How to run (on your phone):
--   1. Supabase dashboard → SQL Editor → New query
--   2. Paste EVERYTHING below → RUN
--   3. "Success. No rows returned."
-- ==============================================================

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid,
  person text,
  action text,
  detail text,
  created_at timestamptz default now()
);

create index if not exists idx_activity_kitchen_time
  on activity_logs (kitchen_id, created_at desc);

-- Lock the table down — only the app's service role can read/write.
alter table activity_logs enable row level security;

-- ==============================================================
-- DONE. Activity starts recording immediately.
-- ==============================================================
