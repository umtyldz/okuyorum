// Supabase Edge Function: create-teacher
// Yalnızca Admin kullanıcılar tarafından çağrılabilir.
// Öğretmen hesabını (ad + e-posta + şifre) otomatik onaylı oluşturur ve belirtilen sınıfı
// (ör. 1B, 1H) yoksa oluşturur, varsa o sınıfı yeni öğretmene atar.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }
  });
}

function normalizeClassCode(raw: string) {
  const trMap: Record<string, string> = {
    "ç": "C", "Ç": "C", "ğ": "G", "Ğ": "G", "ı": "I", "I": "I",
    "İ": "I", "i": "I", "ö": "O", "Ö": "O", "ş": "S", "Ş": "S", "ü": "U", "Ü": "U"
  };
  const replaced = raw.replace(/[çÇğĞıIİiöÖşŞüÜ]/g, (c) => trMap[c] || c);
  return replaced.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

async function verifyAdmin(authHeader: string, supabaseUrl: string, anonKey: string, serviceKey: string) {
  const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { "apikey": anonKey, "Authorization": authHeader }
  });
  if (!userResp.ok) return { ok: false, status: 401, msg: "Oturum geçersiz. Tekrar giriş yapın." };
  const user = await userResp.json();
  if (!user?.id) return { ok: false, status: 401, msg: "Kullanıcı bulunamadı." };

  const profResp = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`,
    { headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` } }
  );
  if (!profResp.ok) return { ok: false, status: 500, msg: "Profil doğrulanamadı." };
  const rows = await profResp.json();
  if (!rows?.[0] || rows[0].role !== "admin") {
    return { ok: false, status: 403, msg: "Bu işlem için yönetici (admin) yetkisi gerekir." };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResp({ error: "Yalnızca POST desteklenir." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResp({ error: "Sunucu ortam değişkenleri eksik." }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResp({ error: "Yetkisiz erişim." }, 401);
  }
  const check = await verifyAdmin(authHeader, supabaseUrl, anonKey, serviceKey);
  if (!check.ok) return jsonResp({ error: check.msg }, check.status);

  let body: { teacherName?: string; email?: string; password?: string; className?: string };
  try {
    body = await req.json();
  } catch (_) {
    return jsonResp({ error: "Geçersiz JSON gövdesi." }, 400);
  }

  const teacherName = String(body.teacherName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const className = String(body.className || "").trim().toLocaleUpperCase("tr-TR");
  const code = normalizeClassCode(className);

  if (!teacherName) return jsonResp({ error: "Öğretmen adını girin." }, 400);
  if (!email || !email.includes("@")) return jsonResp({ error: "Geçerli bir e-posta girin." }, 400);
  if (password.length < 6) return jsonResp({ error: "Şifre en az 6 karakter olmalı." }, 400);
  if (!className || !code) return jsonResp({ error: "Sınıf adı/kodu girin (ör: 1B veya 1H)." }, 400);

  // 1) Öğretmen hesabını oluştur (otomatik onaylı)
  const createResp = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password, email_confirm: true })
  });
  const createData = await createResp.json().catch(() => ({}));
  if (!createResp.ok || !createData?.id) {
    const errMsg = createData.msg || createData.message || createData.error_description || `Kullanıcı oluşturulamadı (HTTP ${createResp.status})`;
    return jsonResp({ error: errMsg }, 400);
  }

  const adminHeaders = {
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  };

  // Öğretmen adını profiles tablosuna yaz
  await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(createData.id)}`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ full_name: teacherName })
  });

  // 2) Sınıf kodu zaten varsa yeni öğretmene ata; yoksa oluştur
  const findResp = await fetch(
    `${supabaseUrl}/rest/v1/classes?code=eq.${encodeURIComponent(code)}&select=*`,
    { headers: adminHeaders }
  );
  const existing = findResp.ok ? (await findResp.json())?.[0] : null;

  async function upsertClass(withTeacherName: boolean) {
    if (existing?.id) {
      const patchBody: Record<string, unknown> = { teacher_id: createData.id, name: className };
      if (withTeacherName) patchBody.teacher_name = teacherName;
      return fetch(`${supabaseUrl}/rest/v1/classes?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify(patchBody)
      });
    }
    const postBody: Record<string, unknown> = {
      name: className,
      code,
      teacher_id: createData.id,
      letter_count: 6
    };
    if (withTeacherName) postBody.teacher_name = teacherName;
    return fetch(`${supabaseUrl}/rest/v1/classes`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(postBody)
    });
  }

  const action = existing?.id ? "assigned" : "created";
  let clsResp = await upsertClass(true);
  let clsData = await clsResp.json().catch(() => null);
  if (!clsResp.ok && /teacher_name/i.test(String(clsData?.message || ""))) {
    // teacher_name sütunu henüz eklenmemişse onsuz tekrar dene
    clsResp = await upsertClass(false);
    clsData = await clsResp.json().catch(() => null);
  }

  if (!clsResp.ok || !clsData?.[0]) {
    return jsonResp({
      error: (clsData?.message || "Öğretmen açıldı ama sınıf atanamadı.")
    }, 500);
  }

  return jsonResp({
    teacher: { id: createData.id, email: createData.email, name: teacherName },
    cls: clsData[0],
    action
  }, 200);
});
