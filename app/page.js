'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { Boxes, AlertTriangle, Clock, PackageX, Plus, Search, Download, ArrowUpDown, Pencil, Trash2, LayoutDashboard, Package, Sparkles, ChefHat, ScanLine, Upload, Loader2, Check, X, BookOpen, AlertCircle, ShieldAlert } from 'lucide-react'

const STATUS_META = {
  Expired: { label: 'Expired', color: 'bg-red-100 text-red-700 border-red-200' },
  Expiring: { label: 'Expiring Soon', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  Critical: { label: 'Critical Stock', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  Ok: { label: 'OK', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

const EMPTY_FORM = {
  name: '', quantity: '', unit: 'ea', expiryDate: '', category: '',
  storageType: 'Fridge', location: '', preparedBy: '', imageUrl: ''
}

function getInitialFromURL() {
  if (typeof window === 'undefined') return { view: 'dashboard', status: 'All' }
  const params = new URLSearchParams(window.location.search)
  const s = params.get('status')
  const v = params.get('view')
  const validStatus = s && ['Expired', 'Expiring', 'Critical', 'Ok', 'All'].includes(s) ? s : 'All'
  const initialView = (v === 'inventory' || (s && validStatus !== 'All')) ? 'inventory' : 'dashboard'
  return { view: initialView, status: validStatus }
}

function App() {
  const [initial] = useState(getInitialFromURL)
  const [view, setView] = useState(initial.view) // dashboard | inventory
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
  const [scanImage, setScanImage] = useState(null) // data URL
  const [scanLoading, setScanLoading] = useState(false)
  const [scanItems, setScanItems] = useState([]) // editable parsed items
  const [scanSaving, setScanSaving] = useState(false)

  // Recipe Scan state
  const [recipeOpen, setRecipeOpen] = useState(false)
  const [recipeMode, setRecipeMode] = useState('text') // 'text' | 'image'
  const [recipeText, setRecipeText] = useState('')
  const [recipeImage, setRecipeImage] = useState(null)
  const [recipeLoading, setRecipeLoading] = useState(false)
  const [recipeResult, setRecipeResult] = useState(null)

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

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats')
      const data = await res.json()
      setStats(data)
    } catch {}
  }

  useEffect(() => { fetchProducts() }, [statusFilter, search, sort, categoryFilter, storageFilter])
  useEffect(() => { fetchStats(); fetchFacets() }, [products.length, view])

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (p) => {
    setEditing(p)
    setForm({
      name: p.name || '', quantity: p.quantity ?? '', unit: p.unit || 'ea',
      expiryDate: p.expiryDate || '', category: p.category || '',
      storageType: p.storageType || 'Fridge', location: p.location || '',
      preparedBy: p.preparedBy || '', imageUrl: p.imageUrl || ''
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

  const goToInventory = (status) => {
    setStatusFilter(status)
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/40">
      {/* Top Nav */}
      <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
              <ChefHat className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">ShelfWise</h1>
              <p className="text-xs text-muted-foreground -mt-0.5">Kitchen Inventory & Waste Reduction</p>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            <Button variant={view === 'dashboard' ? 'default' : 'ghost'} size="sm" onClick={goToDashboard}>
              <LayoutDashboard className="h-4 w-4 mr-2" /> Dashboard
            </Button>
            <Button variant={view === 'inventory' ? 'default' : 'ghost'} size="sm" onClick={() => { setStatusFilter('All'); setView('inventory') }}>
              <Package className="h-4 w-4 mr-2" /> Inventory
            </Button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {view === 'dashboard' && (
          <DashboardView stats={stats} products={products} goToInventory={goToInventory} seedData={seedData} openAdd={openAdd} openScan={openScan} openRecipe={openRecipe} />
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
            openEdit={openEdit}
            deleteProduct={deleteProduct}
            exportCSV={exportCSV}
            formatDate={formatDate}
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
              <Select value={form.storageType} onValueChange={v => setForm({ ...form, storageType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Fridge', 'Freezer', 'Dry', 'Ambient'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="loc">Shelf / Location</Label>
              <Input id="loc" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Shelf A1" />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveProduct} className="bg-emerald-600 hover:bg-emerald-700">{editing ? 'Save Changes' : 'Add Product'}</Button>
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

          {recipeResult && <RecipeResult result={recipeResult} onBack={() => setRecipeResult(null)} onClose={() => setRecipeOpen(false)} goToInventory={goToInventory} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DashboardView({ stats, products, goToInventory, seedData, openAdd, openScan, openRecipe }) {
  const cards = [
    { key: 'All', label: 'All Items', value: stats.total, icon: Boxes, color: 'from-slate-500 to-slate-700', accent: 'text-slate-600', bg: 'bg-slate-50' },
    { key: 'Expiring', label: 'Expiring Soon', value: stats.expiring, icon: Clock, color: 'from-amber-500 to-orange-500', accent: 'text-amber-600', bg: 'bg-amber-50' },
    { key: 'Expired', label: 'Expired', value: stats.expired, icon: PackageX, color: 'from-red-500 to-rose-600', accent: 'text-red-600', bg: 'bg-red-50' },
    { key: 'Critical', label: 'Critical Stock', value: stats.critical, icon: AlertTriangle, color: 'from-orange-500 to-red-500', accent: 'text-orange-600', bg: 'bg-orange-50' },
  ]

  const isEmpty = stats.total === 0

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground mt-1">A glance at what needs your attention today.</p>
        </div>
        <div className="flex gap-2">
          {isEmpty && (
            <Button variant="outline" onClick={seedData}>
              <Sparkles className="h-4 w-4 mr-2" /> Load sample data
            </Button>
          )}
          <Button variant="outline" onClick={openScan} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
            <ScanLine className="h-4 w-4 mr-2" /> Scan with AI
          </Button>
          <Button variant="outline" onClick={openRecipe} className="border-purple-200 text-purple-700 hover:bg-purple-50">
            <BookOpen className="h-4 w-4 mr-2" /> Scan Recipe
          </Button>
          <Button onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4 mr-2" /> Add Product
          </Button>
        </div>
      </div>

      <ExpiryAlertBanner stats={stats} goToInventory={goToInventory} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => {
          const Icon = c.icon
          return (
            <button key={c.key} onClick={() => goToInventory(c.key)} className="text-left">
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

      {/* Urgent items panel */}
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

function RecipeResult({ result, onBack, onClose, goToInventory }) {
  const statusMeta = {
    in_stock: { label: 'In Stock', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Check },
    low: { label: 'Low Stock', color: 'bg-orange-100 text-orange-700 border-orange-200', icon: AlertCircle },
    expired: { label: 'Expired', color: 'bg-red-100 text-red-700 border-red-200', icon: PackageX },
    missing: { label: 'Missing', color: 'bg-slate-100 text-slate-600 border-slate-200', icon: X },
  }
  const s = result.summary || {}
  const summary = [
    { key: 'in_stock', count: s.inStock || 0, color: 'text-emerald-600' },
    { key: 'low', count: s.low || 0, color: 'text-orange-600' },
    { key: 'expired', count: s.expired || 0, color: 'text-red-600' },
    { key: 'missing', count: s.missing || 0, color: 'text-slate-600' },
  ]
  return (
    <div className="space-y-5 py-2">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-xl font-bold">{result.title || 'Recipe Analysis'}</h3>
          {result.servings && <p className="text-sm text-muted-foreground">{result.servings}</p>}
        </div>
        {result.allergens?.length > 0 && (
          <div className="flex items-start gap-2 max-w-md">
            <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Allergens Detected</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {result.allergens.map(a => (
                  <Badge key={a} variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 capitalize">{a}</Badge>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {summary.map(c => {
          const meta = statusMeta[c.key]
          const Icon = meta.icon
          return (
            <div key={c.key} className={`rounded-lg border p-3 ${meta.color}`}>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <p className="text-xs font-medium uppercase tracking-wide">{meta.label}</p>
              </div>
              <p className="text-2xl font-bold mt-1">{c.count}</p>
            </div>
          )
        })}
      </div>

      <div>
        <p className="font-semibold mb-2 text-sm">Ingredients ({result.matched?.length || 0})</p>
        <div className="border rounded-lg divide-y overflow-hidden max-h-[360px] overflow-y-auto">
          {(result.matched || []).map((m, i) => {
            const meta = statusMeta[m.status] || statusMeta.missing
            return (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm capitalize">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.quantity} {m.unit}{m.notes ? ` · ${m.notes}` : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  {m.product && (
                    <span className="text-xs text-muted-foreground">{m.product.quantity} {m.product.unit} in stock</span>
                  )}
                  <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
                </div>
              </div>
            )
          })}
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
          <Button variant="outline" onClick={() => { onClose(); goToInventory('All') }}>View Inventory</Button>
          <Button onClick={onClose} className="bg-purple-600 hover:bg-purple-700">Done</Button>
        </div>
      </div>
    </div>
  )
}

function InventoryView({ products, loading, statusFilter, setStatusFilter, search, setSearch, sort, setSort, categoryFilter, setCategoryFilter, storageFilter, setStorageFilter, facets, openAdd, openScan, openEdit, deleteProduct, exportCSV, formatDate }) {
  const activeFilters = [statusFilter !== 'All', categoryFilter !== 'All', storageFilter !== 'All', !!search].filter(Boolean).length
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground mt-1">Showing {products.length} item{products.length !== 1 ? 's' : ''}{statusFilter !== 'All' ? ` · filtered by ${STATUS_META[statusFilter]?.label || statusFilter}` : ''}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
          <Button variant="outline" onClick={openScan} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"><ScanLine className="h-4 w-4 mr-2" /> Scan with AI</Button>
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

export default App
