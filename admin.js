/* =====================================================================
   admin.js — Okuyorum Bağımsız Yönetici Paneli Mantığı
   Mevcut words.js (LETTER_ORDER, WORDS, SENTENCES) ve cloud.js üzerine kuruludur.
   ===================================================================== */
"use strict";

const ADMIN_VERSION = "v28";
const $ = (id) => document.getElementById(id);

let adminProfile = null;
let allTeachers = [];
let allClasses = [];
let allPending = [];
let allGlobal = [];
let globalScanItems = [];
let edgeListSupported = true;

/* ---------- YARDIMCILAR ---------- */

function setState(id, msg, show = true) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.hidden = !show;
}

function classShareLink(code) {
  const basePath = location.pathname.replace(/[^/]*$/, "index.html");
  return location.origin + basePath + "?sinif=" + encodeURIComponent(code);
}

function makeBtn(text, cls, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "adm-btn small " + cls;
  b.textContent = text;
  b.onclick = onClick;
  return b;
}

function makeBadge(text, cls = "") {
  const s = document.createElement("span");
  s.className = "badge" + (cls ? " " + cls : "");
  s.textContent = text;
  return s;
}

// MEB 2024 harf sırasına göre bu kelimenin/cümlenin kaçıncı harfte açılacağını hesaplar
function getUnlockInfo(text) {
  const letters = [];
  for (const ch of String(text || "").toLocaleUpperCase("tr-TR")) {
    if (/[A-ZÇĞİÖŞÜ]/.test(ch)) letters.push(ch);
  }
  if (!letters.length) return { idx: 0, text: "Harf yok", ok: false };

  let maxIdx = -1;
  const missing = [];
  for (const ch of letters) {
    const pos = LETTER_ORDER.indexOf(ch);
    if (pos === -1) {
      if (!missing.includes(ch)) missing.push(ch);
    } else if (pos > maxIdx) {
      maxIdx = pos;
    }
  }
  if (missing.length) {
    return { idx: 99, text: `⚠️ Sıra dışı: ${missing.join(",")}`, ok: false };
  }
  return {
    idx: maxIdx + 1,
    text: `🔓 ${maxIdx + 1}. harf (${LETTER_ORDER[maxIdx]})`,
    ok: true
  };
}

function builtinGlobalSet() {
  const set = new Set();
  for (const [w] of WORDS) set.add("word:" + w.toLocaleUpperCase("tr-TR"));
  for (const [s] of SENTENCES) set.add("sentence:" + s.toLocaleUpperCase("tr-TR"));
  for (const g of allGlobal) set.add(`${g.kind}:${String(g.text || "").toLocaleUpperCase("tr-TR")}`);
  return set;
}

function updateKPIs() {
  $("kpiTeachers").textContent = edgeListSupported ? String(allTeachers.length) : "—";
  $("kpiClasses").textContent = String(allClasses.length);
  $("kpiPending").textContent = String(allPending.length);
  $("kpiGlobal").textContent = String(allGlobal.length);
  const badge = $("pendingTabBadge");
  badge.textContent = String(allPending.length);
  badge.hidden = allPending.length === 0;
  $("globalStatsNote").textContent =
    `Yerleşik (words.js): ${WORDS.length} kelime, ${SENTENCES.length} cümle · Bulut ortak havuzu: ${allGlobal.length} kayıt`;
}

/* ---------- SEKMELER ---------- */

function switchTab(name) {
  const tabs = [
    ["teachers", "tabBtnTeachers", "tabTeachers"],
    ["pending", "tabBtnPending", "tabPending"],
    ["global", "tabBtnGlobal", "tabGlobal"]
  ];
  for (const [key, btnId, panelId] of tabs) {
    const active = key === name;
    $(btnId).classList.toggle("active", active);
    $(panelId).hidden = !active;
  }
}

$("tabBtnTeachers").onclick = () => switchTab("teachers");
$("tabBtnPending").onclick = () => switchTab("pending");
$("tabBtnGlobal").onclick = () => switchTab("global");

/* ---------- ÖĞRETMEN & SINIF YÖNETİMİ ---------- */

function teacherDisplayName(t) {
  return t.full_name ? `${t.full_name} (${t.email})` : t.email;
}

function populateTeacherDropdowns() {
  const sel = $("newClassTeacher");
  const cur = sel.value;
  sel.innerHTML = "";
  const list = allTeachers.length ? allTeachers : [{ id: "", full_name: "Yönetici (kendim)", email: "" }];
  for (const t of list) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.email ? teacherDisplayName(t) : t.full_name;
    sel.appendChild(opt);
  }
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

function renderTeachersList() {
  const listEl = $("teachersList");
  listEl.innerHTML = "";
  if (!edgeListSupported) {
    setState("teachersState", "Öğretmen hesap listesi için Supabase Edge Function güncellemesi gerekiyor.", true);
    return;
  }
  const q = $("teacherSearch").value.trim().toLocaleLowerCase("tr-TR");
  const filtered = allTeachers.filter((t) => {
    if (!q) return true;
    return (t.full_name || "").toLocaleLowerCase("tr-TR").includes(q) ||
      (t.email || "").toLocaleLowerCase("tr-TR").includes(q);
  });
  setState("teachersState", `${filtered.length} hesap gösteriliyor.`, filtered.length === 0);
  if (!filtered.length) return;

  const session = sbGetSession();
  const selfId = session ? session.user.id : "";

  for (const t of filtered) {
    const card = document.createElement("div");
    card.className = "item-card";

    const top = document.createElement("div");
    top.className = "item-main";

    const info = document.createElement("div");
    info.className = "item-meta";
    const title = document.createElement("b");
    title.textContent = t.full_name || "(İsimsiz)";
    const emailTxt = document.createElement("span");
    emailTxt.textContent = t.email;
    info.append(title, emailTxt);
    info.append(makeBadge(t.role === "admin" ? "👑 Yönetici" : "👩‍🏫 Öğretmen", t.role === "admin" ? "admin" : ""));

    const ownedClasses = allClasses.filter((c) => c.teacher_id === t.id);
    for (const c of ownedClasses) info.append(makeBadge(`🏫 ${c.name}`, "cls"));

    const editBox = document.createElement("div");
    editBox.className = "edit-box";
    editBox.hidden = true;

    const nameIn = document.createElement("input");
    nameIn.type = "text";
    nameIn.value = t.full_name || "";
    nameIn.placeholder = "Öğretmen adı";

    const mailIn = document.createElement("input");
    mailIn.type = "email";
    mailIn.value = t.email || "";
    mailIn.placeholder = "E-posta";

    const passIn = document.createElement("input");
    passIn.type = "password";
    passIn.placeholder = "Yeni şifre (boş bırakılırsa değişmez)";
    passIn.autocomplete = "new-password";

    const wrapField = (lblText, el) => {
      const lbl = document.createElement("label");
      lbl.className = "adm-label";
      lbl.textContent = lblText;
      lbl.appendChild(el);
      return lbl;
    };

    const saveBtn = makeBtn("💾 Kaydet", "good", async () => {
      saveBtn.disabled = true;
      try {
        const payload = {
          action: "update",
          userId: t.id,
          teacherName: nameIn.value.trim()
        };
        const nextMail = mailIn.value.trim().toLowerCase();
        if (nextMail && nextMail !== (t.email || "").toLowerCase()) payload.email = nextMail;
        if (passIn.value) payload.password = passIn.value;
        await cloudAdminTeachers(payload);
        setState("teachersState", `✅ ${nameIn.value.trim() || nextMail} güncellendi.`);
        await loadTeachersAndClasses();
      } catch (e) {
        setState("teachersState", "❌ " + e.message);
        saveBtn.disabled = false;
      }
    });

    editBox.append(
      wrapField("Ad Soyad", nameIn),
      wrapField("E-posta", mailIn),
      wrapField("Yeni Şifre (isteğe bağlı)", passIn),
      saveBtn
    );

    const actions = document.createElement("div");
    actions.className = "adm-row";
    actions.append(makeBtn("✏️ Düzenle", "ghost", () => { editBox.hidden = !editBox.hidden; }));

    if (t.id !== selfId) {
      actions.append(makeBtn("🗑️ Sil", "danger", async () => {
        if (!confirm(`"${t.full_name || t.email}" hesabını silmek istiyor musunuz?\nVarsa sınıfları yöneticiye devredilir.`)) return;
        try {
          await cloudAdminTeachers({ action: "delete", userId: t.id });
          setState("teachersState", `🗑️ ${t.full_name || t.email} silindi.`);
          await loadTeachersAndClasses();
        } catch (e) {
          setState("teachersState", "❌ " + e.message);
        }
      }));
    }

    top.append(info, actions);
    card.append(top, editBox);
    listEl.appendChild(card);
  }
}

function renderClassesList() {
  const listEl = $("classesList");
  listEl.innerHTML = "";
  if (!allClasses.length) {
    listEl.textContent = "Henüz kayıtlı sınıf yok.";
    return;
  }

  for (const c of allClasses) {
    const card = document.createElement("div");
    card.className = "item-card";

    const top = document.createElement("div");
    top.className = "item-main";

    const info = document.createElement("div");
    info.className = "item-meta";
    const tObj = allTeachers.find((t) => t.id === c.teacher_id);
    const tLabel = c.teacher_name || (tObj && tObj.full_name) || (tObj && tObj.email) || "Atanmamış";
    const lc = Math.min(Math.max(1, c.letter_count || 6), LETTER_ORDER.length);

    const bName = document.createElement("b");
    bName.textContent = `🏫 ${c.name}`;
    info.append(
      bName,
      makeBadge(`Kod: ${c.code}`, "cls"),
      makeBadge(`👩‍🏫 ${tLabel}`),
      makeBadge(`🔤 ${lc}. harf (${LETTER_ORDER[lc - 1]})`, "unlock")
    );

    const editBox = document.createElement("div");
    editBox.className = "edit-box";
    editBox.hidden = true;

    const nameIn = document.createElement("input");
    nameIn.type = "text";
    nameIn.value = c.name || "";

    const codeIn = document.createElement("input");
    codeIn.type = "text";
    codeIn.value = c.code || "";
    codeIn.style.textTransform = "uppercase";

    const teacherSel = document.createElement("select");
    const teacherOptions = allTeachers.length ? allTeachers : [{ id: c.teacher_id || "", full_name: tLabel, email: "" }];
    for (const t of teacherOptions) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.email ? teacherDisplayName(t) : (t.full_name || "Öğretmen");
      teacherSel.appendChild(opt);
    }
    if (c.teacher_id && [...teacherSel.options].some((o) => o.value === c.teacher_id)) {
      teacherSel.value = c.teacher_id;
    }

    const letterIn = document.createElement("input");
    letterIn.type = "number";
    letterIn.min = "1";
    letterIn.max = String(LETTER_ORDER.length);
    letterIn.value = String(lc);

    const wrapField = (lblText, el) => {
      const lbl = document.createElement("label");
      lbl.className = "adm-label";
      lbl.textContent = lblText;
      lbl.appendChild(el);
      return lbl;
    };

    const saveBtn = makeBtn("💾 Kaydet", "good", async () => {
      saveBtn.disabled = true;
      try {
        const pickedTeacher = allTeachers.find((t) => t.id === teacherSel.value);
        const fields = {
          name: nameIn.value.trim().toLocaleUpperCase("tr-TR") || c.name,
          code: codeIn.value.trim().toUpperCase() || c.code,
          letter_count: Math.min(LETTER_ORDER.length, Math.max(1, Number(letterIn.value) || 6))
        };
        if (teacherSel.value) {
          fields.teacher_id = teacherSel.value;
          fields.teacher_name = (pickedTeacher && pickedTeacher.full_name) || "";
        }
        await cloudUpdateClassSettings(c.id, fields);
        setState("classesState", `✅ "${fields.name}" sınıfı güncellendi.`);
        await loadTeachersAndClasses();
      } catch (e) {
        setState("classesState", "❌ " + e.message);
        saveBtn.disabled = false;
      }
    });

    editBox.append(
      wrapField("Sınıf Adı", nameIn),
      wrapField("Davet Kodu", codeIn),
      wrapField("Öğretmen", teacherSel),
      wrapField(`Harf Sayısı (1-${LETTER_ORDER.length})`, letterIn),
      saveBtn
    );

    const actions = document.createElement("div");
    actions.className = "adm-row";
    actions.append(
      makeBtn("✏️ Düzenle", "ghost", () => { editBox.hidden = !editBox.hidden; }),
      makeBtn("📋 Link", "ghost", async () => {
        try { await navigator.clipboard.writeText(classShareLink(c.code)); } catch (e) {}
        setState("classesState", `📋 ${c.name} davet linki kopyalandı: ${classShareLink(c.code)}`);
      }),
      makeBtn("💬 WhatsApp", "good", () => {
        const link = classShareLink(c.code);
        const msg = `Merhaba, Okuyorum ${c.name} sınıfı linkimiz:\n${link}\n(Sınıf kodu: ${c.code})`;
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
      }),
      makeBtn("🗑️ Sil", "danger", async () => {
        if (!confirm(`"${c.name}" sınıfını ve bu sınıfa ait ödev/kelime kayıtlarını silmek istiyor musunuz?`)) return;
        try {
          await cloudDeleteClass(c.id);
          setState("classesState", `🗑️ "${c.name}" sınıfı silindi.`);
          await loadTeachersAndClasses();
          await loadPending();
        } catch (e) {
          setState("classesState", "❌ " + e.message);
        }
      })
    );

    top.append(info, actions);
    card.append(top, editBox);
    listEl.appendChild(card);
  }
}

async function loadTeachersAndClasses() {
  try {
    const res = await cloudAdminTeachers({ action: "list" });
    if (res && Array.isArray(res.teachers)) {
      edgeListSupported = true;
      $("edgeUpgradeNotice").hidden = true;
      allTeachers = res.teachers;
      allClasses = Array.isArray(res.classes) ? res.classes : [];
    } else {
      throw new Error("Liste yanıtı alınamadı.");
    }
  } catch (e) {
    edgeListSupported = false;
    $("edgeUpgradeNotice").hidden = false;
    allTeachers = [];
    allClasses = await cloudListMyClasses(true).catch(() => []);
  }
  populateTeacherDropdowns();
  renderTeachersList();
  renderClassesList();
  updateKPIs();
}

$("teacherSearch").oninput = renderTeachersList;
$("refreshTeachersBtn").onclick = loadTeachersAndClasses;

$("createTeacherBtn").onclick = async () => {
  const tName = $("newTeacherName").value.trim();
  const email = $("newTeacherEmail").value.trim();
  const pass = $("newTeacherPass").value;
  const clsName = $("newTeacherClass").value.trim();
  if (!tName || !email || !pass || !clsName) {
    setState("createTeacherState", "Öğretmen adı, e-posta, şifre ve sınıfı yazın.");
    return;
  }
  setState("createTeacherState", "Öğretmen ve sınıf oluşturuluyor...");
  $("createTeacherBtn").disabled = true;
  try {
    const res = await cloudCreateTeacher(tName, email, pass, clsName);
    $("newTeacherName").value = "";
    $("newTeacherEmail").value = "";
    $("newTeacherPass").value = "";
    $("newTeacherClass").value = "";
    const verb = res.action === "assigned" ? "atandı" : "oluşturuldu";
    setState("createTeacherState", `✅ ${tName} (${res.teacher.email}) için "${res.cls.name}" ${verb}. Link: ${classShareLink(res.cls.code)}`);
    await loadTeachersAndClasses();
  } catch (e) {
    setState("createTeacherState", "❌ " + e.message);
  } finally {
    $("createTeacherBtn").disabled = false;
  }
};

$("createClassBtn").onclick = async () => {
  const name = $("newClassName").value.trim().toLocaleUpperCase("tr-TR");
  if (!name) return;
  const code = name.replace(/[^A-ZÇĞİÖŞÜ0-9]/g, "") || `S${100 + Math.floor(Math.random() * 900)}`;
  const tid = $("newClassTeacher").value || "";
  const tObj = allTeachers.find((t) => t.id === tid);
  const tName = (tObj && tObj.full_name) || "";
  try {
    const created = await cloudCreateClass(name, code, 6, tName, tid);
    $("newClassName").value = "";
    setState("classesState", `✅ "${created.name}" (${created.code}) sınıfı oluşturuldu.`);
    await loadTeachersAndClasses();
  } catch (e) {
    setState("classesState", "❌ " + e.message);
  }
};

/* ---------- ONAY KUYRUĞU ---------- */

function populatePendingFilter() {
  const sel = $("pendingClassFilter");
  const cur = sel.value;
  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "all";
  optAll.textContent = "Tüm Sınıflar";
  sel.appendChild(optAll);

  const seen = new Set();
  for (const p of allPending) {
    const cName = (p.classes && p.classes.name) || "Sınıf";
    if (seen.has(cName)) continue;
    seen.add(cName);
    const opt = document.createElement("option");
    opt.value = cName;
    opt.textContent = cName;
    sel.appendChild(opt);
  }
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

function getFilteredPending() {
  const filter = $("pendingClassFilter").value || "all";
  return allPending.filter((p) => {
    if (filter === "all") return true;
    const cName = (p.classes && p.classes.name) || "Sınıf";
    return cName === filter;
  });
}

function renderPendingList() {
  const listEl = $("pendingList");
  listEl.innerHTML = "";
  const items = getFilteredPending();
  $("approveAllPendingBtn").disabled = items.length === 0;
  if (!items.length) {
    setState("pendingState", "✅ Onay bekleyen yeni kelime/cümle yok.");
    return;
  }
  setState("pendingState", `${items.length} kelime/cümle ortak havuz onayı bekliyor.`);

  for (const p of items) {
    const row = document.createElement("div");
    row.className = "inline-row";

    const kindSel = document.createElement("select");
    kindSel.innerHTML = '<option value="word">Kelime</option><option value="sentence">Cümle</option>';
    kindSel.value = p.kind === "sentence" ? "sentence" : "word";

    const txtIn = document.createElement("input");
    txtIn.type = "text";
    txtIn.className = "txt-in";
    txtIn.value = p.text || "";

    const emIn = document.createElement("input");
    emIn.type = "text";
    emIn.className = "em-in";
    emIn.value = p.emoji || "⭐";

    const unlockBadge = makeBadge("", "unlock");
    const refreshUnlock = () => {
      const info = getUnlockInfo(txtIn.value);
      unlockBadge.textContent = info.text;
      unlockBadge.className = "badge " + (info.ok ? "unlock" : "warn");
    };
    refreshUnlock();
    txtIn.oninput = refreshUnlock;

    const clsBadge = makeBadge(`🏫 ${(p.classes && p.classes.name) || "Sınıf"}`, "cls");

    const okBtn = makeBtn("✅ Ortak Havuza Al", "good", async () => {
      okBtn.disabled = true;
      try {
        await cloudApproveToGlobal({
          id: p.id,
          kind: kindSel.value,
          text: txtIn.value.trim().toLocaleUpperCase("tr-TR"),
          emoji: emIn.value.trim()
        });
        await Promise.all([loadPending(), loadGlobal()]);
      } catch (e) {
        okBtn.disabled = false;
        setState("pendingState", "❌ Hata: " + e.message);
      }
    });

    const noBtn = makeBtn("Reddet", "danger", async () => {
      noBtn.disabled = true;
      try {
        await cloudRejectSuggestion(p.id);
        await loadPending();
      } catch (e) {
        noBtn.disabled = false;
        setState("pendingState", "❌ Hata: " + e.message);
      }
    });

    row.append(kindSel, txtIn, emIn, unlockBadge, clsBadge, okBtn, noBtn);
    listEl.appendChild(row);
  }
}

async function loadPending() {
  setState("pendingState", "Bekleyen öneriler yükleniyor...");
  try {
    allPending = await cloudLoadPendingSuggestions();
    populatePendingFilter();
    renderPendingList();
    updateKPIs();
  } catch (e) {
    setState("pendingState", "❌ Kuyruk yüklenemedi: " + e.message);
  }
}

$("pendingClassFilter").onchange = renderPendingList;
$("refreshPendingBtn").onclick = loadPending;
$("approveAllPendingBtn").onclick = async () => {
  const items = getFilteredPending();
  if (!items.length) return;
  $("approveAllPendingBtn").disabled = true;
  setState("pendingState", `${items.length} öğe ortak havuza ekleniyor...`);
  try {
    for (const p of items) await cloudApproveToGlobal(p);
    await Promise.all([loadPending(), loadGlobal()]);
    setState("pendingState", "✅ Seçili bekleyen öğeler ortak havuza eklendi!");
  } catch (e) {
    setState("pendingState", "❌ Hata: " + e.message);
  } finally {
    $("approveAllPendingBtn").disabled = false;
  }
};

/* ---------- ORTAK KELİME HAVUZU ---------- */

function renderGlobalList() {
  const listEl = $("globalList");
  listEl.innerHTML = "";
  const q = $("globalSearch").value.trim().toLocaleUpperCase("tr-TR");
  const kf = $("globalKindFilter").value;

  const filtered = allGlobal.filter((g) => {
    if (kf !== "all" && g.kind !== kf) return false;
    if (q && !String(g.text || "").toLocaleUpperCase("tr-TR").includes(q)) return false;
    return true;
  });

  if (!filtered.length) {
    setState("globalListState", allGlobal.length ? "Aramaya uygun kayıt bulunamadı." : "Bulut ortak havuzunda henüz eklenmiş kelime yok.");
    return;
  }
  setState("globalListState", `${filtered.length} ortak kayıt listeleniyor.`, false);

  for (const g of filtered) {
    const row = document.createElement("div");
    row.className = "inline-row";

    const kindSel = document.createElement("select");
    kindSel.innerHTML = '<option value="word">Kelime</option><option value="sentence">Cümle</option>';
    kindSel.value = g.kind === "sentence" ? "sentence" : "word";

    const txtIn = document.createElement("input");
    txtIn.type = "text";
    txtIn.className = "txt-in";
    txtIn.value = g.text || "";

    const emIn = document.createElement("input");
    emIn.type = "text";
    emIn.className = "em-in";
    emIn.value = g.emoji || "⭐";

    const unlockBadge = makeBadge("", "unlock");
    const refreshUnlock = () => {
      const info = getUnlockInfo(txtIn.value);
      unlockBadge.textContent = info.text;
      unlockBadge.className = "badge " + (info.ok ? "unlock" : "warn");
    };
    refreshUnlock();
    txtIn.oninput = refreshUnlock;

    const saveBtn = makeBtn("💾 Kaydet", "good", async () => {
      saveBtn.disabled = true;
      try {
        await cloudUpdateGlobalWord(g.id, {
          kind: kindSel.value,
          text: txtIn.value.trim().toLocaleUpperCase("tr-TR"),
          emoji: emIn.value.trim()
        });
        await loadGlobal();
        setState("globalListState", "✅ Güncellendi.");
      } catch (e) {
        saveBtn.disabled = false;
        setState("globalListState", "❌ " + e.message);
      }
    });

    const delBtn = makeBtn("🗑️ Sil", "danger", async () => {
      if (!confirm(`"${g.text}" ortak havuzdan silinsin mi?`)) return;
      delBtn.disabled = true;
      try {
        await cloudDeleteGlobalWord(g.id);
        await loadGlobal();
      } catch (e) {
        delBtn.disabled = false;
        setState("globalListState", "❌ " + e.message);
      }
    });

    row.append(kindSel, txtIn, emIn, unlockBadge, saveBtn, delBtn);
    listEl.appendChild(row);
  }
}

async function loadGlobal() {
  try {
    allGlobal = await cloudLoadGlobalWords();
    renderGlobalList();
    updateKPIs();
  } catch (e) {
    setState("globalListState", "❌ Yüklenemedi: " + e.message);
  }
}

$("globalSearch").oninput = renderGlobalList;
$("globalKindFilter").onchange = renderGlobalList;
$("refreshGlobalBtn").onclick = loadGlobal;

// Manuel toplu ekleme: her satır "KELİME" veya "KELİME 🍎"
function parseGlobalLine(line, defaultKind) {
  const clean = line.trim();
  if (!clean) return null;
  const parts = clean.split(/\s+/);
  const last = parts[parts.length - 1];
  const hasEmojiAtEnd = parts.length > 1 && /[^\p{L}\p{N}.,!?;:'"()-]/u.test(last) && !/[A-ZÇĞİÖŞÜa-zçğıöşü0-9]/.test(last);
  const emoji = hasEmojiAtEnd ? parts.pop() : (defaultKind === "sentence" ? "📖" : "⭐");
  const text = parts.join(" ").trim().toLocaleUpperCase("tr-TR");
  if (!text) return null;
  return { kind: defaultKind, text, emoji };
}

$("globalAddBtn").onclick = async () => {
  const kind = $("globalAddKind").value;
  const lines = $("globalAddText").value.split(/\r?\n/);
  const items = lines.map((l) => parseGlobalLine(l, kind)).filter(Boolean);
  if (!items.length) {
    setState("globalAddState", "En az bir kelime veya cümle yazın.");
    return;
  }
  $("globalAddBtn").disabled = true;
  setState("globalAddState", "Ortak havuza ekleniyor...");
  try {
    await cloudAddGlobalWords(items);
    $("globalAddText").value = "";
    await loadGlobal();
    setState("globalAddState", `✅ ${items.length} öğe ortak havuza eklendi!`);
  } catch (e) {
    setState("globalAddState", "❌ " + e.message);
  } finally {
    $("globalAddBtn").disabled = false;
  }
};

// Sayfa tarama (ortak havuza doğrudan)
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

function renderGlobalScanReview() {
  const listEl = $("globalScanList");
  listEl.innerHTML = "";
  $("globalScanReview").hidden = globalScanItems.length === 0;
  if (!globalScanItems.length) return;

  globalScanItems.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "inline-row";

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = item.selected !== false;
    chk.onchange = () => { item.selected = chk.checked; };

    const kindSel = document.createElement("select");
    kindSel.innerHTML = '<option value="word">Kelime</option><option value="sentence">Cümle</option>';
    kindSel.value = item.kind;
    kindSel.onchange = () => { item.kind = kindSel.value; };

    const txtIn = document.createElement("input");
    txtIn.type = "text";
    txtIn.className = "txt-in";
    txtIn.value = item.text;
    txtIn.oninput = () => { item.text = txtIn.value.toLocaleUpperCase("tr-TR"); };

    const emIn = document.createElement("input");
    emIn.type = "text";
    emIn.className = "em-in";
    emIn.value = item.emoji;
    emIn.oninput = () => { item.emoji = emIn.value; };

    const del = makeBtn("Sil", "danger", () => {
      globalScanItems.splice(idx, 1);
      renderGlobalScanReview();
    });

    row.append(chk, kindSel, txtIn, emIn, del);
    listEl.appendChild(row);
  });
}

async function handleGlobalPageFile(file) {
  if (!file) return;
  setState("globalScanState", "Sayfa sıkıştırılıyor ve okunuyor...");
  try {
    const b64 = await compressImageToJpeg(file);
    const parsed = await cloudScanPage(b64);
    const known = builtinGlobalSet();
    const seen = new Set(globalScanItems.map((it) => `${it.kind}:${it.text}`));
    const added = [];
    const pushParsed = (arr, kind) => {
      for (const pair of Array.isArray(arr) ? arr : []) {
        const text = String(Array.isArray(pair) ? pair[0] : pair || "").trim().toLocaleUpperCase("tr-TR");
        const emoji = String(Array.isArray(pair) && pair[1] ? pair[1] : (kind === "sentence" ? "📖" : "⭐"));
        const k = `${kind}:${text}`;
        if (!text || known.has(k) || seen.has(k)) continue;
        seen.add(k);
        added.push({ kind, text, emoji, selected: true });
      }
    };
    pushParsed(parsed.kelimeler, "word");
    pushParsed(parsed.cumleler, "sentence");
    if (!added.length) {
      setState("globalScanState", "⚠️ Sistemde olmayan yeni kelime/cümle bulunamadı.");
      return;
    }
    globalScanItems = globalScanItems.concat(added);
    renderGlobalScanReview();
    setState("globalScanState", `✅ ${added.length} yeni öğe bulundu. Kontrol edip ortak havuza ekleyebilirsiniz.`);
  } catch (e) {
    setState("globalScanState", "❌ Sayfa okunamadı: " + e.message);
  } finally {
    $("globalScanCamInput").value = "";
    $("globalScanGalInput").value = "";
  }
}

$("globalScanCamBtn").onclick = () => $("globalScanCamInput").click();
$("globalScanGalBtn").onclick = () => $("globalScanGalInput").click();
$("globalScanCamInput").onchange = (e) => handleGlobalPageFile(e.target.files[0]);
$("globalScanGalInput").onchange = (e) => handleGlobalPageFile(e.target.files[0]);
$("globalClearScanBtn").onclick = () => {
  globalScanItems = [];
  renderGlobalScanReview();
  setState("globalScanState", "", false);
};
$("globalPublishScanBtn").onclick = async () => {
  const chosen = globalScanItems
    .filter((it) => it.selected !== false && it.text.trim())
    .map((it) => ({ kind: it.kind, text: it.text.trim().toLocaleUpperCase("tr-TR"), emoji: it.emoji }));
  if (!chosen.length) {
    setState("globalScanState", "Eklenecek en az bir satır seçin.");
    return;
  }
  setState("globalScanState", "Ortak havuza ekleniyor...");
  try {
    await cloudAddGlobalWords(chosen);
    globalScanItems = [];
    renderGlobalScanReview();
    await loadGlobal();
    setState("globalScanState", `🚀 ${chosen.length} yeni öğe ortak havuza eklendi!`);
  } catch (e) {
    setState("globalScanState", "❌ Eklenemedi: " + e.message);
  }
};

/* ---------- OTURUM VE BAŞLANGIÇ ---------- */

async function refreshAdminSession() {
  const session = sbGetSession();
  if (!session) {
    adminProfile = null;
    $("adminLoginCard").hidden = false;
    $("adminDeniedCard").hidden = true;
    $("adminDash").hidden = true;
    $("adminLogoutBtn").hidden = true;
    $("adminUserChip").hidden = true;
    return;
  }
  try {
    adminProfile = await sbGetProfile();
    const isAdmin = adminProfile && adminProfile.role === "admin";
    const nameLabel = (adminProfile && adminProfile.full_name) || session.user.email;
    $("adminUserChip").textContent = `${isAdmin ? "👑" : "👩‍🏫"} ${nameLabel}`;
    $("adminUserChip").hidden = false;
    $("adminLogoutBtn").hidden = false;
    $("adminLoginCard").hidden = true;

    if (!isAdmin) {
      $("adminDeniedCard").hidden = false;
      $("adminDash").hidden = true;
      return;
    }

    $("adminDeniedCard").hidden = true;
    $("adminDash").hidden = false;
    await Promise.all([loadTeachersAndClasses(), loadPending(), loadGlobal()]);
  } catch (e) {
    sbSignOut();
    $("adminLoginCard").hidden = false;
    $("adminDeniedCard").hidden = true;
    $("adminDash").hidden = true;
    $("adminLogoutBtn").hidden = true;
    $("adminUserChip").hidden = true;
  }
}

$("adminLoginForm").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("adminEmail").value.trim();
  const pass = $("adminPass").value;
  if (!email || !pass) {
    setState("adminLoginMsg", "E-posta ve şifre girin.");
    return;
  }
  setState("adminLoginMsg", "Giriş yapılıyor...");
  $("adminLoginBtn").disabled = true;
  try {
    await sbSignIn(email, pass);
    $("adminPass").value = "";
    setState("adminLoginMsg", "", false);
    await refreshAdminSession();
  } catch (err) {
    setState("adminLoginMsg", "❌ " + err.message);
  } finally {
    $("adminLoginBtn").disabled = false;
  }
};

$("adminLogoutBtn").onclick = () => {
  sbSignOut();
  refreshAdminSession();
};
$("adminSwitchAccountBtn").onclick = () => {
  sbSignOut();
  refreshAdminSession();
};

$("adminVer").textContent = `Okuyorum Yönetim · ${ADMIN_VERSION}`;
refreshAdminSession();
