-- ShelfWise — Schema migration for the AI upgrade
-- Run this in Supabase SQL Editor → New query → Paste → Run without RLS

alter table if exists products
  add column if not exists custom_fields jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamp with time zone default now();

create table if not exists settings (
  id text primary key default 'kitchen',
  kitchen_name text default '',
  kitchen_type text default '',
  onboarded boolean default false,
  custom_fields jsonb default '[]'::jsonb,
  updated_at timestamp with time zone default now()
);

create index if not exists idx_products_category on products(category);
create index if not exists idx_products_storage_type on products(storage_type);
create index if not exists idx_products_expiry_date on products(expiry_date);
