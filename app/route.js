import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const EMERGENT_URL = 'https://integrations.emergentagent.com/llm/v1/chat/completions'

function json(data, status = 200) {
  return NextResponse.json(data, { status })
}

function escapeLike(s) {
  return String(s).replace(/[%_]/g, c => '\\' + c)
}

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
    customFields: cf,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toDb(body) {
  // Stash dateReceived inside customFields so we don't need a schema migration.
  const cf = body.customFields && typeof body.customFields === 'object' ? { ...body.customFields } : {}
  if (body.dateReceived) cf._dateReceived = body.dateReceived
  return {
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
      ] }
    ],
    temperature: 0,
    response_format: { type: 'json_object' }
  }
  const res = await fetch(EMERGENT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`Vision API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || '{}'
  let parsed
  try { parsed = JSON.parse(content) }
  catch { const m = content.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { items: [] } }
  const items = Array.isArray(parsed) ? parsed : (parsed.items || [])
  return items.map(it => ({
    name: String(it.name || '').trim(),
    quantity: Number(it.quantity) || 1,
    unit: String(it.unit || 'ea').trim(),
    expiryDate: it.expiryDate || null,
    category: String(it.category || '').trim(),
    storageType: String(it.storageType || 'Fridge').trim(),
    location: String(it.location || '').trim(),
    preparedBy: String(it.preparedBy || '').trim(),
  })).filter(it => it.name)
}

// Parse free-form voice transcript into one or more inventory items
async function parseTextForItems(text) {
  const key = process.env.EMERGENT_LLM_KEY
  if (!key) throw new Error('EMERGENT_LLM_KEY not set')
  const today = new Date().toISOString().slice(0, 10)
  const systemPrompt = `You are a kitchen voice-command parser. The chef speaks naturally about inventory items. Convert spoken text to structured JSON.

Return ONLY a valid JSON object: {"items":[ ... ]}. Each item:
- "name": product name (e.g. "Chicken Breast")
- "quantity": a number (default 1 if unclear)
- "unit": one of "ea","kg","g","L","mL","bunch","pack","box" (best guess from speech)
- "expiryDate": "YYYY-MM-DD" if a date is mentioned (resolve relative dates like "tomorrow", "next Friday", "in 3 days"). Today is ${today}. Use null if not mentioned.
- "category": broad category
- "storageType": "Fridge","Freezer","Dry", or "Ambient"
- "location": shelf if mentioned, else ""

Examples:
- "Add 5 kg chicken expires Friday" → name="Chicken", quantity=5, unit="kg", expiryDate=<this Friday>, storageType="Fridge"
- "Two cartons of milk in fridge two" → name="Milk", quantity=2, unit="ea", location="Fridge 2", storageType="Fridge"
- "10 trays of croissants for tomorrow" → name="Croissants", quantity=10, unit="ea", expiryDate=<tomorrow>

Output strictly valid JSON.`
  const body = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Parse this kitchen voice command:\n\n"${text}"` },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  }
  const res = await fetch(EMERGENT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`LLM API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || '{}'
  let parsed
  try { parsed = JSON.parse(content) }
  catch { const m = content.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { items: [] } }
  const items = Array.isArray(parsed) ? parsed : (parsed.items || [])
  return items.map(it => ({
    name: String(it.name || '').trim(),
    quantity: Number(it.quantity) || 1,
    unit: String(it.unit || 'ea').trim(),
    expiryDate: it.expiryDate || null,
    category: String(it.category || '').trim(),
    storageType: String(it.storageType || 'Fridge').trim(),
    location: String(it.location || '').trim(),
    preparedBy: '',
  })).filter(it => it.name)
}

async function scanRecipe({ image, text }) {
  const key = process.env.EMERGENT_LLM_KEY
  if (!key) throw new Error('EMERGENT_LLM_KEY not set')
  const systemPrompt = `You are an expert culinary assistant. Analyze recipes and extract structured data.

Return ONLY a JSON object:
{
  "title": "...",
  "servings": "...",
  "ingredients": [{ "name": "...", "quantity": number, "unit": "...", "notes": "..." }],
  "allergens": ["gluten","dairy","nuts","eggs","soy","shellfish","fish","sesame","peanuts","mustard","celery","sulfites"],
  "steps": ["step 1", ...]
}
Output strictly valid JSON.`
  const userContent = image
    ? [{ type: 'text', text: 'Analyze this recipe image.' }, { type: 'image_url', image_url: { url: image } }]
    : [{ type: 'text', text: `Analyze this recipe:\n\n${text}` }]
  const body = {
    model: 'gpt-4o',
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
    temperature: 0,
    response_format: { type: 'json_object' }
  }
  const res = await fetch(EMERGENT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`Recipe API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || '{}'
  let parsed
  try { parsed = JSON.parse(content) }
  catch { const m = content.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {} }
  return {
    title: parsed.title || null,
    servings: parsed.servings || null,
    ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
    allergens: Array.isArray(parsed.allergens) ? parsed.allergens : [],
    steps: Array.isArray(parsed.steps) ? parsed.steps : []
  }
}

function matchIngredientToInventory(name, products) {
  const n = String(name || '').toLowerCase().trim()
  if (!n) return null
  let match = products.find(p => (p.name || '').toLowerCase() === n)
  if (match) return match
  match = products.find(p => {
    const pn = (p.name || '').toLowerCase()
    return pn.includes(n) || n.includes(pn)
  })
  return match || null
}

export async function GET(request, { params }) {
  try {
    const path = (params?.path || []).join('/')
    const sb = supabaseAdmin

    if (path === '' || path === 'health') return json({ ok: true, service: 'ShelfWise API (Supabase)' })

    if (path === 'products') {
      const url = new URL(request.url)
      const status = url.searchParams.get('status')
      const search = url.searchParams.get('search')
      const sort = url.searchParams.get('sort')
      const category = url.searchParams.get('category')
      const storage = url.searchParams.get('storage')

      let q = sb.from('products').select('*').limit(5000)
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
      const { data, error } = await sb.from('settings').select('*').eq('id', 'kitchen').maybeSingle()
      if (error && error.code !== 'PGRST116') throw error
      if (!data) return json({ id: 'kitchen', onboarded: false, kitchenName: '', kitchenType: '', customFields: [], inviteCode: '', alertEmail: '', tagline: 'From shelf to plate — never lose track.', dashboardWidgets: ['search','expiry_alerts','all_items','expiring','expired','critical','urgent_list'] })
      return json({
        id: data.id,
        kitchenName: data.kitchen_name || '',
        kitchenType: data.kitchen_type || '',
        onboarded: data.onboarded === true,
        customFields: data.custom_fields || [],
        inviteCode: data.invite_code || '',
        alertEmail: data.alert_email || '',
        tagline: data.tagline || 'From shelf to plate — never lose track.',
        dashboardWidgets: Array.isArray(data.dashboard_widgets) ? data.dashboard_widgets : ['search','expiry_alerts','all_items','expiring','expired','critical','urgent_list'],
      })
    }

    if (path === 'facets') {
      const { data, error } = await sb.from('products').select('category, storage_type').limit(5000)
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
      const [{ count: total }, { count: expired }, { count: expiring }, { count: critical }] = await Promise.all([
        sb.from('products').select('*', { count: 'exact', head: true }),
        sb.from('products').select('*', { count: 'exact', head: true }).not('expiry_date', 'is', null).lt('expiry_date', todayISO),
        sb.from('products').select('*', { count: 'exact', head: true }).not('expiry_date', 'is', null).gte('expiry_date', todayISO).lte('expiry_date', in7ISO),
        sb.from('products').select('*', { count: 'exact', head: true }).lte('quantity', 2).or(`expiry_date.is.null,expiry_date.gt.${in7ISO}`),
      ])
      return json({ total: total || 0, expired: expired || 0, expiring: expiring || 0, critical: critical || 0 })
    }

    if (path === 'recipes') {
      const url = new URL(request.url)
      const search = url.searchParams.get('search')
      let q = sb.from('recipes').select('*').order('created_at', { ascending: false }).limit(500)
      if (search) q = q.ilike('title', `%${escapeLike(search)}%`)
      const { data, error } = await q
      if (error) throw error
      return json(data || [])
    }

    if (path.startsWith('recipes/')) {
      const id = path.split('/')[1]
      const { data, error } = await sb.from('recipes').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return json({ error: 'Not found' }, 404)
      return json(data)
    }

    return json({ error: 'Not found' }, 404)
  } catch (e) {
    console.error('GET error', e)
    return json({ error: e.message }, 500)
  }
}

export async function POST(request, { params }) {
  try {
    const path = (params?.path || []).join('/')
    const sb = supabaseAdmin

    if (path === 'scan') {
      const body = await request.json()
      const image = body.image
      if (!image || !image.startsWith('data:image/')) return json({ error: 'Invalid or missing image' }, 400)
      const items = await scanImageForItems(image)
      return json({ items })
    }

    if (path === 'parse-voice') {
      const body = await request.json()
      const text = String(body.text || '').trim()
      if (!text) return json({ error: 'text required' }, 400)
      if (text.length > 800) return json({ error: 'text too long' }, 400)
      const items = await parseTextForItems(text)
      return json({ items })
    }

    if (path === 'recipe-instructions') {
      const body = await request.json()
      const title = String(body.title || '').trim()
      const ingredients = Array.isArray(body.ingredients) ? body.ingredients.filter(Boolean) : []
      const servings = String(body.servings || '').trim()
      if (!ingredients.length && !title) return json({ error: 'title or ingredients required' }, 400)

      const key = process.env.EMERGENT_LLM_KEY
      if (!key) return json({ error: 'EMERGENT_LLM_KEY not set' }, 500)

      const systemPrompt = `You are a professional chef. Generate clear, step-by-step COOKING INSTRUCTIONS for the recipe below.
Use techniques and sequencing typical of trusted recipe sources (BBC Good Food, Serious Eats, Bon Appétit, Epicurious, NYT Cooking).

Rules:
- Return ONLY valid JSON: {"instructions":["step 1...","step 2..."], "source":"e.g. BBC Good Food style"}
- 6 to 12 numbered steps
- Each step is one clear sentence, 12-30 words
- Mention temperatures (°C and °F), times, and technique cues (e.g. "until golden")
- Be safe: cooking temperatures for chicken/pork/seafood, allergen handling
- Use ONLY the ingredients listed (no new ones)
- Output strict JSON only.`

      const userPrompt = `Recipe title: ${title || '(unknown - infer from ingredients)'}\nServings: ${servings || 'unspecified'}\nIngredients:\n${ingredients.map(i => '- ' + i).join('\n')}\n\nGenerate the cooking method.`

      try {
        const apiRes = await fetch(EMERGENT_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
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
        const source = String(parsed.source || 'AI Generated (BBC Good Food / Serious Eats style)')
        if (!instructions.length) return json({ error: 'Could not generate instructions' }, 502)
        return json({ instructions, source })
      } catch (e) {
        return json({ error: e?.message || 'AI error' }, 502)
      }
    }

    if (path === 'recipe') {
      const body = await request.json()
      const image = body.image, text = body.text
      if (!image && !text) return json({ error: 'image or text required' }, 400)
      if (image && !image.startsWith('data:image/')) return json({ error: 'invalid image data URL' }, 400)
      const recipe = await scanRecipe({ image, text })
      const { data: rows, error } = await sb.from('products').select('*').limit(5000)
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
      // Save a recipe (called from frontend after a successful scan)
      const body = await request.json()
      const row = {
        title: body.title || 'Untitled recipe',
        servings: body.servings || null,
        ingredients: Array.isArray(body.ingredients) ? body.ingredients : [],
        allergens: Array.isArray(body.allergens) ? body.allergens : [],
        steps: Array.isArray(body.steps) ? body.steps : [],
        matched: Array.isArray(body.matched) ? body.matched : [],
        summary: body.summary && typeof body.summary === 'object' ? body.summary : {},
      }
      const { data, error } = await sb.from('recipes').insert(row).select().single()
      if (error) throw error
      return json(data, 201)
    }

    if (path === 'products') {
      const body = await request.json()
      const doc = { id: uuidv4(), ...toDb(body) }
      const { data, error } = await sb.from('products').insert(doc).select().single()
      if (error) throw error
      return json(enrich(fromDb(data)), 201)
    }

    if (path === 'products/bulk') {
      const body = await request.json()
      const itemsIn = Array.isArray(body.items) ? body.items : []
      const docs = itemsIn.filter(i => i.name).map(b => ({ id: uuidv4(), ...toDb(b) }))
      if (!docs.length) return json({ inserted: 0, items: [] }, 201)
      const { data, error } = await sb.from('products').insert(docs).select()
      if (error) throw error
      return json({ inserted: data.length, items: data.map(fromDb).map(enrich) }, 201)
    }

    if (path === 'auth/verify-code') {
      // Verify a kitchen invite code
      const body = await request.json()
      const code = String(body.code || '').trim()
      if (!code) return json({ ok: false, error: 'Code required' }, 400)
      const { data } = await sb.from('settings').select('invite_code, kitchen_name, kitchen_type, tagline').eq('id', 'kitchen').maybeSingle()
      if (!data?.invite_code || data.invite_code !== code) {
        return json({ ok: false, error: 'Invalid code' }, 401)
      }
      return json({ ok: true, kitchenName: data.kitchen_name, kitchenType: data.kitchen_type, tagline: data.tagline })
    }

    if (path === 'email/test' || path === 'email/check-expiring') {
      const apiKey = process.env.RESEND_API_KEY
      if (!apiKey) return json({ error: 'RESEND_API_KEY not configured' }, 500)

      const { data: cfg } = await sb.from('settings').select('alert_email, kitchen_name, tagline').eq('id', 'kitchen').maybeSingle()
      const body = await request.json().catch(() => ({}))
      const to = body.to || cfg?.alert_email
      if (!to) return json({ error: 'No alert email configured. Set one in Settings.' }, 400)

      // Get expiring (within 6 days) + expired items
      const today = new Date()
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const in6 = new Date(start.getTime() + 6 * 86400000)
      const todayISO = start.toISOString().slice(0, 10)
      const in6ISO = in6.toISOString().slice(0, 10)

      const { data: expRows } = await sb.from('products').select('*').not('expiry_date', 'is', null).lt('expiry_date', todayISO).limit(500)
      const { data: soonRows } = await sb.from('products').select('*').not('expiry_date', 'is', null).gte('expiry_date', todayISO).lte('expiry_date', in6ISO).limit(500)
      const expired = (expRows || []).map(fromDb)
      const soon = (soonRows || []).map(fromDb)

      const isTest = path === 'email/test'

      const expRowsHtml = expired.map(p => `<tr><td style="padding:8px;border-bottom:1px solid #fee">${p.name}</td><td style="padding:8px;border-bottom:1px solid #fee">${p.quantity} ${p.unit}</td><td style="padding:8px;border-bottom:1px solid #fee;color:#b91c1c"><b>${p.expiryDate}</b></td></tr>`).join('')
      const soonRowsHtml = soon.map(p => `<tr><td style="padding:8px;border-bottom:1px solid #fef3c7">${p.name}</td><td style="padding:8px;border-bottom:1px solid #fef3c7">${p.quantity} ${p.unit}</td><td style="padding:8px;border-bottom:1px solid #fef3c7;color:#b45309"><b>${p.expiryDate}</b></td></tr>`).join('')

      const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f9fafb;padding:24px;color:#111">
        <div style="max-width:600px;margin:auto;background:white;border-radius:16px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.05)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <div style="height:36px;width:36px;border-radius:8px;background:linear-gradient(135deg,#10b981,#0d9488);display:inline-block"></div>
            <h1 style="font-size:22px;margin:0;color:#064e3b">ShelfWise${cfg?.kitchen_name ? ' · ' + cfg.kitchen_name : ''}</h1>
          </div>
          <p style="color:#6b7280;font-size:13px;margin:0 0 24px">${cfg?.tagline || 'From shelf to plate — never lose track.'}</p>
          ${isTest ? '<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:16px;margin-bottom:20px"><b>✅ Test email working!</b><br>Your alerts are configured correctly. Real expiry alerts will arrive automatically.</div>' : ''}
          ${expired.length === 0 && soon.length === 0
            ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:20px;text-align:center"><b style="color:#065f46">🎉 No urgent items today.</b><br><span style="color:#6b7280;font-size:13px">All your inventory is fresh and in stock.</span></div>`
            : `${expired.length > 0 ? `<h2 style="font-size:15px;color:#b91c1c;margin-top:24px">🔴 Expired (${expired.length})</h2>
                <table style="width:100%;border-collapse:collapse;background:#fef2f2;border-radius:8px;overflow:hidden">${expRowsHtml}</table>` : ''}
              ${soon.length > 0 ? `<h2 style="font-size:15px;color:#b45309;margin-top:24px">🟡 Expiring within 6 days (${soon.length})</h2>
                <table style="width:100%;border-collapse:collapse;background:#fffbeb;border-radius:8px;overflow:hidden">${soonRowsHtml}</table>` : ''}`}
          <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:32px">— ShelfWise · Automated Alert</p>
        </div></body></html>`

      const subject = isTest
        ? `ShelfWise — Test alert`
        : `ShelfWise — ${expired.length} expired, ${soon.length} expiring soon`

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'ShelfWise Alerts <onboarding@resend.dev>',
          to: [to],
          subject,
          html,
        })
      })
      if (!res.ok) {
        const txt = await res.text()
        return json({ error: `Email send failed: ${txt.slice(0, 200)}` }, 500)
      }
      const result = await res.json()
      return json({ ok: true, sent: result.id, counts: { expired: expired.length, soon: soon.length } })
    }

    if (path === 'seed') {
      const sample = [
        { name: 'Whole Milk', quantity: 4, unit: 'L', expiryDate: addDays(2), category: 'Dairy', storageType: 'Fridge', location: 'Shelf A1', preparedBy: 'Chef Anna' },
        { name: 'Chicken Breast', quantity: 1, unit: 'kg', expiryDate: addDays(-1), category: 'Meat', storageType: 'Fridge', location: 'Shelf B2', preparedBy: 'Chef Marco' },
        { name: 'Basil', quantity: 2, unit: 'bunch', expiryDate: addDays(5), category: 'Produce', storageType: 'Fridge', location: 'Shelf A3', preparedBy: 'Chef Lin' },
        { name: 'Flour', quantity: 12, unit: 'kg', expiryDate: addDays(120), category: 'Dry Goods', storageType: 'Dry', location: 'Pantry P1', preparedBy: 'Chef Sam' },
        { name: 'Salmon Fillet', quantity: 2, unit: 'kg', expiryDate: addDays(1), category: 'Seafood', storageType: 'Fridge', location: 'Shelf B1', preparedBy: 'Chef Marco' },
        { name: 'Frozen Peas', quantity: 5, unit: 'kg', expiryDate: addDays(200), category: 'Vegetables', storageType: 'Freezer', location: 'Freezer F2', preparedBy: 'Chef Lin' },
        { name: 'Greek Yogurt', quantity: 2, unit: 'kg', expiryDate: addDays(4), category: 'Dairy', storageType: 'Fridge', location: 'Shelf A2', preparedBy: 'Chef Anna' },
        { name: 'Olive Oil', quantity: 1, unit: 'L', expiryDate: addDays(365), category: 'Pantry', storageType: 'Dry', location: 'Pantry P2', preparedBy: 'Chef Sam' },
      ]
      const docs = sample.map(s => ({ id: uuidv4(), ...toDb(s) }))
      await sb.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      const { data, error } = await sb.from('products').insert(docs).select()
      if (error) throw error
      return json({ inserted: data.length })
    }

    return json({ error: 'Not found' }, 404)
  } catch (e) {
    console.error('POST error', e)
    return json({ error: e.message }, 500)
  }
}

export async function PUT(request, { params }) {
  try {
    const segs = params?.path || []
    const sb = supabaseAdmin

    if (segs[0] === 'settings') {
      const body = await request.json()
      const customFields = Array.isArray(body.customFields)
        ? body.customFields.map(f => ({
            key: String(f.key || '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
            label: String(f.label || '').trim(),
            type: ['text', 'number', 'date'].includes(f.type) ? f.type : 'text'
          })).filter(f => f.key && f.label)
        : []
      const row = {
        id: 'kitchen',
        kitchen_name: body.kitchenName || '',
        kitchen_type: body.kitchenType || '',
        onboarded: body.onboarded === true,
        custom_fields: customFields,
        invite_code: typeof body.inviteCode === 'string' ? body.inviteCode : undefined,
        alert_email: typeof body.alertEmail === 'string' ? body.alertEmail : undefined,
        tagline: typeof body.tagline === 'string' ? body.tagline : undefined,
        dashboard_widgets: Array.isArray(body.dashboardWidgets) ? body.dashboardWidgets : undefined,
        updated_at: new Date().toISOString(),
      }
      // remove undefined keys
      Object.keys(row).forEach(k => row[k] === undefined && delete row[k])
      const { data, error } = await sb.from('settings').upsert(row, { onConflict: 'id' }).select().single()
      if (error) throw error
      return json({
        id: data.id,
        kitchenName: data.kitchen_name || '',
        kitchenType: data.kitchen_type || '',
        onboarded: data.onboarded === true,
        customFields: data.custom_fields || [],
        inviteCode: data.invite_code || '',
        alertEmail: data.alert_email || '',
        tagline: data.tagline || '',
        dashboardWidgets: Array.isArray(data.dashboard_widgets) ? data.dashboard_widgets : ['search','expiry_alerts','all_items','expiring','expired','critical','urgent_list'],
      })
    }

    if (segs[0] === 'products' && segs[1]) {
      const id = segs[1]
      const body = await request.json()
      const { data, error } = await sb.from('products').update(toDb(body)).eq('id', id).select().single()
      if (error) throw error
      return json(enrich(fromDb(data)))
    }
    return json({ error: 'Not found' }, 404)
  } catch (e) {
    console.error('PUT error', e)
    return json({ error: e.message }, 500)
  }
}

export async function DELETE(request, { params }) {
  try {
    const segs = params?.path || []
    const sb = supabaseAdmin
    if (segs[0] === 'products' && segs[1]) {
      const { error } = await sb.from('products').delete().eq('id', segs[1])
      if (error) throw error
      return json({ ok: true })
    }
    if (segs[0] === 'recipes' && segs[1]) {
      const { error } = await sb.from('recipes').delete().eq('id', segs[1])
      if (error) throw error
      return json({ ok: true })
    }
    return json({ error: 'Not found' }, 404)
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
