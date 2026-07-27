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
import { Truck, Plus, Pencil, Trash2, Loader2, Check, X, AlertTriangle, PackageX, RefreshCw, Copy, ShieldCheck, Send, Mail, Phone, StickyNote, Store } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'
import { MarketplaceView } from '@/components/shelfwise/kitchen-ordering'

// `fetch` inside this file transparently uses `apiFetch` (auth token attached).
const fetch = apiFetch

const EMPTY_SUPPLIER = { name: '', email: '', phone: '', notes: '' }

export function OrdersView() {
  // Aug 2026: the legacy "Low Stock & Email Orders" section was removed at the
  // user's request — in-app supplier ordering (MarketplaceView) is the only
  // ordering flow now. Legacy dialogs below are kept for reference but unused.
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Suppliers & Orders</h2>
        <p className="text-muted-foreground mt-1">Connect to your suppliers and order in-app — orders land in their queue instantly</p>
      </div>
      <MarketplaceView />
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
