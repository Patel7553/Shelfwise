-- ============================================================================
-- Migration 20 — Push alert throttling (June 2025)
-- Lets expiry push alerts repeat every 2.5 hours (until items are dealt with)
-- and HACCP reminders max once per day, no matter how often the trigger runs.
-- Run this in Supabase → SQL Editor.
-- ============================================================================

alter table kitchens add column if not exists last_expiry_push_at timestamptz;
alter table kitchens add column if not exists last_haccp_push_at timestamptz;
