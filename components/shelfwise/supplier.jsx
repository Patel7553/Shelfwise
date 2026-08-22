'use client'

/* ============================================================================
   ShelfWise — SUPPLIER DASHBOARD (Aug 2026, migration-20)
   Lightweight portal for supplier accounts: incoming orders queue, product
   catalog, invoices (record view + printable), business profile.
   Suppliers log in with email/password only — no staff PINs, no kitchen tools.
   ============================================================================ */

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast, Toaster } from 'sonner'
import {
  Truck, Package, FileText, Settings, Plus, Pencil, Trash2, Loader2, Check, X,
  LogOut, Printer, RefreshCw, ClipboardCheck, PoundSterling, Inbox, Ban, Eye,
  Users, Copy, CalendarDays, Download, KeyRound,
} from 'lucide-react'
import { apiFetch, apiJson, signOutAll } from '@/lib/apiClient'
import { withBackToolbar, catEmoji } from '@/components/shelfwise/shared'

const STATUS_STYLE = {
  pending:    { label: 'Pending',    cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  confirmed:  { label: 'Confirmed',  cls: 'bg-sky-100 text-sky-800 border-sky-300' },
  dispatched: { label: 'Dispatched', cls: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  fulfilled:  { label: 'Fulfilled',  cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  cancelled:  { label: 'Cancelled',  cls: 'bg-slate-100 text-slate-500 border-slate-300' },
}

const money = (n, sym = '£') => `${sym}${(Number(n) || 0).toFixed(2)}`

// ---------------------------------------------------------------------------
// Printable ORDER SUMMARY — a reference/record document, deliberately NOT an
// invoice. Suppliers issue official invoices from their own accounting system.
// ---------------------------------------------------------------------------
export function printOrderSummary(order, profile, businessName, ownerEmail, clientCode = '') {
  const sym = profile?.currencySymbol || '£'
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const rows = (order.items || []).map((i, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${esc(i.sku || '—')}</td>
      <td>${esc(i.name)}</td>
      <td style="text-align:right">${Number(i.quantity) || 0} ${esc(i.unit || '')}</td>
      <td style="text-align:right">${sym}${(Number(i.price) || 0).toFixed(2)}</td>
      <td style="text-align:right">${sym}${((Number(i.quantity) || 0) * (Number(i.price) || 0)).toFixed(2)}</td>
    </tr>`).join('')
  const html = `<!doctype html><html><head><title>${esc(order.orderRef || 'Order Summary')}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;margin:40px;font-size:14px}
    @media (max-width:640px){ body{margin:14px} }
    h1{font-size:24px;margin:0;color:#312e81} .muted{color:#6b7280;font-size:12px}
    .table-wrap{overflow-x:auto;margin-top:24px}
    table{width:100%;border-collapse:collapse}
    th{background:#eef2ff;color:#312e81;text-align:left;padding:8px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
    th:nth-child(n+4){text-align:right}
    /* Names must wrap by WORD, never letter-by-letter (Aug 2026 bug fix) */
    td{padding:8px;border-bottom:1px solid #e5e7eb;word-break:normal;overflow-wrap:normal}
    td:nth-child(3){min-width:140px;overflow-wrap:break-word}
    td:nth-child(n+4){text-align:right;white-space:nowrap}
    .totals{margin-top:16px;margin-left:auto;width:280px}
    .totals div{display:flex;justify-content:space-between;padding:4px 8px}
    .totals .grand{font-weight:700;font-size:18px;border-top:2px solid #312e81;margin-top:4px;padding-top:8px}
    .head{display:flex;justify-content:space-between;align-items:flex-start}
    .disclaimer{margin-top:32px;font-size:11px;color:#6b7280;border:1px dashed #cbd5e1;border-radius:8px;padding:10px 12px;background:#f8fafc}
    .footer{margin-top:16px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px}
    @media print { body{margin:16px} }
  </style></head><body>
  <div class="head">
    <div>
      <h1>${esc(profile?.businessName || businessName || 'Supplier')}</h1>
      ${profile?.address ? `<div class="muted" style="white-space:pre-line">${esc(profile.address)}</div>` : ''}
      ${profile?.phone ? `<div class="muted">Tel: ${esc(profile.phone)}</div>` : ''}
      ${ownerEmail ? `<div class="muted">${esc(ownerEmail)}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div style="font-size:20px;font-weight:800;color:#312e81">ORDER SUMMARY</div>
      <div><b>${esc(order.orderRef || '')}</b></div>
      <div class="muted">Fulfilled: ${order.fulfilledAt ? new Date(order.fulfilledAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')}</div>
      <div class="muted">Order date: ${order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-GB') : ''}</div>
      ${order.requestedDeliveryDate ? `<div class="muted">Requested delivery: ${new Date(order.requestedDeliveryDate + 'T00:00:00').toLocaleDateString('en-GB')}</div>` : ''}
    </div>
  </div>
  <div style="margin-top:28px">
    <div class="muted" style="text-transform:uppercase;letter-spacing:.05em">Customer</div>
    <div style="font-weight:700;font-size:16px">${esc(order.customerName)}</div>
    ${clientCode ? `<div class="muted">Account number: <b>${esc(clientCode)}</b></div>` : ''}
    ${order.customerEmail ? `<div class="muted">${esc(order.customerEmail)}</div>` : ''}
  </div>
  <div class="table-wrap"><table><thead><tr><th>#</th><th>Code</th><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
  <tbody>${rows}</tbody></table></div>
  <div class="totals">
    <div><span>Subtotal</span><span>${sym}${(order.subtotal || 0).toFixed(2)}</span></div>
    ${order.vatRate ? `<div><span>VAT (${order.vatRate}%)</span><span>${sym}${((order.total || 0) - (order.subtotal || 0)).toFixed(2)}</span></div>` : ''}
    <div class="grand"><span>Total (agreed prices)</span><span>${sym}${(order.total || 0).toFixed(2)}</span></div>
  </div>
  ${order.notes ? `<div class="footer"><b>Order notes:</b> ${esc(order.notes)}</div>` : ''}
  <div class="disclaimer">This order summary is a record of the order for reference only. It is <b>not a tax invoice</b> — the official invoice is issued separately by ${esc(profile?.businessName || businessName || 'the supplier')} through their own invoicing system.</div>
  <script>window.onload = () => setTimeout(() => window.print(), 300)</script>
  </body></html>`
  const w = window.open('', '_blank')
  if (!w) { toast.error('Pop-up blocked — allow pop-ups to print the summary'); return }
  w.document.write(withBackToolbar(html))
  w.document.close()
}

// CSV export of an order summary — for importing into invoicing software.
export function downloadOrderSummaryCsv(order, clientCode = '') {
  const escCsv = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const head = ['order_ref', 'order_date', 'fulfilled_date', 'customer', 'account_number', 'product_code', 'product', 'quantity', 'unit', 'unit_price', 'line_total']
  const meta = [
    order.orderRef || '',
    order.createdAt ? new Date(order.createdAt).toISOString().slice(0, 10) : '',
    order.fulfilledAt ? new Date(order.fulfilledAt).toISOString().slice(0, 10) : '',
    order.customerName || '',
    clientCode || '',
  ]
  const lines = [head.join(',')]
  for (const i of (order.items || [])) {
    lines.push([
      ...meta,
      i.sku || '', i.name || '', Number(i.quantity) || 0, i.unit || '',
      (Number(i.price) || 0).toFixed(2),
      ((Number(i.quantity) || 0) * (Number(i.price) || 0)).toFixed(2),
    ].map(escCsv).join(','))
  }
  lines.push([...meta, '', 'SUBTOTAL', '', '', '', (order.subtotal || 0).toFixed(2)].map(escCsv).join(','))
  if (order.vatRate) lines.push([...meta, '', `VAT ${order.vatRate}%`, '', '', '', ((order.total || 0) - (order.subtotal || 0)).toFixed(2)].map(escCsv).join(','))
  lines.push([...meta, '', 'TOTAL', '', '', '', (order.total || 0).toFixed(2)].map(escCsv).join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${order.orderRef || 'order'}-summary.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.success('CSV downloaded')
}

// ---------------------------------------------------------------------------
// Product add/edit dialog
// ---------------------------------------------------------------------------
function ProductDialog({ open, onClose, product, onSaved }) {
  const isEdit = !!product?.id
  const [form, setForm] = useState({ name: '', category: '', unit: '', packSize: '', price: '', sku: '', available: true, notes: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setForm({
      name: product?.name || '', category: product?.category || '', unit: product?.unit || '',
      packSize: product?.packSize || '', price: product?.price ?? '', sku: product?.sku || '',
      available: product?.available !== false, notes: product?.notes || '',
    })
  }, [open, product])

  const save = async () => {
    if (!form.name.trim()) { toast.error('Product name required'); return }
    setBusy(true)
    try {
      await apiJson(isEdit ? `/api/supplier/products/${product.id}` : '/api/supplier/products', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify({ ...form, price: Number(form.price) || 0 }),
      })
      toast.success(isEdit ? 'Product updated' : 'Product added to catalog')
      onSaved()
      onClose()
    } catch (e) { toast.error(e.message || 'Save failed') } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose() }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit product' : 'Add product to catalog'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2">
            <Label className="text-xs">Product name *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Chicken breast fillets" autoFocus />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Meat, Dairy, Produce…" />
          </div>
          <div>
            <Label className="text-xs">SKU / code</Label>
            <Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="Optional" />
          </div>
          <div>
            <Label className="text-xs">Unit</Label>
            <Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="kg, case, box…" />
          </div>
          <div>
            <Label className="text-xs">Pack size</Label>
            <Input value={form.packSize} onChange={e => setForm({ ...form, packSize: e.target.value })} placeholder="e.g. 5kg, 12x400g" />
          </div>
          <div>
            <Label className="text-xs">Price per unit</Label>
            <Input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
          </div>
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.available} onChange={e => setForm({ ...form, available: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
              In stock / available
            </label>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional — min order qty, lead time…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
            {isEdit ? 'Save changes' : 'Add product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// New order dialog (manual entry — kitchens ordering in-app comes later)
// ---------------------------------------------------------------------------
function NewOrderDialog({ open, onClose, products, defaultVatRate, currencySymbol, onSaved }) {
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [vatRate, setVatRate] = useState(defaultVatRate || 0)
  const [items, setItems] = useState([{ name: '', quantity: 1, unit: '', price: '' }])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setCustomerName(''); setCustomerEmail(''); setNotes('')
      setVatRate(defaultVatRate || 0)
      setItems([{ name: '', quantity: 1, unit: '', price: '' }])
    }
  }, [open, defaultVatRate])

  const updItem = (i, k, v) => setItems(list => list.map((it, idx) => idx === i ? { ...it, [k]: v } : it))
  const addItem = () => setItems(list => [...list, { name: '', quantity: 1, unit: '', price: '' }])
  const delItem = (i) => setItems(list => list.filter((_, idx) => idx !== i))
  // Picking a catalog product auto-fills unit + price
  const pickProduct = (i, name) => {
    const p = (products || []).find(x => x.name === name)
    setItems(list => list.map((it, idx) => idx === i
      ? { ...it, name, unit: p?.unit ?? it.unit, price: p ? p.price : it.price }
      : it))
  }

  const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.price) || 0), 0)
  const total = subtotal * (1 + (Number(vatRate) || 0) / 100)

  const save = async () => {
    if (!customerName.trim()) { toast.error('Customer name required'); return }
    const valid = items.filter(i => i.name.trim() && Number(i.quantity) > 0)
    if (valid.length === 0) { toast.error('Add at least one item with a quantity'); return }
    setBusy(true)
    try {
      await apiJson('/api/supplier/orders', {
        method: 'POST',
        body: JSON.stringify({ customerName, customerEmail, notes, vatRate: Number(vatRate) || 0, items: valid }),
      })
      toast.success('Order created')
      onSaved()
      onClose()
    } catch (e) { toast.error(e.message || 'Failed to create order') } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose() }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New order</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Customer / kitchen name *</Label>
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. The Green Kitchen" autoFocus />
            </div>
            <div>
              <Label className="text-xs">Customer email</Label>
              <Input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Items *</Label>
            <div className="space-y-2 mt-1">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input list={`sup-products-${i}`} value={it.name} onChange={e => pickProduct(i, e.target.value)} placeholder="Item (type or pick from catalog)" className="flex-1 h-9 text-sm" />
                  <datalist id={`sup-products-${i}`}>
                    {(products || []).map(p => <option key={p.id} value={p.name} />)}
                  </datalist>
                  <Input type="number" min="0" step="0.01" value={it.quantity} onChange={e => updItem(i, 'quantity', e.target.value)} placeholder="Qty" className="w-16 h-9 text-sm" />
                  <Input value={it.unit} onChange={e => updItem(i, 'unit', e.target.value)} placeholder="Unit" className="w-16 h-9 text-sm" />
                  <Input type="number" min="0" step="0.01" value={it.price} onChange={e => updItem(i, 'price', e.target.value)} placeholder={`${currencySymbol}`} className="w-20 h-9 text-sm" />
                  <button onClick={() => delItem(i)} disabled={items.length === 1} aria-label="Remove item" className="h-8 w-8 rounded-full hover:bg-red-50 text-red-500 disabled:opacity-30 flex items-center justify-center shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" /> Add item</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">VAT %</Label>
              <Input type="number" min="0" max="100" value={vatRate} onChange={e => setVatRate(e.target.value)} />
            </div>
            <div className="flex flex-col justify-end text-right">
              <p className="text-xs text-muted-foreground">Subtotal {money(subtotal, currencySymbol)}</p>
              <p className="text-lg font-bold text-indigo-700">Total {money(total, currencySymbol)}</p>
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Delivery date, PO number…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ClipboardCheck className="h-4 w-4 mr-1.5" />}
            Create order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Order detail dialog
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Mark-as-Delivered dialog: optional delivery note. The itemised ORDER SUMMARY
// PDF is generated AUTOMATICALLY by the server and emailed to the kitchen —
// no manual upload needed (two-tier invoicing, Aug 2026).
// ---------------------------------------------------------------------------
function MarkDeliveredDialog({ order, onClose, onSubmit, busy }) {
  const [note, setNote] = useState('')
  useEffect(() => { if (order) setNote('') }, [order?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!order) return null

  return (
    <Dialog open={!!order} onOpenChange={(v) => { if (!v && !busy) onClose() }}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-emerald-600" /> Mark {order.orderRef} as delivered</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-xs text-emerald-900">
            📄 The itemised <b>Order Summary PDF</b> (products, codes, quantities, prices, totals) is generated automatically and emailed to the kitchen with their delivery notification — nothing to upload.
          </div>
          <div>
            <Label className="text-xs">Delivery note (optional)</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder='e.g. "Left with kitchen manager, signed by Michael"' className="mt-1" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Back</Button>
          <Button onClick={() => onSubmit(order, { note: note.trim() })} disabled={busy}
            className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
            Mark as delivered
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// CREDIT REQUEST PANEL (Aug 2026): shows the auto-created credit request from
// the kitchen's delivery check; supplier can Approve or Decline (with a note).
// ---------------------------------------------------------------------------
function CreditPanel({ order, onDecided }) {
  const [credit, setCredit] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(null)   // 'approved' | 'declined' while submitting
  useEffect(() => {
    setCredit(null); setNote('')
    if (!order?.creditStatus) return
    apiJson(`/api/supplier/orders/${order.id}/credit`).then(setCredit).catch(() => {})
  }, [order?.id, order?.creditStatus]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!order?.creditStatus || !credit) return null

  const decide = async (decision) => {
    setBusy(decision)
    try {
      const res = await apiJson(`/api/supplier/orders/${order.id}/credit-decision`, {
        method: 'POST', body: JSON.stringify({ decision, note: note.trim() }),
      })
      toast.success(decision === 'approved' ? `Credit of £${(credit.total || 0).toFixed(2)} approved — kitchen notified ✅` : 'Credit request declined — kitchen notified')
      onDecided?.(res)
    } catch (e) { toast.error(e.message || 'Could not save the decision') } finally { setBusy(null) }
  }

  const decided = order.creditStatus !== 'requested'
  return (
    <div className={`rounded-xl border-2 p-3 space-y-2 ${order.creditStatus === 'approved' ? 'border-emerald-200 bg-emerald-50/60' : order.creditStatus === 'declined' ? 'border-slate-200 bg-slate-50' : 'border-indigo-200 bg-indigo-50/60'}`}>
      <p className="text-sm font-bold flex items-center gap-1.5">💳 Credit request — £{(Number(credit.total) || 0).toFixed(2)}
        {decided && <Badge variant="outline" className={`ml-auto text-[10px] ${order.creditStatus === 'approved' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-500 border-slate-300'}`}>{order.creditStatus === 'approved' ? 'Approved ✓' : 'Declined'}</Badge>}
      </p>
      <ul className="text-xs space-y-1">
        {(credit.items || []).map((i, idx) => (
          <li key={idx} className="flex justify-between gap-2">
            <span className="break-words">{i.name} <span className="text-muted-foreground">({i.quantity} {i.unit || ''} — {i.reason})</span></span>
            <span className="font-semibold whitespace-nowrap">£{(Number(i.amount) || 0).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      {credit.note && <p className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">📝 Kitchen: "{credit.note}"</p>}
      {decided ? (
        credit.decisionNote ? <p className="text-xs text-muted-foreground italic">Your note: "{credit.decisionNote}"</p> : null
      ) : (
        <>
          <Input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Optional note to the kitchen…" className="h-9 text-sm bg-white" />
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => decide('approved')} disabled={!!busy} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {busy === 'approved' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />} Approve £{(Number(credit.total) || 0).toFixed(2)}
            </Button>
            <Button size="sm" variant="outline" onClick={() => decide('declined')} disabled={!!busy} className="border-red-200 text-red-600 hover:bg-red-50">
              {busy === 'declined' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <X className="h-3.5 w-3.5 mr-1.5" />} Decline
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function OrderDetailDialog({ order, onClose, currencySymbol, onStatusChange, busyId, profile, businessName, ownerEmail, clientCode, onCreditDecided }) {
  if (!order) return null
  const st = STATUS_STYLE[order.status] || STATUS_STYLE.pending
  return (
    <Dialog open={!!order} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Order — {order.customerName}
            <Badge variant="outline" className={`${st.cls} text-[10px]`}>{st.label}</Badge>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {order.orderRef} · {order.createdAt ? new Date(order.createdAt).toLocaleString('en-GB') : ''}
            {order.invoiceNumber ? ` · ${order.invoiceNumber}` : ''}
          </p>
        </DialogHeader>
        <div className="space-y-3">
          {order.customerEmail && <p className="text-sm text-muted-foreground">{order.customerEmail}</p>}
          {order.requestedDeliveryDate && (
            <p className="text-sm inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-800 rounded-lg px-2.5 py-1.5">
              <CalendarDays className="h-4 w-4" /> Requested delivery: <b>{new Date(order.requestedDeliveryDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</b>
            </p>
          )}
          <div className="border rounded-lg divide-y">
            {(order.items || []).map((i, idx) => (
              <div key={idx} className="px-3 py-2 flex justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 break-words">{i.name}</span>
                <span className="text-muted-foreground text-right shrink-0 max-w-[55%] break-words">{i.quantity} {i.unit || ''} × {money(i.price, currencySymbol)} = <b className="text-slate-800">{money((Number(i.quantity) || 0) * (Number(i.price) || 0), currencySymbol)}</b></span>
              </div>
            ))}
          </div>
          <div className="text-right space-y-0.5">
            <p className="text-xs text-muted-foreground">Subtotal {money(order.subtotal, currencySymbol)}{order.vatRate ? ` · VAT ${order.vatRate}%` : ''}</p>
            <p className="text-lg font-bold text-indigo-700">Total {money(order.total, currencySymbol)}</p>
          </div>
          {order.notes && <p className="text-xs text-muted-foreground italic border-l-2 border-indigo-200 pl-3">{order.notes}</p>}
          {order.deliveryNote && (
            <p className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg px-2.5 py-1.5">🚚 Delivery note: <b>{order.deliveryNote}</b></p>
          )}
          {order.invoiceUrl && (
            <a href={order.invoiceUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 hover:bg-indigo-100 transition">
              📎 Supplier Invoice (your uploaded file) <span className="ml-auto text-xs font-normal text-indigo-500">View / download →</span>
            </a>
          )}
          <CreditPanel order={order} onDecided={onCreditDecided} />
        </div>
        <DialogFooter className="flex-wrap gap-2">
          {order.status === 'pending' && (
            <>
              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" disabled={busyId === order.id} onClick={() => onStatusChange(order, 'cancelled')}>
                <Ban className="h-3.5 w-3.5 mr-1" /> Cancel order
              </Button>
              <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white" disabled={busyId === order.id} onClick={() => onStatusChange(order, 'confirmed')}>
                {busyId === order.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />} Confirm
              </Button>
            </>
          )}
          {order.status === 'confirmed' && (
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={busyId === order.id} onClick={() => onStatusChange(order, 'dispatched')}>
              {busyId === order.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Truck className="h-3.5 w-3.5 mr-1" />} Mark dispatched
            </Button>
          )}
          {(order.status === 'confirmed' || order.status === 'dispatched') && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busyId === order.id} onClick={() => onStatusChange(order, 'fulfilled')}>
              {busyId === order.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5 mr-1" />} Mark as delivered
            </Button>
          )}
          {order.status === 'fulfilled' && (
            <>
              <Button size="sm" variant="outline" onClick={() => downloadOrderSummaryCsv(order, clientCode)}>
                <Download className="h-3.5 w-3.5 mr-1" /> CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => printOrderSummary(order, profile, businessName, ownerEmail, clientCode)}>
                <Printer className="h-3.5 w-3.5 mr-1" /> Print summary
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// MAIN — Supplier Dashboard
// ---------------------------------------------------------------------------
export default function SupplierDashboard({ me }) {
  const router = useRouter()
  const [tab, setTab] = useState('orders') // orders | catalog | invoices | profile
  const [stats, setStats] = useState(null)
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(me?.kitchen?.supplierProfile || {})
  const [businessName, setBusinessName] = useState(me?.kitchen?.kitchenName || '')
  const [supplierCode, setSupplierCode] = useState('')
  const [clients, setClients] = useState([])
  const [invites, setInvites] = useState([])
  const ownerEmail = me?.userEmail || me?.kitchen?.ownerEmail || ''
  const sym = profile?.currencySymbol || '£'

  // Dialog state
  const [productDialog, setProductDialog] = useState({ open: false, product: null })
  const [orderDialog, setOrderDialog] = useState(false)
  const [viewOrder, setViewOrder] = useState(null)
  const [statusBusy, setStatusBusy] = useState(null)
  const [sampleBusy, setSampleBusy] = useState(false)
  const [migrationNeeded, setMigrationNeeded] = useState(false)

  const loadAll = useCallback(async () => {
    try {
      const [o, p, s, prof, cli, inv] = await Promise.all([
        apiJson('/api/supplier/orders').catch(e => { throw e }),
        apiJson('/api/supplier/products').catch(() => []),
        apiJson('/api/supplier/stats').catch(() => null),
        apiJson('/api/supplier/profile').catch(() => null),
        apiJson('/api/supplier/clients').catch(() => []),
        apiJson('/api/supplier/invites').catch(() => []),
      ])
      setOrders(Array.isArray(o) ? o : [])
      setProducts(Array.isArray(p) ? p : [])
      setStats(s)
      if (prof) {
        setProfile(prof.profile || {})
        if (prof.businessName) setBusinessName(prof.businessName)
        setSupplierCode(prof.supplierCode || '')
      }
      setClients(Array.isArray(cli) ? cli : [])
      setInvites(Array.isArray(inv) ? inv : [])
      setMigrationNeeded(false)
    } catch (e) {
      if (/migration-20/i.test(e.message || '')) setMigrationNeeded(true)
      else toast.error(e.message || 'Failed to load supplier data')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])
  // Refresh when the app regains focus (same live-sync pattern as kitchen side)
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') loadAll() }
    document.addEventListener('visibilitychange', onVis)
    const iv = setInterval(() => { if (document.visibilityState === 'visible') loadAll() }, 60000)
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(iv) }
  }, [loadAll])

  const [deliverOrder, setDeliverOrder] = useState(null)   // order being marked as delivered

  const changeStatus = async (order, status) => {
    // "Delivered" goes through the delivery dialog (note + own-invoice upload)
    if (status === 'fulfilled') { setDeliverOrder(order); return }
    setStatusBusy(order.id)
    try {
      const updated = await apiJson(`/api/supplier/orders/${order.id}`, { method: 'PUT', body: JSON.stringify({ status }) })
      toast.success(`Order ${status}`)
      setViewOrder(v => (v && v.id === order.id) ? updated : v)
      loadAll()
    } catch (e) { toast.error(e.message || 'Update failed') } finally { setStatusBusy(null) }
  }

  const completeDelivery = async (order, { note }) => {
    setStatusBusy(order.id)
    try {
      const updated = await apiJson(`/api/supplier/orders/${order.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'fulfilled', ...(note ? { deliveryNote: note } : {}) }),
      })
      toast.success(`Order ${updated.orderRef} marked as delivered 🎉 — kitchen notified with the Order Summary PDF`)
      setViewOrder(v => (v && v.id === order.id) ? updated : v)
      setDeliverOrder(null)
      loadAll()
    } catch (e) { toast.error(e.message || 'Update failed') } finally { setStatusBusy(null) }
  }

  // Supplier's internal client code for an order (via the connection record)
  const clientCodeFor = (o) => (o?.kitchenId && clients.find(c => c.kitchenId === o.kitchenId)?.clientCode) || ''

  // ---- Connection codes (per-client invites) ----
  const [inviteForm, setInviteForm] = useState({ clientLabel: '', clientCode: '' })
  const [inviteBusy, setInviteBusy] = useState(false)
  const generateInvite = async () => {
    setInviteBusy(true)
    try {
      const inv = await apiJson('/api/supplier/invites', { method: 'POST', body: JSON.stringify(inviteForm) })
      toast.success(`Connection code ${inv.code} created — share it with your client`)
      setInviteForm({ clientLabel: '', clientCode: '' })
      loadAll()
    } catch (e) { toast.error(e.message || 'Could not create code') } finally { setInviteBusy(false) }
  }
  const revokeInvite = async (inv) => {
    if (!confirm(`Revoke code ${inv.code}? It will no longer work.`)) return
    try {
      await apiJson(`/api/supplier/invites/${inv.id}`, { method: 'DELETE' })
      toast.success('Code revoked')
      loadAll()
    } catch (e) { toast.error(e.message || 'Failed') }
  }
  const editClientCode = async (c) => {
    const next = prompt(`Account number for ${c.kitchenName}:`, c.clientCode || '')
    if (next === null) return
    try {
      await apiJson(`/api/supplier/clients/${c.connectionId}`, { method: 'PUT', body: JSON.stringify({ clientCode: next }) })
      toast.success('Account number saved')
      loadAll()
    } catch (e) { toast.error(e.message || 'Failed') }
  }

  const deleteProduct = async (p) => {
    if (!confirm(`Remove "${p.name}" from your catalog?`)) return
    try {
      await apiJson(`/api/supplier/products/${p.id}`, { method: 'DELETE' })
      toast.success('Product removed')
      loadAll()
    } catch (e) { toast.error(e.message || 'Delete failed') }
  }

  const logout = async () => {
    await signOutAll()
    router.replace('/login')
  }

  // ---- Profile form ----
  const [pForm, setPForm] = useState(null)
  const [pBusy, setPBusy] = useState(false)
  const openProfileForm = () => setPForm({
    businessName: profile.businessName || businessName || '',
    contactName: profile.contactName || '',
    phone: profile.phone || '',
    address: profile.address || '',
    vatNumber: profile.vatNumber || '',
    defaultVatRate: profile.defaultVatRate ?? 0,
    paymentTerms: profile.paymentTerms || '',
    currencySymbol: profile.currencySymbol || '£',
    invoiceFooter: profile.invoiceFooter || '',
    deliveryDays: profile.deliveryDays || '',
    minOrderValue: profile.minOrderValue ?? 0,
    promoText: profile.promoText || '',
  })
  useEffect(() => { if (tab === 'profile' && !pForm) openProfileForm() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps
  const saveProfile = async () => {
    setPBusy(true)
    try {
      const res = await apiJson('/api/supplier/profile', { method: 'PUT', body: JSON.stringify(pForm) })
      setProfile(res.profile || pForm)
      if (pForm.businessName) setBusinessName(pForm.businessName)
      toast.success('Business profile saved')
    } catch (e) { toast.error(e.message || 'Save failed') } finally { setPBusy(false) }
  }

  const summaries = orders.filter(o => o.status === 'fulfilled')

  const TABS = [
    { id: 'orders', label: 'Orders', icon: Inbox },
    { id: 'catalog', label: 'Catalog', icon: Package },
    { id: 'invoices', label: 'Summaries', icon: FileText },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'profile', label: 'Profile', icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/60 via-white to-slate-50">
      <Toaster position="top-right" richColors />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-indigo-100">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Truck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold leading-tight truncate">{businessName || 'Supplier Portal'}</p>
              <p className="text-[10px] uppercase tracking-wider text-indigo-600 font-semibold">Supplier account</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={loadAll} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" onClick={logout}><LogOut className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Sign out</span></Button>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              <t.icon className="h-4 w-4" /> {t.label}
              {t.id === 'orders' && stats?.pendingOrders > 0 && (
                <span className="ml-1 h-5 min-w-5 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">{stats.pendingOrders}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {migrationNeeded && (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <b>One-time setup needed:</b> the supplier tables don't exist in your database yet.
            Run <code className="bg-amber-100 px-1 rounded">supabase/migration-20-supplier.sql</code> in the Supabase SQL editor, then refresh.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Pending orders', value: stats?.pendingOrders ?? '—', icon: Inbox, cls: 'text-amber-600 bg-amber-50' },
            { label: 'Orders this month', value: stats?.ordersThisMonth ?? '—', icon: ClipboardCheck, cls: 'text-sky-600 bg-sky-50' },
            { label: 'Revenue this month', value: stats ? money(stats.revenueThisMonth, sym) : '—', icon: PoundSterling, cls: 'text-emerald-600 bg-emerald-50' },
            { label: 'Catalog products', value: stats?.products ?? '—', icon: Package, cls: 'text-indigo-600 bg-indigo-50' },
          ].map((s, i) => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${s.cls}`}><s.icon className="h-5 w-5" /></div>
                <div>
                  <p className="text-xl font-bold leading-tight">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20"><Loader2 className="h-8 w-8 mx-auto animate-spin text-indigo-500" /></div>
        ) : (
          <>
            {/* ---------------- ORDERS ---------------- */}
            {tab === 'orders' && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div><CardTitle className="text-lg">Orders</CardTitle><CardDescription>Incoming orders queue — confirm, fulfil &amp; invoice</CardDescription></div>
                  <Button onClick={() => setOrderDialog(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white"><Plus className="h-4 w-4 mr-1.5" /> New order</Button>
                </CardHeader>
                <CardContent>
                  {orders.length === 0 ? (
                    <div className="text-center py-14 text-muted-foreground">
                      <Inbox className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No orders yet</p>
                      <p className="text-sm">Create your first order with the button above.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {orders.map(o => {
                        const st = STATUS_STYLE[o.status] || STATUS_STYLE.pending
                        return (
                          <div key={o.id} className="flex items-center gap-3 border rounded-lg px-3 py-2.5 hover:bg-indigo-50/40 transition">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">
                                {o.customerName}
                                {o.placedVia === 'shelfwise' && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5 align-middle">via ShelfWise</span>}
                                {o.creditStatus === 'requested' && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-300 rounded px-1.5 py-0.5 align-middle">💳 Credit to review</span>}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {o.orderRef} · {(o.items || []).length} item{(o.items || []).length !== 1 ? 's' : ''} · {o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-GB') : ''}
                                {o.requestedDeliveryDate ? ` · 🚚 ${new Date(o.requestedDeliveryDate + 'T00:00:00').toLocaleDateString('en-GB')}` : ''}
                                {o.invoiceNumber ? ` · ${o.invoiceNumber}` : ''}
                              </p>
                            </div>
                            <span className="font-bold text-sm text-indigo-700 whitespace-nowrap">{money(o.total, sym)}</span>
                            <Badge variant="outline" className={`${st.cls} text-[10px] shrink-0`}>{st.label}</Badge>
                            <div className="flex items-center gap-1 shrink-0">
                              {o.status === 'pending' && (
                                <Button size="sm" className="h-8 bg-sky-600 hover:bg-sky-700 text-white" disabled={statusBusy === o.id} onClick={() => changeStatus(o, 'confirmed')}>
                                  {statusBusy === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}<span className="hidden sm:inline ml-1">Confirm</span>
                                </Button>
                              )}
                              {o.status === 'confirmed' && (
                                <Button size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white" disabled={statusBusy === o.id} onClick={() => changeStatus(o, 'dispatched')}>
                                  {statusBusy === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}<span className="hidden sm:inline ml-1">Dispatch</span>
                                </Button>
                              )}
                              {(o.status === 'confirmed' || o.status === 'dispatched') && (
                                <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={statusBusy === o.id} onClick={() => changeStatus(o, 'fulfilled')}>
                                  {statusBusy === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}<span className="hidden sm:inline ml-1">Fulfil</span>
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-8" onClick={() => setViewOrder(o)} title="View order"><Eye className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ---------------- CATALOG ---------------- */}
            {tab === 'catalog' && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div><CardTitle className="text-lg">Product catalog</CardTitle><CardDescription>What you sell — kitchens will browse this when in-app ordering opens</CardDescription></div>
                  <Button onClick={() => setProductDialog({ open: true, product: null })} className="bg-indigo-600 hover:bg-indigo-700 text-white"><Plus className="h-4 w-4 mr-1.5" /> Add product</Button>
                </CardHeader>
                <CardContent>
                  {products.length === 0 ? (
                    <div className="text-center py-14 text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">Your catalog is empty</p>
                      <p className="text-sm">Add the products you supply so ordering is one tap.</p>
                      <Button variant="outline" className="mt-4" disabled={sampleBusy}
                        onClick={async () => {
                          setSampleBusy(true)
                          try {
                            await apiJson('/api/supplier/products/sample', { method: 'POST', body: '{}' })
                            toast.success('20 sample products added to your catalog')
                            loadAll()
                          } catch (e) { toast.error(e.message || 'Failed') } finally { setSampleBusy(false) }
                        }}>
                        {sampleBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
                        Load 20 sample products (demo)
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {Object.entries(products.reduce((g, p) => {
                        const c = p.category || 'Other'
                        ;(g[c] = g[c] || []).push(p)
                        return g
                      }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
                        <div key={cat}>
                          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 rounded-md px-2.5 py-1.5 inline-flex items-center gap-1.5 mb-2">
                            <span className="text-sm">{catEmoji(cat)}</span> {cat} <span className="text-indigo-400 font-semibold">({items.length})</span>
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {items.map(p => (
                              <div key={p.id} className={`relative border-2 rounded-xl p-3 pt-2.5 transition hover:border-indigo-200 ${p.available ? 'border-slate-100 bg-white' : 'border-slate-100 bg-slate-50 opacity-70'}`}>
                                <div className="flex items-start gap-2.5">
                                  <div className="h-11 w-11 shrink-0 rounded-lg bg-indigo-50 flex items-center justify-center text-2xl select-none">{catEmoji(p.category)}</div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-sm break-words leading-snug">{p.name}</p>
                                    <p className="text-[11px] text-muted-foreground">{[p.packSize, p.sku].filter(Boolean).join(' · ') || '—'}</p>
                                  </div>
                                  <span className="font-bold text-indigo-700 text-sm whitespace-nowrap">{money(p.price, sym)}{p.unit ? <span className="text-[10px] text-muted-foreground font-normal">/{p.unit}</span> : ''}</span>
                                </div>
                                <div className="flex items-center justify-between mt-2.5">
                                  <Badge variant="outline" className={p.available ? 'bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]' : 'bg-red-50 text-red-600 border-red-200 text-[10px]'}>
                                    {p.available ? 'In stock' : 'Out of stock'}
                                  </Badge>
                                  <div className="flex gap-1">
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setProductDialog({ open: true, product: p })} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => deleteProduct(p)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </div>
                                </div>
                                {p.notes && <p className="text-[11px] text-muted-foreground italic mt-1.5">{p.notes}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ---------------- ORDER SUMMARIES (not invoices) ---------------- */}
            {tab === 'invoices' && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Order summaries</CardTitle>
                  <CardDescription>
                    A clean record of each fulfilled order — view, print/PDF or export CSV for your own invoicing software.
                    ShelfWise does not issue invoices; you invoice through your usual system.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {summaries.length === 0 ? (
                    <div className="text-center py-14 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No order summaries yet</p>
                      <p className="text-sm">Mark an order as fulfilled to generate its summary.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {summaries.map(o => (
                        <div key={o.id} className="flex items-center gap-3 border rounded-lg px-3 py-2.5 flex-wrap">
                          <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{o.orderRef}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {o.customerName}
                              {clientCodeFor(o) ? ` · Account no: ${clientCodeFor(o)}` : ''}
                              {' · '}{o.fulfilledAt ? new Date(o.fulfilledAt).toLocaleDateString('en-GB') : ''}
                            </p>
                          </div>
                          <span className="font-bold text-sm text-indigo-700 whitespace-nowrap">{money(o.total, sym)}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="sm" variant="ghost" className="h-8" onClick={() => setViewOrder(o)} title="View"><Eye className="h-4 w-4" /></Button>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => downloadOrderSummaryCsv(o, clientCodeFor(o))} title="Export CSV">
                              <Download className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">CSV</span>
                            </Button>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => printOrderSummary(o, profile, businessName, ownerEmail, clientCodeFor(o))}>
                              <Printer className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Print / PDF</span>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ---------------- CLIENTS ---------------- */}
            {tab === 'clients' && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Connected restaurants</CardTitle>
                  <CardDescription>
                    Kitchens connected to you can browse your catalog and place orders in-app.
                    {supplierCode ? <> Share your supplier code so they can connect: <b className="text-indigo-700">{supplierCode}</b></> : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Per-client connection code generator (migration-22) */}
                  <div className="mb-4 rounded-xl border-2 border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
                    <p className="font-semibold text-sm flex items-center gap-1.5 text-indigo-900"><KeyRound className="h-4 w-4" /> Generate a connection code for a client</p>
                    <p className="text-xs text-muted-foreground">
                      Create a single-use code and share it with the restaurant (verbally, email…). When they enter it in
                      ShelfWise they connect to you AND their account number is attached automatically.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input value={inviteForm.clientLabel} onChange={e => setInviteForm(f => ({ ...f, clientLabel: e.target.value }))} placeholder="Client name (for your reference)" className="bg-white" />
                      <Input value={inviteForm.clientCode} onChange={e => setInviteForm(f => ({ ...f, clientCode: e.target.value }))} placeholder="Account number (optional)" className="bg-white" />
                      <Button onClick={generateInvite} disabled={inviteBusy} className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">
                        {inviteBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />} Generate code
                      </Button>
                    </div>
                    {invites.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-indigo-500">Active codes (not yet used)</p>
                        {invites.map(inv => (
                          <div key={inv.id} className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2">
                            <span className="font-mono font-bold text-indigo-800 text-sm">{inv.code}</span>
                            <span className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
                              {inv.clientLabel || 'Any client'}{inv.clientCode ? ` · account number: ${inv.clientCode}` : ''}
                            </span>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Copy code" onClick={() => { navigator.clipboard?.writeText(inv.code).then(() => toast.success('Code copied')) }}><Copy className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" title="Revoke" onClick={() => revokeInvite(inv)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        ))}
                      </div>
                    )}
                    {supplierCode && (
                      <p className="text-[11px] text-muted-foreground">
                        Your general code <b className="font-mono text-indigo-700">{supplierCode}</b> also works (connects without an account number).
                        <button className="ml-1 underline" onClick={() => { navigator.clipboard?.writeText(supplierCode).then(() => toast.success('Code copied')) }}>copy</button>
                      </p>
                    )}
                  </div>
                  {clients.length === 0 ? (
                    <div className="text-center py-14 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No connected restaurants yet</p>
                      <p className="text-sm">Give your customers your supplier code{supplierCode ? ` (${supplierCode})` : ''} or email — they connect from their ShelfWise "Suppliers & Orders" screen.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {clients.map(c => (
                        <div key={c.connectionId} className="flex items-center gap-3 border rounded-lg px-3 py-2.5 flex-wrap">
                          <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 font-bold text-sm">
                            {(c.kitchenName || '?').slice(0, 1).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{c.kitchenName}</p>
                            <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                          </div>
                          <button onClick={() => editClientCode(c)} title="Edit account number"
                            className={`text-xs font-mono font-semibold rounded-md px-2 py-1 border transition shrink-0 ${c.clientCode ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:border-indigo-400' : 'bg-slate-50 text-slate-400 border-dashed border-slate-300 hover:border-indigo-400'}`}>
                            {c.clientCode || '+ account number'}
                          </button>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-indigo-700">{c.totalOrders} order{c.totalOrders !== 1 ? 's' : ''}</p>
                            <p className="text-[11px] text-muted-foreground">since {c.connectedAt ? new Date(c.connectedAt).toLocaleDateString('en-GB') : ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ---------------- PROFILE ---------------- */}
            {tab === 'profile' && pForm && (
              <Card className="border-0 shadow-sm max-w-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Business profile</CardTitle>
                  <CardDescription>Shown on your order summaries</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label className="text-xs">Business name</Label>
                      <Input value={pForm.businessName} onChange={e => setPForm({ ...pForm, businessName: e.target.value })} placeholder="e.g. Fresh Farm Foods Ltd" />
                    </div>
                    <div>
                      <Label className="text-xs">Contact name</Label>
                      <Input value={pForm.contactName} onChange={e => setPForm({ ...pForm, contactName: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Phone</Label>
                      <Input value={pForm.phone} onChange={e => setPForm({ ...pForm, phone: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Address</Label>
                      <textarea value={pForm.address} onChange={e => setPForm({ ...pForm, address: e.target.value })} rows={2} className="w-full rounded-md border border-input bg-white p-2 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">VAT number</Label>
                      <Input value={pForm.vatNumber} onChange={e => setPForm({ ...pForm, vatNumber: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Default VAT % on orders</Label>
                      <Input type="number" min="0" max="100" value={pForm.defaultVatRate} onChange={e => setPForm({ ...pForm, defaultVatRate: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Currency symbol</Label>
                      <Input value={pForm.currencySymbol} onChange={e => setPForm({ ...pForm, currencySymbol: e.target.value })} placeholder="£" className="w-20" />
                    </div>
                    <div>
                      <Label className="text-xs">Payment terms</Label>
                      <Input value={pForm.paymentTerms} onChange={e => setPForm({ ...pForm, paymentTerms: e.target.value })} placeholder="e.g. Net 30 days" />
                    </div>
                    <div>
                      <Label className="text-xs">Delivery days <span className="text-muted-foreground">(shown to customers)</span></Label>
                      <Input value={pForm.deliveryDays} onChange={e => setPForm({ ...pForm, deliveryDays: e.target.value })} placeholder="e.g. Mon, Wed, Fri" />
                    </div>
                    <div>
                      <Label className="text-xs">Minimum order value</Label>
                      <Input type="number" min="0" step="0.01" value={pForm.minOrderValue} onChange={e => setPForm({ ...pForm, minOrderValue: e.target.value })} placeholder="0 = no minimum" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">🎉 Promo banner <span className="text-muted-foreground">(shown to customers on their ordering screen — leave empty to hide)</span></Label>
                      <Input value={pForm.promoText} onChange={e => setPForm({ ...pForm, promoText: e.target.value })} maxLength={160} placeholder="e.g. Free delivery on orders over £150 this week" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Summary footer note</Label>
                      <Input value={pForm.invoiceFooter} onChange={e => setPForm({ ...pForm, invoiceFooter: e.target.value })} placeholder="e.g. Thank you for your business!" />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={saveProfile} disabled={pBusy} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                      {pBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />} Save profile
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

      {/* Dialogs */}
      <ProductDialog open={productDialog.open} product={productDialog.product} onClose={() => setProductDialog({ open: false, product: null })} onSaved={loadAll} />
      <NewOrderDialog open={orderDialog} onClose={() => setOrderDialog(false)} products={products} defaultVatRate={Number(profile?.defaultVatRate) || 0} currencySymbol={sym} onSaved={loadAll} />
      <OrderDetailDialog order={viewOrder} onClose={() => setViewOrder(null)} currencySymbol={sym} onStatusChange={changeStatus} busyId={statusBusy} profile={profile} businessName={businessName} ownerEmail={ownerEmail} clientCode={clientCodeFor(viewOrder)} onCreditDecided={(updated) => { setViewOrder(v => v ? { ...v, ...updated } : v); loadAll() }} />
      <MarkDeliveredDialog order={deliverOrder} onClose={() => setDeliverOrder(null)} onSubmit={completeDelivery} busy={!!statusBusy} />
    </div>
  )
}
