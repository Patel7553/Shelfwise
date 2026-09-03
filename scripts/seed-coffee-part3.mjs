// SEED PART 3 — Coffee: cleaning tasks + week of sign-offs, delivery checks,
// and a few demo price alerts (feeds the new notifications bell).
// Guarded/idempotent. Existing accounts only.
import 'dotenv/config'
import { randomUUID as uuid } from 'crypto'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const KID = '78789af5-7416-4399-9a59-97762c6a76da'

const count = async (q) => {
  const r = await fetch(`${URL}/rest/v1/${q}`, { headers: { ...H, Prefer: 'count=exact' } })
  return Number((r.headers.get('content-range') || '*/0').split('/')[1] || 0)
}
const insert = async (table, rows) => {
  for (let i = 0; i < rows.length; i += 50) {
    const r = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: H, body: JSON.stringify(rows.slice(i, i + 50)) })
    if (!r.ok) throw new Error(`${table}: ${(await r.text()).slice(0, 300)}`)
  }
  console.log(`  ✔ ${table}: +${rows.length}`)
}
const daysAgoISO = (n, hh, mm = 0) => {
  const d = new Date('2026-09-03T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); d.setUTCHours(hh, mm, 0, 0)
  return d.toISOString()
}

// Cleaning tasks: [task_name, area, frequency]
const TASKS = [
  ['Sanitise prep surfaces', 'Kitchen', 'daily'],
  ['Backflush espresso machine', 'Bar', 'daily'],
  ['Sanitise steam wands', 'Bar', 'daily'],
  ['Clean coffee grinders', 'Bar', 'daily'],
  ['Mop floors', 'Front of house', 'daily'],
  ['Empty & sanitise bins', 'Kitchen', 'daily'],
  ['Deep clean fridges', 'Kitchen', 'weekly'],
  ['Descale espresso machine', 'Bar', 'weekly'],
  ['Clean extraction hood', 'Kitchen', 'monthly'],
]
const SIGNERS = ['Tomasz', 'Ella', 'Liam', 'Priya', 'Marco']

// Delivery checks: [supplier, daysAgo, hour, tempC, tempOk, packOk, labelsOk, pass, by, notes]
const DELIVERIES = [
  ['PATEL FOOD', 2, 7, 3.5, true, true, true, true, 'Marco', ''],
  ['Local Greengrocer', 1, 8, null, true, true, false, true, 'Ella', 'One crate label missing best-before — supplier confirmed dates by email'],
  ['PATEL FOOD', 6, 7, 8.9, false, true, true, false, 'Priya', 'Chilled dairy arrived at 8.9°C — rejected and credited by supplier'],
]

// Demo price alerts (person = supplier name for catalogue changes, staff name for edits)
const PRICE_ALERTS = [
  ['PATEL FOOD', 'Sourdough Loaf: £2.40 → £2.65 (PATEL FOOD catalogue)', 1, 9],
  ['PATEL FOOD', 'Barista Oat Milk: £1.85 → £1.72 (PATEL FOOD catalogue)', 2, 14],
  ['Marco', 'Single Origin Colombia Beans: £17.20 → £17.80 (edited by Marco)', 2, 10],
]

async function main() {
  // 1. cleaning tasks
  const taskRows = TASKS.map(([task_name, area, frequency]) => ({ id: uuid(), kitchen_id: KID, task_name, area, frequency, active: true }))
  if (await count(`haccp_cleaning_tasks?kitchen_id=eq.${KID}&select=id&limit=1`) > 0) console.log('  ↷ cleaning tasks exist — skip')
  else await insert('haccp_cleaning_tasks', taskRows)

  // 2. cleaning sign-offs — last 7 days: daily tasks ~every day, weekly once, monthly once
  if (await count(`haccp_cleaning_log?kitchen_id=eq.${KID}&select=id&limit=1`) > 0) console.log('  ↷ cleaning log exists — skip')
  else {
    const rows = []
    let s = 0
    for (let day = 6; day >= 0; day--) {
      for (const t of taskRows) {
        if (t.frequency === 'daily') {
          if (day === 0 && ['Mop floors', 'Empty & sanitise bins'].includes(t.task_name)) continue // today's close-down not done yet
          rows.push({
            id: uuid(), kitchen_id: KID, task_id: t.id, task_name: t.task_name,
            completed_at: daysAgoISO(day, t.area === 'Bar' ? 19 : 20, (s * 7) % 55),
            completed_by: SIGNERS[s++ % SIGNERS.length], notes: '',
          })
        }
      }
    }
    rows.push({ id: uuid(), kitchen_id: KID, task_id: taskRows[6].id, task_name: 'Deep clean fridges', completed_at: daysAgoISO(4, 15), completed_by: 'Tomasz', notes: 'All shelves out, sanitised & dried' })
    rows.push({ id: uuid(), kitchen_id: KID, task_id: taskRows[7].id, task_name: 'Descale espresso machine', completed_at: daysAgoISO(3, 21), completed_by: 'Ella', notes: '' })
    await insert('haccp_cleaning_log', rows)
  }

  // 3. delivery checks
  if (await count(`haccp_delivery_checks?kitchen_id=eq.${KID}&select=id&limit=1`) > 0) console.log('  ↷ delivery checks exist — skip')
  else {
    await insert('haccp_delivery_checks', DELIVERIES.map(([supplier, ago, hh, temperature_c, temperature_ok, packaging_ok, labels_ok, overall_pass, checked_by, notes]) => ({
      id: uuid(), kitchen_id: KID, supplier, delivery_date: daysAgoISO(ago, hh),
      temperature_c, temperature_ok, packaging_ok, labels_ok, overall_pass, checked_by, notes,
    })))
  }

  // 4. demo price alerts
  if (await count(`activity_logs?kitchen_id=eq.${KID}&action=eq.price_alert&select=id&limit=1`) > 0) console.log('  ↷ price alerts exist — skip')
  else {
    await insert('activity_logs', PRICE_ALERTS.map(([person, detail, ago, hh], i) => ({
      id: uuid(), kitchen_id: KID, person, action: 'price_alert', detail, created_at: daysAgoISO(ago, hh, i * 11),
    })))
  }

  console.log('\n— FINAL —',
    'tasks:', await count(`haccp_cleaning_tasks?kitchen_id=eq.${KID}&select=id&limit=1`),
    '| signoffs:', await count(`haccp_cleaning_log?kitchen_id=eq.${KID}&select=id&limit=1`),
    '| deliveries:', await count(`haccp_delivery_checks?kitchen_id=eq.${KID}&select=id&limit=1`),
    '| price alerts:', await count(`activity_logs?kitchen_id=eq.${KID}&action=eq.price_alert&select=id&limit=1`),
    '| accounts (must stay 7):', await count('kitchens?select=id&limit=1'))
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
