/**
 * Browser-side Supabase client for owner Auth (login / signup / session).
 * Uses the anon key. Sessions persist in localStorage automatically.
 *
 * IMPORTANT: never import this file from server-side code (API routes).
 * For server-side use `lib/supabaseAdmin.js` (service role key).
 */

'use client'

import { createClient } from '@supabase/supabase-js'

let _client = null

export function getBrowserSupabase() {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    // Instead of throwing (which breaks the page), return a stub that reports the error at call time.
    return {
      auth: {
        signUp: async () => ({ data: null, error: { message: 'Supabase env vars missing in browser (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).' } }),
        signInWithPassword: async () => ({ data: null, error: { message: 'Supabase env vars missing in browser.' } }),
        signOut: async () => ({ error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    }
  }
  _client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'shelfwise-auth',
    },
  })
  return _client
}

/**
 * Convenience: read the current session's access_token (or null).
 */
export async function getAccessToken() {
  const sb = getBrowserSupabase()
  const { data } = await sb.auth.getSession()
  return data?.session?.access_token || null
}
