'use client'

/* eslint-disable no-unused-vars */
// ============================================================================
// ROTA v2.1 (June 2025)
//  • Flexible shifts (custom name + times) with optional Morning/Afternoon/
//    Evening slot mode; owner grid + read-only staff view; overtime + leave;
//    templates, bulk assign, copy last week, drag-to-duplicate, print sheet.
//  v2.1 additions:
//  • Per-staff OFF-DAY patterns (e.g. Wed/Sun) — set on the staff profile,
//    rendered as neutral grey "Off" chips, derived (not stored per week) so
//    "Copy last week" carries them automatically. Owner can still add a
//    one-off shift on an off day (override) without changing the pattern.
//  • Date-RANGE leave picker: marks every WORKING day in the range (skips
//    that person's own off days) with a confirmation summary + optional note.
//  • Simplified staff adding: name + optional role only — NO login/PIN here.
//    Rota profiles live in the rota config row and are independent of login
//    access codes; matching names link automatically (bank/agency friendly).
//  • Optional Note on EVERY entry type (Shift / Overtime / Leave).
//  • Break time per shift (minutes + paid/unpaid) with live breakdown; unpaid
//    breaks are subtracted from counted hours everywhere (grid totals, hours
//    sheet, detail log, print). Per-staff default break prefills new shifts.
// DB: still NO migration — rota_shifts.role carries the entry kind,
// shift_slot the name, and notes either a plain note or packed JSON
// {"n":note,"bm":breakMins,"bp":breakPaid}. Config row (chef_name
// '__rota_config__') stores {mode, templates, people}.
// ============================================================================

import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Loader2, Check, X, ChevronLeft, ChevronRight, Copy, Download, Clock, Zap, CalendarDays, Settings2, Users, FileText, ArrowLeft, LayoutTemplate, Printer, Coffee, MoreHorizontal } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'

// `fetch` inside this file transparently uses `apiFetch` (auth token attached).
const fetch = apiFetch

// ---------------------------------------------------------------------------
// Date / time helpers
// ---------------------------------------------------------------------------
const todayISO = () => new Date().toISOString().slice(0, 10)
const isoAddDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const mondayOf = (iso) => { const d = new Date(iso + 'T12:00:00'); const day = d.getDay(); return isoAddDays(iso, day === 0 ? -6 : 1 - day) }
const weekdayOf = (iso) => new Date(iso + 'T12:00:00').getDay() // 0=Sun..6=Sat
// 'Mon 24 Aug' — date + day name shown together
const dayLabel = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const longLabel = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const monthStartISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const monthEndISO = () => { const d = new Date(); const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}` }
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Hours between HH:MM strings (handles overnight shifts, e.g. 22:00–02:00 = 4h)
export const hoursOf = (start, end) => {
  if (!start || !end) return 0
  const [sh, sm] = String(start).split(':').map(Number)
  const [eh, em] = String(end).split(':').map(Number)
  if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return 0
  let h = (eh + em / 60) - (sh + sm / 60)
  if (h < 0) h += 24
  return Math.round(h * 100) / 100
}
const fmtH = (h) => (Math.round(h * 100) / 100) % 1 === 0 ? `${Math.round(h)}h` : `${(Math.round(h * 100) / 100).toFixed(1)}h`
const timeRange = (s) => (s.startTime && s.endTime) ? `${s.startTime}–${s.endTime}` : (s.startTime || s.endTime || '')

// ---------------------------------------------------------------------------
// notes packing — a shift's note + break info share the existing notes column.
// Plain string = just a note (back-compat). JSON {"n","bm","bp"} = note+break.
// ---------------------------------------------------------------------------
export const parseNotes = (notes) => {
  const raw = String(notes || '')
  if (raw.startsWith('{')) {
    try { const j = JSON.parse(raw); return { note: String(j.n || ''), breakMins: Math.max(0, +j.bm || 0), breakPaid: !!j.bp } } catch {}
  }
  return { note: raw, breakMins: 0, breakPaid: false }
}
export const packNotes = ({ note = '', breakMins = 0, breakPaid = false }) =>
  breakMins > 0 ? JSON.stringify({ n: note, bm: breakMins, bp: breakPaid }) : note

// Effective break for a shift: an EXPLICIT packed value always wins (even an
// explicit 0 = "no break"); otherwise the person's profile default applies.
// This is the fix for shifts created via templates/bulk assign/copy-week that
// never stored break data — they now inherit the staff member's default.
export const effMeta = (s, pm) => {
  const raw = String(s?.notes || '')
  if (raw.startsWith('{')) return parseNotes(raw)
  return { note: raw, breakMins: pm?.defaultBreakMins || 0, breakPaid: !!pm?.breakPaid }
}
const fmtBreak = (mins) => mins % 60 === 0 ? `${mins / 60}h` : mins > 60 ? `${Math.floor(mins / 60)}h${mins % 60}m` : `${mins}m`

// Entry kind from the (repurposed) role column
export const kindOf = (s) => {
  const r = String(s?.role || '')
  if (r === 'overtime') return 'overtime'
  if (r.startsWith('leave:')) return r.slice(6) // sick | annual | unpaid
  return 'shift'
}
const isLeave = (s) => ['sick', 'annual', 'unpaid'].includes(kindOf(s))

// Counted hours: raw shift length minus UNPAID break (shifts only).
// pm = the person's profile (for default-break fallback on legacy rows).
export const countedHours = (s, pm) => {
  const base = hoursOf(s.startTime, s.endTime)
  if (kindOf(s) !== 'shift') return base
  const m = effMeta(s, pm)
  return Math.max(0, Math.round((base - (m.breakPaid ? 0 : m.breakMins / 60)) * 100) / 100)
}

export const LEAVE_META = {
  sick: { label: 'Sick', icon: '🤒', card: 'border-rose-300 bg-rose-50 text-rose-800', badge: 'bg-rose-100 text-rose-700 border-rose-200' },
  annual: { label: 'Annual leave', icon: '🏖️', card: 'border-sky-300 bg-sky-50 text-sky-800', badge: 'bg-sky-100 text-sky-700 border-sky-200' },
  unpaid: { label: 'Unpaid leave', icon: '⛔', card: 'border-slate-300 bg-slate-100 text-slate-700', badge: 'bg-slate-200 text-slate-700 border-slate-300' },
}
const SLOT_PRESETS = ['Morning', 'Afternoon', 'Evening']

// ---------------------------------------------------------------------------
// Shift card
// ---------------------------------------------------------------------------
function ShiftCard({ s, pm, owner, onEdit, draggable }) {
  const kind = kindOf(s)
  const meta = kind === 'shift' ? effMeta(s, pm) : parseNotes(s.notes)
  if (kind === 'overtime') {
    return (
      <div
        draggable={draggable}
        onDragStart={draggable ? (e) => e.dataTransfer.setData('text/plain', s.id) : undefined}
        onClick={owner ? () => onEdit(s) : undefined}
        className={`rounded-lg border-2 border-amber-400 bg-amber-50 px-2 py-1.5 text-left w-full ${owner ? 'cursor-pointer hover:bg-amber-100' : ''}`}
      >
        <div className="flex items-center gap-1 text-[11px] font-bold text-amber-800"><Zap className="h-3 w-3" /> Overtime</div>
        <div className="text-[11px] font-semibold text-amber-900">{timeRange(s) || '—'} · {fmtH(hoursOf(s.startTime, s.endTime))}</div>
        {meta.note && <div className="text-[10px] text-amber-700 truncate" title={meta.note}>{meta.note}</div>}
      </div>
    )
  }
  if (isLeave(s)) {
    const m = LEAVE_META[kind]
    return (
      <div
        onClick={owner ? () => onEdit(s) : undefined}
        className={`rounded-lg border-2 px-2 py-1.5 text-left w-full ${m.card} ${owner ? 'cursor-pointer' : ''}`}
      >
        <div className="text-[11px] font-bold">{m.icon} {m.label}</div>
        {meta.note ? <div className="text-[10px] opacity-80 truncate" title={meta.note}>{meta.note}</div> : <div className="text-[10px] opacity-80">Not counted in hours</div>}
      </div>
    )
  }
  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? (e) => e.dataTransfer.setData('text/plain', s.id) : undefined}
      onClick={owner ? () => onEdit(s) : undefined}
      className={`rounded-lg border-2 border-emerald-200 bg-emerald-50 px-2 py-1.5 text-left w-full ${owner ? 'cursor-pointer hover:bg-emerald-100 hover:border-emerald-300' : ''}`}
    >
      <div className="text-[11px] font-bold text-emerald-900 truncate">{s.shiftSlot || 'Shift'}</div>
      <div className="text-[11px] font-semibold text-emerald-700">{timeRange(s) || 'no time set'}{s.startTime && s.endTime ? ` · ${fmtH(countedHours(s, pm))}` : ''}</div>
      {meta.breakMins > 0 && <div className="text-[10px] text-emerald-600"><Coffee className="h-2.5 w-2.5 inline mr-0.5" />{fmtBreak(meta.breakMins)} {meta.breakPaid ? 'paid' : 'unpaid'} break</div>}
      {meta.note && <div className="text-[10px] text-emerald-700/80 italic truncate" title={meta.note}>{meta.note}</div>}
    </div>
  )
}

// Neutral grey routine "Off" chip (derived from the staff off-day pattern)
function OffChip() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-100/80 px-2 py-1.5 text-center">
      <span className="text-[11px] font-semibold text-slate-400 tracking-wider">OFF</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add / edit entry dialog — Shift | Overtime | Leave (with range picker)
// ---------------------------------------------------------------------------
function EntryDialog({ editing, onClose, staffNames, config, personMeta, onSaved }) {
  const s = editing?.shift
  const editMeta = s ? parseNotes(s.notes) : null
  const [kind, setKind] = useState(s ? (isLeave(s) ? 'leave' : kindOf(s)) : (editing?.kind || 'shift'))
  const [person, setPerson] = useState(s?.chefName || editing?.person || staffNames[0] || '')
  const [date, setDate] = useState(s?.shiftDate || editing?.date || todayISO())
  const [name, setName] = useState(s && kindOf(s) === 'shift' ? (s.shiftSlot || '') : '')
  const [startTime, setStartTime] = useState(s?.startTime || '')
  const [endTime, setEndTime] = useState(s?.endTime || '')
  const [note, setNote] = useState(editMeta?.note || '')
  const [leaveType, setLeaveType] = useState(isLeave(s || {}) ? kindOf(s) : 'sick')
  const [leaveEnd, setLeaveEnd] = useState(s?.shiftDate || editing?.date || todayISO())
  const pm = personMeta(person)
  const sEff = s && kindOf(s) === 'shift' ? effMeta(s, personMeta(s.chefName)) : null
  const [breakMins, setBreakMins] = useState(s ? (sEff?.breakMins || 0) : (pm.defaultBreakMins || 0))
  const [breakPaid, setBreakPaid] = useState(s ? !!sEff?.breakPaid : !!pm.breakPaid)
  const [busy, setBusy] = useState(false)
  const slotsMode = config?.mode === 'slots'

  // When the person changes on a NEW shift, re-prefill their default break
  const onPersonChange = (p) => {
    setPerson(p)
    if (!s) { const m = personMeta(p); setBreakMins(m.defaultBreakMins || 0); setBreakPaid(!!m.breakPaid) }
  }

  // ---- break breakdown (live) ----
  const rawH = hoursOf(startTime, endTime)
  const counted = Math.max(0, Math.round((rawH - (breakPaid ? 0 : (breakMins || 0) / 60)) * 100) / 100)

  // ---- leave range → working days (skips this person's own off days) ----
  const leaveDays = useMemo(() => {
    if (kind !== 'leave' || s?.id) return { working: [date], skipped: 0 }
    const from = date, to = leaveEnd >= date ? leaveEnd : date
    const working = []; let skipped = 0; let cur = from; let guard = 0
    while (cur <= to && guard < 62) {
      if ((pm.offDays || []).includes(weekdayOf(cur))) skipped++
      else working.push(cur)
      cur = isoAddDays(cur, 1); guard++
    }
    return { working, skipped }
  }, [kind, date, leaveEnd, person]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!person) { toast.error('Pick a staff member'); return }
    if (!date) { toast.error('Pick a date'); return }
    setBusy(true)
    try {
      if (kind === 'leave' && !s?.id && leaveDays.working.length > 1) {
        // Date-range leave → one bulk call marking every working day
        const m = LEAVE_META[leaveType]
        const res = await fetch('/api/rota/bulk', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: [person], dates: leaveDays.working, shiftName: m.label, role: `leave:${leaveType}`, notes: note.trim() }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error || 'Save failed')
        toast.success(`${m.label} marked on ${leaveDays.working.length} working day${leaveDays.working.length > 1 ? 's' : ''}${leaveDays.skipped ? ` (${leaveDays.skipped} off day${leaveDays.skipped > 1 ? 's' : ''} left as Off)` : ''}`)
        onSaved(); onClose(); return
      }
      let payload = { shiftDate: date, chefName: person }
      if (kind === 'shift') {
        if (!name.trim()) { toast.error(slotsMode ? 'Pick a slot' : 'Give the shift a name (e.g. Prep, Lunch service)'); setBusy(false); return }
        payload = { ...payload, shiftSlot: name.trim(), role: 'shift', startTime, endTime, notes: JSON.stringify({ n: note.trim(), bm: breakMins || 0, bp: breakPaid }) }
      } else if (kind === 'overtime') {
        if (!startTime || !endTime) { toast.error('Overtime needs a start and end time'); setBusy(false); return }
        payload = { ...payload, shiftSlot: 'Overtime', role: 'overtime', startTime, endTime, notes: note.trim() }
      } else {
        const m = LEAVE_META[leaveType]
        payload = { ...payload, shiftSlot: m.label, role: `leave:${leaveType}`, startTime: '', endTime: '', notes: note.trim() }
      }
      if (s?.id) payload.id = s.id
      const res = await fetch('/api/rota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Save failed') }
      toast.success(s?.id ? 'Updated' : 'Added')
      onSaved(); onClose()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!s?.id) return
    if (!window.confirm('Move this entry to Trash?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/rota/${s.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Moved to Trash 🗑️')
      onSaved(); onClose()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const kindBtn = (k, label, icon) => (
    <button key={k} onClick={() => setKind(k)}
      className={`flex-1 rounded-lg border-2 px-2 py-1.5 text-xs font-semibold transition ${kind === k ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-border text-muted-foreground hover:bg-muted'}`}>
      {icon} {label}
    </button>
  )

  const isOffDay = (pm.offDays || []).includes(weekdayOf(date))

  return (
    <Dialog open={!!editing} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md max-h-[calc(100dvh-9.5rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{s?.id ? 'Edit entry' : 'Add entry'}</DialogTitle>
          <DialogDescription>{longLabel(date)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">{kindBtn('shift', 'Shift', '🗓️')}{kindBtn('overtime', 'Overtime', '⚡')}{kindBtn('leave', 'Leave / Sick', '🏖️')}</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Staff member</Label>
              <Select value={person} onValueChange={onPersonChange}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Pick person" /></SelectTrigger>
                <SelectContent>{staffNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{kind === 'leave' && !s?.id ? 'From' : 'Date'}</Label>
              <Input type="date" value={date} onChange={e => { setDate(e.target.value); if (leaveEnd < e.target.value) setLeaveEnd(e.target.value) }} className="mt-1" />
            </div>
          </div>
          {kind === 'shift' && isOffDay && (
            <p className="text-[11px] rounded-lg border border-slate-300 bg-slate-100 text-slate-600 px-2 py-1.5">
              💤 {dayLabel(date)} is usually {person}'s day off — saving this creates a one-off shift; their regular off-day pattern is unchanged.
            </p>
          )}

          {kind === 'shift' && (
            <>
              {(config?.templates || []).length > 0 && !slotsMode && (
                <div className="flex flex-wrap gap-1.5">
                  {config.templates.map(t => (
                    <button key={t.id} onClick={() => { setName(t.name); setStartTime(t.startTime); setEndTime(t.endTime) }}
                      className="text-[11px] font-semibold rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 px-2.5 py-1 hover:bg-emerald-100">
                      {t.name} {t.startTime && t.endTime ? `· ${t.startTime}–${t.endTime}` : ''}
                    </button>
                  ))}
                </div>
              )}
              {slotsMode ? (
                <div>
                  <Label className="text-xs">Slot</Label>
                  <Select value={name} onValueChange={setName}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Morning / Afternoon / Evening" /></SelectTrigger>
                    <SelectContent>{SLOT_PRESETS.map(sl => <SelectItem key={sl} value={sl}>{sl}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label className="text-xs">Shift name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Prep, Lunch service, Close" className="mt-1" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Start</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">End</Label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="mt-1" /></div>
              </div>
              {/* Break time */}
              <div className="rounded-xl border p-2.5 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1.5"><Coffee className="h-3.5 w-3.5 text-emerald-600" />Break</p>
                <div className="flex items-center gap-2">
                  <Input type="number" min="0" max="480" step="5" value={breakMins || ''} onChange={e => setBreakMins(Math.max(0, parseInt(e.target.value, 10) || 0))} placeholder="0" className="w-24 h-8" />
                  <span className="text-xs text-muted-foreground">minutes</span>
                  <div className="ml-auto flex rounded-lg border overflow-hidden">
                    <button onClick={() => setBreakPaid(false)} className={`px-2.5 py-1 text-[11px] font-semibold ${!breakPaid ? 'bg-slate-700 text-white' : 'text-muted-foreground hover:bg-muted'}`}>Unpaid</button>
                    <button onClick={() => setBreakPaid(true)} className={`px-2.5 py-1 text-[11px] font-semibold ${breakPaid ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}>Paid</button>
                  </div>
                </div>
                {rawH > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Shift length <b className="text-foreground">{fmtH(rawH)}</b>
                    {breakMins > 0 && <> · break <b className="text-foreground">{breakMins}m ({breakPaid ? 'paid' : 'unpaid'})</b></>}
                    {' '}→ counted hours <b className="text-emerald-700">{fmtH(counted)}</b>
                  </p>
                )}
              </div>
            </>
          )}

          {kind === 'overtime' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Extra start</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">Extra end</Label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="mt-1" /></div>
              </div>
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">⚡ Overtime is flagged separately and added to weekly totals.</p>
            </>
          )}

          {kind === 'leave' && (
            <>
              {!s?.id && (
                <div>
                  <Label className="text-xs">To (inclusive)</Label>
                  <Input type="date" value={leaveEnd} min={date} onChange={e => setLeaveEnd(e.target.value)} className="mt-1" />
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(LEAVE_META).map(([k, m]) => (
                  <button key={k} onClick={() => setLeaveType(k)}
                    className={`rounded-lg border-2 px-2 py-2 text-xs font-semibold ${leaveType === k ? m.card : 'border-border text-muted-foreground hover:bg-muted'}`}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
              {/* Confirmation summary for the range */}
              {!s?.id && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-2.5 text-[11px] text-sky-900">
                  <p className="font-semibold">This will mark {leaveDays.working.length} working day{leaveDays.working.length !== 1 ? 's' : ''} as {LEAVE_META[leaveType].label}:</p>
                  <p className="mt-0.5">{leaveDays.working.slice(0, 10).map(dayLabel).join(', ')}{leaveDays.working.length > 10 ? ` +${leaveDays.working.length - 10} more` : ''}</p>
                  {leaveDays.skipped > 0 && <p className="mt-0.5 text-sky-700">{leaveDays.skipped} off day{leaveDays.skipped > 1 ? 's' : ''} in this range {leaveDays.skipped > 1 ? 'are' : 'is'} left as Off (not marked).</p>}
                  <p className="mt-0.5 opacity-80">Leave days are excluded from worked-hours totals.</p>
                </div>
              )}
            </>
          )}

          {/* Optional note — consistent across ALL entry types */}
          <div>
            <Label className="text-xs">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input value={note} onChange={e => setNote(e.target.value)}
              placeholder={kind === 'overtime' ? 'e.g. Covered evening rush' : kind === 'leave' ? 'e.g. Approved by manager on 24 Aug' : 'e.g. Training new starter'}
              className="mt-1" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {s?.id && <Button variant="outline" onClick={remove} disabled={busy} className="text-red-600 border-red-200 hover:bg-red-50 mr-auto"><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Staff profile dialog — name + optional role + off days + default break.
// Rota-only: creates NO login/access code (that stays in Settings; matching
// names link automatically).
// ---------------------------------------------------------------------------
function StaffDialog({ editing, onClose, config, saveConfig, loginNames }) {
  const existing = editing?.profile
  const [name, setName] = useState(existing?.name || editing?.name || '')
  const [role, setRole] = useState(existing?.role || '')
  const [offDays, setOffDays] = useState(existing?.offDays || [])
  const [defBreak, setDefBreak] = useState(existing?.defaultBreakMins || 0)
  const [defPaid, setDefPaid] = useState(!!existing?.breakPaid)
  const [busy, setBusy] = useState(false)
  const hasLogin = loginNames.some(n => n.toLowerCase() === String(existing?.name || name).trim().toLowerCase())

  const toggleDay = (d) => setOffDays(offDays.includes(d) ? offDays.filter(x => x !== d) : [...offDays, d].sort())

  const save = async () => {
    const nm = name.trim()
    if (!nm) { toast.error('Name is required'); return }
    const people = [...(config.people || [])]
    const dupe = people.find(p => p.id !== existing?.id && p.name.toLowerCase() === nm.toLowerCase())
    if (dupe) { toast.error(`${nm} is already on the rota`); return }
    const profile = { id: existing?.id || crypto.randomUUID(), name: nm, role: role.trim(), offDays, defaultBreakMins: defBreak || 0, breakPaid: defPaid }
    const next = existing?.id ? people.map(p => p.id === existing.id ? profile : p) : [...people, profile]
    setBusy(true)
    try {
      await saveConfig({ ...config, people: next })
      toast.success(existing?.id ? 'Profile updated' : `${nm} added to the rota`)
      onClose()
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!existing?.id) return
    if (!window.confirm(`Remove ${existing.name} from the rota? Their past shifts stay on record.${hasLogin ? '\n\n(They still have login access — manage that in Settings.)' : ''}`)) return
    setBusy(true)
    try {
      await saveConfig({ ...config, people: (config.people || []).filter(p => p.id !== existing.id) })
      toast.success(`${existing.name} removed from the rota`)
      onClose()
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={!!editing} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing?.id ? `Edit ${existing.name}` : 'Add staff member'}</DialogTitle>
          <DialogDescription>
            Rota only — no login or access code is created here.{existing?.id && hasLogin ? ' This person also has login access (linked by name).' : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name" disabled={!!existing?.id} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Role <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Chef de partie" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Days off each week <span className="text-muted-foreground font-normal">(e.g. pick 2 — any days, per their contract)</span></Label>
            <div className="flex gap-1.5 mt-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map(d => (
                <button key={d} onClick={() => toggleDay(d)}
                  className={`flex-1 rounded-lg border-2 py-1.5 text-[11px] font-bold transition ${offDays.includes(d) ? 'border-slate-500 bg-slate-600 text-white' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                  {WEEKDAY_SHORT[d]}
                </button>
              ))}
            </div>
            {offDays.length > 0 && <p className="text-[11px] text-muted-foreground mt-1">Shows as grey "Off" on the rota — excluded from coverage, skipped by range leave, and carried over by Copy last week.</p>}
          </div>
          <div className="rounded-xl border p-2.5 space-y-2">
            <p className="text-xs font-semibold flex items-center gap-1.5"><Coffee className="h-3.5 w-3.5 text-emerald-600" />Default break <span className="text-muted-foreground font-normal">(prefills new shifts — editable per shift)</span></p>
            <div className="flex items-center gap-2">
              <Input type="number" min="0" max="480" step="5" value={defBreak || ''} onChange={e => setDefBreak(Math.max(0, parseInt(e.target.value, 10) || 0))} placeholder="0" className="w-24 h-8" />
              <span className="text-xs text-muted-foreground">minutes</span>
              <div className="ml-auto flex rounded-lg border overflow-hidden">
                <button onClick={() => setDefPaid(false)} className={`px-2.5 py-1 text-[11px] font-semibold ${!defPaid ? 'bg-slate-700 text-white' : 'text-muted-foreground hover:bg-muted'}`}>Unpaid</button>
                <button onClick={() => setDefPaid(true)} className={`px-2.5 py-1 text-[11px] font-semibold ${defPaid ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}>Paid</button>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {existing?.id && <Button variant="outline" onClick={remove} disabled={busy} className="text-red-600 border-red-200 hover:bg-red-50 mr-auto"><Trash2 className="h-4 w-4 mr-1" /> Remove</Button>}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Templates manager + bulk assign (owner)
// ---------------------------------------------------------------------------
function TemplatesDialog({ open, onClose, config, saveConfig, staffNames, weekDays, reload }) {
  const [name, setName] = useState(''); const [st, setSt] = useState(''); const [en, setEn] = useState('')
  const [assign, setAssign] = useState(null)
  const [selNames, setSelNames] = useState([]); const [selDates, setSelDates] = useState([])
  const [busy, setBusy] = useState(false)

  const addTemplate = async () => {
    if (!name.trim()) { toast.error('Template needs a name'); return }
    await saveConfig({ ...config, templates: [...(config.templates || []), { id: crypto.randomUUID(), name: name.trim(), startTime: st, endTime: en }] })
    setName(''); setSt(''); setEn('')
  }
  const delTemplate = async (id) => saveConfig({ ...config, templates: (config.templates || []).filter(t => t.id !== id) })

  const applyBulk = async () => {
    if (!selNames.length || !selDates.length) { toast.error('Pick at least one person and one day'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/rota/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: selNames, dates: selDates, shiftName: assign.name, startTime: assign.startTime, endTime: assign.endTime }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Bulk assign failed')
      toast.success(`Added ${d.created} shift${d.created !== 1 ? 's' : ''} 🎉`)
      setAssign(null); setSelNames([]); setSelDates([])
      reload()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setAssign(null); onClose() } }}>
      <DialogContent className="max-w-lg max-h-[calc(100dvh-9.5rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle><LayoutTemplate className="h-5 w-5 inline mr-1.5 text-emerald-600" />Shift templates</DialogTitle>
          <DialogDescription>Save common shifts once, then reuse them — or assign to several staff and days in one go.</DialogDescription>
        </DialogHeader>

        {!assign ? (
          <div className="space-y-3">
            {(config.templates || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-3">No templates yet — add your first below.</p>}
            {(config.templates || []).map(t => (
              <div key={t.id} className="flex items-center gap-2 rounded-xl border p-2.5">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.startTime && t.endTime ? `${t.startTime}–${t.endTime} · ${fmtH(hoursOf(t.startTime, t.endTime))}` : 'No time set'}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setAssign(t)} className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"><Users className="h-3.5 w-3.5 mr-1" />Assign</Button>
                <Button size="icon" variant="ghost" onClick={() => delTemplate(t.id)} className="h-8 w-8 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <div className="rounded-xl border-2 border-dashed p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New template</p>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name (e.g. Prep, Lunch service)" />
              <div className="grid grid-cols-2 gap-2">
                <Input type="time" value={st} onChange={e => setSt(e.target.value)} />
                <Input type="time" value={en} onChange={e => setEn(e.target.value)} />
              </div>
              <Button size="sm" onClick={addTemplate} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-1" />Save template</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <button onClick={() => setAssign(null)} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back to templates</button>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-sm font-semibold text-emerald-900">{assign.name} {assign.startTime && assign.endTime ? `· ${assign.startTime}–${assign.endTime}` : ''}</div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Staff ({selNames.length} selected)</p>
              <div className="grid grid-cols-2 gap-1.5">
                {staffNames.map(n => (
                  <label key={n} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm cursor-pointer ${selNames.includes(n) ? 'border-emerald-400 bg-emerald-50' : ''}`}>
                    <Checkbox checked={selNames.includes(n)} onCheckedChange={() => toggle(selNames, setSelNames, n)} /> {n}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Days ({selDates.length} selected)</p>
              <div className="grid grid-cols-2 gap-1.5">
                {weekDays.map(d => (
                  <label key={d} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm cursor-pointer ${selDates.includes(d) ? 'border-emerald-400 bg-emerald-50' : ''}`}>
                    <Checkbox checked={selDates.includes(d)} onCheckedChange={() => toggle(selDates, setSelDates, d)} /> {dayLabel(d)}
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={applyBulk} disabled={busy} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add ${selNames.length * selDates.length || ''} shifts`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Hours sheet — shared by owner (all staff + CSV) and staff (own only).
// All figures use COUNTED hours (unpaid breaks subtracted).
// ---------------------------------------------------------------------------
function HoursDialog({ open, onClose, isStaff, personName, staffNames, personMeta }) {
  const [period, setPeriod] = useState('week')
  const [from, setFrom] = useState(mondayOf(todayISO()))
  const [to, setTo] = useState(isoAddDays(mondayOf(todayISO()), 6))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (period === 'week') { setFrom(mondayOf(todayISO())); setTo(isoAddDays(mondayOf(todayISO()), 6)) }
    if (period === 'month') { setFrom(monthStartISO()); setTo(monthEndISO()) }
  }, [period])

  const load = useCallback(async () => {
    if (!open || !from || !to) return
    setLoading(true)
    try {
      const res = await fetch(`/api/rota?from=${from}&to=${to}`)
      const data = res.ok ? await res.json() : []
      setRows((Array.isArray(data) ? data : []).filter(s => s.chefName !== '__rota_config__'))
    } catch { setRows([]) } finally { setLoading(false) }
  }, [open, from, to])
  useEffect(() => { load() }, [load])

  const mine = isStaff ? rows.filter(s => s.chefName === personName) : rows
  const people = isStaff ? [personName] : Array.from(new Set([...(staffNames || []), ...rows.map(s => s.chefName)])).filter(Boolean)

  const summary = people.map(p => {
    const list = mine.filter(s => s.chefName === p)
    const sched = list.filter(s => kindOf(s) === 'shift').reduce((a, s) => a + countedHours(s, personMeta(p)), 0)
    const ot = list.filter(s => kindOf(s) === 'overtime').reduce((a, s) => a + hoursOf(s.startTime, s.endTime), 0)
    const leave = list.filter(isLeave).length
    return { person: p, sched, ot, total: sched + ot, leave, count: list.length }
  })

  const exportCsv = () => {
    const lines = [
      `Hours sheet,${from} to ${to},(unpaid breaks deducted)`,
      'Name,Scheduled hours,Overtime hours,Total hours,Leave days',
      ...summary.map(r => `"${r.person}",${r.sched.toFixed(2)},${r.ot.toFixed(2)},${r.total.toFixed(2)},${r.leave}`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `hours-${from}-to-${to}.csv`
    a.click(); URL.revokeObjectURL(a.href)
    toast.success('CSV downloaded')
  }

  const detailEntries = detail ? mine.filter(s => s.chefName === detail).sort((a, b) => a.shiftDate.localeCompare(b.shiftDate)) : []
  const detailShifts = detailEntries.filter(s => kindOf(s) === 'shift')
  const detailOt = detailEntries.filter(s => kindOf(s) === 'overtime')
  const detailLeave = detailEntries.filter(isLeave)
  const byName = {}
  for (const s of detailShifts) {
    const k = s.shiftSlot || 'Shift'
    byName[k] = (byName[k] || 0) + countedHours(s, personMeta(detail))
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setDetail(null); onClose() } }}>
      <DialogContent className="max-w-2xl max-h-[calc(100dvh-9.5rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle><Clock className="h-5 w-5 inline mr-1.5 text-emerald-600" />{detail ? `${detail} — full log` : isStaff ? 'My hours' : 'Hours sheet'}</DialogTitle>
          <DialogDescription>{dayLabel(from)} → {dayLabel(to)} · unpaid breaks deducted</DialogDescription>
        </DialogHeader>

        {detail ? (
          <div className="space-y-3">
            <button onClick={() => setDetail(null)} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back to summary</button>
            {detailEntries.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No entries in this period.</p>}
            {detailShifts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shifts</p>
                {detailShifts.map(s => {
                  const m = effMeta(s, personMeta(detail))
                  return (
                    <div key={s.id} className="rounded-lg border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <div><span className="font-semibold">{dayLabel(s.shiftDate)}</span> · {s.shiftSlot || 'Shift'}</div>
                        <div className="text-muted-foreground">{timeRange(s) || '—'} <b className="text-foreground ml-1">{fmtH(countedHours(s, personMeta(detail)))}</b></div>
                      </div>
                      {(m.breakMins > 0 || m.note) && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {m.breakMins > 0 && <>☕ {m.breakMins}m {m.breakPaid ? 'paid' : 'unpaid'} break{m.breakPaid ? '' : ' (deducted)'}</>}
                          {m.breakMins > 0 && m.note && ' · '}
                          {m.note && <>📝 {m.note}</>}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {detailOt.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">⚡ Overtime</p>
                {detailOt.map(s => {
                  const m = parseNotes(s.notes)
                  return (
                    <div key={s.id} className="rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-amber-900">{dayLabel(s.shiftDate)}</span>
                        <span className="text-amber-800">{timeRange(s)} <b>{fmtH(hoursOf(s.startTime, s.endTime))}</b></span>
                      </div>
                      {m.note && <p className="text-xs text-amber-700 mt-0.5">Reason: {m.note}</p>}
                    </div>
                  )
                })}
              </div>
            )}
            {detailLeave.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Leave (not counted)</p>
                {detailLeave.map(s => {
                  const m = LEAVE_META[kindOf(s)]
                  const pm = parseNotes(s.notes)
                  return <div key={s.id} className={`rounded-lg border px-3 py-2 text-sm ${m.badge}`}>{m.icon} <b>{dayLabel(s.shiftDate)}</b> — {m.label}{pm.note ? ` · 📝 ${pm.note}` : ''}</div>
                })}
              </div>
            )}
            {Object.keys(byName).length > 0 && (
              <div className="rounded-xl border p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Hours by shift type</p>
                {Object.entries(byName).sort((a, b) => b[1] - a[1]).map(([k, h]) => (
                  <div key={k} className="flex items-center justify-between text-sm py-0.5"><span>{k}</span><b>{fmtH(h)}</b></div>
                ))}
                {detailOt.length > 0 && <div className="flex items-center justify-between text-sm py-0.5 text-amber-700"><span>⚡ Overtime</span><b>{fmtH(detailOt.reduce((a, s) => a + hoursOf(s.startTime, s.endTime), 0))}</b></div>}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {['week', 'month', 'custom'].map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold border-2 ${period === p ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                  {p === 'week' ? 'This week' : p === 'month' ? 'This month' : 'Custom'}
                </button>
              ))}
              {period === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 w-36 text-xs" />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 w-36 text-xs" />
                </div>
              )}
              {!isStaff && <Button size="sm" variant="outline" onClick={exportCsv} className="ml-auto"><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>}
            </div>

            {loading ? <div className="text-center py-6"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></div> : (
              <div className="space-y-2">
                {summary.map(r => (
                  <button key={r.person} onClick={() => setDetail(r.person)} className="w-full text-left rounded-xl border p-3 hover:bg-muted/50 transition">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-sm">{r.person}</p>
                      <p className="text-sm"><b>{fmtH(r.total)}</b> <span className="text-xs text-muted-foreground">total</span></p>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground mt-1">
                      <span>Scheduled: <b className="text-foreground">{fmtH(r.sched)}</b></span>
                      {r.ot > 0 && <span className="text-amber-600 font-semibold">⚡ Overtime: {fmtH(r.ot)}</span>}
                      {r.leave > 0 && <span>Leave days: {r.leave}</span>}
                      <span className="ml-auto text-emerald-700">Tap for full log →</span>
                    </div>
                  </button>
                ))}
                {isStaff && summary.length > 0 && (
                  <div className="rounded-xl border p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Day by day</p>
                    {Array.from(new Set(mine.map(s => s.shiftDate))).sort().map(d => {
                      const dayList = mine.filter(s => s.shiftDate === d)
                      const h = dayList.filter(s => !isLeave(s)).reduce((a, s) => a + (kindOf(s) === 'shift' ? countedHours(s, personMeta(s.chefName)) : hoursOf(s.startTime, s.endTime)), 0)
                      return (
                        <div key={d} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                          <span>{dayLabel(d)}</span>
                          <span className="text-xs text-muted-foreground truncate mx-2 flex-1 text-center">{dayList.map(s => isLeave(s) ? LEAVE_META[kindOf(s)].label : (s.shiftSlot || 'Shift')).join(', ')}</span>
                          <b>{fmtH(h)}</b>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// MAIN VIEW
// ---------------------------------------------------------------------------
export function RotaView({ isStaff = false, personName = '' }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO()))
  const [shifts, setShifts] = useState([])
  const [loginStaff, setLoginStaff] = useState([]) // login users from Settings
  const [config, setConfig] = useState({ mode: 'flex', templates: [], people: [] })
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [staffEditing, setStaffEditing] = useState(null) // {profile?} | {name}
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [hoursOpen, setHoursOpen] = useState(false)
  const [customiseOpen, setCustomiseOpen] = useState(false)
  const [menu, setMenu] = useState(null) // 'staff' | 'build' | 'more' grouped toolbar menus
  const [busy, setBusy] = useState(false)

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => isoAddDays(weekStart, i)), [weekStart])
  const weekEnd = days[6]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch(`/api/rota?from=${weekStart}&to=${weekEnd}`),
        fetch('/api/rota/staff-names'),
        fetch('/api/rota/config'),
      ])
      const d1 = r1.ok ? await r1.json() : []
      const d2 = r2.ok ? await r2.json() : { staff: [] }
      const d3 = r3.ok ? await r3.json() : { mode: 'flex', templates: [], people: [] }
      setShifts((Array.isArray(d1) ? d1 : []).filter(s => s.chefName !== '__rota_config__'))
      setLoginStaff(d2.staff || [])
      setConfig({ mode: d3.mode || 'flex', templates: d3.templates || [], people: d3.people || [] })
    } catch { toast.error('Could not load rota') } finally { setLoading(false) }
  }, [weekStart, weekEnd])
  useEffect(() => { load() }, [load])

  const saveConfig = async (next) => {
    try {
      const res = await fetch('/api/rota/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Save failed')
      setConfig(d)
    } catch (e) { toast.error(e.message) }
  }

  // Grid rows = rota profiles ∪ login users ∪ anyone on this week's rota
  // (deduped by name, case-insensitive — matching names link automatically).
  const staffNames = useMemo(() => {
    const seen = new Map()
    for (const p of (config.people || [])) seen.set(p.name.toLowerCase(), p.name)
    for (const s of loginStaff) if (s.name && !seen.has(s.name.toLowerCase())) seen.set(s.name.toLowerCase(), s.name)
    for (const s of shifts) if (s.chefName && !seen.has(s.chefName.toLowerCase())) seen.set(s.chefName.toLowerCase(), s.chefName)
    return Array.from(seen.values())
  }, [config.people, loginStaff, shifts])

  const rowsFor = isStaff ? staffNames.filter(n => n.toLowerCase() === personName.toLowerCase()) : staffNames

  const personMeta = useCallback((name) => {
    const p = (config.people || []).find(x => x.name.toLowerCase() === String(name || '').toLowerCase())
    return p || { name, role: '', offDays: [], defaultBreakMins: 0, breakPaid: false }
  }, [config.people])

  const weekTotals = (name) => {
    const list = shifts.filter(s => s.chefName === name)
    const pm = personMeta(name)
    const sched = list.filter(s => kindOf(s) === 'shift').reduce((a, s) => a + countedHours(s, pm), 0)
    const ot = list.filter(s => kindOf(s) === 'overtime').reduce((a, s) => a + hoursOf(s.startTime, s.endTime), 0)
    return { sched, ot, total: sched + ot }
  }

  const copyLastWeek = async () => {
    if (!window.confirm(`Copy all shifts from last week (${dayLabel(isoAddDays(weekStart, -7))} – ${dayLabel(isoAddDays(weekStart, -1))}) into this week?\n\nOff-day patterns apply automatically.`)) return
    setBusy(true)
    try {
      const res = await fetch('/api/rota/copy-week', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromStart: isoAddDays(weekStart, -7), toStart: weekStart }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Copy failed')
      toast.success(`Copied ${d.copied} shift${d.copied !== 1 ? 's' : ''}${d.skipped ? ` (${d.skipped} already existed)` : ''}`)
      load()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const onDropCell = async (e, person, date) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    const src = shifts.find(s => s.id === id)
    if (!src) return
    if (src.chefName === person && src.shiftDate === date) return
    try {
      const res = await fetch('/api/rota', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftDate: date, chefName: person, shiftSlot: src.shiftSlot, role: src.role || 'shift', startTime: src.startTime, endTime: src.endTime, notes: src.notes }),
      })
      if (!res.ok) throw new Error('Could not duplicate shift')
      toast.success(`Duplicated "${src.shiftSlot}" → ${dayLabel(date)}`)
      load()
    } catch (err) { toast.error(err.message) }
  }

  const cellShifts = (person, date) => shifts.filter(s => s.chefName === person && s.shiftDate === date)

  // Printable weekly rota sheet for the kitchen wall (A4 landscape).
  const printRota = () => {
    const w = window.open('', '_blank', 'width=1100,height=800')
    if (!w) { toast.error('Pop-up blocked — please allow pop-ups to print'); return }
    const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const cellHtml = (name, d) => {
      const list = cellShifts(name, d)
      if (!list.length) {
        return (personMeta(name).offDays || []).includes(weekdayOf(d)) ? '<div class="card offday">OFF</div>' : '<span class="off">—</span>'
      }
      return list.map(s => {
        const kind = kindOf(s)
        const m = kind === 'shift' ? effMeta(s, personMeta(name)) : parseNotes(s.notes)
        if (kind === 'overtime') return `<div class="card ot">⚡ Overtime<br><b>${esc(timeRange(s))}</b>${m.note ? `<br><small>${esc(m.note)}</small>` : ''}</div>`
        if (isLeave(s)) { const lm = LEAVE_META[kind]; return `<div class="card leave">${lm.icon} ${esc(lm.label)}</div>` }
        const br = m.breakMins > 0 ? `<br><small>☕ ${fmtBreak(m.breakMins)} ${m.breakPaid ? 'paid' : 'unpaid'}</small>` : ''
        return `<div class="card"><b>${esc(s.shiftSlot || 'Shift')}</b><br>${esc(timeRange(s))}${s.startTime && s.endTime ? ` <small>(${fmtH(countedHours(s, personMeta(name)))})</small>` : ''}${br}</div>`
      }).join('')
    }
    const rowsHtml = rowsFor.map(name => {
      const t = weekTotals(name)
      return `<tr>
        <td class="name"><b>${esc(name)}</b><br><small>${fmtH(t.sched)}${t.ot > 0 ? ` + ${fmtH(t.ot)} OT = <b>${fmtH(t.total)}</b>` : ''}</small></td>
        ${days.map(d => `<td>${cellHtml(name, d)}</td>`).join('')}
      </tr>`
    }).join('')
    const html = `<!doctype html><html><head><title>Rota ${weekStart}</title><style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; }
      body { margin: 0; color: #111; }
      h1 { font-size: 18px; margin: 0 0 2px; } .sub { color: #555; font-size: 12px; margin: 0 0 10px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #bbb; padding: 4px; vertical-align: top; font-size: 10.5px; }
      th { background: #eef7f2; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.04em; }
      th.today { background: #d3f0e2; }
      td.name { width: 110px; }
      .card { border: 1.5px solid #10b981; background: #ecfdf5; border-radius: 5px; padding: 3px 4px; margin-bottom: 3px; }
      .card.ot { border-color: #f59e0b; background: #fffbeb; }
      .card.leave { border-color: #94a3b8; background: #f1f5f9; }
      .card.offday { border-color: #cbd5e1; background: #f8fafc; color: #94a3b8; text-align: center; font-weight: bold; letter-spacing: 0.1em; font-size: 9px; }
      small { color: #555; } .off { color: #bbb; }
      .foot { margin-top: 8px; font-size: 9px; color: #888; }
      .backbtn { display: inline-flex; align-items: center; gap: 4px; margin: 0 0 8px; padding: 5px 12px; border: 1px solid #cbd5e1; border-radius: 7px; background: #f8fafc; font-size: 12px; font-weight: 600; color: #334155; cursor: pointer; }
      @media print { .backbtn { display: none; } }
    </style></head><body>
      <button class="backbtn" onclick="window.close()">← Back</button>
      <h1>Staff Rota — ${dayLabel(weekStart)} to ${dayLabel(weekEnd)}</h1>
      <p class="sub">⚡ amber = overtime · grey = sick/leave · OFF = routine day off · hours shown after unpaid breaks</p>
      <table>
        <thead><tr><th>Staff</th>${days.map(d => `<th class="${d === todayISO() ? 'today' : ''}">${dayLabel(d)}</th>`).join('')}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p class="foot">Printed ${new Date().toLocaleString('en-GB')} · ShelfWise</p>
    </body></html>`
    w.document.write(html)
    w.document.close()
    setTimeout(() => { try { w.focus(); w.print() } catch {} }, 350)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2"><CalendarDays className="h-5 w-5 text-emerald-600" />Rota</h2>
        <div className="flex items-center gap-1 ml-auto">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setWeekStart(isoAddDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <button onClick={() => setWeekStart(mondayOf(todayISO()))} className="text-sm font-semibold px-2 hover:text-emerald-600" title="Jump to this week">
            {dayLabel(weekStart)} – {dayLabel(weekEnd)}
          </button>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setWeekStart(isoAddDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {!isStaff && (
        <>
          {/* Toolbar: 3 Quick Add + 3 grouped menus (Staff / Build week / More) */}
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            <Button size="sm" onClick={() => setEditing({ kind: 'shift', date: todayISO() })} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-3.5 w-3.5 mr-1" />Shift</Button>
            <Button size="sm" onClick={() => setEditing({ kind: 'overtime', date: todayISO() })} className="bg-amber-500 hover:bg-amber-600 text-white"><Zap className="h-3.5 w-3.5 mr-1" />Overtime</Button>
            <Button size="sm" onClick={() => setEditing({ kind: 'leave', date: todayISO() })} className="bg-sky-600 hover:bg-sky-700 text-white">🏖️ Leave/Sick</Button>
            <Button size="sm" variant="outline" onClick={() => setMenu('staff')}><Users className="h-3.5 w-3.5 mr-1" />Staff</Button>
            <Button size="sm" variant="outline" onClick={() => setMenu('build')}><CalendarDays className="h-3.5 w-3.5 mr-1" />Build week</Button>
            <Button size="sm" variant="outline" onClick={() => setMenu('more')}><MoreHorizontal className="h-3.5 w-3.5 mr-1" />More</Button>
          </div>

          {/* Grouped menus — small dialogs (each gets the universal Back button) */}
          <Dialog open={!!menu} onOpenChange={(o) => { if (!o) setMenu(null) }}>
            <DialogContent className="max-w-xs">
              <DialogHeader>
                <DialogTitle>
                  {menu === 'staff' ? <><Users className="h-5 w-5 inline mr-1.5 text-emerald-600" />Staff</> : menu === 'build' ? <><CalendarDays className="h-5 w-5 inline mr-1.5 text-emerald-600" />Build week</> : <><MoreHorizontal className="h-5 w-5 inline mr-1.5 text-emerald-600" />More</>}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                {menu === 'staff' && (
                  <>
                    <Button variant="outline" className="w-full justify-start" onClick={() => { setMenu(null); setStaffEditing({}) }}><Plus className="h-4 w-4 mr-2" />Add person</Button>
                    <Button variant="outline" className="w-full justify-start" onClick={() => { setMenu(null); setHoursOpen(true) }}><Clock className="h-4 w-4 mr-2" />Hours sheet</Button>
                    <Button variant="outline" className="w-full justify-start" onClick={() => { setMenu(null); setCustomiseOpen(true) }}><Settings2 className="h-4 w-4 mr-2" />Customise layout</Button>
                  </>
                )}
                {menu === 'build' && (
                  <>
                    <Button variant="outline" className="w-full justify-start" onClick={() => { setMenu(null); copyLastWeek() }} disabled={busy}><Copy className="h-4 w-4 mr-2" />Copy last week</Button>
                    <Button variant="outline" className="w-full justify-start" onClick={() => { setMenu(null); setTemplatesOpen(true) }}><LayoutTemplate className="h-4 w-4 mr-2" />Shift templates</Button>
                  </>
                )}
                {menu === 'more' && (
                  <Button variant="outline" className="w-full justify-start" onClick={() => { setMenu(null); printRota() }}><Printer className="h-4 w-4 mr-2" />Print rota</Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
      {isStaff && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">Your shifts only — read-only view.</p>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setHoursOpen(true)}><Clock className="h-3.5 w-3.5 mr-1.5" />My hours</Button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin inline text-muted-foreground" /></div>
      ) : rowsFor.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-2xl">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{isStaff ? 'Your name is not on the rota yet — ask the owner to add you.' : 'No staff yet'}</p>
          {!isStaff && <Button size="sm" variant="outline" className="mt-3" onClick={() => setStaffEditing({})}><Plus className="h-4 w-4 mr-1" />Add your first person</Button>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border">
          <div className="min-w-[900px]">
            <div className="grid" style={{ gridTemplateColumns: '11rem repeat(7, minmax(7.5rem, 1fr))' }}>
              <div className="p-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b bg-muted/40">Staff</div>
              {days.map(d => (
                <div key={d} className={`p-2.5 text-center text-xs font-semibold border-b border-l bg-muted/40 ${d === todayISO() ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                  {dayLabel(d)}{d === todayISO() && <span className="block text-[9px] text-emerald-600 font-bold">TODAY</span>}
                </div>
              ))}
            </div>
            {rowsFor.map(name => {
              const t = weekTotals(name)
              const pm = personMeta(name)
              const hasProfile = (config.people || []).some(p => p.name.toLowerCase() === name.toLowerCase())
              return (
                <div key={name} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: '11rem repeat(7, minmax(7.5rem, 1fr))' }}>
                  <div className="p-2.5 flex flex-col justify-center">
                    {!isStaff ? (
                      <button onClick={() => setStaffEditing(hasProfile ? { profile: (config.people || []).find(p => p.name.toLowerCase() === name.toLowerCase()) } : { name })}
                        className="text-left group" title="Edit staff profile (off days, default break)">
                        <p className="font-bold text-sm truncate group-hover:text-emerald-700">{name} <Pencil className="h-3 w-3 inline opacity-0 group-hover:opacity-60" /></p>
                      </button>
                    ) : (
                      <p className="font-bold text-sm truncate">{name}</p>
                    )}
                    {pm.role && <p className="text-[10px] text-muted-foreground truncate">{pm.role}</p>}
                    <p className="text-xs text-muted-foreground">
                      {fmtH(t.sched)}{t.ot > 0 && <span className="text-amber-600 font-semibold"> +{fmtH(t.ot)} OT</span>}
                      {t.ot > 0 && <span className="block font-semibold text-foreground">= {fmtH(t.total)} total</span>}
                    </p>
                  </div>
                  {days.map(d => {
                    const list = cellShifts(name, d)
                    const isOff = list.length === 0 && (pm.offDays || []).includes(weekdayOf(d))
                    return (
                      <div key={d} className={`p-1.5 border-l min-h-[4.5rem] space-y-1 ${d === todayISO() ? 'bg-emerald-50/40' : ''} ${isOff ? 'bg-slate-50/60' : ''}`}
                        onDragOver={!isStaff ? (e) => e.preventDefault() : undefined}
                        onDrop={!isStaff ? (e) => onDropCell(e, name, d) : undefined}
                      >
                        {isOff && <OffChip />}
                        {list.map(s => <ShiftCard key={s.id} s={s} pm={pm} owner={!isStaff} draggable={!isStaff} onEdit={(sh) => setEditing({ shift: sh })} />)}
                        {!isStaff && (
                          <button onClick={() => setEditing({ date: d, person: name })}
                            title={isOff ? `Override ${name}'s day off with a one-off shift` : 'Add entry'}
                            className={`w-full rounded-lg border border-dashed text-[11px] py-1 text-muted-foreground hover:text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50 transition ${(list.length || isOff) ? 'opacity-0 hover:opacity-100' : ''}`}>
                            + add
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!isStaff && !loading && rowsFor.length > 0 && (
        <p className="text-[11px] text-muted-foreground">Tip: click a name to set off days & default break · click a card to edit · drag a card onto another day or person to duplicate it.</p>
      )}

      {editing && <EntryDialog editing={editing} onClose={() => setEditing(null)} staffNames={staffNames} config={config} personMeta={personMeta} onSaved={load} />}
      {staffEditing && <StaffDialog editing={staffEditing} onClose={() => setStaffEditing(null)} config={config} saveConfig={saveConfig} loginNames={loginStaff.map(s => s.name)} />}
      <TemplatesDialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} config={config} saveConfig={saveConfig} staffNames={staffNames} weekDays={days} reload={load} />
      <HoursDialog open={hoursOpen} onClose={() => setHoursOpen(false)} isStaff={isStaff} personName={personName} staffNames={staffNames} personMeta={personMeta} />

      <Dialog open={customiseOpen} onOpenChange={setCustomiseOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle><Settings2 className="h-5 w-5 inline mr-1.5 text-emerald-600" />Customise rota</DialogTitle>
            <DialogDescription>How do you want to enter shifts?</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <button onClick={() => saveConfig({ ...config, mode: 'flex' })}
              className={`w-full text-left rounded-xl border-2 p-3 ${config.mode === 'flex' ? 'border-emerald-500 bg-emerald-50' : 'hover:bg-muted'}`}>
              <p className="font-semibold text-sm">⏱️ Flexible times {config.mode === 'flex' && <Check className="h-4 w-4 inline text-emerald-600" />}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Custom shift names with exact start/end times (e.g. "Prep" 06:30–14:00). Default.</p>
            </button>
            <button onClick={() => saveConfig({ ...config, mode: 'slots' })}
              className={`w-full text-left rounded-xl border-2 p-3 ${config.mode === 'slots' ? 'border-emerald-500 bg-emerald-50' : 'hover:bg-muted'}`}>
              <p className="font-semibold text-sm">🌅 Morning / Afternoon / Evening {config.mode === 'slots' && <Check className="h-4 w-4 inline text-emerald-600" />}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Traditional three-slot structure — pick a slot instead of typing a name.</p>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Legacy export kept so existing imports don't break.
export function RotaShiftDialog() { return null }
