// Supabase Edge Function: create-teacher
// Yalnızca Admin kullanıcılar tarafından çağrılabilir.
// action:
//   - "list": Tüm kullanıcı/öğretmen ve sınıf listesini döner (okul bilgisi dahil)
//   - "create" (varsayılan): Öğretmen hesabını açar ve sınıfı oluşturur/atar
//   - "update": Öğretmenin ad, okul, e-posta ve/veya şifresini günceller
//   - "delete": Öğretmeni siler (sınıflarını güvenli biçimde yöneticiye devreder)

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

function schoolPrefix(schoolName: string) {
  const words = String(schoolName || "").trim().split(/\s+/).map(normalizeClassCode).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 3).map((w) => w[0]).join("");
  if (words.length === 1) return words[0].slice(0, 3);
  return "S";
}

async function verifyAdmin(authHeader: string, supabaseUrl: string, anonKey: string, serviceKey: string) {
  const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { "apikey": anonKey, "Authorization": authHeader }
  });
  if (!userResp.ok) return { ok: false as const, status: 401, msg: "Oturum geçersiz. Tekrar giriş yapın." };
  const user = await userResp.json();
  if (!user?.id) return { ok: false as const, status: 401, msg: "Kullanıcı bulunamadı." };

  const profResp = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`,
    { headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` } }
  );
  if (!profResp.ok) return { ok: false as const, status: 500, msg: "Profil doğrulanamadı." };
  const rows = await profResp.json();
  if (!rows?.[0] || rows[0].role !== "admin") {
    return { ok: false as const, status: 403, msg: "Bu işlem için yönetici (admin) yetkisi gerekir." };
  }
  return { ok: true as const, userId: String(user.id) };
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

  let body: {
    action?: string;
    userId?: string;
    teacherName?: string;
    schoolName?: string;
    email?: string;
    password?: string;
    className?: string;
  };
  try {
    body = await req.json();
  } catch (_) {
    return jsonResp({ error: "Geçersiz JSON gövdesi." }, 400);
  }

  const action = String(body.action || "create").trim().toLowerCase();
  const adminHeaders = {
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  };

  // --- LIST: Tüm öğretmenler / kullanıcılar + sınıflar ---
  if (action === "list") {
    const [usersResp, profResp, clsResp] = await Promise.all([
      fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=200`, {
        headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` }
      }),
      fetch(`${supabaseUrl}/rest/v1/profiles?select=id,role,full_name,school_name`, { headers: adminHeaders }),
      fetch(`${supabaseUrl}/rest/v1/classes?select=*&order=created_at.desc`, { headers: adminHeaders })
    ]);
    if (!usersResp.ok) return jsonResp({ error: "Kullanıcı listesi alınamadı." }, 500);
    const usersData = await usersResp.json().catch(() => ({}));
    const rawUsers = Array.isArray(usersData?.users) ? usersData.users : [];
    let profiles = profResp.ok ? await profResp.json().catch(() => []) : null;
    if (!profiles) {
      // school_name sütunu henüz eklenmemişse onsuz dene
      const fallbackProf = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,role,full_name`, {
        headers: adminHeaders
      });
      profiles = fallbackProf.ok ? await fallbackProf.json().catch(() => []) : [];
    }
    const classes = clsResp.ok ? await clsResp.json().catch(() => []) : [];

    const profMap = new Map<string, { role?: string; full_name?: string; school_name?: string }>();
    for (const p of Array.isArray(profiles) ? profiles : []) {
      profMap.set(p.id, p);
    }

    const teachers = rawUsers.map((u: Record<string, unknown>) => {
      const id = String(u.id || "");
      const p = profMap.get(id) || {};
      return {
        id,
        email: String(u.email || ""),
        full_name: String(p.full_name || ""),
        school_name: String(p.school_name || ""),
        role: String(p.role || "teacher"),
        created_at: u.created_at || null,
        last_sign_in_at: u.last_sign_in_at || null
      };
    });

    return jsonResp({ teachers, classes }, 200);
  }

  // --- UPDATE: Öğretmen adı / okul adı / e-posta / şifre güncelle ---
  if (action === "update") {
    const userId = String(body.userId || "").trim();
    if (!userId) return jsonResp({ error: "Kullanıcı kimliği (userId) gerekli." }, 400);

    const hasName = body.teacherName !== undefined;
    const hasSchool = body.schoolName !== undefined;
    const teacherName = hasName ? String(body.teacherName || "").trim() : undefined;
    const schoolName = hasSchool ? String(body.schoolName || "").trim().toLocaleUpperCase("tr-TR") : undefined;
    const email = body.email !== undefined ? String(body.email || "").trim().toLowerCase() : "";
    const password = body.password !== undefined ? String(body.password || "") : "";

    if (email && !email.includes("@")) return jsonResp({ error: "Geçerli bir e-posta girin." }, 400);
    if (password && password.length < 6) return jsonResp({ error: "Yeni şifre en az 6 karakter olmalı." }, 400);

    if (email || password) {
      const authPatch: Record<string, unknown> = {};
      if (email) {
        authPatch.email = email;
        authPatch.email_confirm = true;
      }
      if (password) authPatch.password = password;

      const uResp = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "PUT",
        headers: {
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(authPatch)
      });
      const uData = await uResp.json().catch(() => ({}));
      if (!uResp.ok) {
        const errMsg = uData.msg || uData.message || uData.error_description || `Hesap güncellenemedi (HTTP ${uResp.status})`;
        return jsonResp({ error: errMsg }, 400);
      }
    }

    if (hasName || hasSchool) {
      const profPatch: Record<string, unknown> = {};
      if (hasName) profPatch.full_name = teacherName;
      if (hasSchool) profPatch.school_name = schoolName;
      const pResp = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify(profPatch)
      });
      if (!pResp.ok && hasSchool && hasName) {
        await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: adminHeaders,
          body: JSON.stringify({ full_name: teacherName })
        }).catch(() => {});
      }

      // Öğretmenin sahip olduğu sınıflardaki teacher_name / school_name alanlarını da güncelle
      const clsPatch: Record<string, unknown> = {};
      if (hasName) clsPatch.teacher_name = teacherName;
      if (hasSchool) clsPatch.school_name = schoolName;
      const cResp = await fetch(`${supabaseUrl}/rest/v1/classes?teacher_id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify(clsPatch)
      });
      if (!cResp.ok && hasSchool && hasName) {
        await fetch(`${supabaseUrl}/rest/v1/classes?teacher_id=eq.${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: adminHeaders,
          body: JSON.stringify({ teacher_name: teacherName })
        }).catch(() => {});
      }
    }

    return jsonResp({ ok: true, userId }, 200);
  }

  // --- DELETE: Öğretmeni sil (sınıfları güvenli şekilde yöneticiye devret) ---
  if (action === "delete") {
    const userId = String(body.userId || "").trim();
    if (!userId) return jsonResp({ error: "Kullanıcı kimliği (userId) gerekli." }, 400);
    if (userId === check.userId) {
      return jsonResp({ error: "Kendi yönetici hesabınızı silemezsiniz." }, 400);
    }

    const reassignResp = await fetch(`${supabaseUrl}/rest/v1/classes?teacher_id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ teacher_id: check.userId, teacher_name: "" })
    });
    if (!reassignResp.ok) {
      await fetch(`${supabaseUrl}/rest/v1/classes?teacher_id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ teacher_id: check.userId })
      }).catch(() => {});
    }

    const delResp = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: {
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`
      }
    });
    if (!delResp.ok) {
      const errData = await delResp.json().catch(() => ({}));
      return jsonResp({ error: errData.msg || errData.message || `Öğretmen silinemedi (HTTP ${delResp.status})` }, 400);
    }

    return jsonResp({ ok: true, deletedId: userId }, 200);
  }

  // --- CREATE (varsayılan): Yeni öğretmen + sınıf ---
  const teacherName = String(body.teacherName || "").trim();
  const schoolName = String(body.schoolName || "").trim().toLocaleUpperCase("tr-TR");
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const className = String(body.className || "").trim().toLocaleUpperCase("tr-TR");
  const baseCode = normalizeClassCode(className);

  if (!teacherName) return jsonResp({ error: "Öğretmen adını girin." }, 400);
  if (!email || !email.includes("@")) return jsonResp({ error: "Geçerli bir e-posta girin." }, 400);
  if (password.length < 6) return jsonResp({ error: "Şifre en az 6 karakter olmalı." }, 400);
  if (!className || !baseCode) return jsonResp({ error: "Sınıf adı/kodu girin (ör: 1B veya 1F)." }, 400);

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

  // Öğretmen adını ve okulunu profiles tablosuna yaz
  const profPatchResp = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(createData.id)}`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ full_name: teacherName, school_name: schoolName })
  });
  if (!profPatchResp.ok) {
    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(createData.id)}`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ full_name: teacherName })
    }).catch(() => {});
  }

  // 2) Sınıf kodu kontrolü: aynı okuldaysa (veya mevcut okul boşsa) ata; farklı okuldaysa çakışmasız yeni kod üret
  async function findClassByCode(c: string) {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/classes?code=eq.${encodeURIComponent(c)}&select=*`,
      { headers: adminHeaders }
    );
    return r.ok ? (await r.json())?.[0] : null;
  }

  const existing = await findClassByCode(baseCode);
  const existingSchool = String(existing?.school_name || "").trim().toLocaleUpperCase("tr-TR");
  const canAssignExisting = !!(existing?.id && (existingSchool === "" || existingSchool === schoolName));

  let targetCode = baseCode;
  if (existing?.id && !canAssignExisting) {
    const prefix = schoolPrefix(schoolName);
    let candidate = (prefix + baseCode).slice(0, 14);
    let n = 2;
    while (await findClassByCode(candidate)) {
      candidate = (prefix + baseCode + String(n++)).slice(0, 14);
    }
    targetCode = candidate;
  }

  async function upsertClass(withTeacherName: boolean, withSchoolName: boolean) {
    if (canAssignExisting) {
      const patchBody: Record<string, unknown> = { teacher_id: createData.id, name: className };
      if (withTeacherName) patchBody.teacher_name = teacherName;
      if (withSchoolName) patchBody.school_name = schoolName;
      return fetch(`${supabaseUrl}/rest/v1/classes?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify(patchBody)
      });
    }
    const postBody: Record<string, unknown> = {
      name: className,
      code: targetCode,
      teacher_id: createData.id,
      letter_count: 6
    };
    if (withTeacherName) postBody.teacher_name = teacherName;
    if (withSchoolName) postBody.school_name = schoolName;
    return fetch(`${supabaseUrl}/rest/v1/classes`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(postBody)
    });
  }

  const clsAction = canAssignExisting ? "assigned" : "created";
  let withTeacher = true;
  let withSchool = true;
  let clsResp = await upsertClass(withTeacher, withSchool);
  let clsData = await clsResp.json().catch(() => null);
  for (let attempt = 0; attempt < 2 && !clsResp.ok; attempt++) {
    const msg = String(clsData?.message || "");
    if (/school_name/i.test(msg)) withSchool = false;
    else if (/teacher_name/i.test(msg)) withTeacher = false;
    else break;
    clsResp = await upsertClass(withTeacher, withSchool);
    clsData = await clsResp.json().catch(() => null);
  }

  if (!clsResp.ok || !clsData?.[0]) {
    return jsonResp({
      error: (clsData?.message || "Öğretmen açıldı ama sınıf atanamadı.")
    }, 500);
  }

  return jsonResp({
    teacher: { id: createData.id, email: createData.email, name: teacherName, school: schoolName },
    cls: clsData[0],
    action: clsAction
  }, 200);
});
