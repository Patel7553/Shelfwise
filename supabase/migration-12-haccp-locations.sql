-- Migration 12 — Add haccp_locations column to kitchens table
-- Stores per-kitchen list of fridges/freezers/hot-hold units used for HACCP scanning
-- Each entry:
--   {
--     "id": "uuid",
--     "name": "Walk-in Fridge #2",         -- user-chosen display name
--     "type": "fridge" | "freezer" | "hot_hold" | "chiller",
--     "minC": null | number,               -- custom safe range override (optional)
--     "maxC": null | number,               -- if null, standard HACCP ranges apply
--     "active": true
--   }
--
-- Standard HACCP ranges applied when minC/maxC are null:
--   fridge   →  0°C to 5°C
--   chiller  →  0°C to 8°C
--   freezer  →  -25°C to -18°C
--   hot_hold →  63°C to 90°C
--
-- Safe to run multiple times (idempotent).

ALTER TABLE kitchens
  ADD COLUMN IF NOT EXISTS haccp_locations JSONB NOT NULL DEFAULT '[]'::jsonb;

-- No seed data — users add their own fridges/freezers from
-- Settings → Fridges & Freezers so the names match their kitchen exactly.
