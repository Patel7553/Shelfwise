'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiJson, signOutAll, getBearerToken } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast, Toaster } from 'sonner'
import { Loader2, ShieldCheck, LogOut, RefreshCw, Mail } from 'lucide-react'

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState(null)
  const [tab, setTab] = useState('pending')
  const [kitchens, setKitchens] = useState([])
  const [busyId, setBusyId] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const meData = await apiJson('/api/auth/me')
      setMe(meData)
      if (!meData.isAdmin) {
        toast.error('Admin only')
        router.replace('/')
        return
      }
      const { kitchens } = await apiJson(`/api/admin/kitchens?status=${tab === 'all' ? '' : tab}`)
      setKitchens(kitchens)
    } catch (err) {
      toast.error(err.message || 'Failed to load')
      if (err.status === 401) router.replace('/login')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tab])

  async function act(action, kitchenId) {
    setBusyId(kitchenId)
    try {
      await apiJson(`/api/admin/${action}`, {
        method: 'POST',
        body: JSON.stringify({ kitchenId }),
      })
      toast.success(`Kitchen ${action}d`)
      load()
    } catch (err) {
      toast.error(err.message || 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  async function testEmail() {
    const to = window.prompt('Send test email to:', me?.userEmail || '')
    if (!to) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
                   authorization: `Bearer ${await getBearerToken()}` },
        body: JSON.stringify({ to }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        toast.success(`Test email sent to ${data.sentTo}. Check inbox / spam.`, { duration: 8000 })
      } else {
        const msg = data.error || `HTTP ${res.status}`
        console.error('Test email failed:', data)
        toast.error(msg, { duration: 12000 })
        if (data.hint) toast.warning(data.hint, { duration: 15000 })
      }
    } catch (err) {
      toast.error(err.message || 'Test failed')
    } finally {
      setLoading(false)
    }
  }

  async function envCheck() {
    setLoading(true)
    try {
      const data = await apiJson('/api/admin/env-check')
      const rows = Object.entries(data).map(([k, v]) => `${k}: ${typeof v === 'boolean' ? (v ? '✅' : '❌') : v}`).join('\n')
      window.alert('Vercel env vars status:\n\n' + rows)
    } catch (err) {
      toast.error(err.message || 'Env check failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-right" richColors />
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
            <div>
              <h1 className="font-bold text-lg">ShelfWise Admin</h1>
              <p className="text-xs text-slate-500">{me?.userEmail}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={envCheck}>🔍 Env check</Button>
            <Button variant="ghost" size="sm" onClick={testEmail}><Mail className="h-4 w-4 mr-1" />Test email</Button>
            <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
            <Button variant="outline" size="sm" onClick={async () => { await signOutAll(); router.replace('/login') }}><LogOut className="h-4 w-4 mr-1" />Sign out</Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="flex gap-2 flex-wrap">
          {['pending','approved','rejected','suspended','all'].map(s => (
            <Button key={s} variant={tab === s ? 'default' : 'outline'} size="sm" onClick={() => setTab(s)} className={tab === s ? 'bg-emerald-600 hover:bg-emerald-700' : ''}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : kitchens.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-slate-500">No kitchens in this list.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {kitchens.map(k => (
              <Card key={k.id}>
                <CardContent className="p-4 flex flex-wrap gap-3 items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{k.kitchenName || <span className="text-slate-400 italic">Unnamed — {k.ownerEmail}</span>}</h3>
                      <Badge variant="outline" className={
                        k.status === 'approved' ? 'text-emerald-700 border-emerald-300 bg-emerald-50' :
                        k.status === 'pending' ? 'text-amber-700 border-amber-300 bg-amber-50' :
                        k.status === 'rejected' ? 'text-red-700 border-red-300 bg-red-50' :
                        'text-slate-700 border-slate-300 bg-slate-50'
                      }>{k.status}</Badge>
                      {k.kitchenType && <Badge variant="secondary">{k.kitchenType}</Badge>}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {k.ownerEmail} · {k.timezone} · Signed up {new Date(k.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {k.status !== 'approved' && (
                      <Button size="sm" onClick={() => act('approve', k.id)} disabled={busyId === k.id} className="bg-emerald-600 hover:bg-emerald-700">
                        {busyId === k.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve'}
                      </Button>
                    )}
                    {k.status !== 'rejected' && k.status !== 'approved' && (
                      <Button size="sm" variant="outline" onClick={() => act('reject', k.id)} disabled={busyId === k.id}>Reject</Button>
                    )}
                    {k.status === 'approved' && (
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => act('suspend', k.id)} disabled={busyId === k.id}>Suspend</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
