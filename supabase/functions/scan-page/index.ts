// Supabase Edge Function: scan-page
// Giriş yapmış öğretmen/admin kullanıcıları adına kameradan çekilen sayfa görselini
// Gemini Vision ile okur; GEMINI_API_KEY yalnızca Supabase Secrets kasasında saklanır.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-3-flash-preview",
  "gemini-3.8-flash",
  "gemini-2.5-flash-lite"
];

const PROMPT =
  'Bu fotoğrafta 1. sınıf Türkçe okuma kitabı veya çalışma sayfası var. ' +
  'Sayfadaki okuma alıştırması olan Türkçe kelimeleri ve kısa cümleleri çıkar. ' +
  'Kurallar: 1) Sayfa numaralarını, "Okuyunuz/Yazınız" gibi yönergeleri ve başlıkları alma. ' +
  '2) "ka-lem" veya "ar-mut" gibi hece tireli kelimeleri birleştir ("KALEM", "ARMUT"). ' +
  '3) Her şeyi Türkçe BÜYÜK harfle yaz (İ ve I ayrımına dikkat et). ' +
  '4) Her kelime ve cümle için uygun tek bir emoji seç. ' +
  'Sadece şu JSON formatında yanıt ver: {"kelimeler":[["KELİME","🍎"]],"cumleler":[["CÜMLE.","📖"]]}';

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }
  });
}

async function verifyUser(authHeader: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anonKey) return false;
  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      "apikey": anonKey,
      "Authorization": authHeader
    }
  });
  return resp.ok;
}

function buildBody(model: string, imageBase64: string, useThinking: boolean) {
  const gen: Record<string, unknown> = {
    responseMimeType: "application/json",
    temperature: 0.1,
    maxOutputTokens: 2048
  };
  if (useThinking) {
    if (/gemini-2\.5/.test(model)) {
      gen.thinkingConfig = { thinkingBudget: 0, includeThoughts: false };
    } else if (/gemini-3/.test(model)) {
      gen.thinkingConfig = { thinkingLevel: "minimal", includeThoughts: false };
    }
  }
  return {
    contents: [{
      parts: [
        { text: PROMPT },
        { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
      ]
    }],
    generationConfig: gen
  };
}

async function tryModels(apiKey: string, imageBase64: string, models: string[], errors: string[]) {
  for (const model of models) {
    let useThinking = true;
    while (true) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 22000);
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify(buildBody(model, imageBase64, useThinking)),
            signal: ctrl.signal
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          const parts = data?.candidates?.[0]?.content?.parts;
          if (!Array.isArray(parts) || !parts.length) {
            errors.push(`[${model}] Boş Gemini yanıtı`);
            break;
          }
          const raw = parts
            .filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === "string")
            .map((p: { text: string }) => p.text)
            .join("")
            .trim();
          const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
          const parsed = JSON.parse(cleaned);
          return {
            kelimeler: Array.isArray(parsed.kelimeler) ? parsed.kelimeler : [],
            cumleler: Array.isArray(parsed.cumleler) ? parsed.cumleler : [],
            model
          };
        }
        let detail = "";
        try { detail = (await resp.json()).error?.message || ""; } catch (_) {}
        if (resp.status === 400 && useThinking && /thinking/i.test(detail)) {
          useThinking = false;
          continue;
        }
        errors.push(`HTTP ${resp.status} [${model}] ${detail.slice(0, 140)}`);
        if (/API key/i.test(detail) || resp.status === 401 || resp.status === 403) return null;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`[${model}] ${msg}`);
        break;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  return null;
}

async function discoverModels(apiKey: string, errors: string[]) {
  try {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": apiKey }
    });
    if (!resp.ok) {
      errors.push(`ListModels HTTP ${resp.status}`);
      return [];
    }
    const list = (await resp.json()).models || [];
    const ver = (n: string) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || ["0", "0"])[1]);
    return list
      .filter((m: { supportedGenerationMethods?: string[] }) =>
        (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m: { name: string }) => m.name.replace(/^models\//, ""))
      .filter((n: string) => /flash/.test(n) && !/image|tts|live|embed|robotics|computer|thinking|exp/.test(n))
      .sort((a: string, b: string) =>
        (Number(/lite/.test(a)) - Number(/lite/.test(b))) || (ver(b) - ver(a)) || (a.length - b.length));
  } catch (err) {
    errors.push("ListModels başarısız");
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResp({ error: "Yalnızca POST desteklenir." }, 405);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ") || !(await verifyUser(authHeader))) {
    return jsonResp({ error: "Yetkisiz erişim. Öğretmen hesabıyla giriş yapın." }, 401);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
  if (!apiKey) {
    return jsonResp({ error: "Sunucuda GEMINI_API_KEY tanımlı değil." }, 500);
  }

  let body: { imageBase64?: string };
  try {
    body = await req.json();
  } catch (_) {
    return jsonResp({ error: "Geçersiz JSON gövdesi." }, 400);
  }

  const imageBase64 = String(body.imageBase64 || "").trim();
  if (!imageBase64) {
    return jsonResp({ error: "Görsel verisi eksik." }, 400);
  }
  if (imageBase64.length > 4_200_000) {
    return jsonResp({ error: "Görsel çok büyük (en fazla 3 MB)." }, 413);
  }

  const errors: string[] = [];
  const first = await tryModels(apiKey, imageBase64, GEMINI_MODELS, errors);
  if (first) return jsonResp(first, 200);

  if (!errors.some((e) => /API key|HTTP 401|HTTP 403/i.test(e))) {
    const extra = (await discoverModels(apiKey, errors)).filter((m: string) => !GEMINI_MODELS.includes(m));
    const second = await tryModels(apiKey, imageBase64, extra.slice(0, 4), errors);
    if (second) return jsonResp(second, 200);
  }

  return jsonResp({ error: errors.join(" | ") || "Sayfa okunamadı." }, 502);
});
