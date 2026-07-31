-- ============================================================
-- Migration 23 (fixed) — Receipt Scanner & Export
-- Run this in the Supabase SQL editor.
-- Works even if an old "receipts" table already exists:
-- it adds any missing columns instead of failing.
-- ============================================================

create table if not exists receipts (
  id uuid primary key
);

alter table receipts add column if not exists kitchen_id uuid references kitchens(id) on delete cascade;
alter table receipts add column if not exists receipt_date date;
alter table receipts add column if not exists supplier text not null default '';
alter table receipts add column if not exists amount numeric;
alter table receipts add column if not exists currency text not null default '';
alter table receipts add column if not exists status text not null default 'pending';   -- pending | submitted | reviewed
alter table receipts add column if not exists color text not null default '';           -- optional colour tag
alter table receipts add column if not exists notes text not null default '';
alter table receipts add column if not exists image_path text not null default '';      -- path in the private "receipts" bucket
alter table receipts add column if not exists file_type text not null default '';       -- 'image' | 'pdf' | ''
alter table receipts add column if not exists added_by text not null default '';
alter table receipts add column if not exists edited_by text not null default '';
alter table receipts add column if not exists edited_at timestamptz;
alter table receipts add column if not exists created_at timestamptz not null default now();

create index if not exists idx_receipts_kitchen_date on receipts (kitchen_id, receipt_date desc);

alter table receipts enable row level security;
-- The app talks to the DB with the service-role key only (like every other table).

-- Private storage bucket for the scanned images / PDFs
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;
