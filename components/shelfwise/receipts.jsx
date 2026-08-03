'use client'

// ============================================================================
// RECEIPTS — professional document scanner (edge-detect, deskew, enhancement
// filters, multi-page, stamps, OCR), colour tags, and PDF export for finance.
// (Aug 2026, user request — CamScanner/Adobe Scan quality benchmark)
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2, ReceiptText, Download, Trash2, Sparkles, RefreshCw, Check, X, FileText, RotateCcw, RotateCw, ScanText, ArrowLeft, ArrowRight, Search, PackagePlus } from 'lucide-react'
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
const todayStr = () => new Date().toLocaleDateString('en-CA')

// ---------------------------------------------------------------------------
// OpenCV loader (lazy, only when the crop editor opens) + document detection
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// OpenCV in a WEB WORKER — the 10MB engine compiles OFF the main thread.
// (Compiling it on the main thread froze the entire UI on iPhones: no taps,
// no close button. A worker keeps the screen fully responsive.)
// ---------------------------------------------------------------------------
const CV_WORKER_CODE = `
let readyPromise = null;
function ensureReady(origin) {
  if (!readyPromise) {
    readyPromise = new Promise((resolve, reject) => {
      try {
        try { importScripts(origin + '/opencv.js'); }
        catch (e) { importScripts('https://docs.opencv.org/4.x/opencv.js'); }
        // jscanify (MIT) — proven document-detection library on top of OpenCV
        try { importScripts(origin + '/jscanify.min.js'); } catch (e) { /* optional */ }
        const chk = () => {
          if (self.cv && self.cv.Mat) resolve();
          else if (self.cv && self.cv.then) self.cv.then(function (m) { self.cv = m; resolve(); });
          else setTimeout(chk, 50);
        };
        chk();
      } catch (e) { reject(e); }
    });
  }
  return readyPromise;
}
function orderCorners(pts) {
  const bySum = pts.slice().sort(function (a, b) { return (a.x + a.y) - (b.x + b.y); });
  const tl = bySum[0], br = bySum[3];
  const byDiff = pts.slice().sort(function (a, b) { return (a.y - a.x) - (b.y - b.x); });
  const tr = byDiff[0], bl = byDiff[3];
  return [tl, tr, br, bl];
}
function findQuad(edges, imgArea) {
  const cv = self.cv;
  const contours = new cv.MatVector(), hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  const cands = [];
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const area = cv.contourArea(c);
    if (area >= imgArea * 0.08) cands.push({ c: c, area: area }); else c.delete();
  }
  cands.sort(function (a, b) { return b.area - a.area; });
  let result = null;
  for (let k = 0; k < Math.min(5, cands.length) && !result; k++) {
    const hull = new cv.Mat();
    cv.convexHull(cands[k].c, hull);
    const peri = cv.arcLength(hull, true);
    const epsList = [0.02, 0.035, 0.05, 0.08];
    for (let e = 0; e < epsList.length; e++) {
      const approx = new cv.Mat();
      cv.approxPolyDP(hull, approx, epsList[e] * peri, true);
      if (approx.rows === 4) {
        const pts = [];
        for (let j = 0; j < 4; j++) pts.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
        approx.delete();
        result = pts;
        break;
      }
      approx.delete();
    }
    hull.delete();
  }
  for (let k = 0; k < cands.length; k++) cands[k].c.delete();
  contours.delete(); hierarchy.delete();
  return result;
}
function quadArea(pts) {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = pts[i], q = pts[(i + 1) % 4];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}
// PRIMARY: jscanify (proven MIT document-detection library).
function detectWithJscanify(imageData) {
  if (!self.jscanify) return null;
  const cv = self.cv;
  let mat = null, contour = null;
  try {
    mat = cv.matFromImageData(imageData);
    const scanner = new self.jscanify();
    contour = scanner.findPaperContour(mat);
    if (!contour) return null;
    const cp = scanner.getCornerPoints(contour);
    if (!cp || !cp.topLeftCorner || !cp.topRightCorner || !cp.bottomRightCorner || !cp.bottomLeftCorner) return null;
    const pts = [cp.topLeftCorner, cp.topRightCorner, cp.bottomRightCorner, cp.bottomLeftCorner];
    // sanity: the quad must cover a meaningful part of the photo
    if (quadArea(pts) < imageData.width * imageData.height * 0.06) return null;
    return pts.map(function (p) { return { x: p.x, y: p.y }; });
  } catch (e) { return null; } finally {
    try { contour && contour.delete && contour.delete(); } catch (e) {}
    try { mat && mat.delete(); } catch (e) {}
  }
}
function detect(imageData) {
  const jq = detectWithJscanify(imageData);
  if (jq) return orderCorners(jq);
  return detectCustom(imageData);
}
function detectCustom(imageData) {
  const cv = self.cv;
  const imgArea = imageData.width * imageData.height;
  let src, gray, blur, kernel;
  try {
    src = cv.matFromImageData(imageData);
    gray = new cv.Mat(); blur = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    // Several strategies — real photos vary hugely in lighting/contrast
    const attempts = [
      function (edges) { cv.Canny(blur, edges, 50, 150); },
      function (edges) { cv.Canny(blur, edges, 25, 80); },
      function (edges) { cv.threshold(blur, edges, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU); },
    ];
    for (let a = 0; a < attempts.length; a++) {
      const edges = new cv.Mat();
      attempts[a](edges);
      cv.dilate(edges, edges, kernel);
      const quad = findQuad(edges, imgArea);
      edges.delete();
      if (quad) return orderCorners(quad);
    }
    return null;
  } finally {
    [src, gray, blur, kernel].forEach(function (m) { try { m && m.delete(); } catch (e) {} });
  }
}
function dist2(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
// PURE-JS perspective warp (Heckbert square->quad homography + bilinear
// sampling). No OpenCV, no transferable buffers — nothing device-specific
// left to fail. Runs in this worker so the UI never blocks.
function warp(imageData, corners) {
  const tl = corners[0], tr = corners[1], br = corners[2], bl = corners[3];
  let W = Math.max(32, Math.round(Math.max(dist2(tl, tr), dist2(bl, br))));
  let H = Math.max(32, Math.round(Math.max(dist2(tl, bl), dist2(tr, br))));
  const cap = 2600, s = Math.min(1, cap / Math.max(W, H));
  W = Math.round(W * s); H = Math.round(H * s);
  // Homography mapping unit square -> source quad (q0=tl q1=tr q2=br q3=bl)
  const q0 = tl, q1 = tr, q2 = br, q3 = bl;
  const dx1 = q1.x - q2.x, dx2 = q3.x - q2.x, dy1 = q1.y - q2.y, dy2 = q3.y - q2.y;
  const sx = q0.x - q1.x + q2.x - q3.x, sy = q0.y - q1.y + q2.y - q3.y;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  const a = q1.x - q0.x + g * q1.x, b = q3.x - q0.x + h * q3.x, c = q0.x;
  const d = q1.y - q0.y + g * q1.y, e = q3.y - q0.y + h * q3.y, f = q0.y;
  const sw = imageData.width, sh = imageData.height, sd = imageData.data;
  const out = new Uint8ClampedArray(W * H * 4);
  const maxX = sw - 2, maxY = sh - 2;
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const bv = b * v + c, ev = e * v + f, hv = h * v + 1;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const denom = g * u + hv;
      let sxf = (a * u + bv) / denom;
      let syf = (d * u + ev) / denom;
      if (sxf < 0) sxf = 0; else if (sxf > maxX) sxf = maxX;
      if (syf < 0) syf = 0; else if (syf > maxY) syf = maxY;
      const x0 = sxf | 0, y0 = syf | 0;
      const fx = sxf - x0, fy = syf - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const o = (y * W + x) * 4;
      out[o] = sd[i00] * w00 + sd[i10] * w10 + sd[i01] * w01 + sd[i11] * w11;
      out[o + 1] = sd[i00 + 1] * w00 + sd[i10 + 1] * w10 + sd[i01 + 1] * w01 + sd[i11 + 1] * w11;
      out[o + 2] = sd[i00 + 2] * w00 + sd[i10 + 2] * w10 + sd[i01 + 2] * w01 + sd[i11 + 2] * w11;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: W, height: H };
}
self.onmessage = async function (e) {
  const d = e.data;
  try {
    // 'warp' is pure JS — it must NEVER wait on (or fail with) OpenCV
    if (d.type === 'warp') {
      const out = warp(d.imageData, d.corners);
      self.postMessage({ id: d.id, ok: true, out: out });
      return;
    }
    await ensureReady(d.origin);
    if (d.type === 'warm') { self.postMessage({ id: d.id, ok: true }); return; }
    if (d.type === 'detect') { self.postMessage({ id: d.id, ok: true, corners: detect(d.imageData) }); return; }
  } catch (err) {
    self.postMessage({ id: d.id, ok: false, error: String((err && err.message) || err) });
  }
};
`

let _cvWorker = null
let _cvWorkerBroken = false
let _msgId = 0
const _pending = new Map()

function getCvWorker() {
  if (typeof window === 'undefined' || _cvWorkerBroken) return null
  if (_cvWorker) return _cvWorker
  try {
    const blob = new Blob([CV_WORKER_CODE], { type: 'application/javascript' })
    _cvWorker = new Worker(URL.createObjectURL(blob))
    _cvWorker.onmessage = (e) => {
      const p = _pending.get(e.data.id)
      if (p) { _pending.delete(e.data.id); p(e.data) }
    }
    _cvWorker.onerror = () => {
      for (const [, p] of _pending) p({ ok: false, error: 'worker crashed' })
      _pending.clear()
    }
  } catch { _cvWorker = null; _cvWorkerBroken = true }
  return _cvWorker
}

function cvCall(type, payload = {}, transfer = [], timeoutMs = 15000) {
  const w = getCvWorker()
  if (!w) return Promise.resolve({ ok: false, error: 'no worker support' })
  const id = ++_msgId
  return new Promise((resolve) => {
    const timer = setTimeout(() => { _pending.delete(id); resolve({ ok: false, error: 'timeout' }) }, timeoutMs)
    _pending.set(id, (d) => { clearTimeout(timer); resolve(d) })
    try { w.postMessage({ id, type, origin: window.location.origin, ...payload }, transfer) }
    catch (e) { clearTimeout(timer); _pending.delete(id); resolve({ ok: false, error: String(e) }) }
  })
}

// Start compiling the engine in the background the moment Receipts opens, so
// it's usually ready before the user has even taken the photo.
function warmCvWorker() { cvCall('warm', {}, [], 60000) }

// ---------------------------------------------------------------------------
// Dynamsoft Mobile Document Scanner (commercial SDK, user-provided license):
// fullscreen LIVE viewfinder with real-time edge detection, auto-capture and
// auto perspective correction. Loaded on demand from CDN; the free scanner
// flow remains the fallback if the SDK or license ever fails.
// ---------------------------------------------------------------------------
const DDS_SRC = 'https://cdn.jsdelivr.net/npm/dynamsoft-document-scanner@1.3.1/dist/dds.bundle.js'
let _ddsPromise = null
function getDynamsoftScanner(license) {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  const key = license || process.env.NEXT_PUBLIC_DYNAMSOFT_LICENSE
  if (!key) return Promise.reject(new Error('no license configured'))
  if (!_ddsPromise) {
    _ddsPromise = new Promise((resolve, reject) => {
      const done = () => {
        try {
          if (!window.__swDds) {
            window.__swDds = new window.Dynamsoft.DocumentScanner({
              license: key,
              scannerViewConfig: {
                enableAutoCropMode: true,      // auto-crop to detected borders
                enableSmartCaptureMode: true,  // auto-capture when framed steady
              },
            })
          }
          resolve(window.__swDds)
        } catch (e) { reject(e) }
      }
      if (window.Dynamsoft?.DocumentScanner) return done()
      const s = document.createElement('script')
      s.src = DDS_SRC
      s.async = true
      s.onload = done
      s.onerror = () => { s.remove(); reject(new Error('scanner SDK failed to load')) }
      document.head.appendChild(s)
    }).catch((e) => { _ddsPromise = null; throw e })
  }
  return _ddsPromise
}

function orderCorners(pts) {
  const bySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y))
  const tl = bySum[0], br = bySum[3]
  const byDiff = [...pts].sort((a, b) => (a.y - a.x) - (b.y - b.x))
  const tr = byDiff[0], bl = byDiff[3]
  return [tl, tr, br, bl]
}

// Detection + perspective warp now run INSIDE the worker (see CV_WORKER_CODE)
// so the main thread — and the UI — never freezes.

// ---------------------------------------------------------------------------
// Image utilities
// ---------------------------------------------------------------------------
// A real JPEG dataUrl is always > ~200 chars; iOS returns "data:," when a
// canvas export fails (memory/size limits) — treat that as a failure.
const isValidImageDataUrl = (s) => typeof s === 'string' && /^data:image\//.test(s) && s.length > 200

function canvasToJpegSafe(canvas, quality, fallback) {
  try {
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      const s = canvas.toDataURL('image/jpeg', quality)
      if (isValidImageDataUrl(s)) return s
    }
  } catch { /* tainted / out-of-memory */ }
  return fallback
}

function fileToJpegDataUrl(file, maxSide = 2600, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        if (!img.width || !img.height) throw new Error('empty image')
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale))
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        URL.revokeObjectURL(url)
        const out = canvasToJpegSafe(c, quality, null)
        if (out) return resolve(out)
        // Canvas export failed (e.g. iOS memory limits) — hand back the raw file
        const r = new FileReader()
        r.onload = () => isValidImageDataUrl(r.result) ? resolve(r.result) : reject(new Error('Could not read that image'))
        r.onerror = () => reject(new Error('Could not read that image'))
        r.readAsDataURL(file)
      } catch { URL.revokeObjectURL(url); reject(new Error('Could not read that image')) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image — try a JPG or PNG photo')) }
    img.src = url
  })
}

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = () => reject(new Error('Could not read the file'))
  r.readAsDataURL(file)
})

const dataUrlToCanvas = (dataUrl) => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    c.getContext('2d').drawImage(img, 0, 0)
    resolve(c)
  }
  img.onerror = () => reject(new Error('Could not load image'))
  img.src = dataUrl
})

function scaleCanvas(src, maxSide) {
  const s = Math.min(1, maxSide / Math.max(src.width, src.height))
  if (s === 1) return src
  const c = document.createElement('canvas')
  c.width = Math.round(src.width * s); c.height = Math.round(src.height * s)
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height)
  return c
}

function rotateCanvas(src, dir) { // dir: 1 = clockwise, -1 = counter-clockwise
  const c = document.createElement('canvas')
  c.width = src.height; c.height = src.width
  const ctx = c.getContext('2d')
  ctx.translate(c.width / 2, c.height / 2)
  ctx.rotate(dir * Math.PI / 2)
  ctx.drawImage(src, -src.width / 2, -src.height / 2)
  return c
}

// ---------------------------------------------------------------------------
// ENHANCEMENT FILTER ENGINE — CamScanner-style, all client-side canvas math
// ---------------------------------------------------------------------------
// Divide-by-background: the classic doc-scanner trick — estimate the paper
// background with a heavy blur, divide the image by it. Kills shadows and
// uneven lighting while keeping ink crisp.
//
// IMPORTANT: iOS Safari < 18 silently ignores `ctx.filter = 'blur()'`, which
// used to make this divide the image by an UNBLURRED copy of itself —
// producing a uniform blank-grey scan. We feature-detect and fall back to a
// downscale→upscale blur that works in every browser.
// NOTE: we deliberately do NOT use ctx.filter='blur()' anywhere — Safari can
// silently ignore it even when the property reflects the assigned value.

// Heavy blur that works everywhere: shrink hard (bilinear averaging), bounce
// once at low-res, then scale back up with smoothing.
function portableBlur(canvas, radius) {
  const w = canvas.width, h = canvas.height
  const factor = Math.max(2, radius)
  const sw = Math.max(1, Math.round(w / factor)), sh = Math.max(1, Math.round(h / factor))
  const a = document.createElement('canvas'); a.width = sw; a.height = sh
  const actx = a.getContext('2d'); actx.imageSmoothingEnabled = true; actx.drawImage(canvas, 0, 0, sw, sh)
  const b = document.createElement('canvas'); b.width = Math.max(1, sw >> 1); b.height = Math.max(1, sh >> 1)
  const bctx2 = b.getContext('2d'); bctx2.imageSmoothingEnabled = true; bctx2.drawImage(a, 0, 0, b.width, b.height)
  const out = document.createElement('canvas'); out.width = w; out.height = h
  const octx = out.getContext('2d')
  octx.imageSmoothingEnabled = true
  try { octx.imageSmoothingQuality = 'high' } catch {}
  octx.drawImage(b, 0, 0, w, h)
  return out
}

function flattenIllumination(canvas, keepColor = true) {
  const w = canvas.width, h = canvas.height
  const radius = Math.max(8, Math.round(Math.max(w, h) / 40))
  // ALWAYS use the portable blur. Native ctx.filter blur is unreliable on
  // Safari (it can silently no-op even when the API "exists"), which made the
  // image divide by itself -> pure-white "blank" scans on iPhone.
  const bg = portableBlur(canvas, radius)
  const bctx = bg.getContext('2d')
  const out = document.createElement('canvas')
  out.width = w; out.height = h
  const octx = out.getContext('2d')
  octx.drawImage(canvas, 0, 0)
  const imgD = octx.getImageData(0, 0, w, h)
  const bgD = bctx.getImageData(0, 0, w, h)
  const d = imgD.data, b = bgD.data
  for (let i = 0; i < d.length; i += 4) {
    if (keepColor) {
      d[i] = Math.min(255, (d[i] / Math.max(1, b[i])) * 232)
      d[i + 1] = Math.min(255, (d[i + 1] / Math.max(1, b[i + 1])) * 232)
      d[i + 2] = Math.min(255, (d[i + 2] / Math.max(1, b[i + 2])) * 232)
    } else {
      const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      const by = Math.max(1, 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2])
      const v = Math.min(255, (y / by) * 232)
      d[i] = d[i + 1] = d[i + 2] = v
    }
  }
  octx.putImageData(imgD, 0, 0)
  return out
}

function mapPixels(canvas, fn) {
  const c = document.createElement('canvas')
  c.width = canvas.width; c.height = canvas.height
  const ctx = c.getContext('2d')
  ctx.drawImage(canvas, 0, 0)
  const img = ctx.getImageData(0, 0, c.width, c.height)
  fn(img.data)
  ctx.putImageData(img, 0, 0)
  return c
}

function meanLuma(canvas) {
  const s = scaleCanvas(canvas, 200)
  const ctx = s.getContext('2d')
  const d = ctx.getImageData(0, 0, s.width, s.height).data
  let sum = 0
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  return sum / (d.length / 4)
}

// Median brightness — robust against dark table-edges left around the crop
// (mean/std gets dragged down by borders and then wipes faint handwriting).
function lumaMedian(canvas) {
  const s = scaleCanvas(canvas, 200)
  const d = s.getContext('2d').getImageData(0, 0, s.width, s.height).data
  const hist = new Array(256).fill(0)
  const n = d.length / 4
  for (let i = 0; i < d.length; i += 4) {
    hist[Math.min(255, Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]))]++
  }
  let acc = 0
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n / 2) return v }
  return 255
}

// Auto levels: stretch each channel between its 2nd and 98th percentile
function autoLevels(canvas) {
  const s = scaleCanvas(canvas, 300)
  const sd = s.getContext('2d').getImageData(0, 0, s.width, s.height).data
  const hist = [new Array(256).fill(0), new Array(256).fill(0), new Array(256).fill(0)]
  for (let i = 0; i < sd.length; i += 4) { hist[0][sd[i]]++; hist[1][sd[i + 1]]++; hist[2][sd[i + 2]]++ }
  const n = sd.length / 4
  const lo = [], hi = []
  for (let ch = 0; ch < 3; ch++) {
    let acc = 0, l = 0, h = 255
    for (let v = 0; v < 256; v++) { acc += hist[ch][v]; if (acc >= n * 0.02) { l = v; break } }
    acc = 0
    for (let v = 255; v >= 0; v--) { acc += hist[ch][v]; if (acc >= n * 0.02) { h = v; break } }
    lo[ch] = l; hi[ch] = Math.max(h, l + 20)
  }
  return mapPixels(canvas, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.max(0, Math.min(255, ((d[i] - lo[0]) / (hi[0] - lo[0])) * 255))
      d[i + 1] = Math.max(0, Math.min(255, ((d[i + 1] - lo[1]) / (hi[1] - lo[1])) * 255))
      d[i + 2] = Math.max(0, Math.min(255, ((d[i + 2] - lo[2]) / (hi[2] - lo[2])) * 255))
    }
  })
}

// Brightness values at the given percentiles (0-100), from a small sample.
function lumaPercentilesOf(canvas, pcts) {
  const s = scaleCanvas(canvas, 200)
  const d = s.getContext('2d').getImageData(0, 0, s.width, s.height).data
  const hist = new Array(256).fill(0)
  const n = d.length / 4
  for (let i = 0; i < d.length; i += 4) {
    hist[Math.min(255, Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]))]++
  }
  return pcts.map(p => {
    const target = n * p / 100
    let acc = 0
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v }
    return 255
  })
}

// Linear contrast stretch through a lookup table: [lo..hi] -> [outLo..outHi].
// This is what makes a scan look "scanned" — ink towards black, paper to white.
function stretchLevels(canvas, lo, hi, outLo = 10, outHi = 251) {
  const lut = new Uint8ClampedArray(256)
  const range = Math.max(8, hi - lo)
  for (let v = 0; v < 256; v++) lut[v] = Math.max(0, Math.min(255, outLo + ((v - lo) * (outHi - outLo)) / range))
  return mapPixels(canvas, (d) => {
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]] }
  })
}

// Unsharp mask — sharpens text edges (the core of CamScanner's crispness).
function unsharp(canvas, radius = 2, amount = 0.8) {
  const blur = portableBlur(canvas, Math.max(2, radius))
  const bd = blur.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
  return mapPixels(canvas, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.max(0, Math.min(255, d[i] + amount * (d[i] - bd[i])))
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + amount * (d[i + 1] - bd[i + 1])))
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + amount * (d[i + 2] - bd[i + 2])))
    }
  })
}

// Neutralise colour cast: assume the paper is the median tone per channel and
// scale each channel so the paper becomes near-white.
function whiteBalance(canvas) {
  const s = scaleCanvas(canvas, 200)
  const d = s.getContext('2d').getImageData(0, 0, s.width, s.height).data
  const hists = [new Array(256).fill(0), new Array(256).fill(0), new Array(256).fill(0)]
  const n = d.length / 4
  for (let i = 0; i < d.length; i += 4) { hists[0][d[i]]++; hists[1][d[i + 1]]++; hists[2][d[i + 2]]++ }
  const med = hists.map(h => { let acc = 0; for (let v = 0; v < 256; v++) { acc += h[v]; if (acc >= n / 2) return v } return 255 })
  const f = med.map(m => Math.max(0.85, Math.min(1.7, 245 / Math.max(60, m))))
  return mapPixels(canvas, (dd) => {
    for (let i = 0; i < dd.length; i += 4) {
      dd[i] = Math.min(255, dd[i] * f[0])
      dd[i + 1] = Math.min(255, dd[i + 1] * f[1])
      dd[i + 2] = Math.min(255, dd[i + 2] * f[2])
    }
  })
}

export const RECEIPT_FILTERS = [
  { key: 'enhance', label: 'Enhance', emoji: '✨', hint: 'Recommended' },
  { key: 'original', label: 'Original', emoji: '🎞️', hint: 'True colour' },
  { key: 'magic', label: 'Magic Color', emoji: '🪄', hint: 'Auto colour fix' },
  { key: 'shadow', label: 'Shadow Fix', emoji: '💡', hint: 'Removes shadows' },
  { key: 'lighten', label: 'Lighten', emoji: '🌤️', hint: 'Brightens dark scans' },
  { key: 'grayscale', label: 'Grayscale', emoji: '⚪', hint: 'Full grayscale' },
  { key: 'bw', label: 'B&W', emoji: '⬛', hint: 'High contrast' },
  { key: 'eco', label: 'Eco', emoji: '🌿', hint: 'Low-ink print' },
  { key: 'nohand', label: 'No Handwriting', emoji: '🖨️', hint: 'Print only' },
]

function applyReceiptFilter(canvas, key) {
  switch (key) {
    case 'original': return canvas
    case 'grayscale': {
      const g = mapPixels(canvas, (d) => {
        for (let i = 0; i < d.length; i += 4) {
          const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
          d[i] = d[i + 1] = d[i + 2] = y
        }
      })
      const [p2, p90] = lumaPercentilesOf(g, [2, 90])
      return unsharp(stretchLevels(g, Math.min(p2, p90 - 40), Math.max(p90, p2 + 40), 5, 250), 2, 0.5)
    }
    case 'lighten':
      return mapPixels(canvas, (d) => {
        for (let i = 0; i < d.length; i += 4) {
          d[i] = 255 * Math.pow(d[i] / 255, 0.62)
          d[i + 1] = 255 * Math.pow(d[i + 1] / 255, 0.62)
          d[i + 2] = 255 * Math.pow(d[i + 2] / 255, 0.62)
        }
      })
    case 'shadow': {
      // Even out lighting but stay natural: flatten + gentle stretch
      const flat = flattenIllumination(canvas, true)
      const [p1, med] = lumaPercentilesOf(flat, [1, 55])
      return stretchLevels(flat, Math.min(p1, med - 30), med - 2, 6, 248)
    }
    case 'magic': {
      // CamScanner-style "Magic Color": neutralise cast so paper goes white,
      // punch contrast, restore colour, sharpen text
      const wb = whiteBalance(canvas)
      const [p2, p60] = lumaPercentilesOf(wb, [2, 60])
      const stretched = stretchLevels(wb, Math.min(p2, p60 - 40), Math.min(252, p60 + 6), 8, 251)
      const sat = mapPixels(stretched, (d) => {
        for (let i = 0; i < d.length; i += 4) {
          const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
          d[i] = Math.max(0, Math.min(255, y + (d[i] - y) * 1.3))
          d[i + 1] = Math.max(0, Math.min(255, y + (d[i + 1] - y) * 1.3))
          d[i + 2] = Math.max(0, Math.min(255, y + (d[i + 2] - y) * 1.3))
        }
      })
      return unsharp(sat, 2, 0.55)
    }
    case 'enhance': {
      // Flagship scan look: flatten shadows -> anchor paper (median) to white
      // and ink (1st percentile) towards black -> sharpen the text edges
      const flat = flattenIllumination(canvas, true)
      const [p1, med] = lumaPercentilesOf(flat, [1, 55])
      const stretched = stretchLevels(flat, Math.min(p1, med - 35), med - 3, 5, 252)
      return unsharp(stretched, 2, 0.85)
    }
    case 'bw': {
      const flat = flattenIllumination(canvas, false)
      // Median = paper brightness (robust vs dark borders); anything clearly
      // darker is ink — keeps faint pencil that fixed thresholds erased
      const thr = Math.min(224, Math.max(140, lumaMedian(flat) - 16))
      return mapPixels(flat, (d) => {
        for (let i = 0; i < d.length; i += 4) {
          const v = d[i] < thr ? 0 : 255
          d[i] = d[i + 1] = d[i + 2] = v
        }
      })
    }
    case 'eco': {
      const flat = flattenIllumination(canvas, false)
      const thr = Math.min(224, Math.max(140, lumaMedian(flat) - 16))
      return mapPixels(flat, (d) => {
        for (let i = 0; i < d.length; i += 4) {
          const v = d[i] < thr ? Math.min(140, d[i] + 70) : 255
          d[i] = d[i + 1] = d[i + 2] = v
        }
      })
    }
    case 'nohand': {
      // keep only strong printed ink; faint pen/pencil marks drop to white
      const flat = flattenIllumination(canvas, false)
      const thr = Math.min(160, Math.max(70, meanLuma(flat) * 0.5))
      return mapPixels(flat, (d) => {
        for (let i = 0; i < d.length; i += 4) {
          const v = d[i] < thr ? 0 : 255
          d[i] = d[i + 1] = d[i + 2] = v
        }
      })
    }
    default: return canvas
  }
}

// Stamp overlay (Reviewed / Approved / Paid) drawn on the top-right corner
const STAMP_OPTIONS = [
  { key: '', label: 'No stamp' },
  { key: 'REVIEWED', label: '✓ Reviewed', color: '#2563eb' },
  { key: 'APPROVED', label: '✓ Approved', color: '#059669' },
  { key: 'PAID', label: 'PAID', color: '#dc2626' },
]
function drawStamp(canvas, stampKey) {
  const meta = STAMP_OPTIONS.find(s => s.key === stampKey)
  if (!meta || !meta.key) return canvas
  const c = document.createElement('canvas')
  c.width = canvas.width; c.height = canvas.height
  const ctx = c.getContext('2d')
  ctx.drawImage(canvas, 0, 0)
  const fs = Math.max(18, Math.round(canvas.width / 12))
  ctx.save()
  ctx.translate(canvas.width - fs * 3.1, fs * 1.6)
  ctx.rotate(-0.16)
  ctx.globalAlpha = 0.8
  ctx.font = `bold ${fs}px Arial, sans-serif`
  ctx.textAlign = 'center'
  const tw = ctx.measureText(meta.key).width
  ctx.strokeStyle = meta.color
  ctx.lineWidth = Math.max(2, fs / 9)
  ctx.strokeRect(-tw / 2 - fs * 0.45, -fs * 0.95, tw + fs * 0.9, fs * 1.45)
  ctx.fillStyle = meta.color
  ctx.fillText(meta.key, 0, 0)
  ctx.restore()
  return c
}

// ---------------------------------------------------------------------------
// Crop editor — image + 4 draggable corner handles over an auto-detected quad
// ---------------------------------------------------------------------------
function CropEditor({ dataUrl, onDone, onRetake }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const [corners, setCorners] = useState(null)
  const [scale, setScale] = useState(1)
  const [detecting, setDetecting] = useState(true)
  const [applying, setApplying] = useState(false)
  const dragIdx = useRef(-1)
  const userMoved = useRef(false)   // once the user drags a corner, auto-detect must not override

  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.onload = async () => {
      if (cancelled) return
      const full = document.createElement('canvas')
      full.width = img.width; full.height = img.height
      full.getContext('2d').drawImage(img, 0, 0)
      imgRef.current = full
      const w = wrapRef.current?.clientWidth || 340
      const s = Math.min(w / img.width, 480 / img.height, 1)
      setScale(s)
      const cv2 = canvasRef.current
      cv2.width = Math.round(img.width * s); cv2.height = Math.round(img.height * s)
      cv2.getContext('2d').drawImage(img, 0, 0, cv2.width, cv2.height)
      const inset = 0.05
      const def = [
        { x: img.width * inset, y: img.height * inset },
        { x: img.width * (1 - inset), y: img.height * inset },
        { x: img.width * (1 - inset), y: img.height * (1 - inset) },
        { x: img.width * inset, y: img.height * (1 - inset) },
      ]
      setCorners(def)
      try {
        // Detection runs in the background worker — UI stays fully responsive.
        // 15s budget, then we silently keep the manual corners.
        const small = document.createElement('canvas')
        const ds = Math.min(1, 900 / Math.max(img.width, img.height))
        small.width = Math.round(img.width * ds); small.height = Math.round(img.height * ds)
        small.getContext('2d').drawImage(img, 0, 0, small.width, small.height)
        const idata = small.getContext('2d').getImageData(0, 0, small.width, small.height)
        const res = await cvCall('detect', { imageData: idata }, [], 15000)
        if (cancelled) return
        if (res.ok && res.corners && !userMoved.current) {
          setCorners(res.corners.map(p => ({ x: p.x / ds, y: p.y / ds })))
        } else if (res.ok && !res.corners && !userMoved.current) {
          toast.info('Couldn\'t auto-detect the edges — drag the corners to fit the receipt')
        } else if (!res.ok && !userMoved.current) {
          toast.info('Auto edge-detect took too long — drag the corners manually, or use the full photo')
        }
      } catch {
        if (!cancelled && !userMoved.current) toast.info('Auto edge-detect unavailable — drag the corners manually, or use the full photo')
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
    if (!img || !corners) return
    setApplying(true)
    try {
      let out = null
      // Perspective straighten in the worker — UI never freezes.
      // Downscale to 1600px first: quicker + far more reliable on phones.
      try {
        let srcCanvas = img
        let sCorners = orderCorners(corners)
        const sc = Math.min(1, 2600 / Math.max(img.width, img.height))
        if (sc < 1) {
          srcCanvas = scaleCanvas(img, 2600)
          sCorners = sCorners.map(p => ({ x: p.x * sc, y: p.y * sc }))
        }
        const ictx = srcCanvas.getContext('2d')
        const idata = ictx.getImageData(0, 0, srcCanvas.width, srcCanvas.height)
        // Plain structured clone (NO transferables) — identical to the proven
        // detection path; transfer-list quirks were breaking Safari
        const res = await cvCall('warp', { imageData: idata, corners: sCorners }, [], 15000)
        if (res.ok && res.out?.data) {
          out = document.createElement('canvas')
          out.width = res.out.width; out.height = res.out.height
          out.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(res.out.data), res.out.width, res.out.height), 0, 0)
        } else {
          // NEVER silent — the user must know the page was not straightened
          toast.warning('Couldn\'t straighten the page (' + (res.error || 'unknown') + ') — used a simple crop')
        }
      } catch { toast.warning('Couldn\'t straighten the page — used a simple crop') }
      if (!out) {
        // Simple bounding-box crop fallback (no perspective correction)
        const xs = corners.map(p => p.x), ys = corners.map(p => p.y)
        const x0 = Math.min(...xs), y0 = Math.min(...ys)
        const w = Math.max(...xs) - x0, h = Math.max(...ys) - y0
        out = document.createElement('canvas')
        out.width = Math.max(32, w); out.height = Math.max(32, h)
        out.getContext('2d').drawImage(img, x0, y0, w, h, 0, 0, out.width, out.height)
      }
      const result = canvasToJpegSafe(out, 0.92, null)
      if (!result) throw new Error('empty crop output')
      onDone(result)
    } catch {
      toast.error('Crop failed — using the full photo instead')
      onDone(dataUrl)
    } finally { setApplying(false) }
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
              onPointerDown={(e) => { e.preventDefault(); e.target.setPointerCapture?.(e.pointerId); dragIdx.current = i; userMoved.current = true }}
              className="absolute h-8 w-8 -ml-4 -mt-4 rounded-full bg-white border-[3px] border-emerald-500 shadow-md cursor-grab active:cursor-grabbing"
              style={{ left: s.x, top: s.y }} />
          )
        })}
        {detecting && (
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 bg-black/65 rounded-full px-3 py-1.5 flex items-center gap-2 text-white text-xs font-medium shadow-lg">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Detecting edges… you can drag the corners meanwhile
          </div>
        )}
      </div>
      <p className="text-xs text-center text-muted-foreground">Drag the green corners to fit the receipt exactly — it'll be straightened automatically.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" size="sm" onClick={onRetake} disabled={applying}><RefreshCw className="h-4 w-4 mr-1.5" /> Retake</Button>
        <Button variant="outline" size="sm" onClick={() => onDone(dataUrl)} disabled={applying}>Use full photo</Button>
        <Button size="sm" onClick={apply} disabled={applying} className="bg-emerald-600 hover:bg-emerald-700">
          {applying ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />} Next: enhance
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Enhance panel — filters, rotate, stamp, confirm (per page)
// ---------------------------------------------------------------------------
function EnhancePanel({ dataUrl, onDone, onBackToCrop, onRetake }) {
  const [baseCanvas, setBaseCanvas] = useState(null)   // rotated, full-res
  const [loadFailed, setLoadFailed] = useState(false)  // canvas pipeline broke — pass raw photo through
  const [filter, setFilter] = useState('enhance')
  const [stamp, setStamp] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [thumbs, setThumbs] = useState({})
  const [working, setWorking] = useState(true)

  // Load source
  useEffect(() => {
    let cancelled = false
    setLoadFailed(false)
    dataUrlToCanvas(dataUrl)
      .then(c => {
        if (cancelled) return
        if (!c.width || !c.height) throw new Error('empty canvas')
        setBaseCanvas(c)
      })
      .catch(() => {
        if (cancelled) return
        setLoadFailed(true); setWorking(false); setPreviewUrl(dataUrl)
        toast.info('Filters unavailable for this photo — it will be saved as-is')
      })
    return () => { cancelled = true }
  }, [dataUrl])

  // Filter thumbnails (zoomed centre-crop of the page — small but READABLE,
  // so each filter's effect on actual text is visible at a glance)
  useEffect(() => {
    if (!baseCanvas) return
    let cancelled = false
    const t = setTimeout(() => {
      const side = Math.min(baseCanvas.width, baseCanvas.height) * 0.6
      const sx = (baseCanvas.width - side) / 2
      const sy = Math.max(0, Math.min(baseCanvas.height - side, baseCanvas.height * 0.30 - side / 2))
      const small = document.createElement('canvas')
      small.width = 220; small.height = 220
      const sctx = small.getContext('2d')
      sctx.imageSmoothingEnabled = true
      try { sctx.imageSmoothingQuality = 'high' } catch {}
      sctx.drawImage(baseCanvas, sx, sy, side, side, 0, 0, 220, 220)
      const plain = canvasToJpegSafe(small, 0.8, dataUrl)
      const out = {}
      for (const f of RECEIPT_FILTERS) {
        try { out[f.key] = canvasToJpegSafe(applyReceiptFilter(small, f.key), 0.8, plain) } catch { out[f.key] = plain }
        if (cancelled) return
      }
      if (!cancelled) setThumbs(out)
    }, 30)
    return () => { cancelled = true; clearTimeout(t) }
  }, [baseCanvas]) // eslint-disable-line react-hooks/exhaustive-deps

  // Main preview (medium res so filters feel instant)
  useEffect(() => {
    if (!baseCanvas) return
    let cancelled = false
    setWorking(true)
    const t = setTimeout(() => {
      try {
        // FULL-resolution preview — what you pinch-zoom is exactly what gets
        // saved (only capped at 2600px to respect iOS canvas limits)
        const mid = Math.max(baseCanvas.width, baseCanvas.height) > 2600 ? scaleCanvas(baseCanvas, 2600) : baseCanvas
        let out = applyReceiptFilter(mid, filter)
        out = drawStamp(out, stamp)
        if (!cancelled) setPreviewUrl(canvasToJpegSafe(out, 0.85, dataUrl))
      } catch { if (!cancelled) setPreviewUrl(dataUrl) }
      if (!cancelled) setWorking(false)
    }, 30)
    return () => { cancelled = true; clearTimeout(t) }
  }, [baseCanvas, filter, stamp]) // eslint-disable-line react-hooks/exhaustive-deps

  const rotate = (dir) => { if (baseCanvas) setBaseCanvas(rotateCanvas(baseCanvas, dir)) }

  const confirm = () => {
    if (loadFailed || !baseCanvas) { onDone(dataUrl); return }  // pass the raw photo through untouched
    setWorking(true)
    setTimeout(() => {
      try {
        let out = applyReceiptFilter(baseCanvas, filter)   // FULL resolution
        out = drawStamp(out, stamp)
        const result = canvasToJpegSafe(out, 0.92, null)
        if (!result) throw new Error('empty output')
        onDone(result)
      } catch {
        toast.error('Enhancement failed — keeping the plain scan')
        onDone(dataUrl)
      }
    }, 30)
  }

  return (
    <div className="space-y-3">
      <div className="relative mx-auto w-fit max-w-full">
        {previewUrl
          ? <img src={previewUrl} alt="preview" className="max-h-[380px] max-w-full rounded-lg border shadow-sm bg-slate-50" />
          : <div className="h-64 w-48 rounded-lg border bg-slate-50" />}
        {working && (
          <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
      </div>

      {/* Filter strip — own contained horizontal scroll, isolated from page
          swipe/back gestures (touch-action: pan-x + overscroll containment) */}
      {!loadFailed && (
      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
        style={{ touchAction: 'pan-x', overscrollBehaviorX: 'contain', WebkitOverflowScrolling: 'touch' }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}>
        {RECEIPT_FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-lg border-2 p-1 transition ${filter === f.key ? 'border-emerald-500 bg-emerald-50' : 'border-transparent hover:border-slate-300'}`}>
            {thumbs[f.key]
              ? <img src={thumbs[f.key]} alt={f.label} className="h-16 w-16 object-cover rounded" />
              : <div className="h-16 w-16 rounded bg-slate-100 flex items-center justify-center text-lg">{f.emoji}</div>}
            <p className="text-[9px] font-semibold text-center mt-0.5 w-16 leading-tight">{f.label}</p>
          </button>
        ))}
      </div>
      )}

      {/* Rotate + stamp */}
      {!loadFailed && (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={() => rotate(-1)} title="Rotate left"><RotateCcw className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => rotate(1)} title="Rotate right"><RotateCw className="h-4 w-4" /></Button>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STAMP_OPTIONS.map(s => (
            <button key={s.key} type="button" onClick={() => setStamp(s.key)}
              className={`text-[11px] font-bold rounded-full border px-2.5 py-1 transition ${stamp === s.key ? 'ring-2 ring-emerald-400 ring-offset-1' : ''}`}
              style={s.key ? { color: s.color, borderColor: s.color } : {}}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {loadFailed && (
        <p className="text-xs text-center bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          This photo couldn't be processed by the enhancement engine on this device — it will be saved exactly as captured.
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onRetake}><RefreshCw className="h-4 w-4 mr-1.5" /> Retake</Button>
        <Button variant="outline" size="sm" onClick={onBackToCrop}>✂️ Crop</Button>
        <Button size="sm" onClick={confirm} disabled={working} className="bg-emerald-600 hover:bg-emerald-700">
          <Check className="h-4 w-4 mr-1.5" /> Keep this page
        </Button>
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
    } catch { /* fall through */ }
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
    } catch { /* fall through */ }
  }
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

// Build a multi-page PDF from scanned page images (client-side)
async function pagesToPdfDataUrl(pages) {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  for (const p of pages) {
    const bytes = await (await window.fetch(p)).arrayBuffer()
    const img = await doc.embedJpg(bytes)
    const page = doc.addPage([img.width, img.height])
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
  }
  const b64 = await doc.saveAsBase64()
  return `data:application/pdf;base64,${b64}`
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export function ReceiptsView({ currency }) {
  const sym = CURRENCY_SYMBOL[currency] || '£'
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [migrationMsg, setMigrationMsg] = useState('')

  // Add flow
  const [addOpen, setAddOpen] = useState(false)
  const [step, setStep] = useState('source')        // source | crop | enhance | details
  const [rawImage, setRawImage] = useState('')       // pre-crop dataUrl
  const [croppedImage, setCroppedImage] = useState('') // post-crop, pre-enhance
  const [pages, setPages] = useState([])             // finished page dataUrls
  const [pdfFile, setPdfFile] = useState('')         // uploaded PDF dataUrl
  const [aiBusy, setAiBusy] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrText, setOcrText] = useState('')
  const [saving, setSaving] = useState(false)
  const blankDetails = { supplier: '', receiptDate: todayStr(), amount: '', currency: currency || 'GBP', status: 'pending', color: '', notes: '' }
  const [details, setDetails] = useState(blankDetails)

  // View / edit one receipt
  const [viewing, setViewing] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [viewOcrBusy, setViewOcrBusy] = useState(false)

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
  useEffect(() => { load(); warmCvWorker() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let list = statusFilter === 'all' ? receipts : receipts.filter(r => r.status === statusFilter)
    const q = query.trim().toLowerCase()
    if (q) list = list.filter(r => `${r.supplier} ${r.notes} ${r.ocrText || ''}`.toLowerCase().includes(q))
    return list
  }, [receipts, statusFilter, query])

  // ---- Monthly totals (this month + last month + per-supplier) ----
  const totals = useMemo(() => {
    const now = new Date()
    const ym = (d) => (d || '').slice(0, 7)
    const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastM = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
    const sum = (list) => list.reduce((a, r) => a + (Number(r.amount) || 0), 0)
    const ofMonth = (m) => receipts.filter(r => ym(r.receiptDate || (r.createdAt || '')) === m)
    const cur = ofMonth(thisM)
    const bySupplier = {}
    for (const r of cur) {
      const k = r.supplier || 'Unknown'
      bySupplier[k] = (bySupplier[k] || 0) + (Number(r.amount) || 0)
    }
    const top = Object.entries(bySupplier).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4)
    return { thisTotal: sum(cur), thisCount: cur.length, lastTotal: sum(ofMonth(lastM)), top,
      monthLabel: now.toLocaleDateString('en-GB', { month: 'long' }), lastLabel: prev.toLocaleDateString('en-GB', { month: 'long' }) }
  }, [receipts])

  // ---- Add flow handlers ----
  const resetAdd = () => { setStep('source'); setRawImage(''); setCroppedImage(''); setPages([]); setPdfFile(''); setOcrText(''); setDetails({ ...blankDetails, currency: currency || 'GBP' }) }
  const openAdd = () => { resetAdd(); setAddOpen(true) }
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
      setPdfFile(dataUrl); setStep('details')
    } catch (e) { toast.error(e.message) }
  }
  const onCropped = (dataUrl) => { setCroppedImage(dataUrl); setStep('enhance') }

  // Dynamsoft LIVE scan: fullscreen viewfinder -> auto-capture -> already
  // cropped & straightened -> jump straight to our enhance/filter step.
  // License fetched at RUNTIME from the API (build-time env inlining failed
  // to reach production builds — this works on any deployment).
  const [liveScanBusy, setLiveScanBusy] = useState(false)
  const [ddsLicense, setDdsLicense] = useState(process.env.NEXT_PUBLIC_DYNAMSOFT_LICENSE || '')
  useEffect(() => {
    if (ddsLicense) return
    fetch('/api/config/scanner')
      .then(r => r.json())
      .then(d => { if (d?.dynamsoftLicense) setDdsLicense(d.dynamsoftLicense) })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const liveScan = async () => {
    if (liveScanBusy) return
    setLiveScanBusy(true)
    setAddOpen(false)   // our dialog would fight the fullscreen scanner UI
    try {
      const scanner = await getDynamsoftScanner(ddsLicense)
      const result = await scanner.launch()
      const img = result?.correctedImageResult
      if (img) {
        const canvas = img.toCanvas()
        const dataUrl = canvasToJpegSafe(canvas, 0.95, null)   // minimal compression on live-scan captures
        if (!dataUrl) throw new Error('empty scan output')
        setCroppedImage(dataUrl)
        setStep('enhance')
      }
      // user cancelled -> stay on source step
    } catch (e) {
      toast.error(`Live scanner unavailable (${e?.message || 'error'}) — use Take photo instead`)
    } finally {
      setLiveScanBusy(false)
      setAddOpen(true)
    }
  }
  const onPageDone = async (pageUrl) => {
    const isFirst = pages.length === 0
    setPages(prev => [...prev, pageUrl])
    setStep('details')
    if (!isFirst) return
    // AI reads the FIRST page's details automatically
    setAiBusy(true)
    try {
      const res = await fetch('/api/receipts/ai-extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: pageUrl }),
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
    } catch { /* silent */ } finally { setAiBusy(false) }
  }
  const movePage = (i, dir) => {
    setPages(prev => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  const removePage = (i) => setPages(prev => prev.filter((_, idx) => idx !== i))

  const runOcr = async () => {
    if (!pages.length) return
    setOcrBusy(true)
    try {
      const res = await fetch('/api/receipts/ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: pages[0] }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'OCR failed')
      setOcrText(d.text || '')
      toast.success(d.text ? 'Text extracted — receipts are now searchable by content' : 'No readable text found')
    } catch (e) { toast.error(e.message) } finally { setOcrBusy(false) }
  }

  const saveNew = async () => {
    if (!pages.length && !pdfFile && !details.supplier.trim() && details.amount === '') {
      toast.error('Add a scan/PDF, or at least a supplier name or amount'); return
    }
    setSaving(true)
    try {
      let dataUrl
      if (pdfFile) dataUrl = pdfFile
      else if (pages.length > 1) dataUrl = await pagesToPdfDataUrl(pages)
      else if (pages.length === 1) dataUrl = pages[0]
      const res = await fetch('/api/receipts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, ...details, amount: details.amount === '' ? null : Number(details.amount), ocrText }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not save the receipt')
      setReceipts(prev => [d, ...prev])
      setAddOpen(false)
      toast.success(pages.length > 1 ? `Receipt saved (${pages.length} pages) 🧾` : 'Receipt saved 🧾')
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  // ---- Edit / delete / OCR on existing ----
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
  const ocrExisting = async () => {
    if (!viewing?.fileUrl) return
    setViewOcrBusy(true)
    try {
      const res = await fetch('/api/receipts/ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: viewing.fileUrl }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'OCR failed')
      const put = await fetch(`/api/receipts/${viewing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ocrText: d.text || '' }),
      })
      const upd = await put.json().catch(() => ({}))
      if (put.ok) {
        setReceipts(prev => prev.map(x => x.id === upd.id ? upd : x))
        setViewing(v => v ? { ...v, ocrText: d.text || '' } : v)
      }
      toast.success(d.text ? 'Text extracted and saved' : 'No readable text found')
    } catch (e) { toast.error(e.message) } finally { setViewOcrBusy(false) }
  }

  // ---- Line items → inventory (AI extract, review, then bulk-add) ----
  const [itemsBusy, setItemsBusy] = useState(false)
  const [reviewItems, setReviewItems] = useState(null)   // null = dialog closed
  const [reviewSupplier, setReviewSupplier] = useState('')
  const [addingItems, setAddingItems] = useState(false)

  const extractItems = async (ref, supplier) => {
    if (!ref || itemsBusy) return
    setItemsBusy(true)
    try {
      const payload = String(ref).startsWith('data:') ? { dataUrl: ref } : { url: ref }
      const res = await fetch('/api/receipts/line-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'AI could not read the line items')
      const items = (Array.isArray(d.items) ? d.items : []).map(it => ({ ...it, _include: true }))
      if (!items.length) { toast.error('No product lines found on this receipt'); return }
      setReviewSupplier(supplier || '')
      setReviewItems(items)
    } catch (e) { toast.error(e.message) } finally { setItemsBusy(false) }
  }

  const updateReviewItem = (idx, patch) => {
    setReviewItems(prev => prev ? prev.map((it, i) => i === idx ? { ...it, ...patch } : it) : prev)
  }

  const addItemsToInventory = async () => {
    const chosen = (reviewItems || []).filter(i => i._include && String(i.name || '').trim())
    if (!chosen.length) { toast.error('Tick at least one item to add'); return }
    setAddingItems(true)
    try {
      const res = await fetch('/api/products/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: chosen.map(i => ({
            name: String(i.name).trim(),
            quantity: Number(i.quantity) > 0 ? Number(i.quantity) : 1,
            unit: i.unit || 'ea',
            category: String(i.category || '').trim(),
            supplier: reviewSupplier,
            ...(i.unitPrice != null && i.unitPrice !== '' ? { unitCost: Number(i.unitPrice) } : {}),
            source: 'receipt',
          })),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not add the items')
      toast.success(`${d.inserted} item${d.inserted === 1 ? '' : 's'} added to your inventory 📦`)
      setReviewItems(null)
    } catch (e) { toast.error(e.message) } finally { setAddingItems(false) }
  }

  // ---- Export ----
  const [expBasis, setExpBasis] = useState('receipt')   // 'receipt' (printed date) | 'scanned' (day it was added)
  const localDay = (ts) => { try { return ts ? new Date(ts).toLocaleDateString('en-CA') : '' } catch { return '' } }
  const setQuickRange = (kind) => {
    const now = new Date()
    const iso = (d) => d.toLocaleDateString('en-CA')
    if (kind === 'today') { setExpFrom(iso(now)); setExpTo(iso(now)) }
    if (kind === 'week') {
      const day = (now.getDay() + 6) % 7
      const mon = new Date(now); mon.setDate(now.getDate() - day)
      setExpFrom(iso(mon)); setExpTo(iso(now))
    }
    if (kind === 'month') { setExpFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1))); setExpTo(iso(now)) }
  }
  const inRange = useMemo(() => receipts.filter(r => {
    const d = expBasis === 'scanned'
      ? localDay(r.createdAt)
      : (r.receiptDate || localDay(r.createdAt))
    return d && d >= expFrom && d <= expTo
  }).sort((a, b) => String(a.receiptDate).localeCompare(String(b.receiptDate))), [receipts, expFrom, expTo, expBasis])

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
        <div className="text-sm bg-amber-50 border border-amber-300 text-amber-900 rounded-lg p-3">⚠️ {migrationMsg}</div>
      )}

      {/* ---- MONTHLY TOTALS ---- */}
      {receipts.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">{totals.monthLabel} total</p>
            <p className="text-lg font-bold text-emerald-900">{sym}{totals.thisTotal.toFixed(2)}</p>
            <p className="text-[10px] text-emerald-700">{totals.thisCount} receipt{totals.thisCount === 1 ? '' : 's'}</p>
          </div>
          <div className="bg-slate-50 border rounded-xl px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{totals.lastLabel} total</p>
            <p className="text-lg font-bold text-slate-800">{sym}{totals.lastTotal.toFixed(2)}</p>
            <p className="text-[10px] text-slate-500">{totals.thisTotal > totals.lastTotal ? '▲' : totals.thisTotal < totals.lastTotal ? '▼' : '—'} vs {totals.monthLabel}</p>
          </div>
          <div className="col-span-2 bg-white border rounded-xl px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Top suppliers · {totals.monthLabel}</p>
            {totals.top.length ? (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {totals.top.map(([name, amt]) => (
                  <span key={name} className="text-[11px] font-semibold bg-slate-100 rounded-full px-2 py-0.5">{name} <b className="text-emerald-700">{sym}{amt.toFixed(2)}</b></span>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground mt-1">No amounts recorded this month yet</p>}
          </div>
        </div>
      )}

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[{ key: 'all', label: `All (${receipts.length})` }, ...STATUS_OPTIONS.map(s => ({ key: s.key, label: `${s.label} (${receipts.filter(r => r.status === s.key).length})` }))].map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className={`text-xs font-semibold rounded-full px-3 py-1.5 border transition ${statusFilter === f.key ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white hover:border-emerald-400'}`}>
            {f.label}
          </button>
        ))}
        <div className="relative flex-1 min-w-[140px] max-w-[260px] ml-auto">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search supplier, notes, text…" className="h-8 pl-8 text-xs" />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
      ) : !filtered.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ReceiptText className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="font-medium">{receipts.length ? 'No receipts match' : 'No receipts yet'}</p>
          <p className="text-xs mt-1">{receipts.length ? 'Try a different filter or search' : 'Tap "Scan receipt" when a delivery arrives — no more paper piles for finance.'}</p>
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
                    {r.ocrText ? <span className="text-[10px] text-slate-400" title="Text extracted">🔍</span> : null}
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
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-emerald-600" /> Add receipt
              {pages.length > 0 && <span className="text-xs font-bold bg-emerald-100 text-emerald-800 rounded-full px-2 py-0.5">{pages.length} page{pages.length === 1 ? '' : 's'}</span>}
            </DialogTitle>
          </DialogHeader>

          {step === 'source' && (
            <div className="space-y-3 py-1">
              {!!ddsLicense && (
                <button type="button" onClick={liveScan} disabled={liveScanBusy}
                  className="w-full border-2 border-emerald-500 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition rounded-xl p-4 text-center text-white shadow-md">
                  <div className="text-3xl mb-1">{liveScanBusy ? '⏳' : '🎯'}</div>
                  <p className="font-bold text-sm">{liveScanBusy ? 'Opening live scanner…' : 'Live scan (recommended)'}</p>
                  <p className="text-[11px] text-emerald-100 mt-0.5">Real-time edge detection · auto-capture · auto-straighten</p>
                </button>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { onImagePicked(e.target.files?.[0]); e.target.value = '' }} />
                  <div className="border-2 border-dashed border-emerald-300 rounded-xl p-5 hover:border-emerald-500 hover:bg-emerald-50/40 transition cursor-pointer text-center h-full">
                    <div className="text-4xl mb-1">📷</div>
                    <p className="font-semibold text-sm">Take photo</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Auto edge-detect, deskew & enhance</p>
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
                {pages.length === 0 && (
                  <>
                    <label className="block">
                      <input type="file" accept="application/pdf" className="hidden" onChange={e => { onPdfPicked(e.target.files?.[0]); e.target.value = '' }} />
                      <div className="border-2 border-dashed border-purple-300 rounded-xl p-5 hover:border-purple-500 hover:bg-purple-50/40 transition cursor-pointer text-center h-full">
                        <div className="text-4xl mb-1">📄</div>
                        <p className="font-semibold text-sm">Upload PDF</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Digital invoice / emailed receipt</p>
                      </div>
                    </label>
                    <button type="button" onClick={() => { setStep('details') }}
                      className="border-2 border-dashed border-slate-300 rounded-xl p-5 hover:border-slate-500 hover:bg-slate-50 transition text-center h-full">
                      <div className="text-4xl mb-1">✍️</div>
                      <p className="font-semibold text-sm">Details only</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Damaged / missing receipt — record it anyway</p>
                    </button>
                  </>
                )}
              </div>
              {pages.length > 0 && (
                <Button variant="ghost" className="w-full" onClick={() => setStep('details')}><ArrowLeft className="h-4 w-4 mr-1.5" /> Back to details ({pages.length} page{pages.length === 1 ? '' : 's'} kept)</Button>
              )}
            </div>
          )}

          {step === 'crop' && rawImage && (
            <CropEditor dataUrl={rawImage} onDone={onCropped} onRetake={() => setStep('source')} />
          )}

          {step === 'enhance' && croppedImage && (
            <EnhancePanel dataUrl={croppedImage} onDone={onPageDone} onBackToCrop={() => setStep('crop')} onRetake={() => setStep('source')} />
          )}

          {step === 'details' && (
            <div className="space-y-3 py-1">
              {/* Page strip — counter, reorder, remove, add */}
              {pages.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex gap-2 overflow-x-auto pb-1"
                    style={{ touchAction: 'pan-x', overscrollBehaviorX: 'contain' }}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}>
                    {pages.map((p, i) => (
                      <div key={i} className="shrink-0 relative group">
                        <img src={p} alt={`page ${i + 1}`} className="h-24 w-20 object-cover rounded-lg border shadow-sm" />
                        <span className="absolute top-1 left-1 text-[9px] font-bold bg-black/60 text-white rounded px-1">{i + 1}/{pages.length}</span>
                        <div className="absolute bottom-1 inset-x-1 flex justify-between">
                          <button type="button" onClick={() => movePage(i, -1)} disabled={i === 0} className="h-5 w-5 rounded bg-white/90 border text-[10px] disabled:opacity-30 flex items-center justify-center"><ArrowLeft className="h-3 w-3" /></button>
                          <button type="button" onClick={() => removePage(i)} className="h-5 w-5 rounded bg-white/90 border text-red-500 flex items-center justify-center"><X className="h-3 w-3" /></button>
                          <button type="button" onClick={() => movePage(i, 1)} disabled={i === pages.length - 1} className="h-5 w-5 rounded bg-white/90 border text-[10px] disabled:opacity-30 flex items-center justify-center"><ArrowRight className="h-3 w-3" /></button>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={() => setStep('source')} className="shrink-0 h-24 w-20 rounded-lg border-2 border-dashed border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50/40 flex flex-col items-center justify-center text-emerald-700">
                      <span className="text-xl leading-none">＋</span>
                      <span className="text-[10px] font-semibold mt-0.5">Add page</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {aiBusy ? <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium"><Loader2 className="h-3.5 w-3.5 animate-spin" /> AI is reading the receipt…</span>
                      : <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-emerald-600" /> Check the AI-filled details</span>}
                    <button type="button" onClick={runOcr} disabled={ocrBusy} className="ml-auto inline-flex items-center gap-1 text-emerald-700 font-semibold underline-offset-2 hover:underline disabled:opacity-50">
                      {ocrBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanText className="h-3.5 w-3.5" />} {ocrText ? 'Re-extract text' : 'Extract text (OCR)'}
                    </button>
                  </div>
                  {ocrText && (
                    <details className="bg-slate-50 border rounded-lg px-3 py-2 text-xs">
                      <summary className="font-semibold cursor-pointer">🔍 Extracted text (saved with the receipt)</summary>
                      <pre className="mt-1.5 whitespace-pre-wrap max-h-32 overflow-y-auto text-[11px] text-slate-600">{ocrText}</pre>
                    </details>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => extractItems(pages[0], details.supplier)} disabled={itemsBusy}
                    className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                    {itemsBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackagePlus className="h-4 w-4 mr-2" />}
                    {itemsBusy ? 'AI is reading the items…' : 'Extract items → add to inventory'}
                  </Button>
                </div>
              )}
              {pdfFile && (
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
              {viewing.hasFile && viewing.fileType === 'image' && (
                viewing.ocrText ? (
                  <details className="bg-slate-50 border rounded-lg px-3 py-2 text-xs">
                    <summary className="font-semibold cursor-pointer">🔍 Extracted text</summary>
                    <pre className="mt-1.5 whitespace-pre-wrap max-h-36 overflow-y-auto text-[11px] text-slate-600">{viewing.ocrText}</pre>
                  </details>
                ) : (
                  <Button variant="outline" size="sm" onClick={ocrExisting} disabled={viewOcrBusy} className="w-full">
                    {viewOcrBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ScanText className="h-4 w-4 mr-2" />} Extract text (OCR) — makes this receipt searchable
                  </Button>
                )
              )}
              {viewing.hasFile && viewing.fileType === 'image' && viewing.fileUrl && (
                <Button variant="outline" size="sm" onClick={() => extractItems(viewing.fileUrl, viewing.supplier)} disabled={itemsBusy}
                  className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                  {itemsBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackagePlus className="h-4 w-4 mr-2" />}
                  {itemsBusy ? 'AI is reading the items…' : 'Extract items → add to inventory'}
                </Button>
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

      {/* ================= LINE ITEMS REVIEW DIALOG ================= */}
      <Dialog open={!!reviewItems} onOpenChange={(v) => { if (!v) setReviewItems(null) }}>
        <DialogContent className="sm:max-w-[680px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5 text-emerald-600" /> Review items before adding</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">AI read these product lines off the receipt. Untick anything you don't want, fix names/quantities, then add them to your inventory.</p>
          <div>
            <Label>Supplier (saved on every item)</Label>
            <Input value={reviewSupplier} onChange={e => setReviewSupplier(e.target.value)} placeholder="e.g. Bidfood" className="mt-1" />
          </div>
          <div className="space-y-2">
            {(reviewItems || []).map((it, i) => (
              <div key={i} className={`rounded-lg border p-2.5 ${it._include ? 'bg-white' : 'bg-slate-50 opacity-60'}`}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={!!it._include} onChange={e => updateReviewItem(i, { _include: e.target.checked })}
                    className="h-4 w-4 accent-emerald-600 shrink-0" />
                  <Input value={it.name} onChange={e => updateReviewItem(i, { name: e.target.value })} placeholder="Item name" className="h-8 text-sm font-medium" />
                </div>
                <div className="grid grid-cols-4 gap-1.5 mt-1.5 pl-6">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Qty</span>
                    <Input type="number" step="0.01" min="0" value={it.quantity} onChange={e => updateReviewItem(i, { quantity: e.target.value })} className="h-8 text-sm" />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Unit</span>
                    <select value={it.unit} onChange={e => updateReviewItem(i, { unit: e.target.value })}
                      className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm">
                      {['ea', 'kg', 'g', 'L', 'mL', 'bunch', 'pack', 'box'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Unit price ({sym})</span>
                    <Input type="number" step="0.01" min="0" value={it.unitPrice ?? ''} onChange={e => updateReviewItem(i, { unitPrice: e.target.value === '' ? null : e.target.value })} placeholder="—" className="h-8 text-sm" />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Category</span>
                    <Input value={it.category || ''} onChange={e => updateReviewItem(i, { category: e.target.value })} placeholder="e.g. Dairy" className="h-8 text-sm" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-xs text-muted-foreground">{(reviewItems || []).filter(i => i._include).length} of {(reviewItems || []).length} selected</p>
            <Button onClick={addItemsToInventory} disabled={addingItems || !(reviewItems || []).some(i => i._include)} className="bg-emerald-600 hover:bg-emerald-700">
              {addingItems ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackagePlus className="h-4 w-4 mr-2" />}
              Add {(reviewItems || []).filter(i => i._include).length} to inventory
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ================= EXPORT DIALOG ================= */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-emerald-600" /> Export receipts</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1.5 rounded-lg border p-1 bg-slate-50">
              <button type="button" onClick={() => setExpBasis('receipt')}
                className={`rounded-md px-2 py-2 text-xs font-semibold transition ${expBasis === 'receipt' ? 'bg-white shadow border border-emerald-300 text-emerald-800' : 'text-slate-500 hover:text-slate-700'}`}>
                🗓️ Receipt date
                <span className="block text-[10px] font-normal">date printed on the receipt</span>
              </button>
              <button type="button" onClick={() => setExpBasis('scanned')}
                className={`rounded-md px-2 py-2 text-xs font-semibold transition ${expBasis === 'scanned' ? 'bg-white shadow border border-emerald-300 text-emerald-800' : 'text-slate-500 hover:text-slate-700'}`}>
                📷 Date scanned
                <span className="block text-[10px] font-normal">day you added it to ShelfWise</span>
              </button>
            </div>
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
