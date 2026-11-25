# 📖 Okuyorum

Okumayı yeni öğrenen (1. sınıf, 6–8 yaş) Türk çocuklar için, **tamamen tarayıcıda çalışan** sesli okuma uygulaması.
Backend yok; sadece statik dosyalar (HTML, CSS, vanilla JS). PWA olarak tablete kurulabilir, temel dosyalar çevrimdışı çalışır.

## Nasıl çalışır?

1. İlk açılışta **"Hangi harfe kadar geldin?"** ekranı çıkar. Çocuk (veya ebeveyn) MEB 2024 ses gruplarından öğrenilen son harfe dokunur; önceki harfler de seçilir.
2. Uygulama yalnızca **seçili harflerden oluşan** hece, kelime ve cümleleri gösterir. Okuma sırasında dikkat dağıtmaması için görsel gizlenir; doğru okunduğunda ödül olarak görünür.
3. 🔊 **Dinle** → kelimeyi yavaşça seslendirir. 🎤 **Oku** → çocuğun okuduğunu kontrol eder. ⬅️ / ➡️ **Sonraki** → gezinme.
4. Doğruysa konfeti + ⭐ + sesli tebrik; yanlışsa hangi sesin eksik olduğu nazikçe söylenir.
5. Seviyeler: **Heceler → Kelimeler → Cümleler**. Puan ve ilerleme `localStorage`'da saklanır.

### İçeriği düzenleme
- `words.js` → `LETTER_GROUPS` / `LETTER_ORDER` (harf sırası, varsayılan MEB 2024 ses grupları), `WORDS` (kelime + emoji), `SENTENCES` (cümle + emoji).
- Harf sırası uygulama içinden de değiştirilebilir: **⚙️ Ebeveyn → Harf sırası**.
- Bir kelime/cümle, sadece seçili harflerden oluşuyorsa gösterilir. Yeni kelime eklemek için `["KELİME", "🙂"]` satırı eklemeniz yeterli (BÜYÜK harfle, `İ`/`I` ayrımına dikkat).

## İki kontrol modu

| Mod | Nasıl | Gereken |
|---|---|---|
| **Anahtarsız** | Tarayıcının `SpeechRecognition` (tr-TR) özelliği; Levenshtein benzerliği ≥ %75 ise doğru | Chrome / Edge (Android, masaüstü) |
| **Yapay zekâ** | Ses (en fazla 6 sn) Gemini'ye gönderilir; heceleme/yavaş okuma kabul edilir | Gemini API anahtarı; Safari/Firefox'ta da çalışır |

Yapay zekâ modunda hata olursa uygulama otomatik olarak anahtarsız moda düşer.
Mikrofon izni reddedilirse veya tarayıcı desteklemiyorsa çocuğa anlaşılır bir mesaj gösterilir.

## Yerelde çalıştırma

```bash
python -m http.server 8000
```
Sonra tarayıcıda `http://localhost:8000` açın (`localhost` mikrofon için güvenli kabul edilir).

## GitHub Pages'te yayınlama (adım adım)

1. Dosyaları repoya gönderin:
   ```bash
   git init
   git add .
   git commit -m "İlk sürüm"
   git branch -M main
   git remote add origin https://github.com/umtyldz/okuyorum.git
   git push -u origin main
   ```
2. GitHub'da repoyu açın → **Settings** → **Pages**.
3. **Build and deployment → Source: Deploy from a branch**.
4. **Branch: `main`**, klasör **`/ (root)`** → **Save**.
5. 1–2 dakika sonra adres hazır olur: **https://umtyldz.github.io/okuyorum/**
6. Tablette Chrome ile açın → ⋮ menüsü → **Ana ekrana ekle / Uygulamayı yükle**.

> Dosyaları güncelleyince `service-worker.js` içindeki `CACHE_VERSION` değerini artırın; aksi halde eski sürüm önbellekte kalabilir.

## Gemini API anahtarı alma

1. https://aistudio.google.com/apikey adresine Google hesabınızla girin.
2. **Create API key** ile anahtar oluşturun (`AIza...` ile başlar).
3. Uygulamada **⚙️ Ebeveyn** panelini açın, anahtarı yapıştırın, **Kaydet**'e basın.
4. Kullanılan modeller `app.js` başındaki `GEMINI_MODELS` listesindedir; hiçbiri çalışmazsa uygulama güncel modelleri otomatik olarak Google'dan sorgular.

## 🔐 Güvenlik notu

- **API anahtarını asla koda, `words.js`'e veya repoya yazmayın.** Repo herkese açıktır; anahtar sızarsa başkaları kotanızı kullanabilir.
- Anahtar yalnızca kullanıcının kendi tarayıcısında (`localStorage`) saklanır ve doğrudan Google'a gönderilir; bu projede sunucu yoktur.
- Çocuğun kullandığı tablette anahtar saklı kalır. Mümkünse AI Studio'da anahtara **kullanım sınırı/kota** koyun, gerekirse silip yenileyin.
- Ses kaydı yalnızca yapay zekâ modunda, "Oku" düğmesine basıldığında alınır ve Google Gemini API'ye gönderilir.
