/* =====================================================================
   app.js — Okuyorum ana mantık
   Bölümler:
     1) Ayarlar ve durum (localStorage)
     2) Yardımcılar (metin temizleme, sayı çevirme, Levenshtein, hece bölme)
     3) Havuz oluşturma (seçili harflere göre hece/kelime/cümle)
     4) Ekran gösterimi ve seslendirme (speechSynthesis)
     5) Kontrol modu 1: Web Speech API (anahtarsız)
     6) Kontrol modu 2: Gemini (yapay zekâ)
     7) Sonuç, konfeti, harf seçici, ebeveyn paneli, kısayollar, PWA
   ===================================================================== */
"use strict";

/* ---------- 1) AYARLAR VE DURUM ---------- */
const APP_VERSION = "v18";
const GEMINI_TIMEOUT_MS = 10000;
const DISCOVER_TIMEOUT_MS = 8000;
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-3-flash-preview",
  "gemini-3.8-flash",
  "gemini-2.5-flash-lite"
];
const MAX_RECORD_MS = 6000;
const PASS_RATIO = 0.75;
const ROUND_SIZE = 10;

const LS = {
  state: "okuyorum.state",
  key: "okuyorum.geminiKey",
  model: "okuyorum.geminiModel",
  order: "okuyorum.letterOrder",
  speechRate: "okuyorum.speechRate"
};
const $ = (id) => document.getElementById(id);

function lsGet(k) {
  try { return localStorage.getItem(k); } catch (e) { return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); } catch (e) {}
}
function lsDel(k) {
  try { localStorage.removeItem(k); } catch (e) {}
}
function safeParse(s) {
  try { return JSON.parse(s) || {}; } catch (e) { return {}; }
}

function loadState() {
  const raw = safeParse(lsGet(LS.state));
  const c = raw.correct && typeof raw.correct === "object" ? raw.correct : {};
  return {
    score: Math.max(0, Number(raw.score) || 0),
    letterCount: Math.max(0, Number(raw.letterCount) || 0),
    level: [1, 2, 3].includes(Number(raw.level)) ? Number(raw.level) : 1,
    correct: {
      1: Math.max(0, Number(c[1]) || 0),
      2: Math.max(0, Number(c[2]) || 0),
      3: Math.max(0, Number(c[3]) || 0)
    }
  };
}

let state = loadState();
function saveState() { lsSet(LS.state, JSON.stringify(state)); }

// Harf sırası: ebeveynin kaydettiği varsa o, yoksa words.js'teki MEB 2024 sırası
function parseOrder(text) {
  const out = [];
  for (const ch of String(text || "").toLocaleUpperCase("tr-TR")) {
    if (/[A-ZÇĞİÖŞÜ]/.test(ch) && !out.includes(ch)) out.push(ch);
  }
  return out;
}
function getOrder() {
  const saved = lsGet(LS.order);
  if (saved) {
    const arr = parseOrder(saved);
    if (arr.length) return arr;
  }
  return LETTER_ORDER.slice();
}
function isDefaultOrder() {
  return order.length === LETTER_ORDER.length && order.every((l, i) => l === LETTER_ORDER[i]);
}

let order = getOrder();
state.letterCount = Math.min(state.letterCount, order.length);
let current = null;        // Şu an ekrandaki öğe {text, emoji, kind, solved}
let recentIds = [];        // Tekrarı azaltmak için son gösterilenler
let busy = false;          // Kayıt veya API değerlendirmesi sürerken true
let activeCheckId = 0;     // Eski asenkron cevapların yeni karta yazılmasını önler
let aiAbortCtrl = null;
let roundTimer = null;

/* ---------- 2) YARDIMCILAR ---------- */

// Chrome SpeechRecognition sayıları rakam döndürebilir ("12" -> "on iki", "4" -> "dört")
const TR_ONES = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const TR_TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
function numToTr(n) {
  if (n < 10) return TR_ONES[n];
  if (n < 100) return TR_TENS[Math.floor(n / 10)] + (n % 10 ? " " + TR_ONES[n % 10] : "");
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return (h === 1 ? "yüz" : TR_ONES[h] + " yüz") + (rest ? " " + numToTr(rest) : "");
}
function digitsToTurkish(s) {
  return String(s || "").replace(/\b\d{1,3}\b/g, (m) => numToTr(Number(m)));
}

// Karşılaştırma için: sayıları yazıya çevir, Türkçe küçük harf yap, noktalama/boşluk temizle
function clean(s) {
  return digitsToTurkish(s).toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşüâîû]/g, "");
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

// Türkçe hece bölme (3 ünsüzlü kümeleri de doğru ayırır: E-LEK-TRİK, TÜRK-ÇE)
const ONSET_CLUSTERS = new Set(["TR", "PR", "PL", "KR", "KL", "BR", "BL", "FR", "FL", "GR", "DR", "ST", "SP", "SK"]);
function syllabify(word) {
  const chars = [...word];
  const v = [];
  chars.forEach((c, i) => { if (VOWELS.includes(c)) v.push(i); });
  if (v.length < 2) return [word];
  const cuts = [];
  for (let k = 0; k < v.length - 1; k++) {
    const gap = v[k + 1] - v[k] - 1;
    if (gap === 0) cuts.push(v[k + 1]);
    else if (gap === 1) cuts.push(v[k + 1] - 1);
    else if (gap === 2) cuts.push(v[k] + 2);
    else {
      const pair = chars[v[k + 1] - 2] + chars[v[k + 1] - 1];
      cuts.push(ONSET_CLUSTERS.has(pair) ? v[k + 1] - 2 : v[k + 1] - 1);
    }
  }
  const parts = [];
  let start = 0;
  for (const c of cuts) { parts.push(chars.slice(start, c).join("")); start = c; }
  parts.push(chars.slice(start).join(""));
  return parts;
}

/* ---------- 3) HAVUZ OLUŞTURMA ---------- */

function selectedLetters(count = state.letterCount) {
  return new Set(order.slice(0, count));
}

function usesOnly(text, set) {
  for (const ch of text) {
    if (/[A-ZÇĞİÖŞÜ]/.test(ch) && !set.has(ch)) return false;
  }
  return true;
}

// Seçili harflerle hece üret: ünsüz+ünlü (KA) ve ünlü+ünsüz (AK); Ğ ile başlayan hece üretilmez
function buildSyllables(set) {
  const vs = [...set].filter((l) => VOWELS.includes(l));
  const cs = [...set].filter((l) => !VOWELS.includes(l));
  const out = [];
  for (const c of cs) {
    for (const v of vs) {
      if (c !== "Ğ") out.push(c + v);
      out.push(v + c);
    }
  }
  if (!out.length) [...set].forEach((l) => out.push(l));
  return out.map((t) => ({ text: t, emoji: "🌟", kind: "syl", solved: false }));
}

function buildPool(level, count = state.letterCount) {
  const set = selectedLetters(count);
  if (level === 1) return buildSyllables(set);
  const seen = new Set();
  if (level === 2) {
    return WORDS.filter(([w]) => usesOnly(w, set) && !seen.has(w) && seen.add(w))
      .map(([w, e]) => ({ text: w, emoji: e, kind: "word", solved: false }));
  }
  return SENTENCES.filter(([s]) => usesOnly(s, set) && !seen.has(s) && seen.add(s))
    .map(([s, e]) => ({ text: s, emoji: e, kind: "sentence", solved: false }));
}

// Rastgele seç: başlangıçta tam rastgele, sonrasında son öğrenilen 2 harfe %60 öncelik
function pickNext() {
  let level = state.level;
  let pool = buildPool(level);
  let note = "";
  if (!pool.length) {
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
  const item = Object.assign({}, list[Math.floor(Math.random() * list.length)]);
  const maxRecent = Math.min(30, Math.max(5, Math.floor(pool.length * 0.6)));
  recentIds.push(item.text);
  while (recentIds.length > maxRecent) recentIds.shift();
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

function setMsg(text, cls = "", source = "", heard = "") {
  $("msg").textContent = text;
  $("msgWrap").className = "msg-wrap" + (cls ? " " + cls : "");
  const srcEl = $("msgSource");
  if (source) {
    srcEl.textContent = source;
    srcEl.hidden = false;
  } else {
    srcEl.hidden = true;
  }
  const heardEl = $("msgHeard");
  if (heard) {
    heardEl.textContent = `Duyulan: "${heard}"`;
    heardEl.hidden = false;
  } else {
    heardEl.hidden = true;
  }
}

function showItem(item, note = "") {
  current = item;
  $("reward").textContent = item.solved ? (item.kind === "syl" ? "🌟" : item.emoji) : "";
  const w = $("word");
  w.className = "word" + (item.kind === "sentence" ? " sentence" : "");
  w.innerHTML = "";
  if (item.kind === "word") {
    syllabify(item.text).forEach((s, i) => {
      const span = document.createElement("span");
      span.className = "s" + (i % 4);
      span.textContent = s;
      w.appendChild(span);
    });
  } else {
    w.textContent = item.text;
  }
  w.classList.remove("bounce"); void w.offsetWidth; w.classList.add("bounce");
  setMsg(note || (item.kind === "sentence" ? "Cümleyi oku!" : "Mikrofona bas ve oku!"));
  updateNavButtons();
}

let shownList = [], shownPos = -1;

function updateNavButtons() {
  $("prev").disabled = shownPos <= 0;
}

function nextItem() {
  stopAll();
  if (shownPos < shownList.length - 1) {
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
  if (shownPos > 0) {
    shownPos--;
    showItem(shownList[shownPos]);
  }
}

function newSession() {
  shownList = []; shownPos = -1; recentIds = [];
  nextItem();
}

function spokenText(item) {
  return item.text.toLocaleLowerCase("tr-TR");
}

function renderStars() {
  const wrap = $("stars");
  if (!wrap.children.length) {
    for (let i = 0; i < ROUND_SIZE; i++) {
      const s = document.createElement("span");
      s.className = "star-dot";
      s.textContent = "⭐";
      wrap.appendChild(s);
    }
  }
}

function renderHeader(completedRound = false) {
  renderStars();
  $("score").textContent = "⭐ " + state.score;
  $("lettersBtn").textContent = state.letterCount
    ? `🔤 Harfler (${state.letterCount}/${order.length})`
    : "🔤 Harfler";
  document.querySelectorAll(".lvl").forEach((b) =>
    b.classList.toggle("active", Number(b.dataset.level) === state.level));

  const c = state.correct[state.level] || 0;
  const filled = completedRound ? ROUND_SIZE : (c % ROUND_SIZE);
  $("bar").style.width = (filled / ROUND_SIZE * 100) + "%";
  $("roundLabel").textContent = `${filled} / ${ROUND_SIZE}`;
  [...$("stars").children].forEach((dot, idx) => dot.classList.toggle("on", idx < filled));
}

function renderStatusBar() {
  const hasKey = !!lsGet(LS.key);
  $("ver").textContent = `Sürüm ${APP_VERSION} · ` + (hasKey ? "🤖 Yapay Zekâ Modu" : "🎙️ Tarayıcı Modu");
}

/* ---------- 5) KONTROL MODU 1: Web Speech API (anahtarsız) ---------- */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let mediaRec = null, mediaStream = null, recTimer = null, retryTimer = null;
let vadTimer = null, vadCtx = null;

function stopSilenceDetector() {
  if (vadTimer) { clearInterval(vadTimer); vadTimer = null; }
  if (vadCtx) { try { vadCtx.close().catch(() => {}); } catch (e) {} vadCtx = null; }
}

function setRecording(on, showTimer = false) {
  const b = $("mic");
  b.classList.toggle("rec", on);
  b.textContent = on ? "⏹️ Bitir" : "🎤 Oku";
  const track = $("recTrack"), bar = $("recBar");
  if (on && showTimer) {
    track.hidden = false;
    bar.classList.remove("run"); void bar.offsetWidth; bar.classList.add("run");
  } else {
    track.hidden = true;
    bar.classList.remove("run");
  }
}

function stopAll() {
  activeCheckId++;
  clearTimeout(retryTimer);
  clearTimeout(recTimer);
  clearTimeout(roundTimer);
  stopSilenceDetector();
  if (aiAbortCtrl) { aiAbortCtrl.userAborted = true; aiAbortCtrl.abort(); aiAbortCtrl = null; }
  if (recognition) {
    try { recognition.onresult = recognition.onerror = recognition.onend = null; recognition.abort(); } catch (e) {}
    recognition = null;
  }
  if (mediaRec && mediaRec.state === "recording") {
    mediaRec.onstop = null;
    try { mediaRec.stop(); } catch (e) {}
  }
  if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  mediaRec = null; mediaStream = null;
  busy = false;
  setRecording(false);
}

function noSupportMessage() {
  setMsg("Bu tarayıcı konuşmayı anlayamıyor 😔 Lütfen Chrome kullan " +
    "ya da ebeveynine Ayarlar'dan yapay zekâ anahtarı girmesini söyle.", "try");
}

function squeeze(s) { return s.replace(/(.)\1+/g, "$1"); }

// Okunan metnin hedefle eşleşip eşleşmediğini kontrol eder (sıkı kısa-kelime korumalı)
function isReadingMatch(heardRaw, targetText, kind) {
  const h = clean(heardRaw);
  const t = clean(targetText);
  if (!h || !t) return false;
  if (h === t || squeeze(h) === squeeze(t)) return true;
  const sim = Math.max(similarity(h, t), similarity(squeeze(h), squeeze(t)));
  const threshold = (kind === "syl" || t.length <= 4) ? 0.85 : PASS_RATIO;
  return sim >= threshold;
}

function basicCheck(prefix = "", attempt = 0, myId = ++activeCheckId) {
  if (!SR) { noSupportMessage(); return; }
  if (myId !== activeCheckId) return;
  const targetNorm = squeeze(clean(current.text));
  const r = new SR();
  recognition = r;
  r.lang = "tr-TR";
  r.maxAlternatives = 3;
  r.interimResults = true;
  let manualStop = false;
  r.manualStopFn = () => { manualStop = true; try { r.stop(); } catch (e) {} };
  let done = false;
  let lastHeard = "";
  let lastRawHeard = "";

  r.onstart = () => {
    if (myId !== activeCheckId) return;
    busy = true;
    setRecording(true);
    setMsg(prefix + "Dinliyorum... 👂 Şimdi oku!", "listen", "🎙️ Tarayıcı");
  };

  r.onresult = (e) => {
    if (done || myId !== activeCheckId) return;
    const fullParts = [];
    for (let k = 0; k < e.results.length; k++) fullParts.push(e.results[k][0].transcript);
    const fullRaw = fullParts.join(" ").trim();
    const latest = e.results[e.results.length - 1];

    let matchedRaw = null, bestSim = -1;
    const candidates = [{ raw: fullRaw, norm: squeeze(clean(fullRaw)) }];
    const altLimit = Math.min(2, latest.length);
    for (let i = 0; i < altLimit; i++) {
      const raw = String(latest[i].transcript || "").trim();
      candidates.push({ raw, norm: squeeze(clean(raw)) });
    }

    for (const c of candidates) {
      if (!c.norm) continue;
      if (isReadingMatch(c.raw, current.text, current.kind) && matchedRaw === null) {
        matchedRaw = c.raw;
      }
      const s = similarity(c.norm, targetNorm);
      if (s > bestSim) { bestSim = s; lastHeard = c.norm; lastRawHeard = c.raw; }
    }

    // Ara sonuçlarda yalnızca önizleme göster; kesinleşmeden kabul etme
    if (!latest.isFinal) {
      if (lastRawHeard) {
        $("msgHeard").textContent = `Duyulan: "${lastRawHeard}"`;
        $("msgHeard").hidden = false;
      }
      return;
    }

    if (matchedRaw !== null) {
      done = true;
      try { r.stop(); } catch (err) {}
      busy = false;
      setRecording(false);
      onResult(true, randomPraise(), "🎙️ Tarayıcı", matchedRaw);
    }
  };

  r.onerror = (e) => {
    if (myId !== activeCheckId) return;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      done = true;
      busy = false;
      setRecording(false);
      setMsg("Mikrofona izin vermedin 🎤 Ebeveynine söyle: adres çubuğundaki kilit simgesinden " +
        "mikrofona izin versin.", "try");
    } else if (e.error === "aborted") {
      done = true;
      busy = false;
      setRecording(false);
    }
  };

  r.onend = () => {
    recognition = null;
    if (done || myId !== activeCheckId) { setRecording(false); busy = false; return; }
    done = true;
    if (lastHeard) {
      setRecording(false); busy = false;
      const ok = isReadingMatch(lastRawHeard, current.text, current.kind);
      onResult(ok, ok ? randomPraise() : randomRetry(), "🎙️ Tarayıcı", lastRawHeard);
      return;
    }
    if (attempt < 2 && !manualStop) {
      retryTimer = setTimeout(() => basicCheck(prefix, attempt + 1, myId), 150);
      return;
    }
    setRecording(false); busy = false;
    onResult(false, "Sesini duyamadım 🎤 Mikrofona biraz yaklaş ve yüksek sesle oku. Hazır olunca tekrar bas!", "🎙️ Tarayıcı");
  };

  try { r.start(); } catch (e) { setRecording(false); busy = false; }
}

const PRAISES = [
  "Harika! Doğru okudun! 🎉",
  "Bravo sana, süpersin! 🌟",
  "Vay canına, yıldız gibi parladın! ✨",
  "Roket gibi uçtun, harikasın! 🚀",
  "Çak bir beşlik, müthiş okudun! 🙌",
  "Süper kahraman gibisin! 🦸",
  "Şampiyon gibi okudun! 🏆",
  "Alkışlar sana geliyor! 👏",
  "Bütün yıldızları topluyorsun! ⭐",
  "Harika bir okuma ustasısın! 👑",
  "Gökkuşağı kadar renkli okudun! 🌈",
  "Zıp zıp tavşan gibi hızlı ve doğru! 🐰",
  "Tam isabet, on numara! 🎯",
  "Kulaklarıma inanamadım, çok güzel! 🎶",
  "Aferin sana, çok iyi gidiyorsun! 🎈",
  "Şahane okudun, yüzüm güldü! 😄",
  "Bir kelime daha avladın! 🦁",
  "Bal arısı gibi çalışkansın! 🐝",
  "Süper hızla doğru bildin! ⚡",
  "Muhteşem! Konfetiler senin için! 🎊",
  "Okuma canavarı iş başında! 🦖",
  "Tebrikler, resmen parlıyorsun! 🌞",
  "Çok net, çok güzel okudun! 🔔",
  "Kocaman bir aferin sana! 💖",
  "Böyle devam et, harikasın! 🦋",
  "Bilge baykuş gibi bildin! 🦉",
  "Çok tatlı okudun, bravo! 🍓",
  "Günün yıldızı sensin! 🌠"
];

const RETRIES = [
  "Hoppala, biraz kaçtı! Haydi bir daha dene! 🎈",
  "Olmadı ama çok yaklaştın, tekrar dene! 💫",
  "Küçük bir takılma oldu, şimdi yakalarsın! 🚀",
  "Azıcık kaydı, haydi bir daha deneyelim! 🐝",
  "Tam tutmadı, derin bir nefes al ve tekrar oku! 🌈",
  "Bu sefer kaçırdık, sıradaki denemede yakalarız! 🎯",
  "Yanlış oldu, haydi bir tur daha deneyelim! 🌟",
  "Kelime biraz saklandı, tekrar dene bakalım! 🕵️",
  "Neredeyse yakalıyordun, bir kez daha oku! 🐾",
  "Şimdi daha güzel okuyacaksın, haydi tekrar! 💪",
  "Ufukta doğru cevap var, bir daha dene! ⛵",
  "Ters gitti ama hiç sorun değil, tekrar okuyalım! 🍀",
  "Olmadı bu kez, mikrofon seni bekliyor! 🎤",
  "Biraz farklı çıktı, haydi baştan oku! 🎵",
  "Denemekten vazgeçme, şimdi başaracaksın! 🦁",
  "Hop, kelime elimizden kaydı! Tekrar yakala! 🦋",
  "Az kalsın oluyordu, bir daha deneyelim! ✨",
  "İlk deneme ısınmaydı, şimdi gerçek okuma! 🔥",
  "Yanlış duyduk sanki, biraz daha net oku! 👂",
  "Haydi şampiyon, bir kez daha dene! 🏆"
];

const recentPraises = [];
const recentRetries = [];
function pickUnique(list, recent) {
  const cands = list.filter((m) => !recent.includes(m));
  const pool = cands.length ? cands : list;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  recent.push(pick);
  if (recent.length > 5) recent.shift();
  return pick;
}
function randomPraise() { return pickUnique(PRAISES, recentPraises); }
function randomRetry() { return pickUnique(RETRIES, recentRetries); }

/* ---------- 6) KONTROL MODU 2: Gemini (yapay zekâ) ---------- */

// Konuşma bitince otomatik durdurma (sessizlik algılama / VAD)
function startSilenceDetector(stream, onSilence) {
  stopSilenceDetector();
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    vadCtx = new Ctx();
    const src = vadCtx.createMediaStreamSource(stream);
    const analyser = vadCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const startedAt = Date.now();
    let heardSpeech = false;
    let lastSpeechAt = startedAt;
    const silenceMs = current && current.kind === "sentence" ? 1500 : 1100;

    vadTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = Date.now();
      if (rms > 0.022) {
        heardSpeech = true;
        lastSpeechAt = now;
      } else if (heardSpeech && (now - startedAt) >= 700 && (now - lastSpeechAt) >= silenceMs) {
        stopSilenceDetector();
        onSilence();
      }
    }, 100);
  } catch (e) {
    stopSilenceDetector();
  }
}

function createCompressedRecorder(stream) {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  if (typeof MediaRecorder.isTypeSupported === "function") {
    for (const mimeType of candidates) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        try { return new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 24000 }); } catch (e) {}
      }
    }
  }
  return new MediaRecorder(stream);
}

async function aiCheck(key) {
  if (mediaRec && mediaRec.state === "recording") { mediaRec.stop(); return; }
  if (busy) return;
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    SR ? basicCheck() : noSupportMessage();
    return;
  }
  const myId = ++activeCheckId;
  busy = true;
  setMsg("Mikrofon hazırlanıyor... 🎤", "listen", "🤖 Yapay zekâ");
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    busy = false;
    setMsg("Mikrofona izin vermedin 🎤 Ebeveynine söyle: adres çubuğundaki kilit simgesinden " +
      "mikrofona izin versin.", "try");
    return;
  }
  if (myId !== activeCheckId) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    return;
  }
  const chunks = [];
  mediaRec = createCompressedRecorder(mediaStream);
  mediaRec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mediaRec.onstart = () => {
    setRecording(true, true);
    setMsg("Dinliyorum... 👂 Okuyunca otomatik biter (istersen ⏹️ bas)", "listen", "🤖 Yapay zekâ");
    startSilenceDetector(mediaStream, () => {
      if (mediaRec && mediaRec.state === "recording") mediaRec.stop();
    });
    recTimer = setTimeout(() => { if (mediaRec && mediaRec.state === "recording") mediaRec.stop(); }, MAX_RECORD_MS);
  };
  mediaRec.onstop = async () => {
    clearTimeout(recTimer);
    stopSilenceDetector();
    const type = mediaRec ? mediaRec.mimeType : "";
    if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
    mediaRec = null; mediaStream = null;
    setRecording(false);
    if (myId !== activeCheckId) { busy = false; return; }

    const blob = new Blob(chunks, { type });
    if (blob.size < 400) {
      busy = false;
      onResult(false, "Ses çok kısaydı 🎤 Düğmeye basıp yüksek sesle oku!", "🤖 Yapay zekâ");
      return;
    }

    setMsg("Düşünüyorum... 🤔", "listen", "🤖 Yapay zekâ");
    try {
      const t0 = Date.now();
      const audio = await toGeminiAudio(blob);
      if (myId !== activeCheckId) return;
      const out = await askGemini(key, audio);
      if (myId !== activeCheckId) return;
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      busy = false;
      const heard = String(out.duyulan || "").trim();
      const ok = isReadingMatch(heard, current.text, current.kind);
      onResult(ok, ok ? randomPraise() : randomRetry(), `🤖 Yapay zekâ · ${sec} sn`, heard || "(ses anlaşılmadı)");
    } catch (err) {
      if (myId !== activeCheckId || err.name === "AbortError") { busy = false; return; }
      console.error("Gemini hatası:", err);
      busy = false;
      if (SR) basicCheck("Yapay zekâya ulaşamadım (" + String(err.message).slice(0, 80) + "), tarayıcı ile deniyorum. ", 0, myId);
      else setMsg("Yapay zekâya ulaşılamadı: " + String(err.message).slice(0, 140), "try", "🤖 Yapay zekâ");
    }
  };
  mediaRec.start();
}

const GEMINI_AUDIO_MIMES = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/aac"]);

async function toGeminiAudio(blob) {
  const baseMime = (blob.type || "").split(";")[0].trim().toLowerCase();
  // Doğrudan desteklenen sıkıştırılmış biçimse yavaş WAV dönüşümünü atla
  if (GEMINI_AUDIO_MIMES.has(baseMime)) {
    return { mime: baseMime, b64: await blobToBase64(blob) };
  }
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

// Kör transkripsiyon: model hedef kelimeyi bilmez, yalnızca ses kaydında duyduğu Türkçe metni yazar
async function askGemini(key, audio) {
  const prompt =
    `Bu ses kaydında bir Türk çocuk okuma çalışması yapıyor. ` +
    `Yalnızca ses kaydında duyduğun Türkçe hece, kelime veya cümleyi aynen yaz; tahmin yürütme veya düzeltme yapma. ` +
    `Konuşma yoksa ya da anlaşılmıyorsa boş string ver. Sadece JSON: {"duyulan":"..."}`;
  const res = await callGemini(key, {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: audio.mime, data: audio.b64 } }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 48 }
  });
  const data = res.data;
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  if (!parts || !parts.length) throw new Error("Boş Gemini yanıtı");
  const raw = parts.filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("").trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

// Modele göre düşünme (thinking) süresini kapatır/en aza indirir (orijinal body'yi bozmaz)
function buildRequestBody(model, body, useThinking = true) {
  const gen = Object.assign({}, body.generationConfig || {});
  if (useThinking) {
    if (/gemini-2\.5/.test(model)) {
      gen.thinkingConfig = { thinkingBudget: 0, includeThoughts: false };
    } else if (/gemini-3/.test(model)) {
      gen.thinkingConfig = { thinkingLevel: "minimal", includeThoughts: false };
    }
  }
  return Object.assign({}, body, Object.keys(gen).length ? { generationConfig: gen } : {});
}

async function callGemini(key, body, onProgress) {
  const errors = [];
  const known = [...new Set([lsGet(LS.model), ...GEMINI_MODELS].filter(Boolean))];
  const first = await tryModels(key, body, known, onProgress, errors);
  if (first) return first;
  if (errors.some((e) => /API key|HTTP 403|HTTP 401/i.test(e))) throw new Error(errors.join(" | "));
  if (onProgress) onProgress("model listesi");
  const found = (await discoverModels(key, errors)).filter((m) => !known.includes(m));
  const second = await tryModels(key, body, found.slice(0, 5), onProgress, errors);
  if (second) return second;
  throw new Error(errors.join(" | "));
}

async function tryModels(key, body, models, onProgress, errors) {
  for (const model of models) {
    if (onProgress) onProgress(model);
    let useThinking = true;
    while (true) {
      const ctrl = new AbortController();
      aiAbortCtrl = ctrl;
      const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify(buildRequestBody(model, body, useThinking)),
            signal: ctrl.signal
          }
        );
        if (resp.ok) {
          lsSet(LS.model, model);
          return { data: await resp.json(), model };
        }
        let detail = "";
        try { detail = (await resp.json()).error.message; } catch (e) {}
        if (resp.status === 400 && useThinking && /thinking/i.test(detail)) {
          useThinking = false;
          continue; // thinkingConfig desteklemeyen modelde düşünmesiz bir kez tekrar dene
        }
        if (lsGet(LS.model) === model && (resp.status === 400 || resp.status === 404)) lsDel(LS.model);
        errors.push("HTTP " + resp.status + " [" + model + "] " + detail.slice(0, 140));
        if (/API key/i.test(detail) || resp.status === 401 || resp.status === 403) return null;
        break;
      } catch (e) {
        if (ctrl.userAborted) throw e;
        errors.push((e.name === "AbortError" ? "Zaman aşımı" : "Ağ hatası") + " [" + model + "]");
        break;
      } finally {
        clearTimeout(timer);
        if (aiAbortCtrl === ctrl) aiAbortCtrl = null;
      }
    }
  }
  return null;
}

async function discoverModels(key, errors) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DISCOVER_TIMEOUT_MS);
  try {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": key },
      signal: ctrl.signal
    });
    if (!resp.ok) { errors.push("Model listesi alınamadı: HTTP " + resp.status); return []; }
    const list = (await resp.json()).models || [];
    const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
    return list
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((n) => /flash/.test(n) && !/image|tts|live|embed|robotics|computer|thinking|exp/.test(n))
      .sort((a, b) => (/lite/.test(a) - /lite/.test(b)) || (ver(b) - ver(a)) || (a.length - b.length));
  } catch (e) {
    errors.push(e.name === "AbortError" ? "Model listesi zaman aşımı" : "Model listesi alınamadı");
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 7) SONUÇ, KONFETİ, HARF SEÇİCİ, EBEVEYN, KISAYOLLAR, PWA ---------- */

function getSpeechRate() {
  const n = parseFloat(lsGet(LS.speechRate));
  if (!Number.isFinite(n)) return 0.95;
  return Math.min(1.4, Math.max(0.5, n));
}

function formatSpeechRate(r) {
  const tag = r <= 0.7 ? "Yavaş" : r <= 1.05 ? "Normal" : "Hızlı";
  return `${r.toFixed(2)}x · ${tag}`;
}

function onResult(ok, msg, source = "", heard = "") {
  setMsg(msg, ok ? "good" : "try", source, heard);
  speak(msg.replace(/[^\p{L}\p{N}\s.,!?'"-]/gu, ""), getSpeechRate());
  if (!ok) return;

  // Ödül görselini şimdi göster (okumadan önce gizliydi)
  $("reward").textContent = current.kind === "syl" ? "🌟" : current.emoji;
  burstConfetti();

  if (current.solved) return; // Aynı karttan tekrar puan yazma
  current.solved = true;
  state.score += 1;
  state.correct[state.level] = (state.correct[state.level] || 0) + 1;
  saveState();

  const scoreEl = $("score");
  scoreEl.classList.remove("pop"); void scoreEl.offsetWidth; scoreEl.classList.add("pop");

  const completedRound = state.correct[state.level] % ROUND_SIZE === 0;
  renderHeader(completedRound);
  if (completedRound) {
    roundTimer = setTimeout(() => {
      setMsg("🏆 Tur tamam! 10 doğru yaptın! Üstteki seviyelerden yenisini deneyebilirsin.", "good", source);
    }, 1800);
  }
}

// --- Konfeti (canvas parçacıkları) ---
const canvas = $("confetti");
const g = canvas.getContext("2d");
let parts = [], anim = null;
function resizeCanvas() { canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener("resize", resizeCanvas); resizeCanvas();

function burstConfetti() {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#ff7a59", "#ffd84d", "#22c55e", "#3b82f6", "#a855f7", "#f43f5e"];
  for (let i = 0; i < 120; i++) {
    parts.push({
      x: innerWidth / 2, y: innerHeight / 3,
      vx: (Math.random() - 0.5) * 16, vy: Math.random() * -14 - 4,
      s: 6 + Math.random() * 8, c: colors[i % colors.length],
      r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 110 + Math.random() * 50
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

// --- Harf seçici (5 MEB grubu veya özel düz ızgara) ---
let pendingCount = state.letterCount;

function openPicker() {
  pendingCount = state.letterCount || 0;
  $("pickerClose").hidden = state.letterCount <= 0;
  renderPicker();
  $("picker").hidden = false;
}

function closePicker() {
  if (state.letterCount <= 0) return;
  $("picker").hidden = true;
}

function createLetterBtn(l, idx) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "letter" + (idx < pendingCount ? " on" : "") + (idx === pendingCount - 1 ? " last" : "");
  b.textContent = l;
  b.onclick = () => {
    pendingCount = idx + 1;
    renderPicker();
    speak(l.toLocaleLowerCase("tr-TR"), Math.max(0.5, getSpeechRate() * 0.85));
  };
  return b;
}

function renderPicker() {
  const grid = $("letterGrid");
  grid.innerHTML = "";
  if (isDefaultOrder()) {
    grid.className = "letter-grid";
    let idx = 0;
    for (const grp of LETTER_GROUPS) {
      const box = document.createElement("div");
      box.className = "group-row";
      const lbl = document.createElement("div");
      lbl.className = "group-label";
      lbl.textContent = grp.name;
      const row = document.createElement("div");
      row.className = "group-letters";
      for (const l of grp.letters) row.appendChild(createLetterBtn(l, idx++));
      box.appendChild(lbl);
      box.appendChild(row);
      grid.appendChild(box);
    }
  } else {
    grid.className = "letter-grid flat";
    order.forEach((l, i) => grid.appendChild(createLetterBtn(l, i)));
  }

  if (pendingCount) {
    const wCount = buildPool(2, pendingCount).length;
    const sCount = buildPool(3, pendingCount).length;
    $("pickerInfo").textContent = `${pendingCount} harf seçili · ${wCount} kelime · ${sCount} cümle`;
  } else {
    $("pickerInfo").textContent = "Öğrendiğin son harfe dokun 👆";
  }
  $("startBtn").disabled = !pendingCount;
}

$("startBtn").onclick = () => {
  if (!pendingCount) return;
  state.letterCount = pendingCount;
  saveState();
  renderHeader();
  $("picker").hidden = true;
  newSession();
};
$("lettersBtn").onclick = openPicker;
$("pickerClose").onclick = closePicker;
$("picker").onclick = (e) => { if (e.target === $("picker")) closePicker(); };

// --- Ana düğmeler ---
$("listen").onclick = () => {
  if (!current) return;
  const r = getSpeechRate();
  speak(spokenText(current), Math.max(0.5, current.kind === "sentence" ? r * 0.9 : r * 0.82));
};
$("next").onclick = nextItem;
$("prev").onclick = prevItem;
$("mic").onclick = () => {
  if (!current) return;
  if (recognition && recognition.manualStopFn) { recognition.manualStopFn(); return; }
  if (mediaRec && mediaRec.state === "recording") { mediaRec.stop(); return; }
  if (busy) return;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const key = lsGet(LS.key);
  key ? aiCheck(key) : basicCheck();
};

document.querySelectorAll(".lvl").forEach((b) => {
  b.onclick = () => {
    state.level = Number(b.dataset.level);
    saveState();
    renderHeader();
    newSession();
  };
});

// --- Klavye kısayolları ---
document.addEventListener("keydown", (e) => {
  const tag = document.activeElement ? document.activeElement.tagName : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key === "Escape" && !$("picker").hidden) { closePicker(); return; }
  if (!$("picker").hidden) return;
  if (e.key === "ArrowRight") { e.preventDefault(); nextItem(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); prevItem(); }
  else if (e.code === "Space" && tag !== "BUTTON" && tag !== "SUMMARY") {
    e.preventDefault();
    $("mic").click();
  }
});

// --- Ebeveyn paneli ---
function renderKeyState(customText = "") {
  renderStatusBar();
  if (customText) { $("keyState").textContent = customText; return; }
  const m = lsGet(LS.model);
  $("keyState").textContent = lsGet(LS.key)
    ? "✅ Yapay zekâ modu açık" + (m ? " (" + m + ")" : "")
    : "Anahtarsız mod (tarayıcı ses tanıması)";
}

$("key").value = lsGet(LS.key) || "";
$("saveKey").onclick = () => {
  const k = $("key").value.trim();
  lsDel(LS.model);
  if (k) lsSet(LS.key, k); else lsDel(LS.key);
  renderKeyState();
};
$("clearKey").onclick = () => {
  lsDel(LS.key);
  lsDel(LS.model);
  $("key").value = "";
  renderKeyState();
};
$("showKey").onclick = () => {
  const hidden = $("key").type === "password";
  $("key").type = hidden ? "text" : "password";
  $("showKey").textContent = hidden ? "🙈 Gizle" : "👁️ Göster";
};
$("testKey").onclick = async () => {
  const k = $("key").value.trim();
  if (!k) { renderKeyState("Önce anahtarı yapıştırın."); return; }
  lsSet(LS.key, k);
  lsDel(LS.model);
  renderStatusBar();
  $("keyState").textContent = "Test ediliyor...";
  try {
    const t0 = Date.now();
    const res = await callGemini(k, { contents: [{ parts: [{ text: "Sadece 'tamam' yaz." }] }] },
      (m) => { $("keyState").textContent = "Test ediliyor: " + m + " ..."; });
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    renderKeyState(`✅ Anahtar çalışıyor (${res.model} · ${sec} sn), kaydedildi.`);
  } catch (e) {
    renderKeyState("❌ " + e.message);
  }
};

function renderSpeechRate() {
  const r = getSpeechRate();
  $("speechRate").value = r;
  $("speechRateLabel").textContent = formatSpeechRate(r);
}
renderSpeechRate();
$("speechRate").oninput = (e) => {
  lsSet(LS.speechRate, e.target.value);
  renderSpeechRate();
};
$("testSpeech").onclick = () => speak("Harika okudun! Şimdi yeni kelimeye geçelim.", getSpeechRate());

$("order").value = order.join(" ");
$("saveOrder").onclick = () => {
  const arr = parseOrder($("order").value);
  if (!arr.length) return;
  lsSet(LS.order, arr.join(" "));
  order = arr;
  state.letterCount = Math.min(state.letterCount, order.length);
  saveState();
  $("order").value = order.join(" ");
  renderHeader();
  openPicker();
};
$("resetOrder").onclick = () => {
  lsDel(LS.order);
  order = LETTER_ORDER.slice();
  $("order").value = order.join(" ");
  state.letterCount = Math.min(state.letterCount, order.length);
  saveState();
  renderHeader();
};
$("resetAll").onclick = () => {
  if (!confirm("Puan ve ilerleme silinsin mi?")) return;
  state = { score: 0, letterCount: 0, level: 1, correct: { 1: 0, 2: 0, 3: 0 } };
  saveState();
  renderHeader();
  openPicker();
};

// --- PWA: service worker ---
if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
}

// --- Başlangıç ---
renderStatusBar();
renderHeader();
renderKeyState();
if (state.letterCount > 0 && state.letterCount <= order.length) newSession();
else openPicker();
