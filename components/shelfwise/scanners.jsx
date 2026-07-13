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

export function ReceiptScanDialog({ open, onClose, onImport, settings }) {
  const [image, setImage] = useState(null)   // data URL
  const [rotation, setRotation] = useState(0) // 0, 90, 180, 270 — user-controlled
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState(null) // { supplier, items, ... }
  const [rows, setRows] = useState([])       // editable table
  const fileRef = useRef(null)       // camera-capture input (mobile opens camera directly)
  const galleryRef = useRef(null)    // gallery-picker input (opens Photos / Files)

  const reset = () => { setImage(null); setRotation(0); setResult(null); setRows([]); setParsing(false) }

  useEffect(() => { if (!open) reset() }, [open])

  const onFile = async (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setImage(String(reader.result)); setRotation(0) }
    reader.readAsDataURL(file)
  }

  // Apply the current rotation to the image via <canvas> before sending.
  // Vision models are much more accurate on upright text.
  const applyRotation = async (dataUrl, deg) => {
    if (!deg) return dataUrl
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const isSide = deg === 90 || deg === 270
          canvas.width  = isSide ? img.height : img.width
          canvas.height = isSide ? img.width  : img.height
          const ctx = canvas.getContext('2d')
          ctx.translate(canvas.width / 2, canvas.height / 2)
          ctx.rotate((deg * Math.PI) / 180)
          ctx.drawImage(img, -img.width / 2, -img.height / 2)
          resolve(canvas.toDataURL('image/jpeg', 0.88))
        } catch (e) { reject(e) }
      }
      img.onerror = reject
      img.src = dataUrl
    })
  }

  const runParse = async () => {
    if (!image) return
    setParsing(true)
    try {
      const sendImage = await applyRotation(image, rotation)
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: sendImage }),
      })
      const raw = await res.text()
      let data = null
      try { data = JSON.parse(raw) } catch { /* not JSON */ }
      if (!res.ok) {
        const msg = data?.error || raw || `HTTP ${res.status}`
        console.error('scan-receipt failed:', res.status, msg)
        throw new Error(msg.slice(0, 300))
      }
      setResult(data)
      // Seed editable rows with sensible defaults
      const seeded = (data.items || []).map(it => ({
        name: it.name || '',
        quantity: Number(it.quantity) || 1,
        unit: it.unit || 'ea',
        unitCost: it.unitCost != null ? String(it.unitCost) : '',
        category: it.category || '',
        storageType: it.storageType || 'Fridge',
        expiryDate: it.expiryDate || '',
        location: '',
        allergens: [],
        _include: true,
        _expanded: false,
      }))
      setRows(seeded)
      if (seeded.length === 0) toast.warning('No items detected — try a clearer photo')
      else toast.success(`Found ${seeded.length} items — review, edit, then import`)
    } catch (e) {
      toast.error(`Parse failed: ${e.message}`, { duration: 15000 })
    } finally {
      setParsing(false)
    }
  }

  const updateRow = (i, patch) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const removeRow = (i) => setRows(rs => rs.filter((_, idx) => idx !== i))
  const addBlankRow = () => {
    setRows(rs => [...rs, {
      name: '',
      quantity: 1,
      unit: 'ea',
      unitCost: '',
      category: '',
      storageType: 'Fridge',
      expiryDate: '',
      location: '',
      allergens: [],
      _include: true,
      _expanded: true,   // open the new row immediately so user can type
    }])
    // Scroll to the new row after render
    setTimeout(() => {
      const container = document.getElementById('receipt-rows-list')
      if (container) container.scrollTop = container.scrollHeight
    }, 100)
  }

  const included = rows.filter(r => r._include && r.name.trim())
  const totalCost = included.reduce((sum, r) => sum + (Number(r.unitCost) || 0) * (Number(r.quantity) || 0), 0)
  const currencySymbol = CURRENCY_SYMBOL[settings?.currency] || settings?.currency || ''

  const doImport = () => {
    if (!included.length) { toast.error('Nothing to import'); return }
    const supplier = result?.supplier || ''
    // Map to product API shape
    const payload = included.map(r => ({
      name: r.name.trim(),
      quantity: Number(r.quantity) || 1,
      unit: r.unit || 'ea',
      unitCost: r.unitCost === '' || r.unitCost == null ? null : Number(r.unitCost),
      category: r.category || '',
      storageType: r.storageType || 'Fridge',
      location: r.location || '',
      expiryDate: r.expiryDate || '',
      allergens: Array.isArray(r.allergens) ? r.allergens : [],
      supplier,
      source: 'receipt',
    }))
    onImport(payload)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !parsing) onClose() }}>
      <DialogContent className="sm:max-w-[720px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">🧾 Supplier Invoice Scanner</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Snap a photo of a <b>supplier delivery note</b> (Bidfood, Brakes, JJ, Booker, Makro, 3663, local wholesalers) or a shop receipt →
            AI extracts every line item with prices → you review → we import.
          </p>
        </DialogHeader>

        {!image && (
          <div className="py-4 space-y-3">
            {/* Two clear options: take a fresh photo OR pick an existing image from gallery */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-emerald-300 rounded-xl p-5 text-center hover:bg-emerald-50 hover:border-emerald-500 transition"
              >
                <div className="text-4xl mb-1">📸</div>
                <p className="font-semibold text-slate-700 text-sm">Take a photo</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Snap the delivery note now</p>
              </button>
              <button
                onClick={() => galleryRef.current?.click()}
                className="border-2 border-dashed border-blue-300 rounded-xl p-5 text-center hover:bg-blue-50 hover:border-blue-500 transition"
              >
                <div className="text-4xl mb-1">🖼️</div>
                <p className="font-semibold text-slate-700 text-sm">Upload from gallery</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Photo, WhatsApp, Email PDF-screenshot</p>
              </button>
            </div>

            {/* Camera-only input — mobile opens camera directly */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }}
            />
            {/* Gallery/File input — no `capture` attribute → user picks from Photos / Files */}
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }}
            />

            <div className="mt-4 text-xs text-slate-500 space-y-1">
              <p>💡 <b>Tips for the best result:</b></p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Lay the delivery note <b>flat</b> on a table, camera directly above</li>
                <li>Hold your phone <b>upright</b> (portrait, not sideways) so text reads left→right</li>
                <li>Include the header (supplier name, invoice #, date) and all line items</li>
                <li>Good light + not blurry = fewer errors to fix</li>
                <li>If it comes out sideways, use the ↻ rotate button on the next screen</li>
                <li>Works with Bidfood, Brakes, JJ Foodservice, Booker, Makro, 3663, Costco Business, and most local wholesalers</li>
              </ul>
            </div>
          </div>
        )}

        {image && !result && (
          <div className="py-2 space-y-3">
            <div className="relative overflow-hidden rounded-lg border bg-slate-50">
              <img
                src={image}
                alt="receipt"
                className="w-full max-h-[340px] object-contain transition-transform"
                style={{ transform: `rotate(${rotation}deg)` }}
              />
              <Button size="sm" variant="outline" className="absolute top-2 right-2 bg-white" onClick={() => setImage(null)}>Retake</Button>
            </div>

            {/* Rotation controls — critical for sideways-photographed receipts */}
            <div className="flex items-center justify-between gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
              <p className="text-xs text-blue-900">
                📐 Text should read <b>left → right, top → down</b>. Rotate first if sideways.
              </p>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setRotation((rotation + 270) % 360)} title="Rotate left 90°" className="bg-white">↺ 90°</Button>
                <Button size="sm" variant="outline" onClick={() => setRotation((rotation + 90) % 360)} title="Rotate right 90°" className="bg-white">↻ 90°</Button>
                {rotation !== 0 && <span className="text-xs text-blue-700 font-medium">({rotation}°)</span>}
              </div>
            </div>

            <Button onClick={runParse} disabled={parsing} className="w-full bg-emerald-600 hover:bg-emerald-700">
              {parsing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Parsing (this can take 10-30 seconds)…</> : '✨ Extract items with AI'}
            </Button>
          </div>
        )}

        {result && (
          <div className="py-2 space-y-3">
            <div className="flex items-center gap-3 text-xs bg-slate-50 rounded-lg p-3">
              <img src={image} alt="" className="w-16 h-16 object-cover rounded border" />
              <div className="flex-1 min-w-0">
                <p><b>Supplier:</b> {result.supplier || '—'}</p>
                <p><b>Invoice total:</b> {result.totalCost != null ? `${currencySymbol}${Number(result.totalCost).toFixed(2)}` : '—'}</p>
                <p className="text-slate-500">{included.length} of {rows.length} items selected · Σ <b>{currencySymbol}{totalCost.toFixed(2)}</b></p>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setImage(null); setResult(null); setRows([]) }}>Retake</Button>
            </div>

            <p className="text-xs text-slate-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              💡 <b>Tap any item to edit</b> — fix name, price, category, storage, expiry, allergens. Untick to skip. Missing an item? Use the <b>+ Add row</b> button below.
            </p>

            {rows.length === 0 && (
              <div className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 p-4 text-center">
                <div className="text-3xl mb-2">🤔</div>
                <p className="text-sm font-semibold text-amber-900">AI couldn't detect any items</p>
                <p className="text-xs text-amber-800 mt-1">Try retaking with better light, or add items manually below.</p>
              </div>
            )}

            <div id="receipt-rows-list" className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {rows.map((r, i) => (
                <div key={i} className={`border-2 rounded-xl transition ${r._include ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                  {/* Collapsed row — tap to expand */}
                  <div className="flex items-center gap-2 p-3">
                    <input
                      type="checkbox"
                      checked={r._include}
                      onChange={e => { e.stopPropagation(); updateRow(i, { _include: e.target.checked }) }}
                      className="h-5 w-5 accent-emerald-600 shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => updateRow(i, { _expanded: !r._expanded })}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="font-semibold text-sm truncate">{r.name || '(un-named)'}</p>
                      <p className="text-[11px] text-slate-500">
                        {r.quantity} {r.unit}
                        {r.unitCost ? ` · ${currencySymbol}${Number(r.unitCost).toFixed(2)}/${r.unit}` : ''}
                        {r.category ? ` · ${r.category}` : ''}
                        {r.storageType ? ` · ${r.storageType}` : ''}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateRow(i, { _expanded: !r._expanded })}
                      className="shrink-0 text-emerald-700 font-semibold text-xs px-2 py-1 rounded hover:bg-emerald-50"
                    >
                      {r._expanded ? '▲ Done' : '✏️ Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      title="Remove"
                      className="shrink-0 text-slate-400 hover:text-red-600 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Expanded editor */}
                  {r._expanded && (
                    <div className="border-t px-3 py-3 space-y-3 bg-slate-50 rounded-b-xl">
                      <div>
                        <Label className="text-xs">Product name</Label>
                        <Input value={r.name} onChange={e => updateRow(i, { name: e.target.value })} className="h-10 text-sm bg-white" />
                      </div>
                      <div>
                        <Label className="text-xs">Quantity</Label>
                        <Input type="number" step="0.1" min="0" value={r.quantity} onChange={e => updateRow(i, { quantity: e.target.value })} className="h-10 text-sm bg-white" />
                      </div>
                      <div>
                        <Label className="text-xs">Unit</Label>
                        <select value={r.unit} onChange={e => updateRow(i, { unit: e.target.value })} className="h-10 text-sm border rounded-md w-full bg-white px-2">
                          {['ea', 'kg', 'g', 'L', 'mL', 'pack', 'box', 'bunch'].map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">Cost per unit {currencySymbol && `(${currencySymbol})`}</Label>
                        <Input type="number" step="0.01" min="0" value={r.unitCost} onChange={e => updateRow(i, { unitCost: e.target.value })} className="h-10 text-sm bg-white" placeholder="—" />
                      </div>
                      <div>
                        <Label className="text-xs">Storage</Label>
                        <select value={r.storageType} onChange={e => updateRow(i, { storageType: e.target.value })} className="h-10 text-sm border rounded-md w-full bg-white px-2">
                          {['Fridge', 'Freezer', 'Dry', 'Ambient'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">Category</Label>
                        <Input value={r.category} onChange={e => updateRow(i, { category: e.target.value })} className="h-10 text-sm bg-white" placeholder="e.g. Dairy" />
                      </div>
                      <div>
                        <Label className="text-xs">Expiry date</Label>
                        <Input type="date" value={r.expiryDate} onChange={e => updateRow(i, { expiryDate: e.target.value })} className="h-10 text-sm bg-white" />
                      </div>
                      <div>
                        <Label className="text-xs">Shelf / Location</Label>
                        <Input value={r.location} onChange={e => updateRow(i, { location: e.target.value })} className="h-10 text-sm bg-white" placeholder="e.g. Shelf A2" />
                      </div>
                      <div>
                        <Label className="text-xs">Allergens ({r.allergens?.length || 0})</Label>
                        <div className="grid grid-cols-2 gap-1 mt-1">
                          {ALLERGENS.map(a => {
                            const active = r.allergens?.includes(a.id)
                            return (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => updateRow(i, {
                                  allergens: active
                                    ? (r.allergens || []).filter(x => x !== a.id)
                                    : [...(r.allergens || []), a.id]
                                })}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] text-left transition ${
                                  active ? 'border-red-300 bg-red-50 text-red-800 font-semibold' : 'border-slate-200 bg-white text-slate-600'
                                }`}
                              >
                                <span>{a.emoji}</span><span className="truncate">{a.label.split(' (')[0]}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {rows.length === 0 && (
                <p className="p-6 text-center text-slate-500 text-sm">No items to import — tap <b>+ Add row</b> below to type items manually.</p>
              )}
            </div>

            {/* Manual "add row" button — Level-4 safety net for anything the AI missed */}
            <Button
              type="button"
              variant="outline"
              onClick={addBlankRow}
              className="w-full border-dashed border-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 py-6"
            >
              <Plus className="h-4 w-4 mr-2" /> Add row manually (for items AI missed)
            </Button>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={parsing}>Cancel</Button>
          {result && (
            <Button onClick={doImport} disabled={!included.length || parsing} className="bg-emerald-600 hover:bg-emerald-700">
              <Check className="h-4 w-4 mr-2" /> Import {included.length} items
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ExpiryScanDialog({ open, onClose, onDateFound }) {
  const videoRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const streamRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setError('')
    setBusy(false)
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
      } catch (e) {
        if (!cancelled) setError('Camera blocked. Allow camera permission and try again.')
      }
    })()
    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [open])

  const captureAndScan = async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) {
      toast.error('Camera not ready yet — wait a moment.')
      return
    }
    setBusy(true)
    try {
      // Capture current frame to a canvas
      const maxDim = 1400
      let w = video.videoWidth
      let h = video.videoHeight
      if (w > maxDim || h > maxDim) {
        const scale = Math.min(maxDim / w, maxDim / h)
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      // Send to AI for date extraction
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      const item = (data.items || []).find(it => it.expiryDate) || (data.items || [])[0]
      if (item?.expiryDate) {
        try { navigator.vibrate?.(60) } catch {}
        onDateFound(item.expiryDate)
      } else {
        toast.warning('Date not detected — try a clearer angle or type manually.')
      }
    } catch (e) {
      toast.error('Could not read date. Try again or type manually.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📅 Scan Expiry Date
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Point camera at the printed expiry date and tap the green button to capture.</p>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <div className="rounded-xl overflow-hidden bg-black relative w-full" style={{ aspectRatio: '4/3', minHeight: '280px' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-contain"
            />
            {!error && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                <div className="w-[80%] h-[30%] border-[3px] border-amber-400 rounded-lg shadow-lg flex items-center justify-center">
                  <span className="text-amber-300 text-xs font-bold bg-black/50 px-2 py-0.5 rounded">EXPIRY DATE</span>
                </div>
              </div>
            )}
            {busy && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-sm font-medium gap-2 z-20">
                <Loader2 className="h-5 w-5 animate-spin" /> AI reading date...
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{error}</p>
          )}

          <Button
            type="button"
            onClick={captureAndScan}
            disabled={busy || !!error}
            className="w-full h-14 text-base bg-emerald-600 hover:bg-emerald-700 font-bold shadow-lg"
          >
            {busy ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Reading...</> : <>📸 Capture Date</>}
          </Button>

          <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-900">
            <p className="font-semibold mb-1">💡 Tips:</p>
            <ul className="list-disc pl-4 space-y-0.5 text-blue-800">
              <li>Point at the <strong>printed expiry date</strong> (BB / EXP / Use By)</li>
              <li>Hold steady, good lighting helps</li>
              <li>Single tap to capture — no &quot;Use Photo&quot; step!</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BarcodeScanDialog({ open, onClose, onFound, loading, onManual }) {
  const [manualCode, setManualCode] = useState('')
  const [scannerError, setScannerError] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const [scanning, setScanning] = useState(false)
  const scannerRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setManualCode('')
    setScannerError('')
    setShowManual(false)
    setTorchOn(false)
    setHasTorch(false)
    setScanning(false)
    let scanner
    let cancelled = false
    ;(async () => {
      try {
        const mod = await import('html5-qrcode')
        if (cancelled) return
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = mod
        const elId = 'barcode-reader-region'
        scanner = new Html5Qrcode(elId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
          ],
          verbose: false,
        })
        scannerRef.current = scanner
        // Use full video frame for scanning (no qrbox restriction)
        // My custom green box (above) serves as the visual aim indicator.
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            aspectRatio: 1.333,
            videoConstraints: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          (decoded) => {
            if (cancelled) return
            try { navigator.vibrate?.(60) } catch {}
            onFound(decoded)
          },
          () => {}
        )
        setScanning(true)
        // Detect torch support
        try {
          const stream = scanner.getRunningTrackCameraCapabilities?.()
          if (stream && typeof stream.torchFeature === 'function') {
            const f = stream.torchFeature()
            if (f?.isSupported && f.isSupported()) setHasTorch(true)
          }
        } catch {}
      } catch (e) {
        if (cancelled) return
        setScannerError('Camera access blocked or unavailable. Tap "Allow" when your phone asks, or enter the barcode manually below.')
        setShowManual(true)
      }
    })()
    return () => {
      cancelled = true
      const s = scannerRef.current
      if (s) {
        try { s.stop().then(() => s.clear()).catch(() => {}) } catch {}
        scannerRef.current = null
      }
    }
  }, [open])

  const toggleTorch = async () => {
    try {
      const s = scannerRef.current
      if (!s) return
      const caps = s.getRunningTrackCameraCapabilities?.()
      if (caps?.torchFeature) {
        await caps.torchFeature().apply(!torchOn)
        setTorchOn(!torchOn)
      }
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-emerald-600" /> Scan Barcode
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Hold steady, center the barcode in the green box. Works best with good lighting.</p>
        </DialogHeader>

        <div className="py-2 space-y-3">
          {!showManual && (
            <div
              className="rounded-xl overflow-hidden bg-black relative w-full"
              style={{ aspectRatio: '4/3', minHeight: '280px' }}
            >
              <div id="barcode-reader-region" />
              {!scannerError && !loading && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                  <div className="w-[80%] h-[40%] border-[3px] border-emerald-400 rounded-lg shadow-lg"></div>
                </div>
              )}
              {hasTorch && scanning && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`absolute bottom-3 right-3 h-10 w-10 rounded-full flex items-center justify-center text-xl shadow-lg transition ${torchOn ? 'bg-amber-400 text-white' : 'bg-white/90 text-slate-800'}`}
                  aria-label="Toggle torch"
                >
                  💡
                </button>
              )}
              {loading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-sm font-medium gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Looking up product...
                </div>
              )}
            </div>
          )}

          {scannerError && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{scannerError}</p>
          )}

          <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-900">
            <p className="font-semibold mb-1">📷 Tips for better scanning:</p>
            <ul className="list-disc pl-4 space-y-0.5 text-blue-800">
              <li>Hold phone <strong>10-15 cm</strong> away from barcode</li>
              <li>Make sure barcode is <strong>flat & well-lit</strong></li>
              <li>Tap 💡 torch button (above) in dim lighting</li>
              <li>If it fails after 5 sec → type the digits manually below</li>
            </ul>
          </div>

          <div className="space-y-2">
            <button type="button" className="text-xs text-emerald-700 underline" onClick={() => setShowManual(!showManual)}>
              {showManual ? '← Use camera instead' : '⌨️ Type barcode digits manually'}
            </button>
            {showManual && (
              <form onSubmit={(e) => { e.preventDefault(); if (manualCode.trim()) onManual(manualCode.trim()) }} className="flex gap-2">
                <Input value={manualCode} onChange={e => setManualCode(e.target.value.replace(/[^\d]/g, ''))} placeholder="Enter barcode digits (e.g. 5012345678900)" autoFocus inputMode="numeric" />
                <Button type="submit" disabled={!manualCode.trim() || loading} className="bg-emerald-600 hover:bg-emerald-700">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look up'}
                </Button>
              </form>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground text-center">💡 Powered by 5 barcode databases + AI Vision fallback — works on almost any product</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


// ============================================================================
// LensCameraView — Google-Lens-style live camera for "Snap Label".
// • Live viewfinder with corner brackets + scanning line
// • AUTO-CAPTURE: samples small grayscale frames ~4×/sec; once the scene is
//   steady (phone held still on the label) for ~1 second it captures
//   automatically — no button press needed. Manual shutter also available.
// • Shows the frozen frame + "AI reading…" overlay while busy.
// • Parent controls the flow: onCapture(dataUrl) fires with a JPEG data URL.
//   Setting frozenImage (parent state) freezes the view; clearing it re-arms
//   the auto-capture for another attempt.
// ============================================================================
export function LensCameraView({ active, busy, frozenImage, onCapture, onGalleryFile, onManual }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('Starting camera…')
  const [aspect, setAspect] = useState(3 / 4) // portrait default; updated from real stream
  const [flash, setFlash] = useState(false)

  // --- motion-stability auto capture refs ---
  const prevFrameRef = useRef(null)
  const stableCountRef = useRef(0)
  const warmupRef = useRef(0)
  const firedRef = useRef(false)

  // Start / stop camera with dialog lifecycle
  useEffect(() => {
    if (!active) return
    setError(''); setReady(false); setStatus('Starting camera…')
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          v.onloadedmetadata = () => {
            if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight)
            setReady(true)
          }
          await v.play().catch(() => {})
        }
      } catch (e) {
        if (!cancelled) setError('Camera blocked. Allow camera permission, or upload from gallery below.')
      }
    })()
    return () => {
      cancelled = true
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    }
  }, [active])

  const doCapture = useCallback((auto) => {
    const video = videoRef.current
    if (!video || !video.videoWidth || firedRef.current) return
    firedRef.current = true
    try { navigator.vibrate?.(auto ? [30, 40, 30] : 40) } catch {}
    setFlash(true); setTimeout(() => setFlash(false), 250)
    // Full-quality frame → JPEG data URL
    const maxDim = 1400
    let w = video.videoWidth, h = video.videoHeight
    if (w > maxDim || h > maxDim) {
      const s = Math.min(maxDim / w, maxDim / h)
      w = Math.round(w * s); h = Math.round(h * s)
    }
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d').drawImage(video, 0, 0, w, h)
    onCapture(canvas.toDataURL('image/jpeg', 0.85))
  }, [onCapture])

  // Auto-capture sampler — runs only while live (no frozen image, not busy)
  useEffect(() => {
    if (!active || busy || frozenImage || error) return
    // (re)arm for a fresh attempt
    firedRef.current = false
    prevFrameRef.current = null
    stableCountRef.current = 0
    warmupRef.current = 0
    setStatus('Point at the label…')
    const SAMPLE_W = 48, SAMPLE_H = 36
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_W; canvas.height = SAMPLE_H
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const timer = setInterval(() => {
      const video = videoRef.current
      if (!video || !video.videoWidth || firedRef.current) return
      warmupRef.current += 1
      ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H)
      const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H)
      // grayscale
      const gray = new Uint8Array(SAMPLE_W * SAMPLE_H)
      let lum = 0
      for (let i = 0; i < gray.length; i++) {
        const g = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) | 0
        gray[i] = g; lum += g
      }
      lum /= gray.length
      const prev = prevFrameRef.current
      prevFrameRef.current = gray
      if (warmupRef.current < 4 || !prev) { setStatus('Point at the label…'); return }
      if (lum < 18) { stableCountRef.current = 0; setStatus('Too dark — uncover the camera'); return }
      let diff = 0
      for (let i = 0; i < gray.length; i++) diff += Math.abs(gray[i] - prev[i])
      diff /= gray.length
      if (diff < 7) {
        stableCountRef.current += 1
        setStatus(stableCountRef.current >= 2 ? '📸 Capturing…' : 'Hold steady…')
        if (stableCountRef.current >= 3) doCapture(true)
      } else {
        stableCountRef.current = 0
        setStatus('Hold steady over the label…')
      }
    }, 280)
    return () => clearInterval(timer)
  }, [active, busy, frozenImage, error, doCapture])

  return (
    <div className="space-y-3">
      <div
        className="rounded-2xl overflow-hidden bg-black relative w-full"
        style={{ aspectRatio: aspect > 1 ? '4/3' : '3/4', maxHeight: '55vh' }}
      >
        {/* Live video (kept mounted; hidden behind frozen frame when captured) */}
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-contain" />
        {frozenImage && (
          <img src={frozenImage} alt="captured" className="absolute inset-0 w-full h-full object-contain bg-black" />
        )}
        {/* Capture flash */}
        {flash && <div className="absolute inset-0 bg-white/80 z-30 animate-pulse" />}

        {!error && !frozenImage && (
          <>
            {/* Lens-style corner brackets */}
            <div className="absolute inset-0 pointer-events-none z-10 p-6">
              <div className="relative w-full h-full">
                <span className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-white rounded-tl-xl" />
                <span className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-white rounded-tr-xl" />
                <span className="absolute left-0 bottom-0 h-8 w-8 border-l-4 border-b-4 border-white rounded-bl-xl" />
                <span className="absolute right-0 bottom-0 h-8 w-8 border-r-4 border-b-4 border-white rounded-br-xl" />
                {/* animated scan line */}
                {ready && <span className="absolute left-2 right-2 top-1/2 h-0.5 bg-emerald-400/80 shadow-[0_0_12px_2px_rgba(52,211,153,0.7)] animate-pulse" />}
              </div>
            </div>
            {/* Status pill */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
              <span className="text-[11px] font-semibold text-white bg-black/60 backdrop-blur px-3 py-1 rounded-full">
                {ready ? status : 'Starting camera…'}
              </span>
            </div>
            {/* AUTO badge */}
            <div className="absolute top-3 right-3 z-20">
              <span className="text-[10px] font-bold text-emerald-300 bg-black/60 px-2 py-0.5 rounded-full">✨ AUTO</span>
            </div>
            {/* Shutter button (manual fallback, Lens-style) */}
            <div className="absolute bottom-4 left-0 right-0 z-20 flex items-center justify-center">
              <button
                type="button"
                onClick={() => doCapture(false)}
                disabled={!ready}
                className="h-16 w-16 rounded-full bg-white/25 backdrop-blur border-4 border-white flex items-center justify-center active:scale-90 transition disabled:opacity-40"
                title="Capture now"
              >
                <span className="h-11 w-11 rounded-full bg-white" />
              </button>
            </div>
          </>
        )}

        {busy && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white text-sm font-medium gap-2 z-20">
            <Loader2 className="h-6 w-6 animate-spin" /> AI reading label…
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{error}</p>
      )}

      <div className="flex items-center justify-center gap-2">
        <label className="inline-flex">
          <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onGalleryFile(f); e.target.value = '' }} />
          <span className="px-3 py-2 text-xs font-semibold border rounded-lg cursor-pointer hover:bg-slate-50 flex items-center gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Upload from gallery
          </span>
        </label>
        {onManual && (
          <button type="button" onClick={onManual} className="px-3 py-2 text-xs font-semibold border rounded-lg hover:bg-slate-50 flex items-center gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Fill manually
          </button>
        )}
      </div>
      <p className="text-[11px] text-center text-muted-foreground">✨ Hold the camera still over the label — it captures automatically, like Google Lens.</p>
    </div>
  )
}
