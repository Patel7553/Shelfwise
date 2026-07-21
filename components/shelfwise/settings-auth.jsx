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
import { Boxes, AlertTriangle, Clock, PackageX, Plus, Search, Download, ArrowUpDown, Pencil, Trash2, LayoutDashboard, Package, Sparkles, ChefHat, ScanLine, Upload, Loader2, Check, X, BookOpen, AlertCircle, ShieldAlert, ShieldCheck, Settings, ArrowRight, Copy, RefreshCw, LogOut, Printer, BarChart3, Bell, BellOff, Calendar as CalendarIcon, Sun, Moon, Monitor, Thermometer, Droplets, Truck, ClipboardCheck, FileText, Globe, Users, Eye, EyeOff } from 'lucide-react'
import { apiFetch, signOutAll, getChefToken } from '@/lib/apiClient'
import InstallAppPrompt from '@/components/InstallAppPrompt'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useT } from '@/lib/i18n'
import { STATUS_META, EMPTY_FORM, ALLERGENS, CURRENCY_SYMBOL, guessShelfLifeDays, dateInDays, suggestExpiryDate, escapeText, safeJson } from '@/components/shelfwise/shared'

// `fetch` inside this file transparently uses `apiFetch` (auth token attached).
const fetch = apiFetch

export function SetupWizardV2({ settings, onComplete }) {
  const [step, setStep] = useState(1)
  const [modules, setModules] = useState([])
  const [widgets, setWidgets] = useState([])
  const [busy, setBusy] = useState(false)
  // Step 0: kitchen basics — pre-filled if already saved
  const [kitchenName, setKitchenName] = useState(settings?.kitchenName || settings?.kitchen_name || '')
  const [kitchenType, setKitchenType] = useState(settings?.kitchenType || settings?.kitchen_type || '')
  const [timezone, setTimezone] = useState(settings?.timezone || 'Asia/Kolkata')

  const KITCHEN_TYPES = ['Restaurant', 'Cafe', 'Hospital', 'Hotel', 'School', 'Catering', 'Bakery', 'Ghost Kitchen', 'Other']
  const TIMEZONES = [
    { value: 'Asia/Kolkata', label: 'India (IST)' },
    { value: 'America/Toronto', label: 'Canada Eastern (Toronto)' },
    { value: 'America/Vancouver', label: 'Canada Pacific (Vancouver)' },
    { value: 'America/New_York', label: 'US Eastern (New York)' },
    { value: 'America/Chicago', label: 'US Central (Chicago)' },
    { value: 'America/Los_Angeles', label: 'US Pacific (Los Angeles)' },
    { value: 'Europe/London', label: 'UK (London)' },
    { value: 'Europe/Paris', label: 'Europe Central (Paris)' },
    { value: 'Asia/Dubai', label: 'UAE (Dubai)' },
    { value: 'Asia/Singapore', label: 'Singapore' },
    { value: 'Australia/Sydney', label: 'Australia Eastern (Sydney)' },
  ]

  const MODULES = [
    { id: 'stock',     title: 'Stock Monitoring',        desc: 'Track expiries, low stock and inventory alerts.', icon: Package, ready: true },
    { id: 'recipes',   title: 'Recipes',                 desc: 'Scan recipes & check ingredient availability.', icon: BookOpen, ready: true },
    { id: 'rota',      title: 'Rota (Staff Scheduling)', desc: 'Plan weekly shifts, roles and days off.',        icon: ChefHat,  ready: true },
    { id: 'analytics', title: 'Waste Analytics',         desc: 'Track disposed items, reasons and cost of waste.', icon: BarChart3, ready: true },
    { id: 'haccp',     title: 'HACCP Compliance',        desc: 'Fridge temps, cleaning logs, delivery checks. Pass health inspections.', icon: ShieldCheck, ready: true },
  ]

  const WIDGETS_BY_MODULE = {
    stock: [
      { id: 'all_items', title: 'All Items',       desc: 'Total items count.' },
      { id: 'critical',  title: 'Critical Stock',  desc: 'Very low quantity items.' },
      { id: 'expired',   title: 'Expired',         desc: 'Items past expiry date.' },
      { id: 'expiring',  title: 'Expiring Soon',   desc: 'Expiring within 7 days.' },
      { id: 'in_date',   title: 'In Date',         desc: 'Items with valid future dates.' },
      { id: 'use_today', title: 'Use Today',       desc: 'Urgent — use today or tomorrow.' },
    ],
    recipes: [
      { id: 'recipes',   title: 'Recipes',         desc: 'Shortcut card to your saved recipes.' },
    ],
    rota: [
      { id: 'rota_today', title: 'Today\'s Rota',  desc: 'Who is on shift today.' },
    ],
    analytics: [
      { id: 'waste_week', title: 'Waste (this week)', desc: 'Items disposed in the last 7 days.' },
    ],
  }

  const toggle = (list, setter, id) => {
    setter(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }

  const visibleGroups = modules
    .filter(m => WIDGETS_BY_MODULE[m])
    .map(m => ({ module: m, widgets: WIDGETS_BY_MODULE[m], title: MODULES.find(x => x.id === m)?.title }))

  const canSkipWidgetStep = visibleGroups.every(g => g.widgets.length === 0)

  async function finish() {
    if (busy) return
    setBusy(true)
    try {
      // Only include kitchenName/type if they're non-empty — never overwrite existing values with blanks
      const payload = { modulesEnabled: modules, dashboardWidgets: widgets }
      const kn = (kitchenName || '').trim()
      if (kn) payload.kitchenName = kn
      if (kitchenType) payload.kitchenType = kitchenType
      if (timezone) payload.timezone = timezone
      await onComplete(payload)
    } finally {
      setBusy(false)
    }
  }

  const totalSteps = canSkipWidgetStep ? 2 : 3

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-emerald-50 via-white to-teal-50 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-4 md:p-8 min-h-full">
        <div className="flex flex-col items-center mb-6">
          <img src="/logo-icon.png" alt="ShelfWise" className="h-16 w-16 rounded-2xl object-contain bg-white shadow-md" />
          <h1 className="text-2xl font-bold text-emerald-900 mt-3">Welcome to ShelfWise!</h1>
          <p className="text-sm text-emerald-700/70 mt-1">Let's set up your kitchen. Takes about a minute.</p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-6 max-w-md mx-auto">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`flex-1 h-1.5 rounded-full ${step >= i + 1 ? 'bg-emerald-500' : 'bg-slate-200'}`} />
          ))}
        </div>

        {/* Step 1 — kitchen basics */}
        {step === 1 && (
          <Card className="shadow-lg border-emerald-100">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="font-bold text-lg text-emerald-900">Step 1 · Kitchen details</h2>
                <p className="text-sm text-muted-foreground">Tell us about your kitchen.</p>
              </div>
              <div>
                <Label>Kitchen name *</Label>
                <Input value={kitchenName} onChange={e => setKitchenName(e.target.value)} placeholder="e.g. Bella Cucina" required autoFocus />
              </div>
              <div>
                <Label>Kitchen type</Label>
                <Select value={kitchenType} onValueChange={setKitchenType}>
                  <SelectTrigger><SelectValue placeholder="Choose one..." /></SelectTrigger>
                  <SelectContent>
                    {KITCHEN_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Timezone *</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500 mt-1">Your chef codes rotate at midnight in this timezone.</p>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={() => setStep(2)} disabled={!kitchenName.trim()} className="bg-emerald-600 hover:bg-emerald-700">
                  Next <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2 — module picker */}
        {step === 2 && (
          <Card className="shadow-lg border-emerald-100">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="font-bold text-lg text-emerald-900">Step 2 · What do you want to track?</h2>
                <p className="text-sm text-muted-foreground">Pick the tools your kitchen needs. You can add more later in Settings.</p>
              </div>
              <div className="space-y-2">
                {MODULES.map(m => {
                  const active = modules.includes(m.id)
                  const Icon = m.icon
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!m.ready}
                      onClick={() => m.ready && toggle(modules, setModules, m.id)}
                      className={`w-full text-left p-4 rounded-lg border-2 transition ${
                        !m.ready ? 'opacity-60 cursor-not-allowed bg-slate-50 border-slate-200' :
                        active ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-200 hover:border-emerald-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${active ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold flex items-center gap-2">
                            {m.title}
                            {!m.ready && <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">coming soon</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">{m.desc}</div>
                        </div>
                        <div className={`h-6 w-6 rounded-md border-2 flex items-center justify-center ${active ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'}`}>
                          {active && <Check className="h-4 w-4 text-white" />}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button
                  onClick={() => canSkipWidgetStep ? finish() : setStep(3)}
                  disabled={modules.length === 0 || busy}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {canSkipWidgetStep ? 'Finish Setup' : 'Next'} <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3 — widgets grouped by module */}
        {step === 3 && !canSkipWidgetStep && (
          <Card className="shadow-lg border-emerald-100">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="font-bold text-lg text-emerald-900">Step 3 · Pick your dashboard cards</h2>
                <p className="text-sm text-muted-foreground">Choose which cards appear on your dashboard. You can change these later in Settings.</p>
              </div>

              {visibleGroups.map(group => (
                <div key={group.module} className="space-y-2">
                  <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">{group.title}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.widgets.map(w => {
                      const active = widgets.includes(w.id)
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => toggle(widgets, setWidgets, w.id)}
                          className={`text-left p-3 rounded-lg border-2 transition ${active ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-200 hover:border-emerald-300'}`}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`mt-0.5 h-5 w-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${active ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'}`}>
                              {active && <Check className="h-3.5 w-3.5 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm">{w.title}</div>
                              <div className="text-[11px] text-muted-foreground">{w.desc}</div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={finish} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  Finish Setup
                </Button>
              </div>
              {widgets.length === 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                  Tip: You haven't picked any cards. You can add them later from Settings → Dashboard.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export function SetupWizard({ open, onClose, settings, saveSettings }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [type, setType] = useState('Restaurant')
  const [fields, setFields] = useState([])
  const [widgets, setWidgets] = useState([])

  const WIDGET_SUGGESTIONS = [
    { key: 'all_items', label: 'All Items', desc: 'Total count of products in your stock', icon: Boxes, color: 'text-slate-600', bg: 'bg-slate-50' },
    { key: 'expiring', label: 'Expiring Soon', desc: 'Items expiring within 7 days', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { key: 'expired', label: 'Expired', desc: 'Items already past their expiry date', icon: PackageX, color: 'text-red-600', bg: 'bg-red-50' },
    { key: 'critical', label: 'Critical Stock', desc: 'Products running low on quantity', icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50' },
    { key: 'expiry_alerts', label: 'Expiry Alert Banner', desc: 'Big alert when items are expiring', icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
    { key: 'search', label: 'Global Search', desc: 'Quick search box on dashboard', icon: Search, color: 'text-blue-600', bg: 'bg-blue-50' },
  ]

  useEffect(() => {
    if (open) {
      setStep(0)
      setName(settings.kitchenName || '')
      setType(settings.kitchenType || 'Restaurant')
      setFields(settings.customFields?.length ? [...settings.customFields] : [])
      const existing = Array.isArray(settings.dashboardWidgets) && settings.dashboardWidgets.length
        ? settings.dashboardWidgets
        : WIDGET_SUGGESTIONS.map(w => w.key)
      setWidgets(existing)
    }
  }, [open])

  const toggleWidget = (k) => setWidgets(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])

  const addField = () => setFields([...fields, { key: `field_${fields.length + 1}`, label: '', type: 'text' }])
  const updateField = (i, patch) => setFields(fields.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  const removeField = (i) => setFields(fields.filter((_, idx) => idx !== i))

  const finish = async () => {
    const cleanFields = fields
      .filter(f => f.label.trim())
      .map(f => ({
        key: (f.key || f.label).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40),
        label: f.label.trim(),
        type: f.type || 'text'
      }))
    await saveSettings({
      kitchenName: name.trim() || 'My Kitchen',
      kitchenType: type,
      customFields: cleanFields,
      dashboardWidgets: widgets,
      onboarded: true
    })
    onClose()
    toast.success('Welcome to ShelfWise! 🎉')
  }

  if (!open) return null
  const kitchenTypes = ['Restaurant', 'Cafe', 'Hotel', 'School', 'Hospital', 'Catering', 'Bakery', 'Other']
  const totalSteps = 4

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[640px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full flex-1 transition ${i <= step ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            ))}
          </div>
          <DialogTitle className="pt-3 text-2xl">
            {step === 0 && 'Welcome to ShelfWise 👋'}
            {step === 1 && 'Set up your kitchen'}
            {step === 2 && 'What do you want on your dashboard?'}
            {step === 3 && 'Add custom fields (optional)'}
          </DialogTitle>
        </DialogHeader>

        {step === 0 && (
          <div className="py-4 space-y-4">
            <p className="text-muted-foreground">Track perishable stock, reduce waste, and never miss an expiry again. Let's get you set up in under a minute.</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <ScanLine className="h-6 w-6 mx-auto text-emerald-600" />
                <p className="text-xs font-medium mt-1">AI Logbook Scan</p>
                <p className="text-[10px] text-muted-foreground">Photo → inventory</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <BookOpen className="h-6 w-6 mx-auto text-purple-600" />
                <p className="text-xs font-medium mt-1">Recipe Scan</p>
                <p className="text-[10px] text-muted-foreground">Allergens & stock</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <Clock className="h-6 w-6 mx-auto text-amber-600" />
                <p className="text-xs font-medium mt-1">Expiry Alerts</p>
                <p className="text-[10px] text-muted-foreground">Never waste again</p>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="py-4 space-y-4">
            <div>
              <Label>Kitchen Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bella Cucina" />
            </div>
            <div>
              <Label>Kitchen Type</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {kitchenTypes.map(t => (
                  <button key={t} onClick={() => setType(t)}
                    className={`text-sm py-2 px-2 rounded-lg border transition ${type === t ? 'bg-emerald-600 text-white border-emerald-600' : 'hover:bg-slate-50 border-slate-200'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">Tap the cards you want to see on your dashboard. Pick at least one — you can change this later in Settings.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {WIDGET_SUGGESTIONS.map(w => {
                const Icon = w.icon
                const active = widgets.includes(w.key)
                return (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => toggleWidget(w.key)}
                    className={`text-left flex items-start gap-3 p-3 rounded-lg border-2 transition ${active ? 'border-emerald-500 bg-emerald-50/60 shadow-sm' : 'border-slate-200 hover:border-emerald-300 bg-white'}`}
                  >
                    <div className={`h-9 w-9 rounded-lg ${w.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`h-5 w-5 ${w.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{w.label}</p>
                        {active && <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{w.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">{widgets.length} selected</p>
          </div>
        )}

        {step === 3 && (
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">Add any extra fields your kitchen tracks — supplier, cost, batch number, etc. Skip if you don't need them.</p>
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs">Field Name</Label>
                    <Input value={f.label} onChange={e => updateField(i, { label: e.target.value })} placeholder="Supplier" />
                  </div>
                  <div className="w-32">
                    <Label className="text-xs">Type</Label>
                    <Select value={f.type} onValueChange={v => updateField(i, { type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeField(i)}><X className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addField}><Plus className="h-4 w-4 mr-2" /> Add field</Button>
          </div>
        )}

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="ghost" onClick={() => step > 0 ? setStep(step - 1) : onClose()}>{step === 0 ? 'Skip' : 'Back'}</Button>
          {step < totalSteps - 1 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 2 && widgets.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Next <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={finish} className="bg-emerald-600 hover:bg-emerald-700">
              <Check className="h-4 w-4 mr-2" /> Finish Setup
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ChefCodeCard() {
  const [code, setCode] = useState('...')
  const [kitchenName, setKitchenName] = useState('')
  const [timezone, setTimezone] = useState('')
  const [loading, setLoading] = useState(true)
  const [rotating, setRotating] = useState(false)

  const loadCode = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/owner/chef-code')
      if (!res.ok) {
        // Chef users can't see this; hide the card content.
        setCode('—')
      } else {
        const data = await safeJson(res)
        setCode(data.code || '—')
        setKitchenName(data.kitchenName || '')
        setTimezone(data.timezone || '')
      }
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { loadCode() }, [])

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('Code copied to clipboard')
    } catch {
      toast.error('Could not copy — long-press to copy manually')
    }
  }

  async function rotate() {
    if (!confirm("This will regenerate today's code and invalidate the current one. Continue?")) return
    setRotating(true)
    try {
      const res = await fetch('/api/owner/rotate-code', { method: 'POST' })
      if (!res.ok) throw new Error()
      await loadCode()
      toast.success('New code generated')
    } catch {
      toast.error('Could not rotate code')
    } finally { setRotating(false) }
  }

  return (
    <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4">
      <Label className="text-emerald-900 text-sm font-bold">🔑 Today's Chef Code</Label>
      <p className="text-xs text-emerald-700 mt-1 mb-3">
        Share this with your kitchen team so they can log in as chefs. Rotates daily at midnight ({timezone || 'kitchen time'}).
      </p>
      <div className="flex gap-2 items-center">
        <div className="flex-1 text-center font-mono text-2xl tracking-[0.2em] bg-white rounded-md py-3 border-2 border-emerald-300 text-emerald-900">
          {loading ? <Loader2 className="h-5 w-5 animate-spin inline text-emerald-600" /> : code}
        </div>
        <Button variant="outline" size="sm" onClick={copyCode} disabled={loading || code === '—'} type="button">
          <Copy className="h-4 w-4 mr-1" /> Copy
        </Button>
      </div>
      <div className="mt-2 flex justify-between items-center">
        <p className="text-[11px] text-emerald-700/70">Kitchen: <b>{kitchenName || '—'}</b></p>
        <Button variant="ghost" size="sm" onClick={rotate} disabled={rotating || code === '—'} type="button" className="text-emerald-700 hover:text-emerald-900 h-7 px-2">
          {rotating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Rotate
        </Button>
      </div>
    </div>
  )
}

export function SettingsDialog({ open, onClose, settings, saveSettings, openWizard, isStaff, isOwner }) {
  const [tab, setTab] = useState('profile') // 'profile' | 'login' | 'dashboard' | 'fields'
  const [name, setName] = useState('')
  const [type, setType] = useState('Restaurant')
  const [fields, setFields] = useState([])
  const [inviteCode, setInviteCode] = useState('')
  const [alertEmail, setAlertEmail] = useState('')
  const [testing, setTesting] = useState(false)
  const [widgets, setWidgets] = useState([])
  const [modules, setModules] = useState([])
  const [locations, setLocations] = useState([])  // HACCP fridge/freezer locations
  const [currency, setCurrency] = useState('GBP')
  const [weeklyDigest, setWeeklyDigest] = useState(true)
  const [digestSending, setDigestSending] = useState(false)
  // Dirty tracking — CRITICAL: only send fields user actually touched to backend.
  // Prevents stale local state (e.g. if dialog opened before settings loaded)
  // from clobbering DB values on save. Each section tracks its own dirty flag.
  const [touched, setTouched] = useState({ profile: false, login: false, dashboard: false, fields: false, haccp: false })
  const markTouched = (section) => setTouched(prev => prev[section] ? prev : { ...prev, [section]: true })
  const ALL_WIDGETS = [
    // 'all_items' and 'recipes' removed — the dashboard now has fixed
    // Inventory / Add Products / Recipes tiles instead (user request).
    { key: 'expiring',  label: 'Expiring Soon' },
    { key: 'expired',   label: 'Expired items' },
    { key: 'critical',  label: 'Critical Stock level' },
    { key: 'in_date',   label: 'In Date items' },
    { key: 'use_today', label: 'Use Today (urgent)' },
    { key: 'rota_today', label: 'Today\'s Rota' },
    { key: 'waste_week', label: 'Waste (this week)' },
    { key: 'expiry_alerts', label: 'Expiry alert banner' },
    { key: 'urgent_list',   label: 'Urgent items list' },
    { key: 'search',        label: 'Global search box' },
  ]
  const ALL_MODULES = [
    // 'stock' and 'recipes' removed — always on (dashboard tiles cover them).
    { key: 'rota',      label: 'Rota',             desc: 'Weekly staff scheduling' },
    { key: 'analytics', label: 'Waste Analytics',  desc: 'Track disposals, reasons & cost' },
    { key: 'haccp',     label: 'HACCP Compliance', desc: 'Fridge temps, cleaning, delivery checks' },
  ]

  useEffect(() => {
    if (open) {
      // Only re-sync a section if the user hasn't touched it yet.
      // This lets the dialog absorb late-arriving settings (fetchSettings resolved
      // after dialog opened) WITHOUT clobbering the user's in-progress edits.
      if (!touched.profile) {
        setName(settings.kitchenName || '')
        setType(settings.kitchenType || 'Restaurant')
        setCurrency(settings.currency || 'GBP')
      }
      if (!touched.login) {
        setInviteCode(settings.inviteCode || '')
        setAlertEmail(settings.alertEmail || '')
        setWeeklyDigest(settings.weeklyDigestEnabled !== false)
      }
      if (!touched.dashboard) {
        setWidgets(Array.isArray(settings.dashboardWidgets) ? settings.dashboardWidgets : ALL_WIDGETS.map(w => w.key))
        setModules(Array.isArray(settings.modulesEnabled) ? settings.modulesEnabled : ['stock', 'recipes'])
      }
      if (!touched.fields) {
        setFields(settings.customFields?.length ? [...settings.customFields] : [])
      }
      if (!touched.haccp) {
        setLocations(Array.isArray(settings.haccpLocations) ? [...settings.haccpLocations] : [])
      }
    } else {
      // Reset dirty flags and tab when dialog closes so next open is clean.
      setTouched({ profile: false, login: false, dashboard: false, fields: false, haccp: false })
      setTab('profile')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settings])

  const toggleWidget = (k) => { markTouched('dashboard'); setWidgets(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]) }
  const toggleModule = (k) => { markTouched('dashboard'); setModules(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]) }

  const addField = () => {
    markTouched('fields')
    const newField = { key: `field_${fields.length + 1}_${Date.now().toString(36)}`, label: '', type: 'text' }
    setFields(prev => [...prev, newField])
    // Scroll to bottom of fields list after render
    setTimeout(() => {
      const el = document.getElementById('cf-list-end')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }
  const updateField = (i, patch) => { markTouched('fields'); setFields(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f)) }
  const removeField = (i) => { markTouched('fields'); setFields(prev => prev.filter((_, idx) => idx !== i)) }
  const rotateCode = () => { markTouched('login'); setInviteCode(Math.floor(100000 + Math.random() * 900000).toString()) }

  const sendTestEmail = async () => {
    // No "to" needed — the backend sends to the owner's LOGIN email.
    setTesting(true)
    try {
      const res = await fetch('/api/email/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await safeJson(res)
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success('Test email sent to your login email! Check your inbox.')
    } catch (e) {
      toast.error(e.message || 'Failed to send')
    } finally { setTesting(false) }
  }

  const save = async () => {
    // PATCH-STYLE PAYLOAD — only send fields user actually touched.
    // Any untouched section is OMITTED from the request so the backend keeps
    // whatever's already in the DB. This makes it impossible to overwrite
    // kitchen name (or widgets, or fields) with stale/default values.
    const payload = { onboarded: true }

    if (touched.profile) {
      const trimmedName = name.trim()
      if (trimmedName) payload.kitchenName = trimmedName  // never send blank name
      if (type) payload.kitchenType = type
      if (currency) payload.currency = currency
    }

    if (touched.login) {
      // alertEmail removed — all emails go to the owner's login email now
      if (inviteCode) payload.inviteCode = inviteCode
      payload.weeklyDigestEnabled = weeklyDigest
    }

    if (touched.dashboard) {
      payload.dashboardWidgets = widgets
      payload.modulesEnabled = modules
    }

    if (touched.fields) {
      const cleanFields = fields.filter(f => f.label.trim()).map(f => ({
        key: (f.key || f.label).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40),
        label: f.label.trim(),
        type: f.type || 'text'
      }))
      payload.customFields = cleanFields
    }

    if (touched.haccp) {
      payload.haccpLocations = locations
        .filter(l => l && String(l.name || '').trim())
        .map(l => ({
          id: l.id || `loc-${Math.random().toString(36).slice(2, 10)}`,
          name: String(l.name).trim().slice(0, 60),
          type: ['fridge', 'freezer', 'hot_hold', 'chiller'].includes(l.type) ? l.type : 'fridge',
          minC: Number.isFinite(Number(l.minC)) ? Number(l.minC) : null,
          maxC: Number.isFinite(Number(l.maxC)) ? Number(l.maxC) : null,
          active: l.active !== false,
        }))
    }

    // No touched section → nothing to save, just close.
    const anyTouched = touched.profile || touched.login || touched.dashboard || touched.fields || touched.haccp
    if (!anyTouched) { onClose(); return }

    await saveSettings(payload)
    onClose()
  }

  // Fire-off a live-preview of the weekly digest to the owner's email
  const sendTestDigest = async () => {
    setDigestSending(true)
    try {
      // Save current toggle first so backend knows the intent
      await saveSettings({ weeklyDigestEnabled: weeklyDigest })
      const res = await fetch('/api/digest/send-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await safeJson(res)
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success(`✅ Digest sent to ${data.to} — check your inbox`)
    } catch (e) {
      toast.error(e.message || 'Failed to send digest')
    } finally { setDigestSending(false) }
  }

  const kitchenTypes = ['Restaurant', 'Cafe', 'Hotel', 'School', 'Hospital', 'Catering', 'Bakery', 'Other']

  const tabs = [
    { key: 'profile', label: 'Kitchen', longLabel: 'Kitchen Profile', icon: ChefHat },
    { key: 'login', label: 'Login', longLabel: 'Login & Alerts', icon: Settings },
    ...(isOwner ? [{ key: 'staff', label: 'Staff', longLabel: 'Staff', icon: Users }] : []),
    { key: 'dashboard', label: 'Dashboard', longLabel: 'Dashboard', icon: LayoutDashboard },
    { key: 'haccp', label: 'Fridges', longLabel: 'Fridges & Freezers', icon: Thermometer },
    { key: 'fields', label: 'Fields', longLabel: 'Custom Fields', icon: Package },
  ]

  // ---- HACCP location handlers ----
  const [selectedLocIds, setSelectedLocIds] = useState(new Set())
  const toggleLocSelected = (id) => {
    setSelectedLocIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const selectAllLocs = () => setSelectedLocIds(new Set(locations.map(l => l.id).filter(Boolean)))
  const clearSelectedLocs = () => setSelectedLocIds(new Set())
  const deleteSelectedLocs = () => {
    if (selectedLocIds.size === 0) return
    markTouched('haccp')
    setLocations(prev => prev.filter(l => !selectedLocIds.has(l.id)))
    setSelectedLocIds(new Set())
  }
  const addLocation = (defaults = {}) => {
    markTouched('haccp')
    const newLoc = {
      id: `loc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: defaults.name || '',
      type: defaults.type || 'fridge',
      minC: defaults.minC ?? null,
      maxC: defaults.maxC ?? null,
      active: true,
    }
    setLocations(prev => [...prev, newLoc])
    // Scroll list to newly added row
    setTimeout(() => {
      const el = document.getElementById('haccp-loc-end')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }
  const updateLocation = (i, patch) => { markTouched('haccp'); setLocations(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l)) }
  const removeLocation = (i) => { markTouched('haccp'); setLocations(prev => prev.filter((_, idx) => idx !== i)) }
  const LOCATION_TYPES = [
    { key: 'fridge', label: '❄️ Fridge', defaultRange: '0 to 5°C' },
    { key: 'chiller', label: '🧊 Chiller', defaultRange: '0 to 8°C' },
    { key: 'freezer', label: '🥶 Freezer', defaultRange: '≤ -18°C' },
    { key: 'hot_hold', label: '🔥 Hot Hold', defaultRange: '≥ 63°C' },
  ]

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[680px] max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Kitchen Settings</DialogTitle>
        </DialogHeader>

        {/* Tabs — horizontally scrollable on mobile, equal-width on desktop */}
        <div className="border-b bg-slate-50/60">
          <div className="flex overflow-x-auto no-scrollbar px-2 sm:px-4 gap-0.5">
            {tabs.map(t => {
              const Icon = t.icon
              const active = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap flex-shrink-0 ${active ? 'border-emerald-600 text-emerald-700 bg-white/60' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="sm:hidden">{t.label}</span>
                  <span className="hidden sm:inline">{t.longLabel}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
          {tab === 'profile' && (
            <div className="space-y-4">
              <div>
                <Label>Kitchen Name</Label>
                <Input value={name} onChange={e => { markTouched('profile'); setName(e.target.value) }} placeholder="Bella Cucina" />
              </div>
              <div>
                <Label>Kitchen Type</Label>
                <Select value={type} onValueChange={v => { markTouched('profile'); setType(v) }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{kitchenTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={currency || 'GBP'} onValueChange={v => { markTouched('profile'); setCurrency(v) }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GBP">🇬🇧 GBP (£)</SelectItem>
                    <SelectItem value="USD">🇺🇸 USD ($)</SelectItem>
                    <SelectItem value="EUR">🇪🇺 EUR (€)</SelectItem>
                    <SelectItem value="INR">🇮🇳 INR (₹)</SelectItem>
                    <SelectItem value="CAD">🇨🇦 CAD (C$)</SelectItem>
                    <SelectItem value="AUD">🇦🇺 AUD (A$)</SelectItem>
                    <SelectItem value="SGD">🇸🇬 SGD (S$)</SelectItem>
                    <SelectItem value="AED">🇦🇪 AED</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Used for cost tracking, waste value, invoice imports.</p>
              </div>

              {/* App Language — persisted in browser (localStorage), reactive across the whole UI */}
              <div>
                <Label>🌍 App Language</Label>
                <div className="mt-1">
                  <LanguageSwitcher />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Menus, buttons and messages will use this language.</p>
              </div>

              <p className="text-xs text-muted-foreground">These appear in the header and your email alerts.</p>

              {openWizard && (
                <div className="pt-4 mt-2 border-t">
                  <Label className="text-sm font-semibold">Setup Wizard</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2">Re-run the setup wizard to revisit kitchen type, dashboard widgets, and custom fields.</p>
                  <Button variant="outline" size="sm" onClick={openWizard}>
                    <Sparkles className="h-4 w-4 mr-2" /> Re-run setup wizard
                  </Button>
                </div>
              )}
            </div>
          )}

          {tab === 'login' && (
            <div className="space-y-5">
              {/* Everyone (owner + staff) sees THEIR OWN staff code here */}
              <MyStaffCodeCard />

              {/* DPDP Data & Privacy — owner only */}
              {isOwner && <DataPrivacyCard />}

              {/* Old daily chef-code card removed (June 2025) — replaced by the
                  4-digit Staff Code system (Settings → Staff). */}
              <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50 p-4">
                <Label className="text-indigo-900 text-sm font-bold">🔢 Staff Codes</Label>
                <p className="text-xs text-indigo-700 mt-1">
                  Staff now log in with their personal <b>4-digit staff code</b> — on the kitchen tablet (after you log in) or on their own phone with the kitchen name. Manage everyone's codes in <b>Settings → Staff</b>.
                </p>
              </div>

              {/* Alert Email input removed (user request) — every email (daily
                  expiry alerts, weekly digest, password reset) now goes to the
                  owner's LOGIN email automatically. */}
              <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Label className="text-emerald-900 text-sm font-bold">📬 Email Notifications</Label>
                    <p className="text-xs text-emerald-700 mt-1">
                      Daily expiry alerts and the Monday 8am weekly digest (waste, cost, expiring &amp; top-wasted items)
                      are all sent to your <b>login email</b> automatically.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer" title="Weekly digest on/off">
                    <input
                      type="checkbox"
                      checked={weeklyDigest}
                      onChange={e => { markTouched('login'); setWeeklyDigest(e.target.checked) }}
                      className="h-5 w-5 accent-emerald-600"
                    />
                    <span className="text-xs font-semibold text-emerald-900">{weeklyDigest ? 'ON' : 'OFF'}</span>
                  </label>
                </div>
                <div className="flex gap-2 flex-wrap mt-3">
                  <Button variant="outline" size="sm" type="button" onClick={sendTestEmail} disabled={testing} className="bg-white">
                    {testing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending…</> : '📧 Send test alert'}
                  </Button>
                  <Button variant="outline" size="sm" type="button" onClick={sendTestDigest} disabled={digestSending} className="bg-white">
                    {digestSending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending…</> : '📤 Send test digest'}
                  </Button>
                </div>
              </div>

              <NotificationSettingsCard />
            </div>
          )}

          {tab === 'staff' && (
            <div className="space-y-4">
              <StaffActivityCard />
            </div>
          )}

          {tab === 'dashboard' && (
            <div className="space-y-5">
              <div>
                <Label className="text-base font-bold">Modules enabled</Label>
                <p className="text-xs text-muted-foreground">Which features appear in your top navigation.</p>
              </div>
              <div className="space-y-2">
                {ALL_MODULES.map(m => (
                  <label key={m.key} className={`flex items-center gap-3 p-3 rounded-lg border-2 transition ${m.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${modules.includes(m.key) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300'}`}>
                    <input
                      type="checkbox"
                      disabled={m.disabled}
                      checked={modules.includes(m.key)}
                      onChange={() => !m.disabled && toggleModule(m.key)}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{m.label}</div>
                      <div className="text-xs text-muted-foreground">{m.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="pt-3 border-t">
                <Label className="text-base font-bold">Dashboard cards</Label>
                <p className="text-xs text-muted-foreground">Tick the widgets you want to see on your dashboard.</p>
              </div>
              <div className="space-y-2">
                {ALL_WIDGETS.map(w => (
                  <label key={w.key} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${widgets.includes(w.key) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300'}`}>
                    <input type="checkbox" checked={widgets.includes(w.key)} onChange={() => toggleWidget(w.key)} className="h-4 w-4 accent-emerald-600" />
                    <span className="text-sm font-medium">{w.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {tab === 'haccp' && (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <Label className="text-base font-bold">Fridges & Freezers</Label>
                  <p className="text-xs text-muted-foreground">Add every fridge, freezer, chiller, and hot-hold unit in your kitchen. The AI scanner will match handwritten labels to these names.</p>
                </div>
                <Button size="sm" onClick={() => addLocation()} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-1" /> Add</Button>
              </div>

              {/* Quick-add presets — encourage adding common units in one tap */}
              <div className="flex flex-wrap gap-1.5 text-xs">
                <button type="button" onClick={() => addLocation({ name: 'Walk-in Fridge', type: 'fridge' })} className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">+ Walk-in Fridge</button>
                <button type="button" onClick={() => addLocation({ name: 'Walk-in Freezer', type: 'freezer' })} className="px-2 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100">+ Walk-in Freezer</button>
                <button type="button" onClick={() => addLocation({ name: 'Upright Fridge', type: 'fridge' })} className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">+ Upright Fridge</button>
                <button type="button" onClick={() => addLocation({ name: 'Upright Freezer', type: 'freezer' })} className="px-2 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100">+ Upright Freezer</button>
                <button type="button" onClick={() => addLocation({ name: 'Hot Hold', type: 'hot_hold' })} className="px-2 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100">+ Hot Hold</button>
                <button type="button" onClick={() => addLocation({ name: 'Salad Chiller', type: 'chiller' })} className="px-2 py-1 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100">+ Salad Chiller</button>
              </div>

              {locations.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Thermometer className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No fridges or freezers yet</p>
                  <p className="text-xs">Tap a preset above or "Add" to create your first unit.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Multi-select toolbar — appears when any row selected */}
                  {selectedLocIds.size > 0 && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <span className="text-xs font-semibold text-red-800">{selectedLocIds.size} selected</span>
                      <div className="flex-1" />
                      <Button size="sm" variant="outline" onClick={clearSelectedLocs} className="h-7 text-xs">Cancel</Button>
                      <Button size="sm" onClick={deleteSelectedLocs} className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white">
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete selected
                      </Button>
                    </div>
                  )}

                  {/* Select-all bar */}
                  {locations.length > 1 && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground pl-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLocIds.size === locations.length && locations.length > 0}
                        onChange={() => selectedLocIds.size === locations.length ? clearSelectedLocs() : selectAllLocs()}
                        className="h-3.5 w-3.5 accent-emerald-600"
                      />
                      Select all
                    </label>
                  )}

                  {locations.map((l, i) => {
                    const meta = LOCATION_TYPES.find(t => t.key === l.type) || LOCATION_TYPES[0]
                    const isSelected = selectedLocIds.has(l.id)
                    return (
                      <div key={l.id || i} className={`bg-white border rounded-lg p-3 space-y-2 ${l.active === false ? 'opacity-50' : ''} ${isSelected ? 'ring-2 ring-red-300 bg-red-50/30' : ''}`}>
                        <div className="flex gap-2 items-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleLocSelected(l.id)}
                            className="h-4 w-4 accent-emerald-600 shrink-0"
                            title="Select for bulk delete"
                          />
                          <span className="text-xs text-muted-foreground font-semibold w-4 text-center shrink-0">{i + 1}</span>
                          <Input value={l.name || ''} onChange={e => updateLocation(i, { name: e.target.value })} placeholder="e.g. Walk-in Fridge #2" className="flex-1 min-w-0" />
                          <Select value={l.type || 'fridge'} onValueChange={v => updateLocation(i, { type: v })}>
                            <SelectTrigger className="w-32 shrink-0"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {LOCATION_TYPES.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" onClick={() => removeLocation(i)} className="text-red-600 hover:bg-red-50 shrink-0"><X className="h-4 w-4" /></Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pl-8 text-xs">
                          <span className="text-muted-foreground">Safe range:</span>
                          <span className="font-medium text-slate-700">Default {meta.defaultRange}</span>
                          <span className="text-muted-foreground">or set custom:</span>
                          <Input
                            type="number"
                            step="0.1"
                            value={l.minC ?? ''}
                            onChange={e => updateLocation(i, { minC: e.target.value === '' ? null : Number(e.target.value) })}
                            placeholder="Min °C"
                            className="h-7 w-20 text-xs"
                          />
                          <span className="text-muted-foreground">to</span>
                          <Input
                            type="number"
                            step="0.1"
                            value={l.maxC ?? ''}
                            onChange={e => updateLocation(i, { maxC: e.target.value === '' ? null : Number(e.target.value) })}
                            placeholder="Max °C"
                            className="h-7 w-20 text-xs"
                          />
                          <label className="ml-auto flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" checked={l.active !== false} onChange={e => updateLocation(i, { active: e.target.checked })} className="h-3.5 w-3.5 accent-emerald-600" />
                            <span className="text-muted-foreground">Active</span>
                          </label>
                        </div>
                      </div>
                    )
                  })}
                  <div id="haccp-loc-end" />
                </div>
              )}

              {locations.length > 0 && (
                <div className="text-[11px] text-muted-foreground bg-emerald-50/60 border border-emerald-100 rounded-lg p-2.5">
                  💡 <span className="font-medium">Tip:</span> The AI scanner uses these names to match handwritten labels on your temperature log sheets — no matter how they're written (e.g. "walk-in", "WIF", "Walkin fridge" all map to your "Walk-in Fridge").
                </div>
              )}

              {/* ---- Automatic sensor integration ---- */}
              <SensorSettingsCard locations={locations} />
            </div>
          )}

          {tab === 'fields' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Custom Fields</Label>
                  <p className="text-xs text-muted-foreground">Track extras like supplier, cost, batch number, etc.</p>
                </div>
                <Button variant="default" size="sm" onClick={addField} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-1" /> Add Field</Button>
              </div>

              {fields.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No custom fields yet</p>
                  <p className="text-xs">Click "Add Field" above to create one.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {fields.map((f, i) => (
                    <div key={f.key || i} className="flex gap-2 items-center bg-white border rounded-lg p-2">
                      <span className="text-xs text-muted-foreground font-semibold w-6 text-center">{i + 1}</span>
                      <Input value={f.label} onChange={e => updateField(i, { label: e.target.value })} placeholder="Field name (e.g. Supplier)" className="flex-1" />
                      <Select value={f.type} onValueChange={v => updateField(i, { type: v })}>
                        <SelectTrigger className="w-28 shrink-0"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => removeField(i)} className="text-red-600 hover:bg-red-50 shrink-0"><X className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <div id="cf-list-end" />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-slate-50/60">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} className="bg-emerald-600 hover:bg-emerald-700"><Check className="h-4 w-4 mr-2" /> Save All</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function LoginGate({ settings, onAuth, saveSettings }) {
  const [mode, setMode] = useState('email')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [kitchenName, setKitchenName] = useState('')
  const [kitchenType, setKitchenType] = useState('Restaurant')
  const [generatedCode, setGeneratedCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('login') // 'login' | 'type' | 'widgets' | 'code'
  const KITCHEN_TYPES = ['Restaurant', 'Cafe', 'Hotel', 'School', 'Hospital', 'Catering', 'Bakery', 'Other']
  const ALL_WIDGETS = [
    { key: 'all_items', label: 'All Items', desc: 'Total products in stock', icon: Boxes, color: 'text-slate-600', bg: 'bg-slate-50' },
    { key: 'expiring', label: 'Expiring Soon', desc: 'Items expiring within 7 days', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { key: 'expired', label: 'Expired', desc: 'Items already past expiry', icon: PackageX, color: 'text-red-600', bg: 'bg-red-50' },
    { key: 'critical', label: 'Critical Stock', desc: 'Products running low', icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50' },
    { key: 'expiry_alerts', label: 'Expiry Alert Banner', desc: 'Big alert when items expire', icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
    { key: 'search', label: 'Global Search', desc: 'Quick search box on dashboard', icon: Search, color: 'text-blue-600', bg: 'bg-blue-50' },
  ]
  const [chosenWidgets, setChosenWidgets] = useState(ALL_WIDGETS.map(w => w.key))
  const hasInvite = !!(settings && settings.inviteCode)

  const toggleWidget = (k) => setChosenWidgets(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])

  const tryCode = async (e) => {
    e?.preventDefault()
    if (!code.trim()) { toast.error('Enter the kitchen code'); return }
    if (!hasInvite) { toast.error('No kitchen set up yet. Use the Owner tab first.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() })
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || 'Invalid code'); return }
      if (name.trim()) localStorage.setItem('shelfwise_user', name.trim())
      toast.success(`Welcome${name ? ', ' + name : ''}! 🎉`)
      onAuth()
    } finally { setBusy(false) }
  }

  const signInEmail = async (e) => {
    e?.preventDefault()
    if (!email.trim()) { toast.error('Email required'); return }
    if (hasInvite) {
      // existing kitchen — just sign in
      localStorage.setItem('shelfwise_user', name.trim() || email.trim())
      toast.success(`Welcome${name ? ', ' + name : ''}! 🎉`)
      onAuth()
      return
    }
    if (!name.trim()) { toast.error('Your name is required'); return }
    // First time setup — generate code immediately so they can share it
    setBusy(true)
    try {
      const newCode = Math.floor(100000 + Math.random() * 900000).toString()
      const next = {
        ...settings,
        alertEmail: email.trim(),
        inviteCode: newCode,
        onboarded: false,
      }
      await saveSettings(next)
      setGeneratedCode(newCode)
      if (name.trim()) localStorage.setItem('shelfwise_user', name.trim())
      setStep('code')
    } finally { setBusy(false) }
  }

  const finishSetup = async () => {
    setBusy(true)
    try {
      const next = {
        ...settings,
        kitchenName: kitchenName.trim() || 'My Kitchen',
        kitchenType,
        alertEmail: email.trim() || settings.alertEmail,
        inviteCode: generatedCode || settings.inviteCode,
        onboarded: true,
        dashboardWidgets: chosenWidgets,
      }
      await saveSettings(next)
      toast.success(`Welcome to ${next.kitchenName}! 🎉`)
      onAuth()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-emerald-50 via-white to-amber-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border p-8">
        <div className="text-center mb-6">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 mx-auto flex items-center justify-center mb-3 shadow-md">
            <ChefHat className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">ShelfWise</h1>
          <p className="text-sm text-muted-foreground mt-1">From shelf to plate — never lose track.</p>
        </div>

        {step === 'code' && generatedCode && (
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5 text-center">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Your kitchen code</p>
              <p className="text-4xl font-bold tracking-[0.3em] text-emerald-700 my-3 font-mono">{generatedCode}</p>
              <p className="text-xs text-emerald-700">Share this code with your team. They'll use it to log in.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={async () => {
                try {
                  if (navigator.share) {
                    await navigator.share({ title: 'ShelfWise Kitchen Code', text: `Join my kitchen on ShelfWise — code: ${generatedCode}` })
                  } else if (navigator.clipboard) {
                    await navigator.clipboard.writeText(generatedCode)
                    toast.success('Code copied!')
                  }
                } catch {}
              }}
            >
              📋 Share / Copy code
            </Button>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setStep('kitchen-name')}>
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {step === 'kitchen-name' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">Name your kitchen</h2>
              <p className="text-xs text-muted-foreground mt-1">This shows in the header and on email alerts.</p>
            </div>
            <div>
              <Label>Kitchen Name</Label>
              <Input value={kitchenName} onChange={e => setKitchenName(e.target.value)} placeholder="e.g. Bella Cucina" autoFocus />
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep('code')}>Back</Button>
              <Button
                onClick={() => {
                  if (!kitchenName.trim()) { toast.error('Kitchen name required'); return }
                  setStep('type')
                }}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Next <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 'type' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">What type of kitchen?</h2>
              <p className="text-xs text-muted-foreground mt-1">This helps us tailor your dashboard.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {KITCHEN_TYPES.map(t => (
                <button key={t} type="button" onClick={() => setKitchenType(t)}
                  className={`text-sm py-3 px-3 rounded-lg border-2 font-medium transition ${kitchenType === t ? 'bg-emerald-600 text-white border-emerald-600' : 'hover:border-emerald-300 border-slate-200 bg-white'}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep('kitchen-name')}>Back</Button>
              <Button onClick={() => setStep('widgets')} className="bg-emerald-600 hover:bg-emerald-700">
                Next <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 'widgets' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">What do you want on your dashboard?</h2>
              <p className="text-xs text-muted-foreground mt-1">Tap the cards you want. Pick at least one — you can change this anytime in Settings.</p>
            </div>
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {ALL_WIDGETS.map(w => {
                const Icon = w.icon
                const active = chosenWidgets.includes(w.key)
                return (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => toggleWidget(w.key)}
                    className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border-2 transition ${active ? 'border-emerald-500 bg-emerald-50/60 shadow-sm' : 'border-slate-200 hover:border-emerald-300 bg-white'}`}
                  >
                    <div className={`h-9 w-9 rounded-lg ${w.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`h-5 w-5 ${w.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{w.label}</p>
                        {active && <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{w.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">{chosenWidgets.length} selected</p>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('type')}>Back</Button>
              <Button onClick={finishSetup} disabled={busy || chosenWidgets.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />} Finish Setup
              </Button>
            </div>
          </div>
        )}

        {step === 'login' && (
          <>
            <p className="text-center text-sm text-muted-foreground mb-4">Sign in with</p>
            <div className="flex gap-2 mb-5 p-1 bg-slate-100 rounded-lg">
              <button onClick={() => setMode('email')} className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition flex items-center justify-center gap-1.5 ${mode === 'email' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-800'}`}>
                👑 Owner
              </button>
              <button onClick={() => setMode('code')} className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition flex items-center justify-center gap-1.5 ${mode === 'code' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-800'}`}>
                👨‍🍳 Chef
              </button>
            </div>

            {mode === 'code' && (
              <form onSubmit={tryCode} className="space-y-4">
                <p className="text-xs text-muted-foreground">{hasInvite ? 'Enter the 6-digit code your head chef shared.' : '⚠️ No kitchen set up yet. Use the Email tab first.'}</p>
                <div>
                  <Label>Your name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Chef Anna" />
                </div>
                <div>
                  <Label>Kitchen code</Label>
                  <Input value={code} onChange={e => setCode(e.target.value)} placeholder="6-digit code" className="text-center text-2xl tracking-[0.3em] font-mono h-14" maxLength={10} />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy || !hasInvite}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />} Enter Kitchen
                </Button>
              </form>
            )}

            {mode === 'email' && (
              <form onSubmit={signInEmail} className="space-y-4">
                <p className="text-xs text-muted-foreground">{hasInvite ? 'Sign in with your email.' : 'First time? Enter your details — we\'ll set up your kitchen in the next few steps.'}</p>
                <div>
                  <Label>Your name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Head Chef" />
                </div>
                <div>
                  <Label>Email <span className="text-muted-foreground font-normal">{!hasInvite && '(for alerts)'}</span></Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="chef@kitchen.com" />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : (hasInvite ? <Check className="h-4 w-4 mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />)} {hasInvite ? 'Sign In' : 'Create Kitchen →'}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}


// ============================================================================
// Notification settings card — browser Notification API opt-in.
// ============================================================================
// ============================================================================
// MY STAFF CODE — any logged-in person can see THEIR OWN 4-digit code here
// (e.g. to log in on their personal phone). Owner sees the owner code.
// ============================================================================
export function MyStaffCodeCard() {
  const [data, setData] = useState(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/staff/my-pin')
        if (res.ok) setData(await res.json())
      } catch {}
    })()
  }, [])

  if (!data?.pin) return null

  return (
    <div className="rounded-lg border-2 border-indigo-300 bg-indigo-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <Label className="text-indigo-900 text-sm font-bold">
            🔢 Your staff code{data.name && data.name !== 'Owner' ? ` — ${data.name}` : data.isOwner ? ' (Owner)' : ''}
          </Label>
          <p className="text-xs text-indigo-700 mt-0.5">
            {data.isOwner
              ? 'Unlocks full owner mode on the kitchen tablet. Keep it private.'
              : 'Tap it on the kitchen tablet — or use it with the kitchen name to log in on your own phone. Keep it private.'}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="font-mono text-lg font-bold tracking-[0.25em] bg-white border border-indigo-300 rounded-md px-2.5 py-1 text-indigo-900">
            {show ? data.pin : '••••'}
          </span>
          <Button variant="ghost" size="sm" type="button" onClick={() => setShow(v => !v)} className="h-8 px-2" title={show ? 'Hide code' : 'Show code'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// DPDP DATA & PRIVACY (owner only, July 2025) — consent register, full data
// export (portability) and deletion request, per the DPDP Act.
// ============================================================================
export function DataPrivacyCard() {
  const [showConsents, setShowConsents] = useState(false)
  const [consents, setConsents] = useState([])
  const [consentsLoading, setConsentsLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fmtT = (d) => { try { return new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return d } }

  const toggleConsents = async () => {
    const next = !showConsents
    setShowConsents(next)
    if (next && consents.length === 0) {
      setConsentsLoading(true)
      try {
        const res = await fetch('/api/privacy/consents')
        const data = await safeJson(res)
        setConsents(Array.isArray(data.items) ? data.items : [])
      } catch {} finally { setConsentsLoading(false) }
    }
  }

  const exportData = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/privacy/export')
      const data = await safeJson(res)
      if (!res.ok) throw new Error(data.error || 'Export failed')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `shelfwise-data-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      toast.success('Data export downloaded 📦')
    } catch (e) { toast.error(e.message || 'Export failed') } finally { setExporting(false) }
  }

  const requestDeletion = async () => {
    if (!window.confirm('Request deletion of your ENTIRE account and all kitchen data?\n\nThis includes products, staff records, photos, temperature logs and history. Processing takes up to 30 days and cannot be undone.')) return
    const typed = window.prompt('Type DELETE to confirm your deletion request:')
    if (typed !== 'DELETE') { toast.info('Deletion request cancelled'); return }
    setDeleting(true)
    try {
      const res = await fetch('/api/privacy/delete-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await safeJson(res)
      if (!res.ok) throw new Error(data.error || 'Request failed')
      toast.success(data.message || 'Deletion request recorded — processed within 30 days')
    } catch (e) { toast.error(e.message || 'Request failed') } finally { setDeleting(false) }
  }

  return (
    <div className="rounded-lg border-2 border-slate-300 bg-slate-50 p-4">
      <Label className="text-sm font-bold">🔐 Data &amp; Privacy (DPDP)</Label>
      <p className="text-xs text-muted-foreground mt-1">
        We collect: owner account details, staff names &amp; staff codes, scan/label photos (processed by AI then discarded), and temperature/HACCP records — used only to run your kitchen&apos;s inventory and food-safety compliance.
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button variant="outline" size="sm" onClick={exportData} disabled={exporting} className="bg-white">
          {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />} Export all my data
        </Button>
        <Button variant="outline" size="sm" onClick={toggleConsents} className="bg-white">
          <FileText className="h-4 w-4 mr-1.5" /> {showConsents ? 'Hide consent records' : 'Consent records'}
        </Button>
        <Button variant="outline" size="sm" onClick={requestDeletion} disabled={deleting} className="bg-white text-red-600 border-red-200 hover:bg-red-50">
          {deleting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />} Request data deletion
        </Button>
      </div>
      {showConsents && (
        <div className="mt-3 rounded-lg border bg-white p-2.5 max-h-56 overflow-y-auto">
          {consentsLoading ? (
            <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : consents.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">No consent records yet — they are logged when people sign up or first log in with their staff code.</p>
          ) : (
            <div className="space-y-1">
              {consents.map(c => (
                <div key={c.id} className="flex items-start justify-between gap-2 border-b last:border-0 py-1.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold capitalize">{c.person || 'Unknown'}</p>
                    <p className="text-[11px] text-muted-foreground">{c.detail}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{fmtT(c.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground mt-2">Deletion requests are processed within 30 days as required by the DPDP Act.</p>
    </div>
  )
}

export function NotificationSettingsCard() {
  // Notification mode per device (user request, June 2025):
  //  'mute'  — nothing: no in-app expiry banner, no home-screen push
  //  'inapp' — expiry alerts inside the app only (banner on dashboard)
  //  'push'  — in-app + real Web Push to the device home screen
  // Stored in localStorage 'sw_notify_mode'; push subscription is synced to it.
  const [supported, setSupported] = useState(true)
  const [permission, setPermission] = useState('default')
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [isIOSBrowser, setIsIOSBrowser] = useState(false)
  const [mode, setMode] = useState('inapp')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    setIsIOSBrowser(iOS && !standalone)
    const pushSupported = ('Notification' in window) && ('serviceWorker' in navigator) && ('PushManager' in window)
    if (!pushSupported) setSupported(false)
    if (pushSupported) setPermission(Notification.permission)
    ;(async () => {
      let isSub = false
      try {
        if (pushSupported) {
          const reg = await navigator.serviceWorker.getRegistration()
          const sub = reg ? await reg.pushManager.getSubscription() : null
          isSub = !!sub
          setSubscribed(isSub)
        }
      } catch {}
      // Restore saved mode; default to 'push' when already subscribed, else 'inapp'
      try {
        const saved = localStorage.getItem('sw_notify_mode')
        if (saved === 'mute' || saved === 'inapp' || saved === 'push') setMode(saved)
        else setMode(isSub ? 'push' : 'inapp')
      } catch {}
    })()
  }, [])

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
    return outputArray
  }

  const subscribePush = async () => {
    const perm = await Notification.requestPermission()
    setPermission(perm)
    if (perm !== 'granted') throw new Error('Permission denied. Re-enable it in your browser settings.')
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    const keyRes = await fetch('/api/push/public-key')
    const keyData = await keyRes.json().catch(() => ({}))
    if (!keyRes.ok || !keyData.key) throw new Error(keyData.error || 'Push not configured on the server')
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.key),
      })
    }
    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    })
    const saveData = await saveRes.json().catch(() => ({}))
    if (!saveRes.ok) throw new Error(saveData.error || 'Could not save subscription')
    setSubscribed(true)
  }

  const unsubscribePush = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {})
        await sub.unsubscribe()
      }
    } catch {}
    setSubscribed(false)
  }

  const chooseMode = async (next) => {
    if (busy || next === mode) return
    setBusy(true)
    try {
      if (next === 'push') {
        if (!supported) { toast.error("This browser doesn't support home-screen notifications"); return }
        await subscribePush()
        toast.success('Notifications ON — in app + home screen 🔔')
      } else {
        if (subscribed) await unsubscribePush()
        toast.success(next === 'mute' ? 'Notifications muted on this device 🔕' : 'Notifications will show inside the app only 📱')
      }
      setMode(next)
      try {
        localStorage.setItem('sw_notify_mode', next)
        if (next !== 'mute') localStorage.setItem('sw_notify_last_on', next)
      } catch {}
    } catch (e) {
      toast.error(e.message || 'Could not change notification setting')
    } finally { setBusy(false) }
  }

  const test = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/push/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Test failed')
      toast.success(`Test sent to ${data.sent} device${data.sent !== 1 ? 's' : ''} — check your notifications!`)
    } catch (e) {
      toast.error(e.message || 'Test failed')
    } finally { setBusy(false) }
  }

  const OPTIONS = [
    { key: 'inapp', emoji: '📱', label: 'In app only', desc: 'Expiry alerts show inside the app (dashboard banners). No pop-ups on the home screen.' },
    { key: 'push',  emoji: '🔔', label: 'App + home screen', desc: 'Dashboard banners PLUS push notifications on this device — expiring items & HACCP reminders, even when the app is closed.', disabled: !supported },
  ]
  const notifOn = mode !== 'mute'
  const toggleNotifications = (checked) => {
    if (checked) {
      // Restore the last ON mode (defaults to in-app; never auto-triggers the push permission prompt)
      let last = 'inapp'
      try { const l = localStorage.getItem('sw_notify_last_on'); if (l === 'push' || l === 'inapp') last = l } catch {}
      chooseMode(last === 'push' && supported ? 'push' : 'inapp')
    } else {
      try { if (mode !== 'mute') localStorage.setItem('sw_notify_last_on', mode) } catch {}
      chooseMode('mute')
    }
  }

  return (
    <div className={`rounded-lg border-2 p-4 ${mode === 'push' ? 'border-emerald-300 bg-emerald-50' : mode === 'mute' ? 'border-slate-300 bg-slate-50' : 'border-sky-200 bg-sky-50/50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label className="text-sm font-bold">🔔 Notifications on this device</Label>
          <p className="text-xs text-muted-foreground mt-1">Per device — the kitchen tablet and each phone can be different.</p>
        </div>
        {/* Master ON/OFF switch */}
        <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer" title="Notifications on/off">
          <input
            type="checkbox"
            checked={notifOn}
            disabled={busy}
            onChange={e => toggleNotifications(e.target.checked)}
            className="h-5 w-5 accent-emerald-600"
          />
          <span className={`text-xs font-semibold ${notifOn ? 'text-emerald-700' : 'text-slate-500'}`}>{notifOn ? 'ON' : 'OFF'}</span>
        </label>
      </div>
      {!notifOn ? (
        <p className="text-xs text-slate-500 mt-3">🔕 Muted — no notification pop-ups on this device. (Dashboard expiry banners always stay visible.) Flip the switch to turn notifications back on.</p>
      ) : (
      <div className="space-y-1.5 mt-3">
        {OPTIONS.map(o => (
          <button
            key={o.key}
            type="button"
            onClick={() => chooseMode(o.key)}
            disabled={busy || o.disabled}
            className={`w-full text-left rounded-lg border-2 px-3 py-2.5 transition flex items-start gap-2.5 ${
              mode === o.key ? 'border-emerald-500 bg-white shadow-sm' : 'border-transparent bg-white/70 hover:border-slate-300'
            } ${o.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className="text-xl leading-none mt-0.5">{o.emoji}</span>
            <span className="min-w-0">
              <span className="text-sm font-semibold flex items-center gap-1.5">
                {o.label}
                {mode === o.key && <Check className="h-4 w-4 text-emerald-600" />}
              </span>
              <span className="block text-[11px] text-muted-foreground">{o.desc}</span>
            </span>
          </button>
        ))}
      </div>
      )}
      {busy && <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Updating…</p>}
      {mode === 'push' && subscribed && (
        <Button variant="outline" size="sm" onClick={test} disabled={busy} className="mt-2 bg-white">
          Send test notification
        </Button>
      )}
      {!supported && isIOSBrowser && (
        <p className="text-[11px] text-amber-700 mt-2">iPhone/iPad: install the app first (Share → Add to Home Screen), then reopen it to unlock "App + home screen".</p>
      )}
      {supported && permission === 'denied' && (
        <p className="text-[11px] text-amber-700 mt-2">Notifications are blocked in your browser settings — allow them to use "App + home screen".</p>
      )}
    </div>
  )
}


// ============================================================================
// Dispose (waste-log) dialog — asks the user WHY a product is being removed.
// "Used up" is NOT logged as waste. Anything else creates a waste_log row.
// ============================================================================

// ============================================================================
// CONNECT SENSORS — automatic fridge/freezer sensor integration (June 2025).
// Vendor-agnostic: the backend exposes a plug-in catalog; this card renders
// whatever vendors exist. Readings flow into the same HACCP logbook as manual
// entries, labelled "Auto (Sensor)".
// ============================================================================
export function SensorSettingsCard({ locations = [] }) {
  const [catalog, setCatalog] = useState([])
  const [connection, setConnection] = useState(null)
  const [migrationNeeded, setMigrationNeeded] = useState(false)
  const [vendor, setVendor] = useState('')
  const [creds, setCreds] = useState({})
  const [interval, setIntervalMin] = useState(30)
  const [sensors, setSensors] = useState([])       // discovered sensors after connect
  const [mappings, setMappings] = useState([])     // [{sensorId, sensorName, location, enabled}]
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const activeLocations = (locations || []).filter(l => l.active !== false && l.name)

  const loadState = async () => {
    try {
      const [vRes, cRes] = await Promise.all([
        fetch('/api/sensors/vendors'),
        fetch('/api/sensors/connection'),
      ])
      if (vRes.ok) setCatalog(await vRes.json())
      if (cRes.ok) {
        const data = await cRes.json()
        setMigrationNeeded(!!data.migrationNeeded)
        if (data.connection) {
          setConnection(data.connection)
          setVendor(data.connection.vendor)
          setIntervalMin(data.connection.intervalMinutes || 30)
          setMappings(data.connection.mappings || [])
        }
      }
    } catch { /* ignore */ }
  }
  useEffect(() => { loadState() }, [])

  const vendorMeta = catalog.find(v => v.id === vendor)

  const connect = async () => {
    if (!vendor) { toast.error('Pick a vendor first'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/sensors/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor, credentials: creds, intervalMinutes: interval }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Connect failed')
      setConnection(data.connection)
      setSensors(data.sensors || [])
      // pre-seed mappings: every discovered sensor, enabled, best-guess location
      setMappings((data.sensors || []).map(s => {
        const guess = activeLocations.find(l => s.name.toLowerCase().includes(String(l.name).toLowerCase().split(' ')[0]))
        return { sensorId: s.id, sensorName: s.name, location: guess?.name || '', enabled: true }
      }))
      toast.success(`Connected — found ${data.sensors?.length || 0} sensors. Map them to your fridges below.`)
    } catch (e) {
      toast.error(e.message || 'Connect failed')
    } finally { setBusy(false) }
  }

  const saveMappings = async () => {
    const valid = mappings.filter(m => m.enabled && m.location)
    if (valid.length === 0) { toast.error('Map at least one sensor to a fridge/freezer'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/sensors/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings, intervalMinutes: interval }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setConnection(data.connection)
      toast.success('Sensor mappings saved — syncing first readings...')
      await syncNow()
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally { setBusy(false) }
  }

  const syncNow = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/sensors/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      if (Number(data.fails) > 0) {
        const list = (data.failedReadings || []).slice(0, 3).map(f => `${f.location}: ${f.temperatureC}°C`).join(', ')
        toast.error(`🚨 SENSOR ALERT — out of range: ${list}`, { duration: 10000 })
      }
      toast.success(`🤖 Synced ${data.inserted || 0} reading${data.inserted !== 1 ? 's' : ''} into the Logbook`)
      loadState()
    } catch (e) {
      toast.error(e.message || 'Sync failed')
    } finally { setSyncing(false) }
  }

  const disconnect = async () => {
    if (!window.confirm('Disconnect sensors? Existing readings stay in the Logbook.')) return
    setBusy(true)
    try {
      await fetch('/api/sensors/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      setConnection(null); setSensors([]); setMappings([]); setVendor(''); setCreds({})
      toast.success('Sensors disconnected')
    } finally { setBusy(false) }
  }

  const setMapping = (sensorId, patch) => setMappings(list => list.map(m => m.sensorId === sensorId ? { ...m, ...patch } : m))

  // Rows to render for mapping: freshly discovered sensors OR the saved mappings
  const mappingRows = sensors.length > 0 ? mappings : (connection?.mappings || [])

  return (
    <div className="rounded-lg border-2 border-sky-200 bg-sky-50/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <Label className="text-base font-bold flex items-center gap-1.5">📡 Connect Sensors <span className="text-[9px] font-bold bg-sky-600 text-white rounded px-1.5 py-0.5">NEW</span></Label>
          <p className="text-xs text-muted-foreground">Automatic fridge/freezer sensors log temperatures for you — readings appear in the Logbook as 🤖 Auto (Sensor), alongside your manual checks.</p>
        </div>
        {connection && (
          <Button size="sm" variant="outline" onClick={disconnect} disabled={busy} className="text-red-600">Disconnect</Button>
        )}
      </div>

      {migrationNeeded && (
        <div className="text-xs bg-amber-50 border border-amber-300 text-amber-900 rounded-lg p-2.5">
          ⚠️ Run <b>supabase/migration-15-sensor-integration.sql</b> in your Supabase SQL editor first, then reopen Settings.
        </div>
      )}

      {!connection ? (
        <>
          {/* Vendor picker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Sensor vendor</Label>
              <select value={vendor} onChange={e => { setVendor(e.target.value); setCreds({}) }}
                className="w-full h-9 rounded-md border border-input bg-white px-2 text-sm">
                <option value="">Choose your vendor...</option>
                {catalog.map(v => (
                  <option key={v.id} value={v.id} disabled={v.comingSoon}>{v.name}{v.comingSoon ? ' — coming soon' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Sync every</Label>
              <select value={interval} onChange={e => setIntervalMin(Number(e.target.value))}
                className="w-full h-9 rounded-md border border-input bg-white px-2 text-sm">
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={240}>4 hours</option>
              </select>
            </div>
          </div>

          {/* Vendor credential fields */}
          {vendorMeta && vendorMeta.credentialFields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {vendorMeta.credentialFields.map(f => (
                <div key={f.key}>
                  <Label className="text-xs">{f.label}</Label>
                  <Input type={f.type === 'password' ? 'password' : 'text'} placeholder={f.placeholder}
                    value={creds[f.key] || ''} onChange={e => setCreds(c => ({ ...c, [f.key]: e.target.value }))} />
                </div>
              ))}
            </div>
          )}
          {vendor === 'generic_rest' && (
            <p className="text-[11px] text-muted-foreground bg-white border rounded-lg p-2">
              Your vendor/middleware must expose: <code>GET /sensors</code> → <code>[{'{'}"id","name"{'}'}]</code> and <code>GET /readings?ids=…</code> → <code>[{'{'}"sensorId","temperatureC","recordedAt"{'}'}]</code>, authorised with <code>Bearer</code> key. Share this with your sensor provider.
            </p>
          )}
          {vendor === 'demo' && (
            <p className="text-[11px] text-sky-800 bg-sky-100 border border-sky-200 rounded-lg p-2">
              🧪 Demo mode creates 3 virtual sensors with realistic temperatures — perfect for trying the full flow before buying hardware. Readings are real Logbook entries (you can bulk-delete them later).
            </p>
          )}

          <Button onClick={connect} disabled={busy || !vendor} className="bg-sky-600 hover:bg-sky-700 text-white">
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null} Connect & Discover Sensors
          </Button>
        </>
      ) : (
        <>
          {/* Connected state */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Badge className="bg-sky-600 text-white hover:bg-sky-600">{catalog.find(v => v.id === connection.vendor)?.name || connection.vendor}</Badge>
            <span className="text-muted-foreground">every {connection.intervalMinutes} min</span>
            {connection.lastSyncAt && <span className="text-muted-foreground">· last sync {new Date(connection.lastSyncAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
            {connection.lastSyncStatus && <span className={`font-medium ${connection.lastSyncStatus.startsWith('Error') ? 'text-red-600' : 'text-emerald-700'}`}>· {connection.lastSyncStatus}</span>}
          </div>

          {/* Sensor → fridge mapping */}
          {mappingRows.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Sensor → Fridge mapping</Label>
              {mappingRows.map(m => (
                <div key={m.sensorId} className="flex items-center gap-2 bg-white border rounded-lg px-2.5 py-2">
                  <input type="checkbox" className="h-4 w-4 accent-sky-600 shrink-0" checked={!!m.enabled}
                    onChange={e => setMapping(m.sensorId, { enabled: e.target.checked })} disabled={sensors.length === 0} />
                  <span className="text-sm font-medium flex-1 min-w-0 truncate">{m.sensorName || m.sensorId}</span>
                  <span className="text-xs text-muted-foreground shrink-0">→</span>
                  <select value={m.location || ''} onChange={e => setMapping(m.sensorId, { location: e.target.value })}
                    disabled={sensors.length === 0}
                    className="h-8 rounded-md border border-input bg-white px-2 text-xs max-w-[45%]">
                    <option value="">— pick fridge —</option>
                    {activeLocations.map(l => <option key={l.id || l.name} value={l.name}>{l.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          {activeLocations.length === 0 && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">Add your fridges/freezers above first, then map sensors to them.</p>
          )}

          <div className="flex gap-2 flex-wrap">
            {sensors.length > 0 && (
              <Button size="sm" onClick={saveMappings} disabled={busy} className="bg-sky-600 hover:bg-sky-700 text-white">
                {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />} Save mapping & start
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />} Sync now
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            ⏱️ Readings sync automatically whenever anyone uses the app (respecting your interval). For true 24/7 background polling even when nobody opens the app, point a free pinger like <b>cron-job.org</b> at <code>/api/cron/sensor-sync</code> every 15 minutes — ask me for setup steps.
          </p>
        </>
      )}
    </div>
  )
}

// ============================================================================
// Staff (owner only) — see who logged in via code, remove names, and set
// per-person access. (Activity history section removed per user request.)
// Hides itself automatically for non-owners (API returns 403).
// ============================================================================
export function StaffActivityCard() {
  const [allowed, setAllowed] = useState(true)   // false when API says "Owner only"
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState('')

  // Add-staff form
  const [addName, setAddName] = useState('')
  const [adding, setAdding] = useState(false)

  // Activity history (lazy-loaded)
  const [showActivity, setShowActivity] = useState(false)
  const [activity, setActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityHasMore, setActivityHasMore] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const sRes = await fetch('/api/staff')
      if (sRes.status === 403) { setAllowed(false); return }
      const s = await sRes.json().catch(() => ({}))
      setStaff(Array.isArray(s.staff) ? s.staff : [])
    } catch {} finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const addStaff = async (e) => {
    e?.preventDefault?.()
    const name = addName.trim()
    if (!name) { toast.error('Type the person\'s name first'); return }
    setAdding(true)
    try {
      const res = await fetch('/api/staff/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not add')
      setAddName('')
      toast.success(`${name} added — their staff code is ${data.staff?.pin}`)
      load()
    } catch (err) { toast.error(err.message || 'Could not add staff member') } finally { setAdding(false) }
  }

  const regeneratePin = async (s) => {
    if (!window.confirm(`Generate a NEW staff code for "${s.name}"?\n\nTheir old code stops working immediately — tell them the new one.`)) return
    setRemoving(s.name)
    try {
      const res = await fetch('/api/staff/regenerate-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: s.name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '')
      toast.success(`New code for ${s.name}: ${data.pin}`)
      setStaff(prev => prev.map(x => x.name === s.name ? { ...x, pin: data.pin } : x))
    } catch (err) { toast.error(err.message || 'Could not change the code') } finally { setRemoving('') }
  }

  const loadActivity = async (offset = 0) => {
    setActivityLoading(true)
    try {
      const res = await fetch(`/api/activity?limit=50&offset=${offset}`)
      const data = await res.json().catch(() => ({}))
      const items = Array.isArray(data.items) ? data.items : []
      setActivity(prev => offset === 0 ? items : [...prev, ...items])
      setActivityHasMore(!!data.hasMore)
    } catch {} finally { setActivityLoading(false) }
  }
  const toggleActivity = () => {
    const next = !showActivity
    setShowActivity(next)
    if (next && activity.length === 0) loadActivity(0)
  }

  const ACTION_LABEL = {
    item_added: '➕ Added item', item_updated: '✏️ Edited item', item_deleted: '🗑️ Deleted item',
    waste_logged: '♻️ Logged waste', temp_logged: '🌡️ Logged temperature',
    recipe_saved: '📖 Saved recipe', recipe_updated: '📖 Edited recipe', recipe_deleted: '📖 Deleted recipe',
    consent: '🔐 Gave data consent', data_exported: '📦 Exported data', deletion_requested: '⚠️ Requested data deletion',
  }

  const removeStaff = async (name) => {
    if (!window.confirm(`Remove "${name}" from the staff list?\n\nTheir past activity stays in the log — this just frees the name so it can be used again.`)) return
    setRemoving(name)
    try {
      const res = await fetch(`/api/staff/${encodeURIComponent(name)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success(`${name} removed`)
      setStaff(prev => prev.filter(s => s.name !== name))
    } catch { toast.error('Could not remove name') } finally { setRemoving('') }
  }

  // Access options a person can be granted on top of standard staff access
  // (standard = add/view items, view/add recipes, log temps, waste analytics, notifications)
  const PERM_OPTIONS = [
    { key: 'orders', label: 'Orders', emoji: '🚚' },
    { key: 'logbook', label: 'Print & scan logbook', emoji: '📒' },
    { key: 'settings', label: 'Full kitchen settings', emoji: '⚙️' },
  ]
  const [choosing, setChoosing] = useState('')       // name whose access is being edited
  const [draftPerms, setDraftPerms] = useState([])

  const setFullAccess = async (s, full) => {
    if (!window.confirm(full
      ? `Give "${s.name}" FULL ACCESS?\n\nThey'll see and manage everything — orders, waste, logbook, all settings — just like you.`
      : `Remove full access from "${s.name}"?\n\nThey go back to standard access (add items, view/add recipes, log temps).`)) return
    setRemoving(s.name)
    try {
      const res = await fetch(`/api/staff/${encodeURIComponent(s.name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(full ? { role: 'manager' } : { role: 'staff', perms: [] }),
      })
      if (!res.ok) throw new Error()
      toast.success(full ? `${s.name} now has full access` : `${s.name} is back to standard access`)
      setStaff(prev => prev.map(x => x.name === s.name ? { ...x, role: full ? 'manager' : 'staff', perms: full ? x.perms : [] } : x))
    } catch { toast.error('Could not change access') } finally { setRemoving('') }
  }

  const openChooser = (s) => {
    setChoosing(s.name)
    setDraftPerms(Array.isArray(s.perms) ? [...s.perms] : [])
  }
  const savePerms = async (s) => {
    setRemoving(s.name)
    try {
      const res = await fetch(`/api/staff/${encodeURIComponent(s.name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perms: draftPerms }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Access updated for ${s.name}`)
      setStaff(prev => prev.map(x => x.name === s.name ? { ...x, role: 'staff', perms: [...draftPerms] } : x))
      setChoosing('')
    } catch { toast.error('Could not save access') } finally { setRemoving('') }
  }

  const accessSummary = (s) => {
    if (s.role === 'manager') return '✅ Full access'
    const extra = (s.perms || []).map(p => PERM_OPTIONS.find(o => o.key === p)?.label).filter(Boolean)
    return extra.length ? `Standard + ${extra.join(', ')}` : 'Standard access'
  }

  const fmtTime = (t) => {
    try {
      const d = new Date(t)
      const today = new Date().toDateString() === d.toDateString()
      return today ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  if (!allowed) return null

  const ownerEntry = staff.find(s => s.isOwner)
  const staffOnly = staff.filter(s => !s.isOwner)

  return (
    <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-indigo-900 text-sm font-bold">👥 Staff & Staff Codes</Label>
          <p className="text-xs text-indigo-700 mt-0.5">Each person has their own 4-digit staff code. They tap it on the kitchen tablet — or use it with the kitchen name to log in on their own phone.</p>
        </div>
        <Button variant="outline" size="sm" type="button" onClick={load} disabled={loading} className="bg-white shrink-0">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {/* Owner's own code */}
      {ownerEntry && (
        <div className="mt-3 rounded-lg border-2 border-emerald-300 bg-emerald-50 px-3 py-2.5 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-emerald-900">🔑 Your owner code</p>
            <p className="text-[11px] text-emerald-700">Unlocks full owner mode on the kitchen tablet. Keep it private.</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-mono text-lg font-bold tracking-[0.25em] bg-white border border-emerald-300 rounded-md px-2.5 py-1 text-emerald-900">{ownerEntry.pin}</span>
            <Button variant="ghost" size="sm" type="button" onClick={() => regeneratePin(ownerEntry)} disabled={removing === ownerEntry.name} className="h-8 px-2" title="Generate a new owner code">
              {removing === ownerEntry.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {/* Add a staff member */}
      <form onSubmit={addStaff} className="mt-3 flex gap-1.5">
        <Input value={addName} onChange={e => setAddName(e.target.value)} placeholder="New staff member's name…" maxLength={40} className="bg-white h-9" />
        <Button type="submit" size="sm" disabled={adding} className="h-9 bg-indigo-600 hover:bg-indigo-700 shrink-0">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Add</>}
        </Button>
      </form>

      {/* Staff names */}
      <div className="mt-3">
        <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider mb-1.5">Staff ({staffOnly.length})</p>
        {staffOnly.length === 0 ? (
          <p className="text-xs text-muted-foreground">No staff yet. Add your team above — each person gets their own 4-digit staff code.</p>
        ) : (
          <div className="space-y-1.5">
            {staffOnly.map(s => (
              <div key={s.name} className="bg-white rounded-lg border px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold capitalize truncate">{s.name}</p>
                    <p className={`text-[11px] font-medium ${s.role === 'manager' ? 'text-emerald-700' : 'text-muted-foreground'}`}>{accessSummary(s)}</p>
                    <p className="text-[10px] text-muted-foreground">Last active: {s.lastSeen ? fmtTime(s.lastSeen) : 'never logged in'}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="font-mono text-base font-bold tracking-[0.2em] bg-indigo-50 border border-indigo-200 rounded-md px-2 py-0.5 text-indigo-900" title={`${s.name}'s staff code`}>{s.pin || '— — — —'}</span>
                    <Button variant="ghost" size="sm" type="button" onClick={() => regeneratePin(s)} disabled={removing === s.name} className="h-8 px-1.5" title="Generate a new code">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" type="button" onClick={() => removeStaff(s.name)} disabled={removing === s.name} className="text-red-600 hover:bg-red-50 h-8 px-1.5" title="Remove person">
                      {removing === s.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {s.role === 'manager' ? (
                    <Button variant="outline" size="sm" type="button" onClick={() => setFullAccess(s, false)} disabled={removing === s.name} className="h-7 px-2.5 text-[11px] bg-white border-red-200 text-red-700 hover:bg-red-50">
                      Remove full access
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" type="button" onClick={() => setFullAccess(s, true)} disabled={removing === s.name} className="h-7 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-700">
                        Give full access
                      </Button>
                      <Button variant="outline" size="sm" type="button" onClick={() => choosing === s.name ? setChoosing('') : openChooser(s)} disabled={removing === s.name} className="h-7 px-2.5 text-[11px] bg-white">
                        {choosing === s.name ? 'Close' : 'Choose access'}
                      </Button>
                    </>
                  )}
                </div>
                {choosing === s.name && s.role !== 'manager' && (
                  <div className="mt-2 rounded-md border border-indigo-200 bg-indigo-50/50 p-2.5">
                    <p className="text-[11px] text-indigo-900 font-semibold mb-1.5">Everyone always has: add/view items, recipes, temp logging. Extra access for {s.name}:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {PERM_OPTIONS.map(o => (
                        <label key={o.key} className="flex items-center gap-2 bg-white rounded-md border px-2.5 py-1.5 cursor-pointer hover:border-indigo-300">
                          <input
                            type="checkbox"
                            checked={draftPerms.includes(o.key)}
                            onChange={e => setDraftPerms(prev => e.target.checked ? [...prev, o.key] : prev.filter(p => p !== o.key))}
                            className="h-4 w-4 accent-indigo-600"
                          />
                          <span className="text-xs font-medium">{o.emoji} {o.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end gap-1.5 mt-2">
                      <Button variant="ghost" size="sm" type="button" onClick={() => setChoosing('')} className="h-7 px-2.5 text-[11px]">Cancel</Button>
                      <Button size="sm" type="button" onClick={() => savePerms(s)} disabled={removing === s.name} className="h-7 px-2.5 text-[11px] bg-indigo-600 hover:bg-indigo-700">
                        {removing === s.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save access'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity history — who did what (login events are never recorded) */}
      <div className="mt-4">
        <Button variant="outline" size="sm" type="button" onClick={toggleActivity} className="bg-white w-full">
          <FileText className="h-4 w-4 mr-2" />
          {showActivity ? 'Hide activity history' : 'Show activity history'}
        </Button>
        {showActivity && (
          <div className="mt-2 rounded-lg border bg-white p-2.5 max-h-72 overflow-y-auto">
            {activityLoading && activity.length === 0 ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-indigo-500" /></div>
            ) : activity.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No activity recorded yet. Actions like adding items, logging waste and temperatures appear here.</p>
            ) : (
              <div className="space-y-1">
                {activity.map(a => (
                  <div key={a.id} className="flex items-start justify-between gap-2 border-b last:border-0 py-1.5">
                    <div className="min-w-0">
                      <p className="text-xs">
                        <span className="font-semibold capitalize">{a.person || 'Unknown'}</span>{' '}
                        <span className="text-slate-600">{ACTION_LABEL[a.action] || a.action}</span>
                      </p>
                      {a.detail && <p className="text-[11px] text-muted-foreground truncate">{a.detail}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{fmtTime(a.created_at)}</span>
                  </div>
                ))}
                {activityHasMore && (
                  <Button variant="ghost" size="sm" type="button" onClick={() => loadActivity(activity.length)} disabled={activityLoading} className="w-full h-8 text-xs">
                    {activityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load more'}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
