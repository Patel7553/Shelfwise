-- ShelfWise — Migration 7: Rota (staff scheduling) + Waste analytics
-- Safe to run multiple times.

-- 1) Rota shifts: one row per (kitchen, date, slot) — chef_name is free text.
create table if not exists rota_shifts (
  id           uuid primary key default gen_random_uuid(),
  kitchen_id   uuid not null references kitchens(id) on delete cascade,
  shift_date   date not null,
  shift_slot   text not null,                       -- e.g. 'Morning', 'Afternoon', 'Evening', or custom
  chef_name    text not null default '',            -- free-text name (or 'OFF' for a day off)
  role         text not null default '',            -- optional (Head Chef, Sous, KP, etc.)
  start_time   text not null default '',            -- optional HH:MM
  end_time     text not null default '',            -- optional HH:MM
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists rota_shifts_kitchen_date_idx on rota_shifts(kitchen_id, shift_date);
create index if not exists rota_shifts_kitchen_range_idx on rota_shifts(kitchen_id, shift_date desc);

-- 2) Waste log: written whenever a product is disposed (expired / damaged / other).
--    "Used up" (consumed normally) is NOT logged as waste.
create table if not exists waste_log (
  id            uuid primary key default gen_random_uuid(),
  kitchen_id    uuid not null references kitchens(id) on delete cascade,
  product_id    uuid,                                -- may be null if product deleted afterwards
  product_name  text not null default '',
  category      text not null default '',
  quantity      numeric not null default 0,
  unit          text not null default 'ea',
  unit_cost     numeric,                             -- optional cost per unit at time of disposal
  reason        text not null default 'expired',    -- expired | spoiled | damaged | overstock | other
  disposed_at   timestamptz not null default now(),
  disposed_by   text not null default '',           -- email/role that logged it (best-effort)
  notes         text not null default ''
);

create index if not exists waste_log_kitchen_date_idx on waste_log(kitchen_id, disposed_at desc);
create index if not exists waste_log_kitchen_reason_idx on waste_log(kitchen_id, reason);
