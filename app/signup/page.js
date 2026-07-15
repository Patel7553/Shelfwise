'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiJson } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { toast, Toaster } from 'sonner'
import { Loader2, UserPlus, CheckCircle2, MailCheck } from 'lucide-react'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  // stage: 'form' → 'otp' (verify email code) → 'done'
  const [stage, setStage] = useState('form')
  const [emailVerified, setEmailVerified] = useState(false)

  // --- OTP state ---
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (resendIn <= 0) return
    timerRef.current = setTimeout(() => setResendIn(s => s - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [resendIn])

  async function submit(e) {
    e.preventDefault()
    if (!email || !password) return
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setBusy(true)
    try {
      const res = await apiJson('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          // kitchen name / type / timezone are collected in the setup wizard AFTER approval
        }),
      })
      if (res?.otpSent) {
        setStage('otp')
        setResendIn(30)
        toast.success('We emailed you a 6-digit code — check your inbox!')
      } else {
        // OTP could not be sent (e.g. email service hiccup) — don't block signup
        setStage('done')
      }
    } catch (err) {
      toast.error(err.message || 'Sign-up failed')
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(e) {
    e?.preventDefault()
    const c = code.trim()
    if (!/^\d{6}$/.test(c)) { toast.error('Enter the 6-digit code from your email'); return }
    setVerifying(true)
    try {
      await apiJson('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: c }),
      })
      setEmailVerified(true)
      setStage('done')
      toast.success('Email verified! ✅')
    } catch (err) {
      toast.error(err.message || 'Wrong code — try again')
    } finally {
      setVerifying(false)
    }
  }

  async function resendCode() {
    if (resendIn > 0) return
    try {
      await apiJson('/api/auth/resend-otp', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      setResendIn(30)
      toast.success('New code sent — check your inbox (and spam).')
    } catch (err) {
      toast.error(err.message || 'Could not resend')
    }
  }

  // ---------- STAGE: done ----------
  if (stage === 'done') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
        <Toaster position="top-right" richColors />
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-emerald-900 mb-2">Request submitted!</h2>
            {emailVerified && (
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 mb-3">
                <MailCheck className="h-3.5 w-3.5" /> Email verified
              </p>
            )}
            <p className="text-sm text-slate-600 mb-6">
              Your access request for <b>{email}</b> has been received. Once approved by the admin, you'll be able to log in and set up your kitchen.
            </p>
            <Button onClick={() => router.push('/login')} className="w-full bg-emerald-600 hover:bg-emerald-700">
              Go to login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---------- STAGE: otp ----------
  if (stage === 'otp') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
        <Toaster position="top-right" richColors />
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="p-8">
            <div className="text-center mb-5">
              <div className="w-16 h-16 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <MailCheck className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-emerald-900">Check your email</h2>
              <p className="text-sm text-slate-600 mt-1.5">
                We sent a 6-digit code to <b>{email}</b>.<br />Enter it below to confirm your email is correct.
              </p>
            </div>
            <form onSubmit={verifyCode} className="space-y-3">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                className="text-center text-2xl font-bold tracking-[0.5em] h-14"
                autoFocus
              />
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={verifying || code.length !== 6}>
                {verifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Verify email
              </Button>
            </form>
            <div className="flex items-center justify-between mt-4 text-xs">
              <button type="button" onClick={resendCode} disabled={resendIn > 0}
                className={`font-semibold ${resendIn > 0 ? 'text-slate-400' : 'text-emerald-700 hover:underline'}`}>
                {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
              </button>
              <button type="button" onClick={() => { setStage('form'); setCode('') }} className="text-slate-500 hover:underline">
                Wrong email? Start over
              </button>
            </div>
            <p className="text-[11px] text-slate-400 text-center mt-4">
              No code? Check your spam folder. The code expires in 15 minutes.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---------- STAGE: form ----------
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
      <Toaster position="top-right" richColors />
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img src="/logo-icon.png" alt="ShelfWise" className="h-16 w-16 rounded-2xl object-contain bg-white shadow-md" />
          <h1 className="text-2xl font-bold text-emerald-900 mt-3">Request access</h1>
          <p className="text-sm text-emerald-700/70 mt-1 text-center">
            Sign up with just your email. Kitchen setup happens after admin approval.
          </p>
        </div>

        <Card className="shadow-lg border-emerald-100">
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@kitchen.com" required autoFocus />
                <p className="text-[11px] text-slate-500 mt-1">We'll send a verification code to this address — alerts &amp; reports go here too.</p>
              </div>
              <div>
                <Label htmlFor="pw">Password * (min 8 chars)</Label>
                <Input id="pw" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                <p className="text-[11px] text-slate-500 mt-1">Choose a strong password — you'll use this every day.</p>
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 mt-2" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                Request Access
              </Button>
              <p className="text-xs text-center text-slate-500 pt-2">
                Already approved? <Link href="/login" className="text-emerald-700 font-semibold hover:underline">Log in</Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
