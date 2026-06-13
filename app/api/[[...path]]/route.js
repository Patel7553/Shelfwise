import { NextResponse } from 'next/server'
import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'

const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME || 'shelfwise'

let cachedClient = null
async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(MONGO_URL)
    await cachedClient.connect()
  }
  return cachedClient.db(DB_NAME)
}

function json(data, status = 200) {
  return NextResponse.json(data, { status })
}

// Compute status from a product record
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

function enrich(p) {
  return { ...p, _status: computeStatus(p) }
}

export async function GET(request, { params }) {
  try {
    const path = (params?.path || []).join('/')
    const db = await getDb()
    const col = db.collection('products')

    if (path === '' || path === 'health') {
      return json({ ok: true, service: 'ShelfWise API' })
    }

    if (path === 'products') {
      const url = new URL(request.url)
      const status = url.searchParams.get('status')
      const search = url.searchParams.get('search')
      const sort = url.searchParams.get('sort') // 'asc' | 'desc'
      const category = url.searchParams.get('category')
      const storage = url.searchParams.get('storage')

      let docs = await col.find({}, { projection: { _id: 0 } }).toArray()
      docs = docs.map(enrich)

      if (status && status !== 'All') {
        docs = docs.filter(d => d._status === status)
      }
      if (category && category !== 'All') {
        docs = docs.filter(d => (d.category || '') === category)
      }
      if (storage && storage !== 'All') {
        docs = docs.filter(d => (d.storageType || '') === storage)
      }
      if (search) {
        const s = search.toLowerCase()
        docs = docs.filter(d => (d.name || '').toLowerCase().includes(s))
      }
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
      const settings = await db.collection('settings').findOne({ id: 'kitchen' }, { projection: { _id: 0 } })
      return json(settings || { id: 'kitchen', onboarded: false, kitchenName: '', kitchenType: '', customFields: [] })
    }

    if (path === 'facets') {
      const docs = await col.find({}, { projection: { _id: 0, category: 1, storageType: 1 } }).toArray()
      const categories = Array.from(new Set(docs.map(d => d.category).filter(Boolean))).sort()
      const storages = Array.from(new Set(docs.map(d => d.storageType).filter(Boolean))).sort()
      return json({ categories, storages })
    }

    if (path === 'stats') {
      const docs = (await col.find({}, { projection: { _id: 0 } }).toArray()).map(enrich)
      const stats = {
        total: docs.length,
        expiring: docs.filter(d => d._status === 'Expiring').length,
        expired: docs.filter(d => d._status === 'Expired').length,
        critical: docs.filter(d => d._status === 'Critical').length,
      }
      return json(stats)
    }

    return json({ error: 'Not found' }, 404)
  } catch (e) {
    console.error('GET error', e)
    return json({ error: e.message }, 500)
  }
}

const EMERGENT_URL = 'https://integrations.emergentagent.com/llm/v1/chat/completions'

async function scanImageForItems(base64DataUrl) {
  const key = process.env.EMERGENT_LLM_KEY
  if (!key) throw new Error('EMERGENT_LLM_KEY not set')

  const today = new Date().toISOString().slice(0, 10)
  const systemPrompt = `You are an expert kitchen inventory assistant. You read photos of handwritten kitchen logbooks, fridge whiteboards, prep lists, or product labels and extract structured inventory data.

Return ONLY a valid JSON object of the form: {"items":[ ... ]}. Each item must have:
- "name": short product name (e.g. "Whole Milk", "Chicken Breast")
- "quantity": a number (default 1 if unclear)
- "unit": one of "ea", "kg", "g", "L", "mL", "bunch", "pack", "box" (best guess)
- "expiryDate": "YYYY-MM-DD" if visible in image, else null. Today is ${today} — infer year if only day/month given.
- "category": broad category like "Dairy", "Meat", "Produce", "Seafood", "Frozen", "Dry Goods", "Pantry", "Beverage", "Other"
- "storageType": "Fridge", "Freezer", "Dry", or "Ambient" (best guess from context)
- "location": shelf/location string if visible, else ""
- "preparedBy": chef/person name if visible, else ""

Be aggressive about extracting items even from messy handwriting. Output strictly valid JSON.`

  const body = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract every inventory item visible in this image and return them as JSON.' },
          { type: 'image_url', image_url: { url: base64DataUrl } }
        ]
      }
    ],
    temperature: 0,
    response_format: { type: 'json_object' }
  }

  const res = await fetch(EMERGENT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Vision API ${res.status}: ${txt.slice(0, 300)}`)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || '{}'
  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    // try to extract JSON substring
    const m = content.match(/\{[\s\S]*\}/)
    parsed = m ? JSON.parse(m[0]) : { items: [] }
  }
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

async function scanRecipe({ image, text }) {
  const key = process.env.EMERGENT_LLM_KEY
  if (!key) throw new Error('EMERGENT_LLM_KEY not set')

  const systemPrompt = `You are an expert culinary assistant. You analyze recipes and extract structured data.

Return ONLY a valid JSON object of the form:
{
  "title": "recipe title or null",
  "servings": "servings string or null",
  "ingredients": [
    { "name": "short ingredient name", "quantity": number, "unit": "string", "notes": "string" }
  ],
  "allergens": ["gluten","dairy","nuts","eggs","soy","shellfish","fish","sesame","peanuts","mustard","celery","sulfites"],
  "steps": ["step 1", "step 2", ...]
}

Rules:
- Ingredient "name" should be normalized and short (e.g. "milk", "flour", "chicken breast", "olive oil").
- "quantity" is a number, default 1 if unclear.
- "unit" examples: "g","kg","mL","L","tsp","tbsp","cup","ea","pinch","clove".
- "notes" for prep notes like "chopped", "softened", or "" if none.
- "allergens" is the list of common allergen categories present in this recipe based on its ingredients. Use only the lowercase enums above.
- "steps" is a concise list of cooking steps. Up to 10 steps.
- Output strictly valid JSON. No commentary.`

  const userContent = image
    ? [
        { type: 'text', text: 'Analyze this recipe image and extract the structured data as specified.' },
        { type: 'image_url', image_url: { url: image } }
      ]
    : [{ type: 'text', text: `Analyze this recipe text and extract the structured data:\n\n${text}` }]

  const body = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
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
  catch {
    const m = content.match(/\{[\s\S]*\}/)
    parsed = m ? JSON.parse(m[0]) : {}
  }
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
  // exact match on name (case insensitive)
  let match = products.find(p => (p.name || '').toLowerCase() === n)
  if (match) return match
  // substring either way (e.g. "milk" matches "Whole Milk")
  match = products.find(p => {
    const pn = (p.name || '').toLowerCase()
    return pn.includes(n) || n.includes(pn)
  })
  return match || null
}

export async function POST(request, { params }) {
  try {
    const path = (params?.path || []).join('/')
    const db = await getDb()
    const col = db.collection('products')

    if (path === 'recipe') {
      const body = await request.json()
      const image = body.image
      const text = body.text
      if (!image && !text) return json({ error: 'image or text required' }, 400)
      if (image && !image.startsWith('data:image/')) return json({ error: 'invalid image data URL' }, 400)

      const recipe = await scanRecipe({ image, text })
      const products = (await col.find({}, { projection: { _id: 0 } }).toArray()).map(enrich)

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

    if (path === 'scan') {
      const body = await request.json()
      const image = body.image // expected: data URL "data:image/...;base64,..."
      if (!image || !image.startsWith('data:image/')) {
        return json({ error: 'Invalid or missing image (data URL required)' }, 400)
      }
      const items = await scanImageForItems(image)
      return json({ items })
    }

    if (path === 'products/bulk') {
      const body = await request.json()
      const itemsIn = Array.isArray(body.items) ? body.items : []
      const now = new Date().toISOString()
      const docs = itemsIn.map(b => ({
        id: uuidv4(),
        name: b.name || '',
        quantity: Number(b.quantity) || 0,
        unit: b.unit || 'ea',
        expiryDate: b.expiryDate || null,
        category: b.category || '',
        storageType: b.storageType || 'Fridge',
        location: b.location || '',
        preparedBy: b.preparedBy || '',
        imageUrl: '',
        createdAt: now,
        updatedAt: now,
      })).filter(d => d.name)
      if (docs.length) await col.insertMany(docs)
      return json({ inserted: docs.length, items: docs.map(enrich) }, 201)
    }

    if (path === 'products') {
      const body = await request.json()
      const now = new Date().toISOString()
      const doc = {
        id: uuidv4(),
        name: body.name || '',
        quantity: Number(body.quantity) || 0,
        unit: body.unit || 'ea',
        expiryDate: body.expiryDate || null,
        category: body.category || '',
        storageType: body.storageType || 'Fridge',
        location: body.location || '',
        preparedBy: body.preparedBy || '',
        imageUrl: body.imageUrl || '',
        customFields: body.customFields && typeof body.customFields === 'object' ? body.customFields : {},
        createdAt: now,
        updatedAt: now,
      }
      await col.insertOne(doc)
      return json(enrich(doc), 201)
    }

    if (path === 'seed') {
      // helpful seed for first-time demo
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
      const now = new Date().toISOString()
      const docs = sample.map(s => ({ id: uuidv4(), ...s, imageUrl: '', createdAt: now, updatedAt: now }))
      await col.deleteMany({})
      await col.insertMany(docs)
      return json({ inserted: docs.length })
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
    const db = await getDb()
    const col = db.collection('products')

    if (segs[0] === 'settings') {
      const body = await request.json()
      const doc = {
        id: 'kitchen',
        kitchenName: body.kitchenName || '',
        kitchenType: body.kitchenType || '',
        onboarded: body.onboarded === true,
        customFields: Array.isArray(body.customFields) ? body.customFields.map(f => ({
          key: String(f.key || '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
          label: String(f.label || '').trim(),
          type: ['text', 'number', 'date'].includes(f.type) ? f.type : 'text'
        })).filter(f => f.key && f.label) : [],
        updatedAt: new Date().toISOString()
      }
      await db.collection('settings').updateOne({ id: 'kitchen' }, { $set: doc }, { upsert: true })
      return json(doc)
    }

    if (segs[0] === 'products' && segs[1]) {
      const id = segs[1]
      const body = await request.json()
      const update = {
        name: body.name,
        quantity: Number(body.quantity) || 0,
        unit: body.unit,
        expiryDate: body.expiryDate || null,
        category: body.category || '',
        storageType: body.storageType || 'Fridge',
        location: body.location || '',
        preparedBy: body.preparedBy || '',
        imageUrl: body.imageUrl || '',
        customFields: body.customFields && typeof body.customFields === 'object' ? body.customFields : {},
        updatedAt: new Date().toISOString(),
      }
      await col.updateOne({ id }, { $set: update })
      const doc = await col.findOne({ id }, { projection: { _id: 0 } })
      return json(enrich(doc))
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
    const db = await getDb()
    const col = db.collection('products')

    if (segs[0] === 'products' && segs[1]) {
      const id = segs[1]
      await col.deleteOne({ id })
      return json({ ok: true })
    }
    return json({ error: 'Not found' }, 404)
  } catch (e) {
    console.error('DELETE error', e)
    return json({ error: e.message }, 500)
  }
}

function addDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
