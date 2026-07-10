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

export function QuickCheckDialog({ open, onClose, locations, currentUser, onDone }) {
  // Log AM+PM temps for ALL fridges in ONE form. No modal-hopping.
  const [when, setWhen] = useState('now')  // 'am' | 'pm' | 'now'
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [values, setValues] = useState({})  // { [locId]: '4.2' }
  const [saving, setSaving] = useState(false)
  const activeLocs = React.useMemo(() => (locations || []).filter(l => l && l.active !== false && l.name), [locations])

  // Reset form each time dialog opens
  useEffect(() => { if (open) { setValues({}); setWhen('now'); setDate(new Date().toISOString().slice(0, 10)) } }, [open])

  const timeStr = when === 'am' ? '08:00' : when === 'pm' ? '17:00' : new Date().toTimeString().slice(0, 5)
  const timeOfDay = when === 'am' ? 'morning' : when === 'pm' ? 'evening' : (new Date().getHours() < 12 ? 'morning' : 'evening')

  const passFor = (loc, val) => {
    const t = loc.type || 'fridge'
    if (t === 'fridge') return val >= 0 && val <= 5
    if (t === 'chiller') return val >= 0 && val <= 8
    if (t === 'freezer') return val <= -15
    if (t === 'hot_hold') return val >= 63
    return true
  }

  const saveAll = async () => {
    const entries = Object.entries(values).filter(([, v]) => String(v).trim() !== '')
    if (entries.length === 0) { toast.error('Enter at least one temperature'); return }
    setSaving(true)
    const recordedAt = `${date}T${timeStr}:00Z`
    let ok = 0, fail = 0
    for (const [locId, raw] of entries) {
      const loc = activeLocs.find(l => l.id === locId)
      if (!loc) continue
      const val = Number(String(raw).replace(',', '.'))
      if (!Number.isFinite(val)) { fail++; continue }
      try {
        const res = await fetch('/api/haccp/temperatures', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: loc.name,
            temperatureC: val,
            isPass: passFor(loc, val),
            recordedAt,
            recordedBy: currentUser,
            notes: '',
          }),
        })
        if (res.ok) ok++; else fail++
      } catch { fail++ }
    }
    setSaving(false)
    if (ok > 0) toast.success(`Saved ${ok} reading${ok > 1 ? 's' : ''}${fail > 0 ? ` (${fail} failed)` : ''}`)
    else toast.error('Nothing was saved')
    onDone()
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>⚡ Quick temperature check</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">Type today's temps for every fridge & freezer in one go. Tap Save at the bottom when done.</p>
        </DialogHeader>
        {activeLocs.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Thermometer className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No fridges/freezers configured.</p>
            <p className="text-xs mt-1">Add them in Settings → Fridges & Freezers first.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* When = AM / PM / Now */}
            <div className="flex items-center gap-2 flex-wrap bg-slate-50 border rounded-lg p-2">
              <Label className="text-xs shrink-0 pl-1">When:</Label>
              <div className="flex rounded border bg-white overflow-hidden">
                {[
                  { k: 'am', label: '🌅 AM (08:00)' },
                  { k: 'pm', label: '🌆 PM (17:00)' },
                  { k: 'now', label: '🕐 Now' },
                ].map(o => (
                  <button
                    key={o.k}
                    onClick={() => setWhen(o.k)}
                    className={`px-2.5 py-1 text-xs font-medium ${when === o.k ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                  >{o.label}</button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-1">
                <Label className="text-xs">Date:</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-7 text-xs w-32" />
              </div>
            </div>

            {/* One input per fridge — no modal hopping */}
            <div className="space-y-1.5">
              {activeLocs.map((loc, i) => {
                const raw = values[loc.id] ?? ''
                const val = raw === '' ? null : Number(String(raw).replace(',', '.'))
                const finite = val !== null && Number.isFinite(val)
                const pass = finite ? passFor(loc, val) : null
                const icon = loc.type === 'freezer' ? '🥶' : loc.type === 'hot_hold' ? '🔥' : loc.type === 'chiller' ? '🧊' : '❄️'
                return (
                  <div key={loc.id || i} className="flex items-center gap-2 bg-white border rounded-lg px-2.5 py-2">
                    <span className="text-lg shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{loc.name}</div>
                      <div className="text-[10px] text-muted-foreground capitalize">{loc.type || 'fridge'}</div>
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      value={raw}
                      onChange={e => setValues(v => ({ ...v, [loc.id]: e.target.value }))}
                      placeholder="°C"
                      className={`w-20 text-right font-bold text-base ${pass === true ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : pass === false ? 'bg-red-50 text-red-900 border-red-300' : ''}`}
                    />
                    {finite && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${pass ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                        {pass ? 'PASS' : 'FAIL'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="text-[11px] text-muted-foreground bg-emerald-50/60 border border-emerald-100 rounded p-2">
              💡 Leave any fridge blank to skip it. You can log AM now and PM later.
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={saveAll} disabled={saving || activeLocs.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</> : <><Check className="h-4 w-4 mr-1" /> Save all</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TempLogbookView({ temps, haccpLocations, onLog, onScan, onEdit, onDelete, onBulkDelete, onAddOrphans, onCellSave, onQuickCheck, formatDT }) {
  // Inline cell editing state — [locName, dateISO, slot] identifies the cell being edited
  const [editingCell, setEditingCell] = useState(null)  // {loc, dateISO, slot, value}
  const [savingCell, setSavingCell] = useState(false)
  // Multi-select for List view bulk delete
  const [selectedTempIds, setSelectedTempIds] = useState(new Set())
  // View mode: 'logbook' = pivoted grid like physical log sheet; 'list' = compact chronological list
  const [mode, setMode] = useState('logbook')
  // Week navigation — Monday of the currently-viewed week (UK convention)
  const getMonday = (d) => {
    const x = new Date(d)
    const day = x.getDay() // 0=Sun,1=Mon,...6=Sat
    const diff = day === 0 ? -6 : 1 - day
    x.setDate(x.getDate() + diff)
    x.setHours(0, 0, 0, 0)
    return x
  }
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))

  const days = React.useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart); d.setDate(d.getDate() + i); return d
    })
  }, [weekStart])
  const weekLabel = `${days[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${days[6].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`

  // Rows in the logbook grid = the user's configured fridges/freezers.
  const configuredLocations = React.useMemo(() => {
    return (haccpLocations || []).filter(l => l && l.active !== false && l.name)
  }, [haccpLocations])

  // TIMEZONE-SAFE date key: format a Date's LOCAL calendar date as YYYY-MM-DD.
  // NEVER use toISOString() for day columns — in any non-UTC timezone it shifts
  // local midnight into the previous/next UTC day (bug: 10 Jul reading shown
  // under 11 Jul). Readings are stored as wall-clock strings ("...T17:00:00Z"),
  // so we also read their date/hour straight from the STRING, never via Date.
  const localDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const weekStartKey = localDateKey(days[0])
  const weekEndKey = localDateKey(days[6])

  // Also detect any locations in THIS week's readings that DON'T match any
  // configured fridge/freezer using AGGRESSIVE normalization to catch tiny
  // typos, extra spaces, hyphens, punctuation. "Ward Fridge" = "ward-fridge"
  // = "ward  fridge" = "Ward Fridge  " (trailing space).
  const normalizeName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const orphanLocations = React.useMemo(() => {
    const known = new Set(configuredLocations.map(l => normalizeName(l.name)))
    const found = new Map()
    ;(temps || []).forEach(t => {
      const dateKey = String(t.recordedAt || '').slice(0, 10)
      if (!dateKey || dateKey < weekStartKey || dateKey > weekEndKey) return
      const key = normalizeName(t.location)
      if (!key || known.has(key)) return
      if (!found.has(key)) {
        found.set(key, {
          id: `orphan-${key}`,
          name: t.location,
          type: t.temperatureC <= 0 ? 'freezer' : 'fridge',
          _orphan: true,
        })
      }
    })
    return [...found.values()]
  }, [configuredLocations, temps, weekStartKey, weekEndKey])

  // Combined for rendering — configured first, orphans after with a separator.
  const activeLocations = React.useMemo(() => {
    return [...configuredLocations, ...orphanLocations]
  }, [configuredLocations, orphanLocations])

  // Build cell map: readings[locName][YYYY-MM-DD][am|pm] = array of readings
  const readingsMap = React.useMemo(() => {
    const map = {}
    ;(temps || []).forEach(t => {
      const raw = String(t.recordedAt || '')
      const dateKey = raw.slice(0, 10)                 // wall-clock date exactly as saved
      if (!dateKey || dateKey < weekStartKey || dateKey > weekEndKey) return
      const hour = Number(raw.slice(11, 13) || '0')    // wall-clock hour exactly as saved
      const slot = hour < 12 ? 'am' : 'pm'
      const locKey = String(t.location || '').toLowerCase()
      if (!map[locKey]) map[locKey] = {}
      if (!map[locKey][dateKey]) map[locKey][dateKey] = { am: [], pm: [] }
      map[locKey][dateKey][slot].push(t)
    })
    return map
  }, [temps, weekStartKey, weekEndKey])

  // Compact author = initials (first + last) or first token before @ for emails
  const shortBy = (raw) => {
    if (!raw) return '—'
    const s = String(raw).trim()
    if (s.includes('@')) {
      const local = s.split('@')[0]
      return local.slice(0, 12) + (local.length > 12 ? '…' : '')
    }
    const parts = s.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return s.length > 12 ? s.slice(0, 12) + '…' : s
  }

  const shiftWeek = (delta) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + delta * 7); setWeekStart(d)
  }
  const goThisWeek = () => setWeekStart(getMonday(new Date()))

  // Print the weekly logbook. Options:
  //   blank: true → cells rendered empty (a blank template to fill in by hand)
  //   orientation: 'landscape' | 'portrait' (page orientation + column widths)
  // The preview page has its own orientation toggle so users can switch after opening.
  const printLogbook = ({ blank = false, orientation = 'landscape' } = {}) => {
    const w = window.open('', '_blank')
    if (!w) return
    const doc = w.document
    // For printed sheets, ONLY show user's configured fridges (not orphans).
    // Orphans are visible on-screen so the user can fix them, but they shouldn't
    // clutter the physical logbook / EHO records.
    const printLocs = configuredLocations
    const rows = printLocs.map(loc => {
      const key = loc.name.toLowerCase()
      const cells = days.map(d => {
        if (blank) return `<td>&nbsp;</td><td>&nbsp;</td>`  // empty template cells
        const dateKey = localDateKey(d)
        const cell = readingsMap[key]?.[dateKey] || { am: [], pm: [] }
        const fmt = (list) => list.length === 0 ? '&mdash;' : list.map(r => `${r.temperatureC}°`).join(', ')
        const amPass = cell.am.every(r => r.isPass !== false)
        const pmPass = cell.pm.every(r => r.isPass !== false)
        return `<td class="${cell.am.length && !amPass ? 'fail' : ''}">${fmt(cell.am)}</td><td class="${cell.pm.length && !pmPass ? 'fail' : ''}">${fmt(cell.pm)}</td>`
      }).join('')
      const typeIcon = loc.type === 'freezer' ? '🥶' : loc.type === 'hot_hold' ? '🔥' : loc.type === 'chiller' ? '🧊' : '❄️'
      return `<tr><td class="loc">${typeIcon} ${loc.name}</td>${cells}</tr>`
    }).join('')
    const dayHeaders = days.map(d => `<th colspan="2">${d.toLocaleDateString('en-GB', { weekday: 'short' })}<br/><span class="d">${d.getDate()}/${d.getMonth() + 1}</span></th>`).join('')
    const ampmHeaders = days.map(() => `<th>AM</th><th>PM</th>`).join('')
    const title = blank ? `Blank Temperature Log Template — ${weekLabel}` : `Weekly Temperature Log — ${weekLabel}`
    const subtitle = blank
      ? `Fill in temperatures throughout the week · then log them in the app later`
      : `HACCP compliance record · generated by ShelfWise on ${new Date().toLocaleString('en-GB')}`
    const noLocsMsg = printLocs.length === 0
      ? `<div style="padding:40px;text-align:center;color:#94a3b8;border:2px dashed #cbd5e1;border-radius:12px;margin-top:20px">
           <div style="font-size:32px;margin-bottom:8px">❄️🥶</div>
           <div style="font-weight:600;color:#0f172a;margin-bottom:4px">No fridges or freezers configured</div>
           <div style="font-size:12px">Add them in Settings → Fridges & Freezers first.</div>
         </div>`
      : ''

    doc.write(`<!doctype html><html><head><title>${title}</title>
<style>
  *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  body{margin:0;padding:20px;color:#0f172a;background:#f8fafc}
  h1{font-size:18px;margin:0 0 6px;color:#065f46}
  .sub{font-size:11px;color:#64748b;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;font-size:11px;background:#fff;table-layout:fixed}
  th,td{border:1px solid #cbd5e1;padding:6px 4px;text-align:center;word-break:break-word}
  th{background:#f0fdf4;font-weight:600;color:#065f46}
  th .d{font-size:9px;color:#64748b;font-weight:400;display:block;margin-top:2px}
  td.loc{text-align:left;font-weight:600;background:#f8fafc;color:#0f172a}
  td.fail{background:#fee2e2;color:#991b1b;font-weight:600}
  td{height:${blank ? '34px' : 'auto'}}
  .toolbar{position:sticky;top:0;background:#f8fafc;padding:12px 20px;margin:-20px -20px 14px;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;align-items:center;z-index:100;flex-wrap:wrap}
  .toolbar button{border:1px solid #cbd5e1;background:#fff;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;color:#0f172a;display:inline-flex;align-items:center;gap:6px}
  .toolbar button:hover{background:#f1f5f9}
  .toolbar .primary{background:#059669;color:#fff;border-color:#059669}
  .toolbar .primary:hover{background:#047857}
  .toolbar .active{background:#065f46;color:#fff;border-color:#065f46}
  .toolbar .group{display:inline-flex;gap:0;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;background:#fff}
  .toolbar .group button{border:0;border-radius:0;border-right:1px solid #cbd5e1}
  .toolbar .group button:last-child{border-right:0}
  .toolbar .spacer{flex:1}
  .toolbar .hint{font-size:11px;color:#64748b}
  .print-area{max-width:100%;overflow-x:auto}
  /* Portrait defaults (narrower page) */
  body.portrait table{font-size:9px}
  body.portrait td,body.portrait th{padding:3px 2px}
  body.portrait td.loc{font-size:9px}
  body.portrait td{height:${blank ? '28px' : 'auto'}}
  @media print{
    .toolbar,.no-print{display:none !important}
    body{padding:8px;background:#fff}
    @page{size:landscape;margin:8mm}
  }
  body.print-portrait{}
  @media print{
    body.print-portrait{ @page{size:portrait;margin:8mm} }
  }
</style></head><body class="${orientation === 'portrait' ? 'portrait print-portrait' : ''}">
<div class="toolbar no-print">
  <button onclick="closePreview()" title="Close this preview">← Close</button>
  <div class="group">
    <button id="btn-landscape" onclick="setOrientation('landscape')">🌐 Landscape</button>
    <button id="btn-portrait" onclick="setOrientation('portrait')">📄 Portrait</button>
  </div>
  <button class="primary" onclick="window.print()">🖨️ Print</button>
  <span class="spacer"></span>
  <span class="hint">${blank ? 'Blank template — fill in temperatures by hand.' : 'This preview does not affect your ShelfWise data.'}</span>
</div>
<h1>${blank ? '📋 ' : ''}${title}</h1>
<div class="sub">${subtitle}</div>
${noLocsMsg}
<div class="print-area">
${printLocs.length > 0 ? `<table>
  <thead>
    <tr><th rowspan="2" style="width:${orientation === 'portrait' ? '110px' : '160px'}">Location</th>${dayHeaders}</tr>
    <tr>${ampmHeaders}</tr>
  </thead>
  <tbody>${rows}</tbody>
</table>` : ''}
</div>
<script>
  var currentOrient = '${orientation}';
  function setOrientation(o){
    currentOrient = o;
    document.body.classList.remove('portrait','print-portrait');
    if(o === 'portrait'){ document.body.classList.add('portrait','print-portrait'); }
    document.getElementById('btn-landscape').classList.toggle('active', o === 'landscape');
    document.getElementById('btn-portrait').classList.toggle('active', o === 'portrait');
    // Inject a dynamic @page rule so browser print dialog picks it up
    var oldStyle = document.getElementById('page-orient');
    if(oldStyle) oldStyle.remove();
    var s = document.createElement('style');
    s.id = 'page-orient';
    s.textContent = '@media print{ @page { size: ' + o + '; margin: 8mm; } }';
    document.head.appendChild(s);
  }
  setOrientation(currentOrient);
  function closePreview(){
    try { window.close() } catch(_) {}
    setTimeout(() => {
      if (!window.closed) {
        if (window.history.length > 1) window.history.back();
        else document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#64748b"><h2>You can close this tab now.</h2><p>ShelfWise is still open in your previous tab.</p></div>';
      }
    }, 100);
  }
</script>
</body></html>`)
    doc.close()
  }

  return (
    <div className="space-y-3">
      {/* Header actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={onQuickCheck} className="bg-emerald-600 hover:bg-emerald-700">
          ⚡ Quick check
        </Button>
        <Button size="sm" variant="outline" onClick={onLog}>
          <Plus className="h-4 w-4 mr-1" /> Log one
        </Button>
        <Button size="sm" variant="outline" onClick={onScan} className="border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">
          📸 Scan sheet <span className="ml-1 text-[9px] font-bold bg-emerald-600 text-white rounded px-1">AI</span>
        </Button>
        <div className="ml-auto flex items-center gap-1 rounded-lg border bg-white p-0.5">
          <button
            onClick={() => setMode('logbook')}
            className={`px-3 py-1 text-xs font-medium rounded ${mode === 'logbook' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >📖 Logbook</button>
          <button
            onClick={() => setMode('list')}
            className={`px-3 py-1 text-xs font-medium rounded ${mode === 'list' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >📃 List</button>
        </div>
        {mode === 'logbook' && (
          <>
            <Button size="sm" variant="outline" onClick={() => printLogbook({ blank: false, orientation: 'landscape' })} title="Print filled logbook">
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button size="sm" variant="outline" onClick={() => printLogbook({ blank: true, orientation: 'landscape' })} title="Print a blank weekly template to fill by hand" className="border-slate-300">
              📋 Blank sheet
            </Button>
          </>
        )}
      </div>

      {temps.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">
          <Thermometer className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm mb-3">No temperature readings yet. Log your first one or scan a sheet to start building your record.</p>
          {activeLocations.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => printLogbook({ blank: true, orientation: 'landscape' })}>
              📋 Print blank weekly sheet
            </Button>
          )}
        </CardContent></Card>
      ) : mode === 'logbook' ? (
        <>
          {/* Week navigator */}
          <div className="flex items-center justify-between gap-2 bg-white border rounded-lg px-3 py-2">
            <Button size="sm" variant="ghost" onClick={() => shiftWeek(-1)}>← Prev</Button>
            <div className="text-center">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Week</div>
              <div className="text-sm font-bold text-slate-800">{weekLabel}</div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={goThisWeek}>Today</Button>
              <Button size="sm" variant="ghost" onClick={() => shiftWeek(1)}>Next →</Button>
            </div>
          </div>

          {/* Warning banner if orphan locations exist */}
          {orphanLocations.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2 text-[12px] text-amber-900">
                <span className="text-base leading-none">⚠️</span>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold block">{orphanLocations.length} reading{orphanLocations.length > 1 ? 's have' : ' has'} a location that doesn't match your saved fridges</span>
                  <span className="block text-amber-800 mt-0.5"><span className="font-mono text-[11px]">{orphanLocations.map(o => o.name).join(', ')}</span></span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap pl-6">
                {onAddOrphans && (
                  <Button
                    size="sm"
                    onClick={() => onAddOrphans(orphanLocations)}
                    className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    ✨ Add all {orphanLocations.length} to my fridges (one-tap fix)
                  </Button>
                )}
                <span className="text-[10px] text-amber-800">or edit each reading in List view</span>
              </div>
            </div>
          )}

          {/* Logbook grid */}
          {activeLocations.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
              No fridges/freezers configured yet.
              <br/>
              <span className="text-xs">Add them in Settings → Fridges & Freezers to see them here.</span>
            </CardContent></Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-emerald-50 text-emerald-800 border-b border-emerald-200">
                    <th rowSpan={2} className="sticky left-0 bg-emerald-50 text-left px-3 py-2 font-semibold w-44 min-w-[11rem] border-r border-emerald-200">Location</th>
                    {days.map((d, i) => {
                      const isToday = d.toDateString() === new Date().toDateString()
                      return (
                        <th key={i} colSpan={2} className={`px-1 py-1.5 font-semibold text-center border-l border-emerald-200 ${isToday ? 'bg-emerald-100' : ''}`}>
                          <div className="text-[10px] uppercase tracking-wide">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                          <div className="text-[10px] font-normal text-emerald-600">{d.getDate()}/{d.getMonth() + 1}</div>
                        </th>
                      )
                    })}
                  </tr>
                  <tr className="bg-emerald-50/60 text-[10px] text-emerald-700 border-b border-emerald-200">
                    {days.map((d, i) => (
                      <React.Fragment key={i}>
                        <th className="px-1 py-1 font-normal border-l border-emerald-200">AM</th>
                        <th className="px-1 py-1 font-normal">PM</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeLocations.map((loc, rowIdx) => {
                    const key = loc.name.toLowerCase()
                    const typeIcon = loc.type === 'freezer' ? '🥶' : loc.type === 'hot_hold' ? '🔥' : loc.type === 'chiller' ? '🧊' : '❄️'
                    const isOrphan = loc._orphan === true
                    return (
                      <tr key={loc.id || key} className={isOrphan ? 'bg-amber-50/60' : (rowIdx % 2 ? 'bg-slate-50/40' : 'bg-white')}>
                        <td className={`sticky left-0 bg-inherit px-3 py-2 font-semibold border-r border-slate-200 whitespace-nowrap ${isOrphan ? 'text-amber-900' : 'text-slate-800'}`}>
                          <span className="mr-1.5">{typeIcon}</span>{loc.name}
                          {isOrphan && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">Unmatched</span>}
                        </td>
                        {days.map((d, dIdx) => {
                          const dateKey = localDateKey(d)
                          const cell = readingsMap[key]?.[dateKey] || { am: [], pm: [] }
                          return (
                            <React.Fragment key={dIdx}>
                              {['am', 'pm'].map(slot => {
                                const list = cell[slot]
                                const isEditing = editingCell && editingCell.loc === loc.name && editingCell.dateISO === dateKey && editingCell.slot === slot
                                const commitCell = async () => {
                                  const raw = (editingCell?.value || '').trim()
                                  if (!raw) { setEditingCell(null); return }
                                  const val = Number(raw.replace(',', '.'))
                                  if (!Number.isFinite(val)) { setEditingCell(null); return }
                                  setSavingCell(true)
                                  try {
                                    await onCellSave({
                                      location: loc.name,
                                      dateISO: dateKey,
                                      timeOfDay: slot === 'am' ? 'morning' : 'evening',
                                      temperatureC: val,
                                    })
                                  } finally { setSavingCell(false); setEditingCell(null) }
                                }
                                // Editing mode — inline input in the cell
                                if (isEditing) {
                                  return (
                                    <td key={slot} className="p-0 border-l border-slate-100 bg-emerald-50">
                                      <input
                                        type="number"
                                        step="0.1"
                                        inputMode="decimal"
                                        autoFocus
                                        disabled={savingCell}
                                        value={editingCell.value}
                                        onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
                                        onBlur={commitCell}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') { e.preventDefault(); commitCell() }
                                          if (e.key === 'Escape') { setEditingCell(null) }
                                        }}
                                        className="w-full h-full text-center text-sm font-bold bg-emerald-50 text-emerald-900 outline-none border-0 focus:ring-2 focus:ring-emerald-400 focus:ring-inset px-1 py-1.5"
                                        placeholder="°C"
                                      />
                                    </td>
                                  )
                                }
                                // Empty cell — click to start inline editing
                                if (list.length === 0) return (
                                  <td
                                    key={slot}
                                    onClick={() => setEditingCell({ loc: loc.name, dateISO: dateKey, slot, value: '' })}
                                    className="px-1 py-1.5 text-center text-slate-300 hover:bg-emerald-50 hover:text-emerald-700 cursor-text border-l border-slate-100 transition-colors"
                                    title={`Type ${slot.toUpperCase()} reading for ${loc.name} on ${d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}`}
                                  ><span className="text-lg leading-none">+</span></td>
                                )
                                // Filled cell — click to open edit modal for the reading (finer control)
                                const allPass = list.every(r => r.isPass !== false)
                                return (
                                  <td
                                    key={slot}
                                    onClick={() => onEdit && onEdit(list[0])}
                                    className={`px-1 py-1.5 text-center border-l border-slate-100 font-semibold cursor-pointer hover:ring-2 hover:ring-emerald-400 transition-shadow ${allPass ? 'text-emerald-800 bg-emerald-50/70' : 'text-red-800 bg-red-50'}`}
                                    title={list.map(r => `${r.temperatureC}°C by ${r.recordedBy || 'unknown'} — tap to edit`).join('\n')}
                                  >
                                    {list.map(r => r.temperatureC).join(', ')}
                                  </td>
                                )
                              })}
                            </React.Fragment>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground pl-1 flex-wrap">
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-emerald-50 border border-emerald-200"></span> Pass</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-200"></span> Fail</span>
            <span className="inline-flex items-center gap-1"><span className="text-slate-400 font-bold">+</span> Click empty cell → type → Enter to save · <span className="text-emerald-700 font-medium">Click value to edit</span></span>
          </div>
        </>
      ) : (
        /* ==== LIST MODE — compact chronological cards with multi-select ==== */
        (() => {
          const toggleSelected = (id) => {
            setSelectedTempIds(prev => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id); else next.add(id)
              return next
            })
          }
          const list = temps.slice(0, 200)
          const allSelected = list.length > 0 && list.every(t => selectedTempIds.has(t.id))
          const toggleAll = () => {
            if (allSelected) setSelectedTempIds(new Set())
            else setSelectedTempIds(new Set(list.map(t => t.id)))
          }
          const bulkDelete = () => {
            if (selectedTempIds.size === 0) return
            const ids = [...selectedTempIds]
            setSelectedTempIds(new Set())
            // Single confirmation happens INSIDE onBulkDelete — no per-row prompts.
            onBulkDelete(ids)
          }
          return (
            <div className="space-y-1.5">
              {/* Multi-select toolbar */}
              {selectedTempIds.size > 0 && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 sticky top-0 z-10">
                  <span className="text-xs font-semibold text-red-800">{selectedTempIds.size} selected</span>
                  <div className="flex-1" />
                  <Button size="sm" variant="outline" onClick={() => setSelectedTempIds(new Set())} className="h-7 text-xs">Cancel</Button>
                  <Button size="sm" onClick={bulkDelete} className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white">
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete selected
                  </Button>
                </div>
              )}
              {/* Select all */}
              {list.length > 1 && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground pl-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 accent-emerald-600"
                  />
                  Select all ({list.length})
                </label>
              )}
              {list.map(t => {
                // Wall-clock display: read date/time straight from the stored
                // string — toLocale* would shift it in non-UTC timezones.
                const raw = String(t.recordedAt || '')
                const dtSafe = new Date(`${raw.slice(0, 10)}T12:00:00`)
                const dateStr = raw.length >= 10 ? dtSafe.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'
                const timeStr = raw.slice(11, 16) || '—'
                const pass = t.isPass !== false
                const isSelected = selectedTempIds.has(t.id)
                return (
                  <div key={t.id} className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 ${pass ? '' : 'border-red-200 bg-red-50/30'} ${isSelected ? 'ring-2 ring-red-300 bg-red-50/40' : ''}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(t.id)}
                      className="h-4 w-4 accent-emerald-600 shrink-0"
                      title="Select for bulk delete"
                    />
                    <div className="w-16 shrink-0">
                      <div className="text-[11px] font-semibold text-slate-800">{dateStr}</div>
                      <div className="text-[10px] text-muted-foreground">{timeStr}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{t.location}</div>
                      {t.notes && <div className="text-[10px] text-muted-foreground truncate">{t.notes}</div>}
                    </div>
                    <div className={`text-lg font-bold ${pass ? 'text-emerald-700' : 'text-red-700'} shrink-0`}>{t.temperatureC}°</div>
                    <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${pass ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                      {pass ? 'PASS' : 'FAIL'}
                    </div>
                    <div className={`text-[10px] text-muted-foreground shrink-0 w-16 truncate text-right`} title={t.recordedBy}>{shortBy(t.recordedBy)}</div>
                    <Button variant="ghost" size="icon" onClick={() => onEdit(t)} className="h-7 w-7 shrink-0" title="Edit">
                      <Pencil className="h-3.5 w-3.5 text-slate-500" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(t.id)} className="h-7 w-7 shrink-0" title="Delete">
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )
        })()
      )}
    </div>
  )
}

export function HaccpView({ currentUser, haccpLocations = [] }) {
  const [tab, setTab] = useState('temperatures')
  const [temps, setTemps] = useState([])
  const [tasks, setTasks] = useState([])
  const [cleanings, setCleanings] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(false)

  // Modals
  const [tempModal, setTempModal] = useState(null)      // {location?, temperatureC?}
  const [quickCheckOpen, setQuickCheckOpen] = useState(false) // one-shot "log all fridges for today"
  const [scanTempOpen, setScanTempOpen] = useState(false)  // AI-photo temperature log scanner
  const [scanTempImage, setScanTempImage] = useState(null) // data URL
  const [scanTempRotation, setScanTempRotation] = useState(0)
  const [scanTempBusy, setScanTempBusy] = useState(false)
  const [scanTempReadings, setScanTempReadings] = useState([]) // editable rows
  const [taskModal, setTaskModal] = useState(null)      // {task?, taskName?, area?, frequency?}
  const [cleanModal, setCleanModal] = useState(null)    // {task}
  const [deliveryModal, setDeliveryModal] = useState(null) // {supplier?, ...}

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, k, l, d] = await Promise.all([
        fetch('/api/haccp/temperatures').then(r => r.ok ? r.json() : []),
        fetch('/api/haccp/cleaning-tasks').then(r => r.ok ? r.json() : []),
        fetch('/api/haccp/cleaning-log').then(r => r.ok ? r.json() : []),
        fetch('/api/haccp/deliveries').then(r => r.ok ? r.json() : []),
      ])
      setTemps(Array.isArray(t) ? t : [])
      setTasks(Array.isArray(k) ? k : [])
      setCleanings(Array.isArray(l) ? l : [])
      setDeliveries(Array.isArray(d) ? d : [])
    } catch (e) {
      toast.error('Could not load compliance data — did you run migration-9?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ---- Save handlers ------------------------------------------------------
  // ---- AI-scan a physical HACCP temperature log sheet ----
  // Compress iPhone photos (typically 3-8MB) down to <1MB before sending.
  // Vercel serverless has a 4.5MB body limit → oversized photos = "Load failed".
  // Also downscales to max 1800px on the long edge for faster OCR.
  const compressImage = async (dataUrl, maxDim = 2400, quality = 0.85) => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        let w = img.width, h = img.height
        const longEdge = Math.max(w, h)
        if (longEdge > maxDim) {
          const scale = maxDim / longEdge
          w = Math.round(w * scale); h = Math.round(h * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = dataUrl
    })
  }
  // Split a wide (landscape) image into two overlapping halves — LEFT and RIGHT.
  // This lets us send each half to the AI in parallel so we fit inside Vercel's
  // function timeout even for very dense weekly sheets. Overlap ensures no cells
  // are missed at the split boundary.
  const splitImageInHalves = async (dataUrl) => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const w = img.width, h = img.height
        const overlap = Math.round(w * 0.1)  // 10% overlap in the middle
        const halfW = Math.round(w / 2)
        const makeHalf = (startX, endX) => {
          const canvas = document.createElement('canvas')
          canvas.width = endX - startX
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, startX, 0, endX - startX, h, 0, 0, endX - startX, h)
          return canvas.toDataURL('image/jpeg', 0.85)
        }
        const left = makeHalf(0, halfW + overlap)
        const right = makeHalf(halfW - overlap, w)
        resolve({ left, right })
      }
      img.onerror = reject
      img.src = dataUrl
    })
  }
  const applyImgRotation = async (dataUrl, deg) => {
    if (!deg) return dataUrl
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const isSide = deg === 90 || deg === 270
        canvas.width = isSide ? img.height : img.width
        canvas.height = isSide ? img.width : img.height
        const ctx = canvas.getContext('2d')
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate((deg * Math.PI) / 180)
        ctx.drawImage(img, -img.width / 2, -img.height / 2)
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }
      img.onerror = reject; img.src = dataUrl
    })
  }
  const runScanTemps = async () => {
    if (!scanTempImage) return
    setScanTempBusy(true)
    try {
      // Step 1: rotate (if user tapped 90°/270° buttons)
      const rotated = await applyImgRotation(scanTempImage, scanTempRotation)
      // Step 2: compress (2400px @ 0.85 quality)
      const compressed = await compressImage(rotated, 2400, 0.85)
      // Step 3: AUTO-SPLIT into 2 halves + send in PARALLEL. Each half is
      // half the pixels + half the readings → each Vercel call finishes in
      // 8-15 seconds instead of 60+ for the full sheet. Client merges results.
      const { left, right } = await splitImageInHalves(compressed)
      const callOne = async (imgPart, half) => {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 45000)
        try {
          const res = await fetch('/api/haccp/scan-temperatures', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imgPart }),
            signal: controller.signal,
          })
          if (!res.ok) return { readings: [], _half: half, _failed: true }
          const data = await res.json()
          return { ...data, _half: half }
        } catch { return { readings: [], _half: half, _failed: true } }
        finally { clearTimeout(timeoutId) }
      }
      // Run both halves in parallel
      const [leftResult, rightResult] = await Promise.all([
        callOne(left, 'left'),
        callOne(right, 'right'),
      ])
      // Merge readings, dedup on (location + dateISO + timeOfDay)
      const combined = [...(leftResult.readings || []), ...(rightResult.readings || [])]
      const seen = new Set()
      const list = []
      for (const r of combined) {
        const key = `${(r.location || '').toLowerCase()}|${r.dateISO}|${r.timeOfDay}`
        if (seen.has(key)) continue
        seen.add(key); list.push(r)
      }
      if (list.length === 0) {
        const bothFailed = leftResult._failed && rightResult._failed
        throw new Error(bothFailed
          ? 'AI could not read the sheet — please retake with better lighting and hold the phone directly above the sheet.'
          : 'No readings detected — try a clearer photo')
      }
      const fallbackDate = leftResult.weekCommencing || rightResult.weekCommencing || leftResult.sheetDate || rightResult.sheetDate || new Date().toISOString().slice(0, 10)
      setScanTempReadings(list.map(r => {
        const d = /^\d{4}-\d{2}-\d{2}$/.test(String(r.dateISO || '')) ? r.dateISO : fallbackDate
        const t = r.timeOfDay === 'morning' ? '08:00' : r.timeOfDay === 'evening' ? '17:00' : '12:00'
        return { ...r, recordedAt: `${d}T${t}:00Z`, _keep: true }
      }))
      const halfNote = (leftResult._failed || rightResult._failed) ? ' (one half failed — retake for the missing side)' : ''
      toast.success(`\u2728 ${list.length} readings detected${halfNote} — review & save`)
    } catch (e) { toast.error(e.message || 'Scan failed — try a clearer photo') }
    finally { setScanTempBusy(false) }
  }
  const saveScannedTemps = async () => {
    const keep = scanTempReadings.filter(r => r._keep && r.location && Number.isFinite(Number(r.temperatureC)))
    if (!keep.length) { toast.error('Nothing to save'); return }
    setScanTempBusy(true)
    try {
      let saved = 0
      for (const r of keep) {
        const res = await fetch('/api/haccp/temperatures', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: r.location,
            temperatureC: Number(r.temperatureC),
            isPass: r.isPass !== false,
            recordedAt: r.recordedAt,
            recordedBy: r.initials || currentUser,
            notes: r.notes || '',
          }),
        })
        if (res.ok) saved++
      }
      toast.success(`\u2705 Saved ${saved}/${keep.length} readings`)
      setScanTempOpen(false); setScanTempImage(null); setScanTempRotation(0); setScanTempReadings([])
      load()
    } catch (e) { toast.error(e.message) }
    finally { setScanTempBusy(false) }
  }


  const saveTemp = async (payload) => {
    try {
      // If payload has id → edit existing (PUT); otherwise create new (POST)
      const isEdit = !!payload.id
      const url = isEdit ? `/api/haccp/temperatures/${payload.id}` : '/api/haccp/temperatures'
      const method = isEdit ? 'PUT' : 'POST'
      const { id, ...body } = payload
      const res = await fetch(url, { method, body: JSON.stringify(body) })
      if (!res.ok) throw new Error('Save failed')
      toast.success(isEdit ? 'Reading updated' : 'Temperature logged')
      setTempModal(null); load()
    } catch (e) { toast.error(e.message) }
  }

  const saveTask = async (payload) => {
    try {
      const res = await fetch('/api/haccp/cleaning-tasks', { method: 'POST', body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('Save failed')
      toast.success('Task saved')
      setTaskModal(null); load()
    } catch (e) { toast.error(e.message) }
  }

  const markTaskDone = async (task, notes = '') => {
    try {
      const res = await fetch('/api/haccp/cleaning-log', {
        method: 'POST',
        body: JSON.stringify({ taskId: task.id, taskName: task.taskName, completedBy: currentUser, notes }),
      })
      if (!res.ok) throw new Error('Save failed')
      toast.success(`✓ ${task.taskName} — logged`)
      setCleanModal(null); load()
    } catch (e) { toast.error(e.message) }
  }

  const saveDelivery = async (payload) => {
    try {
      const res = await fetch('/api/haccp/deliveries', { method: 'POST', body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('Save failed')
      toast.success('Delivery check saved')
      setDeliveryModal(null); load()
    } catch (e) { toast.error(e.message) }
  }

  const deleteRow = async (kind, id, opts = {}) => {
    // Skip the per-row confirm when called from bulk delete (which already
    // asked once). Also skip the per-row toast so we can show one summary toast.
    if (!opts.silent && !confirm('Delete this record? This cannot be undone.')) return
    const url = kind === 'temperatures' ? `/api/haccp/temperatures/${id}`
              : kind === 'cleaning-tasks' ? `/api/haccp/cleaning-tasks/${id}`
              : kind === 'cleaning-log' ? `/api/haccp/cleaning-log/${id}`
              : `/api/haccp/deliveries/${id}`
    try {
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      if (!opts.silent) { toast.success('Deleted'); load() }
      return true
    } catch (e) { if (!opts.silent) toast.error(e.message); return false }
  }
  // Bulk delete — ONE confirm, ONE summary toast, ONE reload at the end.
  const bulkDelete = async (kind, ids) => {
    if (!ids || ids.length === 0) return
    if (!confirm(`Delete ${ids.length} record${ids.length > 1 ? 's' : ''}? This cannot be undone.`)) return
    let ok = 0, fail = 0
    for (const id of ids) {
      const success = await deleteRow(kind, id, { silent: true })
      if (success) ok++; else fail++
    }
    if (ok > 0) toast.success(`Deleted ${ok} record${ok > 1 ? 's' : ''}${fail > 0 ? ` (${fail} failed)` : ''}`)
    else toast.error('Nothing was deleted')
    load()
  }

  // ---- Report / Print ----------------------------------------------------
  const printReport = async () => {
    try {
      const res = await fetch('/api/haccp/export?days=30')
      if (!res.ok) throw new Error('Export failed')
      const data = await res.json()
      const w = window.open('', '_blank', 'width=900,height=700')
      if (!w) { toast.error('Popup blocked — allow popups to print report'); return }
      const fmt = (iso) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      const html = `
<!doctype html><html><head><title>HACCP Report — Last ${data.days} days</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; padding: 20px; color: #111; }
  h1 { border-bottom: 3px solid #059669; padding-bottom: 8px; margin: 0 0 8px; }
  h2 { color: #059669; margin-top: 30px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 600; }
  .fail { color: #b91c1c; font-weight: 600; }
  .pass { color: #059669; }
  .empty { color: #888; font-style: italic; padding: 8px 0; }
  @media print { body { padding: 10px; } h2 { break-before: auto; } table { break-inside: avoid; } }
</style></head><body>
<h1>HACCP Compliance Report</h1>
<div class="meta">Generated ${fmt(data.generatedAt)} · Covers last ${data.days} days · Powered by ShelfWise</div>

<h2>1) Temperature Log (${data.temperatures.length} records)</h2>
${data.temperatures.length === 0 ? '<div class="empty">No records for this period.</div>' : `
<table><thead><tr><th>Date/Time</th><th>Location</th><th>Temp (°C)</th><th>Result</th><th>Recorded by</th><th>Notes</th></tr></thead><tbody>
${data.temperatures.map(t => `<tr><td>${fmt(t.recordedAt)}</td><td>${t.location}</td><td>${t.temperatureC}</td><td class="${t.isPass ? 'pass' : 'fail'}">${t.isPass ? 'PASS' : 'FAIL'}</td><td>${t.recordedBy || ''}</td><td>${t.notes || ''}</td></tr>`).join('')}
</tbody></table>`}

<h2>2) Cleaning Schedule (${data.cleaningTasks.length} active tasks, ${data.cleaningLog.length} completions)</h2>
${data.cleaningLog.length === 0 ? '<div class="empty">No completions in this period.</div>' : `
<table><thead><tr><th>Date/Time</th><th>Task</th><th>Completed by</th><th>Notes</th></tr></thead><tbody>
${data.cleaningLog.map(c => `<tr><td>${fmt(c.completedAt)}</td><td>${c.taskName}</td><td>${c.completedBy || ''}</td><td>${c.notes || ''}</td></tr>`).join('')}
</tbody></table>`}

<h2>3) Delivery Inspections (${data.deliveries.length} records)</h2>
${data.deliveries.length === 0 ? '<div class="empty">No records for this period.</div>' : `
<table><thead><tr><th>Date/Time</th><th>Supplier</th><th>Temp (°C)</th><th>Temp OK</th><th>Pack OK</th><th>Labels OK</th><th>Result</th><th>Checked by</th><th>Notes</th></tr></thead><tbody>
${data.deliveries.map(d => `<tr><td>${fmt(d.deliveryDate)}</td><td>${d.supplier || ''}</td><td>${d.temperatureC != null ? d.temperatureC : '—'}</td><td>${d.temperatureOk ? '✓' : '✗'}</td><td>${d.packagingOk ? '✓' : '✗'}</td><td>${d.labelsOk ? '✓' : '✗'}</td><td class="${d.overallPass ? 'pass' : 'fail'}">${d.overallPass ? 'PASS' : 'FAIL'}</td><td>${d.checkedBy || ''}</td><td>${d.notes || ''}</td></tr>`).join('')}
</tbody></table>`}

<div style="margin-top:40px; font-size:11px; color:#666; border-top:1px solid #ddd; padding-top:8px;">
  This report was generated by ShelfWise · shelfwise.co.in · UK Food Standards Agency recommends retaining HACCP records for a minimum of 3 months.
</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),400)}</script>
</body></html>`
      w.document.write(html); w.document.close()
    } catch (e) { toast.error(e.message) }
  }

  // Group cleaning tasks by frequency, and check whether they're overdue today
  const todayISO = new Date().toISOString().slice(0, 10)
  const lastCompletionByTask = useMemo(() => {
    const m = {}
    for (const c of cleanings) {
      if (!m[c.taskId] || c.completedAt > m[c.taskId]) m[c.taskId] = c.completedAt
    }
    return m
  }, [cleanings])

  const isTaskDue = (task) => {
    const last = lastCompletionByTask[task.id]
    if (!last) return true
    const lastDate = new Date(last)
    const now = new Date()
    const days = (now - lastDate) / 86400000
    if (task.frequency === 'daily') return days >= 1
    if (task.frequency === 'weekly') return days >= 7
    if (task.frequency === 'monthly') return days >= 30
    return true
  }

  const formatDT = (iso) => {
    try { return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }
    catch { return iso }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">HACCP Compliance</h2>
          <p className="text-muted-foreground mt-1">Health & safety records for inspections</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={printReport}>
            <FileText className="h-4 w-4 mr-2" /> Print 30-day report
          </Button>
        </div>
      </div>

      {loading && <div className="text-sm text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin mr-2" />Loading…</div>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-2"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-emerald-700"><Thermometer className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">Temps (7d)</span></div>
          <div className="text-2xl font-bold mt-1">{temps.filter(t => (Date.now() - new Date(t.recordedAt)) < 7*86400000).length}</div>
          <div className="text-xs text-muted-foreground">{temps.filter(t => (Date.now() - new Date(t.recordedAt)) < 7*86400000 && !t.isPass).length} fails</div>
        </CardContent></Card>
        <Card className="border-2"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-emerald-700"><Droplets className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">Cleaning</span></div>
          <div className="text-2xl font-bold mt-1">{tasks.filter(t => isTaskDue(t)).length}</div>
          <div className="text-xs text-muted-foreground">due today</div>
        </CardContent></Card>
        <Card className="border-2"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-emerald-700"><Truck className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">Deliveries (7d)</span></div>
          <div className="text-2xl font-bold mt-1">{deliveries.filter(d => (Date.now() - new Date(d.deliveryDate)) < 7*86400000).length}</div>
          <div className="text-xs text-muted-foreground">{deliveries.filter(d => (Date.now() - new Date(d.deliveryDate)) < 7*86400000 && !d.overallPass).length} rejected</div>
        </CardContent></Card>
        <Card className="border-2"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-emerald-700"><ClipboardCheck className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">Total records</span></div>
          <div className="text-2xl font-bold mt-1">{temps.length + cleanings.length + deliveries.length}</div>
          <div className="text-xs text-muted-foreground">all time</div>
        </CardContent></Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b overflow-x-auto">
        <Button variant={tab === 'temperatures' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('temperatures')} className="rounded-b-none">
          <Thermometer className="h-4 w-4 mr-2" /> Temperatures
        </Button>
        <Button variant={tab === 'cleaning' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('cleaning')} className="rounded-b-none">
          <Droplets className="h-4 w-4 mr-2" /> Cleaning
        </Button>
        <Button variant={tab === 'deliveries' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('deliveries')} className="rounded-b-none">
          <Truck className="h-4 w-4 mr-2" /> Deliveries
        </Button>
      </div>

      {/* ==== TEMPERATURES TAB ==== */}
      {tab === 'temperatures' && (
        <TempLogbookView
          temps={temps}
          haccpLocations={haccpLocations}
          onLog={() => setTempModal({ location: haccpLocations.find(l => l.active !== false)?.name || '', temperatureC: '' })}
          onScan={() => setScanTempOpen(true)}
          onEdit={(t) => setTempModal({
            id: t.id,
            location: t.location,
            temperatureC: t.temperatureC,
            isPass: t.isPass,
            recordedAt: t.recordedAt,
            recordedBy: t.recordedBy,
            notes: t.notes || '',
          })}
          onDelete={(id) => deleteRow('temperatures', id)}
          onBulkDelete={(ids) => bulkDelete('temperatures', ids)}
          onCellSave={async ({ location, dateISO, timeOfDay, temperatureC }) => {
            // Save an inline-edited cell straight to backend — no modal.
            // PASS/FAIL is auto-computed based on location type + standard ranges.
            const loc = (haccpLocations || []).find(l => l.name === location) || {}
            const t = loc.type || 'fridge'
            let isPass = true
            if (t === 'fridge') isPass = temperatureC >= 0 && temperatureC <= 5
            else if (t === 'chiller') isPass = temperatureC >= 0 && temperatureC <= 8
            else if (t === 'freezer') isPass = temperatureC <= -15
            else if (t === 'hot_hold') isPass = temperatureC >= 63
            const time = timeOfDay === 'morning' ? '08:00' : timeOfDay === 'evening' ? '17:00' : '12:00'
            const recordedAt = `${dateISO}T${time}:00Z`
            try {
              const res = await fetch('/api/haccp/temperatures', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location, temperatureC, isPass, recordedAt, recordedBy: currentUser, notes: '' }),
              })
              if (!res.ok) throw new Error('Save failed')
              toast.success(`${temperatureC}° saved for ${location}`, { duration: 1600 })
              load()
            } catch (e) { toast.error(e.message) }
          }}
          onQuickCheck={() => setQuickCheckOpen(true)}
          onAddOrphans={async (orphans) => {
            // Merge orphan names into user's saved haccpLocations and PUT to /api/settings.
            // Each orphan already has a suggested type based on temperature sign.
            const additions = orphans.map(o => ({
              id: `loc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
              name: o.name,
              type: o.type || 'fridge',
              minC: null,
              maxC: null,
              active: true,
            }))
            const merged = [...(haccpLocations || []), ...additions]
            try {
              const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ haccpLocations: merged }),
              })
              const data = await res.json()
              if (!res.ok) throw new Error(data?.error || 'Save failed')
              if (data._warning) {
                toast.error(data._warning, { duration: 8000 })
                return
              }
              toast.success(`✨ Added ${additions.length} location${additions.length > 1 ? 's' : ''} to your fridge list`)
              // Trigger a settings refresh in the parent by dispatching a custom event
              window.dispatchEvent(new Event('shelfwise-settings-refresh'))
              // Also give it a moment then reload the compliance page fully
              setTimeout(() => window.location.reload(), 800)
            } catch (e) {
              toast.error(e.message || 'Failed to add locations')
            }
          }}
          formatDT={formatDT}
        />
      )}

      {/* ==== CLEANING TAB ==== */}
      {tab === 'cleaning' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => setTaskModal({ taskName: '', area: 'Kitchen', frequency: 'daily' })}>
              <Plus className="h-4 w-4 mr-1" /> New cleaning task
            </Button>
            <p className="text-xs text-muted-foreground hidden sm:block">Create task templates once — then tick them off each day.</p>
          </div>

          {tasks.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">
              <Droplets className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No cleaning tasks yet. Add ones like "Sanitise prep surfaces", "Deep clean fryer", "Mop floors".
            </CardContent></Card>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {tasks.map(task => {
                const due = isTaskDue(task)
                const last = lastCompletionByTask[task.id]
                return (
                  <Card key={task.id} className={due ? 'border-2 border-amber-300 bg-amber-50/50' : ''}>
                    <CardContent className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{task.taskName}</div>
                        <div className="text-xs text-muted-foreground">
                          {task.area && <span>{task.area} · </span>}
                          <span className="capitalize">{task.frequency}</span>
                          {last ? <span> · last: {formatDT(last)}</span> : <span> · never done</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant={due ? 'default' : 'outline'} onClick={() => setCleanModal({ task })}>
                          <Check className="h-4 w-4 mr-1" /> Done
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setTaskModal({ task, taskName: task.taskName, area: task.area, frequency: task.frequency })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteRow('cleaning-tasks', task.id)}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {cleanings.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mt-6 mb-2">Recent completions</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cleanings.slice(0, 30).map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs">{formatDT(c.completedAt)}</TableCell>
                        <TableCell className="font-medium">{c.taskName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.completedBy || '—'}</TableCell>
                        <TableCell className="text-xs">{c.notes || ''}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => deleteRow('cleaning-log', c.id)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==== DELIVERIES TAB ==== */}
      {tab === 'deliveries' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setDeliveryModal({ supplier: '', temperatureC: '', temperatureOk: true, packagingOk: true, labelsOk: true, overallPass: true })}>
              <Plus className="h-4 w-4 mr-1" /> Log delivery check
            </Button>
            <p className="text-xs text-muted-foreground hidden sm:block">Inspect chilled deliveries within 15 min of arrival. Chilled goods should be ≤ 8°C.</p>
          </div>

          {deliveries.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">
              <Truck className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No delivery checks yet.
            </CardContent></Card>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>°C</TableHead>
                    <TableHead>Pack</TableHead>
                    <TableHead>Labels</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.slice(0, 100).map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="text-xs">{formatDT(d.deliveryDate)}</TableCell>
                      <TableCell className="font-medium">{d.supplier || '—'}</TableCell>
                      <TableCell>
                        {d.temperatureC != null ? <span>{d.temperatureC} {d.temperatureOk ? '✓' : <X className="inline h-3 w-3 text-red-600" />}</span> : '—'}
                      </TableCell>
                      <TableCell>{d.packagingOk ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-red-600" />}</TableCell>
                      <TableCell>{d.labelsOk ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-red-600" />}</TableCell>
                      <TableCell>
                        {d.overallPass
                          ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">ACCEPTED</Badge>
                          : <Badge className="bg-red-100 text-red-800 border-red-200">REJECTED</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{d.checkedBy || '—'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => deleteRow('deliveries', d.id)}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* ---- AI TEMP-LOG SCANNER DIALOG ---- */}
      <Dialog open={scanTempOpen} onOpenChange={o => { if (!o) { setScanTempOpen(false); setScanTempImage(null); setScanTempRotation(0); setScanTempReadings([]) } }}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">📸 Scan Temperature Log <span className="text-[10px] bg-emerald-600 text-white rounded px-1.5 py-0.5 font-bold">AI</span></DialogTitle>
            <p className="text-sm text-muted-foreground">
              Snap your paper temperature log sheet — AI reads every fridge/freezer row and adds all readings in one click.
              <br/>
              <span className="text-[11px] text-amber-700 font-medium">💡 Tip: For a full weekly sheet with 10+ fridges, split into TWO photos (Mon-Wed & Thu-Sun) for the best results.</span>
            </p>
          </DialogHeader>
          {!scanTempImage && (
            <div className="grid grid-cols-2 gap-3 py-3">
              <label className="border-2 border-dashed border-emerald-300 rounded-xl p-5 text-center hover:bg-emerald-50 hover:border-emerald-500 transition cursor-pointer">
                <div className="text-4xl mb-1">📸</div>
                <p className="font-semibold text-slate-700 text-sm">Take a photo</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Snap the clipboard now</p>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return
                  const r = new FileReader(); r.onload = () => setScanTempImage(String(r.result)); r.readAsDataURL(f); e.target.value = ''
                }} />
              </label>
              <label className="border-2 border-dashed border-blue-300 rounded-xl p-5 text-center hover:bg-blue-50 hover:border-blue-500 transition cursor-pointer">
                <div className="text-4xl mb-1">🖼️</div>
                <p className="font-semibold text-slate-700 text-sm">Upload from gallery</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Photo, WhatsApp, scanned image</p>
                <input type="file" accept="image/*" className="hidden" onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return
                  const r = new FileReader(); r.onload = () => setScanTempImage(String(r.result)); r.readAsDataURL(f); e.target.value = ''
                }} />
              </label>
            </div>
          )}
          {scanTempImage && scanTempReadings.length === 0 && (
            <div className="py-2 space-y-3">
              <div className="relative overflow-hidden rounded-lg border bg-slate-50">
                <img src={scanTempImage} alt="temp log" className="w-full max-h-[340px] object-contain transition-transform" style={{ transform: `rotate(${scanTempRotation}deg)` }} />
                <Button size="sm" variant="outline" className="absolute top-2 right-2 bg-white" onClick={() => { setScanTempImage(null); setScanTempRotation(0) }}>Retake</Button>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
                <p className="text-xs text-blue-900">📐 Rotate first if sideways so text reads left→right.</p>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setScanTempRotation((scanTempRotation + 270) % 360)} className="bg-white">↺ 90°</Button>
                  <Button size="sm" variant="outline" onClick={() => setScanTempRotation((scanTempRotation + 90) % 360)} className="bg-white">↻ 90°</Button>
                  {scanTempRotation !== 0 && <span className="text-xs text-blue-700 font-medium">({scanTempRotation}°)</span>}
                </div>
              </div>
              <Button onClick={runScanTemps} disabled={scanTempBusy} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {scanTempBusy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> AI is reading (10-30 seconds)…</> : '✨ Extract readings with AI'}
              </Button>
            </div>
          )}
          {scanTempReadings.length > 0 && (
            <div className="space-y-2 py-2">
              <p className="text-xs bg-blue-50 border border-blue-200 rounded px-3 py-2">
                💡 Review each reading. Untick to skip, edit any field if wrong. Save when done.
              </p>
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {scanTempReadings.map((r, i) => (
                  <div key={i} className={`border-2 rounded-lg p-2 ${r._keep ? (r.isPass ? 'border-emerald-200 bg-white' : 'border-red-200 bg-red-50/50') : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={r._keep} onChange={e => setScanTempReadings(list => list.map((x, j) => j === i ? { ...x, _keep: e.target.checked } : x))} className="h-4 w-4 accent-emerald-600" />
                      <Input value={r.location} onChange={e => setScanTempReadings(list => list.map((x, j) => j === i ? { ...x, location: e.target.value } : x))} className="h-8 text-sm flex-1" placeholder="Fridge 1" />
                      <Input type="number" step="0.1" value={r.temperatureC} onChange={e => setScanTempReadings(list => list.map((x, j) => j === i ? { ...x, temperatureC: e.target.value } : x))} className="h-8 text-sm w-20" />
                      <span className="text-xs text-slate-500 shrink-0">°C</span>
                      <select value={r.isPass ? 'pass' : 'fail'} onChange={e => setScanTempReadings(list => list.map((x, j) => j === i ? { ...x, isPass: e.target.value === 'pass' } : x))} className={`h-8 text-xs rounded border px-1 ${r.isPass ? 'text-emerald-700 border-emerald-300' : 'text-red-700 border-red-300'}`}>
                        <option value="pass">PASS</option>
                        <option value="fail">FAIL</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="w-4 shrink-0"></span>
                      <Input type="date" value={(r.recordedAt || '').slice(0, 10)} onChange={e => {
                        const d = e.target.value
                        const t = (r.recordedAt || '').slice(11, 16) || '12:00'
                        setScanTempReadings(list => list.map((x, j) => j === i ? { ...x, recordedAt: `${d}T${t}:00Z` } : x))
                      }} className="h-7 text-[11px] w-32" title="Reading date" />
                      <select value={r.timeOfDay} onChange={e => {
                        const tod = e.target.value
                        const d = (r.recordedAt || '').slice(0, 10) || new Date().toISOString().slice(0,10)
                        const t = tod === 'morning' ? '08:00' : tod === 'evening' ? '17:00' : '12:00'
                        setScanTempReadings(list => list.map((x, j) => j === i ? { ...x, timeOfDay: tod, recordedAt: `${d}T${t}:00Z` } : x))
                      }} className="h-7 text-[11px] rounded border px-1 border-slate-300">
                        <option value="morning">🌅 AM</option>
                        <option value="evening">🌆 PM</option>
                        <option value="other">🕐 Other</option>
                      </select>
                      <Input value={r.initials} onChange={e => setScanTempReadings(list => list.map((x, j) => j === i ? { ...x, initials: e.target.value } : x))} className="h-7 text-[11px] w-16" placeholder="Init" />
                      <Input value={r.notes || ''} onChange={e => setScanTempReadings(list => list.map((x, j) => j === i ? { ...x, notes: e.target.value } : x))} className="h-7 text-[11px] flex-1" placeholder="Notes" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScanTempOpen(false)}>Cancel</Button>
            {scanTempReadings.length > 0 && (
              <Button onClick={saveScannedTemps} disabled={scanTempBusy} className="bg-emerald-600 hover:bg-emerald-700">
                <Check className="h-4 w-4 mr-1" /> Save {scanTempReadings.filter(r => r._keep).length} readings
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* ---- QUICK CHECK MODAL — log ALL fridges for today in one form ---- */}
      <QuickCheckDialog
        open={quickCheckOpen}
        onClose={() => setQuickCheckOpen(false)}
        locations={haccpLocations}
        currentUser={currentUser}
        onDone={() => { setQuickCheckOpen(false); load() }}
      />

      {/* ---- TEMPERATURE MODAL ---- */}
      <Dialog open={!!tempModal} onOpenChange={o => !o && setTempModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{tempModal?.id ? 'Edit temperature reading' : 'Log temperature'}</DialogTitle></DialogHeader>
          {tempModal && (
            <div className="grid gap-3 py-2">
              <div>
                <Label>Location *</Label>
                {(() => {
                  const userLocs = (haccpLocations || []).filter(l => l && l.active !== false && l.name)
                  const listId = 'temp-loc-suggestions'
                  return (
                    <>
                      <Input
                        list={listId}
                        value={tempModal.location || ''}
                        onChange={e => setTempModal({ ...tempModal, location: e.target.value })}
                        placeholder={userLocs.length > 0 ? 'Type or pick a fridge/freezer' : 'Type a fridge/freezer name'}
                        autoComplete="off"
                      />
                      {userLocs.length > 0 && (
                        <datalist id={listId}>
                          {userLocs.map(l => <option key={l.id || l.name} value={l.name}>{l.type}</option>)}
                        </datalist>
                      )}
                      {userLocs.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          <span className="text-[10px] text-muted-foreground mr-1 self-center">Quick pick:</span>
                          {userLocs.slice(0, 8).map(l => {
                            const icon = l.type === 'freezer' ? '🥶' : l.type === 'hot_hold' ? '🔥' : l.type === 'chiller' ? '🧊' : '❄️'
                            const isActive = (tempModal.location || '').toLowerCase() === l.name.toLowerCase()
                            return (
                              <button
                                key={l.id || l.name}
                                type="button"
                                onClick={() => setTempModal({ ...tempModal, location: l.name })}
                                className={`px-2 py-0.5 text-[11px] rounded-full border ${isActive ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
                              >{icon} {l.name}</button>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-amber-700 mt-1">💡 Add your fridges/freezers in <span className="font-semibold">Settings → Fridges & Freezers</span> so they'll autocomplete here.</p>
                      )}
                    </>
                  )
                })()}
              </div>
              <div>
                <Label>Temperature (°C) *</Label>
                <Input type="number" step="0.1" value={tempModal.temperatureC} onChange={e => setTempModal({ ...tempModal, temperatureC: e.target.value })} placeholder="e.g. 4.2" autoFocus />
              </div>
              <div>
                <Label>Pass / Fail</Label>
                <Select value={tempModal.isPass === false ? 'fail' : 'pass'} onValueChange={v => setTempModal({ ...tempModal, isPass: v === 'pass' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">PASS — within safe range</SelectItem>
                    <SelectItem value="fail">FAIL — out of range (needs action)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input value={tempModal.notes || ''} onChange={e => setTempModal({ ...tempModal, notes: e.target.value })} placeholder="e.g. door left open by delivery" />
              </div>
              {/* Time & date pickers — always shown so user can log a reading for any past AM/PM slot */}
              <div>
                <Label>When was this reading taken?</Label>
                {(() => {
                  // Derive current time slot from recordedAt (default = now)
                  const nowIso = tempModal.recordedAt || new Date().toISOString()
                  const d = new Date(nowIso)
                  const dateStr = d.toISOString().slice(0, 10)
                  const hh = d.getUTCHours()
                  // Which button is currently "active"?
                  const activeSlot = tempModal.timeOfDay || (hh === 8 ? 'am' : hh === 17 ? 'pm' : 'now')
                  const setSlot = (slot, dateOverride) => {
                    const useDate = dateOverride || dateStr
                    let time
                    if (slot === 'am') time = '08:00'
                    else if (slot === 'pm') time = '17:00'
                    else time = new Date().toTimeString().slice(0, 5)
                    setTempModal({ ...tempModal, timeOfDay: slot, recordedAt: `${useDate}T${time}:00Z` })
                  }
                  return (
                    <>
                      <div className="flex gap-1 mt-1 rounded-lg border bg-slate-50 p-0.5 overflow-hidden">
                        {[
                          { k: 'am', label: '🌅 AM (08:00)' },
                          { k: 'pm', label: '🌆 PM (17:00)' },
                          { k: 'now', label: '🕐 Now' },
                        ].map(o => (
                          <button
                            key={o.k}
                            type="button"
                            onClick={() => setSlot(o.k)}
                            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded ${activeSlot === o.k ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-white'}`}
                          >{o.label}</button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Label className="text-xs shrink-0">Date:</Label>
                        <Input
                          type="date"
                          value={dateStr}
                          onChange={e => setSlot(activeSlot, e.target.value)}
                          className="h-8 text-xs flex-1"
                        />
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTempModal(null)}>Cancel</Button>
            <Button onClick={() => saveTemp({
              id: tempModal.id,
              location: tempModal.location,
              temperatureC: Number(tempModal.temperatureC),
              isPass: tempModal.isPass !== false,
              recordedBy: tempModal.recordedBy || currentUser,
              recordedAt: tempModal.recordedAt,
              notes: tempModal.notes || '',
            })} disabled={!tempModal?.location || tempModal?.temperatureC === '' || tempModal?.temperatureC == null}>
              <Check className="h-4 w-4 mr-1" /> {tempModal?.id ? 'Update' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- CLEANING TASK MODAL (create/edit template) ---- */}
      <Dialog open={!!taskModal} onOpenChange={o => !o && setTaskModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{taskModal?.task ? 'Edit task' : 'New cleaning task'}</DialogTitle></DialogHeader>
          {taskModal && (
            <div className="grid gap-3 py-2">
              <div>
                <Label>Task name *</Label>
                <Input value={taskModal.taskName} onChange={e => setTaskModal({ ...taskModal, taskName: e.target.value })} placeholder="e.g. Sanitise prep surfaces" autoFocus />
              </div>
              <div>
                <Label>Area</Label>
                <Select value={taskModal.area || 'Kitchen'} onValueChange={v => setTaskModal({ ...taskModal, area: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Kitchen','Storage','Cold room','Front of house','Toilets','Bins','Equipment'].map(l => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Frequency</Label>
                <Select value={taskModal.frequency || 'daily'} onValueChange={v => setTaskModal({ ...taskModal, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskModal(null)}>Cancel</Button>
            <Button onClick={() => saveTask({
              id: taskModal.task?.id,
              taskName: taskModal.taskName,
              area: taskModal.area,
              frequency: taskModal.frequency,
            })} disabled={!taskModal?.taskName?.trim()}>
              <Check className="h-4 w-4 mr-1" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- MARK CLEANING TASK DONE MODAL ---- */}
      <Dialog open={!!cleanModal} onOpenChange={o => !o && setCleanModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Mark done: {cleanModal?.task?.taskName}</DialogTitle></DialogHeader>
          {cleanModal && (
            <div className="grid gap-3 py-2">
              <p className="text-sm text-muted-foreground">Confirm this task has been completed. Time is auto-recorded.</p>
              <div>
                <Label>Notes (optional)</Label>
                <Input value={cleanModal.notes || ''} onChange={e => setCleanModal({ ...cleanModal, notes: e.target.value })} placeholder="e.g. used bleach solution" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCleanModal(null)}>Cancel</Button>
            <Button onClick={() => markTaskDone(cleanModal.task, cleanModal.notes || '')}>
              <Check className="h-4 w-4 mr-1" /> Confirm done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- DELIVERY CHECK MODAL ---- */}
      <Dialog open={!!deliveryModal} onOpenChange={o => !o && setDeliveryModal(null)}>
        <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Delivery quality check</DialogTitle></DialogHeader>
          {deliveryModal && (
            <div className="grid gap-3 py-2">
              <div>
                <Label>Supplier</Label>
                <Input value={deliveryModal.supplier} onChange={e => setDeliveryModal({ ...deliveryModal, supplier: e.target.value })} placeholder="e.g. Bidfood" />
              </div>
              <div>
                <Label>Temperature at arrival (°C, optional)</Label>
                <Input type="number" step="0.1" value={deliveryModal.temperatureC} onChange={e => setDeliveryModal({ ...deliveryModal, temperatureC: e.target.value })} placeholder="chilled ≤ 8°C" />
              </div>
              <div className="grid gap-2 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={deliveryModal.temperatureOk} onChange={e => setDeliveryModal({ ...deliveryModal, temperatureOk: e.target.checked })} />
                  Temperature acceptable
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={deliveryModal.packagingOk} onChange={e => setDeliveryModal({ ...deliveryModal, packagingOk: e.target.checked })} />
                  Packaging intact (no damage)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={deliveryModal.labelsOk} onChange={e => setDeliveryModal({ ...deliveryModal, labelsOk: e.target.checked })} />
                  Labels + use-by dates in order
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold border-t pt-2 mt-1">
                  <input type="checkbox" checked={deliveryModal.overallPass} onChange={e => setDeliveryModal({ ...deliveryModal, overallPass: e.target.checked })} />
                  Delivery ACCEPTED (overall)
                </label>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input value={deliveryModal.notes || ''} onChange={e => setDeliveryModal({ ...deliveryModal, notes: e.target.value })} placeholder="e.g. rejected 2 crates of prawns" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliveryModal(null)}>Cancel</Button>
            <Button onClick={() => saveDelivery({
              supplier: deliveryModal.supplier,
              temperatureC: deliveryModal.temperatureC,
              temperatureOk: deliveryModal.temperatureOk,
              packagingOk: deliveryModal.packagingOk,
              labelsOk: deliveryModal.labelsOk,
              overallPass: deliveryModal.overallPass,
              checkedBy: currentUser,
              notes: deliveryModal.notes || '',
            })}>
              <Check className="h-4 w-4 mr-1" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


// ============================================================================
// AI Recipe Generator Dialog
// - Takes a list of ingredients (seeded from expiring items or manually added)
// - Calls /api/recipe/generate → returns 3 AI recipes
// - Displays as expandable cards with allergen badges, prep/cook time, steps
// ============================================================================
