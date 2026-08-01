/**
 * Browser-side Supabase client for owner Auth (login / signup / session).
 * Uses the anon key. Sessions persist in localStorage automatically.
 *
 * IMPORTANT: never import this file from server-side code (API routes).
 * For server-side use `lib/supabaseAdmin.js` (service role key).
 *
 * Aug 2026: if NEXT_PUBLIC_* vars weren't inlined at build time (this
 * happened on the Emergent production build -> "Supabase env vars missing in
 * browser" on login), we now fall back to fetching the public config from
 * /api/config/public at RUNTIME. The returned bridge object waits for that
 * fetch before performing any auth call, so login works either way.
 */

'use client'

import { createClient } from '@supabase/supabase-js'

let _client = null
let _fetching = null

const CLIENT_OPTS = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'shelfwise-auth',
  },
}

function startRuntimeConfigFetch() {
  if (_fetching || typeof window === 'undefined') return _fetching
  _fetching = fetch('/api/config/public')
    .then((r) => r.json())
    .then((d) => {
      if (!_client && d?.supabaseUrl && d?.supabaseAnonKey) {
        _client = createClient(d.supabaseUrl, d.supabaseAnonKey, CLIENT_OPTS)
      }
      return _client
    })
    .catch(() => null)
  return _fetching
}

export function getBrowserSupabase() {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (url && key) {
    _client = createClient(url, key, CLIENT_OPTS)
    return _client
  }

  // Build-time env missing -> fetch it at runtime and return a bridge that
  // waits for the real client before every auth call.
  startRuntimeConfigFetch()
  const real = async () => {
    if (_client) return _client
    return _fetching ? await _fetching : null
  }
  const missing = { message: 'Could not load auth configuration — please refresh and try again.' }
  return {
    auth: {
      signUp: async (args) => {
        const c = await real()
        return c ? c.auth.signUp(args) : { data: null, error: missing }
      },
      signInWithPassword: async (args) => {
        const c = await real()
        return c ? c.auth.signInWithPassword(args) : { data: null, error: missing }
      },
      resetPasswordForEmail: async (...args) => {
        const c = await real()
        return c ? c.auth.resetPasswordForEmail(...args) : { data: null, error: missing }
      },
      updateUser: async (args) => {
        const c = await real()
        return c ? c.auth.updateUser(args) : { data: null, error: missing }
      },
      signOut: async () => {
        const c = await real()
        return c ? c.auth.signOut() : { error: null }
      },
      getSession: async () => {
        const c = await real()
        return c ? c.auth.getSession() : { data: { session: null }, error: null }
      },
      onAuthStateChange: (cb) => {
        // Subscribe for real once the runtime client is ready
        const holder = { unsubscribe: () => {} }
        real().then((c) => {
          if (c) {
            const r = c.auth.onAuthStateChange(cb)
            holder.unsubscribe = () => r?.data?.subscription?.unsubscribe?.()
          }
        })
        return { data: { subscription: holder } }
      },
    },
  }
}

/**
 * Convenience: read the current session's access_token (or null).
 */
export async function getAccessToken() {
  const sb = getBrowserSupabase()
  const { data } = await sb.auth.getSession()
  return data?.session?.access_token || null
}
