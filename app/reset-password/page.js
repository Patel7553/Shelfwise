'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { toast, Toaster } from 'sonner'
import { Loader2, KeyRound, Eye, EyeOff } from 'lucide-react'

// Landing page for Supabase "reset password" email links.
// Supabase JS parses the recovery token from the URL hash automatically and
// creates a temporary session — we just ask for the new password and save it.
export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const sb = getBrowserSupabase()
    let unsub = null
    try {
      const { data } = sb.auth.onAuthStateChange((event, session) => {
        if (session) setReady(true)
      })
      unsub = data?.subscription
    } catch {}
    sb.auth.getSession().then(({ data }) => {
      if (data?.session) setReady(true)
    }).finally(() => setTimeout(() => setChecking(false), 1500))
    return () => { try { unsub?.unsubscribe?.() } catch {} }
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if (password !== confirm) { toast.error('Passwords do not match'); return }
    setBusy(true)
    try {
      const sb = getBrowserSupabase()
      const { error } = await sb.auth.updateUser({ password })
      if (error) throw error
      toast.success('Password updated — you are signed in!')
      setTimeout(() => router.replace('/'), 800)
    } catch (err) {
      toast.error(err.message || 'Could not update password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
      <Toaster position="top-right" richColors />
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img src="/logo-icon.png" alt="ShelfWise" className="h-16 w-16 rounded-2xl object-contain bg-white shadow-md" />
          <h1 className="text-2xl font-bold text-emerald-900 mt-3">Reset your password</h1>
        </div>
        <Card className="shadow-lg border-emerald-100">
          <CardContent className="p-6">
            {!ready ? (
              <div className="text-center py-6 space-y-3">
                {checking ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-emerald-600" />
                    <p className="text-sm text-muted-foreground">Verifying your reset link...</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-red-600">This reset link is invalid or has expired.</p>
                    <p className="text-xs text-muted-foreground">Go back to the login page and tap "Forgot password?" again to get a fresh link.</p>
                    <Button variant="outline" onClick={() => router.replace('/login')}>Back to login</Button>
                  </>
                )}
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <Label htmlFor="npw">New password</Label>
                  <div className="relative">
                    <Input id="npw" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" required autoFocus className="pr-10" />
                    <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={showPw ? 'Hide password' : 'Show password'}>
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="cpw">Confirm new password</Label>
                  <Input id="cpw" type={showPw ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Type it again" required />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                  Set new password
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
