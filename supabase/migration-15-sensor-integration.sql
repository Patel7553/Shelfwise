-- ============================================================
-- Migration 15 — Automatic sensor integration (HACCP temps)
-- Run this in the Supabase SQL editor.
-- ============================================================

-- 1) One sensor-vendor connection per kitchen
create table if not exists sensor_connections (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references kitchens(id) on delete cascade,
  vendor text not null,                        -- 'demo' | 'generic_rest' | 'kelsius' | 'navitas' ...
  credentials jsonb not null default '{}',     -- api key / base url etc. (per-vendor)
  mappings jsonb not null default '[]',        -- [{sensorId, sensorName, location, enabled}]
  interval_minutes int not null default 30,    -- minimum minutes between syncs
  enabled boolean not null default true,
  last_sync_at timestamptz,
  last_sync_status text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists idx_sensor_conn_kitchen on sensor_connections(kitchen_id);
alter table sensor_connections enable row level security;

-- 2) Label how each temperature reading was captured
--    'manual' (Log one) | 'quick_check' | 'scan_sheet' (AI) | 'sensor' (Auto)
alter table haccp_temperature_logs
  add column if not exists source text not null default 'manual';
