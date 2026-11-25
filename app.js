/* =====================================================================
   app.js — Okuyorum ana mantık
   Bölümler:
     1) Ayarlar ve durum (localStorage)
     2) Yardımcılar (metin temizleme, Levenshtein, hece bölme)
     3) Havuz oluşturma (seçili harflere göre hece/kelime/cümle)
     4) Ekran gösterimi ve seslendirme (speechSynthesis)
     5) Kontrol modu 1: Web Speech API (anahtarsız)
     6) Kontrol modu 2: Gemini (yapay zekâ)
     7) Sonuç, konfeti, harf seçici, ebeveyn paneli, PWA
   ===================================================================== */
"use strict";

/* ---------- 1) AYARLAR VE DURUM ---------- */
const GEMINI_MODEL = "gemini-2.5-flash";   // Model adı değişirse sadece burayı güncelleyin
const MAX_RECORD_MS = 6000;                // Yapay zekâ modunda en fazla kayıt süresi
const PASS_RATIO = 0.75;                   // Levenshtein benzerlik eşiği
const ROUND_SIZE = 10;                     // Her 10 doğru cevap = 1 tur

const LS = {
  state: "okuyorum.state",
  key: "okuyorum.geminiKey",
  order: "okuyorum.letterOrder"
};
const $ = (id) => document.getElementById(id);

// Kalıcı durum: puan, seçili harf sayısı, seviye, seviye başına doğru sayısı
let state = Object.assign(
  { score: 0, letterCount: 0, level: 1, correct: { 1: 0, 2: 0, 3: 0 } },
  safeParse(localStorage.getItem(LS.state))
);
function saveState() { localStorage.setItem(LS.state, JSON.stringify(state)); }
function safeParse(s) { try { return JSON.parse(s) || {}; } catch (e) { return {}; } }

// Harf sırası: ebeveynin kaydettiği varsa o, yoksa words.js'teki varsayılan
function getOrder() {
  const saved = localStorage.getItem(LS.order);
  if (saved) {
    const arr = parseOrder(saved);
    if (arr.length) return arr;
  }
  return LETTER_ORDER;
}
// "e l a, k" → ["E","L","A","K"]  (Türkçe büyük harf, tekrarsız)
function parseOrder(text) {
  const out = [];
  for (const ch of text.toLocaleUpperCase("tr-TR")) {
    if (/[A-ZÇĞİÖŞÜ]/.test(ch) && !out.includes(ch)) out.push(ch);
  }
  return out;
}

let order = getOrder();
let current = null;        // Şu an ekrandaki öğe {text, emoji, kind}
let recentIds = [];        // Tekrarı azaltmak için son gösterilenler
let busy = false;          // Kayıt/değerlendirme sürerken true

/* ---------- 2) YARDIMCILAR ---------- */

// Karşılaştırma için: Türkçe küçük harf + noktalama/boşluk temizliği
function clean(s) {
  return s.toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşüâîû]/g, "");
}

// Levenshtein benzerliği (0..1)
function similarity(a, b) {
  const d = editMatrix(a, b);
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length, 1);
}
function editMatrix(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m;
}

// Hedefte hangi sesin (harfin) atlandığını/yanlış söylendiğini bulur.
// Düzenleme matrisinde geri izleme yaparak hedef harflerden ilk hatalıyı döndürür.
function findMissingLetter(target, heard) {
  const m = editMatrix(target, heard);
  let i = target.length, j = heard.length;
  const bad = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && m[i][j] === m[i - 1][j - 1] + (target[i - 1] === heard[j - 1] ? 0 : 1)) {
      if (target[i - 1] !== heard[j - 1]) bad.push(i - 1);   // yanlış söylenen harf
      i--; j--;
    } else if (i > 0 && m[i][j] === m[i - 1][j] + 1) {
      bad.push(i - 1); i--;                                    // atlanan harf
    } else { j--; }                                            // fazladan söylenen
  }
  if (!bad.length) return null;
  return target[Math.min(...bad)].toLocaleUpperCase("tr-TR");
}

// Türkçe hece bölme (hece sayısı = ünlü sayısı)
function syllabify(word) {
  const chars = [...word];
  const v = [];
  chars.forEach((c, i) => { if (VOWELS.includes(c)) v.push(i); });
  if (v.length < 2) return [word];
  const cuts = [];
  for (let k = 0; k < v.length - 1; k++) {
    const gap = v[k + 1] - v[k] - 1;            // iki ünlü arasındaki ünsüz sayısı
    cuts.push(gap === 0 ? v[k + 1] : gap === 1 ? v[k + 1] - 1 : v[k] + 2);
  }
  const parts = [];
  let start = 0;
  for (const c of cuts) { parts.push(chars.slice(start, c).join("")); start = c; }
  parts.push(chars.slice(start).join(""));
  return parts;
}

/* ---------- 3) HAVUZ OLUŞTURMA ---------- */

function selectedLetters() { return new Set(order.slice(0, state.letterCount)); }

// Metin yalnızca seçili harflerden mi oluşuyor? (boşluk/noktalama yok sayılır)
function usesOnly(text, set) {
  for (const ch of text) {
    if (/[A-ZÇĞİÖŞÜ]/.test(ch) && !set.has(ch)) return false;
  }
  return true;
}

// Seçili harflerle hece üret: ünsüz+ünlü (KA) ve ünlü+ünsüz (AK)
function buildSyllables(set) {
  const vs = [...set].filter((l) => VOWELS.includes(l));
  const cs = [...set].filter((l) => !VOWELS.includes(l));
  const out = [];
  for (const c of cs) for (const v of vs) { out.push(c + v); out.push(v + c); }
  if (!out.length) vs.forEach((v) => out.push(v));   // sadece ünlü seçiliyse harfin kendisi
  return out.map((t) => ({ text: t, emoji: "🔤", kind: "syl" }));
}

function buildPool(level) {
  const set = selectedLetters();
  if (level === 1) return buildSyllables(set);
  const seen = new Set();
  if (level === 2) {
    return WORDS.filter(([w]) => usesOnly(w, set) && !seen.has(w) && seen.add(w))
      .map(([w, e]) => ({ text: w, emoji: e, kind: "word" }));
  }
  return SENTENCES.filter(([s]) => usesOnly(s, set))
    .map(([s, e]) => ({ text: s, emoji: e, kind: "sentence" }));
}

// Rastgele seç: son öğrenilen 2 harfi içerenlere öncelik ver, son 5 öğeyi tekrar etme
function pickNext() {
  let level = state.level;
  let pool = buildPool(level);
  let note = "";
  if (!pool.length) {            // Bu harflerle içerik yoksa heceye düş
    pool = buildPool(1);
    if (level !== 1) note = "Bu harflerle henüz " + (level === 2 ? "kelime" : "cümle") +
      " yok. Hece çalışalım! 🙂";
    level = 1;
  }
  const newest = order.slice(Math.max(0, state.letterCount - 2), state.letterCount);
  const fresh = pool.filter((p) => newest.some((l) => p.text.includes(l)));
  const cands = (fresh.length && shownList.length > 0 && Math.random() < 0.6 ? fresh : pool)
    .filter((p) => !recentIds.includes(p.text));
  const list = cands.length ? cands : pool;
  const item = list[Math.floor(Math.random() * list.length)];
  recentIds.push(item.text);
  if (recentIds.length > 5) recentIds.shift();
  return { item, note };
}

/* ---------- 4) EKRAN VE SESLENDİRME ---------- */

let trVoice = null;
function loadVoice() {
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices();
  trVoice = vs.find((v) => v.lang === "tr-TR") || vs.find((v) => v.lang.startsWith("tr")) || null;
}
if ("speechSynthesis" in window) {
  loadVoice();
  speechSynthesis.onvoiceschanged = loadVoice;
}

// Metni tr-TR sesiyle oku (rate: yavaş okuma için 0.6-0.8)
function speak(text, rate = 0.8) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "tr-TR";
  u.rate = rate;
  u.pitch = 1.1;
  if (trVoice) u.voice = trVoice;
  speechSynthesis.speak(u);
}

function setMsg(text, cls = "") {
  const el = $("msg");
  el.textContent = text;
  el.className = "msg " + cls;
}

function showItem(item, note = "") {
  current = item;
  $("emoji").textContent = "";   // Görsel, doğru okuyunca gösterilir (ipucu olmasın diye)
  const w = $("word");
  w.className = "word" + (item.kind === "sentence" ? " sentence" : "");
  w.innerHTML = "";
  if (item.kind === "word") {
    // Heceleri farklı renklerle göster
    syllabify(item.text).forEach((s, i) => {
      const span = document.createElement("span");
      span.className = "s" + (i % 3);
      span.textContent = s;
      w.appendChild(span);
    });
  } else {
    w.textContent = item.text;
  }
  w.classList.remove("bounce"); void w.offsetWidth; w.classList.add("bounce");
  setMsg(note || (item.kind === "sentence" ? "Cümleyi oku!" : "Mikrofona bas ve oku!"));
}

// Gösterim geçmişi: "Önceki" düğmesi için
let shownList = [], shownPos = -1;

function nextItem() {
  stopAll();
  if (shownPos < shownList.length - 1) {            // Geri gidilmişse önce geçmişte ileri git
    shownPos++;
    showItem(shownList[shownPos]);
    return;
  }
  const { item, note } = pickNext();
  shownList.push(item);
  if (shownList.length > 50) shownList.shift();
  shownPos = shownList.length - 1;
  showItem(item, note);
}

function prevItem() {
  stopAll();
  if (shownPos > 0) { shownPos--; showItem(shownList[shownPos]); }
  else setMsg("Bu ilk kelime 🙂");
}

// Seviye seçildiğinde / yeniden başlandığında: geçmişi sıfırla, tamamen rastgele başla
function newSession() {
  shownList = []; shownPos = -1; recentIds = [];
  nextItem();
}

// Seslendirilecek metin: heceler/kelimeler küçük harfle (harf adı okunmasın diye)
function spokenText(item) {
  return item.text.toLocaleLowerCase("tr-TR");
}

function renderHeader() {
  $("score").textContent = "⭐ " + state.score;
  document.querySelectorAll(".lvl").forEach((b) =>
    b.classList.toggle("active", Number(b.dataset.level) === state.level));
  $("bar").style.width = ((state.correct[state.level] % ROUND_SIZE) / ROUND_SIZE * 100) + "%";
}

/* ---------- 5) KONTROL MODU 1: Web Speech API (anahtarsız) ---------- */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let mediaRec = null, mediaStream = null, recTimer = null;

function setRecording(on) {
  busy = on;
  const b = $("mic");
  b.classList.toggle("rec", on);
  b.textContent = on ? "⏹️ Bitir" : "🎤 Oku";
}

function stopAll() {
  if (recognition) { try { recognition.abort(); } catch (e) {} recognition = null; }
  if (mediaRec && mediaRec.state === "recording") { mediaRec.onstop = null; try { mediaRec.stop(); } catch (e) {} }
  if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
  clearTimeout(recTimer);
  mediaRec = null; mediaStream = null;
  setRecording(false);
}

function noSupportMessage() {
  setMsg("Bu tarayıcı konuşmayı anlayamıyor 😔 Lütfen Chrome kullan " +
    "ya da ebeveynine Ayarlar'dan yapay zekâ anahtarı girmesini söyle.", "try");
}

// Ses tanıma için "gevşek" biçim: tekrar eden harfleri tek say ("kaa" → "ka", "anne" → "ane")
function squeeze(s) { return s.replace(/(.)\1+/g, "$1"); }

// attempt: sessizlik olursa kullanıcıya hissettirmeden otomatik yeniden dinleme sayısı
function basicCheck(prefix = "", attempt = 0) {
  if (!SR) { noSupportMessage(); return; }
  const target = squeeze(clean(current.text));
  const r = new SR();
  recognition = r;
  r.lang = "tr-TR";
  r.maxAlternatives = 5;
  r.interimResults = true;      // Konuşurken ara sonuçları da değerlendir (daha hızlı ve toleranslı)
  r.manualStop = false;         // Çocuk "Bitir"e bastıysa true olur
  let done = false;             // Sonuç verildi mi?
  let lastHeard = "";           // Duyulan en yakın metin
  r.onstart = () => { setRecording(true); setMsg(prefix + "Dinliyorum... 👂 Şimdi oku!"); };
  r.onresult = (e) => {
    if (done) return;
    const res = e.results[e.results.length - 1];
    let accepted = false, bestSim = -1;
    for (const alt of res) {
      const heard = squeeze(clean(alt.transcript));
      if (!heard) continue;
      const s = similarity(heard, target);
      // Kısa hecelerde "içeriyor / ile başlıyor" da yeterli (ör. "kaç" → "ka")
      if (s >= PASS_RATIO || (current.kind === "syl" && heard.includes(target))) accepted = true;
      if (s > bestSim) { bestSim = s; lastHeard = heard; }
    }
    if (accepted) {               // Doğru: beklemeden sonuçlandır
      done = true;
      try { r.stop(); } catch (err) {}
      onResult(true, randomPraise());
    }
  };
  r.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      done = true;
      setMsg("Mikrofona izin vermedin 🎤 Ebeveynine söyle: adres çubuğundaki kilit simgesinden " +
        "mikrofona izin versin.", "try");
    } else if (e.error === "aborted") {
      done = true;
    }
    // "no-speech" ve diğer hatalar onend içinde ele alınır (otomatik tekrar)
  };
  r.onend = () => {
    setRecording(false);
    recognition = null;
    if (done) return;
    done = true;
    if (lastHeard) { onResult(false, hintMessage(target, lastHeard)); return; }   // Bir şey duyuldu ama yanlış
    if (attempt < 2 && !r.manualStop) { basicCheck(prefix, attempt + 1); return; } // Sessizlik: sessizce tekrar dinle
    onResult(false, "Sesini duyamadım 🎤 Mikrofona biraz yaklaş ve yüksek sesle oku. Hazır olunca tekrar bas!");
  };
  try { r.start(); } catch (e) { setRecording(false); }
}

// Yanlış okuma için nazik ipucu: hangi ses eksik?
function hintMessage(target, heard) {
  if (!heard) return "Seni duyamadım. Bir daha dene! 🙂";
  const letter = findMissingLetter(target, heard);
  if (letter) {
    return `Çok yaklaştın! "${letter}" sesini biraz daha net söyle. Haydi bir daha! 💪`;
  }
  return "Neredeyse oldu! Bir daha deneyelim! 💪";
}

const PRAISES = ["Harika! Doğru okudun!", "Bravo sana!", "Çok güzel okudun!", "Süpersin!", "Aferin sana!"];
function randomPraise() { return PRAISES[Math.floor(Math.random() * PRAISES.length)] + " 🎉"; }

/* ---------- 6) KONTROL MODU 2: Gemini (yapay zekâ) ---------- */

async function aiCheck(key) {
  // Zaten kayıt varsa erken bitir
  if (mediaRec && mediaRec.state === "recording") { mediaRec.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    SR ? basicCheck() : noSupportMessage();
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    setMsg("Mikrofona izin vermedin 🎤 Ebeveynine söyle: adres çubuğundaki kilit simgesinden " +
      "mikrofona izin versin.", "try");
    return;
  }
  const chunks = [];
  mediaRec = new MediaRecorder(mediaStream);
  mediaRec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mediaRec.onstart = () => {
    setRecording(true);
    setMsg("Dinliyorum... 👂 (bitirince ⏹️ düğmesine bas)");
    recTimer = setTimeout(() => { if (mediaRec && mediaRec.state === "recording") mediaRec.stop(); }, MAX_RECORD_MS);
  };
  mediaRec.onstop = async () => {
    clearTimeout(recTimer);
    const type = mediaRec.mimeType;
    mediaStream.getTracks().forEach((t) => t.stop());
    setRecording(false);
    setMsg("Düşünüyorum... 🤔");
    busy = true;
    try {
      const blob = new Blob(chunks, { type });
      const audio = await toGeminiAudio(blob);          // WAV'a çevir (en uyumlu biçim)
      const out = await askGemini(key, current.text, audio);
      busy = false;
      onResult(!!out.dogru, out.mesaj || (out.dogru ? randomPraise() : "Bir daha dene! 🙂"));
    } catch (err) {
      // Hata olursa anahtarsız moda düş
      console.error("Gemini hatası:", err);
      busy = false;
      if (SR) basicCheck("Yapay zekâya ulaşamadım, tarayıcı ile deniyorum. ");
      else setMsg("Yapay zekâya ulaşılamadı 😔 Biraz sonra tekrar dene.", "try");
    }
  };
  mediaRec.start();
}

// Kaydı 16 kHz mono 16-bit WAV'a çevirir; olmazsa ham kaydı döndürür.
async function toGeminiAudio(blob) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    const src = buf.getChannelData(0);
    const ratio = buf.sampleRate / 16000;
    const len = Math.floor(src.length / ratio);
    const pcm = new Int16Array(len);
    for (let i = 0; i < len; i++) {
      const s = Math.max(-1, Math.min(1, src[Math.floor(i * ratio)]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const wav = new ArrayBuffer(44 + pcm.length * 2);
    const dv = new DataView(wav);
    const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF"); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 16000, true); dv.setUint32(28, 32000, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    w(36, "data"); dv.setUint32(40, pcm.length * 2, true);
    new Int16Array(wav, 44).set(pcm);
    return { mime: "audio/wav", b64: await blobToBase64(new Blob([wav], { type: "audio/wav" })) };
  } catch (e) {
    return { mime: blob.type.split(";")[0] || "audio/webm", b64: await blobToBase64(blob) };
  }
}
function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const f = new FileReader();
    f.onload = () => res(String(f.result).split(",")[1]);
    f.onerror = rej;
    f.readAsDataURL(blob);
  });
}

// Gemini'ye ses + istem gönder, {"dogru":bool,"mesaj":"..."} bekle
async function askGemini(key, target, audio) {
  const prompt =
    `Sen okumayı yeni öğrenen, 6-8 yaş arası bir Türk çocuğa yardım eden sevimli ve sabırlı bir öğretmensin. ` +
    `Çocuğun okuması gereken metin: "${target}". Ekteki ses kaydını dinle. ` +
    `Çocuk heceleyerek (ör. "ka-le"), yavaş veya hafif hatalı telaffuzla okuyabilir; bu normaldir. ` +
    `Metin büyük ölçüde doğru okunduysa "dogru": true de ve kısa bir tebrik yaz. ` +
    `Yanlışsa veya sessizse "dogru": false de; hangi sesin (harfin) eksik ya da farklı olduğunu nazikçe, ` +
    `moral bozmadan söyle ve tekrar denemesini teşvik et. "mesaj" en fazla 2 kısa Türkçe cümle olsun. ` +
    `Sadece şu JSON biçiminde yanıt ver: {"dogru": true veya false, "mesaj": "..."}`;
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: audio.mime, data: audio.b64 } }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 }
      })
    }
  );
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const data = await resp.json();
  const text = data.candidates[0].content.parts.map((p) => p.text || "").join("");
  return JSON.parse(text);
}

/* ---------- 7) SONUÇ, KONFETİ, HARF SEÇİCİ, EBEVEYN, PWA ---------- */

function onResult(ok, msg) {
  setMsg(msg, ok ? "good" : "try");
  speak(msg.replace(/[^\p{L}\p{N}\s.,!?'"-]/gu, ""), 0.9);
  if (!ok) return;
  $("emoji").textContent = current.kind === "syl" ? "🌟" : current.emoji;   // Ödül olarak görseli göster
  state.score += 1;
  state.correct[state.level] = (state.correct[state.level] || 0) + 1;
  saveState();
  renderHeader();
  burstConfetti();
  if (state.correct[state.level] % ROUND_SIZE === 0) {
    setTimeout(() => setMsg("🏆 Tur tamam! 10 doğru yaptın! Üstteki seviyelerden yenisini deneyebilirsin.", "good"), 1800);
  }
}

// --- Konfeti (basit canvas parçacıkları) ---
const canvas = $("confetti");
const g = canvas.getContext("2d");
let parts = [], anim = null;
function resizeCanvas() { canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener("resize", resizeCanvas); resizeCanvas();
function burstConfetti() {
  const colors = ["#ff7a59", "#ffd84d", "#2ea44f", "#3b82f6", "#a855f7", "#e11d48"];
  for (let i = 0; i < 140; i++) {
    parts.push({
      x: innerWidth / 2, y: innerHeight / 3,
      vx: (Math.random() - 0.5) * 16, vy: Math.random() * -14 - 4,
      s: 6 + Math.random() * 8, c: colors[i % colors.length],
      r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 120 + Math.random() * 60
    });
  }
  if (!anim) anim = requestAnimationFrame(tick);
}
function tick() {
  g.clearRect(0, 0, canvas.width, canvas.height);
  parts = parts.filter((p) => p.life-- > 0);
  for (const p of parts) {
    p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.r += p.vr;
    g.save(); g.translate(p.x, p.y); g.rotate(p.r);
    g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); g.restore();
  }
  anim = parts.length ? requestAnimationFrame(tick) : null;
}

// --- Harf seçici ---
let pendingCount = state.letterCount;
function openPicker() {
  pendingCount = state.letterCount || 0;
  renderPicker();
  $("picker").hidden = false;
}
function renderPicker() {
  const grid = $("letterGrid");
  grid.innerHTML = "";
  order.forEach((l, i) => {
    const b = document.createElement("button");
    b.className = "letter" + (i < pendingCount ? " on" : "") + (i === pendingCount - 1 ? " last" : "");
    b.textContent = l;
    b.onclick = () => { pendingCount = i + 1; renderPicker(); speak(l.toLocaleLowerCase("tr-TR"), 0.7); };
    grid.appendChild(b);
  });
  $("pickerInfo").textContent = pendingCount
    ? "Seçilen harfler: " + order.slice(0, pendingCount).join(" ")
    : "Bir harfe dokun 👆";
  $("startBtn").disabled = !pendingCount;
}
$("startBtn").onclick = () => {
  if (!pendingCount) return;
  state.letterCount = pendingCount;
  saveState();
  $("picker").hidden = true;
  newSession();
};
$("lettersBtn").onclick = openPicker;

// --- Düğmeler ---
$("listen").onclick = () => current && speak(spokenText(current), current.kind === "sentence" ? 0.65 : 0.55);
$("next").onclick = nextItem;
$("prev").onclick = prevItem;
$("mic").onclick = () => {
  if (!current) return;
  // Kayıt sürüyorsa: durdur
  if (recognition) { recognition.manualStop = true; recognition.stop(); return; }
  if (mediaRec && mediaRec.state === "recording") { mediaRec.stop(); return; }
  if (busy) return;
  speechSynthesis.cancel();
  const key = localStorage.getItem(LS.key);
  key ? aiCheck(key) : basicCheck();
};
document.querySelectorAll(".lvl").forEach((b) => {
  b.onclick = () => { state.level = Number(b.dataset.level); saveState(); renderHeader(); newSession(); };
});

// --- Ebeveyn paneli ---
function renderKeyState() {
  $("keyState").textContent = localStorage.getItem(LS.key) ? "✅ Yapay zekâ modu açık" : "Anahtarsız mod";
}
$("key").value = localStorage.getItem(LS.key) || "";
$("saveKey").onclick = () => {
  const k = $("key").value.trim();
  if (k) localStorage.setItem(LS.key, k); else localStorage.removeItem(LS.key);
  renderKeyState();
};
$("clearKey").onclick = () => { localStorage.removeItem(LS.key); $("key").value = ""; renderKeyState(); };
$("order").value = order.join(" ");
$("saveOrder").onclick = () => {
  const arr = parseOrder($("order").value);
  if (!arr.length) return;
  localStorage.setItem(LS.order, arr.join(" "));
  order = arr; state.letterCount = Math.min(state.letterCount, order.length);
  saveState(); $("order").value = order.join(" ");
  openPicker();
};
$("resetOrder").onclick = () => {
  localStorage.removeItem(LS.order);
  order = LETTER_ORDER.slice(); $("order").value = order.join(" ");
  state.letterCount = Math.min(state.letterCount, order.length); saveState();
};
$("resetAll").onclick = () => {
  if (!confirm("Puan ve ilerleme silinsin mi?")) return;
  state = { score: 0, letterCount: 0, level: 1, correct: { 1: 0, 2: 0, 3: 0 } };
  saveState(); renderHeader(); openPicker();
};

// --- PWA: service worker ---
if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
}

// --- Başlangıç ---
renderHeader();
renderKeyState();
if (state.letterCount > 0 && state.letterCount <= order.length) newSession();
else { openPicker(); }
