/* =====================================================================
   cloud.js — Okuyorum Supabase REST / Auth istemcisi (harici kütüphanesiz)
   Çevrimdışı (PWA) uyumlu; yalnızca tarayıcı fetch() ve localStorage kullanır.
   ===================================================================== */
"use strict";

const SUPABASE_URL = "https://sbdpayzdwpdmcencigbz.supabase.co";
const SUPABASE_KEY = "sb_publishable_pFjoLTR1q1mdBgJC-tTEZA_RlpLPctt";

const CLOUD_LS = {
  session: "okuyorum.sbSession",
  globalCache: "okuyorum.cloudGlobalCache",
  classCache: "okuyorum.cloudClassCache",
  classWordsCache: "okuyorum.cloudClassWordsCache"
};

function cloudGetLS(k) {
  try { return localStorage.getItem(k); } catch (e) { return null; }
}
function cloudSetLS(k, v) {
  try { localStorage.setItem(k, v); } catch (e) {}
}
function cloudDelLS(k) {
  try { localStorage.removeItem(k); } catch (e) {}
}
function cloudParseJSON(s, fallback) {
  try { return JSON.parse(s) || fallback; } catch (e) { return fallback; }
}

/* ---------- 1) OTURUM YÖNETİMİ ---------- */

function sbGetSession() {
  const s = cloudParseJSON(cloudGetLS(CLOUD_LS.session), null);
  return s && s.access_token && s.user ? s : null;
}

function sbSaveSession(data) {
  if (!data || !data.access_token || !data.user) return null;
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || "",
    expires_at: Math.floor(Date.now() / 1000) + (Number(data.expires_in) || 3600),
    user: {
      id: data.user.id,
      email: data.user.email || ""
    }
  };
  cloudSetLS(CLOUD_LS.session, JSON.stringify(session));
  return session;
}

function sbSignOut() {
  cloudDelLS(CLOUD_LS.session);
}

async function sbSignIn(email, password) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: email.trim(), password })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error_description || data.msg || data.message || `Giriş başarısız (HTTP ${resp.status})`);
  }
  return sbSaveSession(data);
}

async function sbRefreshSession() {
  const cur = sbGetSession();
  if (!cur || !cur.refresh_token) {
    sbSignOut();
    return null;
  }
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token: cur.refresh_token })
    });
    if (!resp.ok) {
      sbSignOut();
      return null;
    }
    const data = await resp.json();
    return sbSaveSession(data);
  } catch (e) {
    return null;
  }
}

async function sbEnsureValidSession() {
  const s = sbGetSession();
  if (!s) return null;
  if (s.expires_at && s.expires_at - Math.floor(Date.now() / 1000) < 60) {
    return await sbRefreshSession();
  }
  return s;
}

/* ---------- 2) GENEL REST İSTEK YARDIMCISI ---------- */

async function sbFetch(path, opts = {}) {
  const useAuth = opts.auth !== false;
  let session = useAuth ? await sbEnsureValidSession() : null;
  if (opts.requireAuth && !session) throw new Error("Oturum kapalı. Lütfen tekrar giriş yapın.");

  const headers = Object.assign({
    "apikey": SUPABASE_KEY,
    "Content-Type": "application/json"
  }, opts.headers || {});

  if (useAuth && session) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const ctrl = opts.timeoutMs ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : null;
  let resp;
  try {
    resp = await fetch(`${SUPABASE_URL}${path}`, {
      method: opts.method || "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl ? ctrl.signal : undefined
    });
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (resp.status === 401 && useAuth && session && !opts._retried) {
    const refreshed = await sbRefreshSession();
    if (refreshed) {
      return sbFetch(path, Object.assign({}, opts, { _retried: true }));
    }
  }

  const text = await resp.text();
  const data = text ? cloudParseJSON(text, null) : null;
  if (!resp.ok) {
    const msg = (data && (data.error || data.message || data.error_description || data.hint)) || `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return data;
}

async function sbGetProfile() {
  const s = sbGetSession();
  if (!s) return null;
  const rows = await sbFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(s.user.id)}&select=role,full_name`, {
    requireAuth: true
  });
  return (rows && rows[0]) || { role: "teacher", full_name: "" };
}

/* ---------- 3) ÖĞRENCİ / HERKESE AÇIK OKUMA (OFFLINE ÖNBELLEKLİ) ---------- */

async function cloudLoadGlobalWords() {
  try {
    const rows = await sbFetch("/rest/v1/global_words?select=id,kind,text,emoji&order=id.asc", { auth: false });
    const list = Array.isArray(rows) ? rows : [];
    cloudSetLS(CLOUD_LS.globalCache, JSON.stringify(list));
    return list;
  } catch (e) {
    return cloudParseJSON(cloudGetLS(CLOUD_LS.globalCache), []);
  }
}

async function cloudFindClassByCode(code) {
  const cleanCode = String(code || "").trim().toUpperCase();
  if (!cleanCode) return null;
  try {
    const rows = await sbFetch(
      `/rest/v1/classes?code=eq.${encodeURIComponent(cleanCode)}&select=*`,
      { auth: false }
    );
    const cls = (rows && rows[0]) || null;
    if (cls) cloudSetLS(CLOUD_LS.classCache, JSON.stringify(cls));
    return cls;
  } catch (e) {
    const cached = cloudParseJSON(cloudGetLS(CLOUD_LS.classCache), null);
    return cached && cached.code === cleanCode ? cached : null;
  }
}

async function cloudLoadClassWords(classId) {
  if (!classId) return [];
  try {
    const rows = await sbFetch(
      `/rest/v1/class_words?class_id=eq.${encodeURIComponent(classId)}&select=id,kind,text,emoji,is_homework,status&order=id.desc`,
      { auth: false }
    );
    const list = Array.isArray(rows) ? rows : [];
    cloudSetLS(CLOUD_LS.classWordsCache, JSON.stringify({ classId, list }));
    return list;
  } catch (e) {
    const cached = cloudParseJSON(cloudGetLS(CLOUD_LS.classWordsCache), null);
    return cached && cached.classId === classId && Array.isArray(cached.list) ? cached.list : [];
  }
}

function cloudClearClassCache() {
  cloudDelLS(CLOUD_LS.classCache);
  cloudDelLS(CLOUD_LS.classWordsCache);
}

/* ---------- 4) ÖĞRETMEN İŞLEMLERİ ---------- */

async function cloudListMyClasses(isAdmin) {
  const s = await sbEnsureValidSession();
  if (!s) throw new Error("Giriş gerekli.");
  const filter = isAdmin ? "" : `teacher_id=eq.${encodeURIComponent(s.user.id)}&`;
  const rows = await sbFetch(
    `/rest/v1/classes?${filter}select=*&order=created_at.desc`,
    { requireAuth: true }
  );
  return Array.isArray(rows) ? rows : [];
}

async function cloudCreateClass(name, code, letterCount, teacherName = "") {
  const s = await sbEnsureValidSession();
  if (!s) throw new Error("Giriş gerekli.");
  const payload = {
    name: String(name || "").trim(),
    code: String(code || "").trim().toUpperCase(),
    teacher_id: s.user.id,
    letter_count: Math.max(0, Math.min(29, Number(letterCount) || 6))
  };
  if (teacherName) payload.teacher_name = String(teacherName).trim();
  try {
    const rows = await sbFetch("/rest/v1/classes", {
      method: "POST",
      requireAuth: true,
      headers: { "Prefer": "return=representation" },
      body: payload
    });
    return rows && rows[0];
  } catch (e) {
    if (payload.teacher_name && /teacher_name/i.test(e.message)) {
      delete payload.teacher_name;
      const rows = await sbFetch("/rest/v1/classes", {
        method: "POST",
        requireAuth: true,
        headers: { "Prefer": "return=representation" },
        body: payload
      });
      return rows && rows[0];
    }
    throw e;
  }
}

async function cloudUpdateClassSettings(classId, fields) {
  const body = Object.assign({}, fields);
  if (body.letter_count !== undefined) {
    body.letter_count = Math.max(0, Math.min(29, Number(body.letter_count) || 6));
  }
  try {
    return await sbFetch(`/rest/v1/classes?id=eq.${encodeURIComponent(classId)}`, {
      method: "PATCH",
      requireAuth: true,
      headers: { "Prefer": "return=representation" },
      body
    });
  } catch (e) {
    // Ek sütunlar henüz yoksa yalnızca letter_count güncellemeyi dene
    if (/letter_order|teacher_name/i.test(e.message) && body.letter_count !== undefined) {
      return sbFetch(`/rest/v1/classes?id=eq.${encodeURIComponent(classId)}`, {
        method: "PATCH",
        requireAuth: true,
        headers: { "Prefer": "return=representation" },
        body: { letter_count: body.letter_count }
      });
    }
    throw e;
  }
}

async function cloudDeleteClass(classId) {
  return sbFetch(`/rest/v1/classes?id=eq.${encodeURIComponent(classId)}`, {
    method: "DELETE",
    requireAuth: true
  });
}

async function cloudPublishClassWords(classId, items, replaceHomework) {
  // PostgREST on_conflict aynı batch içinde tekrarlı anahtara hata verir; önce tekilleştir
  const map = new Map();
  for (const it of items) {
    const kind = it.kind === "sentence" ? "sentence" : "word";
    const text = String(it.text || "").trim().toLocaleUpperCase("tr-TR");
    if (!text) continue;
    const key = `${kind}:${text}`;
    map.set(key, {
      class_id: classId,
      kind,
      text,
      emoji: String(it.emoji || "").trim() || (kind === "sentence" ? "📖" : "⭐"),
      is_homework: true,
      status: it.status === "approved" ? "approved" : "pending"
    });
  }
  const rows = [...map.values()];

  if (replaceHomework) {
    await sbFetch(`/rest/v1/class_words?class_id=eq.${encodeURIComponent(classId)}&is_homework=eq.true`, {
      method: "PATCH",
      requireAuth: true,
      body: { is_homework: false }
    });
  }

  if (!rows.length) return [];
  return sbFetch("/rest/v1/class_words?on_conflict=class_id,kind,text", {
    method: "POST",
    requireAuth: true,
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: rows
  });
}

async function cloudToggleHomework(id, isHomework) {
  return sbFetch(`/rest/v1/class_words?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    requireAuth: true,
    body: { is_homework: !!isHomework }
  });
}

async function cloudDeleteClassWord(id) {
  return sbFetch(`/rest/v1/class_words?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    requireAuth: true
  });
}

/* ---------- 5) YÖNETİCİ (ADMIN) ONAY KUYRUĞU ---------- */

async function cloudLoadPendingSuggestions() {
  const rows = await sbFetch(
    "/rest/v1/class_words?status=eq.pending&select=id,class_id,kind,text,emoji,created_at,classes(name,code)&order=created_at.desc",
    { requireAuth: true }
  );
  return Array.isArray(rows) ? rows : [];
}

async function cloudApproveToGlobal(item) {
  const s = await sbEnsureValidSession();
  if (!s) throw new Error("Giriş gerekli.");
  const kind = item.kind === "sentence" ? "sentence" : "word";
  const text = String(item.text || "").trim().toLocaleUpperCase("tr-TR");
  const emoji = String(item.emoji || "").trim() || "⭐";
  if (!text) return;

  await sbFetch("/rest/v1/global_words?on_conflict=kind,text", {
    method: "POST",
    requireAuth: true,
    headers: { "Prefer": "resolution=ignore-duplicates,return=representation" },
    body: [{ kind, text, emoji, created_by: s.user.id }]
  });

  // Aynı kelime/cümle farklı sınıflardan bekliyorsa hepsini onaylıya çek
  await sbFetch(
    `/rest/v1/class_words?kind=eq.${encodeURIComponent(kind)}&text=eq.${encodeURIComponent(text)}&status=eq.pending`,
    {
      method: "PATCH",
      requireAuth: true,
      body: { status: "approved", emoji }
    }
  );
  if (item.id) {
    await sbFetch(`/rest/v1/class_words?id=eq.${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      requireAuth: true,
      body: { status: "approved", emoji }
    });
  }
}

async function cloudRejectSuggestion(id) {
  return sbFetch(`/rest/v1/class_words?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    requireAuth: true,
    body: { status: "rejected" }
  });
}

/* ---------- 6) MERKEZİ SAYFA TARAMA (EDGE FUNCTION) ---------- */

async function cloudScanPage(imageBase64) {
  return sbFetch("/functions/v1/scan-page", {
    method: "POST",
    requireAuth: true,
    timeoutMs: 30000,
    body: { imageBase64 }
  });
}

async function cloudCreateTeacher(teacherName, email, password, className) {
  return sbFetch("/functions/v1/create-teacher", {
    method: "POST",
    requireAuth: true,
    timeoutMs: 20000,
    body: { teacherName, email, password, className }
  });
}
