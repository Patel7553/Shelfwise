'use client'

/* ============================================================================
   ShelfWise — KITCHEN ↔ SUPPLIER MARKETPLACE (Aug 2026, migration-21)
   Professional B2B ordering flow for kitchen accounts:
     1. Connect to suppliers (code / email / business-name search — automatic)
     2. Browse a connected supplier's catalog by category, build a cart
     3. Review screen (edit qty / remove) + delivery date + notes
     4. Confirmation with order reference
     5. Order history with status + one-tap reorder
   ============================================================================ */

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Truck, Plus, Minus, Trash2, Loader2, Check, X, Search, ShoppingCart,
  ArrowLeft, ArrowRight, CalendarDays, ClipboardCheck, Store, Link2,
  History, RotateCcw, PackageX, CheckCircle2, Unlink, Pencil, Ban, Download, Info, FileText,
} from 'lucide-react'
import { apiFetch, apiJson } from '@/lib/apiClient'
import { downloadOrderSummaryCsv, printOrderSummary } from '@/components/shelfwise/supplier'

const money = (n, sym = '£') => `${sym}${(Number(n) || 0).toFixed(2)}`

const STATUS_STYLE = {
  pending:   { label: 'Pending',   cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  confirmed: { label: 'Confirmed', cls: 'bg-sky-100 text-sky-800 border-sky-300' },
  fulfilled: { label: 'Fulfilled', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500 border-slate-300' },
}

// ---------------------------------------------------------------------------
// Amazon-style order progress tracker:
//   Order Placed → Confirmed by Supplier → Delivered
// ---------------------------------------------------------------------------
function OrderStatusTracker({ status }) {
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 text-sm text-slate-600">
        <Ban className="h-4 w-4 shrink-0" /> This order was cancelled.
      </div>
    )
  }
  const stage = status === 'fulfilled' ? 2 : status === 'confirmed' ? 1 : 0
  const steps = [
    { label: 'Order Placed', sub: 'Sent to supplier' },
    { label: 'Confirmed', sub: 'Accepted by supplier' },
    { label: 'Delivered', sub: 'Order fulfilled' },
  ]
  return (
    <div className="flex items-start w-full py-1" aria-label={`Order progress: step ${stage + 1} of 3`}>
      {steps.map((s, i) => {
        const done = i < stage
        const current = i === stage
        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center text-center" style={{ minWidth: 76 }}>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition
                ${done || (current && stage === 2) ? 'bg-emerald-500 border-emerald-500 text-white'
                  : current ? 'bg-indigo-600 border-indigo-600 text-white animate-pulse'
                  : 'bg-white border-slate-300 text-slate-300'}`}>
                {done || (current && stage === 2) ? <Check className="h-4 w-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
              </div>
              <p className={`text-[11px] font-semibold mt-1 leading-tight ${done || current ? 'text-slate-800' : 'text-slate-400'}`}>{s.label}</p>
              <p className={`text-[9px] leading-tight ${done || current ? 'text-muted-foreground' : 'text-slate-300'}`}>{s.sub}</p>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mt-4 rounded ${i < stage ? 'bg-emerald-400' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Connect-to-supplier panel (search by name, or enter code / email)
// ---------------------------------------------------------------------------
function ConnectSupplierPanel({ onConnected }) {
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null) // null = not searched yet
  const [connecting, setConnecting] = useState(null)

  const search = async () => {
    const term = q.trim()
    if (term.length < 2) { toast.error('Type at least 2 characters — a business name, SUP- code or email'); return }
    setSearching(true)
    try {
      const list = await apiJson(`/api/kitchen/suppliers/search?q=${encodeURIComponent(term)}`)
      setResults(Array.isArray(list) ? list : [])
    } catch (e) {
      toast.error(e.message || 'Search failed')
    } finally { setSearching(false) }
  }

  const connect = async (payload, label) => {
    setConnecting(label)
    try {
      const res = await apiJson('/api/kitchen/suppliers/connect', { method: 'POST', body: JSON.stringify(payload) })
      toast.success(res.alreadyConnected ? `Already connected to ${res.businessName}` : `Connected to ${res.businessName} ✓`)
      setResults(null)
      setQ('')
      onConnected()
    } catch (e) {
      toast.error(e.message || 'Could not connect')
    } finally { setConnecting(null) }
  }

  // Direct connect when the input looks like a connection/supplier code or email
  const looksLikeCode = /^((sup|con)-)?[a-z0-9]{6}$/i.test(q.trim())
  const looksLikeEmail = q.includes('@') && q.includes('.')

  return (
    <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 p-4">
      <p className="font-semibold text-sm flex items-center gap-1.5 text-indigo-900"><Link2 className="h-4 w-4" /> Connect a supplier</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        Enter the connection code your supplier gave you (e.g. CON-8XK2FQ) — it links you AND sets up your account
        reference automatically. You can also use their general code, email, or search by business name.
      </p>
      <div className="flex gap-2 mt-2.5">
        <Input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') search() }}
          placeholder='e.g. CON-8XK2FQ, "Fresh Farm Foods" or orders@freshfarm.com' className="bg-white" />
        {(looksLikeCode || looksLikeEmail) ? (
          <Button onClick={() => connect(looksLikeEmail ? { email: q.trim() } : { code: q.trim() }, 'direct')} disabled={!!connecting} className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">
            {connecting === 'direct' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Link2 className="h-4 w-4 mr-1.5" />} Connect
          </Button>
        ) : (
          <Button onClick={search} disabled={searching} variant="outline" className="shrink-0 bg-white">
            {searching ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />} Search
          </Button>
        )}
      </div>
      {results !== null && (
        <div className="mt-3 space-y-2">
          {results.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No suppliers found — double-check the name/code, or ask your supplier for their ShelfWise code.</p>
          ) : results.map(r => (
            <div key={r.supplierId} className="flex items-center gap-3 bg-white border rounded-lg px-3 py-2">
              <Store className="h-4 w-4 text-indigo-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{r.businessName}</p>
                <p className="text-xs text-muted-foreground truncate">{r.email}{r.deliveryDays ? ` · Delivers: ${r.deliveryDays}` : ''}</p>
              </div>
              <Button size="sm" onClick={() => connect({ supplierId: r.supplierId }, r.supplierId)} disabled={!!connecting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {connecting === r.supplierId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Link2 className="h-3.5 w-3.5 mr-1" /> Connect</>}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ORDER WIZARD — browse catalog → review → confirmation
// ---------------------------------------------------------------------------
function OrderWizard({ supplier, initialCart = {}, editOrder = null, startStep = null, onBack, onPlaced }) {
  const isEdit = !!editOrder
  const [step, setStep] = useState(startStep || (isEdit ? 'review' : 'browse')) // browse | review | done
  const [loading, setLoading] = useState(true)
  const [catalog, setCatalog] = useState([])
  const [supInfo, setSupInfo] = useState(supplier)
  const [cart, setCart] = useState(initialCart)       // productId -> qty
  const [filter, setFilter] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(editOrder?.requestedDeliveryDate || '')
  const [notes, setNotes] = useState(editOrder?.notes || '')
  const [placing, setPlacing] = useState(false)
  const [placedOrder, setPlacedOrder] = useState(null)

  const sym = supInfo?.currencySymbol || '£'

  useEffect(() => {
    (async () => {
      try {
        const data = await apiJson(`/api/kitchen/suppliers/${supplier.supplierId}/catalog`)
        setCatalog(Array.isArray(data.products) ? data.products : [])
        if (data.supplier) setSupInfo(s => ({ ...s, ...data.supplier }))
      } catch (e) {
        toast.error(e.message || 'Could not load catalog')
        onBack()
      } finally { setLoading(false) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier.supplierId])

  const byId = useMemo(() => Object.fromEntries(catalog.map(p => [p.id, p])), [catalog])
  const cartItems = Object.entries(cart).filter(([id, q]) => q > 0 && byId[id]).map(([id, q]) => ({ ...byId[id], qty: q }))
  const subtotal = cartItems.reduce((s, i) => s + i.qty * i.price, 0)
  const vatRate = Number(supInfo?.defaultVatRate) || 0
  const total = subtotal * (1 + vatRate / 100)
  const minOrder = Number(supInfo?.minOrderValue) || 0
  const belowMin = minOrder > 0 && subtotal < minOrder

  const setQty = (id, qty) => setCart(c => ({ ...c, [id]: Math.max(0, Math.min(9999, qty)) }))

  // Group visible products by category
  const grouped = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const vis = catalog.filter(p => !f || p.name.toLowerCase().includes(f) || (p.category || '').toLowerCase().includes(f))
    const g = {}
    for (const p of vis) {
      const cat = p.category || 'Other'
      if (!g[cat]) g[cat] = []
      g[cat].push(p)
    }
    return Object.keys(g).sort().map(cat => ({ cat, items: g[cat] }))
  }, [catalog, filter])

  const placeOrder = async () => {
    if (cartItems.length === 0) { toast.error('Your cart is empty'); return }
    if (belowMin) { toast.error(`Minimum order is ${money(minOrder, sym)}`); return }
    setPlacing(true)
    try {
      const payload = {
        supplierId: supplier.supplierId,
        items: cartItems.map(i => ({ productId: i.id, quantity: i.qty })),
        requestedDeliveryDate: deliveryDate || undefined,
        notes,
      }
      const order = isEdit
        ? await apiJson(`/api/kitchen/orders/${editOrder.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiJson('/api/kitchen/orders', { method: 'POST', body: JSON.stringify(payload) })
      setPlacedOrder(order)
      setStep('done')
      onPlaced && onPlaced()
    } catch (e) {
      toast.error(e.message || (isEdit ? 'Update failed — try again' : 'Order failed — try again'))
    } finally { setPlacing(false) }
  }

  const Stepper = ({ p }) => {
    const qty = cart[p.id] || 0
    return qty === 0 ? (
      <Button size="sm" variant="outline" className="h-8 border-indigo-300 text-indigo-700 hover:bg-indigo-50" onClick={() => setQty(p.id, 1)}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add
      </Button>
    ) : (
      <div className="flex items-center gap-1">
        <button onClick={() => setQty(p.id, qty - 1)} className="h-8 w-8 rounded-lg border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center justify-center"><Minus className="h-3.5 w-3.5" /></button>
        <input type="number" min="0" value={qty}
          onChange={e => setQty(p.id, Number(e.target.value) || 0)}
          className="h-8 w-14 text-center text-sm font-bold border-2 border-indigo-200 rounded-lg" />
        <button onClick={() => setQty(p.id, qty + 1)} className="h-8 w-8 rounded-lg border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center justify-center"><Plus className="h-3.5 w-3.5" /></button>
      </div>
    )
  }

  // ---------- STEP: done ----------
  if (step === 'done' && placedOrder) {
    return (
      <Card className="border-0 shadow-sm max-w-xl mx-auto">
        <CardContent className="pt-8 pb-6 text-center space-y-3">
          <div className="w-16 h-16 mx-auto bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-emerald-900">{isEdit ? 'Order updated ✅' : 'Order placed! 🎉'}</h3>
          <p className="text-sm text-muted-foreground">
            {isEdit ? <>Your changes to order <b className="text-slate-800">{placedOrder.orderRef}</b> were sent to <b className="text-slate-800">{supInfo.businessName}</b>.</>
              : <>Your order <b className="text-slate-800">{placedOrder.orderRef}</b> has been sent to <b className="text-slate-800">{supInfo.businessName}</b>.
            They'll see it instantly in their orders queue.</>}
          </p>
          <div className="border rounded-lg divide-y text-left max-w-sm mx-auto">
            {(placedOrder.items || []).map((i, idx) => (
              <div key={idx} className="px-3 py-1.5 flex justify-between text-sm">
                <span className="truncate">{i.name}</span>
                <span className="text-muted-foreground whitespace-nowrap ml-2">{i.quantity} {i.unit || ''}</span>
              </div>
            ))}
          </div>
          <p className="text-lg font-bold text-indigo-700">Total {money(placedOrder.total, sym)}</p>
          {placedOrder.requestedDeliveryDate && (
            <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> Requested delivery: <b>{new Date(placedOrder.requestedDeliveryDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</b></p>
          )}
          <div className="flex justify-center gap-2 pt-2">
            <Button variant="outline" onClick={onBack}><History className="h-4 w-4 mr-1.5" /> View order history</Button>
            <Button onClick={() => { setCart({}); setNotes(''); setDeliveryDate(''); setStep('browse') }} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="h-4 w-4 mr-1.5" /> New order
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Wizard header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={step === 'review' ? () => setStep('browse') : onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> {step === 'review' ? 'Back to catalog' : 'Back'}
          </Button>
          <div>
            <p className="font-bold leading-tight">{supInfo.businessName}</p>
            <p className="text-xs text-muted-foreground">
              {supInfo.deliveryDays ? `Delivers: ${supInfo.deliveryDays}` : 'Catalog'}
              {minOrder > 0 ? ` · Min order ${money(minOrder, sym)}` : ''}
            </p>
          </div>
        </div>
        {/* Step indicator */}
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <span className={`px-2.5 py-1 rounded-full ${step === 'browse' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'}`}>1. Products</span>
          <ArrowRight className="h-3 w-3 text-slate-400" />
          <span className={`px-2.5 py-1 rounded-full ${step === 'review' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>2. Review</span>
          <ArrowRight className="h-3 w-3 text-slate-400" />
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">3. Confirm</span>
        </div>
      </div>

      {/* ---------- STEP: browse ---------- */}
      {step === 'browse' && (
        <>
          {loading ? (
            <div className="text-center py-16"><Loader2 className="h-8 w-8 mx-auto animate-spin text-indigo-500" /></div>
          ) : catalog.length === 0 ? (
            <Card className="border-0 shadow-sm"><CardContent className="text-center py-14 text-muted-foreground">
              <PackageX className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">This supplier hasn't added any products yet</p>
              <p className="text-sm">Ask them to fill in their catalog in ShelfWise.</p>
            </CardContent></Card>
          ) : (
            <>
              <div className="relative max-w-md">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Filter products…" value={filter} onChange={e => setFilter(e.target.value)} />
              </div>
              <div className="space-y-5 pb-24">
                {grouped.map(({ cat, items }) => (
                  <div key={cat}>
                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 rounded-md px-2.5 py-1.5 inline-block mb-2">{cat} <span className="text-indigo-400">({items.length})</span></p>
                    <div className="border rounded-xl divide-y overflow-hidden">
                      {items.map(p => (
                        <div key={p.id} className="flex items-center gap-3 px-3.5 py-2.5 bg-white hover:bg-indigo-50/30 transition">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{p.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {money(p.price, sym)}{p.unit ? ` / ${p.unit}` : ''}{p.packSize ? ` · ${p.packSize}` : ''}{p.sku ? ` · ${p.sku}` : ''}
                            </p>
                          </div>
                          {(cart[p.id] || 0) > 0 && (
                            <span className="text-sm font-bold text-indigo-700 whitespace-nowrap">{money((cart[p.id] || 0) * p.price, sym)}</span>
                          )}
                          <Stepper p={p} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Sticky cart bar */}
              {cartItems.length > 0 && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl">
                  <div className="bg-indigo-600 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">
                    <ShoppingCart className="h-5 w-5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm">{cartItems.length} item{cartItems.length !== 1 ? 's' : ''} · {money(subtotal, sym)}</p>
                      {belowMin && <p className="text-[11px] text-amber-200">Min order {money(minOrder, sym)} — add {money(minOrder - subtotal, sym)} more</p>}
                    </div>
                    <Button onClick={() => setStep('review')} className="bg-white text-indigo-700 hover:bg-indigo-50 font-bold shrink-0">
                      Review order <ArrowRight className="h-4 w-4 ml-1.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ---------- STEP: review ---------- */}
      {step === 'review' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Itemised list */}
          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardHeader className="pb-3"><CardTitle className="text-lg">Order summary</CardTitle><CardDescription>Check quantities before confirming — tap to edit or remove</CardDescription></CardHeader>
            <CardContent>
              {cartItems.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Cart is empty — go back and add products.</p>
                </div>
              ) : (
                <div className="border rounded-xl divide-y overflow-hidden">
                  {cartItems.map(i => (
                    <div key={i.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{i.name}</p>
                        <p className="text-xs text-muted-foreground">{money(i.price, sym)}{i.unit ? ` / ${i.unit}` : ''}</p>
                      </div>
                      <Stepper p={i} />
                      <span className="w-20 text-right font-bold text-sm text-indigo-700">{money(i.qty * i.price, sym)}</span>
                      <button onClick={() => setQty(i.id, 0)} aria-label="Remove" className="h-8 w-8 rounded-full hover:bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Delivery + totals */}
          <Card className="border-0 shadow-sm h-fit">
            <CardHeader className="pb-3"><CardTitle className="text-lg">Delivery & totals</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Requested delivery date</Label>
                <Input type="date" value={deliveryDate} min={new Date().toISOString().slice(0, 10)} onChange={e => setDeliveryDate(e.target.value)} />
                {supInfo.deliveryDays && <p className="text-[11px] text-muted-foreground mt-1">This supplier delivers: {supInfo.deliveryDays}</p>}
              </div>
              <div>
                <Label className="text-xs">Notes / special instructions</Label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder='e.g. "Please deliver to back entrance"' className="w-full rounded-md border border-input bg-white p-2 text-sm" />
              </div>
              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-semibold">{money(subtotal, sym)}</span></div>
                {vatRate > 0 && <div className="flex justify-between"><span className="text-muted-foreground">VAT ({vatRate}%)</span><span className="font-semibold">{money(subtotal * vatRate / 100, sym)}</span></div>}
                <div className="flex justify-between text-lg font-bold text-indigo-700 pt-1"><span>Total</span><span>{money(total, sym)}</span></div>
              </div>
              {belowMin && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  ⚠️ Below this supplier's minimum order of {money(minOrder, sym)} — add {money(minOrder - subtotal, sym)} more to place the order.
                </p>
              )}
              <Button onClick={placeOrder} disabled={placing || cartItems.length === 0 || belowMin} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11">
                {placing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ClipboardCheck className="h-4 w-4 mr-1.5" />}
                {isEdit ? 'Save changes' : 'Place order'} · {money(total, sym)}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MAIN — Marketplace view (suppliers + history + wizard)
// ---------------------------------------------------------------------------
export function MarketplaceView() {
  const [suppliers, setSuppliers] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [migrationNeeded, setMigrationNeeded] = useState(false)
  const [wizard, setWizard] = useState(null)  // null | { supplier, initialCart }
  const [expanded, setExpanded] = useState(null)

  const load = useCallback(async () => {
    try {
      const [sup, ord] = await Promise.all([
        apiJson('/api/kitchen/suppliers'),
        apiJson('/api/kitchen/orders').catch(() => []),
      ])
      setSuppliers(Array.isArray(sup) ? sup : [])
      setOrders(Array.isArray(ord) ? ord : [])
      setMigrationNeeded(false)
    } catch (e) {
      if (/migration-21/i.test(e.message || '')) setMigrationNeeded(true)
      else toast.error(e.message || 'Failed to load suppliers')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const disconnect = async (s) => {
    if (!window.confirm(`Disconnect from ${s.businessName}? You can reconnect anytime with their code.`)) return
    try {
      await apiJson(`/api/kitchen/suppliers/${s.connectionId}`, { method: 'DELETE' })
      toast.success(`Disconnected from ${s.businessName}`)
      load()
    } catch (e) { toast.error(e.message || 'Failed') }
  }

  const reorder = (o) => {
    const sup = suppliers.find(s => s.supplierId === o.supplierId)
    if (!sup) { toast.error('You are no longer connected to this supplier'); return }
    const initialCart = {}
    for (const i of (o.items || [])) if (i.productId) initialCart[i.productId] = Number(i.quantity) || 1
    if (Object.keys(initialCart).length === 0) { toast.error('This order has no reorderable items'); return }
    setWizard({ supplier: sup, initialCart })
  }

  // Edit a PENDING order — reopens the wizard prefilled, saves via PUT.
  // startStep 'browse' = "Add items" (jump straight to the catalog),
  // startStep 'review' = "Edit order" (jump to the summary screen).
  const editOrder = (o, startStep = 'review') => {
    const sup = suppliers.find(s => s.supplierId === o.supplierId)
    if (!sup) { toast.error('You are no longer connected to this supplier'); return }
    const initialCart = {}
    for (const i of (o.items || [])) if (i.productId) initialCart[i.productId] = Number(i.quantity) || 1
    setWizard({ supplier: sup, initialCart, editOrder: o, startStep })
  }

  // Cancel a PENDING order (with confirmation prompt)
  const [cancelBusy, setCancelBusy] = useState(null)
  const cancelOrder = async (o) => {
    if (!window.confirm(`Are you sure you want to cancel order ${o.orderRef}? This cannot be undone.`)) return
    setCancelBusy(o.id)
    try {
      await apiJson(`/api/kitchen/orders/${o.id}`, { method: 'DELETE' })
      toast.success(`Order ${o.orderRef} cancelled — your supplier has been notified`)
      load()
    } catch (e) { toast.error(e.message || 'Could not cancel order') } finally { setCancelBusy(null) }
  }

  if (wizard) {
    return <OrderWizard supplier={wizard.supplier} initialCart={wizard.initialCart} editOrder={wizard.editOrder || null} startStep={wizard.startStep || null} onBack={() => { setWizard(null); load() }} onPlaced={load} />
  }

  return (
    <div className="space-y-5">
      {migrationNeeded && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <b>One-time setup needed:</b> run <code className="bg-amber-100 px-1 rounded">supabase/migration-21-supplier-connections.sql</code> in the Supabase SQL editor, then refresh.
        </div>
      )}

      {/* Connected suppliers */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg"><Store className="h-5 w-5 text-indigo-600" /> My suppliers</CardTitle>
          <CardDescription>Order directly from connected ShelfWise suppliers — orders land in their queue instantly</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="py-8 text-center"><Loader2 className="h-7 w-7 mx-auto animate-spin text-indigo-500" /></div>
          ) : (
            <>
              {suppliers.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {suppliers.map(s => (
                    <div key={s.connectionId} className="border-2 border-indigo-100 rounded-xl p-4 hover:border-indigo-300 transition">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-10 w-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0"><Truck className="h-5 w-5" /></div>
                          <div className="min-w-0">
                            <p className="font-bold truncate">{s.businessName}</p>
                            <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                          </div>
                        </div>
                        <button onClick={() => disconnect(s)} title="Disconnect" className="h-7 w-7 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center shrink-0">
                          <Unlink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground mt-2">
                        {s.deliveryDays && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {s.deliveryDays}</span>}
                        {s.minOrderValue > 0 && <span>Min order {money(s.minOrderValue, s.currencySymbol)}</span>}
                        {s.clientCode && <span className="font-mono">Account ref: {s.clientCode}</span>}
                      </div>
                      <Button onClick={() => setWizard({ supplier: s, initialCart: {} })} className="w-full mt-3 bg-indigo-600 hover:bg-indigo-700 text-white">
                        <ShoppingCart className="h-4 w-4 mr-1.5" /> Place order
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <ConnectSupplierPanel onConnected={load} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Order history */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5 text-indigo-600" /> Order history</CardTitle>
          <CardDescription>Orders placed with your connected suppliers</CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="font-medium text-sm">No orders yet</p>
              <p className="text-xs">Connect a supplier above and place your first order.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map(o => {
                const st = STATUS_STYLE[o.status] || STATUS_STYLE.pending
                const isOpen = expanded === o.id
                return (
                  <div key={o.id} className="border rounded-lg overflow-hidden">
                    <button onClick={() => setExpanded(isOpen ? null : o.id)} className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-indigo-50/40 transition text-left">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{o.supplierName} <span className="text-xs font-normal text-muted-foreground">· {o.orderRef}</span></p>
                        <p className="text-xs text-muted-foreground">
                          {(o.items || []).length} items · {o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-GB') : ''}
                          {o.requestedDeliveryDate ? ` · Delivery: ${new Date(o.requestedDeliveryDate + 'T00:00:00').toLocaleDateString('en-GB')}` : ''}
                        </p>
                      </div>
                      <span className="font-bold text-sm text-indigo-700 whitespace-nowrap">{money(o.total)}</span>
                      <Badge variant="outline" className={`${st.cls} text-[10px] shrink-0`}>{st.label}</Badge>
                    </button>
                    {isOpen && (
                      <div className="border-t bg-slate-50/60 px-3.5 py-3 space-y-3">
                        {/* Amazon-style progress tracker */}
                        <div className="bg-white border rounded-lg px-4 py-2.5">
                          <OrderStatusTracker status={o.status} />
                        </div>
                        <div className="border rounded-lg divide-y bg-white">
                          {(o.items || []).map((i, idx) => (
                            <div key={idx} className="px-3 py-1.5 flex justify-between text-sm">
                              <span>{i.name}{i.sku ? <span className="text-[10px] text-muted-foreground font-mono ml-1.5">{i.sku}</span> : null}</span>
                              <span className="text-muted-foreground">{i.quantity} {i.unit || ''} × {money(i.price)}</span>
                            </div>
                          ))}
                        </div>
                        {o.notes && <p className="text-xs text-muted-foreground italic">📝 {o.notes}</p>}
                        {o.status === 'confirmed' && (
                          <p className="text-xs flex items-center gap-1.5 text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1.5">
                            <Info className="h-3.5 w-3.5 shrink-0" /> This order is confirmed — contact your supplier directly to change or add items to a confirmed order.
                          </p>
                        )}
                        <div className="flex justify-end flex-wrap gap-2">
                          {o.status === 'pending' && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => editOrder(o, 'browse')}>
                                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add items
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => editOrder(o, 'review')}>
                                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit order
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" disabled={cancelBusy === o.id} onClick={() => cancelOrder(o)}>
                                {cancelBusy === o.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Ban className="h-3.5 w-3.5 mr-1.5" />} Cancel order
                              </Button>
                            </>
                          )}
                          {o.status !== 'cancelled' && (
                            <Button size="sm" variant="outline" onClick={() => {
                              const sup = suppliers.find(s => s.supplierId === o.supplierId)
                              printOrderSummary(o, { currencySymbol: sup?.currencySymbol || '£' }, o.supplierName, sup?.email || '', sup?.clientCode || '')
                            }}>
                              <FileText className="h-3.5 w-3.5 mr-1.5" /> Summary (Print / PDF)
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => {
                            const sup = suppliers.find(s => s.supplierId === o.supplierId)
                            downloadOrderSummaryCsv(o, sup?.clientCode || '')
                          }}>
                            <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
                          </Button>
                          {o.status !== 'cancelled' && (
                            <Button size="sm" variant="outline" onClick={() => reorder(o)}>
                              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reorder these items
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
