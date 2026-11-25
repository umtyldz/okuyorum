/* =====================================================================
   app.js â€” Okuyorum ana mantÄ±k
   BÃ¶lÃ¼mler:
     1) Ayarlar ve durum (localStorage)
     2) YardÄ±mcÄ±lar (metin temizleme, Levenshtein, hece bÃ¶lme)
     3) Havuz oluÅŸturma (seÃ§ili harflere gÃ¶re hece/kelime/cÃ¼mle)
     4) Ekran gÃ¶sterimi ve seslendirme (speechSynthesis)
     5) Kontrol modu 1: Web Speech API (anahtarsÄ±z)
     6) Kontrol modu 2: Gemini (yapay zekÃ¢)
     7) SonuÃ§, konfeti, harf seÃ§ici, ebeveyn paneli, PWA
   ===================================================================== */
"use strict";

/* ---------- 1) AYARLAR VE DURUM ---------- */
// Denenecek Gemini modelleri (ilk sÄ±radaki Ã¶ncelikli; hata olursa sÄ±radakine geÃ§ilir).
// Bir model kapatÄ±lÄ±rsa buraya yenisini ekleyin.
const GEMINI_TIMEOUT_MS = 12000;   // Bir model en fazla bu kadar beklenir
const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
const MAX_RECORD_MS = 6000;                // Yapay zekÃ¢ modunda en fazla kayÄ±t sÃ¼resi
const PASS_RATIO = 0.75;                   // Levenshtein benzerlik eÅŸiÄŸi
const ROUND_SIZE = 10;                     // Her 10 doÄŸru cevap = 1 tur
// Test iÃ§in ekranÄ±n en Ã¼stÃ¼nde gÃ¶sterilir. Her gÃ¼ncellemede artÄ±rÄ±n.
const APP_VERSION = "v11";
// GEÃ‡Ä°CÄ° test: yapay zekÃ¢ cevap verdiÄŸinde mesajÄ±n baÅŸÄ±na eklenir (hem yazÄ±lÄ±r hem sÃ¶ylenir).
// KaldÄ±rmak iÃ§in "" yapÄ±n.
const AI_DEBUG_PREFIX = "Google: ";

const LS = {
  state: "okuyorum.state",
  key: "okuyorum.geminiKey",
  model: "okuyorum.geminiModel",
  order: "okuyorum.letterOrder"
};
const $ = (id) => document.getElementById(id);

// KalÄ±cÄ± durum: puan, seÃ§ili harf sayÄ±sÄ±, seviye, seviye baÅŸÄ±na doÄŸru sayÄ±sÄ±
let state = Object.assign(
  { score: 0, letterCount: 0, level: 1, correct: { 1: 0, 2: 0, 3: 0 } },
  safeParse(localStorage.getItem(LS.state))
);
function saveState() { localStorage.setItem(LS.state, JSON.stringify(state)); }
function safeParse(s) { try { return JSON.parse(s) || {}; } catch (e) { return {}; } }

// Harf sÄ±rasÄ±: ebeveynin kaydettiÄŸi varsa o, yoksa words.js'teki varsayÄ±lan
function getOrder() {
  const saved = localStorage.getItem(LS.order);
  if (saved) {
    const arr = parseOrder(saved);
    if (arr.length) return arr;
  }
  return LETTER_ORDER;
}
// "e l a, k" â†’ ["E","L","A","K"]  (TÃ¼rkÃ§e bÃ¼yÃ¼k harf, tekrarsÄ±z)
function parseOrder(text) {
  const out = [];
  for (const ch of text.toLocaleUpperCase("tr-TR")) {
    if (/[A-ZÃ‡ÄÄ°Ã–ÅÃœ]/.test(ch) && !out.includes(ch)) out.push(ch);
  }
  return out;
}

let order = getOrder();
let current = null;        // Åu an ekrandaki Ã¶ÄŸe {text, emoji, kind}
let recentIds = [];        // TekrarÄ± azaltmak iÃ§in son gÃ¶sterilenler
let busy = false;          // KayÄ±t/deÄŸerlendirme sÃ¼rerken true

/* ---------- 2) YARDIMCILAR ---------- */

// KarÅŸÄ±laÅŸtÄ±rma iÃ§in: TÃ¼rkÃ§e kÃ¼Ã§Ã¼k harf + noktalama/boÅŸluk temizliÄŸi
function clean(s) {
  return s.toLocaleLowerCase("tr-TR").replace(/[^a-zÃ§ÄŸÄ±Ã¶ÅŸÃ¼Ã¢Ã®Ã»]/g, "");
}

// Levenshtein benzerliÄŸi (0..1)
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

// Hedefte hangi sesin (harfin) atlandÄ±ÄŸÄ±nÄ±/yanlÄ±ÅŸ sÃ¶ylendiÄŸini bulur.
// DÃ¼zenleme matrisinde geri izleme yaparak hedef harflerden ilk hatalÄ±yÄ± dÃ¶ndÃ¼rÃ¼r.
function findMissingLetter(target, heard) {
  const m = editMatrix(target, heard);
  let i = target.length, j = heard.length;
  const bad = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && m[i][j] === m[i - 1][j - 1] + (target[i - 1] === heard[j - 1] ? 0 : 1)) {
      if (target[i - 1] !== heard[j - 1]) bad.push(i - 1);   // yanlÄ±ÅŸ sÃ¶ylenen harf
      i--; j--;
    } else if (i > 0 && m[i][j] === m[i - 1][j] + 1) {
      bad.push(i - 1); i--;                                    // atlanan harf
    } else { j--; }                                            // fazladan sÃ¶ylenen
  }
  if (!bad.length) return null;
  return target[Math.min(...bad)].toLocaleUpperCase("tr-TR");
}

// TÃ¼rkÃ§e hece bÃ¶lme (hece sayÄ±sÄ± = Ã¼nlÃ¼ sayÄ±sÄ±)
function syllabify(word) {
  const chars = [...word];
  const v = [];
  chars.forEach((c, i) => { if (VOWELS.includes(c)) v.push(i); });
  if (v.length < 2) return [word];
  const cuts = [];
  for (let k = 0; k < v.length - 1; k++) {
    const gap = v[k + 1] - v[k] - 1;            // iki Ã¼nlÃ¼ arasÄ±ndaki Ã¼nsÃ¼z sayÄ±sÄ±
    cuts.push(gap === 0 ? v[k + 1] : gap === 1 ? v[k + 1] - 1 : v[k] + 2);
  }
  const parts = [];
  let start = 0;
  for (const c of cuts) { parts.push(chars.slice(start, c).join("")); start = c; }
  parts.push(chars.slice(start).join(""));
  return parts;
}

/* ---------- 3) HAVUZ OLUÅTURMA ---------- */

function selectedLetters() { return new Set(order.slice(0, state.letterCount)); }

// Metin yalnÄ±zca seÃ§ili harflerden mi oluÅŸuyor? (boÅŸluk/noktalama yok sayÄ±lÄ±r)
function usesOnly(text, set) {
  for (const ch of text) {
    if (/[A-ZÃ‡ÄÄ°Ã–ÅÃœ]/.test(ch) && !set.has(ch)) return false;
  }
  return true;
}

// SeÃ§ili harflerle hece Ã¼ret: Ã¼nsÃ¼z+Ã¼nlÃ¼ (KA) ve Ã¼nlÃ¼+Ã¼nsÃ¼z (AK)
function buildSyllables(set) {
  const vs = [...set].filter((l) => VOWELS.includes(l));
  const cs = [...set].filter((l) => !VOWELS.includes(l));
  const out = [];
  for (const c of cs) for (const v of vs) { out.push(c + v); out.push(v + c); }
  if (!out.length) vs.forEach((v) => out.push(v));   // sadece Ã¼nlÃ¼ seÃ§iliyse harfin kendisi
  return out.map((t) => ({ text: t, emoji: "ğŸ”¤", kind: "syl" }));
}

function buildPool(level) {
  const set = selectedLetters();
  if (level === 1) return buildSyllables(set);
  const seen = new Set();
  if (level === 2) {
    return WORDS.filter(([w]) => usesOnly(w, set) && !seen.has(w) && seen.add(w))
      .map(([w, e]) => ({ text: w, emoji: e, kind: "word" }));
  }
  return SENTENCES.filter(([s]) => usesOnly(s, set) && !seen.has(s) && seen.add(s))
    .map(([s, e]) => ({ text: s, emoji: e, kind: "sentence" }));
}

// Rastgele seÃ§: son Ã¶ÄŸrenilen 2 harfi iÃ§erenlere Ã¶ncelik ver, son 5 Ã¶ÄŸeyi tekrar etme
function pickNext() {
  let level = state.level;
  let pool = buildPool(level);
  let note = "";
  if (!pool.length) {            // Bu harflerle iÃ§erik yoksa heceye dÃ¼ÅŸ
    pool = buildPool(1);
    if (level !== 1) note = "Bu harflerle henÃ¼z " + (level === 2 ? "kelime" : "cÃ¼mle") +
      " yok. Hece Ã§alÄ±ÅŸalÄ±m! ğŸ™‚";
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

/* ---------- 4) EKRAN VE SESLENDÄ°RME ---------- */

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

// Metni tr-TR sesiyle oku (rate: yavaÅŸ okuma iÃ§in 0.6-0.8)
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
  $("emoji").textContent = "";   // GÃ¶rsel, doÄŸru okuyunca gÃ¶sterilir (ipucu olmasÄ±n diye)
  const w = $("word");
  w.className = "word" + (item.kind === "sentence" ? " sentence" : "");
  w.innerHTML = "";
  if (item.kind === "word") {
    // Heceleri farklÄ± renklerle gÃ¶ster
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
  setMsg(note || (item.kind === "sentence" ? "CÃ¼mleyi oku!" : "Mikrofona bas ve oku!"));
}

// GÃ¶sterim geÃ§miÅŸi: "Ã–nceki" dÃ¼ÄŸmesi iÃ§in
let shownList = [], shownPos = -1;

function nextItem() {
  stopAll();
  if (shownPos < shownList.length - 1) {            // Geri gidilmiÅŸse Ã¶nce geÃ§miÅŸte ileri git
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
  else setMsg("Bu ilk kelime ğŸ™‚");
}

// Seviye seÃ§ildiÄŸinde / yeniden baÅŸlandÄ±ÄŸÄ±nda: geÃ§miÅŸi sÄ±fÄ±rla, tamamen rastgele baÅŸla
function newSession() {
  shownList = []; shownPos = -1; recentIds = [];
  nextItem();
}

// Seslendirilecek metin: heceler/kelimeler kÃ¼Ã§Ã¼k harfle (harf adÄ± okunmasÄ±n diye)
function spokenText(item) {
  return item.text.toLocaleLowerCase("tr-TR");
}

function renderHeader() {
  $("score").textContent = "â­ " + state.score;
  document.querySelectorAll(".lvl").forEach((b) =>
    b.classList.toggle("active", Number(b.dataset.level) === state.level));
  $("bar").style.width = ((state.correct[state.level] % ROUND_SIZE) / ROUND_SIZE * 100) + "%";
}

/* ---------- 5) KONTROL MODU 1: Web Speech API (anahtarsÄ±z) ---------- */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let mediaRec = null, mediaStream = null, recTimer = null;

function setRecording(on) {
  busy = on;
  const b = $("mic");
  b.classList.toggle("rec", on);
  b.textContent = on ? "â¹ï¸ Bitir" : "ğŸ¤ Oku";
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
  setMsg("Bu tarayÄ±cÄ± konuÅŸmayÄ± anlayamÄ±yor ğŸ˜” LÃ¼tfen Chrome kullan " +
    "ya da ebeveynine Ayarlar'dan yapay zekÃ¢ anahtarÄ± girmesini sÃ¶yle.", "try");
}

// Ses tanÄ±ma iÃ§in "gevÅŸek" biÃ§im: tekrar eden harfleri tek say ("kaa" â†’ "ka", "anne" â†’ "ane")
function squeeze(s) { return s.replace(/(.)\1+/g, "$1"); }

// attempt: sessizlik olursa kullanÄ±cÄ±ya hissettirmeden otomatik yeniden dinleme sayÄ±sÄ±
function basicCheck(prefix = "", attempt = 0) {
  if (!SR) { noSupportMessage(); return; }
  const target = squeeze(clean(current.text));
  const r = new SR();
  recognition = r;
  r.lang = "tr-TR";
  r.maxAlternatives = 5;
  r.interimResults = true;      // KonuÅŸurken ara sonuÃ§larÄ± da deÄŸerlendir (daha hÄ±zlÄ± ve toleranslÄ±)
  r.manualStop = false;         // Ã‡ocuk "Bitir"e bastÄ±ysa true olur
  let done = false;             // SonuÃ§ verildi mi?
  let lastHeard = "";           // Duyulan en yakÄ±n metin
  r.onstart = () => { setRecording(true); setMsg(prefix + "Dinliyorum... ğŸ‘‚ Åimdi oku!"); };
  r.onresult = (e) => {
    if (done) return;
    const res = e.results[e.results.length - 1];
    let accepted = false, bestSim = -1;
    for (const alt of res) {
      const heard = squeeze(clean(alt.transcript));
      if (!heard) continue;
      const s = similarity(heard, target);
      // KÄ±sa hecelerde "iÃ§eriyor / ile baÅŸlÄ±yor" da yeterli (Ã¶r. "kaÃ§" â†’ "ka")
      if (s >= PASS_RATIO || (current.kind === "syl" && heard.includes(target))) accepted = true;
      if (s > bestSim) { bestSim = s; lastHeard = heard; }
    }
    if (accepted) {               // DoÄŸru: beklemeden sonuÃ§landÄ±r
      done = true;
      try { r.stop(); } catch (err) {}
      onResult(true, randomPraise());
    }
  };
  r.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      done = true;
      setMsg("Mikrofona izin vermedin ğŸ¤ Ebeveynine sÃ¶yle: adres Ã§ubuÄŸundaki kilit simgesinden " +
        "mikrofona izin versin.", "try");
    } else if (e.error === "aborted") {
      done = true;
    }
    // "no-speech" ve diÄŸer hatalar onend iÃ§inde ele alÄ±nÄ±r (otomatik tekrar)
  };
  r.onend = () => {
    setRecording(false);
    recognition = null;
    if (done) return;
    done = true;
    if (lastHeard) { onResult(false, hintMessage(target, lastHeard)); return; }   // Bir ÅŸey duyuldu ama yanlÄ±ÅŸ
    if (attempt < 2 && !r.manualStop) { basicCheck(prefix, attempt + 1); return; } // Sessizlik: sessizce tekrar dinle
    onResult(false, "Sesini duyamadÄ±m ğŸ¤ Mikrofona biraz yaklaÅŸ ve yÃ¼ksek sesle oku. HazÄ±r olunca tekrar bas!");
  };
  try { r.start(); } catch (e) { setRecording(false); }
}

// YanlÄ±ÅŸ okuma iÃ§in nazik ipucu: hangi ses eksik?
function hintMessage(target, heard) {
  if (!heard) return "Seni duyamadÄ±m. Bir daha dene! ğŸ™‚";
  const letter = findMissingLetter(target, heard);
  if (letter) {
    return `Ã‡ok yaklaÅŸtÄ±n! "${letter}" sesini biraz daha net sÃ¶yle. Haydi bir daha! ğŸ’ª`;
  }
  return "Neredeyse oldu! Bir daha deneyelim! ğŸ’ª";
}

const PRAISES = ["Harika! DoÄŸru okudun!", "Bravo sana!", "Ã‡ok gÃ¼zel okudun!", "SÃ¼persin!", "Aferin sana!"];
function randomPraise() { return PRAISES[Math.floor(Math.random() * PRAISES.length)] + " ğŸ‰"; }

/* ---------- 6) KONTROL MODU 2: Gemini (yapay zekÃ¢) ---------- */

async function aiCheck(key) {
  // Zaten kayÄ±t varsa erken bitir
  if (mediaRec && mediaRec.state === "recording") { mediaRec.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    SR ? basicCheck() : noSupportMessage();
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    setMsg("Mikrofona izin vermedin ğŸ¤ Ebeveynine sÃ¶yle: adres Ã§ubuÄŸundaki kilit simgesinden " +
      "mikrofona izin versin.", "try");
    return;
  }
  const chunks = [];
  mediaRec = new MediaRecorder(mediaStream);
  mediaRec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mediaRec.onstart = () => {
    setRecording(true);
    setMsg("Dinliyorum... ğŸ‘‚ (bitirince â¹ï¸ dÃ¼ÄŸmesine bas)");
    recTimer = setTimeout(() => { if (mediaRec && mediaRec.state === "recording") mediaRec.stop(); }, MAX_RECORD_MS);
  };
  mediaRec.onstop = async () => {
    clearTimeout(recTimer);
    const type = mediaRec.mimeType;
    mediaStream.getTracks().forEach((t) => t.stop());
    setRecording(false);
    setMsg("DÃ¼ÅŸÃ¼nÃ¼yorum... ğŸ¤”");
    busy = true;
    try {
      const blob = new Blob(chunks, { type });
      const audio = await toGeminiAudio(blob);          // WAV'a Ã§evir (en uyumlu biÃ§im)
      const out = await askGemini(key, current.text, audio);
      busy = false;
      onResult(!!out.dogru, AI_DEBUG_PREFIX + (out.mesaj || (out.dogru ? randomPraise() : "Bir daha dene! ğŸ™‚")));
    } catch (err) {
      // Hata olursa anahtarsÄ±z moda dÃ¼ÅŸ
      console.error("Gemini hatasÄ±:", err);
      busy = false;
      if (SR) basicCheck("Yapay zekÃ¢ya ulaÅŸamadÄ±m (" + String(err.message).slice(0, 90) + "), tarayÄ±cÄ± ile deniyorum. ");
      else setMsg("Yapay zekÃ¢ya ulaÅŸÄ±lamadÄ±: " + String(err.message).slice(0, 120), "try");
    }
  };
  mediaRec.start();
}

// KaydÄ± 16 kHz mono 16-bit WAV'a Ã§evirir; olmazsa ham kaydÄ± dÃ¶ndÃ¼rÃ¼r.
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

// Gemini'ye ses + istem gÃ¶nder, {"dogru":bool,"mesaj":"..."} bekle
async function askGemini(key, target, audio) {
  const prompt =
    `Sen okumayÄ± yeni Ã¶ÄŸrenen, 6-8 yaÅŸ arasÄ± bir TÃ¼rk Ã§ocuÄŸa yardÄ±m eden sevimli ve sabÄ±rlÄ± bir Ã¶ÄŸretmensin. ` +
    `Ã‡ocuÄŸun okumasÄ± gereken metin: "${target}". Ekteki ses kaydÄ±nÄ± dinle. ` +
    `Ã‡ocuk heceleyerek (Ã¶r. "ka-le"), yavaÅŸ veya hafif hatalÄ± telaffuzla okuyabilir; bu normaldir. ` +
    `Metin bÃ¼yÃ¼k Ã¶lÃ§Ã¼de doÄŸru okunduysa "dogru": true de ve kÄ±sa bir tebrik yaz. ` +
    `YanlÄ±ÅŸsa veya sessizse "dogru": false de; hangi sesin (harfin) eksik ya da farklÄ± olduÄŸunu nazikÃ§e, ` +
    `moral bozmadan sÃ¶yle ve tekrar denemesini teÅŸvik et. "mesaj" en fazla 2 kÄ±sa TÃ¼rkÃ§e cÃ¼mle olsun. ` +
    `Sadece ÅŸu JSON biÃ§iminde yanÄ±t ver: {"dogru": true veya false, "mesaj": "..."}`;
  const data = await callGemini(key, {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: audio.mime, data: audio.b64 } }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.3 }
  });
  const text = data.candidates[0].content.parts.map((p) => p.text || "").join("");
  return JSON.parse(text);
}

// Gemini REST Ã§aÄŸrÄ±sÄ±. Ã–nce bilinen modeller denenir; hepsi baÅŸarÄ±sÄ±z olursa hesabÄ±n gerÃ§ekten
// kullanabildiÄŸi modeller Google'dan sorulup (ListModels) onlar denenir.
// Hata olursa denenen her modelin hatasÄ±nÄ± iÃ§eren Error fÄ±rlatÄ±r.
async function callGemini(key, body, onProgress) {
  const errors = [];
  const known = [...new Set([localStorage.getItem(LS.model), ...GEMINI_MODELS].filter(Boolean))];
  const first = await tryModels(key, body, known, onProgress, errors);
  if (first) return first;
  if (errors.some((e) => /API key|HTTP 403|HTTP 401/i.test(e))) throw new Error(errors.join(" | "));
  // Bilinen modellerin hiÃ§biri Ã§alÄ±ÅŸmadÄ±: gÃ¼ncel model listesini Google'dan al
  if (onProgress) onProgress("model listesi");
  const found = (await discoverModels(key, errors)).filter((m) => !known.includes(m));
  const second = await tryModels(key, body, found.slice(0, 4), onProgress, errors);
  if (second) return second;
  throw new Error(errors.join(" | "));
}

// Verilen modelleri sÄ±rayla dener; ilk baÅŸarÄ±lÄ± cevabÄ± dÃ¶ndÃ¼rÃ¼r, hiÃ§biri olmazsa null
async function tryModels(key, body, models, onProgress, errors) {
  for (const model of models) {
    if (onProgress) onProgress(model);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);   // sonsuz beklemesin
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          signal: ctrl.signal
        }
      );
      if (resp.ok) {
        localStorage.setItem(LS.model, model);       // Ã§alÄ±ÅŸan modeli hatÄ±rla
        return await resp.json();
      }
      let detail = "";
      try { detail = (await resp.json()).error.message; } catch (e) {}
      errors.push("HTTP " + resp.status + " [" + model + "] " + detail.slice(0, 160));
      if (/API key/i.test(detail) || resp.status === 401 || resp.status === 403) return null;   // anahtar sorunu: devam etme
    } catch (e) {
      errors.push((e.name === "AbortError" ? "Zaman aÅŸÄ±mÄ±" : "AÄŸ hatasÄ±") + " [" + model + "]");
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

// HesabÄ±n kullanabildiÄŸi, metin/ses Ã¼retebilen "flash" modellerini yeniden eskiye sÄ±ralÄ± dÃ¶ndÃ¼rÃ¼r
async function discoverModels(key, errors) {
  try {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
      { headers: { "x-goog-api-key": key } });
    if (!resp.ok) { errors.push("Model listesi alÄ±namadÄ±: HTTP " + resp.status); return []; }
    const list = (await resp.json()).models || [];
    const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
    return list
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((n) => /flash/.test(n) && !/lite|image|tts|live|embed|robotics|computer|thinking|exp/.test(n))
      .sort((a, b) => ver(b) - ver(a) || a.length - b.length);
  } catch (e) {
    errors.push("Model listesi alÄ±namadÄ±");
    return [];
  }
}

/* ---------- 7) SONUÃ‡, KONFETÄ°, HARF SEÃ‡Ä°CÄ°, EBEVEYN, PWA ---------- */

function onResult(ok, msg) {
  setMsg(msg, ok ? "good" : "try");
  speak(msg.replace(/[^\p{L}\p{N}\s.,!?'"-]/gu, ""), 0.9);
  if (!ok) return;
  $("emoji").textContent = current.kind === "syl" ? "ğŸŒŸ" : current.emoji;   // Ã–dÃ¼l olarak gÃ¶rseli gÃ¶ster
  state.score += 1;
  state.correct[state.level] = (state.correct[state.level] || 0) + 1;
  saveState();
  renderHeader();
  burstConfetti();
  if (state.correct[state.level] % ROUND_SIZE === 0) {
    setTimeout(() => setMsg("ğŸ† Tur tamam! 10 doÄŸru yaptÄ±n! Ãœstteki seviyelerden yenisini deneyebilirsin.", "good"), 1800);
  }
}

// --- Konfeti (basit canvas parÃ§acÄ±klarÄ±) ---
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

// --- Harf seÃ§ici ---
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
    ? "SeÃ§ilen harfler: " + order.slice(0, pendingCount).join(" ")
    : "Bir harfe dokun ğŸ‘†";
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

// --- DÃ¼ÄŸmeler ---
$("listen").onclick = () => current && speak(spokenText(current), current.kind === "sentence" ? 0.65 : 0.55);
$("next").onclick = nextItem;
$("prev").onclick = prevItem;
$("mic").onclick = () => {
  if (!current) return;
  // KayÄ±t sÃ¼rÃ¼yorsa: durdur
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
  $("keyState").textContent = localStorage.getItem(LS.key) ? "âœ… Yapay zekÃ¢ modu aÃ§Ä±k" : "AnahtarsÄ±z mod";
}
$("key").value = localStorage.getItem(LS.key) || "";
$("saveKey").onclick = () => {
  const k = $("key").value.trim();
  if (k) localStorage.setItem(LS.key, k); else localStorage.removeItem(LS.key);
  renderKeyState();
};
$("clearKey").onclick = () => { localStorage.removeItem(LS.key); $("key").value = ""; renderKeyState(); };
// AnahtarÄ± gÃ¶ster/gizle (yapÄ±ÅŸtÄ±rÄ±lan anahtarÄ± kontrol etmek iÃ§in)
$("showKey").onclick = () => {
  const hidden = $("key").type === "password";
  $("key").type = hidden ? "text" : "password";
  $("showKey").textContent = hidden ? "ğŸ™ˆ Gizle" : "ğŸ‘ï¸ GÃ¶ster";
};
// AnahtarÄ± test et: kÄ±sa bir metin isteÄŸi gÃ¶nderip sonucu/hatayÄ± gÃ¶sterir
$("testKey").onclick = async () => {
  const k = $("key").value.trim();
  if (!k) { $("keyState").textContent = "Ã–nce anahtarÄ± yapÄ±ÅŸtÄ±rÄ±n."; return; }
  localStorage.setItem(LS.key, k);
  $("keyState").textContent = "Test ediliyor...";
  try {
    await callGemini(k, { contents: [{ parts: [{ text: "Sadece 'tamam' yaz." }] }] },
      (m) => { $("keyState").textContent = "Test ediliyor: " + m + " ..."; });
    $("keyState").textContent = "âœ… Anahtar Ã§alÄ±ÅŸÄ±yor, kaydedildi.";
  } catch (e) {
    $("keyState").textContent = "âŒ " + e.message;
  }
};
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

// --- BaÅŸlangÄ±Ã§ ---
$("ver").textContent = "SÃ¼rÃ¼m " + APP_VERSION + (localStorage.getItem(LS.key) ? " Â· ğŸ¤– anahtar kayÄ±tlÄ±" : " Â· anahtar yok");
renderHeader();
renderKeyState();
if (state.letterCount > 0 && state.letterCount <= order.length) newSession();
else { openPicker(); }
