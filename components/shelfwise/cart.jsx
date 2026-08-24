'use client'

/* CART screen (shopping-app checkout pattern, Aug 2026).
   Add to Cart (Stock Levels) → review/edit here → CHECKOUT sends one real
   order per supplier via the existing POST /api/kitchen/orders.
   Prices shown are LIVE from each supplier's catalog (single source). */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, ShoppingCart, Loader2, Minus, Plus, Trash2, Truck, Search, CheckCircle2, AlertTriangle, PackageX } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'
import { getCart, updateCartQty, removeFromCart, clearSupplierFromCart, addToCart } from '@/lib/cart'

const fetch = apiFetch

export function CartView({ onBack, goStockLevels }) {
  const [items, setItems] = useState([])
  const [catalogs, setCatalogs] = useState({})   // supplierId -> { products, sym, minOrderValue, name }
  const [search, setSearch] = useState('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [allCatalogsLoaded, setAllCatalogsLoaded] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [sentRefs, setSentRefs] = useState([])
  const suppliersRef = useRef([])

  // cart state — live-synced via the cart-changed event
  useEffect(() => {
    const sync = () => setItems(getCart())
    sync()
    window.addEventListener('sw-cart-changed', sync)
    return () => window.removeEventListener('sw-cart-changed', sync)
  }, [])

  // load catalogs for suppliers in the cart (live prices) + supplier list
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const r = await fetch('/api/kitchen/suppliers')
        const list = await r.json().catch(() => [])
        if (!dead && Array.isArray(list)) suppliersRef.current = list
      } catch {}
    })()
    return () => { dead = true }
  }, [])

  const neededSuppliers = useMemo(() => [...new Set(items.map(i => i.supplierId))], [items])
  useEffect(() => {
    let dead = false
    for (const sid of neededSuppliers) {
      if (catalogs[sid]) continue
      ;(async () => {
        try {
          const res = await fetch(`/api/kitchen/suppliers/${sid}/catalog`)
          const data = await res.json().catch(() => ({}))
          if (!dead && res.ok) {
            setCatalogs(prev => ({
              ...prev,
              [sid]: {
                products: Array.isArray(data.products) ? data.products : [],
                sym: data.supplier?.currencySymbol || '£',
                minOrderValue: Number(data.supplier?.minOrderValue) || 0,
                name: data.supplier?.businessName || '',
              },
            }))
          }
        } catch {}
      })()
    }
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neededSuppliers.join(',')])

  // ---- search & add more items (across ALL connected suppliers) ----
  const ensureAllCatalogs = async () => {
    if (allCatalogsLoaded) return
    setSearchBusy(true)
    try {
      for (const s of suppliersRef.current) {
        if (catalogs[s.supplierId]) continue
        try {
          const res = await fetch(`/api/kitchen/suppliers/${s.supplierId}/catalog`)
          const data = await res.json().catch(() => ({}))
          if (res.ok) {
            setCatalogs(prev => ({
              ...prev,
              [s.supplierId]: {
                products: Array.isArray(data.products) ? data.products : [],
                sym: data.supplier?.currencySymbol || '£',
                minOrderValue: Number(data.supplier?.minOrderValue) || 0,
                name: data.supplier?.businessName || s.businessName || '',
              },
            }))
          }
        } catch {}
      }
      setAllCatalogsLoaded(true)
    } finally { setSearchBusy(false) }
  }
  useEffect(() => { if (search.trim().length >= 2) ensureAllCatalogs() }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    const out = []
    for (const s of suppliersRef.current) {
      const cat = catalogs[s.supplierId]
      if (!cat) continue
      for (const p of cat.products) {
        if (p.available === false) continue
        if (String(p.name || '').toLowerCase().includes(q)) {
          out.push({ supplierId: s.supplierId, supplierName: cat.name || s.businessName, sym: cat.sym, p })
          if (out.length >= 10) return out
        }
      }
    }
    return out
  }, [search, catalogs])

  // ---- grouped cart with live prices ----
  const groups = useMemo(() => {
    const by = new Map()
    for (const it of items) {
      if (!by.has(it.supplierId)) by.set(it.supplierId, { supplierId: it.supplierId, supplierName: it.supplierName, lines: [] })
      by.get(it.supplierId).lines.push(it)
    }
    return [...by.values()].map(g => {
      const cat = catalogs[g.supplierId]
      const lines = g.lines.map(l => {
        const live = cat?.products.find(p => p.id === l.productId)
        return { ...l, live, price: live ? Number(live.price) || 0 : null, displayName: live?.name || l.name, unavailable: live ? live.available === false : false, missing: cat ? !live : false }
      })
      const subtotal = lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0)
      const minOrderValue = cat?.minOrderValue || 0
      return { ...g, supplierName: cat?.name || g.supplierName, sym: cat?.sym || '£', lines, subtotal, minOrderValue, loaded: !!cat, belowMin: minOrderValue > 0 && subtotal < minOrderValue }
    }).sort((a, b) => a.supplierName.localeCompare(b.supplierName))
  }, [items, catalogs])

  const lineTotal = items.length
  const eligibleGroups = groups.filter(g => g.loaded && !g.belowMin && g.lines.some(l => l.live && !l.unavailable && l.qty > 0))

  // ---- CHECKOUT: the ONE action that sends real orders (split per supplier) ----
  const checkout = async () => {
    setCheckingOut(true)
    const refs = []
    try {
      for (const g of eligibleGroups) {
        const body = {
          supplierId: g.supplierId,
          items: g.lines.filter(l => l.live && !l.unavailable && l.qty > 0).map(l => ({ productId: l.productId, quantity: l.qty })),
          notes: 'Placed via Cart checkout',
        }
        try {
          const res = await fetch('/api/kitchen/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.error || 'Order failed')
          clearSupplierFromCart(g.supplierId)
          const ref = data.ref || ('ORD-' + String(data.id || '').replace(/-/g, '').slice(0, 6).toUpperCase())
          refs.push({ supplier: g.supplierName, ref, total: data.total })
          toast.success(`Order sent to ${g.supplierName} ✅`)
        } catch (e) {
          toast.error(`${g.supplierName}: ${e.message || 'Order failed'}`)
        }
      }
      if (refs.length) setSentRefs(refs)
    } finally { setCheckingOut(false) }
  }

  return (
    <div className="space-y-4 pb-28">
      {/* Header — back button is mandatory on every screen */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-emerald-600" /> Cart</h2>
          <p className="text-xs text-muted-foreground">Review and edit, then checkout — orders split by supplier automatically</p>
        </div>
      </div>

      {/* Search & add more items */}
      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search supplier catalogs to add more…" className="pl-9" />
        {searchBusy && <Loader2 className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {searchResults.length > 0 && (
        <div className="bg-white border-2 border-slate-100 rounded-2xl divide-y divide-slate-50">
          {searchResults.map(r => (
            <div key={r.supplierId + r.p.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.p.name}</p>
                <p className="text-[10px] text-muted-foreground">{r.supplierName}</p>
              </div>
              <span className="text-xs font-semibold">{r.p.price > 0 ? `${r.sym}${Number(r.p.price).toFixed(2)}` : 'No price set'}</span>
              <Button size="sm" className="h-7 bg-indigo-600 hover:bg-indigo-700" onClick={() => { addToCart({ supplierId: r.supplierId, supplierName: r.supplierName, productId: r.p.id, name: r.p.name, unit: r.p.unit || '', qty: 1 }); toast.success(`${r.p.name} added`) }}>
                <Plus className="h-3.5 w-3.5 mr-0.5" /> Add
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Success summary after checkout */}
      {sentRefs.length > 0 && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4">
          <p className="font-bold text-emerald-800 flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> Orders sent 🎉</p>
          <ul className="mt-1 text-sm text-emerald-900 space-y-0.5">
            {sentRefs.map(r => <li key={r.ref}>{r.supplier} — {r.ref}{r.total ? ` · total £${Number(r.total).toFixed(2)}` : ''}</li>)}
          </ul>
          <p className="text-[11px] text-emerald-700 mt-1">Track them on the Orders screen.</p>
        </div>
      )}

      {/* Cart groups */}
      {items.length === 0 && sentRefs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <PackageX className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>Your cart is empty</p>
          <Button variant="outline" className="mt-3" onClick={goStockLevels || onBack}>Browse Stock Levels</Button>
        </div>
      ) : (
        groups.map(g => (
          <div key={g.supplierId} className="bg-white border-2 border-slate-100 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <Truck className="h-4 w-4 text-indigo-600" />
              <span className="font-semibold text-sm truncate">{g.supplierName}</span>
              {!g.loaded && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
            </div>
            <div className="divide-y divide-slate-50">
              {g.lines.map(l => (
                <div key={l.productId} className="flex items-center gap-2.5 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.displayName}</p>
                    {l.unavailable && <p className="text-[10px] text-red-600">Out of stock at supplier — remove or keep for later</p>}
                    {l.missing && <p className="text-[10px] text-red-600">No longer in catalog</p>}
                    {l.price !== null && !(l.price > 0) && <p className="text-[10px] text-amber-600">No price set</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => updateCartQty(g.supplierId, l.productId, l.qty - 1)} className="h-7 w-7 rounded-full border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                    <span className="w-7 text-center text-sm font-bold text-indigo-700">{l.qty}</span>
                    <button onClick={() => updateCartQty(g.supplierId, l.productId, l.qty + 1)} className="h-7 w-7 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 flex items-center justify-center"><Plus className="h-3 w-3" /></button>
                  </div>
                  <span className="w-16 text-right text-sm font-semibold whitespace-nowrap">{l.price !== null ? `${g.sym}${(l.price * l.qty).toFixed(2)}` : '…'}</span>
                  <button onClick={() => removeFromCart(g.supplierId, l.productId)} className="text-slate-400 hover:text-red-600 p-1" title="Remove"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Subtotal</span>
              <span className="text-sm font-bold">{g.sym}{g.subtotal.toFixed(2)}
                {g.belowMin && <span className="text-[11px] font-medium text-red-600 ml-2"><AlertTriangle className="h-3 w-3 inline mr-0.5" />min order {g.sym}{g.minOrderValue.toFixed(2)}</span>}
              </span>
            </div>
          </div>
        ))
      )}

      {/* Sticky CHECKOUT bar — the ONE action that sends the orders */}
      {items.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-xl">
          <div className="bg-slate-900 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">
            <ShoppingCart className="h-5 w-5 text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{lineTotal} item{lineTotal === 1 ? '' : 's'} · {groups.length} supplier{groups.length === 1 ? '' : 's'}</p>
              {eligibleGroups.length < groups.length && <p className="text-[11px] text-amber-300">{groups.length - eligibleGroups.length} order{groups.length - eligibleGroups.length === 1 ? '' : 's'} below minimum — add more or they'll be skipped</p>}
            </div>
            <Button
              onClick={checkout}
              disabled={checkingOut || eligibleGroups.length === 0}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
            >
              {checkingOut ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Checkout{eligibleGroups.length > 1 ? ` (${eligibleGroups.length} orders)` : ''}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
