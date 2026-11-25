/* =====================================================================
   service-worker.js — temel dosyaları önbelleğe alır (çevrimdışı çalışır).
   Dosyalarda değişiklik yaptığınızda CACHE_VERSION sayısını artırın.
   ===================================================================== */
const CACHE_VERSION = "okuyorum-v2";
const FILES = [
  "./", "./index.html", "./style.css", "./app.js", "./words.js",
  "./manifest.json", "./icon-192.png", "./icon-512.png"
];

// Kurulum: dosyaları önbelleğe ekle
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

// Etkinleştirme: eski önbellekleri sil
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// İstekler: aynı site dosyaları önce önbellekten; Gemini API gibi dış istekler ağdan.
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
