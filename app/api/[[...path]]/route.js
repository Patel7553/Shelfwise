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

      let docs = await col.find({}, { projection: { _id: 0 } }).toArray()
      docs = docs.map(enrich)

      if (status && status !== 'All') {
        docs = docs.filter(d => d._status === status)
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

export async function POST(request, { params }) {
  try {
    const path = (params?.path || []).join('/')
    const db = await getDb()
    const col = db.collection('products')

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
