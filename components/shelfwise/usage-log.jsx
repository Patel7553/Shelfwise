'use client'

/* eslint-disable no-unused-vars */
// End-of-Shift Usage Log (June 2025).
// Staff tick a printed sheet during service, photograph it at the end of the
// shift, review AI-counted tallies, and confirm to deduct from stock.

import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Printer, Camera, Loader2, Check, X, AlertTriangle, RefreshCw, ClipboardCheck, Upload, ArrowRight, ShieldCheck } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'
import { escapeText } from '@/components/shelfwise/shared'

// `fetch` inside this file transparently uses `apiFetch` (auth token attached).
const fetch = apiFetch

const TICK_BOXES_PER_ROW = 15

export function UsageLogView({ kitchenName = '' }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)          // becomes true after first successful scan
  const [counts, setCounts] = useState({})               // productId -> number used
  const [confidence, setConfidence] = useState({})       // productId -> 'high' | 'low'
  const [unmatched, setUnmatched] = useState([])         // sheet rows that didn't match a product
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState(null)   // response after Confirm
  const fileRef = useRef(null)

  const loadProducts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/products?sort=asc')
      const data = await res.json()
      setProducts(Array.isArray(data) ? data : [])
    } catch { toast.error('Could not load inventory') }
    finally { setLoading(false) }
  }
  useEffect(() => { loadProducts() }, [])

  // ---------- STEP 1: printable sheet (always generated from CURRENT inventory) ----------
  const printSheet = () => {
    if (products.length === 0) { toast.error('No inventory items to print'); return }
    const w = window.open('', '_blank', 'width=900,height=1000')
    if (!w) { toast.error('Popup blocked — allow popups to print'); return }
    const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const boxes = Array.from({ length: TICK_BOXES_PER_ROW })
      .map((_, i) => `<span class="tick-box${(i + 1) % 5 === 0 && i < TICK_BOXES_PER_ROW - 1 ? ' group-end' : ''}"></span>`)
      .join('')
    const rows = products.map((p, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="item">${escapeText(p.name)}${p.unit ? ` <span class="unit">(${escapeText(p.unit)})</span>` : ''}</td>
        <td class="boxes">${boxes}</td>
      </tr>`).join('')
    const html = `<!doctype html><html><head><title>Usage Log — ${escapeText(kitchenName)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; padding: 12px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .meta { font-size: 12px; color: #555; margin-bottom: 6px; }
  .instructions { font-size: 11px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 6px 10px; margin-bottom: 10px; color: #166534; }
  .staff { font-size: 12px; margin-bottom: 10px; }
  .staff span { display: inline-block; border-bottom: 1px solid #999; min-width: 180px; height: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #059669; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; padding: 6px 8px; text-align: left; }
  td { border: 1px solid #cbd5e1; padding: 5px 8px; }
  tr:nth-child(even) td { background: #f8fafc; }
  .num { width: 26px; text-align: center; font-weight: 700; font-size: 12px; color: #334155; }
  .item { font-size: 13px; font-weight: 600; white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
  .unit { font-weight: 400; color: #64748b; font-size: 11px; }
  .boxes { white-space: nowrap; }
  .tick-box { display: inline-block; width: 17px; height: 17px; border: 1.6px solid #475569; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
  .tick-box.group-end { margin-right: 16px; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .footer { margin-top: 10px; font-size: 10px; color: #94a3b8; }
  @media print { .no-print { display: none } }
</style></head><body>
  <h1>📋 End-of-Shift Usage Log — ${escapeText(kitchenName || 'Kitchen')}</h1>
  <div class="meta">${today} · ${products.length} items · generated live from current inventory</div>
  <div class="instructions"><b>How to use:</b> every time you use ONE unit of an item, put a tick ✓ or cross ✗ inside ONE empty box on that item's row. Do NOT write numbers. At the end of the shift, photograph this sheet in the app (Shift Log → Scan Completed Sheet).</div>
  <div class="staff">Shift: AM / PM &nbsp;&nbsp;&nbsp; Staff name: <span></span></div>
  <table>
    <thead><tr><th>#</th><th>Item</th><th>Tick one box per unit used</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">ShelfWise · one tick = one ${''}unit · sheet regenerates automatically when inventory changes — always print fresh</div>
  <script>window.onload = () => setTimeout(() => window.print(), 400)</script>
</body></html>`
    w.document.write(html)
    w.document.close()
  }

  // ---------- STEP 2: photo capture + compression ----------
  const compressImage = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const MAX = 1800 // keep detail so small tick marks stay readable
        let { width, height } = img
        if (width > MAX || height > MAX) {
          const scale = MAX / Math.max(width, height)
          width = Math.round(width * scale); height = Math.round(height * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const onPhoto = async (file) => {
    if (!file) return
    setScanning(true)
    try {
      const dataUrl = await compressImage(file)
      const res = await fetch('/api/usage/scan-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      // Merge scan into state: each scan overwrites counts ONLY for rows it saw
      // (lets staff scan page 1, then page 2 of a long sheet).
      const nextCounts = { ...counts }
      const nextConf = { ...confidence }
      for (const m of (data.matched || [])) {
        nextCounts[m.productId] = m.count
        nextConf[m.productId] = m.confidence
      }
      setCounts(nextCounts)
      setConfidence(nextConf)
      setUnmatched(prev => {
        const seen = new Set(prev.map(u => u.name))
        return [...prev, ...(data.unmatched || []).filter(u => !seen.has(u.name))]
      })
      setScanned(true)
      const detected = (data.matched || []).filter(m => m.count > 0).length
      toast.success(`Scanned ${data.rowsScanned || 0} rows — ${detected} item${detected !== 1 ? 's' : ''} with usage detected. Review below before confirming.`)
    } catch (e) {
      toast.error(e.message || 'Scan failed — try a clearer photo')
    } finally {
      setScanning(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ---------- STEP 3 + 4: confirm screen ----------
  const setCount = (id, v) => {
    const n = v === '' ? '' : Math.max(0, Math.min(9999, Math.round(Number(v) || 0)))
    setCounts(c => ({ ...c, [id]: n }))
    // manual edit clears the low-confidence flag — staff has verified it
    setConfidence(cf => ({ ...cf, [id]: 'high' }))
  }

  const usedItems = products.filter(p => Number(counts[p.id]) > 0)
  const totalUsed = usedItems.reduce((s, p) => s + Number(counts[p.id]), 0)
  const lowConfCount = products.filter(p => confidence[p.id] === 'low').length

  // Sort confirm table: low-confidence first (needs checking), then detected usage, then the rest
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      const aLow = confidence[a.id] === 'low' ? 0 : 1
      const bLow = confidence[b.id] === 'low' ? 0 : 1
      if (aLow !== bLow) return aLow - bLow
      const aUsed = Number(counts[a.id]) > 0 ? 0 : 1
      const bUsed = Number(counts[b.id]) > 0 ? 0 : 1
      if (aUsed !== bUsed) return aUsed - bUsed
      return String(a.name).localeCompare(String(b.name))
    })
  }, [products, counts, confidence])

  // ---------- STEP 5: apply (only on explicit Confirm) ----------
  const applyDeductions = async () => {
    if (usedItems.length === 0) { toast.error('No items with usage above 0'); return }
    if (!window.confirm(`Deduct ${totalUsed} unit${totalUsed !== 1 ? 's' : ''} across ${usedItems.length} item${usedItems.length !== 1 ? 's' : ''} from stock?`)) return
    setApplying(true)
    try {
      const res = await fetch('/api/usage/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: usedItems.map(p => ({ id: p.id, used: Number(counts[p.id]) })) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not apply deductions')
      setApplyResult(data)
      toast.success(`Stock updated — ${data.applied} item${data.applied !== 1 ? 's' : ''} deducted ✅`)
      loadProducts()
    } catch (e) {
      toast.error(e.message || 'Could not apply deductions')
    } finally { setApplying(false) }
  }

  const resetAll = () => {
    setCounts({}); setConfidence({}); setUnmatched([]); setScanned(false); setApplyResult(null)
    loadProducts()
  }

  // ---------- success screen ----------
  if (applyResult) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">End-of-Shift Usage Log</h2>
        </div>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Check className="h-9 w-9 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-emerald-800">Stock updated</h3>
            <p className="text-sm text-muted-foreground mt-1">{applyResult.applied} item{applyResult.applied !== 1 ? 's' : ''} deducted{applyResult.failed > 0 ? ` · ${applyResult.failed} failed` : ''}</p>
            <div className="max-w-md mx-auto mt-5 text-left divide-y rounded-xl border">
              {(applyResult.results || []).filter(r => r.ok).map(r => (
                <div key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="font-medium truncate">{r.name}</span>
                  <span className="text-muted-foreground shrink-0 ml-3">{r.from} → <b className="text-emerald-700">{r.to}</b> {r.unit}</span>
                </div>
              ))}
            </div>
            <Button className="mt-6" onClick={resetAll}><RefreshCw className="h-4 w-4 mr-1.5" /> Start next shift log</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">End-of-Shift Usage Log</h2>
        <p className="text-muted-foreground mt-1">Print the sheet → staff tick boxes during service → scan it at the end of the shift → confirm → stock is deducted</p>
      </div>

      {/* STEP 1 + 2 cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button onClick={printSheet} disabled={loading}
          className="text-left rounded-xl border-2 p-5 transition border-slate-200 hover:border-emerald-400 bg-white">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-lg flex items-center justify-center bg-emerald-100 text-emerald-700">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">1 · Print Usage Sheet</p>
              <p className="text-xs text-muted-foreground">{loading ? 'Loading inventory...' : `${products.length} items — always generated fresh from current inventory`}</p>
            </div>
          </div>
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={scanning || loading}
          className="text-left rounded-xl border-2 p-5 transition border-sky-200 hover:border-sky-400 bg-sky-50/50 relative">
          <span className="absolute top-2 right-2 text-[9px] font-bold bg-sky-600 text-white rounded px-1.5 py-0.5">AI</span>
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-lg flex items-center justify-center bg-sky-600 text-white">
              {scanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            </div>
            <div>
              <p className="font-semibold">2 · Scan Completed Sheet</p>
              <p className="text-xs text-muted-foreground">{scanning ? 'Counting tally marks...' : 'Photograph the ticked sheet — AI counts the marks per item'}</p>
            </div>
          </div>
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => onPhoto(e.target.files?.[0])} />
      </div>

      {/* Unmatched rows warning */}
      {unmatched.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {unmatched.length} sheet row{unmatched.length !== 1 ? 's' : ''} didn't match an inventory item</p>
          <p className="text-xs text-amber-800 mt-1">These were probably deleted/renamed after printing. Enter their usage manually in the table below if needed:</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {unmatched.map((u, i) => (
              <span key={i} className="px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900 text-xs font-medium">{u.name} — {u.count} mark{u.count !== 1 ? 's' : ''}</span>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3: confirm screen */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-emerald-600" /> 3 · Review & Confirm</CardTitle>
              <CardDescription>
                {scanned
                  ? <>Check every count — nothing is deducted until you confirm.{lowConfCount > 0 && <span className="text-amber-700 font-semibold"> {lowConfCount} row{lowConfCount !== 1 ? 's' : ''} highlighted yellow — the AI wasn't sure, double-check them.</span>}</>
                  : 'Scan a sheet above, or enter usage counts manually.'}
              </CardDescription>
            </div>
            {(scanned || usedItems.length > 0) && (
              <Button variant="outline" size="sm" onClick={resetAll}><X className="h-4 w-4 mr-1" /> Clear all</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center"><Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" /></div>
          ) : products.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No inventory items</p>
              <p className="text-sm">Add products to your Inventory first.</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border overflow-hidden">
                <div className="grid grid-cols-[1fr_90px_110px] gap-2 px-4 py-2 bg-slate-50 border-b text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <span>Item</span><span className="text-center">Used</span><span className="text-right">Stock after</span>
                </div>
                <div className="divide-y max-h-[480px] overflow-y-auto">
                  {sortedProducts.map(p => {
                    const used = Number(counts[p.id]) || 0
                    const low = confidence[p.id] === 'low'
                    const after = Math.max(0, (Number(p.quantity) || 0) - used)
                    return (
                      <div key={p.id}
                        className={`grid grid-cols-[1fr_90px_110px] gap-2 items-center px-4 py-2 ${low ? 'bg-yellow-50' : used > 0 ? 'bg-emerald-50/50' : ''}`}>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate flex items-center gap-1.5">
                            {p.name}
                            {low && <Badge className="bg-yellow-200 text-yellow-900 hover:bg-yellow-200 text-[9px] px-1.5">CHECK</Badge>}
                          </p>
                          <p className="text-xs text-muted-foreground">In stock: {p.quantity} {p.unit}</p>
                        </div>
                        <Input type="number" min="0" className={`h-8 text-sm text-center ${low ? 'border-yellow-400 bg-white' : ''}`}
                          value={counts[p.id] ?? 0}
                          onChange={e => setCount(p.id, e.target.value)} />
                        <p className={`text-sm text-right font-semibold ${used > 0 ? (after === 0 ? 'text-red-600' : 'text-emerald-700') : 'text-slate-400'}`}>
                          {used > 0 ? `${p.quantity} → ${after}` : '—'} {used > 0 ? p.unit : ''}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* STEP 5: confirm button */}
              <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
                <p className="text-sm text-muted-foreground">
                  {usedItems.length > 0
                    ? <><b className="text-foreground">{totalUsed}</b> unit{totalUsed !== 1 ? 's' : ''} across <b className="text-foreground">{usedItems.length}</b> item{usedItems.length !== 1 ? 's' : ''} will be deducted</>
                    : 'Nothing to deduct yet'}
                </p>
                <Button onClick={applyDeductions} disabled={applying || usedItems.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {applying ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                  Confirm & Deduct Stock
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
