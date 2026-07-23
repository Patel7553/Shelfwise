-- Migration 19 (July 2026): per-kitchen expiry alert window.
-- Data-level override, NOT a user-facing setting.
-- Default stays 7 days for every kitchen (NULL = 7 in the backend).

alter table kitchens add column if not exists expiry_alert_days int;

-- KEVII only: alert on items expiring within 3 days instead of 7.
update kitchens
set expiry_alert_days = 3
where lower(kitchen_name) = 'kevii';

-- Verify:
-- select kitchen_name, expiry_alert_days from kitchens;
