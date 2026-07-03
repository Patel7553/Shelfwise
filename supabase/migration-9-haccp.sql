-- ShelfWise — Migration 9: HACCP Compliance Module
-- Safe to run multiple times.
-- Purpose: UK/EU legal food safety records — fridge temps, cleaning logs, delivery inspections.
-- Health inspectors expect >= 3 months of records on demand.

-- 1) Temperature logs (fridges, freezers, hot hold, etc.)
create table if not exists haccp_temperature_logs (
  id            uuid primary key default gen_random_uuid(),
  kitchen_id    uuid not null references kitchens(id) on delete cascade,
  location      text not null,                    -- e.g. 'Fridge 1', 'Freezer 2', 'Hot Hold'
  temperature_c numeric not null,                 -- celsius (support fractions like 4.2)
  is_pass       boolean not null default true,    -- whether reading is within safe range
  recorded_at   timestamptz not null default now(),
  recorded_by   text not null default '',
  notes         text not null default ''
);
create index if not exists haccp_temp_kitchen_date_idx
  on haccp_temperature_logs(kitchen_id, recorded_at desc);

-- 2) Cleaning task templates (what needs cleaning + how often)
create table if not exists haccp_cleaning_tasks (
  id            uuid primary key default gen_random_uuid(),
  kitchen_id    uuid not null references kitchens(id) on delete cascade,
  task_name     text not null,                    -- e.g. 'Clean fryer', 'Sanitise prep surfaces'
  area          text not null default '',         -- e.g. 'Kitchen', 'Storage', 'Front of house'
  frequency     text not null default 'daily',    -- 'daily' | 'weekly' | 'monthly'
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists haccp_cleaning_task_kitchen_idx
  on haccp_cleaning_tasks(kitchen_id) where active = true;

-- 3) Cleaning completion log
create table if not exists haccp_cleaning_log (
  id            uuid primary key default gen_random_uuid(),
  kitchen_id    uuid not null references kitchens(id) on delete cascade,
  task_id       uuid references haccp_cleaning_tasks(id) on delete set null,
  task_name     text not null,                    -- denormalised for audit history
  completed_at  timestamptz not null default now(),
  completed_by  text not null default '',
  notes         text not null default ''
);
create index if not exists haccp_cleaning_log_kitchen_date_idx
  on haccp_cleaning_log(kitchen_id, completed_at desc);

-- 4) Delivery quality checks
create table if not exists haccp_delivery_checks (
  id                uuid primary key default gen_random_uuid(),
  kitchen_id        uuid not null references kitchens(id) on delete cascade,
  supplier          text not null default '',
  delivery_date     timestamptz not null default now(),
  temperature_c     numeric,                       -- optional
  temperature_ok    boolean not null default true,
  packaging_ok      boolean not null default true,
  labels_ok         boolean not null default true,
  overall_pass      boolean not null default true,
  checked_by        text not null default '',
  notes             text not null default ''
);
create index if not exists haccp_delivery_kitchen_date_idx
  on haccp_delivery_checks(kitchen_id, delivery_date desc);
