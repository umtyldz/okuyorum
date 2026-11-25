/* =====================================================================
   words.js  —  Okuyorum: kelime / cümle / harf sırası verileri
   Bu dosya kolayca düzenlenebilir. Kurallar:
   - Her şey BÜYÜK harfle yazılır (İ ve I farkına dikkat: KEDİ, ARI, ISPANAK).
   - Uygulama, çocuğun seçtiği harflere göre listeleri OTOMATİK süzer:
     bir kelime/cümle sadece seçili harflerden oluşuyorsa gösterilir.
   - Yeni kelime eklemek için sadece ["KELİME", "emoji"] satırı eklemek yeterli.
   ===================================================================== */

/* ---------------------------------------------------------------------
   HARF SIRASI  (MEB İlkokuma ses/harf grupları sırası)
   Çocuklar harfleri bu sırayla öğrenir. Kendi sınıfınızın sırası farklıysa
   buradaki diziyi değiştirin YA DA uygulamada
   "Ebeveyn" bölümünden "Harf sırası" kutusuna yazın (tarayıcıda saklanır).
   --------------------------------------------------------------------- */
const LETTER_ORDER = [
  "A", "N", "E", "T", "İ", "L",
  "O", "K", "U", "R", "I", "M",
  "Ü", "S", "Ö", "Y", "D", "Z",
  "Ç", "B", "G", "C", "Ş",
  "P", "H", "V", "Ğ", "F", "J"
];

/* Ünlü (sesli) harfler — hece üretimi ve hece bölme için kullanılır */
const VOWELS = ["A", "E", "I", "İ", "O", "Ö", "U", "Ü"];

/* ---------------------------------------------------------------------
   KELİMELER  [kelime, emoji]
   --------------------------------------------------------------------- */
const WORDS = [
  // E L A K
  ["EL", "🖐️"], ["KALE", "🏰"], ["LALE", "🌷"],
  // İ N
  ["İNEK", "🐄"], ["NANE", "🌿"], ["ANNE", "👩"], ["KAN", "🩸"],
  // O M
  ["ELMA", "🍎"], ["KOL", "💪"], ["LİMON", "🍋"], ["MAMA", "🍼"], ["MELEK", "👼"],
  ["KALEM", "✏️"], ["KOLA", "🥤"], ["KOLİ", "📦"], ["MAKİNE", "⚙️"],
  // U T
  ["OKUL", "🏫"], ["KUTU", "🎁"], ["MUM", "🕯️"], ["KOLTUK", "🛋️"], ["NOT", "📝"], ["MUTLU", "😊"],
  // Ü Ö
  ["TÜNEL", "🚇"], ["ÜLKE", "🌍"], ["ÖNLÜK", "👨‍🍳"],
  // R I
  ["ARI", "🐝"], ["KAR", "❄️"], ["ARMUT", "🍐"], ["IRMAK", "🏞️"], ["MAKARNA", "🍝"],
  ["KURT", "🐺"], ["TARAK", "🪮"], ["ORMAN", "🌳"], ["ROKET", "🚀"], ["ATKI", "🧣"],
  ["TIRNAK", "💅"], ["KARTAL", "🦅"], ["ALTIN", "🥇"], ["KURU", "🏜️"],
  // D S B Z Y
  ["DEDE", "👴"], ["BABA", "👨"], ["KEDİ", "🐱"], ["DOMATES", "🍅"], ["SALATA", "🥗"],
  ["BEBEK", "👶"], ["ARABA", "🚗"], ["KUZU", "🐑"], ["BALIK", "🐟"], ["DENİZ", "🌊"],
  ["SABUN", "🧼"], ["YILDIZ", "⭐"], ["SÜT", "🥛"], ["SU", "💧"], ["SOBA", "🔥"],
  ["BAYRAK", "🇹🇷"], ["YUMURTA", "🥚"], ["BULUT", "☁️"], ["ZİL", "🔔"], ["ZEYTİN", "🫒"],
  ["SEBZE", "🥦"], ["SİNEK", "🪰"], ["SAAT", "⌚"], ["DAMLA", "💧"], ["BİSİKLET", "🚲"],
  ["AYI", "🐻"], ["ÖRDEK", "🦆"], ["DÜNYA", "🌍"], ["YOL", "🛣️"], ["ÖKÜZ", "🐂"],
  ["ZEBRA", "🦓"], ["MAYMUN", "🐒"], ["AYAK", "🦶"], ["TİLKİ", "🦊"], ["SARI", "🟡"],
  ["MOR", "🟣"], ["BEYAZ", "⚪"], ["DONDURMA", "🍦"], ["BARDAK", "🥤"], ["BALON", "🎈"],
  ["BİNA", "🏢"], ["BOYA", "🎨"], ["TABAK", "🍽️"], ["SİMİT", "🥯"], ["KİLİT", "🔒"],
  ["ÜZÜM", "🍇"], ["MUZ", "🍌"], ["KİRAZ", "🍒"], ["KABAK", "🎃"], ["MANTAR", "🍄"],
  ["BİBER", "🌶️"], ["TREN", "🚂"], ["OTOBÜS", "🚌"], ["KAMYON", "🚚"], ["TRAKTÖR", "🚜"],
  ["SANDALYE", "🪑"], ["BORU", "🪈"], ["DÜDÜK", "📯"],
  // Ç Ş G H C P V F J Ğ ve sonrası
  ["ÇİLEK", "🍓"], ["ÇANTA", "👜"], ["ÇİÇEK", "🌸"], ["ÇORBA", "🍲"], ["ÇAY", "🍵"],
  ["UÇAK", "✈️"], ["ÇORAP", "🧦"], ["ÇEKİÇ", "🔨"], ["ÇATAL", "🍴"],
  ["KUŞ", "🐦"], ["KAŞIK", "🥄"], ["ŞEKER", "🍬"], ["ŞAPKA", "🧢"], ["GÜNEŞ", "☀️"],
  ["GÖZ", "👁️"], ["GÜL", "🌹"], ["GEMİ", "🚢"], ["HAVUÇ", "🥕"], ["CAM", "🪟"],
  ["CEKET", "🧥"], ["KALP", "❤️"], ["PASTA", "🍰"], ["PATATES", "🥔"], ["KÖPEK", "🐶"],
  ["PEYNİR", "🧀"], ["KİTAP", "📖"], ["KAPI", "🚪"], ["VAPUR", "⛴️"], ["KAVUN", "🍈"],
  ["KARPUZ", "🍉"], ["TOP", "⚽"], ["FİL", "🐘"], ["FINDIK", "🌰"], ["TELEFON", "📱"],
  ["FOTOĞRAF", "📷"], ["DAĞ", "⛰️"], ["YAĞMUR", "🌧️"], ["SOĞAN", "🧅"], ["KAĞIT", "📄"],
  ["OYUNCAK", "🧸"], ["PORTAKAL", "🍊"], ["ZÜRAFA", "🦒"], ["TAVŞAN", "🐰"], ["ASLAN", "🦁"],
  ["KAPLAN", "🐯"], ["KAPLUMBAĞA", "🐢"], ["PANDA", "🐼"], ["PİL", "🔋"], ["FARE", "🐭"],
  ["FIRÇA", "🖌️"], ["GİTAR", "🎸"], ["HELİKOPTER", "🚁"], ["HEDİYE", "🎁"], ["HİNDİ", "🦃"],
  ["HOROZ", "🐓"], ["CEVİZ", "🥜"], ["ŞEMSİYE", "☂️"], ["DİŞ", "🦷"], ["YEŞİL", "🟢"],
  ["TAŞ", "🪨"], ["GÖMLEK", "👕"], ["GAZETE", "📰"], ["GEZEGEN", "🪐"], ["ÖĞRETMEN", "👩‍🏫"],
  ["KUMBARA", "🐷"], ["PİYANO", "🎹"], ["SİRK", "🎪"], ["PATLICAN", "🍆"], ["MISIR", "🌽"],
  ["ŞEFTALİ", "🍑"], ["ANANAS", "🍍"], ["BAHÇE", "🏡"], ["KAPLAN", "🐯"], ["HAVLU", "🧖"],
  ["JET", "🛩️"], ["JÖLE", "🍮"], ["KEBAP", "🍢"], ["DÜĞME", "🔘"], ["BAĞ", "🍇"]
];

/* ---------------------------------------------------------------------
   KISA CÜMLELER  [cümle, emoji]
   Noktalama serbest (okuma kontrolünde temizlenir).
   --------------------------------------------------------------------- */
const SENTENCES = [
  // az harfle (E L A K İ N)
  ["ANNE LALE AL.", "🌷"],
  // + O M
  ["ANNE ELMA AL.", "🍎"], ["MELEK KALEM AL.", "✏️"], ["ALİ KOLA AL.", "🥤"],
  // + U T Ü Ö
  ["ANNE MUTLU.", "😊"], ["ANNE KOLTUK AL.", "🛋️"], ["ALİ KUTU AL.", "🎁"],
  // + R I
  ["ANNE ARMUT AL.", "🍐"], ["ARI KONAR.", "🐝"], ["ALİ KARTAL ÇİZER" , "🦅"],
  // + D S B Z Y
  ["DEDE SÜT AL.", "🥛"], ["BABA ARABA AL.", "🚗"], ["DEDE BALIK TUTAR.", "🎣"],
  ["BEBEK UYUR.", "😴"], ["ANNE SİMİT YER.", "🥯"], ["AYI BAL YER.", "🐻"],
  ["ÖRDEK SUDA.", "🦆"], ["ALİ DENİZDE.", "🌊"], ["ANNE YUMURTA AL.", "🥚"],
  ["BEBEK MAMA YER.", "🍼"], ["BABA SALATA YER.", "🥗"],
  // + Ç Ş G H C P V F J Ğ
  ["KEDİ SÜT İÇER.", "🐱"], ["KUŞ ÖTER.", "🐦"], ["ANNE ÇAY YAPTI.", "🍵"],
  ["BABA GAZETE OKUR.", "📰"], ["KÖPEK HAVLAR.", "🐶"], ["BEN PASTA YERİM.", "🍰"],
  ["TAVŞAN HAVUÇ YER.", "🐰"], ["YAĞMUR YAĞAR.", "🌧️"], ["FİL ÇOK BÜYÜK." , "🐘"],
  ["ARI ÇİÇEKTE.", "🐝"], ["ŞEKER TATLI.", "🍬"], ["GEMİ DENİZDE.", "🚢"],
  ["ÇOCUK TOP OYNAR.", "⚽"], ["AYŞE KİTAP OKUR.", "📖"], ["GÜNEŞ PARLAK.", "☀️"],
  ["ÖĞRETMEN DERS ANLATIR.", "👩‍🏫"], ["KUŞ DAĞA UÇTU.", "🐦"]
];

/* =====================================================================
   EK LİSTELER — daha fazla çeşit (tekrar azalsın diye)
   Kelime ve cümleler, çocuğun seçtiği harflere göre otomatik süzülür.
   Aynı kelime iki kez yazılırsa uygulama tekrarı yok sayar.
   ===================================================================== */

/* ---------- EK KELİMELER ---------- */
WORDS.push(
  // 1. grup: A N E T İ L
  ["ET", "🥩"], ["AT", "🐴"], ["ANA", "👩"], ["NENE", "👵"], ["ELLİ", "5️⃣"], ["ALİ", "👦"],
  ["TANE", "🔢"], ["ANTEN", "📡"], ["ATLET", "🎽"], ["TENTE", "⛺"], ["İNAT", "😤"], ["TEL", "🔌"],
  ["LALE", "🌷"], ["NANE", "🌿"], ["ANNE", "👩"],
  // 2. grup: O K U R I M
  ["TOKA", "🎀"], ["NOKTA", "🔹"], ["MOTOR", "🏍️"], ["UMUT", "🌈"], ["KUMRU", "🕊️"], ["MİNİK", "🐜"],
  ["AKIL", "🧠"], ["KORKU", "😱"], ["KOKU", "👃"], ["LİRA", "💶"], ["RAKUN", "🦝"], ["ANKARA", "🏛️"],
  ["MARKET", "🛒"], ["TAMİR", "🔧"], ["KALKAN", "🛡️"], ["TEKNE", "⛵"], ["RAKET", "🏸"], ["KAMERA", "📷"],
  ["MAKARA", "🧵"], ["METRE", "📏"], ["TORUN", "👶"], ["ELEKTRİK", "⚡"], ["ROMAN", "📚"], ["MİNARE", "🕌"],
  ["MOTEL", "🏨"], ["LOKANTA", "🍽️"], ["TAMAM", "👌"], ["MARTI", "🕊️"], ["MARUL", "🥬"], ["ONUR", "🏅"],
  ["KUMAR", "🎲"], ["TUNA", "🌊"], ["ULAK", "🏃"], ["OTO", "🚗"], ["METRO", "🚇"], ["TEKRAR", "🔁"],
  // 3. grup: Ü S Ö Y D Z
  ["SAMAN", "🌾"], ["SAKIZ", "🍬"], ["SANAT", "🎨"], ["SAYI", "🔢"], ["SOKAK", "🏘️"], ["SORU", "❓"],
  ["SİREN", "🚨"], ["SİNEMA", "🎬"], ["SALON", "🛋️"], ["ÖRNEK", "📝"], ["ÜNLÜ", "🌟"], ["YAZ", "☀️"],
  ["YAYLA", "🏔️"], ["YASEMİN", "🌼"], ["YAT", "🛥️"], ["YATAK", "🛏️"], ["YANAK", "😊"], ["YELKEN", "⛵"],
  ["YEMEK", "🍽️"], ["YILAN", "🐍"], ["YUNUS", "🐬"], ["YÜZ", "🙂"], ["YÜZÜK", "💍"], ["YAZI", "✍️"],
  ["DAL", "🌿"], ["DEMİR", "⚙️"], ["DERS", "📚"], ["DİKEN", "🌵"], ["DİZ", "🦵"], ["DOKUZ", "9️⃣"],
  ["DUMAN", "💨"], ["DURAK", "🚏"], ["DÜKKAN", "🏪"], ["ZAMAN", "⏳"], ["ZURNA", "🎺"], ["ZÜMRÜT", "💚"],
  ["KUZEY", "🧭"], ["KAZAK", "🧥"], ["KAZ", "🦆"], ["ELMAS", "💎"], ["MAKAS", "✂️"], ["MASAL", "📖"],
  ["MUSLUK", "🚰"], ["OYUN", "🎮"], ["KOYUN", "🐑"], ["AYNA", "🪞"], ["MASA", "🪑"], ["DOKTOR", "👨‍⚕️"],
  ["SALATA", "🥗"], ["DEDE", "👴"], ["DENİZ", "🌊"], ["KEDİ", "🐱"], ["ÖRDEK", "🦆"], ["SANDALYE", "🪑"],
  ["ZİL", "🔔"], ["SAAT", "⌚"], ["DAYI", "👨"], ["TEYZE", "👩"], ["HALA", "👩"], ["AMCA", "👨"],
  ["ASKER", "💂"], ["POLİS", "👮"], ["KASAP", "🥩"], ["TERZİ", "🧵"], ["SAYMAK", "🔢"], ["SİLGİ", "🧽"],
  ["SIRT", "🧍"], ["KIZ", "👧"], ["KIZAK", "🛷"], ["KURDELE", "🎀"], ["ISI", "♨️"], ["IŞIK", "💡"],
  ["YIL", "📅"], ["RADYO", "📻"], ["RAKAM", "🔢"], ["ROBOT", "🤖"], ["RÜYA", "💭"], ["RESİM", "🖼️"],
  ["RENK", "🎨"], ["RAF", "📚"], ["RAHAT", "🛋️"], ["TORBA", "👜"], ["SERÇE", "🐦"], ["KARGA", "🐦"],
  ["KARINCA", "🐜"], ["ÖRÜMCEK", "🕷️"], ["AKREP", "🦂"], ["TİMSAH", "🐊"], ["KURBAĞA", "🐸"],
  ["KELEBEK", "🦋"], ["KEÇİ", "🐐"], ["CİVCİV", "🐥"], ["SİNCAP", "🐿️"], ["KANGURU", "🦘"], ["BAYKUŞ", "🦉"],
  ["PENGUEN", "🐧"], ["BALİNA", "🐋"], ["AHTAPOT", "🐙"], ["MİDYE", "🦪"], ["YENGEÇ", "🦀"],
  ["KAYISI", "🍑"], ["ERİK", "🍑"], ["İNCİR", "🍇"], ["NAR", "🍎"], ["KİVİ", "🥝"], ["MANDALİNA", "🍊"],
  ["BADEM", "🌰"], ["FISTIK", "🥜"], ["KESTANE", "🌰"], ["SARIMSAK", "🧄"], ["SALATALIK", "🥒"],
  ["ISPANAK", "🥬"], ["LAHANA", "🥬"], ["PIRASA", "🥬"], ["EKMEK", "🍞"], ["YOĞURT", "🥛"], ["REÇEL", "🍯"],
  ["BAL", "🍯"], ["AYRAN", "🥛"], ["BİSKÜVİ", "🍪"], ["ÇİKOLATA", "🍫"], ["KEK", "🧁"], ["KURABİYE", "🍪"],
  ["LOKUM", "🍬"], ["BAKLAVA", "🥮"], ["POĞAÇA", "🥐"], ["PİDE", "🍕"], ["LAHMACUN", "🍕"], ["PİZZA", "🍕"],
  ["HAMBURGER", "🍔"], ["KÖFTE", "🍖"], ["SOSİS", "🌭"], ["TUZ", "🧂"], ["MUM", "🕯️"], ["KURU", "🌵"],
  ["YASTIK", "🛏️"], ["YORGAN", "🛌"], ["PERDE", "🪟"], ["SÜPÜRGE", "🧹"], ["KOVA", "🪣"], ["BIÇAK", "🔪"],
  ["FİNCAN", "☕"], ["TENCERE", "🍲"], ["TAVA", "🍳"], ["KUMANDA", "📺"], ["KLAVYE", "⌨️"], ["EKRAN", "🖥️"],
  ["KULAKLIK", "🎧"], ["ŞAMPUAN", "🧴"], ["KALEMTIRAŞ", "✏️"], ["CETVEL", "📏"], ["AYAKKABI", "👟"],
  ["BOT", "🥾"], ["TERLİK", "🩴"], ["TİŞÖRT", "👕"], ["ETEK", "👗"], ["ELBİSE", "👗"], ["MONT", "🧥"],
  ["KABAN", "🧥"], ["BERE", "🧢"], ["ELDİVEN", "🧤"], ["KEMER", "🪢"], ["KRAVAT", "👔"], ["KOLYE", "📿"],
  ["PİJAMA", "😴"], ["MAYO", "🩱"], ["ŞORT", "🩳"], ["GÖKKUŞAĞI", "🌈"], ["NEHİR", "🏞️"], ["GÖL", "🏞️"],
  ["DERE", "🏞️"], ["ADA", "🏝️"], ["KUM", "🏖️"], ["AĞAÇ", "🌳"], ["YAPRAK", "🍃"], ["ÇİM", "🌱"],
  ["MAĞARA", "🕳️"], ["KAYA", "🪨"], ["ÇÖL", "🏜️"], ["TAKSİ", "🚕"], ["AMBULANS", "🚑"], ["İTFAİYE", "🚒"],
  ["TRAMVAY", "🚋"], ["LİMAN", "⚓"], ["İSTASYON", "🚉"], ["HASTANE", "🏥"], ["ECZANE", "💊"],
  ["KÜTÜPHANE", "📚"], ["MÜZE", "🏛️"], ["TİYATRO", "🎭"], ["STADYUM", "🏟️"], ["SARAY", "🏰"], ["KÖY", "🏘️"],
  ["TARLA", "🌾"], ["ÇİFTLİK", "🚜"], ["AHIR", "🐄"], ["BACAK", "🦵"], ["SAÇ", "💇"], ["KULAK", "👂"],
  ["BURUN", "👃"], ["AĞIZ", "👄"], ["DİL", "👅"], ["KAŞ", "🤨"], ["PARMAK", "☝️"], ["BEYİN", "🧠"],
  ["OMUZ", "🤷"], ["KEMİK", "🦴"], ["ABLA", "👧"], ["ABİ", "👦"], ["KARDEŞ", "👫"], ["ARKADAŞ", "🧑‍🤝‍🧑"],
  ["PİLOT", "👨‍✈️"], ["AŞÇI", "👨‍🍳"], ["BERBER", "💈"], ["ÇİFTÇİ", "👨‍🌾"], ["UYKU", "😴"], ["MÜZİK", "🎵"],
  ["DANS", "💃"], ["KUKLA", "🎭"], ["ZAR", "🎲"], ["TOBOGAN", "🎢"], ["SALINCAK", "🎠"], ["KEMAN", "🎻"],
  ["BİR", "1️⃣"], ["İKİ", "2️⃣"], ["ÜÇ", "3️⃣"], ["DÖRT", "4️⃣"], ["BEŞ", "5️⃣"], ["ALTI", "6️⃣"],
  ["YEDİ", "7️⃣"], ["SEKİZ", "8️⃣"], ["ON", "🔟"], ["KIRMIZI", "🔴"], ["MAVİ", "🔵"], ["TURUNCU", "🟠"],
  ["PEMBE", "🩷"], ["SİYAH", "⚫"], ["KAHVERENGİ", "🟤"],
  // 4. grup: Ç B G C Ş
  ["BANYO", "🛁"], ["BAKKAL", "🏪"], ["BALKON", "🏠"], ["BAŞ", "🙂"], ["BİLET", "🎫"], ["BİLEZİK", "📿"],
  ["BİLGİSAYAR", "💻"], ["BÖCEK", "🐞"], ["BÖREK", "🥐"], ["BUZ", "🧊"], ["BUZDOLABI", "🧊"], ["BUKET", "💐"],
  ["BULMACA", "🧩"], ["BÜYÜK", "🐘"], ["ÇADIR", "⛺"], ["ÇAN", "🔔"], ["ÇARŞI", "🏬"], ["ÇEKİRDEK", "🌻"],
  ["ÇEŞME", "🚰"], ["ÇİZGİ", "✏️"], ["ÇİZME", "🥾"], ["ÇOCUK", "🧒"], ["ÇÖL", "🏜️"], ["KOÇ", "🐏"],
  ["KUMAŞ", "🧵"], ["KAŞ", "🤨"], ["KOŞU", "🏃"], ["KİŞİ", "🧑"], ["GAZ", "⛽"], ["GECE", "🌙"],
  ["GELİN", "👰"], ["GİYSİ", "👚"], ["GÖLGE", "🌳"], ["GÜMÜŞ", "🥈"], ["GÜZEL", "🌸"], ["GÖZLÜK", "👓"],
  ["GAZOZ", "🥤"], ["GAMZE", "😊"], ["CADDE", "🛣️"], ["CAMİ", "🕌"], ["CÜZDAN", "👛"], ["ŞAL", "🧣"],
  ["ŞİŞE", "🍼"], ["ŞARKI", "🎤"], ["ŞELALE", "🌊"], ["ŞİMŞEK", "⚡"], ["ŞÖMİNE", "🔥"], ["ŞİRİN", "😊"],
  ["AŞÇI", "👨‍🍳"], ["EŞEK", "🐴"], ["MEŞE", "🌳"], ["TAŞIT", "🚗"], ["AŞI", "💉"], ["KIŞ", "❄️"],
  ["ARKADAŞ", "🧑‍🤝‍🧑"], ["BEBEK", "👶"], ["BABA", "👨"], ["BAYRAK", "🇹🇷"], ["BALON", "🎈"],
  ["BOYA", "🎨"], ["BİNA", "🏢"], ["BARDAK", "🥤"], ["SABUN", "🧼"], ["BORU", "🚰"], ["KABAK", "🎃"],
  ["BİBER", "🌶️"], ["SOBA", "🔥"], ["ZEBRA", "🦓"], ["TABAK", "🍽️"], ["BULUT", "☁️"],
  ["RÜZGAR", "🌬️"], ["BATTANİYE", "🛏️"], ["GÜVERCİN", "🕊️"],
  // 5. grup: P H V Ğ F J
  ["PİRİNÇ", "🍚"], ["PEMBE", "🩷"], ["PENCERE", "🪟"], ["PARK", "🏞️"], ["PARA", "💵"], ["PAKET", "📦"],
  ["PANTOLON", "👖"], ["PAPATYA", "🌼"], ["PAPAĞAN", "🦜"], ["PERİ", "🧚"], ["PİKNİK", "🧺"], ["POSTA", "📮"],
  ["POŞET", "🛍️"], ["PRİZ", "🔌"], ["PUL", "✉️"], ["PUSULA", "🧭"], ["KAPAK", "🍶"], ["KEPÇE", "🥄"],
  ["KÖPRÜ", "🌉"], ["TEPE", "⛰️"], ["TEPSİ", "🍽️"], ["SEPET", "🧺"], ["AMPUL", "💡"], ["LAMBA", "💡"],
  ["HAMAM", "🛁"], ["HAMSİ", "🐟"], ["HAYVAN", "🐾"], ["HAFTA", "📅"], ["HASTA", "🤒"], ["HAVA", "🌤️"],
  ["HEYKEL", "🗿"], ["HELVA", "🍮"], ["HORTUM", "🐘"], ["HAZİNE", "💰"], ["HESAP", "🧮"], ["HİKAYE", "📖"],
  ["KAHVE", "☕"], ["TAHTA", "🪧"], ["ŞEHİR", "🏙️"], ["SABAH", "🌅"], ["SAHİL", "🏖️"], ["SİHİR", "✨"],
  ["MAHALLE", "🏘️"], ["MEYVE", "🍎"], ["VAZO", "🏺"], ["VİDA", "🔩"], ["VİŞNE", "🍒"], ["VALİZ", "🧳"],
  ["VAGON", "🚃"], ["VATAN", "🇹🇷"], ["VİNÇ", "🏗️"], ["VOLKAN", "🌋"], ["VOLEYBOL", "🏐"], ["VÜCUT", "🧍"],
  ["AVCI", "🏹"], ["AVUÇ", "✋"], ["KAVAK", "🌳"], ["TAVUK", "🐔"], ["DEVE", "🐪"], ["SEVGİ", "❤️"],
  ["OVA", "🏞️"], ["EV", "🏠"], ["YUVA", "🐦"], ["DAVUL", "🥁"], ["DUVAR", "🧱"], ["ÇUVAL", "🛍️"],
  ["CEVİZ", "🥜"], ["CETVEL", "📏"], ["CEVAP", "💬"], ["CANAVAR", "👹"], ["FARE", "🐭"], ["FASULYE", "🍲"],
  ["FERİBOT", "⛴️"], ["FIRÇA", "🖌️"], ["FIRIN", "🍞"], ["FIRTINA", "🌪️"], ["FİDAN", "🌱"], ["FİŞ", "🔌"],
  ["FUTBOL", "⚽"], ["FENER", "🔦"], ["FESLEĞEN", "🌿"], ["FÜZE", "🚀"], ["KAFA", "🙂"], ["KAFES", "🐦"],
  ["SOFA", "🛋️"], ["SOFRA", "🍽️"], ["TELEVİZYON", "📺"], ["DEFTER", "📓"], ["MUTFAK", "🍳"], ["ŞOFÖR", "🚕"],
  ["ZARF", "✉️"], ["SINIF", "🏫"], ["KİTAPLIK", "📚"], ["ÇİFT", "👫"], ["GARAJ", "🚗"], ["JANDARMA", "👮"],
  ["JİMNASTİK", "🤸"], ["AJANDA", "📔"], ["MASAJ", "💆"], ["JOKER", "🃏"], ["JELİBON", "🍬"], ["JEL", "🧴"],
  ["YAĞ", "🧈"], ["SAĞ", "👉"], ["SOĞUK", "🥶"], ["DOĞA", "🌲"], ["BUĞDAY", "🌾"], ["AĞ", "🕸️"],
  ["ÖĞRENCİ", "🧑‍🎓"], ["ÖĞLE", "☀️"], ["DAĞCI", "🧗"], ["SAĞLIK", "🏥"], ["YILDIRIM", "🌩️"],
  ["TAVAN", "🏠"], ["KAPI", "🚪"], ["KAYIK", "🚣"], ["ATEŞ", "🔥"]
);

/* ---------- EK CÜMLELER ---------- */
SENTENCES.push(
  // 1. grup: A N E T İ L
  ["ALİ ET AL.", "🥩"], ["ELLİ TANE LALE.", "🌷"], ["ANNE NANE AL.", "🌿"], ["ANNE İLE ALİ.", "👩‍👦"],
  ["NENE İLE ANNE.", "👵"], ["ALİ ATLET AL.", "🎽"], ["NENE LALE AL.", "🌷"], ["ELLİ TANE ANTEN.", "📡"],
  ["ALİ TENTE AL.", "⛺"], ["ANNE ET AL. ALİ NANE AL.", "🛒"], ["ALİ ANNE İLE TENTE AL.", "⛺"],
  ["ANNE ATLET AL.", "🎽"], ["ALİ AT AL.", "🐴"],
  // 2. grup: O K U R I M
  ["ANNE KALEM AL.", "✏️"], ["ALİ MOTOR AL.", "🏍️"], ["ALİ ROKET AL.", "🚀"], ["ANNE MAKARNA AL.", "🍝"],
  ["ANNE LİMON AL.", "🍋"], ["ALİ MUTLU.", "😊"], ["ALİ ELMA AL.", "🍎"], ["ANNE MARKETTE.", "🛒"],
  ["ALİ KAMERA AL.", "📷"], ["ALİ RAKET AL.", "🏸"], ["NENE TORUN İLE MUTLU.", "😊"], ["ALİ OKU.", "📖"],
  ["ALİ MUTLU. ANNE MUTLU.", "😊"], ["ANNE KURU KUTU AL.", "📦"], ["ALİ ELMA AL. ANNE ARMUT AL.", "🍎"],
  ["KİM O?", "🤔"], ["ALİ KALEMİ AL.", "✏️"], ["ANNE ANKARA İÇİN BİLET AL.", "🎫"],
  // 3. grup: Ü S Ö Y D Z
  ["DEDE OYUN OYNAR.", "🎮"], ["ANNE SALATA YER.", "🥗"], ["ALİ DOMATES YER.", "🍅"], ["ANNE SİMİT AL.", "🥯"],
  ["ALİ ZEYTİN YER.", "🫒"], ["DENİZ TUZLU.", "🌊"], ["KEDİ SÜT ALIR.", "🐱"], ["YILDIZ SARI.", "⭐"],
  ["ÖRDEK YÜZER.", "🦆"], ["ALİ YATAKTA.", "🛏️"], ["AYI ET YER.", "🐻"], ["YILAN SÜRÜNÜR.", "🐍"],
  ["KUZU OTLAR.", "🐑"], ["ÖKÜZ YÜRÜR.", "🐂"], ["SAAT ON İKİ.", "🕛"], ["ALİ YAZI YAZAR.", "✍️"],
  ["ALİ OYUN OYNAR.", "🎮"], ["TÜNEL UZUN.", "🚇"], ["ÜZÜM TATLI.", "🍇"], ["ANNE ÜZÜM AL.", "🍇"],
  ["DEDE ÜZÜM YER.", "🍇"], ["YÜZÜK ALTIN.", "💍"], ["DÖRT ELMA.", "🍎"], ["ON ÖRDEK.", "🦆"],
  ["DÖRT ARI.", "🐝"], ["YEDİ KEDİ.", "🐱"], ["ALTI KUZU.", "🐑"], ["İKİ ARMUT.", "🍐"], ["ÜÇ SİMİT.", "🥯"],
  ["ON İNEK.", "🐄"], ["DEDE ET YER.", "🥩"], ["DOKUZ KURT.", "🐺"], ["ANNE YEMEK ALIR.", "🍽️"],
  ["ALİ DEDE İLE OYNAR.", "👴"], ["KOYUN OTLAR.", "🐑"], ["ZEYTİN SİYAH.", "🫒"],
  // 4. grup: Ç B G C Ş
  ["BABA ÇAY İÇER.", "🍵"], ["ANNE ÇORBA İÇER.", "🍲"], ["ALİ BALIK YER.", "🐟"], ["BABA BALIK TUTAR.", "🎣"],
  ["KUŞ ŞARKI SÖYLER.", "🎤"], ["GÜL KIRMIZI.", "🌹"], ["ÇİÇEK GÜZEL.", "🌸"], ["ÇİÇEK SARI.", "🌼"],
  ["ALİ BİSİKLET SÜRER.", "🚲"], ["ANNE ÇANTA AL.", "👜"], ["ALİ ŞEKER YER.", "🍬"], ["BEBEK ŞEKER İSTER.", "🍬"],
  ["ALİ BALON AL.", "🎈"], ["ÇOCUK OYUN OYNAR.", "🧒"], ["ÇOCUKLAR OKULDA.", "🏫"], ["DEDE GÖZLÜK TAKAR.", "👓"],
  ["ALİ CAMA BAKAR.", "🪟"], ["CAM KIRIK.", "🪟"], ["ALİ CEKET GİYER.", "🧥"], ["ANNE BİBER ALIR.", "🌶️"],
  ["ANNE SABUN ALIR.", "🧼"], ["KAZ GÖLDE YÜZER.", "🦢"], ["BULUT GRİ.", "☁️"], ["GECE KARANLIK.", "🌙"],
  ["GECE ZİL ÇALDI.", "🔔"], ["ALİ DENİZDE YÜZER.", "🏊"], ["BEBEK ÇOK GÜZEL.", "👶"], ["KIŞ GELDİ.", "❄️"],
  ["YAZ GELDİ.", "☀️"], ["ÇİLEK KIRMIZI.", "🍓"], ["BEN ÇOK MUTLUYUM.", "😊"], ["ALİ ÇOK BÜYÜK.", "🧒"],
  ["BABA BEBEK İLE OYNAR.", "👨‍🍼"], ["ÇANTA ÇOK BÜYÜK.", "👜"], ["BALIK GÖLDE YÜZER.", "🐟"],
  // 5. grup: P H V Ğ F J ve hepsi
  ["ANNE PASTA YAPAR.", "🍰"], ["ANNE KAHVE İÇER.", "☕"], ["ALİ PARKTA OYNAR.", "🏞️"], ["ANNE PAZARA GİDER.", "🛒"],
  ["ANNE PATATES AL.", "🥔"], ["ALİ KİTAP OKUR.", "📖"], ["KÖPEK KEMİK YER.", "🐶"], ["KEDİ PEYNİR YER.", "🧀"],
  ["KUŞ UÇAR.", "🐦"], ["UÇAK UÇAR.", "✈️"], ["GEMİ ÇOK BÜYÜK.", "🚢"], ["BABA ARABA SÜRER.", "🚗"],
  ["VAPUR DENİZDE.", "⛴️"], ["HAVA ÇOK GÜZEL.", "🌤️"], ["HAVA SOĞUK.", "❄️"], ["YAĞMUR YAĞIYOR.", "🌧️"],
  ["KAR YAĞIYOR.", "❄️"], ["TAVUK YUMURTLAR.", "🐔"], ["HOROZ ÖTER.", "🐓"], ["FARE PEYNİR YER.", "🐭"],
  ["KAPLUMBAĞA YAVAŞ.", "🐢"], ["TAVŞAN HIZLI.", "🐰"], ["ASLAN ORMANDA YAŞAR.", "🦁"], ["BALIK SUDA YÜZER.", "🐟"],
  ["ÇİFTÇİ TARLADA.", "👨‍🌾"], ["DOKTOR HASTA BAKAR.", "👨‍⚕️"], ["POLİS ÇOCUĞU KORUR.", "👮"],
  ["PİLOT UÇAK SÜRER.", "✈️"], ["ALİ FUTBOL OYNAR.", "⚽"], ["ALİ TOP OYNAR.", "⚽"], ["ELİF KİTAP OKUR.", "📖"],
  ["ELİF RESİM YAPAR.", "🖼️"], ["ELİF BEBEK İSTER.", "🧸"], ["ALİ HEDİYE AL.", "🎁"], ["HEDİYE ÇOK GÜZEL.", "🎁"],
  ["ALİ HAVUÇ YER.", "🥕"], ["OKUL ÇOK GÜZEL.", "🏫"], ["BAHÇE ÇİÇEK DOLU.", "🏡"], ["ALİ ELDİVEN TAKAR.", "🧤"],
  ["ANNE SÜT ISITIR.", "🥛"], ["ANNE MEYVE YIKAR.", "🍎"], ["ÖĞRENCİ DERS ÇALIŞIR.", "🧑‍🎓"], ["AĞAÇ ÇOK YEŞİL.", "🌳"],
  ["DAĞ ÇOK YÜKSEK.", "⛰️"], ["DOĞA ÇOK GÜZEL.", "🌲"], ["GÖKKUŞAĞI RENKLİ.", "🌈"], ["ALİ SAĞ EL İLE YAZAR.", "✍️"],
  ["ALİ AĞZINI AÇAR.", "😮"], ["DİŞİMİ FIRÇALARIM.", "🦷"], ["SABAH ERKEN KALKARIM.", "🌅"],
  ["BEN OKULA GİDERİM.", "🏫"], ["BEN KİTAP OKURUM.", "📖"], ["BEN RESİM YAPARIM.", "🎨"], ["BEN ÇOK SEVİNDİM.", "😄"],
  ["ANNEM BANA SARILDI.", "🤗"], ["BABAM İŞE GİDER.", "💼"], ["ARKADAŞIM İLE OYNARIM.", "🧑‍🤝‍🧑"],
  ["KIRMIZI ELMA TATLI.", "🍎"], ["SARI LİMON EKŞİ.", "🍋"], ["HAVUÇ TURUNCU.", "🥕"], ["ÇİM YEŞİL.", "🌱"],
  ["GÖKYÜZÜ MAVİ.", "🌌"], ["GÜNEŞ SARI.", "☀️"], ["KAR BEYAZ.", "❄️"], ["TREN GELDİ.", "🚂"],
  ["OTOBÜS DURAKTA.", "🚌"], ["ZÜRAFA ÇOK UZUN.", "🦒"], ["MAYMUN MUZ SEVER.", "🐒"], ["PENGUEN BUZDA YÜZER.", "🐧"],
  ["KURBAĞA GÖLDE.", "🐸"], ["KELEBEK UÇAR.", "🦋"], ["ARI BAL YAPAR.", "🐝"], ["KARINCA ÇALIŞKAN.", "🐜"],
  ["SİNCAP FINDIK YER.", "🐿️"], ["KANGURU ZIPLAR.", "🦘"], ["DEVE ÇÖLDE YAŞAR.", "🐪"],
  ["YUNUS DENİZDE YÜZER.", "🐬"], ["BALİNA ÇOK BÜYÜK.", "🐋"], ["ALİ ŞAPKA TAKAR.", "🧢"],
  ["ÇOCUKLAR PARKTA.", "🎠"], ["ELİF PİJAMA GİYER.", "😴"], ["MAVİ ARABA GİDİYOR.", "🚙"],
  ["TREN ÇOK HIZLI.", "🚄"], ["ANNE VAZOYA ÇİÇEK KOYAR.", "🏺"], ["BABA FIRINDAN EKMEK ALIR.", "🍞"],
  ["ELİF HAVLUYU ASAR.", "🧖"], ["HAYVANLAR ORMANDA YAŞAR.", "🐾"], ["BEN PEYNİR SEVERİM.", "🧀"],
  ["ALİ KAĞIT KESER.", "📄"], ["ALİ FIRÇA İLE BOYAR.", "🖌️"], ["FİL HORTUM İLE SU İÇER.", "🐘"],
  ["PEMBE ÇİÇEK AÇTI.", "🌸"], ["YEŞİL YAPRAK DÜŞTÜ.", "🍃"], ["ÇİFTLİKTE İNEK VAR.", "🐄"]
);
