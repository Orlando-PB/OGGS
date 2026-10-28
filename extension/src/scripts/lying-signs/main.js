// Lying signs: text on every Street View tile (via ggs.tiles, core/tiles.js) is found by a
// detector in a worker (worker.js: PP-OCRv4 on onnxruntime-web, loaded from ggs.extBase),
// painted over, and replaced with new text in another script, language or Minecraft glyphs.
// A blurred tile shows while the detector works, then the edit replaces it in the same texture.
(() => {
  const ggs = globalThis.__ggs;
  // Detector input size. 512-px tiles are upscaled so small text is found.
  const DET_SIZE = 768;
  // Boxes whose text differs from the sign by less than this (summed RGB) are ignored.
  const MIN_CONTRAST = 45;
  // Letter height as a share of the box height, for boxes cut by a tile edge.
  const TEXT_OF_BOX = 0.8;
  const VENDOR = 'src/scripts/lying-signs/vendor/';

  // biome-ignore format: word list
  const ENGLISH = [
    'JackSucksAtLife', 'JackSucksAtStuff', 'JackSucksAtGeography', 'Llama Crossing', 'JackSucksAtGuessing',
    'JackSucksAtClips', 'JackSucksAtPopUpPirate', 'JackSucksAtEspañol', 'JackApestaEnEspañol',
    'No Context JackSucksAtLife', 'Sock Outlet 42', 'ShopSmellsOfApricots', 'Apricot Outlet', 'qwerty',
    'Fudge', 'pretty decent kitchen', 'Geography Stuff', 'Jack & Oscar', 'Minecraft', 'Becky', 'Rick', 'Kai',
    'Kong', 'Flossy', 'Kazoo', 'Toothbrush', 'Spudger', 'Rhombus', 'Unicycle', 'Beanie', 'Lovely', 'Guinness',
    'Playbutton', 'Pie Shop', 'Tesla', 'Autopilot', 'Geography', 'Flag', 'Europe', 'Luxembourg', 'Seychelles',
    'Car Bar', 'Black tape', 'Vatican', 'Australia', 'Nottinghamshire', 'Welsh', 'Spanish', 'Español',
    'Reddit', 'Knick-Knacks', 'Doodle', 'Nelly', 'Jeremy', 'Vampire', 'Harmony Hollow', 'Minecraft Monday',
    'Piglin', 'Skyblock', 'Hacker Trolling', 'Misprint', 'Briefcase', 'Wigs', 'Recycling', 'Bush', 'Ukulele',
    'Weel', 'Toilet', 'Zigzag', 'Oscar', 'Zigzag Road', 'Oscar Was Here', 'Jack Was Here', 'Sucks At Life',
    'Sucks At Geography', 'Not Luxembourg', 'Definitely Kyrgyzstan', 'Probably Ohio', 'Bolivia?',
    'Wrong Country', 'Trust The Bollard', 'Follow The Tape', 'Guess Again', 'Plonk Here', '5000 Points',
    '4,999', 'Zero Points', 'Round 5', 'Gen 4', 'Trekker', 'Snow Cam', 'Rifts', 'Google Car',
    'Socks For Sale', 'Bingo', 'Big Bang', 'Nature Websites', 'Pop Up Pirate', 'Jacksucks Merch',
    'Silver Playbutton', 'Diamond Playbutton', 'Mossy Bench', 'Jaxsucksatlife', 'Sucks', 'Mossy', 'Apricots',
    'Toothbrush Factory', 'Kazoo Kid', 'Beanie Baby', 'Rhombus Road', 'Unicycle Lane', 'Spudger Street',
    'Flossy Avenue', 'Guinness Bar', 'Vampire Weekend', 'Piglin Bank', 'Skyblock Island',
    'Harmony Hollow Hotel', 'Misprint Museum', 'Briefcase Depot', 'Wig Emporium', 'Recycling Centre',
    'Bush Tucker', 'Weel Deel', 'Toilet Tour', 'Nelly The Elephant', 'Jeremy Fisher', "Becky's Lunch",
    'Kong King', 'Rick Roll', 'Kale Salad', 'Cheese', 'Left Only', 'Badger', 'Toast', 'No Parking', 'Sheep',
    'Bus Stop', 'Pancakes', 'Otter', 'Gravy', 'Wrong Way', 'Mild Peril', 'Beware Of Jack', 'Oscar Crossing',
    'Free Points', 'Actually Chile', 'Nice Try', 'Welcome To Wales',
  ];
  // Indexed by the "script" option; 0 is random (one script per panorama).
  // biome-ignore format: word lists
  const WORDS = [
    null,
    [
      'สวัสดี', 'ถนน', 'ตลาด', 'โรงเรียน', 'วัด', 'ร้านอาหาร', 'ทางออก', 'ระวัง', 'หยุด', 'กรุงเทพ',
      'เชียงใหม่', 'ภูเก็ต', 'ห้ามจอด', 'โรงแรม', 'ธนาคาร', 'สถานี', 'ตำรวจ', 'ยินดีต้อนรับ', 'ก๋วยเตี๋ยว',
      'ชายหาด', 'ขอนแก่น', 'พัทยา', 'อยุธยา', 'หาดใหญ่', 'นครราชสีมา', 'ซอย', 'ทางเข้า', 'ห้องน้ำ',
      'ร้านกาแฟ', 'ร้านขายยา', 'โรงพยาบาล', 'ตลาดน้ำ', 'ปั๊มน้ำมัน', 'มหาวิทยาลัย', 'สนามบิน', 'ท่าเรือ',
      'ลดความเร็ว', 'ทางม้าลาย', 'ห้ามเข้า', 'ส้มตำ', 'ผัดไทย', 'ข้าวมันไก่', 'ชาเย็น', 'เซเว่น', 'นวดแผนไทย',
      'ร้านซ่อมรถ', 'ร้านทอง', 'อู่รถ', 'บ้านพัก', 'ที่จอดรถ',
    ],
    [
      'გამარჯობა', 'ქუჩა', 'ბაზარი', 'სკოლა', 'თბილისი', 'გასასვლელი', 'ფრთხილად', 'გაჩერდი', 'ბათუმი',
      'ქუთაისი', 'სასტუმრო', 'ბანკი', 'აფთიაქი', 'პოლიცია', 'რესტორანი', 'ღვინო', 'ხაჭაპური', 'მოგესალმებით',
      'რუსთავი', 'გორი', 'ზუგდიდი', 'ფოთი', 'თელავი', 'მცხეთა', 'ბორჯომი', 'გუდაური', 'სვანეთი', 'კახეთი',
      'შესასვლელი', 'ტუალეტი', 'კაფე', 'საავადმყოფო', 'უნივერსიტეტი', 'აეროპორტი', 'სადგური', 'მეტრო',
      'ავტოსადგომი', 'გაჩერება', 'შეამცირე სიჩქარე', 'ხინკალი', 'ჩურჩხელა', 'ლობიანი', 'ჭაჭა', 'მაღაზია',
      'ბაზრობა', 'ეკლესია', 'მუზეუმი', 'თეატრი', 'სამრეცხაო',
    ],
    [
      '안녕하세요', '도로', '시장', '학교', '서울', '출구', '주의', '정지', '부산', '식당', '주차금지',
      '호텔', '은행', '약국', '경찰', '편의점', '지하철', '환영합니다', '김치', '노래방', '인천', '대구',
      '대전', '광주', '제주도', '수원', '울산', '강남', '홍대', '명동', '입구', '화장실', '카페', '병원',
      '대학교', '공항', '기차역', '버스정류장', '주차장', '서행', '횡단보도', '진입금지', '치킨', '삼겹살',
      '비빔밥', '떡볶이', '소주', '피시방', '찜질방', '세탁소', '미용실', '부동산', '치과', '교회', '박물관',
    ],
    [
      'مرحبا', 'شارع', 'سوق', 'مدرسة', 'مخرج', 'انتبه', 'قف', 'مطعم', 'القاهرة', 'دبي', 'فندق', 'بنك',
      'صيدلية', 'شرطة', 'ممنوع الوقوف', 'أهلا وسهلا', 'مسجد', 'محطة', 'الرياض', 'جدة', 'عمّان', 'بيروت',
      'الدوحة', 'مسقط', 'الرباط', 'تونس', 'بغداد', 'الإسكندرية', 'مدخل', 'حمام', 'مقهى', 'مستشفى', 'جامعة',
      'مطار', 'محطة القطار', 'موقف الباص', 'موقف سيارات', 'خفف السرعة', 'ممنوع الدخول', 'شاورما', 'فلافل',
      'كنافة', 'قهوة', 'بقالة', 'مخبز', 'جزار', 'كنيسة', 'متحف', 'مغسلة', 'صالون', 'عقارات', 'ميناء',
    ],
    [
      'привет', 'улица', 'рынок', 'школа', 'выход', 'осторожно', 'стоп', 'Москва', 'магазин', 'аптека',
      'банк', 'гостиница', 'полиция', 'вокзал', 'добро пожаловать', 'Новосибирск', 'шаурма',
      'парковка запрещена', 'Санкт-Петербург', 'Казань', 'Екатеринбург', 'Владивосток', 'Сочи', 'Омск',
      'Минск', 'Киев', 'Алматы', 'Бишкек', 'вход', 'туалет', 'кафе', 'больница', 'университет', 'аэропорт',
      'станция', 'остановка', 'парковка', 'въезд запрещён', 'пешеходный переход', 'продукты', 'пельмени',
      'борщ', 'блины', 'квас', 'пекарня', 'мясо', 'церковь', 'музей', 'театр', 'прачечная', 'парикмахерская',
      'шиномонтаж', 'автосервис', 'почта', 'дом культуры',
    ],
    [
      'Αθήνα', 'οδός', 'αγορά', 'σχολείο', 'έξοδος', 'προσοχή', 'στοπ', 'ταβέρνα', 'λιμάνι', 'ξενοδοχείο',
      'τράπεζα', 'φαρμακείο', 'αστυνομία', 'καλώς ήρθατε', 'Θεσσαλονίκη', 'σουβλάκι', 'παραλία', 'Πάτρα',
      'Ηράκλειο', 'Λάρισα', 'Βόλος', 'Ρόδος', 'Κέρκυρα', 'Χανιά', 'Σαντορίνη', 'Μύκονος', 'Λευκωσία',
      'είσοδος', 'τουαλέτα', 'καφενείο', 'νοσοκομείο', 'πανεπιστήμιο', 'αεροδρόμιο', 'σταθμός', 'στάση',
      'πάρκινγκ', 'απαγορεύεται η στάθμευση', 'γύρος', 'μουσακάς', 'φέτα', 'ούζο', 'φούρνος', 'κρεοπωλείο',
      'εκκλησία', 'μουσείο', 'θέατρο', 'περίπτερο', 'κομμωτήριο', 'βουλκανιζατέρ', 'ταχυδρομείο', 'πλατεία',
      'λεωφόρος',
    ],
    [
      'שלום', 'רחוב', 'שוק', 'בית ספר', 'יציאה', 'זהירות', 'עצור', 'מסעדה', 'תל אביב', 'ירושלים', 'מלון',
      'בנק', 'בית מרקחת', 'משטרה', 'ברוכים הבאים', 'חניה אסורה', 'פלאפל', 'תחנה', 'חיפה', 'באר שבע', 'אילת',
      'נתניה', 'הרצליה', 'צפת', 'טבריה', 'כניסה', 'שירותים', 'בית קפה', 'בית חולים', 'אוניברסיטה',
      'שדה תעופה', 'תחנת רכבת', 'תחנת אוטובוס', 'חניון', 'האט', 'מעבר חצייה', 'אין כניסה', 'שווארמה', 'חומוס',
      'סביח', 'מאפייה', 'מכולת', 'קצבייה', 'בית כנסת', 'מוזיאון', 'תיאטרון', 'מכבסה', 'מספרה', 'דואר',
      'שדרות', 'כיכר', 'גן ילדים', 'קופת חולים',
    ],
    [
      '東京', '駅', '市場', '学校', '出口', '注意', '止まれ', '食堂', '大阪', '銀行', '駐車禁止', 'ホテル',
      '薬局', '警察', 'ようこそ', 'ラーメン', '温泉', '京都', '北海道', 'コンビニ', '名古屋', '福岡', '札幌',
      '神戸', '横浜', '広島', '仙台', '沖縄', '奈良', '長崎', '入口', 'トイレ', '喫茶店', '病院', '大学',
      '空港', 'バス停', '駐車場', '徐行', '横断歩道', '進入禁止', '寿司', 'うどん', 'カレー', '焼肉',
      '居酒屋', 'パン屋', '肉屋', '神社', '寺', '博物館', '交番', '郵便局', '美容室', 'ガソリンスタンド',
      '自動販売機', '商店街', '一方通行', '踏切', '公園',
    ],
    [
      'नमस्ते', 'सड़क', 'बाज़ार', 'विद्यालय', 'निकास', 'सावधान', 'रुकिए', 'दिल्ली', 'होटल', 'मुंबई', 'बैंक',
      'दवाखाना', 'पुलिस', 'स्वागत है', 'पार्किंग नहीं', 'चाय', 'रेलवे स्टेशन', 'मंदिर', 'कोलकाता', 'चेन्नई',
      'बेंगलुरु', 'जयपुर', 'लखनऊ', 'वाराणसी', 'आगरा', 'पुणे', 'गोवा', 'काठमांडू', 'प्रवेश', 'शौचालय', 'ढाबा',
      'अस्पताल', 'विश्वविद्यालय', 'हवाई अड्डा', 'बस अड्डा', 'धीरे चलें', 'प्रवेश निषेध', 'समोसा', 'चाट',
      'बिरयानी', 'दाल', 'लस्सी', 'मिठाई', 'किराना', 'मस्जिद', 'गुरुद्वारा', 'संग्रहालय', 'डाकघर', 'नाई',
      'पंचर', 'साइकिल', 'रिक्शा', 'गली', 'चौक', 'नगर पालिका', 'जल',
    ],
    [
      'Երևան', 'փողոց', 'շուկա', 'դպրոց', 'ելք', 'զգույշ', 'կանգ', 'ռեստորան', 'հյուրանոց', 'բանկ',
      'դեղատուն', 'ոստիկանություն', 'բարի գալուստ', 'Գյումրի', 'լավաշ', 'կայարան', 'Վանաձոր', 'Դիլիջան',
      'Սևան', 'Գորիս', 'Ջերմուկ', 'Էջմիածին', 'Արարատ', 'մուտք', 'զուգարան', 'սրճարան', 'հիվանդանոց',
      'համալսարան', 'օդանավակայան', 'կանգառ', 'ավտոկայանատեղի', 'կայանելն արգելված է', 'խորոված', 'դոլմա',
      'թան', 'կոնյակ', 'հացատուն', 'մսավաճառ', 'եկեղեցի', 'թանգարան', 'թատրոն', 'փոստ', 'վարսավիրանոց',
      'անվադող', 'պողոտա', 'հրապարակ', 'դպրոց թիվ 5', 'մանկապարտեզ',
    ],
    ENGLISH,
    [
      'Ausfahrt', 'Bäckerei', 'Achtung', 'Bahnhof', 'Schule', 'Markt', 'Apotheke', 'Einbahnstraße', 'Halt',
      'Willkommen', 'Rathaus', 'Gasthaus', 'Metzgerei', 'Parkverbot', 'Polizei', 'Tankstelle', 'Biergarten',
      'Umleitung', 'Vorsicht', 'Schnitzel', 'Kindergarten', 'Wurst', 'Berlin', 'München', 'Hamburg', 'Köln',
      'Frankfurt', 'Stuttgart', 'Dresden', 'Leipzig', 'Nürnberg', 'Bremen', 'Wien', 'Zürich', 'Hauptstraße',
      'Bahnhofstraße', 'Kirchgasse', 'Am Markt', 'Dorfplatz', 'Einfahrt', 'Ausgang', 'Eingang', 'Toilette',
      'Krankenhaus', 'Universität', 'Flughafen', 'Haltestelle', 'Parkplatz', 'Fußgängerzone', 'Sackgasse',
      'Baustelle', 'Spielstraße', 'Anlieger frei', 'Zone 30', 'Feuerwehr', 'Sparkasse', 'Volksbank',
      'Friseur', 'Fahrschule', 'Imbiss', 'Döner', 'Currywurst', 'Brezel', 'Konditorei', 'Eisdiele',
      'Weinstube', 'Brauerei', 'Bierstube', 'Kirche', 'Friedhof', 'Museum', 'Schwimmbad', 'Sporthalle',
      'Gemeinde', 'Landkreis', 'Autobahn', 'Radweg', 'Wanderweg', 'Bushaltestelle', 'Zahnarzt', 'Reifen',
      'Autohaus', 'Werkstatt', 'Blumen', 'Getränkemarkt', 'Postfiliale', 'Bürgeramt', 'Freibad', 'Schloss',
      'Burg', 'Zum Hirschen', 'Zum Löwen', 'Gasthof Adler',
    ],
    [
      'Salida', 'Panadería', 'Cuidado', 'Escuela', 'Mercado', 'Farmacia', 'Playa', 'Alto', 'Calle',
      'Bienvenidos', 'Ayuntamiento', 'Carnicería', 'Prohibido aparcar', 'Policía', 'Gasolinera', 'Desvío',
      'Peligro', 'Churros', 'Cerveza', 'Iglesia', 'Estación', 'Madrid', 'Barcelona', 'Sevilla', 'Valencia',
      'Bilbao', 'Málaga', 'Granada', 'Zaragoza', 'Ciudad de México', 'Buenos Aires', 'Bogotá', 'Lima',
      'Santiago', 'Quito', 'La Paz', 'Montevideo', 'Calle Mayor', 'Avenida', 'Plaza', 'Paseo', 'Carretera',
      'Entrada', 'Baños', 'Bar', 'Cafetería', 'Hospital', 'Universidad', 'Aeropuerto', 'Parada',
      'Aparcamiento', 'Estacionamiento', 'Ceda el paso', 'Despacio', 'Obras', 'Zona escolar', 'Bomberos',
      'Banco', 'Caja', 'Peluquería', 'Autoescuela', 'Tapas', 'Paella', 'Tortilla', 'Jamón', 'Bodega',
      'Frutería', 'Pescadería', 'Ferretería', 'Papelería', 'Museo', 'Piscina', 'Polideportivo', 'Cementerio',
      'Correos', 'Taller', 'Neumáticos', 'Llantas', 'Farmacia de guardia', 'Se vende', 'Se alquila',
      'Abierto', 'Cerrado', 'Rebajas', 'Empanadas', 'Arepas', 'Tacos', 'Ceviche',
    ],
    [
      'Sortie', 'Boulangerie', 'Attention', 'École', 'Marché', 'Pharmacie', 'Gare', 'Arrêt', 'Rue',
      'Bienvenue', 'Mairie', 'Boucherie', 'Stationnement interdit', 'Police', 'Tabac', 'Déviation', 'Danger',
      'Croissant', 'Fromage', 'Église', 'Plage', 'Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Toulouse',
      'Nantes', 'Lille', 'Strasbourg', 'Nice', 'Montpellier', 'Bruxelles', 'Genève', 'Montréal', 'Québec',
      'Dakar', 'Abidjan', 'Rue de la Gare', 'Grande Rue', 'Place de la Mairie', 'Avenue', 'Route de',
      'Chemin', 'Impasse', 'Entrée', 'Toilettes', 'Café', 'Brasserie', 'Hôpital', 'Université', 'Aéroport',
      'Parking', 'Cédez le passage', 'Ralentir', 'Travaux', 'Zone 30', 'Pompiers', 'Banque',
      'Crédit Agricole', 'Coiffeur', 'Auto-école', 'Pâtisserie', 'Charcuterie', 'Fromagerie', 'Poissonnerie',
      'Épicerie', 'Cave', 'Baguette', 'Crêperie', 'Pain', 'Vin', 'Musée', 'Piscine', 'Gymnase', 'Cimetière',
      'La Poste', 'Garage', 'Pneus', 'Fleuriste', 'Librairie', 'Presse', 'À vendre', 'À louer', 'Ouvert',
      'Fermé', 'Soldes', 'Salle des fêtes', 'Camping', 'Château', 'Abbaye', 'Office de tourisme',
    ],
    'galactic',
  ];
  const GALACTIC_INDEX = WORDS.length - 1;
  // Arabic and Hindi letters join, so on a vertical sign the word is turned, not stacked.
  const JOINED = new Set([4, 9]);

  // Minecraft's enchanting-table letters as strokes on a 10x10 grid (a single point is a dot).
  // biome-ignore format: glyph table
  const GALACTIC = [
    [[[1,3],[9,3]],[[1,3],[1,6]],[[9,3],[9,9]]],          // ᔑ
    [[[3,1],[3,9],[7,9],[7,6]]],                          // ʖ
    [[[8,2],[2,2],[2,9],[8,9]]],                          // ᓵ
    [[[2,8],[2,2],[8,2]],[[2,2],[8,8]]],                  // ↸
    [[[2,2],[8,2],[8,9]],[[2,5],[8,5]]],                  // ᒷ
    [[[2,3],[8,3]],[[2,7],[8,7]],[[5,5]]],                // ⎓
    [[[9,1],[9,9]],[[2,5],[9,5]]],                        // ⊣
    [[[2,3],[8,3]],[[5,3],[5,9]],[[5,1]]],                // ⍑
    [[[5,1],[5,4]],[[5,6],[5,9]]],                        // ╎
    [[[5,2]],[[5,5]],[[5,8]]],                            // ⋮
    [[[2,9],[2,2],[8,2]],[[5,2],[5,6]]],                  // ꖌ
    [[[2,1],[2,9],[8,9]],[[5,5],[8,5]]],                  // ꖎ
    [[[2,9],[2,2],[8,2],[8,5]]],                          // ᒲ
    [[[2,2],[2,6]],[[8,1],[8,9],[5,9]]],                  // リ
    [[[2,2],[8,2]],[[6,2],[6,9],[3,9]]],                  // 𝙹
    [[[3,1],[3,6]],[[3,9]],[[7,1]],[[7,4],[7,9]]],        // !¡
    [[[2,2],[8,2],[8,9]],[[2,6],[8,6]]],                  // ᑑ
    [[[3,3]],[[7,3]],[[3,7]],[[7,7]]],                    // ∷
    [[[2,2],[8,2],[8,5],[2,5],[2,9],[8,9]]],              // ᓭ
    [[[2,2],[8,2],[8,9]],[[5,9]]],                        // ℸ
    [[[3,1],[3,9]],[[7,1],[7,9]],[[5,3]],[[5,7]]],        // ⚍
    [[[2,9],[8,9]],[[5,9],[5,3]],[[5,1]]],                // ⍊
    [[[5,2]],[[2,8]],[[8,8]]],                            // ∴
    [[[3,1],[3,9]],[[7,1],[7,9]]],                        // ||
    [[[2,9],[2,2],[8,2],[8,9]]],                          // ⨅
  ];
  function drawGalactic(g, b, rand = Math.random) {
    const h = b.h * 0.72;
    const adv = h * 0.62;
    const gap = h * 0.16;
    const n = Math.max(1, Math.floor((b.w - 2) / adv));
    const x0 = b.x + (b.w - n * adv + gap) / 2;
    const y0 = b.y + (b.h - h) / 2;
    g.lineWidth = Math.max(1, h * 0.11);
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = g.fillStyle;
    for (let i = 0; i < n; i++) {
      const glyph = GALACTIC[Math.floor(rand() * GALACTIC.length)];
      const gx = x0 + i * adv;
      const s = (adv - gap) / 10;
      for (const line of glyph) {
        g.beginPath();
        if (line.length === 1) {
          g.arc(gx + line[0][0] * s, y0 + line[0][1] * (h / 10), g.lineWidth * 0.7, 0, 7);
          g.fill();
          continue;
        }
        line.forEach(([x, y], k) => (k ? g.lineTo : g.moveTo).call(g, gx + x * s, y0 + y * (h / 10)));
        g.stroke();
      }
    }
  }

  // Randomness seeded on a sign's place in the panorama, so it reads the same at every zoom.
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let active = null; // cfg while the script is on
  const stats = { seen: 0, edited: 0, boxes: 0, failed: 0, detectMs: 0, detected: 0, editMs: 0, editMax: 0 };
  ggs.lyingSigns = { stats };

  // ---- detector worker ----
  let worker = null;
  let workerReady = null;
  let nextId = 0;
  const waiting = new Map(); // id -> resolve
  function detector() {
    if (workerReady) return workerReady;
    workerReady = (async () => {
      if (!ggs.extBase) throw new Error('extension base URL not known yet');
      const u = f => ggs.extBase + VENDOR + f;
      const blobUrl = async (url, type) => {
        const bytes = await (await fetch(url)).arrayBuffer();
        return URL.createObjectURL(new Blob([bytes], { type }));
      };
      const [src, ort, mjs, wasm, model] = await Promise.all([
        fetch(ggs.extBase + 'src/scripts/lying-signs/worker.js').then(r => r.text()),
        blobUrl(u('ort.webgpu.min.js'), 'text/javascript'),
        blobUrl(u('ort-wasm-simd-threaded.asyncify.mjs'), 'text/javascript'),
        blobUrl(u('ort-wasm-simd-threaded.asyncify.wasm'), 'application/wasm'),
        fetch(u('ch_PP-OCRv4_det.onnx')).then(r => r.arrayBuffer()),
      ]);
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      worker.onmessage = e => {
        const m = e.data;
        if (m.type === 'boxes') {
          stats.detected++;
          stats.detectMs += m.ms;
          waiting.get(m.id)?.(m.boxes);
          waiting.delete(m.id);
        } else if (m.type === 'error') {
          stats.failed++;
          ggs.log('lying-signs: detector error', m.message);
          waiting.get(m.id)?.(null);
          waiting.delete(m.id);
        }
      };
      const backend = await new Promise((res, rej) => {
        const onmsg = e => {
          if (e.data.type === 'ready') {
            worker.removeEventListener('message', onmsg);
            res(e.data.backend);
          } else if (e.data.type === 'error') {
            rej(new Error(e.data.message));
          }
        };
        worker.addEventListener('message', onmsg);
        worker.postMessage({ type: 'init', ort, mjs, wasm, model }, [model]);
      });
      stats.backend = backend;
      ggs.debug(`lying-signs: text detector ready (${backend})`);
    })();
    workerReady.catch(err => {
      ggs.log('lying-signs: text detector failed to load', err);
      // Close the half-started worker so a retry doesn't leave it running.
      worker?.terminate();
      worker = null;
      workerReady = null;
    });
    return workerReady;
  }
  // Detection queue, nearest tile to the view first. Tiles whose textures are gone, or whose
  // panorama is no longer shown, are dropped unrun. The queue is capped so moving quickly
  // never builds a backlog. A dropped tile is detected if it is uploaded again.
  const queue = []; // [{ img, res, alive, url }]
  let inflight = 0;
  const MAX_INFLIGHT = 2;
  const MAX_QUEUE = 300;
  ggs.lyingSigns.debug = () => ({
    queue: queue.length,
    inflight,
    waiting: waiting.size,
    tiles: tiles.size,
    panos: signs.size,
    stale: stale.size,
  });
  function detect(img, alive, url) {
    return new Promise(res => {
      queue.push({ img, res, alive, url });
      while (queue.length > MAX_QUEUE) {
        stats.skipped = (stats.skipped || 0) + 1;
        queue.shift().res(null);
      }
      pump();
    });
  }
  function pruneQueue() {
    const shown = new Set();
    for (const p of panos) {
      try {
        shown.add(p.getPano());
      } catch {}
    }
    for (let i = queue.length - 1; i >= 0; i--) {
      const id = ggs.tileKey(queue[i].url)?.pano;
      if (id && !shown.has(id)) {
        stats.skipped = (stats.skipped || 0) + 1;
        queue.splice(i, 1)[0].res(null);
      }
    }
  }
  function tileDistance(url) {
    const k = ggs.tileKey(url);
    if (!k) return null;
    const { pano: id, x, y, z } = k;
    for (const p of panos) {
      let pov;
      let centre;
      try {
        if (p.getPano() !== id) continue;
        pov = p.getPov();
        centre = p.getPhotographerPov?.()?.heading;
      } catch {
        continue;
      }
      if (!pov || centre == null) return null;
      const cols = 2 ** z;
      const rows = Math.max(1, 2 ** (z - 1));
      const heading = centre + ((+x + 0.5) / cols - 0.5) * 360;
      const pitch = (0.5 - (+y + 0.5) / rows) * 180;
      const dh = Math.abs(((((heading - pov.heading) % 360) + 540) % 360) - 180);
      return Math.hypot(dh * Math.cos((pov.pitch * Math.PI) / 180), pitch - pov.pitch);
    }
    return null;
  }
  function pickJob() {
    let best = queue.length - 1;
    let bestD = Infinity;
    for (let i = queue.length - 1; i >= 0; i--) {
      const d = tileDistance(queue[i].url);
      if (d === null) break; // no view info: newest first
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return queue.splice(best, 1)[0];
  }
  async function pump() {
    if (inflight >= MAX_INFLIGHT || !queue.length) return;
    inflight++;
    try {
      await detector();
      const job = pickJob();
      // another pump may have taken the last job while the detector loaded
      if (!job) return;
      if (!job.alive()) {
        stats.skipped = (stats.skipped || 0) + 1;
        job.res(null);
        return;
      }
      const bitmap = await createImageBitmap(job.img);
      const boxes = await new Promise(r => {
        const id = ++nextId;
        waiting.set(id, r);
        const msg = { type: 'detect', id, bitmap, size: DET_SIZE, thresh: 0.25, boxThresh: 0.45 };
        worker.postMessage(msg, [bitmap]);
      });
      job.res(boxes);
    } catch {
      stats.failed++;
      for (const j of queue.splice(0)) j.res(null);
    } finally {
      inflight--;
      if (queue.length) pump();
    }
  }

  // ---- signs ----
  // Every text box found in a panorama, at any zoom, in panorama units (1 = its width), with
  // what was decided about it: skipped or not, letter height, colour, the word written.
  // A sign found at one zoom is drawn into the tiles of every zoom on screen, so zooming in
  // or out shows the same words.
  const signs = new Map(); // pano -> [sign]
  const detectedTiles = new Set(); // "pano/z/x/y" the detector has run on
  const tileId = k => `${k.pano}/${k.z}/${k.x}/${k.y}`;
  const MAX_PANOS = 20;

  function toTile(sg, k, W) {
    const u = W * 2 ** k.z;
    return {
      cx: sg.cx * u - k.x * W,
      cy: sg.cy * u - k.y * W,
      w: sg.w * u,
      h: sg.h * u,
      angle: sg.angle,
      vertical: sg.vertical,
      sign: sg,
    };
  }
  function touches(sg, k, W) {
    const b = toTile(sg, k, W);
    const r = Math.hypot(b.w, b.h) / 2;
    return b.cx + r > 0 && b.cy + r > 0 && b.cx - r < W && b.cy - r < W;
  }
  const signsIn = (k, W) =>
    (signs.get(k.pano) || []).filter(sg => touches(sg, k, W)).map(sg => toTile(sg, k, W));

  // Adds a tile's detections, biggest first. A known sign wins, as it may span tiles, unless a
  // new box is bigger and covers its middle (the other zoom only saw a sliver of it).
  function addSigns(k, W, found) {
    if (!signs.has(k.pano)) {
      signs.set(k.pano, []);
      if (signs.size > MAX_PANOS) {
        const old = signs.keys().next().value;
        signs.delete(old);
        for (const id of detectedTiles) if (id.startsWith(old + '/')) detectedTiles.delete(id);
      }
    }
    const list = signs.get(k.pano);
    const u = W * 2 ** k.z;
    const added = [];
    const removed = [];
    for (const b of found.slice().sort((a, c) => c.w * c.h - a.w * a.h)) {
      const sg = {
        cx: (k.x * W + b.cx) / u,
        cy: (k.y * W + b.cy) / u,
        w: b.w / u,
        h: b.h / u,
        angle: b.angle,
        vertical: b.vertical,
        words: {},
      };
      const covered = list.filter(o => inside(o, sg) && sg.w * sg.h > o.w * o.h);
      if (list.some(o => !covered.includes(o) && inside(sg, o))) continue;
      for (const o of covered) {
        list.splice(list.indexOf(o), 1);
        removed.push(o);
      }
      sg.seed = hash(`${k.pano}:${Math.round(sg.cx * 4096)}:${Math.round(sg.cy * 4096)}`);
      list.push(sg);
      added.push(sg);
    }
    return { added, removed };
  }
  // whether b's middle is inside box a
  function inside(b, a) {
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const c = Math.cos(a.angle);
    const s = Math.sin(a.angle);
    return Math.abs(dx * c + dy * s) < a.w / 2 && Math.abs(-dx * s + dy * c) < a.h / 2;
  }
  // Known well enough to edit without waiting: the detector ran on this tile, on its parent
  // or grandparent, or on all its children (or grandchildren).
  function covered(k) {
    if (detectedTiles.has(tileId(k))) return true;
    for (let up = 1; up <= 2; up++) {
      const f = 2 ** up;
      const parent = { pano: k.pano, z: k.z - up, x: Math.floor(k.x / f), y: Math.floor(k.y / f) };
      if (detectedTiles.has(tileId(parent))) return true;
    }
    return kidsCovered(k, 2);
  }
  function kidsCovered(k, depth) {
    if (depth === 0) return false;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const c = { pano: k.pano, z: k.z + 1, x: 2 * k.x + dx, y: 2 * k.y + dy };
        if (!detectedTiles.has(tileId(c)) && !kidsCovered(c, depth - 1)) return false;
      }
    return true;
  }

  // ---- tiles ----
  // url -> { key, img, canvas, cfg, recs: [upload records], drawn: Set of signs }
  const tiles = new Map();

  // What goes into WebGL for this tile: the edit if the area is known, otherwise a blur while
  // the detector works. Tiles another script already swapped for a canvas are left alone.
  ggs.tiles.filter((rec, img) => {
    if (!active || !(img instanceof HTMLImageElement)) return img;
    const url = rec.url;
    const k = ggs.tileKey(url);
    if (!k) return img;
    let t = tiles.get(url);
    if (!t) {
      t = { key: k, img, canvas: null, cfg: null, recs: [], drawn: new Set() };
      tiles.set(url, t);
      if (tiles.size > 800) tiles.delete(tiles.keys().next().value);
      stats.seen++;
    }
    t.img = img;
    t.recs = t.recs.filter(ggs.tiles.live);
    t.recs.push(rec);
    if (!detectedTiles.has(tileId(k)) && !t.queued) queueDetect(t, url);
    if (t.canvas && t.cfg === active) return t.canvas;
    if (covered(k)) {
      editTile(t);
      return t.canvas;
    }
    t.canvas = null;
    return blurred(img);
  }, 1);

  function queueDetect(t, url) {
    const k = t.key;
    const W = t.img.naturalWidth || t.img.width;
    t.queued = true;
    detect(t.img, () => t.recs.some(ggs.tiles.live), url).then(found => {
      t.queued = false;
      if (!found) return; // skipped or failed; a later upload retries
      detectedTiles.add(tileId(k));
      stats.boxes += found.length;
      const { added, removed } = addSigns(k, W, found);
      if (!active) return;
      // it was showing the blur
      if (!t.canvas || t.cfg !== active) {
        editTile(t);
        upload(t);
      }
      refresh(k.pano, added, removed, t);
    });
  }

  // The whole tile from the original, with every known sign; or, with `more`, just those
  // signs drawn onto the edit already there.
  function editTile(t, more) {
    const W = t.img.naturalWidth || t.img.width;
    const boxes = more ? more.map(sg => toTile(sg, t.key, W)) : signsIn(t.key, W);
    if (!more) t.drawn = new Set();
    t.canvas = editSync(t.img, boxes, active, t.key, more ? t.canvas : null);
    for (const b of boxes) t.drawn.add(b.sign);
    t.cfg = active;
  }
  // New signs in a panorama are drawn into every edited tile they touch, at any zoom, and
  // those tiles go to WebGL again. A tile that drew a since-replaced sign is redone. The tile
  // just detected (`now`) is done at once, the rest a few at a time in idle time, so a burst
  // of detections never stalls a frame.
  const stale = new Map(); // tile -> Set of signs to add, or 'all' to redo it
  let draining = false;
  function refresh(pano, added, removed, now) {
    for (const t of tiles.values()) {
      if (t.key.pano !== pano || !t.canvas || t.cfg !== active) continue;
      const W = t.img.naturalWidth || t.img.width;
      if (removed.some(sg => t.drawn.has(sg))) {
        stale.set(t, 'all');
        continue;
      }
      const mine = added.filter(sg => touches(sg, t.key, W) && !t.drawn.has(sg));
      if (!mine.length || stale.get(t) === 'all') continue;
      if (!stale.has(t)) stale.set(t, new Set());
      for (const sg of mine) stale.get(t).add(sg);
    }
    if (stale.has(now)) redo(now);
    drain();
  }
  function redo(t) {
    const job = stale.get(t);
    stale.delete(t);
    if (!t.canvas || t.cfg !== active) return;
    if (job === 'all') editTile(t);
    else {
      const more = [...job].filter(sg => !t.drawn.has(sg));
      if (!more.length) return;
      editTile(t, more);
    }
    upload(t);
  }
  const idle = () =>
    new Promise(res =>
      window.requestIdleCallback
        ? requestIdleCallback(res, { timeout: 200 })
        : setTimeout(() => res({ timeRemaining: () => 8 }), 16),
    );
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (stale.size) {
        const slice = await idle();
        do {
          redo(stale.keys().next().value);
        } while (stale.size && slice.timeRemaining() > 6);
      }
    } finally {
      draining = false;
    }
  }
  function upload(t) {
    t.recs = t.recs.filter(ggs.tiles.live);
    for (const r of t.recs) {
      try {
        if (ggs.tiles.upload(r, t.canvas)) stats.edited++;
      } catch (err) {
        stats.failed++;
        if (stats.failed < 4) ggs.log('lying-signs: re-upload failed', err);
      }
    }
  }

  // ---- the edits ----
  // Placeholder while the detector works: the tile at 1/10 size, scaled back up.
  function blurred(img) {
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    const small = new OffscreenCanvas(Math.max(1, (W / 10) | 0), Math.max(1, (H / 10) | 0));
    small.getContext('2d').drawImage(img, 0, 0, small.width, small.height);
    const c = new OffscreenCanvas(W, H);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(small, 0, 0, W, H);
    return c;
  }

  // Edits a tile with the detector's boxes and returns an OffscreenCanvas. With `onto`, an
  // earlier edit of the same tile, only the given boxes are added to it.
  function editSync(src, boxes, cfg, key, onto) {
    const t0 = performance.now();
    const W = src.naturalWidth || src.width;
    const H = src.naturalHeight || src.height;
    const c = onto || new OffscreenCanvas(W, H);
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!onto) {
      g.drawImage(src, 0, 0);
      nadir(g, key, W, H);
    }
    for (const raw of usable(boxes, key, H)) {
      const rand = rng(raw.sign.seed);
      let script = cfg.script | 0;
      if (!WORDS[script]) script = 0;
      // random: one script per panorama
      if (script === 0) script = 1 + (hash('script:' + (key?.pano || '')) % (WORDS.length - 1));
      const list = WORDS[script];
      const pick = list === 'galactic' ? null : () => list[Math.floor(rand() * list.length)];
      try {
        replaceBox(g, raw, script, pick, rand, W);
      } catch (err) {
        stats.failed++;
        if (stats.failed < 4) ggs.log('lying-signs: box failed', err);
      }
    }
    const ms = performance.now() - t0;
    stats.editMs += ms;
    stats.editMax = Math.max(stats.editMax, ms);
    return c;
  }

  // The boxes worth editing: big enough at this zoom, and not on the ground.
  function usable(boxes, key, H) {
    return boxes.filter(b => {
      if (b.h < 4 || b.w < 4) return false;
      if (onGround(key, b, H)) {
        stats.ground = (stats.ground || 0) + 1;
        return false;
      }
      return true;
    });
  }
  // Road markings, tyres, drain covers: anything below GROUND_PITCH, or a big box a little
  // below the horizon (a shop sign there is seldom more than a few degrees tall).
  const GROUND_PITCH = -30;
  function onGround(k, b, H) {
    if (!k) return false;
    const deg = 180 / (Math.max(1, 2 ** (k.z - 1)) * H); // degrees per tile pixel
    const pitch = 90 - (k.y * H + b.cy) * deg;
    return pitch < GROUND_PITCH || (pitch < -8 && Math.min(b.w, b.h) * deg > 6);
  }

  // The bottom of the panorama (the car) is stretched too much for the detector, so
  // everything below NADIR_PITCH is smeared into a coarse mosaic instead.
  const NADIR_PITCH = -68;
  function nadir(g, k, W, H) {
    if (!k) return;
    const rows = Math.max(1, 2 ** (k.z - 1));
    // tile y where the mosaic starts
    const top = Math.max(0, (((90 - NADIR_PITCH) / 180) * rows - k.y) * H);
    if (top >= H) return;
    const band = H - top;
    const fade = Math.min(10, band);
    const small = new OffscreenCanvas(Math.max(1, (W / 16) | 0), Math.max(1, (band / 16) | 0));
    small.getContext('2d').drawImage(g.canvas, 0, top, W, band, 0, 0, small.width, small.height);
    const layer = new OffscreenCanvas(W, band);
    const l = layer.getContext('2d');
    l.imageSmoothingQuality = 'high';
    l.drawImage(small, 0, 0, W, band);
    const grad = l.createLinearGradient(0, 0, 0, fade);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    l.globalCompositeOperation = 'destination-in';
    l.fillStyle = grad;
    l.fillRect(0, 0, W, fade);
    l.fillStyle = '#000';
    l.fillRect(0, fade, W, band - fade);
    g.drawImage(layer, 0, top);
    stats.nadir = (stats.nadir || 0) + 1;
  }

  // Replaces one line of text. Works in a frame rotated so the text runs level, cut to the
  // tile, so a huge box inherited from a zoomed-out tile costs no more than its part on this
  // tile. The old strokes are told apart from the sign by colour, grown a little to take their
  // halo, and filled in from the sign around them, so the sign's colour and gradients stay.
  // The new word goes on top at the old text's height and colour.
  function replaceBox(g, raw, script, pick, rand, tileW) {
    const W = g.canvas.width;
    const H = g.canvas.height;
    // level text is copied, not resampled
    const angle = Math.abs(raw.angle) < 0.01 ? 0 : raw.angle;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    // the frame's origin, on a pixel
    const ox = Math.round(raw.cx);
    const oy = Math.round(raw.cy);
    const bu = (raw.cx - ox) * ca + (raw.cy - oy) * sa;
    const bv = -(raw.cx - ox) * sa + (raw.cy - oy) * ca;
    // the box hugs the strokes, so give them room
    const pad = raw.h * 0.12;
    const hw = raw.w / 2 + pad;
    const hh = raw.h / 2 + pad;
    const ctx = Math.max(4, Math.round(raw.h * 0.3)); // sign around the box, for the fill
    // the tile's extent in the frame
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const [x, y] of [
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
    ]) {
      const u = (x - ox) * ca + (y - oy) * sa;
      const v = -(x - ox) * sa + (y - oy) * ca;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const rx = Math.floor(Math.max(bu - hw - ctx, u0));
    const ry = Math.floor(Math.max(bv - hh - ctx, v0));
    const w = Math.ceil(Math.min(bu + hw + ctx, u1)) - rx;
    const h = Math.ceil(Math.min(bv + hh + ctx, v1)) - ry;
    if (w < 4 || h < 4) return;
    // Strokes are looked for in the detector's own box. The padding is room to grow them into.
    const box = [
      Math.max(0, Math.round(bu - raw.w / 2 - rx)),
      Math.max(0, Math.round(bv - raw.h / 2 - ry)),
      Math.min(w, Math.round(bu + raw.w / 2 - rx)),
      Math.min(h, Math.round(bv + raw.h / 2 - ry)),
    ];
    if (box[2] - box[0] < 3 || box[3] - box[1] < 3) return;
    // the box isn't cut by the tile edge
    const whole = bu - hw - rx > 0 && bv - hh - ry > 0 && bu + hw - rx < w && bv + hh - ry < h;

    const temp = new OffscreenCanvas(w, h);
    const t = temp.getContext('2d', { willReadFrequently: true });
    t.translate(-rx, -ry);
    t.rotate(-angle);
    t.translate(-ox, -oy);
    t.drawImage(g.canvas, 0, 0); // outside the tile stays transparent
    t.setTransform(1, 0, 0, 1, 0, 0);
    const img = t.getImageData(0, 0, w, h);
    const d = img.data;

    // Decisions made while the whole box is on the tile are kept on the sign for every zoom.
    const sign = raw.sign;
    const fit = sign.fit;
    if (fit?.skip) return;
    const grow = 1 + Math.round(raw.h * 0.04);
    const s = strokes(d, w, h, box, grow);
    const skip = !s ? 'lowContrast' : !fit && watermark(raw, tileW, s.bg, s.fg) ? 'watermark' : null;
    // clouds, brickwork, foliage, Google's marks: not text to replace
    if (skip) {
      stats[skip] = (stats[skip] || 0) + 1;
      if (whole && !fit) sign.fit = { skip };
      return;
    }
    const surf = surface(d, w, h, s, grow + 1);
    const levels = pushPull(d, s.mask, w, h);
    texture(d, s.mask, w, h, box, levels, s.grain);
    // only the old strokes are replaced
    for (let i = 0; i < w * h; i++) if (!s.mask[i]) d[i * 4 + 3] = 0;
    t.putImageData(img, 0, 0);

    // Letter height, position and colour are measured once the whole box is on the tile, then
    // kept. Until then a box cut by the tile edge is sized from the detector.
    let f = fit;
    if (!f) {
      const measured = whole && s.bottom > s.top;
      f = {
        textH: measured ? Math.max(0.35, (s.bottom - s.top + 1) / raw.h) : TEXT_OF_BOX,
        dy: measured ? ((s.top + s.bottom + 1) / 2 - (bv - ry)) / raw.h : 0,
        fg: s.fg,
      };
      if (whole) sign.fit = f;
    }
    const textH = f.textH * raw.h;
    const cy = bv - ry + f.dy * raw.h;
    // the new word on its own layer, kept to the sign's surface
    const layer = new OffscreenCanvas(w, h);
    const x = layer.getContext('2d', { willReadFrequently: true });
    x.fillStyle = `rgb(${f.fg.join(',')})`;
    if (script === GALACTIC_INDEX) {
      const glyphH = textH / 0.72;
      drawGalactic(x, { x: bu - rx - raw.w / 2, y: cy - glyphH / 2, w: raw.w, h: glyphH }, rand);
    } else {
      const stacked = raw.vertical && !JOINED.has(script);
      sign.words[script] ||= chooseWord(textH / raw.h, raw.w / raw.h, pick, stacked);
      writeWord(x, bu - rx, cy, textH, raw.w, sign.words[script]);
    }
    const ld = x.getImageData(0, 0, w, h);
    for (let i = 0; i < w * h; i++) if (!surf[i]) ld.data[i * 4 + 3] = 0;
    x.putImageData(ld, 0, 0);
    t.drawImage(layer, 0, 0);

    g.save();
    g.translate(ox, oy);
    g.rotate(angle);
    g.drawImage(temp, rx, ry);
    g.restore();
  }

  // Of a few seeded words, the one that best fills a box of this shape (`aspect` = width /
  // height) at this letter height (`textH`, a fraction of the box height). Chosen once per
  // sign so every zoom writes the same word. `stacked` is for a vertical sign: the characters
  // go one under another, upright.
  function chooseWord(textH, aspect, pick, stacked) {
    measurer.font = 'bold 100px sans-serif';
    let best = null;
    for (let k = 0; k < 6; k++) {
      const word = pick();
      let fill;
      if (stacked) fill = (aspect * 0.92) / (graphemes(word).length * textH * 1.1);
      else {
        const m = measurer.measureText(word);
        const gh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || 100;
        fill = (aspect * 0.92) / ((m.width * textH) / gh);
      }
      if (!best || Math.abs(Math.log(fill)) < Math.abs(Math.log(best.fill))) best = { word, fill };
    }
    return { word: best.word, stacked };
  }
  const measurer = new OffscreenCanvas(1, 1).getContext('2d');
  // Writes a chosen word centred at (cx, cy) with letters textH px tall, stretched a little
  // to fill boxW, shrunk if it still doesn't fit.
  function writeWord(t, cx, cy, textH, boxW, { word, stacked }) {
    if (stacked) {
      const chars = graphemes(word);
      const step = Math.min(textH * 1.1, (boxW * 0.92) / chars.length);
      t.font = `bold ${step / 1.1}px sans-serif`;
      t.textAlign = 'center';
      t.textBaseline = 'middle';
      chars.forEach((ch, i) => {
        t.save();
        t.translate(cx + (i - (chars.length - 1) / 2) * step, cy);
        t.rotate(-Math.PI / 2);
        t.fillText(ch, 0, 0);
        t.restore();
      });
      return;
    }
    t.font = 'bold 100px sans-serif';
    let m = t.measureText(word);
    const gh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || 100;
    const width = (m.width * textH) / gh;
    const sx = Math.min(1.25, Math.max(0.75, (boxW * 0.92) / width));
    let size = (100 * textH) / gh;
    if (width * sx > boxW) size *= boxW / (width * sx);
    t.font = `bold ${size}px sans-serif`;
    m = t.measureText(word);
    t.save();
    t.translate(cx, cy);
    t.scale(sx, 1);
    t.fillText(word, -m.width / 2, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    t.restore();
  }

  // The old text inside `box` ([x0, y0, x1, y1]). The sign colour is the commonest one and
  // the strokes are what's far from it. Returns the strokes as a mask grown by `grow` px,
  // their colour, the rows they span and how grainy the sign is, or null if nothing stands out.
  function strokes(d, w, h, box, grow) {
    const [x0, y0, x1, y1] = box;
    const bins = new Float64Array(512 * 4); // 8-level colour cube: count, r, g, b
    let n = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] < 200) continue;
        n++;
        const k = ((d[i] >> 5) * 64 + (d[i + 1] >> 5) * 8 + (d[i + 2] >> 5)) * 4;
        bins[k]++;
        bins[k + 1] += d[i];
        bins[k + 2] += d[i + 1];
        bins[k + 3] += d[i + 2];
      }
    let b = 0;
    for (let k = 4; k < bins.length; k += 4) if (bins[k] > bins[b]) b = k;
    if (!n) return null;
    const bg = [bins[b + 1] / bins[b], bins[b + 2] / bins[b], bins[b + 3] / bins[b]];
    const dist = i => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
    // typical stroke pixel: the median of the eighth furthest from the sign colour
    const hist = new Uint32Array(766);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] >= 200) hist[dist(i) | 0]++;
      }
    let contrast = 765;
    for (let v = 765, c = 0; v >= 0; v--) {
      c += hist[v];
      if (c >= n / 16) {
        contrast = v;
        break;
      }
    }
    if (contrast < MIN_CONTRAST) return null;
    const thr = Math.max(24, contrast * 0.45);
    const strong = contrast * 0.8;
    const core = new Uint8Array(w * h);
    const ink = new Float64Array(512 * 4); // stroke colours, same cube
    let top = h;
    let bottom = -1;
    let gsum = 0;
    let gn = 0;
    const rowMin = Math.max(2, (x1 - x0) * 0.03);
    for (let y = y0; y < y1; y++) {
      let row = 0;
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] < 200) continue;
        const v = dist(i);
        if (v > thr) {
          core[y * w + x] = 1;
          row++;
        }
        if (v > strong) {
          const k = ((d[i] >> 5) * 64 + (d[i + 1] >> 5) * 8 + (d[i + 2] >> 5)) * 4;
          ink[k]++;
          ink[k + 1] += d[i];
          ink[k + 2] += d[i + 1];
          ink[k + 3] += d[i + 2];
        } else if (v <= thr && x + 1 < x1 && dist(i + 4) <= thr) {
          // grain: brightness change between neighbouring sign pixels
          gsum += Math.abs(d[i] + d[i + 1] + d[i + 2] - d[i + 4] - d[i + 5] - d[i + 6]) / 3;
          gn++;
        }
      }
      if (row >= rowMin) {
        if (y < top) top = y;
        bottom = y;
      }
    }
    // text colour: the commonest stroke colour, so an outline or shading doesn't grey the fill
    let f = 0;
    for (let k = 4; k < ink.length; k += 4) if (ink[k] > ink[f]) f = k;
    if (!ink[f]) return null;
    return {
      mask: dilate(core, w, h, grow),
      fg: [1, 2, 3].map(j => Math.round(ink[f + j] / ink[f])),
      bg,
      contrast,
      top,
      bottom,
      grain: gn ? Math.min(6, (gsum / gn) * 0.5) : 0,
    };
  }
  // Google's "© 2025 Google" marks: always the same small size and shape on a tile, grey and
  // see-through. The background is lightened by about the same fraction in every channel.
  // Real white or grey lettering is far more opaque.
  function watermark(raw, tileW, bg, fg) {
    const h = raw.h / tileW;
    const aspect = raw.w / raw.h;
    if (raw.vertical || h < 0.018 || h > 0.045 || aspect < 3.5 || aspect > 8) return false;
    if (Math.max(...fg) - Math.min(...fg) > 30) return false; // coloured: not the grey mark
    const a = [0, 1, 2].map(k => (fg[k] - bg[k]) / (256 - bg[k]));
    return Math.min(...a) > 0.1 && Math.max(...a) < 0.55 && Math.max(...a) - Math.min(...a) < 0.1;
  }
  // Where the sign is: pixels of its colour or of the old text's colour. Anything else (a
  // pole in front, the sky past the end of the sign, the side of a curved building) isn't,
  // so the new word is cut off there as the old one was. Closed by r px so outlines and
  // anti-aliasing between the two colours count as sign.
  function surface(d, w, h, s, r) {
    const near = (i, c, lim) =>
      Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) < lim;
    const lim = Math.max(40, s.contrast * 0.45);
    const m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const j = i * 4;
      if (d[j + 3] >= 200 && (near(j, s.bg, lim) || near(j, s.fg, lim))) m[i] = 1;
    }
    const grown = dilate(m, w, h, r);
    for (let i = 0; i < w * h; i++) grown[i] = !grown[i];
    const shrunk = dilate(grown, w, h, r);
    for (let i = 0; i < w * h; i++) m[i] = !shrunk[i];
    return m;
  }
  const segmenter = new Intl.Segmenter();
  const graphemes = word => [...segmenter.segment(word)].map(g => g.segment).filter(g => g.trim());

  // Grows a mask by r px in every direction (a square), with running counts along rows, then columns.
  function dilate(m, w, h, r) {
    const a = new Uint8Array(w * h);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      let c = 0;
      for (let x = 0; x < Math.min(r, w); x++) c += m[y * w + x];
      for (let x = 0; x < w; x++) {
        if (x + r < w) c += m[y * w + x + r];
        if (x - r - 1 >= 0) c -= m[y * w + x - r - 1];
        a[y * w + x] = c > 0;
      }
    }
    for (let x = 0; x < w; x++) {
      let c = 0;
      for (let y = 0; y < Math.min(r, h); y++) c += a[y * w + x];
      for (let y = 0; y < h; y++) {
        if (y + r < h) c += a[(y + r) * w + x];
        if (y - r - 1 >= 0) c -= a[(y - r - 1) * w + x];
        out[y * w + x] = c > 0;
      }
    }
    return out;
  }
  // Fills the masked pixels of `d` from the rest (push-pull): halve the picture until every
  // cell has something in it, averaging only known pixels, then on the way back up give each
  // unknown pixel the smooth, bilinear value from the level above. Linear in the pixel count.
  function pushPull(d, mask, w, h) {
    const levels = [];
    let c = new Float32Array(w * h * 3);
    let wt = new Float32Array(w * h);
    let lw = w;
    let lh = h;
    for (let i = 0; i < w * h; i++) {
      if (mask[i] || d[i * 4 + 3] < 200) continue;
      wt[i] = 1;
      c[i * 3] = d[i * 4];
      c[i * 3 + 1] = d[i * 4 + 1];
      c[i * 3 + 2] = d[i * 4 + 2];
    }
    levels.push([c, wt, lw, lh]);
    while (lw > 1 || lh > 1) {
      const nw = Math.ceil(lw / 2);
      const nh = Math.ceil(lh / 2);
      const nc = new Float32Array(nw * nh * 3);
      const nt = new Float32Array(nw * nh);
      for (let y = 0; y < nh; y++)
        for (let x = 0; x < nw; x++) {
          let s0 = 0;
          let s1 = 0;
          let s2 = 0;
          let ws = 0;
          for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++) {
              const sx = 2 * x + dx;
              const sy = 2 * y + dy;
              if (sx >= lw || sy >= lh) continue;
              const j = sy * lw + sx;
              const q = wt[j];
              s0 += c[j * 3] * q;
              s1 += c[j * 3 + 1] * q;
              s2 += c[j * 3 + 2] * q;
              ws += q;
            }
          const j = y * nw + x;
          if (ws) {
            nc[j * 3] = s0 / ws;
            nc[j * 3 + 1] = s1 / ws;
            nc[j * 3 + 2] = s2 / ws;
          }
          nt[j] = Math.min(1, ws);
        }
      c = nc;
      wt = nt;
      lw = nw;
      lh = nh;
      levels.push([c, wt, lw, lh]);
    }
    for (let l = levels.length - 2; l >= 0; l--) {
      const [c, wt, lw, lh] = levels[l];
      const [pc, , pw, ph] = levels[l + 1];
      for (let y = 0; y < lh; y++) {
        const fy = Math.min(ph - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
        const y0 = fy | 0;
        const y1 = Math.min(ph - 1, y0 + 1);
        const ty = fy - y0;
        for (let x = 0; x < lw; x++) {
          const j = y * lw + x;
          const q = wt[j];
          if (q >= 1) continue;
          const fx = Math.min(pw - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
          const x0 = fx | 0;
          const x1 = Math.min(pw - 1, x0 + 1);
          const tx = fx - x0;
          for (let k = 0; k < 3; k++) {
            const up =
              (pc[(y0 * pw + x0) * 3 + k] * (1 - tx) + pc[(y0 * pw + x1) * 3 + k] * tx) * (1 - ty) +
              (pc[(y1 * pw + x0) * 3 + k] * (1 - tx) + pc[(y1 * pw + x1) * 3 + k] * tx) * ty;
            c[j * 3 + k] = c[j * 3 + k] * q + up * (1 - q);
          }
          wt[j] = 1;
        }
      }
    }
    const [c0] = levels[0];
    for (let i = 0; i < w * h; i++) {
      if (!mask[i]) continue;
      d[i * 4] = c0[i * 3];
      d[i * 4 + 1] = c0[i * 3 + 1];
      d[i * 4 + 2] = c0[i * 3 + 2];
    }
    return levels;
  }
  // The push-pull fill is smooth, which shows on paving, brick or a grainy sign. Each filled
  // pixel gets the fine detail (pixel minus its blurred value, clamped) of the pixel mirrored
  // across the nearest box edge, so the texture outside carries on into the box. With nothing
  // to mirror it gets plain grain.
  function texture(d, mask, w, h, box, levels, grain) {
    const [x0, y0, x1, y1] = box;
    const L = levels[Math.min(2, levels.length - 1)];
    const f = 2 ** Math.min(2, levels.length - 1);
    const blurred = (x, y, k) => {
      const [c, , lw, lh] = L;
      const fx = Math.min(lw - 1, Math.max(0, (x + 0.5) / f - 0.5));
      const fy = Math.min(lh - 1, Math.max(0, (y + 0.5) / f - 0.5));
      const xa = fx | 0;
      const ya = fy | 0;
      const xb = Math.min(lw - 1, xa + 1);
      const yb = Math.min(lh - 1, ya + 1);
      const tx = fx - xa;
      const ty = fy - ya;
      return (
        (c[(ya * lw + xa) * 3 + k] * (1 - tx) + c[(ya * lw + xb) * 3 + k] * tx) * (1 - ty) +
        (c[(yb * lw + xa) * 3 + k] * (1 - tx) + c[(yb * lw + xb) * 3 + k] * tx) * ty
      );
    };
    const known = (x, y) =>
      x >= 0 && y >= 0 && x < w && y < h && !mask[y * w + x] && d[(y * w + x) * 4 + 3] >= 200;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        // mirror images across the four edges, nearest edge first
        const m = [
          [2 * x0 - x - 1, y, x - x0],
          [2 * x1 - x - 1, y, x1 - x],
          [x, 2 * y0 - y - 1, y - y0],
          [x, 2 * y1 - y - 1, y1 - y],
        ].sort((a, b) => a[2] - b[2]);
        const src = m.find(([mx, my]) => known(mx, my));
        if (src) {
          const j = (src[1] * w + src[0]) * 4;
          for (let k = 0; k < 3; k++) {
            d[i * 4 + k] += Math.max(-30, Math.min(30, d[j + k] - blurred(src[0], src[1], k)));
          }
        } else {
          const n = (Math.random() - 0.5) * 2 * grain;
          d[i * 4] += n;
          d[i * 4 + 1] += n;
          d[i * 4 + 2] += n;
        }
      }
  }

  // which way you're looking, for the queue order
  const panos = new Set();
  ggs.maps.hook('StreetViewPanorama', p => {
    panos.add(p);
    try {
      p.addListener('pano_changed', pruneQueue);
    } catch {}
  });
  function start(cfg) {
    active = cfg;
    ggs.debug('lying-signs on', cfg);
    detector();
    ggs.tiles.replay();
    return {
      stop() {
        active = null;
        ggs.tiles.replay();
      },
      update(next) {
        const changed = next.script !== active.script;
        active = next;
        if (changed) ggs.tiles.replay();
      },
    };
  }
  ggs.scripts['lying-signs'] = { start };
})();
