-- ============================================================================
-- Migration 21 — Daily expiry alert email throttle (June 2025)
-- The once-a-day food alert email will NOT send until this column exists
-- (safety: emails can't be deduped like push notifications).
-- Run this in Supabase → SQL Editor.
-- ============================================================================

alter table kitchens add column if not exists last_alert_email_at timestamptz;
