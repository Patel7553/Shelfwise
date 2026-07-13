'use client'

/* eslint-disable no-unused-vars */
// Extracted from the former monolithic app/page.js (refactor: June 2025).
// Uniform import header — unused imports are tolerated intentionally.

import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { Boxes, AlertTriangle, Clock, PackageX, Plus, Search, Download, ArrowUpDown, Pencil, Trash2, LayoutDashboard, Package, Sparkles, ChefHat, ScanLine, Upload, Loader2, Check, X, BookOpen, AlertCircle, ShieldAlert, ShieldCheck, Settings, ArrowRight, Copy, RefreshCw, LogOut, Printer, BarChart3, Bell, BellOff, Calendar as CalendarIcon, Sun, Moon, Monitor, Thermometer, Droplets, Truck, ClipboardCheck, FileText, Globe } from 'lucide-react'
import { apiFetch, signOutAll, getChefToken } from '@/lib/apiClient'
import InstallAppPrompt from '@/components/InstallAppPrompt'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useT } from '@/lib/i18n'
import { STATUS_META, EMPTY_FORM, ALLERGENS, CURRENCY_SYMBOL, guessShelfLifeDays, dateInDays, suggestExpiryDate, escapeText } from '@/components/shelfwise/shared'

// `fetch` inside this file transparently uses `apiFetch` (auth token attached).
const fetch = apiFetch

// ============================================================================
// LogWasteDialog — manually log waste for things NOT in inventory
// (spoiled produce, leftover prepped food like chicken curry, sandwich
// fillings, etc). Posts to the same waste_log as the inventory dispose flow,
// so it all shows up together in Waste Analytics. (User request, June 2025.)
// ============================================================================
const WASTE_REASONS = [
  { id: 'spoiled',   label: 'Spoiled / gone bad', emoji: '🤢' },
  { id: 'expired',   label: 'Expired',            emoji: '📅' },
  { id: 'overstock', label: 'Made / bought too much', emoji: '📦' },
  { id: 'damaged',   label: 'Damaged / dropped',  emoji: '💥' },
  { id: 'other',     label: 'Other',              emoji: '❓' },
]
const WASTE_UNITS = ['ea', 'kg', 'g', 'L', 'mL', 'portion', 'tray', 'pack', 'box']

export function LogWasteDialog({ open, onClose, onSaved, currency }) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('ea')
  const [reason, setReason] = useState('spoiled')
  const [unitCost, setUnitCost] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const sym = CURRENCY_SYMBOL[currency] || ''

  useEffect(() => {
    if (open) { setName(''); setQuantity('1'); setUnit('ea'); setReason('spoiled'); setUnitCost(''); setNotes(''); setSaving(false) }
  }, [open])

  const save = async () => {
    if (!name.trim()) { toast.error('What was wasted? Please enter a name.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/waste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: name.trim(),
          quantity: Number(quantity) || 1,
          unit,
          reason,
          unitCost: unitCost === '' ? null : Number(unitCost),
          notes: notes.trim(),
          category: 'Manual entry',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not log waste')
      toast.success(`Waste logged: ${name.trim()}`)
      onSaved && onSaved()
      onClose()
    } catch (e) {
      toast.error(e.message || 'Could not log waste')
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose() }}>
      <DialogContent className="sm:max-w-[440px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">♻️ Log Waste</DialogTitle>
          <p className="text-sm text-muted-foreground">For anything not in your inventory — spoiled veg, leftover prepped food, curry, fillings…</p>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">What was wasted? *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chicken curry, Lettuce, Sandwich filling" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Quantity</Label>
              <Input type="number" min="0" step="0.1" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WASTE_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Why is it wasted?</Label>
            <div className="grid grid-cols-1 gap-1.5 mt-1">
              {WASTE_REASONS.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReason(r.id)}
                  className={`text-left rounded-lg border-2 px-3 py-2 transition flex items-center gap-2 ${reason === r.id ? 'border-amber-400 bg-amber-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                >
                  <span className="text-lg">{r.emoji}</span>
                  <span className="font-medium text-sm">{r.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Cost per {unit} {sym ? `(${sym})` : ''} <span className="text-muted-foreground">(optional)</span></Label>
              <Input type="number" min="0" step="0.01" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="e.g. 2.50" />
            </div>
            <div>
              <Label className="text-xs">Notes <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. left out overnight" />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />} Log Waste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


export function AnalyticsView({ products }) {
  const [range, setRange] = useState('week') // week | month | all
  const [data, setData] = useState({ entries: [], summary: null })
  const [loading, setLoading] = useState(false)
  const [logOpen, setLogOpen] = useState(false)  // manual "Log waste" dialog

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const now = new Date()
      let from = ''
      if (range === 'week') {
        const d = new Date(now); d.setDate(d.getDate() - 7); from = d.toISOString().slice(0, 10)
      } else if (range === 'month') {
        const d = new Date(now); d.setDate(d.getDate() - 30); from = d.toISOString().slice(0, 10)
      }
      const url = from ? `/api/waste?from=${from}` : '/api/waste'
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      const d = await res.json()
      setData(d)
    } catch (e) {
      toast.error('Could not load waste data — did you run migration-7?')
      setData({ entries: [], summary: null })
    } finally { setLoading(false) }
  }, [range])

  useEffect(() => { load() }, [load])

  const summary = data.summary || { count: 0, quantity: 0, cost: 0, byReason: {}, byCategory: {}, byWeek: {} }

  const reasonLabel = (r) => ({
    used_up: 'Used up',
    expired: 'Expired',
    spoiled: 'Spoiled',
    damaged: 'Damaged',
    overstock: 'Overstock',
    other: 'Other',
  })[r] || r

  const reasonColor = (r) => ({
    expired: 'bg-red-500',
    spoiled: 'bg-amber-500',
    damaged: 'bg-orange-500',
    overstock: 'bg-slate-500',
    other: 'bg-slate-400',
  })[r] || 'bg-slate-500'

  const topReasons = Object.entries(summary.byReason).sort((a, b) => b[1] - a[1])
  const topCategories = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const byWeek = Object.entries(summary.byWeek).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Waste Analytics</h2>
          <p className="text-muted-foreground mt-1">Track what's being disposed and why</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setLogOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" /> Log waste
          </Button>
          <div className="flex gap-1 border rounded-lg overflow-hidden bg-white">
            {['week', 'month', 'all'].map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-medium ${range === r ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {r === 'week' ? 'Last 7 days' : r === 'month' ? 'Last 30 days' : 'All time'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <LogWasteDialog open={logOpen} onClose={() => setLogOpen(false)} onSaved={load} />

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Items disposed</p>
                <p className="text-3xl font-bold text-slate-900">{summary.count}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total quantity</p>
                <p className="text-3xl font-bold text-slate-900">{Number(summary.quantity || 0).toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">across mixed units</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Est. cost of waste</p>
                <p className="text-3xl font-bold text-red-600">{summary.cost > 0 ? summary.cost.toFixed(2) : '—'}</p>
                <p className="text-[10px] text-muted-foreground mt-1">enter unit cost on dispose</p>
              </CardContent>
            </Card>
          </div>

          {summary.count === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="text-4xl mb-2">🎉</div>
                <p className="font-semibold">No waste logged in this range.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Waste is tracked when you dispose products (Inventory → 🗑️ button → reason),
                  or tap <b>+ Log waste</b> above to add anything else — spoiled veg, leftover prepped food…
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Breakdown by reason */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-semibold">By reason</h3>
                  {topReasons.map(([r, count]) => {
                    const pct = summary.count ? Math.round((count / summary.count) * 100) : 0
                    return (
                      <div key={r} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium">{reasonLabel(r)}</span>
                          <span className="text-muted-foreground">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${reasonColor(r)}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>

              {topCategories.length > 0 && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <h3 className="font-semibold">Top waste categories</h3>
                    {topCategories.map(([cat, count]) => (
                      <div key={cat} className="flex justify-between text-sm border-b last:border-0 py-1.5">
                        <span>{cat}</span>
                        <span className="text-muted-foreground">{count} item{count !== 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Recent waste list */}
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-3">Recent disposals ({data.entries.length})</h3>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {data.entries.map(e => (
                      <div key={e.id} className="flex items-center justify-between border-b last:border-0 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{e.productName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(e.disposedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            {e.category ? ` · ${e.category}` : ''}
                            {e.disposedBy ? ` · by ${e.disposedBy}` : ''}
                          </p>
                          {e.notes && <p className="text-[11px] text-muted-foreground italic">&quot;{e.notes}&quot;</p>}
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <Badge variant="outline" className={
                            e.reason === 'expired' ? 'text-red-700 border-red-300 bg-red-50' :
                            e.reason === 'spoiled' ? 'text-amber-700 border-amber-300 bg-amber-50' :
                            e.reason === 'damaged' ? 'text-orange-700 border-orange-300 bg-orange-50' :
                            'text-slate-700 border-slate-300 bg-slate-50'
                          }>{reasonLabel(e.reason)}</Badge>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {e.quantity} {e.unit}{e.unitCost != null ? ` · ${(e.unitCost * e.quantity).toFixed(2)}` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}


