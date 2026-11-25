/* =====================================================================
   service-worker.js â€” temel dosyalarÄ± Ã¶nbelleÄŸe alÄ±r (Ã§evrimdÄ±ÅŸÄ± Ã§alÄ±ÅŸÄ±r).
   Dosyalarda deÄŸiÅŸiklik yaptÄ±ÄŸÄ±nÄ±zda CACHE_VERSION sayÄ±sÄ±nÄ± artÄ±rÄ±n.
   ===================================================================== */
const CACHE_VERSION = "okuyorum-v7";
const FILES = [
  "./", "./index.html", "./style.css", "./app.js", "./words.js",
  "./manifest.json", "./icon-192.png", "./icon-512.png"
];

// Kurulum: dosyalarÄ± Ã¶nbelleÄŸe ekle
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

// EtkinleÅŸtirme: eski Ã¶nbellekleri sil
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Ä°stekler: aynÄ± site dosyalarÄ± Ã¶nce Ã¶nbellekten; Gemini API gibi dÄ±ÅŸ istekler aÄŸdan.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
