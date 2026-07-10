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
  const options = {
    body: data.body || '',
    icon: '/icon-192-v3.png',
    badge: '/icon-192-v3.png',
    tag: data.tag || 'shelfwise',
    renotify: !!data.renotify,
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
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
