-- ShelfWise — Migration #4 — Dashboard widget preferences

alter table if exists settings
  add column if not exists dashboard_widgets jsonb default '["search","expiry_alerts","all_items","expiring","expired","critical","urgent_list"]'::jsonb;
