// ============================================================================
// ShelfWise shared constants + pure helpers
// Used by page.js and all view components in /components/shelfwise/.
// ============================================================================

export const STATUS_META = {
  Expired: { label: 'Expired', color: 'bg-red-100 text-red-700 border-red-200' },
  Expiring: { label: 'Expiring Soon', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  Critical: { label: 'Critical Stock', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  Ok: { label: 'OK', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

export const EMPTY_FORM = {
  name: '', quantity: '', unit: 'ea', expiryDate: '', category: '',
  storageType: 'Fridge', location: '', preparedBy: '', imageUrl: '',
  dateReceived: '',
  unitCost: '', reorderPoint: '', supplier: '',
  allergens: [],
  note: '',
  customFields: {}
}

// UK/EU Natasha's Law 14 allergens — used for legal compliance labelling
export const ALLERGENS = [
  { id: 'gluten',       label: 'Gluten (wheat, rye, barley, oats)', emoji: '🌾' },
  { id: 'crustaceans',  label: 'Crustaceans (prawns, crab, lobster)', emoji: '🦐' },
  { id: 'eggs',         label: 'Eggs', emoji: '🥚' },
  { id: 'fish',         label: 'Fish', emoji: '🐟' },
  { id: 'peanuts',      label: 'Peanuts', emoji: '🥜' },
  { id: 'soybeans',     label: 'Soybeans', emoji: '🫘' },
  { id: 'milk',         label: 'Milk / Dairy', emoji: '🥛' },
  { id: 'nuts',         label: 'Tree Nuts', emoji: '🌰' },
  { id: 'celery',       label: 'Celery', emoji: '🥬' },
  { id: 'mustard',      label: 'Mustard', emoji: '🌶️' },
  { id: 'sesame',       label: 'Sesame', emoji: '🫓' },
  { id: 'sulphites',    label: 'Sulphites', emoji: '🍷' },
  { id: 'lupin',        label: 'Lupin', emoji: '🌼' },
  { id: 'molluscs',     label: 'Molluscs (oysters, mussels)', emoji: '🦪' },
]

export const CURRENCY_SYMBOL = {
  GBP: '£', USD: '$', EUR: '€', INR: '₹', AUD: 'A$', CAD: 'C$', SGD: 'S$', AED: 'د.إ',
}

// Estimate shelf life (days from today) based on category + storage type
export function guessShelfLifeDays(category = '', storageType = '') {
  const c = String(category || '').toLowerCase()
  const s = String(storageType || '').toLowerCase()
  if (s === 'freezer') return 60       // ~2 months for freezer items
  if (s === 'dry') return 90           // ~3 months for dry storage
  if (s === 'ambient') return 90       // ~3 months for ambient (similar to dry)
  // Fridge defaults (category-specific)
  if (c.includes('fish') || c.includes('seafood')) return 2
  if (c.includes('meat') || c.includes('chicken') || c.includes('poultry')) return 3
  if (c.includes('dairy') || c.includes('milk') || c.includes('yogurt') || c.includes('cheese')) return 7
  if (c.includes('veg') || c.includes('produce') || c.includes('fruit') || c.includes('herb')) return 5
  if (c.includes('egg')) return 21
  if (c.includes('sauce') || c.includes('condiment')) return 30
  return 7 // safe fridge default
}

// Helper: get an ISO date N days from today (YYYY-MM-DD)
export function dateInDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Smart expiry SUGGESTION using calendar-correct math (months for long, days for short).
// Returns YYYY-MM-DD string.
// baseDate (optional, YYYY-MM-DD): calculate FROM this date instead of today —
// e.g. Date Received 2026-05-03 + Freezer = 2026-07-03 (user request, July 2026).
export function suggestExpiryDate(category = '', storageType = '', baseDate = '') {
  const c = String(category || '').toLowerCase()
  const s = String(storageType || '').toLowerCase()
  const d = (baseDate && /^\d{4}-\d{2}-\d{2}/.test(String(baseDate)))
    ? new Date(String(baseDate).slice(0, 10) + 'T12:00:00')  // noon avoids timezone day-shift
    : new Date()
  if (isNaN(d.getTime())) return suggestExpiryDate(category, storageType) // bad date → from today
  // Long-term storage uses calendar MONTHS (so Jun 14 + 2 mo = Aug 14 exactly)
  if (s === 'freezer') {
    d.setMonth(d.getMonth() + 2)
    return d.toISOString().slice(0, 10)
  }
  if (s === 'dry' || s === 'ambient') {
    d.setMonth(d.getMonth() + 3)
    return d.toISOString().slice(0, 10)
  }
  // Fridge uses category-specific days
  let days = 7
  if (c.includes('fish') || c.includes('seafood')) days = 2
  else if (c.includes('meat') || c.includes('chicken') || c.includes('poultry')) days = 3
  else if (c.includes('dairy') || c.includes('milk') || c.includes('yogurt') || c.includes('cheese')) days = 7
  else if (c.includes('veg') || c.includes('produce') || c.includes('fruit') || c.includes('herb')) days = 5
  else if (c.includes('egg')) days = 21
  else if (c.includes('sauce') || c.includes('condiment')) days = 30
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Escape text for use inside generated print-window HTML
// ---------------------------------------------------------------------------
// SAFARI-SAFE response parsing (June 2025). On iOS, res.json() on a non-JSON
// body (proxy error pages, 413 upload-too-large, gateway timeouts) throws the
// cryptic "The string did not match the expected pattern." — parse the text
// manually and return a friendly error object instead.
// ---------------------------------------------------------------------------
export async function safeJson(res) {
  const text = await res.text().catch(() => '')
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { error: `Server error (${res?.status || '?'}) — please try again` }
  }
}

export function escapeText(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// ---------------------------------------------------------------------------
// BACK-BUTTON STANDARD (Aug 2026, permanent rule): every generated print /
// summary page MUST include a visible way back. This helper injects a fixed
// "← Back" + "🖨️ Print / Save PDF" toolbar into any print-window HTML.
// The toolbar is hidden automatically when actually printing.
// ---------------------------------------------------------------------------
export function withBackToolbar(html) {
  const toolbar = `
<div class="sw-back-toolbar" style="position:sticky;top:0;z-index:9999;display:flex;gap:10px;align-items:center;background:#0f172a;padding:10px 14px;margin:-40px -40px 24px;box-shadow:0 2px 8px rgba(0,0,0,.25)">
  <button onclick="(window.opener||window.history.length>1)?(window.close(),setTimeout(function(){history.back()},150)):history.back()"
    style="background:#334155;color:#fff;border:none;border-radius:8px;padding:9px 18px;font-size:14px;font-weight:700;cursor:pointer">&larr; Back</button>
  <button onclick="window.print()"
    style="background:#059669;color:#fff;border:none;border-radius:8px;padding:9px 18px;font-size:14px;font-weight:700;cursor:pointer">&#128424;&#65039; Print / Save PDF</button>
  <span style="color:#94a3b8;font-size:12px;margin-left:auto">ShelfWise</span>
</div>
<style>@media print{.sw-back-toolbar{display:none!important}}</style>`
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, m => m + toolbar)
  return toolbar + html
}
