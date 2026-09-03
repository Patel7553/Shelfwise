// Fix-up: seed temp logs for Coffee's EXISTING locations (Main Fridge/Main Freezer,
// + add a Milk Fridge), and top-up receipts alongside the user's existing one.
import 'dotenv/config'
import { randomUUID as uuid } from 'crypto'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const KID = '78789af5-7416-4399-9a59-97762c6a76da'

const insert = async (table, rows) => {
  for (let i = 0; i < rows.length; i += 50) {
    const r = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: H, body: JSON.stringify(rows.slice(i, i + 50)) })
    if (!r.ok) throw new Error(`${table} insert failed: ${(await r.text()).slice(0, 300)}`)
  }
  console.log(`  ✔ ${table}: +${rows.length} rows`)
}
const daysAgoISO = (n, hh, mm = 0) => {
  const d = new Date('2026-09-03T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); d.setUTCHours(hh, mm, 0, 0)
  return d.toISOString()
}

const TEMP_SERIES = {
  'Main Fridge':  [2.4, 3.1, 2.8, 3.5, 2.2, 7.8, 3.4, 2.9, 3.1, 2.6, 3.8, 3.2, 2.5],  // one 7.8°C FAIL (day-4 PM)
  'Milk Fridge':  [2.1, 2.6, 1.8, 2.4, 2.9, 2.2, 3.1, 2.7, 2.0, 2.5, 3.3, 2.8, 2.3],
  'Main Freezer': [-18.5, -18.2, -19.1, -18.8, -17.6, -18.3, -19.4, -18.1, -17.9, -18.6, -18.2, -17.5, -18.9],
}
const PASS = {
  'Main Fridge': (t) => t >= 1 && t <= 5,
  'Milk Fridge': (t) => t >= 1 && t <= 5,
  'Main Freezer': (t) => t <= -15,
}
const STAFFR = ['Marco', 'Tomasz', 'Ella', 'Priya']

const RECEIPTS = [
  ['PATEL FOOD', '2026-09-01', 284.60, 'submitted', 'Marco', 'Weekly dry goods & dairy order'],
  ['PATEL FOOD', '2026-09-02', 190.40, 'submitted', 'Priya', 'Pastry + frozen top-up'],
  ['Local Greengrocer', '2026-09-02', 48.75, 'reviewed', 'Ella', 'Fruit & veg market run'],
  ['Cash & Carry', '2026-09-03', 122.30, 'pending', 'Marco', 'Packaging + cleaning restock'],
  ['PATEL FOOD', '2026-08-24', 310.90, 'reviewed', 'Marco', ''],
  ['PATEL FOOD', '2026-08-17', 270.45, 'reviewed', 'Priya', ''],
  ['Local Greengrocer', '2026-08-19', 57.10, 'reviewed', 'Ella', ''],
  ['Cash & Carry', '2026-08-26', 140.60, 'reviewed', 'Tomasz', 'Cups + napkins bulk buy'],
]

async function main() {
  // 1. add Milk Fridge to existing locations (keep user's Main Fridge/Freezer)
  let r = await fetch(`${URL}/rest/v1/kitchens?id=eq.${KID}&select=haccp_locations`, { headers: H })
  const locs = (await r.json())[0]?.haccp_locations || []
  if (!locs.some(l => l.name === 'Milk Fridge')) {
    locs.push({ id: `loc-${uuid().slice(0, 8)}`, name: 'Milk Fridge', type: 'fridge', minC: 1, maxC: 4, active: true })
    const p = await fetch(`${URL}/rest/v1/kitchens?id=eq.${KID}`, { method: 'PATCH', headers: H, body: JSON.stringify({ haccp_locations: locs }) })
    if (!p.ok) throw new Error(await p.text())
    console.log('  ✔ added "Milk Fridge" location (Main Fridge/Main Freezer kept as-is)')
  }

  // 2. temp logs — 7 days, AM+PM (13 checks; today PM not due yet)
  r = await fetch(`${URL}/rest/v1/haccp_temperature_logs?kitchen_id=eq.${KID}&select=id&limit=1`, { headers: { ...H, Prefer: 'count=exact' } })
  const existing = Number((r.headers.get('content-range') || '*/0').split('/')[1] || 0)
  if (existing > 0) console.log(`  ↷ temp logs already: ${existing} — skipping`)
  else {
    const rows = []
    for (let day = 6; day >= 0; day--) {
      for (const half of [0, 1]) {
        if (day === 0 && half === 1) continue
        const idx = (6 - day) * 2 + half
        let li = 0
        for (const name of Object.keys(TEMP_SERIES)) {
          const t = TEMP_SERIES[name][idx]
          if (t === undefined) continue
          const pass = PASS[name](t)
          rows.push({
            id: uuid(), kitchen_id: KID, location: name, temperature_c: t, is_pass: pass,
            recorded_at: daysAgoISO(day, half ? 16 : 8, half ? 30 : 10),
            recorded_by: STAFFR[(idx + li++) % STAFFR.length],
            notes: pass ? '' : 'Door left ajar during delivery — closed, rechecked after 20 min: 3.4°C ✓',
          })
        }
      }
    }
    await insert('haccp_temperature_logs', rows)
  }

  // 3. receipts top-up (user's existing £528.80 auto-receipt untouched)
  r = await fetch(`${URL}/rest/v1/receipts?kitchen_id=eq.${KID}&select=supplier,receipt_date,amount`, { headers: H })
  const have = new Set((await r.json()).map(x => `${x.supplier}|${x.receipt_date}|${x.amount}`))
  const rows = RECEIPTS
    .filter(([s, d, a]) => !have.has(`${s}|${d}|${a}`))
    .map(([supplier, receipt_date, amount, status, added_by, notes]) => ({
      id: uuid(), kitchen_id: KID, supplier, receipt_date, amount, currency: 'GBP',
      status, color: '', notes, image_path: '', file_type: '', photo_url: null,
      raw_text: null, items_count: 0, total_cost: null, created_by: '', added_by,
      imported_at: `${receipt_date}T10:30:00Z`, created_at: `${receipt_date}T10:30:00Z`,
    }))
  if (rows.length) await insert('receipts', rows)
  else console.log('  ↷ receipts already topped up')

  const counts = {}
  for (const [t, q] of [['haccp_temperature_logs', `kitchen_id=eq.${KID}`], ['receipts', `kitchen_id=eq.${KID}`], ['recipes', `kitchen_id=eq.${KID}`], ['kitchens', '']]) {
    const rr = await fetch(`${URL}/rest/v1/${t}?${q}&select=id&limit=1`, { headers: { ...H, Prefer: 'count=exact' } })
    counts[t] = (rr.headers.get('content-range') || '*/0').split('/')[1]
  }
  console.log(`\n— FINAL — temps: ${counts.haccp_temperature_logs} | receipts: ${counts.receipts} | recipes: ${counts.recipes} | accounts (must stay 7): ${counts.kitchens}`)
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
