// Makes the deck cross-origin isolated on a host that cannot send headers (GitHub Pages): this service worker adds
// `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` to the deck's own
// documents and worker scripts (an isolated page starts a worker only if its script has an embedder policy too).
// Isolation gives the page SharedArrayBuffer, which unkernel needs to run the guest on several CPUs
// (runtime/kernel.ts, runtime/kernel-worker.ts). unkernel.dev sends the same two headers from its server.
//
// `require-corp` is the policy Chrome, Firefox and Safari all support. Every cross-origin resource the deck loads
// passes it: the Google Fonts stylesheet and font files and the favicon send `Cross-Origin-Resource-Policy:
// cross-origin`, and the botmux video (components/WebVideo.vue) is a CORS request. The deck embeds no iframe, which
// a host that does not opt in could not fill under this policy.
//
// runtime/isolate-page.js, inlined at the top of a build's index.html, registers it, reloads the first visit once it
// is active, and unregisters any other registration of the deck. A changed file replaces the running version at once
// (skipWaiting, clients.claim), so no page keeps an old one. The dev server sends the same headers itself.
// Ref: https://web.dev/articles/coop-coep, https://developer.chrome.com/docs/web-platform/service-worker-static-routing

self.addEventListener('install', (event) => {
  // Only documents and worker scripts need the headers: they are `navigate` and `same-origin` requests. The others, the
  // page's fetches, scripts, styles, images and fonts (`cors`, `no-cors`), go to the network without waking this worker
  // (ServiceWorker static routing, Chrome 123+); elsewhere the fetch handler below passes them through.
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
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }))
})
