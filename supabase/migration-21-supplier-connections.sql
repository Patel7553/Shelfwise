-- ShelfWise — Migration #21 — Supplier↔Kitchen connections + B2B ordering (Aug 2026)
-- Run this in Supabase SQL Editor → New query → Paste → Run.
--
-- Adds:
--   1. kitchens.supplier_code        — short shareable code (SUP-XXXXXX) suppliers give to customers
--   2. supplier_connections          — which kitchens are connected to which suppliers
--   3. supplier_orders.requested_delivery_date — kitchen's requested delivery date

alter table if exists kitchens
  add column if not exists supplier_code text;
create index if not exists idx_kitchens_supplier_code on kitchens(supplier_code);

create table if not exists supplier_connections (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null,
  kitchen_id uuid not null,
  status text default 'active',
  created_at timestamptz default now()
);
create unique index if not exists idx_supplier_connections_pair on supplier_connections(supplier_id, kitchen_id);
create index if not exists idx_supplier_connections_kitchen on supplier_connections(kitchen_id);

alter table if exists supplier_orders
  add column if not exists requested_delivery_date date;

-- RLS on (service-role key bypasses; blocks anon access)
alter table if exists supplier_connections enable row level security;
