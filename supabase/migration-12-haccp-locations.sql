-- Migration 12 — Add haccp_locations column to kitchens table
-- Stores per-kitchen list of fridges/freezers/hot-hold units used for HACCP scanning
-- Each entry:
--   {
--     "id": "uuid",
--     "name": "Walk-in Fridge #2",
--     "type": "fridge" | "freezer" | "hot_hold" | "chiller",
--     "minC": null | number,     -- custom safe range override (optional)
--     "maxC": null | number,     -- if null/undefined, standard HACCP ranges apply
--     "active": true
--   }
--
-- Standard HACCP ranges applied when minC/maxC are null:
--   fridge   →  0°C to 5°C
--   chiller  →  0°C to 8°C
--   freezer  →  -25°C to -18°C
--   hot_hold →  63°C to 90°C

ALTER TABLE kitchens
  ADD COLUMN IF NOT EXISTS haccp_locations JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Optional: seed default locations for existing kitchens that don't have any yet.
-- Users can rename or delete these from the Settings > Fridges & Freezers tab.
UPDATE kitchens
   SET haccp_locations = '[
     {"id":"seed-fridge-1","name":"Main Fridge","type":"fridge","active":true},
     {"id":"seed-freezer-1","name":"Main Freezer","type":"freezer","active":true}
   ]'::jsonb
 WHERE haccp_locations = '[]'::jsonb OR haccp_locations IS NULL;
