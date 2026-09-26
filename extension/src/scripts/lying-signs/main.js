// Lying signs: every Street View tile is caught on its way into WebGL, text on it is
// found, painted over, and new text in a different script is written on top.
//
// How the tiles get caught: the Maps API loads each tile as an <img> and uploads it with
// texImage2D/texSubImage2D. That call is wrapped. The tile can't be edited on the spot
// (finding text takes a few hundred ms in a worker), so a blurred copy goes up first
// (nothing legible ever shows), the texture and call arguments are remembered, and once
// the boxes come back the edited tile is uploaded to that same texture. Tiles seen
// before are served edited straight away. Tiles already on screen when the script is
// switched on or off are replayed through the hook by ggs.tiles (core/tiles.js).
//
// Text finding: PP-OCRv4's DBNet text detector on onnxruntime-web, in worker.js.
(() => {
  const ggs = globalThis.__ggs;
  const TILE = /streetviewpixels-pa\.googleapis\.com\/v1\/tile|cbk\d*\.google\.com\/cbk\?/;
  const DET_SIZE = 768;                       // model input; 512-px tiles are upscaled so small text is found
  const MIN_CONTRAST = 45;                    // summed RGB difference text must have from its sign; below it the box is ignored
  const VENDOR = 'src/scripts/lying-signs/vendor/';

  // Indexed by the "script" option; 0 is "random" (one script per panorama, picked from its id).
  const ENGLISH = [
    'JackSucksAtLife', 'JackSucksAtStuff', 'JackSucksAtGeography', 'Jack Massey Welsh', 'JackSucksAtGuessing', 'JackSucksAtClips',
    'JackSucksAtPopUpPirate', 'JackSucksAtEspañol', 'JackApestaEnEspañol', 'No Context JackSucksAtLife', 'turd boi420',
    'SamSmellsOfApricots', 'SamSmellsOfApricot', 'ejsafc', 'Fufik', 'pretty woman kitchen', 'Geography Stuff', 'Jack & Oscar',
    'Minecraft', 'Becky', 'Rick', 'Kai', 'Kong', 'Flossy', 'Kazoo', 'Toothbrush', 'Spudger', 'Rhombus', 'Unicycle', 'Beanie',
    'Lovely', 'Guinness', 'Playbutton', 'PewDiePie', 'Tesla', 'Autopilot', 'Geography', 'Flag', 'Europe', 'Luxembourg',
    'Seychelles', 'Car Bar', 'Black tape', 'Vatican', 'Australia', 'Nottinghamshire', 'Welsh', 'Spanish', 'Español', 'Reddit',
    'Jackoffs', 'Diddle', 'Nelly', 'Jeremy', 'Vampire', 'Harmony Hollow', 'Minecraft Monday', 'Piglin', 'Skyblock',
    'Hacker Trolling', 'Misprint', 'Briefcase', 'Wigs', 'Recycling', 'Bush', 'Urinate', 'Weel', 'Toilet', 'zi8gzag',
    'Oscar', 'zi8gzag Was Here', 'Oscar Sucks At Life', 'Jack Was Here', 'Sucks At Life', 'Sucks At Geography', 'Not Luxembourg',
    'Definitely Kyrgyzstan', 'Probably Ohio', 'Bolivia?', 'Wrong Country', 'Trust The Bollard', 'Follow The Tape', 'Guess Again',
    'Plonk Here', '5000 Points', '4,999', 'Zero Points', 'Round 5', 'Gen 4', 'Trekker', 'Snow Cam', 'Rifts', 'Google Car',
    'Kiwicraft', 'Bingo', 'Big Bang', 'Nature Websites', 'Pop Up Pirate', 'Jacksucks Merch', 'Silver Playbutton', 'Diamond Playbutton',
    'Jack Massey Welch', 'Jaxsucksatlife', 'Sucks', 'Massey', 'Apricots', 'Toothbrush Factory', 'Kazoo Kid', 'Beanie Baby',
    'Rhombus Road', 'Unicycle Lane', 'Spudger Street', 'Flossy Avenue', 'Guinness Bar', 'Vampire Weekend', 'Piglin Bank',
    'Skyblock Island', 'Harmony Hollow Hotel', 'Misprint Museum', 'Briefcase Depot', 'Wig Emporium', 'Recycling Centre',
    'Bush Tucker', 'Weel Deel', 'Toilet Tour', 'Nelly The Elephant', 'Jeremy Fisher', 'Becky Lynch', 'Kong King', 'Rick Roll',
    'Kai Cenat', 'Cheese', 'Left Only', 'Badger', 'Toast', 'No Parking', 'Sheep', 'Bus Stop', 'Pancakes', 'Otter', 'Gravy',
    'Wrong Way', 'Mild Peril', 'Beware Of Jack', 'Oscar Crossing', 'Free Points', 'Actually Chile', 'Nice Try', 'Welcome To Wales',
  ];
  // Indexed by the "script" option; 0 is "random" (one script per panorama, picked from its id).
  const WORDS = [
    null,
    ['สวัสดี', 'ถนน', 'ตลาด', 'โรงเรียน', 'วัด', 'ร้านอาหาร', 'ทางออก', 'ระวัง', 'หยุด', 'กรุงเทพ', 'เชียงใหม่', 'ภูเก็ต', 'ห้ามจอด', 'โรงแรม', 'ธนาคาร', 'สถานี', 'ตำรวจ', 'ยินดีต้อนรับ', 'ก๋วยเตี๋ยว', 'ชายหาด',
      'ขอนแก่น', 'พัทยา', 'อยุธยา', 'หาดใหญ่', 'นครราชสีมา', 'ซอย', 'ทางเข้า', 'ห้องน้ำ', 'ร้านกาแฟ', 'ร้านขายยา', 'โรงพยาบาล', 'ตลาดน้ำ', 'ปั๊มน้ำมัน', 'มหาวิทยาลัย', 'สนามบิน', 'ท่าเรือ', 'ลดความเร็ว', 'ทางม้าลาย', 'ห้ามเข้า', 'ส้มตำ', 'ผัดไทย', 'ข้าวมันไก่', 'ชาเย็น', 'เซเว่น', 'นวดแผนไทย', 'ร้านซ่อมรถ', 'ร้านทอง', 'อู่รถ', 'บ้านพัก', 'ที่จอดรถ'],
    ['გამარჯობა', 'ქუჩა', 'ბაზარი', 'სკოლა', 'თბილისი', 'გასასვლელი', 'ფრთხილად', 'გაჩერდი', 'ბათუმი', 'ქუთაისი', 'სასტუმრო', 'ბანკი', 'აფთიაქი', 'პოლიცია', 'რესტორანი', 'ღვინო', 'ხაჭაპური', 'მოგესალმებით',
      'რუსთავი', 'გორი', 'ზუგდიდი', 'ფოთი', 'თელავი', 'მცხეთა', 'ბორჯომი', 'გუდაური', 'სვანეთი', 'კახეთი', 'შესასვლელი', 'ტუალეტი', 'კაფე', 'საავადმყოფო', 'უნივერსიტეტი', 'აეროპორტი', 'სადგური', 'მეტრო', 'ავტოსადგომი', 'გაჩერება', 'შეამცირე სიჩქარე', 'ხინკალი', 'ჩურჩხელა', 'ლობიანი', 'ჭაჭა', 'მაღაზია', 'ბაზრობა', 'ეკლესია', 'მუზეუმი', 'თეატრი', 'სამრეცხაო'],
    ['안녕하세요', '도로', '시장', '학교', '서울', '출구', '주의', '정지', '부산', '식당', '주차금지', '호텔', '은행', '약국', '경찰', '편의점', '지하철', '환영합니다', '김치', '노래방',
      '인천', '대구', '대전', '광주', '제주도', '수원', '울산', '강남', '홍대', '명동', '입구', '화장실', '카페', '병원', '대학교', '공항', '기차역', '버스정류장', '주차장', '서행', '횡단보도', '진입금지', '치킨', '삼겹살', '비빔밥', '떡볶이', '소주', '피시방', '찜질방', '세탁소', '미용실', '부동산', '치과', '교회', '박물관'],
    ['مرحبا', 'شارع', 'سوق', 'مدرسة', 'مخرج', 'انتبه', 'قف', 'مطعم', 'القاهرة', 'دبي', 'فندق', 'بنك', 'صيدلية', 'شرطة', 'ممنوع الوقوف', 'أهلا وسهلا', 'مسجد', 'محطة',
      'الرياض', 'جدة', 'عمّان', 'بيروت', 'الدوحة', 'مسقط', 'الرباط', 'تونس', 'بغداد', 'الإسكندرية', 'مدخل', 'حمام', 'مقهى', 'مستشفى', 'جامعة', 'مطار', 'محطة القطار', 'موقف الباص', 'موقف سيارات', 'خفف السرعة', 'ممنوع الدخول', 'شاورما', 'فلافل', 'كنافة', 'قهوة', 'بقالة', 'مخبز', 'جزار', 'كنيسة', 'متحف', 'مغسلة', 'صالون', 'عقارات', 'ميناء'],
    ['привет', 'улица', 'рынок', 'школа', 'выход', 'осторожно', 'стоп', 'Москва', 'магазин', 'аптека', 'банк', 'гостиница', 'полиция', 'вокзал', 'добро пожаловать', 'Новосибирск', 'шаурма', 'парковка запрещена',
      'Санкт-Петербург', 'Казань', 'Екатеринбург', 'Владивосток', 'Сочи', 'Омск', 'Минск', 'Киев', 'Алматы', 'Бишкек', 'вход', 'туалет', 'кафе', 'больница', 'университет', 'аэропорт', 'станция', 'остановка', 'парковка', 'въезд запрещён', 'пешеходный переход', 'продукты', 'пельмени', 'борщ', 'блины', 'квас', 'пекарня', 'мясо', 'церковь', 'музей', 'театр', 'прачечная', 'парикмахерская', 'шиномонтаж', 'автосервис', 'почта', 'дом культуры'],
    ['Αθήνα', 'οδός', 'αγορά', 'σχολείο', 'έξοδος', 'προσοχή', 'στοπ', 'ταβέρνα', 'λιμάνι', 'ξενοδοχείο', 'τράπεζα', 'φαρμακείο', 'αστυνομία', 'καλώς ήρθατε', 'Θεσσαλονίκη', 'σουβλάκι', 'παραλία',
      'Πάτρα', 'Ηράκλειο', 'Λάρισα', 'Βόλος', 'Ρόδος', 'Κέρκυρα', 'Χανιά', 'Σαντορίνη', 'Μύκονος', 'Λευκωσία', 'είσοδος', 'τουαλέτα', 'καφενείο', 'νοσοκομείο', 'πανεπιστήμιο', 'αεροδρόμιο', 'σταθμός', 'στάση', 'πάρκινγκ', 'απαγορεύεται η στάθμευση', 'γύρος', 'μουσακάς', 'φέτα', 'ούζο', 'φούρνος', 'κρεοπωλείο', 'εκκλησία', 'μουσείο', 'θέατρο', 'περίπτερο', 'κομμωτήριο', 'βουλκανιζατέρ', 'ταχυδρομείο', 'πλατεία', 'λεωφόρος'],
    ['שלום', 'רחוב', 'שוק', 'בית ספר', 'יציאה', 'זהירות', 'עצור', 'מסעדה', 'תל אביב', 'ירושלים', 'מלון', 'בנק', 'בית מרקחת', 'משטרה', 'ברוכים הבאים', 'חניה אסורה', 'פלאפל', 'תחנה',
      'חיפה', 'באר שבע', 'אילת', 'נתניה', 'הרצליה', 'צפת', 'טבריה', 'כניסה', 'שירותים', 'בית קפה', 'בית חולים', 'אוניברסיטה', 'שדה תעופה', 'תחנת רכבת', 'תחנת אוטובוס', 'חניון', 'האט', 'מעבר חצייה', 'אין כניסה', 'שווארמה', 'חומוס', 'סביח', 'מאפייה', 'מכולת', 'קצבייה', 'בית כנסת', 'מוזיאון', 'תיאטרון', 'מכבסה', 'מספרה', 'דואר', 'שדרות', 'כיכר', 'גן ילדים', 'קופת חולים'],
    ['東京', '駅', '市場', '学校', '出口', '注意', '止まれ', '食堂', '大阪', '銀行', '駐車禁止', 'ホテル', '薬局', '警察', 'ようこそ', 'ラーメン', '温泉', '京都', '北海道', 'コンビニ',
      '名古屋', '福岡', '札幌', '神戸', '横浜', '広島', '仙台', '沖縄', '奈良', '長崎', '入口', 'トイレ', '喫茶店', '病院', '大学', '空港', 'バス停', '駐車場', '徐行', '横断歩道', '進入禁止', '寿司', 'うどん', 'カレー', '焼肉', '居酒屋', 'パン屋', '肉屋', '神社', '寺', '博物館', '交番', '郵便局', '美容室', 'ガソリンスタンド', '自動販売機', '商店街', '一方通行', '踏切', '公園'],
    ['नमस्ते', 'सड़क', 'बाज़ार', 'विद्यालय', 'निकास', 'सावधान', 'रुकिए', 'दिल्ली', 'होटल', 'मुंबई', 'बैंक', 'दवाखाना', 'पुलिस', 'स्वागत है', 'पार्किंग नहीं', 'चाय', 'रेलवे स्टेशन', 'मंदिर',
      'कोलकाता', 'चेन्नई', 'बेंगलुरु', 'जयपुर', 'लखनऊ', 'वाराणसी', 'आगरा', 'पुणे', 'गोवा', 'काठमांडू', 'प्रवेश', 'शौचालय', 'ढाबा', 'अस्पताल', 'विश्वविद्यालय', 'हवाई अड्डा', 'बस अड्डा', 'धीरे चलें', 'प्रवेश निषेध', 'समोसा', 'चाट', 'बिरयानी', 'दाल', 'लस्सी', 'मिठाई', 'किराना', 'मस्जिद', 'गुरुद्वारा', 'संग्रहालय', 'डाकघर', 'नाई', 'पंचर', 'साइकिल', 'रिक्शा', 'गली', 'चौक', 'नगर पालिका', 'जल'],
    ['Երևան', 'փողոց', 'շուկա', 'դպրոց', 'ելք', 'զգույշ', 'կանգ', 'ռեստորան', 'հյուրանոց', 'բանկ', 'դեղատուն', 'ոստիկանություն', 'բարի գալուստ', 'Գյումրի', 'լավաշ', 'կայարան',
      'Վանաձոր', 'Դիլիջան', 'Սևան', 'Գորիս', 'Ջերմուկ', 'Էջմիածին', 'Արարատ', 'մուտք', 'զուգարան', 'սրճարան', 'հիվանդանոց', 'համալսարան', 'օդանավակայան', 'կանգառ', 'ավտոկայանատեղի', 'կայանելն արգելված է', 'խորոված', 'դոլմա', 'թան', 'կոնյակ', 'հացատուն', 'մսավաճառ', 'եկեղեցի', 'թանգարան', 'թատրոն', 'փոստ', 'վարսավիրանոց', 'անվադող', 'պողոտա', 'հրապարակ', 'դպրոց թիվ 5', 'մանկապարտեզ'],
    ENGLISH,
    ['Ausfahrt', 'Bäckerei', 'Achtung', 'Bahnhof', 'Schule', 'Markt', 'Apotheke', 'Einbahnstraße', 'Halt', 'Willkommen', 'Rathaus', 'Gasthaus', 'Metzgerei', 'Parkverbot', 'Polizei', 'Tankstelle', 'Biergarten', 'Umleitung', 'Vorsicht', 'Schnitzel', 'Kindergarten', 'Wurst',
      'Berlin', 'München', 'Hamburg', 'Köln', 'Frankfurt', 'Stuttgart', 'Dresden', 'Leipzig', 'Nürnberg', 'Bremen', 'Wien', 'Zürich', 'Hauptstraße', 'Bahnhofstraße', 'Kirchgasse', 'Am Markt', 'Dorfplatz', 'Einfahrt', 'Ausgang', 'Eingang', 'Toilette', 'Krankenhaus', 'Universität', 'Flughafen', 'Haltestelle', 'Parkplatz', 'Fußgängerzone', 'Sackgasse', 'Baustelle', 'Spielstraße', 'Anlieger frei', 'Zone 30', 'Feuerwehr', 'Sparkasse', 'Volksbank', 'Friseur', 'Fahrschule', 'Imbiss', 'Döner', 'Currywurst', 'Brezel', 'Konditorei', 'Eisdiele', 'Weinstube', 'Brauerei', 'Bierstube', 'Kirche', 'Friedhof', 'Museum', 'Schwimmbad', 'Sporthalle', 'Gemeinde', 'Landkreis', 'Autobahn', 'Radweg', 'Wanderweg', 'Bushaltestelle', 'Zahnarzt', 'Reifen', 'Autohaus', 'Werkstatt', 'Blumen', 'Getränkemarkt', 'Postfiliale', 'Bürgeramt', 'Freibad', 'Schloss', 'Burg', 'Zum Hirschen', 'Zum Löwen', 'Gasthof Adler'],
    ['Salida', 'Panadería', 'Cuidado', 'Escuela', 'Mercado', 'Farmacia', 'Playa', 'Alto', 'Calle', 'Bienvenidos', 'Ayuntamiento', 'Carnicería', 'Prohibido aparcar', 'Policía', 'Gasolinera', 'Desvío', 'Peligro', 'Churros', 'Cerveza', 'Iglesia', 'Estación',
      'Madrid', 'Barcelona', 'Sevilla', 'Valencia', 'Bilbao', 'Málaga', 'Granada', 'Zaragoza', 'Ciudad de México', 'Buenos Aires', 'Bogotá', 'Lima', 'Santiago', 'Quito', 'La Paz', 'Montevideo', 'Calle Mayor', 'Avenida', 'Plaza', 'Paseo', 'Carretera', 'Entrada', 'Baños', 'Bar', 'Cafetería', 'Hospital', 'Universidad', 'Aeropuerto', 'Parada', 'Aparcamiento', 'Estacionamiento', 'Ceda el paso', 'Despacio', 'Obras', 'Zona escolar', 'Bomberos', 'Banco', 'Caja', 'Peluquería', 'Autoescuela', 'Tapas', 'Paella', 'Tortilla', 'Jamón', 'Bodega', 'Frutería', 'Pescadería', 'Ferretería', 'Papelería', 'Museo', 'Piscina', 'Polideportivo', 'Cementerio', 'Correos', 'Taller', 'Neumáticos', 'Llantas', 'Farmacia de guardia', 'Se vende', 'Se alquila', 'Abierto', 'Cerrado', 'Rebajas', 'Empanadas', 'Arepas', 'Tacos', 'Ceviche'],
    ['Sortie', 'Boulangerie', 'Attention', 'École', 'Marché', 'Pharmacie', 'Gare', 'Arrêt', 'Rue', 'Bienvenue', 'Mairie', 'Boucherie', 'Stationnement interdit', 'Police', 'Tabac', 'Déviation', 'Danger', 'Croissant', 'Fromage', 'Église', 'Plage',
      'Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Toulouse', 'Nantes', 'Lille', 'Strasbourg', 'Nice', 'Montpellier', 'Bruxelles', 'Genève', 'Montréal', 'Québec', 'Dakar', 'Abidjan', 'Rue de la Gare', 'Grande Rue', 'Place de la Mairie', 'Avenue', 'Route de', 'Chemin', 'Impasse', 'Entrée', 'Toilettes', 'Café', 'Brasserie', 'Hôpital', 'Université', 'Aéroport', 'Parking', 'Cédez le passage', 'Ralentir', 'Travaux', 'Zone 30', 'Pompiers', 'Banque', 'Crédit Agricole', 'Coiffeur', 'Auto-école', 'Pâtisserie', 'Charcuterie', 'Fromagerie', 'Poissonnerie', 'Épicerie', 'Cave', 'Baguette', 'Crêperie', 'Pain', 'Vin', 'Musée', 'Piscine', 'Gymnase', 'Cimetière', 'La Poste', 'Garage', 'Pneus', 'Fleuriste', 'Librairie', 'Presse', 'À vendre', 'À louer', 'Ouvert', 'Fermé', 'Soldes', 'Salle des fêtes', 'Camping', 'Château', 'Abbaye', 'Office de tourisme'],
    'galactic',
  ];
  const GALACTIC_INDEX = WORDS.length - 1;

  // Standard Galactic Alphabet (Minecraft's enchanting table letters), as strokes on a
  // 10x10 grid: each glyph is a list of polylines, a single point being a dot. The
  // "Minecraft" script draws random runs of these instead of words.
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
    const h = b.h * 0.72, adv = h * 0.62, gap = h * 0.16;
    const n = Math.max(1, Math.floor((b.w - 2) / adv));
    const x0 = b.x + (b.w - n * adv + gap) / 2, y0 = b.y + (b.h - h) / 2;
    g.lineWidth = Math.max(1, h * 0.11);
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = g.fillStyle;
    for (let i = 0; i < n; i++) {
      const glyph = GALACTIC[Math.floor(rand() * GALACTIC.length)];
      const gx = x0 + i * adv, s = (adv - gap) / 10;
      for (const line of glyph) {
        if (line.length === 1) { g.beginPath(); g.arc(gx + line[0][0] * s, y0 + line[0][1] * (h / 10), g.lineWidth * 0.7, 0, 7); g.fill(); continue; }
        g.beginPath();
        line.forEach(([x, y], k) => (k ? g.lineTo : g.moveTo).call(g, gx + x * s, y0 + y * (h / 10)));
        g.stroke();
      }
    }
  }

  // Deterministic randomness keyed on a sign's place in the panorama, so the same sign
  // gets the same script and word on every tile and zoom level it appears in.
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // seed for a box: pano + its centre in whole-panorama units (same at every zoom)
  function boxSeed(k, raw, W) {
    if (!k) return hash(`${raw.cx | 0},${raw.cy | 0}`);
    const scale = 1 / (W * 2 ** k.z) * 4096;
    return hash(`${k.pano}:${Math.round((k.x * W + raw.cx) * scale)}:${Math.round((k.y * W + raw.cy) * scale)}`);
  }

  let active = null;                          // cfg while the script is on
  const stats = { seen: 0, edited: 0, boxes: 0, failed: 0, detectMs: 0, detected: 0, paths: {} };
  ggs.lyingSigns = { stats };

  // ---- detector worker ----
  let worker = null, workerReady = null, nextId = 0;
  const waiting = new Map();                  // id -> resolve
  function detector() {
    if (workerReady) return workerReady;
    workerReady = (async () => {
      if (!ggs.extBase) throw new Error('extension base URL not known yet');
      const u = f => ggs.extBase + VENDOR + f;
      const blobUrl = async (url, type) => URL.createObjectURL(new Blob([await (await fetch(url)).arrayBuffer()], { type }));
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
        if (m.type === 'boxes') { stats.detected++; stats.detectMs += m.ms; waiting.get(m.id)?.(m.boxes); waiting.delete(m.id); }
        else if (m.type === 'error') { stats.failed++; ggs.log('lying-signs: detector error', m.message); waiting.get(m.id)?.(null); waiting.delete(m.id); }
      };
      const backend = await new Promise((res, rej) => {
        const onmsg = e => { if (e.data.type === 'ready') { worker.removeEventListener('message', onmsg); res(e.data.backend); } else if (e.data.type === 'error') rej(new Error(e.data.message)); };
        worker.addEventListener('message', onmsg);
        worker.postMessage({ type: 'init', ort, mjs, wasm, model }, [model]);
      });
      stats.backend = backend;
      ggs.debug(`lying-signs: text detector ready (${backend})`);
    })();
    workerReady.catch(err => { ggs.log('lying-signs: text detector failed to load', err); workerReady = null; });
    return workerReady;
  }
  // Detection queue. The tile nearest to where you're looking goes first (tile grid
  // position vs the panorama's current heading/pitch; newest first when that's unknown).
  // Two in flight so the worker's CPU prep overlaps the GPU. A queued tile whose
  // textures have all gone (pano changed) is dropped unrun.
  const queue = [];                           // [{ img, cfg, res, alive, url }]
  let inflight = 0;
  const MAX_INFLIGHT = 2;
  ggs.lyingSigns.debug = () => ({ queue: queue.length, inflight, waiting: waiting.size, tiles: tiles.size });
  function detect(img, cfg, alive, url) {
    return new Promise(res => { queue.push({ img, cfg, res, alive, url }); pump(); });
  }
  const TILE_XY = /panoid=([^&]+).*?[&?]x=(\d+)&y=(\d+)&zoom=(\d+)/;
  // Angular distance from the tile's centre to the current view, or null if unknown.
  function tileDistance(url) {
    const m = TILE_XY.exec(url);
    if (!m) return null;
    const [, id, x, y, z] = m;
    for (const p of panos) {
      let pov, centre;
      try { if (p.getPano() !== id) continue; pov = p.getPov(); centre = p.getPhotographerPov?.()?.heading; } catch { continue; }
      if (!pov || centre == null) return null;
      const cols = 2 ** z, rows = Math.max(1, 2 ** (z - 1));
      const heading = centre + ((+x + 0.5) / cols - 0.5) * 360;
      const pitch = (0.5 - (+y + 0.5) / rows) * 180;
      const dh = Math.abs(((heading - pov.heading) % 360 + 540) % 360 - 180);
      return Math.hypot(dh * Math.cos(pov.pitch * Math.PI / 180), pitch - pov.pitch);
    }
    return null;
  }
  function pickJob() {
    let best = queue.length - 1, bestD = Infinity;
    for (let i = queue.length - 1; i >= 0; i--) {
      const d = tileDistance(queue[i].url);
      if (d === null) break;                  // no view info: newest first
      if (d < bestD) { bestD = d; best = i; }
    }
    return queue.splice(best, 1)[0];
  }
  async function pump() {
    if (inflight >= MAX_INFLIGHT || !queue.length) return;
    inflight++;
    try {
      await detector();
      const job = pickJob();
      if (!job.alive()) { stats.skipped = (stats.skipped || 0) + 1; job.res(null); return; }
      const bitmap = await createImageBitmap(job.img);
      const boxes = await new Promise(r => {
        const id = ++nextId;
        waiting.set(id, r);
        worker.postMessage({ type: 'detect', id, bitmap, size: DET_SIZE, thresh: 0.25, boxThresh: 0.45 }, [bitmap]);
      });
      job.res(boxes);
    } catch (err) {
      stats.failed++;
      for (const j of queue.splice(0)) j.res(null);
    } finally {
      inflight--;
      if (queue.length) pump();
    }
  }

  // ---- tile hook, installed at document_start whether or not the script is on ----
  const tiles = new Map();                    // url -> { boxes, cfg, canvas, pending: [upload records] }
  const grid = new Map();                     // "pano/zoom/x/y" -> same entry, for finding a tile's children
  const TILE_KEY = /panoid=([^&]+).*?[&?]x=(\d+)&y=(\d+)&zoom=(\d+)/;
  const gridKey = url => { const m = TILE_KEY.exec(url); return m && { pano: m[1], x: +m[2], y: +m[3], z: +m[4] }; };

  // Zooming out: a tile's four children one zoom level in are the same picture at
  // twice the detail. Where they've already been edited, the parent is assembled from
  // them (scaled down) instead of being detected again, so the sharper edit and the
  // same words carry over. Grandchildren are used when a child is missing.
  function childCanvas(k, depth) {
    const t = grid.get(`${k.pano}/${k.z}/${k.x}/${k.y}`);
    if (t?.canvas) return t.canvas;
    if (depth === 0) return null;
    const parts = [];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const c = childCanvas({ pano: k.pano, z: k.z + 1, x: 2 * k.x + dx, y: 2 * k.y + dy }, depth - 1);
      if (!c) return null;
      parts.push([dx, dy, c]);
    }
    const c = new OffscreenCanvas(parts[0][2].width, parts[0][2].height), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    for (const [dx, dy, src] of parts) g.drawImage(src, (dx * c.width) / 2, (dy * c.height) / 2, c.width / 2, c.height / 2);
    return c;
  }
  // Zooming in: if the tile one zoom level out (or two) has been detected, its boxes
  // are scaled into this tile instead of detecting again, so what's changed stays the
  // same as you zoom. The seeded word picks then match too.
  function inheritedBoxes(k, W, H) {
    for (let up = 1; up <= 2; up++) {
      const f = 2 ** up, px = Math.floor(k.x / f), py = Math.floor(k.y / f);
      const t = grid.get(`${k.pano}/${k.z - up}/${px}/${py}`);
      if (!t?.boxes) continue;
      const ox = (k.x - px * f) * (W / f), oy = (k.y - py * f) * (H / f); // this tile's origin in the parent
      const out = [];
      for (const b of t.boxes) {
        const cx = (b.cx - ox) * f, cy = (b.cy - oy) * f, w = b.w * f, h = b.h * f;
        const r = Math.hypot(w, h) / 2;
        if (cx + r < 0 || cy + r < 0 || cx - r > W || cy - r > H) continue;
        out.push({ ...b, cx, cy, w, h, mask: { ...b.mask, x: (b.mask.x - ox) * f, y: (b.mask.y - oy) * f, w: b.mask.w * f, h: b.mask.h * f } });
      }
      return out;
    }
    return null;
  }
  // Draws whichever edited children exist onto `canvas`; true if all four were there.
  function overlayChildren(canvas, k) {
    if (!k) return false;
    const g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    let n = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const c = childCanvas({ pano: k.pano, z: k.z + 1, x: 2 * k.x + dx, y: 2 * k.y + dy }, 1);
      if (!c) continue;
      g.drawImage(c, (dx * canvas.width) / 2, (dy * canvas.height) / 2, canvas.width / 2, canvas.height / 2);
      n++;
    }
    return n === 4;
  }
  const mipTex = new WeakSet();               // textures the API calls generateMipmap on
  const origFetch = globalThis.fetch;
  const orig = {};

  function bindingFor(gl, target) {
    return target === gl.TEXTURE_2D ? [gl.TEXTURE_2D, gl.TEXTURE_BINDING_2D] : [gl.TEXTURE_CUBE_MAP, gl.TEXTURE_BINDING_CUBE_MAP];
  }

  // Called for every texImage2D/texSubImage2D whose source is an <img>. Returns the
  // source to upload now.
  function onUpload(gl, name, args, img) {
    if (!active) return img;
    const url = img.currentSrc || img.src;
    if (!TILE.test(url)) return img;
    stats.paths.gl = (stats.paths.gl || 0) + 1;
    let t = tiles.get(url);
    if (t && t.cfg !== active) { t.canvas = null; t.cfg = active; if (t.boxes) t.canvas = editSync(img, t.boxes, active, t.key); }
    if (t?.canvas) return t.canvas;
    const k = gridKey(url);
    if (!t) {
      t = { boxes: null, cfg: active, canvas: null, pending: [], key: k };
      tiles.set(url, t);
      if (k) grid.set(`${k.pano}/${k.z}/${k.x}/${k.y}`, t);
      if (tiles.size > 800) { const [oldUrl, old] = tiles.entries().next().value; tiles.delete(oldUrl); if (old.key) grid.delete(`${old.key.pano}/${old.key.z}/${old.key.x}/${old.key.y}`); }
      stats.seen++;
      // all four children already edited: assemble, no detection needed
      const fromKids = k && childCanvas(k, 2);
      if (fromKids && fromKids !== t.canvas) { t.canvas = fromKids; t.boxes = []; stats.assembled = (stats.assembled || 0) + 1; return t.canvas; }
      // parent already detected: same boxes, scaled, no detection
      const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
      // parent already detected: use its boxes now (same words, nothing pops), and
      // still detect at this zoom to add small text the parent couldn't see
      const inherited = k && inheritedBoxes(k, W, H);
      if (inherited) { t.inherited = inherited; t.boxes = inherited; t.canvas = editSync(img, inherited, active, k); stats.inherited = (stats.inherited || 0) + 1; }
      const alive = () => t.pending.some(r => !r.gl.isContextLost() && r.gl.isTexture(r.tex));
      detect(img, active, alive, url).then(boxes => {
        if (!boxes) { if (!t.inherited) tiles.delete(url); t.pending = []; return; } // skipped or failed: the blurred/original stays; a later upload retries
        t.boxes = t.inherited ? merge(t.inherited, boxes) : boxes;
        stats.boxes += boxes.length;
        flush(t, img);
      });
    }
    // remember where this went so the edited tile can replace it later
    const [bindTarget, bindParam] = bindingFor(gl, args[0]);
    t.pending.push({
      gl, name, args, bindTarget, tex: gl.getParameter(bindParam),
      flip: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), premul: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    });
    if (t.canvas) return t.canvas;            // the inherited edit, while this zoom's detection runs
    const ph = blurred(img);
    overlayChildren(ph, k);
    return ph;
  }
  // Inherited boxes win; a detected box is added only if it isn't over one of them.
  function merge(inherited, detected) {
    const out = inherited.slice();
    for (const b of detected) {
      const hit = inherited.some(i => Math.abs(b.cx - i.cx) < (b.w + i.w) / 2 && Math.abs(b.cy - i.cy) < (b.h + i.h) / 2);
      if (!hit) out.push(b);
    }
    return out;
  }

  // Boxes are in: edit the tile and push it into every texture it went to.
  function flush(t, img) {
    if (!active) { t.pending = []; return; }
    t.cfg = active;
    t.canvas = editSync(img, t.boxes, active, t.key);
    overlayChildren(t.canvas, t.key);
    for (const r of t.pending) {
      const { gl } = r;
      try {
        if (gl.isContextLost() || !gl.isTexture(r.tex)) continue;
        const [, bindParam] = bindingFor(gl, r.args[0]);
        const prevTex = gl.getParameter(bindParam);
        const prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), prevPremul = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
        gl.bindTexture(r.bindTarget, r.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, r.flip);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, r.premul);
        orig[r.name].call(gl, ...r.args, t.canvas);
        if (mipTex.has(r.tex)) gl.generateMipmap(r.bindTarget);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlip);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, prevPremul);
        gl.bindTexture(r.bindTarget, prevTex);
        stats.edited++;
      } catch (err) {
        stats.failed++;
        if (stats.failed < 4) ggs.log('lying-signs: re-upload failed', err);
      }
    }
    t.pending = [];
  }

  function install() {
    for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const name of ['texImage2D', 'texSubImage2D']) {
        const fn = P[name];
        orig[name] = orig[name] || fn;
        P[name] = function (...a) {
          const i = a.length - 1;
          if (a[i] instanceof HTMLImageElement) {
            try { a[i] = onUpload(this, name, a.slice(0, i), a[i]); } catch (err) { stats.failed++; }
          }
          return fn.apply(this, a);
        };
      }
      const gen = P.generateMipmap;
      P.generateMipmap = function (target) {
        try { mipTex.add(this.getParameter(bindingFor(this, target)[1])); } catch {}
        return gen.call(this, target);
      };
    }
    // in case tiles ever arrive as blobs instead of <img>s
    globalThis.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : input?.url;
      if (!active || !TILE.test(String(url))) return origFetch.call(this, input, init);
      stats.seen++; stats.paths.fetch = (stats.paths.fetch || 0) + 1;
      const r = await origFetch.call(this, input, init);
      try {
        const bmp = await createImageBitmap(await r.blob());
        const boxes = (await detect(bmp, active, () => true, url)) || [];
        const b = await editSync(bmp, boxes, active, gridKey(url)).convertToBlob({ type: 'image/jpeg', quality: 0.9 });
        stats.edited++;
        return new Response(b, { status: 200, headers: { 'content-type': b.type } });
      } catch (err) { stats.failed++; return r; }
    };
  }
  try { install(); } catch (err) { ggs.log('lying-signs: hook failed', err); }

  // ---- the edits ----
  // Placeholder while the detector works: the tile at 1/10 size, scaled back up, so
  // nothing is legible however far you zoom in.
  function blurred(img) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const small = new OffscreenCanvas(Math.max(1, W / 10 | 0), Math.max(1, H / 10 | 0));
    small.getContext('2d').drawImage(img, 0, 0, small.width, small.height);
    const c = new OffscreenCanvas(W, H), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(small, 0, 0, W, H);
    return c;
  }

  // Edits any drawable source (img, ImageBitmap) with the detector's boxes; returns an
  // OffscreenCanvas. Each box is handled in its own frame, rotated so the text runs
  // level: the source is drawn into a small canvas with the inverse rotation, the patch
  // and the new text are made there, and the result is rotated back onto the tile
  // through a soft mask shaped like the old and new text (not a rectangle).
  function editSync(src, boxes, cfg, key) {
    const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height;
    const c = new OffscreenCanvas(W, H);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0);
    nadir(g, key, W, H);
    for (const raw of boxes) {
      if (raw.h < 4 || raw.w < 4) continue;
      const rand = rng(boxSeed(key, raw, W));
      let script = cfg.script | 0;
      if (!WORDS[script]) script = 0;
      if (script === 0) script = 1 + hash('script:' + (key?.pano || '')) % (WORDS.length - 1); // one script per panorama
      const list = WORDS[script];
      const pick = list === 'galactic' ? null : () => list[Math.floor(rand() * list.length)];
      try { replaceBox(g, src, raw, script, pick, rand); } catch (err) { stats.failed++; if (stats.failed < 4) ggs.log('lying-signs: box failed', err); }
    }
    return c;
  }

  // The bottom of the panorama (the car, or the logo disc unofficial coverage puts
  // there) is stretched into a wide arc in these tiles, so the detector can't read text
  // in it. It's smeared unconditionally instead: everything below NADIR_PITCH goes to a
  // coarse mosaic, fading in over a few px.
  const NADIR_PITCH = -68;
  function nadir(g, k, W, H) {
    if (!k) return;
    const rows = Math.max(1, 2 ** (k.z - 1));
    const top = Math.max(0, ((90 - NADIR_PITCH) / 180 * rows - k.y) * H); // tile y where the cap starts
    if (top >= H) return;
    const band = H - top, fade = Math.min(10, band);
    const small = new OffscreenCanvas(Math.max(1, W / 16 | 0), Math.max(1, band / 16 | 0));
    small.getContext('2d').drawImage(g.canvas, 0, top, W, band, 0, 0, small.width, small.height);
    const layer = new OffscreenCanvas(W, band), l = layer.getContext('2d');
    l.imageSmoothingQuality = 'high';
    l.drawImage(small, 0, 0, W, band);
    const grad = l.createLinearGradient(0, 0, 0, fade);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,1)');
    l.globalCompositeOperation = 'destination-in';
    l.fillStyle = grad; l.fillRect(0, 0, W, fade);
    l.fillStyle = '#000'; l.fillRect(0, fade, W, band - fade);
    g.drawImage(layer, 0, top);
    stats.nadir = (stats.nadir || 0) + 1;
  }

  function replaceBox(g, src, raw, script, pick, rand) {
    const p = raw.h * 0.12;                  // the detector's box hugs the strokes; give them room
    const bw = Math.ceil(raw.w + 2 * p), bh = Math.ceil(raw.h + 2 * p);
    const feather = Math.max(3, Math.min(12, Math.round(bh * 0.35)));
    const ring = Math.max(3, Math.round(bh * 0.25)), gap = 2;
    const pad = gap + ring + feather + 2;
    const tw = bw + 2 * pad, th = bh + 2 * pad;
    const box = { x: pad, y: pad, w: bw, h: bh };
    // the tile, rotated so this text runs level; outside the tile stays transparent
    const temp = new OffscreenCanvas(tw, th), t = temp.getContext('2d', { willReadFrequently: true });
    const toLevel = ctx => { ctx.translate(tw / 2, th / 2); ctx.rotate(-raw.angle); ctx.translate(-raw.cx, -raw.cy); };
    t.save(); toLevel(t); t.drawImage(src, 0, 0); t.restore();

    const { bg, fg, contrast } = colours(t, box, tw, th);
    if (contrast < MIN_CONTRAST) { stats.lowContrast = (stats.lowContrast || 0) + 1; return; } // clouds, brickwork, foliage: not text
    const layer = edgeFill(t, box, bg, tw, th, gap, ring, feather);

    // new text, on its own layer (its shape also goes into the mask)
    const text = new OffscreenCanvas(tw, th), x = text.getContext('2d');
    x.fillStyle = `rgb(${fg.join(',')})`;
    if (script === GALACTIC_INDEX) drawGalactic(x, box, rand);
    else {
      const word = pick();
      let size = Math.max(5, Math.floor(box.h)), m;
      const fits = () => { x.font = `bold ${size}px sans-serif`; m = x.measureText(word); return m.width <= box.w - 2 && m.actualBoundingBoxAscent + m.actualBoundingBoxDescent <= box.h - 2; };
      while (!fits() && size > 5) size--;
      const glyphH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      x.fillText(word, box.x + (box.w - m.width) / 2, box.y + (box.h - glyphH) / 2 + m.actualBoundingBoxAscent);
    }
    layer.getContext('2d').drawImage(text, 0, 0);

    // mask: the old text's blob (from the detector) and the new glyphs, both grown so
    // every stroke is covered, then feathered a long way out
    const mask = new OffscreenCanvas(tw, th), mk = mask.getContext('2d', { willReadFrequently: true });
    const old = raw.mask;
    const small = new OffscreenCanvas(old.cols, old.rows), sd = new ImageData(old.cols, old.rows);
    for (let i = 0; i < old.data.length; i++) sd.data[i * 4 + 3] = old.data[i] ? 255 : 0;
    small.getContext('2d').putImageData(sd, 0, 0);
    mk.save(); toLevel(mk);
    mk.filter = `blur(${Math.max(2, bh * 0.22)}px)`;
    mk.drawImage(small, old.x, old.y, old.w, old.h);
    mk.restore();
    mk.filter = `blur(${Math.max(1.5, bh * 0.08)}px)`;
    mk.drawImage(text, 0, 0);
    mk.filter = 'none';
    // grown blobs become solid where there's any coverage, then the edge is feathered
    const md = mk.getImageData(0, 0, tw, th), core = new Uint8ClampedArray(md.data.length);
    for (let i = 3; i < md.data.length; i += 4) core[i] = md.data[i] > 20 ? 255 : 0;
    mk.putImageData(new ImageData(core, tw, th), 0, 0);
    const soft = new OffscreenCanvas(tw, th), sf = soft.getContext('2d', { willReadFrequently: true });
    sf.filter = `blur(${feather / 2}px)`;
    sf.drawImage(mask, 0, 0);
    const fd = sf.getImageData(0, 0, tw, th);
    // ...but never past the sign: everything is confined to a soft rounded region a
    // little larger than the box, so the fill can't spill onto whatever is behind it
    const lim = new OffscreenCanvas(tw, th), lc = lim.getContext('2d', { willReadFrequently: true });
    const grow = Math.max(2, bh * 0.15);
    lc.filter = `blur(${Math.max(1.5, bh * 0.08)}px)`;
    lc.fillStyle = '#000';
    lc.beginPath();
    lc.roundRect(box.x - grow, box.y - grow, box.w + 2 * grow, box.h + 2 * grow, Math.min(box.w, box.h) * 0.45);
    lc.fill();
    const ld = lc.getImageData(0, 0, tw, th).data;
    for (let i = 3; i < fd.data.length; i += 4) fd.data[i] = ((core[i] ? 255 : fd.data[i]) * ld[i]) / 255;
    sf.putImageData(fd, 0, 0);

    const l = layer.getContext('2d');
    l.globalCompositeOperation = 'destination-in';
    l.drawImage(soft, 0, 0);

    g.save();
    g.translate(raw.cx, raw.cy); g.rotate(raw.angle);
    g.drawImage(layer, -tw / 2, -th / 2);
    g.restore();
  }

  // A fill for the box (and the zone around it) built from the pixels just outside it:
  // every pixel is the distance-weighted mix of the smoothed left/right/top/bottom
  // border colours at its row/column, so lighting gradients carry across and none of
  // the old text bleeds in. Border pixels that aren't the sign's colour (sky past its
  // edge, its frame) are ignored, so the fill falls back to the sign colour there. The
  // border's own noise is added back as grain.
  function edgeFill(t, b, bg, w, h, gap, ring, feather) {
    const d = t.getImageData(0, 0, w, h).data;
    const sample = (xa, xb, ya, yb) => {
      xa = Math.max(0, xa); ya = Math.max(0, ya); xb = Math.min(w, xb); yb = Math.min(h, yb);
      const c = [0, 0, 0]; let n = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { const i = (y * w + x) * 4; if (d[i + 3] < 200) continue; c[0] += d[i]; c[1] += d[i + 1]; c[2] += d[i + 2]; n++; }
      if (!n) return null;
      const v = [c[0] / n, c[1] / n, c[2] / n];
      return Math.abs(v[0] - bg[0]) + Math.abs(v[1] - bg[1]) + Math.abs(v[2] - bg[2]) < 90 ? v : null; // a different surface: ignore
    };
    const smooth = arr => arr.map((_, i) => {
      const c = [0, 0, 0]; let n = 0;
      for (let k = -3; k <= 3; k++) { const v = arr[i + k]; if (v) { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; n++; } }
      return n ? [c[0] / n, c[1] / n, c[2] / n] : null;
    });
    const L = smooth(Array.from({ length: b.h }, (_, y) => sample(b.x - gap - ring, b.x - gap, b.y + y, b.y + y + 1)));
    const R = smooth(Array.from({ length: b.h }, (_, y) => sample(b.x + b.w + gap, b.x + b.w + gap + ring, b.y + y, b.y + y + 1)));
    const T = smooth(Array.from({ length: b.w }, (_, x) => sample(b.x + x, b.x + x + 1, b.y - gap - ring, b.y - gap)));
    const B = smooth(Array.from({ length: b.w }, (_, x) => sample(b.x + x, b.x + x + 1, b.y + b.h + gap, b.y + b.h + gap + ring)));
    let dev = 0, dn = 0;
    for (const arr of [L, R, T, B]) for (const v of arr) if (v) { dev += Math.abs(v[0] - bg[0]) + Math.abs(v[1] - bg[1]) + Math.abs(v[2] - bg[2]); dn++; }
    const grain = dn ? Math.min(6, dev / dn / 3) : 0;
    const fill = new ImageData(w, h), f = fill.data;
    const pad = gap + ring + feather + 2;
    for (let y = Math.max(0, b.y - pad); y < Math.min(h, b.y + b.h + pad); y++) {
      for (let x = Math.max(0, b.x - pad); x < Math.min(w, b.x + b.w + pad); x++) {
        const yy = Math.min(b.h - 1, Math.max(0, y - b.y)), xx = Math.min(b.w - 1, Math.max(0, x - b.x));
        const parts = [[L[yy], x - b.x + gap + 1], [R[yy], b.x + b.w + gap - x], [T[xx], y - b.y + gap + 1], [B[xx], b.y + b.h + gap - y]];
        const c = [0, 0, 0]; let ws = 0;
        for (const [v, dist] of parts) { if (!v) continue; const wgt = 1 / Math.max(1, dist); c[0] += v[0] * wgt; c[1] += v[1] * wgt; c[2] += v[2] * wgt; ws += wgt; }
        const i = (y * w + x) * 4, n = (Math.random() - 0.5) * 2 * grain;
        if (ws) { f[i] = c[0] / ws + n; f[i + 1] = c[1] / ws + n; f[i + 2] = c[2] / ws + n; }
        else { f[i] = bg[0] + n; f[i + 1] = bg[1] + n; f[i + 2] = bg[2] + n; }
        f[i + 3] = d[i + 3] < 200 ? 0 : 255;   // nothing outside the tile
      }
    }
    const layer = new OffscreenCanvas(w, h);
    layer.getContext('2d').putImageData(fill, 0, 0);
    return layer;
  }

  // Sign colour = the dominant colour inside the box (text is the minority of its
  // pixels, and what's outside the box may be a different surface altogether). Text
  // colour = average of the inside pixels that differ most from it.
  function colours(g, b, W, H) {
    const x0 = Math.max(0, b.x), y0 = Math.max(0, b.y), x1 = Math.min(W, b.x + b.w), y1 = Math.min(H, b.y + b.h);
    const w = x1 - x0, h = y1 - y0, d = g.getImageData(x0, y0, w, h).data;
    const bins = new Map();                   // 32-level colour cube -> [count, r, g, b]
    const inner = [];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      inner.push(i);
      const k = (d[i] >> 5) * 64 + (d[i + 1] >> 5) * 8 + (d[i + 2] >> 5);
      const e = bins.get(k) || [0, 0, 0, 0];
      e[0]++; e[1] += d[i]; e[2] += d[i + 1]; e[3] += d[i + 2];
      bins.set(k, e);
    }
    if (!inner.length) return { bg: [128, 128, 128], fg: [255, 255, 255], contrast: 0 };
    let best = null;
    for (const e of bins.values()) if (!best || e[0] > best[0]) best = e;
    const bg = [best[1] / best[0], best[2] / best[0], best[3] / best[0]].map(Math.round);
    inner.sort((a, c) => dist(d, c, bg) - dist(d, a, bg));
    const top = inner.slice(0, Math.max(1, inner.length / 8 | 0));
    const fg = [0, 0, 0];
    for (const i of top) { fg[0] += d[i]; fg[1] += d[i + 1]; fg[2] += d[i + 2]; }
    for (let k = 0; k < 3; k++) fg[k] = Math.round(fg[k] / top.length);
    const contrast = dist(d, top[Math.floor(top.length / 2)], bg); // typical text pixel vs the sign colour
    return { bg, fg, contrast };
  }
  function dist(d, i, c) { return Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]); }

  // ---- which way you're looking: read-only hook on StreetViewPanorama ----
  const panos = new Set();
  const hookTimer = setInterval(() => {
    const gm = window.google?.maps;
    if (!gm?.StreetViewPanorama) return;
    clearInterval(hookTimer);
    try {
      const Orig = gm.StreetViewPanorama;
      gm.StreetViewPanorama = class extends Orig {
        constructor(...args) { super(...args); panos.add(this); }
      };
    } catch (err) { ggs.log('lying-signs: could not hook StreetViewPanorama', err); }
  }, 10);

  function start(cfg) {
    active = cfg;
    ggs.debug('lying-signs on', cfg);
    detector();
    ggs.tiles.replay(); // tiles already on screen go through the hook now
    return {
      stop() { active = null; ggs.tiles.replay(); },
      update(next) { const changed = next.script !== active.script; active = next; if (changed) ggs.tiles.replay(); },
    };
  }
  ggs.scripts['lying-signs'] = { start };
})();
