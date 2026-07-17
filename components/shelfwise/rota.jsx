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

export function RotaView() {
  // Anchor day for the visible week (defaults to today) — Monday-based week.
  const [anchor, setAnchor] = useState(() => new Date())
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null) // { shift?, date, slot } — for the modal

  // Compute Monday of the anchor week + 7 days
  const monday = useMemo(() => {
    const d = new Date(anchor)
    const day = d.getDay() // 0=Sun ... 6=Sat
    const diff = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diff)
    d.setHours(0, 0, 0, 0)
    return d
  }, [anchor])

  const days = useMemo(() => Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday); d.setDate(d.getDate() + i)
    return d
  }), [monday])

  const SLOTS = ['Morning', 'Afternoon', 'Evening']

  const fromISO = monday.toISOString().slice(0, 10)
  const toDate = new Date(monday); toDate.setDate(toDate.getDate() + 6)
  const toISO = toDate.toISOString().slice(0, 10)

  const loadShifts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/rota?from=${fromISO}&to=${toISO}`)
      if (!res.ok) throw new Error('Load failed')
      const data = await safeJson(res)
      setShifts(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error('Could not load rota — did you run migration-7?')
    } finally {
      setLoading(false)
    }
  }, [fromISO, toISO])

  useEffect(() => { loadShifts() }, [loadShifts])

  // Build a lookup: shifts[date][slot] = shift row
  const byCell = useMemo(() => {
    const m = {}
    for (const s of shifts) {
      const key = s.shiftDate
      m[key] = m[key] || {}
      m[key][s.shiftSlot] = m[key][s.shiftSlot] || []
      m[key][s.shiftSlot].push(s)
    }
    return m
  }, [shifts])

  const iso = (d) => d.toISOString().slice(0, 10)
  const dayLabel = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Rota</h2>
          <p className="text-muted-foreground mt-1">Weekly staff schedule</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { const d = new Date(monday); d.setDate(d.getDate() - 7); setAnchor(d) }}>← Prev</Button>
          <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date())}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => { const d = new Date(monday); d.setDate(d.getDate() + 7); setAnchor(d) }}>Next →</Button>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        <b>Week of {monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</b>
        {loading && <Loader2 className="inline h-3 w-3 animate-spin ml-2" />}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-8 gap-1 text-xs">
            <div className="font-semibold text-slate-600 p-2">Slot</div>
            {days.map(d => (
              <div key={iso(d)} className={`p-2 text-center font-semibold rounded ${iso(d) === iso(new Date()) ? 'bg-emerald-100 text-emerald-900' : 'text-slate-600'}`}>
                <div>{d.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                <div className="text-lg">{d.getDate()}</div>
                <div className="text-[10px] text-muted-foreground">{d.toLocaleDateString('en-GB', { month: 'short' })}</div>
              </div>
            ))}

            {SLOTS.map(slot => (
              <React.Fragment key={slot}>
                <div className="p-2 font-semibold text-slate-700 border-t bg-slate-50 flex items-center">{slot}</div>
                {days.map(d => {
                  const key = iso(d)
                  const cell = byCell[key]?.[slot] || []
                  return (
                    <div key={key + slot} className="border-t border-slate-200 p-1 min-h-[70px] bg-white space-y-1">
                      {cell.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setEditing({ shift: s, date: key, slot })}
                          className={`w-full text-left px-2 py-1 rounded text-[11px] ${s.chefName?.toUpperCase() === 'OFF' ? 'bg-slate-200 text-slate-500 line-through' : 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'}`}
                        >
                          <div className="font-semibold truncate">{s.chefName || '—'}</div>
                          {(s.role || s.startTime) && (
                            <div className="text-[10px] opacity-80 truncate">
                              {s.role}{s.role && (s.startTime || s.endTime) ? ' · ' : ''}
                              {s.startTime}{s.startTime && s.endTime ? '–' : ''}{s.endTime}
                            </div>
                          )}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setEditing({ shift: null, date: key, slot })}
                        className="w-full text-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 text-[11px] py-1 rounded border border-dashed border-slate-200"
                      >+ add</button>
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <RotaShiftDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); loadShifts() }}
      />
    </div>
  )
}

export function RotaShiftDialog({ target, onClose, onSaved }) {
  const [chefName, setChefName] = useState('')
  const [role, setRole] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (target) {
      const s = target.shift
      setChefName(s?.chefName || '')
      setRole(s?.role || '')
      setStartTime(s?.startTime || '')
      setEndTime(s?.endTime || '')
      setNotes(s?.notes || '')
    }
  }, [target?.shift?.id, target?.date, target?.slot])

  if (!target) return null

  const save = async () => {
    if (!chefName.trim()) { toast.error('Chef name required (or "OFF" for a day off)'); return }
    setBusy(true)
    try {
      const body = {
        id: target.shift?.id,
        shiftDate: target.date,
        shiftSlot: target.slot,
        chefName: chefName.trim(),
        role: role.trim(),
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        notes: notes.trim(),
      }
      const res = await fetch('/api/rota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Save failed')
      toast.success(target.shift ? 'Shift updated' : 'Shift added')
      onSaved()
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!target.shift?.id) return
    if (!confirm('Delete this shift?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/rota/${target.shift.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Shift deleted')
      onSaved()
    } catch (e) { toast.error(e.message || 'Delete failed') } finally { setBusy(false) }
  }

  return (
    <Dialog open={!!target} onOpenChange={(v) => { if (!v && !busy) onClose() }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{target.shift ? 'Edit shift' : 'Add shift'}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {new Date(target.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · <b>{target.slot}</b>
          </p>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2">
            <Label className="text-xs">Chef name</Label>
            <Input value={chefName} onChange={e => setChefName(e.target.value)} placeholder='Anna, "OFF", "Open"…' autoFocus />
            <p className="text-[10px] text-muted-foreground mt-1">Tip: use &quot;OFF&quot; to mark a day off.</p>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Role <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={role} onChange={e => setRole(e.target.value)} placeholder="Head Chef, Sous, KP…" />
          </div>
          <div>
            <Label className="text-xs">Start time</Label>
            <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">End time</Label>
            <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Deep-clean day, prep for Fri banquet…" />
          </div>
        </div>
        <DialogFooter className="flex-row justify-between gap-2">
          {target.shift ? (
            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={remove} disabled={busy}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Analytics View — waste breakdown (this week / month / all)
// ============================================================================
