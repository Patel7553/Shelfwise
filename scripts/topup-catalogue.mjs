// Top up PATEL FOOD catalogue to ~130+ items: inserts the coffee-shop catalogue
// from seed-coffee-demo.mjs but SKIPS items whose name already exists (case-insensitive)
// and CONTINUES SKU numbering per prefix. No other tables touched.
import 'dotenv/config'
import { randomUUID as uuid } from 'crypto'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const SID = '995016c0-249b-48e7-aa24-51de2ecde382'

// Reuse the catalogue definition by importing the seed file is not possible
// (it runs main on import), so read+eval the CAT array from its source.
import { readFileSync } from 'fs'
const src = readFileSync('/app/scripts/seed-coffee-demo.mjs', 'utf8')
const m = src.match(/const CAT = \[([\s\S]*?)\n\]/)
const CAT = eval('[' + m[1] + ']')
const SKU_PREFIX = eval('(' + src.match(/const SKU_PREFIX = \{([\s\S]*?)\n\}/)[0].replace('const SKU_PREFIX = ', '') + ')')

const main = async () => {
  const r = await fetch(`${URL}/rest/v1/supplier_products?supplier_id=eq.${SID}&select=name,sku`, { headers: H })
  const existing = await r.json()
  const names = new Set(existing.map(x => x.name.trim().toLowerCase()))
  // continue SKU counters per prefix
  const counters = {}
  for (const x of existing) {
    const mm = /^([A-Z]{3})-(\d+)$/.exec(x.sku || '')
    if (mm) counters[mm[1]] = Math.max(counters[mm[1]] || 0, Number(mm[2]))
  }
  const rows = []
  for (const [name, category, unit, pack_size, price] of CAT) {
    if (names.has(name.trim().toLowerCase())) continue
    const p = SKU_PREFIX[category] || 'GEN'
    counters[p] = (counters[p] || 0) + 1
    rows.push({ id: uuid(), supplier_id: SID, name, category, unit, pack_size, price, sku: `${p}-${String(counters[p]).padStart(3, '0')}`, available: true, notes: '' })
  }
  console.log(`Existing: ${existing.length} | to insert: ${rows.length} | skipped duplicates: ${CAT.length - rows.length}`)
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50)
    const res = await fetch(`${URL}/rest/v1/supplier_products`, { method: 'POST', headers: H, body: JSON.stringify(chunk) })
    if (!res.ok) throw new Error(`insert failed: ${(await res.text()).slice(0, 300)}`)
  }
  const r2 = await fetch(`${URL}/rest/v1/supplier_products?supplier_id=eq.${SID}&select=id`, { headers: { ...H, Prefer: 'count=exact' } })
  console.log('Final catalogue count:', (r2.headers.get('content-range') || '').split('/')[1])
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
