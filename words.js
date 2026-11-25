/* =====================================================================
   words.js  —  Okuyorum: kelime / cümle / harf sırası verileri
   Bu dosya kolayca düzenlenebilir. Kurallar:
   - Her şey BÜYÜK harfle yazılır (İ ve I farkına dikkat: KEDİ, ARI, ISPANAK).
   - Uygulama, çocuğun seçtiği harflere göre listeleri OTOMATİK süzer:
     bir kelime/cümle sadece seçili harflerden oluşuyorsa gösterilir.
   - Yeni kelime eklemek için sadece ["KELİME", "emoji"] satırı eklemek yeterli.
   ===================================================================== */

/* ---------------------------------------------------------------------
   HARF SIRASI  (MEB 2024 İlkokuma 5 ses/harf grubu sırası)
   Çocuklar harfleri bu sırayla öğrenir. Kendi sınıfınızın sırası farklıysa
   buradaki diziyi değiştirin YA DA uygulamada
   "Ebeveyn" bölümünden "Harf sırası" kutusuna yazın (tarayıcıda saklanır).
   --------------------------------------------------------------------- */
const LETTER_GROUPS = [
  { name: "1. Grup", letters: ["A", "N", "E", "T", "İ", "L"] },
  { name: "2. Grup", letters: ["O", "K", "U", "R", "I", "M"] },
  { name: "3. Grup", letters: ["Ü", "S", "Ö", "Y", "D", "Z"] },
  { name: "4. Grup", letters: ["Ç", "B", "G", "C", "Ş"] },
  { name: "5. Grup", letters: ["P", "H", "V", "Ğ", "F", "J"] }
];

const LETTER_ORDER = LETTER_GROUPS.flatMap((g) => g.letters);

/* Ünlü (sesli) harfler — hece üretimi ve hece bölme için kullanılır */
const VOWELS = ["A", "E", "I", "İ", "O", "Ö", "U", "Ü"];

/* ---------------------------------------------------------------------
   KELİMELER  [kelime, emoji]
   --------------------------------------------------------------------- */
const WORDS = [
  // 1. grup: A N E T İ L
  ["EL", "🖐️"], ["ET", "🥩"], ["AT", "🐴"], ["ANA", "👩"], ["ANNE", "👩"],
  ["NENE", "👵"], ["NANE", "🌿"], ["LALE", "🌷"], ["ALİ", "👦"], ["ELLİ", "5️⃣"],
  ["TANE", "🔢"], ["ANTEN", "📡"], ["ATLET", "🎽"], ["TENTE", "⛺"], ["İNAT", "😤"],
  ["TEL", "🔌"],

  // 2. grup: O K U R I M
  ["KALE", "🏰"], ["İNEK", "🐄"], ["KAN", "🩸"], ["ELMA", "🍎"], ["KOL", "💪"],
  ["LİMON", "🍋"], ["MAMA", "🍼"], ["MELEK", "👼"], ["KALEM", "✏️"], ["KOLA", "🥤"],
  ["KOLİ", "📦"], ["MAKİNE", "⚙️"], ["OKUL", "🏫"], ["KUTU", "🎁"], ["MUM", "🕯️"],
  ["KOLTUK", "🛋️"], ["NOT", "📝"], ["MUTLU", "😊"], ["ARI", "🐝"], ["KAR", "❄️"],
  ["ARMUT", "🍐"], ["IRMAK", "🏞️"], ["MAKARNA", "🍝"], ["KURT", "🐺"], ["TARAK", "🪮"],
  ["ORMAN", "🌳"], ["ROKET", "🚀"], ["ATKI", "🧣"], ["TIRNAK", "💅"], ["KARTAL", "🦅"],
  ["ALTIN", "🥇"], ["KURU", "🌵"], ["TOKA", "🎀"], ["NOKTA", "🔹"], ["MOTOR", "🏍️"],
  ["UMUT", "🌈"], ["KUMRU", "🕊️"], ["MİNİK", "🐜"], ["AKIL", "🧠"], ["KORKU", "😱"],
  ["KOKU", "👃"], ["LİRA", "💶"], ["RAKUN", "🦝"], ["ANKARA", "🏛️"], ["MARKET", "🛒"],
  ["TAMİR", "🔧"], ["KALKAN", "🛡️"], ["TEKNE", "⛵"], ["RAKET", "🏸"], ["KAMERA", "📷"],
  ["MAKARA", "🧵"], ["METRE", "📏"], ["TORUN", "👶"], ["ELEKTRİK", "⚡"], ["ROMAN", "📚"],
  ["MİNARE", "🕌"], ["OTEL", "🏨"], ["LOKANTA", "🍽️"], ["TAMAM", "👌"], ["MARTI", "🕊️"],
  ["MARUL", "🥬"], ["ONUR", "🏅"], ["TUNA", "🌊"], ["OTO", "🚗"], ["METRO", "🚇"],
  ["TEKRAR", "🔁"],

  // 3. grup: Ü S Ö Y D Z
  ["TÜNEL", "🚇"], ["ÜLKE", "🌍"], ["ÖNLÜK", "👨‍🍳"], ["DEDE", "👴"], ["KEDİ", "🐱"],
  ["DOMATES", "🍅"], ["SALATA", "🥗"], ["KUZU", "🐑"], ["DENİZ", "🌊"], ["YILDIZ", "⭐"],
  ["SÜT", "🥛"], ["SU", "💧"], ["ZİL", "🔔"], ["ZEYTİN", "🫒"], ["SİNEK", "🪰"],
  ["SAAT", "⌚"], ["DAMLA", "💧"], ["AYI", "🐻"], ["ÖRDEK", "🦆"], ["DÜNYA", "🌍"],
  ["YOL", "🛣️"], ["ÖKÜZ", "🐂"], ["AYAK", "🦶"], ["TİLKİ", "🦊"], ["SARI", "🟡"],
  ["MOR", "🟣"], ["DONDURMA", "🍦"], ["SİMİT", "🥯"], ["KİLİT", "🔒"], ["ÜZÜM", "🍇"],
  ["MUZ", "🍌"], ["KİRAZ", "🍒"], ["MANTAR", "🍄"], ["TREN", "🚂"], ["SANDALYE", "🪑"],
  ["DÜDÜK", "📯"], ["SAMAN", "🌾"], ["SAKIZ", "🍬"], ["SANAT", "🎨"], ["SAYI", "🔢"],
  ["SOKAK", "🏘️"], ["SORU", "❓"], ["SİREN", "🚨"], ["SİNEMA", "🎬"], ["SALON", "🛋️"],
  ["ÖRNEK", "📝"], ["ÜNLÜ", "🌟"], ["YAZ", "☀️"], ["YAYLA", "🏔️"], ["YASEMİN", "🌼"],
  ["YAT", "🛥️"], ["YATAK", "🛏️"], ["YANAK", "😊"], ["YELKEN", "⛵"], ["YEMEK", "🍽️"],
  ["YILAN", "🐍"], ["YUNUS", "🐬"], ["YÜZ", "🙂"], ["YÜZÜK", "💍"], ["YAZI", "✍️"],
  ["DAL", "🌿"], ["DEMİR", "⚙️"], ["DERS", "📚"], ["DİKEN", "🌵"], ["DİZ", "🦵"],
  ["DOKUZ", "9️⃣"], ["DUMAN", "💨"], ["DURAK", "🚏"], ["DÜKKAN", "🏪"], ["ZAMAN", "⏳"],
  ["ZURNA", "🎺"], ["ZÜMRÜT", "💚"], ["KUZEY", "🧭"], ["KAZAK", "🧥"], ["KAZ", "🦆"],
  ["ELMAS", "💎"], ["MAKAS", "✂️"], ["MASAL", "📖"], ["MUSLUK", "🚰"], ["OYUN", "🎮"],
  ["KOYUN", "🐑"], ["AYNA", "🪞"], ["MASA", "🪑"], ["DOKTOR", "👨‍⚕️"], ["DAYI", "👨"],
  ["TEYZE", "👩"], ["SAYMAK", "🔢"], ["SİLGİ", "🧽"], ["SIRT", "🧍"], ["KIZ", "👧"],
  ["KIZAK", "🛷"], ["KURDELE", "🎀"], ["ISI", "♨️"], ["YIL", "📅"], ["RADYO", "📻"],
  ["RAKAM", "🔢"], ["RÜYA", "💭"], ["RESİM", "🖼️"], ["RENK", "🎨"], ["KAYISI", "🍑"],
  ["ERİK", "🍑"], ["NAR", "🍎"], ["KİVİ", "🥝"], ["MANDALİNA", "🍊"], ["SARIMSAK", "🧄"],
  ["SALATALIK", "🥒"], ["EKMEK", "🍞"], ["AYRAN", "🥛"], ["TUZ", "🧂"], ["YASTIK", "🛏️"],
  ["YORGAN", "🛌"], ["KUMANDA", "📺"], ["KLAVYE", "⌨️"], ["EKRAN", "🖥️"], ["KULAKLIK", "🎧"],
  ["KALEMTIRAŞ", "✏️"], ["TERLİK", "🩴"], ["ETEK", "👗"], ["KEMER", "🪢"], ["KOLYE", "📿"],
  ["NEHİR", "🏞️"], ["DERE", "🏞️"], ["ADA", "🏝️"], ["KUM", "🏖️"], ["KAYA", "🪨"],
  ["TAKSİ", "🚕"], ["TRAMVAY", "🚋"], ["LİMAN", "⚓"], ["İSTASYON", "🚉"], ["ECZANE", "💊"],
  ["MÜZE", "🏛️"], ["TİYATRO", "🎭"], ["STADYUM", "🏟️"], ["SARAY", "🏰"], ["KÖY", "🏘️"],
  ["TARLA", "🌾"], ["KULAK", "👂"], ["BURUN", "👃"], ["DİL", "👅"], ["PARMAK", "☝️"],
  ["OMUZ", "🤷"], ["KEMİK", "🦴"], ["UYKU", "😴"], ["MÜZİK", "🎵"], ["DANS", "💃"],
  ["KUKLA", "🎭"], ["ZAR", "🎲"], ["KAYDIRAK", "🛝"], ["KEMAN", "🎻"], ["İKİ", "2️⃣"],
  ["DÖRT", "4️⃣"], ["ALTI", "6️⃣"], ["YEDİ", "7️⃣"], ["SEKİZ", "8️⃣"], ["ON", "🔟"],
  ["KIRMIZI", "🔴"], ["TURUNCU", "🟠"], ["KÖTÜ", "👎"], ["ASLAN", "🦁"], ["OYUNCAK", "🧸"],
  ["ORDU", "🪖"], ["ASKER", "💂"], ["TERZİ", "🧵"],

  // 4. grup: Ç B G C Ş
  ["BABA", "👨"], ["BEBEK", "👶"], ["ARABA", "🚗"], ["BALIK", "🐟"], ["SABUN", "🧼"],
  ["SOBA", "🔥"], ["BAYRAK", "🇹🇷"], ["YUMURTA", "🥚"], ["BULUT", "☁️"], ["SEBZE", "🥦"],
  ["BİSİKLET", "🚲"], ["ZEBRA", "🦓"], ["MAYMUN", "🐒"], ["BEYAZ", "⚪"], ["BARDAK", "🥤"],
  ["BALON", "🎈"], ["BİNA", "🏢"], ["BOYA", "🎨"], ["TABAK", "🍽️"], ["KABAK", "🎃"],
  ["BİBER", "🌶️"], ["OTOBÜS", "🚌"], ["KAMYON", "🚚"], ["TRAKTÖR", "🚜"], ["BORU", "🪈"],
  ["ÇİLEK", "🍓"], ["ÇANTA", "👜"], ["ÇİÇEK", "🌸"], ["ÇORBA", "🍲"], ["ÇAY", "🍵"],
  ["UÇAK", "✈️"], ["ÇORAP", "🧦"], ["ÇEKİÇ", "🔨"], ["ÇATAL", "🍴"], ["KUŞ", "🐦"],
  ["KAŞIK", "🥄"], ["ŞEKER", "🍬"], ["ŞAPKA", "🧢"], ["GÜNEŞ", "☀️"], ["GÖZ", "👁️"],
  ["GÜL", "🌹"], ["GEMİ", "🚢"], ["CAM", "🪟"], ["CEKET", "🧥"], ["BANYO", "🛁"],
  ["BAKKAL", "🏪"], ["BALKON", "🏠"], ["BAŞ", "🙂"], ["BİLET", "🎫"], ["BİLEZİK", "📿"],
  ["BİLGİSAYAR", "💻"], ["BÖCEK", "🐞"], ["BÖREK", "🥐"], ["BUZ", "🧊"], ["BUZDOLABI", "🧊"],
  ["BUKET", "💐"], ["BULMACA", "🧩"], ["BÜYÜK", "🐘"], ["ÇADIR", "⛺"], ["ÇAN", "🔔"],
  ["ÇARŞI", "🏬"], ["ÇEKİRDEK", "🌻"], ["ÇEŞME", "🚰"], ["ÇİZGİ", "✏️"], ["ÇİZME", "🥾"],
  ["ÇOCUK", "🧒"], ["ÇÖL", "🏜️"], ["KOÇ", "🐏"], ["KUMAŞ", "🧵"], ["KAŞ", "🤨"],
  ["KOŞU", "🏃"], ["KİŞİ", "🧑"], ["GAZ", "⛽"], ["GECE", "🌙"], ["GELİN", "👰"],
  ["GİYSİ", "👚"], ["GÖLGE", "🌳"], ["GÜMÜŞ", "🥈"], ["GÜZEL", "🌸"], ["GÖZLÜK", "👓"],
  ["GAZOZ", "🥤"], ["GAMZE", "😊"], ["CADDE", "🛣️"], ["CAMİ", "🕌"], ["CÜZDAN", "👛"],
  ["ŞAL", "🧣"], ["ŞİŞE", "🍼"], ["ŞARKI", "🎤"], ["ŞELALE", "🌊"], ["ŞİMŞEK", "⚡"],
  ["ŞÖMİNE", "🔥"], ["ŞİRİN", "😊"], ["AŞÇI", "👨‍🍳"], ["EŞEK", "🐴"], ["MEŞE", "🌳"],
  ["TAŞIT", "🚗"], ["AŞI", "💉"], ["KIŞ", "❄️"], ["ARKADAŞ", "🧑‍🤝‍🧑"], ["RÜZGAR", "🌬️"],
  ["BATTANİYE", "🛏️"], ["GÜVERCİN", "🕊️"], ["GİTAR", "🎸"], ["YEŞİL", "🟢"], ["TAŞ", "🪨"],
  ["GÖMLEK", "👕"], ["GAZETE", "📰"], ["GEZEGEN", "🪐"], ["KUMBARA", "🐷"], ["SİRK", "🎪"],
  ["MISIR", "🌽"], ["KEBAP", "🍢"], ["IŞIK", "💡"], ["SERÇE", "🐦"], ["KARGA", "🐦"],
  ["KARINCA", "🐜"], ["ÖRÜMCEK", "🕷️"], ["TİMSAH", "🐊"], ["KELEBEK", "🦋"], ["KEÇİ", "🐐"],
  ["SİNCAP", "🐿️"], ["KANGURU", "🦘"], ["BAYKUŞ", "🦉"], ["BALİNA", "🐋"], ["YENGEÇ", "🦀"],
  ["İNCİR", "🍇"], ["BADEM", "🌰"], ["YOĞURT", "🥛"], ["REÇEL", "🍯"], ["BAL", "🍯"],
  ["BİSKÜVİ", "🍪"], ["ÇİKOLATA", "🍫"], ["KEK", "🧁"], ["KURABİYE", "🍪"], ["LOKUM", "🍬"],
  ["SÜPÜRGE", "🧹"], ["BIÇAK", "🔪"], ["TENCERE", "🍲"], ["ŞAMPUAN", "🧴"], ["AYAKKABI", "👟"],
  ["BOT", "🥾"], ["TİŞÖRT", "👕"], ["ELBİSE", "👗"], ["MONT", "🧥"], ["KABAN", "🧥"],
  ["BERE", "🧢"], ["GÖL", "🏞️"], ["ÇİM", "🌱"], ["BACAK", "🦵"], ["SAÇ", "💇"],
  ["ABLA", "👧"], ["ABİ", "👦"], ["KARDEŞ", "👫"], ["BERBER", "💈"], ["ÇİFTÇİ", "👨‍🌾"],
  ["SALINCAK", "🎠"], ["BİR", "1️⃣"], ["ÜÇ", "3️⃣"], ["BEŞ", "5️⃣"], ["SİYAH", "⚫"],
  ["ROBOT", "🤖"], ["TORBA", "👜"],

  // 5. grup: P H V Ğ F J
  ["HAVUÇ", "🥕"], ["KALP", "❤️"], ["PASTA", "🍰"], ["PATATES", "🥔"], ["KÖPEK", "🐶"],
  ["PEYNİR", "🧀"], ["KİTAP", "📖"], ["KAPI", "🚪"], ["VAPUR", "⛴️"], ["KAVUN", "🍈"],
  ["KARPUZ", "🍉"], ["TOP", "⚽"], ["FİL", "🐘"], ["FINDIK", "🌰"], ["TELEFON", "📱"],
  ["FOTOĞRAF", "📷"], ["DAĞ", "⛰️"], ["YAĞMUR", "🌧️"], ["SOĞAN", "🧅"], ["KAĞIT", "📄"],
  ["PORTAKAL", "🍊"], ["ZÜRAFA", "🦒"], ["TAVŞAN", "🐰"], ["KAPLAN", "🐯"], ["KAPLUMBAĞA", "🐢"],
  ["PANDA", "🐼"], ["PİL", "🔋"], ["FARE", "🐭"], ["FIRÇA", "🖌️"], ["HELİKOPTER", "🚁"],
  ["HEDİYE", "🎁"], ["HİNDİ", "🦃"], ["HOROZ", "🐓"], ["CEVİZ", "🥜"], ["ŞEMSİYE", "☂️"],
  ["DİŞ", "🦷"], ["ÖĞRETMEN", "👩‍🏫"], ["PİYANO", "🎹"], ["PATLICAN", "🍆"], ["ŞEFTALİ", "🍑"],
  ["ANANAS", "🍍"], ["BAHÇE", "🏡"], ["HAVLU", "🧖"], ["JET", "🛩️"], ["JÖLE", "🍮"],
  ["DÜĞME", "🔘"], ["BAĞ", "🍇"], ["PİRİNÇ", "🍚"], ["PEMBE", "🩷"], ["PENCERE", "🪟"],
  ["PARK", "🏞️"], ["PARA", "💵"], ["PAKET", "📦"], ["PANTOLON", "👖"], ["PAPATYA", "🌼"],
  ["PAPAĞAN", "🦜"], ["PERİ", "🧚"], ["PİKNİK", "🧺"], ["POSTA", "📮"], ["POŞET", "🛍️"],
  ["PRİZ", "🔌"], ["PUL", "✉️"], ["PUSULA", "🧭"], ["KAPAK", "🍶"], ["KEPÇE", "🥄"],
  ["KÖPRÜ", "🌉"], ["TEPE", "⛰️"], ["TEPSİ", "🍽️"], ["SEPET", "🧺"], ["AMPUL", "💡"],
  ["LAMBA", "💡"], ["HAMAM", "🛁"], ["HAMSİ", "🐟"], ["HAYVAN", "🐾"], ["HAFTA", "📅"],
  ["HASTA", "🤒"], ["HAVA", "🌤️"], ["HEYKEL", "🗿"], ["HELVA", "🍮"], ["HORTUM", "🐘"],
  ["HAZİNE", "💰"], ["HESAP", "🧮"], ["HİKAYE", "📖"], ["KAHVE", "☕"], ["TAHTA", "🪧"],
  ["ŞEHİR", "🏙️"], ["SABAH", "🌅"], ["SAHİL", "🏖️"], ["SİHİR", "✨"], ["MAHALLE", "🏘️"],
  ["MEYVE", "🍎"], ["VAZO", "🏺"], ["VİDA", "🔩"], ["VİŞNE", "🍒"], ["VALİZ", "🧳"],
  ["VAGON", "🚃"], ["VATAN", "🇹🇷"], ["VİNÇ", "🏗️"], ["VOLKAN", "🌋"], ["VOLEYBOL", "🏐"],
  ["VÜCUT", "🧍"], ["AVCI", "🏹"], ["AVUÇ", "✋"], ["KAVAK", "🌳"], ["TAVUK", "🐔"],
  ["DEVE", "🐪"], ["SEVGİ", "❤️"], ["OVA", "🏞️"], ["EV", "🏠"], ["YUVA", "🐦"],
  ["DAVUL", "🥁"], ["DUVAR", "🧱"], ["ÇUVAL", "🛍️"], ["CETVEL", "📏"], ["CEVAP", "💬"],
  ["CANAVAR", "👹"], ["FASULYE", "🍲"], ["FERİBOT", "⛴️"], ["FIRIN", "🍞"], ["FIRTINA", "🌪️"],
  ["FİDAN", "🌱"], ["FİŞ", "🔌"], ["FUTBOL", "⚽"], ["FENER", "🔦"], ["FESLEĞEN", "🌿"],
  ["FÜZE", "🚀"], ["KAFA", "🙂"], ["KAFES", "🐦"], ["SOFA", "🛋️"], ["SOFRA", "🍽️"],
  ["TELEVİZYON", "📺"], ["DEFTER", "📓"], ["MUTFAK", "🍳"], ["ŞOFÖR", "🚕"], ["ZARF", "✉️"],
  ["SINIF", "🏫"], ["KİTAPLIK", "📚"], ["ÇİFT", "👫"], ["GARAJ", "🚗"], ["JANDARMA", "👮"],
  ["JİMNASTİK", "🤸"], ["AJANDA", "📔"], ["MASAJ", "💆"], ["JOKER", "🃏"], ["JELİBON", "🍬"],
  ["JEL", "🧴"], ["YAĞ", "🧈"], ["SAĞ", "👉"], ["SOĞUK", "🥶"], ["DOĞA", "🌲"],
  ["BUĞDAY", "🌾"], ["AĞ", "🕸️"], ["ÖĞRENCİ", "🧑‍🎓"], ["ÖĞLE", "☀️"], ["DAĞCI", "🧗"],
  ["SAĞLIK", "🏥"], ["YILDIRIM", "🌩️"], ["TAVAN", "🏠"], ["KAYIK", "🚣"], ["ATEŞ", "🔥"],
  ["HALA", "👩"], ["AMCA", "👨"], ["POLİS", "👮"], ["KASAP", "🥩"], ["RAF", "📚"],
  ["RAHAT", "🛋️"], ["AKREP", "🦂"], ["KURBAĞA", "🐸"], ["CİVCİV", "🐥"], ["PENGUEN", "🐧"],
  ["AHTAPOT", "🐙"], ["MİDYE", "🦪"], ["FISTIK", "🥜"], ["ISPANAK", "🥬"], ["LAHANA", "🥬"],
  ["PIRASA", "🥬"], ["POĞAÇA", "🥐"], ["PİDE", "🍕"], ["LAHMACUN", "🍕"], ["PİZZA", "🍕"],
  ["HAMBURGER", "🍔"], ["KÖFTE", "🍖"], ["SOSİS", "🌭"], ["PERDE", "🪟"], ["KOVA", "🪣"],
  ["FİNCAN", "☕"], ["TAVA", "🍳"], ["ELDİVEN", "🧤"], ["KRAVAT", "👔"], ["PİJAMA", "😴"],
  ["MAYO", "🩱"], ["ŞORT", "🩳"], ["GÖKKUŞAĞI", "🌈"], ["AĞAÇ", "🌳"], ["YAPRAK", "🍃"],
  ["MAĞARA", "🕳️"], ["AMBULANS", "🚑"], ["İTFAİYE", "🚒"], ["HASTANE", "🏥"], ["KÜTÜPHANE", "📚"],
  ["ÇİFTLİK", "🚜"], ["AHIR", "🐄"], ["AĞIZ", "👄"], ["BEYİN", "🧠"], ["PİLOT", "👨‍✈️"],
  ["BAKLAVA", "🥮"], ["KAHVERENGİ", "🟤"], ["MAVİ", "🔵"]
];

/* ---------------------------------------------------------------------
   KISA CÜMLELER  [cümle, emoji]
   Noktalama serbest (okuma kontrolünde temizlenir).
   --------------------------------------------------------------------- */
const SENTENCES = [
  // 1. grup: A N E T İ L
  ["ANNE LALE AL.", "🌷"], ["ALİ ET AL.", "🥩"], ["ELLİ TANE LALE.", "🌷"],
  ["ANNE NANE AL.", "🌿"], ["ANNE İLE ALİ.", "👩‍👦"], ["NENE İLE ANNE.", "👵"],
  ["ALİ ATLET AL.", "🎽"], ["NENE LALE AL.", "🌷"], ["ELLİ TANE ANTEN.", "📡"],
  ["ALİ TENTE AL.", "⛺"], ["ANNE ET AL. ALİ NANE AL.", "🛒"], ["ALİ ANNE İLE TENTE AL.", "⛺"],
  ["ANNE ATLET AL.", "🎽"], ["ALİ AT AL.", "🐴"],

  // 2. grup: O K U R I M
  ["ANNE ELMA AL.", "🍎"], ["MELEK KALEM AL.", "✏️"], ["ALİ KOLA AL.", "🥤"],
  ["ANNE MUTLU.", "😊"], ["ANNE KOLTUK AL.", "🛋️"], ["ALİ KUTU AL.", "🎁"],
  ["ANNE ARMUT AL.", "🍐"], ["ARI KONAR.", "🐝"], ["ANNE KALEM AL.", "✏️"],
  ["ALİ MOTOR AL.", "🏍️"], ["ALİ ROKET AL.", "🚀"], ["ANNE MAKARNA AL.", "🍝"],
  ["ANNE LİMON AL.", "🍋"], ["ALİ MUTLU.", "😊"], ["ALİ ELMA AL.", "🍎"],
  ["ANNE MARKETTE.", "🛒"], ["ALİ KAMERA AL.", "📷"], ["ALİ RAKET AL.", "🏸"],
  ["NENE TORUN İLE MUTLU.", "😊"], ["ALİ OKU.", "📖"], ["ALİ MUTLU. ANNE MUTLU.", "😊"],
  ["ANNE KURU KUTU AL.", "📦"], ["ALİ ELMA AL. ANNE ARMUT AL.", "🍎"], ["KİM O?", "🤔"],
  ["ALİ KALEMİ AL.", "✏️"],

  // 3. grup: Ü S Ö Y D Z
  ["DEDE SÜT AL.", "🥛"], ["ANNE SİMİT YER.", "🥯"], ["AYI BAL YER.", "🐻"],
  ["ÖRDEK SUDA.", "🦆"], ["ALİ DENİZDE.", "🌊"], ["ANNE YUMURTA AL.", "🥚"],
  ["DEDE OYUN OYNAR.", "🎮"], ["ANNE SALATA YER.", "🥗"], ["ALİ DOMATES YER.", "🍅"],
  ["ANNE SİMİT AL.", "🥯"], ["ALİ ZEYTİN YER.", "🫒"], ["DENİZ TUZLU.", "🌊"],
  ["KEDİ SÜT ALIR.", "🐱"], ["YILDIZ SARI.", "⭐"], ["ÖRDEK YÜZER.", "🦆"],
  ["ALİ YATAKTA.", "🛏️"], ["AYI ET YER.", "🐻"], ["YILAN SÜRÜNÜR.", "🐍"],
  ["KUZU OTLAR.", "🐑"], ["ÖKÜZ YÜRÜR.", "🐂"], ["SAAT ON İKİ.", "🕛"],
  ["ALİ YAZI YAZAR.", "✍️"], ["ALİ OYUN OYNAR.", "🎮"], ["TÜNEL UZUN.", "🚇"],
  ["ÜZÜM TATLI.", "🍇"], ["ANNE ÜZÜM AL.", "🍇"], ["DEDE ÜZÜM YER.", "🍇"],
  ["YÜZÜK ALTIN.", "💍"], ["DÖRT ELMA.", "🍎"], ["ON ÖRDEK.", "🦆"],
  ["DÖRT ARI.", "🐝"], ["YEDİ KEDİ.", "🐱"], ["ALTI KUZU.", "🐑"],
  ["İKİ ARMUT.", "🍐"], ["ÜÇ SİMİT.", "🥯"], ["ON İNEK.", "🐄"],
  ["DEDE ET YER.", "🥩"], ["DOKUZ KURT.", "🐺"], ["ANNE YEMEK ALIR.", "🍽️"],
  ["ALİ DEDE İLE OYNAR.", "👴"], ["KOYUN OTLAR.", "🐑"], ["ZEYTİN SİYAH.", "🫒"],

  // 4. grup: Ç B G C Ş
  ["ALİ KARTAL ÇİZER.", "🦅"], ["BABA ARABA AL.", "🚗"], ["DEDE BALIK TUTAR.", "🎣"],
  ["BEBEK UYUR.", "😴"], ["BEBEK MAMA YER.", "🍼"], ["BABA SALATA YER.", "🥗"],
  ["KEDİ SÜT İÇER.", "🐱"], ["KUŞ ÖTER.", "🐦"], ["BABA GAZETE OKUR.", "📰"],
  ["ARI ÇİÇEKTE.", "🐝"], ["ŞEKER TATLI.", "🍬"], ["GEMİ DENİZDE.", "🚢"],
  ["AYŞE KİTAP OKUR.", "📖"], ["GÜNEŞ PARLAK.", "☀️"], ["ANNE ANKARA İÇİN BİLET AL.", "🎫"],
  ["BABA ÇAY İÇER.", "🍵"], ["ANNE ÇORBA İÇER.", "🍲"], ["ALİ BALIK YER.", "🐟"],
  ["BABA BALIK TUTAR.", "🎣"], ["KUŞ ŞARKI SÖYLER.", "🎤"], ["GÜL KIRMIZI.", "🌹"],
  ["ÇİÇEK GÜZEL.", "🌸"], ["ÇİÇEK SARI.", "🌼"], ["ALİ BİSİKLET SÜRER.", "🚲"],
  ["ANNE ÇANTA AL.", "👜"], ["ALİ ŞEKER YER.", "🍬"], ["BEBEK ŞEKER İSTER.", "🍬"],
  ["ALİ BALON AL.", "🎈"], ["ÇOCUK OYUN OYNAR.", "🧒"], ["ÇOCUKLAR OKULDA.", "🏫"],
  ["DEDE GÖZLÜK TAKAR.", "👓"], ["ALİ CAMA BAKAR.", "🪟"], ["CAM KIRIK.", "🪟"],
  ["ALİ CEKET GİYER.", "🧥"], ["ANNE BİBER ALIR.", "🌶️"], ["ANNE SABUN ALIR.", "🧼"],
  ["KAZ GÖLDE YÜZER.", "🦢"], ["BULUT GRİ.", "☁️"], ["GECE KARANLIK.", "🌙"],
  ["GECE ZİL ÇALDI.", "🔔"], ["ALİ DENİZDE YÜZER.", "🏊"], ["BEBEK ÇOK GÜZEL.", "👶"],
  ["KIŞ GELDİ.", "❄️"], ["YAZ GELDİ.", "☀️"], ["ÇİLEK KIRMIZI.", "🍓"],
  ["BEN ÇOK MUTLUYUM.", "😊"], ["ALİ ÇOK BÜYÜK.", "🧒"], ["BABA BEBEK İLE OYNAR.", "👨‍🍼"],
  ["ÇANTA ÇOK BÜYÜK.", "👜"], ["BALIK GÖLDE YÜZER.", "🐟"],

  // 5. grup: P H V Ğ F J
  ["ANNE ÇAY YAPTI.", "🍵"], ["KÖPEK HAVLAR.", "🐶"], ["BEN PASTA YERİM.", "🍰"],
  ["TAVŞAN HAVUÇ YER.", "🐰"], ["YAĞMUR YAĞAR.", "🌧️"], ["FİL ÇOK BÜYÜK.", "🐘"],
  ["ÇOCUK TOP OYNAR.", "⚽"], ["ÖĞRETMEN DERS ANLATIR.", "👩‍🏫"], ["KUŞ DAĞA UÇTU.", "🐦"],
  ["ANNE PASTA YAPAR.", "🍰"], ["ANNE KAHVE İÇER.", "☕"], ["ALİ PARKTA OYNAR.", "🏞️"],
  ["ANNE PAZARA GİDER.", "🛒"], ["ANNE PATATES AL.", "🥔"], ["ALİ KİTAP OKUR.", "📖"],
  ["KÖPEK KEMİK YER.", "🐶"], ["KEDİ PEYNİR YER.", "🧀"], ["KUŞ UÇAR.", "🐦"],
  ["UÇAK UÇAR.", "✈️"], ["GEMİ ÇOK BÜYÜK.", "🚢"], ["BABA ARABA SÜRER.", "🚗"],
  ["VAPUR DENİZDE.", "⛴️"], ["HAVA ÇOK GÜZEL.", "🌤️"], ["HAVA SOĞUK.", "❄️"],
  ["YAĞMUR YAĞIYOR.", "🌧️"], ["KAR YAĞIYOR.", "❄️"], ["TAVUK YUMURTLAR.", "🐔"],
  ["HOROZ ÖTER.", "🐓"], ["FARE PEYNİR YER.", "🐭"], ["KAPLUMBAĞA YAVAŞ.", "🐢"],
  ["TAVŞAN HIZLI.", "🐰"], ["ASLAN ORMANDA YAŞAR.", "🦁"], ["BALIK SUDA YÜZER.", "🐟"],
  ["ÇİFTÇİ TARLADA.", "👨‍🌾"], ["DOKTOR HASTA BAKAR.", "👨‍⚕️"], ["POLİS ÇOCUĞU KORUR.", "👮"],
  ["PİLOT UÇAK SÜRER.", "✈️"], ["ALİ FUTBOL OYNAR.", "⚽"], ["ALİ TOP OYNAR.", "⚽"],
  ["ELİF KİTAP OKUR.", "📖"], ["ELİF RESİM YAPAR.", "🖼️"], ["ELİF BEBEK İSTER.", "🧸"],
  ["ALİ HEDİYE AL.", "🎁"], ["HEDİYE ÇOK GÜZEL.", "🎁"], ["ALİ HAVUÇ YER.", "🥕"],
  ["OKUL ÇOK GÜZEL.", "🏫"], ["BAHÇE ÇİÇEK DOLU.", "🏡"], ["ALİ ELDİVEN TAKAR.", "🧤"],
  ["ANNE SÜT ISITIR.", "🥛"], ["ANNE MEYVE YIKAR.", "🍎"], ["ÖĞRENCİ DERS ÇALIŞIR.", "🧑‍🎓"],
  ["AĞAÇ ÇOK YEŞİL.", "🌳"], ["DAĞ ÇOK YÜKSEK.", "⛰️"], ["DOĞA ÇOK GÜZEL.", "🌲"],
  ["GÖKKUŞAĞI RENKLİ.", "🌈"], ["ALİ SAĞ EL İLE YAZAR.", "✍️"], ["ALİ AĞZINI AÇAR.", "😮"],
  ["DİŞİMİ FIRÇALARIM.", "🦷"], ["SABAH ERKEN KALKARIM.", "🌅"], ["BEN OKULA GİDERİM.", "🏫"],
  ["BEN KİTAP OKURUM.", "📖"], ["BEN RESİM YAPARIM.", "🎨"], ["BEN ÇOK SEVİNDİM.", "😄"],
  ["ANNEM BANA SARILDI.", "🤗"], ["BABAM İŞE GİDER.", "💼"], ["ARKADAŞIM İLE OYNARIM.", "🧑‍🤝‍🧑"],
  ["KIRMIZI ELMA TATLI.", "🍎"], ["SARI LİMON EKŞİ.", "🍋"], ["HAVUÇ TURUNCU.", "🥕"],
  ["ÇİM YEŞİL.", "🌱"], ["GÖKYÜZÜ MAVİ.", "🌌"], ["GÜNEŞ SARI.", "☀️"],
  ["KAR BEYAZ.", "❄️"], ["TREN GELDİ.", "🚂"], ["OTOBÜS DURAKTA.", "🚌"],
  ["ZÜRAFA ÇOK UZUN.", "🦒"], ["MAYMUN MUZ SEVER.", "🐒"], ["PENGUEN BUZDA YÜZER.", "🐧"],
  ["KURBAĞA GÖLDE.", "🐸"], ["KELEBEK UÇAR.", "🦋"], ["ARI BAL YAPAR.", "🐝"],
  ["KARINCA ÇALIŞKAN.", "🐜"], ["SİNCAP FINDIK YER.", "🐿️"], ["KANGURU ZIPLAR.", "🦘"],
  ["DEVE ÇÖLDE YAŞAR.", "🐪"], ["YUNUS DENİZDE YÜZER.", "🐬"], ["BALİNA ÇOK BÜYÜK.", "🐋"],
  ["ALİ ŞAPKA TAKAR.", "🧢"], ["ÇOCUKLAR PARKTA.", "🎠"], ["ELİF PİJAMA GİYER.", "😴"],
  ["MAVİ ARABA GİDİYOR.", "🚙"], ["TREN ÇOK HIZLI.", "🚄"], ["ANNE VAZOYA ÇİÇEK KOYAR.", "🏺"],
  ["BABA FIRINDAN EKMEK ALIR.", "🍞"], ["ELİF HAVLUYU ASAR.", "🧖"], ["HAYVANLAR ORMANDA YAŞAR.", "🐾"],
  ["BEN PEYNİR SEVERİM.", "🧀"], ["ALİ KAĞIT KESER.", "📄"], ["ALİ FIRÇA İLE BOYAR.", "🖌️"],
  ["FİL HORTUM İLE SU İÇER.", "🐘"], ["PEMBE ÇİÇEK AÇTI.", "🌸"], ["YEŞİL YAPRAK DÜŞTÜ.", "🍃"],
  ["ÇİFTLİKTE İNEK VAR.", "🐄"]
];
