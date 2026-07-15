-- ============================================================================
-- Migration 19 — Email verification OTP (June 2025)
-- Adds the columns needed for the "verify your email with a 6-digit code"
-- step at signup. Run this in Supabase → SQL Editor.
-- ============================================================================

alter table kitchens add column if not exists email_otp text;
alter table kitchens add column if not exists email_otp_expires timestamptz;
alter table kitchens add column if not exists email_otp_attempts int default 0;
alter table kitchens add column if not exists email_verified boolean default false;

-- Existing kitchens are grandfathered in as verified (their owners already
-- receive emails fine) — only NEW signups go through the OTP step.
update kitchens set email_verified = true where email_verified is distinct from true;
