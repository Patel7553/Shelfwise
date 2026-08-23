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
import { STATUS_META, EMPTY_FORM, ALLERGENS, CURRENCY_SYMBOL, guessShelfLifeDays, dateInDays, suggestExpiryDate, escapeText, safeJson } from '@/components/shelfwise/shared'

// `fetch` inside this file transparently uses `apiFetch` (auth token attached).
const fetch = apiFetch

// ---------------------------------------------------------------------------
// ANDROID CAMERA FIX (June 2025): many Android phones (Samsung / Pixel with
// multiple lenses) open the camera ZOOMED-IN by default. If the video track
// supports zoom, force it back to 1x (clamped to the supported range) so
// iPhone and Android behave the same.
// ---------------------------------------------------------------------------
async function resetCameraZoom(stream) {
  try {
    const track = stream?.getVideoTracks?.()[0]
    if (!track || typeof track.getCapabilities !== 'function') return
    const caps = track.getCapabilities()
    if (!caps || !('zoom' in caps)) return
    const min = caps.zoom?.min ?? 1
    const max = caps.zoom?.max ?? 1
    const target = Math.min(Math.max(1, min), max)
    await track.applyConstraints({ advanced: [{ zoom: target }] })
  } catch { /* zoom not adjustable — ignore */ }
}

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
        dateReceived: new Date().toLocaleDateString('en-CA'),
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
      dateReceived: new Date().toLocaleDateString('en-CA'),
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
      dateReceived: r.dateReceived || '',
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
                        <select value={r.storageType} onChange={e => updateRow(i, { storageType: e.target.value, expiryDate: suggestExpiryDate(r.category || '', e.target.value) })} className="h-10 text-sm border rounded-md w-full bg-white px-2">
                          {['Fridge', 'Freezer', 'Dry', 'Ambient'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">Category</Label>
                        <Input value={r.category} onChange={e => updateRow(i, { category: e.target.value })} className="h-10 text-sm bg-white" placeholder="e.g. Dairy" />
                      </div>
                      <div>
                        <Label className="text-xs">📅 Date received</Label>
                        <Input type="date" value={r.dateReceived || ''} onChange={e => updateRow(i, { dateReceived: e.target.value })} className="h-10 text-sm bg-white" />
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
        await resetCameraZoom(stream)   // Android: undo default zoom-in
        // Some Androids only expose zoom AFTER playback starts — retry.
        setTimeout(() => { if (!cancelled) resetCameraZoom(stream) }, 800)
        setTimeout(() => { if (!cancelled) resetCameraZoom(stream) }, 2000)
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
      const data = await safeJson(res)
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      const item = (data.items || []).find(it => it.expiryDate) || (data.items || [])[0]
      if (item?.expiryDate) {
        try { navigator.vibrate?.(60) } catch {}
        onDateFound(item.expiryDate)
      } else {
        // No printed date readable → default to TODAY (user request)
        try { navigator.vibrate?.(60) } catch {}
        onDateFound(new Date().toISOString().slice(0, 10))
        toast.info('No printed date found — set to today. Change it if needed.')
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
        // Android: undo the default zoomed-in camera (multi-lens phones).
        // Retry a few times — the video track appears asynchronously.
        const fixBarcodeZoom = () => {
          try {
            const vid = document.getElementById('barcode-reader-region')?.querySelector('video')
            if (vid?.srcObject) resetCameraZoom(vid.srcObject)
          } catch {}
        }
        fixBarcodeZoom()
        setTimeout(fixBarcodeZoom, 700)
        setTimeout(fixBarcodeZoom, 2000)
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
        await resetCameraZoom(stream)   // Android: undo default zoom-in
        // Some Androids only expose zoom AFTER playback starts — retry.
        setTimeout(() => { if (!cancelled) resetCameraZoom(stream) }, 800)
        setTimeout(() => { if (!cancelled) resetCameraZoom(stream) }, 2000)
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
    // Full-quality frame → JPEG data URL (1800px keeps tiny printed dates readable for the AI)
    const maxDim = 1800
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

// ===========================================================================
// BARCODE FLOW (Aug 2026 rebuild) — continuous auto-scan for Add / Use stock.
//  • Camera constantly watches; fires the instant a barcode is in frame
//  • Known barcode  -> confirm quantity only (memory is permanent per kitchen)
//  • First-time     -> Open Food Facts ONLY (no other databases, no key), else
//                      a quick one-time name form. NEVER a "not found" error.
//  • Use mode       -> matches inventory, confirm quantity, tap Use;
//                      no match -> friendly "Not currently in stock" + Add
//  • Skip is always available — missed items reconcile via normal recounts
// ===========================================================================
const BF_UNITS = ['ea', 'kg', 'g', 'L', 'mL', 'pack', 'box', 'bunch']
export function BarcodeFlowDialog({ open, initialMode = 'add', onClose, onDone }) {
  const [mode, setMode] = useState(initialMode)              // 'add' | 'use'
  const [phase, setPhase] = useState('scan')                 // scan|lookup|confirm|create|use|notstock
  const [code, setCode] = useState('')
  const [prefill, setPrefill] = useState(null)               // {name, unit, category, storageType, known}
  const [useTarget, setUseTarget] = useState(null)           // product being deducted
  const [qty, setQty] = useState('1')
  const [expiry, setExpiry] = useState('')
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [torchOn, setTorchOn] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [manualCode, setManualCode] = useState('')

  const scannerRef = useRef(null)
  const modeRef = useRef(initialMode)
  const mapRef = useRef({})
  const productsRef = useRef([])
  const audioCtxRef = useRef(null)

  // Supermarket-checkout beep — instant audible confirmation of a read.
  // AudioContext is created/resumed on the user's first tap (iOS requirement).
  const unlockAudio = () => {
    try {
      const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
      if (!Ctx) return
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume().catch(() => {})
    } catch {}
  }
  const beep = () => {
    try {
      const ctx = audioCtxRef.current
      if (!ctx || ctx.state !== 'running') return
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'square'
      o.frequency.value = 1450
      g.gain.setValueAtTime(0.18, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14)
      o.connect(g); g.connect(ctx.destination)
      o.start(); o.stop(ctx.currentTime + 0.15)
    } catch {}
  }
  const detectBusyRef = useRef(false)
  const pausedRef = useRef(false)
  const phaseRef = useRef('scan')
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { phaseRef.current = phase }, [phase])

  const pauseScanner = () => {
    try { if (scannerRef.current && !pausedRef.current) { scannerRef.current.pause(true); pausedRef.current = true } } catch {}
  }
  const resumeScanner = () => {
    try { if (scannerRef.current && pausedRef.current) { scannerRef.current.resume(); pausedRef.current = false } } catch {}
  }
  const scanNext = () => {
    setPhase('scan'); phaseRef.current = 'scan'
    setPrefill(null); setUseTarget(null); setCode('')
    detectBusyRef.current = false
    resumeScanner()
  }

  // ---- detection brain ----
  // force=true lets "Add it instead" re-run the code from a non-scan phase.
  const handleDetect = async (raw, force = false) => {
    const c = String(raw || '').trim()
    if (!c || detectBusyRef.current) return
    if (!force && phaseRef.current !== 'scan') return   // ignore late decoder callbacks once we've moved on
    detectBusyRef.current = true
    phaseRef.current = 'handling'
    beep()                                     // supermarket-style instant confirmation
    try { navigator.vibrate?.(60) } catch {}
    pauseScanner()
    setCode(c)
    const remembered = mapRef.current[c]
    const prodByBarcode = productsRef.current.find(p => String(p.customFields?.barcode || '') === c)

    if (modeRef.current === 'use') {
      const target = prodByBarcode
        || (remembered ? productsRef.current.find(p => String(p.name || '').toLowerCase() === String(remembered.name || '').toLowerCase()) : null)
      if (target && Number(target.quantity) > 0) {
        setUseTarget(target); setQty('1'); setPhase('use')
      } else {
        setPrefill(remembered ? { ...remembered, known: true } : null)
        setPhase('notstock')       // friendly option to add — never an error
      }
      detectBusyRef.current = false
      return
    }

    // ---- ADD mode ----
    if (remembered || prodByBarcode) {
      const src = remembered || { name: prodByBarcode.name, unit: prodByBarcode.unit || 'ea', category: prodByBarcode.category || '', storageType: prodByBarcode.storageType || 'Fridge' }
      setPrefill({ ...src, known: true })
      setQty('1'); setExpiry('')
      setPhase('confirm')
      detectBusyRef.current = false
      return
    }
    // First time ever: Open Food Facts ONLY (free, no key) — then remember forever
    setPhase('lookup')
    let name = ''
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 4000)
      const res = await window.fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(c)}.json?fields=product_name,product_name_en,generic_name,quantity`, { signal: ctrl.signal })
      clearTimeout(t)
      if (res.ok) {
        const d = await res.json().catch(() => null)
        const p = d?.product
        name = (p?.product_name || p?.product_name_en || p?.generic_name || '').trim()
        if (name && p?.quantity && !name.toLowerCase().includes(String(p.quantity).toLowerCase())) name = `${name} ${p.quantity}`
      }
    } catch { /* offline / slow — fall through to the quick form, silently */ }
    setQty('1'); setExpiry('')
    if (name) {
      setPrefill({ name: name.slice(0, 120), unit: 'ea', category: '', storageType: 'Fridge', known: false })
      setPhase('confirm')
    } else {
      setPrefill({ name: '', unit: 'ea', category: '', storageType: 'Fridge', known: false })
      setPhase('create')           // neutral one-time form — NOT an error
    }
    detectBusyRef.current = false
  }

  // ---- save: add to inventory (+ remember the barcode permanently) ----
  const saveAdd = async () => {
    const name = String(prefill?.name || '').trim()
    if (!name) { toast.error('Give it a name first'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          quantity: Number(qty) > 0 ? Number(qty) : 1,
          unit: prefill.unit || 'ea',
          category: prefill.category || '',
          storageType: prefill.storageType || 'Fridge',
          dateReceived: new Date().toLocaleDateString('en-CA'),
          ...(expiry ? { expiryDate: expiry } : {}),
          customFields: { barcode: code },
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not add the item')
      // Remember permanently (kitchen-wide) — background, non-blocking
      fetch('/api/barcodes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name, unit: prefill.unit || 'ea', category: prefill.category || '', storageType: prefill.storageType || 'Fridge' }),
      }).catch(() => {})
      mapRef.current[code] = { name, unit: prefill.unit || 'ea', category: prefill.category || '', storageType: prefill.storageType || 'Fridge' }
      if (d?.id) productsRef.current = [...productsRef.current, d]
      toast.success(`${name} added to inventory ✓`)
      onDoneRef.current?.()
      scanNext()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  // ---- save: use / deduct stock ----
  const saveUse = async () => {
    const used = Number(qty)
    if (!Number.isFinite(used) || used <= 0) { toast.error('Enter how much was used'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/usage/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: useTarget.id, used }] }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not update stock')
      const r = (d.results || [])[0] || {}
      if (r.removed) {
        toast.success(`${useTarget.name}: all used — removed from inventory`)
        productsRef.current = productsRef.current.filter(p => p.id !== useTarget.id)
      } else {
        toast.success(`${useTarget.name}: −${used} ${useTarget.unit || ''} → ${r.to ?? '?'} left`)
        productsRef.current = productsRef.current.map(p => p.id === useTarget.id ? { ...p, quantity: r.to } : p)
      }
      onDoneRef.current?.()
      scanNext()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const addInstead = () => {
    setMode('add'); modeRef.current = 'add'
    detectBusyRef.current = false
    handleDetect(code, true)
  }

  // ---- camera lifecycle: start once per open, pause/resume between scans ----
  useEffect(() => {
    if (!open) return
    setMode(initialMode); modeRef.current = initialMode
    setPhase('scan'); phaseRef.current = 'scan'
    setPrefill(null); setUseTarget(null); setCode('')
    setScannerError(''); setShowManual(false); setManualCode('')
    setTorchOn(false); setHasTorch(false); setScanning(false)
    detectBusyRef.current = false
    pausedRef.current = false
    // preload barcode memory + current inventory (instant local matching)
    fetch('/api/barcodes').then(r => r.json()).then(m => { if (m && typeof m === 'object') mapRef.current = m }).catch(() => {})
    fetch('/api/products').then(r => r.json()).then(list => { if (Array.isArray(list)) productsRef.current = list }).catch(() => {})

    // unlock the checkout beep on the user's first tap (iOS gesture rule)
    unlockAudio()
    const onFirstTap = () => unlockAudio()
    document.addEventListener('pointerdown', onFirstTap, { passive: true })
    document.addEventListener('touchstart', onFirstTap, { passive: true })

    let cancelled = false
    let scanner
    let nativeTimer = null
    ;(async () => {
      try {
        const mod = await import('html5-qrcode')
        if (cancelled) return
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = mod
        scanner = new Html5Qrcode('bf-reader-region', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93, Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.DATA_MATRIX,
          ],
          // Native hardware decoder (Chrome/Android) — MUCH better at 1D
          // EAN/UPC grocery barcodes than the default JS decoder, and the
          // reason "boxed but never confirms" happened: the JS decoder was
          // silently failing to decode what the eye clearly sees.
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          verbose: false,
        })
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, videoConstraints: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } },
          (decoded) => { if (!cancelled) handleDetect(decoded) },
          () => {}
        )
        if (cancelled) return
        setScanning(true)
        // ---- Guaranteed completion path: a zxing-wasm decode loop runs on the
        // live video alongside html5-qrcode. iPhones/Safari have NO native
        // BarcodeDetector and their JS decoder fails on EAN-13 grocery codes —
        // the wasm ponyfill (same zxing-cpp engine as retail scanners) decodes
        // them instantly. First decoder to read a value wins → handleDetect. ----
        try {
          const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'qr_code', 'data_matrix']
          let Detector = null
          let formats = FORMATS
          if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
            try {
              const supported = (await window.BarcodeDetector.getSupportedFormats?.()) || []
              const want = FORMATS.filter(f => supported.includes(f))
              // only trust the native detector when it can actually read retail 1D codes
              if (want.includes('ean_13')) { Detector = window.BarcodeDetector; formats = want }
            } catch {}
          }
          if (!Detector) {
            // zxing-wasm ponyfill — works on iOS Safari / all browsers
            const bd = await import('barcode-detector/ponyfill')
            Detector = bd.BarcodeDetector
          }
          if (Detector && !cancelled) {
            const det = new Detector({ formats })
            // Grab each frame onto a canvas before decoding — drawImage(video)
            // is the most reliable capture path on iOS Safari.
            const grab = document.createElement('canvas')
            const gctx = grab.getContext('2d', { willReadFrequently: true })
            let detecting = false
            nativeTimer = setInterval(async () => {
              if (cancelled || detecting || detectBusyRef.current || pausedRef.current || phaseRef.current !== 'scan') return
              const vid = document.getElementById('bf-reader-region')?.querySelector('video')
              if (!vid || vid.readyState < 2 || !vid.videoWidth) return
              detecting = true
              try {
                grab.width = vid.videoWidth
                grab.height = vid.videoHeight
                gctx.drawImage(vid, 0, 0)
                const found = await det.detect(grab)
                const hit = (found || []).find(b => String(b.rawValue || '').trim())
                if (hit && !cancelled) handleDetect(hit.rawValue)
              } catch { /* frame not ready — try again next tick */ }
              detecting = false
            }, 250)
          }
        } catch { /* wasm decoder unavailable — html5-qrcode still runs */ }
        // Close-up focus + exposure for fridges / dim dry stores (best-effort)
        const tuneCamera = () => {
          try {
            const vid = document.getElementById('bf-reader-region')?.querySelector('video')
            const stream = vid?.srcObject
            if (!stream) return
            resetCameraZoom(stream)
            const track = stream.getVideoTracks?.()[0]
            const caps = track?.getCapabilities?.() || {}
            const adv = []
            if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) adv.push({ focusMode: 'continuous' })
            if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) adv.push({ exposureMode: 'continuous' })
            if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('continuous')) adv.push({ whiteBalanceMode: 'continuous' })
            if (adv.length) track.applyConstraints({ advanced: adv }).catch(() => {})
          } catch {}
        }
        tuneCamera(); setTimeout(tuneCamera, 700); setTimeout(tuneCamera, 2000)
        try {
          const caps = scanner.getRunningTrackCameraCapabilities?.()
          if (caps && typeof caps.torchFeature === 'function') {
            const f = caps.torchFeature()
            if (f?.isSupported && f.isSupported()) setHasTorch(true)
          }
        } catch {}
      } catch {
        if (!cancelled) { setScannerError('Camera unavailable — allow camera access, or type the digits below.'); setShowManual(true) }
      }
    })()
    return () => {
      cancelled = true
      document.removeEventListener('pointerdown', onFirstTap)
      document.removeEventListener('touchstart', onFirstTap)
      if (nativeTimer) { clearInterval(nativeTimer); nativeTimer = null }
      const s = scannerRef.current
      if (s) { try { s.stop().then(() => s.clear()).catch(() => {}) } catch {} ; scannerRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggleTorch = async () => {
    try {
      const caps = scannerRef.current?.getRunningTrackCameraCapabilities?.()
      if (caps?.torchFeature) { await caps.torchFeature().apply(!torchOn); setTorchOn(!torchOn) }
    } catch {}
  }

  const switchMode = (m) => {
    if (m === mode) return
    setMode(m); modeRef.current = m
    if (phase !== 'scan') scanNext()
  }

  const qtyStepper = (
    <div className="flex items-center justify-center gap-3">
      <button type="button" onClick={() => setQty(q => String(Math.max(0.5, (Number(q) || 1) - 1)))}
        className="h-11 w-11 rounded-full border-2 border-slate-300 text-slate-700 text-xl font-bold">−</button>
      <Input type="number" min="0.1" step="0.5" value={qty} onChange={e => setQty(e.target.value)}
        className="h-11 w-24 text-center text-lg font-bold" />
      <button type="button" onClick={() => setQty(q => String((Number(q) || 0) + 1))}
        className="h-11 w-11 rounded-full bg-emerald-600 text-white text-xl font-bold">+</button>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-emerald-600" /> Scan barcode
          </DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-1.5 rounded-lg border p-1 bg-slate-50">
          <button type="button" onClick={() => switchMode('add')}
            className={`rounded-md px-2 py-2 text-sm font-bold transition ${mode === 'add' ? 'bg-emerald-600 text-white shadow' : 'text-slate-500'}`}>➕ Add stock</button>
          <button type="button" onClick={() => switchMode('use')}
            className={`rounded-md px-2 py-2 text-sm font-bold transition ${mode === 'use' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500'}`}>➖ Use stock</button>
        </div>

        {/* Camera — always mounted so it stays warm between scans */}
        <div className={`rounded-xl overflow-hidden bg-black relative w-full ${phase === 'scan' ? '' : 'hidden'}`} style={{ aspectRatio: '4/3', minHeight: '260px' }}>
          <div id="bf-reader-region" />
          {!scannerError && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
              <div className={`w-[82%] h-[42%] border-[3px] rounded-lg shadow-lg ${mode === 'add' ? 'border-emerald-400' : 'border-indigo-400'}`}></div>
            </div>
          )}
          {scanning && (
            <p className="absolute top-2 left-1/2 -translate-x-1/2 z-10 text-[11px] font-semibold text-white bg-black/50 rounded-full px-3 py-1">
              👀 Watching — just show it the barcode
            </p>
          )}
          {hasTorch && scanning && (
            <button type="button" onClick={toggleTorch}
              className={`absolute bottom-3 right-3 h-10 w-10 rounded-full flex items-center justify-center text-xl shadow-lg transition z-10 ${torchOn ? 'bg-amber-400 text-white' : 'bg-white/90 text-slate-800'}`}
              aria-label="Toggle torch">💡</button>
          )}
        </div>

        {phase === 'scan' && (
          <>
            {scannerError && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{scannerError}</p>}
            <div className="flex items-center justify-between gap-2">
              <button type="button" className="text-xs text-emerald-700 underline" onClick={() => setShowManual(s => !s)}>
                {showManual ? 'Hide manual entry' : '⌨️ Type digits instead'}
              </button>
              <Button variant="outline" size="sm" onClick={onClose}>Done — close scanner</Button>
            </div>
            {showManual && (
              <div className="flex gap-2">
                <Input value={manualCode} onChange={e => setManualCode(e.target.value.replace(/[^0-9A-Za-z]/g, ''))} placeholder="Barcode digits…" inputMode="numeric" className="flex-1" />
                <Button onClick={() => { if (manualCode.trim()) handleDetect(manualCode.trim()) }} disabled={!manualCode.trim()} className="bg-emerald-600 hover:bg-emerald-700">Go</Button>
              </div>
            )}
          </>
        )}

        {phase === 'lookup' && (
          <div className="text-center py-8">
            <Loader2 className="h-7 w-7 mx-auto animate-spin text-emerald-500" />
            <p className="text-sm text-muted-foreground mt-2">First time seeing this one — checking Open Food Facts…</p>
            <Button variant="ghost" size="sm" className="mt-2 text-slate-400" onClick={scanNext}>Skip — scan next</Button>
          </div>
        )}

        {phase === 'confirm' && prefill && (
          <div className="space-y-3">
            <div className={`rounded-lg px-3 py-2 text-xs font-semibold ${prefill.known ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-sky-50 border border-sky-200 text-sky-800'}`}>
              {prefill.known ? '✅ Known item — just confirm the quantity' : '🌍 Found on Open Food Facts — confirm and it\'s remembered forever'}
            </div>
            <Input value={prefill.name} onChange={e => setPrefill(p => ({ ...p, name: e.target.value }))} className="font-semibold" />
            <div>
              <Label className="text-xs">Quantity ({prefill.unit || 'ea'})</Label>
              <div className="mt-1">{qtyStepper}</div>
            </div>
            <div>
              <Label className="text-xs">Expiry date (optional)</Label>
              <Input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={scanNext} disabled={busy}>Skip — scan next</Button>
              <Button onClick={saveAdd} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Add to inventory
              </Button>
            </div>
          </div>
        )}

        {phase === 'create' && prefill && (
          <div className="space-y-3">
            <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-800">
              🆕 New barcode — name it once and it's remembered forever
            </div>
            <Input autoFocus value={prefill.name} onChange={e => setPrefill(p => ({ ...p, name: e.target.value }))} placeholder="What is it? e.g. Double Cream 1L" className="font-semibold" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Unit</Label>
                <select value={prefill.unit} onChange={e => setPrefill(p => ({ ...p, unit: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-white px-2 text-sm">
                  {BF_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Stored in</Label>
                <select value={prefill.storageType} onChange={e => setPrefill(p => ({ ...p, storageType: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-white px-2 text-sm">
                  {['Fridge', 'Freezer', 'Dry Storage', 'Prep Area'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Quantity ({prefill.unit || 'ea'})</Label>
              <div className="mt-1">{qtyStepper}</div>
            </div>
            <div>
              <Label className="text-xs">Expiry date (optional)</Label>
              <Input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={scanNext} disabled={busy}>Skip — scan next</Button>
              <Button onClick={saveAdd} disabled={busy || !String(prefill.name || '').trim()} className="bg-emerald-600 hover:bg-emerald-700">
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Add & remember
              </Button>
            </div>
          </div>
        )}

        {phase === 'use' && useTarget && (
          <div className="space-y-3">
            <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2">
              <p className="font-bold text-sm">{useTarget.name}</p>
              <p className="text-xs text-indigo-700">{useTarget.quantity} {useTarget.unit || ''} currently in stock</p>
            </div>
            <div>
              <Label className="text-xs">How much was used? ({useTarget.unit || 'ea'})</Label>
              <div className="mt-1">{qtyStepper}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={scanNext} disabled={busy}>Skip — scan next</Button>
              <Button onClick={saveUse} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700">
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />} Use it
              </Button>
            </div>
          </div>
        )}

        {phase === 'notstock' && (
          <div className="space-y-3 text-center py-2">
            <p className="text-3xl">🤷</p>
            <p className="font-bold text-sm">{prefill?.name ? `"${prefill.name}"` : 'This item'} isn't currently in stock</p>
            <p className="text-xs text-muted-foreground">No problem — you can add it as new stock instead, or just keep scanning.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={scanNext}>Scan next</Button>
              <Button onClick={addInstead} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4 mr-2" /> Add it instead
              </Button>
            </div>
          </div>
        )}

        {phase !== 'scan' && (
          <p className="text-[10px] text-center text-slate-400">Missed something? Skip freely — sort it later with a normal stock recount.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
