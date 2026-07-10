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

export function PrintLogbookDialog({ open, onClose, kitchenName, kitchenType }) {
  // Escape user-controlled strings before injecting into the generated HTML
  const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  // Default: just today, single sheet
  const todayISO = new Date().toISOString().slice(0, 10)
  const [fromDate, setFromDate] = useState(todayISO)
  const [toDate, setToDate] = useState(todayISO)
  const [orientation, setOrientation] = useState('landscape')  // 'portrait' | 'landscape' — landscape gives roomier rows for handwriting (default per user request)
  const [rowsPerDay, setRowsPerDay] = useState(15)  // 15 rows landscape / 18 rows portrait — both give tall roomy rows for handwriting

  // Compute list of dates in the [fromDate .. toDate] inclusive range
  const dates = React.useMemo(() => {
    try {
      const start = new Date(fromDate)
      const end = new Date(toDate)
      if (isNaN(start) || isNaN(end)) return [new Date()]
      // Guard against reversed range
      if (end < start) return [start]
      // Hard cap: 31 days (a full month) to prevent runaway prints
      const list = []
      const cursor = new Date(start)
      while (cursor <= end && list.length < 31) {
        list.push(new Date(cursor))
        cursor.setDate(cursor.getDate() + 1)
      }
      return list
    } catch { return [new Date()] }
  }, [fromDate, toDate])

  const fmtDay = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const rows = Array.from({ length: Math.max(5, Math.min(100, Number(rowsPerDay) || 25)) })

  // Build a completely standalone, self-contained HTML document with inline CSS.
  // This is opened in a new window and printed from there — this bypasses ALL of
  // the modal / parent-CSS quirks on mobile Safari and Chrome print-to-PDF.
  const buildStandalonePrintHTML = () => {
    const sheetsHtml = dates.map((d, idx) => {
      const rowsHtml = rows.map((_, i) => `
        <tr>
          <td class="rownum">${i + 1}</td>
          <td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>
      `).join('')

      return `
      <section class="sheet ${idx > 0 ? 'page-break' : ''}">
        <header class="sheet-head">
          <div class="brand">
            <div class="brand-title">🍳 ${escapeHtml(kitchenName || 'Kitchen')}</div>
            <div class="brand-sub">${kitchenType ? escapeHtml(kitchenType) + ' · ' : ''}Daily Inventory Logbook</div>
            <div class="brand-mini">powered by ShelfWise</div>
          </div>
          <div class="meta">
            <div class="meta-row"><span class="meta-label">Date:</span><span class="meta-value">${escapeHtml(fmtDay(d))}</span></div>
            <div class="meta-row"><span class="meta-label">Shift:</span><span class="meta-line">&nbsp;</span></div>
            <div class="meta-row"><span class="meta-label">Logged by:</span><span class="meta-line">&nbsp;</span></div>
          </div>
        </header>

        <div class="tip">📸 <b>End of shift:</b> Snap a photo of this completed sheet using ShelfWise → "Scan Logbook" and all items get added automatically. Write clearly!</div>

        <table class="grid">
          <thead>
            <tr>
              <th style="width:5%">#</th>
              <th style="width:34%">Product</th>
              <th style="width:9%">Qty</th>
              <th style="width:9%">Unit</th>
              <th style="width:16%">Expiry<br/><span class="hint">(DD/MM/YY)</span></th>
              <th style="width:14%">Storage</th>
              <th style="width:13%">Initials</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <div class="footer">Sheet ${idx + 1} of ${dates.length} · Units: ea/kg/g/L/mL/pack · Storage: Fridge (F) / Freezer (Fr) / Dry (D) / Ambient (A)</div>
      </section>`
    }).join('')

    // Adjust row height based on orientation:
    // Landscape has less vertical space so we still need generous rows for handwriting.
    // Both are 'wide' (roomy) compared to previous 20px — this fixes the "narrow rows" complaint.
    const rowHeightPt = orientation === 'landscape' ? 30 : 28
    // Landscape also lets us use a bigger font size since we have more horizontal room
    const bodyFontPt = orientation === 'landscape' ? 10 : 9

    return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kitchen Logbook — ${escapeHtml(kitchenName || 'Sheet')}</title>
<style>
  @page { size: A4 ${orientation}; margin: 6mm 5mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: #fff;
    color: #0f172a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    width: 100%;
  }
  .sheet {
    width: 100%;
    padding: 0;
    page-break-after: always;
  }
  .sheet:last-child { page-break-after: auto; }
  .page-break { page-break-before: always; }
  .sheet-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    border-bottom: 2.5pt solid #10b981;
    padding-bottom: 6px;
    margin-bottom: 6px;
  }
  .brand { flex: 1; min-width: 0; }
  .brand-title { font-size: ${orientation === 'landscape' ? '18pt' : '16pt'}; font-weight: 800; color: #065f46; line-height: 1.1; }
  .brand-sub { font-size: 9pt; color: #64748b; margin-top: 2px; }
  .brand-mini { font-size: 7.5pt; color: #94a3b8; margin-top: 1px; }
  .meta { min-width: 62mm; font-size: 9pt; color: #334155; }
  .meta-row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .meta-row:last-child { margin-bottom: 0; }
  .meta-label { color: #64748b; font-weight: 500; width: 22mm; flex-shrink: 0; }
  .meta-value { font-weight: 600; color: #0f172a; white-space: nowrap; }
  .meta-line { flex: 1; border-bottom: 0.75pt solid #64748b; height: 14px; }
  .tip {
    background: #ecfdf5;
    border: 0.75pt solid #a7f3d0;
    color: #065f46;
    padding: 4px 8px;
    font-size: 8.5pt;
    border-radius: 4px;
    margin-bottom: 6px;
    line-height: 1.3;
  }
  table.grid {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: ${bodyFontPt}pt;
  }
  table.grid th,
  table.grid td {
    border: 0.5pt solid #64748b;
    padding: 4px 5px;
    overflow: hidden;
    word-wrap: break-word;
    vertical-align: middle;
  }
  table.grid th {
    background: #f1f5f9;
    font-size: ${orientation === 'landscape' ? '9pt' : '8pt'};
    font-weight: 700;
    text-align: left;
    line-height: 1.15;
    height: 20pt;
  }
  table.grid th .hint { font-size: 6.5pt; font-weight: 400; color: #64748b; }
  table.grid td { height: ${rowHeightPt}pt; }
  table.grid td.rownum { text-align: center; color: #94a3b8; font-size: 8pt; }
  table.grid tr { page-break-inside: avoid; }
  .footer {
    text-align: center;
    color: #94a3b8;
    font-size: 7pt;
    margin-top: 4px;
  }
</style>
</head>
<body>
${sheetsHtml}
<script>
  window.addEventListener('load', function () {
    setTimeout(function () { window.print(); }, 300);
  });
</script>
</body></html>`
  }

  const handlePrint = () => {
    const html = buildStandalonePrintHTML()
    // Try opening a new window first (best on desktop + Android Chrome)
    const w = window.open('', '_blank')
    if (w && w.document) {
      w.document.open()
      w.document.write(html)
      w.document.close()
      return
    }
    // Fallback (iOS Safari sometimes blocks new windows): use a same-tab data blob
    try {
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      // Give iOS a moment; open in same tab
      window.location.href = url
    } catch (_) {
      // Last-resort: legacy in-page print (may have the previous quirks)
      setTimeout(() => window.print(), 100)
    }
  }

  // Quick-set helpers
  const applyQuick = (kind) => {
    const now = new Date(); now.setHours(0,0,0,0)
    if (kind === 'today') { setFromDate(todayISO); setToDate(todayISO); return }
    if (kind === 'week') {
      const end = new Date(now); end.setDate(end.getDate() + 6)
      setFromDate(todayISO); setToDate(end.toISOString().slice(0, 10)); return
    }
    if (kind === 'month') {
      const end = new Date(now); end.setDate(end.getDate() + 30)
      setFromDate(todayISO); setToDate(end.toISOString().slice(0, 10)); return
    }
  }

  if (!open) return null

  return (
    <>
      {/* Print-only CSS — SCOPED to the data table only + position:absolute on the sheet
          so hidden elements don't reserve blank space at the top of the printed page. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }
          body * { visibility: hidden !important; }
          .print-logbook-sheet, .print-logbook-sheet * { visibility: visible !important; }
          /* Absolutely position the sheet at top-left of the page so blank space
             from hidden ancestors is collapsed away. */
          .print-logbook-sheet {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            page-break-after: always;
            break-after: page;
          }
          .print-logbook-sheet + .print-logbook-sheet {
            /* On multi-day prints, second and later sheets stack normally via page breaks */
            position: relative !important;
          }
          .print-logbook-sheet:last-child { page-break-after: auto; break-after: auto; }
          /* Only the DATA table gets forced layout + borders — never touch the header block */
          .print-logbook-sheet .logbook-data-table {
            width: 100% !important;
            table-layout: fixed !important;
            font-size: 9pt !important;
            border-collapse: collapse !important;
          }
          .print-logbook-sheet .logbook-data-table th,
          .print-logbook-sheet .logbook-data-table td {
            padding: 2.5px 3px !important;
            overflow: hidden !important;
            border: 1px solid #64748b !important;
          }
          .print-logbook-sheet .logbook-data-table th {
            font-size: 7.5pt !important;
            line-height: 1.1 !important;
            white-space: normal !important;
            font-weight: 700 !important;
          }
          .print-logbook-sheet .logbook-data-table tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-hide { display: none !important; }
          @page { size: A4 portrait; margin: 8mm 6mm; }
        }
      `}} />
      <div className="fixed inset-0 z-[100] bg-slate-50 overflow-y-auto">
        {/* Top bar with Close + Date pickers + Print */}
        <div className="print-hide sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button
              onClick={onClose}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg shrink-0"
            >
              <X className="h-4 w-4" /> Close
            </button>
            <div className="text-sm font-semibold text-slate-700 shrink-0">
              📋 Daily Logbook — {dates.length} day{dates.length !== 1 ? 's' : ''}
            </div>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shrink-0"
            >
              <Printer className="h-4 w-4" /> Print / Save PDF
            </button>
          </div>

          {/* Date range picker row */}
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="min-w-[130px]">
              <Label className="text-[11px] text-slate-600">From</Label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9" />
            </div>
            <div className="min-w-[130px]">
              <Label className="text-[11px] text-slate-600">To</Label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9" />
            </div>
            <div className="min-w-[90px]">
              <Label className="text-[11px] text-slate-600">Rows / day</Label>
              <Input type="number" min="5" max="100" value={rowsPerDay} onChange={e => setRowsPerDay(Number(e.target.value) || 25)} className="h-9" />
            </div>
            {/* Orientation toggle — landscape gives wider rows for handwriting, portrait fits more rows per page */}
            <div className="min-w-[190px]">
              <Label className="text-[11px] text-slate-600">Page orientation</Label>
              <div className="flex h-9 rounded-md border border-slate-300 overflow-hidden">
                <button
                  type="button"
                  onClick={() => { setOrientation('portrait'); setRowsPerDay(18) }}
                  className={`flex-1 text-xs font-medium transition-colors ${orientation === 'portrait' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                >📄 Portrait</button>
                <button
                  type="button"
                  onClick={() => { setOrientation('landscape'); setRowsPerDay(15) }}
                  className={`flex-1 text-xs font-medium border-l border-slate-300 transition-colors ${orientation === 'landscape' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                >📃 Landscape</button>
              </div>
            </div>
            <div className="flex gap-1 ml-auto">
              <Button size="sm" variant="outline" onClick={() => applyQuick('today')} className="h-9 text-xs">Today only</Button>
              <Button size="sm" variant="outline" onClick={() => applyQuick('week')} className="h-9 text-xs">Next 7 days</Button>
              <Button size="sm" variant="outline" onClick={() => applyQuick('month')} className="h-9 text-xs">Next 30 days</Button>
            </div>
          </div>
          {dates.length > 7 && (
            <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              ⚠️ You're about to print <b>{dates.length} sheets</b>. Make sure your printer has enough paper — or use "Save as PDF" first to review.
            </div>
          )}
        </div>

        {/* Render ONE printable sheet per date */}
        {dates.map((d, idx) => (
          <div key={idx} className="print-logbook-sheet max-w-[820px] mx-auto bg-white p-6 md:p-10 my-4 shadow print:shadow-none print:my-0 print:max-w-none">
            {/* Header — simple 2-column flex layout, no nested tables so nothing can overlap */}
            <div className="border-b-[3px] border-emerald-500 pb-3 mb-3 flex items-start justify-between gap-6">
              {/* LEFT — brand block */}
              <div className="flex-1 min-w-0">
                <div className="text-[20px] font-extrabold text-emerald-800 leading-tight">🍳 {kitchenName}</div>
                <div className="text-[10.5px] text-slate-500 mt-1">
                  {kitchenType ? `${kitchenType} • ` : ''}Daily Inventory Logbook
                </div>
                <div className="text-[9.5px] text-slate-400 mt-0.5">powered by ShelfWise</div>
              </div>
              {/* RIGHT — form fields as plain divs with fixed width, right-aligned */}
              <div className="text-[10.5px] text-slate-700 shrink-0" style={{ minWidth: '250px' }}>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-slate-500 font-medium w-[70px]">Date:</span>
                  <span className="font-semibold text-slate-900 whitespace-nowrap">{fmtDay(d)}</span>
                </div>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-slate-500 font-medium w-[70px]">Shift:</span>
                  <span className="flex-1 border-b border-slate-400 h-4">&nbsp;</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-slate-500 font-medium w-[70px]">Logged by:</span>
                  <span className="flex-1 border-b border-slate-400 h-4">&nbsp;</span>
                </div>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-[11px] text-emerald-800 mb-3">
              📸 <b>End of shift:</b> Snap a photo of this completed sheet using ShelfWise → "Scan Logbook" and all items get added automatically. Write clearly!
            </div>

            <table className="w-full border-collapse text-[11.5px] logbook-data-table" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th className="border border-slate-400 bg-slate-100 px-1.5 py-1.5 text-left text-slate-700 text-[11px]" style={{ width: '5%' }}>#</th>
                  <th className="border border-slate-400 bg-slate-100 px-1.5 py-1.5 text-left text-slate-700 text-[11px]" style={{ width: '34%' }}>Product</th>
                  <th className="border border-slate-400 bg-slate-100 px-1.5 py-1.5 text-left text-slate-700 text-[11px]" style={{ width: '9%' }}>Qty</th>
                  <th className="border border-slate-400 bg-slate-100 px-1.5 py-1.5 text-left text-slate-700 text-[11px]" style={{ width: '9%' }}>Unit</th>
                  <th className="border border-slate-400 bg-slate-100 px-1.5 py-1.5 text-left text-slate-700 text-[11px]" style={{ width: '16%' }}>Expiry<br/><span className="text-[9px] font-normal">(DD/MM/YY)</span></th>
                  <th className="border border-slate-400 bg-slate-100 px-1.5 py-1.5 text-left text-slate-700 text-[11px]" style={{ width: '14%' }}>Storage</th>
                  <th className="border border-slate-400 bg-slate-100 px-1.5 py-1.5 text-left text-slate-700 text-[11px]" style={{ width: '13%' }}>Initials</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((_, i) => (
                  <tr key={i}>
                    <td className="border border-slate-400 px-1.5 py-2 text-center text-slate-400">{i + 1}</td>
                    <td className="border border-slate-400 px-1.5 py-2 h-7"></td>
                    <td className="border border-slate-400 px-1.5 py-2 h-7"></td>
                    <td className="border border-slate-400 px-1.5 py-2 h-7"></td>
                    <td className="border border-slate-400 px-1.5 py-2 h-7"></td>
                    <td className="border border-slate-400 px-1.5 py-2 h-7"></td>
                    <td className="border border-slate-400 px-1.5 py-2 h-7"></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[10px] text-slate-400 text-center mt-2">
              Units: ea / kg / g / L / mL / pack / bunch / box • Storage: Fridge (F) / Freezer (Fr) / Dry (D) / Ambient (A) • Sheet {idx + 1} of {dates.length}
            </div>
          </div>
        ))}

        {/* Bottom close button (mobile-friendly) */}
        <div className="print-hide max-w-[820px] mx-auto px-6 pb-8">
          <button
            onClick={onClose}
            className="w-full py-3 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50"
          >
            ← Close and return to ShelfWise
          </button>
        </div>
      </div>
    </>
  )
}

