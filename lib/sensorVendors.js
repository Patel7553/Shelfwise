// ============================================================================
// SENSOR VENDOR PLUG-IN REGISTRY (server-side only)
// ----------------------------------------------------------------------------
// Each vendor is a self-contained module implementing the same tiny interface:
//
//   {
//     id: 'vendor_id',
//     name: 'Display Name',
//     comingSoon: bool,                 // shown in UI but not selectable yet
//     credentialFields: [{ key, label, placeholder, type }],
//     listSensors(credentials)  -> [{ id, name }]
//     fetchReadings(credentials, sensorIds) -> [{ sensorId, temperatureC, recordedAt }]
//   }
//
// Adding a new vendor (e.g. Kelsius) later = add ONE object to this map with
// its real API calls. Nothing else in the app changes.
// ============================================================================

// ---------------------------------------------------------------------------
// DEMO VENDOR — generates realistic readings in-process. Lets any kitchen try
// the full sensor flow end-to-end today, with zero hardware and zero cost.
// ---------------------------------------------------------------------------
const demoVendor = {
  id: 'demo',
  name: 'Demo Sensors (try it now — no hardware needed)',
  comingSoon: false,
  credentialFields: [], // none needed
  async listSensors() {
    return [
      { id: 'demo-fridge-1', name: 'Demo Fridge Sensor 1' },
      { id: 'demo-fridge-2', name: 'Demo Fridge Sensor 2' },
      { id: 'demo-freezer-1', name: 'Demo Freezer Sensor 1' },
    ]
  },
  async fetchReadings(_credentials, sensorIds) {
    const now = new Date().toISOString()
    return (sensorIds || []).map(id => {
      const isFreezer = id.includes('freezer')
      // realistic in-range temps with slight jitter (fridge 2-5°C, freezer -20..-18°C)
      const base = isFreezer ? -19 : 3.5
      const jitter = Math.round((Math.random() * 2 - 1) * 15) / 10 // ±1.5
      return { sensorId: id, temperatureC: Math.round((base + jitter) * 10) / 10, recordedAt: now }
    })
  },
}

// ---------------------------------------------------------------------------
// GENERIC REST — works with ANY vendor/middleware that can expose two simple
// authenticated endpoints (documented in Settings UI):
//   GET {baseUrl}/sensors            -> [{ "id": "...", "name": "..." }]
//   GET {baseUrl}/readings?ids=a,b   -> [{ "sensorId": "...", "temperatureC": 3.2, "recordedAt": "ISO" }]
// Both requests send:  Authorization: Bearer {apiKey}
// ---------------------------------------------------------------------------
const genericRestVendor = {
  id: 'generic_rest',
  name: 'Generic REST API (any vendor / middleware)',
  comingSoon: false,
  credentialFields: [
    { key: 'baseUrl', label: 'API Base URL', placeholder: 'https://api.yourvendor.com/v1', type: 'url' },
    { key: 'apiKey', label: 'API Key', placeholder: 'paste the key from your vendor portal', type: 'password' },
  ],
  async listSensors(credentials) {
    const baseUrl = String(credentials?.baseUrl || '').replace(/\/$/, '')
    if (!baseUrl) throw new Error('API Base URL is required')
    const res = await fetch(`${baseUrl}/sensors`, {
      headers: { Authorization: `Bearer ${credentials?.apiKey || ''}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`Vendor API error ${res.status} — check your Base URL and API key`)
    const data = await res.json()
    const list = Array.isArray(data) ? data : (Array.isArray(data?.sensors) ? data.sensors : [])
    return list.map(s => ({ id: String(s.id ?? s.sensorId ?? ''), name: String(s.name ?? s.label ?? s.id ?? 'Sensor') })).filter(s => s.id)
  },
  async fetchReadings(credentials, sensorIds) {
    const baseUrl = String(credentials?.baseUrl || '').replace(/\/$/, '')
    const res = await fetch(`${baseUrl}/readings?ids=${encodeURIComponent((sensorIds || []).join(','))}`, {
      headers: { Authorization: `Bearer ${credentials?.apiKey || ''}` },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) throw new Error(`Vendor API error ${res.status}`)
    const data = await res.json()
    const list = Array.isArray(data) ? data : (Array.isArray(data?.readings) ? data.readings : [])
    return list.map(r => ({
      sensorId: String(r.sensorId ?? r.id ?? ''),
      temperatureC: Number(r.temperatureC ?? r.temperature ?? r.temp),
      recordedAt: r.recordedAt || r.timestamp || new Date().toISOString(),
    })).filter(r => r.sensorId && Number.isFinite(r.temperatureC))
  },
}

// ---------------------------------------------------------------------------
// COMMERCIAL VENDORS — placeholders shown in the UI as "coming soon".
// When a kitchen provides real API credentials/docs, implement listSensors +
// fetchReadings here and flip comingSoon to false. NOTHING else changes.
// ---------------------------------------------------------------------------
const kelsiusVendor = {
  id: 'kelsius',
  name: 'Kelsius (FoodCheck)',
  comingSoon: true,
  credentialFields: [
    { key: 'apiKey', label: 'Kelsius API Key', placeholder: 'from your Kelsius account manager', type: 'password' },
  ],
  async listSensors() { throw new Error('Kelsius integration coming soon — contact support with your Kelsius API details.') },
  async fetchReadings() { throw new Error('Kelsius integration coming soon.') },
}

const navitasVendor = {
  id: 'navitas',
  name: 'Navitas Safety',
  comingSoon: true,
  credentialFields: [
    { key: 'apiKey', label: 'Navitas API Key', placeholder: 'from your Navitas dashboard', type: 'password' },
  ],
  async listSensors() { throw new Error('Navitas integration coming soon — contact support with your Navitas API details.') },
  async fetchReadings() { throw new Error('Navitas integration coming soon.') },
}

export const SENSOR_VENDORS = {
  [demoVendor.id]: demoVendor,
  [genericRestVendor.id]: genericRestVendor,
  [kelsiusVendor.id]: kelsiusVendor,
  [navitasVendor.id]: navitasVendor,
}

// Safe metadata for the frontend (never exposes implementation)
export function vendorCatalog() {
  return Object.values(SENSOR_VENDORS).map(v => ({
    id: v.id,
    name: v.name,
    comingSoon: !!v.comingSoon,
    credentialFields: v.credentialFields,
  }))
}
