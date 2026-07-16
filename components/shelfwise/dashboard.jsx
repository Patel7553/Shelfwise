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

export function DashboardView({ stats, statsLoading, products, goToInventory, seedData, openAdd, openScan, openSnap, openBarcode, openVoice, openReceipt, printLogbook, openRecipe, onViewRecipe, widgets, recipesCount, gotoRecipes, currency, openRecipeGen, openRecipeGenFromExpiring, openEdit, refreshAll, isStaff }) {
  const [quickSearch, setQuickSearch] = useState('')
  const [globalResults, setGlobalResults] = useState(null)
  const [globalLoading, setGlobalLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)  // "Add Products" tile expander
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
  const cardsAll = [
    // 'all_items' and 'recipes' stat cards removed — replaced by the big
    // Inventory / Recipes action cards at the top (user request).
    { key: 'expiring', label: 'Expiring Soon', value: L(stats.expiring), icon: Clock, color: 'from-amber-500 to-orange-500', accent: 'text-amber-600', bg: 'bg-amber-50', filterKey: 'Expiring' },
    { key: 'expired', label: 'Expired', value: L(stats.expired), icon: PackageX, color: 'from-red-500 to-rose-600', accent: 'text-red-600', bg: 'bg-red-50', filterKey: 'Expired' },
    { key: 'critical', label: 'Critical Stock', value: L(stats.critical), icon: AlertTriangle, color: 'from-orange-500 to-red-500', accent: 'text-orange-600', bg: 'bg-orange-50', filterKey: 'Critical' },
    { key: 'in_date', label: 'In Date', value: L(stats.inDate || 0), icon: Check, color: 'from-emerald-500 to-teal-600', accent: 'text-emerald-600', bg: 'bg-emerald-50', filterKey: 'Ok' },
    { key: 'inv_value', label: 'Inventory Value', value: statsLoading ? '…' : (stats.totalValue > 0 ? `${CURRENCY_SYMBOL[currency] || ''}${stats.totalValue.toFixed(0)}` : '—'), icon: Sparkles, color: 'from-emerald-500 to-emerald-700', accent: 'text-emerald-600', bg: 'bg-emerald-50' },
    { key: 'reorder', label: 'Below Reorder', value: L(stats.belowReorder || 0), icon: PackageX, color: 'from-orange-500 to-orange-700', accent: 'text-orange-600', bg: 'bg-orange-50', filterKey: 'All' },
  ]
  const cards = cardsAll.filter(c => show(c.key))
  const isEmpty = !statsLoading && stats.total === 0

  // Time-based greeting for the hero
  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night'
  const greetingEmoji = hour < 5 ? '🌙' : hour < 12 ? '☀️' : hour < 17 ? '🌤️' : hour < 21 ? '🌆' : '🌙'

  return (
    <div className="space-y-6">
      {/* 1) FIRST: groceries expiring in the next 2 days (ascending) + recipe
          ideas + money-saved tracking — per user request this sits at the top. */}
      <UseItOrLoseItPanel products={products} currency={currency} openRecipeGenFromExpiring={openRecipeGenFromExpiring} refreshAll={refreshAll} />

      {/* Hero header — gradient card with greeting + quick stats + primary actions */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white p-6 md:p-8 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(255,255,255,0.15)_0%,transparent_50%)]" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-emerald-100 uppercase tracking-wider">{greetingEmoji} {greeting}</p>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Here's what needs your attention</h2>
            {stats.total > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-emerald-50">
                <span><b className="text-white">{stats.total}</b> total items</span>
                {stats.expired > 0 && <span>🔴 <b className="text-white">{stats.expired}</b> expired</span>}
                {stats.expiring > 0 && <span>🟠 <b className="text-white">{stats.expiring}</b> expiring soon</span>}
                {stats.critical > 0 && <span>⚠️ <b className="text-white">{stats.critical}</b> low stock</span>}
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {isEmpty && (
              <Button variant="secondary" size="sm" onClick={seedData} className="bg-white/95 text-emerald-700 hover:bg-white">
                <Sparkles className="h-4 w-4 mr-2" /> Sample data
              </Button>
            )}
            {/* "Add Product" button removed — use the Add Products tile below (user request) */}
          </div>
        </div>
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
            <span className="text-xs font-semibold">Add Products</span>
          </button>
          <button onClick={gotoRecipes} className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 hover:border-purple-300 transition text-purple-800">
            <span className="text-2xl">📖</span>
            <span className="text-xs font-semibold">Recipes</span>
          </button>
        </div>
        {addOpen && (
          <div className="grid grid-cols-4 gap-2">
            <button onClick={openSnap} className="flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 border-blue-200 bg-white hover:bg-blue-50 hover:border-blue-300 transition text-blue-900">
              <span className="text-xl">📸</span>
              <span className="text-[11px] font-semibold">Snap Label</span>
            </button>
            <button onClick={openVoice} className="flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 border-blue-200 bg-white hover:bg-blue-50 hover:border-blue-300 transition text-blue-900">
              <span className="text-xl">🎤</span>
              <span className="text-[11px] font-semibold">Voice</span>
            </button>
            <button onClick={openAdd} className="flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 border-blue-200 bg-white hover:bg-blue-50 hover:border-blue-300 transition text-blue-900">
              <span className="text-xl">✏️</span>
              <span className="text-[11px] font-semibold">Manual</span>
            </button>
            <button onClick={openReceipt} className="flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 border-blue-200 bg-white hover:bg-blue-50 hover:border-blue-300 transition text-blue-900">
              <span className="text-xl">🧾</span>
              <span className="text-[11px] font-semibold">Invoice</span>
            </button>
          </div>
        )}
      </div>

      <UseTodayPanel products={products} goToInventory={goToInventory} formatDate={(d) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} />

      {show('expiry_alerts') && <ExpiryAlertBanner stats={stats} goToInventory={goToInventory} />}

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

      {cards.length > 0 && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => {
          const Icon = c.icon
          const handleClick = c.disabled ? undefined : (c.onClick || (() => goToInventory(c.filterKey)))
          return (
            <button key={c.key} onClick={handleClick} disabled={c.disabled} className={`text-left ${c.disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
              <Card className={`transition-all border-0 shadow-sm overflow-hidden group ${c.disabled ? '' : 'hover:shadow-lg hover:-translate-y-0.5 cursor-pointer'}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardDescription className="font-medium text-xs uppercase tracking-wider">{c.label}</CardDescription>
                    <div className={`h-9 w-9 rounded-lg ${c.bg} flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${c.accent}`} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between">
                    <div className="text-4xl font-bold tracking-tight">{c.value}</div>
                    <div className={`h-1 w-12 rounded-full bg-gradient-to-r ${c.color} opacity-80 group-hover:w-20 transition-all`} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">{c.disabled ? 'Coming soon' : 'Click to view'}</div>
                </CardContent>
              </Card>
            </button>
          )
        })}
      </div>
      )}

      {/* Urgent items panel */}
      {show('urgent_list') && (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Urgent Items</CardTitle>
              <CardDescription>Products that are expired or expiring within 7 days</CardDescription>
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

export function ExpiryAlertBanner({ stats, goToInventory }) {
  // Respect the per-device notification mode (Settings → Notifications):
  // 'mute' hides the in-app expiry alert banner entirely.
  const [muted, setMuted] = useState(false)
  useEffect(() => {
    try { setMuted(localStorage.getItem('sw_notify_mode') === 'mute') } catch {}
  }, [])
  if (muted) return null
  if (!stats.expired && !stats.expiring) return null
  const messages = []
  if (stats.expired > 0) messages.push({ key: 'Expired', text: `${stats.expired} item${stats.expired !== 1 ? 's' : ''} already expired`, color: 'bg-red-50 border-red-200 text-red-800', dot: 'bg-red-500' })
  if (stats.expiring > 0) messages.push({ key: 'Expiring', text: `${stats.expiring} item${stats.expiring !== 1 ? 's' : ''} expiring within 7 days`, color: 'bg-amber-50 border-amber-200 text-amber-800', dot: 'bg-amber-500' })
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

