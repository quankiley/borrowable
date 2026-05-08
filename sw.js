// Borrowable — minimal service worker for offline shell + add-to-home-screen.
// Caches the static shell so the app opens even without a connection. All
// Supabase API calls hit the network, so when you're offline you'll see your
// last loaded data but writes will fail (expected).

const CACHE = 'borrowable-shell-v3'
const SHELL = [
  './',
  './index.html',
  './app.js',
  './icon.svg',
  './manifest.json',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './favicon-32.png',
  './favicon-16.png',
]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // Don't touch supabase / esm.sh / fonts — let them go to the network.
  if (url.origin !== location.origin) return
  if (e.request.method !== 'GET') return
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit
      return fetch(e.request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('./index.html'))
    })
  )
})
