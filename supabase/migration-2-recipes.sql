-- ShelfWise — Migration #2 — Recipes table (run after the first migration)
-- Run this in Supabase SQL Editor → New query → Paste → Run without RLS

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  title text,
  servings text,
  ingredients jsonb default '[]'::jsonb,
  allergens jsonb default '[]'::jsonb,
  steps jsonb default '[]'::jsonb,
  matched jsonb default '[]'::jsonb,
  summary jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

create index if not exists idx_recipes_title on recipes(title);
create index if not exists idx_recipes_created_at on recipes(created_at desc);
