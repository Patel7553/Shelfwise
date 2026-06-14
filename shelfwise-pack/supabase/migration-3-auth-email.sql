-- ShelfWise — Migration #3 — Login codes + alert email
-- Run this AFTER previous migrations

alter table if exists settings
  add column if not exists invite_code text default '',
  add column if not exists alert_email text default '',
  add column if not exists tagline text default 'From shelf to plate — never lose track.';
