'use client'

/* STOCK LEVELS screen (Aug 2026)
   One glance at everything currently in inventory, grouped by supplier,
   with tap-to-select ordering that auto-splits into per-supplier orders.
   - No manual setup: pulls straight from /api/products (barcode/invoice/manual adds)
   - Batches of the same product are summed into one line (true current quantity)
   - Selected items are matched to each connected supplier's catalog by name and
     placed via the existing POST /api/kitchen/orders — one order per supplier. */

import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ArrowLeft, BarChart3, Loader2, Minus, Plus, Search, Truck, CheckCircle2, AlertTriangle, PackageX, ShoppingCart, X } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'

const fetch = apiFetch

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

// Match an inventory item name against a supplier catalog (best-effort fuzzy).
function matchCatalog(name, catalog) {
  const n = norm(name)
  if (!n) return null
  let best = null
  let bestScore = 0
  for (const p of catalog) {
    const c = norm(p.name)
    if (!c) continue
    let score = 0
    if (c === n) score = 100
    else if (c.includes(n) || n.includes(c)) score = 80
    else {
      const nt = n.split(' ').filter(t => t.length > 2)
      const ct = new Set(c.split(' ').filter(t => t.length > 2))
      const inter = nt.filter(t => ct.has(t)).length
      const uni = Math.max(nt.length, ct.size, 1)
      score = Math.round((inter / uni) * 70)
    }
    if (p.available === false) score -= 5
    if (score > bestScore) { bestScore = score; best = p }
  }
  return bestScore >= 45 ? best : null
}

// products.supplier is free text — match it to a connected supplier account.
function findConnected(supName, suppliers) {
  const n = norm(supName)
  if (!n) return null
  return (
    suppliers.find(s => norm(s.businessName) === n) ||
    suppliers.find(s => norm(s.businessName).includes(n) || n.includes(norm(s.businessName))) ||
    null
  )
}

function qtyTone(q) {
  if (q <= 2) return 'bg-red-100 text-red-700 border-red-200'
  if (q <= 5) return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-emerald-100 text-emerald-700 border-emerald-200'
}

export function StockLevelsView({ onBack, currency = '£' }) {
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [catalogs, setCatalogs] = useState({})   // supplierId -> { products, sym }
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [supFilter, setSupFilter] = useState('all')   // 'all' | group key
  const [sel, setSel] = useState({})            // aggKey -> order qty
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewGroups, setReviewGroups] = useState([])   // built when review opens
  const [reviewLoading, setReviewLoading] = useState(false)
  const [placingAll, setPlacingAll] = useState(false)

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const [pr, sr] = await Promise.all([fetch('/api/products'), fetch('/api/kitchen/suppliers')])
        const plist = await pr.json().catch(() => [])
        const slist = await sr.json().catch(() => [])
        if (dead) return
        setProducts(Array.isArray(plist) ? plist : [])
        setSuppliers(Array.isArray(slist) ? slist : [])
        // load every connected supplier's catalog so PRICES show on the list
        // itself (single source of truth: the supplier catalog entry)
        ;(Array.isArray(slist) ? slist : []).forEach(async (s) => {
          try {
            const res = await fetch(`/api/kitchen/suppliers/${s.supplierId}/catalog`)
            const data = await res.json().catch(() => ({}))
            if (!dead && res.ok) {
              setCatalogs(prev => ({ ...prev, [s.supplierId]: { products: Array.isArray(data.products) ? data.products : [], sym: data.supplier?.currencySymbol || currency } }))
            }
          } catch { /* price column degrades gracefully */ }
        })
      } catch {
        if (!dead) toast.error('Could not load stock levels')
      } finally { if (!dead) setLoading(false) }
    })()
    return () => { dead = true }
  }, [])

  // ---- aggregate batches of the same product into one line ----
  const items = useMemo(() => {
    const map = new Map()
    for (const p of products) {
      const key = `${norm(p.name)}|${p.unit || 'ea'}`
      if (!map.has(key)) {
        map.set(key, { key, name: p.name, unit: p.unit || 'ea', qty: 0, supplierRaw: p.supplier || '', batches: 0 })
      }
      const it = map.get(key)
      it.qty += Number(p.quantity) || 0
      it.batches += 1
      if (!it.supplierRaw && p.supplier) it.supplierRaw = p.supplier
    }
    return [...map.values()]
  }, [products])

  // ---- group ALL items by supplier (before search/filter, so the filter
  //      chips always list every supplier) ----
  const baseGroups = useMemo(() => {
    const bySup = new Map()
    for (const it of items) {
      const conn = findConnected(it.supplierRaw, suppliers)
      const label = conn ? conn.businessName : (it.supplierRaw || 'No supplier linked')
      const gk = conn ? `c:${conn.supplierId}` : (it.supplierRaw ? `t:${norm(it.supplierRaw)}` : 'z:none')
      if (!bySup.has(gk)) bySup.set(gk, { gk, label, supplierId: conn?.supplierId || null, connected: !!conn, items: [] })
      bySup.get(gk).items.push(it)
    }
    const list = [...bySup.values()]
    for (const g of list) g.items.sort((a, b) => a.qty - b.qty || a.name.localeCompare(b.name))
    list.sort((a, b) => {
      if (a.gk === 'z:none') return 1
      if (b.gk === 'z:none') return -1
      if (a.connected !== b.connected) return a.connected ? -1 : 1
      return a.label.localeCompare(b.label)
    })
    return list
  }, [items, suppliers])

  // ---- displayed groups = supplier filter + search combined ----
  const groups = useMemo(() => {
    const q = norm(search)
    return baseGroups
      .filter(g => supFilter === 'all' || g.gk === supFilter)
      .map(g => ({
        ...g,
        items: q ? g.items.filter(it => norm(it.name).includes(q) || norm(g.label).includes(q)) : g.items,
      }))
      .filter(g => g.items.length > 0)
  }, [baseGroups, supFilter, search])

  const selCount = Object.values(sel).filter(q => q > 0).length
  const selSupplierCount = useMemo(() => {
    const set = new Set()
    for (const g of groups) if (g.items.some(it => (sel[it.key] || 0) > 0)) set.add(g.gk)
    return set.size
  }, [groups, sel])

  const toggle = (it) => setSel(s => {
    const next = { ...s }
    if (next[it.key] > 0) delete next[it.key]
    else next[it.key] = 1
    return next
  })
  const setQty = (key, q) => setSel(s => {
    const next = { ...s, [key]: Math.max(0, Math.min(9999, q)) }
    if (next[key] === 0) delete next[key]
    return next
  })

  // ---- build the review sheet: match selected items to each supplier's catalog ----
  const openReview = async () => {
    setReviewOpen(true)
    setReviewLoading(true)
    try {
      const involved = groups.filter(g => g.items.some(it => (sel[it.key] || 0) > 0))
      const built = []
      for (const g of involved) {
        const chosen = g.items.filter(it => (sel[it.key] || 0) > 0).map(it => ({ ...it, orderQty: sel[it.key] }))
        if (!g.connected) {
          built.push({ ...g, status: 'not_connected', matched: [], unmatched: chosen, currencySymbol: currency, minOrderValue: 0 })
          continue
        }
        let catalog = []
        let supInfo = {}
        try {
          const res = await fetch(`/api/kitchen/suppliers/${g.supplierId}/catalog`)
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.error || 'catalog failed')
          catalog = Array.isArray(data.products) ? data.products : []
          supInfo = data.supplier || {}
        } catch {
          built.push({ ...g, status: 'error', error: 'Could not load catalog', matched: [], unmatched: chosen, currencySymbol: currency, minOrderValue: 0 })
          continue
        }
        const matched = []
        const unmatched = []
        for (const it of chosen) {
          const m = matchCatalog(it.name, catalog)
          if (m && m.available !== false) matched.push({ ...it, match: m })
          else unmatched.push(it)
        }
        built.push({
          ...g,
          status: 'ready',
          matched,
          unmatched,
          currencySymbol: supInfo.currencySymbol || currency,
          minOrderValue: Number(supInfo.minOrderValue) || 0,
        })
      }
      setReviewGroups(built)
    } finally { setReviewLoading(false) }
  }

  const groupSubtotal = (g) => g.matched.reduce((s, it) => s + (sel[it.key] || 0) * (Number(it.match.price) || 0), 0)

  const placeOne = async (g) => {
    const itemsBody = g.matched
      .map(it => ({ productId: it.match.id, quantity: sel[it.key] || 0 }))
      .filter(i => i.quantity > 0)
    if (itemsBody.length === 0) { toast.error('Nothing to order for this supplier'); return false }
    setReviewGroups(list => list.map(x => x.gk === g.gk ? { ...x, status: 'placing', error: '' } : x))
    try {
      const res = await fetch('/api/kitchen/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: g.supplierId, items: itemsBody, notes: 'Created from Stock Levels screen' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Order failed')
      setReviewGroups(list => list.map(x => x.gk === g.gk ? { ...x, status: 'done', ref: data.ref || data.id || '' } : x))
      // clear the ordered items from the selection
      setSel(s => {
        const next = { ...s }
        for (const it of g.matched) delete next[it.key]
        return next
      })
      toast.success(`Order sent to ${g.label}`)
      return true
    } catch (e) {
      setReviewGroups(list => list.map(x => x.gk === g.gk ? { ...x, status: 'ready', error: e.message || 'Order failed' } : x))
      toast.error(`${g.label}: ${e.message || 'Order failed'}`)
      return false
    }
  }

  const placeAll = async () => {
    setPlacingAll(true)
    try {
      for (const g of reviewGroups) {
        if (g.status === 'ready' && g.matched.length > 0 && !(g.minOrderValue > 0 && groupSubtotal(g) < g.minOrderValue)) {
          // eslint-disable-next-line no-await-in-loop
          await placeOne(g)
        }
      }
    } finally { setPlacingAll(false) }
  }

  const readyGroups = reviewGroups.filter(g => g.status === 'ready' && g.matched.length > 0 && !(g.minOrderValue > 0 && groupSubtotal(g) < g.minOrderValue))

  return (
    <div className="space-y-4 pb-24">
      {/* Header — back button is mandatory on every screen */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold flex items-center gap-2"><BarChart3 className="h-5 w-5 text-indigo-600" /> Stock Levels</h2>
          <p className="text-xs text-muted-foreground">Everything currently in stock, grouped by supplier — tap items to build orders</p>
        </div>
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products or suppliers…" className="pl-9" />
      </div>

      {/* Supplier filter — works together with search */}
      {baseGroups.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setSupFilter('all')}
            className={`shrink-0 text-xs font-semibold rounded-full px-3 py-1.5 border-2 transition ${supFilter === 'all' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}
          >
            All Suppliers
          </button>
          {baseGroups.map(g => (
            <button
              key={g.gk}
              onClick={() => setSupFilter(supFilter === g.gk ? 'all' : g.gk)}
              className={`shrink-0 text-xs font-semibold rounded-full px-3 py-1.5 border-2 transition whitespace-nowrap ${supFilter === g.gk ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}
            >
              {g.label} <span className={supFilter === g.gk ? 'opacity-80' : 'text-muted-foreground'}>({g.items.length})</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading stock…</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <PackageX className="h-10 w-10 mx-auto mb-2 opacity-40" />
          {search || supFilter !== 'all' ? 'Nothing matches your search or filter' : 'No inventory yet — add products by barcode, invoice or manually'}
        </div>
      ) : (
        groups.map(g => (
          <div key={g.gk} className="bg-white border-2 border-slate-100 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <Truck className={`h-4 w-4 ${g.connected ? 'text-indigo-600' : 'text-slate-400'}`} />
              <span className="font-semibold text-sm truncate">{g.label}</span>
              <span className="text-[11px] text-muted-foreground">· {g.items.length} item{g.items.length === 1 ? '' : 's'}</span>
              {g.connected ? (
                <Badge className="ml-auto bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-0 text-[10px]">orderable</Badge>
              ) : g.gk === 'z:none' ? (
                <Badge variant="outline" className="ml-auto text-[10px] text-muted-foreground">no supplier set</Badge>
              ) : (
                <Badge variant="outline" className="ml-auto text-[10px] text-amber-600 border-amber-200">not connected</Badge>
              )}
            </div>
            <div className="divide-y divide-slate-50">
              {g.items.map(it => {
                const q = sel[it.key] || 0
                const selected = q > 0
                // price straight from the linked supplier's catalog entry
                let priceEl = null
                if (g.connected) {
                  const cat = catalogs[g.supplierId]
                  if (!cat) {
                    priceEl = <span className="text-[10px] text-muted-foreground w-16 text-right shrink-0">…</span>
                  } else {
                    const m = matchCatalog(it.name, cat.products)
                    if (!m) priceEl = <span className="text-[10px] text-muted-foreground w-16 text-right shrink-0">—</span>
                    else if (!(Number(m.price) > 0)) priceEl = <span className="text-[10px] font-medium text-amber-600 w-16 text-right shrink-0">No price set</span>
                    else priceEl = <span className="text-xs font-bold text-slate-700 w-16 text-right shrink-0">{cat.sym}{Number(m.price).toFixed(2)}</span>
                  }
                }
                return (
                  <div
                    key={it.key}
                    onClick={() => toggle(it)}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition ${selected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'}`}
                  >
                    <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 ${selected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                      {selected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{it.name}</p>
                      {it.batches > 1 && <p className="text-[10px] text-muted-foreground">{it.batches} batches combined</p>}
                    </div>
                    {priceEl}
                    <span className={`text-xs font-bold border rounded-full px-2.5 py-1 whitespace-nowrap ${qtyTone(it.qty)}`}>
                      {it.qty} {it.unit}
                    </span>
                    {selected && (
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setQty(it.key, q - 1)} className="h-7 w-7 rounded-full border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                        <span className="w-7 text-center text-sm font-bold text-indigo-700">{q}</span>
                        <button onClick={() => setQty(it.key, q + 1)} className="h-7 w-7 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 flex items-center justify-center"><Plus className="h-3 w-3" /></button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      {/* Sticky selection bar */}
      {selCount > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-xl">
          <div className="bg-slate-900 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">
            <ShoppingCart className="h-5 w-5 text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{selCount} item{selCount === 1 ? '' : 's'} selected</p>
              <p className="text-[11px] text-slate-300">will split into {selSupplierCount} supplier order{selSupplierCount === 1 ? '' : 's'} automatically</p>
            </div>
            <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-slate-800" onClick={() => setSel({})}>Clear</Button>
            <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold" onClick={openReview}>Review orders</Button>
          </div>
        </div>
      )}

      {/* Review & place — auto-split by supplier */}
      <Dialog open={reviewOpen} onOpenChange={v => { if (!v) setReviewOpen(false) }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-emerald-600" /> Review orders</DialogTitle>
          </DialogHeader>
          {reviewLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Matching items to supplier catalogs…</div>
          ) : (
            <div className="space-y-4">
              {reviewGroups.map(g => {
                const sub = groupSubtotal(g)
                const belowMin = g.minOrderValue > 0 && sub < g.minOrderValue
                return (
                  <div key={g.gk} className="border-2 border-slate-100 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                      <Truck className="h-4 w-4 text-indigo-600" />
                      <span className="font-semibold text-sm truncate">{g.label}</span>
                      {g.status === 'done' && <Badge className="ml-auto bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 text-[10px]">✓ order sent</Badge>}
                    </div>
                    <div className="p-3 space-y-2">
                      {g.status === 'not_connected' && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 flex gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          {g.gk === 'z:none' ? 'These items have no supplier set — edit the products to link one.' : `"${g.label}" isn't a connected supplier yet — connect them from the Orders screen to order in-app.`}
                        </p>
                      )}
                      {g.status === 'error' && <p className="text-xs text-red-600">{g.error}</p>}
                      {g.matched.map(it => (
                        <div key={it.key} className="flex items-center gap-2 text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{it.match.name}</p>
                            {norm(it.match.name) !== norm(it.name) && <p className="text-[10px] text-muted-foreground truncate">matched from “{it.name}”</p>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setQty(it.key, (sel[it.key] || 0) - 1)} className="h-6 w-6 rounded-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                            <span className="w-6 text-center font-bold text-indigo-700">{sel[it.key] || 0}</span>
                            <button onClick={() => setQty(it.key, (sel[it.key] || 0) + 1)} className="h-6 w-6 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 flex items-center justify-center"><Plus className="h-3 w-3" /></button>
                          </div>
                          <span className="w-16 text-right font-semibold whitespace-nowrap">{g.currencySymbol}{((sel[it.key] || 0) * (Number(it.match.price) || 0)).toFixed(2)}</span>
                        </div>
                      ))}
                      {g.unmatched.length > 0 && g.status !== 'not_connected' && (
                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                          <p className="font-semibold flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Not found in this supplier's catalog:</p>
                          <p className="mt-0.5">{g.unmatched.map(u => u.name).join(', ')}</p>
                          <p className="mt-0.5 text-[10px] opacity-80">Order these from the supplier's catalog page, or ask them to add the product.</p>
                        </div>
                      )}
                      {g.status === 'not_connected' && g.unmatched.length > 0 && (
                        <p className="text-xs text-muted-foreground">{g.unmatched.map(u => `${u.name} × ${sel[u.key] || 0}`).join(' · ')}</p>
                      )}
                      {g.matched.length > 0 && g.status !== 'done' && (
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                          <div className="text-xs">
                            <span className="text-muted-foreground">Subtotal </span>
                            <span className="font-bold">{g.currencySymbol}{sub.toFixed(2)}</span>
                            {belowMin && <span className="text-red-600 font-medium ml-2">min order {g.currencySymbol}{g.minOrderValue.toFixed(2)}</span>}
                          </div>
                          <Button size="sm" disabled={g.status === 'placing' || belowMin || sub <= 0} onClick={() => placeOne(g)} className="bg-indigo-600 hover:bg-indigo-700">
                            {g.status === 'placing' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Truck className="h-3.5 w-3.5 mr-1" />} Place order
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {readyGroups.length > 1 && (
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 font-semibold" disabled={placingAll} onClick={placeAll}>
                  {placingAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Place all {readyGroups.length} orders
                </Button>
              )}
              <Button variant="outline" className="w-full" onClick={() => setReviewOpen(false)}>
                <X className="h-4 w-4 mr-1.5" /> Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
