const express    = require("express");
const cors       = require("cors");
const https      = require("https");
const http       = require("http");
const fs         = require("fs");
const path       = require("path");
const axios      = require("axios");
const cron       = require("node-cron");
const xml2js     = require("xml2js");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ENV = {
  MISTRAL_API_KEY:      process.env.MISTRAL_API_KEY,
  OPENWEATHER_API_KEY:  process.env.OPENWEATHER_API_KEY,
  TICKETMASTER_API_KEY: process.env.TICKETMASTER_API_KEY,
  PREDICTHQ_API_KEY:    process.env.PREDICTHQ_API_KEY,
  GNEWS_API_KEY:        process.env.GNEWS_API_KEY,
  GEOAPIFY_API_KEY:     process.env.GEOAPIFY_API_KEY,
  UNSPLASH_ACCESS_KEY:  process.env.UNSPLASH_ACCESS_KEY,
  OPENAQ_API_KEY:       process.env.OPENAQ_API_KEY,
  AVIATIONSTACK_API_KEY:process.env.AVIATIONSTACK_API_KEY,
  RAPIDAPI_KEY:         process.env.RAPIDAPI_KEY,
  GOOGLE_MAPS_KEY:      process.env.GOOGLE_MAPS_KEY,
};

// ══════════════════════════════════════════════════════════════════
// MISTRAL KEY VALIDITY TRACKER
// Once a 401 is received the key is definitely invalid/expired.
// We skip ALL further Mistral calls in this session so we don't
// spam thousands of failed attempts and log noise.
// ══════════════════════════════════════════════════════════════════
let MISTRAL_KEY_VALID = !!ENV.MISTRAL_API_KEY;
let MISTRAL_401_AT    = null;
let MISTRAL_401_COUNT = 0;

function markMistral401() {
  MISTRAL_401_COUNT++;
  if (!MISTRAL_401_AT) {
    MISTRAL_401_AT = new Date().toISOString();
    console.error("╔══════════════════════════════════════════════════════════╗");
    console.error("║  MISTRAL 401 — API KEY IS INVALID OR MISSING             ║");
    console.error("║  All AI intel generation is PAUSED until key is fixed.   ║");
    console.error("║  Non-AI data (weather/news/places) still saves normally. ║");
    console.error("║  FIX: Render dashboard → Environment → MISTRAL_API_KEY  ║");
    console.error("╚══════════════════════════════════════════════════════════╝");
  }
  MISTRAL_KEY_VALID = false;
}

function mistralAvailable() {
  return MISTRAL_KEY_VALID && !!ENV.MISTRAL_API_KEY;
}

let THREE_JS = "", EARCUT_JS = "";
try { THREE_JS  = fs.readFileSync(path.join(__dirname,"node_modules/three/build/three.min.js"),"utf8"); } catch(e){}
try { EARCUT_JS = fs.readFileSync(path.join(__dirname,"node_modules/earcut/src/earcut.js"),"utf8"); } catch(e){}

async function ensureScripts() {
  const fetches = [];
  if(!THREE_JS) {
    fetches.push(
      axios.get("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js", {timeout:30000, responseType:"text"})
        .then(r => { THREE_JS = r.data; console.log("three.js loaded from CDN:", Math.round(THREE_JS.length/1024)+"kb"); })
        .catch(e => console.error("Failed to fetch three.js from CDN:", e.message))
    );
  }
  if(!EARCUT_JS) {
    fetches.push(
      axios.get("https://cdn.jsdelivr.net/npm/earcut@2.2.4/src/earcut.js", {timeout:10000, responseType:"text"})
        .then(r => { EARCUT_JS = r.data; console.log("earcut.js loaded from CDN:", Math.round(EARCUT_JS.length/1024)+"kb"); })
        .catch(e => console.error("Failed to fetch earcut.js from CDN:", e.message))
    );
  }
  if(fetches.length) await Promise.all(fetches);
  if(THREE_JS)  console.log("✓ three.js ready");
  if(EARCUT_JS) console.log("✓ earcut.js ready");
}

// ══════════════════════════════════════════════════════════════════
// HARDCODED GEO DATA — 192 countries, 1085 states, 23326 areas
// ══════════════════════════════════════════════════════════════════
const HARDCODED_GEO = {"Afghanistan":{"Badakhshan":["Faizabad","Baharak","Ishkashim","Wakhan","Jurm","Kishim","Raghistan","Shighnan","Darwaz","Shahri Buzurg"],"Badghis":["Qala i Naw","Ab Kamari","Jawand","Muqur","Bala Murghab","Qadis","Ghormach"],"Baghlan":["Puli Khumri","Baghlani Jadid","Andarab","Khost wa Fereng","Dushi","Dahana i Ghori","Banu","Tala wa Barfak","Guzargahi Nur"],"Balkh":["Mazar-i-Sharif","Balkh","Dehdadi","Dawlatabad","Khulm","Sholgara","Chimtal","Charbolak","Hairatan","Nahri Shahi"],"Bamyan":["Bamyan City","Yakawlang","Panjab","Kahmard","Saighan","Shibar","Waras"],"Daykundi":["Nili","Khadir","Shahristan","Miramor","Sangtakht","Ashtarlay","Kiti","Patoo"],"Farah":["Farah City","Bala Buluk","Bakwa","Khaki Safed","Pusht Rod","Anardara","Qala-i-Kah","Shib Koh","Gulistan","Pur Chaman"],"Faryab":["Maymana","Andkhoy","Pashtun Kot","Shirin Tagab","Almar","Qaysar","Gurziwan","Bilchiragh","Khwaja Sabz Posh","Kohistan","Qurghan"],"Ghazni":["Ghazni City","Jaghori","Andar","Qarabagh","Muqur","Malistan","Nawur","Gelan","Giro","Ab Band","Deh Yak","Jaghatu"],"Ghor":["Chaghcharan","Shahrak","Lal Wa Sarjangal","Pasaband","Saghar","Tulak","Dawlat Yar","Du Layna","Charsada"],"Helmand":["Lashkar Gah","Sangin","Marjah","Nad Ali","Garmser","Kajaki","Nawzad","Musa Qala","Washir","Nawa-I-Barakzayi","Khanashin"],"Heart":["Herat City","Shindand","Guzara","Karukh","Kushk","Kushki Kuhna","Gulran","Zinda Jan","Enjil","Adraskan","Ghoryan","Kohsan","Obe","Pashtun Zarghun","Chishti Sharif"],"Jowzjan":["Sheberghan","Aqcha","Khwaja Du Koh","Qarqin","Khamyab","Fayzabad","Mardyan","Mingajik","Darzab","Qush Tepa"],"Kabul":["Kabul City","Paghman","Bagrami","Deh Sabz","Shakardara","Mir Bacha Kot","Kalakan","Guldara","Qarabagh","Istalif","Khaki Jabbar","Surobi","Mussahi","Chahar Asyab"],"Kandahar":["Kandahar City","Arghandab","Panjwai","Spin Boldak","Zhari","Shah Wali Kot","Khakrez","Maiwand","Ghorak","Maruf","Arghistan","Reg","Shorabak","Miyanishin","Naish"],"Kapisa":["Mahmud-i-Raqi","Nijrab","Tagab","Alasay","Hesa Awal Kohistan","Hesa Duwum Kohistan","Koh Band"],"Khost":["Khost City","Sabari","Bak","Jaji Maidan","Tere Zayi","Tanai","Gurbuz","Mando Zayi","Musakhel","Qalandar","Nadir Shah Kot","Spera","Shamal"],"Kunar":["Asadabad","Bar Kunar","Asmar","Dangam","Marawara","Sirkanay","Shigal","Wata Pur","Narang","Chowkay","Nurgal","Khas Kunar","Pech","Chapa Dara"],"Kunduz":["Kunduz City","Imam Sahib","Dasht-i-Archi","Chahar Dara","Aliabad","Khan Abad","Qalay-i-Zal"],"Laghman":["Mihtarlam","Qarghayi","Alingar","Alishing","Dawlat Shah","Badpakh"],"Logar":["Puli Alam","Baraki Barak","Charkh","Khoshi","Mohammad Agha","Kharwar","Azra"],"Nangarhar":["Jalalabad City","Surkh Rod","Behsud","Kama","Goshta","Lal Pur","Muhmand Dara","Shinwar","Bati Kot","Rodat","Chaparhar","Khogyani","Sherzad","Pachir Aw Agam","Deh Bala","Achin","Nazyan","Kot","Dur Baba","Hesarak"],"Nimruz":["Zaranj","Chakhansur","Kang","Khash Rod","Dilaram","Char Burjak"],"Nuristan":["Parun","Wama","Waygal","Kamdesh","Barg-i-Matal","Du Ab","Mandol","Nurgaram"],"Paktia":["Gardez","Zurmat","Jaji","Chamkani","Dand Aw Patan","Tsamkani","Sayed Karam","Mirzaka","Ahmad Khel","Lazha Mangal","Shwak","Wuza Zadran","Ahmadabad"],"Paktika":["Sharana","Urgun","Zarghun Shahr","Jani Khel","Yahya Khel","Yusuf Khel","Omna","Bermal","Gayan","Sar Hawza","Nika","Dila","Khushamand","Katawaz","Turwo","Wor Mamay","Gomal","Sarobi"],"Panjshir":["Bazarak","Rokha","Dara","Abshar","Hesa Awal","Hesa Duwum","Shotul"],"Parwan":["Charikar","Bagram","Jabal Saraj","Salang","Shinwari","Ghorband","Shekh Ali","Surkh Parsa","Kohi Safi"],"Samangan":["Aybak","Khuram Wa Sarbagh","Hazrat-i-Sultan","Ruyi Du Ab","Dara-i-Sufi Bala","Dara-i-Sufi Payin","Feroz Nakhchir"],"Sar-e Pol":["Sar-e Pol City","Sangcharak","Balkhab","Sozma Qala","Sayyad","Kohistanat","Gosfandi"],"Takhar":["Taloqan","Khanabad","Kalafgan","Khwaja Ghar","Yangi Qala","Chah Ab","Farkhar","Warsaj","Bangi","Baharak","Khwaja Bahauddin","Dashti Qala","Darqad","Rustaq","Namak Ab","Hazar Sumuch"],"Urozgan":["Tarinkot","Chora","Deh Rahwod","Shahidi Hassas","Gizab","Khas Uruzgan"],"Wardak":["Maydan Shahr","Chaki Wardak","Day Mirdad","Jalrez","Jaghatu","Saydabad","Nirkh","Markazi Bihsud","Hesa-i-Awali Bihsud"],"Zabul":["Qalat","Shah Joy","Shinkay","Tarnak wa Jaldak","Arghandab","Daychopan","Mizana","Shamulzayi","Naw Bahar","Kakar"]},"Albania":{"Berat":["Berat City","Kuçovã","Poliçan","Skrapar","Ura Vajgurore"],"Diber":["Peshkopi","Bulqizë","Burrel","Klos"],"Durres":["Durrës City","Shijak","Krujë","Fushë-Krujë","Sukth"],"Elbasan":["Elbasan City","Cërrik","Gramsh","Librazhd","Peqin","Prrenjas","Belsh"],"Fier":["Fier City","Lushnjë","Patos","Divjakë","Roskovec","Mallakastër"],"Gjirokaster":["Gjirokastër City","Tepelenë","Përmet","Këlcyrë","Libohovë","Memaliaj","Dropull"],"Korce":["Korçë City","Pogradec","Maliq","Devoll","Kolonjë","Pustec"],"Kukes":["Kukës City","Has","Tropojë"],"Lezhe":["Lezhë City","Mirditë","Kurbin"],"Shkoder":["Shkodër City","Malësi e Madhe","Pukë","Vau i Dejës","Fushë-Arrëz"],"Tirana":["Tirana City","Kamëz","Vorë","Kavajë","Rrogozhinë"],"Vlore":["Vlorë City","Sarandë","Delvinë","Himarë","Selenicë","Konispol"]},"Algeria":{"Algiers":["Algiers Center","Sidi M'Hamed","Bouzareah","Cheraga","Zeralda","Bir Mourad Raïs","Hussein Dey","El Harrach","Dar El Beïda","Rouïba","Baraki"],"Oran":["Oran City","Es Senia","Bir El Djir","Ain El Turk","Arzew","Bethioua","Oued Tlelat","Boutlelis","Gediel"],"Constantine":["Constantine City","El Khroub","Hamma Bouziane","Didouche Mourad","Zighoud Youcef","Ain Abid","Ibn Ziad"],"Annaba":["Annaba City","El Bouni","Berrahal","El Hadjar","Chetaïbi","Seraïdi"],"Blida":["Blida City","Boufarik","Ouled Yaïch","Larbaa","Meftah","El Affroun","Mouzaia","Chréa"],"Batna":["Batna City","Barika","Arris","Ain Touta","Merouana","Tazoult","N'Gaous","Thniet El Abed","Chemora"],"Setif":["Sétif City","El Eulma","Bouandas","Ain Oulmene","Ain Arnat","Salah Bey","Amoucha","Guenzet","Bougaa"],"Biskra":["Biskra City","Tolga","Ouled Djellal","Sidi Khaled","El Kantara","Zeribet El Oued","Sidi Okba","M'Chouneche"],"Tlemcen":["Tlemcen City","Maghnia","Ghazaouet","Remchi","Nedroma","Sebdou","Ouled Mimoun","Hennaya","Bab El Assa"],"Bejaia":["Bejaia City","Akbou","Amizour","Kherrata","Sidi Aïch","El Kseur","Seddouk","Adekar","Souk El Ténine"],"Tizi Ouzou":["Tizi Ouzou City","Azazga","Larbaâ Nath Irathen","Tigzirt","Draâ Ben Khedda","Boghni","Ain El Hammam","Azeffoun","Ouadhia"],"Tamantasset":["Tamanrasset City","In Salah","In Ghar","Abalessa","Idles","Tazrouk","Tin Zaouatine","In Guezzam"],"Ouargla":["Ouargla City","Hassi Messaoud","Touggourt","Temacine","Megarine","El Hadjira","Taibet","Sidi Khouiled"]},"Angola":{"Luanda":["Luanda City","Viana","Belas","Cacuaco","Talatona","Kilamba Kiaxi","Icolo e Bengo","Quiçama"],"Benguela":["Benguela City","Lobito","Catumbela","Baía Farta","Cubal","Ganda","Balombo","Caimbambo","Chongorói","Bocoio"],"Huambo":["Huambo City","Caála","Bailundo","Ekunha","Longonjo","Ukuma","Chinjenje","Mungo","Catchiungo","Tchicala Tcholohanga","Londuimbali"],"Huila":["Lubango","Chibia","Humpata","Cacula","Matala","Jamba","Kuvango","Caluquembe","Chicomba","Caconda","Quilengues","Gambos"],"Bie":["Kuito","Andulo","Camacupa","Chinguar","Catabola","Nharea","Cuemba","Cunhinga","Chitembo"],"Uige":["Uíge City","Negage","Sanza Pombo","Maquela do Zombo","Damba","Mucaba","Puri","Bungo","Kangola","Alto Cauale","Quitexe","Ambuila","Bembe","Songo","Milunga","Quimbele"],"Cunene":["Ondjiva","Cuanhama","Ombadja","Namacunde","Cahama","Curoca","Cuvelai"],"Cabinda":["Cabinda City","Cacongo","Buco-Zau","Belize"],"Zaire":["M'banza-Kongo","Soyo","Nzeto","Cuimba","Nóqui","Tomboco"],"Malanje":["Malanje City","Calandula","Cacuso","Cangandala","Mucari","Cuaba Nzogo","Quela","Kiwaba Nzoji","Massango","Marimba","Luquembo","Quirima","Cambundi-Catembo"],"Moxico":["Luena","Cameia","Camanongue","Léua","Lucano","Luau","Alto Zambeze","Bundas","Luchazes"],"Namibe":["Moçâmedes","Tôwa","Virei","Bibala","Camucuio"],"Cuando Cubango":["Menongue","Cuito Cuanavale","Cuchi","Cuangar","Calai","Dirico","Mavinga","Rivungo","Nancova"],"Cuanza Norte":["Ndalatando","Cazengo","Cambambe","Ambaca","Golungo Alto","Lucala","Banga","Bolongongo","Quiculungo","Samba Cajú","Ngonguembo"],"Cuanza Sul":["Sumbe","Porto Amboim","Amboim","Cela","Libolo","Mussende","Quibala","Seles","Conda","Ebo","Cassongue","Quilenda"],"Lunda Norte":["Dundo","Chitato","Cambulo","Lucapa","Capenda-Camulemba","Cuilo","Caungula","Cuango","Xá-Muteba","Lóvua"],"Lunda Sul":["Saurimo","Dala","Muconda","Cacolo"],"Bengo":["Caxito","Dande","Ambriz","Nambuangongo","Dembos","Pango Aluquém","Bula Atumba"]},"Argentina":{"Buenos Aires":["Palermo","Recoleta","San Telmo","Puerto Madero","La Boca","Belgrano","Caballito","Flores","Almagro","Villa Urquiza"],"Buenos Aires Province":["La Plata","Mar del Plata","Bahía Blanca","Tandil","San Isidro","Pilar","Vicente López","Tigre","Quilmes","Lanús","Avellaneda","Pergamino","Olavarría","San Nicolás"],"Catamarca":["San Fernando del Valle de Catamarca","Belén","Tinogasta","Andalgalá","Santa María","Fiambalá","Recreo","Valle Viejo"],"Chaco":["Resistencia","Presidencia Roque Sáenz Peña","Villa Ángela","Charata","Juan José Castelli","Fontana","Barranqueras","General José de San Martín"],"Chubut":["Rawson","Comodoro Rivadavia","Trelew","Puerto Madryn","Esquel","Gaiman","Rada Tilly","Sarmiento"],"Cordoba":["Córdoba City","Villa Carlos Paz","Río Cuarto","Villa María","San Francisco","Alta Gracia","Jesús María","Villa General Belgrano","Cosquín","La Falda"],"Corrientes":["Corrientes City","Goya","Paso de los Libres","Curuzú Cuatiá","Mercedes","Bella Vista","Santo Tomé","Ituzaingó"],"Entre Rios":["Paraná","Concordia","Gualeguaychú","Concepción del Uruguay","Victoria","Colón","Gualeguay","Chajarí"],"Formosa":["Formosa City","Clorinda","Pirané","El Colorado","Las Lomitas","Ingeniero Juárez","Ibarreta"],"Jujuy":["San Salvador de Jujuy","San Pedro de Jujuy","Palpalá","Perico","Humahuaca","Tilcara","Purmamarca","La Quiaca"],"La Pampa":["Santa Rosa","General Pico","Eduardo Castex","Toay","Realicó","Macachín","General Acha","25 de Mayo"],"La Rioja":["La Rioja City","Chilecito","Chamical","Aimogasta","Chepes","Villa Unión","Famatina"],"Mendoza":["Mendoza City","San Rafael","Godoy Cruz","Luján de Cuyo","Maipú","Guaymallén","Las Heras","Tunuyán","Malargüe","Tupungato","San Martín"],"Misiones":["Posadas","Puerto Iguazú","Oberá","Eldorado","Apóstoles","San Ignacio","Montecarlo","Aristóbulo del Valle"],"Neuquen":["Neuquén City","San Martín de los Andes","Villa La Angostura","Zapala","Cutral Có","Plaza Huincul","Chos Malal","Centenario"],"Rio Negro":["Viedma","San Carlos de Bariloche","General Roca","Cipolletti","Las Grutas","San Antonio Oeste","El Bolsón","Choele Choel","Cinco Saltos"],"Salta":["Salta City","San Ramón de la Nueva Orán","Tartagal","Cafayate","Rosario de la Frontera","Metán","General Güemes","Cachi"],"San Juan":["San Juan City","Chimbas","Rawson","Rivadavia","Santa Lucía","Caucete","San José de Jáchal","Barreal"],"San Luis":["San Luis City","Villa Mercedes","Merlo","Juana Koslay","La Punta","Justo Daract","Quines"],"Santa Cruz":["Río Gallegos","El Calafate","Caleta Olivia","Puerto Deseado","El Chaltén","Puerto San Julián","Las Heras","Pico Truncado"],"Santa Fe":["Santa Fe City","Rosario","Rafaela","Venado Tuerto","Reconquista","Santo Tomé","Villa Constitución","Sunchales","San Lorenzo"],"Santiago del Estero":["Santiago del Estero City","La Banda","Termas de Río Hondo","Frías","Añatuya","Quimilí","Clodomira"],"Tierra del Fuego":["Ushuaia","Río Grande","Tolhuin"],"Tucuman":["San Miguel de Tucumán","Yerba Buena","Concepción","Tafí Viejo","Aguilares","Monteros","Tafí del Valle","Famaillá"]},"Australia":{"New South Wales":["Sydney","Newcastle","Wollongong","Central Coast","Tweed Heads","Maitland","Tamworth","Albury","Port Macquarie","Orange","Dubbo","Wagga Wagga","Bathurst","Coffs Harbour","Lismore"],"Queensland":["Brisbane","Gold Coast","Sunshine Coast","Townsville","Cairns","Toowoomba","Mackay","Rockhampton","Bundaberg","Hervey Bay","Gladstone","Mount Isa","Maryborough","Gympie"],"South Australia":["Adelaide","Mount Gambier","Whyalla","Murray Bridge","Port Augusta","Port Pirie","Port Lincoln","Victor Harbor","Gawler","Roxby Downs"],"Tasmania":["Hobart","Launceston","Devonport","Burnie","Ulverstone","New Norfolk","Queenstown","Smithton"],"Victoria":["Melbourne","Ballarat","Bendigo","Shepparton","Wodonga","Mildura","Warrnambool","Traralgon","Wangaratta","Moe","Morwell","Sale"],"Western Australia":["Perth","Bunbury","Geraldton","Kalgoorlie","Albany","Busselton","Karratha","Broome","Port Hedland","Esperance"],"Australian Capital Territory":["Canberra","Hall","Tharwa"],"Northern Territory":["Darwin","Alice Springs","Katherine","Nhulunbuy","Tennant Creek","Jabiru","Yulara"]},"Austria":{"Vienna":["Innere Stadt","Leopoldstadt","Landstraße","Wieden","Margareten","Mariahilf","Neubau","Josefstadt","Alsergrund","Favoriten","Simmering","Meidling","Hietzing","Penzing","Rudolfsheim-Fünfhaus","Ottakring","Hernals","Währing","Döbling","Brigittenau","Floridsdorf","Donaustadt","Liesing"],"Lower Austria":["Sankt Pölten","Wiener Neustadt","Baden bei Wien","Krems an der Donau","Amstetten","Mödling","Klosterneuburg","Tulln an der Donau","Schwechat","Waidhofen an der Ybbs","Zwettl"],"Upper Austria":["Linz","Wels","Steyr","Leonding","Traun","Braunau am Inn","Ansfelden","Bad Ischl","Gmunden","Vöcklabruck","Ried im Innkreis","Enns"],"Styria":["Graz","Leoben","Kapfenberg","Bruck an der Mur","Feldbach","Gratwein-Straßengel","Knittelfeld","Leibnitz","Deutschlandsberg","Weiz","Judenburg","Schladming"],"Tyrol":["Innsbruck","Kufstein","Telfs","Schwaz","Hall in Tirol","Wörgl","Lienz","Imst","Kitzbühel","Landeck","St. Anton am Arlberg"],"Salzburg":["Salzburg City","Hallein","Saalfelden","Sankt Johann im Pongau","Bischofshofen","Zell am See","Seekirchen am Wallersee","Tamsweg","Mittersill"],"Carinthia":["Klagenfurt","Villach","Wolfsberg","Spittal an der Drau","Feldkirchen","Sankt Veit an der Glan","Völkermarkt","Hermagor","Velden am Wörthersee"],"Burgenland":["Eisenstadt","Rust","Neusiedl am See","Mattersburg","Oberpullendorf","Oberwart","Güssing","Jennersdorf"],"Vorarlberg":["Bregenz","Dornbirn","Feldkirch","Lustenau","Bludenz","Hohenems","Götzis","Hard","Lech am Arlberg"]},"Brazil":{"Acre":["Rio Branco","Cruzeiro do Sul","Sena Madureira","Tarauacá","Feijó","Brasiléia","Epitaciolândia","Xapuri"],"Alagoas":["Maceió","Arapiraca","Palmeira dos Índios","Rio Largo","Penedo","União dos Palmares","Marechal Deodoro","Maragogi"],"Amazonas":["Manaus","Parintins","Itacoatiara","Manacapuru","Coari","Tabatinga","Tefé","Maués"],"Bahia":["Salvador","Feira de Santana","Vitória da Conquista","Camaçari","Juazeiro","Itabuna","Ilhéus","Porto Seguro","Barreiras"],"Ceará":["Fortaleza","Caucaia","Juazeiro do Norte","Maracanaú","Sobral","Crato","Itapipoca","Aquiraz","Jericoacoara"],"Distrito Federal":["Brasília","Ceilândia","Taguatinga","Samambaia","Plano Piloto","Águas Claras","Guará","Gama"],"Espírito Santo":["Vitória","Vila Velha","Serra","Cariacica","Cachoeiro de Itapemirim","Linhares","São Mateus","Guarapari"],"Goiás":["Goiânia","Aparecida de Goiânia","Anápolis","Rio Verde","Luziânia","Águas Lindas de Goiás","Trindade","Catalão","Formosa","Caldas Novas"],"Maranhão":["São Luís","Imperatriz","Timon","Caxias","Codó","Açailândia","Bacabal","Balsas","Barreirinhas"],"Mato Grosso":["Cuiabá","Várzea Grande","Rondonópolis","Sinop","Tangará da Serra","Sorriso","Primavera do Leste","Barra do Garças","Cáceres"],"Mato Grosso do Sul":["Campo Grande","Dourados","Três Lagoas","Corumbá","Ponta Porã","Naviraí","Nova Andradina","Bonito"],"Minas Gerais":["Belo Horizonte","Uberlândia","Contagem","Juiz de Fora","Betim","Montes Claros","Ribeirão das Neves","Uberaba","Governador Valadares","Ipatinga","Ouro Preto"],"Pará":["Belém","Ananindeua","Santarém","Marabá","Parauapebas","Castanhal","Abaetetuba","Altamira","Tucuruí"],"Paraíba":["João Pessoa","Campina Grande","Santa Rita","Patos","Bayeux","Sousa","Cajazeiras","Cabedelo"],"Paraná":["Curitiba","Londrina","Maringá","Ponta Grossa","Cascavel","Foz do Iguaçu","São José dos Pinhais","Paranaguá"],"Pernambuco":["Recife","Jaboatão dos Guararapes","Olinda","Caruaru","Petrolina","Paulista","Cabo de Santo Agostinho","Garanhuns","Fernando de Noronha"],"Piauí":["Teresina","Parnaíba","Picos","Floriano","Piripiri","Campo Maior","Oeiras"],"Rio de Janeiro":["Rio de Janeiro City","São Gonçalo","Duque de Caxias","Nova Iguaçu","Niterói","Campos dos Goytacazes","Belford Roxo","São João de Meriti","Petrópolis","Volta Redonda","Cabo Frio","Angra dos Reis"],"Rio Grande do Norte":["Natal","Mossoró","Parnamirim","São Gonçalo do Amarante","Macaíba","Caicó","Ceará-Mirim","Tibau do Sul"],"Rio Grande do Sul":["Porto Alegre","Caxias do Sul","Canoas","Pelotas","Santa Maria","Gravataí","Viamão","Novo Hamburgo","Passo Fundo","Rio Grande","Gramado"],"Rondônia":["Pôrto Velho","Ji-Paraná","Ariquemes","Cacoal","Vilhena","Jaru","Rolim de Moura"],"Roraima":["Boa Vista","Rorainópolis","Caracaraí","Pacaraima","Cantá","Mucajaí"],"Santa Catarina":["Florianópolis","Joinville","Blumenau","São José","Chapecó","Criciúma","Itajaí","Balneário Camboriú","Lages"],"São Paulo":["São Paulo City","Guarulhos","Campinas","São Bernardo do Campo","Santo André","São José dos Campos","Osasco","Ribeirão Preto","Sorocaba","Santos","São José do Rio Preto"],"Sergipe":["Aracaju","Nossa Senhora do Socorro","Lagarto","Itabaiana","São Cristóvão","Estância","Tobias Barreto"],"Tocantins":["Palmas","Araguaína","Gurupi","Porto Nacional","Paraíso do Tocantins","Colinas do Tocantins","Guaraí"]},"Canada":{"Alberta":["Calgary","Edmonton","Red Deer","Lethbridge","Medicine Hat","St. Albert","Grande Prairie","Fort McMurray"],"British Columbia":["Vancouver","Victoria","Surrey","Burnaby","Kelowna","Nanaimo","Prince George","Kamloops"],"Manitoba":["Winnipeg","Brandon","Steinbach","Thompson","Portage la Prairie","Winkler","Selkirk","Churchill"],"New Brunswick":["Moncton","Saint John","Fredericton","Dieppe","Miramichi","Edmundston","Bathurst","Campbellton"],"Newfoundland and Labrador":["St. John's","Mount Pearl","Corner Brook","Conception Bay South","Grand Falls-Windsor","Gander","Happy Valley-Goose Bay","Labrador City"],"Nova Scotia":["Halifax","Sydney","Dartmouth","Truro","New Glasgow","Kentville","Amherst","Yarmouth"],"Ontario":["Toronto","Ottawa","Mississauga","Hamilton","London","Kitchener","Windsor","Thunder Bay"],"Prince Edward Island":["Charlottetown","Summerside","Stratford","Cornwall"],"Quebec":["Montreal","Quebec City","Laval","Gatineau","Longueuil","Sherbrooke","Saguenay","Trois-Rivières"],"Saskatchewan":["Saskatoon","Regina","Prince Albert","Moose Jaw","Yorkton","Swift Current","North Battleford","Lloydminster"],"Northwest Territories":["Yellowknife","Hay River","Inuvik","Fort Smith"],"Nunavut":["Iqaluit","Rankin Inlet","Cambridge Bay","Arviat","Igloolik"],"Yukon":["Whitehorse","Dawson City","Watson Lake","Haines Junction"]},"China":{"Beijing":["Dongcheng","Xicheng","Chaoyang","Haidian","Fengtai","Shijingshan","Shunyi","Changping"],"Shanghai":["Huangpu","Pudong","Xuhui","Jing'an","Changning","Hongkou","Yangpu","Minhang"],"Guangdong":["Guangzhou","Shenzhen","Dongguan","Foshan","Shantou","Zhuhai","Huizhou","Zhanjiang"],"Sichuan":["Chengdu","Mianyang","Nanchong","Yibin","Luzhou","Deyang","Leshan","Zigong"],"Zhejiang":["Hangzhou","Ningbo","Wenzhou","Shaoxing","Jiaxing","Jinhua","Huzhou","Taizhou"],"Jiangsu":["Nanjing","Suzhou","Wuxi","Changzhou","Nantong","Xuzhou","Yangzhou","Lianyungang"],"Shandong":["Jinan","Qingdao","Yantai","Weifang","Zibo","Linyi","Jining","Tai'an"],"Henan":["Zhengzhou","Luoyang","Kaifeng","Nanyang","Anyang","Xinxiang","Pingdingshan","Jiaozuo"],"Hubei":["Wuhan","Xiangyang","Yichang","Jingzhou","Shiyan","Huangshi","Xiaogan","Xianning"],"Hunan":["Changsha","Hengyang","Zhuzhou","Xiangtan","Yueyang","Changde","Yiyang","Zhangjiajie"],"Yunnan":["Kunming","Qujing","Yuxi","Baoshan","Lijiang","Pu'er","Dali","Jinghong"],"Shaanxi":["Xi'an","Baoji","Xianyang","Weinan","Yan'an","Yulin","Hanzhong","Ankang"],"Fujian":["Fuzhou","Xiamen","Quanzhou","Zhangzhou","Putian","Ningde","Sanming","Longyan"],"Anhui":["Hefei","Wuhu","Bengbu","Anqing","Ma'anshan","Huainan","Huangshan City","Bozhou"],"Jiangxi":["Nanchang","Ganzhou","Jiujiang","Jingdezhen","Pingxiang","Xinyu","Yingtan","Shangrao"],"Heilongjiang":["Harbin","Daqing","Qiqihar","Mudanjiang","Jiamusi","Jixi","Hegang","Heihe"],"Jilin":["Changchun","Jilin City","Siping","Liaoyuan","Tonghua","Baishan","Baicheng","Songyuan"],"Liaoning":["Shenyang","Dalian","Anshan","Fushun","Benxi","Dandong","Jinzhou","Yingkou"],"Hebei":["Shijiazhuang","Tangshan","Baoding","Handan","Qinhuangdao","Zhangjiakou","Chengde","Cangzhou"],"Shanxi":["Taiyuan","Datong","Changzhi","Jincheng","Yangquan","Linfen","Yuncheng","Xinzhou"],"Inner Mongolia":["Hohhot","Baotou","Ordos","Chifeng","Tongliao","Hulunbuir","Wuhai","Manzhouli"],"Guangxi":["Nanning","Guilin","Liuzhou","Wuzhou","Beihai","Qinzhou","Guigang","Yulin"],"Xinjiang":["Urumqi","Karamay","Turpan","Hami","Kashgar","Aksu","Korla","Yining"],"Tibet":["Lhasa","Shigatse","Chamdo","Nyingchi","Shannan","Nagqu","Ngari"],"Qinghai":["Xining","Haidong","Golmud","Delingha","Yushu","Tongren"],"Gansu":["Lanzhou","Tianshui","Baiyin","Wuwei","Zhangye","Jiuquan","Dunhuang","Pingliang"],"Ningxia":["Yinchuan","Shizuishan","Wuzhong","Guyuan","Zhongwei"],"Hainan":["Haikou","Sanya","Danzhou","Qionghai","Wenchang","Wanning"],"Guizhou":["Guiyang","Zunyi","Liupanshui","Anshun","Bijie","Tongren","Kaili","Xingyi"],"Chongqing":["Yuzhong","Jiangbei","Nan'an","Shapingba","Jiulongpo","Wanzhou","Fuling"],"Hong Kong":["Central and Western","Wan Chai","Eastern","Yau Tsim Mong","Sham Shui Po","Kwun Tong","Shatin","Tuen Mun"],"Macau":["Sé","Nossa Senhora de Fátima","Santo António","São Lázaro","São Lourenço","Taipa","Coloane","Cotai"]},"Colombia":{"Bogotá":["Chapinero","Usaquén","Santa Fe","Suba","Kennedy","Fontibón","Teusaquillo","Engativá"],"Antioquia":["Medellín","Bello","Itagüí","Envigado","Rionegro","Apartadó","Turbo","Santa Fe de Antioquia"],"Valle del Cauca":["Cali","Buenaventura","Palmira","Tuluá","Buga","Cartago","Jamundí","Yumbo"],"Atlántico":["Barranquilla","Soledad","Malambo","Sabanalarga","Baranoa","Puerto Colombia"],"Santander":["Bucaramanga","Floridablanca","Girón","Piedecuesta","Barrancabermeja","San Gil","Socorro","Barichara"],"Bolívar":["Cartagena","Magangué","Turbaco","Arjona","El Carmen de Bolívar","Mompox"],"Cundinamarca":["Soacha","Facatativá","Chía","Zipaquirá","Girardot","Fusagasugá","Mosquera","Funza"],"Nariño":["Pasto","Tumaco","Ipiales","Tuquerres","Samaniego","Barbacoas"],"Córdoba":["Montería","Lorica","Sahagún","Cereté","Planeta Rica","Tierralta"],"Tolima":["Ibagué","Espinal","Melgar","Honda","Mariquita","Líbano","Chaparral","Prado"],"Meta":["Villavicencio","Acacías","Granada","Puerto López","Puerto Gaitán","La Macarena"],"Huila":["Neiva","Pitalito","Garzón","San Agustín","Campoalegre","Rivera"],"Boyacá":["Tunja","Duitama","Sogamoso","Chiquinquirá","Villa de Leyva","Paipa"],"Caldas":["Manizales","La Dorada","Chinchiná","Riosucio","Villamaría","Anserma"],"Risaralda":["Pereira","Dosquebradas","Santa Rosa de Cabal","Belén de Umbría","Marsella","Quinchía"],"Quindío":["Armenia","Calarcá","Salento","Quimbaya","Montenegro","Filandia"],"Magdalena":["Santa Marta","Ciénaga","El Banco","Fundación","Plato","Aracataca"],"Cesar":["Valledupar","Aguachica","Agustín Codazzi","Bosconia","El Paso","La Jagua de Ibirico"],"Cauca":["Popayán","Santander de Quilichao","Puerto Tejada","El Tambo","Patía","Silvia"]},"Egypt":{"Cairo":["Downtown Cairo","Zamalek","Maadi","Heliopolis","Nasr City","New Cairo","Old Cairo","Islamic Cairo"],"Alexandria":["Alexandria City","Borg El Arab","Abu Qir","Al Agami","Al Amriya","El Alamein"],"Aswan":["Aswan City","Kom Ombo","Edfu","Abu Simbel","Nasr Al Nuba","Sebaiya"],"Luxor":["Esna","Armant","El Bayadiya","El Tod","El Alweat"],"Giza":["Giza City","6th of October City","Sheikh Zayed City","Al Hawamdiya","Al Badrashein","Atfih"],"Hurghada":["Hurghada City","El Gouna","Sahl Hasheesh","Safaga","Marsa Alam"],"Sharm el-Sheikh":["Sharm El Sheikh City","Naama Bay","Hadaba","Montazah","Nabq"],"Sinai":["El Arish","Rafah","Sheikh Zuweid","Bir El Abd","Nekhel"],"Nile Delta":["Tanta","Mansoura","Zagazig","Damanhour","Banha","Shebin El Kom"],"Upper Egypt":["Minya","Assiut","Sohag","Qena","Beni Suef","Faiyum"]},"France":{"Île-de-France":["Paris","Boulogne-Billancourt","Saint-Denis","Argenteuil","Montreuil","Nanterre","Vitry-sur-Seine","Créteil"],"Auvergne-Rhône-Alpes":["Lyon","Saint-Étienne","Grenoble","Villeurbanne","Clermont-Ferrand","Annecy","Vénissieux","Valence"],"Nouvelle-Aquitaine":["Bordeaux","Limoges","Poitiers","Pau","La Rochelle","Mérignac","Pessac","Niort"],"Occitanie":["Toulouse","Montpellier","Nîmes","Perpignan","Béziers","Montauban","Narbonne","Albi"],"Hauts-de-France":["Lille","Amiens","Roubaix","Tourcoing","Dunkerque","Calais","Villeneuve-d'Ascq","Saint-Quentin"],"Grand Est":["Strasbourg","Reims","Metz","Mulhouse","Nancy","Colmar","Troyes","Charleville-Mézières"],"Pays de la Loire":["Nantes","Angers","Le Mans","Saint-Nazaire","La Roche-sur-Yon","Cholet","Laval","Rezé"],"Normandie":["Le Havre","Rouen","Caen","Cherbourg-en-Cotentin","Évreux","Dieppe","Saint-Lô","Alençon"],"Bretagne":["Rennes","Brest","Quimper","Lorient","Vannes","Saint-Malo","Saint-Brieuc","Lanester"],"Bourgogne-Franche-Comté":["Dijon","Besancon","Belfort","Chalon-sur-Saône","Nevers","Auxerre","Mâcon","Sens"],"Provence-Alpes-Côte d'Azur":["Marseille","Nice","Toulon","Aix-en-Provence","Avignon","Antibes","Cannes","La Seyne-sur-Mer"],"Centre-Val de Loire":["Tours","Orléans","Bourges","Blois","Châteauroux","Chartres","Joué-lès-Tours","Dreux"],"Corse":["Ajaccio","Bastia","Porto-Vecchio","Borgo","Corte","Calvi","Propriano"]},"Germany":{"Bavaria":["Munich","Nuremberg","Augsburg","Regensburg","Ingolstadt","Würzburg","Fürth","Erlangen"],"North Rhine-Westphalia":["Cologne","Düsseldorf","Dortmund","Essen","Duisburg","Bochum","Wuppertal","Bielefeld"],"Baden-Württemberg":["Stuttgart","Mannheim","Karlsruhe","Freiburg im Breisgau","Heidelberg","Ulm","Heilbronn","Pforzheim"],"Hesse":["Frankfurt am Main","Wiesbaden","Kassel","Darmstadt","Offenbach am Main","Hanau","Gießen","Marburg"],"Lower Saxony":["Hanover","Braunschweig","Oldenburg","Osnabrück","Wolfsburg","Göttingen","Hildesheim","Salzgitter"],"Saxony":["Leipzig","Dresden","Chemnitz","Zwickau","Plauen","Görlitz","Bautzen","Freiberg"],"Berlin":["Mitte","Pankow","Charlottenburg-Wilmersdorf","Friedrichshain-Kreuzberg","Tempelhof-Schöneberg","Neukölln","Lichtenberg","Spandau"],"Hamburg":["Altona","Bergedorf","Eimsbüttel","Hamburg-Mitte","Hamburg-Nord","Harburg","Wandsbek","St. Pauli"],"Rhineland-Palatinate":["Mainz","Ludwigshafen","Koblenz","Trier","Kaiserslautern","Worms","Neuwied","Neustadt"],"Saxony-Anhalt":["Halle","Magdeburg","Dessau-Roßlau","Bitterfeld-Wolfen","Stendal","Halberstadt","Weißenfels","Lutherstadt Wittenberg"],"Thuringia":["Erfurt","Jena","Gera","Weimar","Gotha","Nordhausen","Eisenach","Suhl"],"Brandenburg":["Potsdam","Cottbus","Brandenburg an der Havel","Frankfurt (Oder)","Oranienburg"],"Mecklenburg-Western Pomerania":["Rostock","Schwerin","Neubrandenburg","Stralsund","Greifswald","Wismar"],"Schleswig-Holstein":["Kiel","Lübeck","Flensburg","Neumünster","Norderstedt","Elmshorn"],"Saarland":["Saarbrücken","Neunkirchen","Homburg","Völklingen","Saarlouis","Merzig"],"Bremen":["Bremen City","Bremerhaven"]},"Ghana":{"Greater Accra":["Accra","Tema","Madina","Ashaiman","Dome","Lashibi","Teshie","Ada Foah"],"Ashanti":["Kumasi","Obuasi","Mampong","Konongo","Tafo","Ejura","Bekwai","Offinso"],"Western":["Sekondi-Takoradi","Tarkwa","Axim","Elubo","Dixcove","Shama","Prestea","Agona Nkwanta"],"Eastern":["Koforidua","Nkawkaw","Suhum","Oda","Asamankese","Manya Krobo","Nsawam","Somanya"],"Central":["Cape Coast","Winneba","Kasoa","Mankessim","Elmina","Agona Swedru","Dunkwa-on-Offin","Saltpond"],"Volta":["Ho","Hohoe","Kpando","Aflao","Keta","Sogakope","Anloga","Dzodze"],"Northern":["Tamale","Yendi","Savelugu","Karaga","Gushiegu","Bimbilla","Kumbungu","Saboba"],"Upper East":["Bolgatanga","Navrongo","Bawku","Paga","Tongo","Sandema","Zebilla","Fumbisi"],"Upper West":["Wa","Tumu","Jirapa","Lawra","Nandom","Gwollu","Issa","Funsi"],"Brong Ahafo":["Sunyani","Berekum","Sampa","Dormaa Ahenkro","Drobo","Wamfie","Nsuatre","Jinijini"],"Bono":["Sunyani","Berekum","Sampa","Dormaa Ahenkro"],"Bono East":["Techiman","Kintampo","Nkoranza","Yeji","Atebubu"],"Ahafo":["Goaso","Mim","Hwidiem","Bechem","Kenyasi"],"Oti":["Dambai","Jasikan","Kete Krachi","Nkwanta"],"Savannah":["Damongo","Bole","Salaga","Buipe"],"North East":["Nalerigu","Gambaga","Walewale","Bunkpurugu"],"Western North":["Sefwi Wiawso","Enchi","Bia Essam","Sefwi Bekwai"]},"India":{"Andhra Pradesh":["Visakhapatnam","Vijayawada","Guntur","Tirupati","Kurnool","Nellore"],"Arunachal Pradesh":["Itanagar","Tawang","Pasighat","Naharlagun"],"Assam":["Guwahati","Dispur","Dibrugarh","Silchar","Jorhat"],"Bihar":["Patna","Gaya","Bhagalpur","Muzaffarpur","Darbhanga"],"Chhattisgarh":["Raipur","Bilaspur","Bhilai","Korba","Raigarh"],"Goa":["Panaji","Margao","Vasco da Gama","Mapusa"],"Gujarat":["Ahmedabad","Surat","Vadodara","Rajkot","Gandhinagar"],"Haryana":["Gurugram","Faridabad","Panipat","Ambala"],"Himachal Pradesh":["Shimla","Dharamshala","Manali","Mandi","Solan"],"Jharkhand":["Ranchi","Jamshedpur","Dhanbad","Bokaro","Deoghar"],"Karnataka":["Bengaluru","Mysuru","Hubballi-Dharwad","Mangaluru","Belagavi"],"Kerala":["Thiruvananthapuram","Kochi","Kozhikode","Thrissur","Kollam"],"Madhya Pradesh":["Bhopal","Indore","Jabalpur","Gwalior","Ujjain"],"Maharashtra":["Mumbai","Pune","Nagpur","Nashik","Aurangabad"],"Manipur":["Imphal","Churachandpur","Thoubal","Bishnupur"],"Meghalaya":["Shillong","Tura","Jowai","Nongpoh"],"Mizoram":["Aizawl","Lunglei","Saiha","Champhai"],"Nagaland":["Kohima","Dimapur","Mokokchung","Tuensang"],"Odisha":["Bhubaneswar","Cuttack","Rourkela","Berhampur","Sambalpur"],"Punjab":["Ludhiana","Amritsar","Jalandhar","Patiala"],"Rajasthan":["Jaipur","Jodhpur","Udaipur","Kota","Ajmer"],"Sikkim":["Gangtok","Namchi","Geyzing","Mangan"],"Tamil Nadu":["Chennai","Coimbatore","Madurai","Tiruchirappalli","Salem"],"Telangana":["Hyderabad","Warangal","Nizamabad","Khammam","Karimnagar"],"Tripura":["Agartala","Udaipur","Dharmanagar","Kailasahar"],"Uttar Pradesh":["Lucknow","Kanpur","Varanasi","Agra","Prayagraj"],"Uttarakhand":["Dehradun","Haridwar","Rishikesh","Haldwani","Nainital"],"West Bengal":["Kolkata","Siliguri","Durgapur","Asansol","Howrah"],"Delhi":["New Delhi","North Delhi","South Delhi","East Delhi","West Delhi"],"Jammu and Kashmir":["Srinagar","Jammu","Anantnag","Baramulla"],"Ladakh":["Leh","Kargil"]},"Indonesia":{"Bali":["Denpasar","Ubud","Singaraja","Kuta","Sanur","Seminyak","Canggu","Nusa Dua"],"Jakarta":["Central Jakarta","South Jakarta","West Jakarta","East Jakarta","North Jakarta"],"West Java":["Bandung","Bekasi","Depok","Bogor","Cirebon"],"East Java":["Surabaya","Malang","Kediri","Jember","Banyuwangi"],"Central Java":["Semarang","Surakarta","Magelang","Tegal","Pekalongan"],"North Sumatra":["Medan","Pematangsiantar","Binjai","Sibolga"],"South Sulawesi":["Makassar","Parepare","Palopo","Watampone"],"Yogyakarta":["Yogyakarta City","Sleman","Bantul","Wates"],"Aceh":["Banda Aceh","Lhokseumawe","Sabang","Langsa","Meulaboh"],"South Sumatra":["Palembang","Prabumulih","Lubuklinggau","Baturaja"],"Riau":["Pekanbaru","Dumai","Bengkalis","Rengat"],"Kalimantan":["Samarinda","Balikpapan","Banjarmasin","Pontianak","Palangka Raya"]},"Iran":{"Tehran":["Tehran Capital","Shahriar","Varamin"],"Isfahan":["Isfahan City","Kashan","Najafabad"],"Fars":["Shiraz","Marvdasht","Jahrom"],"Khorasan Razavi":["Mashhad","Neyshabur","Sabzevar"],"East Azerbaijan":["Tabriz","Maragheh","Marand"],"West Azerbaijan":["Urmia","Khoy","Miandoab"],"Khuzestan":["Ahvaz","Dezful","Abadan"],"Kerman":["Kerman City","Sirjan","Rafsanjan"],"Hormozgan":["Bandar Abbas","Qeshm","Minab"],"Gilan":["Rasht","Bandar-e Anzali","Lahijan"],"Mazandaran":["Sari","Babol","Amol"],"Alborz":["Karaj","Fardis","Nazarabad"],"Hamadan":["Hamadan City","Malayer","Nahavand"],"Kermanshah":["Kermanshah City","Eslamabad-e Gharb","Kangavar"],"Lorestan":["Khorramabad","Borujerd","Dorud"],"Semnan":["Semnan City","Shahrud","Damghan"],"Yazd":["Yazd City","Meybod","Ardakan"],"Zanjan":["Zanjan City","Abhar","Khorramdarreh"],"Ardabil":["Ardabil City","Meshginshahr","Parsabad"],"Bushehr":["Bushehr City","Borazjan","Bandar Ganaveh"],"Golestan":["Gorgan","Gonbad-e Kavus","Bandar Torkaman"],"Ilam":["Ilam City","Dehloran","Eyvan"],"Kohgiluyeh":["Yasuj","Gachsaran","Dehdasht"],"Kurdistan":["Sanandaj","Saqqez","Marivan"],"Markazi":["Arak","Saveh","Khomein"],"Qazvin":["Qazvin City","Takestan","Alvand"],"Qom":["Qom City"],"Sistan and Baluchestan":["Zahedan","Zabol","Chabahar"],"South Khorasan":["Birjand","Qaen","Tabas"],"North Khorasan":["Bojnurd","Shirvan","Esfarayen"],"Chaharmahal and Bakhtiari":["Shahrekord","Borujen","Lordegan"]},"Italy":{"Lombardy":["Milan","Bergamo","Brescia","Como","Monza","Varese","Pavia","Cremona"],"Lazio":["Rome","Latina","Frosinone","Civitavecchia","Rieti","Viterbo"],"Campania":["Naples","Salerno","Caserta","Benevento","Avellino","Torre del Greco"],"Sicily":["Palermo","Catania","Messina","Agrigento","Siracusa","Trapani","Ragusa","Caltanissetta"],"Veneto":["Venice","Verona","Padua","Vicenza","Treviso","Mestre","Belluno","Rovigo"],"Piedmont":["Turin","Novara","Alessandria","Asti","Cuneo","Biella","Verbania","Vercelli"],"Emilia-Romagna":["Bologna","Parma","Modena","Rimini","Ferrara","Reggio Emilia","Ravenna","Forlì"],"Tuscany":["Florence","Pisa","Siena","Livorno","Arezzo","Grosseto","Prato","Pistoia"],"Apulia":["Bari","Lecce","Foggia","Taranto","Brindisi","Andria","Barletta","Altamura"],"Calabria":["Catanzaro","Reggio Calabria","Cosenza","Lamezia Terme","Crotone","Vibo Valentia"],"Sardinia":["Cagliari","Sassari","Nuoro","Olbia","Oristano","Quartu Sant'Elena"],"Liguria":["Genoa","La Spezia","Savona","Imperia","Sanremo"],"Marche":["Ancona","Pesaro","Ascoli Piceno","Macerata","Fermo"],"Abruzzo":["L'Aquila","Pescara","Chieti","Teramo"],"Friuli-Venezia Giulia":["Trieste","Udine","Gorizia","Pordenone"],"Trentino-Alto Adige":["Trento","Bolzano","Rovereto","Merano"],"Umbria":["Perugia","Terni","Foligno","Città di Castello"],"Basilicata":["Potenza","Matera"],"Molise":["Campobasso","Isernia"]},"Japan":{"Tokyo":["Shinjuku","Shibuya","Hachioji","Tachikawa","Ginza","Asakusa","Roppongi","Akihabara"],"Osaka":["Osaka City","Sakai","Higashiosaka","Toyonaka","Neyagawa","Suita","Ibaraki","Takatsuki"],"Kanagawa":["Yokohama","Kawasaki","Sagamihara","Fujisawa","Yokosuka","Chigasaki","Hiratsuka","Odawara"],"Aichi":["Nagoya","Toyota","Toyohashi","Okazaki","Ichinomiya","Kasugai","Nagakute"],"Fukuoka":["Fukuoka City","Kitakyushu","Kurume","Omuta","Iizuka","Kasuga","Chikushino"],"Hokkaido":["Sapporo","Hakodate","Asahikawa","Obihiro","Kushiro","Tomakomai","Chitose"],"Hyogo":["Kobe","Himeji","Amagasaki","Nishinomiya","Akashi","Kakogawa","Takarazuka"],"Kyoto":["Kyoto City","Uji","Kameoka","Muko","Nagaokakyo","Joyo","Maizuru"],"Saitama":["Saitama City","Kawaguchi","Kawagoe","Tokorozawa","Kasukabe","Ageo","Yashio"],"Chiba":["Chiba City","Funabashi","Matsudo","Kashiwa","Ichikawa","Urayasu","Narashino"],"Shizuoka":["Shizuoka City","Hamamatsu","Numazu","Fuji","Mishima","Shimizu"],"Hiroshima":["Hiroshima City","Fukuyama","Kure","Onomichi","Higashihiroshima","Hatsukaichi"],"Miyagi":["Sendai","Ishinomaki","Osaki","Natori","Tome","Kesennuma"],"Nara":["Nara City","Kashihara","Ikoma","Yamato-Koriyama","Tenri"],"Nagano":["Nagano City","Matsumoto","Ueda","Iida","Suwa","Chino"],"Niigata":["Niigata City","Nagaoka","Joetsu","Sanjo","Kashiwazaki"],"Okinawa":["Naha","Okinawa City","Uruma","Urasoe","Ginowan"],"Ibaraki":["Mito","Tsukuba","Hitachi","Tsuchiura","Kasama"],"Tochigi":["Utsunomiya","Ashikaga","Oyama","Koga"],"Gunma":["Maebashi","Takasaki","Ota","Kiryu"],"Fukushima":["Fukushima City","Koriyama","Iwaki","Aizuwakamatsu"],"Yamaguchi":["Yamaguchi City","Shimonoseki","Ube","Hofu"],"Kagoshima":["Kagoshima City","Kirishima","Kanoya","Satsuma"],"Kumamoto":["Kumamoto City","Yatsushiro","Amakusa"],"Ehime":["Matsuyama","Imabari","Niihama"],"Iwate":["Morioka","Hanamaki","Kitakami"],"Kagawa":["Takamatsu","Marugame","Sakaide"],"Okayama":["Okayama City","Kurashiki","Tsuyama"],"Tokushima":["Tokushima City","Naruto","Anan"],"Kochi":["Kochi City","Nankoku","Shimanto"],"Shimane":["Matsue","Izumo","Hamada"],"Tottori":["Tottori City","Yonago","Kurayoshi"],"Oita":["Oita City","Beppu","Nakatsu"],"Miyazaki":["Miyazaki City","Miyakonojo","Nobeoka"],"Saga":["Saga City","Karatsu","Tosu"],"Nagasaki":["Nagasaki City","Sasebo","Isahaya"],"Akita":["Akita City","Yokote","Daisen"],"Aomori":["Aomori City","Hachinohe","Hirosaki"],"Yamagata":["Yamagata City","Tsuruoka","Sakata"],"Toyama":["Toyama City","Takaoka","Imizu"],"Ishikawa":["Kanazawa","Hakusan","Komatsu"],"Fukui":["Fukui City","Echizen","Tsuruga"],"Shiga":["Otsu","Hikone","Kusatsu"],"Mie":["Tsu","Yokkaichi","Matsusaka"],"Wakayama":["Wakayama City","Tanabe","Kinokawa"],"Yamanashi":["Kofu","Fujiyoshida","Minami-Alps"],"Gifu":["Gifu City","Ogaki","Takayama"],"Hokkaido Outermost":["Abashiri","Wakkanai","Nemuro","Rumoi"]}}; // ABBREVIATED — full data in production

// ══════════════════════════════════════════════════════════════════
// ALL 195 COUNTRIES
// ══════════════════════════════════════════════════════════════════
const COUNTRIES = [
  {iso:"DZA",name:"Algeria",continent:"Africa"},{iso:"AGO",name:"Angola",continent:"Africa"},
  {iso:"BEN",name:"Benin",continent:"Africa"},{iso:"BWA",name:"Botswana",continent:"Africa"},
  {iso:"BFA",name:"Burkina Faso",continent:"Africa"},{iso:"BDI",name:"Burundi",continent:"Africa"},
  {iso:"CPV",name:"Cape Verde",continent:"Africa"},{iso:"CMR",name:"Cameroon",continent:"Africa"},
  {iso:"CAF",name:"Central African Republic",continent:"Africa"},{iso:"TCD",name:"Chad",continent:"Africa"},
  {iso:"COM",name:"Comoros",continent:"Africa"},{iso:"COD",name:"DR Congo",continent:"Africa"},
  {iso:"COG",name:"Republic of Congo",continent:"Africa"},{iso:"CIV",name:"Ivory Coast",continent:"Africa"},
  {iso:"DJI",name:"Djibouti",continent:"Africa"},{iso:"EGY",name:"Egypt",continent:"Africa"},
  {iso:"GNQ",name:"Equatorial Guinea",continent:"Africa"},{iso:"ERI",name:"Eritrea",continent:"Africa"},
  {iso:"SWZ",name:"Eswatini",continent:"Africa"},{iso:"ETH",name:"Ethiopia",continent:"Africa"},
  {iso:"GAB",name:"Gabon",continent:"Africa"},{iso:"GMB",name:"Gambia",continent:"Africa"},
  {iso:"GHA",name:"Ghana",continent:"Africa"},{iso:"GIN",name:"Guinea",continent:"Africa"},
  {iso:"GNB",name:"Guinea-Bissau",continent:"Africa"},{iso:"KEN",name:"Kenya",continent:"Africa"},
  {iso:"LSO",name:"Lesotho",continent:"Africa"},{iso:"LBR",name:"Liberia",continent:"Africa"},
  {iso:"LBY",name:"Libya",continent:"Africa"},{iso:"MDG",name:"Madagascar",continent:"Africa"},
  {iso:"MWI",name:"Malawi",continent:"Africa"},{iso:"MLI",name:"Mali",continent:"Africa"},
  {iso:"MRT",name:"Mauritania",continent:"Africa"},{iso:"MUS",name:"Mauritius",continent:"Africa"},
  {iso:"MAR",name:"Morocco",continent:"Africa"},{iso:"MOZ",name:"Mozambique",continent:"Africa"},
  {iso:"NAM",name:"Namibia",continent:"Africa"},{iso:"NER",name:"Niger",continent:"Africa"},
  {iso:"NGA",name:"Nigeria",continent:"Africa"},{iso:"RWA",name:"Rwanda",continent:"Africa"},
  {iso:"STP",name:"Sao Tome and Principe",continent:"Africa"},{iso:"SEN",name:"Senegal",continent:"Africa"},
  {iso:"SLE",name:"Sierra Leone",continent:"Africa"},{iso:"SOM",name:"Somalia",continent:"Africa"},
  {iso:"ZAF",name:"South Africa",continent:"Africa"},{iso:"SSD",name:"South Sudan",continent:"Africa"},
  {iso:"SDN",name:"Sudan",continent:"Africa"},{iso:"TZA",name:"Tanzania",continent:"Africa"},
  {iso:"TGO",name:"Togo",continent:"Africa"},{iso:"TUN",name:"Tunisia",continent:"Africa"},
  {iso:"UGA",name:"Uganda",continent:"Africa"},{iso:"ZMB",name:"Zambia",continent:"Africa"},
  {iso:"ZWE",name:"Zimbabwe",continent:"Africa"},
  {iso:"AFG",name:"Afghanistan",continent:"Asia"},{iso:"ARM",name:"Armenia",continent:"Asia"},
  {iso:"AZE",name:"Azerbaijan",continent:"Asia"},{iso:"BHR",name:"Bahrain",continent:"Asia"},
  {iso:"BGD",name:"Bangladesh",continent:"Asia"},{iso:"BTN",name:"Bhutan",continent:"Asia"},
  {iso:"BRN",name:"Brunei",continent:"Asia"},{iso:"KHM",name:"Cambodia",continent:"Asia"},
  {iso:"CHN",name:"China",continent:"Asia"},{iso:"CYP",name:"Cyprus",continent:"Asia"},
  {iso:"GEO",name:"Georgia",continent:"Asia"},{iso:"IND",name:"India",continent:"Asia"},
  {iso:"IDN",name:"Indonesia",continent:"Asia"},{iso:"IRN",name:"Iran",continent:"Asia"},
  {iso:"IRQ",name:"Iraq",continent:"Asia"},{iso:"ISR",name:"Israel",continent:"Asia"},
  {iso:"JPN",name:"Japan",continent:"Asia"},{iso:"JOR",name:"Jordan",continent:"Asia"},
  {iso:"KAZ",name:"Kazakhstan",continent:"Asia"},{iso:"KWT",name:"Kuwait",continent:"Asia"},
  {iso:"KGZ",name:"Kyrgyzstan",continent:"Asia"},{iso:"LAO",name:"Laos",continent:"Asia"},
  {iso:"LBN",name:"Lebanon",continent:"Asia"},{iso:"MYS",name:"Malaysia",continent:"Asia"},
  {iso:"MDV",name:"Maldives",continent:"Asia"},{iso:"MNG",name:"Mongolia",continent:"Asia"},
  {iso:"MMR",name:"Myanmar",continent:"Asia"},{iso:"NPL",name:"Nepal",continent:"Asia"},
  {iso:"PRK",name:"North Korea",continent:"Asia"},{iso:"OMN",name:"Oman",continent:"Asia"},
  {iso:"PAK",name:"Pakistan",continent:"Asia"},{iso:"PSE",name:"Palestine",continent:"Asia"},
  {iso:"PHL",name:"Philippines",continent:"Asia"},{iso:"QAT",name:"Qatar",continent:"Asia"},
  {iso:"SAU",name:"Saudi Arabia",continent:"Asia"},{iso:"SGP",name:"Singapore",continent:"Asia"},
  {iso:"KOR",name:"South Korea",continent:"Asia"},{iso:"LKA",name:"Sri Lanka",continent:"Asia"},
  {iso:"SYR",name:"Syria",continent:"Asia"},{iso:"TWN",name:"Taiwan",continent:"Asia"},
  {iso:"TJK",name:"Tajikistan",continent:"Asia"},{iso:"THA",name:"Thailand",continent:"Asia"},
  {iso:"TLS",name:"Timor-Leste",continent:"Asia"},{iso:"TUR",name:"Turkey",continent:"Asia"},
  {iso:"TKM",name:"Turkmenistan",continent:"Asia"},{iso:"ARE",name:"United Arab Emirates",continent:"Asia"},
  {iso:"UZB",name:"Uzbekistan",continent:"Asia"},{iso:"VNM",name:"Vietnam",continent:"Asia"},
  {iso:"YEM",name:"Yemen",continent:"Asia"},
  {iso:"ALB",name:"Albania",continent:"Europe"},{iso:"AND",name:"Andorra",continent:"Europe"},
  {iso:"AUT",name:"Austria",continent:"Europe"},{iso:"BLR",name:"Belarus",continent:"Europe"},
  {iso:"BEL",name:"Belgium",continent:"Europe"},{iso:"BIH",name:"Bosnia and Herzegovina",continent:"Europe"},
  {iso:"BGR",name:"Bulgaria",continent:"Europe"},{iso:"HRV",name:"Croatia",continent:"Europe"},
  {iso:"CZE",name:"Czech Republic",continent:"Europe"},{iso:"DNK",name:"Denmark",continent:"Europe"},
  {iso:"EST",name:"Estonia",continent:"Europe"},{iso:"FIN",name:"Finland",continent:"Europe"},
  {iso:"FRA",name:"France",continent:"Europe"},{iso:"DEU",name:"Germany",continent:"Europe"},
  {iso:"GRC",name:"Greece",continent:"Europe"},{iso:"HUN",name:"Hungary",continent:"Europe"},
  {iso:"ISL",name:"Iceland",continent:"Europe"},{iso:"IRL",name:"Ireland",continent:"Europe"},
  {iso:"ITA",name:"Italy",continent:"Europe"},{iso:"XKX",name:"Kosovo",continent:"Europe"},
  {iso:"LVA",name:"Latvia",continent:"Europe"},{iso:"LIE",name:"Liechtenstein",continent:"Europe"},
  {iso:"LTU",name:"Lithuania",continent:"Europe"},{iso:"LUX",name:"Luxembourg",continent:"Europe"},
  {iso:"MLT",name:"Malta",continent:"Europe"},{iso:"MDA",name:"Moldova",continent:"Europe"},
  {iso:"MCO",name:"Monaco",continent:"Europe"},{iso:"MNE",name:"Montenegro",continent:"Europe"},
  {iso:"NLD",name:"Netherlands",continent:"Europe"},{iso:"MKD",name:"North Macedonia",continent:"Europe"},
  {iso:"NOR",name:"Norway",continent:"Europe"},{iso:"POL",name:"Poland",continent:"Europe"},
  {iso:"PRT",name:"Portugal",continent:"Europe"},{iso:"ROU",name:"Romania",continent:"Europe"},
  {iso:"RUS",name:"Russia",continent:"Europe"},{iso:"SMR",name:"San Marino",continent:"Europe"},
  {iso:"SRB",name:"Serbia",continent:"Europe"},{iso:"SVK",name:"Slovakia",continent:"Europe"},
  {iso:"SVN",name:"Slovenia",continent:"Europe"},{iso:"ESP",name:"Spain",continent:"Europe"},
  {iso:"SWE",name:"Sweden",continent:"Europe"},{iso:"CHE",name:"Switzerland",continent:"Europe"},
  {iso:"UKR",name:"Ukraine",continent:"Europe"},{iso:"GBR",name:"United Kingdom",continent:"Europe"},
  {iso:"ATG",name:"Antigua and Barbuda",continent:"North America"},
  {iso:"BHS",name:"Bahamas",continent:"North America"},{iso:"BRB",name:"Barbados",continent:"North America"},
  {iso:"BLZ",name:"Belize",continent:"North America"},{iso:"CAN",name:"Canada",continent:"North America"},
  {iso:"CRI",name:"Costa Rica",continent:"North America"},{iso:"CUB",name:"Cuba",continent:"North America"},
  {iso:"DMA",name:"Dominica",continent:"North America"},{iso:"DOM",name:"Dominican Republic",continent:"North America"},
  {iso:"SLV",name:"El Salvador",continent:"North America"},{iso:"GRD",name:"Grenada",continent:"North America"},
  {iso:"GTM",name:"Guatemala",continent:"North America"},{iso:"HTI",name:"Haiti",continent:"North America"},
  {iso:"HND",name:"Honduras",continent:"North America"},{iso:"JAM",name:"Jamaica",continent:"North America"},
  {iso:"MEX",name:"Mexico",continent:"North America"},{iso:"NIC",name:"Nicaragua",continent:"North America"},
  {iso:"PAN",name:"Panama",continent:"North America"},{iso:"KNA",name:"Saint Kitts and Nevis",continent:"North America"},
  {iso:"LCA",name:"Saint Lucia",continent:"North America"},
  {iso:"VCT",name:"Saint Vincent and the Grenadines",continent:"North America"},
  {iso:"TTO",name:"Trinidad and Tobago",continent:"North America"},
  {iso:"USA",name:"United States",continent:"North America"},
  {iso:"ARG",name:"Argentina",continent:"South America"},{iso:"BOL",name:"Bolivia",continent:"South America"},
  {iso:"BRA",name:"Brazil",continent:"South America"},{iso:"CHL",name:"Chile",continent:"South America"},
  {iso:"COL",name:"Colombia",continent:"South America"},{iso:"ECU",name:"Ecuador",continent:"South America"},
  {iso:"GUY",name:"Guyana",continent:"South America"},{iso:"PRY",name:"Paraguay",continent:"South America"},
  {iso:"PER",name:"Peru",continent:"South America"},{iso:"SUR",name:"Suriname",continent:"South America"},
  {iso:"URY",name:"Uruguay",continent:"South America"},{iso:"VEN",name:"Venezuela",continent:"South America"},
  {iso:"AUS",name:"Australia",continent:"Oceania"},{iso:"FJI",name:"Fiji",continent:"Oceania"},
  {iso:"KIR",name:"Kiribati",continent:"Oceania"},{iso:"MHL",name:"Marshall Islands",continent:"Oceania"},
  {iso:"FSM",name:"Micronesia",continent:"Oceania"},{iso:"NRU",name:"Nauru",continent:"Oceania"},
  {iso:"NZL",name:"New Zealand",continent:"Oceania"},{iso:"PLW",name:"Palau",continent:"Oceania"},
  {iso:"PNG",name:"Papua New Guinea",continent:"Oceania"},{iso:"WSM",name:"Samoa",continent:"Oceania"},
  {iso:"SLB",name:"Solomon Islands",continent:"Oceania"},{iso:"TON",name:"Tonga",continent:"Oceania"},
  {iso:"TUV",name:"Tuvalu",continent:"Oceania"},{iso:"VUT",name:"Vanuatu",continent:"Oceania"},
];

const HOT_ISOS = new Set([
  "FRA","USA","GBR","JPN","ITA","ESP","THA","AUS","DEU","CAN",
  "MEX","BRA","ARE","SGP","IND","GRC","PRT","NLD","CHE","NZL"
]);

// ══════════════════════════════════════════════════════════════════
// ISO3 TO ISO2 MAP
// ══════════════════════════════════════════════════════════════════
const ISO3_TO_ISO2 = {
  DZA:"DZ",AGO:"AO",BEN:"BJ",BWA:"BW",BFA:"BF",BDI:"BI",CPV:"CV",CMR:"CM",CAF:"CF",TCD:"TD",COM:"KM",COD:"CD",COG:"CG",CIV:"CI",DJI:"DJ",EGY:"EG",GNQ:"GQ",ERI:"ER",SWZ:"SZ",ETH:"ET",GAB:"GA",GMB:"GM",GHA:"GH",GIN:"GN",GNB:"GW",KEN:"KE",LSO:"LS",LBR:"LR",LBY:"LY",MDG:"MG",MWI:"MW",MLI:"ML",MRT:"MR",MUS:"MU",MAR:"MA",MOZ:"MZ",NAM:"NA",NER:"NE",NGA:"NG",RWA:"RW",STP:"ST",SEN:"SN",SLE:"SL",SOM:"SO",ZAF:"ZA",SSD:"SS",SDN:"SD",TZA:"TZ",TGO:"TG",TUN:"TN",UGA:"UG",ZMB:"ZM",ZWE:"ZW",
  AFG:"AF",ARM:"AM",AZE:"AZ",BHR:"BH",BGD:"BD",BTN:"BT",BRN:"BN",KHM:"KH",CHN:"CN",CYP:"CY",GEO:"GE",IND:"IN",IDN:"ID",IRN:"IR",IRQ:"IQ",ISR:"IL",JPN:"JP",JOR:"JO",KAZ:"KZ",KWT:"KW",KGZ:"KG",LAO:"LA",LBN:"LB",MYS:"MY",MDV:"MV",MNG:"MN",MMR:"MM",NPL:"NP",PRK:"KP",OMN:"OM",PAK:"PK",PSE:"PS",PHL:"PH",QAT:"QA",SAU:"SA",SGP:"SG",KOR:"KR",LKA:"LK",SYR:"SY",TWN:"TW",TJK:"TJ",THA:"TH",TLS:"TL",TUR:"TR",TKM:"TM",ARE:"AE",UZB:"UZ",VNM:"VN",YEM:"YE",
  ALB:"AL",AND:"AD",AUT:"AT",BLR:"BY",BEL:"BE",BIH:"BA",BGR:"BG",HRV:"HR",CZE:"CZ",DNK:"DK",EST:"EE",FIN:"FI",FRA:"FR",DEU:"DE",GRC:"GR",HUN:"HU",ISL:"IS",IRL:"IE",ITA:"IT",XKX:"XK",LVA:"LV",LIE:"LI",LTU:"LT",LUX:"LU",MLT:"MT",MDA:"MD",MCO:"MC",MNE:"ME",NLD:"NL",MKD:"MK",NOR:"NO",POL:"PL",PRT:"PT",ROU:"RO",RUS:"RU",SMR:"SM",SRB:"RS",SVK:"SK",SVN:"SI",ESP:"ES",SWE:"SE",CHE:"CH",UKR:"UA",GBR:"GB",
  ATG:"AG",BHS:"BS",BRB:"BB",BLZ:"BZ",CAN:"CA",CRI:"CR",CUB:"CU",DMA:"DM",DOM:"DO",SLV:"SV",GRD:"GD",GTM:"GT",HTI:"HT",HND:"HN",JAM:"JM",MEX:"MX",NIC:"NI",PAN:"PA",KNA:"KN",LCA:"LC",VCT:"VC",TTO:"TT",USA:"US",
  ARG:"AR",BOL:"BO",BRA:"BR",CHL:"CL",COL:"CO",ECU:"EC",GUY:"GY",PRY:"PY",PER:"PE",SUR:"SR",URY:"UY",VEN:"VE",
  AUS:"AU",FJI:"FJ",KIR:"KI",MHL:"MH",FSM:"FM",NRU:"NR",NZL:"NZ",PLW:"PW",PNG:"PG",WSM:"WS",SLB:"SB",TON:"TO",TUV:"TV",VUT:"VU",
};

// ══════════════════════════════════════════════════════════════════
// CAPITAL COORDINATES
// ══════════════════════════════════════════════════════════════════
const geoCoordCache = {
  DZA:{lat:36.7372,lon:3.0865},AGO:{lat:-8.8368,lon:13.2343},BEN:{lat:6.3654,lon:2.4183},BWA:{lat:-24.6282,lon:25.9231},BFA:{lat:12.3569,lon:-1.5353},BDI:{lat:-3.3869,lon:29.3619},CPV:{lat:14.9315,lon:-23.5087},CMR:{lat:3.8612,lon:11.5217},CAF:{lat:4.3612,lon:18.5550},TCD:{lat:12.1048,lon:15.0445},COM:{lat:-11.7022,lon:43.2551},COD:{lat:-4.3276,lon:15.3215},COG:{lat:-4.2634,lon:15.2429},CIV:{lat:6.8276,lon:-5.2893},DJI:{lat:11.5886,lon:43.1456},EGY:{lat:30.0444,lon:31.2357},GNQ:{lat:3.7523,lon:8.7741},ERI:{lat:15.3229,lon:38.9251},SWZ:{lat:-26.3054,lon:31.1367},ETH:{lat:9.0320,lon:38.7421},GAB:{lat:0.4162,lon:9.4673},GMB:{lat:13.4549,lon:-16.5790},GHA:{lat:5.5502,lon:-0.2174},GIN:{lat:9.5243,lon:-13.6773},GNB:{lat:11.8636,lon:-15.5977},KEN:{lat:-1.2921,lon:36.8219},LSO:{lat:-29.3151,lon:27.4869},LBR:{lat:6.3005,lon:-10.7969},LBY:{lat:32.9021,lon:13.1806},MDG:{lat:-18.9137,lon:47.5361},MWI:{lat:-13.9669,lon:33.7873},MLI:{lat:12.6392,lon:-8.0029},MRT:{lat:18.0735,lon:-15.9582},MUS:{lat:-20.1654,lon:57.4896},MAR:{lat:33.9716,lon:-6.8498},MOZ:{lat:-25.9692,lon:32.5732},NAM:{lat:-22.5609,lon:17.0658},NER:{lat:13.5116,lon:2.1254},NGA:{lat:9.0765,lon:7.3986},RWA:{lat:-1.9441,lon:30.0619},STP:{lat:0.3365,lon:6.7273},SEN:{lat:14.6928,lon:-17.4467},SLE:{lat:8.4897,lon:-13.2344},SOM:{lat:2.0469,lon:45.3182},ZAF:{lat:-25.7479,lon:28.2293},SSD:{lat:4.8517,lon:31.5825},SDN:{lat:15.5007,lon:32.5599},TZA:{lat:-6.1722,lon:35.7395},TGO:{lat:6.1375,lon:1.2123},TUN:{lat:36.8190,lon:10.1658},UGA:{lat:0.3476,lon:32.5825},ZMB:{lat:-15.4166,lon:28.2833},ZWE:{lat:-17.8252,lon:31.0335},
  AFG:{lat:34.5553,lon:69.2075},ARM:{lat:40.1872,lon:44.5152},AZE:{lat:40.4093,lon:49.8671},BHR:{lat:26.2154,lon:50.5860},BGD:{lat:23.8103,lon:90.4125},BTN:{lat:27.4728,lon:89.6390},BRN:{lat:4.9031,lon:114.9398},KHM:{lat:11.5626,lon:104.9282},CHN:{lat:39.9042,lon:116.4074},CYP:{lat:35.1856,lon:33.3823},GEO:{lat:41.6938,lon:44.8015},IND:{lat:28.6139,lon:77.2090},IDN:{lat:-6.2088,lon:106.8456},IRN:{lat:35.6892,lon:51.3890},IRQ:{lat:33.3406,lon:44.4009},ISR:{lat:31.7683,lon:35.2137},JPN:{lat:35.6762,lon:139.6503},JOR:{lat:31.9566,lon:35.9457},KAZ:{lat:51.1811,lon:71.4460},KWT:{lat:29.3759,lon:47.9774},KGZ:{lat:42.8746,lon:74.5698},LAO:{lat:17.9757,lon:102.6331},LBN:{lat:33.8938,lon:35.5018},MYS:{lat:3.1390,lon:101.6869},MDV:{lat:4.1755,lon:73.5093},MNG:{lat:47.9077,lon:106.8832},MMR:{lat:19.7633,lon:96.0785},NPL:{lat:27.7172,lon:85.3240},PRK:{lat:39.0392,lon:125.7625},OMN:{lat:23.5880,lon:58.3829},PAK:{lat:33.7294,lon:73.0931},PSE:{lat:31.9522,lon:35.2332},PHL:{lat:14.5995,lon:120.9842},QAT:{lat:25.2854,lon:51.5310},SAU:{lat:24.6877,lon:46.7219},SGP:{lat:1.3521,lon:103.8198},KOR:{lat:37.5665,lon:126.9780},LKA:{lat:6.9271,lon:79.8612},SYR:{lat:33.5102,lon:36.2913},TWN:{lat:25.0330,lon:121.5654},TJK:{lat:38.5598,lon:68.7733},THA:{lat:13.7563,lon:100.5018},TLS:{lat:-8.5569,lon:125.5789},TUR:{lat:39.9334,lon:32.8597},TKM:{lat:37.9601,lon:58.3261},ARE:{lat:24.4539,lon:54.3773},UZB:{lat:41.2995,lon:69.2401},VNM:{lat:21.0285,lon:105.8542},YEM:{lat:15.3694,lon:44.1910},
  ALB:{lat:41.3275,lon:19.8187},AND:{lat:42.5063,lon:1.5218},AUT:{lat:48.2082,lon:16.3738},BLR:{lat:53.9045,lon:27.5615},BEL:{lat:50.8503,lon:4.3517},BIH:{lat:43.8486,lon:18.3564},BGR:{lat:42.6977,lon:23.3219},HRV:{lat:45.8150,lon:15.9819},CZE:{lat:50.0755,lon:14.4378},DNK:{lat:55.6761,lon:12.5683},EST:{lat:59.4370,lon:24.7536},FIN:{lat:60.1699,lon:24.9384},FRA:{lat:48.8566,lon:2.3522},DEU:{lat:52.5200,lon:13.4050},GRC:{lat:37.9838,lon:23.7275},HUN:{lat:47.4979,lon:19.0402},ISL:{lat:64.1266,lon:-21.8174},IRL:{lat:53.3498,lon:-6.2603},ITA:{lat:41.9028,lon:12.4964},XKX:{lat:42.6629,lon:21.1655},LVA:{lat:56.9460,lon:24.1059},LIE:{lat:47.1410,lon:9.5215},LTU:{lat:54.6872,lon:25.2797},LUX:{lat:49.6117,lon:6.1319},MLT:{lat:35.8997,lon:14.5147},MDA:{lat:47.0105,lon:28.8638},MCO:{lat:43.7384,lon:7.4246},MNE:{lat:42.4304,lon:19.2594},NLD:{lat:52.3676,lon:4.9041},MKD:{lat:41.9965,lon:21.4314},NOR:{lat:59.9139,lon:10.7522},POL:{lat:52.2297,lon:21.0122},PRT:{lat:38.7169,lon:-9.1395},ROU:{lat:44.4268,lon:26.1025},RUS:{lat:55.7558,lon:37.6173},SMR:{lat:43.9424,lon:12.4578},SRB:{lat:44.8176,lon:20.4633},SVK:{lat:48.1486,lon:17.1077},SVN:{lat:46.0569,lon:14.5058},ESP:{lat:40.4168,lon:-3.7038},SWE:{lat:59.3293,lon:18.0686},CHE:{lat:46.9480,lon:7.4474},UKR:{lat:50.4501,lon:30.5234},GBR:{lat:51.5074,lon:-0.1278},
  ATG:{lat:17.1274,lon:-61.8468},BHS:{lat:25.0480,lon:-77.3554},BRB:{lat:13.0969,lon:-59.6145},BLZ:{lat:17.2510,lon:-88.7590},CAN:{lat:45.4215,lon:-75.6972},CRI:{lat:9.9281,lon:-84.0907},CUB:{lat:23.1136,lon:-82.3666},DMA:{lat:15.3092,lon:-61.3794},DOM:{lat:18.4861,lon:-69.9312},SLV:{lat:13.6929,lon:-89.2182},GRD:{lat:12.0561,lon:-61.7488},GTM:{lat:14.6349,lon:-90.5069},HTI:{lat:18.5392,lon:-72.3350},HND:{lat:14.0818,lon:-87.2068},JAM:{lat:17.9970,lon:-76.7936},MEX:{lat:19.4326,lon:-99.1332},NIC:{lat:12.1328,lon:-86.2926},PAN:{lat:8.9936,lon:-79.5197},KNA:{lat:17.3026,lon:-62.7177},LCA:{lat:14.0101,lon:-60.9875},VCT:{lat:13.1600,lon:-61.2248},TTO:{lat:10.6549,lon:-61.5019},USA:{lat:38.8951,lon:-77.0364},
  ARG:{lat:-34.6037,lon:-58.3816},BOL:{lat:-16.5000,lon:-68.1500},BRA:{lat:-15.7975,lon:-47.8919},CHL:{lat:-33.4489,lon:-70.6693},COL:{lat:4.7110,lon:-74.0721},ECU:{lat:-0.2295,lon:-78.5243},GUY:{lat:6.8013,lon:-58.1553},PRY:{lat:-25.2867,lon:-57.6470},PER:{lat:-12.0464,lon:-77.0428},SUR:{lat:5.8520,lon:-55.2038},URY:{lat:-34.9011,lon:-56.1915},VEN:{lat:10.4806,lon:-66.9036},
  AUS:{lat:-35.2809,lon:149.1300},FJI:{lat:-18.1416,lon:178.4415},KIR:{lat:1.3290,lon:172.9790},MHL:{lat:7.1095,lon:171.3803},FSM:{lat:6.9248,lon:158.1618},NRU:{lat:-0.5477,lon:166.9209},NZL:{lat:-41.2865,lon:174.7762},PLW:{lat:7.5000,lon:134.6240},PNG:{lat:-9.4438,lon:147.1803},WSM:{lat:-13.8314,lon:-172.1345},SLB:{lat:-9.4456,lon:160.0432},TON:{lat:-21.1393,lon:-175.2049},TUV:{lat:-8.5200,lon:179.1980},VUT:{lat:-17.7333,lon:168.3210},
};

// ══════════════════════════════════════════════════════════════════
// SOURCE HEALTH TRACKING
// ══════════════════════════════════════════════════════════════════
const sourceHealth = {};
function recordHealth(source, ok, ms, err) {
  sourceHealth[source] = {
    ok, last_check: new Date().toISOString(),
    response_ms: ms, error: err||null,
    success_count: (sourceHealth[source]?.success_count||0)+(ok?1:0),
    fail_count:    (sourceHealth[source]?.fail_count||0)+(ok?0:1),
  };
}
async function timed(source, fn) {
  const t = Date.now();
  try { const r = await fn(); recordHealth(source,true,Date.now()-t,null); return r; }
  catch(e) { recordHealth(source,false,Date.now()-t,e.message); throw e; }
}

function getHardcodedAreas(stateName, countryName) {
  const countryData = HARDCODED_GEO[countryName];
  if (countryData) {
    if (countryData[stateName]) return countryData[stateName];
    const stateKey = Object.keys(countryData).find(k =>
      k.toLowerCase().includes(stateName.toLowerCase()) ||
      stateName.toLowerCase().includes(k.toLowerCase())
    );
    if (stateKey) return countryData[stateKey];
  }
  const countryKey = Object.keys(HARDCODED_GEO).find(k =>
    k.toLowerCase().includes(countryName.toLowerCase()) ||
    countryName.toLowerCase().includes(k.toLowerCase())
  );
  if (countryKey) {
    const cd = HARDCODED_GEO[countryKey];
    if (cd[stateName]) return cd[stateName];
    const sk = Object.keys(cd).find(k =>
      k.toLowerCase().includes(stateName.toLowerCase()) ||
      stateName.toLowerCase().includes(k.toLowerCase())
    );
    if (sk) return cd[sk];
  }
  return [];
}

function getHardcodedStates(countryName) {
  const countryData = HARDCODED_GEO[countryName];
  if (countryData) return Object.keys(countryData);
  const countryKey = Object.keys(HARDCODED_GEO).find(k =>
    k.toLowerCase().includes(countryName.toLowerCase()) ||
    countryName.toLowerCase().includes(k.toLowerCase())
  );
  if (countryKey) return Object.keys(HARDCODED_GEO[countryKey]);
  return [];
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { const chr = str.charCodeAt(i); hash = ((hash << 5) - hash) + chr; hash |= 0; }
  return hash;
}

const BAD_CITY_WORDS = new Set(['list','unknown','n/a','null','undefined','none','other','various','multiple','city','town','village','district','region','area','state','province','territory','country']);
function isValidCityName(name, stateName, countryName) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return false;
  if (BAD_CITY_WORDS.has(trimmed.toLowerCase())) return false;
  if (stateName && trimmed.toLowerCase() === stateName.toLowerCase()) return false;
  if (countryName && trimmed.toLowerCase() === countryName.toLowerCase()) return false;
  if ((trimmed.match(/,/g)||[]).length >= 2) return false;
  if (!/[a-zA-Z]/.test(trimmed)) return false;
  return true;
}


// ══════════════════════════════════════════════════════════════════
// MISTRAL QUEUE (with 401 fast-fail)
// ══════════════════════════════════════════════════════════════════
const mistralQueue = {
  _lastCallAt: 0,
  _min_gap_ms: 6000,
  _backoff_ms: 0,
  _consecutive429s: 0,

  async call(fn) {
    if (!mistralAvailable()) {
      const err = new Error("Mistral API key invalid or missing");
      err.isFatal = true;
      err.isKeyError = true;
      throw err;
    }
    const now = Date.now();
    const gap = this._min_gap_ms + this._backoff_ms;
    const wait = Math.max(0, gap - (now - this._lastCallAt));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this._lastCallAt = Date.now();
    try {
      const result = await fn();
      if (this._consecutive429s > 0) {
        this._consecutive429s = 0;
        this._backoff_ms = 0;
        console.log("[MistralQueue] 429 backoff cleared");
      }
      return result;
    } catch(e) {
      if (e.response?.status === 401) {
        markMistral401();
        const fatal = new Error("Mistral 401 Unauthorized");
        fatal.isFatal = true;
        fatal.isKeyError = true;
        throw fatal;
      }
      if (e.response?.status === 429) {
        this._consecutive429s++;
        this._backoff_ms = Math.min(120000, 10000 * Math.pow(2, this._consecutive429s - 1));
        console.log(`[MistralQueue] 429 — backing off ${this._backoff_ms/1000}s`);
      }
      throw e;
    }
  }
};

function repairJson(text) {
  const s = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(s); } catch(e) {}
  let depth = 0; let lastGood = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { depth--; if (depth === 0) lastGood = i + 1; }
  }
  const candidates = [
    s.slice(0, lastGood),
    s + "}".repeat(Math.max(0, depth)),
    s.replace(/,\s*$/, "") + "}".repeat(Math.max(0, depth)),
  ];
  for (const c of candidates) {
    try { return JSON.parse(c); } catch(e) {} }
  const m = s.match(/^\s*\{[\s\S]+/);
  if (m) {
    let d = 0; let end = 0;
    for (let i = 0; i < m[0].length; i++) {
      if (m[0][i] === "{") d++;
      else if (m[0][i] === "}") { d--; if (d === 0) { end = i + 1; break; } }
    }
    if (end > 0) { try { return JSON.parse(m[0].slice(0, end)); } catch(e) {} }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════
// SERVER STATUS
// ══════════════════════════════════════════════════════════════════
const SELF       = process.env.RENDER_EXTERNAL_URL || "https://globevoyage-admin.onrender.com";
const serverBoot = new Date().toISOString();
let   pingCount  = 0;
let   lastPingAt = null;
let   pipelineStatus = { running:false, lastRunAt:null, lastRunName:null, nextRuns:["06:00 UTC","14:00 UTC","22:00 UTC"], countriesLastRun:0 };

setInterval(() => {
  const mod = SELF.startsWith("https") ? https : http;
  mod.get(SELF+"/", r=>r.resume()).on("error",()=>{});
  pingCount++;
  lastPingAt = new Date().toISOString();
}, 5000);

const WIKI_UA = "GlobeVoyage/2.0 (travel-intelligence-app; nodejs-axios)";

// ══════════════════════════════════════════════════════════════════
// API FETCHERS (unchanged from original)
// ══════════════════════════════════════════════════════════════════
async function fetchWikipedia(countryName) {
  return timed("wikipedia", async () => {
    const headers = { "User-Agent": WIKI_UA };
    const s = await axios.get("https://en.wikipedia.org/w/api.php", {
      params:{ action:"query",format:"json",list:"search",srsearch:`${countryName} tourism`,srlimit:1 },
      headers, timeout:8000
    });
    const title = s.data?.query?.search?.[0]?.title || countryName;
    const c = await axios.get("https://en.wikipedia.org/w/api.php", {
      params:{ action:"query",format:"json",prop:"extracts",exintro:true,explaintext:true,titles:title },
      headers, timeout:8000
    });
    const page = Object.values(c.data?.query?.pages||{})[0];
    return { summary:(page?.extract||"").slice(0,1500), title };
  });
}

async function fetchWikivoyage(countryName) {
  return timed("wikivoyage", async () => {
    const headers = { "User-Agent": WIKI_UA };
    const r = await axios.get("https://en.wikivoyage.org/w/api.php", {
      params:{ action:"query",format:"json",prop:"extracts",explaintext:true,titles:countryName },
      headers, timeout:8000
    });
    const page = Object.values(r.data?.query?.pages||{})[0];
    const text = page?.extract||"";
    const sections = {};
    ["See","Do","Eat","Drink","Sleep","Stay safe","Get in","Get around"].forEach(sec => {
      const m = text.match(new RegExp(`==\\s*${sec}\\s*==([\\s\\S]*?)(?====|$)`,"i"));
      if(m) sections[sec] = m[1].trim().slice(0,600);
    });
    const highlights = (text.match(/^\*\s+(.+)$/gm)||[]).slice(0,10).map(l=>l.replace(/^\*\s+/,""));
    return { sections, highlights, full:text.slice(0,2000) };
  });
}

async function fetchFoursquare(countryName, iso) {
  return timed("foursquare", async () => {
    const coords = geoCoordCache[iso] || geoCoordCache["FRA"];
    const { lat, lon } = coords;
    const r = await axios.get("https://api.opentripmap.com/0.1/en/places/radius", {
      params: { radius:100000, lon, lat, kinds:"interesting_places,tourist_facilities,cultural,historic", rate:"3", format:"json", limit:10, apikey:"5ae2e3f221c38a28845f05b681b7e8e0898a39f3f1d2a7c3b24d7c12" },
      timeout: 8000
    });
    return (r.data||[]).slice(0,8).map(p => ({
      name: p.name || p.wikipedia_extracts?.title || "Attraction",
      fsq_id: p.xid, lat: p.point?.lat, lng: p.point?.lon,
      address: countryName, categories: [p.kinds?.split(",")[0]?.replace(/_/g," ") || "attraction"],
    })).filter(p => p.name && p.name !== "Attraction");
  });
}

async function fetchWeather(countryName) {
  if(!ENV.OPENWEATHER_API_KEY) return {now:null,forecast:[]};
  return timed("openweathermap", async () => {
    const [nR,fR] = await Promise.all([
      axios.get("https://api.openweathermap.org/data/2.5/weather",{params:{q:countryName,appid:ENV.OPENWEATHER_API_KEY,units:"metric"},timeout:6000}),
      axios.get("https://api.openweathermap.org/data/2.5/forecast",{params:{q:countryName,appid:ENV.OPENWEATHER_API_KEY,units:"metric",cnt:5},timeout:6000}),
    ]);
    const n=nR.data;
    return {
      now:{ temp:Math.round(n.main.temp),feels_like:Math.round(n.main.feels_like),condition:n.weather[0].description,icon:n.weather[0].icon,humidity:n.main.humidity,wind:Math.round(n.wind.speed*3.6) },
      forecast:(fR.data?.list||[]).slice(0,5).map(f=>({date:f.dt_txt.split(" ")[0],high:Math.round(f.main.temp_max),low:Math.round(f.main.temp_min),condition:f.weather[0].description,icon:f.weather[0].icon}))
    };
  });
}

async function fetchWeatherByCoords(lat, lon) {
  if(!ENV.OPENWEATHER_API_KEY) return {now:null,forecast:[]};
  return timed("openweathermap", async () => {
    const [nR,fR] = await Promise.all([
      axios.get("https://api.openweathermap.org/data/2.5/weather",{params:{lat,lon,appid:ENV.OPENWEATHER_API_KEY,units:"metric"},timeout:6000}),
      axios.get("https://api.openweathermap.org/data/2.5/forecast",{params:{lat,lon,appid:ENV.OPENWEATHER_API_KEY,units:"metric",cnt:5},timeout:6000}),
    ]);
    const n=nR.data;
    return {
      now:{ temp:Math.round(n.main.temp),feels_like:Math.round(n.main.feels_like),condition:n.weather[0].description,icon:n.weather[0].icon,humidity:n.main.humidity,wind:Math.round(n.wind.speed*3.6) },
      forecast:(fR.data?.list||[]).slice(0,5).map(f=>({date:f.dt_txt.split(" ")[0],high:Math.round(f.main.temp_max),low:Math.round(f.main.temp_min),condition:f.weather[0].description}))
    };
  });
}

async function fetchPlacesByCoords(lat, lon) {
  return timed("foursquare", async () => {
    const r = await axios.get("https://api.opentripmap.com/0.1/en/places/radius", {
      params:{ radius:50000, lon, lat, kinds:"interesting_places,tourist_facilities,cultural,historic", rate:"3", format:"json", limit:10, apikey:"5ae2e3f221c38a28845f05b681b7e8e0898a39f3f1d2a7c3b24d7c12" },
      timeout:8000
    });
    return (r.data||[]).slice(0,8).map(p=>({ name:p.name||"Attraction", categories:[p.kinds?.split(",")[0]?.replace(/_/g," ")||"attraction"], lat:p.point?.lat, lng:p.point?.lon })).filter(p=>p.name!=="Attraction");
  });
}

async function fetchGoogleNewsByQuery(query, iso2) {
  try {
    const q = encodeURIComponent(query);
    const gl  = (iso2 || 'US').toLowerCase();
    const ceid = `${gl.toUpperCase()}:en`;
    const r = await axios.get(`https://news.google.com/rss/search?q=${q}&hl=en&gl=${gl}&ceid=${ceid}`,{timeout:8000,headers:{"User-Agent":"GlobeVoyage/2.0"}});
    const parsed = await xml2js.parseStringPromise(r.data,{explicitArray:false});
    const items = parsed?.rss?.channel?.item||[];
    const arr = Array.isArray(items)?items:[items];
    return arr.filter(i=>i&&i.title).slice(0,8).map(i=>({
      title:typeof i.title==="object"?(i.title._||""):(i.title||""),
      url:i.link||"", source:i.source?._||"Google News",
      published_at:i.pubDate, risk_level:riskScore(typeof i.title==="object"?i.title._:(i.title||""))
    }));
  } catch(e) { return []; }
}

async function fetchWAQIByCoords(lat, lon, name) {
  try {
    const r = await axios.get(`https://api.waqi.info/feed/geo:${lat};${lon}/?token=demo`,{timeout:6000});
    if(r.data?.data && r.data.data!=="Unknown station" && r.data.data?.status!=="error") {
      const d=r.data.data;
      return { aqi:d.aqi, aqi_label:aqiLabel(d.aqi), city:d.city?.name||name, pm25:d.iaqi?.pm25?.v||null, pm10:d.iaqi?.pm10?.v||null, o3:d.iaqi?.o3?.v||null, no2:d.iaqi?.no2?.v||null, source:"WAQI" };
    }
  } catch(e) {}
  return null;
}

let _lastGeocodeAt = 0;
async function geocodePlace(placeName, countryName) {
  const now = Date.now();
  const wait = Math.max(0, 1200 - (now - _lastGeocodeAt));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastGeocodeAt = Date.now();
  try {
    const r = await axios.get("https://nominatim.openstreetmap.org/search", {
      params:{ q:`${placeName}, ${countryName}`, format:"json", limit:1, addressdetails:1 },
      headers:{ "User-Agent": WIKI_UA },
      timeout:8000
    });
    if(r.data?.[0]) return { lat:parseFloat(r.data[0].lat), lon:parseFloat(r.data[0].lon) };
  } catch(e) {
    if (ENV.GEOAPIFY_API_KEY && (e.response?.status === 429 || e.code === 'ECONNABORTED')) {
      try {
        await new Promise(r => setTimeout(r, 500));
        const gr = await axios.get("https://api.geoapify.com/v1/geocode/search", {
          params: { text:`${placeName}, ${countryName}`, apiKey:ENV.GEOAPIFY_API_KEY, limit:1 },
          timeout: 8000
        });
        const feat = gr.data?.features?.[0];
        if (feat) return { lat: feat.geometry.coordinates[1], lon: feat.geometry.coordinates[0] };
      } catch(ge) {}
    }
  }
  return null;
}

function riskScore(text){
  const t=(text||"").toLowerCase();
  if(/strike|protest|riot|attack|terror|quake|flood|hurricane|tsunami|evacuation|emergency|coup/.test(t)) return "high";
  if(/delay|cancel|warning|alert|caution|unrest|closure/.test(t)) return "medium";
  return "low";
}

const gnewsCache = {};
let gnewsCallsToday = 0;
let gnewsResetAt    = Date.now() + 24*60*60*1000;
const GNEWS_DAILY_CAP = 8;
function gnewsResetIfNeeded() { if(Date.now() > gnewsResetAt) { gnewsCallsToday = 0; gnewsResetAt = Date.now() + 24*60*60*1000; } }
function gnewsBudgetAvailable() { gnewsResetIfNeeded(); return gnewsCallsToday < GNEWS_DAILY_CAP; }

const ALPHA2 = {
  DZA:"dz",EGY:"eg",GHA:"gh",KEN:"ke",MAR:"ma",NGA:"ng",ZAF:"za",TUN:"tn",ETH:"et",TZA:"tz",UGA:"ug",CMR:"cm",SEN:"sn",CIV:"ci",AGO:"ao",SDN:"sd",
  CHN:"cn",IND:"in",IDN:"id",JPN:"jp",KOR:"kr",MYS:"my",PAK:"pk",PHL:"ph",SAU:"sa",SGP:"sg",LKA:"lk",THA:"th",TUR:"tr",ARE:"ae",VNM:"vn",BGD:"bd",IRN:"ir",IRQ:"iq",ISR:"il",JOR:"jo",KWT:"kw",LBN:"lb",QAT:"qa",SYR:"sy",
  AUT:"at",BEL:"be",BGR:"bg",HRV:"hr",CZE:"cz",DNK:"dk",FIN:"fi",FRA:"fr",DEU:"de",GRC:"gr",HUN:"hu",IRL:"ie",ITA:"it",NLD:"nl",NOR:"no",POL:"pl",PRT:"pt",ROU:"ro",RUS:"ru",SRB:"rs",SVK:"sk",ESP:"es",SWE:"se",CHE:"ch",UKR:"ua",GBR:"gb",BLR:"by",AZE:"az",GEO:"ge",ARM:"am",
  CAN:"ca",MEX:"mx",USA:"us",CUB:"cu",DOM:"do",GTM:"gt",HND:"hn",CRI:"cr",ARG:"ar",BRA:"br",CHL:"cl",COL:"co",PER:"pe",VEN:"ve",ECU:"ec",BOL:"bo",AUS:"au",NZL:"nz",
};

async function fetchNews(countryName, iso) {
  if(!ENV.GNEWS_API_KEY) return [];
  const cached = gnewsCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  if(!gnewsBudgetAvailable()) { return cached ? cached.data : []; }
  const country2 = ALPHA2[iso] || null;
  if(!country2) return [];
  return timed("newsapi", async () => {
    const r = await axios.get("https://gnews.io/api/v4/top-headlines", {
      params: { country: country2, lang:"en", max:5, token: ENV.GNEWS_API_KEY }, timeout: 8000
    });
    gnewsCallsToday++;
    const data = (r.data?.articles||[]).slice(0,5).map(a => ({
      title:a.title, url:a.url, source:a.source?.name, published_at:a.publishedAt,
      description:(a.description||"").slice(0,200), risk_level:riskScore(a.title+" "+(a.description||"")),
    }));
    gnewsCache[iso] = { data, expires: Date.now()+6*60*60*1000 };
    return data;
  });
}

async function fetchGoogleNews(countryName) {
  return timed("google_news", async () => {
    const q = encodeURIComponent(`${countryName} travel`);
    const r = await axios.get(`https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`,{timeout:8000,headers:{"User-Agent":"GlobeVoyage/2.0"}});
    const parsed = await xml2js.parseStringPromise(r.data,{explicitArray:false});
    const items = parsed?.rss?.channel?.item||[];
    const arr = Array.isArray(items)?items:[items];
    return arr.filter(i=>i&&i.title).slice(0,8).map(i=>({title:i.title,url:i.link,source:i.source?._||"Google News",published_at:i.pubDate,risk_level:riskScore(i.title||"")}));
  });
}

async function fetchGDACS(countryName) {
  return timed("gdacs", async () => {
    const r = await axios.get("https://www.gdacs.org/xml/rss.xml",{timeout:10000,headers:{"User-Agent":"GlobeVoyage/2.0"}});
    const parsed = await xml2js.parseStringPromise(r.data,{explicitArray:false});
    const items = parsed?.rss?.channel?.item||[];
    const arr = Array.isArray(items)?items:[items];
    const cn = countryName.toLowerCase();
    return arr.filter(i=>(i.title||"").toLowerCase().includes(cn)||(i.description||"").toLowerCase().includes(cn))
      .slice(0,4).map(i=>({event_type:i["gdacs:eventtype"]||"Disaster",severity:i["gdacs:alertlevel"]||"Unknown",description:i.title,date:i.pubDate,url:i.link}));
  });
}

async function fetchTicketmaster(countryName, iso) {
  if(!ENV.TICKETMASTER_API_KEY) return [];
  return timed("ticketmaster", async () => {
    const r = await axios.get("https://app.ticketmaster.com/discovery/v2/events.json",{
      params:{apikey:ENV.TICKETMASTER_API_KEY,keyword:countryName,countryCode:iso?.slice(0,2)||"",size:8,sort:"date,asc",startDateTime:new Date().toISOString().split(".")[0]+"Z"},
      timeout:8000
    });
    return (r.data?._embedded?.events||[]).slice(0,8).map(e=>({name:e.name,date:e.dates?.start?.localDate,venue:e._embedded?.venues?.[0]?.name,city:e._embedded?.venues?.[0]?.city?.name,type:e.classifications?.[0]?.segment?.name,url:e.url,source:"Ticketmaster",price:e.priceRanges?.[0]?`${e.priceRanges[0].currency} ${Math.round(e.priceRanges[0].min)}-${Math.round(e.priceRanges[0].max)}`:null}));
  });
}

async function fetchEventbrite(countryName) {
  return timed("eventbrite", async () => {
    const results = [];
    try {
      const q = encodeURIComponent(`${countryName} events festival concert`);
      const r = await axios.get(`https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`,{timeout:5000,headers:{"User-Agent":"GlobeVoyage/2.0"}});
      const parsed = await xml2js.parseStringPromise(r.data,{explicitArray:false});
      const items = parsed?.rss?.channel?.item||[];
      const arr = Array.isArray(items)?items:[items];
      arr.filter(i=>i&&i.title).slice(0,6).forEach(i=>{ results.push({ name:typeof i.title==="object"?i.title._:i.title, date:i.pubDate?new Date(i.pubDate).toISOString().split("T")[0]:null, url:i.link||"", source:"Google News Events" }); });
    } catch(e) {}
    if(results.length===0) throw new Error("No event sources returned data");
    return results.slice(0,8);
  });
}

async function fetchPredictHQ(countryName) {
  if(!ENV.PREDICTHQ_API_KEY) return [];
  return timed("predicthq", async () => {
    const r = await axios.get("https://api.predicthq.com/v1/events/",{
      params:{country:countryName,active_from:new Date().toISOString().split("T")[0],limit:8,sort:"rank","category[]":"concerts,festivals,performing-arts,sports,public-holidays"},
      headers:{Authorization:`Bearer ${ENV.PREDICTHQ_API_KEY}`},timeout:8000
    });
    return (r.data?.results||[]).slice(0,8).map(e=>({name:e.title,date:e.start,type:e.category,description:(e.description||"").slice(0,200),rank:e.rank,source:"PredictHQ"}));
  });
}

async function fetchGeoapify(countryName, iso) {
  if(!ENV.GEOAPIFY_API_KEY) return {};
  return timed("geoapify", async () => {
    const g = await axios.get("https://api.geoapify.com/v1/geocode/search",{params:{text:countryName,type:"country",apiKey:ENV.GEOAPIFY_API_KEY,limit:1},timeout:6000});
    const place = g.data?.features?.[0];
    if(!place) return {};
    const {lat,lon} = place.properties;
    if(iso) geoCoordCache[iso] = {lat, lon};
    const p = await axios.get("https://api.geoapify.com/v2/places",{params:{categories:"tourism,entertainment",filter:`circle:${lon},${lat},50000`,limit:8,apiKey:ENV.GEOAPIFY_API_KEY},timeout:8000});
    return {
      capital_coords:{lat,lon},
      pois:(p.data?.features||[]).slice(0,8).map(f=>({name:f.properties.name,category:f.properties.categories?.[0],address:f.properties.formatted,lat:f.properties.lat,lon:f.properties.lon}))
    };
  });
}

async function fetchSocialTrends(countryName) {
  return timed("social_proxy", async () => {
    const results = [];
    try {
      const q = encodeURIComponent(`${countryName} travel trending`);
      const r = await axios.get(`https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`,{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}});
      const parsed = await xml2js.parseStringPromise(r.data,{explicitArray:false});
      const items = parsed?.rss?.channel?.item||[];
      const arr = Array.isArray(items)?items:[items];
      arr.filter(i=>i&&i.title).slice(0,4).forEach(i=>{ results.push({ platform:"Google News", caption:typeof i.title==="object"?i.title._:i.title, url:i.link||"", sentiment:"neutral" }); });
    } catch(e){}
    try {
      const bq = encodeURIComponent(`${countryName} tourism`);
      const br = await axios.get(`https://www.bing.com/news/search?q=${bq}&format=RSS`,{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}});
      const parsed2 = await xml2js.parseStringPromise(br.data,{explicitArray:false});
      const items2 = parsed2?.rss?.channel?.item||[];
      const arr2 = Array.isArray(items2)?items2:[items2];
      arr2.filter(i=>i&&i.title).slice(0,3).forEach(i=>{ results.push({ platform:"Bing News", caption:typeof i.title==="object"?i.title._:i.title, url:i.link||"", sentiment:"neutral" }); });
    } catch(e){}
    return results.slice(0,6);
  });
}

async function fetchUnsplash(countryName) {
  if(!ENV.UNSPLASH_ACCESS_KEY) return [];
  return timed("unsplash", async () => {
    const r = await axios.get("https://api.unsplash.com/search/photos", {
      params:{ query:`${countryName} travel landscape`, per_page:9, order_by:"relevant", orientation:"landscape" },
      headers:{ Authorization:`Client-ID ${ENV.UNSPLASH_ACCESS_KEY}` }, timeout: 8000,
    });
    return (r.data?.results||[]).map(p => ({
      id:p.id, url_small:p.urls?.small, url_regular:p.urls?.regular, url_full:p.urls?.full,
      alt:p.alt_description||p.description||countryName, credit:p.user?.name||"",
      credit_link:p.user?.links?.html||"", color:p.color||"#000", width:p.width, height:p.height,
    }));
  });
}

function calcAQI(pm25) {
  const bp = [[0,12,0,50],[12.1,35.4,51,100],[35.5,55.4,101,150],[55.5,150.4,151,200],[150.5,250.4,201,300],[250.5,500.4,301,500]];
  for(const [cLow,cHigh,iLow,iHigh] of bp) {
    if(pm25 >= cLow && pm25 <= cHigh) return Math.round(((iHigh-iLow)/(cHigh-cLow))*(pm25-cLow)+iLow);
  }
  return null;
}
function aqiLabel(aqi) {
  if(aqi<=50) return "Good";
  if(aqi<=100) return "Moderate";
  if(aqi<=150) return "Unhealthy for Sensitive Groups";
  if(aqi<=200) return "Unhealthy";
  if(aqi<=300) return "Very Unhealthy";
  return "Hazardous";
}

async function fetchAirQuality(countryName, iso) {
  return timed("openaq", async () => {
    const ALPHA2_AQ = { DZA:"DZ",EGY:"EG",GHA:"GH",KEN:"KE",MAR:"MA",NGA:"NG",ZAF:"ZA",TUN:"TN",ETH:"ET",TZA:"TZ",UGA:"UG",CMR:"CM",SEN:"SN",CIV:"CI",AGO:"AO",SDN:"SD",CHN:"CN",IND:"IN",IDN:"ID",JPN:"JP",KOR:"KR",MYS:"MY",PAK:"PK",PHL:"PH",SAU:"SA",SGP:"SG",LKA:"LK",THA:"TH",TUR:"TR",ARE:"AE",VNM:"VN",BGD:"BD",IRN:"IR",IRQ:"IQ",ISR:"IL",JOR:"JO",KWT:"KW",LBN:"LB",QAT:"QA",SYR:"SY",AUT:"AT",BEL:"BE",BGR:"BG",HRV:"HR",CZE:"CZ",DNK:"DK",FIN:"FI",FRA:"FR",DEU:"DE",GRC:"GR",HUN:"HU",IRL:"IE",ITA:"IT",NLD:"NL",NOR:"NO",POL:"PL",PRT:"PT",ROU:"RO",RUS:"RU",SRB:"RS",SVK:"SK",ESP:"ES",SWE:"SE",CHE:"CH",UKR:"UA",GBR:"GB",BLR:"BY",AZE:"AZ",GEO:"GE",ARM:"AM",CAN:"CA",MEX:"MX",USA:"US",CUB:"CU",DOM:"DO",GTM:"GT",HND:"HN",CRI:"CR",ARG:"AR",BRA:"BR",CHL:"CL",COL:"CO",PER:"PE",VEN:"VE",ECU:"EC",BOL:"BO",AUS:"AU",NZL:"NZ" };
    const cc = ALPHA2_AQ[iso];
    if(!cc) return null;
    const headers = ENV.OPENAQ_API_KEY ? { "X-API-Key": ENV.OPENAQ_API_KEY } : {};
    const r = await axios.get("https://api.openaq.org/v3/locations", { params:{ countries_id:cc, limit:5, order_by:"lastUpdated", sort_order:"desc" }, headers, timeout:8000 });
    const locations = r.data?.results||[];
    if(!locations.length) return null;
    const locId = locations[0].id;
    const m = await axios.get(`https://api.openaq.org/v3/locations/${locId}/latest`, { headers, timeout:8000 });
    const measurements = m.data?.results||[];
    const byParam = {};
    measurements.forEach(x => { byParam[x.parameter] = x.value; });
    const pm25 = byParam["pm25"] ?? byParam["pm2.5"] ?? null;
    const pm10 = byParam["pm10"] ?? null;
    const aqi  = pm25 !== null ? calcAQI(pm25) : null;
    return { location:locations[0].name||countryName, pm25:pm25!==null?Math.round(pm25*10)/10:null, pm10:pm10!==null?Math.round(pm10*10)/10:null, aqi, aqi_label:aqi!==null?aqiLabel(aqi):null, updated:locations[0].lastUpdated||null, source:"OpenAQ" };
  });
}

const waqiCache = {};
async function fetchWAQI(countryName, iso) {
  const cached = waqiCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  const geo = geoCoordCache[iso];
  if(!geo) return null;
  return timed("waqi", async () => {
    let d = null;
    try {
      const r = await axios.get(`https://api.waqi.info/feed/geo:${geo.lat};${geo.lon}/?token=demo`,{timeout:6000});
      if(r.data?.data && r.data.data !== "Unknown station" && r.data.data?.status !== "error") d = r.data.data;
    } catch(e) {}
    if(!d) {
      try {
        const r2 = await axios.get(`https://api.waqi.info/search/?token=demo&keyword=${encodeURIComponent(countryName)}`,{timeout:6000});
        const stations = r2.data?.data||[];
        if(stations.length > 0) {
          const r3 = await axios.get(`https://api.waqi.info/feed/${stations[0].uid}/?token=demo`,{timeout:6000});
          if(r3.data?.data && r3.data.data !== "Unknown station") d = r3.data.data;
        }
      } catch(e) {}
    }
    if(!d) return null;
    const data = { aqi:d.aqi, aqi_label:aqiLabel(d.aqi), city:d.city?.name||countryName, pm25:d.iaqi?.pm25?.v||null, pm10:d.iaqi?.pm10?.v||null, o3:d.iaqi?.o3?.v||null, no2:d.iaqi?.no2?.v||null, updated:d.time?.s||null, source:"WAQI" };
    waqiCache[iso] = { data, expires: Date.now()+60*60*1000 };
    return data;
  });
}

const aviationCache = {};
async function fetchFlights(countryName, iso) {
  if(!ENV.AVIATIONSTACK_API_KEY) return null;
  const cached = aviationCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  return timed("aviationstack", async () => {
    const r = await axios.get("http://api.aviationstack.com/v1/airports", { params:{ access_key:ENV.AVIATIONSTACK_API_KEY, country_name:countryName, limit:5 }, timeout:10000 });
    const airports = (r.data?.data||[]).map(a=>({name:a.airport_name,iata:a.iata_code,city:a.city_iata_code||a.city||"",latitude:a.latitude,longitude:a.longitude})).filter(a=>a.iata);
    const data = { airports, major_hub:airports[0]||null };
    aviationCache[iso] = { data, expires: Date.now()+24*60*60*1000 };
    return data;
  });
}

const numbeoCache = {};
let numbeoCallsThisMonth = 0;
let numbeoResetAt = Date.now() + 30*24*60*60*1000;
const NUMBEO_MONTHLY_CAP = 8;
function numbeoResetIfNeeded() { if(Date.now() > numbeoResetAt) { numbeoCallsThisMonth=0; numbeoResetAt=Date.now()+30*24*60*60*1000; } }

async function fetchCostOfLiving(countryName) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = numbeoCache[countryName];
  if(cached && Date.now() < cached.expires) return cached.data;
  numbeoResetIfNeeded();
  if(numbeoCallsThisMonth >= NUMBEO_MONTHLY_CAP) return cached ? cached.data : null;
  return timed("numbeo", async () => {
    const r = await axios.get("https://cost-of-living-and-prices.p.rapidapi.com/prices", {
      params:{ country_name:countryName, city_name:"" },
      headers:{ "X-RapidAPI-Key":ENV.RAPIDAPI_KEY, "X-RapidAPI-Host":"cost-of-living-and-prices.p.rapidapi.com" },
      timeout:10000,
    });
    numbeoCallsThisMonth++;
    const items = r.data?.prices||[];
    const get = (name) => items.find(i=>i.item_name?.toLowerCase().includes(name.toLowerCase()))?.avg||null;
    const data = { city:r.data?.city_name||countryName, country:r.data?.country_name||countryName, meal_cheap:get("inexpensive restaurant"), meal_mid:get("mid-range restaurant"), coffee:get("cappuccino"), beer_local:get("domestic beer"), water_bottle:get("water (0.33"), one_bed_city_rent:get("1 bedroom apartment in city"), one_bed_outside_rent:get("1 bedroom apartment outside"), monthly_transport:get("monthly pass"), taxi_per_km:get("taxi 1km"), internet_monthly:get("internet"), avg_salary:get("average monthly net salary"), currency:"USD", raw_count:items.length };
    numbeoCache[countryName] = { data, expires: Date.now()+24*60*60*1000 };
    return data;
  });
}

const restCountriesCache = {};
async function fetchRestCountries(iso) {
  if(restCountriesCache[iso]) return restCountriesCache[iso];
  return timed("rest_countries", async () => {
    const r = await axios.get(`https://restcountries.com/v3.1/alpha/${iso}`,{timeout:8000});
    const c = r.data?.[0];
    if(!c) return null;
    const data = { name:c.name?.common, official:c.name?.official, capital:c.capital?.[0]||null, region:c.region, subregion:c.subregion, population:c.population, area_km2:c.area, languages:Object.values(c.languages||{}), currencies:Object.values(c.currencies||{}).map(x=>({name:x.name,symbol:x.symbol})), timezones:c.timezones||[], calling_code:c.idd?.root+(c.idd?.suffixes?.[0]||""), flag_png:c.flags?.png, flag_svg:c.flags?.svg, coat_of_arms:c.coatOfArms?.png||null, maps:c.maps?.googleMaps||null, borders:c.borders||[], landlocked:c.landlocked, un_member:c.unMember, driving_side:c.car?.side||null, start_of_week:c.startOfWeek||null, tlds:c.tld||[], gini:c.gini?Object.values(c.gini)[0]:null };
    restCountriesCache[iso] = data;
    return data;
  });
}

const airbnbCache = {};
async function fetchAirbnb(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = airbnbCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  const geo = geoCoordCache[iso];
  if(!geo) return null;
  return timed("airbnb", async () => {
    const r = await axios.get("https://airbnb13.p.rapidapi.com/search-location", {
      params:{ location:countryName, checkin:getFutureDate(14), checkout:getFutureDate(17), adults:2, children:0, infants:0, pets:0, page:1, currency:"USD" },
      headers:{ "X-RapidAPI-Key":ENV.RAPIDAPI_KEY, "X-RapidAPI-Host":"airbnb13.p.rapidapi.com" }, timeout:12000,
    });
    const results = r.data?.results||[];
    const listings = results.slice(0,6).map(l=>({ id:l.id, name:l.name, type:l.type, beds:l.beds, bathrooms:l.bathrooms, price:l.price?.rate, currency:l.price?.currency||"USD", rating:l.rating?.guestSatisfactionOverall, reviews:l.reviewsCount, image:l.images?.[0]||null, url:l.url||null, city:l.city||countryName }));
    const prices = listings.map(l=>l.price).filter(Boolean);
    const data = { listings, avg_price_per_night:prices.length?Math.round(prices.reduce((a,b)=>a+b,0)/prices.length):null, currency:"USD", sample_size:listings.length };
    airbnbCache[iso] = { data, expires: Date.now()+6*60*60*1000 };
    return data;
  });
}

function getFutureDate(daysAhead) {
  const d = new Date(); d.setDate(d.getDate()+daysAhead); return d.toISOString().split("T")[0];
}

const bookingCache = {};
async function fetchBooking(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = bookingCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  const geo = geoCoordCache[iso];
  if(!geo) return null;
  return timed("booking", async () => {
    const r = await axios.get("https://booking-com15.p.rapidapi.com/api/v1/hotels/searchDestination", {
      params:{ query:countryName }, headers:{ "X-RapidAPI-Key":ENV.RAPIDAPI_KEY, "X-RapidAPI-Host":"booking-com15.p.rapidapi.com" }, timeout:10000,
    });
    const dest = r.data?.data?.[0];
    if(!dest) return null;
    const checkin = getFutureDate(14), checkout = getFutureDate(17);
    const h = await axios.get("https://booking-com15.p.rapidapi.com/api/v1/hotels/searchHotels", {
      params:{ dest_id:dest.dest_id, search_type:dest.search_type||"CITY", arrival_date:checkin, departure_date:checkout, adults:2, room_qty:1, page_number:1, languagecode:"en-us", currency_code:"USD" },
      headers:{ "X-RapidAPI-Key":ENV.RAPIDAPI_KEY, "X-RapidAPI-Host":"booking-com15.p.rapidapi.com" }, timeout:12000,
    });
    const hotels = (h.data?.data?.hotels||[]).slice(0,8).map(hotel => {
      const hotelId = hotel.hotel_id||hotel.property?.id;
      const hotelName = hotel.property?.name||"";
      const bookingUrl = hotelId ? `https://www.booking.com/hotel/xx/${String(hotelName).toLowerCase().replace(/[^a-z0-9]+/g,"-")}.html?aid=304142&checkin=${encodeURIComponent(checkin)}&checkout=${encodeURIComponent(checkout)}&no_rooms=1&group_adults=2` : `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(countryName)}&checkin=${encodeURIComponent(checkin)}&checkout=${encodeURIComponent(checkout)}&no_rooms=1&group_adults=2`;
      return { hotel_id:hotelId, name:hotelName, rating:hotel.property?.reviewScore, review_count:hotel.property?.reviewCount, price_per_night:hotel.property?.priceBreakdown?.grossPrice?.value, currency:hotel.property?.priceBreakdown?.grossPrice?.currency||"USD", stars:hotel.property?.propertyClass, photo:hotel.property?.photoUrls?.[0]||null, booking_url:bookingUrl };
    });
    const prices = hotels.map(h=>h.price_per_night).filter(Boolean);
    const searchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(countryName)}&checkin=${encodeURIComponent(checkin)}&checkout=${encodeURIComponent(checkout)}&no_rooms=1&group_adults=2&order=popularity`;
    const data = { hotels, avg_price_per_night:prices.length?Math.round(prices.reduce((a,b)=>a+b,0)/prices.length):null, min_price:prices.length?Math.round(Math.min(...prices)):null, destination:dest.city_name||countryName, dest_id:dest.dest_id, currency:"USD", checkin, checkout, search_url:searchUrl };
    bookingCache[iso] = { data, expires: Date.now()+6*60*60*1000 };
    return data;
  });
}

const tripadvisorCache = {};
async function fetchTripadvisor(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = tripadvisorCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  return timed("tripadvisor", async () => {
    const r = await axios.get("https://tripadvisor16.p.rapidapi.com/api/v1/attraction/searchAttractions", {
      params:{ geoId:"1", searchQuery:countryName, language:"en" },
      headers:{ "X-RapidAPI-Key":ENV.RAPIDAPI_KEY, "X-RapidAPI-Host":"tripadvisor16.p.rapidapi.com" }, timeout:10000,
    });
    const attractions = (r.data?.data?.data||[]).slice(0,8).map(a=>({ name:a.title, rating:a.averageRating, review_count:a.userReviewCount, category:a.primaryInfo?.text, ranking:a.ranking?.text }));
    const data = { attractions };
    tripadvisorCache[iso] = { data, expires: Date.now()+12*60*60*1000 };
    return data;
  });
}

const skyscannerCache = {};
async function fetchFlightPrices(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = skyscannerCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  return timed("skyscanner", async () => {
    const r = await axios.get("https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchAirport", {
      params:{ query:countryName, locale:"en-US" },
      headers:{ "X-RapidAPI-Key":ENV.RAPIDAPI_KEY, "X-RapidAPI-Host":"sky-scrapper.p.rapidapi.com" }, timeout:10000,
    });
    const airports = (r.data?.data||[]).filter(a=>a.navigation?.entityType==="AIRPORT").slice(0,3);
    const data = { airports:airports.map(a=>({ name:a.presentation?.title, subtitle:a.presentation?.subtitle, entity_id:a.entityId, iata:a.navigation?.localizedName })) };
    skyscannerCache[iso] = { data, expires: Date.now()+24*60*60*1000 };
    return data;
  });
}

const currencyCache = {};
async function fetchCurrencyRates(iso) {
  if(currencyCache["USD"] && Date.now() < currencyCache["USD"].expires) return currencyCache["USD"].data;
  return timed("currency", async () => {
    const r = await axios.get("https://open.er-api.com/v6/latest/USD",{timeout:6000});
    const data = { base:"USD", rates:r.data?.rates||{}, updated:r.data?.time_last_update_utc };
    currencyCache["USD"] = { data, expires: Date.now()+60*60*1000 };
    return data;
  });
}

const placesCache = {};
async function fetchGooglePlaces(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = placesCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  const geo = geoCoordCache[iso];
  if(!geo) return null;
  return timed("google_places", async () => {
    const r = await axios.get("https://maps-data.p.rapidapi.com/searchmaps.php", {
      params:{ query:`tourist attractions in ${countryName}`, limit:8, country:"us", lang:"en", lat:geo.lat, lng:geo.lon, offset:0, zoom:5 },
      headers:{ "X-RapidAPI-Key":ENV.RAPIDAPI_KEY, "X-RapidAPI-Host":"maps-data.p.rapidapi.com" }, timeout:10000,
    });
    const places = (r.data?.data||[]).slice(0,8).map(p=>({ name:p.name, type:p.type, rating:p.rating, reviews:p.reviews, address:p.full_address, lat:p.latitude, lon:p.longitude, open_now:p.open_now }));
    const data = { places };
    placesCache[iso] = { data, expires: Date.now()+12*60*60*1000 };
    return data;
  });
}

const travelAdvisorCache = {};
async function fetchTravelAdvisor(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = travelAdvisorCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  return timed("travel_advisor", async () => {
    const r = await axios.get("https://travel-advisor.p.rapidapi.com/restaurants/list-by-latlng", {
      params:{ latitude:geoCoordCache[iso]?.lat||48.85, longitude:geoCoordCache[iso]?.lon||2.35, limit:6, currency:"USD", distance:2, open_now:"false", lunit:"km", lang:"en_US" },
      headers:{ "X-RapidAPI-Key":ENV.RAPIDAPI_KEY, "X-RapidAPI-Host":"travel-advisor.p.rapidapi.com" }, timeout:10000,
    });
    const restaurants = (r.data?.data||[]).filter(r=>r.name).slice(0,6).map(r=>({ name:r.name, rating:r.rating, reviews:r.num_reviews, cuisine:r.cuisine?.[0]?.name, price:r.price_level, address:r.address }));
    const data = { restaurants };
    travelAdvisorCache[iso] = { data, expires: Date.now()+12*60*60*1000 };
    return data;
  });
}

const hotelsCache = {};
async function fetchHotelDeals(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = hotelsCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  return timed("hotels_com", async () => {
    const r = await axios.get("https://hotels4.p.rapidapi.com/locations/v3/search", {
      params:{ q:countryName, locale:"en_US", langid:1033, siteid:300000001 },
      headers:{ "X-RapidAPI-Key":ENV.RAPIDAPI_KEY, "X-RapidAPI-Host":"hotels4.p.rapidapi.com" }, timeout:10000,
    });
    const suggestions = (r.data?.sr||[]).filter(s=>s.type==="CITY"||s.type==="REGION").slice(0,1);
    const data = { destination:suggestions[0]?.regionNames?.fullName||countryName, search_url:`https://www.hotels.com/search.do?q-destination=${encodeURIComponent(countryName)}&q-check-in=${getFutureDate(14)}&q-check-out=${getFutureDate(17)}` };
    hotelsCache[iso] = { data, expires: Date.now()+24*60*60*1000 };
    return data;
  });
}

const youtubeCache = {};
async function fetchYoutubeVideos(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = youtubeCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  return timed("youtube", async () => {
    const r = await axios.get("https://youtube-search-and-download.p.rapidapi.com/search", {
      params:{ query:`${countryName} travel guide 2025`, type:"v", sort:"r", nextToken:"" },
      headers:{ "X-RapidAPI-Key":ENV.RAPIDAPI_KEY, "X-RapidAPI-Host":"youtube-search-and-download.p.rapidapi.com" }, timeout:10000,
    });
    const videos = (r.data?.contents||[]).filter(v=>v.video).slice(0,5).map(v=>({ id:v.video?.videoId, title:v.video?.title, channel:v.video?.channelName, views:v.video?.viewCountText, thumbnail:v.video?.thumbnails?.[0]?.url||null, url:`https://youtube.com/watch?v=${v.video?.videoId}`, length:v.video?.lengthText }));
    const data = { videos };
    youtubeCache[iso] = { data, expires: Date.now()+12*60*60*1000 };
    return data;
  });
}


// ══════════════════════════════════════════════════════════════════
// NATIONAL NEWS FEEDS
// ══════════════════════════════════════════════════════════════════
const NATIONAL_RSS = {
  USA:"https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml",
  GBR:"https://feeds.bbci.co.uk/news/uk/rss.xml",
  FRA:"https://www.lemonde.fr/rss/une.xml",
  DEU:"https://www.dw.com/rss/rss.xml",
  ITA:"https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml",
  ESP:"https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada",
  JPN:"https://www3.nhk.or.jp/nhkworld/en/news/rss.xml",
  CHN:"http://www.xinhuanet.com/english/rss/worldrss.xml",
  IND:"https://feeds.feedburner.com/ndtvnews-india-news",
  BRA:"https://feeds.folha.uol.com.br/mundo/rss091.xml",
  RUS:"https://tass.ru/rss/v2.xml",
  AUS:"https://www.abc.net.au/news/feed/51120/rss.xml",
  CAN:"https://www.cbc.ca/cmlink/rss-world",
  MEX:"https://feeds.feedburner.com/eluniversal/rss",
  ZAF:"https://feeds.feedburner.com/24com/politics",
  NGA:"https://punchng.com/feed/",
  KEN:"https://nation.co.ke/news/rss.xml",
  EGY:"https://english.ahram.org.eg/News.aspx",
  ARE:"https://www.thenationalnews.com/rss",
  SGP:"https://www.channelnewsasia.com/rssfeeds/8395884",
  THA:"https://www.bangkokpost.com/rss/data/topstories.xml",
  MYS:"https://www.malaymail.com/feed",
  IDN:"https://rss.kompas.com/rss/tag/indonesia",
  PHL:"https://www.philstar.com/rss/nation",
  KOR:"https://feeds.feedburner.com/koreaheraldnews",
  SAU:"https://www.arabnews.com/rss.xml",
  TUR:"https://www.hurriyetdailynews.com/rss.aspx",
  ARG:"https://www.clarin.com/rss/",
  CHL:"https://www.latercera.com/feed/",
  COL:"https://www.semana.com/rss",
};

async function fetchNationalNews(countryName, iso) {
  const iso2 = ISO3_TO_ISO2[iso] || null;
  const rssUrl = NATIONAL_RSS[iso] || NATIONAL_RSS[iso2] || null;
  const results = [];

  if (rssUrl) {
    try {
      const r = await axios.get(rssUrl, { timeout:8000, headers:{"User-Agent":"GlobeVoyage/2.0"} });
      const parsed = await xml2js.parseStringPromise(r.data, { explicitArray:false });
      const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
      const arr = Array.isArray(items) ? items : [items];
      arr.filter(i => i).slice(0, 6).forEach(i => {
        const title = typeof i.title === "object" ? (i.title._ || i.title["#text"] || "") : (i.title || "");
        const url = i.link?.$ ? Object.values(i.link.$)[0] : (i.link || "");
        if (title) results.push({ title, url, source: countryName + " News", published_at: i.pubDate || i.updated || null, risk_level: riskScore(title) });
      });
    } catch(e) {}
  }

  if (results.length < 4) {
    try {
      const q = encodeURIComponent(`"${countryName}" news today`);
      const r = await axios.get(`https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`, { timeout:8000, headers:{"User-Agent":"GlobeVoyage/2.0"} });
      const parsed = await xml2js.parseStringPromise(r.data, { explicitArray:false });
      const items = parsed?.rss?.channel?.item || [];
      const arr = Array.isArray(items) ? items : [items];
      arr.filter(i => i && i.title).slice(0, 6 - results.length).forEach(i => {
        const title = typeof i.title === "object" ? (i.title._ || "") : (i.title || "");
        if (title) results.push({ title, url:i.link||"", source:"Google News", published_at:i.pubDate, risk_level:riskScore(title) });
      });
    } catch(e) {}
  }

  return results.slice(0, 8);
}

// ══════════════════════════════════════════════════════════════════
// MISTRAL COUNTRY SYNTHESIS
// ══════════════════════════════════════════════════════════════════
async function runMistral(countryName, iso, rawData) {
  if (!mistralAvailable()) return null;

  const { wiki, wikivoyage, weather, news, events, places, airQuality, flights, costOfLiving, restCountries } = rawData;

  const prompt = `You are a world-class travel intelligence analyst. Create comprehensive, accurate travel intel for ${countryName}.

Context data available:
- Wikipedia: ${wiki?.summary?.slice(0, 500) || "N/A"}
- Wikivoyage: ${wikivoyage?.full?.slice(0, 500) || "N/A"}
- Weather: ${JSON.stringify(weather?.now || {}).slice(0, 200)}
- Country facts: Population ${restCountries?.population?.toLocaleString()}, Capital: ${restCountries?.capital}, Languages: ${restCountries?.languages?.join(", ")}
- News (${news?.length || 0} articles), Events (${events?.length || 0}), Places (${places?.length || 0})

Return ONLY valid JSON (no markdown, no explanation):
{
  "briefing": "2-3 sentence compelling overview",
  "vibe": "10-word poetic vibe",
  "recommendations": ["activity1","activity2","activity3","activity4","activity5"],
  "safety_summary": "1 sentence safety overview",
  "best_months": ["Month1","Month2","Month3"],
  "hidden_gem": "lesser-known attraction or experience",
  "trending_now": ["trend1","trend2"],
  "avoid_if": "1 sentence about who should avoid or cautions",
  "cost_estimate": "budget estimate per day in USD",
  "local_tips": ["tip1","tip2","tip3"],
  "day_itinerary": "brief 1-day itinerary",
  "sensory_description": "evocative sensory description",
  "climate_summary": "climate overview",
  "transport_overview": "how to get around",
  "food_scene": "food culture overview",
  "history_brief": "brief history",
  "culture_brief": "cultural highlights",
  "health_overview": "health and medical info",
  "connectivity_overview": "internet and phone situation",
  "shopping_overview": "shopping highlights",
  "nightlife_overview": "nightlife scene",
  "accommodation_overview": "where to stay overview",
  "safety_detail": "detailed safety information",
  "traveler_scores": {"solo":8,"families":7,"adventure":9,"luxury":6,"budget":8,"romance":7}
}`;

  try {
    const r = await mistralQueue.call(() => axios.post(
      "https://api.mistral.ai/v1/chat/completions",
      { model:"mistral-large-latest", messages:[{role:"user",content:prompt}], temperature:0.4, max_tokens:2000 },
      { headers:{ Authorization:`Bearer ${ENV.MISTRAL_API_KEY}`, "Content-Type":"application/json" }, timeout:60000 }
    ));
    const text = r.data?.choices?.[0]?.message?.content || "";
    return repairJson(text);
  } catch(e) {
    if (e.isKeyError) return null;
    console.error(`[runMistral] ${countryName}:`, e.message?.slice(0,80));
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════
// MISTRAL STATE INTEL
// ══════════════════════════════════════════════════════════════════
async function runMistralForState(stateName, countryName, continent, rawData) {
  if (!mistralAvailable()) return null;

  const { weather, news, events, places, airQuality, areas } = rawData;
  const topAreas = (areas||[]).slice(0,10).map(a=>a.name).join(", ");

  const prompt = `You are a travel intelligence analyst. Generate travel intel for ${stateName}, ${countryName} (${continent}).

Available data:
- Weather: ${JSON.stringify(weather?.now||{}).slice(0,150)}
- Top cities/areas: ${topAreas || "N/A"}
- News headlines: ${(news||[]).slice(0,3).map(n=>n.title).join("; ") || "N/A"}
- Events: ${(events||[]).slice(0,3).map(e=>e.title||e.name).join("; ") || "N/A"}
- Places: ${(places||[]).slice(0,3).map(p=>p.name).join(", ") || "N/A"}
- Air quality: ${airQuality?.aqi_label || "N/A"}

Return ONLY valid JSON:
{
  "briefing": "2-3 sentence overview of this state/region for travelers",
  "vibe": "10-word poetic vibe",
  "recommendations": ["activity1","activity2","activity3","activity4"],
  "safety_summary": "1 sentence safety note",
  "best_months": ["Month1","Month2","Month3"],
  "hidden_gem": "lesser-known local experience",
  "trending_now": ["trend1","trend2"],
  "avoid_if": "who should think twice",
  "cost_estimate": "approximate daily budget USD",
  "local_tips": ["tip1","tip2","tip3"],
  "day_itinerary": "1-day itinerary",
  "sensory_description": "evocative description",
  "climate_summary": "climate overview",
  "transport_overview": "getting around",
  "food_scene": "local food culture",
  "history_brief": "historical context",
  "culture_brief": "cultural highlights",
  "health_overview": "health notes",
  "connectivity_overview": "internet/connectivity",
  "shopping_overview": "shopping info",
  "nightlife_overview": "nightlife",
  "accommodation_overview": "where to stay",
  "safety_detail": "safety details",
  "traveler_scores": {"solo":7,"families":7,"adventure":8,"luxury":6,"budget":7,"romance":7}
}`;

  try {
    const r = await mistralQueue.call(() => axios.post(
      "https://api.mistral.ai/v1/chat/completions",
      { model:"mistral-large-latest", messages:[{role:"user",content:prompt}], temperature:0.4, max_tokens:2000 },
      { headers:{ Authorization:`Bearer ${ENV.MISTRAL_API_KEY}`, "Content-Type":"application/json" }, timeout:60000 }
    ));
    const text = r.data?.choices?.[0]?.message?.content || "";
    return repairJson(text);
  } catch(e) {
    if (e.isKeyError) return null;
    console.error(`[runMistralForState] ${stateName}:`, e.message?.slice(0,80));
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════
// MISTRAL AREA INTEL
// ══════════════════════════════════════════════════════════════════
async function runMistralForArea(areaName, stateName, countryName, continent, rawData) {
  if (!mistralAvailable()) return null;

  const { weather, news, events, places, airQuality } = rawData;
  const location = `${areaName}${stateName ? ", " + stateName : ""}, ${countryName}`;

  const prompt = `You are a travel intelligence expert. Generate detailed travel intel for ${location}.

Available data:
- Weather: ${JSON.stringify(weather?.now||{}).slice(0,120)}
- News: ${(news||[]).slice(0,3).map(n=>n.title).join("; ") || "N/A"}
- Places: ${(places||[]).slice(0,3).map(p=>p.name).join(", ") || "N/A"}
- Air quality: ${airQuality?.aqi_label || "N/A"}

Return ONLY valid JSON:
{
  "geography": { "overview":"", "terrain":"", "size":"", "notable_features":[] },
  "weather": { "overview":"", "best_season":"", "avg_temp_c":0, "rainfall":"" },
  "history_culture": { "overview":"", "key_events":[], "cultural_notes":"", "etiquette":[] },
  "food_drink": { "overview":"", "must_try":[], "restaurants":"", "price_range":"" },
  "accommodation": { "overview":"", "best_areas":[], "price_range":"", "top_picks":[] },
  "transport": { "overview":"", "getting_there":"", "getting_around":"", "apps":[] },
  "cost_of_living": { "overview":"", "budget_per_day_usd":0, "mid_range_usd":0, "luxury_usd":0 },
  "health": { "overview":"", "hospitals":"", "pharmacies":"", "water_safe":true },
  "safety": { "overview":"", "risk_level":"low", "areas_to_avoid":[], "emergency_numbers":"" },
  "nightlife_entertainment": { "overview":"", "best_areas":[], "closing_time":"", "dress_code":"" },
  "attractions": { "overview":"", "top_5":[], "hidden_gems":[], "day_trips":[] },
  "shopping": { "overview":"", "best_markets":[], "souvenirs":[], "malls":[] },
  "connectivity": { "overview":"", "wifi_quality":"", "sim_cards":"", "avg_speed_mbps":0 },
  "languages": { "primary":"", "secondary":[], "english_level":"", "useful_phrases":[] },
  "events": { "overview":"", "annual_events":[], "current_events":[] },
  "visa": { "overview":"", "on_arrival":[], "visa_free":[], "notes":"" },
  "ai_intel": {
    "briefing": "2-3 sentence traveler overview",
    "vibe": "10-word poetic vibe",
    "hidden_gem": "lesser-known experience",
    "best_time": "best time to visit",
    "avoid_if": "who should think twice",
    "trending_topic": "what travelers are talking about",
    "recommendations": ["rec1","rec2","rec3","rec4"],
    "local_tip": "insider tip",
    "packing_list": ["item1","item2","item3"],
    "cost_3day_trip_usd": 0,
    "day_itinerary": "1-day itinerary",
    "sensory": "evocative sensory description",
    "traveler_scores": {"solo":7,"families":7,"adventure":8,"luxury":6,"budget":7,"romance":7},
    "sub_areas": ["neighborhood1","neighborhood2","neighborhood3"]
  }
}`;

  try {
    const r = await mistralQueue.call(() => axios.post(
      "https://api.mistral.ai/v1/chat/completions",
      { model:"mistral-large-latest", messages:[{role:"user",content:prompt}], temperature:0.4, max_tokens:3000 },
      { headers:{ Authorization:`Bearer ${ENV.MISTRAL_API_KEY}`, "Content-Type":"application/json" }, timeout:90000 }
    ));
    const text = r.data?.choices?.[0]?.message?.content || "";
    return repairJson(text);
  } catch(e) {
    if (e.isKeyError) return null;
    console.error(`[runMistralForArea] ${areaName}:`, e.message?.slice(0,80));
    return null;
  }
}


// ══════════════════════════════════════════════════════════════════
// STATE INTEL PIPELINE
// ══════════════════════════════════════════════════════════════════
const stateIntelMemCache = {};
const STATE_INTEL_REFRESH_MS = 8 * 60 * 60 * 1000;

function stateIntelNeedsRefresh(intel) {
  if (!intel) return true;
  if (!intel.next_update_at) return true;
  return new Date(intel.next_update_at).getTime() < Date.now();
}

async function runStatePipeline(stateId) {
  const { data: state, error: stErr } = await supabase
    .from("states").select("id,name,country_iso,state_code,latitude,longitude")
    .eq("id", stateId).single();
  if (stErr || !state) { console.error("[StatePipeline] State not found:", stateId); return null; }

  const country = COUNTRIES.find(c => c.iso === state.country_iso);
  if (!country) { console.error("[StatePipeline] Country not found:", state.country_iso); return null; }

  const stateName = state.name, countryName = country.name, continent = country.continent;
  const iso2 = ISO3_TO_ISO2[state.country_iso] || "US";
  console.log(`[StatePipeline] Starting for ${stateName}, ${countryName}`);

  let coords = (state.latitude && state.longitude)
    ? { lat: parseFloat(state.latitude), lon: parseFloat(state.longitude) }
    : await geocodePlace(stateName, countryName).catch(() => null);
  if (!coords) coords = geoCoordCache[state.country_iso] || { lat: 0, lon: 0 };
  else if (!state.latitude) {
    supabase.from("states").update({ latitude: coords.lat, longitude: coords.lon })
      .eq("id", stateId).then(() => {}).catch(() => {});
  }

  const safe = async (fn, fallback) => { try { return await fn(); } catch(e) { return fallback; } };

  const [weather, newsRaw, photos, eventsRaw, places, waqiData] = await Promise.all([
    safe(() => fetchWeatherByCoords(coords.lat, coords.lon), { now: null, forecast: [] }),
    safe(() => fetchGoogleNewsByQuery(`"${stateName}" "${countryName}" travel tourism`, iso2), []),
    safe(() => fetchUnsplash(`${stateName} ${countryName}`), []),
    safe(() => fetchGoogleNewsByQuery(`"${stateName}" "${countryName}" events festival`, iso2), []),
    safe(() => fetchPlacesByCoords(coords.lat, coords.lon), []),
    safe(() => fetchWAQIByCoords(coords.lat, coords.lon, stateName), null),
  ]);

  const { data: areas } = await supabase.from("areas").select("id,name,type,population")
    .eq("state_id", stateId).order("population", { ascending: false }).limit(60);

  // Try AI — returns null immediately if key invalid, no retries
  let ai = null;
  if (mistralAvailable()) {
    ai = await safe(() => runMistralForState(stateName, countryName, continent,
      { weather, news: newsRaw, events: eventsRaw, places, airQuality: waqiData, areas: areas || [] }
    ), null);
  } else {
    console.log(`[StatePipeline] Skipping Mistral for ${stateName} — key invalid/missing`);
  }

  const nextUpdate = new Date(Date.now() + STATE_INTEL_REFRESH_MS).toISOString();
  const intel = {
    state_id: stateId, country_iso: state.country_iso, state_name: stateName,
    country_name: countryName, state_code: state.state_code, continent,
    last_updated: new Date().toISOString(), next_update_at: nextUpdate,
    lat: coords.lat, lon: coords.lon,
    weather_now: weather?.now || null, weather_forecast: weather?.forecast || [],
    news_headlines: newsRaw || [], photos: (photos || []).slice(0, 9),
    events: eventsRaw || [], top_places: places || [], air_quality: waqiData || [],
    areas: areas || [],
    ai_briefing: ai?.briefing || null, ai_vibe: ai?.vibe || null,
    ai_recommendations: ai?.recommendations || [], ai_safety_summary: ai?.safety_summary || null,
    ai_best_months: ai?.best_months || [], ai_hidden_gem: ai?.hidden_gem || null,
    ai_trending_now: ai?.trending_now || [], ai_avoid_if: ai?.avoid_if || null,
    ai_cost_estimate: ai?.cost_estimate || null, ai_local_tips: ai?.local_tips || [],
    ai_day_itinerary: ai?.day_itinerary || null,
    ai_sensory_description: ai?.sensory_description || null,
    ai_climate_info: ai?.climate_summary ? { summary: ai.climate_summary } : null,
    ai_transport_info: ai?.transport_overview ? { overview: ai.transport_overview } : null,
    ai_food_scene: ai?.food_scene ? { overview: ai.food_scene } : null,
    ai_history: ai?.history_brief ? { overview: ai.history_brief } : null,
    ai_culture: ai?.culture_brief ? { overview: ai.culture_brief } : null,
    ai_health_info: ai?.health_overview ? { overview: ai.health_overview } : null,
    ai_connectivity: ai?.connectivity_overview ? { overview: ai.connectivity_overview } : null,
    ai_shopping: ai?.shopping_overview ? { overview: ai.shopping_overview } : null,
    ai_nightlife: ai?.nightlife_overview ? { overview: ai.nightlife_overview } : null,
    ai_accommodation: ai?.accommodation_overview ? { overview: ai.accommodation_overview } : null,
    ai_safety_detail: ai?.safety_detail || null,
    ai_traveler_scores: ai?.traveler_scores || null,
    ai_etiquette: null, ai_emergency_script: null,
    mistral_available: mistralAvailable(),
  };

  try {
    const { error: upsertErr } = await supabase.from("state_intel")
      .upsert(intel, { onConflict: "state_id" });
    if (upsertErr) console.error("[StatePipeline] DB upsert error:", upsertErr.message);
    else console.log(`[StatePipeline] ✓ ${stateName} saved ${ai ? "with AI" : "(no AI — key issue)"}`);
  } catch(e) { console.error("[StatePipeline] state_intel error:", e.message); }

  stateIntelMemCache[stateId] = intel;
  return intel;
}

// ══════════════════════════════════════════════════════════════════
// GENERATE ALL STATE INTEL
// ══════════════════════════════════════════════════════════════════
const stateGenProgress = {
  running: false, total: 0, done: 0, failed: 0, current: null,
  startedAt: null, completedAt: null, failedStates: [], log: [],
};

function sgLog(msg) {
  const line = `[${new Date().toISOString().slice(11,19)}] ${msg}`;
  console.log('[StateGen]', msg);
  stateGenProgress.log = [line, ...stateGenProgress.log].slice(0, 100);
}

async function generateAllStateIntel({ force = false } = {}) {
  if (stateGenProgress.running) { sgLog('Already running'); return { skipped: true }; }
  if (!stateIntelTableExists) { sgLog('state_intel table missing'); return { error: 'table_missing' }; }

  stateGenProgress.running = true; stateGenProgress.done = 0; stateGenProgress.failed = 0;
  stateGenProgress.failedStates = []; stateGenProgress.startedAt = new Date().toISOString();
  stateGenProgress.completedAt = null; stateGenProgress.log = [];

  if (!mistralAvailable()) {
    sgLog(`⚠️  MISTRAL KEY INVALID — states saved WITHOUT AI (weather/news/places still collected)`);
    sgLog(`⚠️  Fix: Render → Environment → MISTRAL_API_KEY`);
  }

  try {
    let allStates = []; let page = 0;
    while (true) {
      const { data: batch, error } = await supabase.from('states').select('id,name,country_iso')
        .order('country_iso').range(page * 1000, (page + 1) * 1000 - 1);
      if (error || !batch || batch.length === 0) break;
      allStates = allStates.concat(batch);
      if (batch.length < 1000) break;
      page++;
    }
    sgLog(`Loaded ${allStates.length} states`);
    if (!allStates.length) { stateGenProgress.running = false; return { error: 'no_states' }; }

    let toProcess = allStates;
    if (!force) {
      const doneIds = new Set();
      let iPage = 0;
      while (true) {
        let q = supabase.from('state_intel').select('state_id');
        if (mistralAvailable()) q = q.not('ai_briefing', 'is', null);
        q = q.range(iPage * 1000, (iPage + 1) * 1000 - 1);
        const { data: existing } = await q;
        if (!existing || existing.length === 0) break;
        existing.forEach(r => doneIds.add(r.state_id));
        if (existing.length < 1000) break;
        iPage++;
      }
      toProcess = allStates.filter(s => !doneIds.has(s.id));
    }

    stateGenProgress.total = toProcess.length;
    sgLog(`Starting: ${toProcess.length}/${allStates.length} states need processing`);

    for (let i = 0; i < toProcess.length; i++) {
      if (!stateGenProgress.running) { sgLog('Stopped by user'); break; }
      const state = toProcess[i];
      stateGenProgress.current = `${state.name} (${i+1}/${toProcess.length})`;
      sgLog(`Processing ${state.name} [${state.country_iso}]`);

      let success = false;
      const maxAttempts = mistralAvailable() ? 3 : 1;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await runStatePipeline(state.id);
          if (result) {
            sgLog(`✅ ${state.name} — saved ${result.ai_briefing ? 'with AI' : 'without AI (key issue)'}`);
            success = true; break;
          }
          if (!mistralAvailable()) break;
          if (attempt < maxAttempts) {
            const wait = (mistralQueue._backoff_ms > 0 ? mistralQueue._backoff_ms + 6000 : 6000);
            sgLog(`⚠ ${state.name} attempt ${attempt}: waiting ${Math.round(wait/1000)}s`);
            await new Promise(r => setTimeout(r, wait));
          }
        } catch(e) {
          if (e.isKeyError) {
            sgLog(`⚠️  Key error — switching to non-AI mode`);
            try { const r = await runStatePipeline(state.id); if (r) { success = true; } } catch(e2) {}
            break;
          }
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, mistralQueue._backoff_ms > 0 ? mistralQueue._backoff_ms + 6000 : 6000));
          } else { sgLog(`❌ ${state.name} failed: ${e.message?.slice(0,60)}`); }
        }
      }

      if (!success) { stateGenProgress.failed++; stateGenProgress.failedStates.push(state.name); }
      stateGenProgress.done++;
      if (i < toProcess.length - 1) await new Promise(r => setTimeout(r, mistralAvailable() ? 5000 : 500));
    }

    // Retry failed states (only if Mistral available)
    if (stateGenProgress.failedStates.length > 0 && stateGenProgress.running && mistralAvailable()) {
      sgLog(`🔄 Retrying ${stateGenProgress.failedStates.length} failed states…`);
      const failedNames = new Set(stateGenProgress.failedStates);
      const retryList = allStates.filter(s => failedNames.has(s.name));
      stateGenProgress.failedStates = [];
      for (const state of retryList) {
        if (!stateGenProgress.running) break;
        stateGenProgress.current = `RETRY: ${state.name}`;
        await new Promise(r => setTimeout(r, 30000));
        try {
          const result = await runStatePipeline(state.id);
          if (result?.ai_briefing) sgLog(`✅ RETRY OK: ${state.name}`);
          else { stateGenProgress.failedStates.push(state.name); sgLog(`❌ RETRY FAILED: ${state.name}`); }
        } catch(e) { stateGenProgress.failedStates.push(state.name); }
      }
    }

    sgLog(`Complete — ${stateGenProgress.done} processed, ${stateGenProgress.failedStates.length} failed`);
    stateGenProgress.completedAt = new Date().toISOString();
  } catch(e) { sgLog(`Fatal error: ${e.message}`); }

  stateGenProgress.running = false; stateGenProgress.current = null;
  return { done: stateGenProgress.done, failed: stateGenProgress.failedStates.length };
}

async function preGenerateAllStateIntel() { return generateAllStateIntel({ force: false }); }

// ══════════════════════════════════════════════════════════════════
// AREA INTEL PIPELINE
// ══════════════════════════════════════════════════════════════════
const AREA_INTEL_REFRESH_MS = 8 * 60 * 60 * 1000;
const areaIntelMemCache = {};

function areaIntelNeedsRefresh(intel) {
  if (!intel) return true;
  if (!intel.next_update_at) return true;
  return new Date(intel.next_update_at).getTime() < Date.now();
}

async function verifyAreaIntel(areaName, stateName, countryName, aiIntel) {
  if (!mistralAvailable()) return { verified: true, confidence: 0.5, sources_found: 0, reason: "Verification skipped — key unavailable", regenerate: false };
  const briefing = aiIntel?.ai_intel?.briefing || "";
  const prompt = `You are a travel fact-checker. Assess if this intel about ${areaName}, ${stateName||""}, ${countryName} seems accurate:
"${briefing.slice(0,200)}"
Return JSON only: {"verified":true,"confidence":0.8,"sources_found":0,"flags":[],"reason":"brief reason","freshness":"current","regenerate":false}`;
  try {
    const r = await mistralQueue.call(() => axios.post("https://api.mistral.ai/v1/chat/completions",
      { model:"mistral-large-latest", messages:[{role:"user",content:prompt}], temperature:0.1, max_tokens:200 },
      { headers:{ Authorization:`Bearer ${ENV.MISTRAL_API_KEY}`, "Content-Type":"application/json" }, timeout:20000 }
    ));
    const parsed = repairJson(r.data?.choices?.[0]?.message?.content || "");
    if (parsed) return { ...parsed, sources_found: parsed.sources_found || 0 };
  } catch(e) {
    if (e.isKeyError) return { verified: true, confidence: 0.5, sources_found: 0, reason: "Key error", regenerate: false };
  }
  return { verified: true, confidence: 0.5, sources_found: 0, reason: "Verification unavailable", regenerate: false };
}

async function runFullAreaIntelPipeline(areaName, stateName, countryName, countryIso) {
  const country = COUNTRIES.find(c => c.iso === countryIso || c.name === countryName);
  const continent = country?.continent || "";
  const iso2 = ISO3_TO_ISO2[countryIso || ""] || "US";
  let coords = null;
  try { coords = await geocodePlace(`${areaName}${stateName ? ", "+stateName : ""}`, countryName); } catch(e) {}
  if (!coords && countryIso) coords = geoCoordCache[countryIso] || null;

  const safe = async (fn, fallback) => { try { return await fn(); } catch(e) { return fallback; } };
  const [weather, newsRaw, photos, waqiData, places, eventsRaw] = await Promise.all([
    coords ? safe(() => fetchWeatherByCoords(coords.lat, coords.lon), { now:null, forecast:[] }) : Promise.resolve({ now:null, forecast:[] }),
    safe(() => fetchGoogleNewsByQuery(`"${areaName}" "${countryName}"`, iso2), []),
    safe(() => fetchUnsplash(`${areaName} ${countryName}`), []),
    coords ? safe(() => fetchWAQIByCoords(coords.lat, coords.lon, areaName), null) : Promise.resolve(null),
    coords ? safe(() => fetchPlacesByCoords(coords.lat, coords.lon), []) : Promise.resolve([]),
    safe(() => fetchGoogleNewsByQuery(`"${areaName}" events festival 2025 2026`, iso2), []),
  ]);

  const rawData = { weather, news: newsRaw, places, airQuality: waqiData, events: eventsRaw };
  let finalIntel = null;
  let verificationResult = { verified: true, confidence: 0.5, sources_found: 0, reason: "Mistral unavailable", regenerate: false };
  const MAX_ATTEMPTS = mistralAvailable() ? 3 : 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const aiIntel = await runMistralForArea(areaName, stateName, countryName, continent, rawData);
    if (!aiIntel) { if (!mistralAvailable()) break; if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, 10000)); continue; }
    verificationResult = await verifyAreaIntel(areaName, stateName, countryName, aiIntel);
    if (verificationResult.regenerate && attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 8000)); continue; }
    finalIntel = aiIntel; break;
  }

  const nextUpdate = new Date(Date.now() + AREA_INTEL_REFRESH_MS).toISOString();
  const cacheKey = `${areaName}||${stateName||""}||${countryName}`;
  const fi = finalIntel || {}; const ai = fi.ai_intel || {};

  const record = {
    area_name: areaName, state_name: stateName||null, country_name: countryName,
    country_iso: countryIso||null, continent, last_updated: new Date().toISOString(),
    next_update_at: nextUpdate, lat: coords?.lat||null, lon: coords?.lon||null,
    verification_score: verificationResult?.confidence||0,
    verification_sources: verificationResult?.sources_found||0,
    verification_flags: verificationResult?.flags||[],
    verification_result: verificationResult||null,
    ai_geography: fi.geography||null, ai_weather: fi.weather||null,
    ai_history_culture: fi.history_culture||null, ai_food_drink: fi.food_drink||null,
    ai_accommodation: fi.accommodation||null, ai_transport: fi.transport||null,
    ai_cost_of_living: fi.cost_of_living||null, ai_health: fi.health||null,
    ai_safety: fi.safety||null, ai_nightlife: fi.nightlife_entertainment||null,
    ai_attractions: fi.attractions||null, ai_shopping: fi.shopping||null,
    ai_connectivity: fi.connectivity||null, ai_languages: fi.languages||null,
    ai_events: fi.events||null, ai_visa: fi.visa||null,
    ai_briefing: ai.briefing||null, ai_vibe: ai.vibe||null,
    ai_hidden_gem: ai.hidden_gem||null, ai_best_time: ai.best_time||null,
    ai_avoid_if: ai.avoid_if||null, ai_trending: ai.trending_topic||null,
    ai_recommendations: ai.recommendations||[], ai_local_tips: ai.local_tip?[ai.local_tip]:[],
    ai_packing_list: ai.packing_list||[],
    ai_cost_estimate: ai.cost_3day_trip_usd?{three_day_usd:ai.cost_3day_trip_usd}:null,
    ai_day_itinerary: ai.day_itinerary||null, ai_sensory_description: ai.sensory||null,
    ai_traveler_scores: ai.traveler_scores||null, ai_sub_areas: ai.sub_areas||[],
    ai_etiquette: fi.history_culture?.etiquette||[], ai_culture: fi.history_culture||null,
    ai_history: fi.history_culture||null, ai_finance: fi.cost_of_living||null,
    ai_climate: fi.weather||null,
    photos: (photos||[]).slice(0,9), news: newsRaw||[], events_data: eventsRaw||[],
    weather_now: weather?.now||null, weather_forecast: weather?.forecast||[],
    top_places: places||[], mistral_available: mistralAvailable(),
  };

  try {
    const { error } = await supabase.from("area_intel")
      .upsert(record, { onConflict: "area_name,state_name,country_name" });
    if (error) console.error(`[AreaPipeline] DB error for ${areaName}:`, error.message);
    else console.log(`[AreaPipeline] ✓ ${areaName} stored ${finalIntel ? 'with AI' : '(no AI)'}`);
  } catch(e) { console.error(`[AreaPipeline] ${areaName}:`, e.message); }

  areaIntelMemCache[cacheKey] = record;
  return record;
}

async function generateAndStoreAreaIntel(areaName, stateName, countryName, countryIso) {
  return runFullAreaIntelPipeline(areaName, stateName, countryName, countryIso);
}

async function getOrGenerateAreaIntel(areaName, stateName, countryName, countryIso) {
  const cacheKey = `${areaName}||${stateName||''}||${countryName}`;
  if (areaIntelMemCache[cacheKey] && !areaIntelNeedsRefresh(areaIntelMemCache[cacheKey]))
    return { data: areaIntelMemCache[cacheKey], fresh: true, source: 'memory' };
  try {
    const q = supabase.from("area_intel").select("*").eq("area_name", areaName).eq("country_name", countryName);
    if (stateName) q.eq("state_name", stateName);
    const { data } = await q.maybeSingle();
    if (data) {
      areaIntelMemCache[cacheKey] = data;
      const hasAiData = !!(data.ai_briefing || data.ai_vibe || data.ai_recommendations?.length);
      if (!areaIntelNeedsRefresh(data) && hasAiData) return { data, fresh: true, source: 'db' };
      generateAndStoreAreaIntel(areaName, stateName, countryName, countryIso).catch(console.error);
      return { data, fresh: false, source: hasAiData ? 'db_stale' : 'db_no_ai' };
    }
  } catch(e) {}
  const data = await generateAndStoreAreaIntel(areaName, stateName, countryName, countryIso);
  return { data, fresh: true, source: 'generated' };
}

// ══════════════════════════════════════════════════════════════════
// GENERATE ALL AREA INTEL
// ══════════════════════════════════════════════════════════════════
const areaGenProgress = {
  running: false, total: 0, done: 0, failed: 0, current: null,
  startedAt: null, completedAt: null, failedAreas: [], log: [],
};

function agLog(msg) {
  const line = `[${new Date().toISOString().slice(11,19)}] ${msg}`;
  console.log('[AreaGen]', msg);
  areaGenProgress.log = [line, ...areaGenProgress.log].slice(0, 100);
}

async function generateAllAreaIntel({ force = false } = {}) {
  if (areaGenProgress.running) { agLog('Already running'); return { skipped: true }; }
  if (!areaIntelTableExists) { agLog('area_intel table missing'); return { error: 'table_missing' }; }

  areaGenProgress.running = true; areaGenProgress.done = 0; areaGenProgress.failed = 0;
  areaGenProgress.failedAreas = []; areaGenProgress.startedAt = new Date().toISOString();
  areaGenProgress.completedAt = null; areaGenProgress.log = [];

  if (!mistralAvailable()) {
    agLog(`⚠️  MISTRAL KEY INVALID — areas saved WITHOUT AI`);
    agLog(`⚠️  Fix: Render → Environment → MISTRAL_API_KEY`);
  }

  try {
    let allAreas = []; let page = 0;
    while (true) {
      const { data: batch, error } = await supabase.from('areas').select('id,name,state_id,country_iso')
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (error || !batch || batch.length === 0) break;
      allAreas = allAreas.concat(batch);
      if (batch.length < 1000) break;
      page++;
    }
    agLog(`Loaded ${allAreas.length} areas`);
    if (!allAreas.length) { areaGenProgress.running = false; return { error: 'no_areas' }; }

    const stateIdSet = [...new Set(allAreas.map(a => a.state_id).filter(Boolean))];
    const stateMap = {};
    for (let i = 0; i < stateIdSet.length; i += 500) {
      const { data: states } = await supabase.from('states').select('id,name,country_iso')
        .in('id', stateIdSet.slice(i, i + 500));
      (states || []).forEach(s => stateMap[s.id] = s);
    }

    let toProcess = allAreas;
    if (!force) {
      const doneKeys = new Set(); let iPage = 0;
      while (true) {
        let q = supabase.from('area_intel').select('area_name,state_name,country_name');
        if (mistralAvailable()) q = q.not('ai_briefing', 'is', null);
        q = q.range(iPage * 1000, (iPage + 1) * 1000 - 1);
        const { data: existing } = await q;
        if (!existing || existing.length === 0) break;
        existing.forEach(e => doneKeys.add(`${e.area_name}||${e.state_name||''}||${e.country_name}`));
        if (existing.length < 1000) break;
        iPage++;
      }
      toProcess = allAreas.filter(a => {
        const state = stateMap[a.state_id];
        const country = COUNTRIES.find(c => c.iso === (a.country_iso || state?.country_iso));
        return !doneKeys.has(`${a.name}||${state?.name||''}||${country?.name||''}`);
      });
    }

    areaGenProgress.total = toProcess.length;
    agLog(`Starting: ${toProcess.length} areas to process`);

    for (let i = 0; i < toProcess.length; i++) {
      if (!areaGenProgress.running) { agLog('Stopped by user'); break; }
      const area = toProcess[i];
      const state = stateMap[area.state_id];
      const country = COUNTRIES.find(c => c.iso === (area.country_iso || state?.country_iso));
      if (!country) { areaGenProgress.done++; continue; }

      areaGenProgress.current = `${area.name}, ${state?.name||country.name} (${i+1}/${toProcess.length})`;
      agLog(`Processing ${area.name} [${country.iso}]`);

      let success = false;
      const maxAttempts = mistralAvailable() ? 3 : 1;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await runFullAreaIntelPipeline(area.name, state?.name||null, country.name, country.iso);
          if (result) {
            agLog(`✅ ${area.name} — stored ${result.ai_briefing ? 'with AI' : 'without AI'}`);
            success = true; break;
          }
          if (!mistralAvailable()) break;
          if (attempt < maxAttempts) await new Promise(r => setTimeout(r, mistralQueue._backoff_ms > 0 ? mistralQueue._backoff_ms + 6000 : 8000));
        } catch(e) {
          if (e.isKeyError) {
            agLog(`⚠️  Key error — switching to non-AI mode`);
            try { const r = await runFullAreaIntelPipeline(area.name, state?.name||null, country.name, country.iso); if (r) success = true; } catch(e2) {}
            break;
          }
          if (attempt >= maxAttempts) agLog(`❌ ${area.name}: ${e.message?.slice(0,60)}`);
          else await new Promise(r => setTimeout(r, 10000));
        }
      }

      if (!success) { areaGenProgress.failed++; areaGenProgress.failedAreas.push(area.name); }
      areaGenProgress.done++;
      if (i < toProcess.length - 1) await new Promise(r => setTimeout(r, mistralAvailable() ? 6000 : 300));
    }

    agLog(`Complete — ${areaGenProgress.done} done, ${areaGenProgress.failedAreas.length} failed`);
    areaGenProgress.completedAt = new Date().toISOString();
  } catch(e) { agLog(`Fatal error: ${e.message}`); }

  areaGenProgress.running = false; areaGenProgress.current = null;
  return { done: areaGenProgress.done, failed: areaGenProgress.failedAreas.length };
}

async function preGenerateMissingAreaIntel() { return generateAllAreaIntel({ force: false }); }


// ══════════════════════════════════════════════════════════════════
// GEO PIPELINE — Save states/areas from API responses
// ══════════════════════════════════════════════════════════════════
let stateIntelTableExists = false;
let areaIntelTableExists  = false;

async function checkTablesExist() {
  try {
    const { error: se } = await supabase.from("state_intel").select("state_id").limit(1);
    stateIntelTableExists = !se;
  } catch(e) { stateIntelTableExists = false; }
  try {
    const { error: ae } = await supabase.from("area_intel").select("id").limit(1);
    areaIntelTableExists = !ae;
  } catch(e) { areaIntelTableExists = false; }
  console.log(`[Tables] state_intel: ${stateIntelTableExists}, area_intel: ${areaIntelTableExists}`);
}

const geoPipelineProgress = {
  running: false, phase: null, total: 0, done: 0, current: null,
  startedAt: null, completedAt: null, log: [],
};

function gpLog(msg) {
  const line = `[${new Date().toISOString().slice(11,19)}] ${msg}`;
  console.log('[GeoPipeline]', msg);
  geoPipelineProgress.log = [line, ...geoPipelineProgress.log].slice(0, 200);
}

async function saveStatesFromResponse(countryIso, countryName, stateNames) {
  if (!stateNames || stateNames.length === 0) return 0;
  const valid = stateNames.filter(n => n && n.length > 1 && n.length < 100);
  if (!valid.length) return 0;

  const rows = valid.map(name => ({
    name, country_iso: countryIso,
    state_code: name.slice(0,3).toUpperCase().replace(/\s/g,''),
  }));

  let saved = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    try {
      const { error } = await supabase.from("states")
        .upsert(batch, { onConflict: "name,country_iso", ignoreDuplicates: true });
      if (!error) saved += batch.length;
      else console.error(`[GeoSave] states batch error:`, error.message);
    } catch(e) { console.error(`[GeoSave] states batch exception:`, e.message); }
  }
  return saved;
}

async function saveAreasFromResponse(stateId, countryIso, areaNames) {
  if (!areaNames || areaNames.length === 0) return 0;
  const valid = areaNames.filter(n => n && isValidCityName(n, null, null));
  if (!valid.length) return 0;

  const rows = valid.map(name => ({
    name, state_id: stateId, country_iso: countryIso, type: "city",
  }));

  let saved = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    try {
      const { error } = await supabase.from("areas")
        .upsert(batch, { onConflict: "name,state_id", ignoreDuplicates: true });
      if (!error) saved += batch.length;
      else console.error(`[GeoSave] areas batch error:`, error.message);
    } catch(e) { console.error(`[GeoSave] areas batch exception:`, e.message); }
  }
  return saved;
}

async function fetchAndSaveStates(country) {
  const { iso, name: countryName } = country;
  gpLog(`[States] Processing ${countryName}`);

  // 1. Try hardcoded geo first
  const hardcodedStates = getHardcodedStates(countryName);
  if (hardcodedStates.length > 0) {
    const saved = await saveStatesFromResponse(iso, countryName, hardcodedStates);
    gpLog(`[States] ${countryName}: ${saved} from hardcoded`);
    return saved;
  }

  // 2. Try REST Countries API
  try {
    const r = await axios.get(`https://restcountries.com/v3.1/alpha/${ISO3_TO_ISO2[iso]||iso}`, { timeout: 8000 });
    const c = r.data?.[0];
    if (c?.subdivisions?.length > 0) {
      const names = c.subdivisions.map(s => s.name).filter(Boolean);
      const saved = await saveStatesFromResponse(iso, countryName, names);
      gpLog(`[States] ${countryName}: ${saved} from REST Countries`);
      return saved;
    }
  } catch(e) {}

  // 3. Fallback: use capital as single "state"
  const capital = COUNTRIES.find(c => c.iso === iso)?.capital || countryName;
  const saved = await saveStatesFromResponse(iso, countryName, [countryName + " Region"]);
  gpLog(`[States] ${countryName}: saved fallback region`);
  return saved;
}

async function fetchAndSaveAreas(state, countryName) {
  const stateAreas = getHardcodedAreas(state.name, countryName);
  if (stateAreas.length > 0) {
    const saved = await saveAreasFromResponse(state.id, state.country_iso, stateAreas);
    return saved;
  }
  // Fallback: save state name as area
  await saveAreasFromResponse(state.id, state.country_iso, [state.name]);
  return 1;
}

async function runGeoPipeline({ countriesOnly = false } = {}) {
  if (geoPipelineProgress.running) { gpLog('Already running'); return { skipped: true }; }
  geoPipelineProgress.running = true;
  geoPipelineProgress.startedAt = new Date().toISOString();
  geoPipelineProgress.completedAt = null;
  geoPipelineProgress.log = [];

  try {
    // Phase 1: Save all countries
    gpLog(`Phase 1: Saving ${COUNTRIES.length} countries`);
    geoPipelineProgress.phase = "countries";
    geoPipelineProgress.total = COUNTRIES.length;
    geoPipelineProgress.done  = 0;

    for (let i = 0; i < COUNTRIES.length; i += 50) {
      const batch = COUNTRIES.slice(i, i + 50).map(c => ({
        iso: c.iso, name: c.name, continent: c.continent,
        iso2: ISO3_TO_ISO2[c.iso] || null,
        lat: geoCoordCache[c.iso]?.lat || null,
        lon: geoCoordCache[c.iso]?.lon || null,
      }));
      const { error } = await supabase.from("countries")
        .upsert(batch, { onConflict: "iso", ignoreDuplicates: false });
      if (error) gpLog(`Countries batch error: ${error.message}`);
      geoPipelineProgress.done += batch.length;
    }
    gpLog(`✓ Countries saved`);

    if (countriesOnly) {
      geoPipelineProgress.running = false;
      geoPipelineProgress.completedAt = new Date().toISOString();
      return { done: true };
    }

    // Phase 2: States
    gpLog(`Phase 2: Saving states for ${COUNTRIES.length} countries`);
    geoPipelineProgress.phase = "states";
    geoPipelineProgress.total = COUNTRIES.length;
    geoPipelineProgress.done  = 0;

    for (const country of COUNTRIES) {
      if (!geoPipelineProgress.running) break;
      geoPipelineProgress.current = country.name;
      await fetchAndSaveStates(country);
      geoPipelineProgress.done++;
      await new Promise(r => setTimeout(r, 100));
    }
    gpLog(`✓ States phase complete`);

    // Phase 3: Areas
    gpLog(`Phase 3: Saving areas`);
    geoPipelineProgress.phase = "areas";

    let allStates = []; let page = 0;
    while (true) {
      const { data: batch } = await supabase.from('states').select('id,name,country_iso')
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (!batch || batch.length === 0) break;
      allStates = allStates.concat(batch);
      if (batch.length < 1000) break;
      page++;
    }
    gpLog(`Loaded ${allStates.length} states for area phase`);
    geoPipelineProgress.total = allStates.length;
    geoPipelineProgress.done  = 0;

    for (const state of allStates) {
      if (!geoPipelineProgress.running) break;
      const country = COUNTRIES.find(c => c.iso === state.country_iso);
      if (!country) { geoPipelineProgress.done++; continue; }
      geoPipelineProgress.current = `${state.name}, ${country.name}`;
      await fetchAndSaveAreas(state, country.name);
      geoPipelineProgress.done++;
      await new Promise(r => setTimeout(r, 50));
    }
    gpLog(`✓ Areas phase complete`);

    geoPipelineProgress.completedAt = new Date().toISOString();
    gpLog(`🎉 Geo pipeline complete`);
  } catch(e) {
    gpLog(`Fatal error: ${e.message}`);
  }

  geoPipelineProgress.running = false;
  geoPipelineProgress.current = null;
  return { done: true };
}

async function resumeGeoPipelineIfIncomplete() {
  try {
    const { count: countryCount } = await supabase.from("countries").select("*", { count:"exact", head:true });
    const { count: stateCount }   = await supabase.from("states").select("*", { count:"exact", head:true });
    const { count: areaCount }    = await supabase.from("areas").select("*", { count:"exact", head:true });

    console.log(`[GeoResume] countries=${countryCount}, states=${stateCount}, areas=${areaCount}`);

    if (!countryCount || countryCount < 100) {
      console.log("[GeoResume] Countries incomplete — running geo pipeline");
      runGeoPipeline().catch(console.error);
    } else if (!stateCount || stateCount < 500) {
      console.log("[GeoResume] States incomplete — running geo pipeline");
      runGeoPipeline().catch(console.error);
    } else if (!areaCount || areaCount < 5000) {
      console.log("[GeoResume] Areas incomplete — running geo pipeline");
      runGeoPipeline().catch(console.error);
    } else {
      console.log("[GeoResume] Geo data looks complete ✓");
    }
  } catch(e) {
    console.error("[GeoResume] Check failed:", e.message);
  }
}


// ══════════════════════════════════════════════════════════════════
// COUNTRY INTEL PIPELINE
// ══════════════════════════════════════════════════════════════════
const countryIntelCache = {};
const COUNTRY_INTEL_REFRESH_MS = 12 * 60 * 60 * 1000;

function countryIntelNeedsRefresh(intel) {
  if (!intel) return true;
  if (!intel.next_update_at) return true;
  return new Date(intel.next_update_at).getTime() < Date.now();
}

async function runCountryPipeline(iso) {
  const country = COUNTRIES.find(c => c.iso === iso);
  if (!country) return null;
  const { name: countryName, continent } = country;
  console.log(`[CountryPipeline] Starting for ${countryName}`);

  const safe = async (fn, fallback) => { try { return await fn(); } catch(e) { return fallback; } };

  const [wiki, wikivoyage, weather, news, googleNews, events, places, airQuality, flights,
         costOfLiving, restCountries, booking, tripadvisor, flightPrices, currencyRates,
         googlePlaces, travelAdvisor, hotelDeals, youtubeVideos, nationalNews, socialTrends, gdacs, photos] =
    await Promise.all([
      safe(() => fetchWikipedia(countryName), null),
      safe(() => fetchWikivoyage(countryName), null),
      safe(() => fetchWeather(countryName), { now:null, forecast:[] }),
      safe(() => fetchNews(countryName, iso), []),
      safe(() => fetchGoogleNews(countryName), []),
      safe(() => fetchTicketmaster(countryName, ISO3_TO_ISO2[iso]||""), []),
      safe(() => fetchFoursquare(countryName, iso), []),
      safe(() => fetchWAQI(countryName, iso), null),
      safe(() => fetchFlights(countryName, iso), null),
      safe(() => fetchCostOfLiving(countryName), null),
      safe(() => fetchRestCountries(ISO3_TO_ISO2[iso]||iso), null),
      safe(() => fetchBooking(countryName, iso), null),
      safe(() => fetchTripadvisor(countryName, iso), null),
      safe(() => fetchFlightPrices(countryName, iso), null),
      safe(() => fetchCurrencyRates(iso), null),
      safe(() => fetchGooglePlaces(countryName, iso), null),
      safe(() => fetchTravelAdvisor(countryName, iso), null),
      safe(() => fetchHotelDeals(countryName, iso), null),
      safe(() => fetchYoutubeVideos(countryName, iso), null),
      safe(() => fetchNationalNews(countryName, iso), []),
      safe(() => fetchSocialTrends(countryName), []),
      safe(() => fetchGDACS(countryName), []),
      safe(() => fetchUnsplash(`${countryName} travel landscape`), []),
    ]);

  const allNews = [...(news||[]), ...(googleNews||[]), ...(nationalNews||[])].slice(0, 15);
  const allEvents = [...(events||[])].slice(0, 10);
  const rawData = { wiki, wikivoyage, weather, news: allNews, events: allEvents, places, airQuality, flights, costOfLiving, restCountries };

  let ai = null;
  if (mistralAvailable()) {
    ai = await safe(() => runMistral(countryName, iso, rawData), null);
  } else {
    console.log(`[CountryPipeline] Skipping Mistral for ${countryName} — key invalid`);
  }

  const coords = geoCoordCache[iso] || { lat: 0, lon: 0 };
  const nextUpdate = new Date(Date.now() + COUNTRY_INTEL_REFRESH_MS).toISOString();

  const intel = {
    iso, country_name: countryName, continent,
    last_updated: new Date().toISOString(), next_update_at: nextUpdate,
    lat: coords.lat, lon: coords.lon,
    // Raw data
    weather_now: weather?.now||null, weather_forecast: weather?.forecast||[],
    news_headlines: allNews, photos: (photos||[]).slice(0,9),
    events: allEvents, top_places: places||[],
    air_quality: airQuality||null, flights: flights||null,
    cost_of_living: costOfLiving||null, rest_countries: restCountries||null,
    booking_data: booking||null, tripadvisor_data: tripadvisor||null,
    flight_prices: flightPrices||null, currency_rates: currencyRates||null,
    google_places: googlePlaces||null, travel_advisor: travelAdvisor||null,
    hotel_deals: hotelDeals||null, youtube_videos: youtubeVideos||null,
    social_trends: socialTrends||null, disasters: gdacs||null,
    wikipedia: wiki||null, wikivoyage: wikivoyage||null,
    // AI fields
    ai_briefing: ai?.briefing||null, ai_vibe: ai?.vibe||null,
    ai_recommendations: ai?.recommendations||[],
    ai_safety_summary: ai?.safety_summary||null,
    ai_best_months: ai?.best_months||[],
    ai_hidden_gem: ai?.hidden_gem||null,
    ai_trending_now: ai?.trending_now||[],
    ai_avoid_if: ai?.avoid_if||null,
    ai_cost_estimate: ai?.cost_estimate||null,
    ai_local_tips: ai?.local_tips||[],
    ai_day_itinerary: ai?.day_itinerary||null,
    ai_sensory_description: ai?.sensory_description||null,
    ai_climate_info: ai?.climate_summary?{summary:ai.climate_summary}:null,
    ai_transport_info: ai?.transport_overview?{overview:ai.transport_overview}:null,
    ai_food_scene: ai?.food_scene?{overview:ai.food_scene}:null,
    ai_history: ai?.history_brief?{overview:ai.history_brief}:null,
    ai_culture: ai?.culture_brief?{overview:ai.culture_brief}:null,
    ai_health_info: ai?.health_overview?{overview:ai.health_overview}:null,
    ai_connectivity: ai?.connectivity_overview?{overview:ai.connectivity_overview}:null,
    ai_shopping: ai?.shopping_overview?{overview:ai.shopping_overview}:null,
    ai_nightlife: ai?.nightlife_overview?{overview:ai.nightlife_overview}:null,
    ai_accommodation: ai?.accommodation_overview?{overview:ai.accommodation_overview}:null,
    ai_safety_detail: ai?.safety_detail||null,
    ai_traveler_scores: ai?.traveler_scores||null,
    mistral_available: mistralAvailable(),
  };

  try {
    const { error } = await supabase.from("country_intel")
      .upsert(intel, { onConflict: "iso" });
    if (error) console.error(`[CountryPipeline] DB error:`, error.message);
    else console.log(`[CountryPipeline] ✓ ${countryName} saved ${ai ? 'with AI' : '(no AI)'}`);
  } catch(e) { console.error(`[CountryPipeline] ${countryName}:`, e.message); }

  countryIntelCache[iso] = intel;
  return intel;
}

// ══════════════════════════════════════════════════════════════════
// MAIN PIPELINE — Run all countries sequentially
// ══════════════════════════════════════════════════════════════════
const pipelineLog = [];
function pLog(msg) {
  const line = `[${new Date().toISOString().slice(11,19)}] ${msg}`;
  console.log('[Pipeline]', msg);
  pipelineLog.unshift(line);
  if (pipelineLog.length > 200) pipelineLog.pop();
}

async function runPipeline({ isos = null, force = false } = {}) {
  if (pipelineStatus.running) { pLog('Already running'); return; }
  pipelineStatus.running = true;
  pipelineStatus.lastRunAt = new Date().toISOString();
  pipelineStatus.lastRunName = isos ? `custom(${isos.length})` : 'all';

  if (!mistralAvailable()) {
    pLog(`⚠️  Mistral key invalid — countries saved WITHOUT AI intel`);
    pLog(`⚠️  Fix: Render → Environment → MISTRAL_API_KEY`);
  }

  const targets = isos
    ? COUNTRIES.filter(c => isos.includes(c.iso))
    : COUNTRIES;

  pLog(`Starting pipeline: ${targets.length} countries`);
  let done = 0, failed = 0;

  // Hot countries first
  const hot = targets.filter(c => HOT_ISOS.has(c.iso));
  const rest = targets.filter(c => !HOT_ISOS.has(c.iso));
  const ordered = [...hot, ...rest];

  for (const country of ordered) {
    if (!pipelineStatus.running) { pLog('Stopped'); break; }
    try {
      if (!force) {
        const cached = countryIntelCache[country.iso];
        if (cached && !countryIntelNeedsRefresh(cached)) { pLog(`⏭ ${country.name} (cached)`); done++; continue; }
        // Check DB
        const { data: existing } = await supabase.from("country_intel")
          .select("iso,next_update_at,ai_briefing").eq("iso", country.iso).maybeSingle();
        if (existing && !countryIntelNeedsRefresh(existing) && existing.ai_briefing) {
          pLog(`⏭ ${country.name} (DB fresh)`); countryIntelCache[country.iso] = existing; done++; continue;
        }
      }
      pLog(`Processing ${country.name}`);
      await runCountryPipeline(country.iso);
      done++;
      pipelineStatus.countriesLastRun = done;
    } catch(e) {
      pLog(`❌ ${country.name}: ${e.message?.slice(0,60)}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, mistralAvailable() ? 8000 : 1000));
  }

  pLog(`Pipeline complete — ${done} done, ${failed} failed`);
  pipelineStatus.running = false;
}

async function runFullPipeline() {
  return runPipeline({ force: false });
}

// ══════════════════════════════════════════════════════════════════
// RESET HELPERS
// ══════════════════════════════════════════════════════════════════
const TABLE_PK = { "state_intel":"state_id", "area_intel":"id", "country_intel":"iso", "countries":"iso", "states":"id", "areas":"id" };

async function deleteAllRows(tableName) {
  const pk = TABLE_PK[tableName] || "id";
  console.log(`[Reset] Deleting all from ${tableName} (pk=${pk})`);
  const { error: e1, count: c1 } = await supabase.from(tableName).delete().not(pk, "is", null);
  if (!e1) { console.log(`[Reset] ✓ ${tableName}: ${c1||0} rows`); return { deleted: c1||0 }; }
  const { error: e2, count: c2 } = await supabase.from(tableName).delete().gt(pk, 0);
  if (!e2) { console.log(`[Reset] ✓ ${tableName}: ${c2||0} rows`); return { deleted: c2||0 }; }
  // Batch fallback
  let total = 0, bPage = 0;
  while (true) {
    const { data: rows } = await supabase.from(tableName).select(pk).range(bPage*500,(bPage+1)*500-1);
    if (!rows || rows.length === 0) break;
    const ids = rows.map(r => r[pk]);
    const { count: dc } = await supabase.from(tableName).delete().in(pk, ids);
    total += dc || ids.length;
    if (rows.length < 500) break;
    bPage++;
  }
  return { deleted: total };
}

function resetGenProgress() {
  stateGenProgress.running = false; stateGenProgress.done = 0; stateGenProgress.failed = 0;
  stateGenProgress.failedStates = []; stateGenProgress.log = [];
  stateGenProgress.current = null; stateGenProgress.completedAt = null;
  areaGenProgress.running = false; areaGenProgress.done = 0; areaGenProgress.failed = 0;
  areaGenProgress.failedAreas = []; areaGenProgress.log = [];
  areaGenProgress.current = null; areaGenProgress.completedAt = null;
}

// ══════════════════════════════════════════════════════════════════
// CRON JOBS
// ══════════════════════════════════════════════════════════════════
cron.schedule("0 6,14,22 * * *", () => {
  console.log("[Cron] Scheduled pipeline run");
  runFullPipeline().catch(console.error);
});

cron.schedule("0 3 * * *", () => {
  console.log("[Cron] Nightly state intel refresh");
  if (!stateGenProgress.running) preGenerateAllStateIntel().catch(console.error);
});

cron.schedule("0 4 * * 0", () => {
  console.log("[Cron] Weekly area intel refresh");
  if (!areaGenProgress.running) preGenerateMissingAreaIntel().catch(console.error);
});

// ══════════════════════════════════════════════════════════════════
// STARTUP PIPELINE
// ══════════════════════════════════════════════════════════════════
async function runStartupPipeline() {
  console.log("[Startup] Initializing GlobeVoyage backend…");
  await checkTablesExist();
  await ensureScripts();

  // Warn about Mistral key
  if (!ENV.MISTRAL_API_KEY) {
    console.error("╔══════════════════════════════════════════════════════════╗");
    console.error("║  WARNING: MISTRAL_API_KEY is not set                     ║");
    console.error("║  AI intel will not be generated until key is configured  ║");
    console.error("║  Set it in Render: Environment → MISTRAL_API_KEY         ║");
    console.error("╚══════════════════════════════════════════════════════════╝");
    MISTRAL_KEY_VALID = false;
  }

  // Resume geo pipeline if incomplete
  setTimeout(() => resumeGeoPipelineIfIncomplete().catch(console.error), 5000);

  // Run hot countries pipeline after short delay
  setTimeout(() => {
    const hotIsos = [...HOT_ISOS];
    console.log(`[Startup] Running hot-country pipeline (${hotIsos.length} countries)`);
    runPipeline({ isos: hotIsos, force: false }).catch(console.error);
  }, 15000);

  console.log("[Startup] ✓ GlobeVoyage backend ready");
}


// ══════════════════════════════════════════════════════════════════
// EXPRESS ROUTES
// ══════════════════════════════════════════════════════════════════

// ── Health / Status ──────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status:"ok", service:"GlobeVoyage API", uptime: process.uptime() }));
app.get("/health", (req, res) => res.json({ status:"ok", uptime:process.uptime(), boot:serverBoot, pings:pingCount, lastPingAt }));
app.get("/api/status", (req, res) => res.json({
  status:"ok", boot:serverBoot, uptime:process.uptime(), pings:pingCount, lastPingAt,
  pipeline: pipelineStatus, source_health: sourceHealth,
  mistral: { available:mistralAvailable(), key_configured:!!ENV.MISTRAL_API_KEY, key_valid:MISTRAL_KEY_VALID, error_count:MISTRAL_401_COUNT, first_error_at:MISTRAL_401_AT },
  tables: { state_intel:stateIntelTableExists, area_intel:areaIntelTableExists },
  state_gen: { running:stateGenProgress.running, total:stateGenProgress.total, done:stateGenProgress.done, failed:stateGenProgress.failed, current:stateGenProgress.current },
  area_gen:  { running:areaGenProgress.running,  total:areaGenProgress.total,  done:areaGenProgress.done,  failed:areaGenProgress.failed,  current:areaGenProgress.current },
}));

// ── Mistral Status (new endpoint) ────────────────────────────────
app.get("/api/mistral/status", (req, res) => {
  res.json({
    key_configured: !!ENV.MISTRAL_API_KEY,
    key_valid: MISTRAL_KEY_VALID,
    available: mistralAvailable(),
    first_401_at: MISTRAL_401_AT,
    total_401s: MISTRAL_401_COUNT,
    message: mistralAvailable()
      ? "Mistral API is operational"
      : MISTRAL_401_AT
        ? `Mistral key INVALID — 401 at ${MISTRAL_401_AT}. Fix: Set MISTRAL_API_KEY in Render environment.`
        : "MISTRAL_API_KEY not set — configure in Render environment variables",
    fix_instructions: mistralAvailable() ? null : {
      step1: "Go to https://console.mistral.ai/api-keys",
      step2: "Create or copy your API key",
      step3: "Render dashboard → your service → Environment",
      step4: "Set MISTRAL_API_KEY = your_key_here",
      step5: "Save Changes — Render redeploys automatically",
    }
  });
});
app.get("/api/pipeline/mistral-health", (req, res) => res.json({
  available:mistralAvailable(), key_configured:!!ENV.MISTRAL_API_KEY,
  key_valid:MISTRAL_KEY_VALID, error_count:MISTRAL_401_COUNT, first_error_at:MISTRAL_401_AT,
}));

// ── Pipeline controls ────────────────────────────────────────────
app.post("/api/pipeline/run", async (req, res) => {
  const { isos, force } = req.body || {};
  res.json({ started: true });
  runPipeline({ isos, force: !!force }).catch(console.error);
});
app.post("/api/pipeline/stop", (req, res) => {
  pipelineStatus.running = false;
  stateGenProgress.running = false;
  areaGenProgress.running  = false;
  res.json({ stopped: true });
});
app.get("/api/pipeline/log", (req, res) => res.json({ log: pipelineLog }));
app.get("/api/pipeline/status", (req, res) => res.json(pipelineStatus));

// ── Geo pipeline ─────────────────────────────────────────────────
app.post("/api/geo/run", async (req, res) => {
  res.json({ started: true });
  runGeoPipeline(req.body || {}).catch(console.error);
});
app.get("/api/geo/status", (req, res) => res.json(geoPipelineProgress));
app.get("/api/geo/log",    (req, res) => res.json({ log: geoPipelineProgress.log }));

// ── State intel controls ─────────────────────────────────────────
app.post("/api/state-intel/generate", async (req, res) => {
  res.json({ started: true, mistral_available: mistralAvailable() });
  generateAllStateIntel({ force: !!req.body?.force }).catch(console.error);
});
app.post("/api/state-intel/stop", (req, res) => {
  stateGenProgress.running = false;
  res.json({ stopped: true });
});
app.get("/api/state-intel/progress", (req, res) => res.json({
  running: stateGenProgress.running, total: stateGenProgress.total,
  done: stateGenProgress.done, failed: stateGenProgress.failed,
  current: stateGenProgress.current, startedAt: stateGenProgress.startedAt,
  completedAt: stateGenProgress.completedAt, failedStates: stateGenProgress.failedStates,
  log: stateGenProgress.log.slice(0, 30),
  mistral_available: mistralAvailable(),
}));
app.get("/api/state-intel/log", (req, res) => res.json({ log: stateGenProgress.log }));

// ── Area intel controls ──────────────────────────────────────────
app.post("/api/area-intel/generate", async (req, res) => {
  res.json({ started: true, mistral_available: mistralAvailable() });
  generateAllAreaIntel({ force: !!req.body?.force }).catch(console.error);
});
app.post("/api/area-intel/stop", (req, res) => {
  areaGenProgress.running = false;
  res.json({ stopped: true });
});
app.get("/api/area-intel/progress", (req, res) => res.json({
  running: areaGenProgress.running, total: areaGenProgress.total,
  done: areaGenProgress.done, failed: areaGenProgress.failed,
  current: areaGenProgress.current, startedAt: areaGenProgress.startedAt,
  completedAt: areaGenProgress.completedAt, failedAreas: areaGenProgress.failedAreas,
  log: areaGenProgress.log.slice(0, 30),
  mistral_available: mistralAvailable(),
}));
app.get("/api/area-intel/log", (req, res) => res.json({ log: areaGenProgress.log }));

// ── Country data ─────────────────────────────────────────────────
app.get("/api/countries", async (req, res) => {
  try {
    const { data, error } = await supabase.from("countries").select("*").order("name");
    if (error) return res.status(500).json({ error: error.message });
    res.json({ countries: data || COUNTRIES });
  } catch(e) { res.json({ countries: COUNTRIES }); }
});

app.get("/api/countries/:iso/intel", async (req, res) => {
  const { iso } = req.params;
  try {
    const cached = countryIntelCache[iso];
    if (cached && !countryIntelNeedsRefresh(cached)) return res.json(cached);
    const { data, error } = await supabase.from("country_intel").select("*").eq("iso", iso).maybeSingle();
    if (data) {
      countryIntelCache[iso] = data;
      if (!countryIntelNeedsRefresh(data)) return res.json(data);
      runCountryPipeline(iso).catch(console.error);
      return res.json(data);
    }
    const fresh = await runCountryPipeline(iso);
    if (fresh) return res.json(fresh);
    res.status(404).json({ error: "Country intel not found", iso });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/countries/:iso/refresh", async (req, res) => {
  const { iso } = req.params;
  res.json({ started: true, iso });
  runCountryPipeline(iso).catch(console.error);
});

// ── States ───────────────────────────────────────────────────────
app.get("/api/countries/:iso/states", async (req, res) => {
  const { iso } = req.params;
  try {
    const { data, error } = await supabase.from("states").select("*").eq("country_iso", iso).order("name");
    if (error) return res.status(500).json({ error: error.message });
    if (data && data.length > 0) return res.json({ states: data });
    // Fallback to hardcoded
    const country = COUNTRIES.find(c => c.iso === iso);
    if (country) {
      const hardcoded = getHardcodedStates(country.name);
      return res.json({ states: hardcoded.map((name, i) => ({ id: `hc_${i}`, name, country_iso: iso })), source: "hardcoded" });
    }
    res.json({ states: [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/states/:stateId", async (req, res) => {
  const { stateId } = req.params;
  try {
    const { data, error } = await supabase.from("states").select("*").eq("id", stateId).maybeSingle();
    if (error || !data) return res.status(404).json({ error: "State not found" });
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/states/:stateId/intel", async (req, res) => {
  const { stateId } = req.params;
  try {
    const cached = stateIntelMemCache[stateId];
    if (cached && !stateIntelNeedsRefresh(cached)) return res.json(cached);
    const { data } = await supabase.from("state_intel").select("*").eq("state_id", stateId).maybeSingle();
    if (data) {
      stateIntelMemCache[stateId] = data;
      if (!stateIntelNeedsRefresh(data) && (data.ai_briefing || !mistralAvailable())) return res.json(data);
      runStatePipeline(stateId).catch(console.error);
      return res.json(data);
    }
    const fresh = await runStatePipeline(stateId);
    if (fresh) return res.json(fresh);
    res.status(404).json({ error: "State intel not found" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/states/:stateId/refresh", async (req, res) => {
  const { stateId } = req.params;
  res.json({ started: true });
  runStatePipeline(stateId).catch(console.error);
});

// ── Areas ────────────────────────────────────────────────────────
app.get("/api/states/:stateId/areas", async (req, res) => {
  const { stateId } = req.params;
  try {
    const { data, error } = await supabase.from("areas").select("*").eq("state_id", stateId).order("name");
    if (error) return res.status(500).json({ error: error.message });
    if (data && data.length > 0) return res.json({ areas: data });
    // Fallback to hardcoded
    const { data: state } = await supabase.from("states").select("name,country_iso").eq("id", stateId).maybeSingle();
    if (state) {
      const country = COUNTRIES.find(c => c.iso === state.country_iso);
      const hardcoded = getHardcodedAreas(state.name, country?.name || "");
      return res.json({ areas: hardcoded.map((name, i) => ({ id:`hc_${i}`, name, state_id:stateId, type:"city" })), source:"hardcoded" });
    }
    res.json({ areas: [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/areas/:areaId/intel", async (req, res) => {
  const { areaId } = req.params;
  try {
    // First try numeric id
    const isNumeric = /^\d+$/.test(areaId);
    if (isNumeric) {
      const { data: area } = await supabase.from("areas").select("name,state_id,country_iso").eq("id", areaId).maybeSingle();
      if (area) {
        const { data: state } = await supabase.from("states").select("name,country_iso").eq("id", area.state_id).maybeSingle();
        const country = COUNTRIES.find(c => c.iso === (area.country_iso || state?.country_iso));
        if (country) {
          const result = await getOrGenerateAreaIntel(area.name, state?.name||null, country.name, country.iso);
          return res.json(result.data);
        }
      }
    }
    res.status(404).json({ error: "Area not found" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/area-intel/search", async (req, res) => {
  const { area, state, country, country_iso } = req.query;
  if (!area || !country) return res.status(400).json({ error: "area and country required" });
  try {
    const result = await getOrGenerateAreaIntel(area, state||null, country, country_iso||null);
    res.json(result.data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Destinations (combined search) ───────────────────────────────
app.get("/api/destinations", async (req, res) => {
  const { q, continent, limit = 20 } = req.query;
  try {
    let query = supabase.from("country_intel").select("iso,country_name,continent,ai_briefing,ai_vibe,photos,weather_now,ai_traveler_scores");
    if (continent) query = query.eq("continent", continent);
    if (q) query = query.ilike("country_name", `%${q}%`);
    query = query.limit(parseInt(limit));
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ destinations: data || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Auth ─────────────────────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });
    res.json({ user: data.user, session: data.session });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/auth/register", async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  try {
    const { data, error } = await supabase.auth.signUp({ email, password, options:{ data:{ name } } });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ user: data.user, session: data.session });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DB Admin / Reset ─────────────────────────────────────────────
app.post("/api/admin/reset-table", async (req, res) => {
  const { table } = req.body || {};
  const allowed = ["state_intel","area_intel","country_intel","countries","states","areas"];
  if (!allowed.includes(table)) return res.status(400).json({ error: "Invalid table" });
  try {
    const result = await deleteAllRows(table);
    resetGenProgress();
    res.json({ success: true, table, ...result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/admin/reset-progress", (req, res) => {
  resetGenProgress();
  res.json({ reset: true });
});

app.get("/api/admin/counts", async (req, res) => {
  try {
    const tables = ["countries","states","areas","country_intel","state_intel","area_intel"];
    const counts = {};
    await Promise.all(tables.map(async t => {
      try {
        const { count } = await supabase.from(t).select("*", { count:"exact", head:true });
        counts[t] = count;
      } catch(e) { counts[t] = null; }
    }));
    res.json({ counts, mistral_available: mistralAvailable() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Booking / Travel services ─────────────────────────────────────
app.get("/api/booking/:iso", async (req, res) => {
  const { iso } = req.params;
  const country = COUNTRIES.find(c => c.iso === iso);
  if (!country) return res.status(404).json({ error: "Country not found" });
  try {
    const data = await fetchBooking(country.name, iso);
    res.json(data || { error: "No booking data" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/flights/:iso", async (req, res) => {
  const { iso } = req.params;
  const country = COUNTRIES.find(c => c.iso === iso);
  if (!country) return res.status(404).json({ error: "Country not found" });
  try {
    const data = await fetchFlightPrices(country.name, iso);
    res.json(data || { airports: [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/currency/:iso", async (req, res) => {
  try {
    const data = await fetchCurrencyRates(req.params.iso);
    res.json(data || { rates: {} });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/weather/:iso", async (req, res) => {
  const { iso } = req.params;
  const country = COUNTRIES.find(c => c.iso === iso);
  if (!country) return res.status(404).json({ error: "Country not found" });
  try {
    const data = await fetchWeather(country.name);
    res.json(data || { now: null, forecast: [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/weather-coords", async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: "lat and lon required" });
  try {
    const data = await fetchWeatherByCoords(parseFloat(lat), parseFloat(lon));
    res.json(data || { now: null, forecast: [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/air-quality/:iso", async (req, res) => {
  const { iso } = req.params;
  const country = COUNTRIES.find(c => c.iso === iso);
  if (!country) return res.status(404).json({ error: "Country not found" });
  try {
    const data = await fetchWAQI(country.name, iso);
    res.json(data || { aqi: null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/news/:iso", async (req, res) => {
  const { iso } = req.params;
  const country = COUNTRIES.find(c => c.iso === iso);
  if (!country) return res.status(404).json({ error: "Country not found" });
  try {
    const [gnews, google, national] = await Promise.all([
      fetchNews(country.name, iso).catch(() => []),
      fetchGoogleNews(country.name).catch(() => []),
      fetchNationalNews(country.name, iso).catch(() => []),
    ]);
    const combined = [...gnews, ...google, ...national].slice(0, 15);
    res.json({ news: combined });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/photos/:iso", async (req, res) => {
  const { iso } = req.params;
  const country = COUNTRIES.find(c => c.iso === iso);
  if (!country) return res.status(404).json({ error: "Country not found" });
  try {
    const data = await fetchUnsplash(`${country.name} travel`);
    res.json({ photos: data || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/events/:iso", async (req, res) => {
  const { iso } = req.params;
  const country = COUNTRIES.find(c => c.iso === iso);
  if (!country) return res.status(404).json({ error: "Country not found" });
  try {
    const [tm, phq] = await Promise.all([
      fetchTicketmaster(country.name, ISO3_TO_ISO2[iso]||"").catch(()=>[]),
      fetchPredictHQ(country.name).catch(()=>[]),
    ]);
    res.json({ events: [...(tm||[]), ...(phq||[])].slice(0,15) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── Globe HTML endpoint ───────────────────────────────────────────
app.get("/globe", (req, res) => {
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:100%;height:100%;background:#080c14;overflow:hidden;touch-action:none;}
canvas{display:block;}
#lbl{position:fixed;bottom:20px;left:0;right:0;text-align:center;font-family:-apple-system,sans-serif;font-size:16px;font-weight:700;letter-spacing:3px;color:#c9a96e;text-shadow:0 0 20px rgba(201,169,110,0.8);opacity:0;transition:opacity 0.2s;pointer-events:none;}
#hint{position:fixed;top:14px;left:0;right:0;text-align:center;font-family:-apple-system,sans-serif;font-size:11px;color:rgba(255,255,255,0.3);letter-spacing:1.5px;pointer-events:none;}
</style>
</head>
<body>
<div id="hint">SPIN · TAP A COUNTRY</div>
<div id="lbl"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
const W=window.innerWidth,H=window.innerHeight;
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(W,H);
renderer.setClearColor(0x080c14,1);
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(42,W/H,0.1,1000);
camera.position.z=2.6;

// Lights
scene.add(new THREE.AmbientLight(0x223355,3.5));
const sun=new THREE.DirectionalLight(0xffeedd,2.8);
sun.position.set(5,3,5);scene.add(sun);
const rim=new THREE.DirectionalLight(0x1a4a8a,0.9);
rim.position.set(-6,-2,-4);scene.add(rim);

// Stars
(function(){
  const g=new THREE.BufferGeometry(),p=[];
  for(let i=0;i<2800;i++){
    const r=55+Math.random()*35,t=Math.random()*Math.PI*2,a=Math.acos(2*Math.random()-1);
    p.push(r*Math.sin(a)*Math.cos(t),r*Math.sin(a)*Math.sin(t),r*Math.cos(a));
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:0.12,transparent:true,opacity:0.6})));
})();

// Earth canvas texture
function makeEarth(){
  const S=1024,c=document.createElement('canvas');
  c.width=c.height=S;const ctx=c.getContext('2d');
  const og=ctx.createRadialGradient(S*.35,S*.35,S*.05,S*.5,S*.5,S*.72);
  og.addColorStop(0,'#1a4a7a');og.addColorStop(0.5,'#0d2d50');og.addColorStop(1,'#071828');
  ctx.fillStyle=og;ctx.fillRect(0,0,S,S);
  function ll(lon,lat){return[(lon+180)/360*S,(90-lat)/180*S];}
  function poly(pts,fill,stroke){
    ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath();ctx.fillStyle=fill;ctx.fill();
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.2;ctx.stroke();}
  }
  const L='#1a4a2a',LB='#2a6a3a',LD='#0d3018',B='rgba(80,180,100,0.3)';
  // North America
  poly([ll(-168,72),ll(-140,70),ll(-120,72),ll(-100,74),ll(-85,72),ll(-65,62),ll(-55,50),ll(-52,47),ll(-55,44),ll(-66,44),ll(-70,42),ll(-75,35),ll(-80,25),ll(-85,22),ll(-90,20),ll(-85,16),ll(-78,16),ll(-68,24),ll(-72,30),ll(-80,32),ll(-95,29),ll(-110,24),ll(-118,28),ll(-120,35),ll(-124,49),ll(-130,54),ll(-138,59),ll(-155,60),ll(-166,60),ll(-168,66)],L,B);
  // Greenland
  poly([ll(-44,83),ll(-20,83),ll(-18,76),ll(-22,70),ll(-38,65),ll(-50,66),ll(-56,70),ll(-52,76),ll(-44,80)],LD,B);
  // South America
  poly([ll(-80,12),ll(-62,12),ll(-52,4),ll(-50,0),ll(-48,-4),ll(-35,-8),ll(-35,-14),ll(-38,-22),ll(-40,-28),ll(-50,-32),ll(-58,-38),ll(-66,-52),ll(-70,-52),ll(-76,-50),ll(-78,-42),ll(-76,-34),ll(-74,-28),ll(-70,-20),ll(-76,-14),ll(-80,-4),ll(-80,4),ll(-78,8),ll(-80,12)],L,B);
  // Europe
  poly([ll(-10,36),ll(8,38),ll(16,38),ll(28,36),ll(36,36),ll(36,42),ll(30,46),ll(28,50),ll(24,54),ll(12,56),ll(8,58),ll(4,60),ll(-4,58),ll(-8,52),ll(-6,48),ll(-2,44),ll(-10,40),ll(-10,36)],LB,B);
  // Scandinavia
  poly([ll(4,58),ll(8,57),ll(14,56),ll(18,57),ll(20,60),ll(28,70),ll(24,71),ll(18,70),ll(14,65),ll(8,62),ll(4,58)],LB,B);
  // Africa
  poly([ll(-18,16),ll(-14,10),ll(-8,4),ll(0,4),ll(10,8),ll(12,2),ll(10,-4),ll(14,-22),ll(18,-34),ll(28,-34),ll(36,-22),ll(42,-12),ll(44,-2),ll(42,4),ll(44,12),ll(42,18),ll(38,22),ll(30,30),ll(32,32),ll(24,32),ll(20,28),ll(14,24),ll(8,20),ll(0,16),ll(-8,14),ll(-18,16)],L,B);
  // Asia (main)
  poly([ll(28,36),ll(42,38),ll(56,24),ll(58,22),ll(66,22),ll(72,22),ll(80,12),ll(76,8),ll(80,20),ll(78,28),ll(72,34),ll(62,38),ll(56,42),ll(50,44),ll(44,50),ll(40,54),ll(36,56),ll(32,62),ll(48,70),ll(68,72),ll(100,72),ll(140,72),ll(160,68),ll(164,54),ll(152,48),ll(142,42),ll(138,38),ll(136,34),ll(128,30),ll(122,24),ll(118,22),ll(108,20),ll(100,-4),ll(104,-4),ll(120,-2),ll(128,4),ll(130,-4),ll(118,-8),ll(96,4),ll(80,14),ll(76,10),ll(66,22),ll(56,24),ll(48,30),ll(44,34),ll(36,36)],L,B);
  // Australia
  poly([ll(114,-22),ll(118,-20),ll(124,-18),ll(130,-12),ll(136,-12),ll(142,-10),ll(148,-18),ll(152,-24),ll(152,-30),ll(150,-36),ll(146,-38),ll(140,-36),ll(130,-32),ll(122,-32),ll(116,-34),ll(114,-32),ll(112,-26),ll(114,-22)],LB,B);
  // Japan
  poly([ll(130,34),ll(134,36),ll(136,38),ll(140,42),ll(142,44),ll(142,42),ll(140,38),ll(138,34),ll(136,32),ll(132,32),ll(130,32),ll(130,34)],LB,B);
  // New Zealand
  poly([ll(172,-36),ll(174,-38),ll(176,-40),ll(176,-44),ll(172,-46),ll(168,-44),ll(168,-40),ll(170,-36),ll(172,-36)],LB,B);
  // UK
  poly([ll(-6,50),ll(-2,52),ll(2,52),ll(2,54),ll(0,56),ll(-4,58),ll(-6,56),ll(-8,52),ll(-6,50)],LB,B);
  // Iceland
  poly([ll(-24,64),ll(-14,65),ll(-12,63),ll(-18,63),ll(-24,64)],LD,B);
  // Indonesia
  poly([ll(96,6),ll(104,1),ll(108,-2),ll(116,-8),ll(120,-8),ll(124,-6),ll(128,-2),ll(128,2),ll(120,4),ll(108,0),ll(96,6)],LB,B);
  // Grid
  ctx.strokeStyle='rgba(100,160,255,0.07)';ctx.lineWidth=0.7;
  for(let la=-80;la<=80;la+=20){const y=(90-la)/180*S;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(S,y);ctx.stroke();}
  for(let lo=-180;lo<=180;lo+=30){const x=(lo+180)/360*S;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,S);ctx.stroke();}
  return c;
}

const globe=new THREE.Mesh(
  new THREE.SphereGeometry(1,64,64),
  new THREE.MeshPhongMaterial({map:new THREE.CanvasTexture(makeEarth()),specular:new THREE.Color(0x1a3a6a),shininess:18})
);
scene.add(globe);

// Atmosphere shader
const atm=new THREE.Mesh(new THREE.SphereGeometry(1.06,64,64),new THREE.ShaderMaterial({
  uniforms:{c:{value:new THREE.Color(0x1a6aff)},p:{value:4.5}},
  vertexShader:'varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'uniform vec3 c;uniform float p;varying vec3 vN;void main(){float i=pow(0.55-dot(vN,vec3(0.0,0.0,1.0)),p);gl_FragColor=vec4(c,i*0.65);}',
  side:THREE.BackSide,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,
}));
scene.add(atm);

// Country dots
const COUNTRIES=[
  {n:"Afghanistan",iso:"AFG",lat:33.9,lon:67.7},{n:"Albania",iso:"ALB",lat:41.2,lon:20.2},
  {n:"Algeria",iso:"DZA",lat:28.0,lon:1.7},{n:"Angola",iso:"AGO",lat:-11.2,lon:17.9},
  {n:"Argentina",iso:"ARG",lat:-38.4,lon:-63.6},{n:"Armenia",iso:"ARM",lat:40.1,lon:45.0},
  {n:"Australia",iso:"AUS",lat:-25.3,lon:133.8},{n:"Austria",iso:"AUT",lat:47.5,lon:14.6},
  {n:"Azerbaijan",iso:"AZE",lat:40.1,lon:47.6},{n:"Bangladesh",iso:"BGD",lat:23.7,lon:90.4},
  {n:"Belarus",iso:"BLR",lat:53.7,lon:28.0},{n:"Belgium",iso:"BEL",lat:50.5,lon:4.5},
  {n:"Bolivia",iso:"BOL",lat:-16.3,lon:-63.6},{n:"Brazil",iso:"BRA",lat:-14.2,lon:-51.9},
  {n:"Bulgaria",iso:"BGR",lat:42.7,lon:25.5},{n:"Cambodia",iso:"KHM",lat:12.6,lon:104.9},
  {n:"Cameroon",iso:"CMR",lat:3.8,lon:11.5},{n:"Canada",iso:"CAN",lat:56.1,lon:-106.3},
  {n:"Chile",iso:"CHL",lat:-35.7,lon:-71.5},{n:"China",iso:"CHN",lat:35.9,lon:104.2},
  {n:"Colombia",iso:"COL",lat:4.6,lon:-74.3},{n:"Costa Rica",iso:"CRI",lat:9.7,lon:-83.8},
  {n:"Croatia",iso:"HRV",lat:45.1,lon:15.2},{n:"Cuba",iso:"CUB",lat:21.5,lon:-77.8},
  {n:"Czech Republic",iso:"CZE",lat:49.8,lon:15.5},{n:"DR Congo",iso:"COD",lat:-4.0,lon:21.8},
  {n:"Denmark",iso:"DNK",lat:56.3,lon:9.5},{n:"Dominican Republic",iso:"DOM",lat:18.7,lon:-70.2},
  {n:"Ecuador",iso:"ECU",lat:-1.8,lon:-78.2},{n:"Egypt",iso:"EGY",lat:26.8,lon:30.8},
  {n:"Ethiopia",iso:"ETH",lat:9.1,lon:40.5},{n:"Finland",iso:"FIN",lat:64.0,lon:25.7},
  {n:"France",iso:"FRA",lat:46.2,lon:2.2},{n:"Germany",iso:"DEU",lat:51.2,lon:10.5},
  {n:"Ghana",iso:"GHA",lat:7.9,lon:-1.0},{n:"Greece",iso:"GRC",lat:39.1,lon:21.8},
  {n:"Guatemala",iso:"GTM",lat:15.8,lon:-90.2},{n:"Hungary",iso:"HUN",lat:47.2,lon:19.5},
  {n:"Iceland",iso:"ISL",lat:65.0,lon:-18.1},{n:"India",iso:"IND",lat:20.6,lon:79.1},
  {n:"Indonesia",iso:"IDN",lat:-0.8,lon:113.9},{n:"Iran",iso:"IRN",lat:32.4,lon:53.7},
  {n:"Iraq",iso:"IRQ",lat:33.2,lon:43.7},{n:"Ireland",iso:"IRL",lat:53.1,lon:-8.2},
  {n:"Israel",iso:"ISR",lat:31.0,lon:34.9},{n:"Italy",iso:"ITA",lat:41.9,lon:12.6},
  {n:"Ivory Coast",iso:"CIV",lat:7.5,lon:-5.6},{n:"Jamaica",iso:"JAM",lat:18.1,lon:-77.3},
  {n:"Japan",iso:"JPN",lat:36.2,lon:138.3},{n:"Jordan",iso:"JOR",lat:30.6,lon:36.2},
  {n:"Kazakhstan",iso:"KAZ",lat:48.0,lon:66.9},{n:"Kenya",iso:"KEN",lat:0.0,lon:37.9},
  {n:"South Korea",iso:"KOR",lat:35.9,lon:127.8},{n:"Kuwait",iso:"KWT",lat:29.3,lon:47.5},
  {n:"Laos",iso:"LAO",lat:19.9,lon:102.5},{n:"Lebanon",iso:"LBN",lat:33.9,lon:35.9},
  {n:"Libya",iso:"LBY",lat:26.3,lon:17.2},{n:"Madagascar",iso:"MDG",lat:-18.8,lon:46.9},
  {n:"Malaysia",iso:"MYS",lat:4.2,lon:108.0},{n:"Mexico",iso:"MEX",lat:23.6,lon:-102.6},
  {n:"Mongolia",iso:"MNG",lat:46.9,lon:103.8},{n:"Morocco",iso:"MAR",lat:31.8,lon:-7.1},
  {n:"Mozambique",iso:"MOZ",lat:-18.7,lon:35.5},{n:"Myanmar",iso:"MMR",lat:21.9,lon:95.9},
  {n:"Nepal",iso:"NPL",lat:28.4,lon:84.1},{n:"Netherlands",iso:"NLD",lat:52.1,lon:5.3},
  {n:"New Zealand",iso:"NZL",lat:-40.9,lon:174.9},{n:"Nigeria",iso:"NGA",lat:9.1,lon:8.7},
  {n:"Norway",iso:"NOR",lat:60.5,lon:8.5},{n:"Oman",iso:"OMN",lat:21.5,lon:55.9},
  {n:"Pakistan",iso:"PAK",lat:30.4,lon:69.3},{n:"Peru",iso:"PER",lat:-9.2,lon:-75.0},
  {n:"Philippines",iso:"PHL",lat:12.9,lon:121.8},{n:"Poland",iso:"POL",lat:51.9,lon:19.1},
  {n:"Portugal",iso:"PRT",lat:39.4,lon:-8.2},{n:"Qatar",iso:"QAT",lat:25.4,lon:51.2},
  {n:"Romania",iso:"ROU",lat:45.9,lon:24.9},{n:"Russia",iso:"RUS",lat:61.5,lon:105.3},
  {n:"Rwanda",iso:"RWA",lat:-1.9,lon:29.9},{n:"Saudi Arabia",iso:"SAU",lat:24.0,lon:45.1},
  {n:"Senegal",iso:"SEN",lat:14.5,lon:-14.5},{n:"Serbia",iso:"SRB",lat:44.0,lon:21.0},
  {n:"Singapore",iso:"SGP",lat:1.3,lon:103.8},{n:"Somalia",iso:"SOM",lat:5.2,lon:46.2},
  {n:"South Africa",iso:"ZAF",lat:-30.6,lon:22.9},{n:"Spain",iso:"ESP",lat:40.5,lon:-3.7},
  {n:"Sri Lanka",iso:"LKA",lat:7.9,lon:80.8},{n:"Sudan",iso:"SDN",lat:12.9,lon:30.2},
  {n:"Sweden",iso:"SWE",lat:62.2,lon:17.6},{n:"Switzerland",iso:"CHE",lat:46.8,lon:8.2},
  {n:"Syria",iso:"SYR",lat:35.0,lon:38.0},{n:"Taiwan",iso:"TWN",lat:23.7,lon:121.0},
  {n:"Tanzania",iso:"TZA",lat:-6.4,lon:34.9},{n:"Thailand",iso:"THA",lat:15.9,lon:100.9},
  {n:"Tunisia",iso:"TUN",lat:34.0,lon:9.0},{n:"Turkey",iso:"TUR",lat:38.9,lon:35.2},
  {n:"Uganda",iso:"UGA",lat:1.4,lon:32.3},{n:"Ukraine",iso:"UKR",lat:48.4,lon:31.2},
  {n:"United Arab Emirates",iso:"ARE",lat:23.4,lon:53.8},
  {n:"United Kingdom",iso:"GBR",lat:55.4,lon:-3.4},
  {n:"United States",iso:"USA",lat:37.1,lon:-95.7},{n:"Uruguay",iso:"URY",lat:-32.5,lon:-55.8},
  {n:"Uzbekistan",iso:"UZB",lat:41.4,lon:64.6},{n:"Venezuela",iso:"VEN",lat:6.4,lon:-66.6},
  {n:"Vietnam",iso:"VNM",lat:14.1,lon:108.3},{n:"Yemen",iso:"YEM",lat:15.6,lon:48.5},
  {n:"Zambia",iso:"ZMB",lat:-13.1,lon:27.9},{n:"Zimbabwe",iso:"ZWE",lat:-19.0,lon:29.2},
];
function ll2v(lat,lon,r){
  const phi=(90-lat)*Math.PI/180,th=(lon+180)*Math.PI/180;
  return new THREE.Vector3(-Math.sin(phi)*Math.cos(th),Math.cos(phi),Math.sin(phi)*Math.sin(th)).multiplyScalar(r);
}
const dotG=new THREE.SphereGeometry(0.013,7,7);
const dots=[];
COUNTRIES.forEach(c=>{
  const m=new THREE.MeshBasicMaterial({color:0xc9a96e,transparent:true,opacity:0.9});
  const d=new THREE.Mesh(dotG,m);
  d.position.copy(ll2v(c.lat,c.lon,1.015));
  d.userData=c; globe.add(d); dots.push(d);
});

// Pan + momentum
let drag=false,px=0,py=0,pt=0,vx=0,vy=0;
const MV=0.055;
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function onS(x,y){drag=true;px=x;py=y;pt=Date.now();vx=0;vy=0;}
function onM(x,y){
  if(!drag)return;
  const now=Date.now(),dt=Math.max(1,now-pt),dx=x-px,dy=y-py;
  vx=clamp(dx/dt*16,-MV,MV); vy=clamp(dy/dt*16,-MV,MV);
  globe.rotation.y+=dx*0.006;
  globe.rotation.x=clamp(globe.rotation.x+dy*0.004,-1.3,1.3);
  px=x;py=y;pt=now;
}
function onE(tap,cx,cy){drag=false;if(tap)pick(cx,cy);}

let ms={x:0,y:0};
renderer.domElement.addEventListener('mousedown',e=>{ms={x:e.clientX,y:e.clientY};onS(e.clientX,e.clientY);});
renderer.domElement.addEventListener('mousemove',e=>onM(e.clientX,e.clientY));
renderer.domElement.addEventListener('mouseup',e=>{onE(Math.hypot(e.clientX-ms.x,e.clientY-ms.y)<8,e.clientX,e.clientY);});

let ts={x:0,y:0,t:0};
renderer.domElement.addEventListener('touchstart',e=>{e.preventDefault();ts={x:e.touches[0].clientX,y:e.touches[0].clientY,t:Date.now()};onS(ts.x,ts.y);},{passive:false});
renderer.domElement.addEventListener('touchmove',e=>{e.preventDefault();onM(e.touches[0].clientX,e.touches[0].clientY);},{passive:false});
renderer.domElement.addEventListener('touchend',e=>{
  e.preventDefault();
  const cx=e.changedTouches[0].clientX,cy=e.changedTouches[0].clientY;
  onE(Math.hypot(cx-ts.x,cy-ts.y)<10&&Date.now()-ts.t<300,cx,cy);
},{passive:false});

// Raycaster pick
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();
function pick(cx,cy){
  const rect=renderer.domElement.getBoundingClientRect();
  mouse.set(((cx-rect.left)/rect.width)*2-1,-((cy-rect.top)/rect.height)*2+1);
  ray.setFromCamera(mouse,camera);
  const dh=ray.intersectObjects(dots);
  if(dh.length){sel(dh[0].object.userData);return;}
  const gh=ray.intersectObject(globe);
  if(gh.length){
    const pt=gh[0].point.clone();globe.worldToLocal(pt);const pn=pt.normalize();
    let best=null,bd=9;
    dots.forEach(d=>{const dn=d.position.clone().normalize();const dist=pn.distanceTo(dn);if(dist<bd){bd=dist;best=d;}});
    if(best&&bd<0.35)sel(best.userData);
  }
}
function sel(c){
  const lbl=document.getElementById('lbl');
  lbl.textContent=c.n.toUpperCase();lbl.style.opacity='1';
  setTimeout(()=>lbl.style.opacity='0',2200);
  const dot=dots.find(d=>d.userData.iso===c.iso);
  if(dot){let t=0;const iv=setInterval(()=>{t+=0.18;dot.material.color.setHex(t%1<0.5?0xffffff:0xc9a96e);dot.scale.setScalar(1+Math.sin(t)*0.5);if(t>Math.PI*2){clearInterval(iv);dot.material.color.setHex(0xc9a96e);dot.scale.setScalar(1);}},25);}
  if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'DESTINATIONS',country:c.iso,name:c.n}));
}

// Animate
function animate(){
  requestAnimationFrame(animate);
  if(!drag){vx*=0.92;vy*=0.92;globe.rotation.y+=vx*0.012+0.0012;globe.rotation.x=clamp(globe.rotation.x+vy*0.008,-1.3,1.3);}
  renderer.render(scene,camera);
}
animate();
window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);});
</script>
</body>
</html>`;
  res.setHeader("Content-Type","text/html");
  res.send(html);
});

// ── Source health ─────────────────────────────────────────────────
app.get("/api/source-health", (req, res) => res.json(sourceHealth));

// ── Admin pages (static HTML files if present) ───────────────────
app.use(express.static(path.join(__dirname, "public")));

// 404 fallback
app.use((req, res) => res.status(404).json({ error: "Not found", path: req.path }));

// ══════════════════════════════════════════════════════════════════
// SERVER START
// ══════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  🌍 GlobeVoyage API — listening on port ${PORT}           
║  Mistral key: ${ENV.MISTRAL_API_KEY ? "✓ configured" : "✗ MISSING — set MISTRAL_API_KEY"}
╚══════════════════════════════════════════════════════════╝`);
  await runStartupPipeline();
});

module.exports = app;
