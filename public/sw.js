/* ShelfWise service worker — Web Push + notification clicks */
/* Keep this file tiny: no precaching (Next.js handles its own assets). */

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'ShelfWise', body: event.data ? event.data.text() : '' } }
  const title = data.title || 'ShelfWise'
  // BUG FIX (Aug 2026): all notifications used to share tag 'shelfwise' with
  // renotify:false — every new push silently REPLACED the one sitting in the
  // tray, so after the first unread alert it looked like notifications had
  // "stopped". Each push now gets a unique tag (unless the server sets one on
  // purpose) and renotify is on, so every alert always shows + sounds.
  const options = {
    body: data.body || '',
    icon: '/icon-192-v3.png',
    badge: '/icon-192-v3.png',
    tag: data.tag || ('shelfwise-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)),
    renotify: true,
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Browsers occasionally ROTATE/EXPIRE push subscriptions. Without this
// handler the old subscription goes stale and pushes silently stop until the
// app is reopened. Re-subscribe immediately and tell the server to swap the
// endpoint on the existing registration (matched by old endpoint — no login
// context exists inside a service worker).
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const oldEndpoint = (event.oldSubscription && event.oldSubscription.endpoint) || null
      const appServerKey = (event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey) || undefined
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey })
      await fetch('/api/push/resubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldEndpoint, subscription: sub.toJSON() }),
      })
    } catch (e) { /* best-effort — the in-app keepalive will also repair it */ }
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) { client.navigate(url); return client.focus() }
      }
      return self.clients.openWindow(url)
    })
  )
})
