/**
 * Client-side fetch wrapper that automatically attaches the current
 * auth token (owner Supabase session OR chef JWT) to every request.
 *
 * Usage:
 *   import { apiFetch } from '@/lib/apiClient'
 *   const products = await apiFetch('/api/products').then(r => r.json())
 */

'use client'

import { getBrowserSupabase } from './supabaseBrowser'

const CHEF_TOKEN_KEY = 'shelfwise_chef_token'

export function setChefToken(token) {
  try { localStorage.setItem(CHEF_TOKEN_KEY, token) } catch (_e) { /* ignore */ }
}
export function getChefToken() {
  try { return localStorage.getItem(CHEF_TOKEN_KEY) } catch { return null }
}
export function clearChefToken() {
  try { localStorage.removeItem(CHEF_TOKEN_KEY) } catch (_e) { /* ignore */ }
}

/** Returns the Authorization header value (or null if not logged in). */
export async function getBearerToken() {
  // Prefer chef JWT if present (chef mode is exclusive per browser).
  const chef = getChefToken()
  if (chef) return chef
  // Otherwise use Supabase session (owner/admin).
  try {
    const sb = getBrowserSupabase()
    const { data } = await sb.auth.getSession()
    return data?.session?.access_token || null
  } catch {
    return null
  }
}

/**
 * fetch() wrapper that injects Authorization: Bearer <token>.
 * Falls through to normal fetch if no token.
 */
export async function apiFetch(url, options = {}) {
  const token = await getBearerToken()
  const headers = new Headers(options.headers || {})
  if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  return fetch(url, { ...options, headers })
}

/** Convenience: parse JSON, throwing a useful error on non-2xx. */
export async function apiJson(url, options = {}) {
  const res = await apiFetch(url, options)
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
  if (!res.ok) {
    const msg = data?.error || `${res.status} ${res.statusText}`
    const err = new Error(msg)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export async function signOutAll() {
  clearChefToken()
  try {
    const sb = getBrowserSupabase()
    await sb.auth.signOut()
  } catch (_e) { /* ignore */ }
}
