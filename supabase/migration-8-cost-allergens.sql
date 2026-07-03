-- ShelfWise — Migration 8: Cost tracking + allergens + reorder points
-- Safe to run multiple times.

-- Change quantity from integer → numeric so fractional values (e.g. 2.5 kg) are allowed.
-- Prevents "invalid input syntax for type integer" errors on receipt/voice imports.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'products' and column_name = 'quantity' and data_type = 'integer'
  ) then
    alter table products alter column quantity type numeric using quantity::numeric;
  end if;
end $$;

-- Currency preference on the kitchen row (GBP / USD / EUR / INR / etc.)
alter table kitchens add column if not exists currency text not null default 'GBP';

-- Add cost per unit (default null = unknown)
alter table products add column if not exists unit_cost numeric;

-- Add reorder point (auto-suggest reorder when quantity dips below this)
alter table products add column if not exists reorder_point numeric;

-- Add allergens array (Postgres text array, e.g. {'gluten','nuts','dairy'})
alter table products add column if not exists allergens text[] not null default '{}';

-- Add supplier hint (free text for now — future: link to suppliers table)
alter table products add column if not exists supplier text not null default '';

-- Add source/notes for receipt-imported items so we can trace them
alter table products add column if not exists source text not null default '';   -- e.g. 'manual' | 'receipt' | 'voice' | 'barcode' | 'photo'
alter table products add column if not exists source_meta jsonb;                 -- e.g. {"receipt_id": "..."}

-- Handy index for reorder alerts
create index if not exists products_reorder_idx on products(kitchen_id) where reorder_point is not null;

-- Optional: receipts table (store imported receipts for audit)
create table if not exists receipts (
  id            uuid primary key default gen_random_uuid(),
  kitchen_id    uuid not null references kitchens(id) on delete cascade,
  imported_at   timestamptz not null default now(),
  supplier      text not null default '',
  total_cost    numeric,
  items_count   integer not null default 0,
  raw_text      text,           -- raw OCR text for audit
  photo_url     text,           -- optional supabase storage URL (not used in MVP)
  created_by    text not null default ''
);
create index if not exists receipts_kitchen_date_idx on receipts(kitchen_id, imported_at desc);
