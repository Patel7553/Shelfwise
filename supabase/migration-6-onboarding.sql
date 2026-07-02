-- =============================================================================
-- ShelfWise Onboarding Migration (v6)
-- Adds module selection + In-Date widget support
-- Run in Supabase Dashboard → SQL Editor → New query → Paste → Run
-- =============================================================================

alter table kitchens
  add column if not exists modules_enabled jsonb default '["stock","recipes"]'::jsonb;

-- Set sensible defaults for any existing kitchens (blank widgets → they'll be
-- forced through the setup wizard because onboarded=false, but if we ever
-- want them to skip we can set widgets here).
update kitchens
   set modules_enabled = coalesce(modules_enabled, '["stock","recipes"]'::jsonb)
 where modules_enabled is null;

-- Reset onboarded for existing kitchens so they see the wizard once.
-- (Comment this line out if you want existing kitchens to skip the wizard.)
update kitchens set onboarded = false where onboarded = true;
