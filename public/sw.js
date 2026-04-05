/**
 * JARVIS Service Worker — PWA Offline Engine
 *
 * Makes the app:
 *   1. Installable on any device (Android, iOS, desktop)
 *   2. Work offline (core UI loads even without internet)
 *   3. Receive push notifications when backgrounded
 *   4. Update silently in the background
 *
 * Cache Strategy:
 *   - App Shell (HTML/JS/CSS): Cache First → instant loads
 *   - API calls to Gemini/OpenAI: Network First → fresh results
 *   - Static assets: Cache First → fast
 */

const CACHE_NAME = 'jarvis-v1'
const APP_SHELL = [
  '/',
  '/index.html',
  '/favicon.ico',
]

// ── Install: Cache the app shell ───────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

// ── Activate: Clean old caches ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch: Cache-first for shell, network-first for API ───────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET and chrome-extension requests
  if (event.request.method !== 'GET') return
  if (url.protocol === 'chrome-extension:') return

  // API calls: always network first
  if (url.hostname.includes('googleapis') ||
      url.hostname.includes('openai') ||
      url.hostname.includes('telegram') ||
      url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
    return
  }

  // App shell: cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached
      return fetch(event.request).then(response => {
        // Cache successful responses
        if (response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      })
    })
  )
})

// ── Push Notifications ─────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? { title: 'JARVIS', body: 'New message' }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'jarvis-notification',
      renotify: true,
      data: data.url,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length > 0) return clients[0].focus()
      return self.clients.openWindow('/')
    })
  )
})
