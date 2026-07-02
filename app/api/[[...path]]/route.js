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
    customFields: cf,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toDb(body) {
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
    customFields: Array.isArray(k.custom_fields) ? k.custom_fields : [],
    categories: Array.isArray(k.categories) ? k.categories : [],
    locations: Array.isArray(k.locations) ? k.locations : [],
    units: Array.isArray(k.units) ? k.units : [],
    onboarded: k.onboarded === true,
    alertEmail: k.alert_email || '',
    tagline: k.tagline || 'From shelf to plate — never lose track.',
    createdAt: k.created_at,
    approvedAt: k.approved_at,
  }
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

async function parseTextForItems(text) {
  const key = process.env.EMERGENT_LLM_KEY
  if (!key) throw new Error('EMERGENT_LLM_KEY not set')
  const today = new Date().toISOString().slice(0, 10)
  const systemPrompt = `Convert spoken kitchen inventory notes into structured items. Today is ${today}.
Return ONLY {"items":[{"name","quantity","unit","expiryDate","category","storageType","location"}]}.`
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
  const systemPrompt = `You are a recipe parser. Extract structured recipe data.
Return ONLY {"title","servings","ingredients":[{"name","quantity","unit","notes"}],"allergens":[]}.`

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

    // ----- OWNER / CHEF endpoints (kitchen-scoped) -----
    const ownerOrChef = ['products','settings','facets','stats','recipes'].some(p => path === p || path.startsWith(p + '/'))
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
        const [{ count: total }, { count: expired }, { count: expiring }, { count: critical }] = await Promise.all([
          sb.from('products').select('*', { count: 'exact', head: true }).eq('kitchen_id', kid),
          sb.from('products').select('*', { count: 'exact', head: true }).eq('kitchen_id', kid).not('expiry_date', 'is', null).lt('expiry_date', todayISO),
          sb.from('products').select('*', { count: 'exact', head: true }).eq('kitchen_id', kid).not('expiry_date', 'is', null).gte('expiry_date', todayISO).lte('expiry_date', in7ISO),
          sb.from('products').select('*', { count: 'exact', head: true }).eq('kitchen_id', kid).lte('quantity', 2).or(`expiry_date.is.null,expiry_date.gt.${in7ISO}`),
        ])
        return json({ total: total || 0, expired: expired || 0, expiring: expiring || 0, critical: critical || 0 })
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
      // Body: { email, password, kitchenName, kitchenType, timezone }
      const body = await request.json()
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      const kitchenName = String(body.kitchenName || '').trim()
      const kitchenType = String(body.kitchenType || '').trim()
      const timezone = String(body.timezone || 'Asia/Kolkata').trim()
      if (!email || !password || !kitchenName) {
        return json({ error: 'email, password and kitchenName are required' }, 400)
      }
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)

      // 1) Create Supabase auth user (email confirmed = true so they can log in immediately;
      //    the manual approval step is what actually gates access to the app).
      const { data: created, error: authErr } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { kitchen_name: kitchenName },
      })
      if (authErr) return json({ error: authErr.message || 'Sign-up failed' }, 400)

      // 2) Create the kitchen row (status = pending).
      const kitchenId = uuidv4()
      const { error: kErr } = await sb.from('kitchens').insert({
        id: kitchenId,
        owner_id: created.user.id,
        owner_email: email,
        kitchen_name: kitchenName,
        kitchen_type: kitchenType,
        timezone,
        status: 'pending',
        code_seed: newCodeSeed(),
        dashboard_widgets: [],       // blank slate — chef picks during setup
        categories: [],
        locations: [],
        units: [],
        onboarded: false,
      })
      if (kErr) {
        // Roll back auth user
        try { await sb.auth.admin.deleteUser(created.user.id) } catch {}
        return json({ error: kErr.message }, 500)
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
    if (path === 'scan' || path === 'parse-voice' || path === 'recipe-instructions') {
      const { ctx, error } = await requireAuth(request)
      if (error) return error
      const body = await request.json()

      if (path === 'scan') {
        if (!body.image || !body.image.startsWith('data:image/')) return json({ error: 'Invalid or missing image' }, 400)
        const items = await scanImageForItems(body.image)
        return json({ items })
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

        const systemPrompt = `You are a professional chef. Generate clear, step-by-step COOKING INSTRUCTIONS for the recipe below.
Return ONLY {"instructions":[...],"source":"..."}. 6-12 steps, each 12-30 words, mention temps & times.`
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
    const kitchenScoped = ['products','products/bulk','recipe','recipes','email/test','email/check-expiring'].some(p => path === p)
    if (kitchenScoped) {
      const { ctx, error } = await requireOwnerOrChef(request)
      if (error) return error
      const kid = ctx.kitchenId

      if (path === 'products') {
        const body = await request.json()
        let doc = { id: uuidv4(), kitchen_id: kid, ...toDb(body) }
        let { data, error } = await sb.from('products').insert(doc).select().single()
        if (error && /column .* does not exist|schema cache/i.test(error.message || '')) {
          const { custom_fields, updated_at, ...core } = doc
          const retry = await sb.from('products').insert(core).select().single()
          data = retry.data
          error = retry.error
        }
        if (error) {
          console.error('products insert failed:', error)
          throw new Error(error.message || 'Insert failed')
        }
        return json(enrich(fromDb(data)), 201)
      }

      if (path === 'products/bulk') {
        const body = await request.json()
        const itemsIn = Array.isArray(body.items) ? body.items : []
        const docs = itemsIn.filter(i => i.name).map(b => ({ id: uuidv4(), kitchen_id: kid, ...toDb(b) }))
        if (!docs.length) return json({ inserted: 0, items: [] }, 201)
        let { data, error } = await sb.from('products').insert(docs).select()
        if (error && /column .* does not exist|schema cache/i.test(error.message || '')) {
          const coreDocs = docs.map(({ custom_fields, updated_at, ...core }) => core)
          const retry = await sb.from('products').insert(coreDocs).select()
          data = retry.data
          error = retry.error
        }
        if (error) throw new Error(error.message || 'Insert failed')
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
          body: JSON.stringify({ from: 'ShelfWise Alerts <onboarding@resend.dev>', to: [to], subject, html })
        })
        if (!res.ok) {
          const txt = await res.text()
          return json({ error: `Email send failed: ${txt.slice(0, 200)}` }, 500)
        }
        const result = await res.json()
        return json({ ok: true, sent: result.id, counts: { expired: expired.length, soon: soon.length } })
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
      if (Array.isArray(body.dashboardWidgets)) patch.dashboard_widgets = body.dashboardWidgets
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
      const { data, error: e2 } = await sb.from('products').update(toDb(body)).eq('id', id).eq('kitchen_id', ctx.kitchenId).select().single()
      if (e2) throw e2
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
    return json({ error: 'Not found' }, 404)
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
