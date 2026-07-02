'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiJson } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast, Toaster } from 'sonner'
import { Loader2, UserPlus, CheckCircle2 } from 'lucide-react'

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'America/Toronto', label: 'Canada Eastern (Toronto)' },
  { value: 'America/Vancouver', label: 'Canada Pacific (Vancouver)' },
  { value: 'America/New_York', label: 'US Eastern (New York)' },
  { value: 'America/Chicago', label: 'US Central (Chicago)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (Los Angeles)' },
  { value: 'Europe/London', label: 'UK (London)' },
  { value: 'Europe/Paris', label: 'Europe Central (Paris)' },
  { value: 'Asia/Dubai', label: 'UAE (Dubai)' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Australia/Sydney', label: 'Australia Eastern (Sydney)' },
]

const KITCHEN_TYPES = [
  'Restaurant', 'Cafe', 'Hospital', 'Hotel', 'School', 'Catering', 'Bakery', 'Ghost Kitchen', 'Other'
]

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [kitchenName, setKitchenName] = useState('')
  const [kitchenType, setKitchenType] = useState('')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!email || !password || !kitchenName) return
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setBusy(true)
    try {
      await apiJson('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          kitchenName: kitchenName.trim(),
          kitchenType,
          timezone,
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
            <h2 className="text-xl font-bold text-emerald-900 mb-2">Application submitted!</h2>
            <p className="text-sm text-slate-600 mb-6">
              Your kitchen <b>{kitchenName}</b> is now awaiting admin approval. You'll be able to log in once we approve you.
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
          <h1 className="text-2xl font-bold text-emerald-900 mt-3">Start your kitchen</h1>
          <p className="text-sm text-emerald-700/70">Sign up and we'll approve your kitchen shortly.</p>
        </div>

        <Card className="shadow-lg border-emerald-100">
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label htmlFor="kname">Kitchen name *</Label>
                <Input id="kname" value={kitchenName} onChange={e => setKitchenName(e.target.value)} placeholder="e.g. Bella Cucina" required autoFocus />
              </div>
              <div>
                <Label htmlFor="ktype">Kitchen type</Label>
                <Select value={kitchenType} onValueChange={setKitchenType}>
                  <SelectTrigger id="ktype"><SelectValue placeholder="Choose..." /></SelectTrigger>
                  <SelectContent>
                    {KITCHEN_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="tz">Timezone *</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id="tz"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500 mt-1">Your chef codes rotate at midnight in this timezone.</p>
              </div>
              <div>
                <Label htmlFor="email">Owner email *</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@kitchen.com" required />
              </div>
              <div>
                <Label htmlFor="pw">Password * (min 8 chars)</Label>
                <Input id="pw" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 mt-2" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                Request Access
              </Button>
              <p className="text-xs text-center text-slate-500 pt-2">
                Already have an account? <Link href="/login" className="text-emerald-700 font-semibold hover:underline">Log in</Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
