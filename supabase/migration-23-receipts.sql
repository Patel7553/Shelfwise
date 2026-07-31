-- ============================================================
-- Migration 23 — Receipt Scanner & Export
-- Run this in the Supabase SQL editor.
-- ============================================================

create table if not exists receipts (
  id uuid primary key,
  kitchen_id uuid not null references kitchens(id) on delete cascade,
  receipt_date date,
  supplier text not null default '',
  amount numeric,
  currency text not null default '',
  status text not null default 'pending',        -- pending | submitted | reviewed
  color text not null default '',                -- optional colour tag
  notes text not null default '',
  image_path text not null default '',           -- path inside the private "receipts" storage bucket
  file_type text not null default '',            -- 'image' | 'pdf' | '' (details-only record)
  added_by text not null default '',
  edited_by text not null default '',
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_receipts_kitchen_date on receipts (kitchen_id, receipt_date desc);

alter table receipts enable row level security;
-- The app talks to the DB with the service-role key only (like every other table).

-- Private storage bucket for the scanned images / PDFs
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;
