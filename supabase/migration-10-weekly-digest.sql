-- ShelfWise — Migration 10: Weekly Digest email support
-- Safe to run multiple times.

-- Owner-controlled toggle for the Monday 8am weekly digest email.
alter table kitchens add column if not exists weekly_digest_enabled boolean not null default true;

-- Track when we last sent a digest for a kitchen (dedupe safety net).
alter table kitchens add column if not exists last_digest_sent_at timestamptz;
