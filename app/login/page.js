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
import { ChefHat, Loader2, LogIn } from 'lucide-react'
import InstallAppPrompt from '@/components/InstallAppPrompt'

export default function LoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState('owner')

  // Owner form
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [ownerBusy, setOwnerBusy] = useState(false)

  // Chef form
  const [kitchenName, setKitchenName] = useState('')
  const [code, setCode] = useState('')
  const [chefBusy, setChefBusy] = useState(false)

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
      toast.success('Welcome back!')
      router.replace(me.isAdmin ? '/admin' : '/')
    } catch (err) {
      toast.error(err.message || 'Login failed')
    } finally {
      setOwnerBusy(false)
    }
  }

  async function submitChef(e) {
    e.preventDefault()
    if (!kitchenName.trim() || !code.trim()) return
    setChefBusy(true)
    try {
      // Make sure any owner session is cleared so we don't send both tokens.
      try { const sb = getBrowserSupabase(); await sb.auth.signOut() } catch {}
      const res = await apiJson('/api/auth/chef-login', {
        method: 'POST',
        body: JSON.stringify({ kitchenName: kitchenName.trim(), code: code.trim().toUpperCase() }),
      })
      setChefToken(res.token)
      toast.success(`Welcome, Chef!`)
      router.replace('/')
    } catch (err) {
      toast.error(err.message || 'Chef login failed')
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
                <TabsTrigger value="owner">Owner / Admin</TabsTrigger>
                <TabsTrigger value="chef">Chef</TabsTrigger>
              </TabsList>

              <TabsContent value="owner">
                <form onSubmit={submitOwner} className="space-y-3">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@kitchen.com" required autoFocus />
                  </div>
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                  </div>
                  <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={ownerBusy}>
                    {ownerBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
                    Log In
                  </Button>
                  <p className="text-xs text-center text-slate-500 pt-2">
                    New kitchen? <Link href="/signup" className="text-emerald-700 font-semibold hover:underline">Sign up</Link>
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
                    <Label htmlFor="code">Today's chef code</Label>
                    <Input id="code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. TIGER-42" required style={{ letterSpacing: '2px', fontFamily: 'monospace' }} />
                    <p className="text-[11px] text-slate-500 mt-1">Ask your kitchen manager for today's code. It changes daily at midnight.</p>
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

        <p className="text-[11px] text-center text-slate-400 mt-4">© {new Date().getFullYear()} ShelfWise</p>
      </div>
    </div>
  )
}
