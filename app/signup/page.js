'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiJson } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { toast, Toaster } from 'sonner'
import { Loader2, UserPlus, CheckCircle2 } from 'lucide-react'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!email || !password) return
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setBusy(true)
    try {
      await apiJson('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          // kitchen name / type / timezone are collected in the setup wizard AFTER approval
        }),
      })
      setDone(true)
    } catch (err) {
      toast.error(err.message || 'Sign-up failed')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
        <Toaster position="top-right" richColors />
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-emerald-900 mb-2">Request submitted!</h2>
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
