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
  "E", "L", "A", "K", "İ", "N", "O", "M", "U", "T",
  "Ü", "Ö", "R", "I", "D", "S", "B", "Z", "Y", "Ç",
  "Ş", "G", "H", "C", "P", "V", "F", "J", "Ğ"
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
