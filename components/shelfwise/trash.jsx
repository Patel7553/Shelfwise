'use client'

/* UNIFIED TRASH / RECENTLY DELETED (Aug 2026)
   One trash for the whole app: anything deleted anywhere (inventory, recipes,
   receipts, rota, waste, HACCP logs, supplier contacts…) lands here and can be
   restored with one tap for 30 days before being purged automatically. */

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Trash2, RotateCcw, Loader2, ChevronDown, ChevronUp, X } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'

const fetch = apiFetch

const TYPE_ICON = {
  'Inventory item': '📦', 'Recipe': '📖', 'Receipt': '🧾', 'Supplier contact': '🚚',
  'Rota shift': '🗓️', 'Waste entry': '♻️', 'Temperature log': '🌡️',
  'Cleaning log': '🧽', 'Delivery check': '📋', 'Catalog product': '🏷️',
}

function relTime(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

export function TrashCard({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const [items, setItems] = useState([])
  const [retention, setRetention] = useState(30)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [confirmId, setConfirmId] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/trash')
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setItems(Array.isArray(data.items) ? data.items : [])
        if (data.retentionDays) setRetention(data.retentionDays)
      }
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { if (open) load() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const restore = async (it) => {
    setBusyId(it.id)
    try {
      const res = await fetch('/api/trash/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Restore failed')
      toast.success(`Restored: ${it.label} ✅`)
      setItems(list => list.filter(x => x.id !== it.id))
      try { window.dispatchEvent(new Event('shelfwise-inventory-refresh')) } catch {}
    } catch (e) {
      toast.error(e.message || 'Restore failed')
    } finally { setBusyId('') }
  }

  const purge = async (it) => {
    setBusyId(it.id)
    try {
      const res = await fetch(`/api/trash/${it.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast.success(`Deleted forever: ${it.label}`)
      setItems(list => list.filter(x => x.id !== it.id))
    } catch (e) {
      toast.error(e.message || 'Delete failed')
    } finally { setBusyId(''); setConfirmId('') }
  }

  return (
    <div className="rounded-xl border-2 border-slate-200 bg-white overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50 transition text-left">
        <Trash2 className="h-4 w-4 text-slate-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">🗑️ Recently Deleted (Trash)</p>
          <p className="text-[11px] text-muted-foreground">Anything deleted anywhere in the app — restore within {retention} days</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-slate-100">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
          ) : items.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Trash is empty — deleted items appear here for {retention} days</p>
          ) : (
            <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
              {items.map(it => (
                <div key={it.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <span className="text-lg shrink-0">{TYPE_ICON[it.entityType] || '🗂️'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.label || '(unnamed)'}</p>
                    <p className="text-[10px] text-muted-foreground">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 mr-1 align-middle">{it.entityType}</Badge>
                      deleted {relTime(it.deletedAt)} by {it.deletedBy || 'Unknown'}
                    </p>
                  </div>
                  {confirmId === it.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={busyId === it.id} onClick={() => purge(it)}>
                        {busyId === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Delete forever'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setConfirmId('')}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" disabled={!!busyId} onClick={() => restore(it)}>
                        {busyId === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RotateCcw className="h-3 w-3 mr-1" /> Restore</>}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-600" title="Delete forever" disabled={!!busyId} onClick={() => setConfirmId(it.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground text-center py-2 border-t border-slate-50">Items are deleted forever after {retention} days</p>
        </div>
      )}
    </div>
  )
}
