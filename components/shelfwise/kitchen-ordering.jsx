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
  LayoutGrid, List, PackagePlus,
} from 'lucide-react'
import { apiFetch, apiJson } from '@/lib/apiClient'
import { catEmoji } from '@/components/shelfwise/shared'
import { downloadOrderSummaryCsv, printOrderSummary } from '@/components/shelfwise/supplier'

const money = (n, sym = '£') => `${sym}${(Number(n) || 0).toFixed(2)}`

const STATUS_STYLE = {
  pending:    { label: 'Pending',    cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  confirmed:  { label: 'Confirmed',  cls: 'bg-sky-100 text-sky-800 border-sky-300' },
  dispatched: { label: 'Dispatched', cls: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  fulfilled:  { label: 'Delivered',  cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  cancelled:  { label: 'Cancelled',  cls: 'bg-slate-100 text-slate-500 border-slate-300' },
}

const daysAgoLabel = (iso) => {
  if (!iso) return ''
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
  return d === 0 ? 'Delivered today' : d === 1 ? 'Delivered yesterday' : `Delivered ${d} days ago`
}

// ---------------------------------------------------------------------------
// RECENT PRICE CHANGES (Sept 2026): small section on the supplier page showing
// the latest logged price alerts for THIS supplier — same data as the bell feed.
// Renders nothing when there are no recorded changes.
// ---------------------------------------------------------------------------
function RecentPriceChanges({ supplierName }) {
  const [items, setItems] = useState([])
  useEffect(() => {
    if (!supplierName) return
    let alive = true
    apiJson(`/api/notifications?type=price&supplier=${encodeURIComponent(supplierName)}`)
      .then(d => { if (alive) setItems(Array.isArray(d.items) ? d.items.slice(0, 5) : []) })
      .catch(() => {})
    return () => { alive = false }
  }, [supplierName])
  if (items.length === 0) return null
  return (
    <Card className="border-teal-200 bg-teal-50/50 shadow-none">
      <CardContent className="py-3 px-4">
        <p className="text-xs font-bold text-teal-800 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <History className="h-3.5 w-3.5" /> Recent price changes
        </p>
        <ul className="space-y-1">
          {items.map(n => (
            <li key={n.id} className="text-sm text-teal-900 flex items-baseline justify-between gap-2">
              <span className="truncate">💷 {String(n.message || '').replace(/\s*\(.*catalogue\)\s*$/, '')}</span>
              <span className="text-[10px] text-teal-700/70 shrink-0">{new Date(n.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// DELIVERY CHECK (Aug 2026): staff tick off each item as Received /
// Not received / Missing-Damaged when the delivery arrives, leave an optional
// note to the supplier, then "Close invoice". Issues are sent to the supplier
// automatically (email + push). Includes a Back button (app standard).
// ---------------------------------------------------------------------------
const CHECK_OPTS = [
  { v: 'received', label: '✓ Received', on: 'bg-emerald-600 border-emerald-600 text-white', off: 'border-slate-200 text-slate-500 hover:border-emerald-300' },
  { v: 'not_received', label: '✕ Not received', on: 'bg-red-600 border-red-600 text-white', off: 'border-slate-200 text-slate-500 hover:border-red-300' },
  { v: 'damaged', label: '⚠ Missing/Damaged', on: 'bg-amber-500 border-amber-500 text-white', off: 'border-slate-200 text-slate-500 hover:border-amber-300' },
]
function DeliveryCheckDialog({ order, onClose, onDone, readonlyData }) {
  const ro = !!readonlyData
  const [statuses, setStatuses] = useState({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (order && !ro) { setStatuses({}); setNote('') }
  }, [order?.id, ro]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!order) return null
  const items = ro ? (readonlyData.items || []) : (order.items || [])

  const submit = async () => {
    setBusy(true)
    try {
      const payload = {
        items: (order.items || []).map((i, idx) => ({ name: i.name, quantity: i.quantity, unit: i.unit || '', status: statuses[idx] || 'received' })),
        note: note.trim(),
      }
      const res = await apiJson(`/api/kitchen/orders/${order.id}/delivery-check`, { method: 'POST', body: JSON.stringify(payload) })
      if (res.creditTotal > 0) toast.success(`Delivery check saved — credit request of £${res.creditTotal.toFixed(2)} sent to the supplier 💳`)
      else if (res.notified) toast.success('Delivery check saved — supplier notified of your note 📨')
      else toast.success('Delivery check saved — all items received ✓')
      onDone()
    } catch (e) { toast.error(e.message || 'Could not save the check') } finally { setBusy(false) }
  }

  return (
    <Dialog open={!!order} onOpenChange={(v) => { if (!v && !busy) onClose() }}>
      <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-indigo-600" /> {ro ? `Delivery check — ${order.orderRef}` : `Check delivery — ${order.orderRef}`}</DialogTitle>
        </DialogHeader>
        {ro && (
          <p className="text-xs text-muted-foreground -mt-1">Checked by <b className="capitalize">{readonlyData.checkedBy || '—'}</b> on {readonlyData.checkedAt ? new Date(readonlyData.checkedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
        )}
        <div className="space-y-2">
          {items.map((i, idx) => {
            const current = ro ? i.status : (statuses[idx] || 'received')
            return (
              <div key={idx} className="border rounded-lg p-2.5 bg-white">
                <div className="flex justify-between gap-2 mb-1.5">
                  <p className="font-semibold text-sm break-words">{i.name}</p>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{i.quantity} {i.unit || ''}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {CHECK_OPTS.map(o => (
                    <button key={o.v} type="button" disabled={ro}
                      onClick={() => !ro && setStatuses(s => ({ ...s, [idx]: o.v }))}
                      className={`text-[11px] font-semibold rounded-lg border-2 px-1.5 py-1.5 transition ${current === o.v ? o.on : o.off} ${ro ? 'cursor-default' : ''}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <div>
          <Label className="text-xs">📝 Note to supplier (optional)</Label>
          {ro ? (
            <p className="text-sm mt-1 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{readonlyData.note || <span className="text-muted-foreground">No note left</span>}</p>
          ) : (
            <Input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder='e.g. "2 boxes of tomatoes were missing"' className="mt-1" />
          )}
        </div>
        {!ro && (
          <p className="text-[11px] text-muted-foreground">If anything is marked as not received/damaged — or you leave a note — the supplier is notified automatically by email and in-app alert.</p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Back</Button>
          {!ro && (
            <Button onClick={submit} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Close invoice — done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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
  const stage = status === 'fulfilled' ? 3 : status === 'dispatched' ? 2 : status === 'confirmed' ? 1 : 0
  const steps = [
    { label: 'Placed', sub: 'Sent to supplier' },
    { label: 'Confirmed', sub: 'Accepted' },
    { label: 'Dispatched', sub: 'On its way' },
    { label: 'Delivered', sub: 'Fulfilled' },
  ]
  return (
    <div className="flex items-start w-full py-1" aria-label={`Order progress: step ${stage + 1} of 4`}>
      {steps.map((s, i) => {
        const done = i < stage
        const current = i === stage
        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center text-center" style={{ minWidth: 64 }}>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition
                ${done || (current && stage === 3) ? 'bg-emerald-500 border-emerald-500 text-white'
                  : current ? 'bg-indigo-600 border-indigo-600 text-white animate-pulse'
                  : 'bg-white border-slate-300 text-slate-300'}`}>
                {done || (current && stage === 3) ? <Check className="h-4 w-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
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
  const [chip, setChip] = useState('all')             // 'bought' | 'all' | <category>
  const [viewMode, setViewMode] = useState('grid')    // 'grid' | 'list' (persisted per device)
  const [deliveryDate, setDeliveryDate] = useState(editOrder?.requestedDeliveryDate || '')
  const [notes, setNotes] = useState(editOrder?.notes || '')
  const [placing, setPlacing] = useState(false)
  const [placedOrder, setPlacedOrder] = useState(null)

  useEffect(() => { try { const v = localStorage.getItem('sw_order_view'); if (v === 'grid' || v === 'list') setViewMode(v) } catch {} }, [])
  const switchView = (v) => { setViewMode(v); try { localStorage.setItem('sw_order_view', v) } catch {} }

  const sym = supInfo?.currencySymbol || '£'

  useEffect(() => {
    (async () => {
      try {
        const data = await apiJson(`/api/kitchen/suppliers/${supplier.supplierId}/catalog`)
        const prods = Array.isArray(data.products) ? data.products : []
        setCatalog(prods)
        // "Bought Before" is the default chip when this kitchen has history
        setChip(prods.some(p => p.boughtBefore) ? 'bought' : 'all')
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

  // Categories present in this supplier's catalog (for the filter chips)
  const categories = useMemo(() => {
    const set = new Set()
    for (const p of catalog) set.add(p.category || 'Other')
    return [...set].sort()
  }, [catalog])
  const hasBoughtBefore = useMemo(() => catalog.some(p => p.boughtBefore), [catalog])

  // Products visible under the current search + chip
  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return catalog.filter(p => {
      if (f && !(`${p.name} ${p.category || ''}`.toLowerCase().includes(f))) return false
      if (chip === 'bought') return p.boughtBefore
      if (chip !== 'all') return (p.category || 'Other') === chip
      return true
    })
  }, [catalog, filter, chip])

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
              <div key={idx} className="px-3 py-1.5 flex justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 break-words">{i.name}</span>
                <span className="text-muted-foreground whitespace-nowrap shrink-0 ml-2">{i.quantity} {i.unit || ''}</span>
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
      {/* Wizard header — sticky so the cart total pill stays visible while browsing */}
      <div className="sticky top-0 z-30 -mx-1 px-1 py-2 bg-white/95 backdrop-blur rounded-b-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <Button variant="ghost" size="sm" onClick={step === 'review' ? () => setStep('browse') : onBack} className="shrink-0 px-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <p className="font-bold leading-tight truncate">Order from Suppliers</p>
              <p className="text-xs text-muted-foreground truncate">
                {supInfo.businessName}
                {supInfo.deliveryDays ? ` · Delivers: ${supInfo.deliveryDays}` : ''}
                {minOrder > 0 ? ` · Min ${money(minOrder, sym)}` : ''}
              </p>
            </div>
          </div>
          {/* Persistent cart total pill */}
          <button
            type="button"
            onClick={() => { if (cartItems.length > 0 && step === 'browse') setStep('review') }}
            title={cartItems.length > 0 ? 'Review your cart' : 'Cart is empty'}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-bold text-sm shadow-sm border-2 transition
              ${cartItems.length > 0 ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700' : 'bg-white border-slate-200 text-slate-400'}`}
          >
            <ShoppingCart className="h-4 w-4" /> {money(subtotal, sym)}
            {cartItems.length > 0 && <span className="text-[10px] font-semibold bg-white/25 rounded-full px-1.5 py-0.5">{cartItems.length}</span>}
          </button>
        </div>
      </div>

      {/* ---------- STEP: browse ---------- */}
      {step === 'browse' && (
        <>
          {/* Recent price changes at this supplier (Sept 2026) — pulled from the
              same logged price-alert data that feeds the notifications bell. */}
          <RecentPriceChanges supplierName={supInfo?.businessName} />
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
              {/* Search */}
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search products…" value={filter} onChange={e => setFilter(e.target.value)} />
              </div>

              {/* Filter chips + view toggle */}
              <div className="flex items-center gap-2">
                <div className="flex-1 flex gap-1.5 overflow-x-auto pb-1 -mb-1" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                  {hasBoughtBefore && (
                    <button type="button" onClick={() => setChip('bought')}
                      className={`shrink-0 text-xs font-semibold rounded-full border-2 px-3 py-1.5 transition ${chip === 'bought' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                      ⭐ Bought Before
                    </button>
                  )}
                  <button type="button" onClick={() => setChip('all')}
                    className={`shrink-0 text-xs font-semibold rounded-full border-2 px-3 py-1.5 transition ${chip === 'all' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                    All Items
                  </button>
                  {categories.map(c => (
                    <button key={c} type="button" onClick={() => setChip(c)}
                      className={`shrink-0 text-xs font-semibold rounded-full border-2 px-3 py-1.5 transition ${chip === c ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                      {catEmoji(c)} {c}
                    </button>
                  ))}
                </div>
                <div className="shrink-0 flex rounded-lg border-2 border-slate-200 bg-white p-0.5">
                  <button type="button" onClick={() => switchView('grid')} title="Grid view" aria-label="Grid view"
                    className={`h-7 w-8 rounded-md flex items-center justify-center transition ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}>
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => switchView('list')} title="List view" aria-label="List view"
                    className={`h-7 w-8 rounded-md flex items-center justify-center transition ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}>
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Promo banner — set by the supplier in their profile (not hardcoded) */}
              {supInfo.promoText && (
                <div className="rounded-xl bg-gradient-to-r from-emerald-800 via-green-800 to-emerald-900 text-white px-4 py-3 flex items-center gap-3 shadow-sm">
                  <span className="text-2xl shrink-0">🎉</span>
                  <p className="text-sm font-semibold leading-snug">{supInfo.promoText}</p>
                </div>
              )}

              {/* Catalog */}
              {visible.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10">
                  {chip === 'bought' ? "No previously ordered items match — try \u201CAll Items\u201D." : 'No products match your search.'}
                </p>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pb-24">
                  {visible.map(p => {
                    const qty = cart[p.id] || 0
                    const out = p.available === false
                    return (
                      <div key={p.id} className={`relative bg-white border-2 rounded-xl p-3 pt-8 flex flex-col transition ${qty > 0 ? 'border-indigo-400 shadow-sm' : 'border-slate-100 hover:border-indigo-200'} ${out ? 'opacity-70' : ''}`}>
                        {p.boughtBefore && (
                          <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-300 rounded-full px-1.5 py-0.5">Bought before</span>
                        )}
                        <span className={`absolute top-2 right-2 text-[9px] font-bold rounded-full px-1.5 py-0.5 border ${out ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                          {out ? 'Out of stock' : 'In stock'}
                        </span>
                        <div className="text-4xl text-center py-2 select-none">{catEmoji(p.category)}</div>
                        <p className="text-[10px] text-muted-foreground text-center mb-1">
                          {p.rating ? <>★ {Number(p.rating).toFixed(1)} · </> : null}
                          {p.orderCount > 0 ? `${p.orderCount} order${p.orderCount === 1 ? '' : 's'}` : '✨ New'}
                        </p>
                        <p className="font-semibold text-sm leading-snug break-words">{p.name}</p>
                        {p.packSize ? <p className="text-[10px] text-muted-foreground">{p.packSize}</p> : null}
                        {p.boughtBefore ? (
                          <p className="text-[10px] text-emerald-700 font-medium mt-0.5">🚚 {daysAgoLabel(p.lastOrderedAt)}</p>
                        ) : supInfo.deliveryDays ? (
                          <p className="text-[10px] text-muted-foreground mt-0.5">🚚 Delivers: {supInfo.deliveryDays}</p>
                        ) : null}
                        <div className="mt-auto pt-2 flex items-center justify-between gap-1">
                          <span className="font-bold text-sm text-slate-900">{money(p.price, sym)}<span className="text-[10px] font-normal text-muted-foreground">{p.unit ? `/${p.unit}` : ''}</span></span>
                          {qty === 0 ? (
                            <button type="button" onClick={() => setQty(p.id, 1)} disabled={out} aria-label={`Add ${p.name} to cart`}
                              className="h-8 w-8 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-30 flex items-center justify-center shadow-sm shrink-0">
                              <Plus className="h-4 w-4" />
                            </button>
                          ) : (
                            <div className="flex items-center gap-1 shrink-0">
                              <button type="button" onClick={() => setQty(p.id, qty - 1)} className="h-7 w-7 rounded-full border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                              <span className="w-6 text-center text-sm font-bold text-indigo-700">{qty}</span>
                              <button type="button" onClick={() => setQty(p.id, qty + 1)} className="h-7 w-7 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 flex items-center justify-center"><Plus className="h-3 w-3" /></button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="border rounded-xl divide-y overflow-hidden pb-0 mb-24 bg-white">
                  {visible.map(p => {
                    const qty = cart[p.id] || 0
                    const out = p.available === false
                    return (
                      <div key={p.id} className={`flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50/30 transition ${out ? 'opacity-70' : ''}`}>
                        <span className="text-2xl select-none shrink-0">{catEmoji(p.category)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-semibold text-sm break-words">{p.name}</p>
                            {p.boughtBefore && <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-300 rounded-full px-1.5 py-0.5">Bought before</span>}
                            {out && <span className="text-[9px] font-bold bg-red-50 text-red-600 border border-red-200 rounded-full px-1.5 py-0.5">Out of stock</span>}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {money(p.price, sym)}{p.unit ? `/${p.unit}` : ''}{p.packSize ? ` · ${p.packSize}` : ''}
                            {p.rating ? ` · ★ ${Number(p.rating).toFixed(1)}` : ''}
                            {p.orderCount > 0 ? ` · ${p.orderCount} order${p.orderCount === 1 ? '' : 's'}` : ' · ✨ New'}
                            {p.boughtBefore && p.lastOrderedAt ? ` · ${daysAgoLabel(p.lastOrderedAt)}` : ''}
                          </p>
                        </div>
                        {qty > 0 && (
                          <span className="text-sm font-bold text-indigo-700 whitespace-nowrap">{money(qty * p.price, sym)}</span>
                        )}
                        {out && qty === 0 ? (
                          <Button size="sm" variant="outline" disabled className="h-8 opacity-40">Unavailable</Button>
                        ) : (
                          <Stepper p={p} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

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
                        <p className="font-semibold text-sm break-words">{i.name}</p>
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
  // One-tap "Received → Inventory" for delivered orders (Aug 2026)
  const [receiveBusy, setReceiveBusy] = useState(null)
  // Delivery check (Aug 2026): new check + view saved check
  const [checkTarget, setCheckTarget] = useState(null)
  const [checkViewData, setCheckViewData] = useState(null)
  const openSavedCheck = async (o) => {
    try {
      const d = await apiJson(`/api/kitchen/orders/${o.id}/delivery-check`)
      setCheckViewData({ order: o, data: d })
    } catch (e) { toast.error(e.message || 'Could not load the delivery check') }
  }
  const receiveOrder = async (o) => {
    setReceiveBusy(o.id)
    try {
      const res = await apiJson(`/api/kitchen/orders/${o.id}/receive`, { method: 'POST', body: JSON.stringify({}) })
      toast.success(`${res.inserted} item${res.inserted === 1 ? '' : 's'} from ${o.orderRef} added to your inventory 📦`)
      load()
    } catch (e) { toast.error(e.message || 'Could not add the items') } finally { setReceiveBusy(null) }
  }
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
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ShoppingCart className="h-6 w-6 text-indigo-600" /> Order from Suppliers</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Browse catalogs, build a cart and track deliveries — all in one place</p>
      </div>

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
                        {s.clientCode && <span className="font-mono">Account number: {s.clientCode}</span>}
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

      {/* Active orders — live tracking */}
      {(() => {
        const activeOrders = orders.filter(o => ['pending', 'confirmed', 'dispatched'].includes(o.status))
        if (activeOrders.length === 0) return null
        return (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg"><Truck className="h-5 w-5 text-indigo-600" /> Active orders</CardTitle>
              <CardDescription>Track your open orders — status is updated live by your suppliers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeOrders.map(o => {
                const st = STATUS_STYLE[o.status] || STATUS_STYLE.pending
                return (
                  <div key={o.id} className="border-2 border-indigo-100 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{o.supplierName}</p>
                        <p className="text-xs text-muted-foreground">
                          {o.orderRef} · {o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-GB') : ''}
                          {o.requestedDeliveryDate ? ` · Delivery: ${new Date(o.requestedDeliveryDate + 'T00:00:00').toLocaleDateString('en-GB')}` : ''}
                        </p>
                      </div>
                      <span className="font-bold text-sm text-indigo-700 whitespace-nowrap">{money(o.total)}</span>
                      <Badge variant="outline" className={`${st.cls} text-[10px] shrink-0`}>{st.label}</Badge>
                    </div>
                    <div className="bg-white border rounded-lg px-4 py-2.5">
                      <OrderStatusTracker status={o.status} />
                    </div>
                    <div className="border rounded-lg divide-y bg-white">
                      {(o.items || []).map((i, idx) => (
                        <div key={idx} className="px-3 py-1.5 flex justify-between gap-2 text-sm">
                          <span className="min-w-0 flex-1 break-words">{i.name}</span>
                          <span className="text-muted-foreground text-right shrink-0">{i.quantity} {i.unit || ''} × {money(i.price)}</span>
                        </div>
                      ))}
                    </div>
                    {o.notes && <p className="text-xs text-muted-foreground italic">📝 {o.notes}</p>}
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
                            {cancelBusy === o.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Ban className="h-3.5 w-3.5 mr-1.5" />} Cancel
                          </Button>
                        </>
                      )}
                      {o.status === 'dispatched' && !o.deliveryChecked && (
                        <Button size="sm" onClick={() => setCheckTarget(o)} className="bg-amber-500 hover:bg-amber-600 text-white">
                          <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" /> Check delivery
                        </Button>
                      )}
                      {o.deliveryChecked && (
                        <Button size="sm" variant="outline" onClick={() => openSavedCheck(o)} className="border-emerald-300 text-emerald-700">
                          <Check className="h-3.5 w-3.5 mr-1.5" /> Delivery checked
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => {
                        const sup = suppliers.find(s => s.supplierId === o.supplierId)
                        printOrderSummary(o, { currencySymbol: sup?.currencySymbol || '£' }, o.supplierName, sup?.email || '', sup?.clientCode || '')
                      }}>
                        <FileText className="h-3.5 w-3.5 mr-1.5" /> Summary
                      </Button>
                      <Button size="sm" onClick={() => reorder(o)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reorder
                      </Button>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })()}

      {/* Order history */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5 text-indigo-600" /> Order history</CardTitle>
          <CardDescription>Completed and cancelled orders</CardDescription>
        </CardHeader>
        <CardContent>
          {orders.filter(o => !['pending', 'confirmed', 'dispatched'].includes(o.status)).length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="font-medium text-sm">{orders.length === 0 ? 'No orders yet' : 'No completed orders yet'}</p>
              <p className="text-xs">{orders.length === 0 ? 'Connect a supplier above and place your first order.' : 'Delivered and cancelled orders will appear here.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.filter(o => !['pending', 'confirmed', 'dispatched'].includes(o.status)).map(o => {
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
                            <div key={idx} className="px-3 py-1.5 flex justify-between gap-2 text-sm">
                              <span className="min-w-0 flex-1 break-words">{i.name}{i.sku ? <span className="text-[10px] text-muted-foreground font-mono ml-1.5">{i.sku}</span> : null}</span>
                              <span className="text-muted-foreground text-right shrink-0">{i.quantity} {i.unit || ''} × {money(i.price)}</span>
                            </div>
                          ))}
                        </div>
                        {o.notes && <p className="text-xs text-muted-foreground italic">📝 {o.notes}</p>}
                        {o.deliveryNote && (
                          <p className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg px-2.5 py-1.5">🚚 Delivery note: <b>{o.deliveryNote}</b></p>
                        )}
                        {o.rejectReason && (
                          <p className="text-xs bg-red-50 border border-red-200 text-red-800 rounded-lg px-2.5 py-1.5">❌ Declined by supplier: <b>{o.rejectReason}</b></p>
                        )}
                        {o.creditStatus && (
                          <p className={`text-xs rounded-lg px-2.5 py-1.5 border ${o.creditStatus === 'approved' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : o.creditStatus === 'declined' ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-indigo-50 border-indigo-200 text-indigo-900'}`}>
                            💳 Credit request £{(o.creditTotal || 0).toFixed(2)} — {o.creditStatus === 'requested' ? 'awaiting supplier approval' : o.creditStatus === 'approved' ? 'approved by supplier ✓' : 'declined by supplier'}
                          </p>
                        )}
                        {o.invoiceUrl && (
                          <a href={o.invoiceUrl} target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 hover:bg-indigo-100 transition">
                            📎 Supplier Invoice <span className="text-[10px] font-normal text-indigo-400">(their own invoice file)</span>
                            <span className="ml-auto text-xs font-normal text-indigo-500">View / download →</span>
                          </a>
                        )}
                        {o.status === 'confirmed' && (
                          <p className="text-xs flex items-center gap-1.5 text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1.5">
                            <Info className="h-3.5 w-3.5 shrink-0" /> This order is confirmed — contact your supplier directly to change or add items to a confirmed order.
                          </p>
                        )}
                        <div className="flex justify-end flex-wrap gap-2">
                          {o.status === 'fulfilled' && !o.deliveryChecked && (
                            <Button size="sm" disabled={false} onClick={() => setCheckTarget(o)} className="bg-amber-500 hover:bg-amber-600 text-white">
                              <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" /> Check delivery
                            </Button>
                          )}
                          {o.deliveryChecked && (
                            <Button size="sm" variant="outline" onClick={() => openSavedCheck(o)} className="border-emerald-300 text-emerald-700">
                              <Check className="h-3.5 w-3.5 mr-1.5" /> Delivery checked
                            </Button>
                          )}
                          {o.status === 'fulfilled' && (
                            o.receivedToInventory ? (
                              <Button size="sm" variant="outline" disabled className="border-emerald-300 text-emerald-700 opacity-80">
                                <Check className="h-3.5 w-3.5 mr-1.5" /> Added to inventory
                              </Button>
                            ) : (
                              <Button size="sm" disabled={receiveBusy === o.id} onClick={() => receiveOrder(o)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                {receiveBusy === o.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5 mr-1.5" />} Add to inventory
                              </Button>
                            )
                          )}
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

      {/* Delivery check dialogs (new + readonly view) */}
      <DeliveryCheckDialog order={checkTarget} onClose={() => setCheckTarget(null)} onDone={() => { setCheckTarget(null); load() }} />
      <DeliveryCheckDialog order={checkViewData?.order || null} readonlyData={checkViewData?.data || null} onClose={() => setCheckViewData(null)} onDone={() => setCheckViewData(null)} />
    </div>
  )
}
