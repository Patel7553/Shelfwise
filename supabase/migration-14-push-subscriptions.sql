-- ============================================================
-- Migration 14 — Web Push notification subscriptions
-- Run this in the Supabase SQL editor.
-- ============================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references kitchens(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  user_label text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subs_kitchen on push_subscriptions(kitchen_id);

alter table push_subscriptions enable row level security;
