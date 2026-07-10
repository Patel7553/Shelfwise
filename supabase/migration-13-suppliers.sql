-- ============================================================
-- Migration 13 — Suppliers directory + auto-order emails
-- Run this in the Supabase SQL editor.
-- ============================================================

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references kitchens(id) on delete cascade,
  name text not null,
  email text not null default '',
  phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_suppliers_kitchen on suppliers(kitchen_id);

-- RLS: service-role key bypasses RLS (API enforces kitchen scoping),
-- but enable it for defence-in-depth consistency with other tables.
alter table suppliers enable row level security;
