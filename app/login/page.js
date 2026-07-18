'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { apiJson, setChefToken, clearChefToken } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast, Toaster } from 'sonner'
import { ChefHat, Loader2, LogIn, Eye, EyeOff } from 'lucide-react'
import InstallAppPrompt from '@/components/InstallAppPrompt'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useT } from '@/lib/i18n'

export default function LoginPage() {
  const T = useT()
  const router = useRouter()
  const [tab, setTab] = useState('owner')

  // Owner form
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [ownerBusy, setOwnerBusy] = useState(false)

  // Staff form (personal phone: kitchen name + 4-digit staff code)
  const [kitchenName, setKitchenName] = useState('')
  const [staffPin, setStaffPin] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [chefBusy, setChefBusy] = useState(false)

  // Prefill from previous logins on this phone
  useEffect(() => {
    try {
      const n = localStorage.getItem('sw_person_name'); if (n) setOwnerName(n)
      const k = localStorage.getItem('sw_kitchen_name'); if (k) setKitchenName(k)
    } catch {}
  }, [])

  // Stable per-device id — lets the same person log in again with their name,
  // while blocking OTHER devices from taking it.
  const getDeviceId = () => {
    try {
      let id = localStorage.getItem('sw_device_id')
      if (!id) {
        id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
        localStorage.setItem('sw_device_id', id)
      }
      return id
    } catch { return '' }
  }

  // If already signed-in, bounce to home (or admin panel if user is admin).
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const sb = getBrowserSupabase()
        const { data } = await sb.auth.getSession()
        if (mounted && data?.session?.access_token) {
          // Check if this session is an admin — if so, send them to /admin.
          try {
            const me = await apiJson('/api/auth/me')
            router.replace(me?.isAdmin ? '/admin' : '/')
          } catch {
            router.replace('/')
          }
        }
      } catch {}
    })()
    return () => { mounted = false }
  }, [router])

  async function submitOwner(e) {
    e.preventDefault()
    if (!email || !password) return
    setOwnerBusy(true)
    try {
      clearChefToken() // ensure we don't have a stale chef token
      const sb = getBrowserSupabase()
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (error) throw error
      if (!data?.session) throw new Error('No session returned')
      // Check auth/me for status
      const me = await apiJson('/api/auth/me')
      if (me.kitchen && me.kitchen.status && me.kitchen.status !== 'approved' && !me.isAdmin) {
        toast.warning(`Account status: ${me.kitchen.status}. Awaiting admin approval.`)
        // Still route them to a page — the home page will show a friendly waiting screen.
      }
      // Identity comes ONLY from staff codes (user request, July 2025):
      // clear any remembered name so it can't leak onto other users' items.
      try { localStorage.removeItem('sw_person_name') } catch {}
      // Fresh owner login → engage the staff-code lock screen on this device
      try { localStorage.removeItem('sw_kiosk_user'); localStorage.removeItem('sw_kiosk') } catch {}
      toast.success('Welcome back!')
      router.replace(me.isAdmin ? '/admin' : '/')
    } catch (err) {
      toast.error(err.message || 'Login failed')
    } finally {
      setOwnerBusy(false)
    }
  }

  async function forgotPassword() {
    if (!email.trim()) {
      toast.error('Type your email in the Email box above first, then tap "Forgot password?"')
      return
    }
    try {
      const sb = getBrowserSupabase()
      const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      toast.success('Password reset link sent — check your email inbox (and spam folder).')
    } catch (err) {
      toast.error(err.message || 'Could not send reset email')
    }
  }

  async function submitChef(e) {
    e.preventDefault()
    if (!kitchenName.trim()) return
    if (!/^\d{4}$/.test(staffPin.trim())) { toast.error('Enter your 4-digit staff code'); return }
    setChefBusy(true)
    try {
      // Make sure any owner session is cleared so we don't send both tokens.
      try { const sb = getBrowserSupabase(); await sb.auth.signOut() } catch {}
      const res = await apiJson('/api/auth/staff-pin-login', {
        method: 'POST',
        body: JSON.stringify({
          kitchenName: kitchenName.trim(),
          pin: staffPin.trim(),
          deviceId: getDeviceId(),
        }),
      })
      setChefToken(res.token)
      try {
        localStorage.setItem('sw_person_name', res.personName || '')
        localStorage.setItem('sw_kitchen_name', kitchenName.trim())
        localStorage.removeItem('sw_kiosk') // personal phone, not a shared tablet
      } catch {}
      toast.success(`Welcome, ${res.personName}!`)
      router.replace('/')
    } catch (err) {
      toast.error(err.message || 'Staff login failed')
    } finally {
      setChefBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
      <Toaster position="top-right" richColors />
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img src="/logo-icon.png" alt="ShelfWise" className="h-16 w-16 rounded-2xl object-contain bg-white shadow-md" />
          <h1 className="text-2xl font-bold text-emerald-900 mt-3">ShelfWise</h1>
          <p className="text-sm text-emerald-700/70">From shelf to plate — never lose track.</p>
        </div>

        <Card className="shadow-lg border-emerald-100">
          <CardContent className="p-6">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="owner">📧 Email</TabsTrigger>
                <TabsTrigger value="chef">🔢 Staff Code</TabsTrigger>
              </TabsList>

              <TabsContent value="owner">
                <form onSubmit={submitOwner} className="space-y-3">
                  <div>
                    <Label htmlFor="email">{T('login_email')}</Label>
                    <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@kitchen.com" required autoFocus />
                  </div>
                  <div>
                    <Label htmlFor="password">{T('login_password')}</Label>
                    <div className="relative">
                      <Input id="password" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required className="pr-10" />
                      <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={showPw ? 'Hide password' : 'Show password'}>
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="flex justify-end mt-1">
                      <button type="button" onClick={forgotPassword} className="text-xs text-emerald-700 font-medium hover:underline">Forgot password?</button>
                    </div>
                  </div>
                  {/* "Your name" field removed (user request, July 2025) —
                      identity now comes ONLY from staff codes, never a typed default. */}
                  <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={ownerBusy}>
                    {ownerBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
                    {T('login_signin')}
                  </Button>
                  <p className="text-xs text-center text-slate-500 pt-2">
                    {T('login_signup')}? <Link href="/signup" className="text-emerald-700 font-semibold hover:underline">{T('login_signup')}</Link>
                  </p>
                </form>
              </TabsContent>

              <TabsContent value="chef">
                <form onSubmit={submitChef} className="space-y-3">
                  <div>
                    <Label htmlFor="kname">Kitchen name</Label>
                    <Input id="kname" value={kitchenName} onChange={e => setKitchenName(e.target.value)} placeholder="e.g. Bella Cucina" required autoFocus />
                  </div>
                  <div>
                    <Label htmlFor="staffpin">Your staff code</Label>
                    <Input
                      id="staffpin"
                      value={staffPin}
                      onChange={e => setStaffPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="• • • •"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      className="text-center text-2xl font-bold tracking-[0.6em]"
                      style={{ fontFamily: 'monospace' }}
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Your personal 4-digit code — ask your manager if you don't have one yet.</p>
                  </div>
                  <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={chefBusy}>
                    {chefBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ChefHat className="h-4 w-4 mr-2" />}
                    Enter Kitchen
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* PWA install prompt — detects platform and offers appropriate CTA */}
        <InstallAppPrompt />

        {/* Language switcher — pre-auth language selection */}
        <div className="flex justify-center mt-4">
          <LanguageSwitcher compact />
        </div>

        <p className="text-[11px] text-center text-slate-400 mt-4">© {new Date().getFullYear()} ShelfWise</p>
      </div>
    </div>
  )
}
