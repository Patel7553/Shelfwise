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
import { Boxes, AlertTriangle, Clock, PackageX, Plus, Search, Download, ArrowUpDown, Pencil, Trash2, LayoutDashboard, Package, Sparkles, ChefHat, ScanLine, Upload, Loader2, Check, X, BookOpen, AlertCircle, ShieldAlert, ShieldCheck, Settings, ArrowRight, ArrowLeft, Copy, RefreshCw, LogOut, Printer, BarChart3, Bell, BellOff, Calendar as CalendarIcon, Sun, Moon, Monitor, Thermometer, Droplets, Truck, ClipboardCheck, FileText, Globe } from 'lucide-react'
import { apiFetch, signOutAll, getChefToken } from '@/lib/apiClient'
import InstallAppPrompt from '@/components/InstallAppPrompt'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useT } from '@/lib/i18n'
import { STATUS_META, EMPTY_FORM, ALLERGENS, CURRENCY_SYMBOL, guessShelfLifeDays, dateInDays, suggestExpiryDate, escapeText } from '@/components/shelfwise/shared'

// `fetch` inside this file transparently uses `apiFetch` (auth token attached).
const fetch = apiFetch

export function UseTodayPanel({ products, goToInventory, formatDate }) {
  // Items expiring today or tomorrow
  const today = new Date(); today.setHours(0,0,0,0)
  const tomorrowEnd = new Date(today); tomorrowEnd.setDate(today.getDate() + 1); tomorrowEnd.setHours(23,59,59,999)
  const urgent = (products || []).filter(p => {
    if (!p.expiryDate) return false
    const d = new Date(p.expiryDate)
    return d <= tomorrowEnd && p._status !== 'Expired'
  }).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))

  const [marking, setMarking] = useState(null)

  const markUsed = async (id) => {
    if (!confirm('Mark this item as used up? It will be removed from inventory.')) return
    setMarking(id)
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Marked as used ✅')
      window.location.reload()
    } catch {
      toast.error('Failed to update')
    } finally {
      setMarking(null)
    }
  }

  if (!urgent.length) {
    return (
      <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <Check className="h-6 w-6 text-emerald-700" />
          </div>
          <div>
            <p className="font-bold text-emerald-900">All clear — nothing expiring today or tomorrow! 🎉</p>
            <p className="text-sm text-emerald-700">Keep up the great work.</p>
          </div>
        </div>
      </div>
    )
  }

  const isToday = (d) => {
    const dt = new Date(d); dt.setHours(0,0,0,0)
    return dt.getTime() === today.getTime()
  }

  return (
    <div className="rounded-2xl border-2 border-red-300 bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-red-100 flex items-center justify-center animate-pulse">
            <AlertCircle className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <p className="font-bold text-red-900 text-lg leading-tight">🚨 Use today or tomorrow</p>
            <p className="text-xs text-red-700">{urgent.length} item{urgent.length !== 1 ? 's' : ''} — use them before they expire!</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => goToInventory('Expiring')} className="text-red-700 hover:bg-red-100">
          View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
      <div className="space-y-2">
        {urgent.slice(0, 5).map(p => (
          <div key={p.id} className="flex items-center justify-between gap-3 bg-white rounded-xl p-3 border border-red-100 shadow-sm">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isToday(p.expiryDate) ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
                  {isToday(p.expiryDate) ? 'TODAY' : 'TOMORROW'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {p.quantity} {p.unit}
                {p.location ? ` • 📍 ${p.location}` : ''}
                {p.storageType ? ` • ${p.storageType}` : ''}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 shrink-0"
              onClick={() => markUsed(p.id)}
              disabled={marking === p.id}
            >
              {marking === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="h-3.5 w-3.5 mr-1" /> Used</>}
            </Button>
          </div>
        ))}
        {urgent.length > 5 && (
          <p className="text-xs text-center text-red-700 font-medium pt-1">+ {urgent.length - 5} more — tap &quot;View all&quot;</p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// USE IT OR LOSE IT — top-of-dashboard panel (requested feature):
// 1) groceries expiring within 2 days, ascending by expiry date
// 2) one-tap kitchen-type-aware AI recipe suggestions from those items
// 3) money-saved tracking: marking items "used" before expiry banks their
//    invoice value (unitCost × qty) and celebrates the saving.
// ============================================================================
export function UseItOrLoseItPanel({ products, currency, openRecipeGenFromExpiring, refreshAll }) {
  const [busyId, setBusyId] = useState(null)
  const [savedTotal, setSavedTotal] = useState(0)
  const sym = CURRENCY_SYMBOL[currency] || '£'

  // device-local running total of money saved this month
  const monthKey = () => `sw_savings_${new Date().getFullYear()}-${new Date().getMonth() + 1}`
  useEffect(() => {
    try { setSavedTotal(Number(localStorage.getItem(monthKey())) || 0) } catch {}
  }, [])
  const bankSaving = (amount) => {
    try {
      const next = (Number(localStorage.getItem(monthKey())) || 0) + amount
      localStorage.setItem(monthKey(), String(next))
      setSavedTotal(next)
    } catch {}
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  // Calendar-day difference (0 = today, 1 = tomorrow, 2 = in 2 days)
  const daysUntil = (p) => {
    const dMid = new Date(`${String(p.expiryDate).slice(0, 10)}T00:00:00`)
    return Math.round((dMid - today) / 86400000)
  }

  // Items expiring today..+2 days, ASCENDING by expiry (soonest first)
  const expiring = useMemo(() => {
    return (products || [])
      .filter(p => {
        if (!p.expiryDate || Number(p.quantity) <= 0) return false
        const diff = daysUntil(p)
        return diff >= 0 && diff <= 2
      })
      .sort((a, b) => String(a.expiryDate).localeCompare(String(b.expiryDate)))
  }, [products])

  const valueOf = (p) => (Number(p.unitCost) || 0) * (Number(p.quantity) || 0)
  const atRisk = expiring.reduce((s, p) => s + valueOf(p), 0)

  const daysLabel = (p) => {
    const diff = daysUntil(p)
    if (diff <= 0) return { text: 'TODAY', cls: 'bg-red-600 text-white' }
    if (diff === 1) return { text: 'Tomorrow', cls: 'bg-orange-500 text-white' }
    return { text: 'In 2 days', cls: 'bg-amber-400 text-amber-950' }
  }

  const markUsed = async (p) => {
    const val = valueOf(p)
    if (!window.confirm(`Mark ALL ${p.quantity} ${p.unit} of "${p.name}" as used in cooking?`)) return
    setBusyId(p.id)
    try {
      const res = await fetch('/api/usage/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: p.id, used: Number(p.quantity) }] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update stock')
      if (val > 0) {
        bankSaving(val)
        toast.success(`🎉 You saved ${sym}${val.toFixed(2)} by cooking "${p.name}" before it expired!`, { duration: 6000 })
      } else {
        toast.success(`"${p.name}" marked as used — nice work beating the expiry date! (add a unit cost to track savings)`)
      }
      refreshAll && refreshAll()
    } catch (e) {
      toast.error(e.message || 'Could not update stock')
    } finally { setBusyId(null) }
  }

  // Show NOTHING when no items are expiring within 2 days — the panel only
  // appears when there is genuinely something to act on (user request).
  if (expiring.length === 0) return null

  return (
    <div className="rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50/60 overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between flex-wrap gap-2 border-b border-orange-200/70">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">⏳</span>
          <div>
            <p className="font-bold text-orange-900">Use It or Lose It — {expiring.length} item{expiring.length !== 1 ? 's' : ''} expiring within 2 days</p>
            <p className="text-xs text-orange-800">
              {atRisk > 0 ? <><b>{sym}{atRisk.toFixed(2)}</b> of stock at risk — cook it before it becomes waste.</> : 'Cook these before they become waste.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {savedTotal > 0 && (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">💰 Saved this month: {sym}{savedTotal.toFixed(2)}</Badge>
          )}
          <Button size="sm" onClick={openRecipeGenFromExpiring} className="bg-rose-600 hover:bg-rose-700 text-white">
            <Sparkles className="h-4 w-4 mr-1.5" /> Get Recipe Ideas
          </Button>
        </div>
      </div>
      {/* Ascending expiry list */}
      <div className="divide-y divide-orange-100">
        {expiring.slice(0, 8).map(p => {
          const badge = daysLabel(p)
          const val = valueOf(p)
          return (
            <div key={p.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 bg-white/60">
              <span className={`text-[10px] font-bold rounded px-2 py-0.5 shrink-0 ${badge.cls}`}>{badge.text}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.quantity} {p.unit}{val > 0 && <> · worth <b className="text-orange-800">{sym}{val.toFixed(2)}</b></>} · expires {new Date(`${String(p.expiryDate).slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <Button variant="outline" size="sm" className="shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                disabled={busyId === p.id} onClick={() => markUsed(p)}>
                {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="h-3.5 w-3.5 mr-1" /> Cooked it</>}
              </Button>
            </div>
          )
        })}
        {expiring.length > 8 && (
          <p className="px-5 py-2 text-xs text-orange-800 bg-white/60">+ {expiring.length - 8} more — see Inventory → Expiring</p>
        )}
      </div>
    </div>
  )
}

export function DashboardView({ stats, statsLoading, products, goToInventory, seedData, openAdd, openScan, openSnap, openBarcode, openVoice, openReceipt, printLogbook, openRecipe, onViewRecipe, widgets, recipesCount, gotoRecipes, gotoStockLevels, personName, currency, openRecipeGen, openRecipeGenFromExpiring, openEdit, refreshAll, isStaff }) {
  const [quickSearch, setQuickSearch] = useState('')
  const [globalResults, setGlobalResults] = useState(null)
  const [globalLoading, setGlobalLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)  // "Add Items" tile expander
  // Stat-card filtered list view (UX overhaul): when set, the dashboard is
  // replaced by a simple filtered list with stacked detail cards + back button.
  const [statFilter, setStatFilter] = useState(null) // null | 'total' | 'expiring' | 'low' | 'expired'
  // If widgets is undefined → show all (backwards compat).
  // If widgets array is provided (even empty) → strict include check.
  const show = (k) => widgets === undefined || (Array.isArray(widgets) && widgets.includes(k))

  const onSearch = async (e) => {
    e.preventDefault()
    const q = quickSearch.trim()
    if (!q) { setGlobalResults(null); return }
    setGlobalLoading(true)
    try {
      const [pRes, rRes] = await Promise.all([
        fetch(`/api/products?search=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => []),
        fetch(`/api/recipes?search=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => []),
      ])
      setGlobalResults({
        products: Array.isArray(pRes) ? pRes : [],
        recipes: Array.isArray(rRes) ? rRes : [],
      })
    } finally {
      setGlobalLoading(false)
    }
  }

  const clearSearch = () => { setQuickSearch(''); setGlobalResults(null) }

  // While the first stats fetch is in flight, show "…" instead of misleading 0s
  const L = (v) => (statsLoading ? '…' : v)
  // 2x2 tappable stat cards (UX overhaul) — tapping opens a simple filtered
  // list (NOT the full inventory view) rendered by FilteredStatList below.
  const statCards = [
    { key: 'total', label: 'Total Items', value: L(stats.total), icon: Boxes, accent: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'from-emerald-500 to-teal-600' },
    { key: 'expiring', label: 'Expiring Soon', value: L(stats.expiring), icon: Clock, accent: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', bar: 'from-amber-500 to-orange-500' },
    { key: 'low', label: 'Low Stock', value: L(stats.critical), icon: AlertTriangle, accent: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', bar: 'from-orange-500 to-red-500' },
    { key: 'expired', label: 'Expired', value: L(stats.expired), icon: PackageX, accent: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', bar: 'from-red-500 to-rose-600' },
  ]
  const isEmpty = !statsLoading && stats.total === 0

  // Time-based greeting for the hero
  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night'
  const greetingEmoji = hour < 5 ? '🌙' : hour < 12 ? '☀️' : hour < 17 ? '🌤️' : hour < 21 ? '🌆' : '🌙'

  // When a stat card was tapped, show ONLY the filtered list (with back button)
  if (statFilter) {
    return (
      <FilteredStatList
        filterKey={statFilter}
        products={products}
        onBack={() => setStatFilter(null)}
        openEdit={openEdit}
        refreshAll={refreshAll}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* 1) FIRST: groceries expiring in the next 2 days (ascending) + recipe
          ideas + money-saved tracking — per user request this sits at the top. */}
      <UseItOrLoseItPanel products={products} currency={currency} openRecipeGenFromExpiring={openRecipeGenFromExpiring} refreshAll={refreshAll} />

      {/* Plain centered greeting (green hero banner removed — user request).
          No card, no background — just text below the header. */}
      <div className="text-center pt-1">
        <p className="text-xl md:text-2xl font-semibold tracking-tight">{greetingEmoji} {greeting}{personName ? `, ${personName}` : ''}</p>
        {/* Live date + day under the greeting (user request) */}
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        {isEmpty && (
          <Button variant="outline" size="sm" onClick={seedData} className="mt-2">
            <Sparkles className="h-4 w-4 mr-2" /> Load sample data
          </Button>
        )}
      </div>

      {/* ====================================================================
          3 MAIN ACTIONS — compact tiles, same size as the old quick buttons
          (user request). Tapping "Add Products" expands its options
          (Snap Label / Voice / Manual / Invoice) right below.
          ==================================================================== */}
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => goToInventory('All')} className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300 transition text-emerald-800">
            <span className="text-2xl">📦</span>
            <span className="text-xs font-semibold">Inventory</span>
          </button>
          <button
            onClick={() => setAddOpen(v => !v)}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition text-blue-800 ${addOpen ? 'border-blue-400 bg-blue-100 shadow-inner' : 'border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300'}`}
          >
            <span className="text-2xl">➕</span>
            <span className="text-xs font-semibold">Add Items</span>
          </button>
          <button onClick={gotoStockLevels} className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 hover:border-purple-300 transition text-purple-800">
            <span className="text-2xl">📊</span>
            <span className="text-xs font-semibold">Stock Levels</span>
          </button>
        </div>
        {addOpen && (
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => openBarcode('add')} className="flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400 transition text-emerald-900">
              <ScanLine className="h-5 w-5 text-emerald-600" />
              <span className="text-[11px] font-semibold">Scan Barcode</span>
            </button>
            <button onClick={openSnap} className="flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 border-blue-200 bg-white hover:bg-blue-50 hover:border-blue-300 transition text-blue-900">
              <span className="text-xl">📸</span>
              <span className="text-[11px] font-semibold">Snap Label</span>
            </button>
            <button onClick={openAdd} className="flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 border-blue-200 bg-white hover:bg-blue-50 hover:border-blue-300 transition text-blue-900">
              <span className="text-xl">✏️</span>
              <span className="text-[11px] font-semibold">Manual</span>
            </button>
          </div>
        )}
      </div>

      {/* ====================================================================
          2x2 TAPPABLE STAT CARDS (UX overhaul) — Total Items / Expiring Soon /
          Low Stock / Expired. Tapping opens a simple filtered list with
          stacked detail cards (NOT the full inventory view).
          ==================================================================== */}
      <div className="grid grid-cols-2 gap-3">
        {statCards.map(c => {
          const Icon = c.icon
          return (
            <button key={c.key} onClick={() => setStatFilter(c.key)} className="text-left">
              <Card className={`transition-all border-2 ${c.border} shadow-sm overflow-hidden group hover:shadow-lg hover:-translate-y-0.5 cursor-pointer`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`h-9 w-9 rounded-lg ${c.bg} flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${c.accent}`} />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground transition" />
                  </div>
                  <div className="text-3xl font-bold tracking-tight">{c.value}</div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">{c.label}</div>
                  <div className={`h-1 w-10 rounded-full bg-gradient-to-r ${c.bar} opacity-80 group-hover:w-16 transition-all mt-2`} />
                </CardContent>
              </Card>
            </button>
          )
        })}
      </div>

      <UseTodayPanel products={products} goToInventory={goToInventory} formatDate={(d) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} />

      {/* Expiry alerts show on EVERY device (user request, June 2025) — the
          banner self-hides when nothing is expiring or the device is muted. */}
      <EnablePushBanner />
      <ExpiryAlertBanner stats={stats} goToInventory={goToInventory} />

      {show('search') && (
      <>
      <form onSubmit={onSearch} className="relative max-w-2xl">
        <Search className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-12 pr-28 h-12 text-base rounded-xl border-2 focus:border-emerald-400"
          placeholder="Search products & recipes... (press Enter)"
          value={quickSearch}
          onChange={e => setQuickSearch(e.target.value)}
        />
        <Button type="submit" size="sm" className="absolute right-2 top-1/2 -translate-y-1/2 bg-emerald-600 hover:bg-emerald-700" disabled={globalLoading}>
          {globalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
        </Button>
      </form>

      {globalResults && (
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold">
                Search results for "{quickSearch}" — {globalResults.products.length} product{globalResults.products.length !== 1 ? 's' : ''}, {globalResults.recipes.length} recipe{globalResults.recipes.length !== 1 ? 's' : ''}
              </p>
              <Button variant="ghost" size="sm" onClick={clearSearch}><X className="h-4 w-4 mr-1" /> Clear</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1"><Package className="h-3 w-3" /> Products</p>
                {globalResults.products.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No products found.</p>
                ) : (
                  <ul className="divide-y border rounded-lg">
                    {globalResults.products.slice(0, 8).map(p => (
                      <li key={p.id}>
                        <button onClick={() => goToInventory('All', quickSearch)} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex justify-between items-center">
                          <span className="font-medium text-sm">{p.name}</span>
                          <span className="text-xs text-muted-foreground">{p.quantity} {p.unit}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1"><BookOpen className="h-3 w-3" /> Recipes</p>
                {globalResults.recipes.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No recipes found.</p>
                ) : (
                  <ul className="divide-y border rounded-lg">
                    {globalResults.recipes.slice(0, 8).map(r => (
                      <li key={r.id}>
                        <button onClick={() => onViewRecipe(r)} className="w-full text-left px-3 py-2 hover:bg-slate-50">
                          <span className="font-medium text-sm">{r.title || 'Untitled'}</span>
                          <span className="text-xs text-muted-foreground ml-2">· {Array.isArray(r.ingredients) ? r.ingredients.length : 0} ingredients</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      </>
      )}

      {/* Urgent items panel */}
      {show('urgent_list') && (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Urgent Items</CardTitle>
              <CardDescription>Products that are expired or expiring within {stats?.expiryAlertDays || 7} days</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => goToInventory('Expiring')}>View all</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isEmpty ? (
            <div className="text-center py-12 text-muted-foreground">
              <Boxes className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No inventory yet. Add your first product or load sample data to get started.</p>
            </div>
          ) : (
            <UrgentList />
          )}
        </CardContent>
      </Card>
      )}

      {/* NEW — Items added today. Resets every midnight. Shows most recent first. Click any item to view / edit. */}
      <RecentItemsToday products={products} goToInventory={goToInventory} openEdit={openEdit} />
    </div>
  )
}

// A card that lists items added today (created_at within the last 24h up to midnight tomorrow).
// Refreshes when the products prop changes, so it always reflects the latest state.
export function RecentItemsToday({ products, goToInventory, openEdit }) {
  const todayItems = React.useMemo(() => {
    if (!Array.isArray(products) || products.length === 0) return []
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(); end.setHours(23, 59, 59, 999)
    return products
      .filter(p => {
        const c = p.createdAt || p.created_at
        if (!c) return false
        const t = new Date(c).getTime()
        return t >= start.getTime() && t <= end.getTime()
      })
      .sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at))
  }, [products])

  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" /> Added Today
            </CardTitle>
            <CardDescription>{dateStr} · Items you added or scanned today ({todayItems.length})</CardDescription>
          </div>
          {todayItems.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => goToInventory('All')}>View all</Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {todayItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nothing added yet today.</p>
            <p className="text-xs mt-1">Use Voice, Snap Label, Scan Logbook or Supplier Invoice to add items — they'll show up here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayItems.slice(0, 8).map(p => {
              const c = new Date(p.createdAt || p.created_at)
              const time = c.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    // Prefer opening the edit dialog so the user can see ALL fields at once (image, allergens, cost, notes...).
                    // Falls back to navigating to inventory if openEdit isn't wired.
                    if (typeof openEdit === 'function') openEdit(p)
                    else goToInventory('All')
                  }}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-lg border hover:bg-emerald-50 hover:border-emerald-200 transition"
                  title="Tap to view all details"
                >
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" className="h-10 w-10 rounded-md object-cover border shrink-0" />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 shrink-0">
                      <Package className="h-4 w-4" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{p.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {p.quantity} {p.unit}
                      {p.storageType ? ` · ${p.storageType}` : ''}
                      {p.expiryDate ? ` · exp ${p.expiryDate}` : ''}
                      {p.preparedBy ? ` · by ${p.preparedBy}` : (p.addedBy ? ` · by ${p.addedBy}` : '')}
                    </p>
                  </div>
                  <div className="text-[11px] text-slate-400 shrink-0 whitespace-nowrap">{time}</div>
                </button>
              )
            })}
            {todayItems.length > 8 && (
              <p className="text-xs text-center text-slate-500 pt-1">+ {todayItems.length - 8} more today — tap "View all"</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// ENABLE-PUSH NUDGE (June 2025, user request) — staff phones weren't getting
// the "expiring in 7 days" alerts because push was never enabled on their
// device. This slim one-tap banner shows on ANY device that isn't subscribed
// yet (and hasn't dismissed it). One tap = permission prompt + subscribe.
// ============================================================================
export function EnablePushBanner() {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        if (localStorage.getItem('sw_push_nudge_done')) return
        if (localStorage.getItem('sw_notify_mode') === 'mute') return
        if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return
        if (Notification.permission === 'denied') return
        const reg = await navigator.serviceWorker.getRegistration()
        const sub = reg ? await reg.pushManager.getSubscription() : null
        if (!sub) setVisible(true)
      } catch {}
    })()
  }, [])

  const b64ToU8 = (s) => {
    const pad = '='.repeat((4 - (s.length % 4)) % 4)
    const raw = window.atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
    const out = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i)
    return out
  }

  const enable = async () => {
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { toast.error('Permission denied — you can enable it later in Settings'); dismiss(); return }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const keyRes = await fetch('/api/push/public-key')
      const keyData = await keyRes.json().catch(() => ({}))
      if (!keyRes.ok || !keyData.key) throw new Error(keyData.error || 'Push not configured')
      let sub = await reg.pushManager.getSubscription()
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(keyData.key) })
      const saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      if (!saveRes.ok) throw new Error('Could not save subscription')
      try {
        localStorage.setItem('sw_notify_mode', 'push')
        localStorage.setItem('sw_notify_last_on', 'push')
        localStorage.setItem('sw_push_nudge_done', '1')
      } catch {}
      setVisible(false)
      toast.success('Expiry alerts ON for this device 🔔')
    } catch (e) {
      toast.error(e.message || 'Could not enable alerts')
    } finally { setBusy(false) }
  }

  const dismiss = () => {
    try { localStorage.setItem('sw_push_nudge_done', '1') } catch {}
    setVisible(false)
  }

  if (!visible) return null
  return (
    <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-3 py-2.5 flex items-center gap-2.5">
      <Bell className="h-5 w-5 text-emerald-600 shrink-0" />
      <p className="text-xs text-emerald-900 flex-1 min-w-0">
        <b>Get expiry alerts on this device</b> — items expiring in 7 days, even when the app is closed.
      </p>
      <Button size="sm" onClick={enable} disabled={busy} className="h-8 bg-emerald-600 hover:bg-emerald-700 shrink-0">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enable'}
      </Button>
      <button type="button" onClick={dismiss} className="text-emerald-700/60 shrink-0 p-1" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function ExpiryAlertBanner({ stats, goToInventory }) {
  // ALWAYS shown on every device when items need attention (user request,
  // July 2025) — notification mode (mute / in-app / push) only affects
  // home-screen notifications, never these dashboard banners.
  if (!stats.expired && !stats.expiring) return null
  const messages = []
  if (stats.expired > 0) messages.push({ key: 'Expired', text: `${stats.expired} item${stats.expired !== 1 ? 's' : ''} already expired`, color: 'bg-red-50 border-red-200 text-red-800', dot: 'bg-red-500' })
  if (stats.expiring > 0) messages.push({ key: 'Expiring', text: `${stats.expiring} item${stats.expiring !== 1 ? 's' : ''} expiring within ${stats.expiryAlertDays || 7} days`, color: 'bg-amber-50 border-amber-200 text-amber-800', dot: 'bg-amber-500' })
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {messages.map(m => (
        <button key={m.key} onClick={() => goToInventory(m.key)}
          className={`text-left flex items-center justify-between rounded-xl border px-4 py-3 ${m.color} hover:shadow-sm transition`}>
          <div className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${m.dot} animate-pulse`} />
            <div>
              <p className="font-semibold text-sm">{m.text}</p>
              <p className="text-xs opacity-75">Tap to review and take action</p>
            </div>
          </div>
          <AlertTriangle className="h-5 w-5 opacity-60" />
        </button>
      ))}
    </div>
  )
}

export function UrgentList() {
  const [items, setItems] = useState([])
  useEffect(() => {
    (async () => {
      const a = await fetch('/api/products?status=Expired').then(r => r.json()).catch(() => [])
      const b = await fetch('/api/products?status=Expiring&sort=asc').then(r => r.json()).catch(() => [])
      setItems([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].slice(0, 8))
    })()
  }, [])
  if (!items.length) return <p className="text-sm text-muted-foreground py-4">Nothing urgent right now. Great job! 🎉</p>
  return (
    <div className="divide-y">
      {items.map(p => (
        <div key={p.id} className="flex items-center justify-between py-3">
          <div>
            <div className="font-medium">{p.name}</div>
            <div className="text-xs text-muted-foreground">{p.category || 'Uncategorized'} · {p.location || 'No location'} · {p.quantity} {p.unit}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{p.expiryDate ? new Date(p.expiryDate).toLocaleDateString() : '—'}</span>
            <Badge variant="outline" className={STATUS_META[p._status]?.color}>{STATUS_META[p._status]?.label}</Badge>
          </div>
        </div>
      ))}
    </div>
  )
}


// ============================================================================
// FILTERED STAT LIST (UX overhaul) — shown when a 2x2 dashboard stat card is
// tapped. A SIMPLE filtered list (not the full inventory view) rendered as
// stacked detail cards: Name, Qty, Expiry, Storage, Prepared By, Status,
// with Edit + Delete icons. Delete uses the universal soft-delete (Trash).
// Includes a mandatory back button (app-wide rule).
// ============================================================================
const STAT_FILTER_META = {
  total: { title: 'Total Items', icon: Boxes, accent: 'text-emerald-600', bg: 'bg-emerald-50', match: () => true },
  expiring: { title: 'Expiring Soon', icon: Clock, accent: 'text-amber-600', bg: 'bg-amber-50', match: (p) => p._status === 'Expiring' },
  low: { title: 'Low Stock', icon: AlertTriangle, accent: 'text-orange-600', bg: 'bg-orange-50', match: (p) => p._status === 'Critical' },
  expired: { title: 'Expired', icon: PackageX, accent: 'text-red-600', bg: 'bg-red-50', match: (p) => p._status === 'Expired' },
}

export function FilteredStatList({ filterKey, products, onBack, openEdit, refreshAll }) {
  const [deletingId, setDeletingId] = useState(null)
  const meta = STAT_FILTER_META[filterKey] || STAT_FILTER_META.total
  const Icon = meta.icon

  const items = useMemo(() => {
    const list = (products || []).filter(meta.match)
    // Expiring/Expired: soonest expiry first. Others: alphabetical.
    if (filterKey === 'expiring' || filterKey === 'expired') {
      return list.sort((a, b) => {
        const av = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity
        const bv = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity
        return av - bv
      })
    }
    return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  }, [products, filterKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmtDate = (d) => {
    if (!d) return '—'
    try { return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return String(d) }
  }

  const handleDelete = async (p) => {
    if (!window.confirm(`Move "${p.name}" to Trash?\n\nYou can restore it from Settings → Trash within 30 days.`)) return
    setDeletingId(p.id)
    try {
      const res = await fetch(`/api/products/${p.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Delete failed')
      }
      toast.success(`"${p.name}" moved to Trash 🗑️ — restore it from Settings → Trash`)
      refreshAll && refreshAll()
    } catch (e) {
      toast.error(e.message || 'Could not delete item')
    } finally { setDeletingId(null) }
  }

  return (
    <div className="space-y-4">
      {/* Header with mandatory back button */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack} className="rounded-xl shrink-0" aria-label="Back to dashboard">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className={`h-10 w-10 rounded-xl ${meta.bg} flex items-center justify-center shrink-0`}>
          <Icon className={`h-5 w-5 ${meta.accent}`} />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight leading-tight">{meta.title}</h2>
          <p className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-2xl">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No items here</p>
          <p className="text-sm mt-1">Nothing matches "{meta.title}" right now.</p>
          <Button variant="outline" size="sm" onClick={onBack} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Dashboard
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(p => {
            const sm = STATUS_META[p._status] || STATUS_META.Ok
            return (
              <div key={p.id} className="rounded-2xl border bg-card shadow-sm p-4">
                {/* Top row: name + status badge + action icons */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base leading-snug break-words">{p.name}</p>
                    <Badge variant="outline" className={`mt-1.5 ${sm.color}`}>{sm.label}</Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-blue-50"
                      aria-label={`Edit ${p.name}`}
                      onClick={() => openEdit && openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-600 hover:text-red-700 hover:bg-red-50"
                      aria-label={`Delete ${p.name}`}
                      disabled={deletingId === p.id}
                      onClick={() => handleDelete(p)}>
                      {deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                {/* Stacked details */}
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Qty</dt>
                    <dd className="font-semibold">{p.quantity ?? '—'} {p.unit || ''}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Expiry</dt>
                    <dd className={`font-semibold ${p._status === 'Expired' ? 'text-red-600' : p._status === 'Expiring' ? 'text-amber-600' : ''}`}>{fmtDate(p.expiryDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Storage</dt>
                    <dd className="font-semibold">{p.storageType || '—'}{p.location ? ` · ${p.location}` : ''}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Prepared By</dt>
                    <dd className="font-semibold">{p.preparedBy || p.addedBy || '—'}</dd>
                  </div>
                </dl>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
