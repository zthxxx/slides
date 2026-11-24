// Makes the deck cross-origin isolated on a host that cannot send headers (GitHub Pages): this service worker adds
// `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` to the deck's own
// documents and worker scripts (an isolated page starts a worker only if its script has an embedder policy too).
// Isolation gives the page SharedArrayBuffer, which unkernel needs to run the guest on several CPUs
// (runtime/kernel.ts, runtime/kernel-worker.ts).
//
// setup/main.ts registers it only where iframes can be `credentialless` (Chromium): under COEP, the embedded botmux
// page (components/WebFrame.vue) loads only as a credentialless iframe, since its host cannot opt in either.
// `credentialless` rather than `require-corp` keeps cross-origin subresources (Google Fonts, the favicon) loading:
// they are fetched without credentials instead of needing a Cross-Origin-Resource-Policy header.
// Ref: https://developer.chrome.com/blog/coep-credentialless-origin-trial,
// https://developer.chrome.com/docs/web-platform/service-worker-static-routing

self.addEventListener('install', (event) => {
  // Only documents and worker scripts need the headers: they are `navigate` and `same-origin` requests. The others, the
  // page's fetches, scripts, styles, images and fonts (`cors`, `no-cors`), go to the network without waking this worker
  // (ServiceWorker static routing, Chrome 123+); without that API the fetch handler below passes them through.
  if (event.addRoutes) {
    event.waitUntil(event.addRoutes(['cors', 'no-cors'].map(requestMode => ({
      condition: { requestMode },
      source: 'network',
    }))).catch(() => {}))
  }
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const { mode, destination } = event.request
  if (mode !== 'navigate' && destination !== 'worker')
    return
  event.respondWith(fetch(event.request).then((response) => {
    // A redirect (opaque) or an error has no document to isolate.
    if (response.status === 0 || !response.ok)
      return response
    const headers = new Headers(response.headers)
    headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    headers.set('Cross-Origin-Embedder-Policy', 'credentialless')
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }))
})
