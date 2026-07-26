-- ShelfWise — Migration #20 — Supplier account role (Aug 2026)
-- Run this in Supabase SQL Editor → New query → Paste → Run.
--
-- Adds:
--   1. kitchens.account_type       ('kitchen' | 'supplier') — one accounts table for both roles
--   2. kitchens.supplier_profile   (business details for invoices)
--   3. supplier_products           (the supplier's sellable catalog)
--   4. supplier_orders             (incoming orders + invoice records)

alter table if exists kitchens
  add column if not exists account_type text default 'kitchen',
  add column if not exists supplier_profile jsonb default '{}'::jsonb;

create table if not exists supplier_products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null,
  name text not null,
  category text default '',
  unit text default '',
  pack_size text default '',
  price numeric default 0,
  sku text default '',
  available boolean default true,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_supplier_products_supplier on supplier_products(supplier_id);

create table if not exists supplier_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null,
  kitchen_id uuid,                    -- future two-way ordering: which kitchen placed it
  customer_name text default '',
  customer_email text default '',
  status text default 'pending',      -- pending | confirmed | fulfilled | cancelled
  items jsonb default '[]'::jsonb,    -- [{name, quantity, unit, price}]
  subtotal numeric default 0,
  vat_rate numeric default 0,
  total numeric default 0,
  notes text default '',
  invoice_number text,                -- assigned when fulfilled (INV-2026-0001)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  fulfilled_at timestamptz
);
create index if not exists idx_supplier_orders_supplier on supplier_orders(supplier_id);
create index if not exists idx_supplier_orders_status on supplier_orders(supplier_id, status);

-- RLS on (service-role key bypasses; blocks anon access) — same as migration-11.
alter table if exists supplier_products enable row level security;
alter table if exists supplier_orders enable row level security;
