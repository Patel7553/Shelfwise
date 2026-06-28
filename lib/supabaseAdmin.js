import { createClient } from '@supabase/supabase-js'

// Lazy-instantiated Supabase admin client.
// Creating the client at module load time breaks Next.js production builds
// (during "Collecting page data") if NEXT_PUBLIC_SUPABASE_URL isn't injected
// into the build environment. Using a Proxy defers creation until first use
// at runtime, where the env vars are guaranteed to be available.

let _client = null

function getClient() {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase env vars missing: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).'
    )
  }
  _client = createClient(url, key, { auth: { persistSession: false } })
  return _client
}

export const supabaseAdmin = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getClient()
      const value = client[prop]
      return typeof value === 'function' ? value.bind(client) : value
    },
  }
)