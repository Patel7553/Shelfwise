# Test Credentials
# Agent writes here when creating/modifying auth credentials (admin accounts, test users).
# Testing agent reads this before auth tests. Fork/continuation agents read on startup.

## Local UI testing (June 2025 session)
- Supabase is NOT configured locally — owner email/password login CANNOT be tested locally.
- Production admin (user's own, for reference only): patel.parth1966@gmail.com (password unknown to agents).
- For local UI testing, mint a chef JWT and inject into localStorage key `shelfwise_chef_token`:
  cd /app && export $(grep SHELFWISE_JWT_SECRET .env | xargs) && node -e "console.log(require('/app/node_modules/jsonwebtoken').sign({kitchen_id:'test-kitchen',role:'chef'},process.env.SHELFWISE_JWT_SECRET,{expiresIn:'12h'}))"
- Data endpoints (products/stats/settings) will fail locally (Supabase missing) — expected, NOT a bug.

## Staff Code PIN system (June 2025 session)
- Staff PINs are 4-digit codes stored in kitchens.staff_names jsonb entries ({name, pin, isOwner, role, perms}). NO SQL migration needed.
- Staff chef JWTs now embed the person: sign({kitchen_id, role:'chef', person:'Name'}, SHELFWISE_JWT_SECRET).
- Kiosk unlock: POST /api/staff/pin-login {pin} (authed). Personal phone: POST /api/auth/staff-pin-login {kitchenName, pin} (public).
- Owner PIN entry auto-created on first GET /api/staff or pin-login attempt; owner PIN only unlocks on owner-authed devices.
- localStorage keys: sw_kiosk_user (unlocked person), sw_kiosk ('1'=staff session from kiosk tablet), sw_person_name, shelfwise_chef_token.

## June 2025 session UPDATE — Supabase NOW configured locally
- Supabase env vars (URL, anon, service role) were added to /app/.env — the preview now talks to the REAL production Supabase DB. Be careful with destructive writes; clean up test rows after tests.
- Approved test kitchen: id=a2573e6a-70f0-4a6d-97d0-ccf09b444643 (name "Shelfwise"), staff: Xyz (owner/manager), Dev, Parth.
- To auth API calls, mint a chef JWT (owner person "Xyz" passes all perm checks):
  cd /app && node -e "require('dotenv').config(); console.log(require('jsonwebtoken').sign({kitchen_id:'a2573e6a-70f0-4a6d-97d0-ccf09b444643',role:'chef',person:'Xyz'},process.env.SHELFWISE_JWT_SECRET,{expiresIn:'12h'}))"
  Then send header: Authorization: Bearer <token>
