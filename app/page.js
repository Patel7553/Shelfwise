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
import { Boxes, AlertTriangle, Clock, PackageX, Plus, Search, Download, ArrowUpDown, Pencil, Trash2, LayoutDashboard, Package, Sparkles, ChefHat, ScanLine, Upload, Loader2, Check, X, BookOpen, AlertCircle, ShieldAlert, ShieldCheck, Settings, ArrowRight, Copy, RefreshCw, LogOut, Printer, BarChart3, Bell, BellOff, Calendar as CalendarIcon, Sun, Moon, Monitor } from 'lucide-react'
import { apiFetch, signOutAll, getChefToken } from '@/lib/apiClient'

// `fetch` inside this file transparently uses `apiFetch` (auth token attached).
const fetch = apiFetch

const STATUS_META = {
  Expired: { label: 'Expired', color: 'bg-red-100 text-red-700 border-red-200' },
  Expiring: { label: 'Expiring Soon', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  Critical: { label: 'Critical Stock', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  Ok: { label: 'OK', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

const EMPTY_FORM = {
  name: '', quantity: '', unit: 'ea', expiryDate: '', category: '',
  storageType: 'Fridge', location: '', preparedBy: '', imageUrl: '',
  dateReceived: '',
  unitCost: '', reorderPoint: '', supplier: '',
  allergens: [],
  customFields: {}
}

// UK/EU Natasha's Law 14 allergens — used for legal compliance labelling
const ALLERGENS = [
  { id: 'gluten',       label: 'Gluten (wheat, rye, barley, oats)', emoji: '🌾' },
  { id: 'crustaceans',  label: 'Crustaceans (prawns, crab, lobster)', emoji: '🦐' },
  { id: 'eggs',         label: 'Eggs', emoji: '🥚' },
  { id: 'fish',         label: 'Fish', emoji: '🐟' },
  { id: 'peanuts',      label: 'Peanuts', emoji: '🥜' },
  { id: 'soybeans',     label: 'Soybeans', emoji: '🫘' },
  { id: 'milk',         label: 'Milk / Dairy', emoji: '🥛' },
  { id: 'nuts',         label: 'Tree Nuts', emoji: '🌰' },
  { id: 'celery',       label: 'Celery', emoji: '🥬' },
  { id: 'mustard',      label: 'Mustard', emoji: '🌶️' },
  { id: 'sesame',       label: 'Sesame', emoji: '🫓' },
  { id: 'sulphites',    label: 'Sulphites', emoji: '🍷' },
  { id: 'lupin',        label: 'Lupin', emoji: '🌼' },
  { id: 'molluscs',     label: 'Molluscs (oysters, mussels)', emoji: '🦪' },
]

const CURRENCY_SYMBOL = {
  GBP: '£', USD: '$', EUR: '€', INR: '₹', AUD: 'A$', CAD: 'C$', SGD: 'S$', AED: 'د.إ',
}

function getInitialFromURL() {
  // Always return defaults during SSR and initial render to avoid hydration mismatch.
  // The URL is read in a useEffect after mount.
  return { view: 'dashboard', status: 'All' }
}

// Estimate shelf life (days from today) based on category + storage type
function guessShelfLifeDays(category = '', storageType = '') {
  const c = String(category || '').toLowerCase()
  const s = String(storageType || '').toLowerCase()
  if (s === 'freezer') return 60       // ~2 months for freezer items
  if (s === 'dry') return 90           // ~3 months for dry storage
  if (s === 'ambient') return 90       // ~3 months for ambient (similar to dry)
  // Fridge defaults (category-specific)
  if (c.includes('fish') || c.includes('seafood')) return 2
  if (c.includes('meat') || c.includes('chicken') || c.includes('poultry')) return 3
  if (c.includes('dairy') || c.includes('milk') || c.includes('yogurt') || c.includes('cheese')) return 7
  if (c.includes('veg') || c.includes('produce') || c.includes('fruit') || c.includes('herb')) return 5
  if (c.includes('egg')) return 21
  if (c.includes('sauce') || c.includes('condiment')) return 30
  return 7 // safe fridge default
}

// Helper: get an ISO date N days from today (YYYY-MM-DD)
function dateInDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Smart expiry SUGGESTION using calendar-correct math (months for long, days for short).
// Returns YYYY-MM-DD string.
function suggestExpiryDate(category = '', storageType = '') {
  const c = String(category || '').toLowerCase()
  const s = String(storageType || '').toLowerCase()
  const d = new Date()
  // Long-term storage uses calendar MONTHS (so Jun 14 + 2 mo = Aug 14 exactly)
  if (s === 'freezer') {
    d.setMonth(d.getMonth() + 2)
    return d.toISOString().slice(0, 10)
  }
  if (s === 'dry' || s === 'ambient') {
    d.setMonth(d.getMonth() + 3)
    return d.toISOString().slice(0, 10)
  }
  // Fridge uses category-specific days
  let days = 7
  if (c.includes('fish') || c.includes('seafood')) days = 2
  else if (c.includes('meat') || c.includes('chicken') || c.includes('poultry')) days = 3
  else if (c.includes('dairy') || c.includes('milk') || c.includes('yogurt') || c.includes('cheese')) days = 7
  else if (c.includes('veg') || c.includes('produce') || c.includes('fruit') || c.includes('herb')) days = 5
  else if (c.includes('egg')) days = 21
  else if (c.includes('sauce') || c.includes('condiment')) days = 30
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
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

function App() {
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
  const [recipeImage, setRecipeImage] = useState(null)
  const [recipeLoading, setRecipeLoading] = useState(false)
  const [recipeResult, setRecipeResult] = useState(null)
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
        // If owner kitchen not approved, show waiting screen (handled below in render)
      } catch {
        if (!cancelled) { setAuthed(false); router.replace('/login') }
      }
    })()
    return () => { cancelled = true }
  }, [router])

  const fetchProducts = async () => {
    setLoading(true)
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
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next)
      })
      const data = await res.json()
      setSettings(data)
      toast.success('Settings saved')
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
    } catch {}
  }

  useEffect(() => { fetchProducts() }, [statusFilter, search, sort, categoryFilter, storageFilter])
  useEffect(() => { fetchStats(); fetchFacets() }, [products.length, view])
  useEffect(() => { fetchSettings() }, [])
  useEffect(() => { if (view === 'recipes') fetchRecipes() }, [view, recipesSearch])

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

  const saveCurrentRecipe = async () => {
    if (!recipeResult) return
    setRecipeSaving(true)
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipeResult)
      })
      if (!res.ok) throw new Error()
      toast.success('Recipe saved! Find it in the Recipes tab.')
    } catch {
      toast.error('Failed to save recipe')
    } finally {
      setRecipeSaving(false)
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

  const openAdd = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, dateReceived: new Date().toISOString().slice(0, 10) })
    setDialogOpen(true)
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

  const saveProduct = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
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

  // Open Barcode scanner
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
      setVoiceItems(data.items)
      toast.success(`Detected ${data.items.length} item${data.items.length !== 1 ? 's' : ''}`)
    } catch (e) {
      toast.error(e.message || 'Could not parse speech')
    } finally {
      setVoiceParsing(false)
    }
  }

  const saveVoiceItems = async () => {
    setVoiceParsing(true)
    try {
      for (const item of voiceItems) {
        if (!item.name) continue
        await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        })
      }
      toast.success(`Added ${voiceItems.length} item${voiceItems.length !== 1 ? 's' : ''} from voice ✅`)
      setVoiceOpen(false)
      fetchProducts()
      fetchStats()
    } catch (e) {
      toast.error('Failed to save items')
    } finally {
      setVoiceParsing(false)
    }
  }

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
            detected.name = p.product_name || p.product_name_en || p.generic_name || ''
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
            toast.success(`Found: ${detected.name || code}. Please enter the expiry date from the package.`)
            found = true
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
            if (item?.title) {
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
          if (data?.status === 1 && data?.product?.product_name) {
            detected.name = data.product.product_name
            detected.category = 'Cleaning/Beauty'
            detected.expiryDate = ''
            toast.success(`Found: ${data.product.product_name}. Please enter the expiry date.`)
            found = true
          }
        } catch {}
      }

      if (!found) {
        toast.warning("This product isn't in our barcode databases. Please fill in details manually — we'll remember it for next time!", { duration: 7000 })
      }

      setBarcodeOpen(false)
      setSnapItem(detected)
      setSnapImage(null)
      setSnapOpen(true)
    } finally {
      setBarcodeLoading(false)
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

  const onSnapFile = async (file) => {
    if (!file) return
    const dataUrl = await resizeImage(file)
    setSnapImage(dataUrl)
    // Auto-run scan immediately
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
        toast.warning('No product detected. Try a clearer photo or fill manually.')
        setSnapItem({ name: '', quantity: 1, unit: 'ea', expiryDate: '', category: '', storageType: 'Fridge', location: '' })
      } else {
        // Set sensible defaults if AI didn't return expiry
        if (!first.expiryDate) {
          first.expiryDate = suggestExpiryDate(first.category, first.storageType)
        }
        setSnapItem(first)
        toast.success(`Detected: ${first.name}`)
      }
    } catch (e) {
      toast.error(e.message || 'Scan failed')
    } finally {
      setSnapLoading(false)
    }
  }

  const saveSnapItem = async () => {
    if (!snapItem?.name?.trim()) { toast.error('Product name is required'); return }
    setSnapSaving(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapItem)
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

  const saveScannedItems = async () => {
    const toAdd = scanItems.filter(it => it._keep).map(({ _keep, ...rest }) => rest)
    if (!toAdd.length) {
      toast.error('No items selected')
      return
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
    setRecipeImage(null)
    setRecipeText('')
    setRecipeMode('text')
  }

  const onRecipeImage = async (file) => {
    if (!file) return
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
    setRecipeImage(dataUrl)
  }

  const runRecipeScan = async () => {
    if (recipeMode === 'text' && !recipeText.trim()) { toast.error('Paste a recipe first'); return }
    if (recipeMode === 'image' && !recipeImage) { toast.error('Upload a recipe image first'); return }
    setRecipeLoading(true)
    try {
      const payload = recipeMode === 'image' ? { image: recipeImage } : { text: recipeText }
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
  const hasStock = modulesEnabled.length === 0 || modulesEnabled.includes('stock')
  const hasRecipes = modulesEnabled.length === 0 || modulesEnabled.includes('recipes')
  const hasRota = modulesEnabled.includes('rota')
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
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/logo-icon.png?v=3" alt="ShelfWise" className="h-10 w-10 rounded-lg object-contain bg-white shadow-sm shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight truncate">{settings.kitchenName || 'ShelfWise'}</h1>
              <p className="text-xs text-muted-foreground -mt-0.5 truncate hidden sm:block">{settings.tagline || 'From shelf to plate — never lose track.'}{settings.kitchenType ? ' · ' + settings.kitchenType : ''}</p>
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            <Button variant={view === 'dashboard' ? 'default' : 'ghost'} size="sm" onClick={goToDashboard}>
              <LayoutDashboard className="h-4 w-4 mr-2" /> Dashboard
            </Button>
            {hasStock && (
              <Button variant={view === 'inventory' ? 'default' : 'ghost'} size="sm" onClick={() => { setStatusFilter('All'); setView('inventory') }}>
                <Package className="h-4 w-4 mr-2" /> Inventory
              </Button>
            )}
            {hasRecipes && (
              <Button variant={view === 'recipes' ? 'default' : 'ghost'} size="sm" onClick={() => setView('recipes')}>
                <BookOpen className="h-4 w-4 mr-2" /> Recipes
              </Button>
            )}
            {hasRota && (
              <Button variant={view === 'rota' ? 'default' : 'ghost'} size="sm" onClick={() => setView('rota')}>
                <ChefHat className="h-4 w-4 mr-2" /> Rota
              </Button>
            )}
            {hasAnalytics && (
              <Button variant={view === 'analytics' ? 'default' : 'ghost'} size="sm" onClick={() => setView('analytics')}>
                <BarChart3 className="h-4 w-4 mr-2" /> Waste
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
                <ShieldCheck className="h-4 w-4 mr-1" /> Admin
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} title="Settings">
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={async () => { await signOutAll(); router.replace('/login') }} title="Sign out" className="text-red-600 hover:text-red-700 hover:bg-red-50">
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
              <LayoutDashboard className="h-4 w-4 mr-2" /> Dashboard
            </Button>
            {hasStock && (
              <Button variant={view === 'inventory' ? 'default' : 'ghost'} className="w-full justify-start" onClick={() => { setStatusFilter('All'); setView('inventory'); setMobileNav(false) }}>
                <Package className="h-4 w-4 mr-2" /> Inventory
              </Button>
            )}
            {hasRecipes && (
              <Button variant={view === 'recipes' ? 'default' : 'ghost'} className="w-full justify-start" onClick={() => { setView('recipes'); setMobileNav(false) }}>
                <BookOpen className="h-4 w-4 mr-2" /> Recipes
              </Button>
            )}
            {hasRota && (
              <Button variant={view === 'rota' ? 'default' : 'ghost'} className="w-full justify-start" onClick={() => { setView('rota'); setMobileNav(false) }}>
                <ChefHat className="h-4 w-4 mr-2" /> Rota
              </Button>
            )}
            {hasAnalytics && (
              <Button variant={view === 'analytics' ? 'default' : 'ghost'} className="w-full justify-start" onClick={() => { setView('analytics'); setMobileNav(false) }}>
                <BarChart3 className="h-4 w-4 mr-2" /> Waste
              </Button>
            )}
            {me?.isAdmin && (
              <Button
                variant="outline"
                className="w-full justify-start border-emerald-500 text-emerald-700 hover:bg-emerald-50 font-semibold"
                onClick={() => { setMobileNav(false); router.push('/admin') }}
              >
                <ShieldCheck className="h-4 w-4 mr-2" /> Admin Panel
              </Button>
            )}
            <Button variant="ghost" className="w-full justify-start" onClick={() => { setSettingsOpen(true); setMobileNav(false) }}>
              <Settings className="h-4 w-4 mr-2" /> Settings
            </Button>
            <Button variant="ghost" className="w-full justify-start text-red-600" onClick={async () => { await signOutAll(); setMobileNav(false); router.replace('/login') }}>
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </Button>
          </div>
        )}
      </header>

      <main className="container mx-auto px-4 py-8">
        {view === 'dashboard' && (
          <DashboardView stats={stats} products={products} goToInventory={goToInventory} seedData={seedData} openAdd={openAdd} openScan={openScan} openSnap={openSnap} openBarcode={openBarcode} openVoice={openVoice} openReceipt={openReceipt} printLogbook={printLogbook} openRecipe={openRecipe} onViewRecipe={setViewRecipe} widgets={settings.dashboardWidgets} recipesCount={savedRecipes.length} gotoRecipes={() => setView('recipes')} currency={settings.currency} />
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
            printLogbook={printLogbook}
            openEdit={openEdit}
            deleteProduct={deleteProduct}
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
          />
        )}
        {view === 'rota' && (
          <RotaView />
        )}
        {view === 'analytics' && (
          <AnalyticsView products={products} />
        )}
      </main>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[92vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>{editing ? 'Edit Product' : 'Add Product'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-2 px-6 overflow-y-auto flex-1">
            <div className="col-span-2">
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
              <Input id="loc" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Shelf A1" />
            </div>
            <div>
              <Label htmlFor="dr">📅 Date Received</Label>
              <Input id="dr" type="date" value={form.dateReceived || ''} onChange={e => setForm({ ...form, dateReceived: e.target.value })} />
              <p className="text-[10px] text-muted-foreground mt-0.5">Auto-set to today — change if it arrived earlier</p>
            </div>
            <div className="col-span-2">
              <Label htmlFor="prep">Prepared By</Label>
              <Input id="prep" value={form.preparedBy} onChange={e => setForm({ ...form, preparedBy: e.target.value })} placeholder="Chef name" />
            </div>

            {/* Cost + Reorder + Supplier — collapsed into a subtle group */}
            <div className="col-span-2 pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">💰 Cost &amp; supply (optional)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="unitCost">Cost per {form.unit || 'unit'} ({CURRENCY_SYMBOL[settings.currency] || settings.currency || ''})</Label>
                  <Input id="unitCost" type="number" step="0.01" min="0" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} placeholder="e.g. 2.50" />
                </div>
                <div>
                  <Label htmlFor="reorder">Reorder when qty ≤</Label>
                  <Input id="reorder" type="number" step="0.01" min="0" value={form.reorderPoint} onChange={e => setForm({ ...form, reorderPoint: e.target.value })} placeholder="e.g. 2" />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="supplier">Supplier</Label>
                  <Input id="supplier" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="e.g. Bidfood, Booker, Costco" />
                </div>
              </div>
            </div>

            {/* Allergens — legal requirement in UK/EU */}
            <div className="col-span-2 pt-2 border-t">
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

            <div className="col-span-2">
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
              <div className="col-span-2 pt-2 border-t">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Custom Fields</p>
                <div className="grid grid-cols-2 gap-4">
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
                <p className="text-xs font-semibold text-emerald-700">✨ Detected {voiceItems.length} item{voiceItems.length !== 1 ? 's' : ''}:</p>
                {voiceItems.map((it, i) => (
                  <div key={i} className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-sm space-y-1">
                    <p className="font-semibold">{it.name}</p>
                    <p className="text-xs text-slate-600">
                      {it.quantity} {it.unit} • {it.storageType}
                      {it.expiryDate ? ` • exp ${it.expiryDate}` : ''}
                      {it.location ? ` • 📍 ${it.location}` : ''}
                    </p>
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
            toast.success(`Imported ${data.inserted || rows.length} items from receipt 🧾`)
            fetchProducts()
            fetchStats()
          } catch (e) {
            toast.error(e.message?.slice(0, 250) || 'Import failed', { duration: 12000 })
          }
        }}
        settings={settings}
      />

      {/* Barcode Scanner Dialog */}
      <BarcodeScanDialog
        open={barcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        onFound={onBarcodeFound}
        loading={barcodeLoading}
        onManual={(code) => onBarcodeFound(code)}
      />

      {/* AI Snap Label Dialog — single product photo */}
      <Dialog open={snapOpen} onOpenChange={setSnapOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" /> Snap Product Label
            </DialogTitle>
            <p className="text-sm text-muted-foreground">Take ONE photo of a product label, package, or sticker. AI fills the details for you.</p>
          </DialogHeader>

          {!snapItem && (
            <div className="space-y-3 py-2">
              <label className="block">
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => onSnapFile(e.target.files?.[0])} />
                <div className="border-2 border-dashed border-emerald-300 rounded-xl p-8 hover:border-emerald-500 hover:bg-emerald-50/50 transition cursor-pointer text-center">
                  {snapImage ? (
                    <div className="space-y-3">
                      <img src={snapImage} alt="preview" className="max-h-60 mx-auto rounded-lg shadow-sm" />
                      {snapLoading && <div className="flex items-center justify-center gap-2 text-emerald-700 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> AI reading label...</div>}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="h-16 w-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
                        <ScanLine className="h-8 w-8 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-base font-semibold">📸 Tap to take photo</p>
                        <p className="text-xs text-muted-foreground mt-1">Or upload from gallery — works with handwritten labels too</p>
                      </div>
                    </div>
                  )}
                </div>
              </label>
              <p className="text-[11px] text-center text-muted-foreground">💡 Tip: For multiple items at once, use the &quot;Scan Logbook&quot; option instead</p>
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
                  <Input value={snapItem.location || ''} onChange={e => setSnapItem({ ...snapItem, location: e.target.value })} placeholder="Shelf 2" />
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
                <p className="text-xs font-medium">{scanItems.filter(i => i._keep).length} of {scanItems.length} selected</p>
              </div>
              <div className="border rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
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
              <div className="flex justify-between">
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
                <label className="block">
                  <input type="file" accept="image/*" className="hidden" onChange={e => onRecipeImage(e.target.files?.[0])} />
                  <div className="border-2 border-dashed border-purple-200 rounded-xl p-8 hover:border-purple-400 hover:bg-purple-50/40 transition cursor-pointer text-center">
                    {recipeImage ? (
                      <div className="space-y-3">
                        <img src={recipeImage} alt="preview" className="max-h-72 mx-auto rounded-lg shadow-sm" />
                        <p className="text-sm text-muted-foreground">Click to choose a different image</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="h-14 w-14 mx-auto rounded-full bg-purple-100 flex items-center justify-center">
                          <Upload className="h-6 w-6 text-purple-600" />
                        </div>
                        <p className="font-medium">Upload a recipe photo</p>
                        <p className="text-xs text-muted-foreground">A cookbook page, recipe card, or recipe screenshot.</p>
                      </div>
                    )}
                  </div>
                </label>
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

      {/* View saved recipe */}
      <ViewRecipeDialog recipe={viewRecipe} onClose={() => setViewRecipe(null)} onDelete={deleteRecipe} />

      {/* Setup Wizard */}
      <SetupWizard open={wizardOpen} onClose={() => setWizardOpen(false)} settings={settings} saveSettings={saveSettings} />

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        saveSettings={saveSettings}
        openWizard={() => { setSettingsOpen(false); setWizardOpen(true) }}
      />
    </div>
  )
}

// In-app Print Logbook — iOS-safe (no window.open) so users can tap Close to return.
// Uses @media print rules to hide everything except the printable sheet during printing.
// ============================================================================
// Receipt / delivery-note scanner — snap a photo → AI parses → confirm → import
// Uses GPT-4o vision to extract supplier, items, prices, categories, etc.
// ============================================================================
function ReceiptScanDialog({ open, onClose, onImport, settings }) {
  const [image, setImage] = useState(null)   // data URL
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState(null) // { supplier, items, ... }
  const [rows, setRows] = useState([])       // editable table
  const fileRef = useRef(null)

  const reset = () => { setImage(null); setResult(null); setRows([]); setParsing(false) }

  useEffect(() => { if (!open) reset() }, [open])

  const onFile = async (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImage(String(reader.result))
    reader.readAsDataURL(file)
  }

  const runParse = async () => {
    if (!image) return
    setParsing(true)
    try {
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      })
      const raw = await res.text()
      let data = null
      try { data = JSON.parse(raw) } catch { /* not JSON */ }
      if (!res.ok) {
        const msg = data?.error || raw || `HTTP ${res.status}`
        console.error('scan-receipt failed:', res.status, msg)
        throw new Error(msg.slice(0, 300))
      }
      setResult(data)
      // Seed editable rows with sensible defaults
      const seeded = (data.items || []).map(it => ({
        name: it.name || '',
        quantity: Number(it.quantity) || 1,
        unit: it.unit || 'ea',
        unitCost: it.unitCost != null ? String(it.unitCost) : '',
        category: it.category || '',
        storageType: it.storageType || 'Fridge',
        expiryDate: it.expiryDate || '',
        location: '',
        allergens: [],
        _include: true,
        _expanded: false,
      }))
      setRows(seeded)
      if (seeded.length === 0) toast.warning('No items detected — try a clearer photo')
      else toast.success(`Found ${seeded.length} items — review, edit, then import`)
    } catch (e) {
      toast.error(`Parse failed: ${e.message}`, { duration: 15000 })
    } finally {
      setParsing(false)
    }
  }

  const updateRow = (i, patch) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const removeRow = (i) => setRows(rs => rs.filter((_, idx) => idx !== i))

  const included = rows.filter(r => r._include && r.name.trim())
  const totalCost = included.reduce((sum, r) => sum + (Number(r.unitCost) || 0) * (Number(r.quantity) || 0), 0)
  const currencySymbol = CURRENCY_SYMBOL[settings?.currency] || settings?.currency || ''

  const doImport = () => {
    if (!included.length) { toast.error('Nothing to import'); return }
    const supplier = result?.supplier || ''
    // Map to product API shape
    const payload = included.map(r => ({
      name: r.name.trim(),
      quantity: Number(r.quantity) || 1,
      unit: r.unit || 'ea',
      unitCost: r.unitCost === '' || r.unitCost == null ? null : Number(r.unitCost),
      category: r.category || '',
      storageType: r.storageType || 'Fridge',
      location: r.location || '',
      expiryDate: r.expiryDate || '',
      allergens: Array.isArray(r.allergens) ? r.allergens : [],
      supplier,
      source: 'receipt',
    }))
    onImport(payload)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !parsing) onClose() }}>
      <DialogContent className="sm:max-w-[720px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">🧾 Receipt / Delivery Note Scanner</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Snap a photo of a supplier delivery note, invoice or shop receipt →
            AI extracts every line item with prices → you review → we import.
          </p>
        </DialogHeader>

        {!image && (
          <div className="py-4">
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 hover:border-emerald-400 transition"
            >
              <div className="text-5xl mb-2">📸</div>
              <p className="font-semibold text-slate-700">Tap to snap or upload receipt</p>
              <p className="text-xs text-slate-500 mt-1">JPG / PNG / HEIC — clear, well-lit shot works best</p>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => onFile(e.target.files?.[0])}
            />
            <div className="mt-4 text-xs text-slate-500 space-y-1">
              <p>💡 <b>Tips:</b></p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Lay the receipt flat on a table, camera directly above</li>
                <li>Include the header (supplier name) and all line items</li>
                <li>Good light + not blurry = fewer errors to fix</li>
              </ul>
            </div>
          </div>
        )}

        {image && !result && (
          <div className="py-2 space-y-3">
            <div className="relative">
              <img src={image} alt="receipt" className="w-full max-h-[300px] object-contain rounded-lg border" />
              <Button size="sm" variant="outline" className="absolute top-2 right-2" onClick={() => setImage(null)}>Retake</Button>
            </div>
            <Button onClick={runParse} disabled={parsing} className="w-full bg-emerald-600 hover:bg-emerald-700">
              {parsing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Parsing (this can take 10-30 seconds)…</> : '✨ Extract items with AI'}
            </Button>
          </div>
        )}

        {result && (
          <div className="py-2 space-y-3">
            <div className="flex items-center gap-3 text-xs bg-slate-50 rounded-lg p-3">
              <img src={image} alt="" className="w-16 h-16 object-cover rounded border" />
              <div className="flex-1 min-w-0">
                <p><b>Supplier:</b> {result.supplier || '—'}</p>
                <p><b>Receipt total:</b> {result.totalCost != null ? `${currencySymbol}${Number(result.totalCost).toFixed(2)}` : '—'}</p>
                <p className="text-slate-500">{included.length} of {rows.length} items selected · Σ <b>{currencySymbol}{totalCost.toFixed(2)}</b></p>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setImage(null); setResult(null); setRows([]) }}>Retake</Button>
            </div>

            <p className="text-xs text-slate-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              💡 <b>Tap any item to edit</b> — fix name, price, category, storage, expiry, allergens. Untick to skip.
            </p>

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {rows.map((r, i) => (
                <div key={i} className={`border-2 rounded-xl transition ${r._include ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                  {/* Collapsed row — tap to expand */}
                  <div className="flex items-center gap-2 p-3">
                    <input
                      type="checkbox"
                      checked={r._include}
                      onChange={e => { e.stopPropagation(); updateRow(i, { _include: e.target.checked }) }}
                      className="h-5 w-5 accent-emerald-600 shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => updateRow(i, { _expanded: !r._expanded })}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="font-semibold text-sm truncate">{r.name || '(un-named)'}</p>
                      <p className="text-[11px] text-slate-500">
                        {r.quantity} {r.unit}
                        {r.unitCost ? ` · ${currencySymbol}${Number(r.unitCost).toFixed(2)}/${r.unit}` : ''}
                        {r.category ? ` · ${r.category}` : ''}
                        {r.storageType ? ` · ${r.storageType}` : ''}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateRow(i, { _expanded: !r._expanded })}
                      className="shrink-0 text-emerald-700 font-semibold text-xs px-2 py-1 rounded hover:bg-emerald-50"
                    >
                      {r._expanded ? '▲ Done' : '✏️ Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      title="Remove"
                      className="shrink-0 text-slate-400 hover:text-red-600 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Expanded editor */}
                  {r._expanded && (
                    <div className="border-t px-3 py-3 space-y-3 bg-slate-50 rounded-b-xl">
                      <div>
                        <Label className="text-xs">Product name</Label>
                        <Input value={r.name} onChange={e => updateRow(i, { name: e.target.value })} className="h-10 text-sm bg-white" />
                      </div>
                      <div>
                        <Label className="text-xs">Quantity</Label>
                        <Input type="number" step="0.1" min="0" value={r.quantity} onChange={e => updateRow(i, { quantity: e.target.value })} className="h-10 text-sm bg-white" />
                      </div>
                      <div>
                        <Label className="text-xs">Unit</Label>
                        <select value={r.unit} onChange={e => updateRow(i, { unit: e.target.value })} className="h-10 text-sm border rounded-md w-full bg-white px-2">
                          {['ea', 'kg', 'g', 'L', 'mL', 'pack', 'box', 'bunch'].map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">Cost per unit {currencySymbol && `(${currencySymbol})`}</Label>
                        <Input type="number" step="0.01" min="0" value={r.unitCost} onChange={e => updateRow(i, { unitCost: e.target.value })} className="h-10 text-sm bg-white" placeholder="—" />
                      </div>
                      <div>
                        <Label className="text-xs">Storage</Label>
                        <select value={r.storageType} onChange={e => updateRow(i, { storageType: e.target.value })} className="h-10 text-sm border rounded-md w-full bg-white px-2">
                          {['Fridge', 'Freezer', 'Dry', 'Ambient'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">Category</Label>
                        <Input value={r.category} onChange={e => updateRow(i, { category: e.target.value })} className="h-10 text-sm bg-white" placeholder="e.g. Dairy" />
                      </div>
                      <div>
                        <Label className="text-xs">Expiry date</Label>
                        <Input type="date" value={r.expiryDate} onChange={e => updateRow(i, { expiryDate: e.target.value })} className="h-10 text-sm bg-white" />
                      </div>
                      <div>
                        <Label className="text-xs">Shelf / Location</Label>
                        <Input value={r.location} onChange={e => updateRow(i, { location: e.target.value })} className="h-10 text-sm bg-white" placeholder="e.g. Shelf A2" />
                      </div>
                      <div>
                        <Label className="text-xs">Allergens ({r.allergens?.length || 0})</Label>
                        <div className="grid grid-cols-2 gap-1 mt-1">
                          {ALLERGENS.map(a => {
                            const active = r.allergens?.includes(a.id)
                            return (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => updateRow(i, {
                                  allergens: active
                                    ? (r.allergens || []).filter(x => x !== a.id)
                                    : [...(r.allergens || []), a.id]
                                })}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] text-left transition ${
                                  active ? 'border-red-300 bg-red-50 text-red-800 font-semibold' : 'border-slate-200 bg-white text-slate-600'
                                }`}
                              >
                                <span>{a.emoji}</span><span className="truncate">{a.label.split(' (')[0]}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {rows.length === 0 && (
                <p className="p-6 text-center text-slate-500 text-sm">No items to import.</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={parsing}>Cancel</Button>
          {result && (
            <Button onClick={doImport} disabled={!included.length || parsing} className="bg-emerald-600 hover:bg-emerald-700">
              <Check className="h-4 w-4 mr-2" /> Import {included.length} items
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PrintLogbookDialog({ open, onClose, kitchenName, kitchenType }) {
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const rows = Array.from({ length: 25 })

  const handlePrint = () => {
    // Give the browser a tick to apply layout before printing
    setTimeout(() => window.print(), 100)
  }

  if (!open) return null

  return (
    <>
      {/* Print-only CSS: hide everything except .print-logbook-sheet when printing */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden !important; }
          .print-logbook-sheet, .print-logbook-sheet * { visibility: visible !important; }
          .print-logbook-sheet { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
          .print-hide { display: none !important; }
          @page { size: A4; margin: 14mm; }
        }
      `}} />
      <div className="fixed inset-0 z-[100] bg-slate-50 overflow-y-auto">
        {/* Top bar with Close + Print (hidden when printing) */}
        <div className="print-hide sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <X className="h-4 w-4" /> Close
            </button>
          </div>
          <div className="text-sm font-semibold text-slate-700">📋 Daily Logbook</div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1 px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
        </div>

        {/* The printable sheet */}
        <div className="print-logbook-sheet max-w-[820px] mx-auto bg-white p-6 md:p-10 my-4 shadow print:shadow-none print:my-0 print:max-w-none">
          <div className="flex items-start justify-between border-b-[3px] border-emerald-500 pb-3 mb-3">
            <div>
              <div className="text-[22px] font-extrabold text-emerald-800">🍳 {kitchenName}</div>
              <div className="text-[11px] text-slate-500">
                {kitchenType ? `${kitchenType} • ` : ''}Daily Inventory Logbook — powered by ShelfWise
              </div>
            </div>
            <div className="text-right text-xs text-slate-600">
              <div className="text-sm font-semibold text-slate-900">{today}</div>
              <div>Shift: ___________________</div>
              <div>Logged by: _______________</div>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-[11px] text-emerald-800 mb-3">
            📸 <b>End of shift:</b> Snap a photo of this completed sheet using ShelfWise → "Scan Logbook" and all items get added automatically. Write clearly!
          </div>

          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr>
                <th className="border border-slate-400 bg-slate-100 px-1.5 py-1.5 text-left text-slate-700 text-[11px] w-6">#</th>
                <th className="border border-slate-400 bg-slate-100 px-1.5 py-1.5 text-left text-slate-700 text-[11px]" style={{ width: '24%' }}>Product</th>
                <th className="border border-slate-400 bg-slate-100 px-1.5 py-1.5 text-left text-slate-700 text-[11px]" style={{ width: '8%' }}>Qty</th>
                <th className="border border-slate-400 bg-slate-100 px-1.5 py-1.5 text-left text-slate-700 text-[11px]" style={{ width: '9%' }}>Unit</th>
                <th className="border border-slate-400 bg-slate-100 px-1.5 py-1.5 text-left text-slate-700 text-[11px]" style={{ width: '13%' }}>Expiry (DD/MM/YY)</th>
                <th className="border border-slate-400 bg-slate-100 px-1.5 py-1.5 text-left text-slate-700 text-[11px]" style={{ width: '11%' }}>Storage</th>
                <th className="border border-slate-400 bg-slate-100 px-1.5 py-1.5 text-left text-slate-700 text-[11px]" style={{ width: '14%' }}>Shelf / Loc.</th>
                <th className="border border-slate-400 bg-slate-100 px-1.5 py-1.5 text-left text-slate-700 text-[11px]">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((_, i) => (
                <tr key={i}>
                  <td className="border border-slate-400 px-1.5 py-2 text-center text-slate-400">{i + 1}</td>
                  <td className="border border-slate-400 px-1.5 py-2 h-7"></td>
                  <td className="border border-slate-400 px-1.5 py-2 h-7"></td>
                  <td className="border border-slate-400 px-1.5 py-2 h-7"></td>
                  <td className="border border-slate-400 px-1.5 py-2 h-7"></td>
                  <td className="border border-slate-400 px-1.5 py-2 h-7"></td>
                  <td className="border border-slate-400 px-1.5 py-2 h-7"></td>
                  <td className="border border-slate-400 px-1.5 py-2 h-7"></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] text-slate-400 text-center mt-2">
            Units: ea / kg / g / L / mL / pack / bunch / box • Storage: Fridge (F) / Freezer (Fr) / Dry (D) / Ambient (A)
          </div>
        </div>

        {/* Bottom close button (mobile-friendly) */}
        <div className="print-hide max-w-[820px] mx-auto px-6 pb-8">
          <button
            onClick={onClose}
            className="w-full py-3 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50"
          >
            ← Close and return to ShelfWise
          </button>
        </div>
      </div>
    </>
  )
}

function ExpiryScanDialog({ open, onClose, onDateFound }) {
  const videoRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const streamRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setError('')
    setBusy(false)
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
      } catch (e) {
        if (!cancelled) setError('Camera blocked. Allow camera permission and try again.')
      }
    })()
    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [open])

  const captureAndScan = async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) {
      toast.error('Camera not ready yet — wait a moment.')
      return
    }
    setBusy(true)
    try {
      // Capture current frame to a canvas
      const maxDim = 1400
      let w = video.videoWidth
      let h = video.videoHeight
      if (w > maxDim || h > maxDim) {
        const scale = Math.min(maxDim / w, maxDim / h)
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      // Send to AI for date extraction
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      const item = (data.items || []).find(it => it.expiryDate) || (data.items || [])[0]
      if (item?.expiryDate) {
        try { navigator.vibrate?.(60) } catch {}
        onDateFound(item.expiryDate)
      } else {
        toast.warning('Date not detected — try a clearer angle or type manually.')
      }
    } catch (e) {
      toast.error('Could not read date. Try again or type manually.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📅 Scan Expiry Date
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Point camera at the printed expiry date and tap the green button to capture.</p>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <div className="rounded-xl overflow-hidden bg-black relative w-full" style={{ aspectRatio: '4/3', minHeight: '280px' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            {!error && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                <div className="w-[80%] h-[30%] border-[3px] border-amber-400 rounded-lg shadow-lg flex items-center justify-center">
                  <span className="text-amber-300 text-xs font-bold bg-black/50 px-2 py-0.5 rounded">EXPIRY DATE</span>
                </div>
              </div>
            )}
            {busy && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-sm font-medium gap-2 z-20">
                <Loader2 className="h-5 w-5 animate-spin" /> AI reading date...
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{error}</p>
          )}

          <Button
            type="button"
            onClick={captureAndScan}
            disabled={busy || !!error}
            className="w-full h-14 text-base bg-emerald-600 hover:bg-emerald-700 font-bold shadow-lg"
          >
            {busy ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Reading...</> : <>📸 Capture Date</>}
          </Button>

          <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-900">
            <p className="font-semibold mb-1">💡 Tips:</p>
            <ul className="list-disc pl-4 space-y-0.5 text-blue-800">
              <li>Point at the <strong>printed expiry date</strong> (BB / EXP / Use By)</li>
              <li>Hold steady, good lighting helps</li>
              <li>Single tap to capture — no &quot;Use Photo&quot; step!</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BarcodeScanDialog({ open, onClose, onFound, loading, onManual }) {
  const [manualCode, setManualCode] = useState('')
  const [scannerError, setScannerError] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const [scanning, setScanning] = useState(false)
  const scannerRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setManualCode('')
    setScannerError('')
    setShowManual(false)
    setTorchOn(false)
    setHasTorch(false)
    setScanning(false)
    let scanner
    let cancelled = false
    ;(async () => {
      try {
        const mod = await import('html5-qrcode')
        if (cancelled) return
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = mod
        const elId = 'barcode-reader-region'
        scanner = new Html5Qrcode(elId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
          ],
          verbose: false,
        })
        scannerRef.current = scanner
        // Use full video frame for scanning (no qrbox restriction)
        // My custom green box (above) serves as the visual aim indicator.
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            aspectRatio: 1.333,
            videoConstraints: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          (decoded) => {
            if (cancelled) return
            try { navigator.vibrate?.(60) } catch {}
            onFound(decoded)
          },
          () => {}
        )
        setScanning(true)
        // Detect torch support
        try {
          const stream = scanner.getRunningTrackCameraCapabilities?.()
          if (stream && typeof stream.torchFeature === 'function') {
            const f = stream.torchFeature()
            if (f?.isSupported && f.isSupported()) setHasTorch(true)
          }
        } catch {}
      } catch (e) {
        if (cancelled) return
        setScannerError('Camera access blocked or unavailable. Tap "Allow" when your phone asks, or enter the barcode manually below.')
        setShowManual(true)
      }
    })()
    return () => {
      cancelled = true
      const s = scannerRef.current
      if (s) {
        try { s.stop().then(() => s.clear()).catch(() => {}) } catch {}
        scannerRef.current = null
      }
    }
  }, [open])

  const toggleTorch = async () => {
    try {
      const s = scannerRef.current
      if (!s) return
      const caps = s.getRunningTrackCameraCapabilities?.()
      if (caps?.torchFeature) {
        await caps.torchFeature().apply(!torchOn)
        setTorchOn(!torchOn)
      }
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-emerald-600" /> Scan Barcode
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Hold steady, center the barcode in the green box. Works best with good lighting.</p>
        </DialogHeader>

        <div className="py-2 space-y-3">
          {!showManual && (
            <div
              className="rounded-xl overflow-hidden bg-black relative w-full"
              style={{ aspectRatio: '4/3', minHeight: '280px' }}
            >
              <div id="barcode-reader-region" />
              {!scannerError && !loading && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                  <div className="w-[80%] h-[40%] border-[3px] border-emerald-400 rounded-lg shadow-lg"></div>
                </div>
              )}
              {hasTorch && scanning && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`absolute bottom-3 right-3 h-10 w-10 rounded-full flex items-center justify-center text-xl shadow-lg transition ${torchOn ? 'bg-amber-400 text-white' : 'bg-white/90 text-slate-800'}`}
                  aria-label="Toggle torch"
                >
                  💡
                </button>
              )}
              {loading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-sm font-medium gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Looking up product...
                </div>
              )}
            </div>
          )}

          {scannerError && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{scannerError}</p>
          )}

          <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-900">
            <p className="font-semibold mb-1">📷 Tips for better scanning:</p>
            <ul className="list-disc pl-4 space-y-0.5 text-blue-800">
              <li>Hold phone <strong>10-15 cm</strong> away from barcode</li>
              <li>Make sure barcode is <strong>flat & well-lit</strong></li>
              <li>Tap 💡 torch button (above) in dim lighting</li>
              <li>If it fails after 5 sec → type the digits manually below</li>
            </ul>
          </div>

          <div className="space-y-2">
            <button type="button" className="text-xs text-emerald-700 underline" onClick={() => setShowManual(!showManual)}>
              {showManual ? '← Use camera instead' : '⌨️ Type barcode digits manually'}
            </button>
            {showManual && (
              <form onSubmit={(e) => { e.preventDefault(); if (manualCode.trim()) onManual(manualCode.trim()) }} className="flex gap-2">
                <Input value={manualCode} onChange={e => setManualCode(e.target.value.replace(/[^\d]/g, ''))} placeholder="Enter barcode digits (e.g. 5012345678900)" autoFocus inputMode="numeric" />
                <Button type="submit" disabled={!manualCode.trim() || loading} className="bg-emerald-600 hover:bg-emerald-700">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look up'}
                </Button>
              </form>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground text-center">💡 Powered by Open Food Facts (2.8M+ products) — some barcodes may not be in the free database</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UseTodayPanel({ products, goToInventory, formatDate }) {
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
            <p className="text-sm text-emerald-700">Keep up the great work, Chef.</p>
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

function DashboardView({ stats, products, goToInventory, seedData, openAdd, openScan, openSnap, openBarcode, openVoice, openReceipt, printLogbook, openRecipe, onViewRecipe, widgets, recipesCount, gotoRecipes, currency }) {
  const [quickSearch, setQuickSearch] = useState('')
  const [globalResults, setGlobalResults] = useState(null)
  const [globalLoading, setGlobalLoading] = useState(false)
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

  const cardsAll = [
    { key: 'all_items', label: 'All Items', value: stats.total, icon: Boxes, color: 'from-slate-500 to-slate-700', accent: 'text-slate-600', bg: 'bg-slate-50', filterKey: 'All' },
    { key: 'expiring', label: 'Expiring Soon', value: stats.expiring, icon: Clock, color: 'from-amber-500 to-orange-500', accent: 'text-amber-600', bg: 'bg-amber-50', filterKey: 'Expiring' },
    { key: 'expired', label: 'Expired', value: stats.expired, icon: PackageX, color: 'from-red-500 to-rose-600', accent: 'text-red-600', bg: 'bg-red-50', filterKey: 'Expired' },
    { key: 'critical', label: 'Critical Stock', value: stats.critical, icon: AlertTriangle, color: 'from-orange-500 to-red-500', accent: 'text-orange-600', bg: 'bg-orange-50', filterKey: 'Critical' },
    { key: 'in_date', label: 'In Date', value: stats.inDate || 0, icon: Check, color: 'from-emerald-500 to-teal-600', accent: 'text-emerald-600', bg: 'bg-emerald-50', filterKey: 'Ok' },
    { key: 'recipes', label: 'Recipes', value: recipesCount ?? '—', icon: BookOpen, color: 'from-purple-500 to-fuchsia-600', accent: 'text-purple-600', bg: 'bg-purple-50', onClick: gotoRecipes },
    { key: 'inv_value', label: 'Inventory Value', value: stats.totalValue > 0 ? `${CURRENCY_SYMBOL[currency] || ''}${stats.totalValue.toFixed(0)}` : '—', icon: Sparkles, color: 'from-emerald-500 to-emerald-700', accent: 'text-emerald-600', bg: 'bg-emerald-50' },
    { key: 'reorder', label: 'Below Reorder', value: stats.belowReorder || 0, icon: PackageX, color: 'from-orange-500 to-orange-700', accent: 'text-orange-600', bg: 'bg-orange-50', filterKey: 'All' },
  ]
  const cards = cardsAll.filter(c => show(c.key))
  const isEmpty = stats.total === 0

  // Time-based greeting for the hero
  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night'
  const greetingEmoji = hour < 5 ? '🌙' : hour < 12 ? '☀️' : hour < 17 ? '🌤️' : hour < 21 ? '🌆' : '🌙'

  return (
    <div className="space-y-6">
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
            <Button size="sm" onClick={openAdd} className="bg-white text-emerald-700 hover:bg-emerald-50 font-semibold shadow-md">
              <Plus className="h-4 w-4 mr-2" /> Add Product
            </Button>
          </div>
        </div>
      </div>

      {/* Quick-scan action grid — 4 buttons in a row on desktop, 2×2 on mobile */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <button onClick={openVoice} className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 hover:border-purple-300 transition text-purple-800">
          <span className="text-2xl">🎤</span>
          <span className="text-xs font-semibold">Voice</span>
        </button>
        <button onClick={openBarcode} className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition text-blue-800">
          <span className="text-2xl">🔢</span>
          <span className="text-xs font-semibold">Barcode</span>
        </button>
        <button onClick={openSnap} className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300 transition text-emerald-800">
          <span className="text-2xl">📸</span>
          <span className="text-xs font-semibold">Snap Label</span>
        </button>
        <button onClick={openReceipt} className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-fuchsia-200 bg-fuchsia-50 hover:bg-fuchsia-100 hover:border-fuchsia-300 transition text-fuchsia-800 relative">
          <span className="text-2xl">🧾</span>
          <span className="text-xs font-semibold">Receipt</span>
          <span className="absolute top-1 right-1 text-[8px] font-bold bg-fuchsia-600 text-white rounded px-1">NEW</span>
        </button>
        <button onClick={openScan} className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-teal-200 bg-teal-50 hover:bg-teal-100 hover:border-teal-300 transition text-teal-800">
          <span className="text-2xl">📋</span>
          <span className="text-xs font-semibold">Scan Logbook</span>
        </button>
        <button onClick={printLogbook} className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-300 transition text-amber-800">
          <span className="text-2xl">📒</span>
          <span className="text-xs font-semibold">Print Logbook</span>
        </button>
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
    </div>
  )
}

function ExpiryAlertBanner({ stats, goToInventory }) {
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

function UrgentList() {
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

function RecipeResult({ result, setResult, onBack, onClose, goToInventory, onSave, saving }) {
  const [genLoading, setGenLoading] = useState(false)
  const [newAllergen, setNewAllergen] = useState('')
  const [addingAllergen, setAddingAllergen] = useState(false)

  const addAllergen = () => {
    const v = newAllergen.trim().toLowerCase()
    if (!v) return
    const existing = (result.allergens || []).map(a => a.toLowerCase())
    if (existing.includes(v)) {
      toast.info('Already in the list')
      return
    }
    setResult({ ...result, allergens: [...(result.allergens || []), v] })
    setNewAllergen('')
    setAddingAllergen(false)
    toast.success(`Added "${v}" to allergens`)
  }

  const removeAllergen = (a) => {
    setResult({ ...result, allergens: (result.allergens || []).filter(x => x !== a) })
  }

  const generateInstructions = async () => {
    setGenLoading(true)
    try {
      const res = await fetch('/api/recipe-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: result.title || '',
          ingredients: (result.ingredients || result.matched || []).map(i => i.name || i),
          servings: result.servings || ''
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setResult({ ...result, instructions: data.instructions || [], source: data.source || 'AI Generated' })
      toast.success('Cooking method generated by AI ✨')
    } catch (e) {
      toast.error(e.message || 'Could not generate cooking method')
    } finally {
      setGenLoading(false)
    }
  }
  const [scale, setScale] = useState(1)
  const scaleQty = (q) => {
    const n = Number(q) || 0
    const scaled = n * scale
    // pretty-format: integer if whole, else 2 decimals (trimmed)
    return Number.isInteger(scaled) ? scaled : Math.round(scaled * 100) / 100
  }
  return (
    <div className="space-y-5 py-2">
      {/* BIG allergen warning banner at the TOP — now editable */}
      <div className={`rounded-xl border-2 p-4 ${result.allergens?.length ? 'border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50' : 'border-slate-200 bg-slate-50/40'}`}>
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${result.allergens?.length ? 'bg-amber-200' : 'bg-slate-200'}`}>
            <ShieldAlert className={`h-6 w-6 ${result.allergens?.length ? 'text-amber-700' : 'text-slate-500'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className={`text-sm font-bold uppercase tracking-wider ${result.allergens?.length ? 'text-amber-900' : 'text-slate-700'}`}>
                {result.allergens?.length ? '⚠️ Contains Allergens' : 'No allergens detected'}
              </p>
              {!addingAllergen && (
                <Button size="sm" variant="outline" onClick={() => setAddingAllergen(true)} className="h-7 px-2.5 text-xs border-amber-400 text-amber-800 hover:bg-amber-100">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add allergen
                </Button>
              )}
            </div>
            <p className={`text-xs mt-0.5 ${result.allergens?.length ? 'text-amber-800' : 'text-slate-600'}`}>
              {result.allergens?.length ? 'Review carefully before serving. Tap × to remove a wrong tag, or + to add a missing one.' : 'AI did not flag any. Use + to add one if you know it contains one.'}
            </p>
            <div className="flex flex-wrap gap-2 mt-2.5">
              {(result.allergens || []).map(a => (
                <span key={a} className="px-3 py-1 rounded-full bg-amber-200 text-amber-900 text-sm font-semibold capitalize border border-amber-400 inline-flex items-center gap-1.5">
                  {a}
                  <button onClick={() => removeAllergen(a)} className="hover:bg-amber-300 rounded-full h-5 w-5 flex items-center justify-center -mr-1" aria-label={`Remove ${a}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {addingAllergen && (
                <div className="inline-flex items-center gap-1.5 bg-white rounded-full border-2 border-amber-400 pl-3 pr-1 py-0.5">
                  <input
                    autoFocus
                    value={newAllergen}
                    onChange={e => setNewAllergen(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addAllergen()
                      if (e.key === 'Escape') { setAddingAllergen(false); setNewAllergen('') }
                    }}
                    placeholder="e.g. sesame, mustard..."
                    className="text-sm border-0 outline-none bg-transparent w-36"
                    maxLength={30}
                  />
                  <button onClick={addAllergen} className="h-6 w-6 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 flex items-center justify-center">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => { setAddingAllergen(false); setNewAllergen('') }} className="h-6 w-6 rounded-full hover:bg-slate-100 flex items-center justify-center">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-2xl font-bold">{result.title || 'Recipe Analysis'}</h3>
        {result.servings && <p className="text-sm text-muted-foreground">{result.servings}</p>}
      </div>

      {/* Scale selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scale recipe</span>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => setScale(n)}
            className={`h-9 w-12 rounded-lg border-2 font-bold text-sm transition ${scale === n ? 'border-purple-500 bg-purple-600 text-white' : 'border-slate-200 hover:border-purple-300 bg-white text-slate-700'}`}>
            {n}×
          </button>
        ))}
        {scale > 1 && <span className="text-xs text-muted-foreground italic">Quantities multiplied by {scale}</span>}
      </div>

      <div>
        <p className="font-semibold mb-2 text-sm">Ingredients ({result.matched?.length || 0})</p>
        <div className="border rounded-lg divide-y overflow-hidden max-h-[360px] overflow-y-auto">
          {(result.matched || []).map((m, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm capitalize">{m.name}</p>
                <p className="text-xs text-muted-foreground">{scaleQty(m.quantity)} {m.unit}{m.notes ? ` · ${m.notes}` : ''}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {result.steps?.length > 0 && (
        <details className="border rounded-lg p-3">
          <summary className="font-semibold text-sm cursor-pointer">Cooking Steps ({result.steps.length})</summary>
          <ol className="list-decimal list-inside mt-2 space-y-1 text-sm text-muted-foreground">
            {result.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </details>
      )}

      {/* AI-generated cooking method (shown when original recipe has no instructions) */}
      <div className="border-2 border-purple-200 bg-purple-50/40 rounded-xl p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="font-semibold text-sm flex items-center gap-1.5">👨‍🍳 Cooking Method</p>
            <p className="text-xs text-muted-foreground">
              {Array.isArray(result.instructions) && result.instructions.length > 0
                ? `AI-generated method · ${result.source || 'based on best recipe sources'}`
                : 'No cooking instructions in this recipe — let AI write them based on the ingredients.'}
            </p>
          </div>
          <Button size="sm" onClick={generateInstructions} disabled={genLoading} className="bg-purple-600 hover:bg-purple-700 shrink-0">
            {genLoading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Cooking...</> : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> {Array.isArray(result.instructions) && result.instructions.length > 0 ? 'Regenerate' : 'Generate with AI'}</>}
          </Button>
        </div>
        {Array.isArray(result.instructions) && result.instructions.length > 0 && (
          <ol className="list-decimal list-outside ml-5 space-y-2 text-sm text-slate-700 mt-3">
            {result.instructions.map((step, i) => (
              <li key={i} className="leading-relaxed">{step}</li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex justify-between pt-2 border-t">
        <Button variant="ghost" onClick={onBack}><X className="h-4 w-4 mr-2" /> Scan another</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : <><Check className="h-4 w-4 mr-2" /> Save Recipe</>}
          </Button>
          <Button onClick={onClose} className="bg-purple-600 hover:bg-purple-700">Done</Button>
        </div>
      </div>
    </div>
  )
}

function RecipesView({ recipes, search, setSearch, openRecipe, onView, onDelete }) {
  const [tab, setTab] = useState('saved') // 'saved' | 'scan'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Recipes</h2>
        <p className="text-muted-foreground mt-1">Browse saved recipes or scan a new one</p>
      </div>

      {/* Two-tab toggle */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button onClick={() => setTab('saved')}
          className={`text-left rounded-xl border-2 p-5 transition ${tab === 'saved' ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:border-purple-300 bg-white'}`}>
          <div className="flex items-center gap-3">
            <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${tab === 'saved' ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-600'}`}>
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Saved Recipes</p>
              <p className="text-xs text-muted-foreground">{recipes.length} recipe{recipes.length !== 1 ? 's' : ''} in your collection</p>
            </div>
          </div>
        </button>
        <button onClick={() => { setTab('scan'); openRecipe() }}
          className={`text-left rounded-xl border-2 p-5 transition ${tab === 'scan' ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:border-purple-300 bg-white'}`}>
          <div className="flex items-center gap-3">
            <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${tab === 'scan' ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-600'}`}>
              <ScanLine className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Scan or Upload Recipe</p>
              <p className="text-xs text-muted-foreground">Paste text or upload a recipe photo</p>
            </div>
          </div>
        </button>
      </div>

      {tab === 'saved' && (
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="relative max-w-md mb-4">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search saved recipes..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {recipes.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No saved recipes yet</p>
                <p className="text-sm">Click "Scan or Upload Recipe" above to start your collection.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recipes.map(r => (
                  <button key={r.id} onClick={() => onView(r)} className="text-left">
                    <Card className="hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer h-full">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base line-clamp-2">{r.title || 'Untitled'}</CardTitle>
                        {r.servings && <CardDescription>{r.servings}</CardDescription>}
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {Array.isArray(r.allergens) && r.allergens.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {r.allergens.slice(0, 5).map(a => (
                              <Badge key={a} variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 capitalize text-[10px]">{a}</Badge>
                            ))}
                            {r.allergens.length > 5 && <Badge variant="outline" className="text-[10px]">+{r.allergens.length - 5}</Badge>}
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{Array.isArray(r.ingredients) ? r.ingredients.length : 0} ingredients</span>
                          <span>{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ViewRecipeDialog({ recipe, onClose, onDelete }) {
  const [scale, setScale] = useState(1)
  useEffect(() => { setScale(1) }, [recipe?.id])
  const scaleQty = (q) => {
    const n = Number(q) || 0
    const scaled = n * scale
    return Number.isInteger(scaled) ? scaled : Math.round(scaled * 100) / 100
  }
  if (!recipe) return null
  return (
    <Dialog open={!!recipe} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[760px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-purple-600" /> {recipe.title || 'Untitled recipe'}</DialogTitle>
          {recipe.servings && <p className="text-sm text-muted-foreground">{recipe.servings}</p>}
        </DialogHeader>

        {Array.isArray(recipe.allergens) && recipe.allergens.length > 0 && (
          <div className="rounded-xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-200 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-6 w-6 text-amber-700" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-900 uppercase tracking-wider">⚠️ Contains Allergens</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {recipe.allergens.map(a => (
                    <span key={a} className="px-3 py-1 rounded-full bg-amber-200 text-amber-900 text-sm font-semibold capitalize border border-amber-400">{a}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scale recipe</span>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setScale(n)}
              className={`h-9 w-12 rounded-lg border-2 font-bold text-sm transition ${scale === n ? 'border-purple-500 bg-purple-600 text-white' : 'border-slate-200 hover:border-purple-300 bg-white text-slate-700'}`}>
              {n}×
            </button>
          ))}
          {scale > 1 && <span className="text-xs text-muted-foreground italic">Quantities multiplied by {scale}</span>}
        </div>

        <div>
          <p className="font-semibold text-sm mb-2">Ingredients</p>
          <ul className="space-y-1 text-sm border rounded-lg divide-y">
            {(recipe.ingredients || []).map((ing, i) => (
              <li key={i} className="px-3 py-2 flex justify-between">
                <span className="capitalize">{ing.name}</span>
                <span className="text-muted-foreground">{scaleQty(ing.quantity)} {ing.unit}{ing.notes ? ` · ${ing.notes}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>

        {recipe.steps?.length > 0 && (
          <div>
            <p className="font-semibold text-sm mb-2">Cooking Steps</p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              {recipe.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
        )}

        {Array.isArray(recipe.instructions) && recipe.instructions.length > 0 && (
          <div className="border-2 border-purple-200 bg-purple-50/40 rounded-xl p-4">
            <p className="font-semibold text-sm mb-1 flex items-center gap-1.5">👨‍🍳 Cooking Method <span className="text-[10px] font-normal text-muted-foreground">{recipe.source || '· AI-generated'}</span></p>
            <ol className="list-decimal list-outside ml-5 space-y-2 text-sm text-slate-700 mt-2">
              {recipe.instructions.map((s, i) => <li key={i} className="leading-relaxed">{s}</li>)}
            </ol>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => { onDelete(recipe.id); onClose() }}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </Button>
          <Button onClick={onClose} className="bg-purple-600 hover:bg-purple-700">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InventoryView({ products, loading, statusFilter, setStatusFilter, search, setSearch, sort, setSort, categoryFilter, setCategoryFilter, storageFilter, setStorageFilter, facets, openAdd, openScan, openSnap, openBarcode, openVoice, printLogbook, openEdit, deleteProduct, openDispose, exportCSV, formatDate }) {
  const activeFilters = [statusFilter !== 'All', categoryFilter !== 'All', storageFilter !== 'All', !!search].filter(Boolean).length
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground mt-1">Showing {products.length} item{products.length !== 1 ? 's' : ''}{statusFilter !== 'All' ? ` · filtered by ${STATUS_META[statusFilter]?.label || statusFilter}` : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
          <Button variant="outline" onClick={openVoice} className="border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 font-semibold">🎤 Voice</Button>
          <Button variant="outline" onClick={openBarcode} className="border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold"><ScanLine className="h-4 w-4 mr-2" /> 🔢 Barcode</Button>
          <Button variant="outline" onClick={openSnap} className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold"><Sparkles className="h-4 w-4 mr-2" /> 📸 Snap Label</Button>
          <Button variant="outline" onClick={openScan} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"><ScanLine className="h-4 w-4 mr-2" /> Scan Logbook</Button>
          <Button variant="outline" onClick={printLogbook} className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100">📒 Print Logbook</Button>
          <Button onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-2" /> Add Product</Button>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search by product name..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="Expiring">Expiring Soon</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Critical">Critical Stock</SelectItem>
                <SelectItem value="Ok">OK</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Categories</SelectItem>
                {facets.categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={storageFilter} onValueChange={setStorageFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Storage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Storage</SelectItem>
                {facets.storages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setSort(sort === 'asc' ? 'desc' : 'asc')}>
              <ArrowUpDown className="h-4 w-4 mr-2" /> Expiry {sort === 'asc' ? '↑' : '↓'}
            </Button>
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" onClick={() => { setStatusFilter('All'); setCategoryFilter('All'); setStorageFilter('All'); setSearch('') }}>
                <X className="h-4 w-4 mr-1" /> Clear ({activeFilters})
              </Button>
            )}
          </div>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-14"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Prepared By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : products.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">No products match your filters.</TableCell></TableRow>
                ) : products.map(p => (
                  <TableRow key={p.id} className="hover:bg-slate-50/60">
                    <TableCell>
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" className="h-10 w-10 rounded-md object-cover border" />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-slate-100 border flex items-center justify-center text-slate-300">
                          <Package className="h-4 w-4" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>{p.name}</div>
                      {Array.isArray(p.allergens) && p.allergens.length > 0 && (
                        <div className="flex gap-0.5 flex-wrap mt-0.5">
                          {p.allergens.slice(0, 5).map(a => {
                            const meta = ALLERGENS.find(x => x.id === a)
                            return meta ? (
                              <span key={a} title={meta.label} className="text-[10px]">{meta.emoji}</span>
                            ) : null
                          })}
                          {p.allergens.length > 5 && <span className="text-[9px] text-red-600 font-bold">+{p.allergens.length - 5}</span>}
                        </div>
                      )}
                      {p.reorderPoint != null && Number(p.quantity) <= Number(p.reorderPoint) && (
                        <span className="inline-block mt-0.5 text-[9px] font-bold text-orange-700 bg-orange-100 rounded px-1">⚠ REORDER</span>
                      )}
                    </TableCell>
                    <TableCell>{p.quantity} {p.unit}</TableCell>
                    <TableCell>{formatDate(p.expiryDate)}</TableCell>
                    <TableCell>{p.category || '—'}</TableCell>
                    <TableCell>{p.storageType}</TableCell>
                    <TableCell>{p.location || '—'}</TableCell>
                    <TableCell>{p.preparedBy || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_META[p._status]?.color}>{STATUS_META[p._status]?.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => openDispose(p)}
                          title="Dispose / Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SetupWizardV2({ settings, onComplete }) {
  const [step, setStep] = useState(1)
  const [modules, setModules] = useState([])
  const [widgets, setWidgets] = useState([])
  const [busy, setBusy] = useState(false)
  // Step 0: kitchen basics — pre-filled if already saved
  const [kitchenName, setKitchenName] = useState(settings?.kitchenName || settings?.kitchen_name || '')
  const [kitchenType, setKitchenType] = useState(settings?.kitchenType || settings?.kitchen_type || '')
  const [timezone, setTimezone] = useState(settings?.timezone || 'Asia/Kolkata')

  const KITCHEN_TYPES = ['Restaurant', 'Cafe', 'Hospital', 'Hotel', 'School', 'Catering', 'Bakery', 'Ghost Kitchen', 'Other']
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

  const MODULES = [
    { id: 'stock',     title: 'Stock Monitoring',        desc: 'Track expiries, low stock and inventory alerts.', icon: Package, ready: true },
    { id: 'recipes',   title: 'Recipes',                 desc: 'Scan recipes & check ingredient availability.', icon: BookOpen, ready: true },
    { id: 'rota',      title: 'Rota (Staff Scheduling)', desc: 'Plan weekly shifts, roles and days off.',        icon: ChefHat,  ready: true },
    { id: 'analytics', title: 'Waste Analytics',         desc: 'Track disposed items, reasons and cost of waste.', icon: BarChart3, ready: true },
  ]

  const WIDGETS_BY_MODULE = {
    stock: [
      { id: 'all_items', title: 'All Items',       desc: 'Total items count.' },
      { id: 'critical',  title: 'Critical Stock',  desc: 'Very low quantity items.' },
      { id: 'expired',   title: 'Expired',         desc: 'Items past expiry date.' },
      { id: 'expiring',  title: 'Expiring Soon',   desc: 'Expiring within 7 days.' },
      { id: 'in_date',   title: 'In Date',         desc: 'Items with valid future dates.' },
      { id: 'use_today', title: 'Use Today',       desc: 'Urgent — use today or tomorrow.' },
    ],
    recipes: [
      { id: 'recipes',   title: 'Recipes',         desc: 'Shortcut card to your saved recipes.' },
    ],
    rota: [
      { id: 'rota_today', title: 'Today\'s Rota',  desc: 'Who is on shift today.' },
    ],
    analytics: [
      { id: 'waste_week', title: 'Waste (this week)', desc: 'Items disposed in the last 7 days.' },
    ],
  }

  const toggle = (list, setter, id) => {
    setter(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }

  const visibleGroups = modules
    .filter(m => WIDGETS_BY_MODULE[m])
    .map(m => ({ module: m, widgets: WIDGETS_BY_MODULE[m], title: MODULES.find(x => x.id === m)?.title }))

  const canSkipWidgetStep = visibleGroups.every(g => g.widgets.length === 0)

  async function finish() {
    if (busy) return
    setBusy(true)
    try {
      await onComplete({
        kitchenName: kitchenName.trim(),
        kitchenType,
        timezone,
        modulesEnabled: modules,
        dashboardWidgets: widgets,
      })
    } finally {
      setBusy(false)
    }
  }

  const totalSteps = canSkipWidgetStep ? 2 : 3

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-emerald-50 via-white to-teal-50 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-4 md:p-8 min-h-full">
        <div className="flex flex-col items-center mb-6">
          <img src="/logo-icon.png" alt="ShelfWise" className="h-16 w-16 rounded-2xl object-contain bg-white shadow-md" />
          <h1 className="text-2xl font-bold text-emerald-900 mt-3">Welcome to ShelfWise!</h1>
          <p className="text-sm text-emerald-700/70 mt-1">Let's set up your kitchen. Takes about a minute.</p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-6 max-w-md mx-auto">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`flex-1 h-1.5 rounded-full ${step >= i + 1 ? 'bg-emerald-500' : 'bg-slate-200'}`} />
          ))}
        </div>

        {/* Step 1 — kitchen basics */}
        {step === 1 && (
          <Card className="shadow-lg border-emerald-100">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="font-bold text-lg text-emerald-900">Step 1 · Kitchen details</h2>
                <p className="text-sm text-muted-foreground">Tell us about your kitchen.</p>
              </div>
              <div>
                <Label>Kitchen name *</Label>
                <Input value={kitchenName} onChange={e => setKitchenName(e.target.value)} placeholder="e.g. Bella Cucina" required autoFocus />
              </div>
              <div>
                <Label>Kitchen type</Label>
                <Select value={kitchenType} onValueChange={setKitchenType}>
                  <SelectTrigger><SelectValue placeholder="Choose one..." /></SelectTrigger>
                  <SelectContent>
                    {KITCHEN_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Timezone *</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500 mt-1">Your chef codes rotate at midnight in this timezone.</p>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={() => setStep(2)} disabled={!kitchenName.trim()} className="bg-emerald-600 hover:bg-emerald-700">
                  Next <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2 — module picker */}
        {step === 2 && (
          <Card className="shadow-lg border-emerald-100">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="font-bold text-lg text-emerald-900">Step 2 · What do you want to track?</h2>
                <p className="text-sm text-muted-foreground">Pick the tools your kitchen needs. You can add more later in Settings.</p>
              </div>
              <div className="space-y-2">
                {MODULES.map(m => {
                  const active = modules.includes(m.id)
                  const Icon = m.icon
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!m.ready}
                      onClick={() => m.ready && toggle(modules, setModules, m.id)}
                      className={`w-full text-left p-4 rounded-lg border-2 transition ${
                        !m.ready ? 'opacity-60 cursor-not-allowed bg-slate-50 border-slate-200' :
                        active ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-200 hover:border-emerald-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${active ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold flex items-center gap-2">
                            {m.title}
                            {!m.ready && <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">coming soon</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">{m.desc}</div>
                        </div>
                        <div className={`h-6 w-6 rounded-md border-2 flex items-center justify-center ${active ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'}`}>
                          {active && <Check className="h-4 w-4 text-white" />}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button
                  onClick={() => canSkipWidgetStep ? finish() : setStep(3)}
                  disabled={modules.length === 0 || busy}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {canSkipWidgetStep ? 'Finish Setup' : 'Next'} <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3 — widgets grouped by module */}
        {step === 3 && !canSkipWidgetStep && (
          <Card className="shadow-lg border-emerald-100">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="font-bold text-lg text-emerald-900">Step 3 · Pick your dashboard cards</h2>
                <p className="text-sm text-muted-foreground">Choose which cards appear on your dashboard. You can change these later in Settings.</p>
              </div>

              {visibleGroups.map(group => (
                <div key={group.module} className="space-y-2">
                  <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">{group.title}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.widgets.map(w => {
                      const active = widgets.includes(w.id)
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => toggle(widgets, setWidgets, w.id)}
                          className={`text-left p-3 rounded-lg border-2 transition ${active ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-200 hover:border-emerald-300'}`}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`mt-0.5 h-5 w-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${active ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'}`}>
                              {active && <Check className="h-3.5 w-3.5 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm">{w.title}</div>
                              <div className="text-[11px] text-muted-foreground">{w.desc}</div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={finish} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  Finish Setup
                </Button>
              </div>
              {widgets.length === 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                  Tip: You haven't picked any cards. You can add them later from Settings → Dashboard.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function SetupWizard({ open, onClose, settings, saveSettings }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [type, setType] = useState('Restaurant')
  const [fields, setFields] = useState([])
  const [widgets, setWidgets] = useState([])

  const WIDGET_SUGGESTIONS = [
    { key: 'all_items', label: 'All Items', desc: 'Total count of products in your stock', icon: Boxes, color: 'text-slate-600', bg: 'bg-slate-50' },
    { key: 'expiring', label: 'Expiring Soon', desc: 'Items expiring within 7 days', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { key: 'expired', label: 'Expired', desc: 'Items already past their expiry date', icon: PackageX, color: 'text-red-600', bg: 'bg-red-50' },
    { key: 'critical', label: 'Critical Stock', desc: 'Products running low on quantity', icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50' },
    { key: 'expiry_alerts', label: 'Expiry Alert Banner', desc: 'Big alert when items are expiring', icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
    { key: 'search', label: 'Global Search', desc: 'Quick search box on dashboard', icon: Search, color: 'text-blue-600', bg: 'bg-blue-50' },
  ]

  useEffect(() => {
    if (open) {
      setStep(0)
      setName(settings.kitchenName || '')
      setType(settings.kitchenType || 'Restaurant')
      setFields(settings.customFields?.length ? [...settings.customFields] : [])
      const existing = Array.isArray(settings.dashboardWidgets) && settings.dashboardWidgets.length
        ? settings.dashboardWidgets
        : WIDGET_SUGGESTIONS.map(w => w.key)
      setWidgets(existing)
    }
  }, [open])

  const toggleWidget = (k) => setWidgets(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])

  const addField = () => setFields([...fields, { key: `field_${fields.length + 1}`, label: '', type: 'text' }])
  const updateField = (i, patch) => setFields(fields.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  const removeField = (i) => setFields(fields.filter((_, idx) => idx !== i))

  const finish = async () => {
    const cleanFields = fields
      .filter(f => f.label.trim())
      .map(f => ({
        key: (f.key || f.label).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40),
        label: f.label.trim(),
        type: f.type || 'text'
      }))
    await saveSettings({
      kitchenName: name.trim() || 'My Kitchen',
      kitchenType: type,
      customFields: cleanFields,
      dashboardWidgets: widgets,
      onboarded: true
    })
    onClose()
    toast.success('Welcome to ShelfWise! 🎉')
  }

  if (!open) return null
  const kitchenTypes = ['Restaurant', 'Cafe', 'Hotel', 'School', 'Hospital', 'Catering', 'Bakery', 'Other']
  const totalSteps = 4

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[640px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full flex-1 transition ${i <= step ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            ))}
          </div>
          <DialogTitle className="pt-3 text-2xl">
            {step === 0 && 'Welcome to ShelfWise 👋'}
            {step === 1 && 'Set up your kitchen'}
            {step === 2 && 'What do you want on your dashboard?'}
            {step === 3 && 'Add custom fields (optional)'}
          </DialogTitle>
        </DialogHeader>

        {step === 0 && (
          <div className="py-4 space-y-4">
            <p className="text-muted-foreground">Track perishable stock, reduce waste, and never miss an expiry again. Let's get you set up in under a minute.</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <ScanLine className="h-6 w-6 mx-auto text-emerald-600" />
                <p className="text-xs font-medium mt-1">AI Logbook Scan</p>
                <p className="text-[10px] text-muted-foreground">Photo → inventory</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <BookOpen className="h-6 w-6 mx-auto text-purple-600" />
                <p className="text-xs font-medium mt-1">Recipe Scan</p>
                <p className="text-[10px] text-muted-foreground">Allergens & stock</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <Clock className="h-6 w-6 mx-auto text-amber-600" />
                <p className="text-xs font-medium mt-1">Expiry Alerts</p>
                <p className="text-[10px] text-muted-foreground">Never waste again</p>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="py-4 space-y-4">
            <div>
              <Label>Kitchen Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bella Cucina" />
            </div>
            <div>
              <Label>Kitchen Type</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {kitchenTypes.map(t => (
                  <button key={t} onClick={() => setType(t)}
                    className={`text-sm py-2 px-2 rounded-lg border transition ${type === t ? 'bg-emerald-600 text-white border-emerald-600' : 'hover:bg-slate-50 border-slate-200'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">Tap the cards you want to see on your dashboard. Pick at least one — you can change this later in Settings.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {WIDGET_SUGGESTIONS.map(w => {
                const Icon = w.icon
                const active = widgets.includes(w.key)
                return (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => toggleWidget(w.key)}
                    className={`text-left flex items-start gap-3 p-3 rounded-lg border-2 transition ${active ? 'border-emerald-500 bg-emerald-50/60 shadow-sm' : 'border-slate-200 hover:border-emerald-300 bg-white'}`}
                  >
                    <div className={`h-9 w-9 rounded-lg ${w.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`h-5 w-5 ${w.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{w.label}</p>
                        {active && <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{w.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">{widgets.length} selected</p>
          </div>
        )}

        {step === 3 && (
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">Add any extra fields your kitchen tracks — supplier, cost, batch number, etc. Skip if you don't need them.</p>
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs">Field Name</Label>
                    <Input value={f.label} onChange={e => updateField(i, { label: e.target.value })} placeholder="Supplier" />
                  </div>
                  <div className="w-32">
                    <Label className="text-xs">Type</Label>
                    <Select value={f.type} onValueChange={v => updateField(i, { type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeField(i)}><X className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addField}><Plus className="h-4 w-4 mr-2" /> Add field</Button>
          </div>
        )}

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="ghost" onClick={() => step > 0 ? setStep(step - 1) : onClose()}>{step === 0 ? 'Skip' : 'Back'}</Button>
          {step < totalSteps - 1 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 2 && widgets.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Next <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={finish} className="bg-emerald-600 hover:bg-emerald-700">
              <Check className="h-4 w-4 mr-2" /> Finish Setup
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChefCodeCard() {
  const [code, setCode] = useState('...')
  const [kitchenName, setKitchenName] = useState('')
  const [timezone, setTimezone] = useState('')
  const [loading, setLoading] = useState(true)
  const [rotating, setRotating] = useState(false)

  const loadCode = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/owner/chef-code')
      if (!res.ok) {
        // Chef users can't see this; hide the card content.
        setCode('—')
      } else {
        const data = await res.json()
        setCode(data.code || '—')
        setKitchenName(data.kitchenName || '')
        setTimezone(data.timezone || '')
      }
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { loadCode() }, [])

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('Code copied to clipboard')
    } catch {
      toast.error('Could not copy — long-press to copy manually')
    }
  }

  async function rotate() {
    if (!confirm("This will regenerate today's code and invalidate the current one. Continue?")) return
    setRotating(true)
    try {
      const res = await fetch('/api/owner/rotate-code', { method: 'POST' })
      if (!res.ok) throw new Error()
      await loadCode()
      toast.success('New code generated')
    } catch {
      toast.error('Could not rotate code')
    } finally { setRotating(false) }
  }

  return (
    <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4">
      <Label className="text-emerald-900 text-sm font-bold">🔑 Today's Chef Code</Label>
      <p className="text-xs text-emerald-700 mt-1 mb-3">
        Share this with your kitchen team so they can log in as chefs. Rotates daily at midnight ({timezone || 'kitchen time'}).
      </p>
      <div className="flex gap-2 items-center">
        <div className="flex-1 text-center font-mono text-2xl tracking-[0.2em] bg-white rounded-md py-3 border-2 border-emerald-300 text-emerald-900">
          {loading ? <Loader2 className="h-5 w-5 animate-spin inline text-emerald-600" /> : code}
        </div>
        <Button variant="outline" size="sm" onClick={copyCode} disabled={loading || code === '—'} type="button">
          <Copy className="h-4 w-4 mr-1" /> Copy
        </Button>
      </div>
      <div className="mt-2 flex justify-between items-center">
        <p className="text-[11px] text-emerald-700/70">Kitchen: <b>{kitchenName || '—'}</b></p>
        <Button variant="ghost" size="sm" onClick={rotate} disabled={rotating || code === '—'} type="button" className="text-emerald-700 hover:text-emerald-900 h-7 px-2">
          {rotating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Rotate
        </Button>
      </div>
    </div>
  )
}

function SettingsDialog({ open, onClose, settings, saveSettings, openWizard }) {
  const [tab, setTab] = useState('profile') // 'profile' | 'login' | 'dashboard' | 'fields'
  const [name, setName] = useState('')
  const [type, setType] = useState('Restaurant')
  const [fields, setFields] = useState([])
  const [inviteCode, setInviteCode] = useState('')
  const [alertEmail, setAlertEmail] = useState('')
  const [testing, setTesting] = useState(false)
  const [widgets, setWidgets] = useState([])
  const [modules, setModules] = useState([])
  const [currency, setCurrency] = useState('GBP')
  const ALL_WIDGETS = [
    { key: 'all_items', label: 'All Items count' },
    { key: 'expiring',  label: 'Expiring Soon' },
    { key: 'expired',   label: 'Expired items' },
    { key: 'critical',  label: 'Critical Stock level' },
    { key: 'in_date',   label: 'In Date items' },
    { key: 'use_today', label: 'Use Today (urgent)' },
    { key: 'recipes',   label: 'Recipes shortcut' },
    { key: 'rota_today', label: 'Today\'s Rota' },
    { key: 'waste_week', label: 'Waste (this week)' },
    { key: 'expiry_alerts', label: 'Expiry alert banner' },
    { key: 'urgent_list',   label: 'Urgent items list' },
    { key: 'search',        label: 'Global search box' },
  ]
  const ALL_MODULES = [
    { key: 'stock',     label: 'Stock Monitoring', desc: 'Inventory + expiry tracking' },
    { key: 'recipes',   label: 'Recipes',          desc: 'AI recipe parsing & ingredient match' },
    { key: 'rota',      label: 'Rota',             desc: 'Weekly staff scheduling' },
    { key: 'analytics', label: 'Waste Analytics',  desc: 'Track disposals, reasons & cost' },
  ]

  useEffect(() => {
    if (open) {
      setTab('profile')
      setName(settings.kitchenName || '')
      setType(settings.kitchenType || 'Restaurant')
      setFields(settings.customFields?.length ? [...settings.customFields] : [])
      setInviteCode(settings.inviteCode || '')
      setAlertEmail(settings.alertEmail || '')
      setCurrency(settings.currency || 'GBP')
      setWidgets(Array.isArray(settings.dashboardWidgets) ? settings.dashboardWidgets : ALL_WIDGETS.map(w => w.key))
      setModules(Array.isArray(settings.modulesEnabled) ? settings.modulesEnabled : ['stock', 'recipes'])
    }
  }, [open])

  const toggleWidget = (k) => setWidgets(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])
  const toggleModule = (k) => setModules(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])

  const addField = () => {
    const newField = { key: `field_${fields.length + 1}_${Date.now().toString(36)}`, label: '', type: 'text' }
    setFields(prev => [...prev, newField])
    // Scroll to bottom of fields list after render
    setTimeout(() => {
      const el = document.getElementById('cf-list-end')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }
  const updateField = (i, patch) => setFields(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  const removeField = (i) => setFields(prev => prev.filter((_, idx) => idx !== i))
  const rotateCode = () => setInviteCode(Math.floor(100000 + Math.random() * 900000).toString())

  const sendTestEmail = async () => {
    if (!alertEmail.trim()) { toast.error('Set an alert email first'); return }
    setTesting(true)
    try {
      await saveSettings({ kitchenName: name.trim(), kitchenType: type, customFields: fields.filter(f => f.label.trim()), inviteCode, alertEmail: alertEmail.trim(), onboarded: true })
      const res = await fetch('/api/email/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: alertEmail.trim() }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success(`Test email sent to ${alertEmail}! Check your inbox.`)
    } catch (e) {
      toast.error(e.message || 'Failed to send')
    } finally { setTesting(false) }
  }

  const save = async () => {
    const cleanFields = fields.filter(f => f.label.trim()).map(f => ({
      key: (f.key || f.label).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40),
      label: f.label.trim(),
      type: f.type || 'text'
    }))
    await saveSettings({ kitchenName: name.trim(), kitchenType: type, customFields: cleanFields, inviteCode, alertEmail: alertEmail.trim(), currency, dashboardWidgets: widgets, modulesEnabled: modules, onboarded: true })
    onClose()
  }

  const kitchenTypes = ['Restaurant', 'Cafe', 'Hotel', 'School', 'Hospital', 'Catering', 'Bakery', 'Other']

  const tabs = [
    { key: 'profile', label: 'Kitchen', longLabel: 'Kitchen Profile', icon: ChefHat },
    { key: 'login', label: 'Login', longLabel: 'Login & Alerts', icon: Settings },
    { key: 'dashboard', label: 'Dashboard', longLabel: 'Dashboard', icon: LayoutDashboard },
    { key: 'fields', label: 'Fields', longLabel: 'Custom Fields', icon: Package },
  ]

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[680px] max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Kitchen Settings</DialogTitle>
        </DialogHeader>

        {/* Tabs — horizontally scrollable on mobile, equal-width on desktop */}
        <div className="border-b bg-slate-50/60">
          <div className="flex overflow-x-auto no-scrollbar px-2 sm:px-4 gap-0.5">
            {tabs.map(t => {
              const Icon = t.icon
              const active = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap flex-shrink-0 ${active ? 'border-emerald-600 text-emerald-700 bg-white/60' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="sm:hidden">{t.label}</span>
                  <span className="hidden sm:inline">{t.longLabel}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
          {tab === 'profile' && (
            <div className="space-y-4">
              <div>
                <Label>Kitchen Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Bella Cucina" />
              </div>
              <div>
                <Label>Kitchen Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{kitchenTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={currency || 'GBP'} onValueChange={setCurrency}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GBP">🇬🇧 GBP (£)</SelectItem>
                    <SelectItem value="USD">🇺🇸 USD ($)</SelectItem>
                    <SelectItem value="EUR">🇪🇺 EUR (€)</SelectItem>
                    <SelectItem value="INR">🇮🇳 INR (₹)</SelectItem>
                    <SelectItem value="CAD">🇨🇦 CAD (C$)</SelectItem>
                    <SelectItem value="AUD">🇦🇺 AUD (A$)</SelectItem>
                    <SelectItem value="SGD">🇸🇬 SGD (S$)</SelectItem>
                    <SelectItem value="AED">🇦🇪 AED</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Used for cost tracking, waste value, receipt imports.</p>
              </div>
              <p className="text-xs text-muted-foreground">These appear in the header and your email alerts.</p>

              {openWizard && (
                <div className="pt-4 mt-2 border-t">
                  <Label className="text-sm font-semibold">Setup Wizard</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2">Re-run the setup wizard to revisit kitchen type, dashboard widgets, and custom fields.</p>
                  <Button variant="outline" size="sm" onClick={openWizard}>
                    <Sparkles className="h-4 w-4 mr-2" /> Re-run setup wizard
                  </Button>
                </div>
              )}
            </div>
          )}

          {tab === 'login' && (
            <div className="space-y-5">
              <ChefCodeCard />

              <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-4">
                <Label className="text-amber-900 text-sm font-bold">📧 Alert Email</Label>
                <p className="text-xs text-amber-700 mt-1 mb-3">Daily expiry alerts will be sent here.</p>
                <div className="flex gap-2">
                  <Input type="email" value={alertEmail} onChange={e => setAlertEmail(e.target.value)} placeholder="chef@kitchen.com" className="bg-white" />
                  <Button variant="outline" size="sm" type="button" onClick={sendTestEmail} disabled={testing}>
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Test'}
                  </Button>
                </div>
              </div>

              <NotificationSettingsCard />
            </div>
          )}

          {tab === 'dashboard' && (
            <div className="space-y-5">
              <div>
                <Label className="text-base font-bold">Modules enabled</Label>
                <p className="text-xs text-muted-foreground">Which features appear in your top navigation.</p>
              </div>
              <div className="space-y-2">
                {ALL_MODULES.map(m => (
                  <label key={m.key} className={`flex items-center gap-3 p-3 rounded-lg border-2 transition ${m.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${modules.includes(m.key) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300'}`}>
                    <input
                      type="checkbox"
                      disabled={m.disabled}
                      checked={modules.includes(m.key)}
                      onChange={() => !m.disabled && toggleModule(m.key)}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{m.label}</div>
                      <div className="text-xs text-muted-foreground">{m.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="pt-3 border-t">
                <Label className="text-base font-bold">Dashboard cards</Label>
                <p className="text-xs text-muted-foreground">Tick the widgets you want to see on your dashboard.</p>
              </div>
              <div className="space-y-2">
                {ALL_WIDGETS.map(w => (
                  <label key={w.key} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${widgets.includes(w.key) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300'}`}>
                    <input type="checkbox" checked={widgets.includes(w.key)} onChange={() => toggleWidget(w.key)} className="h-4 w-4 accent-emerald-600" />
                    <span className="text-sm font-medium">{w.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {tab === 'fields' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Custom Fields</Label>
                  <p className="text-xs text-muted-foreground">Track extras like supplier, cost, batch number, etc.</p>
                </div>
                <Button variant="default" size="sm" onClick={addField} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-1" /> Add Field</Button>
              </div>

              {fields.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No custom fields yet</p>
                  <p className="text-xs">Click "Add Field" above to create one.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {fields.map((f, i) => (
                    <div key={f.key || i} className="flex gap-2 items-center bg-white border rounded-lg p-2">
                      <span className="text-xs text-muted-foreground font-semibold w-6 text-center">{i + 1}</span>
                      <Input value={f.label} onChange={e => updateField(i, { label: e.target.value })} placeholder="Field name (e.g. Supplier)" className="flex-1" />
                      <Select value={f.type} onValueChange={v => updateField(i, { type: v })}>
                        <SelectTrigger className="w-28 shrink-0"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => removeField(i)} className="text-red-600 hover:bg-red-50 shrink-0"><X className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <div id="cf-list-end" />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-slate-50/60">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} className="bg-emerald-600 hover:bg-emerald-700"><Check className="h-4 w-4 mr-2" /> Save All</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LoginGate({ settings, onAuth, saveSettings }) {
  const [mode, setMode] = useState('email')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [kitchenName, setKitchenName] = useState('')
  const [kitchenType, setKitchenType] = useState('Restaurant')
  const [generatedCode, setGeneratedCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('login') // 'login' | 'type' | 'widgets' | 'code'
  const KITCHEN_TYPES = ['Restaurant', 'Cafe', 'Hotel', 'School', 'Hospital', 'Catering', 'Bakery', 'Other']
  const ALL_WIDGETS = [
    { key: 'all_items', label: 'All Items', desc: 'Total products in stock', icon: Boxes, color: 'text-slate-600', bg: 'bg-slate-50' },
    { key: 'expiring', label: 'Expiring Soon', desc: 'Items expiring within 7 days', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { key: 'expired', label: 'Expired', desc: 'Items already past expiry', icon: PackageX, color: 'text-red-600', bg: 'bg-red-50' },
    { key: 'critical', label: 'Critical Stock', desc: 'Products running low', icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50' },
    { key: 'expiry_alerts', label: 'Expiry Alert Banner', desc: 'Big alert when items expire', icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
    { key: 'search', label: 'Global Search', desc: 'Quick search box on dashboard', icon: Search, color: 'text-blue-600', bg: 'bg-blue-50' },
  ]
  const [chosenWidgets, setChosenWidgets] = useState(ALL_WIDGETS.map(w => w.key))
  const hasInvite = !!(settings && settings.inviteCode)

  const toggleWidget = (k) => setChosenWidgets(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])

  const tryCode = async (e) => {
    e?.preventDefault()
    if (!code.trim()) { toast.error('Enter the kitchen code'); return }
    if (!hasInvite) { toast.error('No kitchen set up yet. Use the Owner tab first.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() })
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || 'Invalid code'); return }
      if (name.trim()) localStorage.setItem('shelfwise_user', name.trim())
      toast.success(`Welcome${name ? ', ' + name : ''}! 🎉`)
      onAuth()
    } finally { setBusy(false) }
  }

  const signInEmail = async (e) => {
    e?.preventDefault()
    if (!email.trim()) { toast.error('Email required'); return }
    if (hasInvite) {
      // existing kitchen — just sign in
      localStorage.setItem('shelfwise_user', name.trim() || email.trim())
      toast.success(`Welcome${name ? ', ' + name : ''}! 🎉`)
      onAuth()
      return
    }
    if (!name.trim()) { toast.error('Your name is required'); return }
    // First time setup — generate code immediately so they can share it
    setBusy(true)
    try {
      const newCode = Math.floor(100000 + Math.random() * 900000).toString()
      const next = {
        ...settings,
        alertEmail: email.trim(),
        inviteCode: newCode,
        onboarded: false,
      }
      await saveSettings(next)
      setGeneratedCode(newCode)
      if (name.trim()) localStorage.setItem('shelfwise_user', name.trim())
      setStep('code')
    } finally { setBusy(false) }
  }

  const finishSetup = async () => {
    setBusy(true)
    try {
      const next = {
        ...settings,
        kitchenName: kitchenName.trim() || 'My Kitchen',
        kitchenType,
        alertEmail: email.trim() || settings.alertEmail,
        inviteCode: generatedCode || settings.inviteCode,
        onboarded: true,
        dashboardWidgets: chosenWidgets,
      }
      await saveSettings(next)
      toast.success(`Welcome to ${next.kitchenName}! 🎉`)
      onAuth()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-emerald-50 via-white to-amber-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border p-8">
        <div className="text-center mb-6">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 mx-auto flex items-center justify-center mb-3 shadow-md">
            <ChefHat className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">ShelfWise</h1>
          <p className="text-sm text-muted-foreground mt-1">From shelf to plate — never lose track.</p>
        </div>

        {step === 'code' && generatedCode && (
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5 text-center">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Your kitchen code</p>
              <p className="text-4xl font-bold tracking-[0.3em] text-emerald-700 my-3 font-mono">{generatedCode}</p>
              <p className="text-xs text-emerald-700">Share this code with your team. They'll use it to log in.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={async () => {
                try {
                  if (navigator.share) {
                    await navigator.share({ title: 'ShelfWise Kitchen Code', text: `Join my kitchen on ShelfWise — code: ${generatedCode}` })
                  } else if (navigator.clipboard) {
                    await navigator.clipboard.writeText(generatedCode)
                    toast.success('Code copied!')
                  }
                } catch {}
              }}
            >
              📋 Share / Copy code
            </Button>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setStep('kitchen-name')}>
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {step === 'kitchen-name' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">Name your kitchen</h2>
              <p className="text-xs text-muted-foreground mt-1">This shows in the header and on email alerts.</p>
            </div>
            <div>
              <Label>Kitchen Name</Label>
              <Input value={kitchenName} onChange={e => setKitchenName(e.target.value)} placeholder="e.g. Bella Cucina" autoFocus />
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep('code')}>Back</Button>
              <Button
                onClick={() => {
                  if (!kitchenName.trim()) { toast.error('Kitchen name required'); return }
                  setStep('type')
                }}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Next <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 'type' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">What type of kitchen?</h2>
              <p className="text-xs text-muted-foreground mt-1">This helps us tailor your dashboard.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {KITCHEN_TYPES.map(t => (
                <button key={t} type="button" onClick={() => setKitchenType(t)}
                  className={`text-sm py-3 px-3 rounded-lg border-2 font-medium transition ${kitchenType === t ? 'bg-emerald-600 text-white border-emerald-600' : 'hover:border-emerald-300 border-slate-200 bg-white'}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep('kitchen-name')}>Back</Button>
              <Button onClick={() => setStep('widgets')} className="bg-emerald-600 hover:bg-emerald-700">
                Next <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 'widgets' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">What do you want on your dashboard?</h2>
              <p className="text-xs text-muted-foreground mt-1">Tap the cards you want. Pick at least one — you can change this anytime in Settings.</p>
            </div>
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {ALL_WIDGETS.map(w => {
                const Icon = w.icon
                const active = chosenWidgets.includes(w.key)
                return (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => toggleWidget(w.key)}
                    className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border-2 transition ${active ? 'border-emerald-500 bg-emerald-50/60 shadow-sm' : 'border-slate-200 hover:border-emerald-300 bg-white'}`}
                  >
                    <div className={`h-9 w-9 rounded-lg ${w.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`h-5 w-5 ${w.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{w.label}</p>
                        {active && <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{w.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">{chosenWidgets.length} selected</p>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('type')}>Back</Button>
              <Button onClick={finishSetup} disabled={busy || chosenWidgets.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />} Finish Setup
              </Button>
            </div>
          </div>
        )}

        {step === 'login' && (
          <>
            <p className="text-center text-sm text-muted-foreground mb-4">Sign in with</p>
            <div className="flex gap-2 mb-5 p-1 bg-slate-100 rounded-lg">
              <button onClick={() => setMode('email')} className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition flex items-center justify-center gap-1.5 ${mode === 'email' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-800'}`}>
                👑 Owner
              </button>
              <button onClick={() => setMode('code')} className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition flex items-center justify-center gap-1.5 ${mode === 'code' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-800'}`}>
                👨‍🍳 Chef
              </button>
            </div>

            {mode === 'code' && (
              <form onSubmit={tryCode} className="space-y-4">
                <p className="text-xs text-muted-foreground">{hasInvite ? 'Enter the 6-digit code your head chef shared.' : '⚠️ No kitchen set up yet. Use the Email tab first.'}</p>
                <div>
                  <Label>Your name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Chef Anna" />
                </div>
                <div>
                  <Label>Kitchen code</Label>
                  <Input value={code} onChange={e => setCode(e.target.value)} placeholder="6-digit code" className="text-center text-2xl tracking-[0.3em] font-mono h-14" maxLength={10} />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy || !hasInvite}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />} Enter Kitchen
                </Button>
              </form>
            )}

            {mode === 'email' && (
              <form onSubmit={signInEmail} className="space-y-4">
                <p className="text-xs text-muted-foreground">{hasInvite ? 'Sign in with your email.' : 'First time? Enter your details — we\'ll set up your kitchen in the next few steps.'}</p>
                <div>
                  <Label>Your name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Head Chef" />
                </div>
                <div>
                  <Label>Email <span className="text-muted-foreground font-normal">{!hasInvite && '(for alerts)'}</span></Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="chef@kitchen.com" />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : (hasInvite ? <Check className="h-4 w-4 mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />)} {hasInvite ? 'Sign In' : 'Create Kitchen →'}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}


// ============================================================================
// Notification settings card — browser Notification API opt-in.
// ============================================================================
function NotificationSettingsCard() {
  const [permission, setPermission] = useState('default')
  const [supported, setSupported] = useState(true)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) { setSupported(false); return }
    setPermission(Notification.permission)
    setEnabled(localStorage.getItem('sw_notifications_enabled') === '1' && Notification.permission === 'granted')
  }, [])

  const enable = async () => {
    if (!supported) { toast.error('Your browser doesn\'t support notifications'); return }
    const res = await Notification.requestPermission()
    setPermission(res)
    if (res === 'granted') {
      localStorage.setItem('sw_notifications_enabled', '1')
      setEnabled(true)
      try {
        new Notification('🔔 ShelfWise alerts on', {
          body: 'You\'ll get reminders when items are about to expire.',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
        })
      } catch {}
      toast.success('Notifications enabled ✅')
    } else {
      toast.error('Permission denied. You can re-enable it in browser settings.')
    }
  }

  const disable = () => {
    localStorage.setItem('sw_notifications_enabled', '0')
    setEnabled(false)
    toast.success('Notifications disabled')
  }

  const test = () => {
    if (permission !== 'granted') { toast.error('Enable notifications first'); return }
    try {
      new Notification('🔔 ShelfWise test', {
        body: 'This is what a real expiry alert will look like.',
        icon: '/icon-192.png',
      })
    } catch (e) { toast.error('Could not show notification') }
  }

  if (!supported) {
    return (
      <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-4">
        <Label className="text-slate-700 text-sm font-bold">🔔 Browser Notifications</Label>
        <p className="text-xs text-slate-600 mt-1">Not supported on this browser.</p>
      </div>
    )
  }

  return (
    <div className={`rounded-lg border-2 p-4 ${enabled ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
      <Label className="text-sm font-bold">🔔 Browser Notifications</Label>
      <p className="text-xs text-muted-foreground mt-1 mb-3">
        Get an in-browser alert when items are about to expire (checks once when you open the app).
      </p>
      {enabled ? (
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={test}>Send test</Button>
          <Button variant="outline" size="sm" onClick={disable} className="text-red-600">
            <BellOff className="h-4 w-4 mr-1" /> Turn off
          </Button>
        </div>
      ) : (
        <Button size="sm" onClick={enable} className="bg-emerald-600 hover:bg-emerald-700">
          <Bell className="h-4 w-4 mr-1" /> {permission === 'denied' ? 'Blocked — allow in browser settings' : 'Enable notifications'}
        </Button>
      )}
    </div>
  )
}


// ============================================================================
// Dispose (waste-log) dialog — asks the user WHY a product is being removed.
// "Used up" is NOT logged as waste. Anything else creates a waste_log row.
// ============================================================================
function DisposeProductDialog({ product, onClose, onConfirm }) {
  const [reason, setReason] = useState('expired')
  const [unitCost, setUnitCost] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (product) {
      // Smart-default: if expired, pre-select expired. If low qty, "used_up". Otherwise "expired".
      const status = product._status
      if (status === 'Expired') setReason('expired')
      else if (status === 'Critical') setReason('used_up')
      else setReason('expired')
      setUnitCost('')
      setNotes('')
    }
  }, [product?.id])

  if (!product) return null
  const REASONS = [
    { id: 'used_up',   label: 'Used up (consumed normally)', emoji: '✅', color: 'bg-emerald-50 border-emerald-300 text-emerald-800', note: 'Not counted as waste' },
    { id: 'expired',   label: 'Expired',                      emoji: '⏰', color: 'bg-red-50 border-red-300 text-red-800' },
    { id: 'spoiled',   label: 'Spoiled / gone off',           emoji: '🤢', color: 'bg-amber-50 border-amber-300 text-amber-800' },
    { id: 'damaged',   label: 'Damaged / dropped',            emoji: '💥', color: 'bg-orange-50 border-orange-300 text-orange-800' },
    { id: 'overstock', label: 'Overstock / not needed',       emoji: '📦', color: 'bg-slate-50 border-slate-300 text-slate-800' },
    { id: 'other',     label: 'Other',                        emoji: '❓', color: 'bg-slate-50 border-slate-300 text-slate-800' },
  ]

  const isWaste = reason !== 'used_up'

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await onConfirm({
        reason,
        unitCost: isWaste ? unitCost : '',
        notes,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!product} onOpenChange={(v) => { if (!v && !busy) onClose() }}>
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Remove &quot;{product.name}&quot;</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Tell us why — this helps you track waste over time.
          </p>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-1 gap-2">
            {REASONS.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setReason(r.id)}
                className={`text-left rounded-lg border-2 px-3 py-2.5 transition ${reason === r.id ? r.color + ' shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{r.emoji}</span>
                  <span className="font-medium text-sm">{r.label}</span>
                  {r.note && <span className="ml-auto text-[10px] text-muted-foreground italic">{r.note}</span>}
                </div>
              </button>
            ))}
          </div>

          {isWaste && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="col-span-2">
                <Label className="text-xs">Cost per {product.unit || 'unit'} <span className="text-muted-foreground">(optional, for cost tracking)</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 2.50"
                  value={unitCost}
                  onChange={e => setUnitCost(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Notes <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  placeholder="e.g. Left out overnight"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground pt-1">
            {isWaste
              ? `This will log ${product.quantity} ${product.unit || 'unit'}${product.quantity !== 1 ? 's' : ''} to your waste analytics${unitCost ? ` (estimated cost: ${(Number(unitCost) * Number(product.quantity || 0)).toFixed(2)})` : ''}.`
              : 'This will simply remove the item — no waste logged.'}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy} className={isWaste ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            {isWaste ? 'Dispose & Log' : 'Mark Used Up'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Rota View — weekly staff scheduling grid.
// Chef names are free-text; store a row per (date, slot).
// ============================================================================
function RotaView() {
  // Anchor day for the visible week (defaults to today) — Monday-based week.
  const [anchor, setAnchor] = useState(() => new Date())
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null) // { shift?, date, slot } — for the modal

  // Compute Monday of the anchor week + 7 days
  const monday = useMemo(() => {
    const d = new Date(anchor)
    const day = d.getDay() // 0=Sun ... 6=Sat
    const diff = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diff)
    d.setHours(0, 0, 0, 0)
    return d
  }, [anchor])

  const days = useMemo(() => Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday); d.setDate(d.getDate() + i)
    return d
  }), [monday])

  const SLOTS = ['Morning', 'Afternoon', 'Evening']

  const fromISO = monday.toISOString().slice(0, 10)
  const toDate = new Date(monday); toDate.setDate(toDate.getDate() + 6)
  const toISO = toDate.toISOString().slice(0, 10)

  const loadShifts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/rota?from=${fromISO}&to=${toISO}`)
      if (!res.ok) throw new Error('Load failed')
      const data = await res.json()
      setShifts(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error('Could not load rota — did you run migration-7?')
    } finally {
      setLoading(false)
    }
  }, [fromISO, toISO])

  useEffect(() => { loadShifts() }, [loadShifts])

  // Build a lookup: shifts[date][slot] = shift row
  const byCell = useMemo(() => {
    const m = {}
    for (const s of shifts) {
      const key = s.shiftDate
      m[key] = m[key] || {}
      m[key][s.shiftSlot] = m[key][s.shiftSlot] || []
      m[key][s.shiftSlot].push(s)
    }
    return m
  }, [shifts])

  const iso = (d) => d.toISOString().slice(0, 10)
  const dayLabel = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Rota</h2>
          <p className="text-muted-foreground mt-1">Weekly staff schedule</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { const d = new Date(monday); d.setDate(d.getDate() - 7); setAnchor(d) }}>← Prev</Button>
          <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date())}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => { const d = new Date(monday); d.setDate(d.getDate() + 7); setAnchor(d) }}>Next →</Button>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        <b>Week of {monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</b>
        {loading && <Loader2 className="inline h-3 w-3 animate-spin ml-2" />}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-8 gap-1 text-xs">
            <div className="font-semibold text-slate-600 p-2">Slot</div>
            {days.map(d => (
              <div key={iso(d)} className={`p-2 text-center font-semibold rounded ${iso(d) === iso(new Date()) ? 'bg-emerald-100 text-emerald-900' : 'text-slate-600'}`}>
                <div>{d.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                <div className="text-lg">{d.getDate()}</div>
                <div className="text-[10px] text-muted-foreground">{d.toLocaleDateString('en-GB', { month: 'short' })}</div>
              </div>
            ))}

            {SLOTS.map(slot => (
              <React.Fragment key={slot}>
                <div className="p-2 font-semibold text-slate-700 border-t bg-slate-50 flex items-center">{slot}</div>
                {days.map(d => {
                  const key = iso(d)
                  const cell = byCell[key]?.[slot] || []
                  return (
                    <div key={key + slot} className="border-t border-slate-200 p-1 min-h-[70px] bg-white space-y-1">
                      {cell.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setEditing({ shift: s, date: key, slot })}
                          className={`w-full text-left px-2 py-1 rounded text-[11px] ${s.chefName?.toUpperCase() === 'OFF' ? 'bg-slate-200 text-slate-500 line-through' : 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'}`}
                        >
                          <div className="font-semibold truncate">{s.chefName || '—'}</div>
                          {(s.role || s.startTime) && (
                            <div className="text-[10px] opacity-80 truncate">
                              {s.role}{s.role && (s.startTime || s.endTime) ? ' · ' : ''}
                              {s.startTime}{s.startTime && s.endTime ? '–' : ''}{s.endTime}
                            </div>
                          )}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setEditing({ shift: null, date: key, slot })}
                        className="w-full text-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 text-[11px] py-1 rounded border border-dashed border-slate-200"
                      >+ add</button>
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <RotaShiftDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); loadShifts() }}
      />
    </div>
  )
}

function RotaShiftDialog({ target, onClose, onSaved }) {
  const [chefName, setChefName] = useState('')
  const [role, setRole] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (target) {
      const s = target.shift
      setChefName(s?.chefName || '')
      setRole(s?.role || '')
      setStartTime(s?.startTime || '')
      setEndTime(s?.endTime || '')
      setNotes(s?.notes || '')
    }
  }, [target?.shift?.id, target?.date, target?.slot])

  if (!target) return null

  const save = async () => {
    if (!chefName.trim()) { toast.error('Chef name required (or "OFF" for a day off)'); return }
    setBusy(true)
    try {
      const body = {
        id: target.shift?.id,
        shiftDate: target.date,
        shiftSlot: target.slot,
        chefName: chefName.trim(),
        role: role.trim(),
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        notes: notes.trim(),
      }
      const res = await fetch('/api/rota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Save failed')
      toast.success(target.shift ? 'Shift updated' : 'Shift added')
      onSaved()
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!target.shift?.id) return
    if (!confirm('Delete this shift?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/rota/${target.shift.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Shift deleted')
      onSaved()
    } catch (e) { toast.error(e.message || 'Delete failed') } finally { setBusy(false) }
  }

  return (
    <Dialog open={!!target} onOpenChange={(v) => { if (!v && !busy) onClose() }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{target.shift ? 'Edit shift' : 'Add shift'}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {new Date(target.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · <b>{target.slot}</b>
          </p>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2">
            <Label className="text-xs">Chef name</Label>
            <Input value={chefName} onChange={e => setChefName(e.target.value)} placeholder='Anna, "OFF", "Open"…' autoFocus />
            <p className="text-[10px] text-muted-foreground mt-1">Tip: use &quot;OFF&quot; to mark a day off.</p>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Role <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={role} onChange={e => setRole(e.target.value)} placeholder="Head Chef, Sous, KP…" />
          </div>
          <div>
            <Label className="text-xs">Start time</Label>
            <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">End time</Label>
            <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Deep-clean day, prep for Fri banquet…" />
          </div>
        </div>
        <DialogFooter className="flex-row justify-between gap-2">
          {target.shift ? (
            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={remove} disabled={busy}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Analytics View — waste breakdown (this week / month / all)
// ============================================================================
function AnalyticsView({ products }) {
  const [range, setRange] = useState('week') // week | month | all
  const [data, setData] = useState({ entries: [], summary: null })
  const [loading, setLoading] = useState(false)

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
                  Waste is tracked when you dispose products (Inventory → 🗑️ button → reason).
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


export default App
