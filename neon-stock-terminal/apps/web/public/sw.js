// The browser HTTP cache handles fingerprinted static assets. Operational requests
// and credentials never enter a service-worker cache.
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  const scope = self.registration.scope;
  if (!request.url.startsWith(scope)) return;
  const relative = request.url.slice(scope.length).split(/[?#]/)[0];
  if (/^(?:auth|v1|api|assets|health|watcher|option-chain)(?:\/|$)/.test(relative)) return;
  event.respondWith(fetch(request).catch(() => new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>N50 · Offline</title><style>body{font:18px/1.5 system-ui;color:#10233f;background:#eef3f9;margin:0;padding:max(12vh,env(safe-area-inset-top)) max(8vw,env(safe-area-inset-left))}main{max-width:32rem;margin:auto}a{display:inline-block;background:#10233f;color:white;padding:.65em 1em;border-radius:.5em}</style><main><b>N50</b><h1>Connection unavailable</h1><p>Reconnect to load current market data and your workspace.</p><a href="">Try again</a></main></html>',
    {status: 503, headers: {"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"}}
  )));
});
