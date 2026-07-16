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
