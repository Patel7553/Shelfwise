'use client'

// ============================================================================
// RECEIPTS — scan supplier receipts (auto edge-detect + crop), tag them,
// and export as PDF (combined or separate) for the finance department.
// (Aug 2026, user request)
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2, ReceiptText, Download, Trash2, Sparkles, RefreshCw, Check, X, FileText } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'
import { CURRENCY_SYMBOL } from '@/components/shelfwise/shared'

const fetch = apiFetch

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STATUS_OPTIONS = [
  { key: 'pending', label: 'Pending', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  { key: 'submitted', label: 'Submitted', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  { key: 'reviewed', label: 'Reviewed', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
]
const COLOR_OPTIONS = [
  { key: '', label: 'None', dot: 'bg-slate-200' },
  { key: 'red', label: 'Red', dot: 'bg-red-500' },
  { key: 'orange', label: 'Orange', dot: 'bg-orange-500' },
  { key: 'amber', label: 'Amber', dot: 'bg-amber-400' },
  { key: 'green', label: 'Green', dot: 'bg-emerald-500' },
  { key: 'blue', label: 'Blue', dot: 'bg-blue-500' },
  { key: 'purple', label: 'Purple', dot: 'bg-purple-500' },
  { key: 'pink', label: 'Pink', dot: 'bg-pink-500' },
]
const colorBar = (c) => (COLOR_OPTIONS.find(o => o.key === c) || COLOR_OPTIONS[0]).dot
const statusMeta = (s) => STATUS_OPTIONS.find(o => o.key === s) || STATUS_OPTIONS[0]
const fmtD = (d) => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const todayStr = () => new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// OpenCV loader (lazy, only when the crop editor opens) + document detection
// ---------------------------------------------------------------------------
let cvPromise = null
function loadOpenCV() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.cv?.Mat) return Promise.resolve(window.cv)
  if (cvPromise) return cvPromise
  cvPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://docs.opencv.org/4.10.0/opencv.js'
    s.async = true
    s.onload = () => {
      // opencv 4.x exposes cv as a thenable Module until the WASM runtime is up
      if (window.cv?.then) window.cv.then((m) => { window.cv = m; resolve(m) })
      else {
        const check = () => (window.cv?.Mat ? resolve(window.cv) : setTimeout(check, 100))
        check()
      }
    }
    s.onerror = () => { cvPromise = null; reject(new Error('OpenCV failed to load')) }
    document.head.appendChild(s)
  })
  return cvPromise
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// Order 4 points: top-left, top-right, bottom-right, bottom-left
function orderCorners(pts) {
  const bySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y))
  const tl = bySum[0], br = bySum[3]
  const byDiff = [...pts].sort((a, b) => (a.y - a.x) - (b.y - b.x))
  const tr = byDiff[0], bl = byDiff[3]
  return [tl, tr, br, bl]
}

// Find the receipt outline (largest 4-corner contour) — like a doc-scanner app
function detectDocumentCorners(cv, canvas) {
  let src, gray, blur, edges, kernel, contours, hierarchy
  try {
    src = cv.imread(canvas)
    gray = new cv.Mat(); blur = new cv.Mat(); edges = new cv.Mat()
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0)
    cv.Canny(blur, edges, 60, 180)
    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5))
    cv.dilate(edges, edges, kernel)
    contours = new cv.MatVector(); hierarchy = new cv.Mat()
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    const minArea = canvas.width * canvas.height * 0.15
    let best = null; let bestArea = 0
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i)
      const area = cv.contourArea(c)
      if (area < minArea || area <= bestArea) { c.delete(); continue }
      const peri = cv.arcLength(c, true)
      const approx = new cv.Mat()
      cv.approxPolyDP(c, approx, 0.02 * peri, true)
      if (approx.rows === 4) {
        const pts = []
        for (let j = 0; j < 4; j++) pts.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] })
        best = pts; bestArea = area
      }
      approx.delete(); c.delete()
    }
    return best ? orderCorners(best) : null
  } catch { return null } finally {
    for (const m of [src, gray, blur, edges, kernel, contours, hierarchy]) { try { m?.delete() } catch {} }
  }
}

// Straighten + crop using the 4 corners (perspective transform)
function warpPerspective(cv, canvas, corners) {
  const [tl, tr, br, bl] = corners
  const W = Math.max(32, Math.round(Math.max(dist(tl, tr), dist(bl, br))))
  const H = Math.max(32, Math.round(Math.max(dist(tl, bl), dist(tr, br))))
  const src = cv.imread(canvas)
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y])
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, W, 0, W, H, 0, H])
  const M = cv.getPerspectiveTransform(srcTri, dstTri)
  const dst = new cv.Mat()
  cv.warpPerspective(src, M, dst, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_REPLICATE)
  const out = document.createElement('canvas')
  cv.imshow(out, dst)
  for (const m of [src, dst, M, srcTri, dstTri]) { try { m.delete() } catch {} }
  return out
}

// Downscale + re-encode any picked image to JPEG (keeps uploads small and
// guarantees pdf-lib can embed every stored image)
function fileToJpegDataUrl(file, maxSide = 2000, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')) }
    img.src = url
  })
}

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = () => reject(new Error('Could not read the file'))
  r.readAsDataURL(file)
})

// ---------------------------------------------------------------------------
// Crop editor — image + 4 draggable corner handles over an auto-detected quad
// ---------------------------------------------------------------------------
function CropEditor({ dataUrl, onDone, onRetake }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const imgRef = useRef(null)          // full-res source canvas
  const [corners, setCorners] = useState(null)   // in IMAGE coordinates
  const [scale, setScale] = useState(1)
  const [detecting, setDetecting] = useState(true)
  const [cvReady, setCvReady] = useState(false)
  const dragIdx = useRef(-1)

  // Load image → draw preview → auto-detect corners
  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.onload = async () => {
      if (cancelled) return
      const full = document.createElement('canvas')
      full.width = img.width; full.height = img.height
      full.getContext('2d').drawImage(img, 0, 0)
      imgRef.current = full
      // preview scale to fit container width (max 640px tall)
      const w = wrapRef.current?.clientWidth || 340
      const s = Math.min(w / img.width, 520 / img.height, 1)
      setScale(s)
      const cv2 = canvasRef.current
      cv2.width = Math.round(img.width * s); cv2.height = Math.round(img.height * s)
      cv2.getContext('2d').drawImage(img, 0, 0, cv2.width, cv2.height)
      // default corners (5% inset) so the UI never blocks on OpenCV
      const inset = 0.05
      const def = [
        { x: img.width * inset, y: img.height * inset },
        { x: img.width * (1 - inset), y: img.height * inset },
        { x: img.width * (1 - inset), y: img.height * (1 - inset) },
        { x: img.width * inset, y: img.height * (1 - inset) },
      ]
      setCorners(def)
      try {
        const cv = await loadOpenCV()
        if (cancelled) return
        setCvReady(true)
        // detect on a downscaled copy for speed, then scale points back up
        const small = document.createElement('canvas')
        const ds = Math.min(1, 900 / Math.max(img.width, img.height))
        small.width = Math.round(img.width * ds); small.height = Math.round(img.height * ds)
        small.getContext('2d').drawImage(img, 0, 0, small.width, small.height)
        const found = detectDocumentCorners(cv, small)
        if (found && !cancelled) setCorners(found.map(p => ({ x: p.x / ds, y: p.y / ds })))
        else if (!cancelled) toast.info('Couldn\'t auto-detect the edges — drag the corners to fit the receipt')
      } catch {
        if (!cancelled) toast.info('Auto edge-detect unavailable — drag the corners manually, or use the full photo')
      } finally { if (!cancelled) setDetecting(false) }
    }
    img.src = dataUrl
    return () => { cancelled = true }
  }, [dataUrl])

  const toScreen = (p) => ({ x: p.x * scale, y: p.y * scale })
  const move = (e) => {
    if (dragIdx.current < 0 || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const img = imgRef.current
    const x = Math.min(Math.max((e.clientX - rect.left) / scale, 0), img.width)
    const y = Math.min(Math.max((e.clientY - rect.top) / scale, 0), img.height)
    setCorners(prev => prev.map((p, i) => i === dragIdx.current ? { x, y } : p))
  }

  const apply = async () => {
    const img = imgRef.current
    if (!img) return
    try {
      let out
      if (cvReady && window.cv?.Mat && corners) {
        out = warpPerspective(window.cv, img, orderCorners(corners))
      } else {
        // fallback: plain bounding-box crop (no perspective correction)
        const xs = corners.map(p => p.x), ys = corners.map(p => p.y)
        const x0 = Math.min(...xs), y0 = Math.min(...ys)
        const w = Math.max(...xs) - x0, h = Math.max(...ys) - y0
        out = document.createElement('canvas')
        out.width = Math.max(32, w); out.height = Math.max(32, h)
        out.getContext('2d').drawImage(img, x0, y0, w, h, 0, 0, out.width, out.height)
      }
      onDone(out.toDataURL('image/jpeg', 0.85))
    } catch {
      toast.error('Crop failed — using the full photo instead')
      onDone(dataUrl)
    }
  }

  return (
    <div className="space-y-3">
      <div ref={wrapRef} className="relative mx-auto touch-none select-none w-fit max-w-full"
        onPointerMove={move}
        onPointerUp={() => { dragIdx.current = -1 }}
        onPointerLeave={() => { dragIdx.current = -1 }}>
        <canvas ref={canvasRef} className="rounded-lg border shadow-sm max-w-full" />
        {corners && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <polygon points={corners.map(p => { const s = toScreen(p); return `${s.x},${s.y}` }).join(' ')}
              fill="rgba(16,185,129,0.15)" stroke="#10b981" strokeWidth="2" />
          </svg>
        )}
        {corners?.map((p, i) => {
          const s = toScreen(p)
          return (
            <div key={i}
              onPointerDown={(e) => { e.preventDefault(); e.target.setPointerCapture?.(e.pointerId); dragIdx.current = i }}
              className="absolute h-8 w-8 -ml-4 -mt-4 rounded-full bg-white border-[3px] border-emerald-500 shadow-md cursor-grab active:cursor-grabbing"
              style={{ left: s.x, top: s.y }} />
          )
        })}
        {detecting && (
          <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center text-white text-sm font-medium gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Detecting edges…
          </div>
        )}
      </div>
      <p className="text-xs text-center text-muted-foreground">Drag the green corners to fit the receipt exactly — it'll be straightened automatically.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" size="sm" onClick={onRetake}><RefreshCw className="h-4 w-4 mr-1.5" /> Retake</Button>
        <Button variant="outline" size="sm" onClick={() => onDone(dataUrl)}>Use full photo</Button>
        <Button size="sm" onClick={apply} className="bg-emerald-600 hover:bg-emerald-700"><Check className="h-4 w-4 mr-1.5" /> Use this crop</Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PDF export helpers (pdf-lib, client-side — works on phone/tablet/desktop)
// ---------------------------------------------------------------------------
const A4 = { w: 595.28, h: 841.89 }

async function addReceiptToPdf(pdfDoc, r, helv) {
  const caption = [r.supplier || 'Receipt', fmtD(r.receiptDate), r.amount != null ? `${CURRENCY_SYMBOL[r.currency] || ''}${r.amount.toFixed(2)}` : ''].filter(Boolean).join('  ·  ')
  if (r.hasFile && r.fileUrl && r.fileType === 'pdf') {
    try {
      const { PDFDocument } = await import('pdf-lib')
      const bytes = await (await window.fetch(r.fileUrl)).arrayBuffer()
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const pages = await pdfDoc.copyPages(src, src.getPageIndices())
      pages.forEach(p => pdfDoc.addPage(p))
      return
    } catch { /* fall through to a text page */ }
  }
  if (r.hasFile && r.fileUrl && r.fileType === 'image') {
    try {
      const bytes = await (await window.fetch(r.fileUrl)).arrayBuffer()
      let img
      try { img = await pdfDoc.embedJpg(bytes) } catch { img = await pdfDoc.embedPng(bytes) }
      const page = pdfDoc.addPage([A4.w, A4.h])
      const margin = 36, capH = 24
      const maxW = A4.w - margin * 2, maxH = A4.h - margin * 2 - capH
      const s = Math.min(maxW / img.width, maxH / img.height, 1)
      const w = img.width * s, h = img.height * s
      page.drawImage(img, { x: (A4.w - w) / 2, y: A4.h - margin - h, width: w, height: h })
      page.drawText(caption.slice(0, 110), { x: margin, y: margin - 6, size: 10, font: helv })
      return
    } catch { /* fall through to a text page */ }
  }
  // Details-only record (or the file couldn't be fetched)
  const page = pdfDoc.addPage([A4.w, A4.h])
  let y = A4.h - 90
  page.drawText('Receipt record (no image)', { x: 50, y, size: 18, font: helv }); y -= 40
  const lines = [
    `Supplier: ${r.supplier || '—'}`,
    `Date: ${fmtD(r.receiptDate)}`,
    `Amount: ${r.amount != null ? `${CURRENCY_SYMBOL[r.currency] || ''}${r.amount.toFixed(2)}` : '—'}`,
    `Status: ${statusMeta(r.status).label}`,
    `Added by: ${r.addedBy || '—'}`,
    r.notes ? `Notes: ${r.notes}` : '',
  ].filter(Boolean)
  for (const ln of lines) { page.drawText(ln.slice(0, 100), { x: 50, y, size: 12, font: helv }); y -= 22 }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export function ReceiptsView({ currency }) {
  const sym = CURRENCY_SYMBOL[currency] || '£'
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [migrationMsg, setMigrationMsg] = useState('')

  // Add flow
  const [addOpen, setAddOpen] = useState(false)
  const [step, setStep] = useState('source')        // source | crop | details
  const [rawImage, setRawImage] = useState('')       // pre-crop dataUrl
  const [finalFile, setFinalFile] = useState('')     // dataUrl to upload ('' = details only)
  const [finalType, setFinalType] = useState('')     // 'image' | 'pdf' | ''
  const [aiBusy, setAiBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const blankDetails = { supplier: '', receiptDate: todayStr(), amount: '', currency: currency || 'GBP', status: 'pending', color: '', notes: '' }
  const [details, setDetails] = useState(blankDetails)

  // View / edit one receipt
  const [viewing, setViewing] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [busy, setBusy] = useState(false)

  // Export flow
  const [exportOpen, setExportOpen] = useState(false)
  const [expFrom, setExpFrom] = useState(todayStr())
  const [expTo, setExpTo] = useState(todayStr())
  const [expMode, setExpMode] = useState('combined')
  const [exporting, setExporting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/receipts')
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        if (String(data?.error || '').includes('migration-23')) setMigrationMsg(data.error)
        else toast.error(data?.error || 'Could not load receipts')
        setReceipts([])
      } else { setReceipts(Array.isArray(data) ? data : []); setMigrationMsg('') }
    } catch { toast.error('Could not load receipts') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => statusFilter === 'all' ? receipts : receipts.filter(r => r.status === statusFilter), [receipts, statusFilter])

  // ---- Add flow handlers ----
  const openAdd = () => { setStep('source'); setRawImage(''); setFinalFile(''); setFinalType(''); setDetails({ ...blankDetails, currency: currency || 'GBP' }); setAddOpen(true) }
  const onImagePicked = async (file) => {
    if (!file) return
    try {
      const dataUrl = await fileToJpegDataUrl(file)
      setRawImage(dataUrl); setStep('crop')
    } catch (e) { toast.error(e.message) }
  }
  const onPdfPicked = async (file) => {
    if (!file) return
    if (file.size > 12 * 1024 * 1024) { toast.error('PDF too large (max 12MB)'); return }
    try {
      const dataUrl = await fileToDataUrl(file)
      if (!String(dataUrl).startsWith('data:application/pdf')) { toast.error('That file is not a PDF'); return }
      setFinalFile(dataUrl); setFinalType('pdf'); setStep('details')
    } catch (e) { toast.error(e.message) }
  }
  const onCropped = async (dataUrl) => {
    setFinalFile(dataUrl); setFinalType('image'); setStep('details')
    // AI reads supplier/date/total automatically
    setAiBusy(true)
    try {
      const res = await fetch('/api/receipts/ai-extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setDetails(prev => ({
          ...prev,
          supplier: d.supplier || prev.supplier,
          receiptDate: d.date || prev.receiptDate,
          amount: d.total != null ? String(d.total) : prev.amount,
          currency: d.currency || prev.currency,
        }))
        if (d.supplier || d.total != null) toast.success('AI read the receipt — check the details below')
      }
    } catch { /* silent; manual entry still works */ } finally { setAiBusy(false) }
  }
  const saveNew = async () => {
    if (!finalFile && !details.supplier.trim() && details.amount === '') {
      toast.error('Add a photo/PDF, or at least a supplier name or amount'); return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: finalFile || undefined, ...details, amount: details.amount === '' ? null : Number(details.amount) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not save the receipt')
      setReceipts(prev => [d, ...prev])
      setAddOpen(false)
      toast.success('Receipt saved 🧾')
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  // ---- Edit / delete ----
  const openView = (r) => { setViewing(r); setEditForm({ supplier: r.supplier, receiptDate: r.receiptDate || '', amount: r.amount != null ? String(r.amount) : '', status: r.status, color: r.color, notes: r.notes }) }
  const saveEdit = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/receipts/${viewing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, amount: editForm.amount === '' ? null : Number(editForm.amount) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not save changes')
      setReceipts(prev => prev.map(x => x.id === d.id ? d : x))
      setViewing(null)
      toast.success('Receipt updated')
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!confirm('Delete this receipt? This cannot be undone.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/receipts/${viewing.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not delete')
      setReceipts(prev => prev.filter(x => x.id !== viewing.id))
      setViewing(null)
      toast.success('Receipt deleted')
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  // ---- Export ----
  const setQuickRange = (kind) => {
    const now = new Date()
    const iso = (d) => d.toISOString().slice(0, 10)
    if (kind === 'today') { setExpFrom(iso(now)); setExpTo(iso(now)) }
    if (kind === 'week') {
      const day = (now.getDay() + 6) % 7 // Monday start
      const mon = new Date(now); mon.setDate(now.getDate() - day)
      setExpFrom(iso(mon)); setExpTo(iso(now))
    }
    if (kind === 'month') { setExpFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1))); setExpTo(iso(now)) }
  }
  const inRange = useMemo(() => receipts.filter(r => {
    const d = r.receiptDate || (r.createdAt || '').slice(0, 10)
    return d && d >= expFrom && d <= expTo
  }).sort((a, b) => String(a.receiptDate).localeCompare(String(b.receiptDate))), [receipts, expFrom, expTo])

  const runExport = async () => {
    if (!inRange.length) { toast.error('No receipts in that date range'); return }
    setExporting(true)
    try {
      const { PDFDocument, StandardFonts } = await import('pdf-lib')
      const stamp = `${expFrom}_to_${expTo}`
      if (expMode === 'combined') {
        const doc = await PDFDocument.create()
        const helv = await doc.embedFont(StandardFonts.Helvetica)
        for (const r of inRange) await addReceiptToPdf(doc, r, helv)
        const bytes = await doc.save()
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `receipts_${stamp}.pdf`)
        toast.success(`Exported ${inRange.length} receipt${inRange.length === 1 ? '' : 's'} as one PDF`)
      } else {
        const files = []
        for (let i = 0; i < inRange.length; i++) {
          const r = inRange[i]
          const doc = await PDFDocument.create()
          const helv = await doc.embedFont(StandardFonts.Helvetica)
          await addReceiptToPdf(doc, r, helv)
          const bytes = await doc.save()
          const base = `${r.receiptDate || 'receipt'}_${(r.supplier || 'receipt').replace(/[^a-z0-9]+/gi, '-').slice(0, 30)}_${i + 1}`
          files.push({ name: `${base}.pdf`, bytes })
        }
        if (files.length === 1) {
          downloadBlob(new Blob([files[0].bytes], { type: 'application/pdf' }), files[0].name)
        } else {
          const JSZip = (await import('jszip')).default
          const zip = new JSZip()
          for (const f of files) zip.file(f.name, f.bytes)
          const blob = await zip.generateAsync({ type: 'blob' })
          downloadBlob(blob, `receipts_${stamp}.zip`)
        }
        toast.success(`Exported ${files.length} PDF${files.length === 1 ? '' : 's'}${files.length > 1 ? ' (zipped)' : ''}`)
      }
      setExportOpen(false)
    } catch (e) { toast.error(e.message || 'Export failed') } finally { setExporting(false) }
  }

  // -------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><ReceiptText className="h-5 w-5 text-emerald-600" /> Receipts</h2>
          <p className="text-xs text-muted-foreground">Scan paper receipts as they arrive — export them as PDFs for finance.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setQuickRange('month'); setExportOpen(true) }} disabled={!receipts.length}>
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
          <Button size="sm" onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700">
            <ReceiptText className="h-4 w-4 mr-1.5" /> Scan receipt
          </Button>
        </div>
      </div>

      {migrationMsg && (
        <div className="text-sm bg-amber-50 border border-amber-300 text-amber-900 rounded-lg p-3">
          ⚠️ {migrationMsg}
        </div>
      )}

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {[{ key: 'all', label: `All (${receipts.length})` }, ...STATUS_OPTIONS.map(s => ({ key: s.key, label: `${s.label} (${receipts.filter(r => r.status === s.key).length})` }))].map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className={`text-xs font-semibold rounded-full px-3 py-1.5 border transition ${statusFilter === f.key ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white hover:border-emerald-400'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
      ) : !filtered.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ReceiptText className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="font-medium">No receipts yet</p>
          <p className="text-xs mt-1">Tap "Scan receipt" when a delivery arrives — no more paper piles for finance.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(r => (
            <button key={r.id} onClick={() => openView(r)} className="text-left bg-white rounded-xl border hover:border-emerald-400 hover:shadow-sm transition overflow-hidden flex">
              <div className={`w-1.5 shrink-0 ${colorBar(r.color)}`} />
              <div className="flex items-center gap-3 p-3 min-w-0 flex-1">
                {r.hasFile && r.fileType === 'image' && r.fileUrl ? (
                  <img src={r.fileUrl} alt="" className="h-14 w-14 rounded-lg object-cover border shrink-0" />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-slate-100 border flex items-center justify-center shrink-0">
                    {r.fileType === 'pdf' ? <FileText className="h-6 w-6 text-slate-400" /> : <ReceiptText className="h-6 w-6 text-slate-300" />}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{r.supplier || 'Receipt'}</p>
                  <p className="text-xs text-muted-foreground">{fmtD(r.receiptDate)}{r.amount != null ? ` · ${CURRENCY_SYMBOL[r.currency] || sym}${Number(r.amount).toFixed(2)}` : ''}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[10px] font-bold rounded-full border px-1.5 py-0.5 ${statusMeta(r.status).cls}`}>{statusMeta(r.status).label}</span>
                    {r.addedBy && <span className="text-[10px] text-slate-400 truncate">👤 {r.addedBy}</span>}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ================= ADD DIALOG ================= */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-emerald-600" /> Add receipt</DialogTitle>
          </DialogHeader>

          {step === 'source' && (
            <div className="space-y-3 py-1">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { onImagePicked(e.target.files?.[0]); e.target.value = '' }} />
                  <div className="border-2 border-dashed border-emerald-300 rounded-xl p-5 hover:border-emerald-500 hover:bg-emerald-50/40 transition cursor-pointer text-center h-full">
                    <div className="text-4xl mb-1">📷</div>
                    <p className="font-semibold text-sm">Take photo</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Auto edge-detect & straighten</p>
                  </div>
                </label>
                <label className="block">
                  <input type="file" accept="image/*" className="hidden" onChange={e => { onImagePicked(e.target.files?.[0]); e.target.value = '' }} />
                  <div className="border-2 border-dashed border-blue-300 rounded-xl p-5 hover:border-blue-500 hover:bg-blue-50/40 transition cursor-pointer text-center h-full">
                    <div className="text-4xl mb-1">🖼️</div>
                    <p className="font-semibold text-sm">Photo from library</p>
                    <p className="text-xs text-muted-foreground mt-0.5">An existing photo of the receipt</p>
                  </div>
                </label>
                <label className="block">
                  <input type="file" accept="application/pdf" className="hidden" onChange={e => { onPdfPicked(e.target.files?.[0]); e.target.value = '' }} />
                  <div className="border-2 border-dashed border-purple-300 rounded-xl p-5 hover:border-purple-500 hover:bg-purple-50/40 transition cursor-pointer text-center h-full">
                    <div className="text-4xl mb-1">📄</div>
                    <p className="font-semibold text-sm">Upload PDF</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Digital invoice / emailed receipt</p>
                  </div>
                </label>
                <button type="button" onClick={() => { setFinalFile(''); setFinalType(''); setStep('details') }}
                  className="border-2 border-dashed border-slate-300 rounded-xl p-5 hover:border-slate-500 hover:bg-slate-50 transition text-center h-full">
                  <div className="text-4xl mb-1">✍️</div>
                  <p className="font-semibold text-sm">Details only</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Damaged / missing receipt — record it anyway</p>
                </button>
              </div>
            </div>
          )}

          {step === 'crop' && rawImage && (
            <CropEditor dataUrl={rawImage} onDone={onCropped} onRetake={() => setStep('source')} />
          )}

          {step === 'details' && (
            <div className="space-y-3 py-1">
              {finalFile && finalType === 'image' && (
                <div className="flex items-start gap-3">
                  <img src={finalFile} alt="receipt" className="h-28 w-24 object-cover rounded-lg border shadow-sm" />
                  <div className="text-xs text-muted-foreground pt-1">
                    {aiBusy ? <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium"><Loader2 className="h-3.5 w-3.5 animate-spin" /> AI is reading the receipt…</span>
                      : <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-emerald-600" /> Check the AI-filled details below</span>}
                    <button type="button" onClick={() => setStep('crop')} className="block mt-2 underline underline-offset-2 hover:text-slate-700">Adjust crop</button>
                  </div>
                </div>
              )}
              {finalFile && finalType === 'pdf' && (
                <p className="text-xs bg-purple-50 border border-purple-200 text-purple-900 rounded-lg px-3 py-2">📄 PDF attached — fill in the details below</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Supplier</Label>
                  <Input value={details.supplier} onChange={e => setDetails({ ...details, supplier: e.target.value })} placeholder="e.g. Bidfood" className="mt-1" />
                </div>
                <div>
                  <Label>Receipt date</Label>
                  <Input type="date" value={details.receiptDate} onChange={e => setDetails({ ...details, receiptDate: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Amount ({CURRENCY_SYMBOL[details.currency] || sym})</Label>
                  <Input type="number" step="0.01" value={details.amount} onChange={e => setDetails({ ...details, amount: e.target.value })} placeholder="0.00" className="mt-1" />
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="flex gap-1.5 mt-1.5">
                    {STATUS_OPTIONS.map(s => (
                      <button key={s.key} type="button" onClick={() => setDetails({ ...details, status: s.key })}
                        className={`text-xs font-semibold rounded-full border px-2.5 py-1 ${details.status === s.key ? s.cls + ' ring-2 ring-offset-1 ring-emerald-400' : 'bg-white text-slate-500'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label>Colour tag (optional)</Label>
                  <div className="flex gap-2 mt-1.5">
                    {COLOR_OPTIONS.map(c => (
                      <button key={c.key} type="button" title={c.label} onClick={() => setDetails({ ...details, color: c.key })}
                        className={`h-7 w-7 rounded-full ${c.dot} border-2 ${details.color === c.key ? 'border-slate-800 scale-110' : 'border-transparent'} transition`} />
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label>Notes (optional)</Label>
                  <Textarea rows={2} value={details.notes} onChange={e => setDetails({ ...details, notes: e.target.value })} placeholder='e.g. "part of Friday delivery, box 2 of 3"' className="mt-1" />
                </div>
              </div>
              <div className="flex justify-between gap-2 pt-1">
                <Button variant="ghost" onClick={() => setStep('source')}><X className="h-4 w-4 mr-1" /> Back</Button>
                <Button onClick={saveNew} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />} Save receipt
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ================= VIEW / EDIT DIALOG ================= */}
      <Dialog open={!!viewing} onOpenChange={(v) => { if (!v) setViewing(null) }}>
        <DialogContent className="sm:max-w-[640px] max-h-[92vh] overflow-y-auto">
          {viewing && editForm && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-emerald-600" /> {viewing.supplier || 'Receipt'}</DialogTitle>
              </DialogHeader>
              {viewing.hasFile && viewing.fileUrl && viewing.fileType === 'image' && (
                <a href={viewing.fileUrl} target="_blank" rel="noreferrer" title="Open full size">
                  <img src={viewing.fileUrl} alt="receipt" className="max-h-72 mx-auto rounded-lg border shadow-sm" />
                </a>
              )}
              {viewing.hasFile && viewing.fileUrl && viewing.fileType === 'pdf' && (
                <a href={viewing.fileUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 border-2 border-dashed border-purple-300 rounded-xl py-6 text-purple-700 font-semibold text-sm hover:bg-purple-50">
                  <FileText className="h-5 w-5" /> Open PDF receipt
                </a>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Supplier</Label>
                  <Input value={editForm.supplier} onChange={e => setEditForm({ ...editForm, supplier: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Receipt date</Label>
                  <Input type="date" value={editForm.receiptDate || ''} onChange={e => setEditForm({ ...editForm, receiptDate: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Amount ({CURRENCY_SYMBOL[viewing.currency] || sym})</Label>
                  <Input type="number" step="0.01" value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="flex gap-1.5 mt-1.5">
                    {STATUS_OPTIONS.map(s => (
                      <button key={s.key} type="button" onClick={() => setEditForm({ ...editForm, status: s.key })}
                        className={`text-xs font-semibold rounded-full border px-2.5 py-1 ${editForm.status === s.key ? s.cls + ' ring-2 ring-offset-1 ring-emerald-400' : 'bg-white text-slate-500'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label>Colour tag</Label>
                  <div className="flex gap-2 mt-1.5">
                    {COLOR_OPTIONS.map(c => (
                      <button key={c.key} type="button" title={c.label} onClick={() => setEditForm({ ...editForm, color: c.key })}
                        className={`h-7 w-7 rounded-full ${c.dot} border-2 ${editForm.color === c.key ? 'border-slate-800 scale-110' : 'border-transparent'} transition`} />
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} className="mt-1" />
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                👤 Added by <b className="capitalize">{viewing.addedBy || '—'}</b> — {fmtD((viewing.createdAt || '').slice(0, 10))}
                {viewing.editedBy && <> · ✏️ Last edited by <b className="capitalize">{viewing.editedBy}</b>{viewing.editedAt ? ` — ${new Date(viewing.editedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</>}
              </div>
              <div className="flex justify-between gap-2">
                <Button variant="ghost" onClick={remove} disabled={busy} className="text-red-600 hover:bg-red-50">
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                </Button>
                <Button onClick={saveEdit} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />} Save changes
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ================= EXPORT DIALOG ================= */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-emerald-600" /> Export receipts</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {[['today', 'Today'], ['week', 'This week'], ['month', 'This month']].map(([k, l]) => (
                <button key={k} onClick={() => setQuickRange(k)} className="text-xs font-semibold rounded-full border px-3 py-1.5 bg-white hover:border-emerald-400">{l}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>From</Label>
                <Input type="date" value={expFrom} onChange={e => setExpFrom(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>To</Label>
                <Input type="date" value={expTo} onChange={e => setExpTo(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={() => setExpMode('combined')} className={`w-full text-left rounded-lg border-2 p-3 transition ${expMode === 'combined' ? 'border-emerald-500 bg-emerald-50' : 'hover:border-emerald-300'}`}>
                <p className="font-semibold text-sm">📚 Combine into one PDF</p>
                <p className="text-xs text-muted-foreground">All receipts merged into a single multi-page PDF — easiest to email</p>
              </button>
              <button onClick={() => setExpMode('separate')} className={`w-full text-left rounded-lg border-2 p-3 transition ${expMode === 'separate' ? 'border-emerald-500 bg-emerald-50' : 'hover:border-emerald-300'}`}>
                <p className="font-semibold text-sm">🗂️ Separate PDFs</p>
                <p className="text-xs text-muted-foreground">One PDF per receipt — zipped together if there's more than one</p>
              </button>
            </div>
            <p className="text-xs text-center text-muted-foreground">{inRange.length} receipt{inRange.length === 1 ? '' : 's'} in this range</p>
            <Button onClick={runExport} disabled={exporting || !inRange.length} className="w-full bg-emerald-600 hover:bg-emerald-700">
              {exporting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Building PDF…</> : <><Download className="h-4 w-4 mr-2" /> Download</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
