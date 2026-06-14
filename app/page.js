'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Boxes, AlertTriangle, Clock, PackageX, Plus, Search, Download, ArrowUpDown, Pencil, Trash2, LayoutDashboard, Package, Sparkles, ChefHat, ScanLine, Upload, Loader2, Check, X, BookOpen, AlertCircle, ShieldAlert, Settings, ArrowRight } from 'lucide-react'

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
  customFields: {}
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

function App() {
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
  const [authed, setAuthed] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)

  // Check localStorage for previous login
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('shelfwise_authed') === '1') setAuthed(true)
  }, [])

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
      const data = await res.json()
      setSettings(data)
      // If kitchen isn't onboarded yet, force user back to LoginGate setup flow
      if (data && data.onboarded === false) {
        try { localStorage.removeItem('shelfwise_authed') } catch {}
        setAuthed(false)
      }
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
      if (!res.ok) throw new Error('Save failed')
      toast.success(editing ? 'Product updated' : 'Product added')
      setDialogOpen(false)
      fetchProducts()
      fetchStats()
    } catch (e) {
      toast.error('Could not save product')
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

  // Lookup barcode from Open Food Facts then open Snap form prefilled
  const onBarcodeFound = async (code) => {
    setBarcodeValue(code)
    setBarcodeLoading(true)
    try {
      let detected = {
        name: '',
        quantity: 1,
        unit: 'ea',
        expiryDate: '',
        category: '',
        storageType: 'Fridge',
        location: '',
        barcode: code,
      }
      // Try Open Food Facts (free, public, no key)
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
          // Guess storage from category
          const cat = detected.category.toLowerCase()
          if (cat.includes('frozen')) detected.storageType = 'Freezer'
          else if (cat.includes('dry') || cat.includes('snack') || cat.includes('cereal') || cat.includes('pasta') || cat.includes('rice')) detected.storageType = 'Dry'
          else if (cat.includes('beverage') || cat.includes('drink')) detected.storageType = 'Ambient'
          // IMPORTANT: leave expiry EMPTY for barcoded products — chef must read actual printed date
          detected.expiryDate = ''
          toast.success(`Found: ${detected.name || code}. Please enter the expiry date from the package.`)
        } else {
          toast.info(`Barcode ${code} not in database. Fill details manually.`)
          detected.name = ''
          detected.expiryDate = ''
        }
      } catch {
        toast.warning('Could not look up barcode. Fill details manually.')
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
      if (!res.ok) throw new Error()
      toast.success(`${snapItem.name} added to inventory`)
      setSnapOpen(false)
      setSnapImage(null)
      setSnapItem(null)
      fetchProducts()
      fetchStats()
    } catch {
      toast.error('Failed to save product')
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/30 via-white to-emerald-50/40">
      {!authed && (
        <LoginGate settings={settings} onAuth={() => { localStorage.setItem('shelfwise_authed', '1'); setAuthed(true) }} saveSettings={saveSettings} />
      )}
      {/* Top Nav */}
      <header className="border-b bg-white/90 backdrop-blur-md sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm shrink-0">
              <ChefHat className="h-5 w-5 text-white" />
            </div>
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
            <Button variant={view === 'inventory' ? 'default' : 'ghost'} size="sm" onClick={() => { setStatusFilter('All'); setView('inventory') }}>
              <Package className="h-4 w-4 mr-2" /> Inventory
            </Button>
            <Button variant={view === 'recipes' ? 'default' : 'ghost'} size="sm" onClick={() => setView('recipes')}>
              <BookOpen className="h-4 w-4 mr-2" /> Recipes
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} title="Settings">
              <Settings className="h-4 w-4" />
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
            <Button variant={view === 'inventory' ? 'default' : 'ghost'} className="w-full justify-start" onClick={() => { setStatusFilter('All'); setView('inventory'); setMobileNav(false) }}>
              <Package className="h-4 w-4 mr-2" /> Inventory
            </Button>
            <Button variant={view === 'recipes' ? 'default' : 'ghost'} className="w-full justify-start" onClick={() => { setView('recipes'); setMobileNav(false) }}>
              <BookOpen className="h-4 w-4 mr-2" /> Recipes
            </Button>
            <Button variant="ghost" className="w-full justify-start" onClick={() => { setSettingsOpen(true); setMobileNav(false) }}>
              <Settings className="h-4 w-4 mr-2" /> Settings
            </Button>
            <Button variant="ghost" className="w-full justify-start text-red-600" onClick={() => { localStorage.removeItem('shelfwise_authed'); setAuthed(false); setMobileNav(false) }}>
              <X className="h-4 w-4 mr-2" /> Sign out
            </Button>
          </div>
        )}
      </header>

      <main className="container mx-auto px-4 py-8">
        {view === 'dashboard' && (
          <DashboardView stats={stats} products={products} goToInventory={goToInventory} seedData={seedData} openAdd={openAdd} openScan={openScan} openSnap={openSnap} openBarcode={openBarcode} openRecipe={openRecipe} onViewRecipe={setViewRecipe} widgets={settings.dashboardWidgets} />
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
            openEdit={openEdit}
            deleteProduct={deleteProduct}
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
      </main>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Product' : 'Add Product'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
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
              <Select value={form.unit} onValueChange={v => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['ea', 'kg', 'g', 'L', 'mL', 'bunch', 'pack', 'box'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveProduct} className="bg-emerald-600 hover:bg-emerald-700">{editing ? 'Save Changes' : 'Add Product'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" min="0" step="0.1" value={snapItem.quantity || 1} onChange={e => setSnapItem({ ...snapItem, quantity: Number(e.target.value) })} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Unit</Label>
                  <Select value={snapItem.unit || 'ea'} onValueChange={v => setSnapItem({ ...snapItem, unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['ea', 'kg', 'g', 'L', 'mL', 'bunch', 'pack', 'box'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Expiry date *</Label>
                <div className="flex gap-2 items-stretch">
                  <Input type="date" className="flex-1" value={snapItem.expiryDate || ''} onChange={e => setSnapItem({ ...snapItem, expiryDate: e.target.value })} />
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        try {
                          const dataUrl = await resizeImage(file)
                          setSnapLoading(true)
                          const res = await fetch('/api/scan', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ image: dataUrl })
                          })
                          const data = await res.json()
                          if (!res.ok) throw new Error(data.error || 'Scan failed')
                          const item = (data.items || [])[0]
                          if (item?.expiryDate) {
                            setSnapItem(prev => ({ ...prev, expiryDate: item.expiryDate }))
                            toast.success(`Expiry detected: ${item.expiryDate}`)
                          } else {
                            toast.warning('Date not detected — please type manually')
                          }
                        } catch (err) {
                          toast.error('Could not read date. Please type manually.')
                        } finally {
                          setSnapLoading(false)
                          e.target.value = ''
                        }
                      }} />
                    <div className="h-10 px-3 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 flex items-center gap-1 text-xs font-semibold hover:bg-emerald-100">
                      {snapLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <>📸</>} Snap Date
                    </div>
                  </label>
                </div>
                <p className="text-[10px] text-amber-700 mt-0.5">⚠️ Always check the printed date on the package. Tap &quot;📸 Snap Date&quot; to scan it with AI, or type manually.</p>
              </div>
              <div>
                <Label className="text-xs">Date received (today)</Label>
                <Input type="date" value={snapItem.dateReceived || new Date().toISOString().slice(0,10)} onChange={e => setSnapItem({ ...snapItem, dateReceived: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
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

          {recipeResult && <RecipeResult result={recipeResult} onBack={() => setRecipeResult(null)} onClose={() => setRecipeOpen(false)} goToInventory={goToInventory} onSave={saveCurrentRecipe} saving={recipeSaving} />}
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

function DashboardView({ stats, products, goToInventory, seedData, openAdd, openScan, openSnap, openBarcode, openRecipe, onViewRecipe, widgets }) {
  const [quickSearch, setQuickSearch] = useState('')
  const [globalResults, setGlobalResults] = useState(null)
  const [globalLoading, setGlobalLoading] = useState(false)
  const show = (k) => !widgets || widgets.length === 0 || widgets.includes(k)

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
  ]
  const cards = cardsAll.filter(c => show(c.key))
  const isEmpty = stats.total === 0

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground mt-1">A glance at what needs your attention today.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isEmpty && (
            <Button variant="outline" onClick={seedData}>
              <Sparkles className="h-4 w-4 mr-2" /> Load sample data
            </Button>
          )}
          <Button variant="outline" onClick={openBarcode} className="border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold">
            <ScanLine className="h-4 w-4 mr-2" /> 🔢 Barcode
          </Button>
          <Button variant="outline" onClick={openSnap} className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold">
            <Sparkles className="h-4 w-4 mr-2" /> 📸 Snap Label
          </Button>
          <Button variant="outline" onClick={openScan} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
            <ScanLine className="h-4 w-4 mr-2" /> Scan Logbook
          </Button>
          <Button onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4 mr-2" /> Add Product
          </Button>
        </div>
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
          return (
            <button key={c.key} onClick={() => goToInventory(c.filterKey)} className="text-left">
              <Card className="transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer border-0 shadow-sm overflow-hidden group">
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
                  <div className="text-xs text-muted-foreground mt-2">Click to view</div>
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

function RecipeResult({ result, onBack, onClose, goToInventory, onSave, saving }) {
  const [scale, setScale] = useState(1)
  const scaleQty = (q) => {
    const n = Number(q) || 0
    const scaled = n * scale
    // pretty-format: integer if whole, else 2 decimals (trimmed)
    return Number.isInteger(scaled) ? scaled : Math.round(scaled * 100) / 100
  }
  return (
    <div className="space-y-5 py-2">
      {/* BIG allergen warning banner at the TOP */}
      {result.allergens?.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-200 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-6 w-6 text-amber-700" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900 uppercase tracking-wider">⚠️ Contains Allergens</p>
              <p className="text-xs text-amber-800 mt-0.5">This recipe contains the following allergens. Please review before serving.</p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {result.allergens.map(a => (
                  <span key={a} className="px-3 py-1 rounded-full bg-amber-200 text-amber-900 text-sm font-semibold capitalize border border-amber-400">{a}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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

function InventoryView({ products, loading, statusFilter, setStatusFilter, search, setSearch, sort, setSort, categoryFilter, setCategoryFilter, storageFilter, setStorageFilter, facets, openAdd, openScan, openSnap, openBarcode, openEdit, deleteProduct, exportCSV, formatDate }) {
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
          <Button variant="outline" onClick={openBarcode} className="border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold"><ScanLine className="h-4 w-4 mr-2" /> 🔢 Barcode</Button>
          <Button variant="outline" onClick={openSnap} className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold"><Sparkles className="h-4 w-4 mr-2" /> 📸 Snap Label</Button>
          <Button variant="outline" onClick={openScan} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"><ScanLine className="h-4 w-4 mr-2" /> Scan Logbook</Button>
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
                    <TableCell className="font-medium">{p.name}</TableCell>
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
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this product?</AlertDialogTitle>
                              <AlertDialogDescription>This will permanently remove "{p.name}" from your inventory.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteProduct(p.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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

function SettingsDialog({ open, onClose, settings, saveSettings, openWizard }) {
  const [tab, setTab] = useState('profile') // 'profile' | 'login' | 'dashboard' | 'fields'
  const [name, setName] = useState('')
  const [type, setType] = useState('Restaurant')
  const [fields, setFields] = useState([])
  const [inviteCode, setInviteCode] = useState('')
  const [alertEmail, setAlertEmail] = useState('')
  const [testing, setTesting] = useState(false)
  const [widgets, setWidgets] = useState([])
  const ALL_WIDGETS = [
    { key: 'all_items', label: 'All Items count' },
    { key: 'expiring', label: 'Expiring Soon' },
    { key: 'expired', label: 'Expired items' },
    { key: 'critical', label: 'Critical Stock level' },
    { key: 'expiry_alerts', label: 'Expiry alert banner' },
    { key: 'urgent_list', label: 'Urgent items list' },
    { key: 'search', label: 'Global search box' },
  ]

  useEffect(() => {
    if (open) {
      setTab('profile')
      setName(settings.kitchenName || '')
      setType(settings.kitchenType || 'Restaurant')
      setFields(settings.customFields?.length ? [...settings.customFields] : [])
      setInviteCode(settings.inviteCode || '')
      setAlertEmail(settings.alertEmail || '')
      setWidgets(Array.isArray(settings.dashboardWidgets) ? settings.dashboardWidgets : ALL_WIDGETS.map(w => w.key))
    }
  }, [open])

  const toggleWidget = (k) => setWidgets(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])

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
    await saveSettings({ kitchenName: name.trim(), kitchenType: type, customFields: cleanFields, inviteCode, alertEmail: alertEmail.trim(), dashboardWidgets: widgets, onboarded: true })
    onClose()
  }

  const kitchenTypes = ['Restaurant', 'Cafe', 'Hotel', 'School', 'Hospital', 'Catering', 'Bakery', 'Other']

  const tabs = [
    { key: 'profile', label: 'Kitchen Profile', icon: ChefHat },
    { key: 'login', label: 'Login & Alerts', icon: Settings },
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'fields', label: 'Custom Fields', icon: Package },
  ]

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[680px] max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Kitchen Settings</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="px-6 pt-3 border-b bg-slate-50/60">
          <div className="flex gap-1">
            {tabs.map(t => {
              const Icon = t.icon
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${tab === t.key ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
                  <Icon className="h-4 w-4" /> {t.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
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
              <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4">
                <Label className="text-emerald-900 text-sm font-bold">🔑 Kitchen Login Code</Label>
                <p className="text-xs text-emerald-700 mt-1 mb-3">Share this code with your team so they can sign in.</p>
                <div className="flex gap-2">
                  <Input value={inviteCode} onChange={e => setInviteCode(e.target.value)} className="text-center font-mono text-xl tracking-[0.25em] bg-white h-12" />
                  <Button variant="outline" size="sm" type="button" onClick={rotateCode}>New Code</Button>
                </div>
              </div>

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
            </div>
          )}

          {tab === 'dashboard' && (
            <div className="space-y-3">
              <div>
                <Label>Dashboard widgets</Label>
                <p className="text-xs text-muted-foreground">Tick what you want to see on the home screen.</p>
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


export default App
