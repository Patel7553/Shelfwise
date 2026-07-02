-- =============================================================================
-- ShelfWise Multi-Tenant Migration (v5)
-- Run this in Supabase Dashboard → SQL Editor → New query → Paste → Run
-- =============================================================================
-- What this does:
--  1) Creates the `kitchens` table (one row per restaurant/hospital/kitchen).
--  2) Adds `kitchen_id` FK to `products` and `settings` for data isolation.
--  3) Wipes all existing product / settings data (fresh multi-tenant start).
--  4) Adds an `admin_approvals` audit table.
--  5) Adds a keep-alive helper table (so we can ping the DB safely).
-- =============================================================================

-- 1) Kitchens table -----------------------------------------------------------
create table if not exists kitchens (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid unique not null,                    -- links to auth.users.id
  owner_email       text not null,
  kitchen_name      text not null,
  kitchen_type      text default '',
  timezone          text default 'Asia/Kolkata',
  status            text not null default 'pending',         -- pending | approved | rejected | suspended
  code_seed         text not null,                           -- random secret used to derive daily chef codes
  dashboard_widgets jsonb default '["all","expiring","expired","critical"]'::jsonb,
  custom_fields     jsonb default '[]'::jsonb,
  categories        jsonb default '[]'::jsonb,               -- blank slate: kitchen adds their own
  locations         jsonb default '[]'::jsonb,               -- blank slate
  units             jsonb default '[]'::jsonb,               -- blank slate
  onboarded         boolean default false,
  alert_email       text default '',
  tagline           text default 'From shelf to plate — never lose track.',
  created_at        timestamptz default now(),
  approved_at       timestamptz,
  approved_by       text
);

create index if not exists idx_kitchens_owner_email on kitchens(lower(owner_email));
create index if not exists idx_kitchens_status on kitchens(status);

-- 2) Wipe old rows + add kitchen_id to products -------------------------------
truncate table products cascade;

alter table products
  add column if not exists kitchen_id uuid;

create index if not exists idx_products_kitchen_id on products(kitchen_id);

-- 3) Wipe + isolate settings (keep table but empty) ---------------------------
-- Existing settings table gets kitchen_id (one row per kitchen).
alter table settings
  add column if not exists kitchen_id uuid;

delete from settings;
create unique index if not exists idx_settings_kitchen_unique on settings(kitchen_id);

-- 4) Admin approval audit -----------------------------------------------------
create table if not exists admin_approvals (
  id           uuid primary key default gen_random_uuid(),
  kitchen_id   uuid not null,
  action       text not null,                                -- approved | rejected | suspended | restored
  reason       text default '',
  admin_email  text not null,
  created_at   timestamptz default now()
);

-- 5) Keep-alive table (a single row we bump to prevent DB pause) --------------
create table if not exists keepalive (
  id           int primary key default 1,
  last_ping_at timestamptz default now()
);
insert into keepalive (id, last_ping_at) values (1, now())
  on conflict (id) do nothing;

-- =============================================================================
-- Note: We do NOT enable Row-Level Security in this migration.
-- Backend uses the service_role key (bypasses RLS) and enforces `kitchen_id`
-- filtering in the Next.js API layer. This is a conscious choice for MVP speed.
-- If you later want defense-in-depth, we'll add RLS policies in a v6 migration.
-- =============================================================================
