'use client'

/* eslint-disable no-unused-vars */
// Extracted from the former monolithic app/page.js (refactor: June 2025).
// Uniform import header — unused imports are tolerated intentionally.

import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react'
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
import { Boxes, AlertTriangle, Clock, PackageX, Plus, Search, Download, ArrowUpDown, Pencil, Trash2, LayoutDashboard, Package, Sparkles, ChefHat, ScanLine, Upload, Loader2, Check, X, BookOpen, AlertCircle, ShieldAlert, ShieldCheck, Settings, ArrowRight, Copy, RefreshCw, LogOut, Printer, BarChart3, Bell, BellOff, Calendar as CalendarIcon, Sun, Moon, Monitor, Thermometer, Droplets, Truck, ClipboardCheck, FileText, Globe } from 'lucide-react'
import { apiFetch, signOutAll, getChefToken } from '@/lib/apiClient'
import InstallAppPrompt from '@/components/InstallAppPrompt'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useT } from '@/lib/i18n'
import { STATUS_META, EMPTY_FORM, ALLERGENS, CURRENCY_SYMBOL, guessShelfLifeDays, dateInDays, suggestExpiryDate, escapeText } from '@/components/shelfwise/shared'

// `fetch` inside this file transparently uses `apiFetch` (auth token attached).
const fetch = apiFetch

export function InventoryView({ products, loading, statusFilter, setStatusFilter, search, setSearch, sort, setSort, categoryFilter, setCategoryFilter, storageFilter, setStorageFilter, facets, openAdd, openScan, openSnap, openBarcode, openVoice, printLogbook, openEdit, deleteProduct, disposeProduct, openDispose, exportCSV, formatDate }) {
  const activeFilters = [statusFilter !== 'All', categoryFilter !== 'All', storageFilter !== 'All', !!search].filter(Boolean).length

  // -------- BULK SELECT + DELETE --------
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false)  // styled confirm dialog (no native prompts)
  // Clear stale selections when the underlying list changes (filters, refreshes)
  useEffect(() => {
    setSelectedIds(prev => {
      const validIds = new Set(products.map(p => p.id))
      const next = new Set()
      prev.forEach(id => { if (validIds.has(id)) next.add(id) })
      return next
    })
  }, [products])

  const toggleOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const allSelected = products.length > 0 && products.every(p => selectedIds.has(p.id))
  const someSelected = selectedIds.size > 0 && !allSelected
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(products.map(p => p.id)))
  }

  // Actual delete once user confirms in the styled dialog
  const confirmBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) { setConfirmBulkOpen(false); return }
    setBulkDeleting(true)
    let ok = 0, fail = 0
    for (const id of ids) {
      try {
        const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
        if (res.ok) ok++; else fail++
      } catch (_) { fail++ }
    }
    setBulkDeleting(false)
    setConfirmBulkOpen(false)
    setSelectedIds(new Set())
    if (fail === 0) toast.success(`Deleted ${ok} item${ok !== 1 ? 's' : ''} ✅`)
    else if (ok > 0) toast.warning(`Deleted ${ok}, failed ${fail}`)
    else toast.error('Delete failed — please try again')
    try { window.dispatchEvent(new Event('shelfwise-inventory-refresh')) } catch (_) {}
  }

  const bulkDelete = () => setConfirmBulkOpen(true)
  // Preview names of items being deleted (first 6)
  const previewSelected = products.filter(p => selectedIds.has(p.id)).slice(0, 6)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground mt-1">Showing {products.length} item{products.length !== 1 ? 's' : ''}{statusFilter !== 'All' ? ` · filtered by ${STATUS_META[statusFilter]?.label || statusFilter}` : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Bulk delete button — only shows when something is selected */}
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              onClick={bulkDelete}
              disabled={bulkDeleting}
              className="bg-red-600 hover:bg-red-700 font-semibold"
              title="Delete all selected items"
            >
              {bulkDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete {selectedIds.size} selected
            </Button>
          )}
          {/* Voice / Snap Label / Add Product buttons removed —
              all adding happens via the dashboard "Add Products" tile (user request) */}
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
          {printLogbook && <Button variant="outline" onClick={openScan} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"><ScanLine className="h-4 w-4 mr-2" /> Scan Logbook</Button>}
          {printLogbook && <Button variant="outline" onClick={printLogbook} className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100">📒 Print Logbook</Button>}
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
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleAll}
                      className="h-4 w-4 accent-emerald-600 cursor-pointer"
                      title={allSelected ? 'Deselect all' : 'Select all'}
                    />
                  </TableHead>
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
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : products.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-12 text-muted-foreground">No products match your filters.</TableCell></TableRow>
                ) : products.map(p => (
                  <TableRow key={p.id} className={`hover:bg-slate-50/60 ${selectedIds.has(p.id) ? 'bg-emerald-50/60' : ''}`}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        className="h-4 w-4 accent-emerald-600 cursor-pointer"
                        title="Select for bulk delete"
                      />
                    </TableCell>
                    <TableCell>
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" className="h-10 w-10 rounded-md object-cover border" />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-slate-100 border flex items-center justify-center text-slate-300">
                          <Package className="h-4 w-4" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>{p.name}</div>
                      {Array.isArray(p.allergens) && p.allergens.length > 0 && (
                        <div className="flex gap-0.5 flex-wrap mt-0.5">
                          {p.allergens.slice(0, 5).map(a => {
                            const meta = ALLERGENS.find(x => x.id === a)
                            return meta ? (
                              <span key={a} title={meta.label} className="text-[10px]">{meta.emoji}</span>
                            ) : null
                          })}
                          {p.allergens.length > 5 && <span className="text-[9px] text-red-600 font-bold">+{p.allergens.length - 5}</span>}
                        </div>
                      )}
                      {p.reorderPoint != null && Number(p.quantity) <= Number(p.reorderPoint) && (
                        <span className="inline-block mt-0.5 text-[9px] font-bold text-orange-700 bg-orange-100 rounded px-1">⚠ REORDER</span>
                      )}
                      {p.addedBy && (
                        <div className="text-[10px] text-slate-400 mt-0.5">👤 Added by <span className="capitalize font-medium text-slate-500">{p.addedBy}</span></div>
                      )}
                    </TableCell>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => openDispose(p)}
                          title="Dispose / Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Styled bulk-delete / bulk-dispose confirmation dialog */}
      <Dialog open={confirmBulkOpen} onOpenChange={setConfirmBulkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Remove {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''}?
            </DialogTitle>
            <p className="text-sm text-slate-600 mt-1">Tell us why — this helps you track waste over time.</p>
          </DialogHeader>
          <div className="py-1 space-y-2">
            {/* Preview list */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 max-h-[120px] overflow-y-auto">
              <ul className="divide-y">
                {previewSelected.map(p => (
                  <li key={p.id} className="px-3 py-1.5 text-xs">
                    <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">{p.quantity} {p.unit}{p.expiryDate ? ` · exp ${p.expiryDate}` : ''}</div>
                  </li>
                ))}
                {selectedIds.size > previewSelected.length && (
                  <li className="px-3 py-1.5 text-[11px] text-slate-500 italic">…and {selectedIds.size - previewSelected.length} more</li>
                )}
              </ul>
            </div>

            {/* Reason picker — same choices as single-item dispose */}
            <div className="space-y-1.5 pt-1">
              {[
                { key: 'used_up',  emoji: '✅', label: 'Used up (consumed normally)', hint: 'Not counted as waste' },
                { key: 'expired',  emoji: '⏰', label: 'Expired',                     hint: null },
                { key: 'spoiled',  emoji: '🤢', label: 'Spoiled / gone off',          hint: null },
                { key: 'damaged',  emoji: '💥', label: 'Damaged / dropped',           hint: null },
                { key: 'overstock',emoji: '📦', label: 'Overstock / not needed',      hint: null },
                { key: 'other',    emoji: '❓', label: 'Other',                       hint: null },
              ].map(r => (
                <button
                  key={r.key}
                  type="button"
                  disabled={bulkDeleting}
                  onClick={async () => {
                    if (bulkDeleting) return
                    setBulkDeleting(true)
                    let ok = 0, fail = 0
                    for (const id of Array.from(selectedIds)) {
                      const prod = products.find(p => p.id === id)
                      if (!prod) continue
                      try {
                        // 'used_up' skips waste log; other reasons post to /api/waste before delete
                        await disposeProduct(prod, { reason: r.key })
                        ok++
                      } catch (_) { fail++ }
                    }
                    setBulkDeleting(false)
                    setConfirmBulkOpen(false)
                    setSelectedIds(new Set())
                    if (fail === 0) toast.success(`${r.key === 'used_up' ? 'Marked' : 'Disposed'} ${ok} item${ok !== 1 ? 's' : ''} · ${r.label}`)
                    else toast.warning(`${ok} done, ${fail} failed`)
                    try { window.dispatchEvent(new Event('shelfwise-inventory-refresh')) } catch (_) {}
                  }}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border-2 transition ${r.key === 'used_up' ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100' : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50'} disabled:opacity-50`}
                >
                  <span className="text-xl leading-none">{r.emoji}</span>
                  <span className="flex-1 min-w-0">
                    <span className={`font-semibold text-sm ${r.key === 'used_up' ? 'text-emerald-800' : 'text-slate-800'}`}>{r.label}</span>
                    {r.hint && <span className="ml-2 text-[10px] text-slate-500 italic">{r.hint}</span>}
                  </span>
                </button>
              ))}
            </div>

            {/* Hard-delete option — no waste tracking, permanent */}
            <div className="pt-2 border-t">
              <p className="text-[11px] text-slate-500 mb-1.5">Or just remove without tracking:</p>
              <Button
                onClick={confirmBulkDelete}
                disabled={bulkDeleting}
                variant="outline"
                className="w-full border-red-300 text-red-700 hover:bg-red-50"
              >
                {bulkDeleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Working…</> : <><Trash2 className="h-4 w-4 mr-2" /> Delete {selectedIds.size} · no waste log</>}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmBulkOpen(false)} disabled={bulkDeleting} className="w-full">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function DisposeProductDialog({ product, onClose, onConfirm }) {
  const [reason, setReason] = useState('expired')
  const [unitCost, setUnitCost] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (product) {
      // Smart-default: if expired, pre-select expired. If low qty, "used_up". Otherwise "expired".
      const status = product._status
      if (status === 'Expired') setReason('expired')
      else if (status === 'Critical') setReason('used_up')
      else setReason('expired')
      setUnitCost('')
      setNotes('')
    }
  }, [product?.id])

  if (!product) return null
  const REASONS = [
    { id: 'used_up',   label: 'Used up (consumed normally)', emoji: '✅', color: 'bg-emerald-50 border-emerald-300 text-emerald-800', note: 'Not counted as waste' },
    { id: 'expired',   label: 'Expired',                      emoji: '⏰', color: 'bg-red-50 border-red-300 text-red-800' },
    { id: 'spoiled',   label: 'Spoiled / gone off',           emoji: '🤢', color: 'bg-amber-50 border-amber-300 text-amber-800' },
    { id: 'damaged',   label: 'Damaged / dropped',            emoji: '💥', color: 'bg-orange-50 border-orange-300 text-orange-800' },
    { id: 'overstock', label: 'Overstock / not needed',       emoji: '📦', color: 'bg-slate-50 border-slate-300 text-slate-800' },
    { id: 'other',     label: 'Other',                        emoji: '❓', color: 'bg-slate-50 border-slate-300 text-slate-800' },
  ]

  const isWaste = reason !== 'used_up'

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await onConfirm({
        reason,
        unitCost: isWaste ? unitCost : '',
        notes,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!product} onOpenChange={(v) => { if (!v && !busy) onClose() }}>
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Remove &quot;{product.name}&quot;</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Tell us why — this helps you track waste over time.
          </p>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-1 gap-2">
            {REASONS.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setReason(r.id)}
                className={`text-left rounded-lg border-2 px-3 py-2.5 transition ${reason === r.id ? r.color + ' shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{r.emoji}</span>
                  <span className="font-medium text-sm">{r.label}</span>
                  {r.note && <span className="ml-auto text-[10px] text-muted-foreground italic">{r.note}</span>}
                </div>
              </button>
            ))}
          </div>

          {isWaste && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="col-span-2">
                <Label className="text-xs">Cost per {product.unit || 'unit'} <span className="text-muted-foreground">(optional, for cost tracking)</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 2.50"
                  value={unitCost}
                  onChange={e => setUnitCost(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Notes <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  placeholder="e.g. Left out overnight"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground pt-1">
            {isWaste
              ? `This will log ${product.quantity} ${product.unit || 'unit'}${product.quantity !== 1 ? 's' : ''} to your waste analytics${unitCost ? ` (estimated cost: ${(Number(unitCost) * Number(product.quantity || 0)).toFixed(2)})` : ''}.`
              : 'This will simply remove the item — no waste logged.'}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy} className={isWaste ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            {isWaste ? 'Dispose & Log' : 'Mark Used Up'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Rota View — weekly staff scheduling grid.
// Chef names are free-text; store a row per (date, slot).
// ============================================================================
