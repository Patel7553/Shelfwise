-- ShelfWise — Migration #22 — Supplier-generated connection codes + client codes (Aug 2026)
-- Run this in Supabase SQL Editor → New query → Paste → Run.
--
-- Adds:
--   1. supplier_connections.client_code — the supplier's own internal client/account code
--      for that restaurant (carried over automatically when a connection code is redeemed)
--   2. supplier_invites — single-use connection codes a supplier generates per client

alter table if exists supplier_connections
  add column if not exists client_code text default '';

create table if not exists supplier_invites (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null,
  code text not null,                 -- e.g. CON-8XK2FQ (shared with the restaurant outside the app)
  client_code text default '',        -- supplier's internal client code, carried to the connection
  client_label text default '',       -- optional label so the supplier knows who it's for
  status text default 'active',       -- active | used | revoked
  used_by_kitchen_id uuid,
  used_at timestamptz,
  created_at timestamptz default now()
);
create unique index if not exists idx_supplier_invites_code on supplier_invites(code);
create index if not exists idx_supplier_invites_supplier on supplier_invites(supplier_id);

-- RLS on (service-role key bypasses; blocks anon access)
alter table if exists supplier_invites enable row level security;
