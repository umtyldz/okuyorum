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
const APP_VERSION = "v28";
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
  speechRate: "okuyorum.speechRate",
  classCode: "okuyorum.classCode",
  lastClassCode: "okuyorum.lastClassCode"
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
    level: [1, 2, 3, 4].includes(Number(raw.level)) ? Number(raw.level) : 1,
    correct: {
      1: Math.max(0, Number(c[1]) || 0),
      2: Math.max(0, Number(c[2]) || 0),
      3: Math.max(0, Number(c[3]) || 0),
      4: Math.max(0, Number(c[4]) || 0)
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
let autoNextTimer = null;
let transTimer = null;
let listenTimer = null;
let listenCountdown = 0;
let gateExpected = 0;
let cloudGlobal = [];      // Ortak bulut havuzu (global_words)
let cloudClass = null;     // Bağlı sınıf ({id, code, name, letter_count})
let cloudClassWords = [];  // Bağlı sınıfın kelimeleri/ödevleri (class_words)

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
  if (level === 4) {
    return cloudClassWords
      .filter((r) => r.is_homework)
      .map((r) => ({
        text: r.text,
        emoji: r.emoji || (r.kind === "sentence" ? "📖" : "⭐"),
        kind: r.kind === "sentence" ? "sentence" : "word",
        solved: false
      }));
  }
  const set = selectedLetters(count);
  if (level === 1) return buildSyllables(set);
  const seen = new Set();
  const isWord = level === 2;
  const base = isWord ? WORDS : SENTENCES;
  const kindName = isWord ? "word" : "sentence";
  const out = [];
  const pushIfValid = (text, emoji) => {
    const t = String(text || "").trim().toLocaleUpperCase("tr-TR");
    if (!t || seen.has(t) || !usesOnly(t, set)) return;
    seen.add(t);
    out.push({ text: t, emoji: emoji || (isWord ? "⭐" : "📖"), kind: kindName, solved: false });
  };
  for (const [t, e] of base) pushIfValid(t, e);
  for (const r of cloudGlobal) if (r.kind === kindName) pushIfValid(r.text, r.emoji);
  for (const r of cloudClassWords) if (r.kind === kindName) pushIfValid(r.text, r.emoji);
  return out;
}

// Rastgele seç: başlangıçta tam rastgele, sonrasında son öğrenilen 2 harfe %60 öncelik
function pickNext() {
  let level = state.level;
  let pool = buildPool(level);
  let note = "";
  if (!pool.length) {
    pool = buildPool(1);
    if (level === 4) note = "Bu sınıfta henüz ödev yok. Hece çalışalım! 🙂";
    else if (level !== 1) note = "Bu harflerle henüz " + (level === 2 ? "kelime" : "cümle") +
      " yok. Hece çalışalım! 🙂";
    level = 1;
  }
  const newest = order.slice(Math.max(0, state.letterCount - 2), state.letterCount);
  const fresh = level === 4 ? [] : pool.filter((p) => newest.some((l) => p.text.includes(l)));
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

function clearListenTimer() {
  if (listenTimer) { clearInterval(listenTimer); listenTimer = null; }
  listenCountdown = 0;
}

function renderListenBtn() {
  const b = $("listen");
  if (!current) { b.disabled = true; b.textContent = "🔒 Dinle"; return; }
  if (current.solved || current.listenUnlocked) {
    b.disabled = false;
    b.textContent = "🔊 Dinle";
  } else if (listenCountdown > 0) {
    b.disabled = true;
    b.textContent = `🔒 Dinle (${listenCountdown})`;
  } else {
    b.disabled = true;
    b.textContent = "🔒 Dinle";
  }
}

// İlk yanlış denemeden 5 saniye sonra Dinle düğmesinin kilidini açar
function scheduleListenUnlock() {
  if (!current || current.solved || current.listenUnlocked || listenTimer) return;
  listenCountdown = 5;
  renderListenBtn();
  listenTimer = setInterval(() => {
    listenCountdown--;
    if (listenCountdown <= 0) {
      clearListenTimer();
      if (current) current.listenUnlocked = true;
    }
    renderListenBtn();
  }, 1000);
}

function showItem(item, note = "") {
  current = item;
  clearListenTimer();
  renderListenBtn();
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
  setMsg(note || (item.kind === "sentence" ? "Cümleyi oku!" : "Mikrofona bas ve oku!"));
  updateNavButtons();
}

let shownList = [], shownPos = -1;

function updateNavButtons() {
  $("prev").disabled = shownPos <= 0;
}

const CARD_FX = ["slide", "zoom", "bounce", "flip", "swing", "rise"];
let lastCardFx = "";

function clearCardFx() {
  const card = $("card");
  [...card.classList].forEach((c) => { if (c.startsWith("fx-")) card.classList.remove(c); });
}

function transitionCard(dir, applyFn) {
  const card = $("card");
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  clearTimeout(transTimer);
  clearCardFx();
  if (dir === "none" || reduced) {
    applyFn();
    return;
  }
  const pool = CARD_FX.filter((f) => f !== lastCardFx);
  const fx = pool[Math.floor(Math.random() * pool.length)];
  lastCardFx = fx;
  const directional = fx === "slide" || fx === "flip" || fx === "swing";
  const outClass = directional ? `fx-${fx}-out-${dir === "next" ? "l" : "r"}` : `fx-${fx}-out`;
  const inClass = directional ? `fx-${fx}-in-${dir === "next" ? "r" : "l"}` : `fx-${fx}-in`;

  card.classList.add(outClass);
  transTimer = setTimeout(() => {
    clearCardFx();
    applyFn();
    void card.offsetWidth;
    card.classList.add(inClass);
    transTimer = setTimeout(clearCardFx, 460);
  }, 220);
}

function nextItem(animate = true) {
  stopAll();
  transitionCard(animate ? "next" : "none", () => {
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
  });
}

function prevItem(animate = true) {
  if (shownPos <= 0) return;
  stopAll();
  transitionCard(animate ? "prev" : "none", () => {
    shownPos--;
    showItem(shownList[shownPos]);
  });
}

function newSession() {
  shownList = []; shownPos = -1; recentIds = [];
  nextItem(false);
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
  $("lettersBadge").textContent = `🔤 ${state.letterCount || 6}/${order.length}`;
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
  clearTimeout(autoNextTimer);
  clearTimeout(transTimer);
  clearListenTimer();
  clearCardFx();
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

async function callGemini(key, body, onProgress, timeoutMs = GEMINI_TIMEOUT_MS, bindAbort = true) {
  const errors = [];
  const known = [...new Set([lsGet(LS.model), ...GEMINI_MODELS].filter(Boolean))];
  const first = await tryModels(key, body, known, onProgress, errors, timeoutMs, bindAbort);
  if (first) return first;
  if (errors.some((e) => /API key|HTTP 403|HTTP 401/i.test(e))) throw new Error(errors.join(" | "));
  if (onProgress) onProgress("model listesi");
  const found = (await discoverModels(key, errors)).filter((m) => !known.includes(m));
  const second = await tryModels(key, body, found.slice(0, 5), onProgress, errors, timeoutMs, bindAbort);
  if (second) return second;
  throw new Error(errors.join(" | "));
}

async function tryModels(key, body, models, onProgress, errors, timeoutMs = GEMINI_TIMEOUT_MS, bindAbort = true) {
  for (const model of models) {
    if (onProgress) onProgress(model);
    let useThinking = true;
    while (true) {
      const ctrl = new AbortController();
      if (bindAbort) aiAbortCtrl = ctrl;
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
        if (bindAbort && ctrl.userAborted) throw e;
        errors.push((e.name === "AbortError" ? "Zaman aşımı" : "Ağ hatası") + " [" + model + "]");
        break;
      } finally {
        clearTimeout(timer);
        if (bindAbort && aiAbortCtrl === ctrl) aiAbortCtrl = null;
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
  if (!ok) {
    scheduleListenUnlock();
    return;
  }

  clearListenTimer();
  // Ödül görselini şimdi göster (okumadan önce gizliydi)
  $("reward").textContent = current.kind === "syl" ? "🌟" : current.emoji;
  burstConfetti();

  let completedRound = false;
  if (!current.solved) {
    current.solved = true;
    renderListenBtn();
    state.score += 1;
    state.correct[state.level] = (state.correct[state.level] || 0) + 1;
    saveState();

    const scoreEl = $("score");
    scoreEl.classList.remove("pop"); void scoreEl.offsetWidth; scoreEl.classList.add("pop");

    completedRound = state.correct[state.level] % ROUND_SIZE === 0;
    renderHeader(completedRound);
    if (completedRound) {
      roundTimer = setTimeout(() => {
        setMsg("🏆 Tur tamam! 10 doğru yaptın! Üstteki seviyelerden yenisini deneyebilirsin.", "good", source);
      }, 1800);
    }
  }

  clearTimeout(autoNextTimer);
  autoNextTimer = setTimeout(() => nextItem(true), completedRound ? 3200 : 2100);
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

// --- Harf seçici (ortak 5 MEB grubu veya özel düz ızgara) ---
let pendingCount = state.letterCount || 6;

function openPicker() {
  pendingCount = state.letterCount || (cloudClass && cloudClass.letter_count) || 6;
  $("pickerClose").hidden = false;
  renderPicker();
  $("picker").hidden = false;
}

function closePicker() {
  $("picker").hidden = true;
}

function createLetterBtn(l, idx, activeCount, markIdx, onPick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "letter" +
    (idx < activeCount ? " on" : "") +
    (idx === activeCount - 1 ? " last" : "") +
    (idx === markIdx ? " teacher-mark" : "");
  if (idx === markIdx) b.title = "Öğretmenin seçtiği harf";
  b.textContent = l;
  b.onclick = () => onPick(idx + 1, l);
  return b;
}

function renderLetterGridInto(grid, activeCount, markIdx, onPick) {
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
      for (const l of grp.letters) row.appendChild(createLetterBtn(l, idx++, activeCount, markIdx, onPick));
      box.appendChild(lbl);
      box.appendChild(row);
      grid.appendChild(box);
    }
  } else {
    grid.className = "letter-grid flat";
    order.forEach((l, i) => grid.appendChild(createLetterBtn(l, i, activeCount, markIdx, onPick)));
  }
}

function renderPicker() {
  const markIdx = cloudClass && cloudClass.letter_count > 0
    ? Math.min(cloudClass.letter_count, order.length) - 1
    : -1;
  renderLetterGridInto($("letterGrid"), pendingCount, markIdx, (count, l) => {
    pendingCount = count;
    state.letterCount = count;
    saveState();
    renderHeader();
    newSession();
    renderPicker();
    speak(l.toLocaleLowerCase("tr-TR"), Math.max(0.5, getSpeechRate() * 0.85));
  });

  if (pendingCount) {
    const wCount = buildPool(2, pendingCount).length;
    const sCount = buildPool(3, pendingCount).length;
    $("pickerInfo").textContent = `✅ Kaydedildi · ${pendingCount} harf · ${wCount} kelime · ${sCount} cümle` +
      (markIdx >= 0 ? ` (👩‍🏫: ${order[markIdx]})` : "");
  } else {
    $("pickerInfo").textContent = "Öğrendiğin son harfe dokun 👆";
  }
  $("startBtn").disabled = !pendingCount;
}

$("startBtn").onclick = () => {
  if (pendingCount && state.letterCount !== pendingCount) {
    state.letterCount = pendingCount;
    saveState();
    renderHeader();
    newSession();
  }
  closePicker();
};
$("openLettersBtn").onclick = openPicker;
$("pickerClose").onclick = closePicker;
$("picker").onclick = (e) => { if (e.target === $("picker")) closePicker(); };

// --- Ana düğmeler ---
$("listen").onclick = () => {
  if (!current || (!current.solved && !current.listenUnlocked)) return;
  const r = getSpeechRate();
  speak(spokenText(current), Math.max(0.5, current.kind === "sentence" ? r * 0.9 : r * 0.82));
};
$("next").onclick = () => nextItem(true);
$("prev").onclick = () => prevItem(true);
$("mic").onclick = () => {
  clearTimeout(autoNextTimer);
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
  if (e.key === "Escape" && !$("gateModal").hidden) { closeGate(); return; }
  const tag = document.activeElement ? document.activeElement.tagName : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key === "Escape" && !$("picker").hidden) { closePicker(); return; }
  if (!$("picker").hidden || !$("gateModal").hidden) return;
  if (e.key === "ArrowRight") { e.preventDefault(); nextItem(true); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); prevItem(true); }
  else if (e.code === "Space" && tag !== "BUTTON" && tag !== "SUMMARY") {
    e.preventDefault();
    $("mic").click();
  }
});

// --- Ebeveyn matematik kilidi ---
function newGateQuestion() {
  const a = 3 + Math.floor(Math.random() * 7);
  const b = 3 + Math.floor(Math.random() * 7);
  gateExpected = a * b;
  $("gateQuestion").textContent = `${a} × ${b} = ?`;
  $("gateAnswer").value = "";
}

function openGate() {
  newGateQuestion();
  $("gateErr").textContent = "";
  $("gateModal").hidden = false;
  setTimeout(() => $("gateAnswer").focus(), 30);
}

function closeGate() {
  $("gateModal").hidden = true;
}

$("parentSummary").onclick = (e) => {
  if (!$("parent").open) {
    e.preventDefault();
    openGate();
  }
};
$("gateClose").onclick = closeGate;
$("gateModal").onclick = (e) => { if (e.target === $("gateModal")) closeGate(); };
$("gateForm").onsubmit = (e) => {
  e.preventDefault();
  const val = parseInt($("gateAnswer").value, 10);
  if (val === gateExpected) {
    closeGate();
    $("parent").open = true;
    $("parent").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else {
    $("gateErr").textContent = "Yanlış cevap, yeni soruyla tekrar deneyin.";
    const box = $("gateModal").querySelector(".gate-box");
    box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake");
    newGateQuestion();
    $("gateAnswer").focus();
  }
};

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

let rateSpeakTimer = null;
function renderSpeechRate() {
  const r = getSpeechRate();
  $("speechRate").value = r;
  $("speechRateLabel").textContent = formatSpeechRate(r);
}
renderSpeechRate();
$("speechRate").oninput = (e) => {
  lsSet(LS.speechRate, e.target.value);
  renderSpeechRate();
  clearTimeout(rateSpeakTimer);
  rateSpeakTimer = setTimeout(() => {
    speak("Harika okudun! Şimdi yeni kelimeye geçelim.", getSpeechRate());
  }, 250);
};
$("testSpeech").onclick = () => speak("Harika okudun! Şimdi yeni kelimeye geçelim.", getSpeechRate());

$("order").value = order.join(" ");
$("saveOrder").onclick = async () => {
  const arr = parseOrder($("order").value);
  if (!arr.length) return;
  lsSet(LS.order, arr.join(" "));
  order = arr;
  state.letterCount = Math.min(state.letterCount || 6, order.length);
  saveState();
  $("order").value = order.join(" ");
  renderHeader();
  renderTeacherLetters();
  const cls = getSelectedTeacherClass();
  if (cls) {
    try {
      await cloudUpdateClassSettings(cls.id, { letter_order: order.join(" ") });
      cls.letter_order = order.join(" ");
    } catch (e) {}
  }
};
$("resetOrder").onclick = async () => {
  lsDel(LS.order);
  order = LETTER_ORDER.slice();
  $("order").value = order.join(" ");
  state.letterCount = Math.min(state.letterCount || 6, order.length);
  saveState();
  renderHeader();
  renderTeacherLetters();
  const cls = getSelectedTeacherClass();
  if (cls) {
    try {
      await cloudUpdateClassSettings(cls.id, { letter_order: null });
      cls.letter_order = null;
    } catch (e) {}
  }
};
$("resetAll").onclick = () => {
  if (!confirm("Puan ve ilerleme silinsin mi?")) return;
  const fallbackCount = (cloudClass && cloudClass.letter_count > 0)
    ? Math.min(cloudClass.letter_count, order.length)
    : Math.min(6, order.length);
  state = { score: 0, letterCount: fallbackCount, level: 1, correct: { 1: 0, 2: 0, 3: 0, 4: 0 } };
  saveState();
  renderHeader();
  newSession();
};

/* ---------- 8) BULUT (SUPABASE), SAYFA TARAMA, ÖĞRETMEN & YÖNETİCİ ---------- */

let teacherProfile = null;
let teacherClasses = [];
let teacherPendingCount = 6;
let scanItems = [];
let lastCloudSyncAt = 0;

function applyClassLetters(cls) {
  if (!cls) return false;
  let changed = false;
  if (cls.letter_order) {
    const arr = parseOrder(cls.letter_order);
    if (arr.length && arr.join(" ") !== order.join(" ")) {
      order = arr;
      lsSet(LS.order, order.join(" "));
      $("order").value = order.join(" ");
      changed = true;
    }
  }
  if (cls.letter_count > 0) {
    const nextCount = Math.min(cls.letter_count, order.length);
    if (state.letterCount !== nextCount) {
      state.letterCount = nextCount;
      saveState();
      changed = true;
    }
  }
  return changed;
}

function renderCloudBadges() {
  const schoolTitleEl = $("schoolTitle");
  if (schoolTitleEl) {
    schoolTitleEl.textContent = cloudClass && cloudClass.name
      ? `ALİ KUŞÇU - ${cloudClass.name}`
      : "ALİ KUŞÇU";
  }
  const hwCount = cloudClassWords.filter((w) => w.is_homework).length;
  $("homeworkTab").hidden = hwCount === 0;
  if (state.level === 4 && hwCount === 0) {
    state.level = 2;
    saveState();
  }
  const badge = $("classBadge");
  if (cloudClass) {
    badge.textContent = `🏫 ${cloudClass.name}`;
    badge.hidden = false;
    $("classJoinForm").hidden = true;
    $("classConnectedBox").hidden = false;
    const tName = cloudClass.teacher_name ? ` — ${cloudClass.teacher_name}` : "";
    $("classConnectedInfo").textContent = `🏫 ${cloudClass.name}${tName}` + (hwCount ? ` · ${hwCount} ödev` : "");
    $("classJoinState").hidden = true;
  } else {
    badge.hidden = true;
    $("classJoinForm").hidden = false;
    $("classConnectedBox").hidden = true;
    if (!$("classCodeInput").value) {
      $("classCodeInput").value = lsGet(LS.lastClassCode) || "";
    }
  }
  renderHeader();
}

function setJoinState(msg, show = true) {
  const el = $("classJoinState");
  el.textContent = msg;
  el.hidden = !show;
}

async function connectClassByCode(code, opts = {}) {
  const cleanCode = String(code || "").trim().toUpperCase();
  if (!cleanCode) return false;
  if (!opts.quiet) setJoinState("Sınıf aranıyor...");
  try {
    const cls = await cloudFindClassByCode(cleanCode);
    if (!cls) {
      if (!opts.quiet) setJoinState("❌ Bu kodla sınıf bulunamadı.");
      return false;
    }
    cloudClass = cls;
    lsSet(LS.classCode, cls.code);
    lsSet(LS.lastClassCode, cls.code);
    cloudClassWords = await cloudLoadClassWords(cls.id);
    const lettersChanged = opts.applyLetters ? applyClassLetters(cls) : false;
    renderCloudBadges();
    if (lettersChanged && shownList.length) newSession();
    return true;
  } catch (e) {
    if (!opts.quiet) setJoinState("❌ Bağlantı hatası: " + e.message);
    return false;
  }
}

$("joinClassBtn").onclick = async () => {
  const ok = await connectClassByCode($("classCodeInput").value, { applyLetters: true });
  if (ok) {
    if (cloudClassWords.some((w) => w.is_homework)) state.level = 4;
    saveState();
    renderHeader();
    newSession();
  }
};

$("leaveClassBtn").onclick = () => {
  const remembered = (cloudClass && cloudClass.code) || lsGet(LS.classCode) || "";
  if (remembered) lsSet(LS.lastClassCode, remembered);
  lsDel(LS.classCode);
  cloudClearClassCache();
  cloudClass = null;
  cloudClassWords = [];
  if (state.level === 4) state.level = 2;
  saveState();
  $("classCodeInput").value = remembered;
  setJoinState("", false);
  renderCloudBadges();
  newSession();
};

// --- Görüntüyü bellekte sıkıştır (hiçbir yere kaydedilmez) ---
function compressImageToJpeg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 1280;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxSide || h > maxSide) {
          const scale = maxSide / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = c.toDataURL("image/jpeg", 0.82);
        URL.revokeObjectURL(url);
        resolve(dataUrl.split(",")[1]);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Görsel okunamadı")); };
    img.src = url;
  });
}

async function scanPageWithGemini(key, b64) {
  const prompt =
    `Bu fotoğrafta 1. sınıf Türkçe okuma kitabı veya çalışma sayfası var. ` +
    `Sayfadaki okuma alıştırması olan Türkçe kelimeleri ve kısa cümleleri çıkar. ` +
    `Kurallar: 1) Sayfa numaralarını, "Okuyunuz/Yazınız" gibi yönergeleri ve başlıkları alma. ` +
    `2) "ka-lem" veya "ar-mut" gibi hece tireli kelimeleri birleştir ("KALEM", "ARMUT"). ` +
    `3) Her şeyi Türkçe BÜYÜK harfle yaz (İ ve I ayrımına dikkat et). ` +
    `4) Her kelime ve cümle için uygun tek bir emoji seç. ` +
    `Sadece şu JSON formatında yanıt ver: {"kelimeler":[["KELİME","🍎"]],"cumleler":[["CÜMLE.","📖"]]}`;

  const res = await callGemini(
    key,
    {
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 2048 }
    },
    (m) => { setScanState("Sayfa okunuyor (" + m + ")..."); },
    25000,
    false
  );
  const data = res.data;
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  if (!parts || !parts.length) throw new Error("Boş Gemini yanıtı");
  const raw = parts.filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("").trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

function setScanState(msg, show = true) {
  const el = $("scanState");
  el.textContent = msg;
  el.hidden = !show;
}

function knownGlobalSet() {
  const set = new Set();
  for (const [w] of WORDS) set.add("word:" + w.toLocaleUpperCase("tr-TR"));
  for (const [s] of SENTENCES) set.add("sentence:" + s.toLocaleUpperCase("tr-TR"));
  for (const g of cloudGlobal) set.add(`${g.kind}:${String(g.text || "").toLocaleUpperCase("tr-TR")}`);
  return set;
}

function renderScanReview() {
  const listEl = $("scanList");
  listEl.innerHTML = "";
  $("scanReview").hidden = scanItems.length === 0;
  if (!scanItems.length) return;

  scanItems.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "scan-row";

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = item.selected !== false;
    chk.onchange = () => { item.selected = chk.checked; };

    const sel = document.createElement("select");
    sel.className = "scan-kind";
    sel.innerHTML = '<option value="word">Kelime</option><option value="sentence">Cümle</option>';
    sel.value = item.kind;
    sel.onchange = () => { item.kind = sel.value; };

    const txt = document.createElement("input");
    txt.type = "text";
    txt.className = "scan-text";
    txt.value = item.text;
    txt.oninput = () => { item.text = txt.value.toLocaleUpperCase("tr-TR"); };

    const em = document.createElement("input");
    em.type = "text";
    em.className = "scan-emoji";
    em.value = item.emoji;
    em.oninput = () => { item.emoji = em.value; };

    const del = document.createElement("button");
    del.type = "button";
    del.className = "mini-btn bad";
    del.textContent = "Sil";
    del.onclick = () => { scanItems.splice(idx, 1); renderScanReview(); };

    row.append(chk, sel, txt, em, del);
    listEl.appendChild(row);
  });
}

async function handlePageFile(file) {
  if (!file) return;
  const localKey = lsGet(LS.key);
  setScanState("Fotoğraf hazırlanıyor ve okunuyor...");
  try {
    const b64 = await compressImageToJpeg(file);
    let parsed;
    try {
      setScanState("Sayfa okunuyor...");
      parsed = await cloudScanPage(b64);
    } catch (cloudErr) {
      // Edge Function yoksa veya hata verdiyse yerel Gemini anahtarı varsa ona düş
      if (localKey) {
        parsed = await scanPageWithGemini(localKey, b64);
      } else {
        throw cloudErr;
      }
    }
    const seen = new Set();
    const added = [];
    const pushParsed = (arr, kind) => {
      if (!Array.isArray(arr)) return;
      for (const pair of arr) {
        const text = String(Array.isArray(pair) ? pair[0] : pair || "").trim().toLocaleUpperCase("tr-TR");
        const emoji = String(Array.isArray(pair) && pair[1] ? pair[1] : (kind === "sentence" ? "📖" : "⭐")).trim();
        const k = `${kind}:${text}`;
        if (!text || seen.has(k)) continue;
        seen.add(k);
        added.push({ kind, text, emoji, selected: true });
      }
    };
    pushParsed(parsed.kelimeler, "word");
    pushParsed(parsed.cumleler, "sentence");
    if (!added.length) {
      setScanState("⚠️ Sayfada okunacak kelime/cümle bulunamadı. Daha net bir açıdan tekrar deneyin.");
      return;
    }
    scanItems = scanItems.concat(added);
    renderScanReview();
    setScanState(`✅ ${added.length} öğe çıkarıldı. Kontrol edip "Sınıfımda yayınla"ya basın.`);
  } catch (e) {
    setScanState("❌ Sayfa okunamadı: " + e.message);
  } finally {
    $("pageCameraInput").value = "";
    $("pageGalleryInput").value = "";
  }
}

$("scanCameraBtn").onclick = () => $("pageCameraInput").click();
$("scanGalleryBtn").onclick = () => $("pageGalleryInput").click();
$("pageCameraInput").onchange = (e) => handlePageFile(e.target.files[0]);
$("pageGalleryInput").onchange = (e) => handlePageFile(e.target.files[0]);
$("addManualRowBtn").onclick = () => {
  scanItems.push({ kind: "word", text: "", emoji: "⭐", selected: true });
  renderScanReview();
};
$("clearScanBtn").onclick = () => {
  scanItems = [];
  renderScanReview();
  setScanState("", false);
};

// --- Öğretmen paneli ve sınıf yönetimi ---
function getSelectedTeacherClass() {
  const id = $("teacherClassSelect").value;
  return teacherClasses.find((c) => c.id === id) || null;
}

function classShareLink(code) {
  return location.origin + location.pathname + "?sinif=" + encodeURIComponent(code);
}

let teacherLetterSaveSeq = 0;

async function saveTeacherLetters(count) {
  const cls = getSelectedTeacherClass();
  if (!cls) return;
  const seq = ++teacherLetterSaveSeq;
  const st = $("teacherLetterState");
  st.textContent = "Kaydediliyor...";
  st.hidden = false;
  try {
    await cloudUpdateClassSettings(cls.id, { letter_count: count });
    if (seq !== teacherLetterSaveSeq) return;
    cls.letter_count = count;
    if (cloudClass && cloudClass.id === cls.id) {
      cloudClass.letter_count = count;
      applyClassLetters(cloudClass);
      renderHeader();
      newSession();
    }
    st.textContent = `✅ "${cls.name}" sınıfı ${count}. harfe (${order[count - 1]}) otomatik kaydedildi.`;
  } catch (e) {
    if (seq !== teacherLetterSaveSeq) return;
    st.textContent = "❌ Kaydedilemedi: " + e.message;
  }
}

function renderTeacherLetters() {
  const cls = getSelectedTeacherClass();
  const box = $("teacherLettersBox");
  if (!cls) { box.hidden = true; return; }
  box.hidden = false;
  renderLetterGridInto($("teacherLetterGrid"), teacherPendingCount, -1, (count, l) => {
    teacherPendingCount = count;
    renderTeacherLetters();
    speak(l.toLocaleLowerCase("tr-TR"), Math.max(0.5, getSpeechRate() * 0.85));
    saveTeacherLetters(count);
  });
  const wCount = buildPool(2, teacherPendingCount).length;
  const sCount = buildPool(3, teacherPendingCount).length;
  $("teacherLetterInfo").textContent =
    `Seçilen: ${order.slice(0, teacherPendingCount).join(" ")} (${teacherPendingCount}/${order.length} harf · ${wCount} kelime · ${sCount} cümle)`;
}

function renderTeacherClasses() {
  const sel = $("teacherClassSelect");
  const prevId = sel.value;
  const isAdmin = teacherProfile && teacherProfile.role === "admin";
  sel.innerHTML = "";
  if (!teacherClasses.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Henüz sınıf yok";
    sel.appendChild(opt);
    $("teacherClassHeading").textContent = "🏫 Henüz sınıfınız yok";
    $("teacherClassSelectWrap").hidden = true;
    $("teacherCreateClassRow").hidden = false;
    $("classShareRow").hidden = true;
    $("teacherLettersBox").hidden = true;
    $("classWordsBox").hidden = true;
    return;
  }
  for (const c of teacherClasses) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.code})`;
    sel.appendChild(opt);
  }
  if (prevId && teacherClasses.some((c) => c.id === prevId)) sel.value = prevId;
  else if (cloudClass && teacherClasses.some((c) => c.id === cloudClass.id)) sel.value = cloudClass.id;

  $("teacherClassSelectWrap").hidden = !isAdmin && teacherClasses.length <= 1;
  $("teacherCreateClassRow").hidden = !isAdmin;
  updateSelectedClassBox();
}

async function updateSelectedClassBox() {
  const cls = getSelectedTeacherClass();
  if (!cls) {
    $("classShareRow").hidden = true;
    $("teacherLettersBox").hidden = true;
    $("classWordsBox").hidden = true;
    return;
  }
  $("teacherClassHeading").textContent = `🏫 Sınıfım: ${cls.name}` +
    (cls.teacher_name ? ` — ${cls.teacher_name}` : "");
  $("classShareRow").hidden = false;
  $("classShareUrl").value = classShareLink(cls.code);
  teacherPendingCount = Math.min(Math.max(1, cls.letter_count || 6), order.length);
  $("teacherLetterState").hidden = true;
  renderTeacherLetters();
  await loadTeacherClassWords(cls.id);
}

async function loadTeacherClassWords(classId) {
  const box = $("classWordsBox");
  const listEl = $("classWordsList");
  box.hidden = false;
  listEl.textContent = "Yükleniyor...";
  try {
    const rows = await cloudLoadClassWords(classId);
    if (cloudClass && cloudClass.id === classId) {
      cloudClassWords = rows;
      renderCloudBadges();
    }
    const known = knownGlobalSet();
    const visibleRows = rows.filter(
      (r) => r.status !== "approved" && !known.has(`${r.kind}:${String(r.text || "").toLocaleUpperCase("tr-TR")}`)
    );
    listEl.innerHTML = "";
    if (!visibleRows.length) {
      listEl.textContent = rows.length
        ? "Bu sınıfa özel kelime yok (onaylananlar tüm oyuna eklendi)."
        : "Bu sınıfta henüz eklenmiş kelime/ödev yok.";
      return;
    }
    for (const r of visibleRows) {
      const item = document.createElement("div");
      item.className = "class-word-item";
      const left = document.createElement("span");
      const statusLabel = r.status === "approved" ? "Ortakta" : r.status === "rejected" ? "Sınıfa özel" : "Onay bekliyor";
      const statusCls = r.status === "approved" ? "ok" : r.status === "pending" ? "wait" : "";
      left.append(document.createTextNode(`${r.emoji} `));
      const bold = document.createElement("b");
      bold.textContent = r.text;
      left.append(bold, document.createTextNode(" "));
      if (r.is_homework) {
        const hwTag = document.createElement("span");
        hwTag.className = "badge-tag hw";
        hwTag.textContent = "Ödev";
        left.append(hwTag, document.createTextNode(" "));
      }
      const stTag = document.createElement("span");
      stTag.className = `badge-tag ${statusCls}`;
      stTag.textContent = statusLabel;
      left.append(stTag);

      const right = document.createElement("div");
      right.className = "row";
      right.style.marginTop = "0";

      const hwBtn = document.createElement("button");
      hwBtn.type = "button";
      hwBtn.className = "mini-btn" + (r.is_homework ? " ok" : "");
      hwBtn.textContent = r.is_homework ? "Ödevden çıkar" : "Ödev yap";
      hwBtn.onclick = async () => {
        await cloudToggleHomework(r.id, !r.is_homework);
        await loadTeacherClassWords(classId);
      };

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "mini-btn bad";
      delBtn.textContent = "Sil";
      delBtn.onclick = async () => {
        await cloudDeleteClassWord(r.id);
        await loadTeacherClassWords(classId);
      };

      right.append(hwBtn, delBtn);
      item.append(left, right);
      listEl.appendChild(item);
    }
  } catch (e) {
    listEl.textContent = "❌ Liste alınamadı: " + e.message;
  }
}

$("teacherClassSelect").onchange = updateSelectedClassBox;

$("createClassBtn").onclick = async () => {
  const name = $("newClassName").value.trim().toLocaleUpperCase("tr-TR");
  if (!name) return;
  const code = name.replace(/[^A-ZÇĞİÖŞÜ0-9]/g, "") || `S${100 + Math.floor(Math.random() * 900)}`;
  const tName = (teacherProfile && teacherProfile.full_name) || "";
  try {
    const created = await cloudCreateClass(name, code, state.letterCount || 6, tName);
    $("newClassName").value = "";
    teacherClasses.unshift(created);
    renderTeacherClasses();
    $("teacherClassSelect").value = created.id;
    await updateSelectedClassBox();
    await connectClassByCode(created.code, { quiet: true, applyLetters: true });
  } catch (e) {
    alert("Sınıf oluşturulamadı: " + e.message);
  }
};

$("whatsappShareBtn").onclick = () => {
  const cls = getSelectedTeacherClass();
  if (!cls) return;
  const link = classShareLink(cls.code);
  const text = `Merhaba, Okuyorum ${cls.name} sınıfı linkimiz:\n${link}\n(Sınıf kodu: ${cls.code})`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
};

$("copyClassLinkBtn").onclick = async () => {
  const url = $("classShareUrl").value;
  try {
    await navigator.clipboard.writeText(url);
    $("copyClassLinkBtn").textContent = "✅ Kopyalandı";
    setTimeout(() => { $("copyClassLinkBtn").textContent = "📋 Linki Kopyala"; }, 1800);
  } catch (e) {
    $("classShareUrl").select();
    document.execCommand("copy");
  }
};

$("previewClassBtn").onclick = async () => {
  const cls = getSelectedTeacherClass();
  if (!cls) return;
  await connectClassByCode(cls.code, { applyLetters: true });
  if (cloudClassWords.some((w) => w.is_homework)) state.level = 4;
  saveState();
  renderHeader();
  newSession();
};

$("publishScanBtn").onclick = async () => {
  const cls = getSelectedTeacherClass();
  if (!cls) {
    setScanState("❌ Önce bir sınıf seçin veya yukarıdan yeni sınıf oluşturun.");
    return;
  }
  const known = knownGlobalSet();
  const chosen = scanItems
    .filter((it) => it.selected !== false && it.text.trim())
    .map((it) => {
      const text = it.text.trim().toLocaleUpperCase("tr-TR");
      const kind = it.kind === "sentence" ? "sentence" : "word";
      return {
        kind,
        text,
        emoji: it.emoji,
        status: known.has(`${kind}:${text}`) ? "approved" : "pending"
      };
    });
  if (!chosen.length) {
    setScanState("❌ Yayınlanacak en az bir işaretli satır olmalı.");
    return;
  }
  setScanState("Yayınlanıyor...");
  try {
    await cloudPublishClassWords(cls.id, chosen, $("replaceHomeworkChk").checked);
    scanItems = [];
    renderScanReview();
    await loadTeacherClassWords(cls.id);
    if (!cloudClass || cloudClass.id !== cls.id) {
      await connectClassByCode(cls.code, { quiet: true });
    }
    setScanState(`🚀 ${chosen.length} öğe "${cls.name}" sınıfında anında yayınlandı!`);
  } catch (e) {
    setScanState("❌ Yayınlanamadı: " + e.message);
  }
};

// --- Öğretmen giriş / çıkış ---
async function refreshTeacherSession() {
  const session = sbGetSession();
  if (!session) {
    teacherProfile = null;
    teacherClasses = [];
    $("teacherLoginForm").hidden = false;
    $("teacherArea").hidden = true;
    $("adminPageLink").hidden = true;
    return;
  }
  try {
    teacherProfile = await sbGetProfile();
    const isAdmin = teacherProfile && teacherProfile.role === "admin";
    $("teacherLoginForm").hidden = true;
    $("teacherArea").hidden = false;
    const labelName = (teacherProfile && teacherProfile.full_name) || session.user.email;
    $("teacherInfo").textContent = `${isAdmin ? "👑 Yönetici" : "👩‍🏫 Öğretmen"} · ${labelName}`;
    teacherClasses = await cloudListMyClasses(isAdmin);
    renderTeacherClasses();
    $("adminPageLink").hidden = !isAdmin;
  } catch (e) {
    sbSignOut();
    $("teacherLoginForm").hidden = false;
    $("teacherArea").hidden = true;
    $("adminPageLink").hidden = true;
  }
}

$("teacherLoginBtn").onclick = async () => {
  const email = $("teacherEmail").value.trim();
  const pass = $("teacherPass").value;
  const msgEl = $("teacherAuthMsg");
  if (!email || !pass) {
    msgEl.textContent = "E-posta ve şifre girin.";
    msgEl.hidden = false;
    return;
  }
  msgEl.textContent = "Giriş yapılıyor...";
  msgEl.hidden = false;
  try {
    await sbSignIn(email, pass);
    $("teacherPass").value = "";
    msgEl.hidden = true;
    await refreshTeacherSession();
  } catch (e) {
    msgEl.textContent = "❌ " + e.message;
  }
};

$("teacherLogoutBtn").onclick = () => {
  sbSignOut();
  refreshTeacherSession();
};

// --- Bulut başlangıcı ve arka plan senkronizasyonu ---
async function initCloud() {
  const params = new URLSearchParams(location.search);
  const urlCode = params.get("sinif");
  if (urlCode) lsSet(LS.classCode, urlCode.trim().toUpperCase());

  cloudGlobal = await cloudLoadGlobalWords();
  const savedCode = lsGet(LS.classCode);
  if (savedCode) {
    // Sınıfa bağlıysa her açılışta öğretmenin belirlediği harflerden başla
    await connectClassByCode(savedCode, { quiet: true, applyLetters: true });
  } else {
    renderCloudBadges();
  }
  lastCloudSyncAt = Date.now();
  await refreshTeacherSession();
}

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - lastCloudSyncAt < 30000) return;
  lastCloudSyncAt = Date.now();
  cloudGlobal = await cloudLoadGlobalWords();
  if (cloudClass) {
    cloudClassWords = await cloudLoadClassWords(cloudClass.id);
    await connectClassByCode(cloudClass.code, { quiet: true, applyLetters: true });
  }
});

// --- PWA: service worker ---
if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
}

// --- Başlangıç (ilk açılışta harf seçici çıkmaz, doğrudan başlar) ---
if (state.letterCount <= 0 || state.letterCount > order.length) {
  state.letterCount = Math.min(6, order.length);
  saveState();
}
renderStatusBar();
renderHeader();
renderKeyState();
renderCloudBadges();
newSession();
initCloud();
