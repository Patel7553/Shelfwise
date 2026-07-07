-- ==============================================================
-- ShelfWise — Enable Row-Level Security (RLS) on ALL tables
-- ==============================================================
-- Purpose:
--   Silences the Supabase security email ("Table publicly accessible")
--   and locks down direct anon-key access to every table.
--   
--   The ShelfWise app uses SUPABASE_SERVICE_ROLE_KEY (server-side, on Vercel),
--   which BYPASSES RLS automatically. So enabling RLS here does NOT break the
--   app — it only blocks unauthorised anon-key access.
-- 
-- How to run:
--   1. Log in to https://supabase.com/dashboard
--   2. Open your ShelfWise project
--   3. Left sidebar → "SQL Editor"
--   4. Click "New query"
--   5. Paste EVERYTHING below and press RUN (▶️)
--   6. You should see "Success. No rows returned."
--   7. Refresh the Security Advisor — all warnings should be gone
-- 
-- If a table doesn't exist in your DB, that's fine — the statement is safe.
-- ==============================================================

-- 1) Enable RLS on every ShelfWise table -----------------------
ALTER TABLE IF EXISTS public.products                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kitchens                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.receipts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.recipes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_approvals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.keepalive                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rota_shifts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.waste_log                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.haccp_temperature_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.haccp_cleaning_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.haccp_cleaning_tasks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.haccp_delivery_checks    ENABLE ROW LEVEL SECURITY;

-- 2) Explicit deny-all policy for anon + authenticated roles ----
-- Service role ALWAYS bypasses RLS, so this only affects public/anon requests.
-- We could skip this step, but adding explicit "no access" policies makes the
-- intent crystal-clear when someone reads the DB later.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','kitchens','settings','receipts','recipes',
    'admin_approvals','keepalive','rota_shifts','waste_log',
    'haccp_temperature_logs','haccp_cleaning_log',
    'haccp_cleaning_tasks','haccp_delivery_checks'
  ]
  LOOP
    -- Skip if table doesn't exist
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      -- Drop any old lock-down policy first (idempotent)
      EXECUTE format('DROP POLICY IF EXISTS shelfwise_deny_public_%I ON public.%I;', t, t);
      -- Anon + authenticated get NO rows via anon/auth API
      EXECUTE format(
        'CREATE POLICY shelfwise_deny_public_%I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- 3) Optional: keepalive table can stay world-readable (used by cron) --
-- Comment this out if you don't want it.
DROP POLICY IF EXISTS keepalive_read_all ON public.keepalive;
CREATE POLICY keepalive_read_all ON public.keepalive
  FOR SELECT TO anon, authenticated
  USING (true);

-- ==============================================================
-- DONE. Verify by refreshing the Supabase Security Advisor page.
-- ==============================================================
