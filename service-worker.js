/* =====================================================================
   service-worker.js — temel dosyaları önbelleğe alır (çevrimdışı çalışır).
   Dosyalarda değişiklik yaptığınızda CACHE_VERSION sayısını artırın.
   ===================================================================== */
const CACHE_VERSION = "okuyorum-v24";
const FILES = [
  "./", "./index.html", "./style.css", "./words.js", "./cloud.js", "./app.js",
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

// İstekler: AĞ ÖNCELİKLİ — internet varsa hep en yeni dosya gelir,
// internet yoksa önbellekten çalışır. Sadece geçerli temel yanıtlar önbelleklenir.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: "no-cache" }).then((res) => {
      if (res && res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});
