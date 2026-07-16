/**
 * ShelfWise auth helpers (server-side only).
 *
 * Two auth modes:
 *  - OWNER: authenticated via Supabase Auth (email/password). Token is a
 *           Supabase session JWT; we validate it with supabaseAdmin.auth.getUser().
 *  - CHEF:  authenticated via a custom short-lived JWT we issue after they
 *           enter (kitchen name, daily rotating code).
 *
 * The client sends the token in `Authorization: Bearer <token>` on every fetch.
 * `getAuthContext(request)` returns { authed, role, kitchenId, isAdmin, ... }.
 */

import { supabaseAdmin } from './supabaseAdmin'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

// -----------------------------------------------------------------------------
// Word list for chef daily codes (memorable, single-word, no ambiguous chars).
// Codes look like "TIGER-42".
// -----------------------------------------------------------------------------
const WORDS = [
  'TIGER','LION','BEAR','WOLF','FOX','EAGLE','SHARK','ORCA','PANDA','KOALA',
  'HAWK','FALCON','LYNX','JAGUAR','LEOPARD','CHEETAH','BISON','MOOSE','OTTER','SEAL',
  'RAVEN','ROBIN','SPARROW','CRANE','HERON','SWAN','GOOSE','DUCK','OWL','PARROT',
  'HORSE','ZEBRA','DONKEY','CAMEL','LLAMA','ALPACA','SHEEP','GOAT','COW','BULL',
  'DEER','ELK','RHINO','HIPPO','GIRAFFE','KANGAROO','SLOTH','MONKEY','GORILLA','LEMUR',
  'TURTLE','FROG','GECKO','IGUANA','COBRA','PYTHON','VIPER','LIZARD','SALMON','TUNA',
  'MANGO','PEACH','APPLE','BERRY','GRAPE','LEMON','LIME','MELON','OLIVE','PLUM',
  'MAPLE','CEDAR','OAK','PINE','WILLOW','BIRCH','JUNIPER','ROSE','LILY','TULIP',
  'CORAL','PEARL','JADE','RUBY','TOPAZ','OPAL','AMBER','ONYX','QUARTZ','SLATE',
  'RIVER','LAKE','OCEAN','MOUNTAIN','VALLEY','MEADOW','FOREST','DESERT','ISLAND','HARBOR',
]

/**
 * Deterministically generate today's chef code for a kitchen.
 * @param {string} codeSeed  - the kitchen's private seed (from `kitchens.code_seed`)
 * @param {string} timezone  - e.g. "Asia/Kolkata"
 * @param {Date}   [now]     - override "now" for testing
 * @returns {string} code like "TIGER-42"
 */
export function generateChefCode(codeSeed, timezone = 'Asia/Kolkata', now = new Date()) {
  // Format date as YYYY-MM-DD in the kitchen's local timezone
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const localDate = fmt.format(now) // yields "2026-07-02"

  const hash = crypto
    .createHmac('sha256', String(codeSeed || 'seed'))
    .update(localDate)
    .digest()

  const wordIdx = hash.readUInt16BE(0) % WORDS.length
  const num = (hash.readUInt16BE(2) % 90) + 10
  return `${WORDS[wordIdx]}-${num}`
}

/**
 * Sign a chef JWT. Contains kitchen_id + role.
 * Effectively permanent (10 years) — kitchen devices enter the code ONCE and
 * stay logged in "forever" (user request, July 2026).
 */
export function signChefToken(kitchenId) {
  const secret = process.env.SHELFWISE_JWT_SECRET
  if (!secret) throw new Error('SHELFWISE_JWT_SECRET env var missing')
  return jwt.sign(
    { kitchen_id: kitchenId, role: 'chef' },
    secret,
    { expiresIn: '3650d' }
  )
}

/**
 * Verify a chef JWT. Returns { kitchen_id, role } or null.
 */
function verifyChefToken(token) {
  const secret = process.env.SHELFWISE_JWT_SECRET
  if (!secret) return null
  try {
    return jwt.verify(token, secret)
  } catch {
    return null
  }
}

/**
 * Extract Bearer token from an incoming Next.js Request.
 */
function getBearer(request) {
  const auth = request.headers.get('authorization') || request.headers.get('Authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : ''
}

/**
 * Read the caller's authentication context.
 * Returns:
 *  {
 *    authed: boolean,
 *    role: 'owner' | 'chef' | 'admin' | null,
 *    kitchenId: string | null,
 *    kitchen: object | null,       // full kitchens row (owners only)
 *    userEmail: string | null,     // owner's email
 *    isAdmin: boolean,             // owner whose email matches SHELFWISE_ADMIN_EMAIL
 *  }
 */
export async function getAuthContext(request) {
  const token = getBearer(request)
  if (!token) return { authed: false, role: null, kitchenId: null, kitchen: null, userEmail: null, isAdmin: false }

  // --- Try chef JWT first (cheap, no DB call) ---
  const chef = verifyChefToken(token)
  if (chef && chef.kitchen_id) {
    return { authed: true, role: 'chef', kitchenId: chef.kitchen_id, kitchen: null, userEmail: null, isAdmin: false }
  }

  // --- Try Supabase owner session ---
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !data?.user) {
      return { authed: false, role: null, kitchenId: null, kitchen: null, userEmail: null, isAdmin: false }
    }
    const user = data.user
    const adminEmail = (process.env.SHELFWISE_ADMIN_EMAIL || '').toLowerCase()
    const isAdmin = adminEmail && user.email && user.email.toLowerCase() === adminEmail

    // Fetch this owner's kitchen (if any)
    const { data: kitchens } = await supabaseAdmin
      .from('kitchens')
      .select('*')
      .eq('owner_id', user.id)
      .limit(1)
    const kitchen = kitchens && kitchens[0] ? kitchens[0] : null

    return {
      authed: true,
      role: isAdmin ? 'admin' : 'owner',
      kitchenId: kitchen?.id || null,
      kitchen,
      userEmail: user.email,
      userId: user.id,
      isAdmin: !!isAdmin,
    }
  } catch (e) {
    console.error('getAuthContext error:', e)
    return { authed: false, role: null, kitchenId: null, kitchen: null, userEmail: null, isAdmin: false }
  }
}

/**
 * Build a random URL-safe seed for a new kitchen's code_seed column.
 */
export function newCodeSeed() {
  return crypto.randomBytes(24).toString('base64url')
}
