import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getAuthContext, generateChefCode, signChefToken, newCodeSeed } from '@/lib/auth'

const EMERGENT_URL = 'https://integrations.emergentagent.com/llm/v1/chat/completions'

function json(data, status = 200) {
  return NextResponse.json(data, { status })
}

function escapeLike(s) {
  return String(s).replace(/[%_]/g, c => '\\' + c)
}

// ----- Row transforms (products) --------------------------------------------
function fromDb(row) {
  if (!row) return row
  const cf = row.custom_fields || {}
  return {
    id: row.id,
    name: row.name || '',
    quantity: row.quantity ?? 0,
    unit: row.unit || 'ea',
    expiryDate: row.expiry_date || null,
    category: row.category || '',
    storageType: row.storage_type || 'Fridge',
    location: row.location || row.shelf || '',
    preparedBy: row.prepared_by || '',
    imageUrl: row.image_url || '',
    dateReceived: cf._dateReceived || row.created_at?.slice(0, 10) || null,
    unitCost: row.unit_cost != null ? Number(row.unit_cost) : null,
    reorderPoint: row.reorder_point != null ? Number(row.reorder_point) : null,
    allergens: Array.isArray(row.allergens) ? row.allergens : [],
    supplier: row.supplier || '',
    source: row.source || 'manual',
    sourceMeta: row.source_meta || null,
    customFields: cf,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toDb(body) {
  const cf = body.customFields && typeof body.customFields === 'object' ? { ...body.customFields } : {}
  if (body.dateReceived) cf._dateReceived = body.dateReceived
  const row = {
    name: body.name || '',
    quantity: Number(body.quantity) || 0,
    unit: body.unit || 'ea',
    expiry_date: body.expiryDate || null,
    category: body.category || '',
    storage_type: body.storageType || 'Fridge',
    location: body.location || '',
    prepared_by: body.preparedBy || '',
    image_url: body.imageUrl || '',
    custom_fields: cf,
    updated_at: new Date().toISOString(),
  }
  // Optional new fields — only set if the client sent them (avoids overwriting).
  if (body.unitCost !== undefined) row.unit_cost = body.unitCost === '' || body.unitCost === null ? null : Number(body.unitCost)
  if (body.reorderPoint !== undefined) row.reorder_point = body.reorderPoint === '' || body.reorderPoint === null ? null : Number(body.reorderPoint)
  if (body.allergens !== undefined) row.allergens = Array.isArray(body.allergens) ? body.allergens : []
  if (body.supplier !== undefined) row.supplier = String(body.supplier || '')
  if (body.source !== undefined) row.source = String(body.source || 'manual')
  if (body.sourceMeta !== undefined) row.source_meta = body.sourceMeta
  return row
}

function computeStatus(p) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const expiry = p.expiryDate ? new Date(p.expiryDate) : null
  const qty = Number(p.quantity) || 0
  if (expiry && expiry < today) return 'Expired'
  if (expiry) {
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
    if (diffDays >= 0 && diffDays <= 7) return 'Expiring'
  }
  if (qty <= 2) return 'Critical'
  return 'Ok'
}

const enrich = (p) => ({ ...p, _status: computeStatus(p) })

function addDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// Rota row → API shape
function rotaFromDb(r) {
  if (!r) return null
  return {
    id: r.id,
    shiftDate: r.shift_date,
    shiftSlot: r.shift_slot,
    chefName: r.chef_name || '',
    role: r.role || '',
    startTime: r.start_time || '',
    endTime: r.end_time || '',
    notes: r.notes || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// Waste row → API shape
function wasteFromDb(w) {
  if (!w) return null
  return {
    id: w.id,
    productId: w.product_id,
    productName: w.product_name,
    category: w.category || '',
    quantity: Number(w.quantity) || 0,
    unit: w.unit || 'ea',
    unitCost: w.unit_cost != null ? Number(w.unit_cost) : null,
    reason: w.reason || 'expired',
    disposedAt: w.disposed_at,
    disposedBy: w.disposed_by || '',
    notes: w.notes || '',
  }
}

// ---- HACCP row shapers ----
function haccpTempFromDb(r) {
  if (!r) return null
  return {
    id: r.id,
    location: r.location,
    temperatureC: Number(r.temperature_c),
    isPass: !!r.is_pass,
    recordedAt: r.recorded_at,
    recordedBy: r.recorded_by || '',
    notes: r.notes || '',
  }
}
function haccpTaskFromDb(r) {
  if (!r) return null
  return {
    id: r.id,
    taskName: r.task_name,
    area: r.area || '',
    frequency: r.frequency || 'daily',
    active: r.active !== false,
    createdAt: r.created_at,
  }
}
function haccpCleaningLogFromDb(r) {
  if (!r) return null
  return {
    id: r.id,
    taskId: r.task_id || null,
    taskName: r.task_name,
    completedAt: r.completed_at,
    completedBy: r.completed_by || '',
    notes: r.notes || '',
  }
}
function haccpDeliveryFromDb(r) {
  if (!r) return null
  return {
    id: r.id,
    supplier: r.supplier || '',
    deliveryDate: r.delivery_date,
    temperatureC: r.temperature_c != null ? Number(r.temperature_c) : null,
    temperatureOk: !!r.temperature_ok,
    packagingOk: !!r.packaging_ok,
    labelsOk: !!r.labels_ok,
    overallPass: !!r.overall_pass,
    checkedBy: r.checked_by || '',
    notes: r.notes || '',
  }
}

// ISO week key like "2026-W27" — used to bucket waste-by-week analytics.
function weekKey(dateIso) {
  const d = new Date(dateIso)
  if (isNaN(d)) return 'unknown'
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7)
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}


// ----- Kitchen row → API shape ----------------------------------------------
function kitchenToApi(k) {
  if (!k) return null
  return {
    id: k.id,
    ownerEmail: k.owner_email,
    kitchenName: k.kitchen_name || '',
    kitchenType: k.kitchen_type || '',
    timezone: k.timezone || 'Asia/Kolkata',
    status: k.status || 'pending',
    dashboardWidgets: Array.isArray(k.dashboard_widgets) ? k.dashboard_widgets : ['all','expiring','expired','critical'],
    modulesEnabled: Array.isArray(k.modules_enabled) ? k.modules_enabled : ['stock','recipes'],
    customFields: Array.isArray(k.custom_fields) ? k.custom_fields : [],
    categories: Array.isArray(k.categories) ? k.categories : [],
    locations: Array.isArray(k.locations) ? k.locations : [],
    units: Array.isArray(k.units) ? k.units : [],
    onboarded: k.onboarded === true,
    alertEmail: k.alert_email || '',
    tagline: k.tagline || 'From shelf to plate — never lose track.',
    currency: k.currency || '',
    weeklyDigestEnabled: k.weekly_digest_enabled !== false,
    lastDigestSentAt: k.last_digest_sent_at,
    createdAt: k.created_at,
    approvedAt: k.approved_at,
  }
}

// ============================================================================
// Weekly Digest email
// ============================================================================
// Small helper that wraps Resend for anywhere in the file.
async function resendSend({ to, subject, html }) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return { ok: false, error: 'RESEND_API_KEY not set' }
  if (!to) return { ok: false, error: 'no recipient' }
  const from = process.env.MAIL_FROM || 'ShelfWise <onboarding@resend.dev>'
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html }),
    })
    const txt = await r.text()
    if (!r.ok) return { ok: false, status: r.status, error: txt.slice(0, 400) }
    return { ok: true, id: (() => { try { return JSON.parse(txt).id } catch { return null } })() }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

const CURRENCY_SYMBOL_SERVER = {
  GBP: '£', USD: '$', EUR: '€', INR: '₹', AED: 'د.إ', AUD: 'A$', CAD: 'C$', SGD: 'S$',
}

// Compute the weekly digest data for one kitchen. Returns null if nothing to report.
async function computeWeeklyDigest(sb, kitchen) {
  const kid = kitchen.id
  const nowISO = new Date().toISOString()
  const weekAgoISO = new Date(Date.now() - 7 * 86400000).toISOString()

  // Pull inventory
  const { data: products = [] } = await sb.from('products').select('*').eq('kitchen_id', kid).limit(5000)

  // Compute status client-side (same rule as computeStatus)
  const today = new Date(); today.setHours(0,0,0,0)
  const in7 = new Date(today); in7.setDate(today.getDate() + 7)

  let expired = [], expiring = [], reorder = []
  let inventoryValue = 0
  for (const p of products) {
    const qty = Number(p.quantity) || 0
    const cost = Number(p.unit_cost) || 0
    inventoryValue += qty * cost
    if (p.expiry_date) {
      const d = new Date(p.expiry_date)
      if (d < today) expired.push(p)
      else if (d <= in7) expiring.push(p)
    }
    if (p.reorder_point != null && Number(p.quantity) <= Number(p.reorder_point)) reorder.push(p)
  }
  expiring.sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))

  // Waste last 7 days
  let wasteEntries = []
  try {
    const { data } = await sb.from('waste_log').select('*').eq('kitchen_id', kid).gte('disposed_at', weekAgoISO).limit(2000)
    wasteEntries = data || []
  } catch { /* table may not exist yet */ }

  let wasteCount = wasteEntries.length
  let wasteCost = 0
  const wasteByItem = {}
  for (const w of wasteEntries) {
    const cost = (Number(w.unit_cost) || 0) * (Number(w.quantity) || 0)
    wasteCost += cost
    const key = w.product_name || '(unknown)'
    wasteByItem[key] = (wasteByItem[key] || 0) + cost
  }
  const topWasted = Object.entries(wasteByItem).sort((a, b) => b[1] - a[1]).slice(0, 3)

  // Money at risk (sum of unit_cost * qty for items expiring in next 7 days)
  let atRisk = 0
  for (const p of expiring) {
    atRisk += (Number(p.unit_cost) || 0) * (Number(p.quantity) || 0)
  }

  return {
    generatedAt: nowISO,
    kitchen: { name: kitchen.kitchen_name || 'Your kitchen', currency: kitchen.currency || 'GBP', timezone: kitchen.timezone },
    totalItems: products.length,
    inventoryValue,
    expired: expired.slice(0, 10).map(p => ({ name: p.name, qty: p.quantity, unit: p.unit, expiryDate: p.expiry_date })),
    expiring: expiring.slice(0, 10).map(p => ({ name: p.name, qty: p.quantity, unit: p.unit, expiryDate: p.expiry_date })),
    reorder: reorder.slice(0, 10).map(p => ({ name: p.name, qty: p.quantity, unit: p.unit, reorder: p.reorder_point })),
    atRisk,
    wasteCount,
    wasteCost,
    topWasted, // [[name, cost], ...]
  }
}

function fmtCurrency(cur, n) {
  const sym = CURRENCY_SYMBOL_SERVER[cur] || ''
  const abs = Math.abs(Number(n) || 0)
  const formatted = abs.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sym}${formatted}`
}

function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  } catch { return iso }
}

function buildDigestHtml(digest) {
  const cur = digest.kitchen.currency
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://shelfwise.co.in'
  const weekLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const hero = digest.wasteCost > 0
    ? { emoji: '📉', title: `You wasted ${fmtCurrency(cur, digest.wasteCost)} this week`, sub: `${digest.wasteCount} items disposed. Let's cut it next week.` }
    : { emoji: '✨', title: 'Zero waste this week', sub: 'Amazing — every ingredient made it to a plate. Keep it up.' }

  const listRow = (items, empty) => items.length === 0
    ? `<tr><td style="padding:8px 0;color:#94a3b8;font-style:italic">${empty}</td></tr>`
    : items.map(p => `<tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">
        <div style="font-weight:600;color:#0f172a">${escapeHtml(p.name || '')}</div>
        <div style="font-size:12px;color:#64748b">${p.qty || ''} ${escapeHtml(p.unit || '')}${p.expiryDate ? ' · expires ' + fmtDate(p.expiryDate) : ''}${p.reorder != null ? ' · reorder at ' + p.reorder : ''}</div>
      </td></tr>`).join('')

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>ShelfWise Weekly Digest</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#0f172a">
<div style="max-width:600px;margin:0 auto;background:#ffffff;">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#059669 0%,#047857 100%);color:white;padding:24px 24px 18px 24px">
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em">🍅 ShelfWise Weekly Digest</div>
    <div style="opacity:0.85;font-size:14px;margin-top:4px">${escapeHtml(digest.kitchen.name)} · Week ending ${weekLabel}</div>
  </div>

  <!-- Hero -->
  <div style="padding:28px 24px 16px 24px;text-align:center;border-bottom:1px solid #e2e8f0">
    <div style="font-size:44px;margin-bottom:4px">${hero.emoji}</div>
    <div style="font-size:22px;font-weight:700;color:#0f172a">${hero.title}</div>
    <div style="font-size:14px;color:#64748b;margin-top:6px">${hero.sub}</div>
  </div>

  <!-- Stats grid -->
  <div style="padding:20px 24px">
    <table role="presentation" style="width:100%;border-collapse:collapse">
      <tr>
        <td style="width:33%;text-align:center;padding:10px;background:#f0fdf4;border-radius:8px">
          <div style="font-size:22px;font-weight:700;color:#059669">${digest.totalItems}</div>
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Items in stock</div>
        </td>
        <td style="width:6px"></td>
        <td style="width:33%;text-align:center;padding:10px;background:#fef3c7;border-radius:8px">
          <div style="font-size:22px;font-weight:700;color:#b45309">${digest.expiring.length}</div>
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Expiring in 7d</div>
        </td>
        <td style="width:6px"></td>
        <td style="width:33%;text-align:center;padding:10px;background:#fee2e2;border-radius:8px">
          <div style="font-size:22px;font-weight:700;color:#b91c1c">${digest.expired.length}</div>
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Already expired</div>
        </td>
      </tr>
    </table>

    ${digest.atRisk > 0 ? `<div style="margin-top:14px;padding:12px;background:#fff7ed;border-left:4px solid #f59e0b;border-radius:4px;font-size:14px;color:#7c2d12">
      💰 <b>${fmtCurrency(cur, digest.atRisk)}</b> worth of stock expiring this week — plan a special or promotion.
    </div>` : ''}
  </div>

  <!-- Expiring soon -->
  <div style="padding:0 24px 20px 24px">
    <h3 style="margin:0 0 8px 0;font-size:16px;color:#0f172a">⏰ Expiring in the next 7 days</h3>
    <table role="presentation" style="width:100%;border-collapse:collapse">${listRow(digest.expiring, 'Nothing expiring soon — beautiful.')}</table>
  </div>

  <!-- Expired -->
  ${digest.expired.length > 0 ? `<div style="padding:0 24px 20px 24px">
    <h3 style="margin:0 0 8px 0;font-size:16px;color:#b91c1c">🚫 Already expired — dispose today</h3>
    <table role="presentation" style="width:100%;border-collapse:collapse">${listRow(digest.expired, '')}</table>
  </div>` : ''}

  <!-- Reorder -->
  ${digest.reorder.length > 0 ? `<div style="padding:0 24px 20px 24px">
    <h3 style="margin:0 0 8px 0;font-size:16px;color:#0f172a">🛒 Low stock — reorder soon</h3>
    <table role="presentation" style="width:100%;border-collapse:collapse">${listRow(digest.reorder, '')}</table>
  </div>` : ''}

  <!-- Waste breakdown -->
  ${digest.topWasted.length > 0 ? `<div style="padding:0 24px 20px 24px">
    <h3 style="margin:0 0 8px 0;font-size:16px;color:#0f172a">📊 Top wasted items this week</h3>
    <table role="presentation" style="width:100%;border-collapse:collapse">
      ${digest.topWasted.map(([name, cost]) => `<tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9">
        <div style="display:flex;justify-content:space-between">
          <span style="color:#0f172a">${escapeHtml(name)}</span>
          <span style="font-weight:600;color:#b91c1c">${fmtCurrency(cur, cost)}</span>
        </div>
      </td></tr>`).join('')}
    </table>
  </div>` : ''}

  <!-- CTA -->
  <div style="padding:8px 24px 32px 24px;text-align:center">
    <a href="${baseUrl}" style="display:inline-block;background:#059669;color:white;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px">Open ShelfWise →</a>
  </div>

  <!-- Footer -->
  <div style="padding:16px 24px;background:#f8fafc;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0">
    You're receiving this because Weekly Digest is enabled in your ShelfWise settings.<br/>
    Prefer no emails? Settings → Kitchen Profile → toggle off "Weekly digest emails".
  </div>
</div>
</body></html>`
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// ============================================================================
// AI helpers (scan / voice / recipe) — unchanged
// ============================================================================
async function scanImageForItems(base64DataUrl) {
  const key = process.env.EMERGENT_LLM_KEY
  if (!key) throw new Error('EMERGENT_LLM_KEY not set')
  const today = new Date().toISOString().slice(0, 10)
  const systemPrompt = `You are an expert kitchen inventory assistant. You read photos of handwritten kitchen logbooks, fridge whiteboards, prep lists, or product labels and extract structured inventory data.

Return ONLY a valid JSON object of the form: {"items":[ ... ]}. Each item must have:
- "name": short product name (e.g. "Whole Milk", "Chicken Breast")
- "quantity": a number (default 1 if unclear)
- "unit": one of "ea", "kg", "g", "L", "mL", "bunch", "pack", "box" (best guess)
- "expiryDate": "YYYY-MM-DD" if visible in image, else null. Today is ${today}.
- "category": broad category
- "storageType": "Fridge", "Freezer", "Dry", or "Ambient"
- "location": shelf/location string if visible, else ""
- "preparedBy": chef name if visible, else ""
Output strictly valid JSON.`

  const body = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [
        { type: 'text', text: 'Extract every inventory item visible in this image as JSON.' },
        { type: 'image_url', image_url: { url: base64DataUrl } }
      ]}
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  }
  const res = await fetch(EMERGENT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Emergent LLM ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || '{}'
  let parsed
  try { parsed = JSON.parse(content) } catch { const m = content.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { items: [] } }
  return Array.isArray(parsed.items) ? parsed.items : []
}

// Receipt / delivery-note parser — different prompt: focus on prices & supplier.
async function parseReceiptImage(base64DataUrl) {
  const key = process.env.EMERGENT_LLM_KEY
  if (!key) throw new Error('EMERGENT_LLM_KEY not set')
  const today = new Date().toISOString().slice(0, 10)
  const systemPrompt = `You are an expert at reading supplier delivery notes, invoices and shop receipts for professional kitchens.

Return ONLY valid JSON:
{
  "supplier": "supplier / shop name from the header (or '')",
  "receiptDate": "YYYY-MM-DD if visible, else null. Today is ${today}",
  "currency": "GBP / USD / EUR / INR / '' if unclear",
  "totalCost": number or null,
  "items": [
    {
      "name": "clean product name",
      "quantity": number (default 1),
      "unit": one of "ea"|"kg"|"g"|"L"|"mL"|"pack"|"box"|"bunch",
      "unitCost": price per single unit as a number, else null,
      "totalLineCost": total for the line item if printed, else null,
      "category": "Dairy" | "Meat" | "Produce" | "Dry Goods" | "Frozen" | "Cleaning" | "Beverages" | "Other",
      "storageType": "Fridge" | "Freezer" | "Dry" | "Ambient",
      "expiryDate": "YYYY-MM-DD" if visible next to the line, else null
    }
  ]
}

Rules:
- Ignore subtotals, VAT lines, delivery charges, discounts (do NOT list them as items).
- Do NOT invent expiry dates. Only fill if visible.
- Output STRICT JSON.`

  const body = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [
        { type: 'text', text: 'Read this receipt / delivery note and return the JSON described.' },
        { type: 'image_url', image_url: { url: base64DataUrl } }
      ]}
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  }
  const res = await fetch(EMERGENT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Emergent LLM ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || '{}'
  let parsed
  try { parsed = JSON.parse(content) } catch { const m = content.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {} }
  return {
    supplier: parsed.supplier || '',
    receiptDate: parsed.receiptDate || null,
    currency: parsed.currency || '',
    totalCost: parsed.totalCost != null ? Number(parsed.totalCost) : null,
    items: Array.isArray(parsed.items) ? parsed.items : [],
  }
}

// ---- Barcode: identify a product from a photo of the front of pack ----
// Fallback when public barcode databases (Open Food Facts / UPCitemdb / Beauty Facts)
// return no result — very common for regional or private-label products.
async function identifyProductFromPhoto(base64DataUrl, barcodeHint = '') {
  const key = process.env.EMERGENT_LLM_KEY
  if (!key) throw new Error('EMERGENT_LLM_KEY not set')
  const systemPrompt = `You are an expert at identifying packaged food/drink/cleaning products from a photo of the front of the pack.
${barcodeHint ? `Reference barcode: ${barcodeHint}\n` : ''}
Return ONLY a valid JSON object of shape:
{
  "name": "clean product name including brand + variant (e.g. 'Tesco Semi-Skimmed Milk 1L', 'Amul Butter Salted', 'Heinz Baked Beans')",
  "brand": "brand name only (e.g. 'Tesco', 'Amul', 'Heinz')",
  "quantity": number (numeric part of the pack size, default 1),
  "unit": "kg" | "g" | "L" | "mL" | "ea" | "pack" | "box",
  "category": "Dairy" | "Meat" | "Produce" | "Dry Goods" | "Frozen" | "Cleaning" | "Beverages" | "Snacks" | "Bakery" | "Other",
  "storageType": "Fridge" | "Freezer" | "Dry" | "Ambient",
  "confidence": "high" | "medium" | "low"
}

Rules:
- Read all visible text on the pack. Use the biggest/boldest text for the product name.
- If pack size is "500 g" then quantity=500, unit="g". If "1 L" then quantity=1, unit="L".
- If you cannot see the pack clearly, still make a best-guess and set confidence="low".
- Output STRICT JSON. No prose. No markdown.`

  const body = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [
        { type: 'text', text: 'Identify this product from the photo.' },
        { type: 'image_url', image_url: { url: base64DataUrl } }
      ]}
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  }
  const res = await fetch(EMERGENT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Emergent LLM ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || '{}'
  let parsed
  try { parsed = JSON.parse(content) } catch { const m = content.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {} }
  return {
    name: String(parsed.name || '').trim(),
    brand: String(parsed.brand || '').trim(),
    quantity: Number(parsed.quantity) || 1,
    unit: ['kg','g','L','mL','ea','pack','box'].includes(parsed.unit) ? parsed.unit : 'ea',
    category: String(parsed.category || '').trim(),
    storageType: ['Fridge','Freezer','Dry','Ambient'].includes(parsed.storageType) ? parsed.storageType : 'Ambient',
    confidence: ['high','medium','low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
  }
}

async function parseTextForItems(text) {
  const key = process.env.EMERGENT_LLM_KEY
  if (!key) throw new Error('EMERGENT_LLM_KEY not set')
  const today = new Date().toISOString().slice(0, 10)
  const systemPrompt = `Convert spoken kitchen inventory notes into structured items and return them as JSON. Today is ${today}.
Return ONLY a JSON object of shape: {"items":[{"name","quantity","unit","expiryDate","category","storageType","location"}]}.
- name: product name
- quantity: number (default 1)
- unit: "ea", "kg", "g", "L", "mL", "bunch", "pack", or "box"
- expiryDate: "YYYY-MM-DD" or null
- category: short category
- storageType: "Fridge", "Freezer", "Dry" or "Ambient"
- location: shelf/location if mentioned, else ""
Output strictly valid JSON with no other text.`
  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  }
  const res = await fetch(EMERGENT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Emergent LLM ${res.status}`)
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || '{}'
  let parsed
  try { parsed = JSON.parse(content) } catch { parsed = { items: [] } }
  return Array.isArray(parsed.items) ? parsed.items : []
}

async function scanRecipe({ image, text }) {
  const key = process.env.EMERGENT_LLM_KEY
  if (!key) throw new Error('EMERGENT_LLM_KEY not set')
  const systemPrompt = `You are a recipe parser. Extract structured recipe data and return it as JSON.
Return ONLY a JSON object of shape: {"title","servings","ingredients":[{"name","quantity","unit","notes"}],"allergens":[]}.
Output strictly valid JSON with no other text.`

  const body = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      image
        ? { role: 'user', content: [
            { type: 'text', text: 'Extract recipe.' },
            { type: 'image_url', image_url: { url: image } }
          ] }
        : { role: 'user', content: `Extract recipe from: ${text}` }
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  }
  const res = await fetch(EMERGENT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Emergent LLM ${res.status}`)
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || '{}'
  let parsed
  try { parsed = JSON.parse(content) } catch { parsed = {} }
  return {
    title: parsed.title || 'Untitled',
    servings: parsed.servings || null,
    ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
    allergens: Array.isArray(parsed.allergens) ? parsed.allergens : [],
  }
}

function matchIngredientToInventory(name, products) {
  if (!name) return null
  const n = String(name).toLowerCase().trim()
  let match = products.find(p => p.name.toLowerCase() === n)
  if (match) return match
  match = products.find(p => {
    const pn = p.name.toLowerCase()
    return pn.includes(n) || n.includes(pn)
  })
  return match || null
}

// ============================================================================
// AUTH HELPERS (route-scoped)
// ============================================================================
async function requireAuth(request) {
  const ctx = await getAuthContext(request)
  if (!ctx.authed) {
    return { ctx: null, error: json({ error: 'Not authenticated' }, 401) }
  }
  return { ctx, error: null }
}

async function requireOwnerOrChef(request) {
  const { ctx, error } = await requireAuth(request)
  if (error) return { ctx: null, error }
  if (!ctx.kitchenId) {
    return { ctx: null, error: json({ error: 'No kitchen linked to this account (awaiting approval?)' }, 403) }
  }
  if (ctx.role === 'owner' && ctx.kitchen?.status !== 'approved') {
    return { ctx: null, error: json({ error: 'Kitchen not yet approved by admin', status: ctx.kitchen?.status }, 403) }
  }
  return { ctx, error: null }
}

async function requireAdmin(request) {
  const { ctx, error } = await requireAuth(request)
  if (error) return { ctx: null, error }
  if (!ctx.isAdmin) return { ctx: null, error: json({ error: 'Admin only' }, 403) }
  return { ctx, error: null }
}

// ============================================================================
// GET
// ============================================================================
export async function GET(request, { params }) {
  try {
    const path = (params?.path || []).join('/')
    const sb = supabaseAdmin

    // ----- PUBLIC endpoints -----
    if (path === '' || path === 'health') return json({ ok: true, service: 'ShelfWise API (Supabase / multi-tenant)' })

    // ---- CRON: weekly digest — Vercel calls this every Monday 8am UTC ----
    // Auth: shared secret in Authorization header (Vercel Cron sets it automatically
    // to `Bearer $CRON_SECRET` when the env var is defined).
    if (path === 'cron/weekly-digest') {
      const authz = request.headers.get('authorization') || ''
      const cronSecret = process.env.CRON_SECRET
      if (cronSecret && authz !== `Bearer ${cronSecret}`) {
        return json({ error: 'unauthorized' }, 401)
      }
      // List all approved kitchens with weekly digest enabled
      const { data: kitchens, error } = await sb
        .from('kitchens')
        .select('*')
        .eq('status', 'approved')
        .neq('weekly_digest_enabled', false)   // treat null as enabled
      if (error) throw error

      const results = []
      for (const k of (kitchens || [])) {
        try {
          const digest = await computeWeeklyDigest(sb, k)
          const html = buildDigestHtml(digest)
          const to = k.owner_email
          if (!to) { results.push({ id: k.id, ok: false, reason: 'no owner_email' }); continue }
          const subject = `📊 ShelfWise: your ${digest.kitchen.name} weekly digest`
          const send = await resendSend({ to, subject, html })
          if (send.ok) {
            await sb.from('kitchens').update({ last_digest_sent_at: new Date().toISOString() }).eq('id', k.id)
          }
          results.push({ id: k.id, name: k.kitchen_name, to, ok: send.ok, error: send.error || null })
          // Gentle pacing — Resend allows ~2 req/sec on free tier
          await new Promise(r => setTimeout(r, 550))
        } catch (e) {
          results.push({ id: k.id, ok: false, error: e.message })
        }
      }
      return json({ ok: true, count: results.length, results })
    }

    if (path === 'keepalive') {
      // Bumps the keepalive row so Supabase counts this as activity.
      const { error } = await sb.from('keepalive').upsert({ id: 1, last_ping_at: new Date().toISOString() })
      if (error) throw error
      return json({ ok: true, at: new Date().toISOString() })
    }

    if (path === 'auth/me') {
      // Frontend uses this to check "am I logged in?" and get role + kitchen.
      const ctx = await getAuthContext(request)
      if (!ctx.authed) return json({ authed: false }, 401)
      return json({
        authed: true,
        role: ctx.role,
        isAdmin: !!ctx.isAdmin,
        userEmail: ctx.userEmail,
        kitchen: kitchenToApi(ctx.kitchen),
      })
    }

    // ----- ADMIN endpoints -----
    if (path === 'admin/kitchens') {
      const { ctx, error } = await requireAdmin(request)
      if (error) return error
      const url = new URL(request.url)
      const status = url.searchParams.get('status') // pending | approved | rejected | ''
      let q = sb.from('kitchens').select('*').order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      const { data, error: e2 } = await q
      if (e2) throw e2
      return json({ kitchens: (data || []).map(kitchenToApi) })
    }

    // Diagnostic — returns which env vars are set (booleans only, no secret values leaked).
    if (path === 'admin/env-check') {
      const { ctx, error } = await requireAdmin(request)
      if (error) return error
      return json({
        RESEND_API_KEY: !!process.env.RESEND_API_KEY,
        RESEND_API_KEY_length: (process.env.RESEND_API_KEY || '').length,
        SHELFWISE_ADMIN_EMAIL: process.env.SHELFWISE_ADMIN_EMAIL || '(not set)',
        NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || '(not set)',
        EMERGENT_LLM_KEY: !!process.env.EMERGENT_LLM_KEY,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      })
    }

    // ----- OWNER / CHEF endpoints (kitchen-scoped) -----
    const ownerOrChef = ['products','settings','facets','stats','recipes','rota','waste','haccp'].some(p => path === p || path.startsWith(p + '/'))
    if (ownerOrChef) {
      const { ctx, error } = await requireOwnerOrChef(request)
      if (error) return error
      const kid = ctx.kitchenId

      if (path === 'products') {
        const url = new URL(request.url)
        const status = url.searchParams.get('status')
        const search = url.searchParams.get('search')
        const sort = url.searchParams.get('sort')
        const category = url.searchParams.get('category')
        const storage = url.searchParams.get('storage')

        let q = sb.from('products').select('*').eq('kitchen_id', kid).limit(5000)
        if (category && category !== 'All') q = q.eq('category', category)
        if (storage && storage !== 'All') q = q.eq('storage_type', storage)
        if (search) q = q.ilike('name', `%${escapeLike(search)}%`)
        const { data, error } = await q
        if (error) throw error
        let docs = (data || []).map(fromDb).map(enrich)
        if (status && status !== 'All') docs = docs.filter(d => d._status === status)
        if (sort === 'asc' || sort === 'desc') {
          docs.sort((a, b) => {
            const av = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity
            const bv = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity
            return sort === 'asc' ? av - bv : bv - av
          })
        }
        return json(docs)
      }

      if (path === 'settings') {
        // Settings = the kitchen row itself.
        // Re-fetch so we return the freshest values (in case owner just updated).
        const { data: k } = await sb.from('kitchens').select('*').eq('id', kid).single()
        return json(kitchenToApi(k))
      }

      if (path === 'facets') {
        const { data, error } = await sb.from('products').select('category, storage_type').eq('kitchen_id', kid).limit(5000)
        if (error) throw error
        const categories = Array.from(new Set((data || []).map(d => d.category).filter(Boolean))).sort()
        const storages = Array.from(new Set((data || []).map(d => d.storage_type).filter(Boolean))).sort()
        return json({ categories, storages })
      }

      if (path === 'stats') {
        const today = new Date()
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        const in7 = new Date(start.getTime() + 7 * 86400000)
        const todayISO = start.toISOString().slice(0, 10)
        const in7ISO = in7.toISOString().slice(0, 10)
        const [{ count: total }, { count: expired }, { count: expiring }, { count: critical }, { count: inDate }, valueRes] = await Promise.all([
          sb.from('products').select('*', { count: 'exact', head: true }).eq('kitchen_id', kid),
          sb.from('products').select('*', { count: 'exact', head: true }).eq('kitchen_id', kid).not('expiry_date', 'is', null).lt('expiry_date', todayISO),
          sb.from('products').select('*', { count: 'exact', head: true }).eq('kitchen_id', kid).not('expiry_date', 'is', null).gte('expiry_date', todayISO).lte('expiry_date', in7ISO),
          sb.from('products').select('*', { count: 'exact', head: true }).eq('kitchen_id', kid).lte('quantity', 2).or(`expiry_date.is.null,expiry_date.gt.${in7ISO}`),
          sb.from('products').select('*', { count: 'exact', head: true }).eq('kitchen_id', kid).not('expiry_date', 'is', null).gt('expiry_date', in7ISO),
          sb.from('products').select('quantity,unit_cost,reorder_point').eq('kitchen_id', kid),
        ])
        // Compute inventory value + below-reorder count from a single fetched list
        let totalValue = 0
        let belowReorder = 0
        for (const p of (valueRes.data || [])) {
          const qty = Number(p.quantity) || 0
          const c = p.unit_cost != null ? Number(p.unit_cost) : 0
          if (c > 0 && qty > 0) totalValue += qty * c
          if (p.reorder_point != null && qty <= Number(p.reorder_point)) belowReorder++
        }
        return json({
          total: total || 0,
          expired: expired || 0,
          expiring: expiring || 0,
          critical: critical || 0,
          inDate: inDate || 0,
          totalValue,
          belowReorder,
        })
      }

      if (path === 'recipes') {
        const url = new URL(request.url)
        const search = url.searchParams.get('search')
        let q = sb.from('recipes').select('*').eq('kitchen_id', kid).order('created_at', { ascending: false }).limit(500)
        if (search) q = q.ilike('title', `%${escapeLike(search)}%`)
        const { data, error } = await q
        if (error) {
          // If recipes table lacks kitchen_id column yet, degrade gracefully to empty list.
          if (/column .* does not exist/i.test(error.message || '')) return json([])
          throw error
        }
        return json(data || [])
      }

      if (path.startsWith('recipes/')) {
        const id = path.split('/')[1]
        const { data, error } = await sb.from('recipes').select('*').eq('id', id).eq('kitchen_id', kid).maybeSingle()
        if (error && !/column .* does not exist/i.test(error.message || '')) throw error
        if (!data) return json({ error: 'Not found' }, 404)
        return json(data)
      }
      if (path === 'rota') {
        // List shifts. Filter by ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults: current week ±).
        const url = new URL(request.url)
        const from = url.searchParams.get('from')
        const to = url.searchParams.get('to')
        let q = sb.from('rota_shifts').select('*').eq('kitchen_id', kid).order('shift_date', { ascending: true }).limit(2000)
        if (from) q = q.gte('shift_date', from)
        if (to) q = q.lte('shift_date', to)
        const { data, error } = await q
        if (error) {
          if (/relation .* does not exist/i.test(error.message || '')) return json([])
          throw error
        }
        return json((data || []).map(rotaFromDb))
      }

      if (path === 'waste') {
        // List waste entries. Filter by ?from=YYYY-MM-DD&to=YYYY-MM-DD.
        const url = new URL(request.url)
        const from = url.searchParams.get('from')
        const to = url.searchParams.get('to')
        let q = sb.from('waste_log').select('*').eq('kitchen_id', kid).order('disposed_at', { ascending: false }).limit(2000)
        if (from) q = q.gte('disposed_at', from)
        if (to) q = q.lte('disposed_at', to + 'T23:59:59Z')
        const { data, error } = await q
        if (error) {
          if (/relation .* does not exist/i.test(error.message || '')) return json({ entries: [], summary: null })
          throw error
        }
        const entries = (data || []).map(wasteFromDb)
        // Aggregate summary
        const totals = { count: entries.length, quantity: 0, cost: 0, byReason: {}, byCategory: {}, byWeek: {} }
        for (const e of entries) {
          totals.quantity += Number(e.quantity) || 0
          const cost = (Number(e.unitCost) || 0) * (Number(e.quantity) || 0)
          totals.cost += cost
          totals.byReason[e.reason] = (totals.byReason[e.reason] || 0) + 1
          const catKey = e.category || '(uncategorised)'
          totals.byCategory[catKey] = (totals.byCategory[catKey] || 0) + 1
          const wk = weekKey(e.disposedAt)
          totals.byWeek[wk] = (totals.byWeek[wk] || 0) + 1
        }
        return json({ entries, summary: totals })
      }

      // ---- HACCP: list temperature logs ----
      if (path === 'haccp/temperatures') {
        const url = new URL(request.url)
        const from = url.searchParams.get('from')
        const to = url.searchParams.get('to')
        let q = sb.from('haccp_temperature_logs').select('*').eq('kitchen_id', kid).order('recorded_at', { ascending: false }).limit(2000)
        if (from) q = q.gte('recorded_at', from)
        if (to) q = q.lte('recorded_at', to + 'T23:59:59Z')
        const { data, error } = await q
        if (error) {
          if (/relation .* does not exist/i.test(error.message || '')) return json([])
          throw error
        }
        return json((data || []).map(haccpTempFromDb))
      }

      // ---- HACCP: list cleaning task templates ----
      if (path === 'haccp/cleaning-tasks') {
        const { data, error } = await sb.from('haccp_cleaning_tasks')
          .select('*').eq('kitchen_id', kid).eq('active', true).order('created_at', { ascending: true }).limit(500)
        if (error) {
          if (/relation .* does not exist/i.test(error.message || '')) return json([])
          throw error
        }
        return json((data || []).map(haccpTaskFromDb))
      }

      // ---- HACCP: list cleaning completions ----
      if (path === 'haccp/cleaning-log') {
        const url = new URL(request.url)
        const from = url.searchParams.get('from')
        const to = url.searchParams.get('to')
        let q = sb.from('haccp_cleaning_log').select('*').eq('kitchen_id', kid).order('completed_at', { ascending: false }).limit(2000)
        if (from) q = q.gte('completed_at', from)
        if (to) q = q.lte('completed_at', to + 'T23:59:59Z')
        const { data, error } = await q
        if (error) {
          if (/relation .* does not exist/i.test(error.message || '')) return json([])
          throw error
        }
        return json((data || []).map(haccpCleaningLogFromDb))
      }

      // ---- HACCP: list delivery inspection records ----
      if (path === 'haccp/deliveries') {
        const url = new URL(request.url)
        const from = url.searchParams.get('from')
        const to = url.searchParams.get('to')
        let q = sb.from('haccp_delivery_checks').select('*').eq('kitchen_id', kid).order('delivery_date', { ascending: false }).limit(2000)
        if (from) q = q.gte('delivery_date', from)
        if (to) q = q.lte('delivery_date', to + 'T23:59:59Z')
        const { data, error } = await q
        if (error) {
          if (/relation .* does not exist/i.test(error.message || '')) return json([])
          throw error
        }
        return json((data || []).map(haccpDeliveryFromDb))
      }

      // ---- HACCP: consolidated export (last N days, default 30) ----
      if (path === 'haccp/export') {
        const url = new URL(request.url)
        const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days') || 30)))
        const cutoff = new Date(Date.now() - days * 86400000).toISOString()
        const [temps, tasks, cleanings, deliveries] = await Promise.all([
          sb.from('haccp_temperature_logs').select('*').eq('kitchen_id', kid).gte('recorded_at', cutoff).order('recorded_at', { ascending: false }),
          sb.from('haccp_cleaning_tasks').select('*').eq('kitchen_id', kid).eq('active', true),
          sb.from('haccp_cleaning_log').select('*').eq('kitchen_id', kid).gte('completed_at', cutoff).order('completed_at', { ascending: false }),
          sb.from('haccp_delivery_checks').select('*').eq('kitchen_id', kid).gte('delivery_date', cutoff).order('delivery_date', { ascending: false }),
        ])
        const missing = (r) => r.error && /relation .* does not exist/i.test(r.error.message || '')
        return json({
          days,
          generatedAt: new Date().toISOString(),
          temperatures: missing(temps) ? [] : (temps.data || []).map(haccpTempFromDb),
          cleaningTasks: missing(tasks) ? [] : (tasks.data || []).map(haccpTaskFromDb),
          cleaningLog: missing(cleanings) ? [] : (cleanings.data || []).map(haccpCleaningLogFromDb),
          deliveries: missing(deliveries) ? [] : (deliveries.data || []).map(haccpDeliveryFromDb),
        })
      }
    }

    // Chef code viewing (owner only)
    if (path === 'owner/chef-code') {
      const { ctx, error } = await requireAuth(request)
      if (error) return error
      if (ctx.role !== 'owner' && ctx.role !== 'admin') return json({ error: 'Owner only' }, 403)
      if (!ctx.kitchen) return json({ error: 'No kitchen' }, 404)
      const code = generateChefCode(ctx.kitchen.code_seed, ctx.kitchen.timezone)
      return json({ code, kitchenName: ctx.kitchen.kitchen_name, timezone: ctx.kitchen.timezone })
    }

    return json({ error: 'Not found' }, 404)
  } catch (e) {
    console.error('GET error', e)
    return json({ error: e.message }, 500)
  }
}

// ============================================================================
// POST
// ============================================================================
export async function POST(request, { params }) {
  try {
    const path = (params?.path || []).join('/')
    const sb = supabaseAdmin

    // -------- PUBLIC AUTH --------
    if (path === 'auth/signup') {
      // Body: { email, password, kitchenName?, kitchenType?, timezone? }
      // Kitchen name/type/timezone are now OPTIONAL — the owner sets these
      // via the setup wizard AFTER admin approval.
      const body = await request.json()
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      const kitchenName = String(body.kitchenName || '').trim()
      const kitchenType = String(body.kitchenType || '').trim()
      const timezone = String(body.timezone || 'UTC').trim()
      if (!email || !password) {
        return json({ error: 'email and password are required' }, 400)
      }
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)

      // 1) Create Supabase auth user (email confirmed = true so they can log in immediately;
      //    the manual approval step is what actually gates access to the app).
      const { data: created, error: authErr } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: kitchenName ? { kitchen_name: kitchenName } : {},
      })
      if (authErr) return json({ error: authErr.message || 'Sign-up failed' }, 400)

      // 2) Create the kitchen row (status = pending).
      const kitchenId = uuidv4()
      const { error: kErr } = await sb.from('kitchens').insert({
        id: kitchenId,
        owner_id: created.user.id,
        owner_email: email,
        kitchen_name: kitchenName,       // may be empty — owner fills in wizard
        kitchen_type: kitchenType,
        timezone,
        status: 'pending',
        code_seed: newCodeSeed(),
        dashboard_widgets: [],
        modules_enabled: [],
        categories: [],
        locations: [],
        units: [],
        onboarded: false,
      })
      if (kErr) {
        // Roll back auth user if kitchen creation fails — prevents orphaned accounts.
        try { await sb.auth.admin.deleteUser(created.user.id) } catch (e) { console.warn('Failed to rollback auth user:', e) }
        return json({ error: kErr.message }, 500)
      }

      // 3) Notify admin by email (best-effort — don't fail signup if email fails).
      const adminEmail = process.env.SHELFWISE_ADMIN_EMAIL
      const resendKey = process.env.RESEND_API_KEY
      if (adminEmail && resendKey) {
        try {
          const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f9fafb;padding:24px;color:#111">
            <div style="max-width:560px;margin:auto;background:white;border-radius:16px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.05)">
              <h1 style="font-size:22px;margin:0 0 8px;color:#064e3b">🔔 New kitchen sign-up</h1>
              <p style="color:#6b7280;font-size:13px;margin:0 0 20px">Someone requested access to ShelfWise.</p>
              <table style="width:100%;font-size:14px;line-height:1.6">
                <tr><td style="color:#6b7280;padding:4px 0">Email:</td><td><b>${email}</b></td></tr>
                ${kitchenName ? `<tr><td style="color:#6b7280;padding:4px 0">Kitchen:</td><td><b>${kitchenName}</b></td></tr>` : ''}
                ${kitchenType ? `<tr><td style="color:#6b7280;padding:4px 0">Type:</td><td>${kitchenType}</td></tr>` : ''}
                <tr><td style="color:#6b7280;padding:4px 0">Requested at:</td><td>${new Date().toLocaleString()}</td></tr>
              </table>
              <div style="margin-top:24px">
                <a href="https://shelfwise-beige.vercel.app/admin" style="display:inline-block;background:#10b981;color:white;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Open admin panel to approve →</a>
              </div>
            </div></body></html>`
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: process.env.MAIL_FROM || 'ShelfWise <onboarding@resend.dev>',
              to: [adminEmail],
              subject: `ShelfWise — new sign-up: ${email}`,
              html,
            }),
          })
          if (!r.ok) {
            const txt = await r.text().catch(() => '')
            console.warn('Admin signup email non-2xx:', r.status, txt)
          } else {
            console.log('Admin signup email sent to', adminEmail)
          }
        } catch (e) {
          console.warn('Admin notify email failed:', e.message)
        }
      } else {
        console.warn('Admin notify skipped — SHELFWISE_ADMIN_EMAIL or RESEND_API_KEY missing')
      }

      return json({ ok: true, status: 'pending', message: 'Account created. Awaiting admin approval.' }, 201)
    }

    if (path === 'auth/chef-login') {
      // Body: { kitchenName, code }
      const body = await request.json()
      const name = String(body.kitchenName || '').trim()
      const code = String(body.code || '').trim().toUpperCase()
      if (!name || !code) return json({ error: 'kitchenName and code required' }, 400)

      const { data: kitchens } = await sb.from('kitchens').select('*').ilike('kitchen_name', name).eq('status', 'approved').limit(5)
      if (!kitchens || kitchens.length === 0) return json({ error: 'Kitchen not found or not approved' }, 404)

      // Try today's code + also yesterday's (grace period for kitchens open across midnight)
      const now = new Date()
      const yesterday = new Date(now.getTime() - 86400000)
      for (const k of kitchens) {
        const today = generateChefCode(k.code_seed, k.timezone, now).toUpperCase()
        const yest = generateChefCode(k.code_seed, k.timezone, yesterday).toUpperCase()
        if (code === today || code === yest) {
          const token = signChefToken(k.id)
          return json({ ok: true, token, kitchen: kitchenToApi(k) })
        }
      }
      return json({ error: 'Invalid code' }, 401)
    }

    // -------- ADMIN endpoints --------
    if (path === 'admin/approve') {
      const { ctx, error } = await requireAdmin(request)
      if (error) return error
      const body = await request.json()
      const id = String(body.kitchenId || '')
      if (!id) return json({ error: 'kitchenId required' }, 400)
      const { data, error: e2 } = await sb.from('kitchens')
        .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: ctx.userEmail })
        .eq('id', id).select().single()
      if (e2) throw e2
      await sb.from('admin_approvals').insert({ kitchen_id: id, action: 'approved', admin_email: ctx.userEmail })

      // Notify the OWNER that their kitchen was approved (best-effort — don't fail approve on email issues).
      const resendKey = process.env.RESEND_API_KEY
      if (resendKey && data?.owner_email) {
        try {
          const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f9fafb;padding:24px;color:#111">
            <div style="max-width:560px;margin:auto;background:white;border-radius:16px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.05)">
              <div style="font-size:28px;margin-bottom:8px">🎉</div>
              <h1 style="font-size:22px;margin:0 0 8px;color:#064e3b">Your kitchen is approved!</h1>
              <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 20px">
                Great news — <b>${data.kitchen_name || 'your kitchen'}</b> has been approved by the ShelfWise admin.
                You can now log in and start setting things up.
              </p>
              <div style="margin-top:24px">
                <a href="https://shelfwise-beige.vercel.app/login" style="display:inline-block;background:#10b981;color:white;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Log in to ShelfWise →</a>
              </div>
              <p style="color:#9ca3af;font-size:11px;margin-top:24px">You'll be walked through a quick setup wizard on first login (pick your modules, widgets, etc.).</p>
            </div></body></html>`
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: process.env.MAIL_FROM || 'ShelfWise <onboarding@resend.dev>',
              to: [data.owner_email],
              subject: `✅ Your kitchen "${data.kitchen_name || 'ShelfWise'}" is approved`,
              html,
            }),
          })
          if (!r.ok) {
            const txt = await r.text().catch(() => '')
            console.warn('Owner approval email non-2xx:', r.status, txt)
          }
        } catch (e) {
          console.warn('Owner approval email failed:', e.message)
        }
      }

      return json({ ok: true, kitchen: kitchenToApi(data) })
    }
    if (path === 'admin/reject' || path === 'admin/suspend') {
      const { ctx, error } = await requireAdmin(request)
      if (error) return error
      const body = await request.json()
      const id = String(body.kitchenId || '')
      const reason = String(body.reason || '')
      const newStatus = path === 'admin/reject' ? 'rejected' : 'suspended'
      const { data, error: e2 } = await sb.from('kitchens').update({ status: newStatus }).eq('id', id).select().single()
      if (e2) throw e2
      await sb.from('admin_approvals').insert({ kitchen_id: id, action: newStatus, reason, admin_email: ctx.userEmail })
      return json({ ok: true, kitchen: kitchenToApi(data) })
    }

    // Diagnostic endpoint — admin can POST a test email to any recipient
    // to verify Resend + env config are actually working end-to-end.
    if (path === 'admin/test-email') {
      const { ctx, error } = await requireAdmin(request)
      if (error) return error
      const body = await request.json().catch(() => ({}))
      const to = String(body.to || ctx.userEmail || process.env.SHELFWISE_ADMIN_EMAIL || '').trim()
      const resendKey = process.env.RESEND_API_KEY
      if (!resendKey) return json({ ok: false, error: 'RESEND_API_KEY not set on server (Vercel → Settings → Env Variables)' }, 500)
      if (!to) return json({ ok: false, error: 'No recipient email — set SHELFWISE_ADMIN_EMAIL or pass `to`' }, 400)
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: process.env.MAIL_FROM || 'ShelfWise <onboarding@resend.dev>',
            to: [to],
            subject: '✅ ShelfWise test email',
            html: `<p>This is a test email from ShelfWise. If you see this, Resend + your env vars are configured correctly.</p><p>Sent at ${new Date().toISOString()}</p>`,
          }),
        })
        const txt = await r.text().catch(() => '')
        let parsed = null
        try { parsed = JSON.parse(txt) } catch { /* text response */ }
        if (!r.ok) {
          const errMsg = parsed?.message || parsed?.name || txt || `Resend returned ${r.status}`
          return json({
            ok: false,
            error: `Resend ${r.status}: ${errMsg}`.slice(0, 500),
            hint: r.status === 403 || errMsg.toLowerCase().includes('domain')
              ? 'Resend sandbox: onboarding@resend.dev can only send to the email that owns your Resend account. Verify a domain at https://resend.com/domains OR use the Resend account owner email.'
              : r.status === 401
              ? 'Invalid API key — regenerate at https://resend.com/api-keys and update RESEND_API_KEY in Vercel.'
              : undefined,
            resendResponse: txt.slice(0, 500),
            adminEmailConfigured: !!process.env.SHELFWISE_ADMIN_EMAIL,
            sentTo: to,
          }, 500)
        }
        return json({ ok: true, sentTo: to, resendResponse: txt.slice(0, 200) })
      } catch (e) {
        return json({ ok: false, error: e.message }, 500)
      }
    }

    // Diagnostic — returns which env vars are set (booleans only, no values leaked).
    // Handler for this lives in GET (see admin/env-check above). Kept here as a safety net
    // in case someone accidentally POSTs it.
    if (path === 'admin/env-check') {
      const { ctx, error } = await requireAdmin(request)
      if (error) return error
      return json({
        RESEND_API_KEY: !!process.env.RESEND_API_KEY,
        RESEND_API_KEY_length: (process.env.RESEND_API_KEY || '').length,
        SHELFWISE_ADMIN_EMAIL: process.env.SHELFWISE_ADMIN_EMAIL || '(not set)',
        NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || '(not set)',
        EMERGENT_LLM_KEY: !!process.env.EMERGENT_LLM_KEY,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      })
    }

    // -------- OWNER endpoints --------
    if (path === 'owner/rotate-code') {
      const { ctx, error } = await requireAuth(request)
      if (error) return error
      if (ctx.role !== 'owner') return json({ error: 'Owner only' }, 403)
      const { data, error: e2 } = await sb.from('kitchens').update({ code_seed: newCodeSeed() }).eq('id', ctx.kitchenId).select().single()
      if (e2) throw e2
      const code = generateChefCode(data.code_seed, data.timezone)
      return json({ ok: true, code })
    }

    // -------- AI passthrough (still requires auth, but not kitchen scoping)
    if (path === 'scan' || path === 'scan-receipt' || path === 'parse-voice' || path === 'recipe-instructions' || path === 'identify-product') {
      const { ctx, error } = await requireAuth(request)
      if (error) return error
      const body = await request.json()

      if (path === 'scan') {
        if (!body.image || !body.image.startsWith('data:image/')) return json({ error: 'Invalid or missing image' }, 400)
        const items = await scanImageForItems(body.image)
        return json({ items })
      }
      if (path === 'scan-receipt') {
        if (!body.image || !body.image.startsWith('data:image/')) return json({ error: 'Invalid or missing image' }, 400)
        const parsed = await parseReceiptImage(body.image)
        return json(parsed)
      }
      if (path === 'identify-product') {
        // Photo-based product identification (barcode scanner AI fallback).
        if (!body.image || !body.image.startsWith('data:image/')) return json({ error: 'Invalid or missing image' }, 400)
        const barcode = String(body.barcode || '').trim().slice(0, 40)
        const parsed = await identifyProductFromPhoto(body.image, barcode)
        return json(parsed)
      }
      if (path === 'parse-voice') {
        const text = String(body.text || '').trim()
        if (!text) return json({ error: 'text required' }, 400)
        if (text.length > 800) return json({ error: 'text too long' }, 400)
        const items = await parseTextForItems(text)
        return json({ items })
      }
      if (path === 'recipe-instructions') {
        const title = String(body.title || '').trim()
        const ingredients = Array.isArray(body.ingredients) ? body.ingredients.filter(Boolean) : []
        const servings = String(body.servings || '').trim()
        if (!ingredients.length && !title) return json({ error: 'title or ingredients required' }, 400)

        const key = process.env.EMERGENT_LLM_KEY
        if (!key) return json({ error: 'EMERGENT_LLM_KEY not set' }, 500)

        const systemPrompt = `You are a professional chef. Generate clear, step-by-step COOKING INSTRUCTIONS for the recipe below and return them as JSON.
Return ONLY a JSON object of shape: {"instructions":[...],"source":"..."}. 6-12 steps, each 12-30 words, mention temps & times.
Output strictly valid JSON with no other text.`
        const userPrompt = `Recipe title: ${title || '(unknown)'}\nServings: ${servings || 'unspecified'}\nIngredients:\n${ingredients.map(i => '- ' + i).join('\n')}`

        const apiRes = await fetch(EMERGENT_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.4,
            response_format: { type: 'json_object' },
          }),
        })
        if (!apiRes.ok) {
          const t = await apiRes.text()
          return json({ error: `LLM ${apiRes.status}: ${t.slice(0,200)}` }, 502)
        }
        const data = await apiRes.json()
        const content = data?.choices?.[0]?.message?.content || '{}'
        let parsed
        try { parsed = JSON.parse(content) }
        catch { const m = content.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {} }
        const instructions = Array.isArray(parsed.instructions)
          ? parsed.instructions.map(s => String(s).trim()).filter(Boolean)
          : []
        const source = String(parsed.source || 'AI Generated')
        if (!instructions.length) return json({ error: 'Could not generate instructions' }, 502)
        return json({ instructions, source })
      }
    }

    // -------- Kitchen-scoped mutations --------
    const kitchenScoped = ['products','products/bulk','recipe','recipes','email/test','email/check-expiring','digest/send-test','rota','waste','haccp/temperatures','haccp/cleaning-tasks','haccp/cleaning-log','haccp/deliveries'].some(p => path === p)
    if (kitchenScoped) {
      const { ctx, error } = await requireOwnerOrChef(request)
      if (error) return error
      const kid = ctx.kitchenId

      // ------- Rota shifts (create OR upsert) -------
      if (path === 'rota') {
        const body = await request.json()
        const row = {
          kitchen_id: kid,
          shift_date: String(body.shiftDate || '').slice(0, 10),
          shift_slot: String(body.shiftSlot || '').trim(),
          chef_name: String(body.chefName || '').trim(),
          role: String(body.role || '').trim(),
          start_time: String(body.startTime || '').trim(),
          end_time: String(body.endTime || '').trim(),
          notes: String(body.notes || '').trim(),
          updated_at: new Date().toISOString(),
        }
        if (!row.shift_date || !row.shift_slot) return json({ error: 'shiftDate and shiftSlot required' }, 400)
        // Upsert semantics: if id supplied, update; else insert new.
        if (body.id) {
          const { data, error: e2 } = await sb.from('rota_shifts')
            .update(row).eq('id', body.id).eq('kitchen_id', kid).select().single()
          if (e2) throw e2
          return json(rotaFromDb(data))
        }
        const { data, error: e2 } = await sb.from('rota_shifts').insert({ id: uuidv4(), ...row }).select().single()
        if (e2) throw e2
        return json(rotaFromDb(data), 201)
      }

      // ------- Waste log (record disposal of a product) -------
      if (path === 'waste') {
        const body = await request.json()
        const row = {
          id: uuidv4(),
          kitchen_id: kid,
          product_id: body.productId || null,
          product_name: String(body.productName || '').trim(),
          category: String(body.category || '').trim(),
          quantity: Number(body.quantity) || 0,
          unit: String(body.unit || 'ea'),
          unit_cost: body.unitCost != null && body.unitCost !== '' ? Number(body.unitCost) : null,
          reason: String(body.reason || 'expired'),
          disposed_at: new Date().toISOString(),
          disposed_by: ctx.userEmail || (ctx.role === 'chef' ? 'chef' : ''),
          notes: String(body.notes || '').trim(),
        }
        if (!row.product_name) return json({ error: 'productName required' }, 400)
        const { data, error: e2 } = await sb.from('waste_log').insert(row).select().single()
        if (e2) throw e2
        return json(wasteFromDb(data), 201)
      }

      // ------- HACCP: log a temperature reading -------
      if (path === 'haccp/temperatures') {
        const body = await request.json()
        const location = String(body.location || '').trim()
        if (!location) return json({ error: 'location required' }, 400)
        const temp = Number(body.temperatureC)
        if (!Number.isFinite(temp)) return json({ error: 'temperatureC must be a number' }, 400)
        const row = {
          id: uuidv4(),
          kitchen_id: kid,
          location,
          temperature_c: temp,
          is_pass: body.isPass !== false,
          recorded_at: body.recordedAt || new Date().toISOString(),
          recorded_by: String(body.recordedBy || ctx.userEmail || '').trim(),
          notes: String(body.notes || '').trim(),
        }
        const { data, error: e2 } = await sb.from('haccp_temperature_logs').insert(row).select().single()
        if (e2) throw e2
        return json(haccpTempFromDb(data), 201)
      }

      // ------- HACCP: create/update cleaning task template -------
      if (path === 'haccp/cleaning-tasks') {
        const body = await request.json()
        const taskName = String(body.taskName || '').trim()
        if (!taskName) return json({ error: 'taskName required' }, 400)
        const row = {
          kitchen_id: kid,
          task_name: taskName,
          area: String(body.area || '').trim(),
          frequency: ['daily','weekly','monthly'].includes(body.frequency) ? body.frequency : 'daily',
          active: body.active !== false,
        }
        if (body.id) {
          const { data, error: e2 } = await sb.from('haccp_cleaning_tasks')
            .update(row).eq('id', body.id).eq('kitchen_id', kid).select().single()
          if (e2) throw e2
          return json(haccpTaskFromDb(data))
        }
        const { data, error: e2 } = await sb.from('haccp_cleaning_tasks').insert({ id: uuidv4(), ...row }).select().single()
        if (e2) throw e2
        return json(haccpTaskFromDb(data), 201)
      }

      // ------- HACCP: mark a cleaning task complete -------
      if (path === 'haccp/cleaning-log') {
        const body = await request.json()
        const taskName = String(body.taskName || '').trim()
        if (!taskName) return json({ error: 'taskName required' }, 400)
        const row = {
          id: uuidv4(),
          kitchen_id: kid,
          task_id: body.taskId || null,
          task_name: taskName,
          completed_at: body.completedAt || new Date().toISOString(),
          completed_by: String(body.completedBy || ctx.userEmail || '').trim(),
          notes: String(body.notes || '').trim(),
        }
        const { data, error: e2 } = await sb.from('haccp_cleaning_log').insert(row).select().single()
        if (e2) throw e2
        return json(haccpCleaningLogFromDb(data), 201)
      }

      // ------- HACCP: record a delivery quality check -------
      if (path === 'haccp/deliveries') {
        const body = await request.json()
        const row = {
          id: uuidv4(),
          kitchen_id: kid,
          supplier: String(body.supplier || '').trim(),
          delivery_date: body.deliveryDate || new Date().toISOString(),
          temperature_c: body.temperatureC != null && body.temperatureC !== '' ? Number(body.temperatureC) : null,
          temperature_ok: body.temperatureOk !== false,
          packaging_ok: body.packagingOk !== false,
          labels_ok: body.labelsOk !== false,
          overall_pass: body.overallPass !== false,
          checked_by: String(body.checkedBy || ctx.userEmail || '').trim(),
          notes: String(body.notes || '').trim(),
        }
        const { data, error: e2 } = await sb.from('haccp_delivery_checks').insert(row).select().single()
        if (e2) throw e2
        return json(haccpDeliveryFromDb(data), 201)
      }

      if (path === 'products') {
        const body = await request.json()
        let doc = { id: uuidv4(), kitchen_id: kid, ...toDb(body) }
        let { data, error } = await sb.from('products').insert(doc).select().single()
        if (error && /column .* does not exist|schema cache/i.test(error.message || '')) {
          const {
            custom_fields, updated_at,
            unit_cost, reorder_point, allergens, supplier, source, source_meta,
            ...core
          } = doc
          const retry = await sb.from('products').insert(core).select().single()
          data = retry.data
          error = retry.error
        }
        if (error) {
          console.error('products insert failed:', error)
          const hint = /column .* does not exist|schema cache/i.test(error.message || '')
            ? ' — please run supabase/migration-8-cost-allergens.sql in Supabase SQL Editor.'
            : ''
          return json({ error: (error.message || 'Insert failed') + hint }, 500)
        }
        return json(enrich(fromDb(data)), 201)
      }

      if (path === 'products/bulk') {
        const body = await request.json()
        const itemsIn = Array.isArray(body.items) ? body.items : []
        const docs = itemsIn.filter(i => i.name).map(b => ({ id: uuidv4(), kitchen_id: kid, ...toDb(b) }))
        if (!docs.length) return json({ inserted: 0, items: [] }, 201)
        let { data, error } = await sb.from('products').insert(docs).select()
        // Retry gracefully if any newer column (from a not-yet-run migration) is missing.
        if (error && /column .* does not exist|schema cache/i.test(error.message || '')) {
          const coreDocs = docs.map((d) => {
            const {
              custom_fields, updated_at,
              unit_cost, reorder_point, allergens, supplier, source, source_meta,
              ...core
            } = d
            return core
          })
          const retry = await sb.from('products').insert(coreDocs).select()
          data = retry.data
          error = retry.error
        }
        if (error) {
          const hint = /column .* does not exist|schema cache/i.test(error.message || '')
            ? ' — please run supabase/migration-8-cost-allergens.sql in Supabase SQL Editor.'
            : ''
          return json({ error: (error.message || 'Insert failed') + hint }, 500)
        }
        return json({ inserted: data.length, items: data.map(fromDb).map(enrich) }, 201)
      }

      if (path === 'recipe') {
        const body = await request.json()
        const image = body.image, text = body.text
        if (!image && !text) return json({ error: 'image or text required' }, 400)
        if (image && !image.startsWith('data:image/')) return json({ error: 'invalid image data URL' }, 400)
        const recipe = await scanRecipe({ image, text })
        const { data: rows, error } = await sb.from('products').select('*').eq('kitchen_id', kid).limit(5000)
        if (error) throw error
        const products = (rows || []).map(fromDb).map(enrich)
        const matched = recipe.ingredients.map(ing => {
          const product = matchIngredientToInventory(ing.name, products)
          let status = 'missing'
          if (product) {
            if (product._status === 'Expired') status = 'expired'
            else if (product._status === 'Critical') status = 'low'
            else status = 'in_stock'
          }
          return { ...ing, status, product: product ? { id: product.id, name: product.name, quantity: product.quantity, unit: product.unit, expiryDate: product.expiryDate, _status: product._status } : null }
        })
        const summary = {
          inStock: matched.filter(m => m.status === 'in_stock').length,
          low: matched.filter(m => m.status === 'low').length,
          expired: matched.filter(m => m.status === 'expired').length,
          missing: matched.filter(m => m.status === 'missing').length,
        }
        return json({ ...recipe, matched, summary })
      }

      if (path === 'recipes') {
        const body = await request.json()
        const row = {
          kitchen_id: kid,
          title: body.title || 'Untitled recipe',
          servings: body.servings || null,
          ingredients: Array.isArray(body.ingredients) ? body.ingredients : [],
          allergens: Array.isArray(body.allergens) ? body.allergens : [],
          steps: Array.isArray(body.steps) ? body.steps : [],
          matched: Array.isArray(body.matched) ? body.matched : [],
          summary: body.summary && typeof body.summary === 'object' ? body.summary : {},
        }
        let { data, error } = await sb.from('recipes').insert(row).select().single()
        if (error && /column .* does not exist/i.test(error.message || '')) {
          const { kitchen_id, ...core } = row
          const retry = await sb.from('recipes').insert(core).select().single()
          data = retry.data
          error = retry.error
        }
        if (error) throw error
        return json(data, 201)
      }

      if (path === 'email/test' || path === 'email/check-expiring') {
        const apiKey = process.env.RESEND_API_KEY
        if (!apiKey) return json({ error: 'RESEND_API_KEY not configured' }, 500)

        const body = await request.json().catch(() => ({}))
        const to = body.to || ctx.kitchen?.alert_email
        if (!to) return json({ error: 'No alert email configured. Set one in Settings.' }, 400)

        const today = new Date()
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        const in6 = new Date(start.getTime() + 6 * 86400000)
        const todayISO = start.toISOString().slice(0, 10)
        const in6ISO = in6.toISOString().slice(0, 10)

        const { data: expRows } = await sb.from('products').select('*').eq('kitchen_id', kid).not('expiry_date', 'is', null).lt('expiry_date', todayISO).limit(500)
        const { data: soonRows } = await sb.from('products').select('*').eq('kitchen_id', kid).not('expiry_date', 'is', null).gte('expiry_date', todayISO).lte('expiry_date', in6ISO).limit(500)
        const expired = (expRows || []).map(fromDb)
        const soon = (soonRows || []).map(fromDb)

        const isTest = path === 'email/test'
        const expRowsHtml = expired.map(p => `<tr><td style="padding:8px;border-bottom:1px solid #fee">${p.name}</td><td style="padding:8px;border-bottom:1px solid #fee">${p.quantity} ${p.unit}</td><td style="padding:8px;border-bottom:1px solid #fee;color:#b91c1c"><b>${p.expiryDate}</b></td></tr>`).join('')
        const soonRowsHtml = soon.map(p => `<tr><td style="padding:8px;border-bottom:1px solid #fef3c7">${p.name}</td><td style="padding:8px;border-bottom:1px solid #fef3c7">${p.quantity} ${p.unit}</td><td style="padding:8px;border-bottom:1px solid #fef3c7;color:#b45309"><b>${p.expiryDate}</b></td></tr>`).join('')
        const kName = ctx.kitchen?.kitchen_name || ''
        const kTag = ctx.kitchen?.tagline || 'From shelf to plate — never lose track.'

        const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f9fafb;padding:24px;color:#111">
          <div style="max-width:600px;margin:auto;background:white;border-radius:16px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.05)">
            <h1 style="font-size:22px;margin:0;color:#064e3b">ShelfWise${kName ? ' · ' + kName : ''}</h1>
            <p style="color:#6b7280;font-size:13px;margin:0 0 24px">${kTag}</p>
            ${isTest ? '<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:16px;margin-bottom:20px"><b>✅ Test email working!</b></div>' : ''}
            ${expired.length === 0 && soon.length === 0
              ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:20px;text-align:center"><b style="color:#065f46">🎉 No urgent items today.</b></div>`
              : `${expired.length > 0 ? `<h2 style="font-size:15px;color:#b91c1c;margin-top:24px">🔴 Expired (${expired.length})</h2><table style="width:100%;border-collapse:collapse">${expRowsHtml}</table>` : ''}
                ${soon.length > 0 ? `<h2 style="font-size:15px;color:#b45309;margin-top:24px">🟡 Expiring within 6 days (${soon.length})</h2><table style="width:100%;border-collapse:collapse">${soonRowsHtml}</table>` : ''}`}
          </div></body></html>`

        const subject = isTest ? `ShelfWise — Test alert` : `ShelfWise — ${expired.length} expired, ${soon.length} expiring soon`
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: process.env.MAIL_FROM || 'ShelfWise Alerts <onboarding@resend.dev>', to: [to], subject, html })
        })
        if (!res.ok) {
          const txt = await res.text()
          return json({ error: `Email send failed: ${txt.slice(0, 200)}` }, 500)
        }
        const result = await res.json()
        return json({ ok: true, sent: result.id, counts: { expired: expired.length, soon: soon.length } })
      }

      // ---- Weekly Digest: send-test — owner triggers a live preview to their own email ----
      if (path === 'digest/send-test') {
        if (!ctx.kitchen) return json({ error: 'No kitchen' }, 404)
        const to = ctx.kitchen.owner_email
        if (!to) return json({ error: 'No owner email on file' }, 400)
        const digest = await computeWeeklyDigest(sb, ctx.kitchen)
        const html = buildDigestHtml(digest)
        const subject = `📊 [TEST] ShelfWise: your ${digest.kitchen.name} weekly digest`
        const send = await resendSend({ to, subject, html })
        if (!send.ok) return json({ error: `Send failed: ${send.error}` }, 502)
        return json({ ok: true, sent: send.id, to, preview: { totalItems: digest.totalItems, expiring: digest.expiring.length, expired: digest.expired.length, wasteCount: digest.wasteCount, wasteCost: digest.wasteCost } })
      }
    }

    return json({ error: 'Not found' }, 404)
  } catch (e) {
    console.error('POST error', e)
    return json({ error: e.message }, 500)
  }
}

// ============================================================================
// PUT
// ============================================================================
export async function PUT(request, { params }) {
  try {
    const segs = params?.path || []
    const path = segs.join('/')
    const sb = supabaseAdmin

    if (segs[0] === 'settings') {
      const { ctx, error } = await requireOwnerOrChef(request)
      if (error) return error
      if (ctx.role === 'chef') return json({ error: 'Owners only' }, 403)
      const body = await request.json()
      const customFields = Array.isArray(body.customFields)
        ? body.customFields.map(f => ({
            key: String(f.key || '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
            label: String(f.label || '').trim(),
            type: ['text', 'number', 'date'].includes(f.type) ? f.type : 'text'
          })).filter(f => f.key && f.label)
        : undefined
      const patch = {}
      if (typeof body.kitchenName === 'string') patch.kitchen_name = body.kitchenName
      if (typeof body.kitchenType === 'string') patch.kitchen_type = body.kitchenType
      if (typeof body.timezone === 'string') patch.timezone = body.timezone
      if (typeof body.onboarded === 'boolean') patch.onboarded = body.onboarded
      if (typeof body.alertEmail === 'string') patch.alert_email = body.alertEmail
      if (typeof body.tagline === 'string') patch.tagline = body.tagline
      if (typeof body.currency === 'string') patch.currency = body.currency
      if (typeof body.weeklyDigestEnabled === 'boolean') patch.weekly_digest_enabled = body.weeklyDigestEnabled
      if (Array.isArray(body.dashboardWidgets)) patch.dashboard_widgets = body.dashboardWidgets
      if (Array.isArray(body.modulesEnabled)) patch.modules_enabled = body.modulesEnabled
      if (Array.isArray(body.categories)) patch.categories = body.categories
      if (Array.isArray(body.locations)) patch.locations = body.locations
      if (Array.isArray(body.units)) patch.units = body.units
      if (customFields !== undefined) patch.custom_fields = customFields

      const { data, error: e2 } = await sb.from('kitchens').update(patch).eq('id', ctx.kitchenId).select().single()
      if (e2) throw e2
      return json(kitchenToApi(data))
    }

    if (segs[0] === 'products' && segs[1]) {
      const { ctx, error } = await requireOwnerOrChef(request)
      if (error) return error
      const id = segs[1]
      const body = await request.json()
      const patch = toDb(body)
      let { data, error: e2 } = await sb.from('products').update(patch).eq('id', id).eq('kitchen_id', ctx.kitchenId).select().single()
      if (e2 && /column .* does not exist|schema cache/i.test(e2.message || '')) {
        // Migration 8 not run yet — retry without new columns
        const {
          unit_cost, reorder_point, allergens, supplier, source, source_meta,
          ...core
        } = patch
        const retry = await sb.from('products').update(core).eq('id', id).eq('kitchen_id', ctx.kitchenId).select().single()
        data = retry.data
        e2 = retry.error
      }
      if (e2) {
        const hint = /column .* does not exist|schema cache/i.test(e2.message || '')
          ? ' — please run supabase/migration-8-cost-allergens.sql in Supabase SQL Editor.'
          : ''
        return json({ error: (e2.message || 'Update failed') + hint }, 500)
      }
      return json(enrich(fromDb(data)))
    }
    return json({ error: 'Not found' }, 404)
  } catch (e) {
    console.error('PUT error', e)
    return json({ error: e.message }, 500)
  }
}

// ============================================================================
// DELETE
// ============================================================================
export async function DELETE(request, { params }) {
  try {
    const segs = params?.path || []
    const sb = supabaseAdmin
    const { ctx, error } = await requireOwnerOrChef(request)
    if (error) return error

    if (segs[0] === 'products' && segs[1]) {
      const { error } = await sb.from('products').delete().eq('id', segs[1]).eq('kitchen_id', ctx.kitchenId)
      if (error) throw error
      return json({ ok: true })
    }
    if (segs[0] === 'recipes' && segs[1]) {
      const { error } = await sb.from('recipes').delete().eq('id', segs[1]).eq('kitchen_id', ctx.kitchenId)
      if (error) throw error
      return json({ ok: true })
    }
    if (segs[0] === 'rota' && segs[1]) {
      const { error } = await sb.from('rota_shifts').delete().eq('id', segs[1]).eq('kitchen_id', ctx.kitchenId)
      if (error) throw error
      return json({ ok: true })
    }
    if (segs[0] === 'waste' && segs[1]) {
      const { error } = await sb.from('waste_log').delete().eq('id', segs[1]).eq('kitchen_id', ctx.kitchenId)
      if (error) throw error
      return json({ ok: true })
    }
    if (segs[0] === 'haccp' && segs[1] === 'temperatures' && segs[2]) {
      const { error } = await sb.from('haccp_temperature_logs').delete().eq('id', segs[2]).eq('kitchen_id', ctx.kitchenId)
      if (error) throw error
      return json({ ok: true })
    }
    if (segs[0] === 'haccp' && segs[1] === 'cleaning-tasks' && segs[2]) {
      // Soft-delete: mark inactive to keep historical log rows valid
      const { error } = await sb.from('haccp_cleaning_tasks').update({ active: false }).eq('id', segs[2]).eq('kitchen_id', ctx.kitchenId)
      if (error) throw error
      return json({ ok: true })
    }
    if (segs[0] === 'haccp' && segs[1] === 'cleaning-log' && segs[2]) {
      const { error } = await sb.from('haccp_cleaning_log').delete().eq('id', segs[2]).eq('kitchen_id', ctx.kitchenId)
      if (error) throw error
      return json({ ok: true })
    }
    if (segs[0] === 'haccp' && segs[1] === 'deliveries' && segs[2]) {
      const { error } = await sb.from('haccp_delivery_checks').delete().eq('id', segs[2]).eq('kitchen_id', ctx.kitchenId)
      if (error) throw error
      return json({ ok: true })
    }
    return json({ error: 'Not found' }, 404)
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
