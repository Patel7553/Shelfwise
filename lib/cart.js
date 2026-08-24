'use client'

// Persistent shopping cart (shopping-app checkout pattern, Aug 2026).
// Stored in localStorage so it survives navigation and reloads.
// Cart lines reference SUPPLIER CATALOG productIds — prices are never stored
// here; every screen re-reads live catalog prices (single source of truth)
// and the order endpoint recomputes prices server-side at checkout.

const KEY = 'sw_cart_v1'

export function getCart() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(c) ? c : []
  } catch { return [] }
}

export function setCart(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items || [])) } catch {}
  try { window.dispatchEvent(new Event('sw-cart-changed')) } catch {}
}

export function cartLineCount() {
  return getCart().length
}

export function addToCart(entry) {
  // entry: { supplierId, supplierName, productId, name, unit, qty }
  if (!entry || !entry.supplierId || !entry.productId) return
  const c = getCart()
  const ex = c.find(i => i.productId === entry.productId && i.supplierId === entry.supplierId)
  if (ex) ex.qty = Math.min(9999, (Number(ex.qty) || 0) + (Number(entry.qty) || 1))
  else c.push({ supplierId: entry.supplierId, supplierName: entry.supplierName || '', productId: entry.productId, name: entry.name || '', unit: entry.unit || '', qty: Math.max(1, Number(entry.qty) || 1) })
  setCart(c)
}

export function updateCartQty(supplierId, productId, qty) {
  const q = Math.max(0, Math.min(9999, Number(qty) || 0))
  const c = getCart()
    .map(i => (i.supplierId === supplierId && i.productId === productId ? { ...i, qty: q } : i))
    .filter(i => (Number(i.qty) || 0) > 0)
  setCart(c)
}

export function removeFromCart(supplierId, productId) {
  setCart(getCart().filter(i => !(i.supplierId === supplierId && i.productId === productId)))
}

export function clearSupplierFromCart(supplierId) {
  setCart(getCart().filter(i => i.supplierId !== supplierId))
}

export function clearCart() { setCart([]) }
