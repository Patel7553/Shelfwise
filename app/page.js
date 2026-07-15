'use client'

import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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

// `fetch` inside this file transparently uses `apiFetch` (auth token attached).
const fetch = apiFetch

// ---- Refactored (June 2025): views/dialogs now live in /components/shelfwise/ ----
import { STATUS_META, EMPTY_FORM, ALLERGENS, CURRENCY_SYMBOL, guessShelfLifeDays, dateInDays, suggestExpiryDate, escapeText } from '@/components/shelfwise/shared'
import { ReceiptScanDialog, ExpiryScanDialog, BarcodeScanDialog, LensCameraView } from '@/components/shelfwise/scanners'
import { PrintLogbookDialog } from '@/components/shelfwise/logbook-print'
import { DashboardView, UseTodayPanel, RecentItemsToday, ExpiryAlertBanner, UrgentList } from '@/components/shelfwise/dashboard'
import { RecipeResult, RecipesView, WebRecipeCard, ViewRecipeDialog, RecipeGenDialog } from '@/components/shelfwise/recipes'
import { InventoryView, DisposeProductDialog } from '@/components/shelfwise/inventory'
import { SetupWizardV2, SetupWizard, ChefCodeCard, SettingsDialog, LoginGate, NotificationSettingsCard } from '@/components/shelfwise/settings-auth'
import { RotaView, RotaShiftDialog } from '@/components/shelfwise/rota'
import { AnalyticsView } from '@/components/shelfwise/analytics'
import { OrdersView } from '@/components/shelfwise/orders'
import { QuickCheckDialog, TempLogbookView, HaccpView } from '@/components/shelfwise/haccp'

function getInitialFromURL() {
  // Always return defaults during SSR and initial render to avoid hydration mismatch.
  // The URL is read in a useEffect after mount.
  return { view: 'dashboard', status: 'All' }
}

// ============================================================================
// Theme — currently disabled by user request (light mode only).
// Kept as no-op stubs so we can turn it back on later without touching JSX.
// ============================================================================
function useTheme() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    // Ensure any previous dark preference is cleared
    document.documentElement.classList.remove('dark')
    try { localStorage.removeItem('sw_theme') } catch {}
  }, [])
  return { theme: 'light', setTheme: () => {} }
}

function ThemeToggle() { return null }

// ============================================================================
// ShelfSelect — Location/Shelf dropdown (user request, round 3).
// • Options = the kitchen's saved shelf list (settings.locations) + any
//   distinct location names already on products.
// • "➕ Add new shelf…" lets the user add AS MANY shelves as they want —
//   each is saved to the kitchen via POST /api/shelves so the whole team
//   sees it in every dropdown from then on.
// ============================================================================
function ShelfSelect({ value, onChange, shelves, products, onAddShelf, onRemoveShelf, triggerClassName }) {
  const [adding, setAdding] = useState(false)
  const [managing, setManaging] = useState(false)   // delete-shelves panel
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [removingName, setRemovingName] = useState('')

  const opts = useMemo(() => {
    // Only the kitchen's SAVED shelf list (plus the current value so an old
    // product's location stays selectable). Product-derived options removed —
    // they caused duplicates like "Dry store"/"Dry Store" and couldn't be deleted.
    const set = new Set()
    ;(shelves || []).forEach(s => { const n = String(s || '').trim(); if (n) set.add(n) })
    const v = String(value || '').trim()
    if (v) set.add(v)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [shelves, value])

  const savedShelves = useMemo(
    () => (shelves || []).map(s => String(s || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [shelves]
  )

  const confirmAdd = async () => {
    const n = newName.trim().slice(0, 60)
    if (!n) return
    setSaving(true)
    try {
      await onAddShelf(n)         // persist to kitchen list (best-effort)
    } catch { /* still use the name locally */ }
    onChange(n)                   // select it right away
    setNewName('')
    setAdding(false)
    setSaving(false)
  }

  const removeShelf = async (name) => {
    setRemovingName(name)
    try {
      await onRemoveShelf(name)
      if (value === name) onChange('')
    } catch { /* toast shown by handler */ }
    setRemovingName('')
  }

  return (
    <div className="space-y-1.5">
      <Select
        value={value && opts.includes(value) ? value : '__none__'}
        onValueChange={v => {
          if (v === '__add__') { setAdding(true); setManaging(false) }
          else if (v === '__manage__') { setManaging(m => !m); setAdding(false) }
          else if (v === '__none__') onChange('')
          else { setAdding(false); onChange(v) }
        }}
      >
        <SelectTrigger className={triggerClassName}><SelectValue placeholder="Select shelf…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {opts.map(o => <SelectItem key={o} value={o}>📍 {o}</SelectItem>)}
          <SelectItem value="__add__">➕ Add new shelf…</SelectItem>
          {savedShelves.length > 0 && onRemoveShelf && (
            <SelectItem value="__manage__">🗑️ Remove a shelf…</SelectItem>
          )}
        </SelectContent>
      </Select>
      {adding && (
        <div className="flex gap-1.5">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="New shelf name… e.g. Shelf A1"
            autoFocus
            className={triggerClassName}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmAdd() } }}
          />
          <Button type="button" size="sm" onClick={confirmAdd} disabled={saving || !newName.trim()} className="bg-emerald-600 hover:bg-emerald-700 shrink-0 h-9">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-3.5 w-3.5 mr-1" /> Add</>}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName('') }} className="shrink-0 h-9 px-2">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      {managing && (
        <div className="rounded-lg border bg-slate-50 p-2 space-y-1">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Tap 🗑️ to remove a shelf</p>
            <button type="button" onClick={() => setManaging(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
          {savedShelves.map(s => (
            <div key={s} className="flex items-center justify-between bg-white rounded-md border px-2.5 py-1.5">
              <span className="text-sm">📍 {s}</span>
              <button
                type="button"
                onClick={() => removeShelf(s)}
                disabled={removingName === s}
                className="text-red-500 hover:text-red-700 disabled:opacity-40"
                title={`Remove "${s}"`}
              >
                {removingName === s ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          ))}
          {savedShelves.length === 0 && <p className="text-xs text-muted-foreground px-1">No saved shelves.</p>}
          <p className="text-[10px] text-muted-foreground px-1">Removing a shelf doesn't change products already stored on it.</p>
        </div>
      )}
    </div>
  )
}

function App() {
  const T = useT()  // language-aware translator — re-renders whole app when user changes language
  // Deploy version marker — helps us verify a deploy actually shipped. Change this string each release.
  const BUILD_VERSION = 'v19-sensor-integration-2026-07-12'
  useEffect(() => { try { console.log('%cShelfWise build:', 'color:#059669;font-weight:700', BUILD_VERSION) } catch (_) {} }, [])
  // Register the service worker (Web Push + PWA). Safe no-op if unsupported.
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  const { theme, setTheme } = useTheme()
  const [initial] = useState(getInitialFromURL)
  const [view, setView] = useState(initial.view) // dashboard | inventory | recipes
  const [products, setProducts] = useState([])
  const [stats, setStats] = useState({ total: 0, expiring: 0, expired: 0, critical: 0 })
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState(initial.status)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('asc')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [storageFilter, setStorageFilter] = useState('All')
  const [facets, setFacets] = useState({ categories: [], storages: [] })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  // AI Scan state
  const [scanOpen, setScanOpen] = useState(false)
  const [scanImage, setScanImage] = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanItems, setScanItems] = useState([])
  const [scanSaving, setScanSaving] = useState(false)

  // Quick Snap Label state (single product)
  const [snapOpen, setSnapOpen] = useState(false)
  const [snapImage, setSnapImage] = useState(null)
  const [snapLoading, setSnapLoading] = useState(false)
  const [snapItem, setSnapItem] = useState(null)
  const [snapSaving, setSnapSaving] = useState(false)

  // Barcode Scanner state
  const [barcodeOpen, setBarcodeOpen] = useState(false)
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [barcodeValue, setBarcodeValue] = useState('')

  // Expiry Date Scanner state (live camera, single-tap capture)
  const [expiryScanOpen, setExpiryScanOpen] = useState(false)

  // Print Logbook modal state (in-app so iOS users can close it)
  const [printOpen, setPrintOpen] = useState(false)

  // Dispose (waste log) dialog state
  const [disposeTarget, setDisposeTarget] = useState(null)  // product being disposed
  const openDispose = (product) => setDisposeTarget(product)

  // Receipt scanner state (delivery notes, invoices, shop receipts → AI parse → import)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const openReceipt = () => setReceiptOpen(true)

  // Voice Input state
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [voiceListening, setVoiceListening] = useState(false)
  const [voiceParsing, setVoiceParsing] = useState(false)
  const [voiceItems, setVoiceItems] = useState([])
  const voiceRecognitionRef = useRef(null)

  // Recipe Scan state
  const [recipeOpen, setRecipeOpen] = useState(false)
  const [recipeMode, setRecipeMode] = useState('text')
  const [recipeText, setRecipeText] = useState('')
  const [recipeImages, setRecipeImages] = useState([])
  const [recipeLoading, setRecipeLoading] = useState(false)
  const [recipeResult, setRecipeResult] = useState(null)
  const [dupExisting, setDupExisting] = useState(null)   // duplicate-recipe prompt
  const [dupProduct, setDupProduct] = useState(null)      // duplicate-product prompt { item, existing, source }
  const [statsLoading, setStatsLoading] = useState(true)  // show dots instead of 0s on first load
  // AI Recipe Generator (from ingredients) — new feature
  const [recipeGenOpen, setRecipeGenOpen] = useState(false)
  const [recipeGenSeed, setRecipeGenSeed] = useState([])   // pre-fill list of ingredient names
  const [recipeSaving, setRecipeSaving] = useState(false)

  // Saved Recipes state
  const [savedRecipes, setSavedRecipes] = useState([])
  const [recipesSearch, setRecipesSearch] = useState('')
  const [viewRecipe, setViewRecipe] = useState(null)

  // Settings & wizard
  const [settings, setSettings] = useState({ kitchenName: '', kitchenType: '', customFields: [], onboarded: true, inviteCode: '', alertEmail: '', tagline: 'From shelf to plate — never lose track.' })
  const [wizardOpen, setWizardOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [authed, setAuthed] = useState(null) // null = checking, true/false
  const [me, setMe] = useState(null)         // { role, isAdmin, userEmail, kitchen }
  const [mobileNav, setMobileNav] = useState(false)
  const [namePromptOpen, setNamePromptOpen] = useState(false)   // "add your name" popup for existing users
  const [namePromptValue, setNamePromptValue] = useState('')
  const [namePromptBusy, setNamePromptBusy] = useState(false)
  const router = useRouter()

  // Check auth on mount by calling /api/auth/me
  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.status === 401) {
          if (!cancelled) { setAuthed(false); router.replace('/login') }
          return
        }
        const data = await res.json()
        if (cancelled) return
        setMe(data)
        setAuthed(true)
        // Existing code-login users from before the names feature: ask for their name once.
        if (data?.role === 'chef') {
          try { if (!localStorage.getItem('sw_person_name')) setNamePromptOpen(true) } catch {}
        }
        // If owner kitchen not approved, show waiting screen (handled below in render)
      } catch {
        if (!cancelled) { setAuthed(false); router.replace('/login') }
      }
    })()
    return () => { cancelled = true }
  }, [router])

  // STAFF RESTRICTIONS — code logins are 'staff' unless the owner grants access:
  // "Full access" or granular perms (orders/waste/logbook/settings) chosen in
  // Settings → Staff. Owner always has everything.
  const isStaff = me?.role === 'chef' && me?.personRole !== 'manager'
  const can = (perm) => {
    if (me?.role !== 'chef') return true                       // owner / admin
    if (me?.personRole === 'manager') return true              // full access
    return (me?.personPerms || []).includes(perm)              // granular
  }

  // Register the person's name after login (popup for users who logged in
  // before the names feature existed).
  const submitNamePrompt = async (claim = false) => {
    const n = namePromptValue.trim()
    if (!n) { toast.error('Please enter your name'); return }
    setNamePromptBusy(true)
    try {
      let deviceId = ''
      try {
        deviceId = localStorage.getItem('sw_device_id') || ''
        if (!deviceId) {
          deviceId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
          localStorage.setItem('sw_device_id', deviceId)
        }
      } catch {}
      const res = await fetch('/api/staff/register-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, deviceId, ...(claim ? { claimName: true } : {}) })
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.nameConflict) {
        const itsMe = window.confirm(`The name "${n}" is already used on another device in this kitchen.\n\nIs this YOU on a new phone/browser?\n\nOK = yes, move my name to this device\nCancel = no, I'll pick a different name`)
        if (itsMe) { setNamePromptBusy(false); return submitNamePrompt(true) }
        return
      }
      if (!res.ok) throw new Error(data.error || '')
      try { localStorage.setItem('sw_person_name', n) } catch {}
      setNamePromptOpen(false)
      toast.success(`Thanks, ${n}! Your name will show on everything you add.`)
    } catch (e) {
      toast.error(e.message || 'Could not save your name')
    } finally {
      setNamePromptBusy(false)
    }
  }

  const fetchProducts = async (opts = {}) => {
    if (!opts.silent) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter && statusFilter !== 'All') params.set('status', statusFilter)
      if (categoryFilter && categoryFilter !== 'All') params.set('category', categoryFilter)
      if (storageFilter && storageFilter !== 'All') params.set('storage', storageFilter)
      if (search) params.set('search', search)
      if (sort) params.set('sort', sort)
      const res = await fetch(`/api/products?${params.toString()}`)
      const data = await res.json()
      setProducts(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error('Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }

  const fetchFacets = async () => {
    try {
      const res = await fetch('/api/facets')
      const data = await res.json()
      setFacets({ categories: data.categories || [], storages: data.storages || [] })
    } catch {}
  }

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) return
      const data = await res.json()
      setSettings(data)
    } catch {}
  }

  const saveSettings = async (next) => {
    // GLOBAL SAFEGUARD: never allow a save that would CLEAR a kitchen name that's already set.
    // If the payload contains kitchenName that's empty/whitespace AND we already have one saved,
    // drop that field before sending. This is a belt-and-braces guard on top of the per-caller checks.
    const guarded = { ...(next || {}) }
    if ('kitchenName' in guarded) {
      const kn = String(guarded.kitchenName || '').trim()
      if (!kn && (settings.kitchenName || '').trim()) {
        // eslint-disable-next-line no-console
        console.warn('[saveSettings] Dropped empty kitchenName to protect existing value:', settings.kitchenName)
        delete guarded.kitchenName
      } else if (kn) {
        guarded.kitchenName = kn
      }
    }
    // Same defence for kitchenType
    if ('kitchenType' in guarded) {
      const kt = String(guarded.kitchenType || '').trim()
      if (!kt && (settings.kitchenType || '').trim()) {
        // eslint-disable-next-line no-console
        console.warn('[saveSettings] Dropped empty kitchenType to protect existing value')
        delete guarded.kitchenType
      }
    }
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guarded)
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Failed to save settings')
        return
      }
      setSettings(data)
      if (data._warning) {
        // Surface partial-save warnings prominently (e.g., migration-12 missing)
        toast.error(data._warning, { duration: 8000 })
      } else {
        toast.success('Settings saved')
      }
      return data
    } catch {
      toast.error('Failed to save settings')
    }
  }

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats')
      const data = await res.json()
      setStats(data)
    } catch {} finally {
      setStatsLoading(false)
    }
  }

  // DATA LOADING — gated on `authed` so requests never fire before login is
  // verified (they used to 401 silently and the dashboard stayed at 0 until
  // the user navigated somewhere).
  useEffect(() => { if (authed) fetchProducts() }, [authed, statusFilter, search, sort, categoryFilter, storageFilter])
  useEffect(() => { if (authed) { fetchStats(); fetchFacets() } }, [authed, products.length, view])
  // Global refresh trigger — any child component can dispatch this event to force a full reload
  useEffect(() => {
    const onRefresh = () => { fetchProducts(); fetchStats(); fetchFacets() }
    window.addEventListener('shelfwise-inventory-refresh', onRefresh)
    return () => window.removeEventListener('shelfwise-inventory-refresh', onRefresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search, sort, categoryFilter, storageFilter])
  useEffect(() => { if (authed) fetchSettings() }, [authed])
  // LIVE SYNC — items added on other phones show up fast:
  // refresh whenever the app regains focus/visibility + silent poll every 30s.
  useEffect(() => {
    if (!authed) return
    const refresh = () => { fetchProducts({ silent: true }); fetchStats() }
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVis)
    const iv = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 30000)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVis)
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, statusFilter, search, sort, categoryFilter, storageFilter])
  // Recipes: fetch once at login (so the dashboard Recipes count is correct),
  // then again whenever the Recipes tab is opened/searched.
  useEffect(() => { if (authed) fetchRecipes() }, [authed])

  // PUSH HEARTBEAT — while anyone uses the app, ping the backend so expiry
  // push alerts repeat every 2.5h until items are dealt with (backend
  // throttles; calling often is safe). Runs on login + every 30 min.
  useEffect(() => {
    if (!authed) return
    const ping = () => { fetch('/api/push/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}) }
    ping()
    const t = setInterval(ping, 30 * 60 * 1000)
    return () => clearInterval(t)
  }, [authed])
  useEffect(() => { if (authed && view === 'recipes') fetchRecipes() }, [authed, view, recipesSearch])

  // Browser expiry notifications — fires once per day when app is opened.
  // Requires user to opt-in via Settings → Login & Alerts → Enable notifications.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return
    if (localStorage.getItem('sw_notifications_enabled') !== '1') return
    if (Notification.permission !== 'granted') return
    if (!products || !products.length) return

    const todayKey = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem('sw_last_notify') === todayKey) return

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const in3 = new Date(today.getTime() + 3 * 86400000)
    const urgent = products.filter(p => {
      if (!p.expiryDate) return false
      const d = new Date(p.expiryDate)
      return d <= in3
    })
    if (!urgent.length) return

    try {
      const expired = urgent.filter(p => new Date(p.expiryDate) < today)
      const expiring = urgent.filter(p => new Date(p.expiryDate) >= today)
      const parts = []
      if (expired.length) parts.push(`${expired.length} expired`)
      if (expiring.length) parts.push(`${expiring.length} expiring in 3 days`)
      new Notification('🍳 ShelfWise expiry alert', {
        body: `${parts.join(' · ')} — tap to review inventory.`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'shelfwise-daily',
      })
      localStorage.setItem('sw_last_notify', todayKey)
    } catch (e) { /* ignore */ }
  }, [products])

  // Read URL params on client mount (avoids SSR hydration mismatch)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const s = params.get('status')
    const v = params.get('view')
    const validStatus = s && ['Expired', 'Expiring', 'Critical', 'Ok', 'All'].includes(s) ? s : null
    if (validStatus) setStatusFilter(validStatus)
    if (v === 'inventory' || v === 'recipes') setView(v)
    else if (validStatus && validStatus !== 'All') setView('inventory')
  }, [])

  const fetchRecipes = async () => {
    try {
      const params = new URLSearchParams()
      if (recipesSearch) params.set('search', recipesSearch)
      const res = await fetch(`/api/recipes?${params.toString()}`)
      const data = await res.json()
      setSavedRecipes(Array.isArray(data) ? data : [])
    } catch {}
  }

  const saveCurrentRecipe = async (replaceId) => {
    if (!recipeResult) return
    const rid = typeof replaceId === 'string' ? replaceId : null   // guard: onClick passes an event object
    setRecipeSaving(true)
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rid ? { ...recipeResult, replaceId: rid } : recipeResult)
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.existing) {
        // Same recipe already saved — ask what to do instead of adding twice
        setDupExisting(data.existing)
        return
      }
      if (!res.ok) throw new Error(data.error || '')
      toast.success(rid ? 'Old recipe replaced' : 'Recipe saved')
      // Auto-close everything and refresh the list instantly
      setDupExisting(null)
      setRecipeOpen(false)
      setRecipeResult(null)
      fetchRecipes()
    } catch (e) {
      toast.error(e?.message ? `Failed to save recipe — ${e.message}` : 'Failed to save recipe')
    } finally {
      setRecipeSaving(false)
    }
  }

  const openExistingRecipe = async (id) => {
    try {
      const res = await fetch(`/api/recipes/${id}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not open recipe')
      setDupExisting(null)
      setRecipeOpen(false)
      setRecipeResult(null)
      setView('recipes')
      setViewRecipe(data)
    } catch (e) {
      toast.error(e.message || 'Could not open recipe')
    }
  }

  const deleteRecipe = async (id) => {
    try {
      const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Recipe deleted')
      fetchRecipes()
    } catch {
      toast.error('Failed to delete recipe')
    }
  }

  // Name of the person using this phone (set at code login) — stamped on items they add
  const getPersonName = () => { try { return localStorage.getItem('sw_person_name') || '' } catch { return '' } }

  // Find an inventory product with the same name (case-insensitive)
  const findByName = (name) => {
    const n = String(name || '').trim().toLowerCase()
    if (!n) return null
    return products.find(p => String(p.name || '').trim().toLowerCase() === n) || null
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, dateReceived: new Date().toISOString().slice(0, 10), preparedBy: getPersonName() })
    setDialogOpen(true)
  }

  // Duplicate product → user chose "add to old quantity": update the existing
  // item (full body — partial PUTs would wipe other fields via toDb defaults).
  const mergeDupIntoExisting = async () => {
    if (!dupProduct) return
    const { item, existing, source } = dupProduct
    const newQty = (Number(existing.quantity) || 0) + (Number(item.quantity) || 0)
    try {
      const res = await fetch(`/api/products/${existing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: existing.name,
          quantity: newQty,
          unit: existing.unit || 'ea',
          expiryDate: item.expiryDate || existing.expiryDate || '',
          category: existing.category || '',
          storageType: existing.storageType || 'Fridge',
          location: existing.location || '',
          preparedBy: existing.preparedBy || '',
          imageUrl: existing.imageUrl || '',
          dateReceived: existing.dateReceived || '',
          customFields: existing.customFields || {},
        })
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Update failed (${res.status})`)
      }
      toast.success(`${existing.name} — quantity updated to ${newQty} ${existing.unit || ''}`)
      setDupProduct(null)
      if (source === 'snap') { setSnapOpen(false); setSnapImage(null); setSnapItem(null) }
      else { setDialogOpen(false) }
      fetchProducts()
      fetchStats()
    } catch (e) {
      toast.error(e.message || 'Could not update the old item')
    }
  }

  const openEdit = (p) => {
    setEditing(p)
    setForm({
      name: p.name || '', quantity: p.quantity ?? '', unit: p.unit || 'ea',
      expiryDate: p.expiryDate || '', category: p.category || '',
      storageType: p.storageType || 'Fridge', location: p.location || '',
      preparedBy: p.preparedBy || '', imageUrl: p.imageUrl || '',
      dateReceived: p.dateReceived || p.created_at?.slice(0, 10) || '',
      unitCost: p.unitCost != null ? String(p.unitCost) : '',
      reorderPoint: p.reorderPoint != null ? String(p.reorderPoint) : '',
      supplier: p.supplier || '',
      allergens: Array.isArray(p.allergens) ? p.allergens : [],
      customFields: p.customFields || {}
    })
    setDialogOpen(true)
  }

  const saveProduct = async (force) => {
    const forced = force === true   // guard: onClick passes an event object
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    // Duplicate check — block same-NAME products (only for NEW products, not edits)
    if (!editing && !forced) {
      const existing = findByName(form.name)
      if (existing) {
        setDupProduct({ item: { ...form }, existing, source: 'form' })
        return
      }
    }
    try {
      const method = editing ? 'PUT' : 'POST'
      const url = editing ? `/api/products/${editing.id}` : '/api/products'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (!res.ok) {
        let msg = `Save failed (${res.status})`
        try {
          const errBody = await res.json()
          if (errBody?.error) msg = errBody.error
        } catch {}
        throw new Error(msg)
      }
      toast.success(editing ? 'Product updated' : 'Product added')
      setDialogOpen(false)
      fetchProducts()
      fetchStats()
    } catch (e) {
      toast.error(`Could not save product: ${e.message || 'unknown error'}`, { duration: 10000 })
      console.error('saveProduct error:', e)
    }
  }

  const deleteProduct = async (id) => {
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Product deleted')
      fetchProducts()
      fetchStats()
    } catch {
      toast.error('Delete failed')
    }
  }

  // Dispose = log to waste (unless "Used up") + delete the product row.
  // wasteEntry: { reason, unitCost?, notes? }  (reason: used_up|expired|spoiled|damaged|overstock|other)
  const disposeProduct = async (product, wasteEntry) => {
    if (!product) return
    try {
      // Log waste unless it's "used_up" (consumed normally — not waste)
      if (wasteEntry?.reason && wasteEntry.reason !== 'used_up') {
        await fetch('/api/waste', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: product.id,
            productName: product.name,
            category: product.category || '',
            quantity: Number(product.quantity) || 0,
            unit: product.unit || 'ea',
            unitCost: wasteEntry.unitCost != null && wasteEntry.unitCost !== '' ? Number(wasteEntry.unitCost) : null,
            reason: wasteEntry.reason,
            notes: wasteEntry.notes || '',
          }),
        })
      }
      const res = await fetch(`/api/products/${product.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      const msg = wasteEntry?.reason === 'used_up'
        ? `Marked "${product.name}" as used up ✓`
        : `Disposed "${product.name}" — waste logged 🗑️`
      toast.success(msg)
      fetchProducts()
      fetchStats()
    } catch (e) {
      toast.error(e.message || 'Dispose failed')
    }
  }

  const openScan = () => {
    setScanImage(null)
    setScanItems([])
    setScanOpen(true)
  }

  // Quick Snap Label — single product photo → AI extracts → confirm → save
  const openSnap = () => {
    setSnapImage(null)
    setSnapItem(null)
    setSnapOpen(true)
  }

  // Remove a shelf name from the kitchen's saved list.
  const removeShelf = async (name) => {
    const res = await fetch('/api/shelves', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.error || 'Could not remove shelf')
      throw new Error(data.error || 'remove failed')
    }
    setSettings(prev => ({ ...prev, locations: data.locations || (prev.locations || []).filter(s => s !== name) }))
    toast.success(`Shelf "${name}" removed`)
  }

  // Add a shelf name to the kitchen's saved list (shared by all shelf dropdowns).
  const addShelf = async (name) => {
    const res = await fetch('/api/shelves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.warning('Shelf used, but could not be saved to the kitchen list.')
      throw new Error(data.error || 'save failed')
    }
    setSettings(prev => ({ ...prev, locations: data.locations || [...(prev.locations || []), name] }))
    toast.success(`Shelf "${name}" added ✅`)
  }

  // Open Barcode scanner
  // Open AI Recipe Generator — optionally pre-filled from expiring items
  const openRecipeGen = (seed = []) => {
    setRecipeGenSeed(Array.isArray(seed) ? seed : [])
    setRecipeGenOpen(true)
  }
  const openRecipeGenFromExpiring = () => {
    const today = new Date(); today.setHours(0,0,0,0)
    const soon = new Date(today); soon.setDate(soon.getDate() + 3)
    const seed = (products || [])
      .filter(p => p.expiryDate && new Date(p.expiryDate) <= soon && new Date(p.expiryDate) >= new Date(today.getTime() - 86400000))
      .map(p => p.name)
      .filter(Boolean)
      .slice(0, 15)
    if (!seed.length) {
      toast.info('Nothing expiring in the next 3 days — pick ingredients manually.')
    }
    openRecipeGen(seed)
  }


  const openBarcode = () => {
    setBarcodeValue('')
    setBarcodeOpen(true)
  }

  // Open Voice command dialog
  const openVoice = () => {
    setVoiceTranscript('')
    setVoiceItems([])
    setVoiceListening(false)
    setVoiceParsing(false)
    setVoiceOpen(true)
  }

  // Start/stop voice recognition (Web Speech API)
  const startVoiceListening = () => {
    if (typeof window === 'undefined') return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      toast.error('Voice not supported on this browser. Try Chrome or Safari on iOS 14.5+.')
      return
    }
    try {
      const rec = new SR()
      rec.lang = navigator.language || 'en-US'
      rec.interimResults = true
      rec.continuous = false
      rec.maxAlternatives = 1
      let finalText = ''
      rec.onresult = (e) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) finalText += r[0].transcript + ' '
          else interim += r[0].transcript
        }
        setVoiceTranscript((finalText + interim).trim())
      }
      rec.onerror = (e) => {
        setVoiceListening(false)
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          toast.error('Microphone blocked. Allow microphone permission in browser settings.')
        } else if (e.error === 'no-speech') {
          toast.warning('No speech detected. Try again.')
        }
      }
      rec.onend = () => setVoiceListening(false)
      voiceRecognitionRef.current = rec
      setVoiceTranscript('')
      setVoiceListening(true)
      rec.start()
    } catch (e) {
      toast.error('Could not start voice recognition.')
      setVoiceListening(false)
    }
  }

  const stopVoiceListening = () => {
    try { voiceRecognitionRef.current?.stop() } catch {}
    try { voiceRecognitionRef.current?.abort() } catch {}
    setVoiceListening(false)
  }

  // Emergency: hard-reset everything if the voice dialog gets stuck.
  const forceCloseVoice = () => {
    try { voiceRecognitionRef.current?.abort() } catch {}
    try { voiceRecognitionRef.current?.stop() } catch {}
    voiceRecognitionRef.current = null
    setVoiceListening(false)
    setVoiceParsing(false)
    setVoiceTranscript('')
    setVoiceItems([])
    setVoiceOpen(false)
  }

  const parseVoiceCommand = async () => {
    const text = voiceTranscript.trim()
    if (!text) { toast.error('Speak first, then tap parse.'); return }
    setVoiceParsing(true)
    try {
      const res = await fetch('/api/parse-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Parse failed')
      if (!data.items?.length) {
        toast.warning('Could not extract any items. Try rephrasing.')
        return
      }
      setVoiceItems((data.items || []).map(it => ({
        name: it.name || '',
        quantity: Number(it.quantity) || 1,
        unit: it.unit || 'ea',
        expiryDate: it.expiryDate || '',
        category: it.category || '',
        storageType: it.storageType || 'Fridge',
        location: it.location || '',
        _keep: true,
        _expanded: false,
      })))
      toast.success(`Detected ${data.items.length} item${data.items.length !== 1 ? 's' : ''} — review, edit, then save`)
    } catch (e) {
      toast.error(e.message || 'Could not parse speech')
    } finally {
      setVoiceParsing(false)
    }
  }

  const saveVoiceItems = async () => {
    const toSave = voiceItems.filter(i => i._keep && i.name?.trim())
    if (!toSave.length) { toast.error('Nothing selected to save'); return }
    // Duplicate check — same rules as scan-logbook
    const dupes = findDuplicatesAgainstInventory(toSave, products)
    if (dupes.length > 0) {
      const preview = dupes.slice(0, 5).map(d => `• ${d.newItem.name} (${d.newItem.quantity} ${d.newItem.unit}, exp ${d.newItem.expiryDate || '—'})`).join('\n')
      const more = dupes.length > 5 ? `\n…and ${dupes.length - 5} more` : ''
      const ok = window.confirm(
        `⚠️ ${dupes.length} of ${toSave.length} item${dupes.length !== 1 ? 's' : ''} look like duplicates already in inventory:\n\n${preview}${more}\n\nAdd them anyway?\n\n[OK] = Add all\n[Cancel] = Stop and let me uncheck them first`
      )
      if (!ok) return
    }
    setVoiceParsing(true)
    try {
      for (const item of toSave) {
        const { _keep, _expanded, ...clean } = item
        await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clean),
        })
      }
      toast.success(`Added ${toSave.length} item${toSave.length !== 1 ? 's' : ''} from voice ✅`)
      setVoiceOpen(false)
      fetchProducts()
      fetchStats()
    } catch (e) {
      toast.error('Failed to save items')
    } finally {
      setVoiceParsing(false)
    }
  }

  // Voice: helpers for editing individual detected items
  const updateVoiceItem = (idx, patch) => setVoiceItems(items => items.map((it, i) => i === idx ? { ...it, ...patch } : it))
  const removeVoiceItem = (idx) => setVoiceItems(items => items.filter((_, i) => i !== idx))

  // Print a logbook template (chefs fill it on shift, then scan with AI later)
  // Open the in-app Print Logbook modal (iOS-safe — no window.open, so users can just tap Close)
  const printLogbook = () => {
    setPrintOpen(true)
  }

  // Lookup barcode from multiple databases + user's own history
  const onBarcodeFound = async (code) => {
    setBarcodeValue(code)
    setBarcodeLoading(true)
    try {
      // IMPORTANT: barcode must live in customFields (top-level `barcode` is dropped by the API).
      // This is what makes the scanner "learn" — future scans of the same code will find it in history.
      let detected = {
        name: '',
        quantity: 1,
        unit: 'ea',
        expiryDate: '',
        category: '',
        storageType: 'Fridge',
        location: '',
        customFields: { barcode: code },
      }
      let found = false

      // 1) Check user's OWN inventory — if they've scanned this barcode before, prefill from their history
      try {
        const ownRes = await fetch(`/api/products?search=${encodeURIComponent(code)}`)
        if (ownRes.ok) {
          const own = await ownRes.json()
          const match = Array.isArray(own) ? own.find(p => p.customFields?.barcode === code) : null
          if (match) {
            detected.name = match.name
            detected.category = match.category || ''
            detected.unit = match.unit || 'ea'
            detected.storageType = match.storageType || 'Fridge'
            detected.location = match.location || ''
            detected.expiryDate = ''
            // Preserve prior custom fields (barcode + any user-added metadata)
            detected.customFields = { ...(match.customFields || {}), barcode: code }
            toast.success(`Found in your history: ${match.name}. Please enter fresh expiry date.`)
            found = true
          }
        }
      } catch {}

      // 2) Try Open Food Facts (2.8M products - free, public)
      if (!found) {
        try {
          const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`)
          const data = await res.json()
          if (data?.status === 1 && data?.product) {
            const p = data.product
            const nm = p.product_name || p.product_name_en || p.generic_name || p.abbreviated_product_name || ''
            if (nm.trim()) {  // Only accept if we actually got a name — otherwise fall through to AI
              detected.name = nm
              detected.category = (p.categories || '').split(',')[0]?.trim() || ''
              if (p.quantity) {
                const m = String(p.quantity).match(/([\d.]+)\s*(kg|g|L|ml|mL|cl)/i)
                if (m) {
                  detected.quantity = Number(m[1])
                  const u = m[2].toLowerCase()
                  detected.unit = u === 'ml' ? 'mL' : (u === 'l' ? 'L' : u)
                }
              }
              const cat = detected.category.toLowerCase()
              if (cat.includes('frozen')) detected.storageType = 'Freezer'
              else if (cat.includes('dry') || cat.includes('snack') || cat.includes('cereal') || cat.includes('pasta') || cat.includes('rice')) detected.storageType = 'Dry'
              else if (cat.includes('beverage') || cat.includes('drink')) detected.storageType = 'Ambient'
              detected.expiryDate = ''
              toast.success(`Found: ${detected.name}. Please enter the expiry date from the package.`)
              found = true
            }
          }
        } catch {}
      }

      // 2b) Try Open Products Facts — same team as OFF but for non-food packaged goods
      // (bakery, snacks, cleaning, general household). Often catches things OFF misses.
      if (!found) {
        try {
          const res = await fetch(`https://world.openproductsfacts.org/api/v0/product/${encodeURIComponent(code)}.json`)
          const data = await res.json()
          if (data?.status === 1 && data?.product) {
            const p = data.product
            const nm = p.product_name || p.product_name_en || p.generic_name || ''
            if (nm.trim()) {
              detected.name = nm
              detected.category = (p.categories || '').split(',')[0]?.trim() || ''
              if (p.quantity) {
                const m = String(p.quantity).match(/([\d.]+)\s*(kg|g|L|ml|mL|cl)/i)
                if (m) {
                  detected.quantity = Number(m[1])
                  const u = m[2].toLowerCase()
                  detected.unit = u === 'ml' ? 'mL' : (u === 'l' ? 'L' : u)
                }
              }
              detected.storageType = 'Ambient'
              toast.success(`Found: ${detected.name}. Please enter the expiry date from the package.`)
              found = true
            }
          }
        } catch {}
      }

      // 3) Try UPCitemdb (free tier — global product database, retail/US products)
      if (!found) {
        try {
          const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`)
          if (res.ok) {
            const data = await res.json()
            const item = data?.items?.[0]
            if (item?.title && item.title.trim()) {
              detected.name = item.title
              detected.category = item.category || ''
              detected.expiryDate = ''
              toast.success(`Found: ${item.title}. Please enter the expiry date from the package.`)
              found = true
            }
          }
        } catch {}
      }

      // 4) Try Open Beauty Facts (for cosmetics/cleaning products)
      if (!found) {
        try {
          const res = await fetch(`https://world.openbeautyfacts.org/api/v0/product/${encodeURIComponent(code)}.json`)
          const data = await res.json()
          if (data?.status === 1 && data?.product?.product_name && data.product.product_name.trim()) {
            detected.name = data.product.product_name
            detected.category = 'Cleaning/Beauty'
            detected.expiryDate = ''
            toast.success(`Found: ${data.product.product_name}. Please enter the expiry date.`)
            found = true
          }
        } catch {}
      }

      // 5) Try our server-side commercial barcode lookup (Barcode Lookup API + Go-UPC).
      // These are the paid DBs with strong UK own-brand coverage (Tesco, Sainsbury's).
      // Only fires if the owner has configured BARCODELOOKUP_API_KEY or GO_UPC_API_KEY
      // in Vercel env vars. Otherwise skips silently.
      if (!found) {
        try {
          const res = await fetch(`/api/barcode-lookup?code=${encodeURIComponent(code)}`)
          if (res.ok) {
            const data = await res.json()
            if (data?.found && data.name) {
              detected.name = data.name
              detected.category = data.category || (data.brand ? data.brand : '')
              detected.storageType = data.storageType || 'Ambient'
              detected.customFields = { ...detected.customFields, barcode: code, brand: data.brand || '' }
              detected.expiryDate = ''
              toast.success(`Found (${data.source}): ${data.name}. Please enter the expiry date.`)
              found = true
            }
          }
        } catch {}
      }

      if (!found) {
        // AI Vision fallback: prompt user to snap the front of the pack
        toast.info("Not in public databases — let's identify by photo instead 📸", { duration: 4000 })
        setBarcodeOpen(false)
        setAiFallback({ barcode: code })
        return
      }

      setBarcodeOpen(false)
      setSnapItem(detected)
      setSnapImage(null)
      setSnapOpen(true)
    } finally {
      setBarcodeLoading(false)
    }
  }

  // AI-vision fallback for the barcode scanner — user snaps front of pack.
  const [aiFallback, setAiFallback] = useState(null)   // { barcode }
  const [aiBusy, setAiBusy] = useState(false)
  const handleAiFallbackPhoto = async (file) => {
    if (!file) return
    setAiBusy(true)
    try {
      const dataUrl = await resizeImage(file)
      const res = await fetch('/api/identify-product', {
        method: 'POST',
        body: JSON.stringify({ image: dataUrl, barcode: aiFallback?.barcode || '' }),
      })
      if (!res.ok) throw new Error('AI identification failed')
      const p = await res.json()
      if (!p?.name) throw new Error('Could not identify — please fill manually')
      const detected = {
        name: p.name,
        quantity: p.quantity || 1,
        unit: p.unit || 'ea',
        category: p.category || '',
        storageType: p.storageType || 'Ambient',
        expiryDate: '',
        location: '',
        customFields: { barcode: aiFallback?.barcode || '', brand: p.brand || '' },
      }
      toast.success(`AI found: ${p.name} (${p.confidence} confidence). Please add expiry date.`)
      setAiFallback(null)
      setSnapItem(detected)
      setSnapImage(dataUrl)
      setSnapOpen(true)
    } catch (e) {
      toast.error(e.message || 'Could not identify from photo')
    } finally {
      setAiBusy(false)
    }
  }

  const resizeImage = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const maxDim = 1400
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  // Shared AI label-scan logic — used by the live Lens camera (auto-capture)
  // AND the gallery upload. On failure/no-detect the frozen frame is cleared
  // so the live camera re-arms for another automatic attempt.
  const runSnapScan = async (dataUrl) => {
    setSnapImage(dataUrl)
    setSnapLoading(true)
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      const first = (data.items || [])[0]
      if (!first) {
        toast.warning('No product detected — hold the camera over the label and it will rescan.')
        setSnapImage(null)  // re-arm live camera for another auto-capture
      } else {
        // No printed date found on the label → default to TODAY (user request).
        // The AI scans whatever date is printed; today is only the fallback.
        if (!first.expiryDate) {
          first.expiryDate = new Date().toISOString().slice(0, 10)
          toast.info('No printed date found — expiry set to today. Change it if needed.')
        }
        if (!first.preparedBy) first.preparedBy = getPersonName()
        setSnapItem(first)
        toast.success(`Detected: ${first.name}`)
      }
    } catch (e) {
      toast.error(e.message || 'Scan failed — trying again is free!')
      setSnapImage(null)  // re-arm live camera
    } finally {
      setSnapLoading(false)
    }
  }

  const onSnapFile = async (file) => {
    if (!file) return
    const dataUrl = await resizeImage(file)
    await runSnapScan(dataUrl)
  }

  const saveSnapItem = async (force) => {
    const forced = force === true   // guard: onClick passes an event object
    if (!snapItem?.name?.trim()) { toast.error('Product name is required'); return }
    // Duplicate check — block same-NAME products
    if (!forced) {
      const existing = findByName(snapItem.name)
      if (existing) {
        setDupProduct({ item: { ...snapItem }, existing, source: 'snap' })
        return
      }
    }
    setSnapSaving(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...snapItem, preparedBy: snapItem.preparedBy || getPersonName() })
      })
      if (!res.ok) {
        let msg = `Save failed (${res.status})`
        try {
          const errBody = await res.json()
          if (errBody?.error) msg = errBody.error
        } catch {}
        throw new Error(msg)
      }
      toast.success(`${snapItem.name} added to inventory`)
      setSnapOpen(false)
      setSnapImage(null)
      setSnapItem(null)
      fetchProducts()
      fetchStats()
    } catch (e) {
      toast.error(`Failed to save product: ${e.message || 'unknown error'}`, { duration: 10000 })
      console.error('saveSnapItem error:', e)
    } finally {
      setSnapSaving(false)
    }
  }

  const onScanFile = async (file) => {
    if (!file) return
    // Resize image to keep base64 small
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const img = new Image()
        img.onload = () => {
          const maxDim = 1400
          let { width, height } = img
          if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height)
            width = Math.round(width * scale)
            height = Math.round(height * scale)
          }
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        }
        img.onerror = reject
        img.src = reader.result
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    setScanImage(dataUrl)
  }

  const runScan = async () => {
    if (!scanImage) {
      toast.error('Please choose an image first')
      return
    }
    setScanLoading(true)
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: scanImage })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      const items = (data.items || []).map(it => ({ ...it, _keep: true }))
      setScanItems(items)
      if (!items.length) toast.warning('No items detected. Try a clearer photo.')
      else toast.success(`Detected ${items.length} item${items.length !== 1 ? 's' : ''}`)
    } catch (e) {
      toast.error(e.message || 'Scan failed')
    } finally {
      setScanLoading(false)
    }
  }

  // -------- DUPLICATE DETECTION --------
  // Given a list of new items about to be saved and the current products in inventory,
  // return an array of {new, existing} matches based on: name + quantity + expiryDate + preparedBy.
  // (Case-insensitive name, trimmed; date compared as YYYY-MM-DD; empty preparedBy matches anything.)
  const findDuplicatesAgainstInventory = (newItems, existingProducts) => {
    const norm = (s) => String(s || '').trim().toLowerCase()
    const dayOnly = (d) => (d || '').toString().slice(0, 10)
    const matches = []
    for (const n of newItems) {
      const found = existingProducts.find(p => {
        if (norm(p.name) !== norm(n.name)) return false
        if (Number(p.quantity) !== Number(n.quantity)) return false
        if (dayOnly(p.expiryDate) !== dayOnly(n.expiryDate)) return false
        // If BOTH have preparedBy set, they must match; otherwise ignore.
        const pInit = norm(p.preparedBy || p.prepared_by)
        const nInit = norm(n.preparedBy)
        if (pInit && nInit && pInit !== nInit) return false
        return true
      })
      if (found) matches.push({ newItem: n, existing: found })
    }
    return matches
  }

  const saveScannedItems = async () => {
    const toAdd = scanItems.filter(it => it._keep).map(({ _keep, ...rest }) => ({ ...rest, preparedBy: rest.preparedBy || getPersonName() }))
    if (!toAdd.length) {
      toast.error('No items selected')
      return
    }
    // Check for duplicates before saving
    const dupes = findDuplicatesAgainstInventory(toAdd, products)
    if (dupes.length > 0) {
      const preview = dupes.slice(0, 5).map(d => `• ${d.newItem.name} (${d.newItem.quantity} ${d.newItem.unit}, exp ${d.newItem.expiryDate || '—'})`).join('\n')
      const more = dupes.length > 5 ? `\n…and ${dupes.length - 5} more` : ''
      const ok = window.confirm(
        `⚠️ ${dupes.length} of ${toAdd.length} item${dupes.length !== 1 ? 's' : ''} look like duplicates already in your inventory:\n\n${preview}${more}\n\n` +
        `They match by name + quantity + expiry (${dupes[0]?.newItem?.preparedBy ? '+ initials' : ''}).\n\n` +
        `Add them anyway?\n\n[OK] = Add all (may create duplicates)\n[Cancel] = Stop and let me uncheck them first`
      )
      if (!ok) return
    }
    setScanSaving(true)
    try {
      const res = await fetch('/api/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: toAdd })
      })
      if (!res.ok) throw new Error()
      toast.success(`Added ${toAdd.length} item${toAdd.length !== 1 ? 's' : ''} to inventory`)
      setScanOpen(false)
      setScanImage(null)
      setScanItems([])
      fetchProducts()
      fetchStats()
    } catch {
      toast.error('Could not save items')
    } finally {
      setScanSaving(false)
    }
  }

  const updateScanItem = (idx, field, value) => {
    setScanItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  // Image upload for product form (resize + base64)
  const onFormImageChange = async (file) => {
    if (!file) return
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const img = new Image()
        img.onload = () => {
          const maxDim = 600
          let { width, height } = img
          if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height)
            width = Math.round(width * scale); height = Math.round(height * scale)
          }
          const canvas = document.createElement('canvas')
          canvas.width = width; canvas.height = height
          canvas.getContext('2d').drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.8))
        }
        img.onerror = reject
        img.src = reader.result
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    setForm(prev => ({ ...prev, imageUrl: dataUrl }))
  }

  // Recipe scan handlers
  const openRecipe = () => {
    setRecipeOpen(true)
    setRecipeResult(null)
    setRecipeImages([])
    setRecipeText('')
    setRecipeMode('text')
  }

  // Multi-page recipes: add one or more photos (max 5 pages per scan)
  const onRecipeImages = async (files) => {
    const list = Array.from(files || []).filter(Boolean)
    if (!list.length) return
    const urls = []
    for (const file of list) {
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const img = new Image()
            img.onload = () => {
              const maxDim = 1400
              let { width, height } = img
              if (width > maxDim || height > maxDim) {
                const scale = Math.min(maxDim / width, maxDim / height)
                width = Math.round(width * scale); height = Math.round(height * scale)
              }
              const canvas = document.createElement('canvas')
              canvas.width = width; canvas.height = height
              canvas.getContext('2d').drawImage(img, 0, 0, width, height)
              resolve(canvas.toDataURL('image/jpeg', 0.85))
            }
            img.onerror = reject
            img.src = reader.result
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        urls.push(dataUrl)
      } catch { /* skip unreadable file */ }
    }
    setRecipeImages(prev => {
      const next = [...prev, ...urls].slice(0, 5)
      if (prev.length + urls.length > 5) toast.info('Maximum 5 pages per recipe scan')
      return next
    })
  }

  const removeRecipePage = (idx) => setRecipeImages(prev => prev.filter((_, i) => i !== idx))

  const runRecipeScan = async () => {
    if (recipeMode === 'text' && !recipeText.trim()) { toast.error('Paste a recipe first'); return }
    if (recipeMode === 'image' && recipeImages.length === 0) { toast.error('Add at least one recipe photo first'); return }
    setRecipeLoading(true)
    try {
      const payload = recipeMode === 'image' ? { images: recipeImages } : { text: recipeText }
      const res = await fetch('/api/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Recipe scan failed')
      setRecipeResult(data)
      toast.success(`Analyzed: ${data.matched?.length || 0} ingredients · ${data.allergens?.length || 0} allergen${(data.allergens?.length || 0) !== 1 ? 's' : ''}`)
    } catch (e) {
      toast.error(e.message || 'Recipe scan failed')
    } finally {
      setRecipeLoading(false)
    }
  }

  const exportCSV = () => {
    if (!products.length) {
      toast.info('Nothing to export')
      return
    }
    const headers = ['Name', 'Quantity', 'Unit', 'Expiry Date', 'Category', 'Storage', 'Location', 'Prepared By', 'Status']
    const rows = products.map(p => [
      p.name, p.quantity, p.unit, p.expiryDate || '', p.category, p.storageType, p.location, p.preparedBy, p._status
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shelfwise-inventory-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }

  const seedData = async () => {
    try {
      const res = await fetch('/api/seed', { method: 'POST' })
      if (!res.ok) throw new Error()
      toast.success('Sample data loaded')
      fetchProducts()
      fetchStats()
    } catch {
      toast.error('Seed failed')
    }
  }

  const goToInventory = (status, searchTerm) => {
    setStatusFilter(status)
    if (typeof searchTerm === 'string') setSearch(searchTerm)
    setView('inventory')
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (status === 'All') url.searchParams.delete('status'); else url.searchParams.set('status', status)
      url.searchParams.set('view', 'inventory')
      window.history.pushState({}, '', url.toString())
    }
  }

  const goToDashboard = () => {
    setView('dashboard')
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('view')
      url.searchParams.delete('status')
      window.history.pushState({}, '', url.toString())
    }
  }

  const formatDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

  // ---- AUTH GATE ----------------------------------------------------------
  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-white">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  }
  if (me && me.role === 'owner' && me.kitchen && me.kitchen.status !== 'approved' && !me.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50 p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardContent className="p-8 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
            <h2 className="font-bold text-lg">Awaiting approval</h2>
            <p className="text-sm text-slate-600">Your kitchen <b>{me.kitchen.kitchenName}</b> is currently <b>{me.kitchen.status}</b>. Please check back after the admin approves your account.</p>
            <Button variant="outline" onClick={async () => { await signOutAll(); router.replace('/login') }}>Sign out</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const modulesEnabled = Array.isArray(settings.modulesEnabled) ? settings.modulesEnabled : []
  const hasStock = true      // always on — Inventory tile lives on the dashboard (user request)
  const hasRecipes = true    // always on — Recipes tile lives on the dashboard (user request)
  const hasRota = modulesEnabled.includes('rota')
  const hasHaccp = modulesEnabled.includes('haccp')
  const hasAnalytics = modulesEnabled.length === 0 || modulesEnabled.includes('analytics')

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/30 via-white to-emerald-50/40">
      {/* Setup wizard for first-time-onboarded kitchens */}
      {me?.kitchen && me.kitchen.onboarded === false && (
        <SetupWizardV2
          settings={me.kitchen}
          onComplete={async (payload) => {
            const res = await fetch('/api/settings', {
              method: 'PUT',
              body: JSON.stringify({ ...payload, onboarded: true }),
            })
            if (res.ok) {
              const updated = await res.json()
              setSettings(updated)
              setMe({ ...me, kitchen: updated })
              toast.success('All set! Welcome to ShelfWise 🎉')
            } else {
              toast.error('Could not save your setup — try again')
            }
          }}
        />
      )}
      {/* Top Nav */}
      <header className="border-b bg-white/90 backdrop-blur-md sticky top-0 z-30">
        <div className="container mx-auto px-3 sm:px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          {/* LEFT — logo (tap = go to Dashboard from any page) */}
          <button
            type="button"
            onClick={goToDashboard}
            title="Go to Dashboard"
            className="flex items-center rounded-lg hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-400 p-1 transition"
          >
            <img src="/logo-icon.png?v=3" alt="Home" className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg object-contain bg-white shadow-sm shrink-0" />
          </button>

          {/* CENTER — Kitchen name (always centered, always UPPERCASE) */}
          <div className="flex items-center justify-center min-w-0 px-1 sm:px-4">
            <div className="text-center min-w-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight truncate text-emerald-900 uppercase">
                {settings.kitchenName || 'ShelfWise'}
              </h1>
              {settings.kitchenType && (
                <p className="text-[10px] sm:text-[11px] text-emerald-700/70 -mt-0.5 truncate">{settings.kitchenType}</p>
              )}
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            <Button variant={view === 'dashboard' ? 'default' : 'ghost'} size="sm" onClick={goToDashboard}>
              <LayoutDashboard className="h-4 w-4 mr-2" /> {T('nav_dashboard')}
            </Button>
            {hasStock && (
              <Button variant={view === 'inventory' ? 'default' : 'ghost'} size="sm" onClick={() => { setStatusFilter('All'); setView('inventory') }}>
                <Package className="h-4 w-4 mr-2" /> {T('nav_inventory')}
              </Button>
            )}
            {hasRecipes && (
              <Button variant={view === 'recipes' ? 'default' : 'ghost'} size="sm" onClick={() => setView('recipes')}>
                <BookOpen className="h-4 w-4 mr-2" /> {T('nav_recipes')}
              </Button>
            )}
            {hasStock && can('orders') && (
              <Button variant={view === 'orders' ? 'default' : 'ghost'} size="sm" onClick={() => setView('orders')}>
                <Truck className="h-4 w-4 mr-2" /> Orders
              </Button>
            )}
            {hasRota && (
              <Button variant={view === 'rota' ? 'default' : 'ghost'} size="sm" onClick={() => setView('rota')}>
                <ChefHat className="h-4 w-4 mr-2" /> {T('nav_rota')}
              </Button>
            )}
            {hasAnalytics && (
              <Button variant={view === 'analytics' ? 'default' : 'ghost'} size="sm" onClick={() => setView('analytics')}>
                <BarChart3 className="h-4 w-4 mr-2" /> {T('nav_waste')}
              </Button>
            )}
            {hasHaccp && (
              <Button variant={view === 'haccp' ? 'default' : 'ghost'} size="sm" onClick={() => setView('haccp')}>
                <ShieldCheck className="h-4 w-4 mr-2" /> {T('nav_compliance')}
              </Button>
            )}
            {me?.isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/admin')}
                className="border-emerald-500 text-emerald-700 hover:bg-emerald-50 font-semibold"
                title="Open admin panel"
              >
                <ShieldCheck className="h-4 w-4 mr-1" /> {T('nav_admin')}
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} title={T('nav_settings')}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={async () => { await signOutAll(); router.replace('/login') }} title={T('nav_signout')} className="text-red-600 hover:text-red-700 hover:bg-red-50">
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>

          {/* Mobile menu button */}
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileNav(v => !v)}>
            <Settings className="h-5 w-5" />
          </Button>
        </div>

        {/* Mobile nav drawer */}
        {mobileNav && (
          <div className="md:hidden border-t bg-white px-4 py-3 space-y-2">
            <Button variant={view === 'dashboard' ? 'default' : 'ghost'} className="w-full justify-start" onClick={() => { goToDashboard(); setMobileNav(false) }}>
              <LayoutDashboard className="h-4 w-4 mr-2" /> {T('nav_dashboard')}
            </Button>
            {hasStock && (
              <Button variant={view === 'inventory' ? 'default' : 'ghost'} className="w-full justify-start" onClick={() => { setStatusFilter('All'); setView('inventory'); setMobileNav(false) }}>
                <Package className="h-4 w-4 mr-2" /> {T('nav_inventory')}
              </Button>
            )}
            {hasRecipes && (
              <Button variant={view === 'recipes' ? 'default' : 'ghost'} className="w-full justify-start" onClick={() => { setView('recipes'); setMobileNav(false) }}>
                <BookOpen className="h-4 w-4 mr-2" /> {T('nav_recipes')}
              </Button>
            )}
            {hasStock && can('orders') && (
              <Button variant={view === 'orders' ? 'default' : 'ghost'} className="w-full justify-start" onClick={() => { setView('orders'); setMobileNav(false) }}>
                <Truck className="h-4 w-4 mr-2" /> Orders
              </Button>
            )}
            {hasRota && (
              <Button variant={view === 'rota' ? 'default' : 'ghost'} className="w-full justify-start" onClick={() => { setView('rota'); setMobileNav(false) }}>
                <ChefHat className="h-4 w-4 mr-2" /> {T('nav_rota')}
              </Button>
            )}
            {hasAnalytics && (
              <Button variant={view === 'analytics' ? 'default' : 'ghost'} className="w-full justify-start" onClick={() => { setView('analytics'); setMobileNav(false) }}>
                <BarChart3 className="h-4 w-4 mr-2" /> {T('nav_waste')}
              </Button>
            )}
            {hasHaccp && (
              <Button variant={view === 'haccp' ? 'default' : 'ghost'} className="w-full justify-start" onClick={() => { setView('haccp'); setMobileNav(false) }}>
                <ShieldCheck className="h-4 w-4 mr-2" /> {T('nav_compliance')}
              </Button>
            )}
            {me?.isAdmin && (
              <Button
                variant="outline"
                className="w-full justify-start border-emerald-500 text-emerald-700 hover:bg-emerald-50 font-semibold"
                onClick={() => { setMobileNav(false); router.push('/admin') }}
              >
                <ShieldCheck className="h-4 w-4 mr-2" /> {T('nav_admin')}
              </Button>
            )}
            <Button variant="ghost" className="w-full justify-start" onClick={() => { setSettingsOpen(true); setMobileNav(false) }}>
              <Settings className="h-4 w-4 mr-2" /> {T('nav_settings')}
            </Button>
            <Button variant="ghost" className="w-full justify-start text-red-600" onClick={async () => { await signOutAll(); setMobileNav(false); router.replace('/login') }}>
              <LogOut className="h-4 w-4 mr-2" /> {T('nav_signout')}
            </Button>
          </div>
        )}
      </header>

      {/* PWA install prompt (compact strip below header on all app pages) */}
      <InstallAppPrompt compact />


      <main className="container mx-auto px-4 py-8">
        {view === 'dashboard' && (
          <DashboardView stats={stats} statsLoading={statsLoading} products={products} goToInventory={goToInventory} seedData={seedData} openAdd={openAdd} openScan={openScan} openSnap={openSnap} openBarcode={openBarcode} openVoice={openVoice} openReceipt={openReceipt} printLogbook={printLogbook} isStaff={!can('logbook')} openRecipe={openRecipe} onViewRecipe={setViewRecipe} widgets={settings.dashboardWidgets} recipesCount={savedRecipes.length} gotoRecipes={() => setView('recipes')} currency={settings.currency} openRecipeGen={openRecipeGen} openRecipeGenFromExpiring={openRecipeGenFromExpiring} openEdit={openEdit} refreshAll={() => { fetchProducts(); fetchStats() }} />
        )}
        {view === 'inventory' && (
          <InventoryView
            products={products}
            loading={loading}
            statusFilter={statusFilter}
            setStatusFilter={(s) => goToInventory(s)}
            search={search} setSearch={setSearch}
            sort={sort} setSort={setSort}
            categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
            storageFilter={storageFilter} setStorageFilter={setStorageFilter}
            facets={facets}
            openAdd={openAdd}
            openScan={openScan}
            openSnap={openSnap}
            openBarcode={openBarcode}
            openVoice={openVoice}
            printLogbook={can('logbook') ? printLogbook : null}
            openEdit={openEdit}
            deleteProduct={deleteProduct}
            disposeProduct={disposeProduct}
            openDispose={openDispose}
            exportCSV={exportCSV}
            formatDate={formatDate}
          />
        )}
        {view === 'recipes' && (
          <RecipesView
            recipes={savedRecipes}
            search={recipesSearch}
            setSearch={setRecipesSearch}
            openRecipe={openRecipe}
            onView={setViewRecipe}
            onDelete={deleteRecipe}
            openRecipeGen={openRecipeGen}
            openRecipeGenFromExpiring={openRecipeGenFromExpiring}
            onSaved={fetchRecipes}
          />
        )}
        {view === 'rota' && (
          <RotaView />
        )}
        {view === 'orders' && can('orders') && (
          <OrdersView />
        )}
        {view === 'analytics' && (
          <AnalyticsView products={products} />
        )}
        {view === 'haccp' && (
          <HaccpView currentUser={getPersonName() || me?.userEmail || ''} haccpLocations={settings.haccpLocations || []} isStaff={!can('logbook')} />
        )}
      </main>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[92vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>{editing ? 'Edit Product' : 'Add Product'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2 px-6 overflow-y-auto flex-1">
            <div className="sm:col-span-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Whole Milk" />
            </div>
            <div>
              <Label htmlFor="qty">Quantity</Label>
              <Input id="qty" type="number" step="0.01" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label htmlFor="unit">Unit</Label>
              {(() => {
                const STANDARD_UNITS = ['ea', 'kg', 'g', 'L', 'mL', 'bunch', 'pack', 'box']
                const isCustom = form.unit && !STANDARD_UNITS.includes(form.unit)
                return (
                  <div className="space-y-1.5">
                    <Select
                      value={isCustom ? '__other__' : form.unit}
                      onValueChange={v => {
                        if (v === '__other__') setForm({ ...form, unit: '' })
                        else setForm({ ...form, unit: v })
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STANDARD_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        <SelectItem value="__other__">✏️ Other (type your own)</SelectItem>
                      </SelectContent>
                    </Select>
                    {isCustom || form.unit === '' ? (
                      <Input
                        value={form.unit}
                        onChange={e => setForm({ ...form, unit: e.target.value })}
                        placeholder="e.g. tray, bottle, can, slice..."
                        maxLength={20}
                        autoFocus={form.unit === ''}
                      />
                    ) : null}
                  </div>
                )
              })()}
            </div>
            <div>
              <Label htmlFor="expiry">Expiry Date</Label>
              <Input id="expiry" type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Input id="category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Dairy, Produce..." />
            </div>
            <div>
              <Label htmlFor="storage">Storage</Label>
              <Select
                value={form.storageType}
                onValueChange={(v) => {
                  // Smart auto-expiry: when chef picks storage, suggest expiry date.
                  // Always update so user sees the helpful suggestion; they can edit if needed.
                  setForm({ ...form, storageType: v, expiryDate: suggestExpiryDate(form.category, v) })
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Fridge', 'Freezer', 'Dry', 'Ambient'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-0.5">💡 Expiry auto-set: Fridge ~7d, Freezer ~2 months, Dry/Ambient ~3 months</p>
            </div>
            <div>
              <Label htmlFor="loc">Shelf / Location</Label>
              <ShelfSelect
                value={form.location}
                onChange={v => setForm(prev => ({ ...prev, location: v }))}
                shelves={settings.locations}
                products={products}
                onAddShelf={addShelf}
                onRemoveShelf={removeShelf}
              />
            </div>
            <div>
              <Label htmlFor="dr">📅 Date Received</Label>
              <Input id="dr" type="date" value={form.dateReceived || ''} onChange={e => setForm({ ...form, dateReceived: e.target.value })} />
              <p className="text-[10px] text-muted-foreground mt-0.5">Auto-set to today — change if it arrived earlier</p>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="prep">Prepared By</Label>
              <Input id="prep" value={form.preparedBy} onChange={e => setForm({ ...form, preparedBy: e.target.value })} placeholder="Chef name" />
            </div>

            {/* Cost + Reorder + Supplier — collapsed into a subtle group */}
            <div className="sm:col-span-2 pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">💰 Cost &amp; supply (optional)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="unitCost">Cost per {form.unit || 'unit'} ({CURRENCY_SYMBOL[settings.currency] || settings.currency || ''})</Label>
                  <Input id="unitCost" type="number" step="0.01" min="0" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} placeholder="e.g. 2.50" />
                </div>
                <div>
                  <Label htmlFor="reorder">Reorder when qty ≤</Label>
                  <Input id="reorder" type="number" step="0.01" min="0" value={form.reorderPoint} onChange={e => setForm({ ...form, reorderPoint: e.target.value })} placeholder="e.g. 2" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="supplier">Supplier</Label>
                  <Input id="supplier" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="e.g. Bidfood, Booker, Costco" />
                </div>
              </div>
            </div>

            {/* Allergens — legal requirement in UK/EU */}
            <div className="sm:col-span-2 pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                ⚠️ Allergens present in this product
                {form.allergens?.length > 0 && <span className="ml-2 text-red-600 font-bold">({form.allergens.length} selected)</span>}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {ALLERGENS.map(a => {
                  const active = form.allergens?.includes(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setForm(prev => ({
                        ...prev,
                        allergens: active
                          ? prev.allergens.filter(x => x !== a.id)
                          : [...(prev.allergens || []), a.id]
                      }))}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-[11px] text-left transition ${
                        active
                          ? 'border-red-300 bg-red-50 text-red-800 font-semibold'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <span>{a.emoji}</span>
                      <span className="truncate">{a.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="sm:col-span-2">
              <Label>Photo (optional)</Label>
              <div className="flex items-center gap-3 mt-1">
                {form.imageUrl ? (
                  <img src={form.imageUrl} alt="" className="h-16 w-16 rounded-lg object-cover border" />
                ) : (
                  <div className="h-16 w-16 rounded-lg bg-slate-100 border flex items-center justify-center text-slate-400">
                    <Upload className="h-5 w-5" />
                  </div>
                )}
                <label className="inline-flex">
                  <input type="file" accept="image/*" className="hidden" onChange={e => onFormImageChange(e.target.files?.[0])} />
                  <span className="px-3 py-2 text-sm border rounded-md cursor-pointer hover:bg-slate-50">Upload photo</span>
                </label>
                {form.imageUrl && (
                  <Button variant="ghost" size="sm" type="button" onClick={() => setForm({ ...form, imageUrl: '' })}>Remove</Button>
                )}
              </div>
            </div>
            {settings.customFields?.length > 0 && (
              <div className="sm:col-span-2 pt-2 border-t">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Custom Fields</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {settings.customFields.map(f => (
                    <div key={f.key}>
                      <Label htmlFor={`cf-${f.key}`}>{f.label}</Label>
                      <Input
                        id={`cf-${f.key}`}
                        type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                        value={form.customFields?.[f.key] ?? ''}
                        onChange={e => setForm({ ...form, customFields: { ...(form.customFields || {}), [f.key]: e.target.value } })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-background shrink-0 sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveProduct} className="bg-emerald-600 hover:bg-emerald-700">{editing ? 'Save Changes' : 'Add Product'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Voice Input Dialog */}
      <Dialog open={voiceOpen} onOpenChange={(v) => { if (!v) forceCloseVoice() }}>
        <DialogContent className="sm:max-w-[500px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">🎤 Voice Add Items</span>
              <button
                type="button"
                onClick={forceCloseVoice}
                title="Force close"
                className="h-8 w-8 flex items-center justify-center rounded-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
            <p className="text-sm text-muted-foreground">Tap the mic and speak. e.g. <em>&quot;Add 5 kg chicken expires Friday and 2 bottles milk in fridge two&quot;</em></p>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex flex-col items-center gap-3 py-2">
              <button
                type="button"
                onClick={voiceListening ? stopVoiceListening : startVoiceListening}
                className={`h-24 w-24 rounded-full flex items-center justify-center shadow-lg text-white transition ${voiceListening ? 'bg-red-500 animate-pulse' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                <span className="text-4xl">{voiceListening ? '⏹️' : '🎤'}</span>
              </button>
              <p className="text-sm font-medium">{voiceListening ? 'Listening… tap to stop' : 'Tap mic to start'}</p>
            </div>

            {voiceTranscript && (
              <div className="rounded-lg bg-slate-50 border p-3">
                <p className="text-xs text-muted-foreground mb-1">You said:</p>
                <p className="text-sm">{voiceTranscript}</p>
              </div>
            )}

            {voiceTranscript && !voiceItems.length && (
              <Button onClick={parseVoiceCommand} disabled={voiceParsing} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {voiceParsing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Parsing...</> : <><Sparkles className="h-4 w-4 mr-2" /> Convert to items</>}
              </Button>
            )}

            {voiceItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-emerald-700">
                    ✨ Detected {voiceItems.length} item{voiceItems.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-[11px] text-slate-500">{voiceItems.filter(i => i._keep).length} selected</p>
                </div>
                <p className="text-[11px] text-slate-500 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
                  💡 Tap any item to edit name, qty, expiry, storage etc. Untick to skip.
                </p>

                {voiceItems.map((it, idx) => (
                  <div
                    key={idx}
                    className={`border-2 rounded-xl transition ${it._keep ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}
                  >
                    {/* Collapsed summary — tap to expand */}
                    <div className="flex items-center gap-2 p-3">
                      <input
                        type="checkbox"
                        checked={!!it._keep}
                        onChange={e => updateVoiceItem(idx, { _keep: e.target.checked })}
                        className="h-4 w-4 accent-emerald-600 shrink-0"
                        onClick={e => e.stopPropagation()}
                      />
                      <button
                        type="button"
                        onClick={() => updateVoiceItem(idx, { _expanded: !it._expanded })}
                        className="flex-1 min-w-0 text-left"
                      >
                        <p className="font-semibold text-sm truncate">{it.name || '(no name)'}</p>
                        <p className="text-[11px] text-slate-600 truncate">
                          {it.quantity} {it.unit} • {it.storageType}
                          {it.expiryDate ? ` • exp ${it.expiryDate}` : ''}
                          {it.location ? ` • 📍 ${it.location}` : ''}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeVoiceItem(idx)}
                        className="h-7 w-7 flex items-center justify-center rounded-md text-red-600 hover:bg-red-50 shrink-0"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Expanded editable form */}
                    {it._expanded && (
                      <div className="border-t px-3 pb-3 pt-2 space-y-2 bg-emerald-50/40 rounded-b-xl">
                        <div>
                          <Label className="text-xs">Name *</Label>
                          <Input
                            value={it.name}
                            onChange={e => updateVoiceItem(idx, { name: e.target.value })}
                            className="h-9"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Quantity</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={it.quantity}
                              onChange={e => updateVoiceItem(idx, { quantity: Number(e.target.value) || 0 })}
                              className="h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Unit</Label>
                            <Select value={it.unit || 'ea'} onValueChange={v => updateVoiceItem(idx, { unit: v })}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {['ea','kg','g','L','mL','bunch','pack','box'].map(u => (
                                  <SelectItem key={u} value={u}>{u}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Expiry date</Label>
                          <Input
                            type="date"
                            value={it.expiryDate || ''}
                            onChange={e => updateVoiceItem(idx, { expiryDate: e.target.value })}
                            className="h-9"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Storage</Label>
                            <Select value={it.storageType || 'Fridge'} onValueChange={v => updateVoiceItem(idx, { storageType: v })}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {['Fridge','Freezer','Dry','Ambient'].map(s => (
                                  <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Location</Label>
                            <ShelfSelect
                              value={it.location || ''}
                              onChange={v => updateVoiceItem(idx, { location: v })}
                              shelves={settings.locations}
                              products={products}
                              onAddShelf={addShelf}
                              onRemoveShelf={removeShelf}
                              triggerClassName="h-9"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Category</Label>
                          <Input
                            value={it.category || ''}
                            onChange={e => updateVoiceItem(idx, { category: e.target.value })}
                            placeholder="Dairy"
                            className="h-9"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={forceCloseVoice}>Cancel</Button>
            {voiceItems.length > 0 && (
              <Button onClick={saveVoiceItems} disabled={voiceParsing} className="bg-emerald-600 hover:bg-emerald-700">
                {voiceParsing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />} Save All
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expiry Date Live Scanner Dialog */}
      <ExpiryScanDialog
        open={expiryScanOpen}
        onClose={() => setExpiryScanOpen(false)}
        onDateFound={(date) => {
          setSnapItem(prev => ({ ...(prev || {}), expiryDate: date }))
          setExpiryScanOpen(false)
          toast.success(`Expiry detected: ${date}`)
        }}
      />

      {/* Print Logbook Modal — in-app so iOS users can easily tap Close */}
      <PrintLogbookDialog
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        kitchenName={settings.kitchenName || 'My Kitchen'}
        kitchenType={settings.kitchenType || ''}
      />

      {/* Dispose product dialog — logs to waste_log with reason */}
      <DisposeProductDialog
        product={disposeTarget}
        onClose={() => setDisposeTarget(null)}
        onConfirm={async (wasteEntry) => {
          const p = disposeTarget
          setDisposeTarget(null)
          await disposeProduct(p, wasteEntry)
        }}
      />

      {/* Receipt / delivery-note scanner */}
      <ReceiptScanDialog
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        onImport={async (rows) => {
          setReceiptOpen(false)
          if (!rows.length) return
          try {
            const res = await fetch('/api/products/bulk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: rows }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || `Bulk save failed (${res.status})`)
            toast.success(`Imported ${data.inserted || rows.length} items from invoice 🧾`)
            fetchProducts()
            fetchStats()
          } catch (e) {
            toast.error(e.message?.slice(0, 250) || 'Import failed', { duration: 12000 })
          }
        }}
        settings={settings}
      />

      {/* AI Recipe Generator — creates recipes from a list of ingredients */}
      <RecipeGenDialog
        open={recipeGenOpen}
        onClose={() => setRecipeGenOpen(false)}
        seed={recipeGenSeed}
        inventoryNames={(products || []).map(p => p.name).filter(Boolean)}
        kitchenType={settings.kitchenType || ''}
      />


      {/* Barcode Scanner Dialog */}
      <BarcodeScanDialog
        open={barcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        onFound={onBarcodeFound}
        loading={barcodeLoading}
        onManual={(code) => onBarcodeFound(code)}
      />

      {/* AI-Vision fallback for barcode scanner — user snaps front of pack */}
      <Dialog open={!!aiFallback} onOpenChange={(v) => { if (!v) setAiFallback(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" /> Identify by photo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-700">
              This barcode {aiFallback?.barcode && <span className="font-mono bg-slate-100 px-1 rounded text-xs">({aiFallback.barcode})</span>} isn't in the public databases.
              Snap a clear photo of the <b>front of the pack</b> — our AI will read the label and fill in the details.
            </p>
            <label className="block">
              <div className="rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 hover:bg-emerald-100 transition p-6 text-center cursor-pointer">
                {aiBusy ? (
                  <div className="flex flex-col items-center gap-2 text-emerald-700">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span className="text-sm font-medium">AI is reading the label…</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-emerald-700">
                    <Upload className="h-8 w-8" />
                    <span className="text-sm font-medium">Tap to take a photo</span>
                    <span className="text-xs text-emerald-600/80">Front of pack, well-lit, no glare</span>
                  </div>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={aiBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleAiFallbackPhoto(f)
                  e.target.value = ''
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              💡 Tip: once we identify a product, next time you scan the same barcode we'll recognise it instantly from your history.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiFallback(null)}>Skip &amp; enter manually</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Snap Label Dialog — single product photo */}
      <Dialog open={snapOpen} onOpenChange={setSnapOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" /> Snap Product Label
            </DialogTitle>
            <p className="text-sm text-muted-foreground">Hold your camera over the label — it captures &amp; reads automatically, like Google Lens.</p>
          </DialogHeader>

          {!snapItem && (
            <div className="py-2">
              <LensCameraView
                active={snapOpen && !snapItem}
                busy={snapLoading}
                frozenImage={snapImage}
                onCapture={runSnapScan}
                onGalleryFile={onSnapFile}
                onManual={() => setSnapItem({ name: '', quantity: 1, unit: 'ea', expiryDate: '', category: '', storageType: 'Fridge', location: '', preparedBy: getPersonName() })}
              />
            </div>
          )}

          {snapItem && (
            <div className="space-y-3 py-2">
              {snapImage && (
                <div className="flex items-center gap-3 bg-emerald-50/60 rounded-lg p-3 border border-emerald-100">
                  <img src={snapImage} alt="" className="h-16 w-16 rounded object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-emerald-700 font-semibold">✨ AI detected — confirm details below</p>
                    <Button variant="ghost" size="sm" className="h-6 px-1 text-xs mt-0.5" onClick={() => { setSnapItem(null); setSnapImage(null) }}>📸 Retake photo</Button>
                  </div>
                </div>
              )}
              <div>
                <Label className="text-xs">Product name *</Label>
                <Input value={snapItem.name || ''} onChange={e => setSnapItem({ ...snapItem, name: e.target.value })} placeholder="e.g. Whole Milk" autoFocus />
              </div>
              <div>
                <Label className="text-xs">Added by</Label>
                <Input value={snapItem.preparedBy || ''} onChange={e => setSnapItem({ ...snapItem, preparedBy: e.target.value })} placeholder="Your name" />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" min="0" step="0.1" value={snapItem.quantity || 1} onChange={e => setSnapItem({ ...snapItem, quantity: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Unit</Label>
                  {(() => {
                    const STANDARD_UNITS = ['ea', 'kg', 'g', 'L', 'mL', 'bunch', 'pack', 'box']
                    const isCustom = snapItem.unit && !STANDARD_UNITS.includes(snapItem.unit)
                    return (
                      <div className="space-y-1.5">
                        <Select
                          value={isCustom ? '__other__' : (snapItem.unit || 'ea')}
                          onValueChange={v => {
                            if (v === '__other__') setSnapItem({ ...snapItem, unit: '' })
                            else setSnapItem({ ...snapItem, unit: v })
                          }}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STANDARD_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            <SelectItem value="__other__">✏️ Other (type your own)</SelectItem>
                          </SelectContent>
                        </Select>
                        {isCustom || snapItem.unit === '' ? (
                          <Input
                            value={snapItem.unit || ''}
                            onChange={e => setSnapItem({ ...snapItem, unit: e.target.value })}
                            placeholder="e.g. tray, bottle, can..."
                            maxLength={20}
                            autoFocus={snapItem.unit === ''}
                          />
                        ) : null}
                      </div>
                    )
                  })()}
                </div>
              </div>
              <div>
                <Label className="text-xs">Expiry date *</Label>
                <div className="flex gap-2 items-stretch">
                  <Input type="date" className="flex-1" value={snapItem.expiryDate || ''} onChange={e => setSnapItem({ ...snapItem, expiryDate: e.target.value })} />
                  <Button
                    type="button"
                    onClick={() => setExpiryScanOpen(true)}
                    className="h-10 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                  >
                    📸 Snap Date
                  </Button>
                </div>
                <p className="text-[10px] text-amber-700 mt-0.5">⚠️ Always check the printed date on the package. Tap &quot;📸 Snap Date&quot; for live AI scan, or type manually.</p>
              </div>
              <div>
                <Label className="text-xs">Date received (today)</Label>
                <Input type="date" value={snapItem.dateReceived || new Date().toISOString().slice(0,10)} onChange={e => setSnapItem({ ...snapItem, dateReceived: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <Label className="text-xs">Storage</Label>
                  <Select
                    value={snapItem.storageType || 'Fridge'}
                    onValueChange={(v) => {
                      setSnapItem({ ...snapItem, storageType: v, expiryDate: suggestExpiryDate(snapItem.category || '', v) })
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Fridge">Fridge</SelectItem>
                      <SelectItem value="Freezer">Freezer</SelectItem>
                      <SelectItem value="Dry">Dry storage</SelectItem>
                      <SelectItem value="Ambient">Ambient</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Location/Shelf</Label>
                  <ShelfSelect
                    value={snapItem.location || ''}
                    onChange={v => setSnapItem(prev => ({ ...prev, location: v }))}
                    shelves={settings.locations}
                    products={products}
                    onAddShelf={addShelf}
                    onRemoveShelf={removeShelf}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Input value={snapItem.category || ''} onChange={e => setSnapItem({ ...snapItem, category: e.target.value })} placeholder="Dairy" />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setSnapOpen(false)}>Cancel</Button>
            {snapItem && (
              <Button onClick={saveSnapItem} disabled={snapSaving || !snapItem?.name?.trim()} className="bg-emerald-600 hover:bg-emerald-700">
                {snapSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />} Add to Inventory
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Scan Dialog */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="sm:max-w-[860px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-emerald-600" /> Scan Logbook with AI
            </DialogTitle>
            <p className="text-sm text-muted-foreground">Snap a photo of your kitchen logbook, fridge whiteboard, or prep list. GPT-4o vision will extract every item.</p>
          </DialogHeader>

          {!scanItems.length && (
            <div className="space-y-4 py-2">
              <label className="block">
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => onScanFile(e.target.files?.[0])} />
                <div className="border-2 border-dashed border-emerald-200 rounded-xl p-8 hover:border-emerald-400 hover:bg-emerald-50/40 transition cursor-pointer text-center">
                  {scanImage ? (
                    <div className="space-y-3">
                      <img src={scanImage} alt="preview" className="max-h-72 mx-auto rounded-lg shadow-sm" />
                      <p className="text-sm text-muted-foreground">Click to choose a different image</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="h-14 w-14 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
                        <Upload className="h-6 w-6 text-emerald-600" />
                      </div>
                      <p className="font-medium">Click to upload or take a photo</p>
                      <p className="text-xs text-muted-foreground">PNG, JPG up to 10MB. We'll auto-resize for fast processing.</p>
                    </div>
                  )}
                </div>
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setScanOpen(false)}>Cancel</Button>
                <Button onClick={runScan} disabled={!scanImage || scanLoading} className="bg-emerald-600 hover:bg-emerald-700">
                  {scanLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</> : <><Sparkles className="h-4 w-4 mr-2" /> Extract Items</>}
                </Button>
              </div>
            </div>
          )}

          {scanItems.length > 0 && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Review and edit the detected items. Uncheck any you don't want to add.</p>
                <p className="text-xs font-medium whitespace-nowrap">{scanItems.filter(i => i._keep).length} of {scanItems.length} selected</p>
              </div>

              {/* MOBILE: card layout — each item shows full-width labeled inputs on its own card */}
              <div className="md:hidden space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {scanItems.map((it, idx) => (
                  <div key={idx} className={`border rounded-lg p-3 bg-white space-y-2 ${!it._keep ? 'opacity-50' : ''}`}>
                    <label className="flex items-center gap-2 font-semibold text-sm cursor-pointer">
                      <input type="checkbox" checked={it._keep} onChange={e => updateScanItem(idx, '_keep', e.target.checked)} className="h-4 w-4 accent-emerald-600" />
                      Item {idx + 1}
                    </label>
                    <div>
                      <Label className="text-[11px] text-slate-500">Name</Label>
                      <Input value={it.name} onChange={e => updateScanItem(idx, 'name', e.target.value)} className="h-9" placeholder="Product name" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px] text-slate-500">Qty</Label>
                        <Input type="number" value={it.quantity} onChange={e => updateScanItem(idx, 'quantity', e.target.value)} className="h-9" />
                      </div>
                      <div>
                        <Label className="text-[11px] text-slate-500">Unit</Label>
                        <Input value={it.unit} onChange={e => updateScanItem(idx, 'unit', e.target.value)} className="h-9" placeholder="kg, ea..." />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[11px] text-slate-500">Expiry date</Label>
                      <Input type="date" value={it.expiryDate || ''} onChange={e => updateScanItem(idx, 'expiryDate', e.target.value)} className="h-9" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px] text-slate-500">Category</Label>
                        <Input value={it.category} onChange={e => updateScanItem(idx, 'category', e.target.value)} className="h-9" />
                      </div>
                      <div>
                        <Label className="text-[11px] text-slate-500">Storage</Label>
                        <Input value={it.storageType} onChange={e => updateScanItem(idx, 'storageType', e.target.value)} className="h-9" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* DESKTOP: table layout — unchanged, wider screens have room */}
              <div className="hidden md:block border rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0">
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-20">Qty</TableHead>
                      <TableHead className="w-20">Unit</TableHead>
                      <TableHead className="w-36">Expiry</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="w-28">Storage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scanItems.map((it, idx) => (
                      <TableRow key={idx} className={!it._keep ? 'opacity-40' : ''}>
                        <TableCell><input type="checkbox" checked={it._keep} onChange={e => updateScanItem(idx, '_keep', e.target.checked)} className="h-4 w-4 accent-emerald-600" /></TableCell>
                        <TableCell><Input value={it.name} onChange={e => updateScanItem(idx, 'name', e.target.value)} className="h-8" /></TableCell>
                        <TableCell><Input type="number" value={it.quantity} onChange={e => updateScanItem(idx, 'quantity', e.target.value)} className="h-8" /></TableCell>
                        <TableCell><Input value={it.unit} onChange={e => updateScanItem(idx, 'unit', e.target.value)} className="h-8" /></TableCell>
                        <TableCell><Input type="date" value={it.expiryDate || ''} onChange={e => updateScanItem(idx, 'expiryDate', e.target.value)} className="h-8" /></TableCell>
                        <TableCell><Input value={it.category} onChange={e => updateScanItem(idx, 'category', e.target.value)} className="h-8" /></TableCell>
                        <TableCell><Input value={it.storageType} onChange={e => updateScanItem(idx, 'storageType', e.target.value)} className="h-8" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between flex-wrap gap-2">
                <Button variant="ghost" onClick={() => { setScanItems([]); setScanImage(null) }}>
                  <X className="h-4 w-4 mr-2" /> Start over
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setScanOpen(false)}>Cancel</Button>
                  <Button onClick={saveScannedItems} disabled={scanSaving} className="bg-emerald-600 hover:bg-emerald-700">
                    {scanSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : <><Check className="h-4 w-4 mr-2" /> Add to Inventory</>}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Recipe Scan Dialog */}
      <Dialog open={recipeOpen} onOpenChange={setRecipeOpen}>
        <DialogContent className="sm:max-w-[920px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-purple-600" /> Scan Recipe
            </DialogTitle>
            <p className="text-sm text-muted-foreground">Paste or upload a recipe. AI will extract ingredients, flag allergens, and check what's already in your inventory.</p>
          </DialogHeader>

          {!recipeResult && (
            <div className="space-y-4 py-2">
              <div className="flex gap-2 border-b pb-2">
                <Button variant={recipeMode === 'text' ? 'default' : 'ghost'} size="sm" onClick={() => setRecipeMode('text')} className={recipeMode === 'text' ? 'bg-purple-600 hover:bg-purple-700' : ''}>Paste Text</Button>
                <Button variant={recipeMode === 'image' ? 'default' : 'ghost'} size="sm" onClick={() => setRecipeMode('image')} className={recipeMode === 'image' ? 'bg-purple-600 hover:bg-purple-700' : ''}>Upload Image</Button>
              </div>

              {recipeMode === 'text' ? (
                <textarea
                  className="w-full min-h-[260px] rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Paste your recipe here including ingredients and instructions..."
                  value={recipeText}
                  onChange={e => setRecipeText(e.target.value)}
                />
              ) : (
                <div className="space-y-3">
                  {recipeImages.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {recipeImages.map((img, i) => (
                        <div key={i} className="relative rounded-lg overflow-hidden border border-purple-200 bg-white">
                          <img src={img} alt={`Page ${i + 1}`} className="w-full h-36 object-cover" />
                          <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold bg-purple-600 text-white px-2 py-0.5 rounded-full shadow">Page {i + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeRecipePage(i)}
                            aria-label={`Remove page ${i + 1}`}
                            className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-xs leading-none"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {recipeImages.length < 5 && (
                    <label className="block">
                      <input type="file" accept="image/*" multiple className="hidden" onChange={e => { onRecipeImages(e.target.files); e.target.value = '' }} />
                      <div className="border-2 border-dashed border-purple-200 rounded-xl p-6 hover:border-purple-400 hover:bg-purple-50/40 transition cursor-pointer text-center">
                        {recipeImages.length > 0 ? (
                          <div className="flex items-center justify-center gap-2 text-purple-700">
                            <div className="h-9 w-9 rounded-full bg-purple-100 flex items-center justify-center">
                              <Upload className="h-4 w-4 text-purple-600" />
                            </div>
                            <div className="text-left">
                              <p className="font-medium text-sm">Add another page</p>
                              <p className="text-xs text-muted-foreground">{recipeImages.length}/5 pages added — for 2-page recipes just snap both pages</p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="h-14 w-14 mx-auto rounded-full bg-purple-100 flex items-center justify-center">
                              <Upload className="h-6 w-6 text-purple-600" />
                            </div>
                            <p className="font-medium">Upload recipe photo(s)</p>
                            <p className="text-xs text-muted-foreground">A cookbook page, recipe card, or screenshot. Got a 2-page recipe? Add up to 5 pages — AI merges them into one recipe.</p>
                          </div>
                        )}
                      </div>
                    </label>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRecipeOpen(false)}>Cancel</Button>
                <Button onClick={runRecipeScan} disabled={recipeLoading} className="bg-purple-600 hover:bg-purple-700">
                  {recipeLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</> : <><Sparkles className="h-4 w-4 mr-2" /> Analyze Recipe</>}
                </Button>
              </div>
            </div>
          )}

          {recipeResult && <RecipeResult result={recipeResult} setResult={setRecipeResult} onBack={() => setRecipeResult(null)} onClose={() => setRecipeOpen(false)} goToInventory={goToInventory} onSave={saveCurrentRecipe} saving={recipeSaving} />}
        </DialogContent>
      </Dialog>

      {/* Duplicate PRODUCT prompt — never add the same item name twice by accident */}
      <Dialog open={!!dupProduct} onOpenChange={(v) => { if (!v) setDupProduct(null) }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">⚠️ Item already in inventory</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground capitalize">"{dupProduct?.existing?.name}"</span> is already in your inventory
            ({dupProduct?.existing?.quantity} {dupProduct?.existing?.unit}{dupProduct?.existing?.expiryDate ? `, exp ${dupProduct.existing.expiryDate}` : ''}). What would you like to do?
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <Button onClick={mergeDupIntoExisting} className="bg-emerald-600 hover:bg-emerald-700 w-full justify-center">
              Add to old item → total {((Number(dupProduct?.existing?.quantity) || 0) + (Number(dupProduct?.item?.quantity) || 0))} {dupProduct?.existing?.unit || ''}
            </Button>
            <Button variant="outline" onClick={() => { const src = dupProduct?.source; setDupProduct(null); if (src === 'snap') saveSnapItem(true); else saveProduct(true) }} className="w-full justify-center">
              Add as a separate item anyway
            </Button>
            <Button variant="ghost" onClick={() => setDupProduct(null)} className="w-full justify-center">
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate recipe prompt — never save the same recipe twice */}
      <Dialog open={!!dupExisting} onOpenChange={(v) => { if (!v) setDupExisting(null) }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">⚠️ Recipe already saved</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">"{dupExisting?.title}"</span> is already in your recipe collection
            {dupExisting?.created_at ? ` (saved ${new Date(dupExisting.created_at).toLocaleDateString()})` : ''}. What would you like to do?
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <Button onClick={() => saveCurrentRecipe(dupExisting?.id)} disabled={recipeSaving} className="bg-purple-600 hover:bg-purple-700 w-full justify-center">
              {recipeSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Replace old recipe with this one
            </Button>
            <Button variant="outline" onClick={() => openExistingRecipe(dupExisting?.id)} className="w-full justify-center">
              Open the old recipe (view / edit)
            </Button>
            <Button variant="ghost" onClick={() => setDupExisting(null)} className="w-full justify-center">
              Close — keep the old one
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View saved recipe */}
      <ViewRecipeDialog recipe={viewRecipe} onClose={() => setViewRecipe(null)} onDelete={deleteRecipe} onUpdated={() => { setViewRecipe(null); fetchRecipes() }} />

      {/* Setup Wizard */}
      <SetupWizard open={wizardOpen} onClose={() => setWizardOpen(false)} settings={settings} saveSettings={saveSettings} />

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        saveSettings={saveSettings}
        openWizard={() => { setSettingsOpen(false); setWizardOpen(true) }}
        isStaff={!can('settings')}
        isOwner={me?.role === 'owner' || !!me?.isAdmin}
      />

      {/* "Add your name" popup — for people already logged in via code before the names feature */}
      <Dialog open={namePromptOpen} onOpenChange={(v) => { if (!v && namePromptValue.trim()) setNamePromptOpen(false) }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>👋 What's your name?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Your name shows on everything you add — so the team knows who added what. Each person needs their own name.
          </p>
          <Input
            value={namePromptValue}
            onChange={e => setNamePromptValue(e.target.value)}
            placeholder="e.g. Maria"
            maxLength={40}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') submitNamePrompt() }}
          />
          <Button onClick={() => submitNamePrompt()} disabled={namePromptBusy} className="w-full bg-emerald-600 hover:bg-emerald-700">
            {namePromptBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Save my name
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// In-app Print Logbook — iOS-safe (no window.open) so users can tap Close to return.
// Uses @media print rules to hide everything except the printable sheet during printing.
// ============================================================================
// Receipt / delivery-note scanner — snap a photo → AI parses → confirm → import
// Uses GPT-4o vision to extract supplier, items, prices, categories, etc.
// ============================================================================

export default App
