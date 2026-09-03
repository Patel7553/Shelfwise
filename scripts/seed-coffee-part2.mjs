// ============================================================================
// SEED PART 2 — Coffee kitchen: demo recipes, HACCP fridge temp logs, receipts
// (Sept 2026 user request). Existing accounts only; guarded/idempotent.
//   1. recipes                    — 7 café recipes (ingredients match inventory
//                                   names so "Cooked It" stock deduction demos)
//   2. kitchens (Coffee)          — enable 'haccp' module + define 4 fridge/
//                                   freezer locations (needed for Compliance UI)
//   3. haccp_temperature_logs     — 7 days × 4 locations × 2 checks/day
//                                   (incl. one realistic FAIL with note)
//   4. receipts                   — 9 receipts across Aug + Sep (lights up the
//                                   existing Monthly Spend Totals cards)
// ============================================================================
import 'dotenv/config'
import { randomUUID as uuid } from 'crypto'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const KID = '78789af5-7416-4399-9a59-97762c6a76da' // Coffee kitchen (existing)

const get = async (path) => {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { ...H, Prefer: 'count=exact' } })
  return { count: Number((r.headers.get('content-range') || '*/0').split('/')[1] || 0), data: await r.json().catch(() => []) }
}
const insert = async (table, rows) => {
  for (let i = 0; i < rows.length; i += 50) {
    const r = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: H, body: JSON.stringify(rows.slice(i, i + 50)) })
    if (!r.ok) throw new Error(`${table} insert failed (${r.status}): ${(await r.text()).slice(0, 300)}`)
  }
  console.log(`  ✔ ${table}: inserted ${rows.length} rows`)
}
const daysAgoISO = (n, hh = 10, mm = 0) => {
  const d = new Date('2026-09-03T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); d.setUTCHours(hh, mm, 0, 0)
  return d.toISOString()
}
const ing = (name, quantity, unit, allergens = []) => ({ name, quantity: String(quantity), unit, notes: '', allergens })

// ---------------------------------------------------------------------------
// 1. RECIPES — ingredient names match the seeded Coffee inventory
// ---------------------------------------------------------------------------
const RECIPES = [
  {
    title: 'Avocado Smash on Sourdough', servings: 2, agedDays: 12,
    allergens: ['gluten'],
    ingredients: [
      ing('Sourdough Loaf', 0.5, 'loaf', ['gluten']),
      ing('Avocados (Ready to Eat)', 2, 'each'),
      ing('Lemons', 0.2, 'kg'),
      ing('Mixed Salad Leaves', 0.05, 'kg'),
    ],
    steps: [
      'Toast thick-cut sourdough slices until golden.',
      'Smash avocados with lemon juice, salt and cracked pepper.',
      'Pile the smash onto the toast and top with dressed leaves.',
      'Finish with chilli flakes and a drizzle of olive oil.',
    ],
  },
  {
    title: 'Bacon & Cheddar Toastie', servings: 1, agedDays: 11,
    allergens: ['gluten', 'milk'],
    ingredients: [
      ing('Sourdough Loaf', 0.25, 'loaf', ['gluten']),
      ing('Smoked Streaky Bacon', 0.08, 'kg'),
      ing('Mature Cheddar', 0.06, 'kg', ['milk']),
      ing('Salted Butter', 0.02, 'kg', ['milk']),
    ],
    steps: [
      'Grill the bacon until crisp.',
      'Butter the bread on the outside, layer cheddar and bacon inside.',
      'Toast in the contact grill until the cheese melts and the crust is golden.',
      'Cut diagonally and serve hot.',
    ],
  },
  {
    title: 'Berry Granola Yoghurt Bowl', servings: 1, agedDays: 9,
    allergens: ['milk', 'nuts', 'gluten', 'sesame'],
    ingredients: [
      ing('Greek Yoghurt', 0.2, 'kg', ['milk']),
      ing('Granola (Nut & Seed)', 0.06, 'kg', ['nuts', 'gluten', 'sesame']),
      ing('Blueberries', 0.5, 'punnet'),
      ing('Strawberries', 0.5, 'punnet'),
    ],
    steps: [
      'Spoon chilled Greek yoghurt into a serving bowl.',
      'Top with granola, keeping some crunch on the surface.',
      'Finish with fresh berries and a drizzle of honey.',
    ],
  },
  {
    title: 'Halloumi Breakfast Stack', servings: 2, agedDays: 7,
    allergens: ['milk', 'gluten', 'eggs'],
    ingredients: [
      ing('Halloumi', 0.25, 'kg', ['milk']),
      ing('Free-Range Eggs', 0.15, 'tray', ['eggs']),
      ing('Vine Tomatoes', 0.2, 'kg'),
      ing('Baby Spinach', 0.1, 'kg'),
      ing('Sourdough Loaf', 0.5, 'loaf', ['gluten']),
    ],
    steps: [
      'Griddle halloumi slices until charred on both sides.',
      'Roast vine tomatoes and wilt the spinach in the same pan.',
      'Poach the eggs to a soft set.',
      'Stack everything on toasted sourdough and season well.',
    ],
  },
  {
    title: 'Banana Berry Smoothie', servings: 1, agedDays: 5,
    allergens: [],
    ingredients: [
      ing('Bananas', 0.15, 'kg'),
      ing('Smoothie Mix Berry (Frozen)', 0.15, 'kg'),
      ing('Apple Juice (Cloudy)', 0.25, 'litre'),
    ],
    steps: [
      'Add banana, frozen berry mix and apple juice to the blender.',
      'Blend on high until completely smooth.',
      'Serve over ice in a tall glass.',
    ],
  },
  {
    title: 'Iced Vanilla Latte', servings: 1, agedDays: 4,
    allergens: ['milk'],
    ingredients: [
      ing('House Espresso Blend Beans', 0.018, 'kg'),
      ing('Whole Milk', 0.25, 'litre', ['milk']),
      ing('Vanilla Syrup', 0.03, 'bottle'),
    ],
    steps: [
      'Pull a double espresso shot.',
      'Fill a glass with ice, add the vanilla syrup and cold milk.',
      'Pour the espresso over the top and stir gently.',
    ],
  },
  {
    title: 'Mocha Hot Chocolate', servings: 1, agedDays: 2,
    allergens: ['milk', 'soybeans'],
    ingredients: [
      ing('Hot Chocolate Powder', 0.03, 'tub', ['milk', 'soybeans']),
      ing('Whole Milk', 0.3, 'litre', ['milk']),
      ing('Chocolate Sauce (Mocha)', 0.02, 'bottle', ['milk', 'soybeans']),
      ing('House Espresso Blend Beans', 0.009, 'kg'),
    ],
    steps: [
      'Steam the milk with the hot chocolate powder until silky.',
      'Pull a single espresso shot into a large mug.',
      'Pour over the chocolate milk and finish with mocha sauce.',
    ],
  },
]

// ---------------------------------------------------------------------------
// 2+3. HACCP — locations + a week of temperature checks (today = 2026-09-03)
// ---------------------------------------------------------------------------
const LOCATIONS = [
  { id: `loc-${uuid().slice(0, 8)}`, name: 'Front Counter Fridge', type: 'fridge', minC: 1, maxC: 5, active: true },
  { id: `loc-${uuid().slice(0, 8)}`, name: 'Kitchen Fridge', type: 'fridge', minC: 1, maxC: 5, active: true },
  { id: `loc-${uuid().slice(0, 8)}`, name: 'Milk Fridge', type: 'fridge', minC: 1, maxC: 4, active: true },
  { id: `loc-${uuid().slice(0, 8)}`, name: 'Walk-in Freezer', type: 'freezer', minC: -22, maxC: -15, active: true },
]
// Believable temp curves per location (AM/PM per day, oldest → newest)
const TEMP_SERIES = {
  'Front Counter Fridge': [3.2, 3.8, 2.9, 3.4, 4.1, 3.6, 2.8, 3.1, 3.9, 4.3, 3.2, 3.5, 2.7, 3.3],
  'Kitchen Fridge':       [2.4, 3.1, 2.8, 3.5, 2.2, 7.8, 3.4, 2.9, 3.1, 2.6, 3.8, 3.2, 2.5, 3.0], // one 7.8°C FAIL
  'Milk Fridge':          [2.1, 2.6, 1.8, 2.4, 2.9, 2.2, 3.1, 2.7, 2.0, 2.5, 3.3, 2.8, 2.3, 2.6],
  'Walk-in Freezer':      [-18.5, -18.2, -19.1, -18.8, -17.6, -18.3, -19.4, -18.1, -17.9, -18.6, -18.2, -17.5, -18.9, -18.4],
}
const TEMP_STAFF = ['Marco', 'Tomasz', 'Ella', 'Priya']

// ---------------------------------------------------------------------------
// 4. RECEIPTS — Aug + Sep spend (supplier = free-text label, NOT an account)
//    [supplier, date, amount, status, added_by, notes]
// ---------------------------------------------------------------------------
const RECEIPTS = [
  ['PATEL FOOD', '2026-09-01', 284.60, 'submitted', 'Marco', 'Weekly dry goods & dairy order'],
  ['PATEL FOOD', '2026-09-02', 190.40, 'submitted', 'Priya', 'Pastry + frozen top-up'],
  ['Local Greengrocer', '2026-09-02', 48.75, 'reviewed', 'Ella', 'Fruit & veg market run'],
  ['Cash & Carry', '2026-09-03', 122.30, 'pending', 'Marco', 'Packaging + cleaning restock'],
  ['PATEL FOOD', '2026-09-03', 96.20, 'pending', 'Jack', 'Milk & alt-milk top-up'],
  ['PATEL FOOD', '2026-08-24', 310.90, 'reviewed', 'Marco', ''],
  ['PATEL FOOD', '2026-08-17', 270.45, 'reviewed', 'Priya', ''],
  ['Local Greengrocer', '2026-08-19', 57.10, 'reviewed', 'Ella', ''],
  ['Cash & Carry', '2026-08-26', 140.60, 'reviewed', 'Tomasz', 'Cups + napkins bulk buy'],
]

async function main() {
  console.log('— Seeding Coffee: recipes, HACCP temps, receipts —')

  // ---------------------------------------------------------- 1. recipes
  const rec = await get(`recipes?kitchen_id=eq.${KID}&select=id&limit=1`)
  if (rec.count > 0) console.log(`  ↷ recipes already has ${rec.count} — skipping`)
  else {
    const rows = RECIPES.map(r => ({
      id: uuid(), kitchen_id: KID, title: r.title, servings: r.servings,
      ingredients: r.ingredients, allergens: r.allergens, steps: r.steps,
      matched: [], summary: {}, created_at: daysAgoISO(r.agedDays, 9),
    }))
    await insert('recipes', rows)
  }

  // ------------------------------------------- 2. haccp module + locations
  const k = (await get(`kitchens?id=eq.${KID}&select=modules_enabled,haccp_locations`)).data[0] || {}
  const mods = Array.isArray(k.modules_enabled) ? k.modules_enabled : []
  const patch = {}
  if (!mods.includes('haccp')) patch.modules_enabled = [...mods, 'haccp']
  if (!Array.isArray(k.haccp_locations) || k.haccp_locations.length === 0) patch.haccp_locations = LOCATIONS
  if (Object.keys(patch).length) {
    const r = await fetch(`${URL}/rest/v1/kitchens?id=eq.${KID}`, { method: 'PATCH', headers: H, body: JSON.stringify(patch) })
    if (!r.ok) throw new Error(`kitchens patch failed: ${(await r.text()).slice(0, 300)}`)
    console.log(`  ✔ kitchens: ${patch.modules_enabled ? "enabled 'haccp' module; " : ''}${patch.haccp_locations ? '4 fridge/freezer locations added' : ''}`)
  } else console.log('  ↷ haccp module + locations already set — skipping')

  // ---------------------------------------------------- 3. temperature logs
  const temps = await get(`haccp_temperature_logs?kitchen_id=eq.${KID}&select=id&limit=1`)
  if (temps.count > 0) console.log(`  ↷ temp logs already has ${temps.count} — skipping`)
  else {
    const locs = (patch.haccp_locations || k.haccp_locations || LOCATIONS)
    const rows = []
    for (let day = 6; day >= 0; day--) {          // last 7 days incl. today
      for (const half of [0, 1]) {                 // AM (~08:00) / PM (~16:30)
        if (day === 0 && half === 1) continue      // today's PM check not due yet
        const idx = (6 - day) * 2 + half
        for (const loc of locs) {
          const t = TEMP_SERIES[loc.name]?.[idx]
          if (t === undefined) continue
          const pass = t >= loc.minC && t <= loc.maxC
          rows.push({
            id: uuid(), kitchen_id: KID, location: loc.name, temperature_c: t,
            is_pass: pass, recorded_at: daysAgoISO(day, half ? 16 : 8, half ? 30 : 10),
            recorded_by: TEMP_STAFF[(idx + locs.indexOf(loc)) % TEMP_STAFF.length],
            notes: pass ? '' : 'Door left ajar during delivery — closed, rechecked after 20 min: 3.4°C ✓',
          })
        }
      }
    }
    await insert('haccp_temperature_logs', rows)
  }

  // ------------------------------------------------------------ 4. receipts
  const rcp = await get(`receipts?kitchen_id=eq.${KID}&select=id&limit=1`)
  if (rcp.count > 0) console.log(`  ↷ receipts already has ${rcp.count} — skipping`)
  else {
    const rows = RECEIPTS.map(([supplier, receipt_date, amount, status, added_by, notes]) => ({
      id: uuid(), kitchen_id: KID, supplier, receipt_date, amount, currency: 'GBP',
      status, color: '', notes, image_path: null, file_type: null, photo_url: null,
      raw_text: null, items_count: 0, total_cost: null, created_by: '', added_by,
      imported_at: `${receipt_date}T10:30:00Z`, created_at: `${receipt_date}T10:30:00Z`,
    }))
    await insert('receipts', rows)
  }

  // ------------------------------------------------------------ summary
  const [r2, t2, c2] = await Promise.all([
    get(`recipes?kitchen_id=eq.${KID}&select=id&limit=1`),
    get(`haccp_temperature_logs?kitchen_id=eq.${KID}&select=id&limit=1`),
    get(`receipts?kitchen_id=eq.${KID}&select=id&limit=1`),
  ])
  const kitchens = await get('kitchens?select=id')
  console.log(`\n— FINAL — recipes: ${r2.count} | temp logs: ${t2.count} | receipts: ${c2.count} | accounts (must stay 7): ${kitchens.count}`)
}

main().catch(e => { console.error('SEED FAILED:', e.message); process.exit(1) })
