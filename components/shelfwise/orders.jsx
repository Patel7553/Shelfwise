'use client'

/* eslint-disable no-unused-vars */
// Suppliers directory + one-tap purchase-order emails (June 2025).

import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Truck, Plus, Pencil, Trash2, Loader2, Check, X, AlertTriangle, PackageX, RefreshCw, Copy, ShieldCheck, Send, Mail, Phone, StickyNote } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'

// `fetch` inside this file transparently uses `apiFetch` (auth token attached).
const fetch = apiFetch

const EMPTY_SUPPLIER = { name: '', email: '', phone: '', notes: '' }

export function OrdersView() {
  const [suppliers, setSuppliers] = useState([])
  const [lowStock, setLowStock] = useState({ groups: {}, total: 0 })
  const [loading, setLoading] = useState(true)
  const [supplierDialog, setSupplierDialog] = useState(null)   // null | {mode:'add'} | {mode:'edit', supplier}
  const [orderDialog, setOrderDialog] = useState(null)         // null | { supplierName, items }
  const [checked, setChecked] = useState({})                   // productId -> bool
  const [qtys, setQtys] = useState({})                         // productId -> number

  const load = async () => {
    setLoading(true)
    try {
      const [supRes, lowRes] = await Promise.all([
        fetch('/api/suppliers'),
        fetch('/api/suppliers/low-stock'),
      ])
      const sup = supRes.ok ? await supRes.json() : []
      const low = lowRes.ok ? await lowRes.json() : { groups: {}, total: 0 }
      setSuppliers(Array.isArray(sup) ? sup : [])
      setLowStock(low && low.groups ? low : { groups: {}, total: 0 })
      // default-check every low stock item + seed suggested qtys
      const c = {}, q = {}
      Object.values(low?.groups || {}).forEach(items => items.forEach(i => { c[i.id] = true; q[i.id] = i.suggestedQty }))
      setChecked(c); setQtys(q)
    } catch {
      toast.error('Could not load suppliers')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const matchSupplier = (groupName) => {
    const n = String(groupName || '').trim().toLowerCase()
    return suppliers.find(s => s.name.trim().toLowerCase() === n) || null
  }

  const openOrderFor = (groupName, items) => {
    const selected = items.filter(i => checked[i.id]).map(i => ({
      name: i.name, quantity: Number(qtys[i.id]) || i.suggestedQty || 1, unit: i.unit, note: '',
    }))
    if (selected.length === 0) { toast.error('Tick at least one item to order'); return }
    const sup = matchSupplier(groupName)
    setOrderDialog({
      supplierName: groupName === 'No supplier set' ? '' : groupName,
      toEmail: sup?.email || '',
      items: selected,
    })
  }

  const deleteSupplier = async (s) => {
    if (!window.confirm(`Delete supplier "${s.name}"?`)) return
    const res = await fetch(`/api/suppliers/${s.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Supplier deleted'); load() } else toast.error('Delete failed')
  }

  const groupNames = Object.keys(lowStock.groups || {}).sort()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Suppliers & Orders</h2>
          <p className="text-muted-foreground mt-1">Low stock is grouped by supplier — send a professional order email in one tap</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* ---- LOW STOCK / REORDER ---- */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Low Stock — Reorder Now
            {lowStock.total > 0 && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{lowStock.total}</Badge>}
          </CardTitle>
          <CardDescription>Items at or below their reorder point. Tip: set a reorder point on products in your Inventory to see them here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="py-10 text-center"><Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" /></div>
          ) : lowStock.total === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-emerald-500 opacity-60" />
              <p className="font-medium text-emerald-700">All stock levels healthy</p>
              <p className="text-sm">Nothing is below its reorder point right now.</p>
            </div>
          ) : (
            groupNames.map(g => {
              const items = lowStock.groups[g]
              const sup = matchSupplier(g)
              return (
                <div key={g} className="rounded-xl border-2 border-amber-100 overflow-hidden">
                  <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 bg-amber-50/60 border-b border-amber-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <Truck className="h-4 w-4 text-amber-700 shrink-0" />
                      <p className="font-semibold truncate">{g}</p>
                      {sup?.email
                        ? <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 bg-emerald-50">{sup.email}</Badge>
                        : <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-500">no email saved</Badge>}
                    </div>
                    <Button size="sm" onClick={() => openOrderFor(g, items)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      <Mail className="h-4 w-4 mr-1.5" /> Create Order Email
                    </Button>
                  </div>
                  <div className="divide-y">
                    {items.map(i => (
                      <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                        <input type="checkbox" className="h-4 w-4 accent-emerald-600 shrink-0"
                          checked={!!checked[i.id]}
                          onChange={e => setChecked(c => ({ ...c, [i.id]: e.target.checked }))} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{i.name}</p>
                          <p className="text-xs text-muted-foreground">
                            In stock: <span className="font-semibold text-red-600">{i.quantity} {i.unit}</span> · reorder at {i.reorderPoint}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Label className="text-[10px] text-muted-foreground uppercase">Order</Label>
                          <Input type="number" min="1" className="w-20 h-8 text-sm"
                            value={qtys[i.id] ?? i.suggestedQty}
                            onChange={e => setQtys(q => ({ ...q, [i.id]: e.target.value }))} />
                          <span className="text-xs text-muted-foreground w-8">{i.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* ---- SUPPLIERS DIRECTORY ---- */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg"><Truck className="h-5 w-5 text-emerald-600" /> Suppliers</CardTitle>
              <CardDescription>Save each supplier's email once — order emails fill in automatically. Match the supplier name to the "Supplier" field on your products.</CardDescription>
            </div>
            <Button size="sm" onClick={() => setSupplierDialog({ mode: 'add' })}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Supplier
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {suppliers.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Truck className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No suppliers yet</p>
              <p className="text-sm">Add your suppliers (Bidfood, Brakes, your local butcher...) so order emails send in one tap.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {suppliers.map(s => (
                <div key={s.id} className="rounded-xl border p-4 hover:shadow-sm transition">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold truncate">{s.name}</p>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setSupplierDialog({ mode: 'edit', supplier: s })} className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => deleteSupplier(s)} className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <p className="flex items-center gap-1.5 truncate"><Mail className="h-3.5 w-3.5 shrink-0" /> {s.email || <span className="italic text-slate-400">no email</span>}</p>
                    {s.phone && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" /> {s.phone}</p>}
                    {s.notes && <p className="flex items-start gap-1.5 text-xs"><StickyNote className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {s.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {supplierDialog && (
        <SupplierDialog
          mode={supplierDialog.mode}
          supplier={supplierDialog.supplier}
          onClose={() => setSupplierDialog(null)}
          onSaved={() => { setSupplierDialog(null); load() }}
        />
      )}
      {orderDialog && (
        <OrderEmailDialog
          initial={orderDialog}
          suppliers={suppliers}
          onClose={() => setOrderDialog(null)}
          onSent={() => { setOrderDialog(null) }}
        />
      )}
    </div>
  )
}

function SupplierDialog({ mode, supplier, onClose, onSaved }) {
  const [form, setForm] = useState(mode === 'edit' ? { ...EMPTY_SUPPLIER, ...supplier } : { ...EMPTY_SUPPLIER })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) { toast.error('Supplier name is required'); return }
    setSaving(true)
    try {
      const url = mode === 'edit' ? `/api/suppliers/${supplier.id}` : '/api/suppliers'
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, phone: form.phone, notes: form.notes }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Save failed')
      toast.success(mode === 'edit' ? 'Supplier updated' : 'Supplier added')
      onSaved()
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-emerald-600" /> {mode === 'edit' ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label className="text-sm">Name *</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Bidfood, Local Butcher" />
            <p className="text-[11px] text-muted-foreground mt-1">Must match the "Supplier" field on your products for auto-grouping.</p>
          </div>
          <div>
            <Label className="text-sm">Order email</Label>
            <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="orders@supplier.com" />
          </div>
          <div>
            <Label className="text-sm">Phone</Label>
            <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+44..." />
          </div>
          <div>
            <Label className="text-sm">Notes</Label>
            <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Delivery days, account number..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OrderEmailDialog({ initial, suppliers, onClose, onSent }) {
  const [toEmail, setToEmail] = useState(initial.toEmail || '')
  const [supplierName, setSupplierName] = useState(initial.supplierName || '')
  const [items, setItems] = useState(initial.items || [])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const setItem = (idx, k, v) => setItems(list => list.map((it, i) => i === idx ? { ...it, [k]: v } : it))
  const removeItem = (idx) => setItems(list => list.filter((_, i) => i !== idx))
  const addItem = () => setItems(list => [...list, { name: '', quantity: 1, unit: '', note: '' }])

  const orderAsText = () => {
    const lines = [
      `PURCHASE ORDER${supplierName ? ' — ' + supplierName : ''}`,
      '',
      ...items.filter(i => i.name && Number(i.quantity) > 0).map(i => `• ${i.name} — ${i.quantity} ${i.unit || ''}${i.note ? ' (' + i.note + ')' : ''}`),
    ]
    if (message.trim()) lines.push('', message.trim())
    return lines.join('\n')
  }

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(orderAsText())
      toast.success('Order copied — paste it into WhatsApp/SMS/email')
    } catch { toast.error('Copy failed') }
  }

  const send = async () => {
    const validItems = items.filter(i => String(i.name).trim() && Number(i.quantity) > 0)
    if (validItems.length === 0) { toast.error('Add at least one item with a quantity'); return }
    if (!toEmail.trim()) { toast.error('Enter the supplier email address'); return }
    setSending(true)
    try {
      const res = await fetch('/api/suppliers/order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: toEmail.trim(), supplierName, items: validItems, message }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Send failed')
      setSent(true)
      toast.success(`Order emailed to ${toEmail}`)
      setTimeout(onSent, 1200)
    } catch (e) {
      toast.error(e.message || 'Send failed')
    } finally { setSending(false) }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-emerald-600" /> Purchase Order Email</DialogTitle>
          <p className="text-sm text-muted-foreground">Review, adjust quantities, and send. Replies go straight to your inbox.</p>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Supplier name</Label>
              <Input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="e.g. Bidfood" />
            </div>
            <div>
              <Label className="text-sm">To (email) *</Label>
              <Input type="email" value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="orders@supplier.com" list="ow-supplier-emails" />
              <datalist id="ow-supplier-emails">
                {suppliers.filter(s => s.email).map(s => <option key={s.id} value={s.email}>{s.name}</option>)}
              </datalist>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-sm font-semibold">Items ({items.length})</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" /> Add item</Button>
            </div>
            <div className="space-y-1.5">
              {items.map((i, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <Input className="flex-1 h-9 text-sm" placeholder="Item name" value={i.name} onChange={e => setItem(idx, 'name', e.target.value)} />
                  <Input className="w-20 h-9 text-sm" type="number" min="0" placeholder="Qty" value={i.quantity} onChange={e => setItem(idx, 'quantity', e.target.value)} />
                  <Input className="w-16 h-9 text-sm" placeholder="unit" value={i.unit} onChange={e => setItem(idx, 'unit', e.target.value)} />
                  <button onClick={() => removeItem(idx)} className="p-1.5 rounded hover:bg-red-50 text-red-500 shrink-0"><X className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm">Message (optional)</Label>
            <Textarea rows={2} value={message} onChange={e => setMessage(e.target.value)} placeholder="e.g. Please deliver Thursday morning before 10am." />
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={copyText}><Copy className="h-4 w-4 mr-1.5" /> Copy as text</Button>
          <Button onClick={send} disabled={sending || sent} className={sent ? 'bg-emerald-600 hover:bg-emerald-600 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}>
            {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : sent ? <Check className="h-4 w-4 mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
            {sent ? 'Sent!' : 'Send Order Email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
