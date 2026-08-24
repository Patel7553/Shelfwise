'use client'

/* B2B CHECKOUT FLOW (Bidfood-style, Aug 2026)
   Basket → Order Details → Delivery Details → Review & Submit → Confirmation.
   NO payment step of any kind — suppliers invoice via existing account terms.
   Orders split automatically per supplier at submit (POST /api/kitchen/orders,
   prices always recomputed server-side from the live supplier catalog). */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { ArrowLeft, ShoppingCart, Loader2, Minus, Plus, Trash2, Truck, Search, CheckCircle2, AlertTriangle, PackageX, Home, Mail, Printer, FileText, MapPin, CalendarDays } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'
import { getCart, updateCartQty, removeFromCart, clearSupplierFromCart, addToCart } from '@/lib/cart'

const fetch = apiFetch
const ADDR_KEY = 'sw_delivery_address_v1'

const todayStr = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const tomorrowISO = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA') }
const defaultRef = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `PO-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function StepDots({ n }) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3].map(i => (
        <span key={i} className={`h-1.5 rounded-full transition-all ${i === n ? 'w-6 bg-indigo-600' : i < n ? 'w-3 bg-indigo-300' : 'w-3 bg-slate-200'}`} />
      ))}
      <span className="text-[11px] text-muted-foreground ml-1.5">Step {n} of 3</span>
    </div>
  )
}

export function CartView({ onBack, goStockLevels, goHome, kitchenName = '', accountEmail = '' }) {
  const [step, setStep] = useState('basket')   // basket | header | delivery | review | done
  const [items, setItems] = useState([])
  const [catalogs, setCatalogs] = useState({})   // supplierId -> { products, sym, minOrderValue, vatRate, name }
  const [search, setSearch] = useState('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [allCatalogsLoaded, setAllCatalogsLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState(null)
  const suppliersRef = useRef([])

  // order header fields
  const personName = (typeof window !== 'undefined' && localStorage.getItem('sw_person_name')) || 'Owner'
  const [orderRef, setOrderRef] = useState(defaultRef())
  const [promo, setPromo] = useState('')
  // delivery fields
  const [address, setAddress] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(tomorrowISO())

  useEffect(() => { try { setAddress(localStorage.getItem(ADDR_KEY) || '') } catch {} }, [])

  useEffect(() => {
    const sync = () => setItems(getCart())
    sync()
    window.addEventListener('sw-cart-changed', sync)
    return () => window.removeEventListener('sw-cart-changed', sync)
  }, [])

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

  const loadCatalog = async (sid, name = '') => {
    try {
      const res = await fetch(`/api/kitchen/suppliers/${sid}/catalog`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setCatalogs(prev => ({
          ...prev,
          [sid]: {
            products: Array.isArray(data.products) ? data.products : [],
            sym: data.supplier?.currencySymbol || '£',
            minOrderValue: Number(data.supplier?.minOrderValue) || 0,
            vatRate: Number(data.supplier?.defaultVatRate) || 0,
            name: data.supplier?.businessName || name,
          },
        }))
      }
    } catch {}
  }

  const neededSuppliers = useMemo(() => [...new Set(items.map(i => i.supplierId))], [items])
  useEffect(() => {
    for (const sid of neededSuppliers) if (!catalogs[sid]) loadCatalog(sid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neededSuppliers.join(',')])

  // ---- search & add more items (across ALL connected suppliers) ----
  const ensureAllCatalogs = async () => {
    if (allCatalogsLoaded) return
    setSearchBusy(true)
    try {
      for (const s of suppliersRef.current) if (!catalogs[s.supplierId]) await loadCatalog(s.supplierId, s.businessName)
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

  // ---- grouped basket with LIVE prices ----
  const groups = useMemo(() => {
    const by = new Map()
    for (const it of items) {
      if (!by.has(it.supplierId)) by.set(it.supplierId, { supplierId: it.supplierId, supplierName: it.supplierName, lines: [] })
      by.get(it.supplierId).lines.push(it)
    }
    return [...by.values()].map(g => {
      const cat = catalogs[g.supplierId]
      const conn = suppliersRef.current.find(s => s.supplierId === g.supplierId)
      const lines = g.lines.map(l => {
        const live = cat?.products.find(p => p.id === l.productId)
        return { ...l, live, price: live ? Number(live.price) || 0 : null, displayName: live?.name || l.name, packSize: live?.packSize || '', unit: live?.unit || l.unit, unavailable: live ? live.available === false : false, missing: cat ? !live : false }
      })
      const subtotal = lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0)
      const vatRate = cat?.vatRate || 0
      const vat = subtotal * vatRate / 100
      const minOrderValue = cat?.minOrderValue || 0
      return { ...g, supplierName: cat?.name || g.supplierName, clientCode: conn?.clientCode || '', sym: cat?.sym || '£', lines, subtotal, vatRate, vat, total: subtotal + vat, minOrderValue, loaded: !!cat, belowMin: minOrderValue > 0 && subtotal < minOrderValue }
    }).sort((a, b) => a.supplierName.localeCompare(b.supplierName))
  }, [items, catalogs])

  const eligibleGroups = groups.filter(g => g.loaded && !g.belowMin && g.lines.some(l => l.live && !l.unavailable && l.qty > 0))
  const grand = useMemo(() => {
    const gs = step === 'basket' ? groups : eligibleGroups
    return {
      lineCount: gs.reduce((s, g) => s + g.lines.length, 0),
      qtyTotal: gs.reduce((s, g) => s + g.lines.reduce((x, l) => x + (Number(l.qty) || 0), 0), 0),
      subtotal: gs.reduce((s, g) => s + g.subtotal, 0),
      vat: gs.reduce((s, g) => s + g.vat, 0),
      total: gs.reduce((s, g) => s + g.total, 0),
    }
  }, [groups, eligibleGroups, step])

  // ---- SUBMIT (no payment — account/finance terms already in place) ----
  const submit = async () => {
    setSubmitting(true)
    const sent = []
    const failed = []
    try {
      const noteBits = [`Order ref: ${orderRef.trim()}`]
      if (promo.trim()) noteBits.push(`Code: ${promo.trim()}`)
      if (address.trim()) noteBits.push(`Deliver to: ${address.trim().replace(/\s*\n\s*/g, ', ')}`)
      for (const g of eligibleGroups) {
        try {
          const res = await fetch('/api/kitchen/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              supplierId: g.supplierId,
              items: g.lines.filter(l => l.live && !l.unavailable && l.qty > 0).map(l => ({ productId: l.productId, quantity: l.qty })),
              notes: noteBits.join(' · ').slice(0, 990),
              requestedDeliveryDate: deliveryDate || undefined,
            }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.error || 'Order failed')
          clearSupplierFromCart(g.supplierId)
          sent.push({ ...g, apiRef: data.ref || ('ORD-' + String(data.id || '').replace(/-/g, '').slice(0, 6).toUpperCase()), apiTotal: data.total })
        } catch (e) {
          failed.push({ name: g.supplierName, error: e.message || 'Order failed' })
        }
      }
      if (sent.length) {
        setConfirmation({ sent, failed, orderRef: orderRef.trim(), promo: promo.trim(), address: address.trim(), deliveryDate, placedAt: new Date() })
        setStep('done')
      } else if (failed.length) {
        toast.error(failed.map(f => `${f.name}: ${f.error}`).join(' · ').slice(0, 300))
      }
    } finally { setSubmitting(false) }
  }

  const emailBody = () => {
    if (!confirmation) return ''
    const L = []
    L.push(`Order confirmation — ${kitchenName}`)
    L.push(`Placed by: ${personName} (${accountEmail})`)
    L.push(`Order date: ${confirmation.placedAt.toLocaleString('en-GB')}`)
    L.push(`Order reference: ${confirmation.orderRef}`)
    if (confirmation.promo) L.push(`Code: ${confirmation.promo}`)
    L.push(`Delivery date: ${confirmation.deliveryDate}`)
    L.push(`Delivery address: ${confirmation.address}`)
    for (const g of confirmation.sent) {
      L.push('')
      L.push(`Supplier: ${g.supplierName}${g.clientCode ? ` (account ${g.clientCode})` : ''} — ${g.apiRef}`)
      for (const l of g.lines) L.push(`  ${l.displayName} | ${l.packSize || l.unit || '-'} | x${l.qty} | ${g.sym}${(l.price || 0).toFixed(2)} | ${g.sym}${((l.price || 0) * l.qty).toFixed(2)}`)
      L.push(`  Subtotal ${g.sym}${g.subtotal.toFixed(2)} · VAT (${g.vatRate}%) ${g.sym}${g.vat.toFixed(2)} · Total ${g.sym}${g.total.toFixed(2)}`)
    }
    return L.join('\n')
  }

  // ================= RENDER HELPERS =================

  const itemizedTable = (g, editable = false) => (
    <div key={g.supplierId} className="border-2 border-slate-100 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
        <Truck className="h-4 w-4 text-indigo-600" />
        <span className="font-semibold text-sm truncate">{g.supplierName}</span>
        {g.clientCode && <span className="text-[10px] font-mono text-muted-foreground">acct {g.clientCode}</span>}
        {!g.loaded && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-slate-100">
              <th className="text-left px-3 py-1.5 font-semibold">Description</th>
              <th className="text-left px-2 py-1.5 font-semibold">Size/Unit</th>
              <th className="text-center px-2 py-1.5 font-semibold">Qty</th>
              <th className="text-right px-2 py-1.5 font-semibold">Price</th>
              <th className="text-right px-3 py-1.5 font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {g.lines.map(l => (
              <tr key={l.productId}>
                <td className="px-3 py-2 font-medium">{l.displayName}
                  {l.unavailable && <span className="block text-[10px] text-red-600 font-normal">out of stock at supplier</span>}
                  {l.price !== null && !(l.price > 0) && <span className="block text-[10px] text-amber-600 font-normal">no price set</span>}
                </td>
                <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{l.packSize || l.unit || '—'}</td>
                <td className="px-2 py-2 text-center">{editable ? (
                  <span className="inline-flex items-center gap-1">
                    <button onClick={() => updateCartQty(g.supplierId, l.productId, l.qty - 1)} className="h-6 w-6 rounded-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50 inline-flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                    <span className="w-6 text-center font-bold text-indigo-700">{l.qty}</span>
                    <button onClick={() => updateCartQty(g.supplierId, l.productId, l.qty + 1)} className="h-6 w-6 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center justify-center"><Plus className="h-3 w-3" /></button>
                  </span>
                ) : <span className="font-semibold">{l.qty}</span>}</td>
                <td className="px-2 py-2 text-right whitespace-nowrap">{l.price !== null ? `${g.sym}${l.price.toFixed(2)}` : '…'}</td>
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{l.price !== null ? `${g.sym}${(l.price * l.qty).toFixed(2)}` : '…'}
                  {editable && <button onClick={() => removeFromCart(g.supplierId, l.productId)} className="ml-2 text-slate-400 hover:text-red-600 align-middle" title="Remove"><Trash2 className="h-3.5 w-3.5 inline" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-100 text-sm">
            <tr><td colSpan={4} className="px-3 py-1 text-right text-muted-foreground">Subtotal</td><td className="px-3 py-1 text-right font-semibold">{g.sym}{g.subtotal.toFixed(2)}</td></tr>
            <tr><td colSpan={4} className="px-3 py-1 text-right text-muted-foreground">VAT ({g.vatRate}%)</td><td className="px-3 py-1 text-right font-semibold">{g.sym}{g.vat.toFixed(2)}</td></tr>
            <tr><td colSpan={4} className="px-3 py-1.5 text-right font-bold">Total</td><td className="px-3 py-1.5 text-right font-bold">{g.sym}{g.total.toFixed(2)}</td></tr>
          </tfoot>
        </table>
      </div>
      {g.belowMin && (
        <p className="px-3 py-2 text-[11px] text-red-600 bg-red-50 border-t border-red-100 flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" /> Below minimum order ({g.sym}{g.minOrderValue.toFixed(2)}) — add more or this supplier will be skipped
        </p>
      )}
    </div>
  )

  const headerBar = (title, subtitle, backTo) => (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="icon" onClick={backTo} aria-label="Back">
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div className="flex-1 min-w-0">
        <h2 className="text-xl font-bold flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-emerald-600" /> {title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  )

  // ================= STEP: CONFIRMATION =================
  if (step === 'done' && confirmation) {
    return (
      <div className="space-y-4 pb-10 print:pb-0">
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
          <h2 className="text-xl font-bold text-emerald-900 mt-1">Order submitted 🎉</h2>
          <p className="text-xs text-emerald-700">No payment taken — invoiced via your existing account terms</p>
        </div>

        <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Placed by</p><p className="font-semibold">{personName} — {kitchenName}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Email</p><p className="font-semibold">{accountEmail || '—'}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Order date</p><p className="font-semibold">{confirmation.placedAt.toLocaleString('en-GB')}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Order reference</p><p className="font-semibold font-mono">{confirmation.orderRef}{confirmation.promo ? ` · ${confirmation.promo}` : ''}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Delivery date</p><p className="font-semibold">{confirmation.deliveryDate}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Delivery address</p><p className="font-semibold whitespace-pre-line">{confirmation.address || '—'}</p></div>
        </div>

        {confirmation.sent.map(g => (
          <div key={g.supplierId}>
            <p className="text-xs font-semibold text-muted-foreground mb-1">{g.supplierName}{g.clientCode ? ` · account ${g.clientCode}` : ''} · <span className="font-mono">{g.apiRef}</span></p>
            {itemizedTable(g)}
          </div>
        ))}

        {confirmation.failed.length > 0 && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-sm text-red-700">
            <p className="font-semibold flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Not sent (still in your cart):</p>
            {confirmation.failed.map(f => <p key={f.name}>{f.name} — {f.error}</p>)}
          </div>
        )}

        <div className="flex gap-2 print:hidden">
          <Button variant="outline" className="flex-1" onClick={goHome || onBack}><Home className="h-4 w-4 mr-1.5" /> Home</Button>
          <Button variant="outline" className="flex-1" onClick={() => { window.location.href = `mailto:${accountEmail}?subject=${encodeURIComponent('Order confirmation ' + confirmation.orderRef)}&body=${encodeURIComponent(emailBody())}` }}><Mail className="h-4 w-4 mr-1.5" /> Email</Button>
          <Button variant="outline" className="flex-1" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" /> Print</Button>
        </div>
      </div>
    )
  }

  // ================= STEP: ORDER HEADER =================
  if (step === 'header') {
    return (
      <div className="space-y-4 pb-10">
        {headerBar('Order Details', 'Who is placing this order', () => setStep('basket'))}
        <StepDots n={1} />
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label className="text-xs">Account</Label><Input value={`${kitchenName || 'Kitchen'} — ${personName}`} readOnly className="mt-1 bg-slate-50" /></div>
            <div><Label className="text-xs">Email</Label><Input value={accountEmail || '—'} readOnly className="mt-1 bg-slate-50" /></div>
          </div>
          <div><Label className="text-xs">Order date</Label><Input value={todayStr()} readOnly className="mt-1 bg-slate-50" /></div>
          <div>
            <Label className="text-xs">Order reference <span className="text-red-500">*</span></Label>
            <Input value={orderRef} onChange={e => setOrderRef(e.target.value)} placeholder="e.g. PO-1042 or FRIDAY DELIVERY" className="mt-1 font-mono" maxLength={60} />
            <p className="text-[10px] text-muted-foreground mt-0.5">Appears on the supplier's order and invoice — required</p>
          </div>
          <div>
            <Label className="text-xs">Promo / reference code (optional)</Label>
            <Input value={promo} onChange={e => setPromo(e.target.value)} placeholder="e.g. SUMMER10" className="mt-1" maxLength={40} />
          </div>
        </div>
        <Button className="w-full bg-indigo-600 hover:bg-indigo-700 font-semibold" disabled={!orderRef.trim()} onClick={() => setStep('delivery')}>Continue</Button>
      </div>
    )
  }

  // ================= STEP: DELIVERY =================
  if (step === 'delivery') {
    return (
      <div className="space-y-4 pb-10">
        {headerBar('Delivery Details', `Order ref ${orderRef}`, () => setStep('header'))}
        <StepDots n={2} />
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 space-y-3">
          <div>
            <Label className="text-xs flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Delivery address <span className="text-red-500">*</span></Label>
            <Textarea value={address} onChange={e => { setAddress(e.target.value); try { localStorage.setItem(ADDR_KEY, e.target.value) } catch {} }} placeholder={'Kitchen name\nStreet\nCity, Postcode'} className="mt-1 min-h-20" maxLength={400} />
            <p className="text-[10px] text-muted-foreground mt-0.5">Saved for next time</p>
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Delivery date</Label>
            <Input type="date" value={deliveryDate} min={new Date().toLocaleDateString('en-CA')} onChange={e => setDeliveryDate(e.target.value)} className="mt-1" />
          </div>
        </div>
        <p className="text-xs font-semibold text-muted-foreground">Your order</p>
        {eligibleGroups.map(g => itemizedTable(g))}
        <Button className="w-full bg-indigo-600 hover:bg-indigo-700 font-semibold" disabled={!address.trim()} onClick={() => setStep('review')}>Continue</Button>
      </div>
    )
  }

  // ================= STEP: REVIEW & SUBMIT =================
  if (step === 'review') {
    return (
      <div className="space-y-4 pb-10">
        {headerBar('Review & Submit', 'Check everything, then submit — no payment is taken', () => setStep('delivery'))}
        <StepDots n={3} />
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Order reference</p><p className="font-semibold font-mono">{orderRef}{promo ? ` · ${promo}` : ''}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Delivery date</p><p className="font-semibold">{deliveryDate}</p></div>
          <div className="col-span-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Delivery address</p><p className="font-semibold whitespace-pre-line">{address}</p></div>
        </div>
        {eligibleGroups.map(g => itemizedTable(g))}
        <div className="bg-slate-900 text-white rounded-2xl p-4 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-slate-300">Line items</span><span className="font-semibold">{grand.lineCount}</span></div>
          <div className="flex justify-between"><span className="text-slate-300">Quantity total</span><span className="font-semibold">{grand.qtyTotal}</span></div>
          <div className="flex justify-between"><span className="text-slate-300">Subtotal</span><span className="font-semibold">£{grand.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-300">VAT</span><span className="font-semibold">£{grand.vat.toFixed(2)}</span></div>
          <div className="flex justify-between border-t border-slate-700 pt-1 mt-1"><span className="font-bold">Grand total</span><span className="font-bold text-emerald-400">£{grand.total.toFixed(2)}</span></div>
        </div>
        <p className="text-[11px] text-muted-foreground text-center">No payment step — orders are invoiced through your existing supplier account terms.</p>
        <Button className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 font-bold text-base" disabled={submitting || eligibleGroups.length === 0} onClick={submit}>
          {submitting ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <FileText className="h-5 w-5 mr-2" />}
          Submit {eligibleGroups.length > 1 ? `${eligibleGroups.length} orders` : 'order'}
        </Button>
      </div>
    )
  }

  // ================= STEP: BASKET =================
  return (
    <div className="space-y-4 pb-28">
      {headerBar('Basket', 'Review and edit, then checkout — orders split by supplier automatically', onBack)}

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
              <Button size="sm" className="h-7 bg-indigo-600 hover:bg-indigo-700" onClick={() => { addToCart({ supplierId: r.supplierId, supplierName: r.supplierName, productId: r.p.id, name: r.p.name, unit: r.p.unit || '', qty: 1, price: Number(r.p.price) || 0 }); toast.success(`${r.p.name} added`) }}>
                <Plus className="h-3.5 w-3.5 mr-0.5" /> Add
              </Button>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <PackageX className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>Your basket is empty</p>
          <Button variant="outline" className="mt-3" onClick={goStockLevels || onBack}>Browse Stock Levels</Button>
        </div>
      ) : (
        groups.map(g => itemizedTable(g, true))
      )}

      {items.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-xl">
          <div className="bg-slate-900 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">
            <ShoppingCart className="h-5 w-5 text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{grand.lineCount} item{grand.lineCount === 1 ? '' : 's'} · Subtotal £{grand.subtotal.toFixed(2)}</p>
              {eligibleGroups.length < groups.length && <p className="text-[11px] text-amber-300">{groups.length - eligibleGroups.length} supplier{groups.length - eligibleGroups.length === 1 ? '' : 's'} below minimum — add more or they'll be skipped</p>}
            </div>
            <Button
              onClick={() => { setOrderRef(defaultRef()); setStep('header') }}
              disabled={eligibleGroups.length === 0}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
            >
              Checkout
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
